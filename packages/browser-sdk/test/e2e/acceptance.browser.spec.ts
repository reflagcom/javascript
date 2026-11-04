import { randomUUID } from "crypto";

import { expect, test } from "@playwright/test";

import { API_BASE_URL } from "../../src/config";

const KEY = randomUUID();

test("Acceptance", async ({ page }) => {
  await page.goto("http://localhost:8001/test/e2e/empty.html");

  const successfulRequests: string[] = [];
  const bulkEvents: Record<string, any>[] = [];

  // Mock API calls with assertions
  await page.route(`${API_BASE_URL}/flags/evaluated*`, async (route) => {
    successfulRequests.push("FLAGS");
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        protocolVersion: 2,
        flagStateVersion: 42,
        remoteContextUsed: false,
        flags: {
          release: {
            value: true,
            variantKey: "true",
            sourceVersionId: "version-1",
            matchedRuleId: "default",
            ruleResults: [],
            errors: [],
          },
          settings: {
            value: { model: "quality" },
            variantKey: "quality",
            sourceVersionId: "version-2",
            matchedRuleId: "default",
            ruleResults: [],
            errors: [],
          },
          falsy: {
            value: false,
            variantKey: "false",
            sourceVersionId: "version-3",
            matchedRuleId: "default",
            ruleResults: [],
            errors: [],
          },
        },
      }),
    });
  });

  await page.route(`${API_BASE_URL}/bulk`, async (route) => {
    expect(route.request().method()).toEqual("POST");
    const payload = route.request().postDataJSON();
    expect(Array.isArray(payload)).toBe(true);

    bulkEvents.push(...payload);

    successfulRequests.push("BULK");
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(`${API_BASE_URL}/event`, async (route) => {
    expect(route.request().method()).toEqual("POST");
    expect(route.request().postDataJSON()).toMatchObject({
      userId: "foo",
      companyId: "bar",
      event: "baz",
      attributes: { baz: true },
    });

    successfulRequests.push("EVENT");
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(`${API_BASE_URL}/feedback`, async (route) => {
    expect(route.request().method()).toEqual("POST");
    expect(route.request().postDataJSON()).toMatchObject({
      userId: "foo",
      companyId: "bar",
      featureId: "featureId1",
      score: 5,
      comment: "test!",
      question: "actual question",
      promptedQuestion: "prompted question",
    });

    successfulRequests.push("FEEDBACK");
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true }),
    });
  });

  // Golden path requests
  await page.evaluate(`
    ;(async () => {
    const { ReflagClient } = await import("/dist/reflag-browser-sdk.mjs");
      const reflagClient = new ReflagClient({
        publishableKey: "${KEY}",
        user: {
          id: "foo",
          name: "john doe",
        },
        company: {
          id: "bar",
          name: "bar corp",
        }
      });
      await reflagClient.initialize();
      if (reflagClient.getFlag("release") !== true) throw new Error("Boolean read failed");
      if (reflagClient.getFlag("settings", { model: "default" }).model !== "quality") throw new Error("JSON read failed");
      if (reflagClient.getFlag("falsy", null) !== false) throw new Error("Falsy read failed");
      reflagClient.getFlagResults();
      reflagClient.getFlagsForBootstrap();
      await reflagClient.track("baz", { baz: true }, "foo", "bar");
      await reflagClient.feedback({
        featureId: "featureId1",
        score: 5,
        comment: "test!",
        question: "actual question",
        promptedQuestion: "prompted question",
      });
    })()
  `);

  await expect.poll(() => bulkEvents.length).toBeGreaterThanOrEqual(5);
  const checks = bulkEvents.filter(
    (event) => event.type === "feature-flag-event",
  );
  expect(checks).toHaveLength(3);
  expect(
    checks.map(({ key, evalResult, sourceVersionId, flagStateVersion }) => ({
      key,
      evalResult,
      sourceVersionId,
      flagStateVersion,
    })),
  ).toEqual([
    {
      key: "release",
      evalResult: "true",
      sourceVersionId: "version-1",
      flagStateVersion: 42,
    },
    {
      key: "settings",
      evalResult: "quality",
      sourceVersionId: "version-2",
      flagStateVersion: 42,
    },
    {
      key: "falsy",
      evalResult: "false",
      sourceVersionId: "version-3",
      flagStateVersion: 42,
    },
  ]);
  expect(bulkEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "user",
        userId: "foo",
        attributes: { name: "john doe" },
      }),
      expect.objectContaining({
        type: "company",
        userId: "foo",
        companyId: "bar",
        attributes: { name: "bar corp" },
      }),
    ]),
  );

  expect(successfulRequests).toContain("FLAGS");
  expect(successfulRequests).toContain("BULK");
  expect(successfulRequests).toContain("EVENT");
  expect(successfulRequests).toContain("FEEDBACK");
});
