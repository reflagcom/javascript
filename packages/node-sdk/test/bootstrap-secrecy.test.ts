import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fallbackProviders,
  ReflagClient,
  type ClientOptions,
  type FlagAPIResponse,
  type FlagsFallbackSnapshot,
  type HttpClient,
  type HttpClientResponse,
} from "../src";

const clients: ReflagClient[] = [];
const context = { company: { id: "acme" }, enableTracking: false };
const privatePayload = "SERVER_ONLY_PAYLOAD";

function definition(
  key: string,
  secret: boolean,
): FlagAPIResponse & { secret: boolean } {
  return {
    key,
    secret,
    description: null,
    targeting: {
      version: 1,
      rules: [{ filter: { type: "constant", value: true } }],
    },
    config: {
      version: 1,
      variants: [
        {
          key: "chosen",
          payload: key === "public" ? { enabled: true } : privatePayload,
          filter: { type: "constant", value: true },
        },
      ],
    },
  };
}
function definitions() {
  return [definition("public", false), definition("private", true)];
}
function response(features = definitions(), flagStateVersion = 1) {
  return {
    status: 200,
    ok: true,
    etag: '"flags"',
    body: { success: true, flagStateVersion, features },
  };
}
function harness(options: ClientOptions = {}) {
  const state: { response: HttpClientResponse<unknown> } = {
    response: response(),
  };
  const get = vi.fn(async () => state.response);
  const post = vi.fn(async () => ({
    status: 200,
    ok: true,
    body: { success: true },
  }));
  const client = new ReflagClient({
    secretKey: "syntheticSecretKeyWithMoreThan22Chars",
    offline: false,
    flagsSyncMode: "in-request",
    flagsFetchRetries: 0,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    batchOptions: { intervalMs: 1e9, flushOnExit: false },
    httpClient: { get, post } as unknown as HttpClient,
    ...options,
  });
  clients.push(client);
  return { client, state, get, post };
}
async function refresh(client: ReflagClient) {
  await vi.advanceTimersByTimeAsync(1001);
  await client.refreshFlags();
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
  vi.useRealTimers();
});

