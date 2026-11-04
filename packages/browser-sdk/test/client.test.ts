import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { BulkEvent } from "../src/bulkQueue";
import { BootstrappedState, ReflagClient } from "../src/client";
import { RawFlags } from "../src/flag/flags";
import { flagResponse, selectedFlag } from "./mocks/handlers";
import { server } from "./mocks/server";
import { testLogger } from "./testLogger";

let clients: ReflagClient[];
let delivered: BulkEvent[];
beforeEach(() => {
  clients = [];
  delivered = [];
  server.use(
    http.post("https://front.reflag.com/bulk", async ({ request }) => {
      delivered.push(...((await request.json()) as BulkEvent[]));
      return HttpResponse.json({ success: true });
    }),
  );
});
afterEach(async () => {
  await Promise.all(clients.map((client) => client.stop()));
});
function create(
  options: Partial<ConstructorParameters<typeof ReflagClient>[0]> = {},
) {
  const client = new ReflagClient({
    publishableKey: "pk",
    user: { id: "alice" },
    company: { id: "acme" },
    toolbar: false,
    feedback: { enableAutoFeedback: false },
    trackingQueue: { flushDelayMs: 60000 },
    logger: testLogger,
    ...options,
  });
  clients.push(client);
  return client;
}
function bootstrap(flags: RawFlags, flagStateVersion = 1): BootstrappedState {
  return {
    protocolVersion: 2,
    context: { user: { id: "alice" }, company: { id: "acme" } },
    flags,
    flagStateVersion,
  };
}
function checks() {
  return delivered.filter((event) => event.type === "feature-flag-event");
}

