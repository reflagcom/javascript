import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AblySSEChannel, openAblySSEChannel } from "../src/sse";
import { testLogger } from "./testLogger";

const sseHost = "https://ssehost.com/path";
const channel = "channel";

class MockEventSource extends EventTarget {
  readyState = 0;
  close = vi.fn(() => {
    this.readyState = 2;
  });

  emit(type: "open" | "error", readyState: number) {
    this.readyState = readyState;
    this.dispatchEvent(new Event(type));
  }
}

function createSSEChannel(
  callback: (message: any) => void = vi.fn(),
  channels: string[] = [channel],
) {
  return new AblySSEChannel(channels, sseHost, callback, testLogger);
}

function mockEventSource(methods: {
  addEventListener: (event: string, callback: (event: Event) => void) => void;
  close?: () => void;
}) {
  vi.mocked(window.EventSource).mockImplementation(
    class {
      constructor() {
        Object.assign(this, methods);
      }
    } as unknown as typeof EventSource,
  );
}

Object.defineProperty(window, "EventSource", {
  value: vi.fn(class {}),
  writable: true,
});

describe("connection handling", () => {
  beforeEach(() => {
    mockEventSource({ addEventListener: vi.fn(), close: vi.fn() });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("appends /sse to the sseHost", async () => {
    const sse = createSSEChannel();
    const addEventListener = vi.fn();

    mockEventSource({ addEventListener });

    await sse.connect();

    const lastCall = vi.mocked(window.EventSource).mock.calls[0][0];
    expect(lastCall.toString()).toMatch(`${sseHost}/sse`);
  });

  test("subscribes to the requested channels", async () => {
    const sse = createSSEChannel(vi.fn(), ["channel-a", "channel-b"]);
    const addEventListener = vi.fn();

    mockEventSource({ addEventListener });

    await sse.connect();

    const url = new URL(vi.mocked(window.EventSource).mock.calls[0][0]);
    expect(url.searchParams.get("channels")).toBe("channel-a,channel-b");
    expect(url.searchParams.get("rewind")).toBe("1");
  });

  test("includes publishable key and SDK version when provided", async () => {
    const sse = new AblySSEChannel(
      ["channel-a"],
      sseHost,
      vi.fn(),
      testLogger,
      undefined,
      "pub_test_123",
      "browser-sdk/test",
    );
    const addEventListener = vi.fn();

    mockEventSource({ addEventListener });

    await sse.connect();

    const url = new URL(vi.mocked(window.EventSource).mock.calls[0][0]);
    expect(url.searchParams.get("publishableKey")).toBe("pub_test_123");
    expect(url.searchParams.get("reflag-sdk-version")).toBe("browser-sdk/test");
  });

  test("opens a custom SSE path without channel query parameters", async () => {
    openAblySSEChannel({
      channels: [],
      callback: vi.fn(),
      logger: testLogger,
      sseBaseUrl: sseHost,
      path: "sse/client",
      publishableKey: "pub_test_123",
      sdkVersion: "browser-sdk/test",
    });

    const url = new URL(vi.mocked(window.EventSource).mock.calls[0][0]);
    expect(url.pathname).toBe("/path/sse/client");
    expect(url.searchParams.get("channels")).toBeNull();
    expect(url.searchParams.get("rewind")).toBeNull();
    expect(url.searchParams.get("publishableKey")).toBe("pub_test_123");
    expect(url.searchParams.get("reflag-sdk-version")).toBe("browser-sdk/test");
  });

  test("includes context as JSON when provided", async () => {
    openAblySSEChannel({
      channels: [],
      callback: vi.fn(),
      logger: testLogger,
      sseBaseUrl: sseHost,
      path: "sse/client",
      context: {
        user: { id: 23, name: undefined },
        other: {},
      },
    });

    const url = new URL(vi.mocked(window.EventSource).mock.calls[0][0]);
    expect(url.searchParams.get("contextJson")).toBe(
      JSON.stringify({ user: { id: 23 } }),
    );
    expect(url.searchParams.has("context")).toBe(false);
  });

  test("enables EventSource credentials when credentials is include", async () => {
    openAblySSEChannel({
      channels: [],
      callback: vi.fn(),
      logger: testLogger,
      sseBaseUrl: sseHost,
      path: "sse/client",
      credentials: "include",
    });

    expect(vi.mocked(window.EventSource)).toHaveBeenCalledWith(
      `${sseHost}/sse/client`,
      { withCredentials: true },
    );
  });

  test("passes parsed message envelopes to the callback", async () => {
    const callback = vi.fn();
    const sse = createSSEChannel(callback);

    let messageCallback: ((e: Event) => void) | undefined;
    const addEventListener = (event: string, cb: (e: Event) => void) => {
      if (event === "message") {
        messageCallback = cb;
      }
    };

    mockEventSource({ addEventListener });

    await sse.connect();

    messageCallback!(
      new MessageEvent("message", {
        data: JSON.stringify({
          name: "flags-updated",
          data: JSON.stringify({ flagStateVersion: 12 }),
        }),
      }),
    );

    expect(callback).toHaveBeenCalledWith({
      name: "flags-updated",
      data: { flagStateVersion: 12 },
    });
  });

  test("keeps non-JSON inner data as a string", async () => {
    const callback = vi.fn();
    const sse = createSSEChannel(callback);

    let messageCallback: ((e: Event) => void) | undefined;
    const addEventListener = (event: string, cb: (e: Event) => void) => {
      if (event === "message") {
        messageCallback = cb;
      }
    };

    mockEventSource({ addEventListener });

    await sse.connect();

    messageCallback!(
      new MessageEvent("message", {
        data: JSON.stringify({ data: "plain-text" }),
      }),
    );

    expect(callback).toHaveBeenCalledWith({ data: "plain-text" });
  });

  test("is connected only after the open event, then closes", async () => {
    const source = new MockEventSource();
    const addEventListener = vi.fn(source.addEventListener.bind(source));
    mockEventSource({ addEventListener, close: source.close });

    const sse = createSSEChannel();
    await sse.connect();

    expect(addEventListener).toHaveBeenCalledTimes(3);
    expect(sse.isConnected()).toBe(false);
    expect(sse.isActive()).toBe(true);

    source.emit("open", 1);
    expect(sse.isConnected()).toBe(true);

    sse.disconnect();

    expect(source.close).toHaveBeenCalledTimes(1);
    expect(sse.isConnected()).toBe(false);
    expect(sse.isActive()).toBe(false);
  });

  test("openAblySSEChannel opens immediately", () => {
    const callback = vi.fn();

    openAblySSEChannel({
      channels: ["channel-a", "channel-b"],
      callback,
      logger: testLogger,
      sseBaseUrl: sseHost,
    });

    expect(vi.mocked(window.EventSource)).toHaveBeenCalledTimes(1);
  });

  test("uses a provided eventSourceFactory when global EventSource is unavailable", async () => {
    const originalEventSource = window.EventSource;
    Object.defineProperty(window, "EventSource", {
      value: undefined,
      writable: true,
    });

    const eventSource = {
      addEventListener: vi.fn(),
      close: vi.fn(),
    };
    const eventSourceFactory = vi.fn().mockReturnValue(eventSource);

    try {
      const sse = openAblySSEChannel({
        channels: ["channel-a", "channel-b"],
        callback: vi.fn(),
        logger: testLogger,
        sseBaseUrl: sseHost,
        eventSourceFactory,
      });

      expect(eventSourceFactory).toHaveBeenCalledTimes(1);
      expect(eventSourceFactory).toHaveBeenCalledWith(
        `${sseHost}/sse?v=1.2&channels=channel-a%2Cchannel-b&rewind=1`,
      );
      expect(eventSource.addEventListener).toHaveBeenCalledTimes(3);

      sse.close();
    } finally {
      Object.defineProperty(window, "EventSource", {
        value: originalEventSource,
        writable: true,
      });
    }
  });
});

describe("native reconnection", () => {
  let source: MockEventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    source = new MockEventSource();
    mockEventSource({
      addEventListener: source.addEventListener.bind(source),
      close: source.close,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("lets EventSource reconnect after a recoverable error", async () => {
    const sse = createSSEChannel();
    sse.open();
    source.emit("open", 1);
    source.emit("error", 0);

    expect(source.close).not.toHaveBeenCalled();
    expect(sse.isConnected()).toBe(false);
    expect(sse.isActive()).toBe(true);

    await vi.advanceTimersByTimeAsync(90_000);
    expect(window.EventSource).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    source.emit("open", 1);
    expect(sse.isConnected()).toBe(true);
    sse.close();
  });

  test.each([false, true])(
    "does not recreate a terminal connection (previously open: %s)",
    async (previouslyOpen) => {
      const sse = createSSEChannel();
      sse.open();
      if (previouslyOpen) source.emit("open", 1);
      source.emit("error", 2);

      await vi.advanceTimersByTimeAsync(90_000);

      expect(window.EventSource).toHaveBeenCalledTimes(1);
      expect(source.close).toHaveBeenCalledTimes(1);
      expect(sse.isConnected()).toBe(false);
      expect(sse.isActive()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test("does not create duplicate connections while connecting or reconnecting", () => {
    const sse = createSSEChannel();
    sse.open();
    sse.open();
    source.emit("error", 0);
    sse.open();

    expect(window.EventSource).toHaveBeenCalledTimes(1);
    sse.close();
  });

  test("closes a pending connection and ignores late events", async () => {
    const callback = vi.fn();
    const sse = createSSEChannel(callback);
    sse.open();
    sse.close();
    source.emit("open", 1);
    source.dispatchEvent(new MessageEvent("message", { data: '{"data":1}' }));
    source.emit("error", 0);
    await vi.advanceTimersByTimeAsync(90_000);

    expect(source.close).toHaveBeenCalledTimes(1);
    expect(window.EventSource).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
    expect(sse.isConnected()).toBe(false);
    expect(sse.isActive()).toBe(false);
  });

  test("allows an explicit reopen without accepting events from the old source", () => {
    const sse = createSSEChannel();
    sse.open();
    source.emit("error", 2);

    const replacement = new MockEventSource();
    mockEventSource({
      addEventListener: replacement.addEventListener.bind(replacement),
      close: replacement.close,
    });
    sse.open();
    replacement.emit("open", 1);
    source.emit("error", 2);

    expect(window.EventSource).toHaveBeenCalledTimes(2);
    expect(sse.isConnected()).toBe(true);
    expect(replacement.close).not.toHaveBeenCalled();
    sse.close();
  });

  test("does not retry synchronous native construction failures", async () => {
    const sse = createSSEChannel();
    const connect = vi
      .spyOn(sse, "connect")
      .mockRejectedValue(new Error("boom"));
    sse.open();
    await vi.advanceTimersByTimeAsync(90_000);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(sse.isActive()).toBe(false);
  });
});

describe("custom transport retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("bounds retries for synchronous factory failures", async () => {
    const factory = vi.fn(() => {
      throw new Error("boom");
    });
    const sse = new AblySSEChannel(
      [channel],
      sseHost,
      vi.fn(),
      testLogger,
      factory,
    );

    sse.open({ retryInterval: 100, retryCount: 1 });
    await vi.advanceTimersByTimeAsync(250);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(sse.isActive()).toBe(false);
  });

  test("preserves retries after repeated asynchronous custom transport failures", async () => {
    const sources: MockEventSource[] = [];
    const factory = vi.fn(() => {
      const source = new MockEventSource();
      sources.push(source);
      return source;
    });
    const sse = new AblySSEChannel(
      [channel],
      sseHost,
      vi.fn(),
      testLogger,
      factory,
    );

    sse.open({ retryInterval: 100, retryCount: 1 });
    for (let attempt = 0; attempt < 10; attempt++) {
      sources[attempt].emit("error", 0);
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(factory).toHaveBeenCalledTimes(11);
    expect(sse.isActive()).toBe(true);
    sse.close();
    await vi.advanceTimersByTimeAsync(250);
    expect(factory).toHaveBeenCalledTimes(11);
    expect(sse.isActive()).toBe(false);
  });

  test("reconnects a custom transport after opening and stops on close", async () => {
    const sources: MockEventSource[] = [];
    const factory = vi.fn(() => {
      const source = new MockEventSource();
      sources.push(source);
      return source;
    });
    const sse = new AblySSEChannel(
      [channel],
      sseHost,
      vi.fn(),
      testLogger,
      factory,
    );

    sse.open({ retryInterval: 100, retryCount: 1 });
    sources[0].emit("error", 0);
    await vi.advanceTimersByTimeAsync(100);
    sources[1].emit("open", 1);
    sources[1].emit("error", 0);
    await vi.advanceTimersByTimeAsync(100);

    expect(factory).toHaveBeenCalledTimes(3);
    sources[2].emit("open", 1);
    expect(sse.isConnected()).toBe(true);
    sse.close();
    await vi.advanceTimersByTimeAsync(250);
    expect(factory).toHaveBeenCalledTimes(3);
    expect(sse.isActive()).toBe(false);
  });

  test("does not spend retries while a custom transport is still connecting", async () => {
    const source = new MockEventSource();
    const factory = vi.fn(() => source);
    const sse = new AblySSEChannel(
      [channel],
      sseHost,
      vi.fn(),
      testLogger,
      factory,
    );

    sse.open({ retryInterval: 100, retryCount: 1 });
    await vi.advanceTimersByTimeAsync(250);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(sse.isActive()).toBe(true);
    expect(sse.isConnected()).toBe(false);

    source.emit("error", 0);
    await vi.advanceTimersByTimeAsync(100);
    expect(factory).toHaveBeenCalledTimes(2);
    sse.close();
  });

  test("does not start retries when EventSource is unavailable", async () => {
    const originalEventSource = window.EventSource;
    Object.defineProperty(window, "EventSource", {
      value: undefined,
      writable: true,
    });

    try {
      const sse = createSSEChannel();
      const connect = vi.spyOn(sse, "connect");

      sse.open();
      await vi.advanceTimersByTimeAsync(250);

      expect(connect).not.toHaveBeenCalled();
      expect(sse.isActive()).toBe(false);
    } finally {
      Object.defineProperty(window, "EventSource", {
        value: originalEventSource,
        writable: true,
      });
    }
  });
});
