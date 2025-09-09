import { constants } from "os";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  MockInstance,
  vi,
} from "vitest";

import { subscribe } from "../src/flusher";

describe("flusher", () => {
  const mockExit = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as any);

  const mockConsoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  const mockProcessOn = vi
    .spyOn(process, "on")
    .mockImplementation((_, __) => process);

  const mockProcessPrependListener = (
    vi.spyOn(process, "prependListener") as unknown as MockInstance<
      [event: NodeJS.Signals, listener: NodeJS.SignalsListener],
      NodeJS.Process
    >
  ).mockImplementation((_, __) => process);

  const mockListenerCount = vi
    .spyOn(process, "listenerCount")
    .mockReturnValue(0);

  function timedCallback(ms: number) {
    return vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }),
    );
  }

  function getHandler(eventName: string, prepended = false) {
    return prepended
      ? mockProcessPrependListener.mock.calls.filter(
          ([evt]) => evt === eventName,
        )[0][1]
      : mockProcessOn.mock.calls.filter(([evt]) => evt === eventName)[0][1];
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe("signal handling", () => {
    const signals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const;

    describe.each(signals)("signal %s", (signal) => {
      it("should handle signal with no existing listeners", async () => {
        mockListenerCount.mockReturnValue(0);
        const callback = vi.fn().mockResolvedValue(undefined);

        subscribe(callback);
        expect(mockProcessOn).toHaveBeenCalledWith(
          signal,
          expect.any(Function),
        );

        getHandler(signal)(signal);
        await vi.runAllTimersAsync();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(0x80 + constants.signals[signal]);
      });

      it("should prepend handler when listeners exist", async () => {
        mockListenerCount.mockReturnValue(1);
        const callback = vi.fn().mockResolvedValue(undefined);

        subscribe(callback);

        expect(mockProcessPrependListener).toHaveBeenCalledWith(
          signal,
          expect.any(Function),
        );

        getHandler(signal, true)(signal);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(mockExit).not.toHaveBeenCalled();
      });
    });
  });

  describe("beforeExit handling", () => {
    it("should call callback on beforeExit", async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      subscribe(callback);

      getHandler("beforeExit")();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should not call callback multiple times", async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      subscribe(callback);

      getHandler("beforeExit")();
      getHandler("beforeExit")();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout handling", () => {
    it("should handle timeout when callback takes too long", async () => {
      subscribe(timedCallback(2000), 1000);

      getHandler("beforeExit")();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockConsoleError).toHaveBeenCalledWith(
        "[Reflag SDK] Timeout while flushing events on process exit.",
      );
    });

    it("should not timeout when callback completes in time", async () => {
      subscribe(timedCallback(500), 1000);

      getHandler("beforeExit")();
      await vi.advanceTimersByTimeAsync(500);

      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe("exit state handling", () => {
    it("should log error if exit occurs before flushing starts", () => {
      subscribe(timedCallback(0));

      getHandler("exit")();

      expect(mockConsoleError).toHaveBeenCalledWith(
        "[Reflag SDK] Failed to finalize the flushing of events on process exit.",
      );
    });

    it("should log error if exit occurs before flushing completes", async () => {
      subscribe(timedCallback(2000));
      getHandler("beforeExit")();

      await vi.advanceTimersByTimeAsync(1000);

      getHandler("exit")();

      expect(mockConsoleError).toHaveBeenCalledWith(
        "[Reflag SDK] Failed to finalize the flushing of events on process exit.",
      );
    });

    it("should not log error if flushing completes before exit", async () => {
      subscribe(timedCallback(500));

      getHandler("beforeExit")();
      await vi.advanceTimersByTimeAsync(500);

      getHandler("exit")();

      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it("should handle callback errors gracefully", async () => {
      subscribe(vi.fn().mockRejectedValue(new Error("Test error")));

      getHandler("beforeExit")();
      await vi.runAllTimersAsync();

      expect(mockConsoleError).toHaveBeenCalledWith(
        "[Reflag SDK] An error occurred while flushing events on process exit.",
        expect.any(Error),
      );
    });
  });

  it("should run the callback only once", async () => {
    const callback = vi.fn().mockResolvedValue(undefined);

    subscribe(callback);

    getHandler("SIGINT")("SIGINT");
    getHandler("beforeExit")();

    await vi.runAllTimersAsync();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
