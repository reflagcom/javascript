# @reflag/flag-evaluation

## 2.0.0

### Major Changes

- d7078e0: Introduce a v2-only compiled-variant evaluator:
  - `newEvaluator({ flags, segments })` prepares a complete collection and returns `evaluateAll(context)` and `evaluateFlag(context, flagKey)` methods. The batch result contains shared normalized context and per-flag results without repeated context. Single-flag evaluation visits only the requested flag and its dependencies. Unresolved batch entries do not prevent other flags from being evaluated. Remove the v1 value-rule APIs and the one-shot `evaluateFlag` wrapper.
  - Preserve flag and segment reference nodes instead of inlining their filters. Flag references explicitly match variant keys; segments remain reusable predicates. Resolve references recursively without dependency-result caching or memoization.
  - Preserve diagnostics from unsuccessful referenced rules without suppressing a valid matching selection. Invalid nonmatches remain fail-closed through negation. Propagated diagnostics identify their source flag or segment.
  - Reject duplicate keys, missing references, unknown referenced variant keys and cycles at preparation, including mixed flag/segment cycles. Evaluating an unknown flag key throws.
  - Preserve arbitrary variant value types through `CompiledFlag<T>` and `EvaluationResult<T>` (default `any`). `resolved: true | false` distinguishes a selected value, including `undefined`, from failure. Successful results require the variant key and matched rule ID.
  - Keep membership Sets and prepared percentage bounds private. `ANY_OF` / `NOT_ANY_OF` use cached Set lookups, including under groups and negations; percentage distributions use precomputed bounds and a simple scan.
  - Evaluate rules sequentially with explicit fallthrough and source-version/rule/allocation diagnostics.
  - Return structured `INVALID_COMPARISON` errors for invalid numeric/date comparisons instead of logging context values. Invalid conditions cannot match through negation.
  - Retain the original hash function and threshold rollout filter for boolean cohort compatibility. The inclusive maximum distribution bucket selects the last nonzero allocation.

  The runtime exports are `newEvaluator`, `flattenContext`, and `hashInt`. Removed APIs include `evaluateFlagRules`, `newFlagEvaluator`, `evaluateFlag`, the scalar `evaluate` helper, and the legacy `flattenJSON` / `unflattenJSON` helpers.

## 1.1.2

### Patch Changes

- aa47838: Return structured diagnostics for invalid numeric and date operands and unknown targeting operators instead of writing evaluation failures directly to the console.

## 1.1.1

### Patch Changes

- 80f2e8f: Fix `CONTAINS` and `NOT_CONTAINS` for array-valued context. `CONTAINS` now checks for an exact, case-sensitive array element; `NOT_CONTAINS` checks its absence. Both use the first comparison value, while `ANY_OF` and `NOT_ANY_OF` continue to support multiple comparison values. Empty arrays do not contain any value.

  Support `IS` for arrays containing exactly one element equal to the comparison value; `IS_NOT` matches all other present arrays, including empty arrays and arrays with duplicate matching elements. Missing fields still fail closed. Scalar equality is unchanged.

  Scalar strings retain case-insensitive substring matching. Supported array equality and membership checks no longer produce `UNSUPPORTED_ARRAY_OPERATOR` warnings in Node SDK flag targeting or config evaluation.

## 1.1.0

### Minor Changes

- 385e3f5: Add type-preserving native-array context evaluation with `ANY_OF`, `NOT_ANY_OF`, `SET`, and `NOT_SET` semantics. Unsupported array operators evaluate to false and produce non-fatal diagnostics that the Node SDK surfaces as rate-limited warnings.

## 1.0.1

### Patch Changes

- 338e9d2: Prevent prototype pollution when unflattening JSON with unsafe property paths.
