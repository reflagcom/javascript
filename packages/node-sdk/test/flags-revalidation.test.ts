import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReflagClient } from "../src/client";
import { API_TIMEOUT_MS, FLAGS_REFETCH_MS } from "../src/config";
import type { ClientOptions, FlagsAPIResponse } from "../src/types";

const etag = 'W/"flags-v1"';
const notModified = { ok: false, status: 304, body: undefined };
const definitions: FlagsAPIResponse = {
  flagStateVersion: 1,
  features: [
    {
      key: "flag",
      description: null,
      targeting: {
        version: 1,
        rules: [{ filter: { type: "constant", value: true } }],
      },
    },
  ],
};

function modified(version = 1, responseETag: string | undefined = etag) {
  return {
    ok: true,
    status: 200,
    body: { success: true, ...definitions, flagStateVersion: version },
    etag: responseETag,
  };
}

const httpClient = { get: vi.fn(), post: vi.fn() };
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const clients: ReflagClient[] = [];

function createClient(options: Partial<ClientOptions> = {}) {
  const client = new ReflagClient({
    secretKey: "validSecretKeyWithMoreThan22Chars",
    apiBaseUrl: "https://api.example.com/",
    httpClient,
    logger,
    flagsSyncMode: "in-request",
    flagsFetchRetries: 0,
    offline: false,
    batchOptions: { flushOnExit: false },
    ...options,
  });
  clients.push(client);
  return client;
}

async function refresh(client: ReflagClient, waitForVersion?: number) {
  await vi.advanceTimersByTimeAsync(1001);
  await client.refreshFlags(waitForVersion);
}

function requestHeaders(call: number) {
  return httpClient.get.mock.calls[call - 1]?.[1];
}

