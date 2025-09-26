import {
  computed,
  inject,
  InjectionKey,
  onMounted,
  onUnmounted,
  ref,
} from "vue";

import {
  HookArgs,
  InitOptions,
  ReflagClient,
  RequestFeedbackData,
  UnassignedFeedback,
} from "@reflag/browser-sdk";

import {
  FlagKey,
  ProviderContextType,
  RequestFlagFeedbackOptions,
  TypedFlags,
} from "./types";
import { SDK_VERSION } from "./version";

export const ProviderSymbol: InjectionKey<ProviderContextType> =
  Symbol("ReflagProvider");

/**
 * Map of clients by context key. Used to deduplicate initialization of the client.
 * @internal
 */
const reflagClients = new Map<string, ReflagClient>();

/**
 * Returns the ReflagClient for a given publishable key.
 * Only creates a new ReflagClient if not already created or if it hook is run on the server.
 * @internal
 */
export function useReflagClient(
  initOptions: InitOptions,
  debug = false,
): ReflagClient {
  const isServer = typeof window === "undefined";
  if (isServer || !reflagClients.has(initOptions.publishableKey)) {
    const client = new ReflagClient({
      ...initOptions,
      sdkVersion: SDK_VERSION,
      logger: debug ? console : undefined,
    });
    if (!isServer) {
      reflagClients.set(initOptions.publishableKey, client);
    }
    return client;
  }
  return reflagClients.get(initOptions.publishableKey)!;
}

/**
 * Vue composable for getting the state of a given flag for the current context.
 *
 * This composable returns an object with the state of the flag for the current context.
 *
 * @param key - The key of the flag to get the state of.
 * @returns An object with the state of the flag.
 *
 * @example
 * ```ts
 * import { useFlag } from '@reflag/vue-sdk';
 *
 * const { isEnabled, config, track, requestFeedback } = useFlag("huddles");
 *
 * function StartHuddlesButton() {
 *   const { isEnabled, config: { payload }, track } = useFlag("huddles");
 *   if (isEnabled) {
 *    return <button onClick={() => track()}>{payload?.buttonTitle ?? "Start Huddles"}</button>;
 * }
 * ```
 */
export function useFlag<TKey extends FlagKey>(key: TKey): TypedFlags[TKey] {
  const client = useClient();
  const isLoading = useIsLoading();

  const track = () => client.track(key);
  const requestFeedback = (opts: RequestFlagFeedbackOptions) =>
    client.requestFeedback({ ...opts, flagKey: key });

  const flag = ref(
    client.getFlag(key) || {
      isEnabled: false,
      config: { key: undefined, payload: undefined },
    },
  );

  const updateFlag = () => {
    flag.value = client.getFlag(key);
  };

  onMounted(() => {
    updateFlag();
  });

  useOnEvent("flagsUpdated", updateFlag);

  return {
    key,
    isLoading,
    isEnabled: computed(() => flag.value.isEnabled),
    config: computed(() => flag.value.config),
    track,
    requestFeedback,
  } as TypedFlags[TKey];
}

/**
 * Vue composable for tracking custom events.
 *
 * This composable returns a function that can be used to track custom events
 * with the Reflag SDK.
 *
 * @example
 * ```ts
 * import { useTrack } from '@reflag/vue-sdk';
 *
 * const track = useTrack();
 *
 * // Track a custom event
 * track('button_clicked', { buttonName: 'Start Huddles' });
 * ```
 *
 * @returns A function that tracks an event. The function accepts:
 *   - `eventName`: The name of the event to track.
 *   - `attributes`: (Optional) Additional attributes to associate with the event.
 */
export function useTrack() {
  const client = useClient();
  return (eventName: string, attributes?: Record<string, any> | null) =>
    client.track(eventName, attributes);
}

/**
 * Vue composable for requesting user feedback.
 *
 * This composable returns a function that can be used to trigger the feedback
 * collection flow with the Reflag SDK. You can use this to prompt users for
 * feedback at any point in your application.
 *
 * @example
 * ```ts
 * import { useRequestFeedback } from '@reflag/vue-sdk';
 *
 * const requestFeedback = useRequestFeedback();
 *
 * // Request feedback from the user
 * requestFeedback({
 *   prompt: "How was your experience?",
 *   metadata: { page: "dashboard" }
 * });
 * ```
 *
 * @returns A function that requests feedback from the user. The function accepts:
 *   - `options`: An object containing feedback request options.
 */
export function useRequestFeedback() {
  const client = useClient();
  return (options: RequestFeedbackData) => client.requestFeedback(options);
}

