import { http, HttpResponse } from "msw";
import nock from "nock";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  forgetAuthToken,
  getAuthToken,
  rememberAuthToken,
} from "../src/feedback/promptStorage";
import { HttpClient } from "../src/httpClient";
import { AblySSEChannel } from "../src/sse";

import { server } from "./mocks/server";
import { testLogger } from "./testLogger";

const KEY = "123";
const sseHost = "https://ssehost.com/path";
const tokenRequest = {
  keyName: "key-name",
  other: "other",
};
const tokenDetails = {
  token: "token",
  expires: new Date("2023-01-01T00:00:00.000Z").getTime(),
};

const userId = "foo";
const channel = "channel";

function createSSEChannel(callback: (message: any) => void = vi.fn()) {
  const httpClient = new HttpClient(KEY);
  return new AblySSEChannel(
    userId,
    channel,
    sseHost,
    callback,
    httpClient,
    testLogger,
  );
}

Object.defineProperty(window, "EventSource", {
  value: vi.fn().mockImplementation(() => {
    // ignore
  }),
});

vi.mock("../src/feedback/promptStorage", () => {
  return {
    rememberAuthToken: vi.fn(),
    forgetAuthToken: vi.fn(),
    getAuthToken: vi.fn(),
  };
});

function setupAuthNock(success: boolean | number) {
  server.use(
    http.get("https://front.reflag.com/feedback/prompting-auth", async () => {
      if (success === true) {
        return HttpResponse.json({ success: true, ...tokenRequest });
      } else if (success === false) {
        return HttpResponse.json({ success: false });
      } else {
        return new HttpResponse(null, {
          status: success,
        });
      }
    }),
  );
}

function setupTokenNock(success: boolean) {
  server.use(
    http.post(
      `${sseHost}/keys/${tokenRequest.keyName}/requestToken`,
      async () => {
        if (success) {
          return HttpResponse.json(tokenDetails);
        } else {
          return new HttpResponse(null, {
            status: 401,
          });
        }
      },
    ),
  );
}

