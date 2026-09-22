# Flag evaluation v2

Prepare a compiled flag once when its definition is loaded or refreshed, then
reuse the evaluator for each context:

```ts
import { newEvaluator } from "@reflag/flag-evaluation";

const evaluate = newEvaluator(compiledFlag);
const result = evaluate({ company: { id: "acme" }, user: { id: "alice" } });

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

`CompiledFlag<T = any>` and `EvaluationResult<T = any>` preserve the caller's
value type. Non-fatal diagnostics may also accompany a successful
default/fallthrough result.

Rebuild the evaluator when definitions change. Treat definitions and returned
values as immutable. Each evaluation has independent diagnostics.

## Migration from v1

V2 exports `newEvaluator(flag)`, `flattenContext`, and `hashInt`, plus their public
types. `newEvaluator` now accepts a compiled flag, not value rules. The returned
function accepts only context; the flag key is part of the definition.

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
