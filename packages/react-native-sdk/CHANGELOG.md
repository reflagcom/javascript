# @reflag/react-native-sdk

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
