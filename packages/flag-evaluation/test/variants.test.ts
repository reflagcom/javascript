import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { evaluateFlagRules } from "@reflag/flag-evaluation-v1";

import * as api from "../src";
import {
  CompiledFlag,
  ContextFilter,
  newEvaluator,
  hashInt,
  RuleResult,
} from "../src";

const defaultRule = {
  id: "default",
  filter: { type: "constant" as const, value: true },
  result: { type: "variant" as const, variantKey: "control" },
};
function flag(result: RuleResult): CompiledFlag {
  return {
    key: "model",
    sourceVersionId: "version-1",
    variants: { quality: { model: "large" }, control: null, list: [1, false] },
    rules: [
      { id: "split-rule", filter: { type: "constant", value: true }, result },
      { ...defaultRule },
    ],
  };
}
function split(): Extract<RuleResult, { type: "percentageDistribution" }> {
  return {
    type: "percentageDistribution",
    key: "split",
    attribute: "company.id",
    allocations: [
      {
        percentage: 60,
        destination: { type: "variant", variantKey: "quality" },
      },
      {
        percentage: 40,
        destination: { type: "variant", variantKey: "control" },
      },
    ],
  };
}
const boundaries = [
  ["company-6295", 0, 0, "quality"],
  ["company-20422", 59999, 0, "quality"],
  ["company-27366", 60000, 1, "control"],
  ["company-161395", 99999, 1, "control"],
  ["company-1208267", 100000, 1, "control"],
] as const;

describe("v2 public API", () => {
  it("exposes only the prepared evaluator and shared context/hash helpers", () => {
    expect(Object.keys(api).sort()).toEqual([
      "flattenContext",
      "hashInt",
      "newEvaluator",
    ]);
    expectTypeOf<"valueSet">().not.toMatchTypeOf<keyof ContextFilter>();
  });

  it("narrows boolean/nullable values and required metadata on resolved", () => {
    const definition: CompiledFlag<boolean> = {
      ...flag({ type: "variant", variantKey: "quality" }),
      variants: { quality: true },
    };
    const result = newEvaluator(definition)({});
    expectTypeOf(result.value).toEqualTypeOf<boolean | undefined>();
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error("Expected a selected variant");
    expectTypeOf(result.value).toEqualTypeOf<boolean>();
    expectTypeOf(result.variantKey).toEqualTypeOf<string>();
    expectTypeOf(result.matchedRuleId).toEqualTypeOf<string>();

    const nullable: CompiledFlag<number | null> = {
      ...definition,
      variants: { quality: null },
    };
    const selected = newEvaluator(nullable)({});
    if (!selected.resolved) throw new Error("Expected null variant");
    expectTypeOf(selected.value).toEqualTypeOf<number | null>();
    expect(selected.value).toBeNull();
  });

  it("infers unconstrained values without converting or cloning them", () => {
    const value = new Date("2026-01-01T00:00:00Z");
    const definition = {
      ...flag({ type: "variant", variantKey: "quality" }),
      variants: { quality: value },
    };
    const result = newEvaluator(definition)({});
    if (!result.resolved) throw new Error("Expected a selected variant");
    expectTypeOf(result.value).toEqualTypeOf<Date>();
    expect(result.value).toBe(value);
    const callback = () => "hello";
    const selected = newEvaluator({
      ...definition,
      variants: { quality: callback },
    })({});
    expectTypeOf(selected.value).toEqualTypeOf<typeof callback | undefined>();
    expect(selected.value).toBe(callback);
  });

  it("distinguishes a selected undefined value from failure", () => {
    const definition: CompiledFlag<undefined> = {
      ...flag({ type: "variant", variantKey: "quality" }),
      variants: { quality: undefined },
    };
    expect(newEvaluator(definition)({})).toMatchObject({
      resolved: true,
      value: undefined,
      variantKey: "quality",
    });
    const failed = newEvaluator({ ...definition, rules: [] })({});
    expect(failed).toMatchObject({ resolved: false, value: undefined });
    if (failed.resolved) throw new Error("Expected failure");
    expectTypeOf(failed.value).toEqualTypeOf<undefined>();
    expectTypeOf(failed.variantKey).toEqualTypeOf<undefined>();
  });
});

