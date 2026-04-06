import type { CachedFlagDefinition, Logger } from "./types";

const DEFAULT_MIN_REFRESH_INTERVAL_MS = 1000;

type FlagsCacheRefreshResult = {
  definitions: CachedFlagDefinition[];
  flagStateVersion?: number;
};

type FlagsCacheScheduledRefresh = {
  cancel: () => void;
};

type FlagsCacheOptions = {
  logger?: Logger;
  minRefreshIntervalMs?: number;
  scheduleTrailingRefresh?: (
    delayMs: number,
    callback: () => void,
  ) => FlagsCacheScheduledRefresh;
};

/**
 * Stores the latest compiled flag definitions and coordinates refresh work.
 *
 * A single instance is shared across all sync modes. Response
 * `flagStateVersion`s decide whether fetched definitions replace the current
 * cache, so correctness does not depend on request ordering.
 *
 * Refreshes are throttled to at most one fetch start per interval. When the
 * runtime supports delayed work we schedule one trailing refresh; otherwise we
 * keep the pending refresh queued until the next caller touches the cache.
 */
export class FlagsCache {
  private value: CachedFlagDefinition[] | undefined;
  private flagStateVersion: number | undefined;
  private refreshPromise: Promise<void> | undefined;
  private scheduledRefresh: FlagsCacheScheduledRefresh | undefined;
  private scheduledRefreshPromise: Promise<void> | undefined;
  private resolveScheduledRefreshPromise: (() => void) | undefined;
  private lastRefreshAt: number | undefined;
  private lastRefreshStartedAt: number | undefined;
  private destroyed = false;

  private pendingFullRefresh = false;
  private pendingWaitForVersion: number | undefined;

  private readonly logger?: Logger;
  private readonly minRefreshIntervalMs: number;
  private readonly scheduleTrailingRefresh?: FlagsCacheOptions["scheduleTrailingRefresh"];

  constructor(
    private readonly fetchFlags: (
      waitForVersion?: number,
    ) => Promise<FlagsCacheRefreshResult | undefined>,
    options: FlagsCacheOptions = {},
  ) {
    this.logger = options.logger;
    this.minRefreshIntervalMs =
      options.minRefreshIntervalMs ?? DEFAULT_MIN_REFRESH_INTERVAL_MS;
    this.scheduleTrailingRefresh = options.scheduleTrailingRefresh;
  }

  public get() {
    return this.value;
  }

  public async refresh(waitForVersion?: number) {
    if (this.destroyed) {
      return this.value;
    }

    this.queueRefresh(waitForVersion);
    this.ensureRefreshStartedOrScheduled();
    await this.waitForQueuedWork();
    return this.value;
  }

  public async waitRefresh() {
    await this.waitForQueuedWork();
  }

  public destroy() {
    this.destroyed = true;
    this.value = undefined;
    this.flagStateVersion = undefined;
    this.refreshPromise = undefined;
    this.cancelScheduledRefresh();
    this.pendingFullRefresh = false;
    this.pendingWaitForVersion = undefined;
    this.lastRefreshAt = undefined;
    this.lastRefreshStartedAt = undefined;
  }

  public getLastRefreshAt() {
    return this.lastRefreshAt;
  }

  // Remember the newest refresh request we still need to run. Versioned
  // refreshes win over plain refreshes because they carry a concrete target we
  // can wait for.
  private queueRefresh(waitForVersion?: number) {
    if (waitForVersion !== undefined) {
      if (
        this.flagStateVersion !== undefined &&
        this.flagStateVersion >= waitForVersion
      ) {
        return;
      }

      this.pendingWaitForVersion =
        this.pendingWaitForVersion === undefined
          ? waitForVersion
          : Math.max(this.pendingWaitForVersion, waitForVersion);
      this.pendingFullRefresh = false;
      return;
    }

    if (this.pendingWaitForVersion !== undefined) {
      return;
    }

    this.pendingFullRefresh = true;
  }

