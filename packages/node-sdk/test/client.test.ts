import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fallbackProviders,
  ReflagClient,
  type ClientOptions,
  type FlagsFallbackSnapshot,
  type HttpClient,
} from "../src";
import {
  FLAG_EVENT_RATE_LIMITER_WINDOW_SIZE_MS,
  SDK_VERSION,
  SDK_VERSION_HEADER_NAME,
} from "../src/config";
import { definition, graph, snapshot } from "./fixtures";

vi.mock("../src/flusher", () => ({ subscribe: vi.fn() }));
const clients: ReflagClient[] = [];
const company = { id: "acme", plan: "enterprise" };
function harness(response: unknown = graph(), options: ClientOptions = {}) {
  const state = { response };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const httpClient = {
    get: vi.fn(
      async (
        _url: string,
        _headers: Record<string, string>,
        _timeoutMs: number,
      ) => ({
        status: 200,
        ok: true,
        body: { success: true, ...(state.response as object) },
      }),
    ),
    post: vi.fn(
      async (
        _url: string,
        _headers: Record<string, string>,
        _body: unknown[],
      ) => ({ status: 200, ok: true, body: { success: true } }),
    ),
  };
  const client = new ReflagClient({
    secretKey: "validSecretKeyWithMoreThan22Chars",
    apiBaseUrl: "https://api.example.com/",
    offline: false,
    flagsFetchRetries: 0,
    flagsSyncMode: "in-request",
    logger,
    httpClient: httpClient as unknown as HttpClient,
    batchOptions: { intervalMs: 1e9, flushOnExit: false },
    ...options,
  });
  clients.push(client);
  const events = () =>
    httpClient.post.mock.calls.flatMap(
      (call) =>
        (
          call as unknown as [
            string,
            unknown,
            { type: string; [key: string]: unknown }[],
          ]
        )[2],
    );
  return {
    client,
    state,
    logger,
    httpClient,
    events,
    checks: () =>
      events().filter((event) => event.type === "feature-flag-event"),
  };
}
async function nextRefresh(client: ReflagClient, version?: number) {
  await vi.advanceTimersByTimeAsync(1001);
  await client.refreshFlags(version);
}
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("direct flag values", () => {
  it.each([
    false,
    true,
    null,
    0,
    42,
    "",
    "quality",
    [false, "a"],
    { nested: { enabled: false } },
  ])("returns %j itself, without a wrapper", async (value) => {
    const h = harness(snapshot([definition("flag", value)]));
    await h.client.initialize();
    expect(h.client.getFlag({ company }, "flag", null)).toEqual(value);
    await h.client.flush();
    expect(h.checks()).toEqual([
      expect.objectContaining({
        action: "check",
        key: "flag",
        evalResult: "default",
        sourceVersionId: "version:flag",
        flagStateVersion: 1,
        evalContext: { company },
      }),
    ]);
    expect(h.checks()[0]).not.toHaveProperty("value");
  });
  it("fetches one complete /flags collection with SDK authentication", async () => {
    const h = harness();
    await h.client.initialize();
    await h.client.initialize();
    expect(h.httpClient.get).toHaveBeenCalledTimes(1);
    expect(h.httpClient.get).toHaveBeenCalledWith(
      "https://api.example.com/flags",
      expect.objectContaining({
        Authorization: "Bearer validSecretKeyWithMoreThan22Chars",
        [SDK_VERSION_HEADER_NAME]: SDK_VERSION,
      }),
      expect.any(Number),
    );
  });
  it("checks only the requested root, even when the caller ignores its value", async () => {
    const h = harness();
    await h.client.initialize();
    h.client.getFlag({ company }, "dependent");
    await h.client.flush();
    expect(h.checks()).toEqual([
      expect.objectContaining({ key: "dependent", evalResult: "true" }),
    ]);
  });
  it("batch-evaluates roots and returns a value record", async () => {
    const h = harness();
    await h.client.initialize();
    expect(h.client.getFlags({ company })).toEqual({
      model: "quality",
      dependent: true,
    });
    await h.client.flush();
    expect(h.checks().map((event) => event.evalResult)).toEqual([
      "quality",
      "true",
    ]);
  });
  it("keeps successive evaluations scoped to their contexts", async () => {
    const h = harness();
    await h.client.initialize();
    expect(h.client.getFlag({ company }, "dependent")).toBe(true);
    expect(
      h.client.getFlag({ company: { id: "small", plan: "free" } }, "dependent"),
    ).toBe(false);
    expect(h.client.getFlag({ company }, "dependent")).toBe(true);
  });
  it("single evaluation does not diagnose unrelated roots", async () => {
    const collection = graph();
    const unrelated = definition("unrelated", false);
    unrelated.rules.unshift({
      id: "requires-context",
      filter: {
        type: "context",
        field: "other.missing",
        operator: "IS",
        values: ["yes"],
      },
      result: { type: "variant", variantKey: "default" },
    });
    collection.flags.push(unrelated);
    const h = harness(collection);
    await h.client.initialize();
    h.client.getFlag({ company }, "dependent");
    await h.client.flush();
    expect(h.checks()).toHaveLength(1);
    expect(h.logger.warn).not.toHaveBeenCalled();
  });
  it("preserves diagnostic provenance with a successful fallback selection", async () => {
    const h = harness();
    await h.client.initialize();
    expect(h.client.getFlag({}, "dependent")).toBe(false);
    await h.client.flush();
    expect(h.checks()[0]).toMatchObject({
      evalResult: "false",
      evalErrors: [
        expect.objectContaining({
          code: "MISSING_CONTEXT_FIELD",
          field: "company.plan",
          source: { type: "segment", key: "enterprise" },
        }),
      ],
    });
  });
  it("does not let callers mutate cached variant payloads", async () => {
    const h = harness(snapshot([definition("flag", { enabled: false })]));
    await h.client.initialize();
    const value = h.client.getFlag({}, "flag", { enabled: false });
    value.enabled = true;
    expect(h.client.getFlag({}, "flag", { enabled: true })).toEqual({
      enabled: false,
    });
    const batch = h.client.getFlags({ enableTracking: false });
    (batch.flag as { enabled: boolean }).enabled = true;
    expect(h.client.getFlag({}, "flag", { enabled: true })).toEqual({
      enabled: false,
    });
  });
  it("captures check context before the caller mutates it", async () => {
    const h = harness();
    await h.client.initialize();
    const mutable = { id: "acme", plan: "enterprise" };
    h.client.getFlag({ company: mutable }, "dependent");
    mutable.plan = "free";
    h.client.getFlag({ company: mutable }, "dependent");
    await h.client.flush();
    expect(h.checks()).toEqual([
      expect.objectContaining({
        evalResult: "true",
        evalContext: { company: { id: "acme", plan: "enterprise" } },
      }),
      expect.objectContaining({
        evalResult: "false",
        evalContext: { company: { id: "acme", plan: "free" } },
      }),
    ]);
  });
  it("supports prototype-like keys without polluting records", async () => {
    const h = harness(
      snapshot([definition("__proto__", 3), definition("constructor", null)]),
    );
    await h.client.initialize();
    expect(h.client.getFlag({}, "__proto__", 0)).toBe(3);
    expect(h.client.getFlags({ enableTracking: false })).toEqual(
      JSON.parse('{"__proto__":3,"constructor":null}'),
    );
  });
});