describe("variant selection", () => {
  it.each(
    [null, false, true, 0, "", [1, false], { model: "large" }].map((value) => ({
      value,
    })),
  )("selects $value", ({ value }) => {
    const definition = flag({ type: "variant", variantKey: "quality" });
    definition.variants.quality = value;
    expect(newEvaluator(definition)({})).toMatchObject({
      resolved: true,
      value,
      variantKey: "quality",
      matchedRuleId: "split-rule",
      sourceVersionId: "version-1",
      errors: [],
    });
  });

  it.each(boundaries)(
    "assigns %s at hash %i to allocation %i",
    (id, bucket, allocationIndex, variantKey) => {
      expect(hashInt(`split.${id}`)).toBe(bucket);
      const result = newEvaluator(flag(split()))({ company: { id } });
      expect(result).toMatchObject({
        resolved: true,
        allocationIndex,
        variantKey,
        matchedRuleId: "split-rule",
        errors: [],
      });
      expect(result.ruleResults).toHaveLength(1);
    },
  );

  it("honors compiled user targets before company targets and rules", () => {
    const definition = flag({ type: "variant", variantKey: "list" });
    definition.rules.unshift(
      {
        id: "user",
        filter: {
          type: "context",
          field: "user.id",
          operator: "ANY_OF",
          values: ["alice"],
        },
        result: { type: "variant", variantKey: "quality" },
      },
      {
        id: "company",
        filter: {
          type: "context",
          field: "company.id",
          operator: "ANY_OF",
          values: ["acme"],
        },
        result: { type: "variant", variantKey: "control" },
      },
    );
    const evaluate = newEvaluator(definition);
    expect(
      evaluate({ user: { id: "alice" }, company: { id: "acme" } })
        .matchedRuleId,
    ).toBe("user");
    expect(
      evaluate({ user: { id: "bob" }, company: { id: "acme" } }).matchedRuleId,
    ).toBe("company");
    expect(
      evaluate({ user: { id: "bob" }, company: { id: "other" } }).matchedRuleId,
    ).toBe("split-rule");
  });

  it("falls through to the next authored rule, not directly to default", () => {
    const definition = flag({
      ...split(),
      allocations: [{ percentage: 100, destination: { type: "nextRule" } }],
    });
    definition.rules.splice(1, 0, {
      id: "second",
      filter: { type: "constant", value: true },
      result: { type: "variant", variantKey: "list" },
    });
    const result = newEvaluator(definition)({ company: { id: "acme" } });
    expect(result).toMatchObject({
      resolved: true,
      value: [1, false],
      matchedRuleId: "second",
    });
    expect(result.allocationIndex).toBeUndefined();
    expect(result.ruleResults).toEqual([
      {
        ruleId: "split-rule",
        matched: true,
        allocationIndex: 0,
        destination: { type: "nextRule" },
      },
      {
        ruleId: "second",
        matched: true,
        destination: { type: "variant", variantKey: "list" },
      },
    ]);
  });

  it("does not inspect later rules after resolving", () => {
    const definition = flag({ type: "variant", variantKey: "quality" });
    definition.rules[1].filter = {
      type: "context",
      field: "missing",
      operator: "IS",
      values: ["x"],
    };
    const result = newEvaluator(definition)({});
    expect(result.errors).toEqual([]);
    expect(result.ruleResults).toHaveLength(1);
  });

  it("continues on missing/scalar-invalid bucketing context", () => {
    const evaluate = newEvaluator(flag(split()));
    expect(evaluate({})).toMatchObject({
      resolved: true,
      variantKey: "control",
      errors: [{ code: "MISSING_CONTEXT_FIELD", field: "company.id" }],
    });
    expect(evaluate({ company: { id: ["a", "b"] } })).toMatchObject({
      resolved: true,
      variantKey: "control",
      errors: [
        {
          code: "UNSUPPORTED_ARRAY_OPERATOR",
          field: "company.id",
          operator: "percentageDistribution",
        },
      ],
    });
  });

  it.each([99, 100.001, -1, NaN, 99.9999])(
    "rejects invalid percentages %s",
    (percentage) => {
      const definition = flag({
        ...split(),
        allocations: [
          {
            percentage,
            destination: { type: "variant", variantKey: "quality" },
          },
        ],
      });
      expect(
        newEvaluator(definition)({ company: { id: "acme" } }),
      ).toMatchObject({
        resolved: false,
        errors: [{ code: "INVALID_FLAG_DEFINITION" }],
      });
    },
  );

  it("accepts three-decimal percentages", () => {
    const definition = flag({
      ...split(),
      allocations: [
        {
          percentage: 33.333,
          destination: { type: "variant", variantKey: "quality" },
        },
        {
          percentage: 33.333,
          destination: { type: "variant", variantKey: "list" },
        },
        {
          percentage: 33.334,
          destination: { type: "variant", variantKey: "control" },
        },
      ],
    });
    expect(
      newEvaluator(definition)({ company: { id: "acme" } }).errors,
    ).toEqual([]);
  });

  it("rejects inherited property names as variants", () => {
    expect(
      newEvaluator(flag({ type: "variant", variantKey: "constructor" }))({}),
    ).toMatchObject({
      resolved: false,
      errors: [{ code: "INVALID_FLAG_DEFINITION" }],
    });
  });

  it("preserves published v1 boolean cohorts, including the maximum hash", () => {
    for (const [id] of boundaries) {
      const filter = {
        type: "rolloutPercentage" as const,
        key: "split",
        partialRolloutAttribute: "company.id",
        partialRolloutThreshold: 60000,
      };
      const context = { company: { id } };
      const legacy = evaluateFlagRules({
        flagKey: "boolean",
        context,
        rules: [{ filter, value: true }],
      });
      const result = newEvaluator({
        key: "boolean",
        sourceVersionId: "v1",
        variants: { true: true, false: false },
        rules: [
          {
            id: "target",
            filter,
            result: { type: "variant", variantKey: "true" },
          },
          { ...defaultRule, result: { type: "variant", variantKey: "false" } },
        ],
      })(context);
      expect(result.resolved).toBe(true);
      expect(result.value).toBe(legacy.value ?? false);
    }
  });
});

