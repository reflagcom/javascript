---
"@reflag/node-sdk": patch
---

Keep secret flags out of browser data returned by `getFlagsForBootstrap()`, including bound clients. Server-side reads still work, including public flags that depend on secret flags. Remove dependency names from error details sent to the browser.
