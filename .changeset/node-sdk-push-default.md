---
"@reflag/node-sdk": minor
---

Change the default `flagsSyncMode` from `"polling"` to `"push"`.

New `ReflagClient` instances now subscribe to live SSE flag updates by default unless `flagsSyncMode` is set explicitly. The deprecated `cacheStrategy` option still maps `"periodically-update"` to `"polling"` and `"in-request"` to `"in-request"`.
