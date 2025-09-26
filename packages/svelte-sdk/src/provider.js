import canonicalJSON from "canonical-json";
import { writable, readable, get } from "svelte/store";
import { ReflagClient } from "@reflag/browser-sdk";
import { SDK_VERSION } from "./version";
// Global provider context store
const providerContext = writable(null);
/**
 * Creates a Reflag provider context with the given configuration.
 * This should be called at the root of your Svelte application.
 *
 * @param props - The configuration for the Reflag client
 * @returns A readable store containing the provider context
 */
export function createReflagProvider(props) {
    const clientStore = writable(null);
    const isLoadingStore = writable(true);
    const rawFlagsStore = writable({});
    let currentClient = null;
    let contextKey = null;
    // Create the context
    const context = {
        client: readable(null, (set) => {
            return clientStore.subscribe(set);
        }),
        isLoading: readable(true, (set) => {
            return isLoadingStore.subscribe(set);
        }),
        provider: true,
    };
    // Function to update the client when props change
    const updateClient = (newProps) => {
        const featureContext = {
            user: newProps.user || null,
            company: newProps.company || null,
            otherContext: newProps.otherContext || null
        };
        const configForKey = { ...newProps };
        delete configForKey.newReflagClient; // Remove function from serialization
        const newContextKey = canonicalJSON({ config: configForKey, featureContext });
        // Only recreate client if context has changed
        if (contextKey === newContextKey) {
            return;
        }
        contextKey = newContextKey;
        // Stop existing client
        if (currentClient) {
            void currentClient.stop();
        }
        isLoadingStore.set(true);
        // Create new client
        const client = (newProps.newReflagClient ?? ((...args) => new ReflagClient(...args)))({
            ...newProps,
            logger: newProps.debug ? console : undefined,
            sdkVersion: SDK_VERSION,
        });
        currentClient = client;
        clientStore.set(client);
        // Set up event listeners
        client.on("flagsUpdated", (flags) => {
            rawFlagsStore.set(flags);
        });
        // Initialize client
        client
            .initialize()
            .catch((e) => {
            client.logger.error("failed to initialize client", e);
        })
            .finally(() => {
            isLoadingStore.set(false);
        });
    };
    // Initialize with props
    updateClient(props);
    // Set the global context
    providerContext.set(context);
    // Return a store that allows updating the props
    return readable(context, (set) => {
        set(context);
        return () => {
            if (currentClient) {
                void currentClient.stop();
            }
            providerContext.set(null);
        };
    });
}
/**
 * Gets the current Reflag provider context.
 * Throws an error if no provider has been created.
 */
export function getReflagContext() {
    const context = get(providerContext);
    if (!context?.provider) {
        throw new Error("ReflagProvider is missing. Please ensure createReflagProvider() has been called at the root of your application.");
    }
    return context;
}
//# sourceMappingURL=provider.js.map