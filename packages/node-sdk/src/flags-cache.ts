import type { CachedFlagDefinition, Logger } from "./types";

/**
 * Stores the latest compiled flag definitions and coordinates refresh work.
 *
 * A single instance is shared across all sync modes. Refresh requests are
 * coalesced so concurrent callers reuse the same in-flight fetch, and newer
 * version-targeted refreshes can replace older queued ones.
 */
export class FlagsCache {
  private value: CachedFlagDefinition[] | undefined;
  private refreshPromise: Promise<void> | undefined;
  private lastRefreshAt: number | undefined;
  private destroyed = false;

  private currentRefreshWaitForVersion: number | undefined;
  private queuedFullRefresh = false;
  private queuedWaitForVersion: number | undefined;

  constructor(
    private readonly fetchFlags: (
      waitForVersion?: number,
    ) => Promise<CachedFlagDefinition[] | undefined>,
    private readonly logger?: Logger,
  ) {}

  public get() {
    return this.value;
  }

  public async refresh(waitForVersion?: number) {
    this.queueRefresh(waitForVersion);
    return await this.ensureRefreshRunning();
  }

  public async waitRefresh() {
    await this.refreshPromise;
  }

  public destroy() {
    this.destroyed = true;
    this.value = undefined;
    this.refreshPromise = undefined;
    this.currentRefreshWaitForVersion = undefined;
    this.queuedFullRefresh = false;
    this.queuedWaitForVersion = undefined;
    this.lastRefreshAt = undefined;
  }

  public getLastRefreshAt() {
    return this.lastRefreshAt;
  }

  // Queue the next refresh request.
  //
  // `refresh(123)` means "fetch at least version 123" and takes precedence over
  // a plain refresh because it is more specific. Plain refreshes are only queued
  // when there isn't already queued or in-flight versioned work.
  private queueRefresh(waitForVersion?: number) {
    if (waitForVersion !== undefined) {
      this.queuedWaitForVersion =
        this.queuedWaitForVersion === undefined
          ? waitForVersion
          : Math.max(this.queuedWaitForVersion, waitForVersion);
      this.queuedFullRefresh = false;
      return;
    }

    if (
      this.queuedWaitForVersion !== undefined ||
      this.currentRefreshWaitForVersion !== undefined ||
      this.refreshPromise
    ) {
      return;
    }

    this.queuedFullRefresh = true;
  }

  // Drain queued refresh work until nothing remains.
  //
  // New refresh requests may arrive while `fetchFlags()` is running. By looping,
  // we can pick up any queued follow-up work before clearing `refreshPromise`.
  private async runRefreshLoop() {
    while (!this.destroyed) {
      let waitForVersion: number | undefined;
      if (this.queuedWaitForVersion !== undefined) {
        waitForVersion = this.queuedWaitForVersion;
        this.queuedWaitForVersion = undefined;
      } else if (this.queuedFullRefresh) {
        this.queuedFullRefresh = false;
      } else {
        break;
      }

      this.currentRefreshWaitForVersion = waitForVersion;
      try {
        const nextValue = await this.fetchFlags(waitForVersion);
        if (nextValue !== undefined) {
          this.value = nextValue;
          this.lastRefreshAt = Date.now();
          this.logger?.info("refreshed flag definitions");
        }
      } finally {
        this.currentRefreshWaitForVersion = undefined;
      }
    }
  }

  // Start the refresh loop at most once and let concurrent callers await the
  // same shared promise.
  private async ensureRefreshRunning() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.runRefreshLoop().finally(() => {
        this.refreshPromise = undefined;
      });
    }

    await this.refreshPromise;
    return this.value;
  }
}
