import type { CachedFlagDefinition, Logger } from "./types";

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
