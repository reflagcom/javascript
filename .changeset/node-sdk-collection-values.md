---
"@reflag/node-sdk": major
"@reflag/openfeature-node-provider": patch
---

Adopt protocol-v2, adding support for multivariate and JSON flags.

- `getFlag(context, key)` and bound `getFlag(key)` return direct values instead of flag wrappers. Reads without a default return Booleans, using `false` when unavailable. Replace `.isEnabled` and `.config` access with direct values.
- Pass a positional default to read strings, numbers, arrays, or objects. TypeScript infers the return type from the default without generated declarations. Missing values or values of a different top-level type use the default. Pass `null` to accept any JSON value, including null. Nested payload schemas are not validated at runtime.
- With optional `Flags` registration, TypeScript checks non-null defaults against each flag's value type for local, remote, and bound reads. Named-interface and readonly defaults are supported.
- Flag reads automatically record checks. Replace flag-level `.track()` calls with the client's separate `track()` API.
- `getFlags()` and `getFlagsRemote()` return records of direct values; unavailable flags may be `undefined`.
- `getFlagRemote(key, defaultValue, userId?, companyId?, context?)` now takes the default second, shifting existing user/company arguments one position to the right. Pass `undefined` for a Boolean read with explicit IDs. Bound clients use `getFlagRemote(key, defaultValue?)`.
- `getFlagDefinitions()` returns `{ flags, segments }` instead of an array.
- Saved fallback snapshots use a new format; v1 snapshots are not migrated automatically. Regenerate saved snapshots when upgrading. Built-in storage keeps v1 and v2 snapshots separate.
- `getFlagsForBootstrap()` produces protocol-v2 state. Upgrade Browser/framework consumers to compatible v2 SDKs before using this state; v1 bootstrap consumers are incompatible.
- Existing synchronization modes, bound contexts, and local overrides remain supported. Overrides and static fallbacks accept direct JSON values.

The OpenFeature Node provider continues to use Node SDK v1. Legacy remote configuration is not automatically converted into multivariate flag values.
