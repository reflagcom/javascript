# Reflag Vue SDK (beta)

Feature flags, remote configuration, usage tracking and feedback for Vue 3 applications. Built on the [Browser SDK](../browser-sdk/README.md).

## Get started

Install the SDK:

```sh
npm install @reflag/vue-sdk
```

Wrap your application in `ReflagProvider` with your **publishable** key and the signed-in user's context:

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

In Nuxt, wrap the provider in `<ClientOnly>`.

Then read a flag in any component:

```vue
<script setup lang="ts">
import { useFlag, useTrack } from "@reflag/vue-sdk";

const enabled = useFlag("huddles");
const track = useTrack();
</script>

<template>
  <button v-if="enabled" @click="track('Started huddle')">Start huddle</button>
</template>
```

## Read flags

`useFlag()` returns a ref that updates when the flag changes. Vue unwraps refs in templates; use `.value` in script.

Without a default, the ref holds a Boolean. It is `false` while flags are loading, and if the flag is missing or isn't a Boolean.

To read a configuration value, pass a default. The type follows the default, and the ref holds the default while loading, or if the flag is missing or holds a different type of value:

```ts
const settings = useFlag("huddle-settings", { maxParticipants: 10 });
// settings.value.maxParticipants: number

useFlag("model", "quick"); // Ref of string
useFlag("limit", 10); // Ref of number
useFlag("nullable-settings", null); // any JSON value; narrow it yourself
```

The SDK checks only the top-level type of a value. If your application depends on nested fields, validate them.

Reading a flag records a check, even if you don't use the value. Reflag uses checks for launch monitoring.

## Loading states

`useIsLoading()` returns a Boolean ref that is `true` while the provider loads flags. You can also put loading content in the provider's `#loading` slot, as in the example above.

## Track usage and feedback

```ts
const track = useTrack();
await track("Started huddle", { button: "cta" });

const requestFeedback = useRequestFeedback();
requestFeedback({ flagKey: "huddles", title: "How did it go?" });

const sendFeedback = useSendFeedback();
await sendFeedback({ flagKey: "huddles", score: 5 });
```

Configure your flag's adoption rules to match the event names you send. See the [Browser feedback documentation](../browser-sdk/FEEDBACK.md) to configure feedback prompts and the feedback UI.

## Update context

`useUpdateUser()`, `useUpdateCompany()` and `useUpdateOtherContext()` return functions that merge new attributes into the current context. To replace the whole context, call `useClient().setContext(context)`. Flag values are refetched for the new context.

## Bootstrap from the server

To render flags immediately, without waiting for a network request, evaluate them on your server with the **Node.js SDK**:

```ts
const flags = serverClient.getFlagsForBootstrap(context);
```

Then pass the whole result to `ReflagBootstrappedProvider`, serialized with your framework's usual mechanism:

```vue
<ReflagBootstrappedProvider :publishable-key="publishableKey" :flags="flags">
  <App />
</ReflagBootstrappedProvider>
```

Leave secrets and server-only attributes out of the context you bootstrap, because the browser can read it. Later refreshes evaluate flags using the browser's context. If values that depend on server-only attributes must not change, set `:enable-live-flag-updates="false"`.

## Let users opt in to flags

```ts
const { flags, isLoading } = useOptInFlags();
const setOptIn = useSetOptIn();

await setOptIn("huddles", { optedIn: true });
await setOptIn("huddles", { optedIn: false, scope: "company" });
```

Each entry includes the flag's `key`, `name`, `description` and whether the user or company has opted in. User and company opt-ins are independent. Check `isLoading` before rendering an empty state.

## Toolbar

The toolbar shows on `localhost` by default and lets you toggle Boolean flags for yourself. Use the `toolbar` prop to show it elsewhere, for example to internal users in production:

```vue
<ReflagProvider
  publishable-key="your-publishable-key"
  :context="context"
  :toolbar="user.isInternal"
>
  <App />
</ReflagProvider>
```

To override a flag from code, call `useClient().setFlagOverride(key, value)`. Pass `undefined` to remove the override.

## Type safety

Optionally declare your flags to get autocompletion for keys and type checks for defaults:

```ts
import "@reflag/vue-sdk";

declare module "@reflag/vue-sdk" {
  interface Flags {
    huddles: boolean;
    "huddle-settings": { maxParticipants: number };
  }
}
```

The [Reflag CLI](https://docs.reflag.com/api/cli) can generate these declarations for you with `--format vue`. Declarations are checked at compile time only.

## Use an existing client

`useClient()` returns the underlying Browser SDK client. If you already create a Browser SDK client yourself, pass it to `ReflagClientProvider`; your application is then responsible for initializing and stopping it. `useOnEvent(type, handler)` subscribes to client events and unsubscribes when the component unmounts.

## Configuration

The provider accepts the Browser SDK's configuration options, such as `fallbackFlags`, `enableTracking`, `offline`, `feedback` and `logger`, as props. Live updates are on by default in Vue; set `:enable-live-flag-updates="false"` to turn them off. Set `debug` to log to the console.

For Content Security Policy requirements and the full list of options, see the [Browser SDK](../browser-sdk/README.md).
