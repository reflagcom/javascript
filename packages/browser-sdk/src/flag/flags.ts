import { deepEqual } from "fast-equals";
import Cookies from "js-cookie";

import { FLAG_EVENTS_PER_MIN, FLAGS_EXPIRE_MS } from "../config";
import { ReflagContext } from "../context";
import { HttpClient } from "../httpClient";
import { Logger, loggerWithPrefix } from "../logger";
import RateLimiter from "../rateLimiter";

import { FlagCache, isObject, parseAPIFlagsResponse } from "./flagCache";

/**
 * A flag fetched from the server.
 */
export type FetchedFlag = {
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

export type FetchedFlags = Record<string, FetchedFlag | undefined>;

export type RawFlag = FetchedFlag & {
  /**
   * If not null, the result is being overridden locally
   */
  isEnabledOverride: boolean | null;
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

export function validateFlagsResponse(response: any) {
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

  return {
    success: response.success,
    flags,
  };
}

export function flattenJSON(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    if (typeof obj[key] === "object") {
      const flat = flattenJSON(obj[key]);
      for (const flatKey in flat) {
        result[`${key}.${flatKey}`] = flat[flatKey];
      }
    } else if (typeof obj[key] !== "undefined") {
      result[key] = obj[key];
    }
  }
  return result;
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

const localStorageFetchedFlagsKey = `__reflag_fetched_flags`;
const overridesCookieKey = `__reflag_overrides`;

type OverridesFlags = Record<string, boolean | null>;

type FlagsClientOptions = Partial<Config> & {
  bootstrappedFlags?: FetchedFlags;
  fallbackFlags?: Record<string, FallbackFlagOverride> | string[];
  cache?: FlagCache;
  rateLimiter?: RateLimiter;
};

/**
 * @internal
 */
export class FlagsClient {
  private initialized = false;
  private rateLimiter: RateLimiter;
  private readonly logger: Logger;

  private cache: FlagCache;
  private fetchedFlags: FetchedFlags = {};
  private flagOverrides: OverridesFlags = {};
  private flags: RawFlags = {};
  private fallbackFlags: FallbackFlags = {};

  private config: Config = DEFAULT_FLAGS_CONFIG;

  private eventTarget = new EventTarget();
  private abortController: AbortController = new AbortController();

  constructor(
    private httpClient: HttpClient,
    private context: ReflagContext,
    logger: Logger,
    {
      bootstrappedFlags,
      cache,
      rateLimiter,
      fallbackFlags,
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
    this.cache =
      cache ??
      this.setupCache(this.config.staleTimeMs, this.config.expireTimeMs);
    this.fallbackFlags = this.setupFallbackFlags(fallbackFlags);

    try {
      const storedFlagOverrides = this.getOverridesCache();
      for (const key in storedFlagOverrides) {
        this.flagOverrides[key] = storedFlagOverrides[key];
      }
    } catch (e) {
      this.logger.warn("error getting flag overrides from cache", e);
      this.flagOverrides = {};
    }

    if (bootstrappedFlags) {
      this.initialized = true;
      this.setFetchedFlags(bootstrappedFlags, false);
    }
  }

  async initialize() {
    if (this.initialized) {
      this.logger.warn("flags client already initialized");
      return;
    }
    this.initialized = true;
    this.setFetchedFlags((await this.maybeFetchFlags()) || {});
  }

  /**
   * Stop the client.
   */
  public stop() {
    this.abortController.abort();
  }

  getFlags(): RawFlags {
    return this.flags;
  }

  getFetchedFlags(): FetchedFlags {
    return this.fetchedFlags;
  }

  setFetchedFlags(flags: FetchedFlags, triggerEvent = true) {
    // Nothing has changed, skipping update
    if (deepEqual(this.fetchedFlags, flags)) return;
    this.warnMissingFlagContextFields(flags);
    this.fetchedFlags = flags;
    this.flags = this.mergeFlags(this.fetchedFlags, this.flagOverrides);
    if (triggerEvent) this.triggerFlagsUpdated();
  }

  async setContext(context: ReflagContext) {
    this.context = context;
    this.setFetchedFlags((await this.maybeFetchFlags()) || {});
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
    this.setOverridesCache(this.flagOverrides);

    this.flags = this.mergeFlags(this.fetchedFlags, this.flagOverrides);
    this.triggerFlagsUpdated();
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

      this.httpClient
        .post({
          path: "features/events",
          body: payload,
        })
        .catch((e: any) => {
          this.logger.warn(`failed to send flag check event`, e);
        });

      this.logger.debug(`sent flag event`, payload);
      cb();
    });

    return checkEvent.value;
  }

  async fetchFlags(): Promise<FetchedFlags | undefined> {
    const params = this.fetchParams();
    try {
      const res = await this.httpClient.get({
        path: "/features/evaluated",
        timeoutMs: this.config.timeoutMs,
        params,
      });

      if (!res.ok) {
        let errorBody = null;
        try {
          errorBody = await res.json();
        } catch {
          // ignore
        }

        throw new Error(
          "unexpected response code: " +
            res.status +
            " - " +
            JSON.stringify(errorBody),
        );
      }

      const typeRes = validateFlagsResponse(await res.json());
      if (!typeRes || !typeRes.success) {
        throw new Error("unable to validate response");
      }

      return typeRes.flags;
    } catch (e) {
      this.logger.error("error fetching flags: ", e);
      return;
    }
  }

  private setOverridesCache(overrides: OverridesFlags) {
    try {
      Cookies.set(overridesCookieKey, JSON.stringify(overrides), {
        expires: 7, // 1 week
        sameSite: "strict",
      });
    } catch {
      this.logger.warn(
        "storing flag overrides in cookies failed, overrides won't persist",
      );
    }
  }

  private getOverridesCache(): OverridesFlags {
    try {
      const overridesCookie = Cookies.get(overridesCookieKey);
      const overrides = JSON.parse(overridesCookie || "{}");
      if (!isObject(overrides)) throw new Error("invalid overrides");
      return overrides;
    } catch {
      this.logger.warn("getting flag overrides from cookies failed");
      return {};
    }
  }

  private async maybeFetchFlags(): Promise<FetchedFlags | undefined> {
    if (this.config.offline) {
      return;
    }

    const cacheKey = this.fetchParams().toString();
    const cachedItem = this.cache.get(cacheKey);

    if (cachedItem) {
      if (!cachedItem.stale) return cachedItem.flags;

      // serve successful stale cache if `staleWhileRevalidate` is enabled
      if (this.config.staleWhileRevalidate) {
        // re-fetch in the background, but immediately return last successful value
        this.fetchFlags()
          .then((flags) => {
            if (!flags) return;

            this.cache.set(cacheKey, {
              flags,
            });
            this.setFetchedFlags(flags);
          })
          .catch(() => {
            // we don't care about the result, we just want to re-fetch
          });
        return cachedItem.flags;
      }
    }

    // if there's no cached item or there is a stale one but `staleWhileRevalidate` is disabled
    // try fetching a new one
    const fetchedFlags = await this.fetchFlags();

    if (fetchedFlags) {
      this.cache.set(cacheKey, {
        flags: fetchedFlags,
      });
      return fetchedFlags;
    }

    if (cachedItem) {
      // fetch failed, return stale cache
      return cachedItem.flags;
    }

    // fetch failed, nothing cached => return fallbacks
    return Object.entries(this.fallbackFlags).reduce((acc, [key, override]) => {
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
    }, {} as FetchedFlags);
  }

  private mergeFlags(fetchedFlags: FetchedFlags, overrides: OverridesFlags) {
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
    this.eventTarget.dispatchEvent(new Event("flagsUpdated"));
  }

  private setupCache(staleTimeMs = 0, expireTimeMs = FLAGS_EXPIRE_MS) {
    return new FlagCache({
      storage:
        typeof localStorage !== "undefined"
          ? {
              get: () => localStorage.getItem(localStorageFetchedFlagsKey),
              set: (value) =>
                localStorage.setItem(localStorageFetchedFlagsKey, value),
            }
          : {
              get: () => null,
              set: () => void 0,
            },
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
    const flattenedContext = flattenJSON({ context: this.context });
    const params = new URLSearchParams(flattenedContext);
    // publishableKey should be part of the cache key
    params.append("publishableKey", this.httpClient.publishableKey);

    // sort the params to ensure that the URL is the same for the same context
    params.sort();

    return params;
  }

  private warnMissingFlagContextFields(flags: FetchedFlags) {
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
