---
"@reflag/flag-evaluation": minor
"@reflag/node-sdk": patch
---

Add type-preserving native-array context evaluation with `ANY_OF`, `NOT_ANY_OF`, `SET`, and `NOT_SET` semantics. Unsupported array operators evaluate to false and produce non-fatal diagnostics that the Node SDK surfaces as rate-limited warnings.
