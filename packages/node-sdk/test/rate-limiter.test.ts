import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { newRateLimiter } from "../src/rate-limiter";

describe("rateLimiter", () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const windowSizeMs = 1000;

  describe("isAllowed", () => {
    it("should rate limit", () => {
      const limiter = newRateLimiter(windowSizeMs);

      expect(limiter.isAllowed("key")).toBe(true);
      expect(limiter.isAllowed("key")).toBe(false);
    });

    it("should reset the limit in given time", () => {
      const limiter = newRateLimiter(windowSizeMs);

      limiter.isAllowed("key");

      vi.advanceTimersByTime(windowSizeMs);
      expect(limiter.isAllowed("key")).toBe(false);

      vi.advanceTimersByTime(1);
      expect(limiter.isAllowed("key")).toBe(true);
    });

    it("should measure events separately by key", () => {
      const limiter = newRateLimiter(windowSizeMs);

      expect(limiter.isAllowed("key1")).toBe(true);

      vi.advanceTimersByTime(windowSizeMs);
      expect(limiter.isAllowed("key2")).toBe(true);
      expect(limiter.isAllowed("key1")).toBe(false);

      vi.advanceTimersByTime(1);
      expect(limiter.isAllowed("key1")).toBe(true);

      vi.advanceTimersByTime(windowSizeMs);
      expect(limiter.isAllowed("key2")).toBe(true);
    });
  });

  describe("clearStale", () => {
    it("should clear expired events, but keep non-expired", () => {
      const rateLimiter = newRateLimiter(windowSizeMs);
      rateLimiter.isAllowed("key1");
      expect(rateLimiter.cacheSize()).toBe(1);

      vi.advanceTimersByTime(windowSizeMs / 2); // 500ms
      rateLimiter.isAllowed("key2");
      expect(rateLimiter.cacheSize()).toBe(2);

      vi.advanceTimersByTime(windowSizeMs / 2 + 1); // 1001ms total
      // at this point, key1 is stale, but key2 is not

      rateLimiter.clearStale();
      expect(rateLimiter.cacheSize()).toBe(1);

      // key2 should still be in the cache, and thus rate-limited
      expect(rateLimiter.isAllowed("key2")).toBe(false);
      // key1 should have been removed, so it's allowed again
      expect(rateLimiter.isAllowed("key1")).toBe(true);
      expect(rateLimiter.cacheSize()).toBe(2);
    });
  });

  it("should periodically clean up expired keys", () => {
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const rateLimiter = newRateLimiter(windowSizeMs);

    // Add key1, cache size is 1.
    rateLimiter.isAllowed("key1");
    expect(rateLimiter.cacheSize()).toBe(1);

    // Advance time so key1 becomes stale.
    vi.advanceTimersByTime(windowSizeMs + 1);

    // Trigger another call for a different key.
    // This should not clear anything, cache size becomes 2.
    rateLimiter.isAllowed("key2");
    expect(rateLimiter.cacheSize()).toBe(2);

    // Mock random to trigger clearStale on the next call.
    mathRandomSpy.mockReturnValue(0.005);

    // This call for a new key ("key3") should trigger a cleanup.
    // "key1" is stale and will be cleared. "key2" remains. "key3" is added.
    // Cache size should go from 2 -> 1 (clear) -> 2 (add).
    rateLimiter.isAllowed("key3");
    expect(rateLimiter.cacheSize()).toBe(2);

    // To confirm "key1" was cleared, we should be able to add it again.
    expect(rateLimiter.isAllowed("key1")).toBe(true);
    expect(rateLimiter.cacheSize()).toBe(3);

    mathRandomSpy.mockRestore();
  });
});
