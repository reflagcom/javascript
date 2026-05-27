import { afterEach, describe, expect, test, vi } from "vitest";

const KEY = "123";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

let documentDescriptor: PropertyDescriptor | undefined;

function hideDocumentGlobal() {
  documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: undefined,
  });
}

function restoreDocumentGlobal() {
  if (documentDescriptor) {
    Object.defineProperty(globalThis, "document", documentDescriptor);
    documentDescriptor = undefined;
  }
}

afterEach(() => {
  restoreDocumentGlobal();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("React Native runtime", () => {
  test("initializes pubsub without document when an SSE transport is provided", async () => {
    hideDocumentGlobal();
    vi.resetModules();

    const closeChannel = vi.fn();
    const sseModule = await import("../src/sse");
    const openSpy = vi
      .spyOn(sseModule, "openAblySSEChannel")
      .mockReturnValue({ close: closeChannel } as any);

    const { ReflagClient } = await import("../src/client");
    const eventSourceFactory = vi.fn(() => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
    }));

    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      enableLiveFlagUpdates: true,
      eventSourceFactory,
      feedback: { enableAutoFeedback: false },
      toolbar: false,
      logger,
    });
    await reflagInstance.initialize();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0].path).toBe("sse/client");
    expect(openSpy.mock.calls[0][0].channels).toEqual([]);
    expect(openSpy.mock.calls[0][0].publishableKey).toBe(KEY);
    expect(openSpy.mock.calls[0][0].eventSourceFactory).toBe(
      eventSourceFactory,
    );
    expect(logger.debug).toHaveBeenCalledWith("initializing pubsub");

    await reflagInstance.stop();
    expect(closeChannel).toHaveBeenCalledTimes(1);
  });

  test("skips pubsub without document when no SSE transport is provided", async () => {
    hideDocumentGlobal();
    vi.resetModules();

    const sseModule = await import("../src/sse");
    const openSpy = vi.spyOn(sseModule, "openAblySSEChannel");

    const { ReflagClient } = await import("../src/client");
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      enableLiveFlagUpdates: true,
      feedback: { enableAutoFeedback: false },
      toolbar: false,
      logger,
    });
    await reflagInstance.initialize();

    expect(openSpy).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      "skipping pubsub initialization because this runtime has no browser EventSource transport",
    );

    await reflagInstance.stop();
  });
});
