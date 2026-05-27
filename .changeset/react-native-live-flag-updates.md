---
"@reflag/react-native-sdk": minor
---

Live flag updates are now enabled by default and work out of the box using the built-in `react-native-sse` transport. Apps no longer need to provide a global `EventSource` shim for Reflag live updates.

`ReflagBootstrappedProvider` keeps its existing `flags` prop, and that prop now accepts the full object returned by `@reflag/node-sdk`'s `getFlagsForBootstrap()`: `{ context, flags, flagStateVersion? }`.

This is backwards compatible for initial rendering: existing bootstrapped payloads shaped as `{ context, flags }` still initialize the SDK. Live flag updates after bootstrapping require `flagStateVersion`; if it is missing, the client warns and disables live updates for that bootstrapped client.
