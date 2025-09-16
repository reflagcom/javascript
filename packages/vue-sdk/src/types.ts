import type { Ref } from "vue";

import type {
  FetchedFlags,
  InitOptions,
  InitOptionsBootstrapped,
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
  client: Ref<ReflagClient | undefined>;
  isLoading: Ref<boolean>;
}

export type BootstrappedFlags = {
  context: ReflagContext;
  flags: FetchedFlags;
};

/**
 * Base props for the ReflagProvider and ReflagBootstrappedProvider.
 * @internal
 */
export type ReflagBaseProps = {
  debug?: boolean;
  newReflagClient?: (
    ...args: ConstructorParameters<typeof ReflagClient>
  ) => ReflagClient;
};

/**
 * Props for the ReflagProvider.
 */
export type ReflagProps = InitOptions & ReflagBaseProps;

/**
 * Props for the ReflagBootstrappedProvider.
 */
export type ReflagBootstrappedProps = Omit<
  InitOptionsBootstrapped,
  "bootstrappedFlags" | "user" | "company" | "otherContext"
> &
  ReflagBaseProps & {
    /**
     * Pre-fetched flags to be used instead of fetching them from the server.
     */
    flags?: BootstrappedFlags;
  };

export type UseReflagProviderOptions = {
  config: Omit<InitOptions, "user" | "company" | "otherContext"> &
    ReflagBaseProps;
  context?: ReflagContext;
  bootstrappedFlags?: FetchedFlags;
  isBootstrapped?: boolean;
};

export type RequestFlagFeedbackOptions = Omit<
  RequestFeedbackData,
  "flagKey" | "featureId"
>;
