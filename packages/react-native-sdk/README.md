# Reflag React Native SDK

A thin React Native wrapper around `@reflag/react-sdk` that automatically
configures AsyncStorage for flag caching.

## Install

```shell
npm i @reflag/react-native-sdk @react-native-async-storage/async-storage
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

The wrapper uses AsyncStorage by default. You can still pass a custom `storage`
adapter if needed.
