import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { InitOptions, ReflagClient } from "../src/client";
import { FlagsClient, RawFlags } from "../src/flag/flags";
import { flagValueChanged } from "../src/flag/flagValueChanged";
import { testLogger } from "./testLogger";

function initialFlags(): RawFlags {
  return {
    flagA: {
      key: "flagA",
      isEnabled: true,
      targetingVersion: 1,
      config: {
        key: "default",
        payload: { nested: { limit: 10 }, items: [1, 2] },
        version: 1,
      },
    },
    flagB: { key: "flagB", isEnabled: false, targetingVersion: 1 },
  };
}

const clients: ReflagClient[] = [];

function newClient(flags?: RawFlags, options: Partial<InitOptions> = {}) {
  const client = new ReflagClient({
    publishableKey: "test-key-flag-updated",
    user: { id: "user1" },
    bootstrappedFlags: flags,
    offline: flags !== undefined,
    enableTracking: false,
    enableLiveFlagUpdates: false,
    toolbar: false,
    feedback: { enableAutoFeedback: false },
    logger: testLogger,
    ...options,
  });
  clients.push(client);
  return client;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()));
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("flagValueChanged", () => {
  test("ignores metadata and object key order for equal config payloads", () => {
    const previous = initialFlags().flagA;
    const next = {
      ...previous,
      targetingVersion: 2,
      config: {
        key: "default",
        version: 2,
        payload: { items: [1, 2], nested: { limit: 10 } },
      },
    };

    expect(flagValueChanged(previous, next)).toBe(false);
  });

  test("compares the effective enabled result when overridden", () => {
    const previous = { ...initialFlags().flagA, isEnabledOverride: false };
    const next = { ...previous, isEnabled: false };

    expect(flagValueChanged(previous, next)).toBe(false);
    expect(
      flagValueChanged(previous, { ...next, isEnabledOverride: true }),
    ).toBe(true);
  });

  test("detects additions and removals, including disabled flags", () => {
    const flag = initialFlags().flagB;
    expect(flagValueChanged(undefined, flag)).toBe(true);
    expect(flagValueChanged(flag, undefined)).toBe(true);
    expect(flagValueChanged(undefined, undefined)).toBe(false);
  });
});

