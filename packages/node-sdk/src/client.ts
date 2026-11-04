import fs from "fs";

import { flattenContext } from "@reflag/flag-evaluation";

import BatchBuffer from "./batch-buffer";
import {
  API_BASE_URL,
  API_TIMEOUT_MS,
  FLAG_EVENT_RATE_LIMITER_WINDOW_SIZE_MS,
  FLAGS_REFETCH_MS,
  loadConfig,
  PUBSUB_SSE_URL,
  REFLAG_LOG_PREFIX,
  SDK_VERSION,
  SDK_VERSION_HEADER_NAME,
} from "./config";
import fetchClient, { withRetry } from "./fetch-http-client";
import {
  applyFlagDefault,
  checkFlagDefault,
  flagValueType,
} from "./flag-defaults";
import { isFlagValue, prepareFlagCollection } from "./flag-definitions";
import { FlagsCache } from "./flags-cache";
import {
  createFlagsSyncController,
  type FlagsSyncController,
} from "./flags-refresher";
import { isFlagsFallbackSnapshot } from "./flagsFallbackProvider";
import { subscribe as triggerOnExit } from "./flusher";
import { newRateLimiter } from "./rate-limiter";
import type {
  BootstrappedFlags,
  ClientOptions,
  Context,
  ContextWithTracking,
  EvaluatedFlagsAPIResponse,
  FlagCollection,
  FlagDefaultValue,
  FlagEvent,
  FlagOverrides,
  FlagOverridesFn,
  FlagsAPIResponse,
  FlagsFallbackSnapshot,
  FlagValue,
  FlagValueFromDefault,
  HttpClient,
  IdType,
  Logger,
  RawFlag,
  RawFlags,
  TrackOptions,
  TypedFlagKey,
  TypedFlags,
} from "./types";
import {
  applyLogLevel,
  canonicalContextJSONStringify,
  canonicalJSONStringify,
  decorateLogger,
  hashObject,
  hashString,
  idOk,
  isObject,
  mergeSkipUndefined,
  ok,
  once,
} from "./utils";

type BulkEvent =
  | ({ type: "feature-flag-event" } & FlagEvent)
  | {
      type: "company";
      companyId: IdType;
      userId?: IdType;
      attributes?: TrackOptions["attributes"];
      context?: TrackOptions["meta"];
    }
  | {
      type: "user";
      userId: IdType;
      attributes?: TrackOptions["attributes"];
      context?: TrackOptions["meta"];
    }
  | {
      type: "event";
      event: string;
      userId: IdType;
      companyId?: IdType;
      attributes?: TrackOptions["attributes"];
      context?: TrackOptions["meta"];
    };

function normalizeOverrides(
  overrides?: FlagOverrides | FlagOverridesFn,
): FlagOverridesFn {
  ok(
    overrides === undefined ||
      typeof overrides === "function" ||
      (isObject(overrides) && isFlagValue(overrides)),
    "flagOverrides must be a JSON value map or function",
  );
  if (typeof overrides !== "function") return () => overrides ?? {};
  return (context) => {
    const result = overrides(context);
    ok(
      isObject(result) && isFlagValue(result),
      "flagOverrides must return a JSON value map",
    );
    return result;
  };
}
function scheduleRefresh(delayMs: number, callback: () => void) {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}
function copyValue(value: RawFlag["value"]): RawFlag["value"] {
  return value === undefined ? undefined : structuredClone(value);
}
function localResult(key: string, value: RawFlag["value"]): RawFlag {
  return { flagKey: key, resolved: false, value, ruleResults: [], errors: [] };
}
function contextOnly({
  enableTracking: _,
  meta: __,
  ...context
}: ContextWithTracking): Context {
  return context;
}

