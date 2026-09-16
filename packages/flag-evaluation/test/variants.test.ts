import { describe, expect, it } from "vitest";

import {
  CompiledFlag,
  evaluateFlag,
  evaluateFlagRules,
  hashInt,
  JsonValue,
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

function split(): RuleResult {
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

describe("protocol-v2 evaluation", () => {
  it.each(
    (
      [
        null,
        false,
        true,
        0,
        "",
        [1, false],
        { model: "large" },
      ] satisfies JsonValue[]
    ).map((value) => ({ value })),
  )(
    "returns JSON value $value without treating it as an unresolved result",
    ({ value }) => {
      const definition = flag({ type: "variant", variantKey: "quality" });
      definition.variants.quality = value;
      expect(evaluateFlag(definition, {})).toMatchObject({
        sourceVersionId: "version-1",
        value,
        variantKey: "quality",
        matchedRuleId: "split-rule",
        errors: [],
      });
    },
  );

  it.each([
    ["company-6295", 0, 0, "quality"],
    ["company-20422", 59999, 0, "quality"],
    ["company-27366", 60000, 1, "control"],
    ["company-161395", 99999, 1, "control"],
    ["company-1208267", 100000, 1, "control"],
  ] as const)(
    "assigns %s at hash %i to allocation %i",
    (id, bucket, allocationIndex, variantKey) => {
      expect(hashInt(`split.${id}`)).toBe(bucket);
      const result = evaluateFlag(flag(split()), { company: { id } });
      expect(result).toMatchObject({
        variantKey,
        allocationIndex,
        matchedRuleId: "split-rule",
        errors: [],
      });
      expect(result.ruleResults).toHaveLength(1);
    },
  );

  it("honors compiled user targets before company targets and ordered rules", () => {
    const definition = flag({ type: "variant", variantKey: "list" });
    definition.rules.unshift(
      {
        id: "user-target",
        filter: {
          type: "context",
          field: "user.id",
          operator: "ANY_OF",
          values: ["alice"],
        },
        result: { type: "variant", variantKey: "quality" },
      },
      {
        id: "company-target",
        filter: {
          type: "context",
          field: "company.id",
          operator: "ANY_OF",
          values: ["acme"],
        },
        result: { type: "variant", variantKey: "control" },
      },
    );
    expect(
      evaluateFlag(definition, {
        user: { id: "alice" },
        company: { id: "acme" },
      }).matchedRuleId,
    ).toBe("user-target");
    expect(
      evaluateFlag(definition, { user: { id: "bob" }, company: { id: "acme" } })
        .matchedRuleId,
    ).toBe("company-target");
    expect(
      evaluateFlag(definition, {
        user: { id: "bob" },
        company: { id: "other" },
      }).matchedRuleId,
    ).toBe("split-rule");
  });

  it("continues to the next authored rule rather than directly to the default", () => {
    const definition = flag({
      type: "percentageDistribution",
      key: "split",
      attribute: "company.id",
      allocations: [{ percentage: 100, destination: { type: "nextRule" } }],
    });
    definition.rules.splice(1, 0, {
      id: "second-rule",
      filter: { type: "constant", value: true },
      result: { type: "variant", variantKey: "list" },
    });
    const result = evaluateFlag(definition, {
      company: { id: "company-6295" },
    });
    expect(result).toMatchObject({
      value: [1, false],
      matchedRuleId: "second-rule",
      variantKey: "list",
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
        ruleId: "second-rule",
        matched: true,
        destination: { type: "variant", variantKey: "list" },
      },
    ]);
  });

  it("records missing bucketing context and continues evaluation", () => {
    const result = evaluateFlag(flag(split()), {});
    expect(result).toMatchObject({
      variantKey: "control",
      value: null,
      matchedRuleId: "default",
    });
    expect(result.errors).toEqual([
      {
        code: "MISSING_CONTEXT_FIELD",
        field: "company.id",
        message:
          'Context field "company.id" is required to evaluate targeting rules.',
      },
    ]);
  });

  it("rejects array bucketing values instead of implicitly stringifying them", () => {
    const result = evaluateFlag(flag(split()), { company: { id: ["a", "b"] } });
    expect(result.variantKey).toBe("control");
    expect(result.errors).toMatchObject([
      {
        code: "UNSUPPORTED_ARRAY_OPERATOR",
        operator: "percentageDistribution",
        field: "company.id",
      },
    ]);
  });

  it("does not inspect filters or report missing fields after selecting a variant", () => {
    const definition = flag({ type: "variant", variantKey: "quality" });
    definition.rules[1].filter = {
      type: "context",
      field: "user.missing",
      operator: "IS",
      values: ["x"],
    };
    const result = evaluateFlag(definition, {});
    expect(result.errors).toEqual([]);
    expect(result.ruleResults).toHaveLength(1);
  });

  it("does not turn an invalid negated filter into a matching rule", () => {
    const definition = flag({ type: "variant", variantKey: "quality" });
    definition.rules[0].filter = {
      type: "negation",
      filter: {
        type: "context",
        field: "company.missing",
        operator: "IS",
        values: ["x"],
      },
    };
    const result = evaluateFlag(definition, {});
    expect(result.variantKey).toBe("control");
    expect(result.ruleResults[0].matched).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it.each([99, 100.001, -1, Number.NaN, 99.9999])(
    "rejects invalid allocation total/precision %s",
    (percentage) => {
      const result = evaluateFlag(
        flag({
          type: "percentageDistribution",
          key: "split",
          attribute: "company.id",
          allocations: [
            {
              percentage,
              destination: { type: "variant", variantKey: "quality" },
            },
          ],
        }),
        { company: { id: "acme" } },
      );
      expect(result.value).toBeUndefined();
      expect(result.errors).toMatchObject([
        { code: "INVALID_FLAG_DEFINITION" },
      ]);
    },
  );

  it("accepts three-decimal splits without floating-point sum errors", () => {
    const definition = flag({
      type: "percentageDistribution",
      key: "split",
      attribute: "company.id",
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
      evaluateFlag(definition, { company: { id: "acme" } }).errors,
    ).toEqual([]);
  });

  it("does not resolve inherited object properties as variant values", () => {
    const result = evaluateFlag(
      flag({ type: "variant", variantKey: "constructor" }),
      {},
    );
    expect(result.value).toBeUndefined();
    expect(result.errors).toMatchObject([{ code: "INVALID_FLAG_DEFINITION" }]);
  });

  it("reports missing catch-all defaults as unresolved", () => {
    const definition = flag({ type: "variant", variantKey: "quality" });
    definition.rules = [];
    const result = evaluateFlag(definition, {});
    expect(result.value).toBeUndefined();
    expect(result.errors).toMatchObject([{ code: "INVALID_FLAG_DEFINITION" }]);
  });

  it("preserves legacy boolean rollout cohorts, including the maximum hash", () => {
    for (const id of [
      "company-6295",
      "company-20422",
      "company-27366",
      "company-1208267",
    ]) {
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
      const result = evaluateFlag(
        {
          key: "boolean",
          sourceVersionId: "version-1",
          variants: { true: true, false: false },
          rules: [
            {
              id: "target",
              filter,
              result: { type: "variant", variantKey: "true" },
            },
            {
              ...defaultRule,
              result: { type: "variant", variantKey: "false" },
            },
          ],
        },
        context,
      );
      expect(result.value).toBe(legacy.value ?? false);
    }
  });
});
