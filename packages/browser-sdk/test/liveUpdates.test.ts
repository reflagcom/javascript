import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  computeFlagUpdatesChannelName,
  openFlagUpdatesChannel,
} from "../src/flag/liveUpdates";
import * as sseModule from "../src/sse";
import { testLogger } from "./testLogger";

const PUBLISHABLE_KEY = "pub_test_abc123";
const SSE_BASE_URL = "https://pubsub.reflag.com";

describe("computeFlagUpdatesChannelName", () => {
  test("derives a `flags-state:` channel from the publishable key", async () => {
    const channel = await computeFlagUpdatesChannelName(PUBLISHABLE_KEY);
    expect(channel).toMatch(/^flags-state:[0-9a-f]{16}$/);
  });

  test("is stable for the same publishable key", async () => {
    const a = await computeFlagUpdatesChannelName(PUBLISHABLE_KEY);
    const b = await computeFlagUpdatesChannelName(PUBLISHABLE_KEY);
    expect(a).toBe(b);
  });

  test("differs for different publishable keys", async () => {
    const a = await computeFlagUpdatesChannelName("pub_a");
    const b = await computeFlagUpdatesChannelName("pub_b");
    expect(a).not.toBe(b);
  });
});

describe("openFlagUpdatesChannel", () => {
  const originalEventSource = (globalThis as any).EventSource;

  beforeEach(() => {
    // Provide a dummy EventSource so the underlying AblySSEChannel can open.
    (globalThis as any).EventSource = vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEventSource === undefined) {
      delete (globalThis as any).EventSource;
    } else {
      (globalThis as any).EventSource = originalEventSource;
    }
  });

  test("opens an AblySSEChannel with the derived channel", async () => {
    const spy = vi.spyOn(sseModule, "openAblySSEChannel");
    const onFlagsUpdated = vi.fn();

    const channel = await openFlagUpdatesChannel({
      publishableKey: PUBLISHABLE_KEY,
      sseBaseUrl: SSE_BASE_URL,
      onFlagsUpdated,
      logger: testLogger,
    });

    expect(channel).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0][0];
    expect(args.channel).toMatch(/^flags-state:[0-9a-f]{16}$/);
    expect(args.sseBaseUrl).toBe(SSE_BASE_URL);
  });

  test("invokes onFlagsUpdated for `flags-updated` messages", async () => {
    const spy = vi.spyOn(sseModule, "openAblySSEChannel");
    const onFlagsUpdated = vi.fn();

    await openFlagUpdatesChannel({
      publishableKey: PUBLISHABLE_KEY,
      sseBaseUrl: SSE_BASE_URL,
      onFlagsUpdated,
      logger: testLogger,
    });

    const callback = spy.mock.calls[0][0].callback;

    callback({ name: "flags-updated", data: { flagStateVersion: 42 } });
    expect(onFlagsUpdated).toHaveBeenCalledTimes(1);
  });

  test("ignores messages with a different event name", async () => {
    const spy = vi.spyOn(sseModule, "openAblySSEChannel");
    const onFlagsUpdated = vi.fn();

    await openFlagUpdatesChannel({
      publishableKey: PUBLISHABLE_KEY,
      sseBaseUrl: SSE_BASE_URL,
      onFlagsUpdated,
      logger: testLogger,
    });

    const callback = spy.mock.calls[0][0].callback;

    callback({ name: "some-other-event" });
    expect(onFlagsUpdated).not.toHaveBeenCalled();
  });

  test("invokes onFlagsUpdated for unnamed payloads (server may omit name)", async () => {
    const spy = vi.spyOn(sseModule, "openAblySSEChannel");
    const onFlagsUpdated = vi.fn();

    await openFlagUpdatesChannel({
      publishableKey: PUBLISHABLE_KEY,
      sseBaseUrl: SSE_BASE_URL,
      onFlagsUpdated,
      logger: testLogger,
    });

    const callback = spy.mock.calls[0][0].callback;

    callback({ data: { flagStateVersion: 1 } });
    expect(onFlagsUpdated).toHaveBeenCalledTimes(1);
  });

  test("catches errors thrown by onFlagsUpdated", async () => {
    const spy = vi.spyOn(sseModule, "openAblySSEChannel");

    await openFlagUpdatesChannel({
      publishableKey: PUBLISHABLE_KEY,
      sseBaseUrl: SSE_BASE_URL,
      onFlagsUpdated: () => {
        throw new Error("boom");
      },
      logger: testLogger,
    });

    const callback = spy.mock.calls[0][0].callback;
    expect(() => callback({ name: "flags-updated" })).not.toThrow();
  });

  test("returns undefined when EventSource is unavailable", async () => {
    delete (globalThis as any).EventSource;

    const spy = vi.spyOn(sseModule, "openAblySSEChannel");
    const channel = await openFlagUpdatesChannel({
      publishableKey: PUBLISHABLE_KEY,
      sseBaseUrl: SSE_BASE_URL,
      onFlagsUpdated: vi.fn(),
      logger: testLogger,
    });

    expect(channel).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
