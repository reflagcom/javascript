---
"@reflag/browser-sdk": patch
---

Let the browser's EventSource handle SSE reconnection and respect terminal failures instead of recreating rejected connections indefinitely. Preserve bounded SDK retries for custom transports, resetting their retry budget only when the connection opens.
