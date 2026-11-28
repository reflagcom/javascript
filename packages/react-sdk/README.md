# Reflag React SDK

Feature flags, remote configuration, usage tracking and feedback for React applications. Built on the [Browser SDK](../browser-sdk/README.md).

## Get started

### 1. Add the provider

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

### 2. Create a flag

Install the Reflag CLI and create a flag:

```sh
npm install --save-dev @reflag/cli
npx reflag new
```

The first time you run it, it signs you in to Reflag, saves its settings in `reflag.config.json` and generates types for your flags in `gen/flags.d.ts`. Choose `react` when asked for the output format, and make sure your `tsconfig.json` includes the generated file. You can also create flags in the Reflag app.

### 3. Read the flag

Use `useFlag()` in any component:

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

Pass a flag key to check whether the flag is enabled:

```tsx
const enabled = useFlag("huddles"); // true or false
```

Pass a default as the second argument to read a configuration value. The default sets the expected JSON type:

```tsx
const model = useFlag("model", "quick"); // string
const settings = useFlag("huddle-settings", { maxParticipants: 10 }); // { maxParticipants: number }
```

While flags load, or if the flag is missing or has a different JSON type, `useFlag()` returns your default. Without a default, it expects a Boolean and falls back to `false`. Pass `null` to allow any JSON value, then check its type before using it.

The SDK doesn't check object fields or fill in missing fields from your default.

Each read records a check, which Reflag uses for launch monitoring.

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

## Overrides and toolbar

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

To override a flag from code, call `useClient().setFlagOverride(key, value)`. Pass `undefined` to remove the override.

## Type safety

Declaring your flags gives you autocompletion for keys and type checks for defaults. If you created a flag with `npx reflag new`, the declarations are already generated; run `npx reflag flags types` again when your flags change. A declaration looks like this:

```ts
import "@reflag/react-sdk";

declare module "@reflag/react-sdk" {
  interface Flags {
    huddles: boolean;
    "huddle-settings": { maxParticipants: number };
  }
}
```

Declarations are checked at compile time only. See the [Reflag CLI](https://docs.reflag.com/api/cli) for more options.

## Use an existing client

`useClient()` returns the underlying Browser SDK client. If you already create a Browser SDK client yourself, pass it to `<ReflagClientProvider client={client}>`; your application is then responsible for initializing and stopping it.

## Events

`useOnEvent(type, handler)` subscribes to [client events](../browser-sdk/README.md) and unsubscribes when the component unmounts.

## Configuration

The provider accepts the Browser SDK's configuration options, such as `fallbackFlags`, `enableTracking`, `offline`, `feedback` and `logger`, as props. Live updates are on by default in React; set `enableLiveFlagUpdates={false}` to turn them off. Set `debug` to log to the console.

For Content Security Policy requirements and the full list of options, see the [Browser SDK](../browser-sdk/README.md).
