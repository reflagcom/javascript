import { deepEqual } from "fast-equals";

import type { BulkEvent } from "../bulkQueue";
import { FLAG_EVENTS_PER_MIN, FLAGS_EXPIRE_MS } from "../config";
import { canonicalContextJSONStringify, ReflagContext } from "../context";
import { HttpClient } from "../httpClient";
import { Logger, loggerWithPrefix } from "../logger";
import RateLimiter from "../rateLimiter";
import { getDefaultStorageAdapter, StorageAdapter } from "../storage";
import { createAbortController } from "../utils/abortController";
import { createEventTarget } from "../utils/eventTarget";
import { logResponseError, parseResponseError } from "../utils/responseError";
import { retryOnThrow } from "../utils/retry";
import { FlagCache, isObject, parseAPIFlagsResponse } from "./flagCache";
import { isValidFlagStateVersion } from "./flagStateVersion";

const INITIAL_FETCH_RETRY_DELAYS_MS = [0, 5000];

export type RawFlagOptIn = {
  /**
   * Whether the current user has opted into the flag.
   */
  userOptedIn: boolean;

  /**
   * Whether the current company has opted into the flag.
   */
  companyOptedIn: boolean;

  /**
   * Whether either the current user or company has opted into the flag.
   */
  isOptedIn: boolean;

  /**
   * Display name of the opt-in flag.
   */
  name: string;

  /**
   * SDK-facing opt-in description.
   */
  description: string | null;
};

export type OptInFlag = RawFlagOptIn & {
  /**
   * Flag key.
   */
  key: string;

  /**
   * Result of flag evaluation.
   */
  isEnabled: boolean;
};

/**
 * A flag fetched from the server.
 */
export type RawFlag = {
  /**
   * Flag key.
   */
  key: string;

  /**
   * Result of flag evaluation.
   * Note: does not take local overrides into account.
   */
  isEnabled: boolean;

  /**
   * If not null or undefined, the result is being overridden locally
   */
  isEnabledOverride?: boolean | null;

  /**
   * Version of targeting rules.
   */
  targetingVersion?: number;

  /**
   * Rule evaluation results.
   */
  ruleEvaluationResults?: boolean[];

  /**
   * Missing context fields.
   */
  missingContextFields?: string[];

  /**
   * Whether end-user opt-in is enabled for this flag.
   */
  optInEnabled?: boolean;

  /**
   * Opt-in metadata for this flag and the current context.
   */
  optIn?: RawFlagOptIn | null;

  /**
   * Optional user-defined dynamic configuration.
   */
  config?: {
    /**
     * The key of the matched configuration value.
     */
    key: string;

    /**
     * The version of the matched configuration value.
     */
    version?: number;

    /**
     * The optional user-supplied payload data.
     */
    payload?: any;

    /**
     * The rule evaluation results.
     */
    ruleEvaluationResults?: boolean[];

    /**
     * The missing context fields.
     */
    missingContextFields?: string[];
  };
};

export type RawFlags = Record<string, RawFlag>;

export type FallbackFlagOverride =
  | {
      key: string;
      payload: any;
    }
  | true;

type FallbackFlags = Record<string, FallbackFlagOverride>;

type Config = {
  timeoutMs: number;
  staleTimeMs: number;
  staleWhileRevalidate: boolean;
  expireTimeMs: number;
  offline: boolean;
};

export const DEFAULT_FLAGS_CONFIG: Config = {
  timeoutMs: 5000,
  staleTimeMs: 0,
  staleWhileRevalidate: false,
  expireTimeMs: FLAGS_EXPIRE_MS,
  offline: false,
};

export type FetchedFlagsResult = {
  flags: RawFlags;
  flagStateVersion?: number;
};

export type FlagsFetchResult = FetchedFlagsResult & {
  success: boolean;
};

