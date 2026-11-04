import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  CompiledCollection,
  CompiledFlag,
  CompiledRule,
  CompiledSegment,
  ContextFilterOperator,
  FlagReferenceFilter,
  hashInt,
  newEvaluator,
  RuleFilter,
} from "../src";

const yes: RuleFilter = { type: "constant", value: true };
const no: RuleFilter = { type: "constant", value: false };
const grant: RuleFilter = {
  type: "context",
  field: "company.id",
  operator: "ANY_OF",
  values: ["acme"],
};
const context = {
  company: { id: "acme", numbers: [42], credits: "invalid", threshold: 10 },
};
const reference = (key: string, variantKey = "on"): FlagReferenceFilter => ({
  type: "flag",
  key,
  variantKey,
});
const segment = (key: string): RuleFilter => ({ type: "segment", key });
const negate = (filter: RuleFilter): RuleFilter => ({
  type: "negation",
  filter,
});
const group = (
  operator: "and" | "or",
  ...filters: RuleFilter[]
): RuleFilter => ({
  type: "group",
  operator,
  filters,
});
const rule = (
  id: string,
  filter: RuleFilter,
  variantKey = "on",
): CompiledRule => ({
  id,
  filter,
  result: { type: "variant", variantKey },
});
function flag(key: string, ...filters: RuleFilter[]): CompiledFlag<boolean> {
  return {
    key,
    sourceVersionId: `version-${key}`,
    variants: { on: true, off: false },
    rules: [
      ...filters.map((filter, index) => rule(`rule-${index}`, filter)),
      rule("default", yes, "off"),
    ],
  };
}

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
    name: "unsupported array operator",
    filter: {
      type: "context",
      field: "company.numbers",
      operator: "GT",
      values: ["1"],
    },
    code: "UNSUPPORTED_ARRAY_OPERATOR",
  },
  {
    name: "invalid context number",
    filter: {
      type: "context",
      field: "company.credits",
      operator: "GT",
      values: ["1"],
    },
    code: "INVALID_COMPARISON",
  },
  {
    name: "invalid targeting number",
    filter: {
      type: "context",
      field: "company.threshold",
      operator: "GT",
      values: ["invalid"],
    },
    code: "INVALID_COMPARISON",
  },
  {
    name: "invalid date",
    filter: {
      type: "context",
      field: "company.credits",
      operator: "DATE_AFTER",
      values: ["2020-01-01"],
    },
    code: "INVALID_COMPARISON",
  },
  {
    name: "unknown operator",
    filter: {
      type: "context",
      field: "company.id",
      operator: "UNKNOWN" as ContextFilterOperator,
    },
    code: "INVALID_COMPARISON",
  },
  {
    name: "missing rollout attribute",
    filter: {
      type: "rolloutPercentage",
      key: "b",
      partialRolloutAttribute: "user.id",
      partialRolloutThreshold: 50000,
    },
    code: "MISSING_CONTEXT_FIELD",
  },
  {
    name: "array rollout attribute",
    filter: {
      type: "rolloutPercentage",
      key: "b",
      partialRolloutAttribute: "company.numbers",
      partialRolloutThreshold: 50000,
    },
    code: "UNSUPPORTED_ARRAY_OPERATOR",
  },
];

