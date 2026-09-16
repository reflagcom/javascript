---
"@reflag/flag-evaluation": major
---

Introduce a v2-only compiled-variant evaluator:

- `newEvaluator(flag)` prepares a compiled flag once and returns a reusable context evaluator. Remove the v1 value-rule APIs and the one-shot `evaluateFlag` wrapper.
- Preserve arbitrary variant value types through `CompiledFlag<T>` and `EvaluationResult<T>` (default `any`). `resolved: true | false` distinguishes a selected value, including `undefined`, from failure. Successful results require the variant key and matched rule ID.
- Keep membership Sets and prepared percentage bounds private. `ANY_OF` / `NOT_ANY_OF` use cached Set lookups, including under groups and negations; percentage distributions use precomputed bounds and a simple scan.
- Evaluate rules sequentially with explicit fallthrough and source-version/rule/allocation diagnostics.
- Return structured `INVALID_COMPARISON` errors for invalid numeric/date comparisons instead of logging context values. Invalid conditions cannot match through negation.
- Retain the original hash function and threshold rollout filter for boolean cohort compatibility. The inclusive maximum distribution bucket selects the last nonzero allocation.

The runtime exports are `newEvaluator`, `flattenContext`, and `hashInt`. Removed APIs include `evaluateFlagRules`, `newFlagEvaluator`, `evaluateFlag`, the scalar `evaluate` helper, and the legacy `flattenJSON` / `unflattenJSON` helpers.
