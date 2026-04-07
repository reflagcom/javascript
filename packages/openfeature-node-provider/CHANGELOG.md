# @reflag/openfeature-node-provider

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