describe("collection evaluation", () => {
  it("selects a flag by key and preserves its value type and metadata", () => {
    const definition = flag("a", reference("b"));
    const evaluate = newEvaluator({ flags: [definition, flag("b", grant)] });
    const result = evaluate.evaluateFlag(context, "a");
    expect(result).toMatchObject({
      resolved: true,
      value: true,
      flagKey: "a",
      sourceVersionId: "version-a",
      variantKey: "on",
      matchedRuleId: "rule-0",
      errors: [],
    });
    expectTypeOf(result.value).toEqualTypeOf<boolean | undefined>();
    if (!result.resolved) throw new Error("Expected a selected variant");
    expectTypeOf(result.value).toEqualTypeOf<boolean>();
    expect(evaluate.evaluateFlag(context, "b").value).toBe(true);
    expect(evaluate.evaluateFlag({ company: { id: "other" } }, "a").value).toBe(
      false,
    );
    expect(() => evaluate.evaluateFlag({}, "missing")).toThrow(
      'Unknown flag "missing"',
    );
  });

  it("matches multivariate variant keys, not value truthiness or object identity", () => {
    for (const value of [undefined, null, false, 0, "", { model: "large" }]) {
      const b: CompiledFlag = {
        ...flag("b"),
        variants: { quality: value, control: true },
        rules: [rule("select", yes, "quality")],
      };
      const evaluate = newEvaluator({
        flags: [
          flag("a", reference("b", "quality")),
          flag("c", reference("b", "control")),
          b,
        ],
      });
      expect(evaluate.evaluateFlag({}, "a").value).toBe(true);
      expect(evaluate.evaluateFlag({}, "c").value).toBe(false);
      expect(evaluate.evaluateFlag({}, "b").value).toBe(value);
    }
  });

  it("supports collections with different variant value types", () => {
    const collection: CompiledCollection<boolean | string> = {
      flags: [
        flag("a", reference("b", "quality")),
        {
          ...flag("b"),
          variants: { quality: "large" },
          rules: [rule("select", yes, "quality")],
        },
      ],
    };
    const result = newEvaluator(collection).evaluateFlag({}, "b");
    expectTypeOf(result.value).toEqualTypeOf<boolean | string | undefined>();
    expect(result.value).toBe("large");
  });

  it("resolves nested flags, nested segments and flag references in segments", () => {
    const segments: CompiledSegment[] = [
      { key: "outer", filter: segment("inner") },
      { key: "inner", filter: group("and", grant, reference("c")) },
    ];
    const evaluate = newEvaluator({
      flags: [
        flag("a", reference("b")),
        flag("b", segment("outer")),
        flag("c", yes),
      ],
      segments,
    });
    expect(evaluate.evaluateFlag(context, "a").value).toBe(true);
    expect(evaluate.evaluateFlag({ company: { id: "other" } }, "a").value).toBe(
      false,
    );
  });

  it("allows flag and segment keys to share the same name", () => {
    const evaluate = newEvaluator({
      flags: [flag("a", reference("same")), flag("same", segment("same"))],
      segments: [{ key: "same", filter: yes }],
    });
    expect(evaluate.evaluateFlag({}, "a").value).toBe(true);
  });

  it.each(["__proto__", "constructor", "toString"])(
    "handles own definition key %s safely",
    (key) => {
      const evaluate = newEvaluator({
        flags: [
          flag("a", reference(key, key)),
          {
            ...flag(key),
            variants: { [key]: true },
            rules: [rule("selected", segment(key), key)],
          },
        ],
        segments: [{ key, filter: yes }],
      });
      expect(evaluate.evaluateFlag({}, "a").value).toBe(true);
      expect(evaluate.evaluateFlag({}, key).value).toBe(true);
    },
  );

  it("preserves the referenced rollout's salt, context and threshold", () => {
    const threshold = 50000;
    const evaluate = newEvaluator({
      flags: [
        flag("a", reference("b")),
        flag("b", {
          type: "rolloutPercentage",
          key: "original-b-key",
          partialRolloutAttribute: "company.id",
          partialRolloutThreshold: threshold,
        }),
      ],
    });
    for (let i = 0; i < 100; i++) {
      const id = `company-${i}`;
      expect(evaluate.evaluateFlag({ company: { id } }, "a").value).toBe(
        hashInt(`original-b-key.${id}`) < threshold,
      );
    }
  });

  it("references the variant selected by a percentage distribution", () => {
    const b = flag("b");
    b.rules.unshift({
      id: "split",
      filter: yes,
      result: {
        type: "percentageDistribution",
        key: "b-split",
        attribute: "company.id",
        allocations: [
          {
            percentage: 50,
            destination: { type: "variant", variantKey: "on" },
          },
          { percentage: 50, destination: { type: "nextRule" } },
        ],
      },
    });
    const evaluate = newEvaluator({ flags: [flag("a", reference("b")), b] });
    for (let i = 0; i < 100; i++) {
      const id = `company-${i}`;
      expect(evaluate.evaluateFlag({ company: { id } }, "a").value).toBe(
        Math.min(hashInt(`b-split.${id}`), 99999) < 50000,
      );
    }
  });
});

