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
  FlagDefaultFor,
  FlagDefaultValue,
  FlagValue,
  FlagValueFromDefault,
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

export type { FlagDefaultValue, FlagValue, FlagValueFromDefault };

/** Optional key/value registration; singular reads infer their type from defaults. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Flags {}
export type FlagKey = keyof Flags extends never
  ? string
  : Extract<keyof Flags, string>;
export type TypedFlags = keyof Flags extends never
  ? Record<string, FlagValue | undefined>
  : { [Key in keyof Flags]: Flags[Key] | undefined };

/**
 * An opt-in-enabled flag for the generated React SDK flag definitions.
 */
export type OptInFlag = Omit<BrowserOptInFlag, "key"> & {
  key: FlagKey;
};

/**
 * Describes a collection of evaluated raw flags.
 */
export type RawFlags = BrowserRawFlags;

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
   * Set to `true` to make `useOptInFlags` suspend while its metadata loads.
   * Use `useFlagSuspense` for suspending direct-value reads.
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

type ComparedContextPairs = WeakMap<object, WeakSet<object>>;

function markContextPairCompared(
  a: object,
  b: object,
  compared: ComparedContextPairs,
): boolean {
  const matches = compared.get(a);
  if (matches?.has(b)) return true;
  if (matches) matches.add(b);
  else compared.set(a, new WeakSet([b]));
  return false;
}

function contextValueEqual(
  a: unknown,
  b: unknown,
  compared: ComparedContextPairs,
): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      (markContextPairCompared(a, b, compared) ||
        a.every((value, index) => contextValueEqual(value, b[index], compared)))
    );
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  return contextPartEqual(
    a as Record<string, unknown>,
    b as Record<string, unknown>,
    compared,
  );
}

function contextPartEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
  compared: ComparedContextPairs,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (markContextPairCompared(a, b, compared)) return true;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      contextValueEqual(a[key], b[key], compared),
  );
}

function contextEqual(a: ReflagContext, b: ReflagContext) {
  const compared: ComparedContextPairs = new WeakMap();
  return (
    contextPartEqual(a.user, b.user, compared) &&
    contextPartEqual(a.company, b.company, compared) &&
    contextPartEqual(a.other, b.other, compared)
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
     * Pre-fetched flags used for the initial render. The browser client fetches opt-in
     * metadata on demand when opt-in flags are requested.
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
   * Whether a bootstrapped provider is fetching opt-in metadata.
   */
  isLoading: boolean;
};

/** Boolean-first, non-suspending reads. Supply a positional default for JSON values. */
export function useFlag(key: FlagKey, defaultValue?: undefined): boolean;
export function useFlag<
  Key extends FlagKey,
  Default extends FlagDefaultFor<Flags, Key>,
>(key: Key, defaultValue: Default): FlagValueFromDefault<Default>;
export function useFlag<Default extends FlagDefaultValue | object>(
  key: keyof Flags extends never ? string : never,
  defaultValue: Default,
): FlagValueFromDefault<Default>;
export function useFlag(
  key: FlagKey,
  defaultValue: FlagDefaultValue = false,
): FlagValue {
  return useFlagValue(key, defaultValue, false);
}

/** Wait for initialization, then read once. Missing flags use the default, not an endless suspension. */
export function useFlagSuspense(
  key: FlagKey,
  defaultValue?: undefined,
): boolean;
export function useFlagSuspense<
  Key extends FlagKey,
  Default extends FlagDefaultFor<Flags, Key>,
>(key: Key, defaultValue: Default): FlagValueFromDefault<Default>;
export function useFlagSuspense<Default extends FlagDefaultValue | object>(
  key: keyof Flags extends never ? string : never,
  defaultValue: Default,
): FlagValueFromDefault<Default>;
export function useFlagSuspense(
  key: FlagKey,
  defaultValue: FlagDefaultValue = false,
): FlagValue {
  return useFlagValue(key, defaultValue, true);
}

/** @deprecated Use useFlag. */
export const useFeature = useFlag;

function useFlagValue(
  key: FlagKey,
  defaultValue: FlagDefaultValue,
  suspend: boolean,
): FlagValue {
  const context = useSafeContext();
  const { client } = context;
  const [, update] = useState(0);
  useOnEvent("flagsUpdated", () => update((revision) => revision + 1), client);
  useIsomorphicLayoutEffect(() => {
    update((revision) => revision + 1);
  }, [client, key]);
  if (
    suspend &&
    isClientLoading(client) &&
    (!client.getConfig().bootstrapped || context.isLoading)
  ) {
    throw context.getLoadingPromise();
  }
  return client.getFlag(key, defaultValue);
}

/**
 * Returns opt-in-enabled flags and their loading state for the current context.
 *
 * The loading state is only used with `ReflagBootstrappedProvider` while
 * opt-in metadata is fetched on demand. Regular providers load opt-in metadata
 * with the initial flags.
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
    setFlags(getOptInFlags());
    setIsOptInFlagsLoading(client.getIsLoadingOptInFlags());
  }, [client]);

  const suspense = options.suspense ?? context.suspense;
  if (suspense && context.isLoading && isClientLoading(client)) {
    throw context.getLoadingPromise();
  }

  const isLoading = context.isLoading || isOptInFlagsLoading;
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
