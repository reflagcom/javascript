import type {
  FlagCollection,
  FlagDefinition,
  FlagValue,
  FlagsAPIResponse,
} from "../src";

export function definition(
  key: string,
  value: FlagValue,
  variantKey = "default",
): FlagDefinition {
  return {
    key,
    sourceVersionId: `version:${key}`,
    variants: { [variantKey]: value },
    rules: [
      {
        id: `default:${key}`,
        filter: { type: "constant", value: true },
        result: { type: "variant", variantKey },
      },
    ],
  };
}
export function snapshot(
  flags: FlagDefinition[] = [],
  segments: FlagCollection["segments"] = [],
  flagStateVersion = 1,
): FlagsAPIResponse {
  return { protocolVersion: 2, flagStateVersion, flags, segments };
}
export function graph(): FlagsAPIResponse {
  const model = definition("model", "quick", "quick");
  model.variants.quality = "quality";
  model.rules.unshift({
    id: "enterprise",
    filter: { type: "segment", key: "enterprise" },
    result: { type: "variant", variantKey: "quality" },
  });
  const dependent = definition("dependent", false, "false");
  dependent.variants.true = true;
  dependent.rules.unshift({
    id: "quality-model",
    filter: { type: "flag", key: "model", variantKey: "quality" },
    result: { type: "variant", variantKey: "true" },
  });
  return snapshot(
    [model, dependent],
    [
      {
        key: "enterprise",
        filter: {
          type: "context",
          field: "company.plan",
          operator: "IS",
          values: ["enterprise"],
        },
      },
    ],
  );
}
