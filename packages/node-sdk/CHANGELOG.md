# @reflag/node-sdk

## 1.8.1

### Patch Changes

- c69ee92: Stop installing process signal handlers and forcing process termination after flushing. This prevents the SDK from interrupting application-managed graceful shutdown, including handlers registered after SDK initialization.

  `batchOptions.flushOnExit` now only flushes automatically on natural event-loop shutdown (`beforeExit`). Applications must await `client.flush()` in their own shutdown hooks to flush before signal-driven termination or an explicit `process.exit()`.

- df37a58: Include non-fatal flag evaluation diagnostics in check events sent by the Node, browser, React, and Vue SDKs, including when flags are evaluated before client initialization.

## 1.8.0

### Minor Changes

- 353d830: Send remote evaluation and browser live-update context as canonical `contextJson`, preserving array-valued context attributes. Browser and React SDK context types now accept JSON-compatible array and object values.

## 1.7.3

### Patch Changes

- 80f2e8f: Fix `CONTAINS` and `NOT_CONTAINS` for array-valued context. `CONTAINS` now checks for an exact, case-sensitive array element; `NOT_CONTAINS` checks its absence. Both use the first comparison value, while `ANY_OF` and `NOT_ANY_OF` continue to support multiple comparison values. Empty arrays do not contain any value.

  Support `IS` for arrays containing exactly one element equal to the comparison value; `IS_NOT` matches all other present arrays, including empty arrays and arrays with duplicate matching elements. Missing fields still fail closed. Scalar equality is unchanged.

  Scalar strings retain case-insensitive substring matching. Supported array equality and membership checks no longer produce `UNSUPPORTED_ARRAY_OPERATOR` warnings in Node SDK flag targeting or config evaluation.

- Updated dependencies [80f2e8f]
  - @reflag/flag-evaluation@1.1.1

## 1.7.2

### Patch Changes

- 385e3f5: Add type-preserving native-array context evaluation with `ANY_OF`, `NOT_ANY_OF`, `SET`, and `NOT_SET` semantics. Unsupported array operators evaluate to false and produce non-fatal diagnostics that the Node SDK surfaces as rate-limited warnings.
- Updated dependencies [385e3f5]
  - @reflag/flag-evaluation@1.1.0

## 1.7.1

### Patch Changes

- Updated dependencies [338e9d2]
  - @reflag/flag-evaluation@1.0.1

## 1.7.0

### Minor Changes

- 5debec5: `getFlagsForBootstrap()` now includes `flagStateVersion` when the Node SDK has received a flag-state version from Reflag:

  ```ts
  type BootstrappedFlags = {
    context: Context;
    flags: RawFlags;
    flagStateVersion?: number;
  };
  ```

  Client SDKs use `flagStateVersion` to keep live flag updates working after bootstrapping. It lets bootstrapped clients avoid redundant refreshes immediately after hydration, ignore stale bootstrapped payloads, and request the newest flag state after a live update.

  The Node SDK now uses Reflag's server push SSE endpoint (`GET https://front.reflag.com/sse/server`) for live flag definition updates instead of `https://pubsub.reflag.com`. If you override `flagsPushUrl`, the SDK opens that URL with the same authenticated streaming GET behavior.

## 1.6.0

### Minor Changes

- 76f4492: Change the default `flagsSyncMode` from `"polling"` to `"push"`.

  New `ReflagClient` instances now subscribe to live SSE flag updates by default unless `flagsSyncMode` is set explicitly. The deprecated `cacheStrategy` option still maps `"periodically-update"` to `"polling"` and `"in-request"` to `"in-request"`.

### Patch Changes

- 27da48f: Fix `BoundReflagClient.bindClient()` so omitted `user`, `company`, and `other` fields preserve the previously bound context instead of being cleared.
- 860024f: Fix `REFLAG_CONFIG_FILE` handling so the SDK loads the config file from the path provided by the environment variable.
- 403226b: Mark `emitEvaluationEvents` as deprecated and note that it no longer has any effect and will be removed in the next major version.
- 7847875: Fix `fallbackProviders.static()` so it returns a valid fallback snapshot that `ReflagClient` accepts during fallback initialization.

## 1.5.1

### Patch Changes

- 0f3450e: Replace the built-in GCS fallback provider's default client dependency with `@googleapis/storage`, removing the deprecated `@google-cloud/storage` dependency and its vulnerable transitive request stack.

## 1.5.0

### Minor Changes

- 403f004: Add a new `flagsSyncMode` option to the Node SDK with three sync strategies: `polling`, `in-request`, and `push`.

  `polling` keeps the existing periodic background refresh behavior, `in-request` refreshes stale flag definitions during request handling, and `push` subscribes to live flag updates over SSE. The new `push` mode lets applications receive flag definition updates immediately as they happen without relying on periodic polling.

### Patch Changes

- 51b4b9c: flush log is now debug instead of info

## 1.4.2

### Patch Changes

- 7f89a47: fix: correctly associate users with companies

## 1.4.1

### Patch Changes

- 32d0ecf: docs: improve override docs

## 1.4.0

### Minor Changes

- dca2bd7: Introduce flag fallback providers

  Add support for `flagsFallbackProvider`, a reliability feature that lets the Node SDK persist the latest successfully fetched flag definitions to fallback storage such as a local file, S3, Redis, or a custom backend.

  Reflag servers remain the primary source of truth. On startup, the SDK still tries to fetch a live snapshot first. If that initial fetch fails, it can load the last saved snapshot from the fallback provider so new processes can still initialize in the exceedingly rare case that Reflag has an outage.

  After successfully fetching updated flag definitions, the SDK saves the latest definitions back through the provider to keep the fallback snapshot up to date.

  This improves service startup reliability and outage recovery without changing normal flag evaluation behavior.

## 1.3.0

### Minor Changes

- e9920bc: improve flag override API for testing
