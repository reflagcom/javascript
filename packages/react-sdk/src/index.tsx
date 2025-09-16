"use client";

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import canonicalJSON from "canonical-json";

import {
  CheckEvent,
  CompanyContext,
  FetchedFlags,
  InitOptions,
  InitOptionsBootstrapped,
  RawFlags,
  ReflagClient,
  ReflagContext,
  RequestFeedbackData,
  TrackEvent,
  UnassignedFeedback,
  UserContext,
} from "@reflag/browser-sdk";

import { version } from "../package.json";

export type { CheckEvent, CompanyContext, RawFlags, TrackEvent, UserContext };

export type EmptyFlagRemoteConfig = { key: undefined; payload: undefined };

export type FlagType = {
  config?: {
    payload: any;
  };
};

/**
 * A remotely managed configuration value for a feature.
 */
export type FlagRemoteConfig =
  | {
      /**
       * The key of the matched configuration value.
       */
      key: string;

      /**
       * The optional user-supplied payload data.
       */
      payload: any;
    }
  | EmptyFlagRemoteConfig;

/**
 * Describes a feature
 */
export interface Flag<
  TConfig extends FlagType["config"] = EmptyFlagRemoteConfig,
> {
  /**
   * The key of the feature.
   */
  key: string;

  /**
   * If the feature is enabled.
   */
  isEnabled: boolean;

  /**
   * If the feature is loading.
   */
  isLoading: boolean;

  /*
   * Optional user-defined configuration.
   */
  config:
    | ({
        key: string;
      } & TConfig)
    | EmptyFlagRemoteConfig;

  /**
   * Track feature usage in Reflag.
   */
  track(): Promise<Response | undefined> | undefined;
  /**
   * Request feedback from the user.
   */
  requestFeedback: (opts: RequestFeedbackOptions) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Flags {}

/**
 * Describes a collection of evaluated feature.
 *
 * @remarks
 * This types falls back to a generic Record<string, Flag> if the Flags interface
 * has not been extended.
 *
 */
export type TypedFlags = keyof Flags extends never
  ? Record<string, Flag>
  : {
      [TypedFlagKey in keyof Flags]: Flags[TypedFlagKey] extends FlagType
        ? Flag<Flags[TypedFlagKey]["config"]>
        : Flag;
    };

export type BootstrappedFlags = {
  context: ReflagContext;
  flags: FetchedFlags;
};

export type FlagKey = keyof TypedFlags;

const SDK_VERSION = `react-sdk/${version}`;

function removeUndefined(obj: Record<string, any>) {
  const t = obj;
  for (const v in t) {
    if (typeof t[v] == "object") removeUndefined(t[v]);
    else if (t[v] == undefined) delete t[v];
  }
  return t;
}

type ProviderContextType = {
  isLoading: boolean;
  client?: ReflagClient;
};

const ProviderContext = createContext<ProviderContextType | null>(null);

type UseReflagProviderOptions = {
  config: Omit<InitOptions, keyof ReflagContext> & {
    debug?: boolean;
    newReflagClient?: (
      ...args: ConstructorParameters<typeof ReflagClient>
    ) => ReflagClient;
  };
  context?: ReflagContext;
  bootstrappedFlags?: FetchedFlags;
  isBootstrapped?: boolean;
};

/**
 * Shared hook that handles the common logic for both ReflagProvider and ReflagBootstrappedProvider
 */
function useReflagProvider({
  config,
  context,
  bootstrappedFlags,
  isBootstrapped = false,
}: UseReflagProviderOptions): ProviderContextType {
  const [isLoading, setIsLoading] = useState(true);

  const clientRef = useRef<ReflagClient>();
  const contextKeyRef = useRef<string>();

  const {
    newReflagClient = (...args) => new ReflagClient(...args),
    debug,
    ...initConfig
  } = config;

  // Generate context key based to deduplicate initialization
  const contextKey = useMemo(() => {
    return canonicalJSON(
      removeUndefined({
        ...initConfig,
        ...context,
        flags: bootstrappedFlags ?? null,
      }),
    );
  }, [initConfig, context, bootstrappedFlags]);

  // Create base client options
  const baseClientOptions = useMemo(
    () => ({
      ...initConfig,
      user: context?.user,
      company: context?.company,
      otherContext: context?.otherContext,
      logger: debug ? console : undefined,
      sdkVersion: SDK_VERSION,
    }),
    [initConfig, context, debug],
  );

  useEffect(() => {
    // For bootstrapped provider, don't initialize if flags are not provided
    if (isBootstrapped && !bootstrappedFlags) {
      return;
    }

    // Prevent re-initialization if the context key is the same
    if (contextKeyRef.current === contextKey) {
      return;
    }
    contextKeyRef.current = contextKey;

    // Stop the client if it exists
    if (clientRef.current) {
      void clientRef.current.stop();
    }

    setIsLoading(true);

    // Add bootstrapped flags if this is a bootstrapped provider
    const clientOptions = bootstrappedFlags
      ? { ...baseClientOptions, bootstrappedFlags }
      : baseClientOptions;

    const client = newReflagClient(clientOptions);
    clientRef.current = client;

    client
      .initialize()
      .catch((e) => {
        client.logger.error("failed to initialize client", e);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [
    contextKey,
    baseClientOptions,
    bootstrappedFlags,
    newReflagClient,
    isBootstrapped,
  ]);

  return useMemo(
    () => ({
      isLoading,
      client: clientRef.current,
    }),
    [isLoading],
  );
}

/**
 * Base props for the ReflagProvider and ReflagBootstrappedProvider.
 * @internal
 */
export type ReflagPropsBase = {
  children?: ReactNode;
  loadingComponent?: ReactNode;
  debug?: boolean;
  newReflagClient?: (
    ...args: ConstructorParameters<typeof ReflagClient>
  ) => ReflagClient;
};

/**
 * Props for the ReflagProvider.
 */
export type ReflagProps = InitOptions & ReflagContext & ReflagPropsBase;

/**
 * Provider for the ReflagClient.
 */
export function ReflagProvider({
  children,
  user,
  company,
  otherContext,
  loadingComponent,
  newReflagClient = (...args) => new ReflagClient(...args),
  ...config
}: ReflagProps) {
  const context = useReflagProvider({
    config: { ...config, newReflagClient },
    context: { user, company, otherContext },
  });

  return (
    <ProviderContext.Provider value={context}>
      {context.isLoading && typeof loadingComponent !== "undefined"
        ? loadingComponent
        : children}
    </ProviderContext.Provider>
  );
}

/**
 * Props for the ReflagBootstrappedProvider.
 */
export type ReflagBootstrappedProps = Omit<
  InitOptionsBootstrapped,
  "bootstrappedFlags"
> &
  ReflagPropsBase & {
    /**
     * Pre-fetched flags to be used instead of fetching them from the server.
     */
    flags?: BootstrappedFlags;
  };

/**
 * Bootstrapped Provider for the ReflagClient using pre-fetched flags.
 */
export function ReflagBootstrappedProvider({
  flags,
  children,
  loadingComponent,
  newReflagClient = (...args) => new ReflagClient(...args),
  ...config
}: ReflagBootstrappedProps) {
  const context = useReflagProvider({
    config: { ...config, newReflagClient },
    context: flags?.context,
    bootstrappedFlags: flags?.flags,
    isBootstrapped: true,
  });

  return (
    <ProviderContext.Provider value={context}>
      {context.isLoading && typeof loadingComponent !== "undefined"
        ? loadingComponent
        : children}
    </ProviderContext.Provider>
  );
}

export type RequestFeedbackOptions = Omit<
  RequestFeedbackData,
  "flagKey" | "featureId"
>;

/**
 * @deprecated use `useFlag` instead
 */
export function useFeature<TKey extends FlagKey>(key: TKey) {
  return useFlag(key);
}

/**
 * Returns the state of a given feature for the current context, e.g.
 *
 * ```ts
 * function HuddleButton() {
 *   const {isEnabled, config: { payload }, track} = useFlag("huddle");
 *   if (isEnabled) {
 *    return <button onClick={() => track()}>{payload?.buttonTitle ?? "Start Huddle"}</button>;
 * }
 * ```
 */
export function useFlag<TKey extends FlagKey>(key: TKey): TypedFlags[TKey] {
  const client = useClient();
  const context = useContext(ProviderContext);
  const isLoading = context?.isLoading ?? true;

  const track = () => client?.track(key);
  const requestFeedback = (opts: RequestFeedbackOptions) =>
    client?.requestFeedback({ ...opts, flagKey: key });

  if (isLoading || !client) {
    return {
      key,
      isLoading,
      isEnabled: false,
      config: {
        key: undefined,
        payload: undefined,
      } as TypedFlags[TKey]["config"],
      track,
      requestFeedback,
    };
  }

  const feature = client.getFlag(key);

  return {
    key,
    isLoading,
    track,
    requestFeedback,
    get isEnabled() {
      return feature.isEnabled ?? false;
    },
    get config() {
      return feature.config as TypedFlags[TKey]["config"];
    },
  };
}

/**
 * Returns a function to send an event when a user performs an action
 * Note: When calling `useTrack`, user/company must already be set.
 *
 * ```ts
 * const track = useTrack();
 * track("Started Huddle", { button: "cta" });
 * ```
 */
export function useTrack() {
  const client = useClient();
  return (eventName: string, attributes?: Record<string, any> | null) =>
    client?.track(eventName, attributes);
}

/**
 * Returns a function to open up the feedback form
 * Note: When calling `useRequestFeedback`, user/company must already be set.
 *
 * See [link](../../browser-sdk/FEEDBACK.md#reflagclientrequestfeedback-options) for more information
 *
 * ```ts
 * const requestFeedback = useRequestFeedback();
 * reflag.requestFeedback({
 *   flagKey: "file-uploads",
 *   title: "How satisfied are you with file uploads?",
 * });
 * ```
 */
export function useRequestFeedback() {
  const client = useClient();
  return (options: RequestFeedbackData) => client?.requestFeedback(options);
}

/**
 * Returns a function to manually send feedback collected from a user.
 * Note: When calling `useSendFeedback`, user/company must already be set.
 *
 * See [link](./../../browser-sdk/FEEDBACK.md#using-your-own-ui-to-collect-feedback) for more information
 *
 * ```ts
 * const sendFeedback = useSendFeedback();
 * sendFeedback({
 *   flagKey: "huddle";
 *   question: "How did you like the new huddle feature?";
 *   score: 5;
 *   comment: "I loved it!";
 * });
 * ```
 */
export function useSendFeedback() {
  const client = useClient();
  return (opts: UnassignedFeedback) => client?.feedback(opts);
}

/**
 * Returns a function to update the current user's information.
 * For example, if the user changed role or opted into a beta-feature.
 *
 * The method returned is a function which returns a promise that
 * resolves when after the features have been updated as a result
 * of the user update.
 *
 * ```ts
 * const updateUser = useUpdateUser();
 * updateUser({ optInHuddles: "true" }).then(() => console.log("Flags updated"));
 * ```
 */
export function useUpdateUser() {
  const client = useClient();
  return (opts: { [key: string]: string | number | undefined }) =>
    client?.updateUser(opts);
}

/**
 * Returns a function to update the current company's information.
 * For example, if the company changed plan or opted into a beta-feature.
 *
 * The method returned is a function which returns a promise that
 * resolves when after the features have been updated as a result
 * of the company update.
 *
 * ```ts
 * const updateCompany = useUpdateCompany();
 * updateCompany({ plan: "enterprise" }).then(() => console.log("Flags updated"));
 * ```
 */
export function useUpdateCompany() {
  const client = useClient();

  return (opts: { [key: string]: string | number | undefined }) =>
    client?.updateCompany(opts);
}

/**
 * Returns a function to update the "other" context information.
 * For example, if the user changed workspace, you can set the workspace id here.
 *
 * The method returned is a function which returns a promise that
 * resolves when after the features have been updated as a result
 * of the update to the "other" context.
 *
 * ```ts
 * const updateOtherContext = useUpdateOtherContext();
 * updateOtherContext({ workspaceId: newWorkspaceId })
 *   .then(() => console.log("Flags updated"));
 * ```
 */
export function useUpdateOtherContext() {
  const client = useClient();
  return (opts: { [key: string]: string | number | undefined }) =>
    client?.updateOtherContext(opts);
}

/**
 * Returns the current `ReflagClient` used by the `ReflagProvider`.
 *
 * This is useful if you need to access the `ReflagClient` outside of the `ReflagProvider`.
 *
 * ```ts
 * const client = useClient();
 * useEffect(() => {
 *   return client?.on("check", () => {
 *     console.log("check hook called");
 *   });
 * }, [client]);
 * ```
 */
export function useClient() {
  const context = useContext(ProviderContext);
  if (!context) {
    throw new Error(
      "ReflagProvider is missing. Please ensure your component is wrapped with a ReflagProvider.",
    );
  }

  return context.client;
}
