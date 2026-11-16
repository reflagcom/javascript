# Reflag React SDK

Feature flags, remote configuration, usage tracking and feedback for React applications. Built on the [Browser SDK](../browser-sdk/README.md).

## Get started

Install the SDK:

```sh
npm install @reflag/react-sdk
```

Wrap your application in `ReflagProvider` with your **publishable** key and the signed-in user's context:

```tsx
import { ReflagProvider } from "@reflag/react-sdk";

<ReflagProvider
  publishableKey="your-publishable-key"
  context={{
    user: { id: "alice" },
    company: { id: "acme", plan: "enterprise" },
  }}
>
  <App />
</ReflagProvider>;
```

Then read a flag in any component:

```tsx
import { useFlag, useTrack } from "@reflag/react-sdk";

function Huddles() {
  const enabled = useFlag("huddles");
  const track = useTrack();
  if (!enabled) return null;
  return <button onClick={() => track("Started huddle")}>Start huddle</button>;
}
```

## Read flags

Without a default, `useFlag()` returns a Boolean. You get `false` while flags are loading, and if the flag is missing or isn't a Boolean.

To read a configuration value, pass a default. The return type follows the default, and you get the default back while loading, or if the flag is missing or holds a different type of value:

```tsx
const settings = useFlag("huddle-settings", { maxParticipants: 10 });
// settings.maxParticipants: number

useFlag("model", "quick"); // string
useFlag("limit", 10); // number
useFlag("nullable-settings", null); // any JSON value; narrow it yourself
```

The SDK checks only the top-level type of a value. If your application depends on nested fields, validate them.

Reading a flag records a check, even if you don't use the value. Reflag uses checks for launch monitoring.

## Loading states and Suspense

`useFlag()` returns immediately and never suspends. To show a loading UI, use `useIsLoading()` or the provider's `loadingComponent` prop:

```tsx
<ReflagProvider
  publishableKey="your-publishable-key"
  context={context}
  loadingComponent={<Spinner />}
>
  <App />
</ReflagProvider>
```

To wait for flags with React Suspense, use `useFlagSuspense()`. It takes the same arguments as `useFlag()`:

```tsx
import { Suspense } from "react";
import { useFlagSuspense } from "@reflag/react-sdk";

function Model() {
  const model = useFlagSuspense("model", "quick");
  return <span>{model}</span>;
}

<Suspense fallback={<span>Loading flags…</span>}>
  <Model />
</Suspense>;
```

## Track usage and feedback

```tsx
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

```tsx
import { ReflagBootstrappedProvider } from "@reflag/react-sdk";

<ReflagBootstrappedProvider publishableKey={publishableKey} flags={flags}>
  <App />
</ReflagBootstrappedProvider>;
```

Leave secrets and server-only attributes out of the context you bootstrap, because the browser can read it. Later refreshes evaluate flags using the browser's context. If values that depend on server-only attributes must not change, set `enableLiveFlagUpdates={false}`.

## Let users opt in to flags

```tsx
const { flags, isLoading } = useOptInFlags();
const setOptIn = useSetOptIn();

await setOptIn("huddles", { optedIn: true });
await setOptIn("huddles", { optedIn: false, scope: "company" });
```

Each entry includes the flag's `key`, `name`, `description` and whether the user or company has opted in. User and company opt-ins are independent. Check `isLoading` before rendering an empty state. The provider's `suspense` prop, or `useOptInFlags({ suspense: true })`, makes this hook suspend instead. See [Beta feature opt-in](https://docs.reflag.com/guides/self-opt-in) for a complete example.

## Toolbar

The toolbar shows on `localhost` by default and lets you toggle Boolean flags for yourself. Use the `toolbar` prop to show it elsewhere, for example to internal users in production:

```tsx
<ReflagProvider
  publishableKey="your-publishable-key"
  context={context}
  toolbar={user.isInternal}
>
  <App />
</ReflagProvider>
```

## Type safety

Optionally declare your flags to get autocompletion for keys and type checks for defaults:

```ts
import "@reflag/react-sdk";

declare module "@reflag/react-sdk" {
  interface Flags {
    huddles: boolean;
    "huddle-settings": { maxParticipants: number };
  }
}
```

The [Reflag CLI](https://docs.reflag.com/api/cli) can generate these declarations for you. Declarations are checked at compile time only.

## Use an existing client

`useClient()` returns the underlying Browser SDK client. If you already create a Browser SDK client yourself, pass it to `<ReflagClientProvider client={client}>`; your application is then responsible for initializing and stopping it. `useOnEvent(type, handler)` subscribes to client events and unsubscribes when the component unmounts.

## Configuration

The provider accepts the Browser SDK's configuration options, such as `fallbackFlags`, `enableTracking`, `offline`, `feedback` and `logger`, as props. Live updates are on by default in React; set `enableLiveFlagUpdates={false}` to turn them off. Set `debug` to log to the console.

For Content Security Policy requirements and the full list of options, see the [Browser SDK](../browser-sdk/README.md).