describe("reference error boundaries", () => {
  describe.each([false, true])("valid grant first: %s", (grantFirst) => {
    it.each(invalidFilters)(
      "keeps a valid grant despite $name in a sibling rule",
      ({ filter, code }) => {
        const evaluate = newEvaluator({
          flags: [
            flag("a", reference("b")),
            flag("b", ...(grantFirst ? [grant, filter] : [filter, grant])),
          ],
        });
        const result = evaluate.evaluateFlag(context, "a");
        expect(result.value).toBe(true);
        expect(result.errors).toEqual(
          grantFirst
            ? []
            : [
                expect.objectContaining({
                  code,
                  source: { type: "flag", key: "b" },
                }),
              ],
        );
      },
    );
  });

  it.each(invalidFilters)(
    "does not negate an uncertain nonmatch into a grant: $name",
    ({ filter, code }) => {
      const evaluate = newEvaluator({
        flags: [flag("a", negate(reference("b"))), flag("b", filter, no)],
      });
      const result = evaluate.evaluateFlag(context, "a");
      expect(result.value).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({ code, source: { type: "flag", key: "b" } }),
      ]);
    },
  );

  it("allows a clean negative reference and does not negate a matching reference into a grant", () => {
    const evaluate = newEvaluator({
      flags: [flag("a", negate(reference("b"))), flag("b", grant)],
    });
    expect(evaluate.evaluateFlag({ company: { id: "other" } }, "a").value).toBe(
      true,
    );
    expect(evaluate.evaluateFlag(context, "a").value).toBe(false);
  });

  it("distinguishes an explicit fallback selection from negating an uncertain nonmatch", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", reference("b", "off")),
        flag("c", negate(reference("b"))),
        flag("b", invalidFilters[0].filter),
      ],
    });
    expect(evaluate.evaluateFlag(context, "a").value).toBe(true);
    expect(evaluate.evaluateFlag(context, "c").value).toBe(false);
    expect(evaluate.evaluateFlag(context, "a").errors).toHaveLength(1);
    expect(evaluate.evaluateFlag(context, "c").errors).toHaveLength(1);
  });

  it("does not negate a matching selection with nonfatal diagnostics into a grant", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", negate(reference("b"))),
        flag("b", invalidFilters[0].filter, grant),
      ],
    });
    expect(evaluate.evaluateFlag(context, "a")).toMatchObject({
      value: false,
      errors: [
        { code: "MISSING_CONTEXT_FIELD", source: { type: "flag", key: "b" } },
      ],
    });
  });

  it("does not treat an invalid negated dependency rule as a valid selection", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", reference("b")),
        flag("b", negate(invalidFilters[0].filter)),
      ],
    });
    expect(evaluate.evaluateFlag(context, "a").value).toBe(false);
  });

  it("keeps authored OR errors local to a rule, not the entire flag", () => {
    const authored = group("or", reference("b"), grant);
    const b = flag("b", invalidFilters[0].filter);
    const evaluate = newEvaluator({
      flags: [flag("a", authored), flag("c", authored, grant), b],
    });
    expect(evaluate.evaluateFlag(context, "a").value).toBe(false);
    expect(evaluate.evaluateFlag(context, "c").value).toBe(true);
    expect(evaluate.evaluateFlag(context, "c").errors).toHaveLength(1);
  });

  it("keeps errors from distinct dependency definitions with the same missing field", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", reference("b"), reference("c")),
        flag("b", invalidFilters[0].filter),
        flag("c", invalidFilters[0].filter),
      ],
    });
    expect(
      evaluate.evaluateFlag(context, "a").errors.map(({ source }) => source),
    ).toEqual([
      { type: "flag", key: "b" },
      { type: "flag", key: "c" },
    ]);
  });

  it("preserves diagnostics through nested references without invalidating a valid grant", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", reference("b")),
        flag("b", reference("c")),
        flag("c", invalidFilters[0].filter, grant),
      ],
    });
    expect(evaluate.evaluateFlag(context, "a")).toMatchObject({
      value: true,
      errors: [
        { code: "MISSING_CONTEXT_FIELD", source: { type: "flag", key: "c" } },
      ],
    });
  });

  it("propagates nested uncertain nonmatches through negation", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", negate(reference("b"))),
        flag("b", reference("c")),
        flag("c", invalidFilters[0].filter),
      ],
    });
    expect(evaluate.evaluateFlag(context, "a")).toMatchObject({
      value: false,
      errors: [
        { code: "MISSING_CONTEXT_FIELD", source: { type: "flag", key: "c" } },
      ],
    });
  });

  it.each(["and", "or"] as const)(
    "does not change authored %s error handling in a referenced flag",
    (operator) => {
      const evaluate = newEvaluator({
        flags: [
          flag("a", reference("b")),
          flag("b", group(operator, invalidFilters[0].filter, grant)),
        ],
      });
      expect(evaluate.evaluateFlag(context, "a").value).toBe(false);
    },
  );

  it("does not clear errors elsewhere in the containing rule", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", group("and", reference("b"), invalidFilters[1].filter)),
        flag("b", invalidFilters[0].filter, grant),
      ],
    });
    const result = evaluate.evaluateFlag(context, "a");
    expect(result.value).toBe(false);
    expect(result.errors.map(({ code }) => code)).toEqual([
      "MISSING_CONTEXT_FIELD",
      "UNSUPPORTED_ARRAY_OPERATOR",
    ]);
  });

  it.each([false, true])(
    "keeps invalid segments fail-closed, negated: %s",
    (negated) => {
      const filter = segment("s");
      const evaluate = newEvaluator({
        flags: [flag("a", negated ? negate(filter) : filter)],
        segments: [
          { key: "s", filter: group("or", invalidFilters[0].filter, grant) },
        ],
      });
      expect(evaluate.evaluateFlag(context, "a")).toMatchObject({
        value: false,
        errors: [
          {
            code: "MISSING_CONTEXT_FIELD",
            source: { type: "segment", key: "s" },
          },
        ],
      });
    },
  );

  it("preserves the original source through nested invalid segment references", () => {
    const evaluate = newEvaluator({
      flags: [flag("a", negate(segment("outer")))],
      segments: [
        { key: "outer", filter: segment("inner") },
        { key: "inner", filter: invalidFilters[0].filter },
      ],
    });
    expect(evaluate.evaluateFlag(context, "a")).toMatchObject({
      value: false,
      errors: [{ source: { type: "segment", key: "inner" } }],
    });
  });

  it("allows negation of a clean segment nonmatch", () => {
    const evaluate = newEvaluator({
      flags: [flag("a", negate(segment("s")))],
      segments: [{ key: "s", filter: no }],
    });
    expect(evaluate.evaluateFlag({}, "a")).toMatchObject({
      value: true,
      errors: [],
    });
  });

  it("allows a segment to reference a valid flag with nonfatal diagnostics", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", segment("s")),
        flag("b", invalidFilters[0].filter, grant),
      ],
      segments: [{ key: "s", filter: reference("b") }],
    });
    expect(evaluate.evaluateFlag(context, "a")).toMatchObject({
      value: true,
      errors: [
        { code: "MISSING_CONTEXT_FIELD", source: { type: "flag", key: "b" } },
      ],
    });
  });

  it("deduplicates repeated diagnostics but still invalidates every containing rule", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", negate(reference("b")), negate(reference("b"))),
        flag("b", invalidFilters[0].filter),
      ],
    });
    const result = evaluate.evaluateFlag(context, "a");
    expect(result.value).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.ruleResults.map(({ matched }) => matched)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("does not negate an unresolved dependency into a grant", () => {
    const b = { ...flag("b"), rules: [rule("invalid-result", yes, "unknown")] };
    const evaluate = newEvaluator({
      flags: [flag("a", negate(reference("b"))), b],
    });
    expect(evaluate.evaluateFlag({}, "a")).toMatchObject({
      value: false,
      errors: [
        { code: "INVALID_FLAG_DEFINITION", source: { type: "flag", key: "b" } },
      ],
    });
  });

  it.each([{}, { company: { id: ["acme"] } }])(
    "fails closed on invalid distribution context: %j",
    (requestContext) => {
      const b = flag("b");
      b.rules.unshift({
        id: "split",
        filter: yes,
        result: {
          type: "percentageDistribution",
          key: "b",
          attribute: "company.id",
          allocations: [
            {
              percentage: 100,
              destination: { type: "variant", variantKey: "on" },
            },
          ],
        },
      });
      const evaluate = newEvaluator({
        flags: [flag("a", negate(reference("b"))), b],
      });
      expect(evaluate.evaluateFlag(requestContext, "a").value).toBe(false);
      expect(evaluate.evaluateFlag(requestContext, "a").errors).toHaveLength(1);
    },
  );

  it("fails closed on invalid referenced percentage allocations", () => {
    const b = flag("b");
    b.rules.unshift({
      id: "split",
      filter: yes,
      result: {
        type: "percentageDistribution",
        key: "b",
        attribute: "company.id",
        allocations: [
          {
            percentage: 99,
            destination: { type: "variant", variantKey: "on" },
          },
        ],
      },
    });
    const evaluate = newEvaluator({
      flags: [flag("a", negate(reference("b"))), b],
    });
    expect(evaluate.evaluateFlag(context, "a")).toMatchObject({
      value: false,
      errors: [{ code: "INVALID_FLAG_DEFINITION" }],
    });
  });

  it("treats a missing default in a dependency as unresolved", () => {
    const evaluate = newEvaluator({
      flags: [flag("a", negate(reference("b"))), { ...flag("b"), rules: [] }],
    });
    expect(evaluate.evaluateFlag({}, "a").value).toBe(false);
    expect(evaluate.evaluateFlag({}, "a").errors).toMatchObject([
      { code: "INVALID_FLAG_DEFINITION", source: { type: "flag", key: "b" } },
    ]);
  });
});

