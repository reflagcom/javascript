---
"@reflag/node-sdk": patch
---

Keep secret flags and their remote config out of browser data returned by `getFlagsForBootstrap()`, including bound clients. They remain available on the server. The v1 data format does not change.
