---
"@reflag/node-sdk": patch
---

Stop installing process signal handlers and forcing process termination after flushing. This prevents the SDK from interrupting application-managed graceful shutdown, including handlers registered after SDK initialization.

`batchOptions.flushOnExit` now only flushes automatically on natural event-loop shutdown (`beforeExit`). Applications must await `client.flush()` in their own shutdown hooks to flush before signal-driven termination or an explicit `process.exit()`.
