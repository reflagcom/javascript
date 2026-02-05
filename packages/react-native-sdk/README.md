# Reflag React Native SDK

A thin React Native wrapper around `@reflag/react-sdk`.

For more usage details, see the React SDK README in `packages/react-sdk/README.md`.

An Expo example app lives at `packages/react-native-sdk/dev/expo`.

## Install

```shell
npm i @reflag/react-native-sdk
```

## Usage

```tsx
import { ReflagProvider, useFlag } from "@reflag/react-native-sdk";

<ReflagProvider
  publishableKey="{YOUR_PUBLISHABLE_KEY}"
  context={{
    user: { id: "user_123" },
    company: { id: "company_123" },
  }}
>
  <MyApp />
</ReflagProvider>;
```

## Cookbook

### Refresh flags when the app returns to the foreground

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
