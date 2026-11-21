import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fallbackProviders,
  ReflagClient,
  type ClientOptions,
  type FlagsFallbackSnapshot,
  type HttpClient,
  type HttpClientResponse,
} from "../src";
import { definition, snapshot } from "./fixtures";

const clients: ReflagClient[] = [];
const context = { company: { id: "acme" }, enableTracking: false };
const privatePayload = "SERVER_ONLY_PAYLOAD";

function privateGraph() {
  const dependency = {
    ...definition("private-dependency", privatePayload, "off"),
    secret: true,
  };
  dependency.variants.on = privatePayload;
  dependency.rules.unshift(
    {
      id: "private-missing-context",
      filter: {
        type: "context",
        field: "user.plan",
        operator: "IS",
        values: ["pro"],
      },
      result: { type: "variant", variantKey: "on" },
    },
    {
      id: "private-grant",
      filter: {
        type: "context",
        field: "company.id",
        operator: "IS",
        values: ["acme"],
      },
      result: { type: "variant", variantKey: "on" },
    },
  );
  const root = { ...definition("public", false, "off"), secret: false };
  root.variants.on = true;
  root.rules.unshift({
    id: "public-target",
    filter: { type: "segment", key: "private-segment" },
    result: { type: "variant", variantKey: "on" },
  });
  return snapshot(
    [root, dependency],
    [
      {
        key: "private-segment",
        filter: { type: "flag", key: dependency.key, variantKey: "on" },
      },
    ],
  );
}

