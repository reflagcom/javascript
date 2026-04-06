import type { CachedFlagDefinition, Logger } from "./types";

type FlagsCacheRefreshResult = {
  definitions: CachedFlagDefinition[];
  flagStateVersion?: number;
};

/**
 * Stores the latest compiled flag definitions and coordinates refresh work.
 *
 * A single instance is shared across all sync modes. We allow at most one
 * in-flight fetch plus one pending follow-up refresh. Response
 * `flagStateVersion`s decide whether fetched definitions replace the current
 * cache, so correctness does not depend on request ordering.
 */
export class FlagsCache {
  private value: CachedFlagDefinition[] | undefined;
  private flagStateVersion: number | undefined;
  private refreshPromise: Promise<void> | undefined;
  private lastRefreshAt: number | undefined;
  private destroyed = false;

  private pendingFullRefresh = false;
  private pendingWaitForVersion: number | undefined;

  constructor(
    private readonly fetchFlags: (
      waitForVersion?: number,
    ) => Promise<FlagsCacheRefreshResult | undefined>,
    private readonly logger?: Logger,
  ) {}

  public get() {
    return this.value;
  }

  public async refresh(waitForVersion?: number) {
    if (this.destroyed) {
      return this.value;
    }

    this.queueRefresh(waitForVersion);
    return await this.ensureRefreshRunning();
  }

  public async waitRefresh() {
    await this.refreshPromise;
  }

  public destroy() {
    this.destroyed = true;
    this.value = undefined;
    this.flagStateVersion = undefined;
    this.refreshPromise = undefined;
    this.pendingFullRefresh = false;
    this.pendingWaitForVersion = undefined;
    this.lastRefreshAt = undefined;
  }

  public getLastRefreshAt() {
    return this.lastRefreshAt;
  }

  // Remember the newest refresh request we still need to run after the current
  // fetch finishes. Versioned refreshes win over plain refreshes because they
  // carry a concrete target we can wait for.
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

  private async runQueuedRefreshes() {
    while (!this.destroyed) {
      const request = this.takeNextRefreshRequest();
      if (!request) {
        return;
      }

      const result = await this.fetchFlags(request.waitForVersion);
      if (this.destroyed || !result) {
        continue;
      }

      this.clearSatisfiedPendingVersion(result.flagStateVersion);

      if (!this.shouldApplyRefreshResult(result.flagStateVersion)) {
        continue;
      }

      this.value = result.definitions;
      this.flagStateVersion = result.flagStateVersion;
      this.lastRefreshAt = Date.now();
      this.logger?.info("refreshed flag definitions");
    }
  }

  private async ensureRefreshRunning() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.runQueuedRefreshes().finally(() => {
        this.refreshPromise = undefined;
      });
    }

    await this.refreshPromise;
    return this.value;
  }
}
