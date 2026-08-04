---
"@reflag/browser-sdk": patch
"@reflag/react-sdk": patch
"@reflag/vue-sdk": patch
---

Fix React and Vue opt-in flag keys to respect generated flag types, and return reliable loading state from `useOptInFlags()` while bootstrapped clients fetch missing opt-in metadata. React's hook also supports Suspense.
