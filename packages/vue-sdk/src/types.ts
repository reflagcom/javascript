import type { Ref } from "vue";

import type {
  CompanyContext,
  InitOptions,
  RawFlags,
  ReflagClient,
  ReflagContext,
  RequestFeedbackData,
  UserContext,
} from "@reflag/browser-sdk";

export type EmptyFlagRemoteConfig = { key: undefined; payload: undefined };

export type FlagType = {
  config?: {
    payload: any;
  };
};

export type FlagRemoteConfig =
  | {
      key: string;
      payload: any;
    }
  | EmptyFlagRemoteConfig;

export interface Flag<
  TConfig extends FlagType["config"] = EmptyFlagRemoteConfig,
> {
  key: string;
  isEnabled: Ref<boolean>;
  isLoading: Ref<boolean>;
  config: Ref<({ key: string } & TConfig) | EmptyFlagRemoteConfig>;
  track(): Promise<Response | undefined> | undefined;
  requestFeedback: (opts: RequestFlagFeedbackOptions) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Flags {}

export type TypedFlags = keyof Flags extends never
  ? Record<string, Flag>
  : {
      [TypedFlagKey in keyof Flags]: Flags[TypedFlagKey] extends FlagType
        ? Flag<Flags[TypedFlagKey]["config"]>
        : Flag;
    };

export type FlagKey = keyof TypedFlags;

export interface ProviderContextType {
  client: ReflagClient;
  isLoading: Ref<boolean>;
}

export type BootstrappedFlags = {
  context: ReflagContext;
  flags: RawFlags;
};

export type RequestFlagFeedbackOptions = Omit<
  RequestFeedbackData,
  "flagKey" | "featureId"
>;

/**
 * Base init options for the ReflagProvider and ReflagBootstrappedProvider.
 * @internal
 */
export type ReflagInitOptionsBase = Omit<
  InitOptions,
  "user" | "company" | "other" | "otherContext" | "bootstrappedFlags"
>;

/**
 * Props for the ReflagProvider.
 */
export type ReflagProps = ReflagInitOptionsBase & {
  /**
   * The context to use for the ReflagClient containing user, company, and other context.
   */
  context?: ReflagContext;

  /**
   * Company related context. If you provide `id` Reflag will enrich the evaluation context with
   * company attributes on Reflag servers.
   * @deprecated Use `context` instead, this property will be removed in the next major version
   */
  company?: CompanyContext;

  /**
   * User related context. If you provide `id` Reflag will enrich the evaluation context with
   * user attributes on Reflag servers.
   * @deprecated Use `context` instead, this property will be removed in the next major version
   */
  user?: UserContext;

  /**
   * Context which is not related to a user or a company.
   * @deprecated Use `context` instead, this property will be removed in the next major version
   */
  otherContext?: Record<string, string | number | undefined>;
};

/**
 * Props for the ReflagBootstrappedProvider.
 */
export type ReflagBootstrappedProps = ReflagInitOptionsBase & {
  /**
   * Pre-fetched flags to be used instead of fetching them from the server.
   */
  flags: BootstrappedFlags;
};
