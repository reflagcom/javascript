---
"@reflag/browser-sdk": minor
"@reflag/react-sdk": minor
"@reflag/react-native-sdk": minor
"@reflag/vue-sdk": minor
---

Add support for passing the full bootstrapped flag state package through the browser-facing SDKs.

The browser SDK now accepts `bootstrappedState`, which contains `context`, evaluated `flags`, and an optional `flagStateVersion`. React, React Native, and Vue bootstrapped providers can pass the full object returned by the Node SDK's `getFlagsForBootstrap()` directly, instead of deconstructing it first.

If you previously initialized the browser SDK with `bootstrappedFlags` plus separate `user`/`company`/`other` values, migrate to the new pattern:

```ts
const bootstrappedState = serverClient.getFlagsForBootstrap(context);

const client = new ReflagClient({
  publishableKey,
  bootstrappedState,
});
```

The bootstrapped payload may now include `flagStateVersion`, which is used to avoid redundant live-update refreshes immediately after bootstrapping.

If you explicitly override `sseBaseUrl`, update any old `https://livemessaging.bucket.co` overrides to `https://pubsub.reflag.com` (or remove the override to use the default).