/** V2 client: flag reads return values and immediately register checks. */
export class ReflagClient {
  public readonly logger: Logger;
  public readonly httpClient: HttpClient;
  private readonly config;
  private readonly flagsCache: FlagsCache;
  private readonly flagsSyncController: FlagsSyncController;
  private readonly batchBuffer: BatchBuffer<BulkEvent>;
  private readonly rateLimiter = newRateLimiter(
    FLAG_EVENT_RATE_LIMITER_WINDOW_SIZE_MS,
  );
  private baseOverrides: FlagOverridesFn;
  private overrideLayers: { overrides: FlagOverridesFn }[] = [];
  private initialized = false;
  private canLoadFallback = true;
  private fallbackSave = Promise.resolve();
  private readonly initializeOnce = once(async () => {
    if (!this.config.offline) {
      await this.flagsSyncController.start();
      await this.flagsCache.refresh();
    }
    this.initialized = true;
    this.logger.info(
      `Reflag initialized${this.config.offline ? " (offline mode)" : ""}`,
    );
  });

  constructor(options: ClientOptions = {}) {
    ok(isObject(options), "options must be an object");
    for (const key of [
      "host",
      "apiBaseUrl",
      "flagsPushUrl",
      "secretKey",
    ] as const) {
      ok(
        options[key] === undefined ||
          (typeof options[key] === "string" && options[key].length > 0),
        `${key} must be a non-empty string`,
      );
    }
    for (const key of ["logger", "httpClient", "batchOptions"] as const)
      ok(
        options[key] === undefined || isObject(options[key]),
        `${key} must be an object`,
      );
    for (const key of ["flagsFetchRetries", "fetchTimeoutMs"] as const)
      ok(
        options[key] === undefined ||
          (Number.isInteger(options[key]) && options[key] >= 0),
        `${key} must be a non-negative integer`,
      );
    ok(
      options.offline === undefined || typeof options.offline === "boolean",
      "offline must be a boolean",
    );
    ok(
      options.configFile === undefined ||
        typeof options.configFile === "string",
      "configFile must be a string",
    );
    ok(
      options.flagsFallbackProvider === undefined ||
        (isObject(options.flagsFallbackProvider) &&
          typeof options.flagsFallbackProvider.load === "function" &&
          typeof options.flagsFallbackProvider.save === "function"),
      "flagsFallbackProvider must have load/save functions",
    );
    const configFile =
      options.configFile ??
      process.env.REFLAG_CONFIG_FILE ??
      (fs.existsSync("reflag.config.json") ? "reflag.config.json" : undefined);
    const config = mergeSkipUndefined(loadConfig(configFile), options);
    const offline = config.offline ?? process.env.NODE_ENV === "test";
    ok(
      offline ||
        (typeof config.secretKey === "string" && config.secretKey.length > 22),
      "a valid secretKey is required unless offline=true",
    );
    this.logger =
      options.logger ??
      applyLogLevel(
        decorateLogger(REFLAG_LOG_PREFIX, console),
        config.logLevel ?? "INFO",
      );
    this.httpClient = options.httpClient ?? fetchClient;
    this.baseOverrides = normalizeOverrides(config.flagOverrides);
    const fallbackFlags = Array.isArray(options.fallbackFlags)
      ? Object.fromEntries(options.fallbackFlags.map((key) => [key, true]))
      : (options.fallbackFlags ?? {});
    ok(
      isObject(fallbackFlags) && isFlagValue(fallbackFlags),
      "fallbackFlags must contain JSON values",
    );
    const flagsSyncMode =
      options.flagsSyncMode ??
      (options.cacheStrategy === "in-request"
        ? "in-request"
        : options.cacheStrategy === "periodically-update"
          ? "polling"
          : "push");
    ok(
      ["polling", "push", "in-request"].includes(flagsSyncMode),
      "invalid flagsSyncMode",
    );
    const pushUrl = new URL(options.flagsPushUrl ?? PUBSUB_SSE_URL);
    pushUrl.searchParams.delete("channels");
    this.config = {
      offline,
      fallbackFlags,
      flagsFallbackProvider: options.flagsFallbackProvider,
      fallbackContext: {
        secretKeyHash: config.secretKey ? hashString(config.secretKey) : "",
      },
      apiBaseUrl: (config.apiBaseUrl ?? config.host ?? API_BASE_URL).replace(
        /\/?$/,
        "/",
      ),
      fetchTimeoutMs: options.fetchTimeoutMs ?? API_TIMEOUT_MS,
      flagsFetchRetries: options.flagsFetchRetries ?? 3,
      headers: {
        "Content-Type": "application/json",
        [SDK_VERSION_HEADER_NAME]: SDK_VERSION,
        Authorization: `Bearer ${config.secretKey}`,
      },
    };
    this.batchBuffer = new BatchBuffer({
      ...config.batchOptions,
      logger: this.logger,
      flushHandler: (events) => this.post("bulk", events),
    });
    if (!offline && (config.batchOptions?.flushOnExit ?? true))
      triggerOnExit(() => this.flush());
    this.flagsCache = new FlagsCache(
      async (waitForVersion) => {
        const response = await this.get<FlagsAPIResponse>(
          `flags${waitForVersion === undefined ? "" : `?waitForVersion=${encodeURIComponent(waitForVersion)}`}`,
          this.config.flagsFetchRetries,
        );
        try {
          if (
            !response ||
            response.protocolVersion !== 2 ||
            !Number.isSafeInteger(response.flagStateVersion) ||
            response.flagStateVersion < 0
          )
            throw new Error("invalid v2 flag response");
          return {
            definitions: prepareFlagCollection(response),
            flagStateVersion: response.flagStateVersion,
          };
        } catch (error) {
          this.logger.debug("flag collection unavailable or invalid", error);
          return this.loadFallback();
        }
      },
      {
        logger: this.logger,
        scheduleTrailingRefresh:
          flagsSyncMode === "in-request" ? undefined : scheduleRefresh,
        onApply: ({ definitions, flagStateVersion, fallback }) => {
          if (fallback) return;
          this.canLoadFallback = false;
          if (!this.config.flagsFallbackProvider) return;
          // Persist only accepted snapshots, and serialize saves to prevent an old
          // slow write from overwriting a newer collection in external storage.
          const snapshot: FlagsFallbackSnapshot = structuredClone({
            version: 2,
            savedAt: new Date().toISOString(),
            flagStateVersion,
            flags: definitions.flags,
            segments: definitions.segments,
          });
          this.fallbackSave = this.fallbackSave.then(async () => {
            try {
              await this.config.flagsFallbackProvider?.save(
                this.config.fallbackContext,
                snapshot,
              );
            } catch (error) {
              this.logger.error(
                "flagsFallbackProvider: failed to save flag definitions",
                error,
              );
            }
          });
        },
      },
    );
    this.flagsSyncController = createFlagsSyncController({
      mode: flagsSyncMode,
      cache: this.flagsCache,
      intervalMs: FLAGS_REFETCH_MS,
      pushUrl: pushUrl.toString(),
      headers: this.config.headers,
      logger: this.logger,
    });
  }

