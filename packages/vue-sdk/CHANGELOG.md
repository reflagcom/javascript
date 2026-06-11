# @reflag/vue-sdk

## 1.4.3

### Patch Changes

- Updated dependencies [04ea32c]
  - @reflag/browser-sdk@1.5.3

## 1.4.2

### Patch Changes

- 7939e31: Handle SecurityError when browser storage access is denied.
- Updated dependencies [7939e31]
  - @reflag/browser-sdk@1.5.2

## 1.4.1

### Patch Changes

- 6e4aa8f: Fix auto feedback by attach the current browser SDK context to the `/sse/client` connection.
- Updated dependencies [6e4aa8f]
  - @reflag/browser-sdk@1.5.1

## 1.4.0

### Minor Changes

- 5debec5: The Vue SDK now includes an `enableLiveFlagUpdates` config option, which defaults to `true`. When enabled, the SDK subscribes to live flag changes from the Reflag servers.

  `ReflagBootstrappedProvider` keeps its existing `flags` prop, and that prop now accepts the full object returned by `@reflag/node-sdk`'s `getFlagsForBootstrap()`: `{ context, flags, flagStateVersion? }`.

  This is backwards compatible for initial rendering: existing bootstrapped payloads shaped as `{ context, flags }` still initialize the SDK. Live flag updates after bootstrapping require `flagStateVersion`; if it is missing, the client warns and disables live updates for that bootstrapped client.

  Live flag updates and feedback notifications now use `https://front.reflag.com` by default, so default CSP setups only need to allow `connect-src https://front.reflag.com` instead of `https://livemessaging.bucket.co`.

### Patch Changes

- Updated dependencies [5debec5]
  - @reflag/browser-sdk@1.5.0
