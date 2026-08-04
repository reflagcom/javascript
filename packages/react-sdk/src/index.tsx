"use client";

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BootstrappedState as BrowserBootstrappedState,
  CheckEvent,
  CompanyContext,
  HookArgs,
  InitOptions,
  Logger,
  OptInFlag as BrowserOptInFlag,
  RawFlag,
  RawFlags as BrowserRawFlags,
  ReflagClient,
  ReflagContext,
  RequestFeedbackData,
  SetOptInOptions,
  StorageAdapter,
  TrackEvent,
  UnassignedFeedback,
  UserContext,
} from "@reflag/browser-sdk";

import { version } from "../package.json";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type {
  CheckEvent,
  CompanyContext,
  SetOptInOptions,
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
 * An opt-in-enabled flag for the generated React SDK flag definitions.
 */
export type OptInFlag = Omit<BrowserOptInFlag, "key"> & {
  key: FlagKey;
};

/**
 * Describes a collection of evaluated raw flags.
 */
export type RawFlags = Record<FlagKey, RawFlag>;

export type BootstrappedFlags = BrowserBootstrappedState & {
  flags: BrowserRawFlags;
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
   * Set to `true` to make `useFlag` and `useOptInFlags` suspend while their
   * required flag data is loading. Components that call either hook must be
   * wrapped in a React `<Suspense>` boundary.
   */
  suspense?: boolean;

  /**
   * A custom logger to use for SDK logs.
   * Use this for advanced control or filtering of SDK logs.
   * If both `logger` and `debug` are provided, `logger` takes precedence.
   */
  logger?: Logger;

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
  | "user"
  | "company"
  | "other"
  | "otherContext"
  | "bootstrappedFlags"
  | "bootstrappedState"
  | "logger"
>;

/**
 * Map of clients by context key. Used to deduplicate initialization of the client.
 * @internal
 */
const reflagClients = new Map<string, ReflagClient>();
const reflagClientBootstrappedStates = new WeakMap<
  ReflagClient,
  BrowserBootstrappedState
>();

function contextPartEqual(
  a?: Record<string, string | number | undefined>,
  b?: Record<string, string | number | undefined>,
) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key],
  );
}

function contextEqual(a: ReflagContext, b: ReflagContext) {
  return (
    contextPartEqual(a.user, b.user) &&
    contextPartEqual(a.company, b.company) &&
    contextPartEqual(a.other, b.other)
  );
}

/**
 * Returns the ReflagClient for a given publishable key.
 * Only creates a new ReflagClient if it is not already created or if the hook is run on the server.
 * @internal
 */
function useReflagClient(initOptions: InitOptions & { debug?: boolean }) {
  const {
    debug = false,
    logger,
    publishableKey,
    sdkVersion,
    enableLiveFlagUpdates,
    ...clientOptions
  } = initOptions;
  const isServer = typeof window === "undefined";
  if (isServer || !reflagClients.has(publishableKey)) {
    const client = new ReflagClient({
      ...clientOptions,
      publishableKey,
      enableLiveFlagUpdates: enableLiveFlagUpdates ?? true,
      logger: logger ?? (debug ? console : undefined),
      sdkVersion: sdkVersion ?? SDK_VERSION,
    });
    if (clientOptions.bootstrappedState) {
      reflagClientBootstrappedStates.set(
        client,
        clientOptions.bootstrappedState,
      );
    }
    if (!isServer) {
      reflagClients.set(publishableKey, client);
    }
    return client;
  }
  return reflagClients.get(publishableKey)!;
}

type LoadingPromiseState = {
  promise: Promise<void>;
  resolve: () => void;
};

const failedInitializations = new WeakSet<ReflagClient>();

function isClientLoading(client: ReflagClient) {
  if (failedInitializations.has(client)) return false;

  const state = client.getState();
  return state === "idle" || state === "initializing";
}

function createLoadingPromise(client: ReflagClient): LoadingPromiseState {
  let resolvePromise!: () => void;
  let settled = false;
  let unsubscribe: (() => void) | undefined;

  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const resolve = () => {
    if (settled) return;
    settled = true;
    unsubscribe?.();
    resolvePromise();
  };

  unsubscribe = client.on("stateUpdated", (state) => {
    if (state === "initialized" || state === "stopped") {
      resolve();
    }
  });

  return { promise, resolve };
}

const optInFlagsLoadingPromises = new WeakMap<ReflagClient, Promise<void>>();

