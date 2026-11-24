import { describe, expect, it } from "vitest";

import { getCopilotInstructions, getCursorRules } from "../services/rules.js";
import { flagUrl } from "../utils/urls.js";

describe("v2 workflow helpers", () => {
  it("ships matching direct-value guidance for supported coding-agent formats", () => {
    const rules = getCopilotInstructions();
    expect(getCursorRules()).toContain(rules);
    expect(rules).toContain(
      'useFlag("huddle-settings", { tokens: 128, model: "quick" })',
    );
    expect(rules).toContain('client.getFlag(context, "huddles")');
    expect(rules).toContain("reflag flags types");
    expect(rules).toContain("not nested schema validation");
    expect(rules).not.toMatch(
      /client\.(isEnabled|getConfig|setContext|trackEvent)\(/,
    );
  });

  it("links by escaped flag key rather than confusing Flag and legacy Feature IDs", () => {
    const key = 'some/key " with spaces';
    expect(
      flagUrl(
        "https://example.invalid",
        { id: "env-id", name: "Production" },
        { key },
      ),
    ).toBe(
      `https://example.invalid/envs/production-env-id/flags/by-key/${encodeURIComponent(key)}`,
    );
  });
});