describe("connection handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthToken).mockReturnValue(undefined);
  });

  test("appends /sse to the sseHost", async () => {
    const sse = createSSEChannel();
    const addEventListener = vi.fn();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
    } as any);

    setupAuthNock(true);
    setupTokenNock(true);

    await sse.connect();

    const lastCall = vi.mocked(window.EventSource).mock.calls[0][0];

    expect(lastCall.toString()).toMatch(`${sseHost}/sse`);
  });

  test("rejects if auth endpoint is not success", async () => {
    const sse = createSSEChannel();

    setupAuthNock(false);
    const res = await sse.connect();
    expect(res).toBeUndefined();

    expect(vi.mocked(window.EventSource)).not.toHaveBeenCalled();
  });

  test("rejects if auth endpoint is not 200", async () => {
    const sse = createSSEChannel();

    setupAuthNock(403);

    const res = await sse.connect();
    expect(res).toBeUndefined();

    expect(vi.mocked(window.EventSource)).not.toHaveBeenCalled();
  });

  test("rejects if token endpoint rejects", async () => {
    const sse = createSSEChannel();

    setupAuthNock(true);
    setupTokenNock(false);

    const res = await sse.connect();
    expect(res).toBeUndefined();

    expect(vi.mocked(window.EventSource)).not.toHaveBeenCalled();
  });

  test("obtains token, connects and subscribes, then closes", async () => {
    const addEventListener = vi.fn();
    const close = vi.fn();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    const sse = createSSEChannel();

    setupAuthNock(true);
    setupTokenNock(true);

    await sse.connect();

    expect(getAuthToken).toHaveBeenCalledWith(userId);
    expect(rememberAuthToken).toHaveBeenCalledWith(
      userId,
      channel,
      "token",
      new Date("2023-01-01T00:00:00.000Z"),
    );
    expect(vi.mocked(window.EventSource)).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(3);
    expect(addEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
    expect(addEventListener).toHaveBeenCalledWith(
      "message",
      expect.any(Function),
    );
    expect(addEventListener).toHaveBeenCalledWith("open", expect.any(Function));

    expect(sse.isConnected()).toBe(true);

    sse.disconnect();

    expect(close).toHaveBeenCalledTimes(1);
    expect(sse.isConnected()).toBe(false);
  });

  test("reuses cached token", async () => {
    const sse = createSSEChannel();
    vi.mocked(getAuthToken).mockReturnValue({
      channel: channel,
      token: "cached_token",
    });

    const addEventListener = vi.fn();
    const close = vi.fn();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    await sse.connect();

    expect(getAuthToken).toHaveBeenCalledWith(userId);
    expect(rememberAuthToken).not.toHaveBeenCalled();

    expect(sse.isConnected()).toBe(true);
  });

  test("does not reuse cached token with wrong channel", async () => {
    const sse = createSSEChannel();

    vi.mocked(getAuthToken).mockReturnValue({
      channel: "haha",
      token: "cached_token",
    });

    const addEventListener = vi.fn();
    const close = vi.fn();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    setupAuthNock(true);
    setupTokenNock(true);

    await sse.connect();

    expect(rememberAuthToken).toHaveBeenCalledWith(
      userId,
      channel,
      "token",
      new Date("2023-01-01T00:00:00.000Z"),
    );
  });

  test("does not try to re-connect if already connecting", async () => {
    const sse = createSSEChannel();

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener: vi.fn(),
      close,
    } as any);

    setupAuthNock(true);
    setupTokenNock(true);

    const c1 = sse.connect();
    const c2 = sse.connect();

    await c1;
    await c2;

    expect(close).toHaveBeenCalledTimes(0);
    expect(vi.mocked(window.EventSource)).toHaveBeenCalledTimes(1);
  });

  test("does not re-connect if already connected", async () => {
    const sse = createSSEChannel();

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener: vi.fn(),
      close,
    } as any);

    setupAuthNock(true);
    setupTokenNock(true);

    await sse.connect();
    await sse.connect();

    expect(close).toHaveBeenCalledTimes(0);
    expect(vi.mocked(window.EventSource)).toHaveBeenCalledTimes(1);
  });

  test("disconnects only if connected", async () => {
    const sse = createSSEChannel();

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      close,
    } as any);

    sse.disconnect();

    expect(close).not.toHaveBeenCalled();
  });
});

