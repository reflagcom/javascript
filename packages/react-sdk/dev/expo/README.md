# Reflag React SDK Expo Example

This Expo app demonstrates using `@reflag/react-sdk` inside a React Native project.

## Quick start

1. Set your publishable key:

```shell
export EXPO_PUBLIC_REFLAG_PUBLISHABLE_KEY="your_publishable_key"
```

2. Install dependencies from the repo root:

```shell
yarn install
```

3. Start the Expo app:

```shell
cd packages/react-sdk/dev/expo
yarn start
```

If you see "Unable to resolve @reflag/react-sdk", run:

```shell
yarn build:deps
```

## Notes

- The Reflag toolbar and built-in feedback UI are web-only. In React Native, use your own UI and call `useSendFeedback` or `client.feedback`.
- If you don't set `EXPO_PUBLIC_REFLAG_PUBLISHABLE_KEY`, the app runs in offline mode with a fallback flag named `expo-demo`.
- This example uses `@react-native-async-storage/async-storage` automatically (if installed) to persist flag cache and overrides across app launches.
- This example targets Expo SDK 54. Run `npx expo install --fix` if you need to realign versions.
