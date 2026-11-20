import ReactNativeEventSource from "react-native-sse";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AblySSEChannel } from "../src/sse";
import { testLogger } from "./testLogger";

// Exercise the actual React Native transport, including its plain error
// events (xhrStatus, no target.readyState) and disabled reconnect loop.
let online: boolean;
let requests: MockXMLHttpRequest[];
let channel: AblySSEChannel;

class MockXMLHttpRequest {
  static DONE = 4;
  static LOADING = 3;

  status = 0;
  readyState = 0;
  responseText = "";
  onreadystatechange?: () => void;
  onerror?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  abort = vi.fn();

  constructor() {
    requests.push(this);
  }

  send() {
    if (!online) {
      this.fail();
      return;
    }
    this.status = 200;
    this.readyState = MockXMLHttpRequest.LOADING;
    this.responseText = ": connected\n\n";
    this.onreadystatechange?.();
  }

  fail() {
    this.status = 0;
    this.readyState = MockXMLHttpRequest.DONE;
    this.onerror?.();
  }

  message(data: string) {
    this.responseText += `data: ${data}\n\n`;
    this.onreadystatechange?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
});

afterEach(() => {
  channel.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test.each([false, true])(
  "recovers after three minutes offline (initially connected: %s)",
  async (initiallyConnected) => {
    online = initiallyConnected;
    const callback = vi.fn();
    channel = new AblySSEChannel(
      [],
      "http://localhost",
      callback,
      testLogger,
      (url) =>
        new ReactNativeEventSource<string>(url, {
          // Match the RN wrapper, but skip its initial 500ms startup delay.
          pollingInterval: 0,
          timeoutBeforeConnection: 0,
        }),
    );
    channel.open();
    await vi.advanceTimersByTimeAsync(1);
    expect(channel.isConnected()).toBe(initiallyConnected);

    online = false;
    if (initiallyConnected) requests[0].fail();
    await vi.advanceTimersByTimeAsync(181_000);

    online = true;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(channel.isConnected()).toBe(true);
    expect(channel.isActive()).toBe(true);
    expect(requests.length).toBeGreaterThan(4);

    const currentRequest = requests[requests.length - 1];
    currentRequest.message(
      JSON.stringify({
        event: "flags-updated",
        data: { flagStateVersion: 12 },
      }),
    );
    expect(callback).toHaveBeenCalledWith({
      event: "flags-updated",
      data: { flagStateVersion: 12 },
    });

    channel.close();
    expect(currentRequest.abort).toHaveBeenCalledTimes(1);
    const attempts = requests.length;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(requests).toHaveLength(attempts);
    expect(channel.isActive()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  },
);
