---
"@reflag/browser-sdk": patch
"@reflag/react-sdk": patch
---

Fix React opt-in flag keys to respect generated flag types, and return reliable loading and Suspense states from `useOptInFlags()` while bootstrapped clients fetch missing opt-in metadata.
