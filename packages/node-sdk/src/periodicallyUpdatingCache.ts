import { Cache, Logger } from "./types";

/**
 * Create a cached function that updates the value asynchronously.
 *
 * The value is updated every `ttl` milliseconds.
 * If the value is older than `staleTtl` milliseconds, a warning is logged.
 *
 * @typeParam T - The type of the value.
 * @param ttl - The time-to-live in milliseconds.
 * @param staleTtl - The time-to-live after which a warning is logged.
 * @param logger - The logger to use.
 * @param fn - The function to call to get the value.
 * @returns The cache object.
 **/
export default function periodicallyUpdatingCache<T>(
  ttl: number,
  staleTtl: number,
  logger: Logger | undefined,
  fn: () => Promise<T | undefined>,
): Cache<T> {
  let cachedValue: T | undefined;
  let lastUpdate: number | undefined;
  let timeoutId: NodeJS.Timeout | undefined;
  let refreshPromise: Promise<void> | undefined;

  const update = async () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    try {
      const newValue = await fn();
      if (newValue === undefined) {
        return;
      }
      logger?.info("refreshed flag definitions");

      cachedValue = newValue;

      lastUpdate = Date.now();

      logger?.debug("updated cached value", cachedValue);
    } catch (e) {
      logger?.error("failed to update cached value", e);
    } finally {
      refreshPromise = undefined;
      timeoutId = setTimeout(update, ttl).unref();
    }
  };

  const get = () => {
    if (lastUpdate !== undefined) {
      const age = Date.now() - lastUpdate!;
      if (age > staleTtl) {
        logger?.warn("cached value is stale", { age, cachedValue });
      }
    }

    return cachedValue;
  };

  const refresh = async () => {
    if (!refreshPromise) {
      refreshPromise = update();
    }
    await refreshPromise;
    return get();
  };

  const waitRefresh = async () => {
    // no-op
  };

  return {
    get,
    refresh,
    waitRefresh,
  };
}