export function validateFlagsResponse(
  response: any,
): FlagsFetchResult | undefined {
  if (!isObject(response)) {
    return;
  }

  if (typeof response.success !== "boolean" || !isObject(response.features)) {
    return;
  }

  const flags = parseAPIFlagsResponse(response.features);

  if (!flags) {
    return;
  }

  const flagStateVersion = isValidFlagStateVersion(response.flagStateVersion)
    ? response.flagStateVersion
    : undefined;

  return {
    success: response.success,
    flags,
    flagStateVersion,
  };
}

/**
 * Event representing checking the flag evaluation result
 */
export interface CheckEvent {
  /**
   * `check-is-enabled` means `isEnabled` was checked, `check-config` means `config` was checked.
   */
  action: "check-is-enabled" | "check-config";

  /**
   * Flag key.
   */
  key: string;

  /**
   * Result of flag or configuration evaluation.
   * If `action` is `check-is-enabled`, this is the result of the flag evaluation and `value` is a boolean.
   * If `action` is `check-config`, this is the result of the configuration evaluation.
   */
  value?: boolean | { key: string; payload: any };

  /**
   * Version of targeting rules.
   */
  version?: number;

  /**
   * Rule evaluation results.
   */
  ruleEvaluationResults?: boolean[];

  /**
   * Missing context fields.
   */
  missingContextFields?: string[];
}

const storageOverridesKey = `__reflag_overrides`;
const REFRESH_LIMIT_COUNT = 20;
const REFRESH_LIMIT_WINDOW_MS = 60 * 1000;

export type FlagOverrides = Record<string, boolean | undefined>;

type BootstrappedState = {
  flags: RawFlags;
  flagStateVersion?: number;
};

type FlagsClientOptions = Partial<Config> & {
  bootstrappedState?: BootstrappedState;
  bootstrappedFlags?: RawFlags;
  fallbackFlags?: Record<string, FallbackFlagOverride> | string[];
  cache?: FlagCache;
  rateLimiter?: RateLimiter;
  storage?: StorageAdapter;
  enqueueBulkEvent?: (event: BulkEvent) => Promise<void>;
};

/**
 * @internal
 */
export class FlagsClient {
  private initialized = false;
  private bootstrapped = false;
  private initializationComplete = false;

  private rateLimiter: RateLimiter;
  private readonly logger: Logger;

  private cache: FlagCache;
  private fetchedFlags: RawFlags = {};
  private fetchedFlagStateVersion: number | undefined;
  private fetchedFlagsContextVersion = 0;
  private flagOverrides: FlagOverrides = {};
  private flags: RawFlags = {};
  private fallbackFlags: FallbackFlags = {};
  private contextFetchVersion = 0;
  private optInFlagsRequested = false;
  private optInFlagsLoading = false;
  private optInFlagsLoadingGeneration = 0;
  private optInMetadataRefreshAttemptContextVersion: number | undefined;
  private optInMetadataRefresh:
    | {
        contextVersion: number;
        id: object;
        promise: Promise<void>;
      }
    | undefined;
  private storage: StorageAdapter;
  private refreshEvents: number[] = [];
  private enqueueBulkEvent?: (event: BulkEvent) => Promise<void>;

  private config: Config = DEFAULT_FLAGS_CONFIG;

  private eventTarget = createEventTarget();
  private abortController = createAbortController();

  constructor(
    private httpClient: HttpClient,
    private context: ReflagContext,
    logger: Logger,
    {
      bootstrappedState,
      bootstrappedFlags,
      cache,
      rateLimiter,
      fallbackFlags,
      storage,
      enqueueBulkEvent,
      ...config
    }: FlagsClientOptions = {},
  ) {
    this.config = {
      ...this.config,
      ...config,
    };

    this.logger = loggerWithPrefix(logger, "[Flags]");
    this.rateLimiter =
      rateLimiter ?? new RateLimiter(FLAG_EVENTS_PER_MIN, this.logger);
    this.enqueueBulkEvent = enqueueBulkEvent;
    this.storage = (cache ? undefined : storage) ?? getDefaultStorageAdapter();
    this.cache =
      cache ??
      this.setupCache(this.config.staleTimeMs, this.config.expireTimeMs);
    this.fallbackFlags = this.setupFallbackFlags(fallbackFlags);

    if (bootstrappedState || bootstrappedFlags) {
      this.bootstrapped = true;
      this.setFetchedFlags(
        bootstrappedState?.flags ?? bootstrappedFlags ?? {},
        false,
        bootstrappedState?.flagStateVersion,
      );
    }
  }

