# Flag evaluation v2

Prepare a compiled flag once when its definition is loaded or refreshed, then
reuse the evaluator for each context:

```ts
import { newEvaluator } from "@reflag/flag-evaluation";

const evaluate = newEvaluator(compiledFlag);
const result = evaluate({ company: { id: "acme" }, user: { id: "alice" } });

if (result.resolved) {
  // T, not T | undefined. An undefined variant value is still a success.
  console.log(result.value);
  // Required success metadata for diagnostics/exposure events.
  console.log(result.variantKey, result.matchedRuleId);
} else {
  // No variant was selected: use the SDK's fallback behavior.
  console.log(result.errors);
}
```

`CompiledFlag<T = any>` and `EvaluationResult<T = any>` preserve the caller's
value type. JSON validation belongs at the API/persistence boundary, not here.
Non-fatal diagnostics may also accompany a successful default/fallthrough result.

Rebuild the evaluator when definitions change. Treat definitions and returned
values as immutable. Each evaluation has independent diagnostics.

## Preparation and evaluation

- `ANY_OF` / `NOT_ANY_OF` lists become private Sets at preparation, including
  inside groups and negations. Scalars use hash lookups. Array-valued contexts
  require a lookup per examined context element, not a candidate-list scan.
- Percentage validation and cumulative integer bounds are computed once and
  stored with each destination. Checks hash the context attribute and scan those
  bounds. The inclusive maximum hash maps to the last nonzero allocation;
  0% allocations never receive traffic.
- Rules stop at the first selected variant. `nextRule` continues evaluation.
  Results include diagnostics only for visited rules.
- Invalid numeric/date comparisons produce `INVALID_COMPARISON` diagnostics and
  cannot match through negation. The evaluator never writes to the console or
  embeds operand values in error messages.

## Migration from v1

V2 exports `newEvaluator(flag)`, `flattenContext`, and `hashInt`, plus their public
types. `newEvaluator` now accepts a compiled flag, not value rules. The returned
function accepts only context; the flag key is part of the definition.

V1's `evaluateFlagRules`, scalar `evaluate`, `flattenJSON`, `unflattenJSON`, and
value-rule types are removed. There is no v2 one-shot evaluation wrapper.
The hash and `rolloutPercentage` filter remain to preserve boolean cohorts.

Consumers of the old `/features` protocol must continue using the published 1.x
package. In this monorepo, the unchanged Node SDK uses the explicitly pinned
`@reflag/flag-evaluation-v1` npm alias, so Changesets does not advance its evaluator
dependency to v2. The distinct v2 prerelease version also prevents Yarn workspace
linking and TypeScript package-identity collisions with v1. The alias is used as a
test/benchmark reference, not as a runtime dependency of evaluator v2.

## Performance checks

From the repository root:

```sh
yarn workspace @reflag/flag-evaluation exec vitest bench --run test/variants.bench.ts
```

Benchmarks exclude preparation and compare with published v1 across candidate
lists up to 100,000 and percentage distributions up to 50 allocations. Unit tests
assert cached Set usage, no repeated percentage reads, and stable hash cohorts.