describe("flag-definition revalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    httpClient.get.mockReset();
    httpClient.post.mockResolvedValue({
      ok: true,
      status: 200,
      body: { success: true },
    });
  });

  afterEach(() => {
    for (const client of clients.splice(0)) {
      client.destroy();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("retains compiled definitions on repeated 304s and replaces them on a changed 200", async () => {
    const provider = {
      load: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValueOnce(notModified)
      .mockResolvedValueOnce(notModified)
      .mockResolvedValueOnce({
        ...modified(2, '"flags-v2"'),
        body: {
          success: true,
          flagStateVersion: 2,
          features: [
            {
              ...definitions.features[0],
              targeting: {
                version: 2,
                rules: [{ filter: { type: "constant", value: false } }],
              },
            },
          ],
        },
      });
    const client = createClient({ flagsFallbackProvider: provider });
    await client.initialize();
    const cache = client["flagsCache"];
    const initialDefinitions = cache.get();
    const initialRefreshAt = cache.getLastRefreshAt();

    await refresh(client);
    expect(cache.get()).toBe(initialDefinitions);
    expect(cache.getFlagStateVersion()).toBe(1);
    expect(cache.getLastRefreshAt()).toBeGreaterThan(initialRefreshAt!);
    expect(cache.getETag()).toBe(etag);

    await refresh(client);
    expect(cache.get()).toBe(initialDefinitions);
    expect(provider.save).toHaveBeenCalledTimes(1);
    expect(provider.load).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(httpClient.get).toHaveBeenCalledTimes(3);
    expect(requestHeaders(1)).not.toHaveProperty("If-None-Match");
    expect(requestHeaders(2)).toEqual({
      ...requestHeaders(1),
      "If-None-Match": etag,
    });
    expect(requestHeaders(3)).toEqual(requestHeaders(2));
    expect(client["_config"].headers).not.toHaveProperty("If-None-Match");

    await refresh(client);
    expect(cache.get()).not.toBe(initialDefinitions);
    expect(cache.getFlagStateVersion()).toBe(2);
    expect(cache.getETag()).toBe('"flags-v2"');
    expect(client.getFlag({}, "flag").isEnabled).toBe(false);
    expect(provider.save).toHaveBeenCalledTimes(2);
  });

  it("leaves the ETag unset after a failed save so the next refresh naturally retries persistence", async () => {
    const error = new Error("temporary storage failure");
    const provider = {
      load: vi.fn(),
      save: vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined),
    };
    httpClient.get.mockImplementation(async (_url, headers) =>
      headers["If-None-Match"] ? notModified : modified(),
    );
    const client = createClient({ flagsFallbackProvider: provider });
    await client.initialize();

    expect(client.getFlag({}, "flag").isEnabled).toBe(true);
    expect(client["flagsCache"].getETag()).toBeUndefined();
    expect(provider.save).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "flagsFallbackProvider: failed to save flag definitions",
      error,
    );
    await refresh(client);

    expect(requestHeaders(2)).not.toHaveProperty("If-None-Match");
    expect(provider.save).toHaveBeenCalledTimes(2);
    expect(client["flagsCache"].getETag()).toBe(etag);
    await refresh(client);

    expect(requestHeaders(3)["If-None-Match"]).toBe(etag);
    expect(provider.save).toHaveBeenCalledTimes(2);
  });

  it("publishes live definitions without waiting for a pending fallback save", async () => {
    let completeSave!: () => void;
    const save = new Promise<void>((resolve) => {
      completeSave = resolve;
    });
    const provider = { load: vi.fn(), save: vi.fn().mockReturnValue(save) };
    httpClient.get.mockResolvedValue(modified());
    const client = createClient({ flagsFallbackProvider: provider });
    await client.initialize();

    expect(client.getFlag({}, "flag").isEnabled).toBe(true);
    expect(client["flagsCache"].getETag()).toBeUndefined();
    completeSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(client["flagsCache"].getETag()).toBe(etag);
  });

  it("keeps late fallback saves scoped to their original snapshots", async () => {
    let completeFirstSave!: () => void;
    let completeSecondSave!: () => void;
    const provider = {
      load: vi.fn(),
      save: vi
        .fn()
        .mockReturnValueOnce(
          new Promise<void>((resolve) => {
            completeFirstSave = resolve;
          }),
        )
        .mockReturnValueOnce(
          new Promise<void>((resolve) => {
            completeSecondSave = resolve;
          }),
        ),
    };
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValueOnce(modified(2, '"v2"'));
    const client = createClient({ flagsFallbackProvider: provider });
    await client.initialize();
    await refresh(client);

    completeFirstSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(client["flagsCache"].getFlagStateVersion()).toBe(2);
    expect(client["flagsCache"].getETag()).toBeUndefined();

    client.destroy();
    completeSecondSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(client["flagsCache"].get()).toBeUndefined();
    expect(client["flagsCache"].getETag()).toBeUndefined();
  });

  it("revalidates an empty flag snapshot", async () => {
    httpClient.get
      .mockResolvedValueOnce({
        ...modified(),
        body: { success: true, flagStateVersion: 1, features: [] },
      })
      .mockResolvedValueOnce(notModified);
    const client = createClient();
    await client.initialize();
    const snapshot = client["flagsCache"].get();
    await refresh(client);

    expect(snapshot).toEqual([]);
    expect(client["flagsCache"].get()).toBe(snapshot);
    expect(requestHeaders(2)["If-None-Match"]).toBe(etag);
  });

  it("revalidates through the default fetch transport", async () => {
    const initial = modified();
    const changed = modified(2, '"flags-v2"');
    const fetch = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initial.body), {
          headers: { ETag: etag },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(changed.body), {
          headers: { ETag: '"flags-v2"' },
        }),
      );
    const client = createClient({ httpClient: undefined });
    await client.initialize();
    const snapshot = client["flagsCache"].get();
    await refresh(client);

    expect(client["flagsCache"].get()).toBe(snapshot);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/features",
      expect.objectContaining({
        cache: "no-cache",
        headers: { ...client["_config"].headers, "If-None-Match": etag },
      }),
    );
    await refresh(client);
    expect(client["flagsCache"].getFlagStateVersion()).toBe(2);
    expect(client["flagsCache"].getETag()).toBe('"flags-v2"');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not send definition validators to evaluated flag requests", async () => {
    httpClient.get.mockResolvedValueOnce(modified()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { success: true, features: {}, remoteContextUsed: false },
    });
    const client = createClient();
    await client.initialize();
    expect(await client.getFlagsRemote()).toEqual({});

    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/features/evaluated",
      requestHeaders(1),
      API_TIMEOUT_MS,
    );
    expect(requestHeaders(2)).not.toHaveProperty("If-None-Match");
  });

  it("keeps custom clients without an ETag working", async () => {
    httpClient.get.mockResolvedValue({
      ok: true,
      status: 200,
      body: { success: true, ...definitions },
    });
    const client = createClient();
    await client.initialize();
    await refresh(client);

    expect(httpClient.get).toHaveBeenCalledTimes(2);
    expect(requestHeaders(2)).not.toHaveProperty("If-None-Match");
    expect(client.getFlag({}, "flag").isEnabled).toBe(true);
  });

  it("clears the old ETag when an accepted replacement omits it", async () => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValueOnce({ ...modified(2), etag: undefined })
      .mockResolvedValueOnce(modified(3));
    const client = createClient();
    await client.initialize();
    await refresh(client);
    expect(client["flagsCache"].getETag()).toBeUndefined();
    await refresh(client);

    expect(requestHeaders(2)["If-None-Match"]).toBe(etag);
    expect(requestHeaders(3)).not.toHaveProperty("If-None-Match");
  });

  it("does not overwrite fallback storage with a rejected older snapshot before a 304", async () => {
    const current = modified(2, '"v2"');
    const provider = {
      load: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    httpClient.get
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({
        ...modified(1, '"v1"'),
        body: { success: true, flagStateVersion: 1, features: [] },
      })
      .mockResolvedValueOnce(notModified);
    const client = createClient({ flagsFallbackProvider: provider });
    await client.initialize();
    const snapshot = client["flagsCache"].get();
    await refresh(client);
    await refresh(client);

    expect(client["flagsCache"].get()).toBe(snapshot);
    expect(client["flagsCache"].getFlagStateVersion()).toBe(2);
    expect(client["flagsCache"].getETag()).toBe('"v2"');
    expect(requestHeaders(3)["If-None-Match"]).toBe('"v2"');
    expect(provider.save).toHaveBeenCalledTimes(1);
    expect(provider.save.mock.calls[0]?.[1].flags).toEqual(
      current.body.features,
    );
  });

  it.each([
    ["an HTTP error", { ok: false, status: 500, body: { success: false } }],
    [
      "malformed definitions",
      {
        ...modified(2, '"invalid"'),
        body: { success: true, flagStateVersion: 2, features: null },
      },
    ],
    ["an older version", modified(0, '"older"')],
  ])("preserves the snapshot and ETag after %s", async (_, response) => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(notModified);
    const client = createClient();
    await client.initialize();
    const cache = client["flagsCache"];
    const snapshot = cache.get();
    const lastRefreshAt = cache.getLastRefreshAt();
    await refresh(client);

    expect(cache.get()).toBe(snapshot);
    expect(cache.getETag()).toBe(etag);
    expect(cache.getLastRefreshAt()).toBe(lastRefreshAt);
    await refresh(client);
    expect(requestHeaders(3)["If-None-Match"]).toBe(etag);
    expect(cache.get()).toBe(snapshot);
    expect(cache.getFlagStateVersion()).toBe(1);
  });

  it("preserves the validator after a network failure", async () => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce(notModified);
    const client = createClient();
    await client.initialize();
    const lastRefreshAt = client["flagsCache"].getLastRefreshAt();
    await refresh(client);
    expect(client["flagsCache"].getLastRefreshAt()).toBe(lastRefreshAt);
    await refresh(client);

    expect(requestHeaders(3)["If-None-Match"]).toBe(etag);
    expect(client.getFlag({}, "flag").isEnabled).toBe(true);
  });

  it("isolates validators between clients with different credentials", async () => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValueOnce(modified(2, '"other-environment"'))
      .mockResolvedValue(notModified);
    const first = createClient();
    const second = createClient({
      secretKey: "otherSecretKeyWithMoreThan22Chars",
    });
    await first.initialize();
    await second.initialize();
    await refresh(first);
    await second.refreshFlags();

    expect(requestHeaders(3)["If-None-Match"]).toBe(etag);
    expect(requestHeaders(4)["If-None-Match"]).toBe('"other-environment"');
    expect(requestHeaders(3).Authorization).not.toBe(
      requestHeaders(4).Authorization,
    );
    first.destroy();
    expect(first["flagsCache"].getETag()).toBeUndefined();
    expect(second["flagsCache"].getETag()).toBe('"other-environment"');
  });

  it("recovers from an unexpected cold-start 304 with one unconditional fetch", async () => {
    httpClient.get
      .mockResolvedValueOnce(notModified)
      .mockResolvedValueOnce(modified());
    const client = createClient();
    await client.initialize();

    expect(httpClient.get).toHaveBeenCalledTimes(2);
    expect(requestHeaders(1)).not.toHaveProperty("If-None-Match");
    expect(requestHeaders(2)).not.toHaveProperty("If-None-Match");
    expect(client.getFlag({}, "flag").isEnabled).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not initialize an empty cache or loop on repeated unexpected 304s", async () => {
    httpClient.get.mockResolvedValue(notModified);
    const client = createClient();
    await client.initialize();

    expect(httpClient.get).toHaveBeenCalledTimes(2);
    expect(client["flagsCache"].get()).toBeUndefined();
    expect(client["flagsCache"].getLastRefreshAt()).toBeUndefined();
  });

  it("performs only one unexpected-304 recovery across ordinary retries", async () => {
    httpClient.get.mockResolvedValue(notModified);
    const client = createClient({ flagsFetchRetries: 2 });
    const initialized = client.initialize();
    await vi.advanceTimersByTimeAsync(10000);
    await initialized;

    expect(httpClient.get).toHaveBeenCalledTimes(4);
    for (const [, headers] of httpClient.get.mock.calls) {
      expect(headers).not.toHaveProperty("If-None-Match");
    }
    expect(client["flagsCache"].get()).toBeUndefined();
    expect(client["flagsCache"].getLastRefreshAt()).toBeUndefined();
  });

  it("fetches unconditionally after loading fallback definitions", async () => {
    const provider = {
      load: vi.fn().mockResolvedValue({
        version: 1,
        savedAt: "2025-12-31T00:00:00Z",
        flags: definitions.features,
      }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    httpClient.get
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        body: { success: false },
      })
      .mockResolvedValueOnce(notModified)
      .mockResolvedValueOnce(modified())
      .mockResolvedValueOnce(notModified);
    const client = createClient({ flagsFallbackProvider: provider });
    await client.initialize();
    expect(client["flagsCache"].getETag()).toBeUndefined();
    await refresh(client);

    expect(requestHeaders(2)).not.toHaveProperty("If-None-Match");
    expect(requestHeaders(3)).not.toHaveProperty("If-None-Match");
    expect(provider.save).toHaveBeenCalledTimes(1);
    await refresh(client);
    expect(requestHeaders(4)["If-None-Match"]).toBe(etag);
    expect(provider.save).toHaveBeenCalledTimes(1);
  });

  it("keeps version-targeted refreshes unconditional and uses the new validator afterward", async () => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValueOnce(modified(2, '"flags-v2"'))
      .mockResolvedValueOnce(notModified);
    const client = createClient();
    await client.initialize();
    await refresh(client, 2);

    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/features?waitForVersion=2",
      requestHeaders(1),
      API_TIMEOUT_MS,
    );
    expect(client["flagsCache"].getFlagStateVersion()).toBe(2);
    await refresh(client);
    expect(requestHeaders(3)["If-None-Match"]).toBe('"flags-v2"');
  });

  it("does not treat an unexpected 304 as reaching a requested version", async () => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValue(notModified);
    const client = createClient();
    await client.initialize();
    const lastRefreshAt = client["flagsCache"].getLastRefreshAt();
    await refresh(client, 2);

    expect(httpClient.get).toHaveBeenCalledTimes(3);
    expect(requestHeaders(2)).not.toHaveProperty("If-None-Match");
    expect(requestHeaders(3)).not.toHaveProperty("If-None-Match");
    expect(client["flagsCache"].getFlagStateVersion()).toBe(1);
    expect(client["flagsCache"].getLastRefreshAt()).toBe(lastRefreshAt);
  });

  it("revalidates on polling intervals without retrying 304s", async () => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValue(notModified);
    const client = createClient({
      flagsSyncMode: "polling",
      flagsFetchRetries: 2,
    });
    await client.initialize();
    await vi.advanceTimersByTimeAsync(FLAGS_REFETCH_MS * 2);

    expect(httpClient.get).toHaveBeenCalledTimes(3);
    expect(requestHeaders(2)["If-None-Match"]).toBe(etag);
    expect(requestHeaders(3)["If-None-Match"]).toBe(etag);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("resets in-request freshness so subsequent accesses do not immediately refresh again", async () => {
    httpClient.get
      .mockResolvedValueOnce(modified())
      .mockResolvedValue(notModified);
    const client = createClient();
    await client.initialize();
    await vi.advanceTimersByTimeAsync(FLAGS_REFETCH_MS + 1);
    client.getFlag({}, "flag");
    await client["flagsCache"].waitRefresh();
    expect(httpClient.get).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1001);
    client.getFlag({}, "flag");
    await client["flagsCache"].waitRefresh();
    expect(httpClient.get).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(FLAGS_REFETCH_MS);
    client.getFlag({}, "flag");
    await client["flagsCache"].waitRefresh();
    expect(httpClient.get).toHaveBeenCalledTimes(3);
  });
});
