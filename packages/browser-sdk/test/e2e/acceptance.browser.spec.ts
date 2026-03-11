import { randomUUID } from "crypto";
import { expect, test } from "@playwright/test";

import { API_BASE_URL } from "../../src/config";

const KEY = randomUUID();

test("Acceptance", async ({ page }) => {
  await page.goto("http://localhost:8001/test/e2e/empty.html");

  const successfulRequests: string[] = [];
  const bulkEvents: Record<string, any>[] = [];

  // Mock API calls with assertions
  await page.route(`${API_BASE_URL}/features/evaluated*`, async (route) => {
    successfulRequests.push("FLAGS");
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        features: {},
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

  await expect.poll(() => bulkEvents.length).toBeGreaterThanOrEqual(2);
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

test("does not log startup fetch aborts as errors during fast full navigation", async ({
  page,
}) => {
  await page.goto("http://localhost:8001/test/e2e/empty.html");

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.route(`${API_BASE_URL}/features/evaluated*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    try {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          features: {},
        }),
      });
    } catch {
      // The original document may have been torn down before the response.
    }
  });

  await page.route(`${API_BASE_URL}/feedback/prompting-init`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    try {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: false }),
      });
    } catch {
      // The original document may have been torn down before the response.
    }
  });

  await page.route(`${API_BASE_URL}/bulk`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    try {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      });
    } catch {
      // The original document may have been torn down before the response.
    }
  });

  await page.evaluate(`
    ;(async () => {
      const { ReflagClient } = await import("/dist/reflag-browser-sdk.mjs");
      const reflagClient = new ReflagClient({
        publishableKey: "${KEY}",
        user: { id: "foo" },
        company: { id: "bar" },
      });
      void reflagClient.initialize();
    })()
  `);

  await page.goto("http://localhost:8001/test/e2e/give-feedback-button.html");
  await page.waitForTimeout(250);

  expect(consoleErrors).not.toContainEqual(
    expect.stringContaining("error fetching flags"),
  );
  expect(consoleErrors).not.toContainEqual(
    expect.stringContaining("error initializing automatic feedback"),
  );
  expect(consoleErrors).not.toContainEqual(
    expect.stringContaining("bulk delivery degraded"),
  );
});