  private async loadFallback() {
    if (!this.canLoadFallback) return undefined;
    this.canLoadFallback = false;
    try {
      const snapshot = await this.config.flagsFallbackProvider?.load(
        this.config.fallbackContext,
      );
      if (!snapshot) return undefined;
      ok(isFlagsFallbackSnapshot(snapshot), "invalid fallback snapshot");
      const definitions = prepareFlagCollection(
        snapshot,
        snapshot.source !== "static",
      );
      this.logger.warn(
        `remote flags unavailable, using fallback flags (${snapshot.savedAt})`,
      );
      return {
        definitions,
        flagStateVersion: snapshot.flagStateVersion,
        fallback: true,
      };
    } catch (error) {
      this.logger.error(
        "flagsFallbackProvider: failed to load flag definitions",
        error,
      );
      return undefined;
    }
  }

  public async initialize() {
    await this.initializeOnce();
  }
  public async flush() {
    if (this.config.offline) return;
    await this.batchBuffer.flush();
    await this.flagsCache.waitRefresh();
    await this.fallbackSave;
  }
  public async refreshFlags(waitForVersion?: number) {
    ok(
      waitForVersion === undefined ||
        (Number.isSafeInteger(waitForVersion) && waitForVersion >= 0),
      "waitForVersion must be a non-negative safe integer",
    );
    if (!this.config.offline) await this.flagsCache.refresh(waitForVersion);
  }
  public destroy() {
    this.flagsSyncController.destroy();
    this.flagsCache.destroy();
    this.batchBuffer.destroy();
  }
  public setFlagOverrides(overrides: FlagOverrides | FlagOverridesFn) {
    this.baseOverrides = normalizeOverrides(overrides);
  }
  /** @deprecated Use setFlagOverrides. */
  public set flagOverrides(overrides: FlagOverrides | FlagOverridesFn) {
    this.setFlagOverrides(overrides);
  }
  public clearFlagOverrides() {
    this.baseOverrides = () => ({});
  }
  public pushFlagOverrides(overrides: FlagOverrides | FlagOverridesFn) {
    const layer = { overrides: normalizeOverrides(overrides) };
    this.overrideLayers.push(layer);
    return () => {
      this.overrideLayers = this.overrideLayers.filter(
        (candidate) => candidate !== layer,
      );
    };
  }
  public bindClient(options: ContextWithTracking) {
    return new BoundReflagClient(this, options);
  }

