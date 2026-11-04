import { afterEach, describe, expect, test, vi } from "vitest";

import { FlagCache } from "../src/flag/flagCache";
import { FlagsClient, validateFlagsResponse } from "../src/flag/flags";
import { HttpClient } from "../src/httpClient";
import { createNoopStorageAdapter } from "../src/storage";
import { deferred } from "./deferred";
import { flagResponse, flagsResult, selectedFlag } from "./mocks/handlers";
import { testLogger } from "./testLogger";

function response(version = 1, value = true): Response {
  return Response.json({
    ...flagResponse,
    flagStateVersion: version,
    flags: {
      flagA: {
        ...selectedFlag(value, String(value), `source-${version}`),
        optInEnabled: false,
        optIn: null,
      },
    },
  });
}
function setup(
  options: NonNullable<ConstructorParameters<typeof FlagsClient>[3]> = {},
) {
  const http = new HttpClient("pk", { baseUrl: "https://front.reflag.com" });
  const get = vi.spyOn(http, "get").mockImplementation(async () => response());
  const client = new FlagsClient(http, { user: { id: "alice" } }, testLogger, {
    storage: createNoopStorageAdapter(),
    ...options,
  });
  return { client, get };
}
afterEach(() => vi.useRealTimers());

describe("v2 snapshots", () => {
  test.each([
    ["legacy protocol", { success: true, features: {} }],
    [
      "missing snapshot version",
      { ...flagResponse, flagStateVersion: undefined },
    ],
    ["negative snapshot version", { ...flagResponse, flagStateVersion: -1 }],
    [
      "missing selected identity",
      {
        ...flagResponse,
        flags: { bad: { ...selectedFlag(true), sourceVersionId: undefined } },
      },
    ],
    [
      "malformed rule diagnostics",
      {
        ...flagResponse,
        flags: { bad: { ...selectedFlag(true), ruleResults: [true] } },
      },
    ],
    [
      "malformed error diagnostics",
      {
        ...flagResponse,
        flags: {
          bad: {
            ...selectedFlag(true),
            errors: [{ code: "MISSING_CONTEXT_FIELD" }],
          },
        },
      },
    ],
    [
      "malformed opt-in metadata",
      {
        ...flagResponse,
        flags: {
          bad: {
            ...selectedFlag(true),
            optInEnabled: true,
            optIn: { name: "Try" },
          },
        },
      },
    ],
  ])("rejects %s atomically", (_name, body) => {
    expect(validateFlagsResponse(body)).toBeUndefined();
  });

  test("fetches v2 evaluated values with canonical JSON context and no root checks", async () => {
    const { client, get } = setup();
    await client.setContext({
      user: { id: 0, roles: ["admin", "editor"] },
      other: { z: { second: 2, first: 1 }, a: true },
    });
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/flags/evaluated", timeoutMs: 5000 }),
    );
    expect(get.mock.calls[0][0].params?.get("contextJson")).toBe(
      '{"other":{"a":true,"z":{"first":1,"second":2}},"user":{"id":0,"roles":["admin","editor"]}}',
    );
    expect(client.getFlags().flagA).toMatchObject({
      value: true,
      variantKey: "true",
      sourceVersionId: "source-1",
    });
  });

  test("accepts empty snapshots but retains the known-good state after an invalid refresh", async () => {
    const { client, get } = setup();
    await client.initialize();
    get.mockResolvedValueOnce(
      Response.json({
        ...flagResponse,
        flags: { valid: selectedFlag(true), broken: {} },
      }),
    );
    expect(await client.refreshFlags()).toBeUndefined();
    expect(client.getFlags().flagA.value).toBe(true);
    get.mockResolvedValueOnce(
      Response.json({ ...flagResponse, flagStateVersion: 2, flags: {} }),
    );
    expect(await client.refreshFlags()).toEqual({});
    expect(client.getFlags()).toEqual({});
  });

  test("passes waitForVersion and refuses a response below the requested version", async () => {
    const { client, get } = setup();
    await client.initialize();
    get.mockResolvedValueOnce(response(2, false));
    expect(await client.refreshFlags(3)).toBeUndefined();
    expect(get.mock.calls.at(-1)?.[0].params?.get("waitForVersion")).toBe("3");
    expect(client.getFlagStateVersion()).toBe(1);
  });

  test("a late lower-version refresh cannot replace newer flags", async () => {
    const { client, get } = setup();
    await client.initialize();
    const older = deferred<Response>();
    const newer = deferred<Response>();
    get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = client.refreshFlags();
    const second = client.refreshFlags();
    newer.resolve(response(3, false));
    await second;
    older.resolve(response(2, true));
    expect(await first).toBeUndefined();
    expect(client.getFlags().flagA.value).toBe(false);
    expect(client.getFlagStateVersion()).toBe(3);
  });

  test("a context change in an update listener cannot redirect a refresh cache write", async () => {
    const stored = new Map<string, string>();
    const cache = new FlagCache({
      storage: {
        getItem: async (key) => stored.get(key) ?? null,
        setItem: async (key, value) => {
          stored.set(key, value);
        },
      },
      staleTimeMs: 60_000,
      expireTimeMs: 60_000,
    });
    const cacheGet = vi.spyOn(cache, "get");
    const { client, get } = setup({ cache });
    await client.initialize();
    const aliceCacheKey = cacheGet.mock.calls[0][0];

    get
      .mockResolvedValue(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(response(2, false));
    const switchContext = vi
      .fn()
      .mockImplementationOnce(() => client.setContext({ user: { id: "bob" } }));
    client.onUpdated(switchContext);

    await client.refreshFlags();
    await switchContext.mock.results[0].value;
    const bobCacheKey = cacheGet.mock.calls.at(-1)![0];
    expect(await cache.get(bobCacheKey)).toBeUndefined();
    expect(await cache.get(aliceCacheKey)).toMatchObject({
      flagStateVersion: 2,
      flags: {
        flagA: {
          value: false,
          variantKey: "false",
          sourceVersionId: "source-2",
        },
      },
    });
    expect(client.getFlags()).toEqual({});
  });

  test("context changes immediately clear old values and discard late responses for the previous context", async () => {
    const { client, get } = setup();
    await client.initialize();
    const oldRefresh = deferred<Response>();
    const current = deferred<Response>();
    get
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(current.promise);
    const refresh = client.refreshFlags();
    const context = client.setContext({ user: { id: "bob" } });
    expect(client.getFlags()).toEqual({});
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    current.resolve(response(2, false));
    await context;
    oldRefresh.resolve(response(9, true));
    await refresh;
    expect(client.getFlags().flagA.value).toBe(false);
    expect(client.getFlagStateVersion()).toBe(2);
  });

  test("only the latest overlapping context update is accepted", async () => {
    const { client, get } = setup();
    const first = deferred<Response>();
    const second = deferred<Response>();
    get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = client.setContext({ user: { id: "a" } });
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    const b = client.setContext({ user: { id: "b" } });
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    second.resolve(response(1, false));
    expect(await b).toBe(true);
    first.resolve(response(9, true));
    expect(await a).toBe(false);
    expect(client.getFlags().flagA.value).toBe(false);
  });

  test("limits refresh storms without blocking the initial fetch", async () => {
    const { client, get } = setup();
    await client.initialize();
    for (let i = 0; i < 21; i++) await client.refreshFlags();
    expect(get).toHaveBeenCalledTimes(21);
  });

  test.each(["network", "body"])(
    "retries a thrown %s failure during initialization",
    async (kind) => {
      vi.useFakeTimers();
      const { client, get } = setup();
      if (kind === "network") get.mockRejectedValueOnce(new Error("network"));
      else
        get.mockResolvedValueOnce({
          ok: true,
          json: async () => {
            throw new Error("body");
          },
        } as unknown as Response);
      const initialization = client.initialize();
      await vi.runAllTimersAsync();
      await initialization;
      expect(get).toHaveBeenCalledTimes(2);
      expect(client.getFlags().flagA.value).toBe(true);
    },
  );

  test("falls back to unselected direct JSON after an initial HTTP failure", async () => {
    const { client, get } = setup({
      fallbackFlags: { settings: { model: "offline" }, false: false },
    });
    get.mockResolvedValue(Response.json({}, { status: 503 }));
    await client.initialize();
    expect(client.getFlags()).toEqual({
      settings: {
        value: { model: "offline" },
        resolved: false,
        ruleResults: [],
        errors: [],
      },
      false: { value: false, resolved: false, ruleResults: [], errors: [] },
    });
  });

  test("storage failure does not discard a successful live response", async () => {
    const { client } = setup({
      storage: {
        getItem: async () => null,
        setItem: async () => {
          throw new Error("quota");
        },
      },
    });
    await client.initialize();
    expect(client.getFlags().flagA.value).toBe(true);
  });

  test("uses stale v2 cache on failure, preserving real selections", async () => {
    const cache = new FlagCache({
      storage: createNoopStorageAdapter(),
      staleTimeMs: 0,
      expireTimeMs: 1000,
    });
    vi.spyOn(cache, "get").mockResolvedValue({
      flags: flagsResult,
      flagStateVersion: 4,
      stale: true,
    });
    const { client, get } = setup({ cache });
    get.mockResolvedValue(Response.json({}, { status: 503 }));
    await client.initialize();
    expect(client.getFlags()).toEqual(flagsResult);
    expect(client.getFlagStateVersion()).toBe(4);
  });

  test("stale background revalidation cannot cross a context boundary", async () => {
    const cache = new FlagCache({
      storage: createNoopStorageAdapter(),
      staleTimeMs: 0,
      expireTimeMs: 1000,
    });
    vi.spyOn(cache, "get")
      .mockResolvedValueOnce({
        flags: flagsResult,
        flagStateVersion: 1,
        stale: true,
      })
      .mockResolvedValue(undefined);
    const { client, get } = setup({ cache, staleWhileRevalidate: true });
    const background = deferred<Response>();
    get.mockReturnValueOnce(background.promise);
    await client.initialize();
    await client.setContext({ user: { id: "bob" } });
    background.resolve(response(9, false));
    await vi.waitFor(() => expect(client.getFlagStateVersion()).toBe(1));
    expect(client.getFlags().flagA.value).toBe(true);
  });

  test("superseded opt-in metadata cannot leak across contexts and empty metadata settles loading", async () => {
    const { client, get } = setup({
      bootstrappedState: {
        protocolVersion: 2,
        flagStateVersion: 1,
        flags: { flagA: selectedFlag(true) },
      },
    });
    await client.initialize();
    const oldMetadata = deferred<Response>();
    get.mockReturnValueOnce(oldMetadata.promise);
    client.requestOptInFlags();
    const refresh = client.refreshOptInMetadataIfNeeded();
    get.mockResolvedValueOnce(response());
    await client.setContext({ user: { id: "bob" } });
    oldMetadata.resolve(
      Response.json({
        ...flagResponse,
        flags: {
          flagA: {
            ...selectedFlag(true),
            optInEnabled: true,
            optIn: {
              name: "Alice",
              description: null,
              userOptedIn: true,
              companyOptedIn: false,
              isOptedIn: true,
            },
          },
        },
      }),
    );
    await refresh;
    expect(client.getIsLoadingOptInFlags()).toBe(false);
    expect(client.getOptInMetadata()).toEqual({});
  });
});