describe("prepared evaluator", () => {
  describe.each(["ANY_OF", "NOT_ANY_OF"] as const)("%s", (operator) => {
    it.each(["plain", "group", "negation"] as const)(
      "caches Set lookups for %s",
      (shape) => {
        const values = Array.from(
          { length: 10000 },
          (_, i) => `candidate-${i}`,
        );
        const readCandidate = vi.fn(() => "candidate-1");
        Object.defineProperty(values, 1, { get: readCandidate });
        const leaf: ContextFilter = {
          type: "context",
          field: "company.id",
          operator,
          values,
        };
        const definition = flag({ type: "variant", variantKey: "quality" });
        definition.rules[0].filter =
          shape === "plain"
            ? leaf
            : shape === "group"
              ? { type: "group", operator: "and", filters: [leaf] }
              : {
                  type: "negation",
                  filter: { type: "group", operator: "and", filters: [leaf] },
                };
        const evaluate = newEvaluator(definition);
        expect(readCandidate).toHaveBeenCalled();
        readCandidate.mockClear();
        const lookups = vi.spyOn(Set.prototype, "has");
        const traversal = vi
          .spyOn(values, "includes")
          .mockImplementation(() => {
            throw new Error("Candidate array traversed");
          });
        let results: ReturnType<typeof evaluate>[];
        let lookupCount: number;
        try {
          results = [
            evaluate({ company: { id: "candidate-9999" } }),
            evaluate({ company: { id: ["missing", "candidate-9999"] } }),
          ];
          lookupCount = lookups.mock.calls.filter(
            ([key]) => key === "candidate-9999" || key === "missing",
          ).length;
        } finally {
          lookups.mockRestore();
          traversal.mockRestore();
        }
        expect(lookupCount).toBe(3);
        expect(readCandidate).not.toHaveBeenCalled();
        expect(leaf).not.toHaveProperty("valueSet");
        const matches = (operator === "ANY_OF") !== (shape === "negation");
        expect(results.map(({ variantKey }) => variantKey)).toEqual(
          Array(2).fill(matches ? "quality" : "control"),
        );
      },
    );
  });

  it("does not reread percentages after preparation", () => {
    const distribution = split();
    const reads = vi.fn(() => 60);
    Object.defineProperty(distribution.allocations[0], "percentage", {
      get: reads,
    });
    const evaluate = newEvaluator(flag(distribution));
    reads.mockClear();
    for (let i = 0; i < 10; i++) {
      expect(
        evaluate({ company: { id: "company-6295" } }).allocationIndex,
      ).toBe(0);
      expect(
        evaluate({ company: { id: "company-27366" } }).allocationIndex,
      ).toBe(1);
    }
    expect(reads).not.toHaveBeenCalled();
  });

  it.each(boundaries)("skips zero weights for %s", (id, bucket) => {
    const distribution = split();
    const zero = {
      percentage: 0,
      destination: { type: "variant" as const, variantKey: "list" },
    };
    distribution.allocations.unshift(zero);
    distribution.allocations.splice(2, 0, zero);
    distribution.allocations.push(zero);
    expect(
      newEvaluator(flag(distribution))({ company: { id } }).allocationIndex,
    ).toBe(bucket < 60000 ? 1 : 3);
  });

  it("selects correctly across 50 allocations", () => {
    const definition: CompiledFlag = {
      key: "many",
      sourceVersionId: "v1",
      variants: Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`v${i}`, i]),
      ),
      rules: [
        {
          id: "split",
          filter: { type: "constant", value: true },
          result: {
            ...split(),
            allocations: Array.from({ length: 50 }, (_, i) => ({
              percentage: 2,
              destination: { type: "variant", variantKey: `v${i}` },
            })),
          },
        },
      ],
    };
    const evaluate = newEvaluator(definition);
    for (let i = 0; i < 200; i++) {
      const id = `company-${i}`;
      const index = Math.min(Math.floor(hashInt(`split.${id}`) / 2000), 49);
      expect(evaluate({ company: { id } })).toMatchObject({
        resolved: true,
        allocationIndex: index,
        variantKey: `v${index}`,
        value: index,
        errors: [],
      });
    }
  });

  it("isolates returned diagnostics and destinations between calls", () => {
    const evaluate = newEvaluator(flag(split()));
    const missing = evaluate({});
    const selected = evaluate({ company: { id: "company-6295" } });
    expect(missing.errors).toHaveLength(1);
    expect(selected.errors).toEqual([]);
    const destination = selected.ruleResults[0].destination!;
    if (destination.type === "variant") destination.variantKey = "control";
    expect(evaluate({ company: { id: "company-6295" } }).variantKey).toBe(
      "quality",
    );
    expect(missing.errors).toHaveLength(1);
  });
});
