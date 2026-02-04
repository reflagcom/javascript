"use client";

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckEvent,
  CompanyContext,
  HookArgs,
  InitOptions,
  RawFlag,
  ReflagClient,
  ReflagContext,
  RequestFeedbackData,
  StorageAdapter,
  TrackEvent,
  UnassignedFeedback,
  UserContext,
} from "@reflag/browser-sdk";

import { version } from "../package.json";

export type {
  CheckEvent,
  CompanyContext,
  StorageAdapter,
  TrackEvent,
  UserContext,
};

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

export type FlagKey = keyof TypedFlags;

/**
 * Describes a collection of evaluated raw flags.
 */
export type RawFlags = Record<FlagKey, RawFlag>;

export type BootstrappedFlags = {
  context: ReflagContext;
  flags: RawFlags;
};

const SDK_VERSION = `react-sdk/${version}`;

/**
 * Base props for the ReflagProvider and ReflagBootstrappedProvider.
 * @internal
 */
export type ReflagPropsBase = {
  /**
   * The children to render after the client is initialized.
   */
  children?: ReactNode;

  /**
   * A React component to show while the client is initializing.
   */
  loadingComponent?: ReactNode;

  /**
   * Set to `true` to show the loading component while the client is initializing.
   */
  initialLoading?: boolean;

  /**
   * Set to `true` to enable debug logging to the console,
   */
  debug?: boolean;
};

/**
 * Base init options for the ReflagProvider and ReflagBootstrappedProvider.
 * @internal
 */
export type ReflagInitOptionsBase = Omit<
  InitOptions,
  "user" | "company" | "other" | "otherContext" | "bootstrappedFlags"
>;

/**
 * Map of clients by context key. Used to deduplicate initialization of the client.
 * @internal
 */
const reflagClients = new Map<string, ReflagClient>();

/**
 * Returns the ReflagClient for a given publishable key.
 * Only creates a new ReflagClient is not already created or if it hook is run on the server.
 * @internal
 */
function useReflagClient(initOptions: InitOptions, debug = false) {
  const isServer = typeof window === "undefined";
  if (isServer || !reflagClients.has(initOptions.publishableKey)) {
    const client = new ReflagClient({
      ...initOptions,
      logger: debug ? console : undefined,
      sdkVersion: SDK_VERSION,
    });
    if (!isServer) {
      reflagClients.set(initOptions.publishableKey, client);
    }
    return client;
  }
  return reflagClients.get(initOptions.publishableKey)!;
}

type ProviderContextType = {
  isLoading: boolean;
  client: ReflagClient;
};

const ProviderContext = createContext<ProviderContextType | null>(null);

/**
 * Props for the ReflagClientProvider.
 */
export type ReflagClientProviderProps = Omit<ReflagPropsBase, "debug"> & {
  client: ReflagClient;
};

export function ReflagClientProvider({
  client,
  loadingComponent,
  initialLoading = true,
  children,
}: ReflagClientProviderProps) {
  const [isLoading, setIsLoading] = useState(
    client.getState() !== "initialized" ? initialLoading : false,
  );

  useOnEvent(
    "stateUpdated",
    (state) => {
      setIsLoading(state === "initializing");
    },
    client,
  );

  return (
    <ProviderContext.Provider
      value={{
        isLoading,
        client,
      }}
    >
      {isLoading && typeof loadingComponent !== "undefined"
        ? loadingComponent
        : children}
    </ProviderContext.Provider>
  );
}

/**
 * Props for the ReflagProvider.
 */
