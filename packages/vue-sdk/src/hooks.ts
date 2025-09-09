import { computed, inject, InjectionKey, onBeforeUnmount, ref } from "vue";

import { RequestFeedbackData, UnassignedFeedback } from "@reflag/browser-sdk";

import { Flag, ProviderContextType, RequestFlagFeedbackOptions } from "./types";

export const ProviderSymbol: InjectionKey<ProviderContextType> =
  Symbol("ReflagProvider");

export function useFlag(key: string): Flag<any> {
  const client = useClient();
  const ctx = injectSafe();

  const track = () => client?.value.track(key);
  const requestFeedback = (opts: RequestFlagFeedbackOptions) =>
    client.value.requestFeedback({ ...opts, flagKey: key });

  const feature = ref(client.value.getFlag(key));

  updateFlag();

  function updateFlag() {
    feature.value = client.value.getFlag(key);
  }

  client.value.on("flagsUpdated", updateFlag);
  onBeforeUnmount(() => {
    client.value.off("flagsUpdated", updateFlag);
  });

  return {
    key,
    isEnabled: computed(() => feature.value.isEnabled),
    config: computed(() => feature.value.config),
    track,
    requestFeedback,
    isLoading: computed(() => ctx.isLoading.value),
  };
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
 * track('button_clicked', { buttonName: 'Start Huddle' });
 * ```
 *
 * @returns A function that tracks an event. The function accepts:
 *   - `eventName`: The name of the event to track.
 *   - `attributes`: (Optional) Additional attributes to associate with the event.
 */
export function useTrack() {
  const client = useClient();
  return (eventName: string, attributes?: Record<string, any> | null) =>
    client?.value.track(eventName, attributes);
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
  return (options: RequestFeedbackData) =>
    client?.value.requestFeedback(options);
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
 *   feedback: "I love this feature!",
 *   metadata: { page: "dashboard" }
 * });
 * ```
 *
 * @returns A function that sends feedback to the Reflag SDK. The function accepts:
 *   - `options`: An object containing feedback options.
 */
export function useSendFeedback() {
  const client = useClient();
  return (opts: UnassignedFeedback) => client?.value.feedback(opts);
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
    client?.value.updateUser(opts);
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
    client?.value.updateCompany(opts);
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
    client?.value.updateOtherContext(opts);
}

/**
 * Vue composable for getting the Reflag client.
 *
 * This composable returns the Reflag client. You can use this to get the Reflag
 * client at any point in your application.
 *
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
 */
export function useIsLoading() {
  const ctx = injectSafe();
  return ctx.isLoading;
}

function injectSafe() {
  const ctx = inject(ProviderSymbol);
  if (!ctx?.provider) {
    throw new Error(
      `ReflagProvider is missing. Please ensure your component is wrapped with a ReflagProvider.`,
    );
  }
  return ctx;
}