describe("direct values and root checks", () => {
  test("registers an ignored root read immediately, but diagnostics/bootstrap register none; delivery stays buffered", async () => {
    const client = create();
    const check = vi.fn();
    client.on("check", check);
    await client.initialize();
    client.getFlagResults();
    client.getFlagsForBootstrap();
    expect(check).not.toHaveBeenCalled();
    client.getFlag("flagA");
    expect(check).toHaveBeenCalledTimes(1);
    expect(delivered).toEqual([]);
    await client.stop();
    expect(checks()).toEqual([
      expect.objectContaining({
        action: "check",
        key: "flagA",
        evalResult: "true",
        sourceVersionId: "version-1",
        flagStateVersion: 1,
        evalContext: {
          user: { id: "alice" },
          company: { id: "acme" },
          other: {},
        },
      }),
    ]);
    expect(checks()[0]).not.toHaveProperty("value");
  });

  test("bare reads cannot return truthy objects, and mismatches do not leak payloads or fabricate selections", async () => {
    const warn = vi.fn();
    const client = create({
      logger: { ...testLogger, warn },
      bootstrappedState: bootstrap({
        settings: selectedFlag({ secret: "private-payload" }, "quality"),
      }),
    });
    expect(client.getFlag("settings")).toBe(false);
    expect(client.getFlag("settings", { model: "default" })).toEqual({
      secret: "private-payload",
    }); // Top-level category, not schema validation.
    await client.stop();
    expect(checks()[0]).not.toHaveProperty("sourceVersionId");
    expect(checks()[0]).not.toHaveProperty("evalResult");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("expected boolean"),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-payload");
  });

  test("preserves selected falsy JSON and distinguishes authored false from the identical caller default", async () => {
    const flags = Object.fromEntries(
      [false, 0, "", null].map((value, index) => [
        String(index),
        selectedFlag(value, `variant-${index}`),
      ]),
    );
    const client = create({ bootstrappedState: bootstrap(flags) });
    for (const [key, flag] of Object.entries(flags))
      expect(client.getFlag(key, null)).toEqual(flag.value);
    expect(client.getFlag("missing")).toBe(false);
    await client.stop();
    expect(checks().map((event) => event.evalResult)).toEqual([
      "variant-0",
      "variant-1",
      "variant-2",
      "variant-3",
      undefined,
    ]);
    expect(checks()[4]).not.toHaveProperty("sourceVersionId");
  });

  test("clones selected values, defaults, diagnostics and input snapshots", () => {
    const state = bootstrap({
      settings: selectedFlag({ nested: [1] }, "quality"),
    });
    const client = create({ bootstrappedState: state });
    (state.flags.settings.value as { nested: number[] }).nested.push(2);
    const selected = client.getFlag("settings", { nested: [] as number[] });
    selected.nested.push(3);
    expect(client.getFlag("settings", null)).toEqual({ nested: [1] });
    const fallback = { nested: [4] } as const;
    const result = client.getFlag("missing", fallback);
    result.nested.push(5);
    expect(fallback.nested).toEqual([4]);
    client.getFlagResults().settings.value = false;
    expect(client.getFlag("settings", null)).toEqual({ nested: [1] });
  });

  test("enforces top-level categories, including null/object and array/object mismatches", async () => {
    const client = create({
      bootstrappedState: bootstrap({
        nullable: selectedFlag(null),
        array: selectedFlag([]),
      }),
    });
    expect(client.getFlag("nullable", {})).toEqual({});
    expect(client.getFlag("array", {})).toEqual({});
    await client.stop();
    expect(
      checks().every(
        (event) =>
          event.evalResult === undefined && event.sourceVersionId === undefined,
      ),
    ).toBe(true);
  });

  test("rejects invalid JSON defaults before registering a read", () => {
    const client = create();
    const check = vi.fn();
    client.on("check", check);
    expect(() =>
      client.getFlag("settings", { invalid: undefined } as any),
    ).toThrow("JSON value");
    const cycle: any = {};
    cycle.self = cycle;
    expect(() => client.getFlag("settings", cycle)).toThrow("JSON value");
    expect(check).not.toHaveBeenCalled();
  });

  test("batch reads return raw JSON and check only returned roots", async () => {
    const client = create({
      bootstrappedState: bootstrap({
        release: selectedFlag(true),
        settings: selectedFlag({ model: "quality" }, "quality"),
      }),
    });
    expect(client.getFlags()).toEqual({
      release: true,
      settings: { model: "quality" },
    });
    await client.stop();
    expect(checks().map((event) => event.key)).toEqual(["release", "settings"]);
  });

  test("rate limits by context, selected key, source and snapshot, not payload equality", async () => {
    const client = create({
      bootstrappedState: bootstrap({
        flag: selectedFlag("same", "first", "source-1"),
      }),
    });
    client.getFlag("flag", null);
    client.getFlag("flag", null);
    client.applyBootstrappedState(
      bootstrap({ flag: selectedFlag("same", "second", "source-1") }),
    );
    client.getFlag("flag", null);
    client.applyBootstrappedState(
      bootstrap({ flag: selectedFlag("same", "second", "source-2") }),
    );
    client.getFlag("flag", null);
    client.applyBootstrappedState(
      bootstrap({ flag: selectedFlag("same", "second", "source-2") }, 2),
    );
    client.getFlag("flag", null);
    client.applyBootstrappedState({
      ...bootstrap({ flag: selectedFlag("same", "second", "source-2") }, 2),
      context: { user: { id: "bob" } },
    });
    client.getFlag("flag", null);
    await client.stop();
    expect(checks()).toHaveLength(5);
    expect(checks().map((event) => event.evalResult)).toEqual([
      "first",
      "second",
      "second",
      "second",
      "second",
    ]);
    expect(checks()[0].evalContext).toMatchObject({ user: { id: "alice" } });
    expect(checks()[4].evalContext).toMatchObject({ user: { id: "bob" } });
  });

  test("overrides support null and clear with undefined, without changing the authored snapshot or inventing provenance", async () => {
    const client = create({
      bootstrappedState: bootstrap({ flag: selectedFlag(true) }),
    });
    client.setFlagOverride("flag", null);
    expect(client.getFlag("flag", null)).toBeNull();
    client.setFlagOverride("flag", undefined);
    expect(client.getFlag("flag")).toBe(true);
    await client.stop();
    expect(checks()[0]).not.toHaveProperty("sourceVersionId");
    expect(checks()[1]).toMatchObject({
      evalResult: "true",
      sourceVersionId: "version-1",
    });
  });

  test("offline uses direct static fallbacks without fetching or tracking", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const client = create({
      offline: true,
      fallbackFlags: { release: true, settings: { model: "offline" } },
    });
    await client.initialize();
    expect(client.getFlag("release")).toBe(true);
    expect(client.getFlag("settings", null)).toEqual({ model: "offline" });
    await client.stop();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("disabled tracking never falls back to direct check HTTP", async () => {
    const client = create({ enableTracking: false });
    const check = vi.fn();
    client.on("check", check);
    await client.initialize();
    client.getFlag("flagA");
    await client.stop();
    expect(check).not.toHaveBeenCalled();
    expect(delivered).toEqual([]);
  });
});

describe("bootstrap and opt-in boundaries", () => {
  test("rejects legacy bootstrap and invalid replacements before changing context or accepted flags", () => {
    expect(() =>
      create({
        bootstrappedState: {
          context: {},
          flags: { flag: { isEnabled: true } },
        } as any,
      }),
    ).toThrow("protocol-v2");
    const client = create({
      bootstrappedState: bootstrap({ flag: selectedFlag(true) }, 5),
    });
    expect(() =>
      client.applyBootstrappedState({
        protocolVersion: 2,
        context: { user: { id: "bob" } },
        flags: { broken: {} },
      } as any),
    ).toThrow("protocol-v2");
    expect(client.getContext().user?.id).toBe("alice");
    client.applyBootstrappedState(
      bootstrap({ flag: selectedFlag(false, "false") }, 4),
    );
    expect(client.getFlag("flag")).toBe(true);
  });

  test("restores genuine v2 selections but accepts unselected Node fallback entries without provenance", async () => {
    const client = create({
      bootstrappedState: bootstrap({
        live: selectedFlag(false, "false"),
        fallback: {
          value: { model: "static" },
          resolved: false,
          ruleResults: [],
          errors: [],
        },
        missing: {
          value: undefined,
          resolved: false,
          ruleResults: [],
          errors: [],
        },
      }),
    });
    await client.initialize();
    expect(client.getFlag("live")).toBe(false);
    expect(client.getFlag("fallback", null)).toEqual({ model: "static" });
    expect(client.getFlag("missing")).toBe(false);
    await client.stop();
    expect(checks()[0]).toMatchObject({
      evalResult: "false",
      sourceVersionId: "version-1",
    });
    expect(
      checks()
        .slice(1)
        .every(
          (event) =>
            event.sourceVersionId === undefined &&
            event.evalResult === undefined,
        ),
    ).toBe(true);
  });

  test("fetches missing bootstrap opt-in metadata from v2 without replacing server-derived values", async () => {
    let metadataRequests = 0;
    server.use(
      http.get("https://front.reflag.com/flags/evaluated", ({ request }) => {
        metadataRequests++;
        expect(new URL(request.url).searchParams.get("waitForVersion")).toBe(
          "1",
        );
        return HttpResponse.json({
          ...flagResponse,
          flags: {
            flagA: {
              ...selectedFlag(false, "false", "browser-version"),
              optInEnabled: true,
              optIn: {
                name: "Try it",
                description: null,
                userOptedIn: true,
                companyOptedIn: false,
                isOptedIn: true,
              },
            },
          },
        });
      }),
    );
    const client = create({
      bootstrappedState: bootstrap({ flagA: selectedFlag(true) }),
    });
    await client.initialize();
    expect(metadataRequests).toBe(0);
    expect(client.getOptInFlags()).toEqual([]);
    await vi.waitFor(() => expect(client.getIsLoadingOptInFlags()).toBe(false));
    expect(client.getOptInFlags()).toEqual([
      {
        key: "flagA",
        name: "Try it",
        description: null,
        isEnabled: true,
        userOptedIn: true,
        companyOptedIn: false,
        isOptedIn: true,
      },
    ]);
    expect(client.getFlag("flagA")).toBe(true);
    expect(client.getFlagResults().flagA.sourceVersionId).toBe("version-1");
    expect(metadataRequests).toBe(1);
  });

  test("loads opt-in metadata with ordinary evaluation, including unavailable opt-in", async () => {
    let requests = 0;
    server.use(
      http.get("https://front.reflag.com/flags/evaluated", () => {
        requests++;
        return HttpResponse.json({
          ...flagResponse,
          flags: {
            flagA: {
              ...selectedFlag(false, "false"),
              optInEnabled: true,
              optIn: {
                name: "Try",
                description: null,
                userOptedIn: false,
                companyOptedIn: true,
                isOptedIn: true,
              },
            },
            dormant: {
              ...selectedFlag(false, "false"),
              optInEnabled: true,
              optIn: null,
            },
            disabled: {
              ...selectedFlag(false, "false"),
              optInEnabled: false,
              optIn: null,
            },
          },
        });
      }),
    );
    const client = create();
    await client.initialize();
    expect(client.getOptInFlags()).toEqual([
      {
        key: "flagA",
        name: "Try",
        description: null,
        isEnabled: false,
        userOptedIn: false,
        companyOptedIn: true,
        isOptedIn: true,
      },
    ]);
    expect(client.getIsLoadingOptInFlags()).toBe(false);
    const bootstrapped = create({
      bootstrappedState: client.getFlagsForBootstrap(),
    });
    await bootstrapped.initialize();
    expect(bootstrapped.getOptInFlags()).toEqual(client.getOptInFlags());
    expect(bootstrapped.getIsLoadingOptInFlags()).toBe(false);
    expect(requests).toBe(1);
  });

  test("confirms opt-in mutations against both versioned v2 evaluation and refreshed membership", async () => {
    let optedIn = false;
    let evaluationRequests = 0;
    server.use(
      http.post(
        "https://front.reflag.com/flags/opt-in",
        async ({ request }) => {
          expect(await request.json()).toMatchObject({
            key: "flagA",
            scope: "company",
            optedIn: true,
          });
          optedIn = true;
          return HttpResponse.json({ success: true, flagStateVersion: 2 });
        },
      ),
      http.get("https://front.reflag.com/flags/evaluated", ({ request }) => {
        evaluationRequests++;
        if (optedIn)
          expect(new URL(request.url).searchParams.get("waitForVersion")).toBe(
            "2",
          );
        return HttpResponse.json({
          ...flagResponse,
          flagStateVersion: optedIn ? 2 : 1,
          flags: {
            flagA: {
              ...selectedFlag(optedIn, String(optedIn)),
              optInEnabled: true,
              optIn: {
                name: "Try",
                description: null,
                userOptedIn: false,
                companyOptedIn: optedIn,
                isOptedIn: optedIn,
              },
            },
          },
        });
      }),
    );
    const client = create();
    await client.initialize();
    expect(
      (await client.setOptIn("flagA", { optedIn: true, scope: "company" }))?.ok,
    ).toBe(true);
    expect(client.getOptInFlags()[0].companyOptedIn).toBe(true);
    expect(client.getFlag("flagA")).toBe(true);
    expect(evaluationRequests).toBe(2);
  });

  test("fails opt-in confirmation if the refreshed server membership is missing", async () => {
    server.use(
      http.post("https://front.reflag.com/flags/opt-in", () =>
        HttpResponse.json({ success: true, flagStateVersion: 1 }),
      ),
    );
    const client = create();
    await client.initialize();
    await expect(client.setOptIn("flagA", { optedIn: true })).rejects.toThrow(
      "membership",
    );
  });
});