describe("collection validation", () => {
  it("accepts an empty collection", () => {
    expect(() => newEvaluator({ flags: [] })).not.toThrow();
  });

  it("rejects duplicate flag and segment keys", () => {
    expect(() => newEvaluator({ flags: [flag("a"), flag("a")] })).toThrow(
      'Duplicate flag key "a"',
    );
    expect(() =>
      newEvaluator({
        flags: [],
        segments: [
          { key: "s", filter: yes },
          { key: "s", filter: no },
        ],
      }),
    ).toThrow('Duplicate segment key "s"');
  });

  it.each([
    reference("missing"),
    negate(reference("missing")),
    group("or", yes, reference("missing")),
  ])("rejects missing flag references even if unreachable: %j", (filter) => {
    expect(() => newEvaluator({ flags: [flag("a", filter)] })).toThrow(
      'Unknown flag reference "missing"',
    );
  });

  it("rejects missing segments, including in unused segments", () => {
    expect(() =>
      newEvaluator({ flags: [flag("a", segment("missing"))] }),
    ).toThrow('Unknown segment reference "missing"');
    expect(() =>
      newEvaluator({
        flags: [],
        segments: [{ key: "unused", filter: segment("missing") }],
      }),
    ).toThrow('Unknown segment reference "missing"');
  });

  it.each(["unknown", "constructor", "__proto__"])(
    "rejects unknown or inherited referenced variant %s",
    (variantKey) => {
      expect(() =>
        newEvaluator({
          flags: [flag("a", reference("b", variantKey)), flag("b")],
        }),
      ).toThrow(`Unknown variant "${variantKey}"`);
    },
  );

  it("rejects direct, indirect and negated flag cycles", () => {
    for (const filter of [reference("a"), negate(reference("a"))]) {
      expect(() => newEvaluator({ flags: [flag("a", filter)] })).toThrow(
        "Circular reference",
      );
    }
    expect(() =>
      newEvaluator({
        flags: [flag("a", reference("b")), flag("b", reference("a"))],
      }),
    ).toThrow("Circular reference");
  });

  it("rejects segment and mixed flag/segment cycles", () => {
    expect(() =>
      newEvaluator({
        flags: [],
        segments: [{ key: "s", filter: segment("s") }],
      }),
    ).toThrow("Circular reference");
    expect(() =>
      newEvaluator({
        flags: [],
        segments: [
          { key: "s", filter: segment("t") },
          { key: "t", filter: negate(segment("s")) },
        ],
      }),
    ).toThrow("Circular reference");
    expect(() =>
      newEvaluator({
        flags: [flag("a", segment("s"))],
        segments: [{ key: "s", filter: reference("a") }],
      }),
    ).toThrow("Circular reference");
  });

  it("allows shared acyclic dependencies without treating them as cycles", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", group("and", reference("b"), reference("c"))),
        flag("b", reference("d")),
        flag("c", reference("d")),
        flag("d", yes),
      ],
    });
    expect(evaluate.evaluateFlag({}, "a").value).toBe(true);
  });
});