describe("default-value reads", () => {
  it("distinguishes authored Boolean false from an identical implicit default", async () => {
    const h = harness(snapshot([definition("release", false, "false")]));
    await h.client.initialize();
    expect(h.client.getFlag({}, "release")).toBe(false);
    expect(h.client.getFlag({}, "missing")).toBe(false);
    await h.client.flush();
    expect(h.checks()).toEqual([
      expect.objectContaining({
        key: "release",
        evalResult: "false",
        sourceVersionId: "version:release",
      }),
      expect.objectContaining({ key: "missing", action: "check" }),
    ]);
    expect(h.checks()[1]).not.toHaveProperty("evalResult");
    expect(h.checks()[1]).not.toHaveProperty("sourceVersionId");
  });

  it("uses an explicit default for a missing bound read without authored provenance", async () => {
    const h = harness(snapshot());
    await h.client.initialize();
    expect(
      h.client.bindClient({}).getFlag("settings", { model: "Swift" }),
    ).toEqual({ model: "Swift" });
    await h.client.flush();
    expect(h.checks()).toEqual([expect.objectContaining({ key: "settings" })]);
    expect(h.checks()[0]).not.toHaveProperty("evalResult");
    expect(h.checks()[0]).not.toHaveProperty("sourceVersionId");
  });

  it.each([
    [false, true],
    [0, 42],
    ["", "fallback"],
    [[], [1]],
    [{}, { model: "Swift" }],
  ])(
    "preserves a selected falsy/empty value %j rather than the default",
    async (value, defaultValue) => {
      const h = harness(snapshot([definition("flag", value)]));
      await h.client.initialize();
      expect(h.client.getFlag({}, "flag", defaultValue)).toEqual(value);
      await h.client.flush();
      expect(h.checks()[0]).toMatchObject({
        evalResult: "default",
        sourceVersionId: "version:flag",
      });
    },
  );

  it.each([
    [null, { model: "Swift" }],
    [[1], { model: "Swift" }],
  ])(
    "uses the default for a category mismatch without claiming a selected variant %#",
    async (value, defaultValue) => {
      const h = harness(snapshot([definition("flag", value)]));
      await h.client.initialize();
      expect(h.client.getFlag({}, "flag", defaultValue)).toEqual(defaultValue);
      await h.client.flush();
      expect(h.checks()).toEqual([expect.objectContaining({ key: "flag" })]);
      expect(h.checks()[0]).not.toHaveProperty("evalResult");
      expect(h.checks()[0]).not.toHaveProperty("sourceVersionId");
    },
  );

  it("keeps null as an explicit arbitrary-JSON read, including authored null", async () => {
    const h = harness(snapshot([definition("flag", null)]));
    await h.client.initialize();
    expect(h.client.getFlag({}, "flag", null)).toBeNull();
    expect(h.client.getFlag({}, "missing", null)).toBeNull();
    await h.client.flush();
    expect(h.checks()[0]).toMatchObject({ evalResult: "default" });
    expect(h.checks()[1]).not.toHaveProperty("evalResult");
  });

  it("keeps Boolean defaults separate from authored payloads and dependent selections", async () => {
    const collection = graph();
    collection.flags[0].variants.quality = { secret: "do-not-log-payload" };
    const h = harness(collection);
    await h.client.initialize();
    expect(h.client.getFlag({ company }, "model")).toBe(false);
    expect(h.client.getFlag({ company }, "dependent")).toBe(true);
    await h.client.flush();
    expect(h.checks()[0]).not.toHaveProperty("evalResult");
    expect(h.checks()[0]).not.toHaveProperty("sourceVersionId");
    expect(h.checks()[1]).toMatchObject({
      key: "dependent",
      evalResult: "true",
    });
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Using the default value"),
    );
    expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain(
      "do-not-log-payload",
    );
  });

  it("returns independent mutable copies of caller defaults", async () => {
    const h = harness(snapshot());
    await h.client.initialize();
    const fallback = { nested: { model: "Swift" }, items: [1] };
    const value = h.client.getFlag({}, "missing", fallback);
    value.nested.model = "changed";
    value.items.push(2);
    expect(fallback).toEqual({ nested: { model: "Swift" }, items: [1] });
    const frozen = Object.freeze({ model: "Swift", items: Object.freeze([1]) });
    expect(h.client.getFlag({}, "missing", frozen)).toEqual({
      model: "Swift",
      items: [1],
    });
  });

  it("validates local and remote defaults before evaluation or HTTP", async () => {
    const h = harness();
    const defaultValue = { nested: undefined };
    expect(() =>
      Reflect.apply(h.client.getFlag, h.client, [{}, "flag", defaultValue]),
    ).toThrow("JSON value");
    await expect(
      Reflect.apply(h.client.getFlagRemote, h.client, ["flag", defaultValue]),
    ).rejects.toThrow("JSON value");
    expect(h.httpClient.get).not.toHaveBeenCalled();
    await h.client.flush();
    expect(h.checks()).toEqual([]);
  });

  it("applies remote defaults without authenticating a fabricated selection", async () => {
    const h = harness({
      protocolVersion: 2,
      flagStateVersion: 7,
      flags: {
        model: {
          value: { model: "Reasoner" },
          variantKey: "quality",
          sourceVersionId: "remote-version",
          matchedRuleId: "r",
          ruleResults: [],
          errors: [],
        },
      },
    });
    expect(await h.client.getFlagRemote("model")).toBe(false);
    expect(
      await h.client.bindClient({}).getFlagRemote("model", { model: "Swift" }),
    ).toEqual({ model: "Reasoner" });
    expect(await h.client.getFlagRemote("missing", { model: "Swift" })).toEqual(
      { model: "Swift" },
    );
    await h.client.flush();
    expect(h.checks()).toHaveLength(3);
    expect(h.checks()[0]).not.toHaveProperty("evalResult");
    expect(h.checks()[1]).toMatchObject({
      evalResult: "quality",
      sourceVersionId: "remote-version",
      flagStateVersion: 7,
    });
    expect(h.checks()[2]).not.toHaveProperty("sourceVersionId");
  });

  it("uses local defaults and overrides for offline remote reads without tracking", async () => {
    const h = harness(graph(), {
      offline: true,
      flagOverrides: { model: { model: "Swift" } },
    });
    await h.client.initialize();
    expect(
      await h.client.getFlagRemote("model", { model: "Reasoner" }),
    ).toEqual({ model: "Swift" });
    expect(await h.client.bindClient({}).getFlagRemote("missing")).toBe(false);
    expect(h.httpClient.get).not.toHaveBeenCalled();
    expect(h.checks()).toEqual([]);
  });
});

