---
"@reflag/flag-evaluation": major
---

Add protocol-v2 `CompiledFlag` evaluation via `evaluateFlag(flag, context)`:

- Return any JSON variant value, including `null`, arrays, and booleans.
- Evaluate rules sequentially with fixed variants, percentage distributions, and explicit fallthrough.
- Preserve the existing hash function and legacy rollout filters; assign the inclusive maximum distribution bucket to the final nonzero allocation.
- Return source version, selected variant, matched rule, allocation, and per-rule diagnostics for exposure events and debugging.

Use `newFlagEvaluator(flag)` for repeated checks: it prepares hash-set membership lookups and validated cumulative percentage thresholds once, including filters nested under groups and negations. Evaluations reuse those structures, binary-search percentage allocations, and reuse per-rule diagnostic scratch storage.

Existing `evaluateFlagRules` and `newEvaluator` exports remain available for legacy consumers. SDK adoption of `/flags` and variant-valued public APIs is a separate change.