function harness(body: unknown = privateGraph(), options: ClientOptions = {}) {
  const state: { response: HttpClientResponse<unknown> } = {
    response: {
      status: 200,
      ok: true,
      body: { success: true, ...(body as object) },
      etag: '"initial"',
    },
  };
  const post = vi.fn(async () => ({ status: 200, ok: true, body: {} }));
  const get = vi.fn(async () => state.response);
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

describe("bootstrap visibility boundary", () => {
  it.each(["direct", "bound"])(
    "exports only public roots through %s bootstrap, retaining private dependencies on the server",
    async (mode) => {
      const h = harness();
      await h.client.initialize();
      const bootstrap =
        mode === "direct"
          ? h.client.getFlagsForBootstrap(context)
          : h.client.bindClient(context).getFlagsForBootstrap();
      expect(Object.keys(bootstrap.flags)).toEqual(["public"]);
      expect(bootstrap).toMatchObject({
        protocolVersion: 2,
        flagStateVersion: 1,
        context: { company: { id: "acme" } },
        flags: {
          public: {
            value: true,
            resolved: true,
            variantKey: "on",
            sourceVersionId: "version:public",
            matchedRuleId: "public-target",
            ruleResults: [{ ruleId: "public-target", matched: true }],
            errors: [{ code: "MISSING_CONTEXT_FIELD", field: "user.plan" }],
          },
        },
      });
      const serialized = JSON.stringify(bootstrap);
      for (const privateData of [
        privatePayload,
        "private-dependency",
        "private-segment",
      ])
        expect(serialized).not.toContain(privateData);
      expect(bootstrap.flags.public!.errors[0]).not.toHaveProperty("source");
      await h.client.flush();
      expect(h.post).not.toHaveBeenCalled();
      expect(h.client.getFlags(context)).toEqual({
        public: true,
        "private-dependency": privatePayload,
      });
      expect(h.client.getFlag(context, "private-dependency", null)).toBe(
        privatePayload,
      );
      expect(h.client.getFlagDefinitions().flags).toContainEqual(
        expect.objectContaining({ key: "private-dependency", secret: true }),
      );
      bootstrap.flags.public!.value = false;
      bootstrap.flags.public!.errors.length = 0;
      expect(h.client.getFlagsForBootstrap(context).flags.public).toMatchObject(
        {
          value: true,
          errors: [{ code: "MISSING_CONTEXT_FIELD" }],
        },
      );
    },
  );

  it.each([undefined, null, "false", 0, {}, true])(
    "does not treat visibility %j as an explicit public declaration",
    async (secret) => {
      const flag = definition("unknown", privatePayload);
      Reflect.deleteProperty(flag, "secret");
      if (secret !== undefined) Reflect.set(flag, "secret", secret);
      const h = harness(
        snapshot([{ ...definition("public", false), secret: false }, flag]),
      );
      await h.client.initialize();
      expect(h.client.getFlag(context, "unknown", null)).toBe(privatePayload);
      expect(Object.keys(h.client.getFlagsForBootstrap(context).flags)).toEqual(
        ["public"],
      );
    },
  );

  it("does not let base or temporary overrides publish secret or unknown keys", async () => {
    const h = harness(privateGraph(), {
      flagOverrides: () => ({
        public: null,
        "private-dependency": "PRIVATE_OVERRIDE",
        unknown: "UNKNOWN_OVERRIDE",
      }),
    });
    await h.client.initialize();
    const pop = h.client.pushFlagOverrides({
      public: { nested: [false] },
      extra: "EXTRA_OVERRIDE",
    });
    const bootstrap = h.client.getFlagsForBootstrap(context);
    expect(bootstrap.flags).toEqual({
      public: {
        flagKey: "public",
        value: { nested: [false] },
        resolved: false,
        ruleResults: [],
        errors: [],
      },
    });
    pop();
    expect(
      h.client.getFlagsForBootstrap(context).flags.public!.value,
    ).toBeNull();
    expect(h.client.getFlags(context)).toMatchObject({
      "private-dependency": "PRIVATE_OVERRIDE",
      unknown: "UNKNOWN_OVERRIDE",
    });
  });

  it.each(["offline", "unavailable", "static"])(
    "does not publish value-only %s fallbacks or overrides without visibility",
    async (mode) => {
      const h = harness(undefined, {
        offline: mode === "offline",
        fallbackFlags: { fallback: privatePayload },
        flagOverrides: { override: privatePayload },
        ...(mode === "static"
          ? {
              flagsFallbackProvider: fallbackProviders.static({
                flags: { fallback: privatePayload },
              }),
            }
          : {}),
      });
      h.state.response = { status: 503, ok: false, body: undefined };
      expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
      await h.client.initialize();
      expect(h.client.getFlags(context)).toMatchObject({
        fallback: privatePayload,
        override: privatePayload,
      });
      expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
    },
  );

  it("keeps visibility with its snapshot through 304s, visibility-only refreshes and stale responses", async () => {
    const h = harness();
    await h.client.initialize();
    expect(Object.keys(h.client.getFlagsForBootstrap(context).flags)).toEqual([
      "public",
    ]);
    h.state.response = { status: 304, ok: false, body: undefined };
    await refresh(h.client);
    expect(Object.keys(h.client.getFlagsForBootstrap(context).flags)).toEqual([
      "public",
    ]);
    const changed = privateGraph();
    Reflect.set(changed.flags[0]!, "secret", true);
    // Visibility is transport metadata: even the same authored versions/values must replace it.
    h.state.response = {
      status: 200,
      ok: true,
      body: { success: true, ...changed },
      etag: '"visibility-only"',
    };
    await refresh(h.client);
    expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
    h.state.response.body = { success: true, ...changed, flagStateVersion: 2 };
    await refresh(h.client);
    h.state.response = {
      status: 200,
      ok: true,
      body: { success: true, ...privateGraph() },
    };
    await refresh(h.client);
    expect(h.client.getFlagsForBootstrap(context)).toMatchObject({
      flagStateVersion: 2,
      flags: {},
    });
    h.state.response = { status: 304, ok: false, body: undefined };
    await refresh(h.client);
    expect(h.client.getFlagsForBootstrap(context).flags).toEqual({});
  });

  it("owns visibility independently of HTTP responses, definition copies and bootstrap results", async () => {
    const response = privateGraph();
    const h = harness(response);
    await h.client.initialize();
    Reflect.set(response.flags[1]!, "secret", false);
    const definitions = h.client.getFlagDefinitions();
    Reflect.set(definitions.flags[1]!, "secret", false);
    expect(Object.keys(h.client.getFlagsForBootstrap(context).flags)).toEqual([
      "public",
    ]);
    expect(h.client.getFlagDefinitions().flags[0]).toHaveProperty(
      "secret",
      false,
    );
  });

  it("persists visibility and restores safe bootstrap without pruning the private evaluation graph", async () => {
    let saved: FlagsFallbackSnapshot | undefined;
    const provider = {
      load: vi.fn(async () => saved),
      save: vi.fn(async (_context: unknown, next: FlagsFallbackSnapshot) => {
        saved = JSON.parse(JSON.stringify(next)) as FlagsFallbackSnapshot;
      }),
    };
    const live = harness(privateGraph(), { flagsFallbackProvider: provider });
    await live.client.initialize();
    await live.client.flush();
    expect(saved!.flags).toEqual(privateGraph().flags);
    const fallback = harness(undefined, { flagsFallbackProvider: provider });
    fallback.state.response = { status: 503, ok: false, body: undefined };
    await fallback.client.initialize();
    expect(
      Object.keys(fallback.client.getFlagsForBootstrap(context).flags),
    ).toEqual(["public"]);
    expect(
      fallback.client.getFlagsForBootstrap(context).flags.public!.value,
    ).toBe(true);
    expect(fallback.client.getFlag(context, "private-dependency", null)).toBe(
      privatePayload,
    );
    // Older snapshots remain useful for server evaluation, but cannot authorize client exports.
    for (const flag of saved!.flags) Reflect.deleteProperty(flag, "secret");
    const legacy = harness(undefined, { flagsFallbackProvider: provider });
    legacy.state.response = { status: 503, ok: false, body: undefined };
    await legacy.client.initialize();
    expect(legacy.client.getFlag(context, "public")).toBe(true);
    expect(legacy.client.getFlagsForBootstrap(context).flags).toEqual({});
  });
});
