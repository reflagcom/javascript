---
"@reflag/react-native-sdk": major
---

Adopt protocol-v2, adding support for multivariate and JSON flags in React Native.

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
