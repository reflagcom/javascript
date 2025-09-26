<script setup lang="ts">
import { provide, ref } from "vue";

import { ProviderSymbol, useOnEvent } from "./hooks";
import { ReflagClientProviderProps } from "./types";

const { client, initialLoading = true } =
  defineProps<ReflagClientProviderProps>();

const isLoading = ref(initialLoading);
useOnEvent(
  "stateUpdated",
  (state) => {
    isLoading.value = state === "initializing";
  },
  client,
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
