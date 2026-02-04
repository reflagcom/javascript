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
