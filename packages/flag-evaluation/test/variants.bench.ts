import { bench, describe } from "vitest";

import {
  CompiledFlag,
  newEvaluator,
  newFlagEvaluator,
  RuleFilter,
} from "../src";

// Preparation is deliberately outside the timed callback, just as it should be
// outside the SDK's getFlag hot path (rebuild only when definitions refresh).
const context = { company: { id: "candidate-not-in-list" } };

for (const size of [10, 1000, 100000]) {
  describe(`ANY_OF candidate count ${size}`, () => {
    const filter: RuleFilter = {
      type: "context",
      field: "company.id",
      operator: "ANY_OF",
      values: Array.from({ length: size }, (_, i) => `candidate-${i}`),
    };
    const legacy = newEvaluator([
      { filter, value: true },
      { filter: { type: "constant", value: true }, value: false },
    ]);
    const prepared = newFlagEvaluator({
      key: "boolean",
      sourceVersionId: "v1",
      variants: { true: true, false: false },
      rules: [
        {
          id: "target",
          filter,
          result: { type: "variant", variantKey: "true" },
        },
        {
          id: "default",
          filter: { type: "constant", value: true },
          result: { type: "variant", variantKey: "false" },
        },
      ],
    });
    bench("prepared legacy", () => {
      legacy(context, "boolean");
    });
    bench("prepared v2", () => {
      prepared(context);
    });
  });
}

for (const size of [1, 10, 50]) {
  describe(`percentage distribution with ${size} allocations`, () => {
    const flag: CompiledFlag = {
      key: "split",
      sourceVersionId: "v1",
      variants: Object.fromEntries(
        Array.from({ length: size }, (_, i) => [`v${i}`, i]),
      ),
      rules: [
        {
          id: "split",
          filter: { type: "constant", value: true },
          result: {
            type: "percentageDistribution",
            key: "split",
            attribute: "company.id",
            allocations: Array.from({ length: size }, (_, i) => ({
              percentage: 100 / size,
              destination: { type: "variant", variantKey: `v${i}` },
            })),
          },
        },
      ],
    };
    const prepared = newFlagEvaluator(flag);
    bench("prepared v2", () => {
      prepared(context);
    });
  });
}
