import {
  createFileFallbackProvider,
  createGCSFallbackProvider,
  createRedisFallbackProvider,
  createS3FallbackProvider,
} from "./flagsFallbackProvider";

export { BoundReflagClient, ReflagClient } from "./client";
export { EdgeClient, EdgeClientOptions } from "./edgeClient";
export type {
  FileFallbackProviderOptions,
  GCSFallbackProviderOptions,
  RedisFallbackProviderOptions,
  S3FallbackProviderOptions,
} from "./flagsFallbackProvider";

export const fallbackProviders = {
  file: createFileFallbackProvider,
  redis: createRedisFallbackProvider,
  s3: createS3FallbackProvider,
  gcs: createGCSFallbackProvider,
};
export type {
  Attributes,
  BatchBufferOptions,
  BootstrappedFlags,
  CacheStrategy,
  ClientOptions,
  Context,
  ContextWithTracking,
  EmptyFlagRemoteConfig,
  Flag,
  FlagAPIResponse,
  FlagConfigVariant,
  FlagDefinition,
  FlagOverride,
  FlagOverrides,
  FlagOverridesFn,
  FlagRemoteConfig,
  Flags,
  FlagsAPIResponse,
  FlagsFallbackProvider,
  FlagsFallbackProviderContext,
  FlagsFallbackSnapshot,
  FlagType,
  HttpClient,
  HttpClientResponse,
  IdType,
  LOG_LEVELS,
  Logger,
  LogLevel,
  RawFlag,
  RawFlagRemoteConfig,
  RawFlags,
  TrackingMeta,
  TrackOptions,
  TypedFlagKey,
  TypedFlags,
} from "./types";
