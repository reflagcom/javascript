import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  const mockProcessPrependListener = vi
    .spyOn(process, "prependListener")
    .mockImplementation((_, __) => process);

  function timedCallback(ms: number) {
    return vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }),
    );
  }

  function getHandler(eventName: string) {
    return mockProcessOn.mock.calls.filter(([evt]) => evt === eventName)[0][1];
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("should subscribe only to natural exit, without installing signal handlers", () => {
    subscribe(vi.fn().mockResolvedValue(undefined));

    expect(mockProcessOn.mock.calls.map(([event]) => event)).toEqual([
      "beforeExit",
      "exit",
    ]);
    expect(mockProcessPrependListener).not.toHaveBeenCalled();
  });

  describe("beforeExit handling", () => {
    it("should call callback on beforeExit", async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      subscribe(callback);

      await getHandler("beforeExit")();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(mockExit).not.toHaveBeenCalled();
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
    it("should not report a failed flush when beforeExit never ran", () => {
      subscribe(timedCallback(0));

      getHandler("exit")();

      expect(mockConsoleError).not.toHaveBeenCalled();
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

  it("should not flush again when beforeExit fires after flushing completes", async () => {
    const callback = vi.fn().mockResolvedValue(undefined);

    subscribe(callback);

    await getHandler("beforeExit")();
    await getHandler("beforeExit")();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(mockExit).not.toHaveBeenCalled();
  });
});