export type ReflagProps = ReflagPropsBase &
  ReflagInitOptionsBase & {
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
 * Provider for the ReflagClient.
 */
export function ReflagProvider({
  children,
  context,
  user,
  company,
  otherContext,
  loadingComponent,
  initialLoading = true,
  debug,
  ...config
}: ReflagProps) {
  const resolvedContext = useMemo(
    () => ({ user, company, other: otherContext, ...context }),
    [user, company, otherContext, context],
  );
  const client = useReflagClient(
    {
      ...config,
      ...resolvedContext,
    },
    debug,
  );

  // Initialize the client if it is not already initialized
  useEffect(() => {
    if (client.getState() !== "idle") return;
    void client.initialize().catch((e) => {
      client.logger.error("failed to initialize client", e);
    });
  }, [client]);

  // Update the context if it changes
  useEffect(() => {
    void client.setContext(resolvedContext);
  }, [client, resolvedContext]);

  return (
    <ReflagClientProvider
      client={client}
      initialLoading={initialLoading}
      loadingComponent={loadingComponent}
    >
      {children}
    </ReflagClientProvider>
  );
}

/**
 * Props for the ReflagBootstrappedProvider.
 */
export type ReflagBootstrappedProps = ReflagPropsBase &
  ReflagInitOptionsBase & {
    /**
     * Pre-fetched flags to be used instead of fetching them from the server.
     */
    flags: BootstrappedFlags;
  };

/**
 * Bootstrapped Provider for the ReflagClient using pre-fetched flags.
 */
export function ReflagBootstrappedProvider({
  flags,
  children,
  loadingComponent,
  initialLoading = false,
  debug,
  ...config
}: ReflagBootstrappedProps) {
  const client = useReflagClient(
    {
      ...config,
      ...flags.context,
      bootstrappedFlags: flags.flags,
    },
    debug,
  );

  // Initialize the client if it is not already initialized
  useEffect(() => {
    if (client.getState() !== "idle") return;
    void client.initialize().catch((e) => {
      client.logger.error("failed to initialize client", e);
    });
  }, [client]);

  // Update the context if it changes on the client side
  useEffect(() => {
    void client.setContext(flags.context);
  }, [client, flags.context]);

  // Update the bootstrappedFlags if they change on the client side
  useEffect(() => {
    client.updateFlags(flags.flags);
  }, [client, flags.flags]);

  return (
    <ReflagClientProvider
      client={client}
      initialLoading={initialLoading}
      loadingComponent={loadingComponent}
    >
      {children}
    </ReflagClientProvider>
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
  const isLoading = useIsLoading();
  const [flag, setFlag] = useState(client.getFlag(key));

  const track = () => client.track(key);
  const requestFeedback = (opts: RequestFeedbackOptions) =>
    client.requestFeedback({ ...opts, flagKey: key });

  useOnEvent(
    "flagsUpdated",
    () => {
      setFlag(client.getFlag(key));
    },
    client,
  );

  if (isLoading || !flag) {
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

  return {
    key,
    isLoading,
    track,
    requestFeedback,
    get isEnabled() {
      return flag.isEnabled ?? false;
    },
    get config() {
      return flag.config as TypedFlags[TKey]["config"];
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
    client.track(eventName, attributes);
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
  return (options: RequestFeedbackData) => client.requestFeedback(options);
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
  return (opts: UnassignedFeedback) => client.feedback(opts);
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
    client.updateUser(opts);
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
    client.updateCompany(opts);
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
    client.updateOtherContext(opts);
}

/**
 * Returns the current `ReflagProvider` context.
 * @internal
 */
function useSafeContext() {
  const ctx = useContext(ProviderContext);
  if (!ctx) {
    throw new Error(
      `ReflagProvider is missing. Please ensure your component is wrapped with a ReflagProvider.`,
    );
  }
  return ctx;
}

/**
 * Returns a boolean indicating if the Reflag client is loading.
 * You can use this to check if the Reflag client is loading at any point in your application.
 * Initially, the value will be true until the client is initialized.
 *
 * @example
 * ```ts
 * import { useIsLoading } from '@reflag/react-sdk';
 *
 * const isLoading = useIsLoading();
 *
 * console.log(isLoading);
 * ```
 *
 * @returns A boolean indicating if the Reflag client is loading.
 */
export function useIsLoading() {
  const context = useSafeContext();
  return context.isLoading;
}

/**
 * Returns the current `ReflagClient` used by the `ReflagProvider`.
 *
 * This is useful if you need to access the `ReflagClient` outside of the `ReflagProvider`.
 *
 * @example
 * ```ts
 * import { useClient } from '@reflag/react-sdk';
 *
 * function App() {
 *   const client = useClient();
 *   console.log(client.getContext());
 * }
 * ```
 *
 * @returns The `ReflagClient`.
 */
export function useClient() {
  const context = useSafeContext();
  return context.client;
}

/**
 * Attach a callback handler to client events to act on changes. It automatically disposes itself on unmount.
 *
 * @example
 * ```ts
 * import { useOnEvent } from '@reflag/react-sdk';
 *
 * useOnEvent("flagsUpdated", () => {
 *   console.log("flags updated");
 * });
 * ```
 *
 * @param event - The event to listen to.
 * @param handler - The function to call when the event is triggered.
 * @param client - The Reflag client to listen to. If not provided, the client will be retrieved from the context.
 */
export function useOnEvent<THookType extends keyof HookArgs>(
  event: THookType,
  handler: (arg0: HookArgs[THookType]) => void,
  client?: ReflagClient,
) {
  const contextClient = useContext(ProviderContext);
  const resolvedClient = client ?? contextClient?.client;
  if (!resolvedClient) {
    throw new Error(
      `ReflagProvider is missing and no client was provided. Please ensure your component is wrapped with a ReflagProvider.`,
    );
  }
  useEffect(() => {
    return resolvedClient.on(event, handler);
  }, [resolvedClient, event, handler]);
}
