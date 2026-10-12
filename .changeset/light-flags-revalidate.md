---
"@reflag/node-sdk": patch
---

Use ETags when refreshing flag definitions to avoid downloading and recompiling unchanged flags. Custom HTTP clients can opt in by returning the response ETag.
