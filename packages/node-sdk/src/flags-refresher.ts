import { openFlagUpdatesSSE } from "./flag-updates-sse";
import type { FlagsCache } from "./flags-cache";
import type { FlagsSyncMode, Logger } from "./types";

export type FlagsRefresher = {
  start: () => Promise<void>;
  onAccess?: () => void;
  destroy: () => void;
};

function createPollingFlagsRefresher({
  cache,
  intervalMs,
}: {
  cache: FlagsCache;
  intervalMs: number;
}): FlagsRefresher {
  let timer: NodeJS.Timeout | undefined;

  return {
    start: async () => {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void cache.refresh();
      }, intervalMs);
      timer.unref();
    },
    destroy: () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}

function createInRequestFlagsRefresher({
  cache,
  ttlMs,
}: {
  cache: FlagsCache;
  ttlMs: number;
}): FlagsRefresher {
  return {
    start: async () => {
      // noop
    },
    onAccess: () => {
      const lastRefreshAt = cache.getLastRefreshAt();
      if (lastRefreshAt !== undefined && Date.now() - lastRefreshAt <= ttlMs) {
        return;
      }

      void cache.refresh();
    },
    destroy: () => {
      // noop
    },
  };
}

function createPushFlagsRefresher({
  cache,
  pushUrl,
  headers,
  logger,
}: {
  cache: FlagsCache;
  pushUrl: string;
  headers: Record<string, string>;
  logger?: Logger;
}): FlagsRefresher {
  let subscription: ReturnType<typeof openFlagUpdatesSSE> | undefined;

  return {
    start: async () => {
      if (subscription) {
        await subscription.ready;
        return;
      }

      subscription = openFlagUpdatesSSE({
        url: pushUrl,
        headers,
        logger,
        onFlagStateVersion: (version) => {
          void cache.refresh(version);
        },
        onReconnect: () => {
          void cache.refresh();
        },
      });

      await subscription.ready;
    },
    destroy: () => {
      subscription?.close();
      subscription = undefined;
    },
  };
}

export function createFlagsRefresher({
  mode,
  cache,
  intervalMs,
  pushUrl,
  headers,
  logger,
}: {
  mode: FlagsSyncMode;
  cache: FlagsCache;
  intervalMs: number;
  pushUrl: string;
  headers: Record<string, string>;
  logger?: Logger;
}): FlagsRefresher {
  switch (mode) {
    case "push":
      return createPushFlagsRefresher({
        cache,
        pushUrl,
        headers,
        logger,
      });
    case "in-request":
      return createInRequestFlagsRefresher({
        cache,
        ttlMs: intervalMs,
      });
    case "polling":
    default:
      return createPollingFlagsRefresher({
        cache,
        intervalMs,
      });
  }
}