describe("v1 bootstrap visibility boundary", () => {
  it.each(["direct", "bound"])(
    "exports only public flags through %s bootstrap while retaining secret server reads",
    async (mode) => {
      const h = harness();
      await h.client.initialize();
      const bootstrap =
        mode === "direct"
          ? h.client.getFlagsForBootstrap(context)
          : h.client.bindClient(context).getFlagsForBootstrap();
      expect(Object.keys(bootstrap.flags)).toEqual(["public"]);
      expect(bootstrap).toMatchObject({
        flagStateVersion: 1,
        context: { company: { id: "acme" } },
        flags: {
          public: {
            key: "public",
            isEnabled: true,
            targetingVersion: 1,
            config: {
              key: "chosen",
              payload: { enabled: true },
              targetingVersion: 1,
            },
          },
        },
      });
      expect(JSON.stringify(bootstrap)).not.toContain("private");
      expect(JSON.stringify(bootstrap)).not.toContain(privatePayload);
      await h.client.flush();
      expect(h.post).not.toHaveBeenCalled();
      expect(h.client.getFlag(context, "private").config.payload).toBe(
        privatePayload,
      );
      expect(h.client.getFlagDefinitions()).toContainEqual(
        expect.objectContaining({ key: "private", secret: true }),
      );
      bootstrap.flags.public!.config!.payload.enabled = false;
      expect(
        h.client.getFlagsForBootstrap(context).flags.public!.config!.payload,
      ).toEqual({ enabled: true });
    },
  );

  it.each([undefined, null, "false", 0, {}, true])(
    "does not treat visibility %j as explicitly public",
    async (secret) => {
      const flags = definitions();
      Reflect.deleteProperty(flags[0]!, "secret");
      if (secret !== undefined) Reflect.set(flags[0]!, "secret", secret);
      const h = harness();
      h.state.response = response(flags);
      await h.client.initialize();
      expect(h.client.getFlag(context, "public").isEnabled).toBe(true);
      expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
    },
  );

  it("does not let base or temporary overrides authorize secret or unknown keys", async () => {
    const h = harness({
      flagOverrides: () => ({ public: false, private: true, unknown: true }),
    });
    await h.client.initialize();
    const pop = h.client.pushFlagOverrides({
      public: {
        isEnabled: true,
        config: { key: "local", payload: { local: true } },
      },
      extra: true,
    });
    expect(h.client.getFlagsForBootstrap(context).flags).toEqual({
      public: {
        key: "public",
        isEnabled: true,
        config: { key: "local", payload: { local: true } },
      },
    });
    pop();
    expect(h.client.getFlagsForBootstrap(context).flags).toEqual({
      public: { key: "public", isEnabled: false, config: undefined },
    });
    expect(h.client.getFlag(context, "unknown").isEnabled).toBe(true);
  });

  it.each(["offline", "unavailable", "static"])(
    "excludes value-only %s fallbacks without visibility",
    async (mode) => {
      const h = harness({
        offline: mode === "offline",
        fallbackFlags: ["fallback"],
        flagOverrides: { override: true },
        ...(mode === "static"
          ? {
              flagsFallbackProvider: fallbackProviders.static({
                flags: { fallback: true },
              }),
            }
          : {}),
      });
      h.state.response = { status: 503, ok: false, body: undefined };
      expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
      await h.client.initialize();
      expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
      if (mode !== "offline")
        expect(h.client.getFlag(context, "fallback").isEnabled).toBe(true);
    },
  );

  it("owns visibility and values independently of response and definition copies", async () => {
    const flags = definitions();
    const h = harness();
    h.state.response = response(flags);
    await h.client.initialize();
    flags[1]!.secret = false;
    const copy = h.client.getFlagDefinitions();
    Reflect.set(copy[1]!, "secret", false);
    expect(Object.keys(h.client.getFlagsForBootstrap(context).flags)).toEqual([
      "public",
    ]);
    expect(h.client.getFlagDefinitions()[0]).toHaveProperty("secret", false);
  });

  it("retains visibility through 304, visibility-only refreshes, and stale responses", async () => {
    const h = harness();
    await h.client.initialize();
    h.state.response = { status: 304, ok: false, body: undefined };
    await refresh(h.client);
    expect(Object.keys(h.client.getFlagsForBootstrap(context).flags)).toEqual([
      "public",
    ]);
    const flags = definitions();
    flags[0]!.secret = true;
    h.state.response = response(flags);
    await refresh(h.client);
    expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
    h.state.response = response(flags, 2);
    await refresh(h.client);
    h.state.response = response();
    await refresh(h.client);
    expect(h.client.getFlagsForBootstrap(context)).toMatchObject({
      flagStateVersion: 2,
      flags: {},
    });
  });

  it("owns visibility while fallback saves wait behind an earlier write", async () => {
    let finishFirstSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve;
    });
    let saves = 0;
    let saved: FlagsFallbackSnapshot | undefined;
    const provider = {
      load: vi.fn(async () => saved),
      save: vi.fn(async (_context: unknown, next: FlagsFallbackSnapshot) => {
        if (++saves === 1) await pendingSave;
        saved = JSON.parse(JSON.stringify(next)) as FlagsFallbackSnapshot;
      }),
    };
    const h = harness({ flagsFallbackProvider: provider });
    await h.client.initialize();
    const next = definitions();
    h.state.response = response(next, 2);
    await refresh(h.client);
    expect(provider.save).toHaveBeenCalledTimes(1);
    next[1]!.secret = false;
    finishFirstSave();
    await h.client.flush();
    expect(provider.save).toHaveBeenCalledTimes(2);
    expect(saved!.flags).toEqual(definitions());
    const fallback = harness({ flagsFallbackProvider: provider });
    fallback.state.response = { status: 503, ok: false, body: undefined };
    await fallback.client.initialize();
    expect(
      Object.keys(fallback.client.getFlagsForBootstrap(context).flags),
    ).toEqual(["public"]);
  });

  it("persists owned visibility and rejects bootstrap from older snapshots without it", async () => {
    let saved: FlagsFallbackSnapshot | undefined;
    const provider = {
      load: vi.fn(async () => saved),
      save: vi.fn(async (_context: unknown, next: FlagsFallbackSnapshot) => {
        saved = JSON.parse(JSON.stringify(next)) as FlagsFallbackSnapshot;
      }),
    };
    const flags = definitions();
    const live = harness({ flagsFallbackProvider: provider });
    live.state.response = response(flags);
    await live.client.initialize();
    // Mutating an HTTP response must not change the queued fallback snapshot.
    flags[1]!.secret = false;
    await live.client.flush();
    expect(saved!.flags).toEqual(definitions());
    const fallback = harness({ flagsFallbackProvider: provider });
    fallback.state.response = { status: 503, ok: false, body: undefined };
    await fallback.client.initialize();
    expect(
      Object.keys(fallback.client.getFlagsForBootstrap(context).flags),
    ).toEqual(["public"]);
    expect(fallback.client.getFlag(context, "private").config.payload).toBe(
      privatePayload,
    );
    for (const flag of saved!.flags) Reflect.deleteProperty(flag, "secret");
    const legacy = harness({ flagsFallbackProvider: provider });
    legacy.state.response = { status: 503, ok: false, body: undefined };
    await legacy.client.initialize();
    expect(legacy.client.getFlag(context, "public").isEnabled).toBe(true);
    expect(legacy.client.getFlagsForBootstrap(context).flags).toEqual({});
  });
});
