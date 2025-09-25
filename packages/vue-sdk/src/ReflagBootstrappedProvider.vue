<script setup lang="ts">
import { onMounted, provide, ref, watch } from "vue";

import { ProviderSymbol, useClientEvent, useReflagClient } from "./hooks";
import { BootstrappedFlags, ReflagInitOptionsBase } from "./types";

/**
 * Props for the ReflagBootstrappedProvider.
 */
export type ReflagBootstrappedProps = ReflagInitOptionsBase & {
  /**
   * Pre-fetched flags to be used instead of fetching them from the server.
   */
  flags: BootstrappedFlags;
};

const props = withDefaults(defineProps<ReflagBootstrappedProps>(), {
  enableTracking: true,
});

const { flags, ...config } = props;

const client = useReflagClient({
  ...config,
  ...flags?.context,
  bootstrappedFlags: flags?.flags,
});

const isLoading = ref(client.getState() === "initializing");
useClientEvent(
  "stateUpdated",
  (state) => {
    isLoading.value = state === "initializing";
  },
  client,
);

// Initialize the client if it is not already initialized
onMounted(() => {
  if (client.getState() !== "idle") return;
  void client.initialize().catch((e) => {
    client.logger.error("failed to initialize client", e);
  });
});

// Update the context if it changes
watch(
  () => flags.context,
  (newContext) => {
    void client.updateContext(newContext);
  },
  { deep: true },
);

// Update the flags if they change
watch(
  () => flags.flags,
  (newFlags) => {
    client.updateFlags(newFlags);
  },
  { deep: true },
);

provide(ProviderSymbol, {
  isLoading,
  client,
});
</script>

<template>
  <slot v-if="isLoading && $slots.loading" name="loading" />
  <slot v-else />
</template>
