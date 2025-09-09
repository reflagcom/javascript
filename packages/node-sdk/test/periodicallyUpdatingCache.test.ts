import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import cache from "../src/periodicallyUpdatingCache";
import { Logger } from "../src/types";

describe("cache", () => {
  let fn: () => Promise<number>;
  let logger: Logger;

  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    fn = vi.fn().mockResolvedValue(42);
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  it("should update the cached value when refreshing", async () => {
    const cached = cache(1000, 2000, logger, fn);

    const result = await cached.refresh();

    expect(result).toBe(42);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching("updated cached value"),
      42,
    );
  });

  it("should not allow multiple refreses at the same time", async () => {
    const cached = cache(1000, 2000, logger, fn);

    void cached.refresh();
    void cached.refresh();
    void cached.refresh();
    await cached.refresh();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching("updated cached value"),
      42,
    );

    void cached.refresh();
    await cached.refresh();

    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching("updated cached value"),
      42,
    );
  });

  it("should warn if the cached value is stale", async () => {
    const cached = cache(1000, 2000, logger, fn);

    await cached.refresh();

    vi.advanceTimersByTime(2500);

    const result = cached.get();

    expect(result).toBe(42);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching("cached value is stale"),
      {
        age: expect.any(Number),
        cachedValue: 42,
      },
    );
  });

  it("should update the cached value after ttl", async () => {
    const newValue = 84;
    fn = vi.fn().mockResolvedValueOnce(42).mockResolvedValueOnce(newValue);

    const cached = cache(1000, 2000, logger, fn);

    const first = await cached.refresh();

    expect(first).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersToNextTimerAsync();

    const second = cached.get();

    expect(second).toBe(newValue);
    expect(fn).toHaveBeenCalledTimes(2);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching("updated cached value"),
      newValue,
    );
  });

  it("should handle update failures gracefully", async () => {
    const error = new Error("update failed");
    fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(42);

    const cached = cache(1000, 2000, logger, fn);

    const first = await cached.refresh();

    expect(first).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching("failed to update cached value"),
      error,
    );
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersToNextTimerAsync();

    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching("updated cached value"),
      42,
    );

    const second = cached.get();
    expect(second).toBe(42);
  });

  it("should retain the cached value if the new value is undefined", async () => {
    fn = vi.fn().mockResolvedValueOnce(42).mockResolvedValueOnce(undefined);
    const cached = cache(1000, 2000, logger, fn);

    await cached.refresh();

    await vi.advanceTimersToNextTimerAsync();

    const second = cached.get();
    expect(second).toBe(42);

    vi.advanceTimersByTime(2500);

    const result = cached.get();

    expect(result).toBe(42);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching("cached value is stale"),
      {
        age: expect.any(Number),
        cachedValue: 42,
      },
    );
  });

  it("should not update if cached value is still valid", async () => {
    const cached = cache(1000, 2000, logger, fn);

    const first = await cached.refresh();

    vi.advanceTimersByTime(500);

    const second = cached.get();

    expect(first).toBe(second);
    expect(logger.debug).toHaveBeenCalledTimes(1); // Only one update call
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });
});