  async initialize() {
    if (this.initialized) {
      this.logger.warn("flags client already initialized");
      return;
    }
    this.initialized = true;

    let initializationSucceeded = false;
    try {
      const cachedOverrides = await this.getOverridesCache();
      if (Object.keys(cachedOverrides).length > 0) {
        this.flagOverrides = { ...cachedOverrides, ...this.flagOverrides };
      }

      if (!this.bootstrapped) {
        const requestContextVersion = this.contextFetchVersion;
        this.applyFetchedFlagsResult(
          await this.maybeFetchFlags(requestContextVersion),
          true,
          requestContextVersion,
        );
      }

      // Apply overrides and trigger update if flags have changed
      this.updateFlags();
      initializationSucceeded = true;
    } finally {
      this.initializationComplete = true;

      if (this.optInFlagsRequested) {
        if (initializationSucceeded && this.bootstrapped) {
          void this.refreshOptInMetadataIfNeeded();
        } else {
          this.finishOptInFlagsLoading(this.optInFlagsLoadingGeneration);
        }
      }
    }
  }

  /**
   * Stop the client.
   */
  public stop() {
    this.supersedeOptInFlagsLoading(false);
    this.abortController.abort();
  }

  getFlags(): RawFlags {
    return this.flags;
  }

  getFetchedFlags(): RawFlags {
    return this.fetchedFlags;
  }

  requestOptInFlags() {
    this.optInFlagsRequested = true;

    if (
      !this.initializationComplete ||
      this.fetchedFlagsContextVersion !== this.contextFetchVersion
    ) {
      if (!this.bootstrapped || !this.hasOptInMetadataForCurrentContext()) {
        this.ensureOptInFlagsLoading();
      }
      return;
    }

    if (!this.bootstrapped) {
      this.finishOptInFlagsLoading(this.optInFlagsLoadingGeneration);
      return;
    }

    void this.refreshOptInMetadataIfNeeded();
  }

  getIsLoadingOptInFlags() {
    return this.optInFlagsLoading;
  }

  onOptInFlagsLoadingUpdated(callback: (isLoading: boolean) => void) {
    const listener = () => callback(this.optInFlagsLoading);
    this.eventTarget.addEventListener("optInFlagsLoadingUpdated", listener, {
      signal: this.abortController.signal,
    });
  }

  resetOptInMetadataRefresh() {
    this.optInMetadataRefreshAttemptContextVersion = undefined;
  }

  markBootstrappedStateApplied() {
    this.bootstrapped = true;
    if (!this.optInFlagsRequested) return;

    if (this.hasOptInMetadataForCurrentContext()) {
      this.finishOptInFlagsLoading(this.optInFlagsLoadingGeneration);
      return;
    }

    this.ensureOptInFlagsLoading();
    if (this.initializationComplete) {
      void this.refreshOptInMetadataIfNeeded();
    }
  }

  async refreshOptInMetadataIfNeeded(): Promise<void> {
    if (!this.bootstrapped || !this.optInFlagsRequested) return;

    if (
      !this.initializationComplete ||
      this.fetchedFlagsContextVersion !== this.contextFetchVersion
    ) {
      this.ensureOptInFlagsLoading();
      return;
    }

    if (this.hasOptInMetadataForCurrentContext()) {
      this.finishOptInFlagsLoading(this.optInFlagsLoadingGeneration);
      return;
    }

    const contextVersion = this.contextFetchVersion;
    const pendingRefresh = this.optInMetadataRefresh;
    if (pendingRefresh?.contextVersion === contextVersion) {
      return pendingRefresh.promise;
    }

    if (
      this.config.offline ||
      this.optInMetadataRefreshAttemptContextVersion === contextVersion
    ) {
      this.finishOptInFlagsLoading(this.optInFlagsLoadingGeneration);
      return;
    }

    this.optInMetadataRefreshAttemptContextVersion = contextVersion;
    this.ensureOptInFlagsLoading();
    const loadingGeneration = this.optInFlagsLoadingGeneration;
    const id = {};
    const promise = (async () => {
      try {
        await this.refreshFlags(this.fetchedFlagStateVersion);
      } catch (error) {
        this.logger.error("error refreshing opt-in flag metadata", error);
      } finally {
        if (this.optInMetadataRefresh?.id === id) {
          this.optInMetadataRefresh = undefined;
        }
        this.finishOptInFlagsLoading(loadingGeneration);
      }
    })();

    this.optInMetadataRefresh = { contextVersion, id, promise };
    return promise;
  }

