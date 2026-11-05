---
"@reflag/browser-sdk": patch
"@reflag/react-sdk": patch
"@reflag/vue-sdk": patch
---

Accept named-interface defaults in Browser reads and check non-null React/Vue defaults against registered flag value schemas, including React Suspense reads. Preserve Boolean bare reads, explicit-null arbitrary JSON, readonly-default support, default-inferred widening, and runtime JSON validation/copying.

Keep Vue declaration imports pointed at the public Vue types so published refs retain their value types rather than degrading to any.
