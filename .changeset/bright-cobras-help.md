---
"@reflag/browser-sdk": minor
"@reflag/node-sdk": minor
"@reflag/react-sdk": minor
"@reflag/react-native-sdk": minor
"@reflag/vue-sdk": minor
---

Add live flag updates and full bootstrapped state support to the client-facing SDKs.

The browser SDK now supports `enableLiveFlagUpdates`, which subscribes to Reflag's SSE endpoint and refreshes flags automatically after live update notifications. The browser SDK keeps this disabled by default, while the React, React Native, and Vue SDKs enable it by default.

React Native now includes a built-in SSE transport via `react-native-sse`, so live updates work out of the box without requiring a global `EventSource` shim.

The browser SDK now accepts `bootstrappedState`. The React, React Native, and Vue bootstrapped providers keep their existing `flags` prop, and that prop now accepts the same full bootstrapped state object. The object contains `context`, evaluated `flags`, and an optional `flagStateVersion`. Existing bootstrapped payloads shaped as `{ context, flags }` continue to initialize the SDK; the provider prop name has not changed.

The recommended bootstrapping approach is now to pass the full object returned by the Node SDK's `getFlagsForBootstrap()` instead of deconstructing it first:

```tsx
const bootstrappedState = serverClient.getFlagsForBootstrap(context);

const client = new ReflagClient({
  publishableKey,
  bootstrappedState,
});

<ReflagBootstrappedProvider
  publishableKey={publishableKey}
  flags={bootstrappedState}
>
  {children}
</ReflagBootstrappedProvider>;
```

`flagStateVersion` is now preserved and used to avoid redundant refreshes immediately after bootstrapping, ignore stale bootstrapped payloads, and request the newest flag state after a live update. Bootstrapped live updates require a recent `@reflag/node-sdk` so `getFlagsForBootstrap()` includes `flagStateVersion`; otherwise the SDK will warn and disable live flag updates for that client. Existing unversioned bootstraps still work for initial rendering; set `enableLiveFlagUpdates={false}` if you intentionally use unversioned bootstrap data and want to avoid that warning.

Browser-facing SDKs now default SSE requests to `apiBaseUrl` and subscribe through `https://front.reflag.com/sse/client?publishableKey=...`. SSE requests include the publishable key and SDK version. `sseBaseUrl` remains available as a temporary compatibility override if you need a separate SSE host.

The Node SDK now uses Reflag's server push SSE endpoint (`GET https://front.reflag.com/sse/server`) for live flag definition updates. If you override `flagsPushUrl`, the SDK will open that URL with the same authenticated streaming GET behavior.
