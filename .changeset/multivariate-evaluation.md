---
"@reflag/flag-evaluation": major
---

Introduce a v2-only compiled-variant evaluator:

- `newEvaluator({ flags, segments })` prepares a complete collection and returns a reusable `(flagKey, context)` evaluator. Remove the v1 value-rule APIs and the one-shot `evaluateFlag` wrapper.
- Preserve flag and segment reference nodes instead of inlining their filters. Flag references explicitly match variant keys; segments remain reusable predicates. Resolve references recursively without dependency-result caching or memoization.
- Preserve diagnostics from unsuccessful referenced rules without suppressing a valid matching selection. Invalid nonmatches remain fail-closed through negation. Propagated diagnostics identify their source flag or segment.
- Reject duplicate keys, missing references, unknown referenced variant keys and cycles at preparation, including mixed flag/segment cycles. Evaluating an unknown flag key throws.
- Preserve arbitrary variant value types through `CompiledFlag<T>` and `EvaluationResult<T>` (default `any`). `resolved: true | false` distinguishes a selected value, including `undefined`, from failure. Successful results require the variant key and matched rule ID.
- Keep membership Sets and prepared percentage bounds private. `ANY_OF` / `NOT_ANY_OF` use cached Set lookups, including under groups and negations; percentage distributions use precomputed bounds and a simple scan.
- Evaluate rules sequentially with explicit fallthrough and source-version/rule/allocation diagnostics.
- Return structured `INVALID_COMPARISON` errors for invalid numeric/date comparisons instead of logging context values. Invalid conditions cannot match through negation.
- Retain the original hash function and threshold rollout filter for boolean cohort compatibility. The inclusive maximum distribution bucket selects the last nonzero allocation.

The runtime exports are `newEvaluator`, `flattenContext`, and `hashInt`. Removed APIs include `evaluateFlagRules`, `newFlagEvaluator`, `evaluateFlag`, the scalar `evaluate` helper, and the legacy `flattenJSON` / `unflattenJSON` helpers.
