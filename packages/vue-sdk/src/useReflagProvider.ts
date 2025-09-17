import canonicalJson from "canonical-json";
import { computed, ref, shallowRef, watch } from "vue";

import { ReflagClient } from "@reflag/browser-sdk";

import { ProviderContextType, UseReflagProviderOptions } from "./types";
import { SDK_VERSION } from "./version";

function removeUndefined(obj: Record<string, any>) {
  const t = { ...obj };
  for (const v in t) {
    if (typeof t[v] == "object") removeUndefined(t[v]);
    else if (t[v] == undefined) delete t[v];
  }
  return t;
}

/**
 * Shared composable that handles the common logic for both ReflagProvider and ReflagBootstrappedProvider
 */
export function useReflagProvider({
  config,
  context,
  bootstrappedFlags,
  isBootstrapped = false,
}: UseReflagProviderOptions): ProviderContextType {
  const flagsLoading = ref(true);

  const {
    newReflagClient = (...args) => new ReflagClient(...args),
    debug,
    ...initConfig
  } = config;

  const clientRef = shallowRef<ReflagClient | undefined>();

  function updateClient(): ReflagClient | undefined {
    // For bootstrapped provider, don't initialize if flags are not provided
    if (isBootstrapped && !bootstrappedFlags) {
      flagsLoading.value = false;
      return undefined;
    }

    // Create base client options
    const baseClientOptions = {
      ...initConfig,
      user: context?.user,
      company: context?.company,
      otherContext: context?.otherContext,
      logger: debug ? console : undefined,
      sdkVersion: SDK_VERSION,
    };

    // Add bootstrapped flags if this is a bootstrapped provider
    const clientOptions = bootstrappedFlags
      ? { ...baseClientOptions, bootstrappedFlags }
      : baseClientOptions;

    const client = newReflagClient(clientOptions);

    flagsLoading.value = true;
    client
      .initialize()
      .catch((e) => client.logger.error("failed to initialize client", e))
      .finally(() => {
        flagsLoading.value = false;
      });

    return client;
  }

  // Generate context key based to deduplicate initialization
  const contextKey = computed(() => {
    return canonicalJson(
      removeUndefined({
        ...initConfig,
        ...context,
        flags: bootstrappedFlags ?? null,
      }),
    );
  });

  watch(
    contextKey,
    () => {
      // Stop the previous client if it exists
      if (clientRef.value) {
        void clientRef.value.stop();
      }
      clientRef.value = updateClient();
    },
    { immediate: true },
  );

  return {
    isLoading: flagsLoading,
    client: clientRef,
  };
}
