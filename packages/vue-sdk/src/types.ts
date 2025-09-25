import type { Ref } from "vue";

import type {
  InitOptions,
  RawFlags,
  ReflagClient,
  ReflagContext,
  RequestFeedbackData,
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

/**
 * Base init options for the ReflagProvider and ReflagBootstrappedProvider.
 * @internal
 */
export type ReflagInitOptionsBase = Omit<
  InitOptions,
  "user" | "company" | "other" | "otherContext" | "bootstrappedFlags"
>;

export type RequestFlagFeedbackOptions = Omit<
  RequestFeedbackData,
  "flagKey" | "featureId"
>;
