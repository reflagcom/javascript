---
"@reflag/react-native-sdk": minor
---

The React Native SDK now includes an `enableLiveFlagUpdates` config option, which defaults to `true`. When enabled, live flag updates work out of the box using the built-in `react-native-sse` transport.

`ReflagBootstrappedProvider` keeps its existing `flags` prop, and that prop now accepts the full object returned by `@reflag/node-sdk`'s `getFlagsForBootstrap()`: `{ context, flags, flagStateVersion? }`.

This is backwards compatible for initial rendering: existing bootstrapped payloads shaped as `{ context, flags }` still initialize the SDK. Live flag updates after bootstrapping require `flagStateVersion`; if it is missing, the client warns and disables live updates for that bootstrapped client.