  /** Complete definitions, including segments needed for offline evaluation. */
  public getFlagDefinitions(): FlagCollection {
    this.onAccess();
    const collection = this.flagsCache.get();
    return JSON.parse(
      JSON.stringify({
        flags: collection?.flags ?? [],
        segments: collection?.segments ?? [],
      }),
    ) as FlagCollection;
  }
  /** Read a Boolean with an implicit false default, or supply an explicit value default. */
  public getFlag<Key extends TypedFlagKey>(
    options: ContextWithTracking,
    key: Key,
    defaultValue?: undefined,
  ): boolean;
  public getFlag<Key extends TypedFlagKey, Default extends FlagDefaultValue>(
    options: ContextWithTracking,
    key: Key,
    defaultValue: Default,
  ): FlagValueFromDefault<Default>;
  public getFlag(
    options: ContextWithTracking,
    key: TypedFlagKey,
    defaultValue: FlagDefaultValue = false,
  ): FlagValue {
    checkFlagDefault(defaultValue);
    return this.readFlagValue(
      key,
      defaultValue,
      { ...this.evaluate(options, key, false), context: contextOnly(options) },
      options.enableTracking !== false,
    );
  }

  private readFlagValue(
    key: string,
    defaultValue: FlagValue,
    evaluation: {
      flags: RawFlags;
      context: Context;
      flagStateVersion?: number;
    },
    enableTracking: boolean,
  ): FlagValue {
    const result = evaluation.flags[key] ?? localResult(key, undefined);
    const selected = applyFlagDefault(result.value, defaultValue);
    if (selected.typeMismatch)
      this.logger.warn(
        `flag "${key}" returned ${flagValueType(result.value!)}; expected ${flagValueType(defaultValue)}. Using the default value.`,
      );
    if (enableTracking) {
      const checkResult = selected.usedDefault
        ? {
            ...localResult(key, defaultValue),
            ruleResults: result.ruleResults,
            errors: result.errors,
          }
        : result;
      this.registerCheck(
        key,
        checkResult,
        evaluation.context,
        evaluation.flagStateVersion,
      );
    }
    return structuredClone(selected.value);
  }
  /** Return all values and immediately register checks for the returned roots. */
  public getFlags(options: ContextWithTracking): TypedFlags {
    const { flags } = this.evaluate(options, undefined, true);
    return Object.fromEntries(
      Object.entries(flags).map(([key, result]) => [
        key,
        copyValue(result.value),
      ]),
    ) as TypedFlags;
  }
  /** Serialization is not a read by the browser; it must not emit check events. */
  public getFlagsForBootstrap(options: ContextWithTracking): BootstrappedFlags {
    const { flags, flagStateVersion } = this.evaluate(
      options,
      undefined,
      false,
    );
    return {
      protocolVersion: 2,
      context: JSON.parse(
        canonicalJSONStringify(contextOnly(options)),
      ) as Context,
      flags: structuredClone(flags),
      ...(flagStateVersion === undefined ? {} : { flagStateVersion }),
    };
  }

