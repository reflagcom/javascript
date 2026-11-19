# Reflag Vue SDK

Feature flags, remote configuration, usage tracking and feedback for Vue 3 applications. Built on the [Browser SDK](../browser-sdk/README.md).

## Get started

### 1. Add the provider

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

### 2. Create a flag

Create a flag with the key `huddles` in the Reflag app.

### 3. Read the flag

Use `useFlag()` in any component:

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

Pass a flag key to check whether the flag is enabled:

```ts
const enabled = useFlag("huddles"); // ref of true or false
```

To read a configuration value, pass a default as the second argument. The ref holds a value of the same type as the default:

```ts
const model = useFlag("model", "quick"); // ref of string
const settings = useFlag("huddle-settings", { maxParticipants: 10 }); // ref of { maxParticipants: number }
```

While flags are loading, if the flag doesn't exist, or if its value has a different type, the ref holds `false`, or your default if you passed one. Pass `null` as the default to accept any JSON value and narrow it yourself.

The SDK checks only the top-level type of a value. If your application depends on nested fields, validate them.

Each read records a check, which Reflag uses for launch monitoring.

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

Use Node SDK v2 and preserve the whole object, including `protocolVersion: 2`. V1 bootstrap data is not supported. Live updates require `flagStateVersion` in the bootstrap data.

Leave secrets and server-only attributes out of the context you bootstrap, because the browser can read it. Later refreshes evaluate flags using the browser's context. If values that depend on server-only attributes must not change, set `:enable-live-flag-updates="false"`.

## Let users opt in to flags

```ts
const { flags, isLoading } = useOptInFlags();
const setOptIn = useSetOptIn();

try {
  const response = await setOptIn("huddles", { optedIn: true });
  if (!response?.ok) console.error("Could not update opt-in");
} catch (error) {
  console.error("Could not update opt-in", error);
}
```

Each entry includes the flag's `key`, `name`, `description` and whether the user or company has opted in. User and company opt-ins are independent; pass `scope: "company"` to change the company's opt-in. Check `isLoading` before rendering an empty state.

Opt-in metadata arrives with flag values. Bootstrapped providers fetch missing metadata on demand without replacing server-evaluated values, even with live updates disabled. `isLoading` covers initialization and metadata retrieval and settles on success or failure. Failed metadata requests do not expose an error; use `useClient().refresh()` to retry.

Check the mutation's returned `Response.ok` and catch rejections. HTTP failures return a readable non-OK response without refreshing; skipped calls return `undefined`. Successful mutations wait for updated values and membership confirmation, but confirmation can fail after membership has changed remotely.

## Overrides and toolbar

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

## Use an existing client

`useClient()` returns the underlying Browser SDK client. If you already create a Browser SDK client yourself, pass it to `ReflagClientProvider`; your application is then responsible for initializing and stopping it.

## Events

`useOnEvent(type, handler)` subscribes to [client events](../browser-sdk/README.md) and unsubscribes when the component unmounts.

## Configuration

The provider accepts the Browser SDK's configuration options, such as `fallbackFlags`, `enableTracking`, `offline`, `feedback` and `logger`, as props. Live updates are on by default in Vue; set `:enable-live-flag-updates="false"` to turn them off. Set `debug` to log to the console.

For Content Security Policy requirements and the full list of options, see the [Browser SDK](../browser-sdk/README.md).
