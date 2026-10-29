import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  CollectionEvaluationResult,
  CompiledFlag,
  EvaluationResult,
  FlagEvaluationResult,
  newEvaluator,
  RuleFilter,
} from "../src";

const always: RuleFilter = { type: "constant", value: true };
const grant: RuleFilter = {
  type: "context",
  field: "company.id",
  operator: "ANY_OF",
  values: ["acme"],
};
const missing: RuleFilter = {
  type: "context",
  field: "missing",
  operator: "IS",
  values: ["yes"],
};
const reference: RuleFilter = {
  type: "flag",
  key: "dependency",
  variantKey: "on",
};
const context = { company: { id: "acme" } };

function flag(key: string, filter: RuleFilter = always): CompiledFlag<boolean> {
  return {
    key,
    sourceVersionId: `version-${key}`,
    variants: { on: true, off: false },
    rules: [
      { id: "target", filter, result: { type: "variant", variantKey: "on" } },
      {
        id: "default",
        filter: always,
        result: { type: "variant", variantKey: "off" },
      },
    ],
  };
}

describe("batch and single-flag API", () => {
  it("exposes explicit operations and preserves generic result types", () => {
    const evaluator = newEvaluator({ flags: [flag("a")] });
    expect(Object.keys(evaluator).sort()).toEqual([
      "evaluateAll",
      "evaluateFlag",
    ]);
    const batch = evaluator.evaluateAll(context);
    const single = evaluator.evaluateFlag(context, "a");
    expectTypeOf(batch).toEqualTypeOf<CollectionEvaluationResult<boolean>>();
    expectTypeOf(batch.flags.a).toEqualTypeOf<FlagEvaluationResult<boolean>>();
    expectTypeOf(single).toEqualTypeOf<EvaluationResult<boolean>>();
    if (!batch.flags.a.resolved || !single.resolved)
      throw new Error("Expected selections");
    expectTypeOf(batch.flags.a.value).toEqualTypeOf<boolean>();
    expectTypeOf(single.value).toEqualTypeOf<boolean>();
  });

  it("evaluates every flag but keeps segments out of the outputs", () => {
    const evaluator = newEvaluator({
      flags: [
        flag("a", { type: "segment", key: "enterprise" }),
        flag("dependency", grant),
        flag("b", reference),
      ],
      segments: [{ key: "enterprise", filter: reference }],
    });
    const result = evaluator.evaluateAll(context);
    expect(Object.keys(result.flags)).toEqual(["a", "dependency", "b"]);
    for (const [key, selected] of Object.entries(result.flags)) {
      expect(selected).toMatchObject({
        flagKey: key,
        sourceVersionId: `version-${key}`,
        resolved: true,
        value: true,
        variantKey: "on",
        matchedRuleId: "target",
        errors: [],
      });
      expect(selected).not.toHaveProperty("context");
    }
    expect(result.context).toEqual({ "company.id": "acme" });
  });

  it("normalizes context once for the entire batch, including dependencies", () => {
    const readId = vi.fn(() => "acme");
    const request = {
      company: {
        get id() {
          return readId();
        },
      },
    };
    const evaluator = newEvaluator({
      flags: [
        flag("a", reference),
        flag("b", reference),
        flag("dependency", grant),
      ],
    });
    expect(evaluator.evaluateAll(request).flags.a.value).toBe(true);
    expect(readId).toHaveBeenCalledTimes(1);
    expect(evaluator.evaluateFlag(request, "a").value).toBe(true);
    expect(readId).toHaveBeenCalledTimes(2);
  });

  it("returns the same per-flag results from both operations", () => {
    const evaluator = newEvaluator({
      flags: [
        flag("a", reference),
        {
          ...flag("dependency", missing),
          rules: [
            ...flag("dependency", missing)
              .rules.slice(0, 1)
              .map((rule) => ({ ...rule, id: "invalid" })),
            ...flag("dependency", grant).rules,
          ],
        },
        flag("negative", { type: "negation", filter: reference }),
      ],
    });
    for (const request of [context, { company: { id: "other" } }]) {
      const batch = evaluator.evaluateAll(request);
      for (const [key, result] of Object.entries(batch.flags)) {
        const { context: singleContext, ...single } = evaluator.evaluateFlag(
          request,
          key,
        );
        expect(result).toEqual(single);
        expect(singleContext).toEqual(batch.context);
      }
    }
  });

  it("does not let one unresolved flag prevent other outputs", () => {
    const evaluator = newEvaluator({
      flags: [
        { ...flag("broken"), rules: [] },
        flag("a"),
        flag("dependent", { type: "flag", key: "broken", variantKey: "on" }),
        flag("last"),
      ],
    });
    const { flags } = evaluator.evaluateAll({});
    expect(Object.keys(flags)).toEqual(["broken", "a", "dependent", "last"]);
    expect(flags.broken).toMatchObject({
      resolved: false,
      errors: [{ code: "INVALID_FLAG_DEFINITION" }],
    });
    expect(flags.a).toMatchObject({ resolved: true, value: true, errors: [] });
    expect(flags.dependent).toMatchObject({
      resolved: true,
      value: false,
      errors: [{ source: { type: "flag", key: "broken" } }],
    });
    expect(flags.last).toMatchObject({
      resolved: true,
      value: true,
      errors: [],
    });
  });

  it("does not evaluate unrelated flags during evaluateFlag", () => {
    const evaluator = newEvaluator({
      flags: [
        flag("a", reference),
        flag("dependency", grant),
        flag("unrelated", grant),
      ],
    });
    const lookups = vi.spyOn(Set.prototype, "has");
    try {
      expect(evaluator.evaluateFlag(context, "a").value).toBe(true);
      expect(
        lookups.mock.calls.filter(([value]) => value === "acme"),
      ).toHaveLength(1);
    } finally {
      lookups.mockRestore();
    }
  });

  it.each([false, true])(
    "re-evaluates dependencies without memoization, reversed: %s",
    (reversed) => {
      const definitions = [
        flag("a", {
          type: "group",
          operator: "and",
          filters: [reference, reference],
        }),
        flag("dependency", grant),
      ];
      const evaluator = newEvaluator({
        flags: reversed ? definitions.reverse() : definitions,
      });
      const lookups = vi.spyOn(Set.prototype, "has");
      try {
        expect(evaluator.evaluateAll(context).flags.a.value).toBe(true);
        // Twice through a, once as a root output, regardless of definition order.
        expect(
          lookups.mock.calls.filter(([value]) => value === "acme"),
        ).toHaveLength(3);
        expect(
          evaluator.evaluateAll({ company: { id: "other" } }).flags.a.value,
        ).toBe(false);
        expect(evaluator.evaluateAll(context).flags.a.value).toBe(true);
        expect(
          lookups.mock.calls.filter(([value]) => value === "acme"),
        ).toHaveLength(6);
      } finally {
        lookups.mockRestore();
      }
    },
  );

  it("keeps diagnostics local to each flag and each call", () => {
    const evaluator = newEvaluator({
      flags: [flag("a", reference), flag("dependency", missing), flag("clean")],
    });
    const first = evaluator.evaluateAll(context);
    expect(first.flags.a.errors).toMatchObject([
      { source: { type: "flag", key: "dependency" } },
    ]);
    expect(first.flags.dependency.errors).toHaveLength(1);
    expect(first.flags.clean.errors).toEqual([]);
    first.flags.a.errors[0].source!.key = "changed";
    first.flags.a.ruleResults.length = 0;
    first.context["company.id"] = "changed";
    expect(first.flags.dependency.errors[0]).not.toHaveProperty("source");
    const second = evaluator.evaluateAll(context);
    expect(second.context["company.id"]).toBe("acme");
    expect(second.flags.a.ruleResults.length).toBeGreaterThan(0);
    expect(second.flags.a.errors).toMatchObject([
      { source: { type: "flag", key: "dependency" } },
    ]);
    expect(evaluator.evaluateFlag(context, "a").errors).toEqual(
      second.flags.a.errors,
    );
  });

  it("distinguishes selected undefined from unresolved in batch results", () => {
    const definition: CompiledFlag<undefined> = {
      ...flag("selected"),
      variants: { on: undefined },
    };
    const evaluator = newEvaluator({
      flags: [definition, { ...definition, key: "failed", rules: [] }],
    });
    const { flags } = evaluator.evaluateAll({});
    expect(flags.selected).toMatchObject({
      resolved: true,
      value: undefined,
      variantKey: "on",
    });
    expect(flags.failed).toMatchObject({ resolved: false, value: undefined });
    if (!flags.selected.resolved) throw new Error("Expected selection");
    expectTypeOf(flags.selected.value).toEqualTypeOf<undefined>();
    expectTypeOf(flags.selected.variantKey).toEqualTypeOf<string>();
  });

  it("returns an empty batch for an empty collection", () => {
    const evaluator = newEvaluator({
      flags: [],
      segments: [{ key: "unused", filter: always }],
    });
    expect(evaluator.evaluateAll(context)).toEqual({
      context: { "company.id": "acme" },
      flags: {},
    });
    expect(() => evaluator.evaluateFlag(context, "missing")).toThrow(
      'Unknown flag "missing"',
    );
  });

  it.each(["__proto__", "constructor", "toString"])(
    "returns own flag key %s safely",
    (key) => {
      const result = newEvaluator({ flags: [flag(key)] }).evaluateAll({});
      expect(Object.getPrototypeOf(result.flags)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(result.flags, key)).toBe(
        true,
      );
      expect(Object.keys(result.flags)).toEqual([key]);
      expect(result.flags[key]).toMatchObject({
        flagKey: key,
        resolved: true,
        value: true,
      });
      expect(JSON.parse(JSON.stringify(result)).flags[key].flagKey).toBe(key);
    },
  );
});