  private onAccess() {
    if (!this.config.offline) this.flagsSyncController.onAccess?.();
  }
  private evaluate(
    options: ContextWithTracking,
    key: string | undefined,
    checks: boolean,
  ) {
    checkContext(options);
    const { enableTracking = true } = options;
    const context = contextOnly(options);
    if (!this.initialized)
      this.logger.error("getFlag(s): ReflagClient is not initialized yet.");
    void this.syncContext({ ...options, enableTracking }).catch((error) =>
      this.logger.error("failed to synchronize context", error),
    );
    this.onAccess();
    const collection = this.flagsCache.get();
    const flagStateVersion = this.flagsCache.getFlagStateVersion();
    const flags: RawFlags = Object.create(null);
    if (collection) {
      if (key === undefined)
        Object.assign(flags, collection.evaluator.evaluateAll(context).flags);
      else if (collection.flags.some((flag) => flag.key === key))
        flags[key] = collection.evaluator.evaluateFlag(context, key);
      if (!collection.trackSelections)
        for (const [flagKey, result] of Object.entries(flags))
          flags[flagKey] = localResult(flagKey, result.value);
    } else {
      for (const [flagKey, value] of Object.entries(this.config.fallbackFlags))
        if (key === undefined || key === flagKey)
          flags[flagKey] = localResult(flagKey, value);
    }
    const overrides = this.overrideLayers.reduce(
      (current, layer) => ({ ...current, ...layer.overrides(context) }),
      this.baseOverrides(context),
    );
    for (const [flagKey, value] of Object.entries(overrides)) {
      if (key !== undefined && key !== flagKey) continue;
      ok(isFlagValue(value), "flag overrides must contain JSON values");
      flags[flagKey] = localResult(flagKey, value);
    }
    if (key !== undefined && !Object.prototype.hasOwnProperty.call(flags, key))
      flags[key] = localResult(key, undefined);
    if (checks && enableTracking)
      for (const [flagKey, result] of Object.entries(flags))
        this.registerCheck(flagKey, result, context, flagStateVersion);
    return { flags, flagStateVersion };
  }

  private registerCheck(
    key: string,
    result: RawFlag,
    context: Context,
    flagStateVersion?: number,
  ) {
    if (this.config.offline) return;
    const event: FlagEvent = {
      action: "check",
      key,
      ...(result.resolved
        ? {
            evalResult: result.variantKey,
            sourceVersionId: result.sourceVersionId,
          }
        : {}),
      flagStateVersion,
      evalContext: JSON.parse(canonicalJSONStringify(context)) as Record<
        string,
        unknown
      >,
      evalRuleResults: result.ruleResults.map((rule) => rule.matched),
      ...(result.errors.length ? { evalErrors: result.errors } : {}),
    };
    // Include selection/version identity: equal JSON payloads are not the same variant.
    const identity = {
      ...event,
      evalContext: flattenContext(event.evalContext ?? {}),
    };
    if (
      !this.rateLimiter.isAllowed(hashString(canonicalJSONStringify(identity)))
    )
      return;
    if (result.errors.length)
      this.logger.warn("flag targeting rules could not be fully evaluated.", {
        [key]: result.errors,
      });
    void this.batchBuffer
      .add({ type: "feature-flag-event", ...event })
      .catch((error) =>
        this.logger.error(`failed to send check event for "${key}"`, error),
      );
  }

