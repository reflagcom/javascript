import { describe, expect, it } from "vitest";

import {
  ContextFilterOperator,
  evaluateFlagRules,
  newEvaluator,
  RuleFilter,
} from "../src";

const grant: RuleFilter = {
  type: "context",
  field: "company.id",
  operator: "IS",
  values: ["company-a"],
};
const context = {
  company: {
    id: "company-a",
    ages: [42],
    credits: "invalid",
    started: "invalid",
    threshold: 10,
  },
};
const independent = (...filters: RuleFilter[]): RuleFilter => ({
  type: "group",
  operator: "or",
  ruleEvaluation: "independent",
  filters,
});
const negate = (filter: RuleFilter): RuleFilter => ({
  type: "negation",
  filter,
});

const invalidFilters: Array<{
  name: string;
  filter: RuleFilter;
  code: string;
}> = [
  {
    name: "missing context",
    filter: {
      type: "context",
      field: "other.missing",
      operator: "IS",
      values: ["yes"],
    },
    code: "MISSING_CONTEXT_FIELD",
  },
  {
    name: "array comparison",
    filter: {
      type: "context",
      field: "company.ages",
      operator: "GT",
      values: ["1"],
    },
    code: "UNSUPPORTED_ARRAY_OPERATOR",
  },
  {
    name: "invalid number",
    filter: {
      type: "context",
      field: "company.credits",
      operator: "GT",
      values: ["1"],
    },
    code: "INVALID_CONTEXT_VALUE",
  },
  {
    name: "invalid date",
    filter: {
      type: "context",
      field: "company.started",
      operator: "DATE_AFTER",
      values: ["2020-01-01"],
    },
    code: "INVALID_CONTEXT_VALUE",
  },
  {
    name: "invalid targeting value",
    filter: {
      type: "context",
      field: "company.threshold",
      operator: "GT",
      values: ["invalid"],
    },
    code: "INVALID_TARGETING_VALUE",
  },
  {
    name: "unknown operator",
    filter: {
      type: "context",
      field: "company.id",
      operator: "UNKNOWN" as ContextFilterOperator,
    },
    code: "UNKNOWN_OPERATOR",
  },
  {
    name: "missing rollout key",
    filter: {
      type: "rolloutPercentage",
      key: "dependency",
      partialRolloutAttribute: "user.id",
      partialRolloutThreshold: 50000,
    },
    code: "MISSING_CONTEXT_FIELD",
  },
  {
    name: "array rollout key",
    filter: {
      type: "rolloutPercentage",
      key: "dependency",
      partialRolloutAttribute: "company.ages",
      partialRolloutThreshold: 50000,
    },
    code: "UNSUPPORTED_ARRAY_OPERATOR",
  },
];

describe.each(["direct", "optimized"] as const)(
  "%s referenced-rule evaluation",
  (mode) => {
    function evaluate(filter: RuleFilter) {
      const rules = [{ filter, value: true }];
      return mode === "direct"
        ? evaluateFlagRules({ rules, context, flagKey: "dependent" })
        : newEvaluator(rules)(context, "dependent");
    }

    describe.each([false, true])("valid grant first: %s", (grantFirst) => {
      it.each(invalidFilters)(
        "keeps the grant and diagnostics with $name",
        ({ filter, code }) => {
          const result = evaluate(
            independent(...(grantFirst ? [grant, filter] : [filter, grant])),
          );
          expect(result.value).toBe(true);
          expect(result.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ code })]),
          );
        },
      );
    });

    it.each(invalidFilters)(
      "keeps negated invalid references fail-closed with $name",
      ({ filter, code }) => {
        const result = evaluate(
          negate(independent(filter, { type: "constant", value: false })),
        );
        expect(result.value).toBeUndefined();
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ code })]),
        );
      },
    );

    it("does not change ordinary authored OR error handling", () => {
      expect(
        evaluate({
          type: "group",
          operator: "or",
          filters: [invalidFilters[0].filter, grant],
        }).value,
      ).toBeUndefined();
    });

    it("does not treat an invalid negated child as an independent grant", () => {
      expect(
        evaluate(independent(negate(invalidFilters[0].filter))).value,
      ).toBeUndefined();
    });

    it("does not clear errors in the containing authored rule", () => {
      const result = evaluate({
        type: "group",
        operator: "and",
        filters: [
          independent(invalidFilters[0].filter, grant),
          invalidFilters[1].filter,
        ],
      });
      expect(result.value).toBeUndefined();
      expect(result.errors?.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "MISSING_CONTEXT_FIELD",
          "UNSUPPORTED_ARRAY_OPERATOR",
        ]),
      );
    });

    it("preserves independent grants through nested references", () => {
      expect(
        evaluate(
          independent(
            invalidFilters[1].filter,
            independent(invalidFilters[0].filter, grant),
          ),
        ).value,
      ).toBe(true);
    });

    it("does not negate a matching reference into a grant", () => {
      expect(
        evaluate(negate(independent(invalidFilters[0].filter, grant))).value,
      ).toBeUndefined();
    });

    it("allows negation of valid nonmatches", () => {
      expect(
        evaluate(negate(independent({ type: "constant", value: false }))).value,
      ).toBe(true);
    });

    it("treats empty references as disabled", () => {
      expect(evaluate(independent()).value).toBeUndefined();
      expect(evaluate(negate(independent())).value).toBe(true);
    });
  },
);
