---
"@reflag/openfeature-node-provider": minor
"@reflag/node-sdk": minor
---

Add a new `flagsSyncMode` option to the Node SDK with three sync strategies: `polling`, `in-request`, and `push`.

`polling` keeps the existing periodic background refresh behavior, `in-request` refreshes stale flag definitions during request handling, and `push` subscribes to live flag updates over SSE. The new `push` mode lets applications receive flag definition updates immediately as they happen without relying on periodic polling.