  setContextWithoutFetch(
    context: ReflagContext,
    invalidatePendingFetches = false,
  ) {
    if (!deepEqual(this.context, context) || invalidatePendingFetches) {
      this.contextFetchVersion += 1;
      if (this.optInFlagsRequested) {
        this.startOptInFlagsLoading();
      }
    }
    this.context = context;
  }

  setFetchedFlags(
    fetchedFlags: RawFlags,
    triggerEvent = true,
    flagStateVersion?: number,
  ) {
    // Create a new fetched flags object making sure to clone the flags
    this.fetchedFlags = { ...fetchedFlags };
    this.fetchedFlagStateVersion = flagStateVersion;
    this.fetchedFlagsContextVersion = this.contextFetchVersion;
    this.warnMissingFlagContextFields(fetchedFlags);
    this.updateFlags(triggerEvent);
  }

  private shouldApplyFetchedFlagsResult(
    flagStateVersion: number | undefined,
    requestContextVersion: number,
  ) {
    if (requestContextVersion !== this.contextFetchVersion) {
      return false;
    }

    // A result for the current context must replace flags that still belong to
    // the previous context, even when the result is unversioned.
    if (this.fetchedFlagsContextVersion !== requestContextVersion) {
      return true;
    }

    if (flagStateVersion === undefined) {
      return this.fetchedFlagStateVersion === undefined;
    }

    return (
      this.fetchedFlagStateVersion === undefined ||
      flagStateVersion >= this.fetchedFlagStateVersion
    );
  }

  private applyFetchedFlagsResult(
    result: FetchedFlagsResult | undefined,
    triggerEvent = true,
    requestContextVersion = this.contextFetchVersion,
  ) {
    if (
      !this.shouldApplyFetchedFlagsResult(
        result?.flagStateVersion,
        requestContextVersion,
      )
    ) {
      return false;
    }

    this.setFetchedFlags(
      result?.flags ?? {},
      triggerEvent,
      result?.flagStateVersion,
    );
    return true;
  }

  async setContext(context: ReflagContext) {
    this.context = context;
    const requestVersion = ++this.contextFetchVersion;
    this.optInMetadataRefreshAttemptContextVersion = requestVersion;
    const loadingGeneration = this.optInFlagsRequested
      ? this.startOptInFlagsLoading()
      : undefined;

    try {
      const fetchedFlags = await this.maybeFetchFlags(requestVersion);

      if (requestVersion !== this.contextFetchVersion) {
        return false;
      }

      this.applyFetchedFlagsResult(fetchedFlags, true, requestVersion);
      return true;
    } finally {
      if (loadingGeneration !== undefined) {
        this.finishOptInFlagsLoading(loadingGeneration);
      }
    }
  }

  updateFlags(triggerEvent = true) {
    const updatedFlags = this.mergeFlags(this.fetchedFlags, this.flagOverrides);
    // Nothing has changed, skipping update
    if (deepEqual(this.flags, updatedFlags)) return;
    this.flags = updatedFlags;
    if (triggerEvent) this.triggerFlagsUpdated();
  }

  setFlagOverride(key: string, isEnabled: boolean | null) {
    if (!(typeof isEnabled === "boolean" || isEnabled === null)) {
      throw new Error("setFlagOverride: isEnabled must be boolean or null");
    }

    if (isEnabled === null) {
      delete this.flagOverrides[key];
    } else {
      this.flagOverrides[key] = isEnabled;
    }
    // TODO(next major): make this async and await storage persistence.
    void this.setOverridesCache(this.flagOverrides);

    this.updateFlags();
  }

