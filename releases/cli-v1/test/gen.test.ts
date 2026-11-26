import { describe, expect, it } from "vitest";

import type { Flag } from "../services/flags.js";
import { genTypes } from "../utils/gen.js";
import type { JSONPrimitive } from "../utils/json.js";

function flag(key: string, name: string, payload: JSONPrimitive): Flag {
  return {
    id: key,
    key,
    name,
    description: null,
    stage: null,
    remoteConfigs: [{ variants: [{ variant: { payload } }] }],
  };
}

describe("SDK v1 generation", () => {
  it("emits distinct payload aliases when flag names normalize the same way", () => {
    const output = genTypes([
      flag("first", "My Flag", 123),
      flag("second", "My-Flag", "text"),
      flag("third", "My flag", false),
    ]);

    expect(output).toContain(
      "first: { config: { payload: MyFlagConfigPayload } };",
    );
    expect(output).toContain(
      "second: { config: { payload: MyFlagConfigPayload_2 } };",
    );
    expect(output).toContain(
      "third: { config: { payload: MyFlagConfigPayload_3 } };",
    );
    expect(output).toContain("export type MyFlagConfigPayload = number");
    expect(output).toContain("export type MyFlagConfigPayload_2 = string");
    expect(output).toContain("export type MyFlagConfigPayload_3 = boolean");
  });

  it("emits valid alias names for digit-leading names and preserves valid Unicode names", () => {
    const output = genTypes([
      flag("numeric", "42", true),
      flag("unicode", "Éclair", true),
    ]);

    expect(output).toContain("payload: _42ConfigPayload");
    expect(output).toContain("export type _42ConfigPayload = boolean");
    expect(output).toContain("payload: ÉclairConfigPayload");
    expect(output).toContain("export type ÉclairConfigPayload = boolean");
  });
});
