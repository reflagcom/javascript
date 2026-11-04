---
"@reflag/browser-sdk": patch
"@reflag/react-sdk": patch
"@reflag/vue-sdk": patch
---

Accept JSON-compatible attributes consistently in context update methods and React/Vue update hooks. Typed user and company contexts can be passed directly, and partial updates still work. Keep user/company IDs restricted to strings or numbers. Also align other-context updates and deprecated provider props with the existing context types.