describe("message handling", () => {
  beforeEach(() => {
    setupAuthNock(true);
    setupTokenNock(true);
  });

  afterEach(() => {
    expect(nock.isDone()).toBe(true);

    vi.clearAllMocks();
    nock.cleanAll();
  });

  test("passes message to callback", async () => {
    const callback = vi.fn();
    const sse = createSSEChannel(callback);

    let messageCallback: ((e: Event) => void) | undefined = undefined;
    const addEventListener = (event: string, cb: (e: Event) => void) => {
      if (event === "message") {
        messageCallback = cb;
      }
    };

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
    } as any);

    await sse.connect();

    expect(messageCallback).toBeDefined();

    messageCallback!({
      data: JSON.stringify({ data: JSON.stringify(userId) }),
    } as any);
    expect(callback).toHaveBeenCalledWith(userId);

    messageCallback!({
      data: null,
    } as any);

    messageCallback!({
      data: JSON.stringify({}),
    } as any);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("disconnects on unknown event source errors without data", async () => {
    const sse = createSSEChannel();

    let errorCallback: ((e: Event) => Promise<void>) | undefined = undefined;
    const addEventListener = (event: string, cb: (e: Event) => void) => {
      if (event === "error") {
        errorCallback = cb as typeof errorCallback;
      }
    };

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    await sse.connect();

    expect(errorCallback).toBeDefined();

    await errorCallback!({} as any);

    expect(forgetAuthToken).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("disconnects on unknown event source errors with data", async () => {
    const sse = createSSEChannel();
    let errorCallback: ((e: Event) => Promise<void>) | undefined = undefined;
    const addEventListener = (event: string, cb: (e: Event) => void) => {
      if (event === "error") {
        errorCallback = cb as typeof errorCallback;
      }
    };

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    await sse.connect();

    expect(errorCallback).toBeDefined();

    await errorCallback!(
      new MessageEvent("error", {
        data: JSON.stringify({ code: 400 }),
      }),
    );

    expect(close).toHaveBeenCalledTimes(1);
  });

  test("disconnects when ably reports token errors", async () => {
    const sse = createSSEChannel();

    let errorCallback: ((e: Event) => Promise<void>) | undefined = undefined;
    const addEventListener = (event: string, cb: (e: Event) => void) => {
      if (event === "error") {
        errorCallback = cb as typeof errorCallback;
      }
    };

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    await sse.connect();

    await errorCallback!(
      new MessageEvent("error", {
        data: JSON.stringify({ code: 40110 }),
      }),
    );

    expect(forgetAuthToken).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });
});

describe("automatic retries", () => {
  // const nockWait = (n: nock.Scope) => {
  //   return new Promise((resolve) => {
  //     n.on("replied", () => {
  //       resolve(undefined);
  //     });
  //   });
  // };

  beforeEach(() => {
    vi.clearAllMocks();
    nock.cleanAll();
  });

  afterEach(() => {
    expect(nock.isDone()).toBe(true);
  });

  test("opens and connects to a channel", async () => {
    const sse = createSSEChannel();

    setupAuthNock(true);
    setupTokenNock(true);

    sse.open();

    await vi.waitFor(() =>
      sse.isConnected() ? Promise.resolve() : Promise.reject(),
    );

    expect(sse.isConnected()).toBe(true);
  });

  test("opens and connects later to a failed channel", async () => {
    const sse = createSSEChannel();

    setupAuthNock(false);

    sse.open({ retryInterval: 10 });

    await vi.waitUntil(() => !sse.isConnected());
    setupAuthNock(true);
    setupTokenNock(true);

    await vi.waitUntil(() => sse.isConnected());

    expect(sse.isConnected()).toBe(true);
    expect(sse.isActive()).toBe(true);
  });

  test("resets retry count on successful connect", async () => {
    const sse = createSSEChannel();

    // mock event source
    let errorCallback: ((e: Event) => Promise<void>) | undefined = undefined;
    const addEventListener = (event: string, cb: (e: Event) => void) => {
      if (event === "error") {
        errorCallback = cb as typeof errorCallback;
      }
    };

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener,
      close,
    } as any);

    // make initial failed attempt
    setupAuthNock(false);

    sse.open({ retryInterval: 100, retryCount: 1 });

    const attempt = async () => {
      setupAuthNock(true);
      setupTokenNock(true);

      await vi.waitUntil(() => sse.isConnected());

      expect(sse.isConnected()).toBe(true);

      // simulate an error
      await errorCallback!({} as any);

      expect(sse.isConnected()).toBe(false);
    };

    await attempt();
    await attempt();
    await attempt();
  });

  test("reconnects if manually disconnected", async () => {
    const sse = createSSEChannel();

    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener: vi.fn(),
      close: vi.fn(),
    } as any);

    setupAuthNock(true);
    setupTokenNock(true);

    vi.useFakeTimers();
    await sse.open({ retryInterval: 100 });

    sse.disconnect();

    setupAuthNock(true);
    setupTokenNock(true);

    vi.advanceTimersByTime(100);

    vi.useRealTimers();

    await vi.waitUntil(() => sse.isConnected());

    expect(sse.isConnected()).toBe(true);
    expect(sse.isActive()).toBe(true);
  });

  test("opens and does not connect later to a failed channel if no retries", async () => {
    const sse = createSSEChannel();

    setupAuthNock(false);

    vi.useFakeTimers();
    sse.open({
      retryCount: 0,
      retryInterval: 100,
    });

    vi.advanceTimersByTime(100);
    vi.useRealTimers();

    await vi.waitUntil(() => !sse.isActive());

    expect(sse.isActive()).toBe(false);
  });

  test("closes an open channel", async () => {
    const sse = createSSEChannel();

    setupAuthNock(true);
    setupTokenNock(true);

    const close = vi.fn();
    vi.mocked(window.EventSource).mockReturnValue({
      addEventListener: vi.fn(),
      close,
    } as any);

    sse.open();

    await vi.waitUntil(() => sse.isConnected());

    sse.close();

    expect(sse.isConnected()).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect(sse.isActive()).toBe(false);
  });
});
