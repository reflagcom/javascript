---
"@reflag/node-sdk": patch
---

Restrict direct and bound `getFlagsForBootstrap()` to flags explicitly marked public in the accepted definitions. Secret flag keys, values and legacy remote configuration remain available for server reads, but are no longer exported to clients. Own visibility across cached definitions and saved fallback snapshots.

Deploy the API visibility marker first and refresh persisted fallback snapshots. Older responses/snapshots without visibility, value-only fallbacks, and overrides for unknown or secret keys cannot authorize client exports. Overrides for known public flags remain supported. Bootstrap still includes the supplied context; pass only browser-safe attributes. The v1 bootstrap protocol is unchanged.
