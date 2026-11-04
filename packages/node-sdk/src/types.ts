import type {
  CompiledCollection,
  CompiledFlag,
  EvaluationError,
  Evaluator,
  FlagEvaluationResult,
} from "@reflag/flag-evaluation";

export type FlagValue =
  | null
  | boolean
  | number
  | string
  | FlagValue[]
  | { [key: string]: FlagValue };
/** JSON defaults may be readonly; returned values are independent mutable copies. */
export type FlagDefaultValue =
  | null
  | boolean
  | number
  | string
  | readonly FlagDefaultValue[]
  | { readonly [key: string]: FlagDefaultValue };

/** Infer values from defaults, widening literals. Null explicitly requests arbitrary JSON. */
export type FlagValueFromDefault<T> = T extends null
  ? FlagValue
  : T extends boolean
    ? boolean
    : T extends number
      ? number
      : T extends string
        ? string
        : T extends readonly (infer Element)[]
          ? [Element] extends [never]
            ? FlagValue[]
            : FlagValueFromDefault<Element>[]
          : T extends object
            ? { -readonly [Key in keyof T]: FlagValueFromDefault<T[Key]> }
            : never;

export type Attributes = Record<string, any>;
export type TrackingMeta = { active?: boolean };
export type IdType = string | number;

/** Augment this interface with flag keys and their returned value types. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Flags {}
export type TypedFlagKey = keyof Flags extends never
  ? string
  : Extract<keyof Flags, string>;
export type TypedFlags = keyof Flags extends never
  ? Record<string, FlagValue | undefined>
  : { [Key in keyof Flags]: Flags[Key] | undefined };
export type FlagOverrides = Partial<
  keyof Flags extends never
    ? Record<string, FlagValue>
    : { [Key in keyof Flags]: Flags[Key] }
>;
export type FlagOverridesFn = (context: Context) => FlagOverrides;

export type FlagDefinition = CompiledFlag<FlagValue>;
export type FlagCollection = CompiledCollection<FlagValue> & {
  segments: NonNullable<CompiledCollection["segments"]>;
};
export type FlagsAPIResponse = FlagCollection & {
  protocolVersion: 2;
  flagStateVersion: number;
};
export type CachedFlagCollection = FlagCollection & {
  evaluator: Evaluator<FlagValue>;
  /** Static SDK values do not identify authored variants. */
  trackSelections: boolean;
};
export type RawFlag = Omit<
  FlagEvaluationResult<FlagValue>,
  "sourceVersionId" | "value" | "resolved"
> & {
  sourceVersionId?: string;
  value: FlagValue | undefined;
  resolved: boolean;
};
export type RawFlags = Record<string, RawFlag>;
export type BootstrappedFlags = {
  protocolVersion: 2;
  context: Context;
  flags: RawFlags;
  flagStateVersion?: number;
};
export type EvaluatedFlagsAPIResponse = {
  protocolVersion: 2;
  flagStateVersion: number;
  remoteContextUsed: boolean;
  flags: Record<
    string,
    Omit<
      Extract<FlagEvaluationResult<FlagValue>, { resolved: true }>,
      "flagKey" | "resolved"
    >
  >;
};

/** A check records the selected variant key, never its JSON payload. */
export type FlagEvent = {
  action: "check";
  key: string;
  evalResult?: string;
  sourceVersionId?: string;
  flagStateVersion?: number;
  evalContext?: Record<string, unknown>;
  evalRuleResults?: boolean[];
  evalMissingFields?: string[];
  evalErrors?: EvaluationError[];
};

/** V1 snapshots cannot be evaluated by the collection evaluator. */
export type FlagsFallbackSnapshot = FlagCollection & {
  version: 2;
  savedAt: string;
  flagStateVersion?: number;
  source?: "static";
};
export type FlagsFallbackProviderContext = { secretKeyHash: string };
export interface FlagsFallbackProvider {
  load(
    context: FlagsFallbackProviderContext,
  ): Promise<FlagsFallbackSnapshot | undefined>;
  save(
    context: FlagsFallbackProviderContext,
    snapshot: FlagsFallbackSnapshot,
  ): Promise<void>;
}

export type HttpClientResponse<Response> = {
  status: number;
  ok: boolean;
  body: Response | undefined;
};
export interface HttpClient {
  post<Body, Response>(
    url: string,
    headers: Record<string, string>,
    body: Body,
  ): Promise<HttpClientResponse<Response>>;
  get<Response>(
    url: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<HttpClientResponse<Response>>;
}
export interface Logger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}
export type BatchBufferOptions<T> = {
  flushHandler: (items: T[]) => Promise<void>;
  logger?: Logger;
  maxSize?: number;
  intervalMs?: number;
  flushOnExit?: boolean;
};
export type CacheStrategy = "periodically-update" | "in-request";
export type FlagsSyncMode = "polling" | "in-request" | "push";
export type ClientOptions = {
  secretKey?: string;
  /** @deprecated Use apiBaseUrl. */
  host?: string;
  apiBaseUrl?: string;
  logger?: Logger;
  logLevel?: LogLevel;
  /** Value-only startup fallbacks. Prefer a complete saved collection. */
  fallbackFlags?: TypedFlagKey[] | FlagOverrides;
  flagsFallbackProvider?: FlagsFallbackProvider;
  httpClient?: HttpClient;
  fetchTimeoutMs?: number;
  flagsFetchRetries?: number;
  batchOptions?: Omit<BatchBufferOptions<any>, "flushHandler" | "logger">;
  /** Applied after evaluation; overrides do not change dependency results. */
  flagOverrides?: FlagOverrides | FlagOverridesFn;
  offline?: boolean;
  /** @deprecated Evaluation events are not emitted. */
  emitEvaluationEvents?: boolean;
  configFile?: string;
  flagsSyncMode?: FlagsSyncMode;
  flagsPushUrl?: string;
  /** @deprecated Use flagsSyncMode. */
  cacheStrategy?: CacheStrategy;
};
export type TrackOptions = { attributes?: Attributes; meta?: TrackingMeta };
export type Context = {
  user?: {
    id: IdType | undefined;
    name?: string;
    email?: string;
    avatar?: string;
    [key: string]: any;
  };
  company?: {
    id: IdType | undefined;
    name?: string;
    avatar?: string;
    [key: string]: any;
  };
  other?: Record<string, any>;
};
export interface ContextWithTracking extends Context {
  enableTracking?: boolean;
  meta?: TrackingMeta;
}
export const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
