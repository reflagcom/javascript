import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { version } from "../package.json";
import { FLAGS_EXPIRE_MS } from "../src/config";
import { FetchedFlag, FlagsClient, RawFlag } from "../src/flag/flags";
import { HttpClient } from "../src/httpClient";

import { flagsResult } from "./mocks/handlers";
import { newCache, TEST_STALE_MS } from "./flagCache.test";
import { testLogger } from "./testLogger";

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});

afterAll(() => {
  vi.useRealTimers();
});

function flagsClientFactory() {
  const { cache } = newCache();
  const httpClient = new HttpClient("pk", {
    baseUrl: "https://front.reflag.com",
  });

  vi.spyOn(httpClient, "get");
  vi.spyOn(httpClient, "post");

  return {
    cache,
    httpClient,
    newFlagsClient: function newFlagsClient(
      context?: Record<string, any>,
      options?: { staleWhileRevalidate?: boolean; fallbackFlags?: any },
    ) {
      return new FlagsClient(
        httpClient,
        {
          user: { id: "123" },
          company: { id: "456" },
          other: { eventId: "big-conference1" },
          ...context,
        },
        testLogger,
        {
          cache,
          ...options,
        },
      );
    },
  };
}

describe("FlagsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches flags", async () => {
    const { newFlagsClient, httpClient } = flagsClientFactory();
    const flagsClient = newFlagsClient();

    let updated = false;
    flagsClient.onUpdated(() => {
      updated = true;
    });

    await flagsClient.initialize();
    expect(flagsClient.getFlags()).toEqual(flagsResult);

    expect(updated).toBe(true);
    expect(httpClient.get).toBeCalledTimes(1);

    const calls = vi.mocked(httpClient.get).mock.calls.at(0)!;
    const { params, path, timeoutMs } = calls[0];

    const paramsObj = Object.fromEntries(new URLSearchParams(params));
    expect(paramsObj).toEqual({
      "reflag-sdk-version": "browser-sdk/" + version,
      "context.user.id": "123",
      "context.company.id": "456",
      "context.other.eventId": "big-conference1",
      publishableKey: "pk",
    });

    expect(path).toEqual("/features/evaluated");
    expect(timeoutMs).toEqual(5000);
  });

  test("warns about missing context fields", async () => {
    const { newFlagsClient } = flagsClientFactory();
    const flagsClient = newFlagsClient();

    await flagsClient.initialize();

    expect(testLogger.warn).toHaveBeenCalledTimes(1);
    expect(testLogger.warn).toHaveBeenCalledWith(
      "[Flags] flag targeting rules might not be correctly evaluated due to missing context fields.",
      {
        flagA: ["field1", "field2"],
        "flagB.config": ["field3"],
      },
    );

    vi.advanceTimersByTime(TEST_STALE_MS + 1);

    expect(testLogger.warn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * 1000);
    await flagsClient.initialize();
    expect(testLogger.warn).toHaveBeenCalledTimes(2);
  });

  test("ignores undefined context", async () => {
    const { newFlagsClient, httpClient } = flagsClientFactory();
    const flagsClient = newFlagsClient({
      user: undefined,
      company: undefined,
      other: undefined,
    });
    await flagsClient.initialize();
    expect(flagsClient.getFlags()).toEqual(flagsResult);

    expect(httpClient.get).toBeCalledTimes(1);
    const calls = vi.mocked(httpClient.get).mock.calls.at(0);
    const { params, path, timeoutMs } = calls![0];

    const paramsObj = Object.fromEntries(new URLSearchParams(params));
    expect(paramsObj).toEqual({
      "reflag-sdk-version": "browser-sdk/" + version,
      publishableKey: "pk",
    });

    expect(path).toEqual("/features/evaluated");
    expect(timeoutMs).toEqual(5000);
  });

  test("return fallback flags on failure (string list)", async () => {
    const { newFlagsClient, httpClient } = flagsClientFactory();

    vi.mocked(httpClient.get).mockRejectedValue(
      new Error("Failed to fetch flags"),
    );

    const flagsClient = newFlagsClient(undefined, {
      fallbackFlags: ["huddle"],
    });

    await flagsClient.initialize();
    expect(flagsClient.getFlags()).toStrictEqual({
      huddle: {
        isEnabled: true,
        config: undefined,
        key: "huddle",
        isEnabledOverride: null,
      },
    });
  });

  test("return fallback flags on failure (record)", async () => {
    const { newFlagsClient, httpClient } = flagsClientFactory();

    vi.mocked(httpClient.get).mockRejectedValue(
      new Error("Failed to fetch flags"),
    );
    const flagsClient = newFlagsClient(undefined, {
      fallbackFlags: {
        huddle: {
          key: "john",
          payload: { something: "else" },
        },
        zoom: true,
      },
    });

    await flagsClient.initialize();
    expect(flagsClient.getFlags()).toStrictEqual({
      huddle: {
        isEnabled: true,
        config: { key: "john", payload: { something: "else" } },
        key: "huddle",
        isEnabledOverride: null,
      },
      zoom: {
        isEnabled: true,
        config: undefined,
        key: "zoom",
        isEnabledOverride: null,
      },
    });
  });

  test("caches response", async () => {
    const { newFlagsClient, httpClient } = flagsClientFactory();

    const flagsClient1 = newFlagsClient();
    await flagsClient1.initialize();

    expect(httpClient.get).toBeCalledTimes(1);

    const flagsClient2 = newFlagsClient();
    await flagsClient2.initialize();

    const flags = flagsClient2.getFlags();

    expect(flags).toEqual(flagsResult);
    expect(httpClient.get).toBeCalledTimes(1);
  });

  test("use cache when unable to fetch flags", async () => {
    const { newFlagsClient, httpClient } = flagsClientFactory();
    const flagsClient = newFlagsClient({ staleWhileRevalidate: false });
    await flagsClient.initialize(); // cache them initially

    vi.mocked(httpClient.get).mockRejectedValue(
      new Error("Failed to fetch flags"),
    );
    expect(httpClient.get).toBeCalledTimes(1);

    vi.advanceTimersByTime(TEST_STALE_MS + 1);

    // fail this time
    await flagsClient.fetchFlags();
    expect(httpClient.get).toBeCalledTimes(2);

    const staleFlags = flagsClient.getFlags();
    expect(staleFlags).toEqual(flagsResult);
  });

  test("stale-while-revalidate should cache but start new fetch", async () => {
    const response = {
      success: true,
      features: {
        flagB: {
          isEnabled: true,
          key: "flagB",
          targetingVersion: 1,
        } satisfies FetchedFlag,
      },
    };

    const { newFlagsClient, httpClient } = flagsClientFactory();

    vi.mocked(httpClient.get).mockResolvedValue({
      status: 200,
      ok: true,
      json: function () {
        return Promise.resolve(response);
      },
    } as Response);

    const client = newFlagsClient({
      staleWhileRevalidate: true,
    });
    expect(httpClient.get).toHaveBeenCalledTimes(0);

    await client.initialize();
    expect(client.getFlags()).toEqual({
      flagB: {
        isEnabled: true,
        key: "flagB",
        targetingVersion: 1,
        isEnabledOverride: null,
      } satisfies RawFlag,
    });

    expect(httpClient.get).toHaveBeenCalledTimes(1);
    const client2 = newFlagsClient({
      staleWhileRevalidate: true,
    });

    // change the response so we can validate that we'll serve the stale cache
    vi.mocked(httpClient.get).mockResolvedValue({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          features: {
            flagA: {
              isEnabled: true,
              key: "flagA",
              targetingVersion: 1,
            },
          },
        }),
    } as Response);

    vi.advanceTimersByTime(TEST_STALE_MS + 1);

    await client2.initialize();

    // new fetch was fired in the background
    expect(httpClient.get).toHaveBeenCalledTimes(2);

    await vi.waitFor(() =>
      expect(client2.getFlags()).toEqual({
        flagA: {
          isEnabled: true,
          targetingVersion: 1,
          key: "flagA",
          isEnabledOverride: null,
        } satisfies RawFlag,
      }),
    );
  });

  test("expires cache eventually", async () => {
    // change the response so we can validate that we'll serve the stale cache
    const { newFlagsClient, httpClient } = flagsClientFactory();
    const client = newFlagsClient();
    await client.initialize();
    const a = client.getFlags();

    vi.advanceTimersByTime(FLAGS_EXPIRE_MS + 1);
    vi.mocked(httpClient.get).mockResolvedValue({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          features: {
            flagB: { isEnabled: true, key: "flagB" },
          },
        }),
    } as Response);
    const client2 = newFlagsClient();
    await client2.initialize();

    const b = client2.getFlags();

    expect(httpClient.get).toHaveBeenCalledTimes(2);
    expect(a).not.toEqual(b);
  });

  test("handled overrides", async () => {
    // change the response so we can validate that we'll serve the stale cache
    const { newFlagsClient } = flagsClientFactory();
    // localStorage.clear();
    const client = newFlagsClient();
    await client.initialize();

    let updated = false;
    client.onUpdated(() => {
      updated = true;
    });

    expect(client.getFlags().flagA.isEnabled).toBe(true);
    expect(client.getFlags().flagA.isEnabledOverride).toBe(null);

    expect(updated).toBe(false);

    client.setFlagOverride("flagA", false);

    expect(updated).toBe(true);
    expect(client.getFlags().flagA.isEnabled).toBe(true);
    expect(client.getFlags().flagA.isEnabledOverride).toBe(false);
  });

  test("handled overrides for flags not returned by API", async () => {
    // change the response so we can validate that we'll serve the stale cache
    const { newFlagsClient } = flagsClientFactory();

    // localStorage.clear();
    const client = newFlagsClient(undefined);
    await client.initialize();

    let updated = false;
    client.onUpdated(() => {
      updated = true;
    });

    expect(client.getFlags().flagB.isEnabled).toBe(true);
    expect(client.getFlags().flagB.isEnabledOverride).toBe(null);

    client.setFlagOverride("flagC", true);

    expect(updated).toBe(true);
    expect(client.getFlags().flagC).toBeUndefined();
  });
});
