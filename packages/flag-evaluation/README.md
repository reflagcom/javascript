# Flag evaluation v2

Prepare a complete collection of compiled flags and segments when definitions
are loaded or refreshed, then evaluate all flags or select one flag for each context:

```ts
import { newEvaluator } from "@reflag/flag-evaluation";

const evaluator = newEvaluator({
  flags: compiledFlags,
  segments: compiledSegments,
});
const context = { company: { id: "acme" }, user: { id: "alice" } };

// getFlags() / getFlagsForBootstrap(): all flags, one normalized context.
const batch = evaluator.evaluateAll(context);
const selected = batch.flags["my-flag"];

// getFlag(): just the requested flag and its dependencies.
const result = evaluator.evaluateFlag(context, "my-flag");

// Diagnostics can accompany either a successful result or a failure.
if (result.errors.length) console.warn(result.errors);

if (result.resolved) {
  // T, not T | undefined. An undefined variant value is still a success.
  console.log(result.value);
  // Required success metadata for diagnostics/exposure events.
  console.log(result.variantKey, result.matchedRuleId);
} else {
  // No variant was selected: use the SDK's fallback behavior.
}
```

`CompiledFlag<T = any>`, `CompiledCollection<T = any>`,
`FlagEvaluationResult<T = any>` and `EvaluationResult<T = any>` preserve the
caller's value type. A heterogeneous collection can use a union for `T`.
Non-fatal diagnostics may also accompany a successful default/fallthrough result.

`evaluateAll(context)` returns `CollectionEvaluationResult<T>`: a shared normalized
`context` and a `flags` record keyed by flag key. Each entry is a
`FlagEvaluationResult<T>` with its own resolution status, value, metadata and
errors, without a repeated `context`. Unresolved flags do not prevent other flags
from being evaluated; segments are not returned as outputs.

`evaluateFlag(context, flagKey)` returns `EvaluationResult<T>`, which adds normalized
`context` to one flag result. It evaluates dependencies but not unrelated flags.
Both operations use the complete collection for resolving references.

Rebuild the evaluator when definitions change. Treat definitions and returned
values as immutable. Each operation has independent diagnostics. SDK-specific
tracking, fallbacks, overrides and bootstrap snapshot versions remain outside the
evaluator.

## References

A collection contains `flags: CompiledFlag<T>[]` and optional
`segments: { key: string; filter: RuleFilter }[]`. Keep references in filters
instead of substituting the referenced definition's filters:

```ts
// Match the variant selected by another flag in the collection.
const flagReference = { type: "flag", key: "model", variantKey: "quality" };
// Reuse a segment predicate from the same collection.
const segmentReference = { type: "segment", key: "enterprise" };
// Negation and authored AND/OR groups work with either reference type.
const negativeReference = { type: "negation", filter: flagReference };
```

Flag references match **variant keys**, never the truthiness of variant values.
The referenced flag uses its own ordered rules, distributions and rollout salts.
A matching selection remains valid despite diagnostics from unsuccessful sibling
rules. A nonmatch accompanied by diagnostics is invalid, not a clean `false`, so
negating an uncertain nonmatch cannot grant access. A clean nonmatch can be
negated. This is intentionally more conservative than explicitly matching a
selected fallback variant.

Segments are predicates, not independent enable-rule groups: errors in a segment
invalidate the containing rule, including through negation. Diagnostics propagated
through references include `source: { type: "flag" | "segment", key: string }`
identifying their original definition. Existing short-circuit behavior is retained;
unvisited runtime branches do not produce diagnostics.

`newEvaluator` throws for duplicate keys, missing references, unknown referenced
variant keys, and cycles, including mixed flag/segment cycles and references in
unreachable branches. Evaluating an unknown flag key also throws. Flag and segment
keys occupy separate namespaces.

References are evaluated recursively without dependency-result caching or
memoization. Context is normalized once per call; repeated references are evaluated
again. Only the existing definition-level membership Sets and percentage bounds
are prepared ahead of time.

## Migration from v1

V2 exports `newEvaluator(collection)`, `flattenContext`, and `hashInt`, plus their
public types. `newEvaluator` accepts a complete compiled collection, not value
rules or a single flag. It returns an object with `evaluateAll(context)` and
`evaluateFlag(context, flagKey)` methods, rather than a callable evaluator.
Publishers and consumers must adopt the collection/reference protocol together;
the unchanged Node SDK remains on the published v1 evaluator.

V1's `evaluateFlagRules`, scalar `evaluate`, `flattenJSON`, `unflattenJSON`, and
value-rule types are removed. There is no v2 one-shot evaluation wrapper.
The hash and `rolloutPercentage` filter remain to preserve boolean cohorts.

## Performance checks

From the repository root:

```sh
yarn workspace @reflag/flag-evaluation exec vitest bench --run test/variants.bench.ts
```

Benchmarks exclude preparation and compare with published v1 across candidate
lists up to 100,000 and percentage distributions up to 50 allocations. Unit tests
assert cached Set usage, no repeated percentage reads, and stable hash cohorts.
