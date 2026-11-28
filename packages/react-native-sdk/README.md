# Reflag React Native SDK v2

React Native providers and hooks for Boolean and multivariate flags. Built on the matching React v2 SDK, with AsyncStorage persistence and a native SSE transport included.

The [React SDK README](../react-sdk/README.md) covers the shared API.

## Install and initialize

```sh
npm install @reflag/react-native-sdk
```

Requires React 17 or later (the modern JSX runtime) and a React version supported by your React Native app. Wrap your app with the React Native provider, which supplies the platform adapters:

```tsx
import { ReflagProvider } from "@reflag/react-native-sdk";

<ReflagProvider
  publishableKey="{YOUR_PUBLISHABLE_KEY}"
  context={{
    user: { id: "user_123", name: "John Doe" },
    company: { id: "company_123", plan: "pro" },
  }}
>
  <App />
</ReflagProvider>;
```

Use only publishable keys in the app, never server secret keys. React Native providers default live updates on, persistence to AsyncStorage, and SSE to `react-native-sse` with transport polling disabled. `storage`, `eventSourceFactory`, and `enableLiveFlagUpdates` remain configurable.

## Read flags and track usage

`useFlag(key)` returns a **Boolean**, with false while initializing or when missing. A positional JSON default requests a matching top-level value category:

```tsx
import { Button } from "react-native";
import { useFlag, useTrack } from "@reflag/react-native-sdk";

function StartHuddleButton() {
  const enabled = useFlag("huddle");
  const settings = useFlag("huddle-settings", { maxParticipants: 10 });
  const track = useTrack();
  if (!enabled) return null;
  return (
    <Button
      title={`Start huddle (up to ${settings.maxParticipants})`}
      onPress={() => void track("Started huddle")}
    />
  );
}
```

A default sets the return type, even without generated declarations. Accepted false, zero, empty strings and null are not replaced by truthy fallbacks. Explicit `null` requests arbitrary JSON; `undefined` retains the Boolean-first behavior. Returned JSON values are independent copies. Defaults check top-level categories, not nested runtime schemas.

Reading registers root checks immediately; application usage remains separate through `useTrack()`. `useClient().getFlags()` returns all flag values. `useIsLoading()` reports readiness separately.

## Suspense

Ordinary `useFlag` never suspends, even inside a provider with `suspense` enabled. Use `useFlagSuspense` to wait for initialization:

```tsx
import { Suspense } from "react";
import { ActivityIndicator } from "react-native";
import { useFlagSuspense } from "@reflag/react-native-sdk";

function Huddles() {
  const enabled = useFlagSuspense("huddle");
  return enabled ? <HuddleScreen /> : null;
}

<Suspense fallback={<ActivityIndicator />}>
  <Huddles />
</Suspense>;
```

A missing flag uses its default after initialization rather than suspending forever. Provider `suspense` and `useOptInFlags({ suspense: true })` control opt-in metadata loading, not ordinary flag reads. An object passed as `useFlag`'s second argument is a JSON default, not loading options.

## Bootstrap from Node v2

Produce the envelope on your server using Node SDK v2:

```ts
const flags = serverClient.getFlagsForBootstrap({
  user: { id: "user_123" },
  company: { id: "company_123" },
});
```

Pass the complete serialized envelope to the React Native provider:

```tsx
import { ReflagBootstrappedProvider } from "@reflag/react-native-sdk";

<ReflagBootstrappedProvider
  publishableKey="{YOUR_PUBLISHABLE_KEY}"
  flags={flags}
>
  <App />
</ReflagBootstrappedProvider>;
```

The envelope contains `protocolVersion: 2`, context, evaluated flags and an optional snapshot version. Legacy v1 bootstrap is rejected. Live updates require a snapshot version. Later refreshes use app-visible context and may differ from server evaluation. Disable live updates when later client evaluation must not replace the server result. Requesting missing opt-in metadata still makes a client-side request even with live updates disabled.

`ReflagClientProvider` accepts an externally initialized matching v2 client. Its lifecycle and platform-adapter configuration belong to your application; the React Native convenience providers do not configure an external client.

## Opt-in and feedback

`useOptInFlags()` returns metadata and loading state; `useSetOptIn()` changes membership. Metadata arrives with ordinary `/flags/evaluated` responses, or on demand after bootstrap without replacing server-derived values. User/company grants stay independent. Successful mutations confirm versioned evaluation and membership in one refresh. Check the returned `Response.ok` and catch rejections: confirmation can fail after membership changed remotely, and skipped calls return undefined. Failed metadata loading settles without exposing an error; use `useClient().refresh()` to retry.

The toolbar and built-in feedback UI are web-only and disabled by default. Use your own React Native feedback UI with `useSendFeedback()` or `client.feedback()`; enabling a web UI option does not make it React Native-compatible.

`enableTracking: false` disables checks and ordinary tracking. Offline mode skips HTTP/tracking; set fallback values such as `fallbackFlags={{ huddle: true, settings: { mode: "offline" } }}`.

## Optional key registration

The React Native SDK reexports React's hooks and **shares React's `Flags` registry**. Register flag types in `@reflag/react-sdk`, not a separate React Native registry:

```ts
import "@reflag/react-native-sdk";

declare module "@reflag/react-sdk" {
  interface Flags {
    huddle: boolean;
    "huddle-settings": { maxParticipants: number };
  }
}
```

Registered flags get autocompletion for their keys and type checks for the defaults you pass. The checks happen at compile time only. To generate the declarations, run `npx reflag flags types` with the `react` format.

## Refresh when returning to the foreground

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

Mount this listener under a React Native provider. Context prop changes and `useUpdateUser`/`useUpdateCompany`/`useUpdateOtherContext` also update evaluation context.

## Migrating from v1

- Replace `const { isEnabled, track } = useFlag(key)` with `const enabled = useFlag(key)` and a separate `useTrack()` call.
- Replace remote-config wrappers with authored multivariate flags and positional JSON defaults.
- Use `useFlagSuspense`, not `useFlag(key, { suspense: true })`, for readiness-waiting reads.
- In `fallbackFlags`, give each flag its value, such as `{ huddles: true, model: "quick" }`, instead of v1's `{ key, payload }` objects. A list of flag keys still works for Boolean flags.
- If you bootstrap from the server, upgrade the Node SDK that produces the bootstrap data at the same time as the app.
- Rebuild against matching React Native/React/Browser v2 packages and regenerate legacy declarations.

The [Expo](https://github.com/reflagcom/javascript/tree/main/packages/react-native-sdk/dev/expo) and [bare React Native](https://github.com/reflagcom/javascript/tree/main/packages/react-native-sdk/dev/bare-rn) examples use the v2 React Native APIs. OpenFeature providers are separate integrations and do not gain v2 support from this migration.