  public async getFlagsRemote(
    userId?: IdType,
    companyId?: IdType,
    context?: ContextWithTracking,
  ): Promise<TypedFlags> {
    const evaluation = await this.getRemote(
      undefined,
      userId,
      companyId,
      context,
    );
    if (context?.enableTracking !== false)
      for (const [key, result] of Object.entries(evaluation.flags))
        this.registerCheck(
          key,
          result,
          evaluation.context,
          evaluation.flagStateVersion,
        );
    return Object.fromEntries(
      Object.entries(evaluation.flags).map(([key, result]) => [
        key,
        copyValue(result.value),
      ]),
    ) as TypedFlags;
  }
  public getFlagRemote<Key extends TypedFlagKey>(
    key: Key,
    defaultValue?: undefined,
    userId?: IdType,
    companyId?: IdType,
    context?: ContextWithTracking,
  ): Promise<boolean>;
  public getFlagRemote<
    Key extends TypedFlagKey,
    Default extends FlagDefaultValue,
  >(
    key: Key,
    defaultValue: Default,
    userId?: IdType,
    companyId?: IdType,
    context?: ContextWithTracking,
  ): Promise<FlagValueFromDefault<Default>>;
  public async getFlagRemote(
    key: TypedFlagKey,
    defaultValue: FlagDefaultValue = false,
    userId?: IdType,
    companyId?: IdType,
    context?: ContextWithTracking,
  ): Promise<FlagValue> {
    checkFlagDefault(defaultValue);
    const evaluation = await this.getRemote(key, userId, companyId, context);
    return this.readFlagValue(
      key,
      defaultValue,
      evaluation,
      context?.enableTracking !== false,
    );
  }
  private async getRemote(
    key: string | undefined,
    userId?: IdType,
    companyId?: IdType,
    additionalContext: ContextWithTracking = {},
  ): Promise<{ flags: RawFlags; context: Context; flagStateVersion?: number }> {
    const context = {
      ...contextOnly(additionalContext),
      ...(userId === undefined
        ? {}
        : { user: { ...additionalContext.user, id: userId } }),
      ...(companyId === undefined
        ? {}
        : { company: { ...additionalContext.company, id: companyId } }),
    };
    checkContext(additionalContext);
    checkContext(context);
    if (this.config.offline)
      return {
        ...this.evaluate({ ...context, enableTracking: false }, key, false),
        context,
      };
    const query = new URLSearchParams({
      contextJson: canonicalContextJSONStringify(context) ?? "{}",
    });
    if (key !== undefined) query.set("key", key);
    const response = await this.get<EvaluatedFlagsAPIResponse>(
      `flags/evaluated?${query}`,
    );
    const flags: RawFlags = Object.create(null);
    if (
      !response ||
      response.protocolVersion !== 2 ||
      !Number.isSafeInteger(response.flagStateVersion) ||
      response.flagStateVersion < 0 ||
      !isObject(response.flags)
    )
      return { flags, context };
    for (const [flagKey, result] of Object.entries(response.flags)) {
      if (key !== undefined && key !== flagKey) continue;
      // The endpoint returns only successful selections, with the same metadata as local evaluation.
      if (
        !isObject(result) ||
        !isFlagValue(result.value) ||
        typeof result.variantKey !== "string" ||
        !result.variantKey ||
        typeof result.sourceVersionId !== "string" ||
        !result.sourceVersionId ||
        typeof result.matchedRuleId !== "string" ||
        !Array.isArray(result.ruleResults) ||
        !result.ruleResults.every(
          (rule) =>
            isObject(rule) &&
            typeof rule.ruleId === "string" &&
            typeof rule.matched === "boolean",
        ) ||
        !Array.isArray(result.errors) ||
        !result.errors.every(
          (error: unknown) =>
            isObject(error) &&
            typeof error.code === "string" &&
            typeof error.message === "string" &&
            (error.field === undefined || typeof error.field === "string") &&
            (error.operator === undefined ||
              typeof error.operator === "string") &&
            (error.source === undefined ||
              (isObject(error.source) &&
                ["flag", "segment"].includes(error.source.type) &&
                typeof error.source.key === "string")),
        )
      )
        continue;
      flags[flagKey] = { ...result, flagKey, resolved: true };
    }
    return { flags, context, flagStateVersion: response.flagStateVersion };
  }