  getFlagOverride(key: string): boolean | null {
    return this.flagOverrides[key] ?? null;
  }

  /**
   * Register a callback to be called when the flags are updated.
   * Flags are not guaranteed to have actually changed when the callback is called.
   *
   * @param callback this will be called when the flags are updated.
   * @returns a function that can be called to remove the listener
   */
  onUpdated(callback: () => void) {
    this.eventTarget.addEventListener("flagsUpdated", callback, {
      signal: this.abortController.signal,
    });
  }

  /**
   * Send a flag "check" event.
   *
   *
   * @param checkEvent - The flag to send the event for.
   * @param cb - Callback to call after the event is sent. Might be skipped if the event was rate limited.
   */
  async sendCheckEvent(checkEvent: CheckEvent, cb: () => void) {
    if (this.config.offline) {
      return;
    }

    const rateLimitKey = `check-event:${this.fetchParams().toString()}:${checkEvent.key}:${checkEvent.version}:${checkEvent.value}`;
    await this.rateLimiter.rateLimited(rateLimitKey, async () => {
      const payload = {
        action: checkEvent.action,
        key: checkEvent.key,
        targetingVersion: checkEvent.version,
        evalContext: this.context,
        evalResult: checkEvent.value,
        evalRuleResults: checkEvent.ruleEvaluationResults,
        evalMissingFields: checkEvent.missingContextFields,
      };

      if (this.enqueueBulkEvent) {
        this.enqueueBulkEvent({
          type: "feature-flag-event",
          action: payload.action,
          key: payload.key,
          targetingVersion: payload.targetingVersion,
          evalContext: payload.evalContext,
          evalResult: payload.evalResult,
          evalRuleResults: payload.evalRuleResults,
          evalMissingFields: payload.evalMissingFields,
        }).catch((e: any) => {
          this.logger.warn(`failed to enqueue flag check event`, e);
        });
      } else {
        this.httpClient
          .post({
            path: "features/events",
            body: payload,
          })
          .then(async (res) => {
            if (res.ok) {
              return;
            }

            await logResponseError({
              logger: this.logger,
              level: "warn",
              res,
              message: "failed to send flag check event",
            });
          })
          .catch((e: any) => {
            this.logger.warn(`failed to send flag check event`, e);
          });
      }

      this.logger.debug(`sent flag event`, payload);
      cb();
    });

    return checkEvent.value;
  }

  getFlagStateVersion(): number | undefined {
    return this.fetchedFlagStateVersion;
  }

  async fetchFlags(
    waitForVersion?: number,
  ): Promise<FlagsFetchResult | undefined> {
    const params = this.fetchParams();
    if (
      waitForVersion !== undefined &&
      Number.isInteger(waitForVersion) &&
      waitForVersion >= 0
    ) {
      params.set("waitForVersion", String(waitForVersion));
    }
    try {
      return await retryOnThrow(INITIAL_FETCH_RETRY_DELAYS_MS, async () => {
        const res = await this.httpClient.get({
          path: "/features/evaluated",
          timeoutMs: this.config.timeoutMs,
          params,
        });

        if (!res.ok) {
          let errorSummary = "";
          let fallbackBody = "";
          try {
            const { errorDetails, errorSummary: parsedSummary } =
              await parseResponseError(res);
            errorSummary = parsedSummary ?? "";
            fallbackBody = errorDetails.responseBody
              ? ` - ${errorDetails.responseBody}`
              : "";
          } catch {
            // Best-effort response parsing only; the response itself is enough to fail.
          }

          this.logger.error(
            "error fetching flags:",
            new Error(
              `unexpected response code: ${res.status}${
                errorSummary ? ` - ${errorSummary}` : fallbackBody
              }`,
            ),
          );
          return;
        }

        const typeRes = validateFlagsResponse(await res.json());
        if (!typeRes || !typeRes.success) {
          this.logger.error(
            "error fetching flags:",
            new Error("unable to validate response"),
          );
          return;
        }

        if (
          waitForVersion !== undefined &&
          (typeRes.flagStateVersion === undefined ||
            typeRes.flagStateVersion < waitForVersion)
        ) {
          this.logger.warn(
            "ignoring stale flag response for requested flag state version.",
            {
              requestedFlagStateVersion: waitForVersion,
              responseFlagStateVersion: typeRes.flagStateVersion,
            },
          );
          return;
        }

        return typeRes;
      });
    } catch (e) {
      this.logger.error("error fetching flags:", e);
      return;
    }
  }

