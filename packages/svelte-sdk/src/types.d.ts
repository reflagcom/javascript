import type { Readable } from "svelte/store";
import type { InitOptions, ReflagClient, ReflagContext, RequestFeedbackData } from "@reflag/browser-sdk";
export type EmptyFlagRemoteConfig = {
    key: undefined;
    payload: undefined;
};
export type FlagType = {
    config?: {
        payload: any;
    };
};
/**
 * A remotely managed configuration value for a feature.
 */
export type FlagRemoteConfig = {
    /**
     * The key of the matched configuration value.
     */
    key: string;
    /**
     * The optional user-supplied payload data.
     */
    payload: any;
} | EmptyFlagRemoteConfig;
/**
 * Describes a feature flag in Svelte
 */
export interface Flag {
    /**
     * The key of the feature.
     */
    key: string;
    /**
     * If the feature is enabled (as a Svelte store).
     */
    isEnabled: Readable<boolean>;
    /**
     * If the feature is loading (as a Svelte store).
     */
    isLoading: Readable<boolean>;
    /**
     * Optional user-defined configuration (as a Svelte store).
     */
    config: Readable<any>;
    /**
     * Track feature usage in Reflag.
     */
    track(): Promise<Response | undefined> | undefined;
    /**
     * Request feedback from the user.
     */
    requestFeedback: (opts: RequestFlagFeedbackOptions) => void;
}
export interface Flags {
}
/**
 * Describes a collection of evaluated features.
 *
 * @remarks
 * This type falls back to a generic Record<string, Flag> if the Flags interface
 * has not been extended.
 */
export type TypedFlags = keyof Flags extends never ? Record<string, Flag> : {
    [TypedFlagKey in keyof Flags]: Flag;
};
export type FlagKey = keyof TypedFlags;
/**
 * Context type for the Reflag provider store
 */
export interface ProviderContextType {
    client: Readable<ReflagClient | null>;
    isLoading: Readable<boolean>;
    provider: boolean;
}
/**
 * Props for the Reflag provider
 */
export type ReflagProps = ReflagContext & InitOptions & {
    /**
     * Whether to enable debug mode (optional).
     */
    debug?: boolean;
    /**
     * New ReflagClient constructor.
     *
     * @internal
     */
    newReflagClient?: (...args: ConstructorParameters<typeof ReflagClient>) => ReflagClient;
};
export type RequestFlagFeedbackOptions = Omit<RequestFeedbackData, "flagKey" | "featureId">;