  public async updateUser(userId: IdType, options?: TrackOptions) {
    idOk(userId, "userId");
    checkTrackOptions(options);
    if (
      this.config.offline ||
      !this.rateLimiter.isAllowed(hashObject({ userId, ...options }))
    )
      return;
    await this.batchBuffer.add({
      type: "user",
      userId,
      attributes: options?.attributes,
      context: options?.meta,
    });
  }
  public async updateCompany(
    companyId: IdType,
    options?: TrackOptions & { userId?: IdType },
  ) {
    idOk(companyId, "companyId");
    checkTrackOptions(options);
    if (options?.userId !== undefined) idOk(options.userId, "userId");
    if (
      this.config.offline ||
      !this.rateLimiter.isAllowed(hashObject({ companyId, ...options }))
    )
      return;
    await this.batchBuffer.add({
      type: "company",
      companyId,
      userId: options?.userId,
      attributes: options?.attributes,
      context: options?.meta,
    });
  }
  public async track(
    userId: IdType,
    event: string,
    options?: TrackOptions & { companyId?: IdType },
  ) {
    idOk(userId, "userId");
    ok(
      typeof event === "string" && event.length > 0,
      "event must be a non-empty string",
    );
    checkTrackOptions(options);
    if (options?.companyId !== undefined) idOk(options.companyId, "companyId");
    if (!this.config.offline)
      await this.batchBuffer.add({
        type: "event",
        userId,
        event,
        companyId: options?.companyId,
        attributes: options?.attributes,
        context: options?.meta,
      });
  }
  private async syncContext({
    enableTracking = true,
    user,
    company,
    meta,
  }: ContextWithTracking) {
    if (!enableTracking || this.config.offline) return;
    const pending: Promise<void>[] = [];
    if (user?.id !== undefined) {
      const { id, ...attributes } = user;
      pending.push(this.updateUser(id, { attributes, meta }));
    }
    if (company?.id !== undefined) {
      const { id, ...attributes } = company;
      pending.push(
        this.updateCompany(id, { userId: user?.id, attributes, meta }),
      );
    }
    await Promise.all(pending);
  }
  private async post(path: string, body: BulkEvent[]) {
    const response = await this.httpClient.post<
      BulkEvent[],
      { success: boolean }
    >(
      new URL(path, this.config.apiBaseUrl).toString(),
      this.config.headers,
      body,
    );
    if (!response.ok || !response.body?.success)
      throw new Error("invalid response sending bulk events");
  }
  private async get<Response>(
    path: string,
    retries = this.config.flagsFetchRetries,
  ): Promise<Response | undefined> {
    const url = new URL(path, this.config.apiBaseUrl).toString();
    try {
      return await withRetry(
        async () => {
          const response = await this.httpClient.get<
            Response & { success: boolean }
          >(url, this.config.headers, this.config.fetchTimeoutMs);
          if (
            !response.ok ||
            !isObject(response.body) ||
            response.body.success !== true
          )
            throw new Error(
              `invalid response received from server for "${url}"`,
            );
          const { success: _, ...body } = response.body;
          return body as Response;
        },
        (error) => this.logger.warn("failed to fetch flags, will retry", error),
        retries,
        1000,
        10000,
      );
    } catch (error) {
      this.logger.debug(
        `get request to "${path}" failed with error after ${retries} retries`,
        error,
      );
      return undefined;
    }
  }
}

