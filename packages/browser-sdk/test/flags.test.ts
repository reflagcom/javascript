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
function optInResponse(version: number, optedIn: boolean | null): Response {
  return Response.json({
    ...flagResponse,
    flagStateVersion: version,
    flags: {
      flagA: {
        ...selectedFlag(false, "false", `source-${version}`),
        optInEnabled: true,
        optIn:
          optedIn === null
            ? null
            : {
                name: "Try",
                description: null,
                userOptedIn: optedIn,
                companyOptedIn: false,
                isOptedIn: optedIn,
              },
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
  test("owns singular results as well as batch and fetched snapshots", () => {
    const flag = selectedFlag({ nested: [1] });
    const { client } = setup({
      bootstrappedState: {
        protocolVersion: 2,
        flags: { settings: flag },
      },
    });
    const singular = client.getFlag("settings")!;
    (singular.value as { nested: number[] }).nested.push(2);
    singular.ruleResults[0].matched = false;
    singular.errors.push({ code: "TEST", message: "mutated" });
    expect(client.getFlag("settings")).toEqual(flag);

    const batch = client.getFlags();
    batch.settings.value = false;
    batch.settings.ruleResults[0].matched = false;
    const fetched = client.getFetchedFlags();
    fetched.settings.value = false;
    fetched.settings.ruleResults[0].matched = false;
    expect(client.getFlags()).toEqual({ settings: flag });
    expect(client.getFetchedFlags()).toEqual({ settings: flag });
    expect(client.getFlag("settings")).toEqual(flag);
  });

  test.each(["missing", "constructor", "toString", "__proto__"])(
    "returns undefined for the absent key %s",
    (key) => {
      const { client } = setup();
      expect(client.getFlag(key)).toBeUndefined();
    },
  );

  test.each(["constructor", "toString", "__proto__"])(
    "reads an authored flag with the key %s",
    (key) => {
      const flag = selectedFlag(false);
      const { client } = setup({
        bootstrappedState: { protocolVersion: 2, flags: { [key]: flag } },
      });
      expect(client.getFlag(key)).toEqual(flag);
    },
  );

  test.each([0, 1])(
    "accepts a successful response at version %s",
    (version) => {
      expect(
        validateFlagsResponse({ ...flagResponse, flagStateVersion: version }),
      ).toEqual({
        success: true,
        flags: flagsResult,
        flagStateVersion: version,
      });
    },
  );

  test.each([
    ["unsuccessful response", { ...flagResponse, success: false }],
    ["missing success", { ...flagResponse, success: undefined }],
    ["non-boolean success", { ...flagResponse, success: "true" }],
    ["legacy protocol", { success: true, features: {} }],
    [
      "missing snapshot version",
      { ...flagResponse, flagStateVersion: undefined },
    ],
    ["negative snapshot version", { ...flagResponse, flagStateVersion: -1 }],
    [
      "non-numeric snapshot version",
      { ...flagResponse, flagStateVersion: "1" },
    ],
    ["fractional snapshot version", { ...flagResponse, flagStateVersion: 0.5 }],
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

  test.each(["constructor", "setContext", "setContextWithoutFetch"])(
    "owns context without changing canonical request or cache identity via %s",
    async (method) => {
      const cache = new FlagCache({
        storage: createNoopStorageAdapter(),
        staleTimeMs: 0,
        expireTimeMs: 60_000,
      });
      const cacheGet = vi.spyOn(cache, "get");
      const http = new HttpClient("pk", {
        baseUrl: "https://front.reflag.com",
      });
      const get = vi
        .spyOn(http, "get")
        .mockImplementation(async () => response());
      const context = {
        other: {
          profile: { plan: undefined },
          nested: { profile: { plan: undefined } },
          explicitEmpty: {},
          values: [{ plan: undefined }, "second"],
        },
      };
      const client = new FlagsClient(
        http,
        method === "constructor" ? context : {},
        testLogger,
        { cache },
      );
      try {
        if (method === "setContext") {
          await client.setContext(context);
        } else if (method === "setContextWithoutFetch") {
          client.setContextWithoutFetch(context);
        }
        context.other.values.push("mutated");
        await client.initialize();
        await client.refreshFlags();

        const expected =
          '{"other":{"explicitEmpty":{},"values":[{},"second"]}}';
        expect(get).toHaveBeenCalled();
        for (const [options] of get.mock.calls) {
          expect(options.params?.get("contextJson")).toBe(expected);
        }
        expect(cacheGet).toHaveBeenCalled();
        for (const [key] of cacheGet.mock.calls) {
          expect(new URLSearchParams(key).get("contextJson")).toBe(expected);
        }
      } finally {
        client.stop();
      }
    },
  );

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

  test.each([true, null])(
    "a late full refresh cannot roll back newer opt-in metadata (%s)",
    async (optedIn) => {
      const { client, get } = setup({
        bootstrappedState: {
          protocolVersion: 2,
          flagStateVersion: 1,
          flags: { flagA: selectedFlag(true) },
        },
      });
      await client.initialize();
      const older = deferred<Response>();
      get
        .mockReturnValueOnce(older.promise)
        .mockResolvedValueOnce(optInResponse(3, optedIn));
      const refresh = client.refreshFlags();
      client.requestOptInFlags();
      await client.refreshOptInMetadataIfNeeded();
      const metadata = client.getOptInMetadata();
      expect(metadata.flagA?.userOptedIn).toBe(
        optedIn === null ? undefined : optedIn,
      );
      expect(client.getFlagStateVersion()).toBe(1);
      expect(client.getFlags().flagA.value).toBe(true);
      expect(client.getFlags().flagA.sourceVersionId).toBe("version-1");
      older.resolve(optInResponse(2, false));
      await refresh;
      expect(client.getFlagStateVersion()).toBe(2);
      expect(client.getFlags().flagA.value).toBe(false);
      expect(client.getFlags().flagA.sourceVersionId).toBe("source-2");
      expect(client.getOptInMetadata()).toEqual(metadata);
      // Bootstrap reapplication invalidates requests, not same-context freshness.
      client.setContextWithoutFetch({ user: { id: "alice" } }, true);
      client.setFetchedFlags({ flagA: selectedFlag(true) });
      client.markBootstrappedStateApplied();
      expect(client.getOptInMetadata()).toEqual(metadata);
      expect(client.getIsLoadingOptInFlags()).toBe(false);
      get.mockResolvedValueOnce(optInResponse(4, false));
      await client.refreshFlags();
      expect(client.getOptInMetadata().flagA.userOptedIn).toBe(false);
      expect(client.getFlagStateVersion()).toBe(4);
    },
  );

  test.each(["fetch", "bootstrap"])(
    "resets opt-in metadata freshness when the context changes through %s",
    async (update) => {
      const { client, get } = setup({
        bootstrappedState: {
          protocolVersion: 2,
          flagStateVersion: 1,
          flags: { flagA: selectedFlag(true) },
        },
      });
      await client.initialize();
      get.mockResolvedValueOnce(optInResponse(30, true));
      client.requestOptInFlags();
      await client.refreshOptInMetadataIfNeeded();
      expect(client.getOptInMetadata().flagA.userOptedIn).toBe(true);
      if (update === "fetch") {
        get.mockResolvedValueOnce(optInResponse(1, false));
        await client.setContext({ user: { id: "bob" } });
      } else {
        client.setContextWithoutFetch({ user: { id: "bob" } });
        const result = validateFlagsResponse(
          await optInResponse(1, false).json(),
        )!;
        client.setFetchedFlags(result.flags, true, result.flagStateVersion);
      }
      expect(client.getOptInMetadata().flagA.userOptedIn).toBe(false);
      expect(client.getFlagStateVersion()).toBe(1);
    },
  );

  test("a newer bootstrap missing metadata invalidates membership and fetches it again", async () => {
    const { client, get } = setup({
      bootstrappedState: {
        protocolVersion: 2,
        flagStateVersion: 1,
        flags: { flagA: selectedFlag(true) },
      },
    });
    await client.initialize();
    get.mockResolvedValueOnce(optInResponse(3, true));
    client.requestOptInFlags();
    await client.refreshOptInMetadataIfNeeded();
    client.setFetchedFlags({ flagA: selectedFlag(true) }, true, 4);
    expect(client.getOptInMetadata()).toEqual({});
    get.mockResolvedValueOnce(optInResponse(4, false));
    client.resetOptInMetadataRefresh();
    client.markBootstrappedStateApplied();
    await client.refreshOptInMetadataIfNeeded();
    expect(client.getOptInMetadata().flagA.userOptedIn).toBe(false);
    expect(client.getFlags().flagA.value).toBe(true);
    expect(client.getFlagStateVersion()).toBe(4);
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

  test.each(["refresh", "background"] as const)(
    "storage failure does not discard a successful %s response",
    async (mode) => {
      const cache = new FlagCache({
        storage: createNoopStorageAdapter(),
        staleTimeMs: 0,
        expireTimeMs: 1000,
      });
      const { client, get } = setup({
        cache,
        staleWhileRevalidate: mode === "background",
      });
      if (mode === "refresh") await client.initialize();
      else {
        vi.spyOn(cache, "get").mockResolvedValue({
          flags: flagsResult,
          flagStateVersion: 1,
          stale: true,
        });
      }
      const quota = new Error("quota");
      const store = vi.spyOn(cache, "set").mockRejectedValue(quota);
      const warningsBefore = testLogger.warn.mock.calls.length;
      get.mockResolvedValue(response(2, false));
      if (mode === "refresh") await client.refreshFlags();
      else await client.initialize();
      await vi.waitFor(() => {
        expect(store).toHaveBeenCalledOnce();
        expect(testLogger.warn.mock.calls.slice(warningsBefore)).toContainEqual(
          ["[Flags] storing flags failed", quota],
        );
      });
      expect(client.getFlagStateVersion()).toBe(2);
      expect(client.getFlags().flagA.value).toBe(false);
    },
  );

  test("does not replay a suppressed metadata-only update", async () => {
    const { client } = setup();
    await client.initialize();
    client.setFlagOverride("flagA", false);
    const updated = vi.fn();
    client.onUpdated(updated);
    const metadata = (userOptedIn: boolean) => ({
      flagA: {
        ...selectedFlag(true),
        optInEnabled: true,
        optIn: {
          name: "Try",
          description: null,
          userOptedIn,
          companyOptedIn: false,
          isOptedIn: userOptedIn,
        },
      },
    });
    client.setFetchedFlags(metadata(true), false, 2);
    client.updateFlags();
    expect(updated).not.toHaveBeenCalled();
    client.setFetchedFlags(metadata(false), true, 3);
    expect(updated).toHaveBeenCalledOnce();
    expect(client.getOptInMetadata().flagA.userOptedIn).toBe(false);
    expect(client.getFlags().flagA.value).toBe(false);
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
