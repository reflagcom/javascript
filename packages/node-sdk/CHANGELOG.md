# @reflag/node-sdk

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