describe("check identity and context", () => {
  it("deduplicates equivalent normalized contexts within the check window", async () => {
    const h = harness();
    await h.client.initialize();
    h.client.getFlag({ company, other: { n: 1 } }, "model", "quick");
    h.client.getFlag(
      { other: { n: "1" }, company: { plan: "enterprise", id: "acme" } },
      "model",
      "quick",
    );
    await h.client.flush();
    expect(h.checks()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(
      FLAG_EVENT_RATE_LIMITER_WINDOW_SIZE_MS + 1,
    );
    h.client.getFlag({ company, other: { n: 1 } }, "model", "quick");
    await h.client.flush();
    expect(h.checks()).toHaveLength(2);
  });
  it("distinguishes equal-valued variants for the same normalized context", async () => {
    const flag = definition("flag", null, "first");
    flag.variants.second = null;
    const response = snapshot([flag]);
    const h = harness(response);
    await h.client.initialize();
    h.client.getFlag({}, "flag", null);
    // Simulate a new immutable accepted definition with an unchanged snapshot number.
    const changed = structuredClone(response);
    changed.flags[0].rules[0].result = {
      type: "variant",
      variantKey: "second",
    };
    h.state.response = changed;
    await nextRefresh(h.client);
    h.client.getFlag({}, "flag", null);
    await h.client.flush();
    expect(h.checks().map((event) => event.evalResult)).toEqual([
      "first",
      "second",
    ]);
  });
  it("includes the snapshot version when only a dependency changes", async () => {
    const h = harness();
    await h.client.initialize();
    expect(h.client.getFlag({ company }, "dependent")).toBe(true);
    const changed = graph();
    changed.flagStateVersion = 2;
    changed.segments[0].filter = { type: "constant", value: false };
    h.state.response = changed;
    await nextRefresh(h.client, 2);
    expect(h.client.getFlag({ company }, "dependent")).toBe(false);
    await h.client.flush();
    expect(h.checks()).toEqual([
      expect.objectContaining({
        sourceVersionId: "version:dependent",
        flagStateVersion: 1,
        evalResult: "true",
      }),
      expect.objectContaining({
        sourceVersionId: "version:dependent",
        flagStateVersion: 2,
        evalResult: "false",
      }),
    ]);
  });
  it("registers a new check when only the definition version changes", async () => {
    const h = harness();
    await h.client.initialize();
    h.client.getFlag({ company }, "model", "quick");
    const changed = graph();
    changed.flags[0].sourceVersionId = "updated";
    h.state.response = changed;
    await nextRefresh(h.client);
    h.client.getFlag({ company }, "model", "quick");
    await h.client.flush();
    expect(h.checks().map((event) => event.sourceVersionId)).toEqual([
      "version:model",
      "updated",
    ]);
  });
  it("disables both context synchronization and checks when requested", async () => {
    const h = harness();
    await h.client.initialize();
    h.client.getFlag(
      { company, user: { id: "u" }, enableTracking: false },
      "model",
      "quick",
    );
    h.client.getFlags({ company, enableTracking: false });
    await h.client.flush();
    expect(h.events()).toEqual([]);
  });
  it("preserves numeric zero IDs for ordinary tracking", async () => {
    const h = harness();
    await h.client.initialize();
    h.client.getFlag(
      {
        company: { id: 0, plan: "free" },
        user: { id: 0 },
        meta: { active: false },
      },
      "model",
      "quick",
    );
    await h.client.track(0, "clicked", { companyId: 0 });
    await h.client.flush();
    expect(h.events()).toContainEqual(
      expect.objectContaining({
        type: "company",
        companyId: 0,
        userId: 0,
        context: { active: false },
      }),
    );
    expect(h.events()).toContainEqual(
      expect.objectContaining({ type: "event", userId: 0, companyId: 0 }),
    );
  });
});

describe("bootstrap, bound clients, and overrides", () => {
  it("bootstraps selections and version without registering checks", async () => {
    const h = harness();
    await h.client.initialize();
    const bootstrap = h.client.getFlagsForBootstrap({
      company,
      other: { raw: 42 },
    });
    expect(bootstrap).toMatchObject({
      protocolVersion: 2,
      flagStateVersion: 1,
      context: { company, other: { raw: 42 } },
      flags: {
        model: { resolved: true, value: "quality", variantKey: "quality" },
      },
    });
    await h.client.flush();
    expect(h.checks()).toEqual([]);
  });
  it("binds and merges context while preserving direct values and ordinary track", async () => {
    const h = harness();
    await h.client.initialize();
    const bound = h.client
      .bindClient({ company: { id: "acme", plan: "free" }, user: { id: 0 } })
      .bindClient({ company });
    expect(bound.getFlag("model", "quick")).toBe("quality");
    expect(bound.getFlags()).toEqual({ model: "quality", dependent: true });
    expect(bound.getFlagsForBootstrap().context).toMatchObject({
      user: { id: 0 },
      company,
    });
    await bound.track("selected");
    await bound.flush();
    expect(h.events()).toContainEqual(
      expect.objectContaining({
        type: "event",
        userId: 0,
        companyId: "acme",
        event: "selected",
      }),
    );
  });
  it.each([false, null, { payload: 1 }, [1, 2], "override"])(
    "returns a direct override %j without claiming an authored selection",
    async (value) => {
      const h = harness(graph(), { flagOverrides: { model: value } });
      await h.client.initialize();
      expect(h.client.getFlag({ company }, "model", null)).toEqual(value);
      // Overrides remain post-evaluation; they do not rewrite dependency results.
      expect(h.client.getFlag({ company }, "dependent")).toBe(true);
      await h.client.flush();
      expect(h.checks()[0]).not.toHaveProperty("evalResult");
      expect(h.checks()[0]).not.toHaveProperty("sourceVersionId");
    },
  );
  it("retains explicit tracking disablement when merged options are undefined", async () => {
    const h = harness();
    await h.client.initialize();
    const bound = h.client
      .bindClient({ company, enableTracking: false })
      .bindClient({ enableTracking: undefined, other: { n: 1 } });
    expect(bound.getFlag("model", "quick")).toBe("quality");
    await bound.flush();
    expect(h.events()).toEqual([]);
  });
  it("supports context functions and disposable override layers", async () => {
    const h = harness(graph(), {
      flagOverrides: (context) => ({
        model: context.company?.id === "acme" ? 1 : 0,
      }),
    });
    await h.client.initialize();
    const pop = h.client.pushFlagOverrides({ model: null, extra: false });
    expect(h.client.getFlags({ company, enableTracking: false })).toMatchObject(
      { model: null, extra: false },
    );
    pop();
    pop();
    expect(h.client.getFlag({ company }, "model", 0)).toBe(1);
    h.client.setFlagOverrides({ model: "base" });
    expect(h.client.getFlag({ company }, "model", "quick")).toBe("base");
    h.client.clearFlagOverrides();
    expect(h.client.getFlag({ company }, "model", "quick")).toBe("quality");
  });
  it("keeps prototype-like override keys", async () => {
    const h = harness(snapshot(), {
      flagOverrides: JSON.parse('{"__proto__":false}'),
    });
    await h.client.initialize();
    expect(h.client.getFlag({}, "__proto__")).toBe(false);
  });
  it("works offline without fetching, checks, or ordinary tracking", async () => {
    const h = harness(graph(), {
      offline: true,
      flagOverrides: { model: null },
    });
    await h.client.initialize();
    expect(h.client.getFlag({ company }, "model", null)).toBeNull();
    await h.client.track(0, "event");
    await h.client.flush();
    expect(h.httpClient.get).not.toHaveBeenCalled();
    expect(h.events()).toEqual([]);
  });
});

describe("atomic refresh and complete fallback snapshots", () => {
  it("replaces flags, segments, and version together", async () => {
    const h = harness();
    await h.client.initialize();
    const changed = graph();
    changed.flagStateVersion = 2;
    changed.segments[0].filter = { type: "constant", value: false };
    changed.flags[0].variants.quick = "new";
    h.state.response = changed;
    await nextRefresh(h.client, 2);
    expect(h.client.getFlags({ company, enableTracking: false })).toEqual({
      model: "new",
      dependent: false,
    });
    expect(h.client.getFlagsForBootstrap({ company }).flagStateVersion).toBe(2);
    expect(h.httpClient.get).toHaveBeenLastCalledWith(
      "https://api.example.com/flags?waitForVersion=2",
      expect.anything(),
      expect.any(Number),
    );
  });
  it("rejects stale responses before saving them to a fallback provider", async () => {
    const save = vi.fn();
    const h = harness(snapshot([], [], 5), {
      flagsFallbackProvider: { load: vi.fn(), save },
    });
    await h.client.initialize();
    h.state.response = graph();
    await nextRefresh(h.client);
    await h.client.flush();
    expect(h.client.getFlagDefinitions()).toEqual({ flags: [], segments: [] });
    expect(h.client.getFlagsForBootstrap({}).flagStateVersion).toBe(5);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it.each([
    { protocolVersion: 2, flagStateVersion: 2, flags: [] },
    { ...snapshot(), flagStateVersion: -1 },
    { ...snapshot(), protocolVersion: 1 },
    snapshot(
      [definition("bad", 1)],
      [{ key: "segment", filter: { type: "segment", key: "missing" } }],
      2,
    ),
  ])(
    "retains a last-known-good graph after invalid refresh %#",
    async (invalid) => {
      const h = harness();
      await h.client.initialize();
      h.state.response = invalid;
      await nextRefresh(h.client);
      expect(
        h.client.getFlag({ company, enableTracking: false }, "dependent"),
      ).toBe(true);
      expect(h.client.getFlagsForBootstrap({ company }).flagStateVersion).toBe(
        1,
      );
    },
  );
  it("does not expose mutable definitions or its prepared evaluator", async () => {
    const h = harness();
    await h.client.initialize();
    const definitions = h.client.getFlagDefinitions();
    definitions.segments.length = 0;
    expect(
      h.client.getFlag({ company, enableTracking: false }, "dependent"),
    ).toBe(true);
    expect(definitions).not.toHaveProperty("evaluator");
  });
  it("persists and restores the full graph and snapshot version", async () => {
    let saved: FlagsFallbackSnapshot | undefined;
    const provider = {
      load: vi.fn(async () => saved),
      save: vi.fn(async (_context: unknown, next: FlagsFallbackSnapshot) => {
        saved = next;
      }),
    };
    const live = harness(graph(), { flagsFallbackProvider: provider });
    await live.client.initialize();
    await live.client.flush();
    expect(saved).toMatchObject({
      version: 2,
      flagStateVersion: 1,
      flags: graph().flags,
      segments: graph().segments,
    });
    const fallback = harness(undefined, { flagsFallbackProvider: provider });
    fallback.state.response = undefined;
    await fallback.client.initialize();
    expect(fallback.client.getFlag({ company }, "dependent")).toBe(true);
    await fallback.client.flush();
    expect(fallback.checks()[0]).toMatchObject({
      evalResult: "true",
      sourceVersionId: "version:dependent",
      flagStateVersion: 1,
    });
    expect(provider.save).toHaveBeenCalledTimes(1);
  });
  it.each([1, 2])(
    "rejects incomplete or legacy fallback snapshots (version %i)",
    async (version) => {
      const h = harness(
        {},
        {
          flagsFallbackProvider: {
            load: vi.fn(
              async () =>
                ({
                  version,
                  savedAt: new Date().toISOString(),
                  flags: graph().flags,
                }) as FlagsFallbackSnapshot,
            ),
            save: vi.fn(),
          },
        },
      );
      await h.client.initialize();
      expect(h.client.getFlagDefinitions()).toEqual({
        flags: [],
        segments: [],
      });
    },
  );
  it("does not reload stale fallback state after a successful live refresh", async () => {
    const load = vi.fn();
    const h = harness(graph(), {
      flagsFallbackProvider: { load, save: vi.fn() },
    });
    await h.client.initialize();
    h.state.response = {};
    await nextRefresh(h.client);
    expect(load).not.toHaveBeenCalled();
  });
  it("uses static JSON fallback values without an authored variant claim", async () => {
    const h = harness(
      {},
      {
        flagsFallbackProvider: fallbackProviders.static({
          flags: { model: null, bool: false },
        }),
      },
    );
    await h.client.initialize();
    expect(h.client.getFlag({ company }, "model", null)).toBeNull();
    expect(h.client.getFlag({}, "bool")).toBe(false);
    await h.client.flush();
    for (const event of h.checks()) {
      expect(event).not.toHaveProperty("evalResult");
      expect(event).not.toHaveProperty("sourceVersionId");
    }
  });
  it("uses value-only configured fallbacks without an authored variant claim", async () => {
    const h = harness({}, { fallbackFlags: { flag: false } });
    await h.client.initialize();
    expect(h.client.getFlag({}, "flag")).toBe(false);
    await h.client.flush();
    expect(h.checks()[0]).not.toHaveProperty("evalResult");
  });
  it("serializes fallback saves", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const save = vi
      .fn()
      .mockImplementationOnce(() => pending)
      .mockResolvedValue(undefined);
    const h = harness(graph(), {
      flagsFallbackProvider: { load: vi.fn(), save },
    });
    await h.client.initialize();
    h.state.response = snapshot([], [], 2);
    await nextRefresh(h.client, 2);
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await h.client.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toMatchObject({
      flagStateVersion: 2,
      flags: [],
      segments: [],
    });
  });
});

describe("remote values", () => {
  it("returns direct values, preserves explicit zero IDs, and registers selected keys", async () => {
    const result = {
      value: null,
      variantKey: "quality",
      sourceVersionId: "remote-version",
      matchedRuleId: "r",
      ruleResults: [],
      errors: [],
    };
    const h = harness({
      protocolVersion: 2,
      flagStateVersion: 9,
      flags: { model: result },
      remoteContextUsed: false,
    });
    expect(await h.client.getFlagRemote("model", null, 0, 0)).toBeNull();
    await h.client.flush();
    expect(h.checks()[0]).toMatchObject({
      evalResult: "quality",
      sourceVersionId: "remote-version",
      flagStateVersion: 9,
      evalContext: { user: { id: 0 }, company: { id: 0 } },
    });
    const url = new URL(h.httpClient.get.mock.calls[0][0]);
    expect(url.pathname).toBe("/flags/evaluated");
    expect(JSON.parse(url.searchParams.get("contextJson")!)).toEqual({
      user: { id: 0 },
      company: { id: 0 },
    });
  });
  it("honors bound enableTracking=false for remote calls", async () => {
    const h = harness({
      protocolVersion: 2,
      flagStateVersion: 1,
      flags: {
        model: {
          value: false,
          variantKey: "false",
          sourceVersionId: "v",
          matchedRuleId: "r",
          ruleResults: [],
          errors: [],
        },
      },
    });
    expect(
      await h.client
        .bindClient({ company, enableTracking: false })
        .getFlagRemote("model"),
    ).toBe(false);
    await h.client.flush();
    expect(h.checks()).toEqual([]);
  });
  it.each([
    { ruleResults: [null] },
    { errors: [null] },
    { sourceVersionId: "" },
    { variantKey: "" },
  ])("rejects malformed remote selection metadata %#", async (invalid) => {
    const h = harness({
      protocolVersion: 2,
      flagStateVersion: 1,
      flags: {
        model: {
          value: false,
          variantKey: "false",
          sourceVersionId: "v",
          matchedRuleId: "r",
          ruleResults: [],
          errors: [],
          ...invalid,
        },
      },
    });
    expect(await h.client.getFlagRemote("model")).toBe(false);
    await h.client.flush();
    expect(h.checks()).toEqual([expect.objectContaining({ key: "model" })]);
    expect(h.checks()[0]).not.toHaveProperty("evalResult");
    expect(h.checks()[0]).not.toHaveProperty("sourceVersionId");
  });
  it("returns false without fabricating a remote selection after failure", async () => {
    const h = harness({});
    expect(await h.client.getFlagRemote("missing")).toBe(false);
    await h.client.flush();
    expect(h.checks()).toEqual([expect.objectContaining({ key: "missing" })]);
    expect(h.checks()[0]).not.toHaveProperty("evalResult");
    expect(h.checks()[0]).not.toHaveProperty("sourceVersionId");
  });
});
