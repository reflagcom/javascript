---
"@reflag/browser-sdk": minor
"@reflag/node-sdk": minor
"@reflag/react-sdk": minor
"@reflag/react-native-sdk": minor
"@reflag/vue-sdk": minor
---

Add live flag updates and full bootstrapped state support to the browser-facing SDKs.

The browser SDK now supports `enableLiveFlagUpdates`, which subscribes to Reflag's SSE endpoint and refreshes flags automatically after live update notifications. The browser SDK keeps this disabled by default, while the React, React Native, and Vue SDKs enable it by default.

React Native now includes a built-in SSE transport via `react-native-sse`, so live updates work out of the box without requiring a global `EventSource` shim.

The browser SDK also now accepts `bootstrappedState`, which contains `context`, evaluated `flags`, and an optional `flagStateVersion`. The Node SDK's `getFlagsForBootstrap()` now includes `flagStateVersion` when it is known, so React, React Native, and Vue bootstrapped providers can pass the full object directly instead of deconstructing it first:

```ts
const bootstrappedState = serverClient.getFlagsForBootstrap(context);

const client = new ReflagClient({
  publishableKey,
  bootstrappedState,
});
```

`flagStateVersion` is now preserved and used to avoid redundant refreshes immediately after bootstrapping, ignore stale bootstrapped payloads, and request the newest flag state after a live update. Bootstrapped live updates require a recent `@reflag/node-sdk` so `getFlagsForBootstrap()` includes `flagStateVersion`; otherwise the SDK will warn and disable live flag updates for that client.

Browser-facing SDKs now default SSE requests to `apiBaseUrl` and subscribe through `https://front.reflag.com/sse/client?publishableKey=...`. SSE requests include the publishable key and SDK version. `sseBaseUrl` remains available as a temporary compatibility override if you still need a separate pubsub host.

The Node SDK now uses Reflag's server push SSE endpoint (`GET https://pubsub.reflag.com/sse/server`) for live flag definition updates. If you override `flagsPushUrl`, the SDK will open that URL with the same authenticated streaming GET behavior.
