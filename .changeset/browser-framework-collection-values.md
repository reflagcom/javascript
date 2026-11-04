---
"@reflag/browser-sdk": major
"@reflag/react-sdk": major
"@reflag/vue-sdk": major
---

Adopt protocol-v2 evaluated flags and direct JSON values across Browser, React and Vue.

Bare singular reads return Boolean with an implicit false default. Positional JSON defaults infer widened direct-value types without generated declarations, enforce top-level categories, preserve accepted falsy values, and return independent copies. Null explicitly accepts arbitrary JSON; nested schema validation remains the application's responsibility.

Browser `getFlag()` and `getFlags()` register root checks immediately with genuine selected-key/source/snapshot identity. Delivery stays buffered and identity-aware rate-limited. Diagnostic access and bootstrap serialization do not register checks; defaults, mismatches, overrides and static fallback values do not invent selections. V2 cache/override storage is isolated from v1, and complete evaluated snapshots are validated before acceptance. This requires compatible `/flags/evaluated` and canonical-check ingestion on the server.

React `useFlag()` returns a direct value without suspending. Use the separate `useFlagSuspense()` hook to wait for initialization; missing flags then use the default. Vue `useFlag()` returns a ref to the direct value. Loading, application usage tracking and feedback remain separate hooks/composables. The existing opt-in Suspense controls remain specific to `useOptInFlags`.

Upgrade bootstrap producers/consumers together: only protocol-v2 envelopes from Node SDK v2 are supported; legacy bootstrap wrappers and the Browser `bootstrappedFlags` option are rejected. Move wrapper `.track()`/`.requestFeedback()` calls to ordinary client/framework methods. Undefined clears a value override; null is a JSON override.

Opt-in metadata arrives with ordinary v2 evaluated responses. Bootstrapped clients fetch missing metadata on demand from the same v2 endpoint without replacing server-derived values. Mutations confirm versioned evaluation and membership in one refresh. The unchanged OpenFeature Browser provider and React Native wrapper remain pinned to published v1 SDK dependencies. CLI direct-value generation remains a separate migration.
