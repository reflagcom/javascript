# @reflag/react-sdk

## 1.6.2

### Patch Changes

- 127ac7f: Prevent `useOptInFlags()` from missing a flag update that finishes between render and event subscription.

## 1.6.1

### Patch Changes

- 879f8d9: Fix React and Vue opt-in flag keys to respect generated flag types, and return reliable loading state from `useOptInFlags()` while bootstrapped clients fetch opt-in metadata. React's hook also supports Suspense.
- Updated dependencies [879f8d9]
  - @reflag/browser-sdk@1.6.1

## 1.6.0

### Minor Changes

- 7f51b4a: Add end-user opt-in helpers for listing opt-in-enabled flags and setting whether the current user or company has opted into a flag. Bootstrapped clients refresh missing browser opt-in metadata on demand when opt-in flags are requested.
- 6da4faf: Add Suspense support for `useFlag` while flags are loading via provider-level and per-hook `suspense` options.

### Patch Changes

- Updated dependencies [7f51b4a]
  - @reflag/browser-sdk@1.6.0

## 1.5.5

### Patch Changes

- a95972c: Avoid loading state during bootstrapped initialization

## 1.5.4

### Patch Changes

- 0d27577: Pass `credentials: "include"` through to EventSource connections so live updates and feedback SSE can include cookies when proxying through an authenticated backend.
- Updated dependencies [0d27577]
  - @reflag/browser-sdk@1.5.4

## 1.5.3

### Patch Changes

- 04ea32c: Prevent provider re-renders with unchanged context props from resetting user or company attributes applied via `useUpdateUser` and `useUpdateCompany`.
- Updated dependencies [04ea32c]
  - @reflag/browser-sdk@1.5.3

## 1.5.2

### Patch Changes

- 7939e31: Handle SecurityError when browser storage access is denied.
- Updated dependencies [7939e31]
  - @reflag/browser-sdk@1.5.2

## 1.5.1

### Patch Changes

- 6e4aa8f: Fix auto feedback by attach the current browser SDK context to the `/sse/client` connection.
- Updated dependencies [6e4aa8f]
  - @reflag/browser-sdk@1.5.1

## 1.5.0

### Minor Changes

- 5debec5: The React SDK now includes an `enableLiveFlagUpdates` config option, which defaults to `true`. When enabled, the SDK subscribes to live flag changes from the Reflag servers.

  `ReflagBootstrappedProvider` keeps its existing `flags` prop, and that prop now accepts the full object returned by `@reflag/node-sdk`'s `getFlagsForBootstrap()`: `{ context, flags, flagStateVersion? }`.

  This is backwards compatible for initial rendering: existing bootstrapped payloads shaped as `{ context, flags }` still initialize the SDK. Live flag updates after bootstrapping require `flagStateVersion`; if it is missing, the client warns and disables live updates for that bootstrapped client.

  Live flag updates and feedback notifications now use `https://front.reflag.com` by default, so default CSP setups only need to allow `connect-src https://front.reflag.com` instead of `https://livemessaging.bucket.co`.

### Patch Changes

- Updated dependencies [5debec5]
  - @reflag/browser-sdk@1.5.0

## 1.4.8

### Patch Changes

- 8bc9130: Relaxed types for bootstrapping
