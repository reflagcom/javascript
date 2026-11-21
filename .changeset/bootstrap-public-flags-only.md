---
"@reflag/node-sdk": patch
---

Restrict `getFlagsForBootstrap()` (including bound clients) to flags explicitly marked public in the accepted definitions. Keep secret flags available for server evaluation and public-flag dependencies, but exclude their results and diagnostic source identifiers from bootstrap.

Deploy the API visibility marker before upgrading the SDK and refresh saved fallback snapshots. Definitions without explicit public visibility, including older responses/snapshots, value-only fallbacks, and overrides for unknown keys, no longer authorize client exports. Overrides for known public flags remain supported. Bootstrap still includes the supplied context; pass only browser-safe attributes.
