---
"@reflag/flag-evaluation": major
---

Add protocol-v2 `CompiledFlag` evaluation via `evaluateFlag(flag, context)`:

- Return any JSON variant value, including `null`, arrays, and booleans.
- Evaluate rules sequentially with fixed variants, percentage distributions, and explicit fallthrough.
- Preserve the existing hash function and legacy rollout filters; assign the inclusive maximum distribution bucket to the final allocation.
- Return source version, selected variant, matched rule, allocation, and per-rule diagnostics for exposure events and debugging.

Existing `evaluateFlagRules` and `newEvaluator` exports remain available for legacy consumers. SDK adoption of `/flags` and variant-valued public APIs is a separate change.
