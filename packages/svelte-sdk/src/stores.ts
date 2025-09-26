import { writable, derived, get } from "svelte/store";

import type { RequestFeedbackData, UnassignedFeedback } from "@reflag/browser-sdk";

import { getReflagContext } from "./provider";
import type { FlagKey, TypedFlags, RequestFlagFeedbackOptions } from "./types";

/**
 * Creates a store for a specific feature flag.
 * 
 * @param key - The key of the feature flag
 * @returns A Flag object with reactive Svelte stores
 */
export function useFlag<TKey extends FlagKey>(key: TKey): TypedFlags[TKey] {
  const context = getReflagContext();
  
  // Create reactive stores for the flag properties
  const flagStore = writable(null);
  const isEnabledStore = derived(
    [context.client, flagStore],
    ([$client]) => {
      if (!$client) return false;
      const flag = $client.getFlag(key);
      return flag.isEnabled ?? false;
    }
  );

  const configStore = derived(
    [context.client, flagStore],
    ([$client]) => {
      if (!$client) return { key: undefined, payload: undefined };
      const flag = $client.getFlag(key);
      return flag.config;
    }
  );

  const track = () => {
    const client = get(context.client);
    return client?.track(key);
  };

  const requestFeedback = (opts: RequestFlagFeedbackOptions) => {
    const client = get(context.client);
    return client?.requestFeedback({ ...opts, flagKey: key });
  };

  // Set up flag updates
  const client = get(context.client);
  if (client) {
    const updateFlag = () => {
      flagStore.set(client.getFlag(key) as any);
    };
    
    client.on("flagsUpdated", updateFlag);
    updateFlag(); // Initial update
  }

  return {
    key,
    isEnabled: isEnabledStore,
    isLoading: context.isLoading,
    config: configStore,
    track,
    requestFeedback,
  } as TypedFlags[TKey];
}

/**
 * Creates a store for tracking custom events.
 * 
 * @returns A function that tracks an event
 */
export function useTrack() {
  const context = getReflagContext();
  
  return (eventName: string, attributes?: Record<string, any> | null) => {
    const client = get(context.client);
    return client?.track(eventName, attributes);
  };
}

/**
 * Creates a store for requesting user feedback.
 * 
 * @returns A function that requests feedback from the user
 */
export function useRequestFeedback() {
  const context = getReflagContext();
  
  return (options: RequestFeedbackData) => {
    const client = get(context.client);
    return client?.requestFeedback(options);
  };
}

/**
 * Creates a store for sending feedback.
 * 
 * @returns A function that sends feedback to the Reflag SDK
 */
export function useSendFeedback() {
  const context = getReflagContext();
  
  return (opts: UnassignedFeedback) => {
    const client = get(context.client);
    return client?.feedback(opts);
  };
}

/**
 * Creates a store for updating the user context.
 * 
 * @returns A function that updates the user context
 */
export function useUpdateUser() {
  const context = getReflagContext();
  
  return (opts: { [key: string]: string | number | undefined }) => {
    const client = get(context.client);
    return client?.updateUser(opts);
  };
}

/**
 * Creates a store for updating the company context.
 * 
 * @returns A function that updates the company context
 */
export function useUpdateCompany() {
  const context = getReflagContext();
  
  return (opts: { [key: string]: string | number | undefined }) => {
    const client = get(context.client);
    return client?.updateCompany(opts);
  };
}

/**
 * Creates a store for updating the other context.
 * 
 * @returns A function that updates the other context
 */
export function useUpdateOtherContext() {
  const context = getReflagContext();
  
  return (opts: { [key: string]: string | number | undefined }) => {
    const client = get(context.client);
    return client?.updateOtherContext(opts);
  };
}

/**
 * Gets the current Reflag client as a readable store.
 * 
 * @returns A readable store containing the ReflagClient
 */
export function useClient() {
  const context = getReflagContext();
  return context.client;
}

/**
 * Gets the loading state as a readable store.
 * 
 * @returns A readable store indicating whether the client is loading
 */
export function useIsLoading() {
  const context = getReflagContext();
  return context.isLoading;
}

/**
 * @deprecated Use `useFlag` instead
 */
export function useFeature<TKey extends FlagKey>(key: TKey) {
  return useFlag(key);
}