describe("flagUpdated", () => {
  test("fires once per initially fetched flag without emitting checks", async () => {
    const client = newClient();
    const listener = vi.fn();
    const sendCheck = vi.spyOn(FlagsClient.prototype, "sendCheckEvent");
    client.on("flagUpdated", listener);

    await client.initialize();

    expect(listener).toHaveBeenCalledTimes(2);
    for (const [key, flag] of Object.entries(client.getFlags())) {
      expect(listener).toHaveBeenCalledWith({ key, flag });
    }
    expect(sendCheck).not.toHaveBeenCalled();
  });

  test.each(["bootstrappedFlags", "bootstrappedState"] as const)(
    "publishes each initial %s flag once without fetching or emitting checks",
    async (source) => {
      const flags = initialFlags();
      const client = newClient(flags, {
        offline: false,
        ...(source === "bootstrappedState"
          ? {
              bootstrappedFlags: undefined,
              bootstrappedState: {
                flags,
                context: { user: { id: "user1" } },
                flagStateVersion: 1,
              },
            }
          : {}),
      });
      const listener = vi.fn();
      const flagsUpdated = vi.fn();
      const fetchFlags = vi.spyOn(FlagsClient.prototype, "fetchFlags");
      const sendCheck = vi.spyOn(FlagsClient.prototype, "sendCheckEvent");
      client.on("flagUpdated", listener);
      client.on("flagsUpdated", flagsUpdated);

      expect(Object.keys(client.getFlags())).toEqual(["flagA", "flagB"]);
      expect(listener).not.toHaveBeenCalled();
      await client.initialize();

      expect(listener).toHaveBeenCalledTimes(2);
      for (const [key, flag] of Object.entries(client.getFlags())) {
        expect(listener).toHaveBeenCalledWith({ key, flag });
      }
      expect(flagsUpdated).not.toHaveBeenCalled();
      expect(fetchFlags).not.toHaveBeenCalled();
      expect(sendCheck).not.toHaveBeenCalled();

      await client.initialize();
      client.updateFlags(flags);
      client.updateFlags({
        ...flags,
        flagA: { ...flags.flagA, targetingVersion: 2 },
      });
      expect(listener).toHaveBeenCalledTimes(2);
      expect(flagsUpdated).toHaveBeenCalledOnce();
    },
  );

  test("publishes cached overrides in initial bootstrap events without duplicates", async () => {
    localStorage.setItem(
      "__reflag_overrides",
      JSON.stringify({ flagA: false, flagB: true }),
    );
    const client = newClient(initialFlags());
    const listener = vi.fn();
    const flagsUpdated = vi.fn();
    client.on("flagUpdated", listener);
    client.on("flagsUpdated", flagsUpdated);

    await client.initialize();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([event]) => event.key)).toEqual([
      "flagA",
      "flagB",
    ]);
    expect(
      listener.mock.calls.map(
        ([{ flag }]) => flag.isEnabledOverride ?? flag.isEnabled,
      ),
    ).toEqual([false, true]);
    expect(flagsUpdated).toHaveBeenCalledOnce();
    expect(flagsUpdated).toHaveBeenCalledWith(client.getFlags());
  });

  test("does not replay bootstrapped flags to listeners registered after initialization", async () => {
    const client = newClient(initialFlags());
    await client.initialize();
    const listener = vi.fn();
    client.on("flagUpdated", listener);

    await client.initialize();
    expect(listener).not.toHaveBeenCalled();

    const flags = initialFlags();
    client.updateFlags({
      ...flags,
      flagA: { ...flags.flagA, isEnabled: false },
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      key: "flagA",
      flag: client.getFlags().flagA,
    });
  });

  test("initializing an empty bootstrapped snapshot does not publish flags", async () => {
    const client = newClient({});
    const listener = vi.fn();
    client.on("flagUpdated", listener);

    await client.initialize();

    expect(listener).not.toHaveBeenCalled();
    expect(client.getFlags()).toEqual({});
    expect(client.getState()).toBe("initialized");
  });

  test("ignores metadata while preserving flagsUpdated and the deprecated alias", () => {
    const flags = initialFlags();
    const client = newClient(flags);
    const flagUpdated = vi.fn();
    const flagsUpdated = vi.fn();
    const featuresUpdated = vi.fn();
    const sendCheck = vi.spyOn(FlagsClient.prototype, "sendCheckEvent");
    client.on("flagUpdated", flagUpdated);
    client.on("flagsUpdated", flagsUpdated);
    client.on("featuresUpdated", featuresUpdated);

    client.updateFlags({
      ...flags,
      flagA: {
        ...flags.flagA,
        targetingVersion: 2,
        ruleEvaluationResults: [false, true],
        missingContextFields: ["plan"],
        evaluationErrors: [
          {
            code: "MISSING_CONTEXT_FIELD",
            field: "plan",
            message: "Missing plan",
          },
        ],
        optInEnabled: true,
        optIn: {
          userOptedIn: false,
          companyOptedIn: false,
          isOptedIn: false,
          name: "Try it",
          description: "New description",
        },
        config: {
          ...flags.flagA.config!,
          version: 2,
          ruleEvaluationResults: [true],
          missingContextFields: ["region"],
          evaluationErrors: [
            {
              code: "MISSING_CONTEXT_FIELD",
              field: "region",
              message: "Missing region",
            },
          ],
        },
      },
    });

    expect(flagUpdated).not.toHaveBeenCalled();
    expect(flagsUpdated).toHaveBeenCalledOnce();
    expect(flagsUpdated).toHaveBeenCalledWith(client.getFlags());
    expect(featuresUpdated).toHaveBeenCalledWith(client.getFlags());
    expect(sendCheck).not.toHaveBeenCalled();
  });

  test.each([
    [
      "enabled result",
      "flagA",
      (flags: RawFlags) => {
        flags.flagA.isEnabled = false;
      },
    ],
    [
      "config key",
      "flagA",
      (flags: RawFlags) => {
        flags.flagA.config!.key = "variant";
      },
    ],
    [
      "nested config payload",
      "flagA",
      (flags: RawFlags) => {
        flags.flagA.config!.payload.nested.limit = 20;
      },
    ],
    [
      "config removal",
      "flagA",
      (flags: RawFlags) => {
        delete flags.flagA.config;
      },
    ],
    [
      "config addition",
      "flagB",
      (flags: RawFlags) => {
        flags.flagB.config = { key: "new", payload: null };
      },
    ],
    [
      "flag addition",
      "flagC",
      (flags: RawFlags) => {
        flags.flagC = { key: "flagC", isEnabled: false };
      },
    ],
    [
      "flag removal",
      "flagB",
      (flags: RawFlags) => {
        delete flags.flagB;
      },
    ],
  ])(
    "fires only for the affected flag on a changed %s",
    (_name, key, change) => {
      const client = newClient(initialFlags());
      const listener = vi.fn();
      client.on("flagUpdated", listener);
      const updated = initialFlags();
      change(updated);

      client.updateFlags(updated);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({
        key,
        flag: client.getFlags()[key],
      });
    },
  );

  test("fires once per changed flag, not for unchanged flags in the same update", () => {
    const flags = {
      ...initialFlags(),
      flagC: { key: "flagC", isEnabled: true },
    };
    const client = newClient(flags);
    const listener = vi.fn();
    client.on("flagUpdated", listener);

    client.updateFlags({
      ...flags,
      flagA: { ...flags.flagA, isEnabled: false },
      flagB: { ...flags.flagB, isEnabled: true },
      flagC: { ...flags.flagC, targetingVersion: 2 },
    });

    expect(listener.mock.calls.map(([event]) => event.key)).toEqual([
      "flagA",
      "flagB",
    ]);
  });

  test("only fires when an override changes the effective enabled value", () => {
    const flags = initialFlags();
    const client = newClient(flags);
    const listener = vi.fn();
    client.on("flagUpdated", listener);

    client.getFlag("flagA").setIsEnabledOverride(true);
    expect(listener).not.toHaveBeenCalled();

    client.getFlag("flagA").setIsEnabledOverride(false);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      key: "flagA",
      flag: client.getFlags().flagA,
    });
    listener.mockClear();

    client.updateFlags({
      ...flags,
      flagA: { ...flags.flagA, isEnabled: false },
    });
    client.getFlag("flagA").setIsEnabledOverride(null);
    expect(listener).not.toHaveBeenCalled();

    client.updateFlags(flags);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      key: "flagA",
      flag: client.getFlags().flagA,
    });
  });

  test("silent updates establish a baseline without notifying", () => {
    const client = newClient(initialFlags());
    const listener = vi.fn();
    const flagsUpdated = vi.fn();
    client.on("flagUpdated", listener);
    client.on("flagsUpdated", flagsUpdated);
    const updated = initialFlags();
    updated.flagA.isEnabled = false;

    client.updateFlags(updated, false);
    expect(client.getFlags().flagA.isEnabled).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(flagsUpdated).not.toHaveBeenCalled();

    client.updateFlags({
      ...updated,
      flagA: { ...updated.flagA, targetingVersion: 2 },
    });
    expect(listener).not.toHaveBeenCalled();
    expect(flagsUpdated).toHaveBeenCalledOnce();
  });

  test("delivers each value change before a raw-data subscriber changes overrides", () => {
    const flags = initialFlags();
    const client = newClient(flags);
    const listener = vi.fn();
    let overrideApplied = false;
    client.on("flagUpdated", listener);
    client.on("flagsUpdated", () => {
      if (!overrideApplied) {
        overrideApplied = true;
        client.getFlag("flagA").setIsEnabledOverride(true);
      }
    });

    client.updateFlags({
      ...flags,
      flagA: { ...flags.flagA, isEnabled: false },
    });

    expect(
      listener.mock.calls.map(
        ([{ flag }]) => flag.isEnabledOverride ?? flag.isEnabled,
      ),
    ).toEqual([false, true]);
  });

  test("listeners can unsubscribe", () => {
    const flags = initialFlags();
    const client = newClient(flags);
    const listener = vi.fn();
    const off = client.on("flagUpdated", listener);
    client.updateFlags({
      ...flags,
      flagA: { ...flags.flagA, isEnabled: false },
    });
    expect(listener).toHaveBeenCalledOnce();

    off();
    client.updateFlags(flags);
    expect(listener).toHaveBeenCalledOnce();
  });

  test("stopping the client removes its flag update listeners", async () => {
    const flags = initialFlags();
    const client = newClient(flags);
    const listener = vi.fn();
    client.on("flagUpdated", listener);
    await client.stop();

    client.updateFlags({
      ...flags,
      flagA: { ...flags.flagA, isEnabled: false },
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
