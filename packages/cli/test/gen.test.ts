import ts from "typescript";
import { describe, expect, it } from "vitest";

import { genTypes, type FlagForTypes } from "../utils/gen.js";
import type { JSONValue } from "../utils/json.js";

function flag(key: string, values?: JSONValue[]): FlagForTypes {
  return values === undefined
    ? { key, flagType: "boolean" }
    : { key, flagType: "multivariate", values };
}
function properties(source: string) {
  const diagnostics =
    ts.transpileModule(source, {
      fileName: "generated.ts",
      reportDiagnostics: true,
    }).diagnostics ?? [];
  expect(diagnostics).toEqual([]);
  const file = ts.createSourceFile(
    "generated.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const module = file.statements.find(ts.isModuleDeclaration)!;
  if (!module.body || !ts.isModuleBlock(module.body))
    throw new Error("Expected an SDK module augmentation");
  const flags = module.body.statements.find(ts.isInterfaceDeclaration)!;
  return new Map(
    flags.members
      .filter(ts.isPropertySignature)
      .map((property) => [
        ts.isStringLiteral(property.name)
          ? property.name.text
          : property.name.getText(file),
        property.type!.getText(file),
      ]),
  );
}

describe("SDK v2 generation", () => {
  it.each(["node", "react", "vue"] as const)(
    "emits direct-value %s declarations",
    (format) => {
      const output = genTypes(
        [
          flag("enabled"),
          flag("settings", [
            { model: "quick", prompt: { tone: "concise" }, maxTokens: 0 },
            { model: "quality", prompt: { tone: "detailed" }, maxTokens: 2048 },
          ]),
          flag("label", ["", "Express"]),
          flag("days", [0, 3]),
          flag("methods", [[], ["standard"]]),
          flag("nullable", [null, { label: "Ready" }]),
          flag("false-value", [false]),
        ],
        format,
      );
      expect(output).toContain(`declare module "@reflag/${format}-sdk"`);
      const types = properties(output);
      expect(types.get("enabled")).toBe("boolean");
      expect(types.get("settings")).toContain("model: string");
      expect(types.get("settings")).toContain("maxTokens: number");
      expect(types.get("settings")).not.toContain("config:");
      expect(types.get("label")).toBe("string");
      expect(types.get("days")).toBe("number");
      expect(types.get("methods")).toBe("(string)[]");
      expect(types.get("nullable")).toContain("null");
      expect(types.get("nullable")).toContain("label: string");
      expect(types.get("false-value")).toBe("boolean");
      expect(output).not.toContain("ConfigPayload");
    },
  );

  it("uses SDK JSON values rather than any or Boolean for unknown multivariate shapes", () => {
    const types = properties(
      genTypes([flag("draft", []), flag("array", [[]]), flag("object", [{}])]),
    );
    expect(types.get("draft")).toBe('import("@reflag/react-sdk").FlagValue');
    expect(types.get("array")).toBe(
      '(import("@reflag/react-sdk").FlagValue)[]',
    );
    expect(types.get("object")).toBe(
      'Record<string, import("@reflag/react-sdk").FlagValue>',
    );
  });

  it("escapes arbitrary property names and preserves ordinary config/payload data", () => {
    const key = 'quotes"\\line\n';
    const types = properties(
      genTypes([
        flag(key, [{ [key]: 3, config: { payload: "ordinary data" } }]),
      ]),
    );
    expect(types.has(key)).toBe(true);
    expect(types.get(key)).toContain("config: {");
    expect(types.get(key)).toContain("payload: string");
    expect(types.get(key)).toContain(`${JSON.stringify(key)}: number`);
  });

  it("rejects duplicate flag keys", () => {
    expect(() => genTypes([flag("same"), flag("same", [3])])).toThrow(
      "Duplicate flag key",
    );
  });
});
