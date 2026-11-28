---
"@reflag/browser-sdk": major
"@reflag/react-sdk": major
"@reflag/vue-sdk": major
---

Adopt protocol-v2, adding support for multivariate and JSON flags in Browser, React and Vue.

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