  /**
   * Force refresh flags from the API, bypassing cache.
   */
  async refreshFlags(waitForVersion?: number): Promise<RawFlags | undefined> {
    if (this.config.offline) {
      return;
    }

    // rate limit refreshes to prevent accidental abuse
    const now = Date.now();
    this.refreshEvents = this.refreshEvents.filter(
      (timestamp) => now - timestamp < REFRESH_LIMIT_WINDOW_MS,
    );
    if (this.refreshEvents.length >= REFRESH_LIMIT_COUNT) {
      this.logger.warn("refresh rate limit exceeded");
      return;
    }
    this.refreshEvents.push(now);

    const requestContextVersion = this.contextFetchVersion;
    const result = await this.fetchFlags(waitForVersion);
    if (!result || requestContextVersion !== this.contextFetchVersion) {
      return;
    }

    this.applyFetchedFlagsResult(result, true, requestContextVersion);
    return { ...this.fetchedFlags };
  }

  private async setOverridesCache(overrides: FlagOverrides) {
    try {
      await this.storage.setItem(
        storageOverridesKey,
        JSON.stringify(overrides),
      );
    } catch (error) {
      this.logger.warn(
        "storing flag overrides failed, overrides won't persist",
        error,
      );
    }
  }

  private async getOverridesCache(): Promise<FlagOverrides> {
    try {
      const overridesStored = await this.storage.getItem(storageOverridesKey);
      const overrides = JSON.parse(overridesStored || "{}");
      if (!isObject(overrides)) throw new Error("invalid overrides");
      return overrides;
    } catch (error) {
      this.logger.warn("getting flag overrides failed", error);
      return {};
    }
  }

  private async maybeFetchFlags(
    requestContextVersion = this.contextFetchVersion,
  ): Promise<FetchedFlagsResult | undefined> {
    if (this.config.offline) {
      return;
    }

    const cacheKey = this.fetchParams().toString();
    const cachedItem = await this.cache.get(cacheKey);

    if (cachedItem) {
      if (!cachedItem.stale) return cachedItem;

      // serve successful stale cache if `staleWhileRevalidate` is enabled
      if (this.config.staleWhileRevalidate) {
        // re-fetch in the background, but immediately return last successful value
        this.fetchFlags()
          .then(async (result) => {
            if (!result) return;

            await this.cache.set(cacheKey, {
              flags: result.flags,
              flagStateVersion: result.flagStateVersion,
            });
            this.applyFetchedFlagsResult(result, true, requestContextVersion);
          })
          .catch(() => {
            // we don't care about the result, we just want to re-fetch
          });
        return cachedItem;
      }
    }

    // if there's no cached item or there is a stale one but `staleWhileRevalidate` is disabled
    // try fetching a new one
    const fetchedFlags = await this.fetchFlags();

    if (fetchedFlags) {
      await this.cache.set(cacheKey, {
        flags: fetchedFlags.flags,
        flagStateVersion: fetchedFlags.flagStateVersion,
      });
      return {
        flags: fetchedFlags.flags,
        flagStateVersion: fetchedFlags.flagStateVersion,
      };
    }

    if (cachedItem) {
      // fetch failed, return stale cache
      return cachedItem;
    }

    // fetch failed, nothing cached => return fallbacks
    return {
      flags: Object.entries(this.fallbackFlags).reduce(
        (acc, [key, override]) => {
          acc[key] = {
            key,
            isEnabled: !!override,
            config:
              typeof override === "object" && "key" in override
                ? {
                    key: override.key,
                    payload: override.payload,
                  }
                : undefined,
          };
          return acc;
        },
        {} as RawFlags,
      ),
    };
  }

