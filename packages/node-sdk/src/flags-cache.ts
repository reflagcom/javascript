import type { CachedFlagDefinition, Logger } from "./types";

const DEFAULT_MIN_REFRESH_INTERVAL_MS = 1000;

/** ETags belong to their snapshot, even when persistence publishes them later. */
export type FlagsCacheSnapshot = {
  readonly definitions: CachedFlagDefinition[];
  readonly flagStateVersion?: number;
  etag?: string;
};

type FlagsCacheRefreshResult = FlagsCacheSnapshot | { notModified: true };

type CancelScheduledRefresh = () => void;

type ScheduledRefresh = {
  cancel: CancelScheduledRefresh;
  promise: Promise<void>;
  resolve: () => void;
};

type FlagsCacheOptions = {
  logger?: Logger;
  minRefreshIntervalMs?: number;
  scheduleTrailingRefresh?: (
    delayMs: number,
    callback: () => void,
  ) => CancelScheduledRefresh;
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
  private snapshot: FlagsCacheSnapshot | undefined;
  private refreshPromise: Promise<void> | undefined;
  private scheduledRefresh: ScheduledRefresh | undefined;
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
    return this.snapshot?.definitions;
  }

  public getFlagStateVersion() {
    return this.snapshot?.flagStateVersion;
  }

  public getETag() {
    return this.snapshot?.etag;
  }

  public async refresh(waitForVersion?: number) {
    if (this.destroyed) {
      return this.get();
    }

    this.queueRefresh(waitForVersion);
    this.ensureRefreshStartedOrScheduled();
    await this.waitForQueuedWork();
    return this.get();
  }

  public async waitRefresh() {
    await this.waitForQueuedWork();
  }

  public destroy() {
    this.destroyed = true;
    this.snapshot = undefined;
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
      const currentVersion = this.getFlagStateVersion();
      if (currentVersion !== undefined && currentVersion >= waitForVersion) {
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
    const currentVersion = this.getFlagStateVersion();
    if (flagStateVersion === undefined) {
      return currentVersion === undefined;
    }

    return currentVersion === undefined || flagStateVersion >= currentVersion;
  }

  private clearSatisfiedPendingVersion(seenFlagStateVersion?: number) {
    if (this.pendingWaitForVersion === undefined) {
      return;
    }

    const latestKnownVersion = Math.max(
      this.getFlagStateVersion() ?? -1,
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
    const scheduledRefresh = this.scheduledRefresh;
    this.scheduledRefresh = undefined;
    scheduledRefresh?.resolve();
  }

  private cancelScheduledRefresh() {
    const scheduledRefresh = this.scheduledRefresh;
    this.scheduledRefresh = undefined;
    scheduledRefresh?.cancel();
    scheduledRefresh?.resolve();
  }

  private ensureScheduledRefresh(delayMs: number) {
    if (!this.scheduleTrailingRefresh || this.scheduledRefresh) {
      return;
    }

    let resolve!: () => void;
    const promise = new Promise<void>((innerResolve) => {
      resolve = innerResolve;
    });

    const cancel = this.scheduleTrailingRefresh(delayMs, () => {
      this.settleScheduledRefresh();
      this.ensureRefreshStartedOrScheduled();
    });

    this.scheduledRefresh = {
      cancel,
      promise,
      resolve,
    };
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

    if ("notModified" in result) {
      if (!this.snapshot?.etag || waitForVersion !== undefined) {
        return;
      }

      this.lastRefreshAt = Date.now();
      this.logger?.debug("flag definitions unchanged");
      return;
    }

    this.clearSatisfiedPendingVersion(result.flagStateVersion);

    if (!this.shouldApplyRefreshResult(result.flagStateVersion)) {
      return;
    }

    this.snapshot = result;
    this.lastRefreshAt = Date.now();
    this.logger?.info("refreshed flag definitions");
  }

  private async waitForQueuedWork() {
    while (!this.destroyed) {
      const workPromise = this.refreshPromise ?? this.scheduledRefresh?.promise;
      if (!workPromise) {
        return;
      }

      await workPromise;
    }
  }
}