  private hasPendingRefresh() {
    return this.pendingWaitForVersion !== undefined || this.pendingFullRefresh;
  }

  private takeNextRefreshRequest() {
    if (this.pendingWaitForVersion !== undefined) {
      const waitForVersion = this.pendingWaitForVersion;
      this.pendingWaitForVersion = undefined;
      return { waitForVersion };
    }

    if (!this.pendingFullRefresh) {
      return undefined;
    }

    this.pendingFullRefresh = false;
    return { waitForVersion: undefined };
  }

  private shouldApplyRefreshResult(flagStateVersion?: number) {
    if (flagStateVersion === undefined) {
      return this.flagStateVersion === undefined;
    }

    return (
      this.flagStateVersion === undefined ||
      flagStateVersion >= this.flagStateVersion
    );
  }

  private clearSatisfiedPendingVersion(seenFlagStateVersion?: number) {
    if (this.pendingWaitForVersion === undefined) {
      return;
    }

    const latestKnownVersion = Math.max(
      this.flagStateVersion ?? -1,
      seenFlagStateVersion ?? -1,
    );

    if (latestKnownVersion >= this.pendingWaitForVersion) {
      this.pendingWaitForVersion = undefined;
    }
  }

  private getNextRefreshDelayMs() {
    if (
      this.lastRefreshStartedAt === undefined ||
      this.minRefreshIntervalMs <= 0
    ) {
      return 0;
    }

    return Math.max(
      0,
      this.lastRefreshStartedAt + this.minRefreshIntervalMs - Date.now(),
    );
  }

  private settleScheduledRefresh() {
    this.scheduledRefresh = undefined;
    this.scheduledRefreshPromise = undefined;
    this.resolveScheduledRefreshPromise?.();
    this.resolveScheduledRefreshPromise = undefined;
  }

  private cancelScheduledRefresh() {
    this.scheduledRefresh?.cancel();
    this.settleScheduledRefresh();
  }

  private ensureScheduledRefresh(delayMs: number) {
    if (!this.scheduleTrailingRefresh || this.scheduledRefresh) {
      return;
    }

    this.scheduledRefreshPromise = new Promise<void>((resolve) => {
      this.resolveScheduledRefreshPromise = resolve;
    });

    this.scheduledRefresh = this.scheduleTrailingRefresh(delayMs, () => {
      this.settleScheduledRefresh();
      this.ensureRefreshStartedOrScheduled();
    });
  }

  private ensureRefreshStartedOrScheduled() {
    if (this.destroyed || this.refreshPromise || !this.hasPendingRefresh()) {
      return;
    }

    const delayMs = this.getNextRefreshDelayMs();
    if (delayMs > 0) {
      this.ensureScheduledRefresh(delayMs);
      return;
    }

    this.cancelScheduledRefresh();
    this.startNextRefresh();
  }

  private startNextRefresh() {
    const request = this.takeNextRefreshRequest();
    if (!request) {
      return;
    }

    this.lastRefreshStartedAt = Date.now();
    this.refreshPromise = this.fetchAndApplyRefresh(
      request.waitForVersion,
    ).finally(() => {
      this.refreshPromise = undefined;
      this.ensureRefreshStartedOrScheduled();
    });
  }

  private async fetchAndApplyRefresh(waitForVersion?: number) {
    const result = await this.fetchFlags(waitForVersion);
    if (this.destroyed || !result) {
      return;
    }

    this.clearSatisfiedPendingVersion(result.flagStateVersion);

    if (!this.shouldApplyRefreshResult(result.flagStateVersion)) {
      return;
    }

    this.value = result.definitions;
    this.flagStateVersion = result.flagStateVersion;
    this.lastRefreshAt = Date.now();
    this.logger?.info("refreshed flag definitions");
  }

  private async waitForQueuedWork() {
    while (!this.destroyed) {
      const workPromise = this.refreshPromise ?? this.scheduledRefreshPromise;
      if (!workPromise) {
        return;
      }

      await workPromise;
    }
  }
}
