import type { RequestFeedbackData, UnassignedFeedback } from "@reflag/browser-sdk";
import type { FlagKey, TypedFlags } from "./types";
/**
 * Creates a store for a specific feature flag.
 *
 * @param key - The key of the feature flag
 * @returns A Flag object with reactive Svelte stores
 */
export declare function useFlag<TKey extends FlagKey>(key: TKey): TypedFlags[TKey];
/**
 * Creates a store for tracking custom events.
 *
 * @returns A function that tracks an event
 */
export declare function useTrack(): (eventName: string, attributes?: Record<string, any> | null) => Promise<Response | undefined> | undefined;
/**
 * Creates a store for requesting user feedback.
 *
 * @returns A function that requests feedback from the user
 */
export declare function useRequestFeedback(): (options: RequestFeedbackData) => void | undefined;
/**
 * Creates a store for sending feedback.
 *
 * @returns A function that sends feedback to the Reflag SDK
 */
export declare function useSendFeedback(): (opts: UnassignedFeedback) => Promise<Response | undefined> | undefined;
/**
 * Creates a store for updating the user context.
 *
 * @returns A function that updates the user context
 */
export declare function useUpdateUser(): (opts: {
    [key: string]: string | number | undefined;
}) => Promise<void> | undefined;
/**
 * Creates a store for updating the company context.
 *
 * @returns A function that updates the company context
 */
export declare function useUpdateCompany(): (opts: {
    [key: string]: string | number | undefined;
}) => Promise<void> | undefined;
/**
 * Creates a store for updating the other context.
 *
 * @returns A function that updates the other context
 */
export declare function useUpdateOtherContext(): (opts: {
    [key: string]: string | number | undefined;
}) => Promise<void> | undefined;
/**
 * Gets the current Reflag client as a readable store.
 *
 * @returns A readable store containing the ReflagClient
 */
export declare function useClient(): import("svelte/store").Readable<import("@reflag/browser-sdk").ReflagClient | null>;
/**
 * Gets the loading state as a readable store.
 *
 * @returns A readable store indicating whether the client is loading
 */
export declare function useIsLoading(): import("svelte/store").Readable<boolean>;
/**
 * @deprecated Use `useFlag` instead
 */
export declare function useFeature<TKey extends FlagKey>(key: TKey): import("./types").Flag;
