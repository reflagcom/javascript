# @reflag/vue-sdk

## 2.0.0-next.2

### Patch Changes

- 9654308: Replace workspace-only dependency ranges with registry-compatible versions so the published SDKs can be installed outside the monorepo. Keep local workspace linking and the existing v1 OpenFeature dependencies unchanged.

## 2.0.0-next.1

### Major Changes

- 1716cae: Adopt protocol-v2, adding support for multivariate and JSON flags in Browser, React and Vue.
  - Browser `getFlag()` and React `useFlag()` return direct values instead of flag wrappers. Vue `useFlag()` returns a ref to the direct value. Replace `.isEnabled` and `.config` access with direct values, using `.value` for Vue refs in script.
  - Reads without a default return Booleans, using `false` when unavailable. Pass a positional default to read strings, numbers, arrays, or objects, with TypeScript inferring the return type. Missing values or values of a different top-level type use the default. Pass `null` to accept any JSON value, including null. Nested payload schemas are not validated at runtime.
  - React and Vue's optional `Flags` registration checks non-null defaults against each flag's value type, including React Suspense reads. Named-interface and readonly defaults are supported across Browser, React and Vue without losing their inferred value types.
  - React `useFlag()` never suspends. Replace `useFlag(key, { suspense: true })` with `useFlagSuspense(key)` to wait for initialization. Use `useIsLoading()` for loading state; existing provider and `useOptInFlags` Suspense options continue to control opt-in loading only.
  - Flag reads automatically record checks. Replace flag-level `.track()` and `.requestFeedback()` calls with the client's separate methods or the framework's tracking and feedback hooks/composables.
  - Browser `getFlags()` returns a record of direct values; unavailable flags may be `undefined`. Use `getFlagResults()` for diagnostic access without recording checks.
  - Bootstrap data must come from Node SDK v2 and be consumed by matching v2 SDKs. Legacy v1 payloads are incompatible. Replace the Browser client's `bootstrappedFlags` option with `bootstrappedState` and pass the complete bootstrap payload.
  - Overrides accept direct JSON values: `undefined` clears an override, while `null` is a value. Saved v1 caches and overrides are not reused.
  - Bootstrapped clients load opt-in metadata when requested, without replacing server-provided flag values. Successful opt-in changes update both membership and flag values.

  The OpenFeature Browser provider continues to use Browser SDK v1. Legacy remote configuration is not automatically converted into multivariate flag values.

### Patch Changes

- Updated dependencies [1716cae]
  - @reflag/browser-sdk@2.0.0-next.1

## 1.5.7

### Patch Changes

- Updated dependencies [0840683]
  - @reflag/browser-sdk@1.7.4

## 1.5.6

### Patch Changes

- Updated dependencies [e8a0e10]
  - @reflag/browser-sdk@1.7.3

## 1.5.5

### Patch Changes

- Updated dependencies [4649418]
  - @reflag/browser-sdk@1.7.2

## 1.5.4

### Patch Changes

- df37a58: Include non-fatal flag evaluation diagnostics in check events sent by the Node, browser, React, and Vue SDKs, including when flags are evaluated before client initialization.
- Updated dependencies [df37a58]
  - @reflag/browser-sdk@1.7.1

## 1.5.3

### Patch Changes

- Updated dependencies [353d830]
  - @reflag/browser-sdk@1.7.0

## 1.5.2

### Patch Changes

- 869fe86: Avoid calling an uninitialized event cleanup function when a suspended component unmounts before mounting.

## 1.5.1

### Patch Changes

- 879f8d9: Fix React and Vue opt-in flag keys to respect generated flag types, and return reliable loading state from `useOptInFlags()` while bootstrapped clients fetch opt-in metadata. React's hook also supports Suspense.
- Updated dependencies [879f8d9]
  - @reflag/browser-sdk@1.6.1

## 1.5.0

### Minor Changes

- 7f51b4a: Add end-user opt-in helpers for listing opt-in-enabled flags and setting whether the current user or company has opted into a flag. Bootstrapped clients refresh missing browser opt-in metadata on demand when opt-in flags are requested.

### Patch Changes

- Updated dependencies [7f51b4a]
  - @reflag/browser-sdk@1.6.0

## 1.4.4

### Patch Changes

- 0d27577: Pass `credentials: "include"` through to EventSource connections so live updates and feedback SSE can include cookies when proxying through an authenticated backend.
- Updated dependencies [0d27577]
  - @reflag/browser-sdk@1.5.4

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
