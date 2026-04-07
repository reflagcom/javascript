---
"@reflag/node-sdk": patch
---

Replace the built-in GCS fallback provider's default client dependency with `@google-cloud/storage-control`, removing the deprecated `@google-cloud/storage` dependency and its vulnerable transitive request stack.
