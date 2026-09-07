---
"@reflag/flag-evaluation": patch
"@reflag/node-sdk": patch
---

Fix `CONTAINS` and `NOT_CONTAINS` for array-valued context. `CONTAINS` now checks for an exact, case-sensitive array element; `NOT_CONTAINS` checks its absence. Both use the first comparison value, while `ANY_OF` and `NOT_ANY_OF` continue to support multiple comparison values. Empty arrays do not contain any value.

Scalar strings retain case-insensitive substring matching. Supported array membership checks no longer produce `UNSUPPORTED_ARRAY_OPERATOR` warnings in Node SDK flag targeting or config evaluation.
