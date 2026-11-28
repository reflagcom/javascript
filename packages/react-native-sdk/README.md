# Reflag React Native SDK

Feature flags, remote configuration and usage tracking for React Native apps. Built on the [React SDK](../react-sdk/README.md), with flag caching and live updates set up for React Native.

## Get started

### 1. Add the provider

Install the SDK:

```sh
npm install @reflag/react-native-sdk
```

It requires React 17 or later. Wrap your app in `ReflagProvider` with your **publishable** key and the signed-in user's context:

```tsx
import { ReflagProvider } from "@reflag/react-native-sdk";

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

Publishable keys are safe to ship in your app. Keep secret keys on your server.

### 2. Create a flag

Create a flag with the key `huddles` in the Reflag app.

### 3. Read the flag

Use `useFlag()` in any component:

```tsx
import { Button } from "react-native";
import { useFlag, useTrack } from "@reflag/react-native-sdk";

function StartHuddleButton() {
  const enabled = useFlag("huddles");
  const track = useTrack();
  if (!enabled) return null;
  return (
    <Button title="Start huddle" onPress={() => void track("Started huddle")} />
  );
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

`useFlag()` returns immediately and never suspends. To show a loading UI, use `useIsLoading()`. To wait for flags with React Suspense, use `useFlagSuspense()`. It takes the same arguments as `useFlag()`:

```tsx
import { Suspense } from "react";
import { ActivityIndicator } from "react-native";
import { useFlagSuspense } from "@reflag/react-native-sdk";

function Huddles() {
  const enabled = useFlagSuspense("huddles");
  return enabled ? <HuddleScreen /> : null;
}

<Suspense fallback={<ActivityIndicator />}>
  <Huddles />
</Suspense>;
```

## Track usage and feedback

```tsx
const track = useTrack();
await track("Started huddle", { button: "cta" });

const sendFeedback = useSendFeedback();
await sendFeedback({ flagKey: "huddles", score: 5 });
```

Configure your flag's adoption rules to match the event names you send. The built-in feedback UI is web-only, so collect feedback with your own UI and send it with `useSendFeedback()`.

## Update context

`useUpdateUser()`, `useUpdateCompany()` and `useUpdateOtherContext()` return functions that merge new attributes into the current context. Changing the provider's `context` prop also updates it. Flag values are refetched for the new context.

## Refresh when the app returns to the foreground

```tsx
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useClient } from "@reflag/react-native-sdk";

function AppStateListener() {
  const client = useClient();
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        void client.refresh();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [client]);
  return null;
}
```

Render this component inside `ReflagProvider`.

## Bootstrap from the server

If your backend already sends data to the app, you can include flags evaluated with the **Node.js SDK** so they're available immediately:

```ts
const flags = serverClient.getFlagsForBootstrap(context);
```

Pass the whole result to `ReflagBootstrappedProvider`:

```tsx
import { ReflagBootstrappedProvider } from "@reflag/react-native-sdk";

<ReflagBootstrappedProvider publishableKey="your-publishable-key" flags={flags}>
  <App />
</ReflagBootstrappedProvider>;
```

Leave secrets and server-only attributes out of the context you bootstrap, because the app can read it. Later refreshes evaluate flags using the app's context. If values that depend on server-only attributes must not change, set `enableLiveFlagUpdates={false}`.

## Let users opt in to flags

```tsx
const { flags, isLoading } = useOptInFlags();
const setOptIn = useSetOptIn();

await setOptIn("huddles", { optedIn: true });
await setOptIn("huddles", { optedIn: false, scope: "company" });
```

Each entry includes the flag's `key`, `name`, `description` and whether the user or company has opted in. User and company opt-ins are independent. Check `isLoading` before rendering an empty state.

## Overrides

The toolbar is web-only. To override a flag from code, call `useClient().setFlagOverride(key, value)`. Pass `undefined` to remove the override.

## Type safety

Declaring your flags gives you autocompletion for keys and type checks for defaults. Generate the declarations with the Reflag CLI, choosing the `react` format:

```sh
npm install --save-dev @reflag/cli
npx reflag init
npx reflag flags types
```

The React Native SDK uses the React SDK's types, so the declarations extend `@reflag/react-sdk`:

```ts
import "@reflag/react-native-sdk";

declare module "@reflag/react-sdk" {
  interface Flags {
    huddles: boolean;
    "huddle-settings": { maxParticipants: number };
  }
}
```

If TypeScript can't resolve `@reflag/react-sdk`, add it as a direct dependency at the same version the React Native SDK uses. Declarations are checked at compile time only. See the [Reflag CLI](https://docs.reflag.com/api/cli) for more options.

## Configuration

The provider accepts the same props as the React SDK's provider, such as `fallbackFlags`, `enableTracking`, `offline` and `logger`. In React Native, live updates are on by default and flags are cached in AsyncStorage. Use `enableLiveFlagUpdates`, `storage` and `eventSourceFactory` to change this.

To use a client you create yourself, pass it to `ReflagClientProvider`. Your app is then responsible for initializing and stopping it, and for configuring its storage and live updates.

## Examples

See the [Expo](https://github.com/reflagcom/javascript/tree/main/packages/react-native-sdk/dev/expo) and [bare React Native](https://github.com/reflagcom/javascript/tree/main/packages/react-native-sdk/dev/bare-rn) example apps.
