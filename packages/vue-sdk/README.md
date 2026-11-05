# Reflag Vue SDK v2 (beta)

Reactive direct-value flags for Vue 3, backed by [Browser SDK v2](../browser-sdk/README.md).

> Breaking prerelease: requires the compatible v2 server protocol. Bootstrap must come from **Node SDK v2**, not v1. Generated declarations are optional; the v2 CLI supports `--format vue` and direct-value schemas. Regenerate legacy wrapper-shaped declarations when migrating.

## Setup

```vue
<script setup lang="ts">
import { ReflagProvider } from "@reflag/vue-sdk";
</script>

<template>
  <ReflagProvider
    publishable-key="your-publishable-key"
    :context="{
      user: { id: 'alice' },
      company: { id: 'acme', plan: 'enterprise' },
    }"
  >
    <template #loading>Loading flags…</template>
    <App />
  </ReflagProvider>
</template>
```

Provider options forward Browser settings, including cache/storage, fallback values, offline/tracking, feedback, toolbar, credentials and API origins. `logger` takes precedence over `debug`. Live updates default to true; disable with `:enable-live-flag-updates="false"`. For an ordinary client-only Nuxt provider, wrap it in `<ClientOnly>`.

## `useFlag(key, defaultValue?)`

```vue
<script setup lang="ts">
import { useFlag, useIsLoading, useTrack } from "@reflag/vue-sdk";

const enabled = useFlag("huddles"); // ShallowRef<boolean>; implicit false
const settings = useFlag("huddle-settings", { maxParticipants: 10 });
const isLoading = useIsLoading();
const track = useTrack();
// In script: enabled.value, settings.value.maxParticipants
</script>

<template>
  <span v-if="isLoading">Loading…</span>
  <button v-else-if="enabled" @click="track('Started huddle')">
    Start huddle (up to {{ settings.maxParticipants }} people)
  </button>
</template>
```

Vue unwraps refs in templates; use `.value` in script. This is a **Vue ref**, not a flag wrapper. There are no `.isEnabled`, `.config`, flag `.track()` or flag loading fields.

```ts
useFlag("release"); // ShallowRef<boolean>
useFlag("model", "quick"); // ShallowRef<string>
useFlag("limit", 10); // ShallowRef<number>
useFlag("settings", { model: "quick" }); // ShallowRef<{ model: string }>
useFlag("nullable-settings", null); // ShallowRef<FlagValue>
```

Defaults are positional JSON; literals widen without generated types. Non-null defaults require the same top-level category (Boolean/number/string/array/object), otherwise the default is returned with a payload-safe warning. Null explicitly accepts arbitrary JSON, including authored null; missing returns null. Valid false/zero/empty strings are preserved. Nested payload schemas are not validated by the SDK. Returned values/defaults are independent copies; readonly defaults are accepted.

The ref updates when evaluated flags change. A composable read registers the requested root through the Browser SDK, even if its result is ignored; refresh-driven rereads are identity-aware rate-limited and delivered in batches. Diagnostics/bootstrap inspection register none. Checks carry genuine selected key/source/snapshot identity, never payloads or invented selections for defaults/overrides.

## Loading, context and client access

- `useIsLoading()` returns a Boolean ref for provider loading; the `#loading` slot and `initialLoading` control initial presentation.
- `useUpdateUser()`, `useUpdateCompany()` and `useUpdateOtherContext()` return async shallow-update functions.
- `useClient()` exposes the Browser client, including `setContext(context)`, `refresh()` and `setFlagOverride(key, value)`. Undefined clears an override; null is a JSON override.
- `getFlags()` returns direct values and registers returned-root checks. Use `getFlagResults()` for tooling without checks.
- `useOnEvent(type, handler, client?)` subscribes on mount and unsubscribes on unmount. An external client may be supplied explicitly.

A context change clears old values while fetching. Late responses for previous contexts or lower snapshot versions cannot replace accepted state. V2 cache/override storage is isolated from v1. Browser fetching uses `/flags/evaluated` and never re-evaluates/caches dependencies locally.

## Bootstrap

On the server, use Node SDK v2 and your framework's safe serialization mechanism:

```ts
const flags = serverClient.getFlagsForBootstrap(context);
```

```vue
<ReflagBootstrappedProvider :publishable-key="publishableKey" :flags="flags">
  <App />
</ReflagBootstrappedProvider>
```

Pass the entire envelope (`protocolVersion: 2`, context, evaluated flags and optional snapshot version). Legacy v1 bootstrap is rejected. A snapshot version is required for live updates. Never expose secret keys/server-only attributes in bootstrap data; later refreshes use browser-visible context, so disable live updates when they must not replace server-only evaluations.

`ReflagClientProvider` accepts an externally initialized Browser v2 client. Its lifecycle belongs to the application.

## Opt-in, tracking and feedback

```ts
const { flags, isLoading } = useOptInFlags(); // refs to metadata/list loading
const setOptIn = useSetOptIn();
await setOptIn("huddles", { optedIn: true });
await setOptIn("huddles", { optedIn: false, scope: "company" });

const track = useTrack();
await track("Started huddle", { button: "cta" });
const requestFeedback = useRequestFeedback();
requestFeedback({ flagKey: "huddles", title: "How did it go?" });
const sendFeedback = useSendFeedback();
await sendFeedback({ flagKey: "huddles", score: 5 });
```

Opt-in metadata arrives with ordinary `/flags/evaluated` responses. Bootstrapped providers fetch missing metadata on demand from the same v2 endpoint without replacing server-derived values or provenance; loading settles on success or failure. User/company grants remain independent; successful mutations confirm versioned evaluation and membership in a single refresh. The metadata list retains presentation/membership fields such as `isEnabled`; ordinary reads remain direct values.

`enableTracking: false` disables checks and ordinary tracking. Offline mode skips HTTP/tracking. See [Browser feedback documentation](../browser-sdk/FEEDBACK.md) for prompting/UI options.

## Optional key registration and migration

```ts
import "@reflag/vue-sdk";
declare module "@reflag/vue-sdk" {
  interface Flags {
    huddles: boolean;
    "huddle-settings": { maxParticipants: number };
  }
}
```

Registration constrains keys and checks non-null defaults against the registered value schema, including required and nested properties. Named-interface and readonly defaults are supported. Explicit `null` remains an arbitrary-JSON request; bare/`undefined` reads remain Boolean refs. Positional defaults still determine widened direct-value types, and generated declarations do not add nested runtime validation. The v2 CLI generates these schemas from current production-environment variants with `--format vue`; regenerate old wrapper declarations when migrating.

Replace `const { isEnabled } = useFlag(key)` with `const enabled = useFlag(key)` (then `enabled.value` in script). Replace remote-config wrappers with separately authored multivariate flags and positional defaults, and move usage/feedback into their separate composables. Bootstrap both ends with v2. This branch does not publish SDKs or deploy the required server changes.
