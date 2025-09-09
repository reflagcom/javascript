<script setup lang="ts">
import canonicalJson from "canonical-json";
import { provide, ref, shallowRef, watch } from "vue";

import { ReflagClient } from "@reflag/browser-sdk";

import { ProviderSymbol } from "./hooks";
import { ProviderContextType, ReflagProps } from "./types";
import { SDK_VERSION } from "./version";

const flagsLoading = ref(true);
const updatedCount = ref<number>(0);

// any optional prop which has boolean as part of the type, will default to false
// instead of `undefined`, so we use `withDefaults` here to pass the undefined
// down into the client.
const props = withDefaults(defineProps<ReflagProps>(), {
  enableTracking: undefined,
  toolbar: undefined,
});

function updateClient() {
  const cnext = (
    props.newReflagClient ?? ((...args) => new ReflagClient(...args))
  )({
    ...props,
    logger: props.debug ? console : undefined,
    sdkVersion: SDK_VERSION,
  });
  flagsLoading.value = true;
  cnext
    .initialize()
    .catch((e) => cnext.logger.error("failed to initialize client", e))
    .finally(() => {
      flagsLoading.value = false;
    });

  return cnext;
}

watch(
  () =>
    canonicalJson(
      // canonicalJson doesn't handle `undefined` values, so we stringify/parse to remove them
      JSON.parse(
        JSON.stringify({
          user: props.user,
          company: props.company,
          otherContext: props.otherContext,
        }),
      ),
    ),
  () => {
    clientRef.value = updateClient();
  },
);

const clientRef = shallowRef<ReflagClient>(updateClient());

const context = {
  isLoading: flagsLoading,
  updatedCount: updatedCount,
  client: clientRef,
  provider: true,
} satisfies ProviderContextType;

provide(ProviderSymbol, context);
</script>

<template>
  <slot v-if="flagsLoading && $slots.loading" name="loading" />
  <slot v-else />
</template>
