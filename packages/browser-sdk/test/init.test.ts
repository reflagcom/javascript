import { DefaultBodyType, http, StrictRequest } from "msw";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  vitest,
} from "vitest";

import { ReflagClient } from "../src";
import { AutoFeedback } from "../src/feedback/feedback";
import * as liveUpdatesModule from "../src/flag/liveUpdates";
import { HttpClient } from "../src/httpClient";
import * as sseModule from "../src/sse";
import { getFlags, testChannel } from "./mocks/handlers";
import { server } from "./mocks/server";

const KEY = "123";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("init", () => {
  test("will accept setup with key and debug logger", async () => {
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: 42 },
      company: { id: 42 },
      logger,
    });
    const spyInit = vi.spyOn(reflagInstance, "initialize");

    await reflagInstance.initialize();
    expect(spyInit).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
    await reflagInstance.stop();
  });

  test("will accept setup with custom host", async () => {
    let usedSpecialHost = false;

    server.use(
      http.get(
        "https://example.com/features/evaluated",
        ({ request }: { request: StrictRequest<DefaultBodyType> }) => {
          usedSpecialHost = true;
          return getFlags({ request });
        },
      ),
    );
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      apiBaseUrl: "https://example.com",
      enableTracking: false,
      feedback: {
        enableAutoFeedback: false,
      },
    });
    await reflagInstance.initialize();

    expect(usedSpecialHost).toBe(true);
    expect(reflagInstance.getConfig().sseBaseUrl).toBe("https://example.com");
    await reflagInstance.stop();
  });

  test("automatically does user/company tracking", async () => {
    const user = vitest.spyOn(ReflagClient.prototype as any, "user");
    const company = vitest.spyOn(ReflagClient.prototype as any, "company");

    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      company: { id: "bar" },
    });
    await reflagInstance.initialize();

    expect(user).toHaveBeenCalled();
    expect(company).toHaveBeenCalled();
    await reflagInstance.stop();
  });

  test("can disable tracking and auto. feedback surveys", async () => {
    const post = vitest.spyOn(HttpClient.prototype as any, "post");

    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      enableTracking: false,
      feedback: {
        enableAutoFeedback: false,
      },
    });
    await reflagInstance.initialize();
    await reflagInstance.track("test");

    expect(post).not.toHaveBeenCalled();
    await reflagInstance.stop();
  });

  test("passes credentials correctly to httpClient", async () => {
    const credentials = "include";
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      credentials,
    });

    await reflagInstance.initialize();

    expect(reflagInstance["httpClient"]["fetchOptions"].credentials).toBe(
      credentials,
    );
    await reflagInstance.stop();
  });

  describe("enableLiveFlagUpdates", () => {
    test("does not open a pubsub connection by default", async () => {
      const spy = vi.spyOn(sseModule, "openAblySSEChannel");

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        user: { id: "foo" },
        feedback: { enableAutoFeedback: false },
      });
      await reflagInstance.initialize();

      expect(spy).not.toHaveBeenCalled();
      await reflagInstance.stop();
    });

    test("opens a pubsub connection with the live flags channel when enabled", async () => {
      const closeChannel = vi.fn();
      vi.spyOn(
        liveUpdatesModule,
        "computeFlagUpdatesChannelName",
      ).mockResolvedValue("flags-state:test");
      const spy = vi
        .spyOn(sseModule, "openAblySSEChannel")
        .mockReturnValue({ close: closeChannel } as any);

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        user: { id: "foo" },
        enableLiveFlagUpdates: true,
        feedback: { enableAutoFeedback: false },
      });
      await reflagInstance.initialize();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].channels).toEqual(["flags-state:test"]);

      await reflagInstance.stop();
      expect(closeChannel).toHaveBeenCalledTimes(1);
    });

    test("does not open a channel when offline", async () => {
      const spy = vi.spyOn(sseModule, "openAblySSEChannel");

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        user: { id: "foo" },
        enableLiveFlagUpdates: true,
        offline: true,
        feedback: { enableAutoFeedback: false },
      });
      await reflagInstance.initialize();

      expect(spy).not.toHaveBeenCalled();
      await reflagInstance.stop();
    });

    test("uses one shared pubsub connection for live flags and feedback", async () => {
      vi.spyOn(
        liveUpdatesModule,
        "computeFlagUpdatesChannelName",
      ).mockResolvedValue("flags-state:test");
      const spy = vi
        .spyOn(sseModule, "openAblySSEChannel")
        .mockReturnValue({ close: vi.fn() } as any);

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        user: { id: "foo" },
        enableLiveFlagUpdates: true,
      });
      await reflagInstance.initialize();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].channels).toEqual([
        "flags-state:test",
        testChannel,
      ]);

      await reflagInstance.stop();
    });

    test("flag update messages trigger flag refresh", async () => {
      let callback: ((message: any) => void) | undefined;
      vi.spyOn(
        liveUpdatesModule,
        "computeFlagUpdatesChannelName",
      ).mockResolvedValue("flags-state:test");
      vi.spyOn(sseModule, "openAblySSEChannel").mockImplementation((opts) => {
        callback = opts.callback;
        return { close: vi.fn() } as any;
      });

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        user: { id: "foo" },
        enableLiveFlagUpdates: true,
        feedback: { enableAutoFeedback: false },
      });
      await reflagInstance.initialize();

      const refreshSpy = vi
        .spyOn(reflagInstance["flagsClient"], "refreshFlags")
        .mockResolvedValue(undefined);

      expect(callback).toBeDefined();
      callback!({ name: "flags-updated", data: { flagStateVersion: 1 } });
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).toHaveBeenCalledWith(1);

      await reflagInstance.stop();
    });

    test("does not refresh flags when the pushed version matches the bootstrapped version", async () => {
      let callback: ((message: any) => void) | undefined;
      vi.spyOn(
        liveUpdatesModule,
        "computeFlagUpdatesChannelName",
      ).mockResolvedValue("flags-state:test");
      vi.spyOn(sseModule, "openAblySSEChannel").mockImplementation((opts) => {
        callback = opts.callback;
        return { close: vi.fn() } as any;
      });

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        enableLiveFlagUpdates: true,
        feedback: { enableAutoFeedback: false },
        bootstrappedState: {
          context: { user: { id: "foo" } },
          flags: {
            testFlag: {
              key: "testFlag",
              isEnabled: true,
              targetingVersion: 1,
            },
          },
          flagStateVersion: 5,
        },
      });
      await reflagInstance.initialize();

      const refreshSpy = vi
        .spyOn(reflagInstance["flagsClient"], "refreshFlags")
        .mockResolvedValue(undefined);

      expect(callback).toBeDefined();
      callback!({ name: "flags-updated", data: { flagStateVersion: 5 } });
      expect(refreshSpy).not.toHaveBeenCalled();

      await reflagInstance.stop();
    });

    test("warns and disables live flag updates when bootstrappedState has no flagStateVersion", async () => {
      const spy = vi.spyOn(sseModule, "openAblySSEChannel");
      const computeChannel = vi.spyOn(
        liveUpdatesModule,
        "computeFlagUpdatesChannelName",
      );

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        enableLiveFlagUpdates: true,
        feedback: { enableAutoFeedback: false },
        logger,
        bootstrappedState: {
          context: { user: { id: "foo" } },
          flags: {
            testFlag: {
              key: "testFlag",
              isEnabled: true,
              targetingVersion: 1,
            },
          },
        },
      });
      await reflagInstance.initialize();

      expect(logger.warn).toHaveBeenCalledWith(
        "Live flag updates require `flagStateVersion` when bootstrapping flags. Disabling live flag updates for this client. Upgrade your server SDK (for example `@reflag/node-sdk`) so `getFlagsForBootstrap()` includes `flagStateVersion`.",
      );
      expect((reflagInstance as any)["enableLiveFlagUpdates"]).toBe(false);
      expect(computeChannel).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();

      await reflagInstance.stop();
    });

    test("warns and disables live flag updates when using deprecated bootstrappedFlags", async () => {
      const spy = vi.spyOn(sseModule, "openAblySSEChannel");
      const computeChannel = vi.spyOn(
        liveUpdatesModule,
        "computeFlagUpdatesChannelName",
      );

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        enableLiveFlagUpdates: true,
        feedback: { enableAutoFeedback: false },
        logger,
        user: { id: "foo" },
        bootstrappedFlags: {
          testFlag: {
            key: "testFlag",
            isEnabled: true,
            targetingVersion: 1,
          },
        },
      });
      await reflagInstance.initialize();

      expect(logger.warn).toHaveBeenCalledWith(
        "Live flag updates require `flagStateVersion` when bootstrapping flags. Disabling live flag updates for this client. Upgrade your server SDK (for example `@reflag/node-sdk`) so `getFlagsForBootstrap()` includes `flagStateVersion`.",
      );
      expect((reflagInstance as any)["enableLiveFlagUpdates"]).toBe(false);
      expect(computeChannel).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();

      await reflagInstance.stop();
    });

    test("reinitializing pubsub closes the previous feedback subscription when no new channel is available", async () => {
      const closeChannel = vi.fn();
      vi.spyOn(AutoFeedback.prototype, "getChannel")
        .mockResolvedValueOnce(testChannel)
        .mockResolvedValueOnce(undefined);
      const spy = vi
        .spyOn(sseModule, "openAblySSEChannel")
        .mockReturnValue({ close: closeChannel } as any);

      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        user: { id: "foo" },
      });
      await reflagInstance.initialize();

      await reflagInstance["updateAutoFeedbackUser"]("bar");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(closeChannel).toHaveBeenCalledTimes(1);
      expect(reflagInstance["pubSubChannel"]).toBeUndefined();

      await reflagInstance.stop();
    });
  });
});
