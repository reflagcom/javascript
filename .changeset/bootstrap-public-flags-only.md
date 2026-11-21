---
"@reflag/node-sdk": patch
---

Keep secret flags out of browser data returned by `getFlagsForBootstrap()`, including bound clients. Server-side reads still work, including public flags that depend on secret flags. Remove dependency names from error details sent to the browser.

After upgrading, fetch current flag definitions from Reflag to refresh saved fallback snapshots. Only flags marked `secret: false` are included. Older definitions without this field, fallback values without definitions, and overrides for unknown or secret flags are left out. Overrides for known public flags still work.

The browser can read the context you pass in. Leave out secrets and server-only attributes.
