import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReflagClient, type ClientOptions, type HttpClient } from "../src";
import { FLAGS_REFETCH_MS } from "../src/config";
import { graph } from "./fixtures";

const sse = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn() }));
vi.mock("../src/flag-updates-sse", () => ({ openFlagUpdatesSSE: sse.open }));
vi.mock("../src/flusher", () => ({ subscribe: vi.fn() }));
const clients: ReflagClient[] = [];
function harness(options: ClientOptions = {}) {
  const state = { response: graph() };
  const get = vi.fn(
    async (
      _url: string,
      _headers: Record<string, string>,
      _timeout: number,
    ) => ({
      ok: true,
      status: 200,
      body: { success: true, ...state.response },
    }),
  );
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const client = new ReflagClient({
    offline: false,
    secretKey: "validSecretKeyWithMoreThan22Chars",
    flagsFetchRetries: 0,
    flagsPushUrl: "https://sse.example.com/server?channels=not-authoritative",
    apiBaseUrl: "https://api.example.com/",
    httpClient: { get, post: vi.fn() } as unknown as HttpClient,
    logger,
    batchOptions: { intervalMs: 1e9, flushOnExit: false },
    ...options,
  });
  clients.push(client);
  return { client, state, get };
}
beforeEach(() => {
  vi.useFakeTimers();
  sse.open.mockReset();
  sse.close.mockReset();
  sse.open.mockImplementation(() => ({
    ready: Promise.resolve(),
    close: sse.close,
  }));
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.destroy());
  vi.useRealTimers();
});

describe("collection sync wiring", () => {
  it("uses authenticated push by default and refreshes the complete graph for a notified version", async () => {
    const h = harness();
    await h.client.initialize();
    expect(sse.open).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://sse.example.com/server",
        headers: expect.objectContaining({
          Authorization: "Bearer validSecretKeyWithMoreThan22Chars",
        }),
      }),
    );
    h.state.response.flagStateVersion = 2;
    h.state.response.segments[0].filter = { type: "constant", value: false };
    await vi.advanceTimersByTimeAsync(1001);
    sse.open.mock.calls[0][0].onFlagStateVersion(2);
    await h.client.flush();
    expect(h.get).toHaveBeenLastCalledWith(
      "https://api.example.com/flags?waitForVersion=2",
      expect.anything(),
      expect.any(Number),
    );
    expect(
      h.client.getFlags({
        company: { id: "acme", plan: "enterprise" },
        enableTracking: false,
      }),
    ).toEqual({ model: "quick", dependent: false });
    h.client.destroy();
    expect(sse.close).toHaveBeenCalledOnce();
  });
  it("polls complete snapshots without opening SSE", async () => {
    const h = harness({ flagsSyncMode: "polling" });
    await h.client.initialize();
    h.state.response = {
      ...graph(),
      flags: [],
      segments: [],
      flagStateVersion: 2,
    };
    await vi.advanceTimersByTimeAsync(FLAGS_REFETCH_MS);
    await h.client.flush();
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(sse.open).not.toHaveBeenCalled();
    expect(h.client.getFlagDefinitions()).toEqual({ flags: [], segments: [] });
  });
  it("refreshes stale state on access in request-driven mode", async () => {
    const h = harness({ flagsSyncMode: "in-request" });
    await h.client.initialize();
    h.state.response = {
      ...graph(),
      flags: [],
      segments: [],
      flagStateVersion: 2,
    };
    await vi.advanceTimersByTimeAsync(FLAGS_REFETCH_MS + 1);
    h.client.getFlags({ enableTracking: false });
    await h.client.flush();
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(sse.open).not.toHaveBeenCalled();
    expect(h.client.getFlags({ enableTracking: false })).toEqual({});
  });
  it.each(["periodically-update", "in-request"] as const)(
    "preserves deprecated cache strategy %s",
    async (cacheStrategy) => {
      const h = harness({ cacheStrategy });
      await h.client.initialize();
      expect(sse.open).not.toHaveBeenCalled();
    },
  );
});

describe("v2 option validation", () => {
  it.each([
    { flagsFetchRetries: -1 },
    { fetchTimeoutMs: 1.5 },
    { flagsSyncMode: "invalid" },
    { flagsPushUrl: "" },
    { flagsPushUrl: "not a URL" },
    { secretKey: 123 },
    { flagOverrides: { flag: undefined } },
    { flagOverrides: null },
    { fallbackFlags: { flag: NaN } },
    { flagsFallbackProvider: { load: () => undefined } },
    { logger: "not a logger" },
    { httpClient: false },
  ])("rejects invalid options %#", (options) => {
    expect(
      () =>
        new ReflagClient({
          offline: true,
          ...options,
        } as unknown as ClientOptions),
    ).toThrow();
  });
});
