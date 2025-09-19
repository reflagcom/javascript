<script setup lang="ts">
import { provide } from "vue";

import { ProviderSymbol } from "./hooks";
import { ReflagBootstrappedProps } from "./types";
import { useReflagProvider } from "./useReflagProvider";

// any optional prop which has boolean as part of the type, will default to false
// instead of `undefined`, so we use `withDefaults` here to pass the undefined
// down into the client.
const props = withDefaults(defineProps<ReflagBootstrappedProps>(), {
  enableTracking: undefined,
  toolbar: undefined,
});

const { flags, ...config } = props;

const context = useReflagProvider({
  config,
  context: flags?.context,
  bootstrappedFlags: flags?.flags,
  isBootstrapped: true,
});

provide(ProviderSymbol, context);
</script>

<template>
  <slot v-if="context.isLoading.value && $slots.loading" name="loading" />
  <slot v-else />
</template>
