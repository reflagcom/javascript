---
"@reflag/browser-sdk": patch
"@reflag/openfeature-browser-provider": patch
"@reflag/react-native-sdk": patch
"@reflag/react-sdk": patch
"@reflag/vue-sdk": patch
---

Pass `credentials: "include"` through to EventSource connections so live updates and feedback SSE can include cookies when proxying through an authenticated backend.