  private hasOptInMetadataForCurrentContext() {
    if (this.fetchedFlagsContextVersion !== this.contextFetchVersion) {
      return false;
    }

    const fetchedFlags = Object.values(this.fetchedFlags);
    return (
      fetchedFlags.length > 0 &&
      fetchedFlags.every(
        (flag) =>
          flag.optInEnabled === false ||
          (flag.optInEnabled === true && flag.optIn !== undefined),
      )
    );
  }

  private ensureOptInFlagsLoading() {
    if (!this.optInFlagsLoading) {
      this.startOptInFlagsLoading();
    }
    return this.optInFlagsLoadingGeneration;
  }

  private startOptInFlagsLoading() {
    this.optInFlagsLoadingGeneration += 1;
    this.setOptInFlagsLoading(true);
    return this.optInFlagsLoadingGeneration;
  }

  private finishOptInFlagsLoading(generation: number) {
    if (generation !== this.optInFlagsLoadingGeneration) return;
    this.setOptInFlagsLoading(false);
  }

  private supersedeOptInFlagsLoading(isLoading: boolean) {
    this.optInFlagsLoadingGeneration += 1;
    this.setOptInFlagsLoading(isLoading);
  }

  private setOptInFlagsLoading(isLoading: boolean) {
    if (this.optInFlagsLoading === isLoading) return;

    this.optInFlagsLoading = isLoading;
    this.eventTarget.dispatchEvent({ type: "optInFlagsLoadingUpdated" });
  }

  private mergeFlags(fetchedFlags: RawFlags, overrides: FlagOverrides) {
    const mergedFlags: RawFlags = {};
    // merge fetched flags with overrides into `this.flags`
    for (const key in fetchedFlags) {
      const fetchedFlag = fetchedFlags[key];
      if (!fetchedFlag) continue;
      const isEnabledOverride = overrides[key] ?? null;
      mergedFlags[key] = { ...fetchedFlag, isEnabledOverride };
    }
    return mergedFlags;
  }

  private triggerFlagsUpdated() {
    this.eventTarget.dispatchEvent({ type: "flagsUpdated" });
  }

  private setupCache(staleTimeMs = 0, expireTimeMs = FLAGS_EXPIRE_MS) {
    return new FlagCache({
      storage: this.storage,
      staleTimeMs,
      expireTimeMs,
    });
  }

  private setupFallbackFlags(
    fallbackFlags?: Record<string, FallbackFlagOverride> | string[],
  ) {
    if (Array.isArray(fallbackFlags)) {
      return fallbackFlags.reduce(
        (acc, key) => {
          acc[key] = true;
          return acc;
        },
        {} as Record<string, FallbackFlagOverride>,
      );
    } else {
      return fallbackFlags ?? {};
    }
  }

  private fetchParams() {
    const contextJson = canonicalContextJSONStringify(this.context);
    const params = new URLSearchParams(
      contextJson ? { contextJson } : undefined,
    );
    // publishableKey should be part of the cache key
    params.append("publishableKey", this.httpClient.publishableKey);

    // sort the params to ensure that the URL is the same for the same context
    params.sort();

    return params;
  }

  private warnMissingFlagContextFields(flags: RawFlags) {
    const report: Record<string, string[]> = {};
    for (const flagKey in flags) {
      const flag = flags[flagKey];
      if (flag?.missingContextFields?.length) {
        report[flag.key] = flag.missingContextFields;
      }

      if (flag?.config?.missingContextFields?.length) {
        report[`${flag.key}.config`] = flag.config.missingContextFields;
      }
    }

    if (Object.keys(report).length > 0) {
      this.rateLimiter.rateLimited(
        `flag-missing-context-fields:${this.fetchParams().toString()}`,
        () => {
          this.logger.warn(
            `flag targeting rules might not be correctly evaluated due to missing context fields.`,
            report,
          );
        },
      );
    }
  }
}
