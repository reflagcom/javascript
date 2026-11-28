# @reflag/openfeature-node-provider

## 1.2.9-next.0

### Patch Changes

- 521de2f: Adopt protocol-v2, adding support for multivariate and JSON flags.
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

## 1.2.8

### Patch Changes

- Updated dependencies [d7078e0]
  - @reflag/node-sdk@1.8.3

## 1.2.7

### Patch Changes

- Updated dependencies [9d213c0]
  - @reflag/node-sdk@1.8.2

## 1.2.6

### Patch Changes

- Updated dependencies [c69ee92]
- Updated dependencies [df37a58]
  - @reflag/node-sdk@1.8.1

## 1.2.5

### Patch Changes

- Updated dependencies [353d830]
  - @reflag/node-sdk@1.8.0

## 1.2.4

### Patch Changes

- Updated dependencies [80f2e8f]
  - @reflag/node-sdk@1.7.3

## 1.2.3

### Patch Changes

- Updated dependencies [385e3f5]
  - @reflag/node-sdk@1.7.2

## 1.2.2

### Patch Changes

- @reflag/node-sdk@1.7.1

## 1.2.1

### Patch Changes

- Updated dependencies [5debec5]
  - @reflag/node-sdk@1.7.0

## 1.2.0

### Minor Changes

- 76f4492: Updated to `@reflag/node-sdk` `1.6.0`, which defaults to `flagsSyncMode="push"`.

### Patch Changes

- Updated dependencies [27da48f]
- Updated dependencies [860024f]
- Updated dependencies [403226b]
- Updated dependencies [76f4492]
- Updated dependencies [7847875]
  - @reflag/node-sdk@1.6.0

## 1.1.1

### Patch Changes

- Updated dependencies [0f3450e]
  - @reflag/node-sdk@1.5.1

## 1.1.0

### Minor Changes

- 403f004: Add a new `flagsSyncMode` option to the Node SDK with three sync strategies: `polling`, `in-request`, and `push`.

  `polling` keeps the existing periodic background refresh behavior, `in-request` refreshes stale flag definitions during request handling, and `push` subscribes to live flag updates over SSE. The new `push` mode lets applications receive flag definition updates immediately as they happen without relying on periodic polling.

### Patch Changes

- 51b4b9c: flush log is now debug instead of info
- Updated dependencies [403f004]
- Updated dependencies [51b4b9c]
  - @reflag/node-sdk@1.5.0

## 1.0.5

### Patch Changes

- Updated dependencies [7f89a47]
  - @reflag/node-sdk@1.4.2

## 1.0.4

### Patch Changes

- Updated dependencies [32d0ecf]
  - @reflag/node-sdk@1.4.1

## 1.0.3

### Patch Changes

- Updated dependencies [dca2bd7]
  - @reflag/node-sdk@1.4.0

## 1.0.2

### Patch Changes

- Updated dependencies [e9920bc]
  - @reflag/node-sdk@1.3.0