function getOptInFlagsLoadingPromise(client: ReflagClient) {
  const existingPromise = optInFlagsLoadingPromises.get(client);
  if (existingPromise) return existingPromise;

  let unsubscribe: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    const finish = () => {
      unsubscribe?.();
      resolve();
    };

    unsubscribe = client.on("optInFlagsLoadingUpdated", (isLoading) => {
      if (!isLoading) finish();
    });

    if (!client.getIsLoadingOptInFlags()) finish();
  });

  optInFlagsLoadingPromises.set(client, promise);
  void promise.then(() => {
    if (optInFlagsLoadingPromises.get(client) === promise) {
      optInFlagsLoadingPromises.delete(client);
    }
  });

  if (client.getState() === "idle") {
    void Promise.resolve().then(() => {
      if (client.getState() !== "idle") return;
      return client.initialize().catch((error) => {
        client.logger.error("failed to initialize client", error);
      });
    });
  }

  return promise;
}

type ProviderContextType = {
  isLoading: boolean;
  client: ReflagClient;
  suspense: boolean;
  getLoadingPromise: () => Promise<void>;
};

const ProviderContext = createContext<ProviderContextType | null>(null);

/**
 * Props for the ReflagClientProvider.
 */
export type ReflagClientProviderProps = Omit<
  ReflagPropsBase,
  "debug" | "logger"
> & {
  client: ReflagClient;
};

