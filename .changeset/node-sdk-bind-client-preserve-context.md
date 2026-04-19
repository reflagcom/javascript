---
"@reflag/node-sdk": patch
---

Fix `BoundReflagClient.bindClient()` so omitted `user`, `company`, and `other` fields preserve the previously bound context instead of being cleared.
