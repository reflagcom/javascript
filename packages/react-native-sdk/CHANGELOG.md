# @reflag/react-native-sdk

## 0.3.2

### Patch Changes

- Updated dependencies [127ac7f]
  - @reflag/react-sdk@1.6.2

## 0.3.1

### Patch Changes

- Updated dependencies [879f8d9]
  - @reflag/react-sdk@1.6.1

## 0.3.0

### Minor Changes

- f31f5e4: Add end-user opt-in helpers for listing opt-in-enabled flags and setting whether the current user or company has opted into a flag. Bootstrapped clients refresh missing browser opt-in metadata on demand when opt-in flags are requested.

### Patch Changes

- 31fd960: Add Suspense support for `useFlag` while flags are loading via provider-level and per-hook `suspense` options.
- Updated dependencies [7f51b4a]
- Updated dependencies [6da4faf]
  - @reflag/react-sdk@1.6.0

## 0.2.5

### Patch Changes

- Updated dependencies [a95972c]
  - @reflag/react-sdk@1.5.5

## 0.2.4

### Patch Changes

- 0d27577: Pass `credentials: "include"` through to EventSource connections so live updates and feedback SSE can include cookies when proxying through an authenticated backend.
- Updated dependencies [0d27577]
  - @reflag/react-sdk@1.5.4

## 0.2.3

### Patch Changes

- Updated dependencies [04ea32c]
  - @reflag/react-sdk@1.5.3

## 0.2.2

### Patch Changes

- Updated dependencies [7939e31]
  - @reflag/react-sdk@1.5.2

## 0.2.1

### Patch Changes

- Updated dependencies [6e4aa8f]
  - @reflag/react-sdk@1.5.1

## 0.2.0

### Minor Changes

- 5debec5: The React Native SDK now includes an `enableLiveFlagUpdates` config option, which defaults to `true`. When enabled, the SDK subscribes to live flag changes from the Reflag servers.

  `ReflagBootstrappedProvider` keeps its existing `flags` prop, and that prop now accepts the full object returned by `@reflag/node-sdk`'s `getFlagsForBootstrap()`: `{ context, flags, flagStateVersion? }`.

  This is backwards compatible for initial rendering: existing bootstrapped payloads shaped as `{ context, flags }` still initialize the SDK. Live flag updates after bootstrapping require `flagStateVersion`; if it is missing, the client warns and disables live updates for that bootstrapped client.

### Patch Changes

- Updated dependencies [5debec5]
  - @reflag/react-sdk@1.5.0

## 0.1.5

### Patch Changes

- Updated dependencies [8bc9130]
  - @reflag/react-sdk@1.4.8