export function ReflagClientProvider({
  client,
  loadingComponent,
  initialLoading = true,
  suspense = false,
  children,
}: ReflagClientProviderProps) {
  const hasInitialized = useRef(client.getState() === "initialized");
  const [isLoading, setIsLoading] = useState(
    hasInitialized.current || failedInitializations.has(client)
      ? false
      : initialLoading,
  );
  const loadingPromiseRef = useRef<LoadingPromiseState | null>(null);

  const getLoadingPromise = () => {
    if (!loadingPromiseRef.current) {
      loadingPromiseRef.current = createLoadingPromise(client);
    }

    if (client.getState() === "idle") {
      void Promise.resolve().then(() => {
        if (client.getState() !== "idle") return;
        return client.initialize().catch((e) => {
          client.logger.error("failed to initialize client", e);
          failedInitializations.add(client);
          setLoading(false);
        });
      });
    }

    return loadingPromiseRef.current.promise;
  };

  const setLoading = (loading: boolean) => {
    if (!loading) {
      loadingPromiseRef.current?.resolve();
      loadingPromiseRef.current = null;
    }

    setIsLoading(loading);
  };

  useEffect(() => {
    return () => {
      loadingPromiseRef.current?.resolve();
      loadingPromiseRef.current = null;
    };
  }, []);

  useOnEvent(
    "stateUpdated",
    (state) => {
      if (state === "initialized") {
        failedInitializations.delete(client);
        hasInitialized.current = true;
        setLoading(false);
        return;
      }

      if (state === "initializing") {
        setLoading(hasInitialized.current || initialLoading);
        return;
      }

      setLoading(false);
    },
    client,
  );

  return (
    <ProviderContext.Provider
      value={{
        isLoading,
        client,
        suspense,
        getLoadingPromise,
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
  suspense,
  logger,
  debug,
  ...config
}: ReflagProps) {
  const resolvedContext = useMemo(
    () => ({ user, company, other: otherContext, ...context }),
    [user, company, otherContext, context],
  );
  const lastAppliedProviderContext = useRef<ReflagContext | undefined>(
    undefined,
  );
  const client = useReflagClient({
    ...config,
    ...resolvedContext,
    debug,
    logger,
  });

  // Initialize the client if it is not already initialized
  useEffect(() => {
    if (client.getState() !== "idle") return;
    void client.initialize().catch((e) => {
      client.logger.error("failed to initialize client", e);
    });
  }, [client]);

  // Update the context if provider props semantically change. Keep this
  // independent from the client's current context so imperative updates via
  // useUpdateUser/useUpdateCompany are not reset by unrelated provider re-renders.
  useEffect(() => {
    const previousContext = lastAppliedProviderContext.current;
    if (previousContext && contextEqual(previousContext, resolvedContext)) {
      return;
    }

    lastAppliedProviderContext.current = resolvedContext;
    void client.setContext(resolvedContext);
  }, [client, resolvedContext]);

  return (
    <ReflagClientProvider
      client={client}
      initialLoading={initialLoading}
      loadingComponent={loadingComponent}
      suspense={suspense}
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
     * Pre-fetched flags used for the initial render. If opt-in flags are requested and
     * browser opt-in metadata is missing, the browser client refreshes them on demand.
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
  suspense,
  logger,
  debug,
  ...config
}: ReflagBootstrappedProps) {
  const client = useReflagClient({
    ...config,
    bootstrappedState: flags,
    debug,
    logger,
  });

  // Initialize the client if it is not already initialized
  useEffect(() => {
    if (client.getState() !== "idle") return;
    void client.initialize().catch((e) => {
      client.logger.error("failed to initialize client", e);
    });
  }, [client]);

  // Update the bootstrapped state if it changes on the client side
  useEffect(() => {
    if (reflagClientBootstrappedStates.get(client) === flags) return;

    reflagClientBootstrappedStates.set(client, flags);
    client.applyBootstrappedState(flags);
  }, [client, flags]);

  return (
    <ReflagClientProvider
      client={client}
      initialLoading={initialLoading}
      loadingComponent={loadingComponent}
      suspense={suspense}
    >
      {children}
    </ReflagClientProvider>
  );
}

export type RequestFeedbackOptions = Omit<
  RequestFeedbackData,
  "flagKey" | "featureId"
>;

export type UseFlagOptions = {
  /**
   * Override the provider suspense setting for this `useFlag` call.
   * When true, `useFlag` throws a promise while flags are loading.
   */
  suspense?: boolean;
};

export type UseOptInFlagsOptions = {
  /**
   * Override the provider suspense setting for this `useOptInFlags` call.
   * When true, `useOptInFlags` throws a promise while opt-in flags are loading.
   */
  suspense?: boolean;
};

export type UseOptInFlagsResult = {
  /**
   * Opt-in-enabled flags for the current context.
   */
  flags: OptInFlag[];

  /**
   * Whether opt-in metadata missing from a bootstrapped payload is loading.
   */
  isLoading: boolean;
};

/**
 * @deprecated use `useFlag` instead
 */
export function useFeature<TKey extends FlagKey>(
  key: TKey,
  options?: UseFlagOptions,
) {
  return useFlag(key, options);
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
export function useFlag<TKey extends FlagKey>(
  key: TKey,
  options: UseFlagOptions = {},
): TypedFlags[TKey] {
  const context = useSafeContext();
  const { client, isLoading } = context;
  const [flag, setFlag] = useState(() => client.getFlag(key));

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

  if (
    isLoading &&
    isClientLoading(client) &&
    (options.suspense ?? context.suspense)
  ) {
    throw context.getLoadingPromise();
  }

  if (isLoading) {
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
 * Returns opt-in-enabled flags and their loading state for the current context.
 *
 * The loading state is only used with `ReflagBootstrappedProvider` when the
 * bootstrap payload does not contain browser opt-in metadata and it is fetched
 * on demand. Regular providers load opt-in metadata with the initial flags.
 * When suspense is enabled for the provider or this hook, it suspends instead
 * of returning a loading result.
 */
export function useOptInFlags(
  options: UseOptInFlagsOptions = {},
): UseOptInFlagsResult {
  const context = useSafeContext();
  const { client } = context;
  const getOptInFlags = () => client.getOptInFlags() as OptInFlag[];
  const [flags, setFlags] = useState(getOptInFlags);
  const isBootstrapped = client.getConfig().bootstrapped;
  const [isOptInFlagsLoading, setIsOptInFlagsLoading] = useState(() =>
    client.getIsLoadingOptInFlags(),
  );

  useOnEvent(
    "flagsUpdated",
    () => {
      setFlags(getOptInFlags());
    },
    client,
  );
  useOnEvent("optInFlagsLoadingUpdated", setIsOptInFlagsLoading, client);

  useIsomorphicLayoutEffect(() => {
    setIsOptInFlagsLoading(client.getIsLoadingOptInFlags());
  }, [client]);

  const suspense = options.suspense ?? context.suspense;
  if (suspense && context.isLoading && isClientLoading(client)) {
    throw context.getLoadingPromise();
  }

  const isLoading = isBootstrapped && isOptInFlagsLoading;
  if (suspense && isLoading) {
    throw getOptInFlagsLoadingPromise(client);
  }

  return { flags, isLoading };
}

/**
 * Returns a function to set whether the current user or company has opted into a flag.
 */
export function useSetOptIn() {
  const client = useClient();
  return (key: FlagKey, options: SetOptInOptions) =>
    client.setOptIn(String(key), options);
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
  useIsomorphicLayoutEffect(() => {
    return resolvedClient.on(event, handler);
  }, [resolvedClient, event, handler]);
}
