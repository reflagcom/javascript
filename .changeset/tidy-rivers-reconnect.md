---
"@reflag/browser-sdk": patch
---

Let the browser's EventSource handle SSE reconnection and respect terminal failures instead of recreating rejected connections indefinitely. Leave the existing custom transport retry policy unchanged so React Native can still recover after prolonged network outages.
