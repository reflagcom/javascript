// This is a cache that is updated as part of the request/response cycle.
// This is useful in serverless runtimes where `setTimeout` doesn't exist or does something useless.

import { Logger } from "./types";

export default function inRequestCache<T>(
  ttl: number,
  logger: Logger | undefined,
  fn: () => Promise<T | undefined>,
) {
  let value: T | undefined = undefined;
  let lastFetch = 0;
  let fetching: Promise<void> | null = null;

  async function refresh(): Promise<T | undefined> {
    if (!fetching) {
      fetching = (async () => {
        try {
          const result = await fn();
          logger?.debug("inRequestCache: fetched value", result);
          if (result !== undefined) {
            value = result;
          }
        } catch (err) {
          if (logger) {
            logger.error?.("inRequestCache: error refreshing value", err);
          }
        } finally {
          lastFetch = Date.now();
          fetching = null;
        }
      })();
    }
    await fetching;
    return value;
  }

  const waitRefresh = async () => {
    if (fetching) await fetching;
  };

  return {
    get(): T | undefined {
      const now = Date.now();
      // If value is undefined, just return undefined
      if (value === undefined) {
        return undefined;
      }
      // If value is stale, trigger background refresh
      if (now - lastFetch > ttl) {
        logger?.debug(
          "inRequestCache: stale value, triggering background refresh",
        );
        void refresh();
      }

      return value;
    },
    async refresh(): Promise<T | undefined> {
      return await refresh();
    },
    waitRefresh,
  };
}