/**
 * Vue composable for sending feedback.
 *
 * This composable returns a function that can be used to send feedback to the
 * Reflag SDK. You can use this to send feedback from your application.
 *
 * @example
 * ```ts
 * import { useSendFeedback } from '@reflag/vue-sdk';
 *
 * const sendFeedback = useSendFeedback();
 *
 * // Send feedback from the user
 * sendFeedback({
 *   feedback: "I love this flag!",
 *   metadata: { page: "dashboard" }
 * });
 * ```
 *
 * @returns A function that sends feedback to the Reflag SDK. The function accepts:
 *   - `options`: An object containing feedback options.
 */
export function useSendFeedback() {
  const client = useClient();
  return (opts: UnassignedFeedback) => client.feedback(opts);
}

/**
 * Vue composable for updating the user context.
 *
 * This composable returns a function that can be used to update the user context
 * with the Reflag SDK. You can use this to update the user context at any point
 * in your application.
 *
 * @example
 * ```ts
 * import { useUpdateUser } from '@reflag/vue-sdk';
 *
 * const updateUser = useUpdateUser();
 *
 * // Update the user context
 * updateUser({ id: "123", name: "John Doe" });
 * ```
 *
 * @returns A function that updates the user context. The function accepts:
 *   - `opts`: An object containing the user context to update.
 */
export function useUpdateUser() {
  const client = useClient();
  return (opts: { [key: string]: string | number | undefined }) =>
    client.updateUser(opts);
}

/**
 * Vue composable for updating the company context.
 *
 * This composable returns a function that can be used to update the company
 * context with the Reflag SDK. You can use this to update the company context
 * at any point in your application.
 *
 * @example
 * ```ts
 * import { useUpdateCompany } from '@reflag/vue-sdk';
 *
 * const updateCompany = useUpdateCompany();
 *
 * // Update the company context
 * updateCompany({ id: "123", name: "Acme Inc." });
 * ```
 *
 * @returns A function that updates the company context. The function accepts:
 *   - `opts`: An object containing the company context to update.
 */
export function useUpdateCompany() {
  const client = useClient();
  return (opts: { [key: string]: string | number | undefined }) =>
    client.updateCompany(opts);
}

/**
 * Vue composable for updating the other context.
 *
 * This composable returns a function that can be used to update the other
 * context with the Reflag SDK. You can use this to update the other context
 * at any point in your application.
 *
 * @example
 * ```ts
 * import { useUpdateOtherContext } from '@reflag/vue-sdk';
 *
 * const updateOtherContext = useUpdateOtherContext();
 *
 * // Update the other context
 * updateOtherContext({ id: "123", name: "Acme Inc." });
 * ```
 *
 * @returns A function that updates the other context. The function accepts:
 *   - `opts`: An object containing the other context to update.
 */
export function useUpdateOtherContext() {
  const client = useClient();
  return (opts: { [key: string]: string | number | undefined }) =>
    client.updateOtherContext(opts);
}

/**
 * Vue composable for getting the Reflag client.
 *
 * This composable returns the Reflag client. You can use this to get the Reflag
 * client at any point in your application.
 *
 * @example
 * ```ts
 * import { useClient } from '@reflag/vue-sdk';
 *
 * const client = useClient();
 *
 * console.log(client.getContext());
 * ```
 * @returns The Reflag client.
 */
export function useClient() {
  const ctx = injectSafe();
  return ctx.client;
}

/**
 * Vue composable for checking if the Reflag client is loading.
 *
 * This composable returns a boolean value that indicates whether the Reflag client is loading.
 * You can use this to check if the Reflag client is loading at any point in your application.
 * Initially, the value will be true until the client is initialized.
 *
 * @example
 * ```ts
 * import { useIsLoading } from '@reflag/vue-sdk';
 *
 * const isLoading = useIsLoading();
 *
 * console.log(isLoading);
 * ```
 */
export function useIsLoading() {
  const ctx = injectSafe();
  return ctx.isLoading;
}

/**
 * Vue composable for listening to Reflag client events.
 *
 * @example
 * ```ts
 * import { useOnEvent } from '@reflag/vue-sdk';
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
  const resolvedClient = client ?? useClient();
  let off: () => void;
  onMounted(() => {
    off = resolvedClient.on(event, handler);
  });
  onUnmounted(() => {
    off();
  });
}

function injectSafe() {
  const ctx = inject(ProviderSymbol);
  if (!ctx) {
    throw new Error(
      `ReflagProvider is missing. Please ensure your component is wrapped with a ReflagProvider.`,
    );
  }
  return ctx;
}
