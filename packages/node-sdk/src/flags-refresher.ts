import { openFlagUpdatesSSE } from "./flag-updates-sse";
import type { FlagsCache } from "./flags-cache";
import type { FlagsSyncMode, Logger } from "./types";

export type FlagsSyncController = {
  start: () => Promise<void>;
  onAccess?: () => void;
  destroy: () => void;
};

function triggerRefresh({
  cache,
  logger,
  waitForVersion,
}: {
  cache: FlagsCache;
  logger?: Logger;
  waitForVersion?: number;
}) {
  void cache.refresh(waitForVersion).catch((error) => {
    logger?.warn("background flag refresh failed", error);
  });
}

function createPollingSyncController({
  cache,
  intervalMs,
  logger,
}: {
  cache: FlagsCache;
  intervalMs: number;
  logger?: Logger;
}): FlagsSyncController {
  let timer: NodeJS.Timeout | undefined;

  return {
    start: async () => {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        triggerRefresh({ cache, logger });
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

function createInRequestSyncController({
  cache,
  ttlMs,
  logger,
}: {
  cache: FlagsCache;
  ttlMs: number;
  logger?: Logger;
}): FlagsSyncController {
  return {
    start: async () => {
      // noop
    },
    onAccess: () => {
      const lastRefreshAt = cache.getLastRefreshAt();
      if (lastRefreshAt !== undefined && Date.now() - lastRefreshAt <= ttlMs) {
        return;
      }

      triggerRefresh({ cache, logger });
    },
    destroy: () => {
      // noop
    },
  };
}

function createPushSyncController({
  cache,
  pushUrl,
  headers,
  logger,
}: {
  cache: FlagsCache;
  pushUrl: string;
  headers: Record<string, string>;
  logger?: Logger;
}): FlagsSyncController {
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
          triggerRefresh({ cache, logger, waitForVersion: version });
        },
        onReconnect: () => {
          triggerRefresh({ cache, logger });
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

export function createFlagsSyncController({
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
}): FlagsSyncController {
  switch (mode) {
    case "push":
      return createPushSyncController({
        cache,
        pushUrl,
        headers,
        logger,
      });
    case "in-request":
      return createInRequestSyncController({
        cache,
        ttlMs: intervalMs,
        logger,
      });
    case "polling":
    default:
      return createPollingSyncController({
        cache,
        intervalMs,
        logger,
      });
  }
}
