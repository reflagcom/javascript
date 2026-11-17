import { afterEach, describe, expect, test, vi } from "vitest";

import { FlagCache, parseAPIFlagsResponse } from "../src/flag/flagCache";
import type { StorageAdapter } from "../src/storage";
import { flagsResult, selectedFlag } from "./mocks/handlers";

function setup() {
  const data: Record<string, string> = {};
  const storage: StorageAdapter = {
    getItem: vi.fn(async (key) => data[key] ?? null),
    setItem: vi.fn(async (key, value) => {
      data[key] = value;
    }),
  };
  const cache = new FlagCache({
    storage,
    staleTimeMs: 1000,
    expireTimeMs: 2000,
  });
  return { cache, storage, data };
}
afterEach(() => vi.useRealTimers());

describe("v2 evaluated cache", () => {
  const rule = { ruleId: "rule", matched: true };
  const error = { code: "MISSING_CONTEXT_FIELD", message: "missing" };

  test("accepts diagnostic optional fields and preserves their values", () => {
    const flags = {
      flagA: {
        ...selectedFlag(true),
        ruleResults: [
          rule,
          { ...rule, allocationIndex: 0, destination: { type: "nextRule" } },
          {
            ...rule,
            allocationIndex: 1,
            destination: { type: "variant", variantKey: "" },
          },
        ],
        errors: [
          error,
          { ...error, source: { type: "flag", key: "parent" } },
          {
            ...error,
            field: "user.id",
            operator: "IS",
            source: { type: "segment", key: "enterprise" },
          },
        ],
      },
    };
    expect(parseAPIFlagsResponse(flags)).toEqual(flags);
  });

  test.each([
    null,
    true,
    {},
    { ...rule, ruleId: 1 },
    { ...rule, matched: undefined },
    { ...rule, matched: 1 },
    ...[-1, 0.5, Infinity, NaN, "0", null].map((allocationIndex) => ({
      ...rule,
      allocationIndex,
    })),
    ...[
      null,
      [],
      { type: "unknown" },
      { type: "variant" },
      { type: "variant", variantKey: 1 },
    ].map((destination) => ({ ...rule, destination })),
  ])("rejects malformed rule diagnostics atomically: %j", (invalidRule) => {
    expect(
      parseAPIFlagsResponse({
        good: selectedFlag(true),
        bad: { ...selectedFlag(true), ruleResults: [invalidRule] },
      }),
    ).toBeUndefined();
  });

  test.each([
    null,
    true,
    {},
    { code: "MISSING_CONTEXT_FIELD" },
    { ...error, code: 1 },
    { ...error, message: null },
    { ...error, field: null },
    { ...error, operator: 1 },
    ...[
      null,
      [],
      { type: "unknown", key: "s" },
      { type: "flag" },
      { type: "segment", key: 1 },
    ].map((source) => ({ ...error, source })),
  ])("rejects malformed error diagnostics atomically: %j", (invalidError) => {
    expect(
      parseAPIFlagsResponse({
        good: selectedFlag(true),
        bad: { ...selectedFlag(true), errors: [invalidError] },
      }),
    ).toBeUndefined();
  });

  test("owns stored values and preserves snapshot version zero", async () => {
    const { cache } = setup();
    const optIn = {
      name: "Try",
      description: null,
      userOptedIn: true,
      companyOptedIn: false,
      isOptedIn: true,
    };
    const flags = {
      settings: selectedFlag({ nested: [1] }, "quality"),
      release: { ...selectedFlag(true), optInEnabled: true, optIn },
    };
    await cache.set("pk-and-context", { flags, flagStateVersion: 0 });
    (flags.settings.value as { nested: number[] }).nested.push(2);
    const first = await cache.get("pk-and-context");
    expect(first).toMatchObject({
      flags: { settings: { value: { nested: [1] } } },
      flagStateVersion: 0,
      stale: false,
    });
    expect(first!.flags.release.optIn).toEqual(optIn);
    first!.flags.release.optIn!.name = "Changed";
    expect((await cache.get("pk-and-context"))!.flags.release.optIn!.name).toBe(
      "Try",
    );
    first!.flags.settings.value = false;
    expect((await cache.get("pk-and-context"))!.flags.settings.value).toEqual({
      nested: [1],
    });
  });

  test("never loads v1 storage or malformed v2 entries", async () => {
    const { cache, data, storage } = setup();
    data.__reflag_fetched_flags = JSON.stringify({
      key: {
        flags: { flag: { isEnabled: true } },
        expireAt: Date.now() + 10000,
      },
    });
    expect(await cache.get("key")).toBeUndefined();
    expect(storage.getItem).toHaveBeenCalledWith("__reflag_fetched_flags_v2");
    data.__reflag_fetched_flags_v2 = JSON.stringify({
      key: {
        protocolVersion: 2,
        flags: { good: selectedFlag(true), bad: {} },
        expireAt: Date.now() + 10000,
        staleAt: Date.now() + 10000,
      },
    });
    expect(await cache.get("key")).toBeUndefined();
  });

  test("becomes stale and then expires, pruning expired entries on writes", async () => {
    vi.useFakeTimers();
    const { cache, data } = setup();
    await cache.set("first", { flags: flagsResult });
    vi.advanceTimersByTime(1001);
    expect((await cache.get("first"))?.stale).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(await cache.get("first")).toBeUndefined();
    await cache.set("second", { flags: flagsResult });
    expect(Object.keys(JSON.parse(data.__reflag_fetched_flags_v2))).toEqual([
      "second",
    ]);
  });

  test("serializes cache writes and refuses version regression for the same context", async () => {
    const { cache } = setup();
    await Promise.all([
      cache.set("a", { flags: flagsResult, flagStateVersion: 3 }),
      cache.set("b", { flags: flagsResult, flagStateVersion: 1 }),
      cache.set("a", { flags: {}, flagStateVersion: 2 }),
    ]);
    expect((await cache.get("a"))?.flagStateVersion).toBe(3);
    expect((await cache.get("b"))?.flagStateVersion).toBe(1);
  });

  test("accepts Node's unselected bootstrap entries but rejects partial or unresolved authored identity", () => {
    expect(
      parseAPIFlagsResponse(
        { fallback: { resolved: false, ruleResults: [], errors: [] } },
        true,
      ),
    ).toEqual({ fallback: { resolved: false, ruleResults: [], errors: [] } });
    expect(
      parseAPIFlagsResponse(
        { broken: { ...selectedFlag(true), variantKey: undefined } },
        true,
      ),
    ).toBeUndefined();
    expect(
      parseAPIFlagsResponse(
        { broken: { ...selectedFlag(true), resolved: false } },
        true,
      ),
    ).toBeUndefined();
  });
});