/** Context-bound reads have the same direct-value and immediate-check semantics. */
export class BoundReflagClient {
  constructor(
    private readonly client: ReflagClient,
    private readonly options: ContextWithTracking,
  ) {
    checkContext(options);
  }
  public get user() {
    return this.options.user;
  }
  public get company() {
    return this.options.company;
  }
  public get otherContext() {
    return this.options.other;
  }
  public getFlag<Key extends TypedFlagKey>(
    key: Key,
    defaultValue?: undefined,
  ): boolean;
  public getFlag<Key extends TypedFlagKey, Default extends FlagDefaultValue>(
    key: Key,
    defaultValue: Default,
  ): FlagValueFromDefault<Default>;
  public getFlag(
    key: TypedFlagKey,
    defaultValue: FlagDefaultValue = false,
  ): FlagValue {
    return this.client.getFlag(this.options, key, defaultValue);
  }
  public getFlags() {
    return this.client.getFlags(this.options);
  }
  public getFlagsForBootstrap() {
    return this.client.getFlagsForBootstrap(this.options);
  }
  public async getFlagsRemote() {
    return this.client.getFlagsRemote(undefined, undefined, this.options);
  }
  public getFlagRemote<Key extends TypedFlagKey>(
    key: Key,
    defaultValue?: undefined,
  ): Promise<boolean>;
  public getFlagRemote<
    Key extends TypedFlagKey,
    Default extends FlagDefaultValue,
  >(key: Key, defaultValue: Default): Promise<FlagValueFromDefault<Default>>;
  public getFlagRemote(
    key: TypedFlagKey,
    defaultValue: FlagDefaultValue = false,
  ): Promise<FlagValue> {
    return this.client.getFlagRemote(
      key,
      defaultValue,
      undefined,
      undefined,
      this.options,
    );
  }
  public bindClient(next: ContextWithTracking) {
    return new BoundReflagClient(this.client, {
      ...this.options,
      ...next,
      enableTracking: next.enableTracking ?? this.options.enableTracking,
      meta: next.meta ?? this.options.meta,
      user:
        next.user === undefined ? this.user : { ...this.user, ...next.user },
      company:
        next.company === undefined
          ? this.company
          : { ...this.company, ...next.company },
      other:
        next.other === undefined
          ? this.otherContext
          : { ...this.otherContext, ...next.other },
    });
  }
  public async track(
    event: string,
    options?: TrackOptions & { companyId?: IdType },
  ) {
    if (this.user?.id === undefined) {
      this.client.logger.warn("no user set, cannot track event");
      return;
    }
    if (this.options.enableTracking === false) return;
    await this.client.track(this.user.id, event, {
      companyId: this.company?.id,
      ...options,
    });
  }
  public async flush() {
    await this.client.flush();
  }
  public async refreshFlags(waitForVersion?: number) {
    await this.client.refreshFlags(waitForVersion);
  }
}
function checkTrackOptions(options?: TrackOptions) {
  ok(options === undefined || isObject(options), "options must be an object");
  ok(
    options?.attributes === undefined || isObject(options.attributes),
    "attributes must be an object",
  );
  ok(
    options?.meta === undefined || isObject(options.meta),
    "meta must be an object",
  );
  ok(
    options?.meta?.active === undefined ||
      typeof options.meta.active === "boolean",
    "meta.active must be a boolean",
  );
}
function checkContext(context: ContextWithTracking) {
  ok(isObject(context), "context must be an object");
  for (const name of ["user", "company"] as const) {
    ok(
      context[name] === undefined || isObject(context[name]),
      `${name} must be an object`,
    );
    if (context[name]?.id !== undefined) idOk(context[name].id, `${name}.id`);
  }
  ok(
    context.other === undefined || isObject(context.other),
    "other must be an object",
  );
  ok(
    context.enableTracking === undefined ||
      typeof context.enableTracking === "boolean",
    "enableTracking must be a boolean",
  );
  checkTrackOptions({ meta: context.meta });
}
