---
"@reflag/browser-sdk": minor
"@reflag/node-sdk": minor
"@reflag/react-sdk": minor
"@reflag/react-native-sdk": minor
"@reflag/vue-sdk": minor
---

Add live flag updates to the client-facing SDKs.

The browser SDK now supports `enableLiveFlagUpdates`, which subscribes to Reflag's SSE endpoint and refreshes flags automatically when they change. The browser SDK keeps this disabled by default, while the React, React Native, and Vue SDKs enable it by default.

The Node SDK's `getFlagsForBootstrap()` output now includes `flagStateVersion` when the Node SDK has received a flag-state version from Reflag:

```ts
type BootstrappedState = {
  context: ReflagContext;
  flags: RawFlags;
  flagStateVersion?: number;
};
```

`flagStateVersion` lets bootstrapped clients avoid redundant refreshes immediately after hydration, ignore stale bootstrapped payloads, and request the newest flag state after a live update.

The browser SDK accepts this object through `bootstrappedState`. React, React Native, and Vue keep their existing `flags` prop on bootstrapped providers, and that prop now accepts the same full object:

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

This is backwards compatible for initial rendering: existing bootstrapped payloads shaped as `{ context, flags }` still initialize the SDK, and the React, React Native, and Vue provider prop name has not changed. Live flag updates after bootstrapping require `flagStateVersion`; if it is missing, the client will warn and disable live updates for that client.

Browser-facing SDKs now use `apiBaseUrl` for SSE by default, which points to `https://front.reflag.com` unless overridden. Live flag updates and feedback notifications now share `https://front.reflag.com`, so default CSP setups only need to allow `connect-src https://front.reflag.com` instead of `https://livemessaging.bucket.co`. `sseBaseUrl` remains available as an override if you need a separate SSE host.

The Node SDK now uses Reflag's server push SSE endpoint (`GET https://front.reflag.com/sse/server`) for live flag definition updates instead of `https://pubsub.reflag.com`. If you override `flagsPushUrl`, the SDK will open that URL with the same authenticated streaming GET behavior.
