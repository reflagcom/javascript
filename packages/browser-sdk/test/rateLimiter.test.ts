import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import RateLimiter from "../src/rateLimiter";
import { testLogger } from "./testLogger";

describe("rateLimit", () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  beforeEach(() => {
    vi.advanceTimersByTime(600000); // Advance time by 10 minutes
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("should call the key generator", () => {
    const callback = vi.fn();
    const limiter = new RateLimiter(1, testLogger);

    for (let i = 0; i < 5; i++) {
      limiter.rateLimited(`${i}`, callback);
    }

    expect(callback).toHaveBeenCalledTimes(5);
  });

  it("should not call the callback when the limit is exceeded", () => {
    const callback = vi.fn();
    const limiter = new RateLimiter(5, testLogger);

    for (let i = 0; i < 10; i++) {
      limiter.rateLimited("key", callback);
    }

    expect(callback).toHaveBeenCalledTimes(5);
  });

  it("should reset the limit after a minute", () => {
    const callback = vi.fn();
    const limited = new RateLimiter(1, testLogger);

    for (let i = 0; i < 12; i++) {
      limited.rateLimited("key", () => callback(i));
      vi.advanceTimersByTime(6000); // Advance time by 6 seconds
    }

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(0);
    expect(callback).toHaveBeenCalledWith(11); // first one goes through after 1min
  });

  it("should measure events separately by key", () => {
    const callback = vi.fn();
    const limited = new RateLimiter(5, testLogger);

    for (let i = 0; i < 10; i++) {
      limited.rateLimited("key1", callback);
      limited.rateLimited("key2", callback);
    }

    expect(callback).toHaveBeenCalledTimes(10);
  });

  it("should return the value of the callback always", () => {
    const callback = vi.fn();
    const limited = new RateLimiter(5, testLogger);

    for (let i = 0; i < 5; i++) {
      callback.mockReturnValue(i);
      const res = limited.rateLimited("key", callback);

      expect(res).toBe(i);
    }
  });
});
