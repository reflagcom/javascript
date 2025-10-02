import type { Readable } from "svelte/store";
import type { ProviderContextType, ReflagProps } from "./types";
/**
 * Creates a Reflag provider context with the given configuration.
 * This should be called at the root of your Svelte application.
 *
 * @param props - The configuration for the Reflag client
 * @returns A readable store containing the provider context
 */
export declare function createReflagProvider(props: ReflagProps): Readable<ProviderContextType>;
/**
 * Gets the current Reflag provider context.
 * Throws an error if no provider has been created.
 */
export declare function getReflagContext(): ProviderContextType;
