# @reflag/react-native-sdk

## 2.0.0

### Major Changes

- 1716cae: Adopt protocol-v2, adding support for multivariate and JSON flags in React Native.
  - `useFlag()` returns direct values instead of flag wrappers. Reads without a default return Booleans, using `false` when unavailable. Replace `.isEnabled` and `.config` access with direct values.
  - Pass a positional default to read strings, numbers, arrays, or objects, with TypeScript inferring the return type. Missing values or values of a different top-level type use the default. Pass `null` to accept any JSON value, including null. Nested payload schemas are not validated at runtime.
  - `useFlag()` never suspends. Replace `useFlag(key, { suspense: true })` with `useFlagSuspense(key)` to wait for initialization, and use `useIsLoading()` for loading state.
  - Flag reads automatically record checks. Replace flag-level tracking and feedback methods with `useTrack()` and `useSendFeedback()`, using your own Native feedback UI.
  - Optional flag typing uses React's `Flags` registration in `@reflag/react-sdk`. Non-null defaults are checked against each registered flag's value type, and named-interface and readonly defaults are supported. Regenerate legacy wrapper-shaped declarations before upgrading.
  - Bootstrap data must come from Node SDK v2. Pass the complete payload to `ReflagBootstrappedProvider`; legacy v1 payloads are incompatible.
  - AsyncStorage persistence, native live updates and custom storage/SSE adapters remain supported. Live updates are enabled by default; the web toolbar and automatic feedback UI are disabled by default.
  - Offline fallbacks accept direct JSON value maps. Arrays of enabled Boolean flag keys remain supported.
  - Requires React 17 or later, compatible with your React Native runtime, and matching v2 React/Browser SDKs.

  Legacy wrapper and remote-config types are removed. Legacy remote configuration is not automatically converted into multivariate flag values.

### Patch Changes

- 9654308: Replace workspace-only dependency ranges with registry-compatible versions so the published SDKs can be installed outside the monorepo. Keep local workspace linking and the existing v1 OpenFeature dependencies unchanged.
- Updated dependencies [1716cae]
- Updated dependencies [9654308]
  - @reflag/react-sdk@2.0.0

## 2.0.0-next.2

### Patch Changes

- 9654308: Replace workspace-only dependency ranges with registry-compatible versions so the published SDKs can be installed outside the monorepo. Keep local workspace linking and the existing v1 OpenFeature dependencies unchanged.
- Updated dependencies [9654308]
  - @reflag/react-sdk@2.0.0-next.2

## 2.0.0-next.1

### Major Changes

- 1716cae: Adopt protocol-v2, adding support for multivariate and JSON flags in React Native.
  - `useFlag()` returns direct values instead of flag wrappers. Reads without a default return Booleans, using `false` when unavailable. Replace `.isEnabled` and `.config` access with direct values.
  - Pass a positional default to read strings, numbers, arrays, or objects, with TypeScript inferring the return type. Missing values or values of a different top-level type use the default. Pass `null` to accept any JSON value, including null. Nested payload schemas are not validated at runtime.
  - `useFlag()` never suspends. Replace `useFlag(key, { suspense: true })` with `useFlagSuspense(key)` to wait for initialization, and use `useIsLoading()` for loading state.
  - Flag reads automatically record checks. Replace flag-level tracking and feedback methods with `useTrack()` and `useSendFeedback()`, using your own Native feedback UI.
  - Optional flag typing uses React's `Flags` registration in `@reflag/react-sdk`. Non-null defaults are checked against each registered flag's value type, and named-interface and readonly defaults are supported. Regenerate legacy wrapper-shaped declarations before upgrading.
  - Bootstrap data must come from Node SDK v2. Pass the complete payload to `ReflagBootstrappedProvider`; legacy v1 payloads are incompatible.
  - AsyncStorage persistence, native live updates and custom storage/SSE adapters remain supported. Live updates are enabled by default; the web toolbar and automatic feedback UI are disabled by default.
  - Offline fallbacks accept direct JSON value maps. Arrays of enabled Boolean flag keys remain supported.
  - Requires React 17 or later, compatible with your React Native runtime, and matching v2 React/Browser SDKs.

  Legacy wrapper and remote-config types are removed. Legacy remote configuration is not automatically converted into multivariate flag values.

### Patch Changes

- Updated dependencies [1716cae]
  - @reflag/react-sdk@2.0.0-next.1

## 0.3.7

### Patch Changes

- @reflag/react-sdk@1.7.4

## 0.3.6

### Patch Changes

- @reflag/react-sdk@1.7.3

## 0.3.5

### Patch Changes

- @reflag/react-sdk@1.7.2

## 0.3.4

### Patch Changes

- Updated dependencies [df37a58]
  - @reflag/react-sdk@1.7.1

## 0.3.3

### Patch Changes

- Updated dependencies [353d830]
  - @reflag/react-sdk@1.7.0

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
