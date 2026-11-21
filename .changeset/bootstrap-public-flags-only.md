---
"@reflag/node-sdk": patch
---

Keep secret flags and their remote config out of browser data returned by `getFlagsForBootstrap()`, including bound clients. They remain available on the server. The v1 data format does not change.

Deploy the API change that adds `secret` to flag definitions before upgrading, then refresh saved fallback snapshots. Only flags marked `secret: false` are included. Older definitions without this field, fallback values without definitions, and overrides for unknown or secret flags are left out. Overrides for known public flags still work.

The browser can read the context you pass in. Leave out secrets and server-only attributes.
