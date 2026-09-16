# Flag evaluation

## Protocol v2

Prepare a compiled flag once when its definition is loaded or refreshed, then
reuse the evaluator for each context:

```ts
import { newFlagEvaluator } from "@reflag/flag-evaluation";

const evaluate = newFlagEvaluator(compiledFlag);
const result = evaluate({ company: { id: "acme" }, user: { id: "alice" } });

// Selected JSON value; null is a valid value, undefined means unresolved.
console.log(result.value);
// Metadata for diagnostics/exposure events, not the public SDK getFlag result.
console.log(result.sourceVersionId, result.variantKey, result.matchedRuleId);
```

Rebuild the evaluator when the compiled definition changes. Treat definitions and
returned JSON values as immutable. Each evaluation has independent diagnostics.

- `ANY_OF` / `NOT_ANY_OF` candidate lists are converted to `Set`s at preparation,
  including inside groups and negations. Scalar checks use hash lookups. An
  array-valued context requires one lookup per examined context element, not a
  traversal of the candidate list.
- Percentage validation and cumulative integer thresholds are computed once.
  Checks hash the company/context attribute and scan the precomputed thresholds.
  The inclusive maximum hash maps to the last nonzero allocation; 0% allocations
  never receive traffic.
- Rules stop at the first selected variant. `nextRule` continues evaluation.
  Results include diagnostics only for visited rules.

`evaluateFlag(flag, context)` is a one-shot convenience API: it prepares on each
call. Use `newFlagEvaluator` in SDK/server hot paths, not inside each `getFlag`.

## Legacy protocol

`evaluateFlagRules` and `newEvaluator` retain the legacy value-rule API.
Legacy rollout thresholds and hash cohorts are unchanged.

## Performance checks

From the repository root:

```sh
yarn workspace @reflag/flag-evaluation exec vitest bench --run test/variants.bench.ts
```

Benchmarks exclude preparation and cover candidate-list sizes up to 100,000 and
percentage distributions up to 50 allocations. Unit tests additionally assert
cached Set usage and that repeated checks do not reread percentage definitions.
