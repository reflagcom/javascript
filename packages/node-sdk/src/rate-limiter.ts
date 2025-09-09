import { ok } from "./utils";

/**
 * Creates a new rate limiter.
 *
 * @typeparam TKey - The type of the key.
 * @param windowSizeMs - The length of the time window in milliseconds.
 *
 * @returns The rate limiter.
 **/
export function newRateLimiter(windowSizeMs: number) {
  ok(
    typeof windowSizeMs == "number" && windowSizeMs > 0,
    "windowSizeMs must be greater than 0",
  );

  let lastAllowedTimestampsByKey: { [key: string]: number } = {};

  function clearStale(all: boolean = false): void {
    if (all) {
      lastAllowedTimestampsByKey = {};
    }

    const expireBeforeTimestamp = Date.now() - windowSizeMs;
    const keys = Object.keys(lastAllowedTimestampsByKey);

    for (const key of keys) {
      const lastAllowedTimestamp = lastAllowedTimestampsByKey[key];

      if (
        lastAllowedTimestamp &&
        lastAllowedTimestamp < expireBeforeTimestamp
      ) {
        delete lastAllowedTimestampsByKey[key];
      }
    }
  }

  function isAllowed(key: string): boolean {
    const now = Date.now();

    // every ~100 calls, remove all stale items from the cache.
    //
    // we previously used a fixed time interval here, but setTimeout
    // is not available in serverless runtimes.
    if (Math.random() < 0.01) {
      clearStale();
    }

    const lastAllowedTimestamp = lastAllowedTimestampsByKey[key];
    if (lastAllowedTimestamp && lastAllowedTimestamp >= now - windowSizeMs) {
      return false;
    }

    lastAllowedTimestampsByKey[key] = now;
    return true;
  }

  return {
    clearStale,
    isAllowed,
    cacheSize: () => Object.keys(lastAllowedTimestampsByKey).length,
  };
}
