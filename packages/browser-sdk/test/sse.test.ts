import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AblySSEChannel, openAblySSEChannel } from "../src/sse";
import { testLogger } from "./testLogger";

const sseHost = "https://ssehost.com/path";
const channel = "channel";

function createSSEChannel(
  callback: (message: any) => void = vi.fn(),
  channels: string[] = [channel],
) {
  return new AblySSEChannel(channels, sseHost, callback, testLogger);
}

Object.defineProperty(window, "EventSource", {
  value: vi.fn().mockImplementation(() => {
    // ignore
  }),
  writable: true,
});

describe("connection handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("appends /sse to the sseHost", async () => {
    const sse = createSSEChannel();
    const addEventListener = vi.fn();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
    } as any);

    await sse.connect();

    const lastCall = vi.mocked(window.EventSource).mock.calls[0][0];
    expect(lastCall.toString()).toMatch(`${sseHost}/sse`);
  });

  test("subscribes to the requested channels without an access token", async () => {
    const sse = createSSEChannel(vi.fn(), ["channel-a", "channel-b"]);
    const addEventListener = vi.fn();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
    } as any);

    await sse.connect();

    const url = vi.mocked(window.EventSource).mock.calls[0][0] as URL;
    expect(url.searchParams.get("channels")).toBe("channel-a,channel-b");
    expect(url.searchParams.get("accessToken")).toBeNull();
    expect(url.searchParams.get("rewind")).toBe("1");
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

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
    } as any);

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

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
    } as any);

    await sse.connect();

    messageCallback!(
      new MessageEvent("message", {
        data: JSON.stringify({ data: "plain-text" }),
      }),
    );

    expect(callback).toHaveBeenCalledWith({ data: "plain-text" });
  });

  test("opens and connects, then closes", async () => {
    const addEventListener = vi.fn();
    const close = vi.fn();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    const sse = createSSEChannel();

    await sse.connect();

    expect(addEventListener).toHaveBeenCalledTimes(3);
    expect(sse.isConnected()).toBe(true);

    sse.disconnect();

    expect(close).toHaveBeenCalledTimes(1);
    expect(sse.isConnected()).toBe(false);
  });

  test("disconnects on event source errors", async () => {
    const close = vi.fn();
    let errorCallback: ((e: Event) => void) | undefined;

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener: (event: string, cb: (e: Event) => void) => {
        if (event === "error") errorCallback = cb;
      },
      close,
    } as any);

    const sse = createSSEChannel();
    await sse.connect();

    errorCallback!({} as any);

    expect(close).toHaveBeenCalledTimes(1);
    expect(sse.isConnected()).toBe(false);
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
});

describe("automatic retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("retries after a failed connection attempt", async () => {
    const sse = createSSEChannel();
    const connect = vi
      .spyOn(sse, "connect")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(sse, "isConnected")
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    sse.open({ retryInterval: 100, retryCount: 1 });
    await vi.advanceTimersByTimeAsync(250);
    sse.close();

    expect(connect).toHaveBeenCalledTimes(2);
  });

  test("stops retrying when no retries remain", async () => {
    const sse = createSSEChannel();
    const connect = vi
      .spyOn(sse, "connect")
      .mockRejectedValue(new Error("boom"));

    sse.open({ retryInterval: 100, retryCount: 1 });
    await vi.advanceTimersByTimeAsync(250);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(sse.isActive()).toBe(false);
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

      sse.open({ retryInterval: 100, retryCount: 1 });
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
