# Reflag React Native SDK (beta)

A thin React Native wrapper around `@reflag/react-sdk`.

For more usage details, see the [React SDK README](../react-sdk/README.md).

An Expo example app lives in [packages/react-native-sdk/dev/expo](https://github.com/reflagcom/javascript/tree/main/packages/react-native-sdk/dev/expo).

## Get started

### Install

```shell
npm i @reflag/react-native-sdk
```

### 1. Add the ReflagProvider

Wrap your app with the provider from `@reflag/react-native-sdk`:

```tsx
import { ReflagProvider } from "@reflag/react-native-sdk";

<ReflagProvider
  publishableKey="{YOUR_PUBLISHABLE_KEY}"
  context={{
    user: { id: "user_123", name: "John Doe", email: "john@acmeinc.com" },
    company: { id: "company_123", name: "Acme, Inc", plan: "pro" },
  }}
>
  {/* children here are shown when loading finishes */}
</ReflagProvider>;
```

### 2. Use `useFlag(<flagKey>)`

```tsx
import { useFlag } from "@reflag/react-native-sdk";

function StartHuddleButton() {
  const { isEnabled, track } = useFlag("huddle");

  if (!isEnabled) return null;

  return <Button title="Start huddle" onPress={track} />;
}
```

See the [React SDK README](../react-sdk/README.md) for more details.

## React Native differences

- The Reflag toolbar is web-only and is not available in React Native.
- Built-in feedback UI is web-only. In React Native, use your own UI and call `useSendFeedback` or `client.feedback` when you're ready to send feedback.

## Reference

The React Native SDK shares its API with the React SDK. Use the React SDK reference for full types and details:

[React SDK Reference](../react-sdk/README.md)

## Cookbook

### Refresh flags when the app returns to the foreground

Flags are updated if the context passed to `<ReflagProvider>` changes, but you might also want to update them when the app comes to the foreground.
See this snippet:

```tsx
import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { ReflagProvider, useClient } from "@reflag/react-native-sdk";

function AppStateListener() {
  const client = useClient();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        void client.refresh();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [client]);

  return null;
}

export function App() {
  return (
    <ReflagProvider publishableKey="{YOUR_PUBLISHABLE_KEY}">
      <AppStateListener />
      <MyApp />
    </ReflagProvider>
  );
}
```

## Bootstrapping

You can use `<ReflagBootstrappedProvider>` in React Native when you already have pre-fetched flags and want to avoid an initial fetch.
For bootstrap usage patterns and options, see the [React SDK bootstrapping docs](../react-sdk/README.md#server-side-rendering-and-bootstrapping).