describe("recursive evaluation without result caching", () => {
  it("evaluates repeated dependencies independently and never reuses results across contexts", () => {
    const evaluate = newEvaluator({
      flags: [
        flag("a", group("and", reference("b"), reference("b"))),
        flag("b", grant),
      ],
    });
    const lookups = vi.spyOn(Set.prototype, "has");
    try {
      expect(evaluate.evaluateFlag(context, "a").value).toBe(true);
      expect(
        lookups.mock.calls.filter(([value]) => value === "acme"),
      ).toHaveLength(2);
      expect(
        evaluate.evaluateFlag({ company: { id: "other" } }, "a").value,
      ).toBe(false);
      expect(evaluate.evaluateFlag(context, "a").value).toBe(true);
      expect(
        lookups.mock.calls.filter(([value]) => value === "acme"),
      ).toHaveLength(4);
    } finally {
      lookups.mockRestore();
    }
  });

  it("does not retain mutations to segment definitions or scalar comparison candidates", () => {
    const candidates = ["acme"];
    const predicate: RuleFilter = {
      type: "context",
      field: "company.id",
      operator: "IS",
      values: candidates,
    };
    const s: CompiledSegment = { key: "s", filter: predicate };
    const evaluate = newEvaluator({
      flags: [flag("a", segment("s"))],
      segments: [s],
    });
    candidates[0] = "other";
    s.filter = no;
    expect(evaluate.evaluateFlag(context, "a").value).toBe(true);
  });

  it("isolates diagnostics and definition snapshots between calls", () => {
    const b = flag("b", invalidFilters[0].filter, grant);
    const a = flag("a", reference("b"));
    const evaluate = newEvaluator({ flags: [a, b] });
    const first = evaluate.evaluateFlag(context, "a");
    expect(first.value).toBe(true);
    first.errors[0].source!.key = "modified";
    first.ruleResults.length = 0;
    (a.rules[0].filter as FlagReferenceFilter).key = "missing";
    (b.rules[1].filter as typeof grant).values![0] = "other";
    b.rules.length = 0;
    const second = evaluate.evaluateFlag(context, "a");
    expect(second).toMatchObject({
      value: true,
      errors: [{ source: { type: "flag", key: "b" } }],
    });
    expect(second.ruleResults).toHaveLength(1);
  });
});
