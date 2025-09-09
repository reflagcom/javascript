import { randomUUID } from "crypto";
import { expect, Locator, Page, test } from "@playwright/test";

import { InitOptions } from "../../src/client";
import { DEFAULT_TRANSLATIONS } from "../../src/feedback/ui/config/defaultTranslations";
import { FeedbackTranslations } from "../../src/feedback/ui/types";
import { feedbackContainerId, propagatedEvents } from "../../src/ui/constants";

const KEY = randomUUID();
const API_HOST = `https://front.reflag.com`;

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 720;

declare global {
  interface Window {
    eventsFired: Record<string, boolean>;
  }
}

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

async function getOpenedWidgetContainer(
  page: Page,
  initOptions: Omit<InitOptions, "publishableKey"> = {},
) {
  await page.goto("http://localhost:8001/test/e2e/empty.html");

  // Mock API calls
  await page.route(`${API_HOST}/user`, async (route) => {
    await route.fulfill({ status: 200 });
  });

  await page.route(`${API_HOST}/features/evaluated*`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        features: {},
      }),
    });
  });

  // Golden path requests
  await page.evaluate(`
    ;(async () => {
      const { ReflagClient } = await import("/dist/reflag-browser-sdk.mjs");
      const reflag = new ReflagClient({publishableKey: "${KEY}", user: {id: "foo"}, company: {id: "bar"}, ...${JSON.stringify(initOptions ?? {})}});
      await reflag.initialize();
      await reflag.requestFeedback({
        flagKey: "flag1",
        title: "baz",
      });
    })()
  `);

  return page.locator(`#${feedbackContainerId}`);
}

async function getGiveFeedbackPageContainer(
  page: Page,
  initOptions: Omit<InitOptions, "publishableKey"> = {},
) {
  await page.goto("http://localhost:8001/test/e2e/give-feedback-button.html");

  // Mock API calls
  await page.route(`${API_HOST}/user`, async (route) => {
    await route.fulfill({ status: 200 });
  });

  await page.route(`${API_HOST}/features/evaluated*`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        features: {},
      }),
    });
  });

  // Golden path requests
  await page.evaluate(`
    ;(async () => {
      const { ReflagClient } = await import("/dist/reflag-browser-sdk.mjs");
      const reflag = new ReflagClient({publishableKey: "${KEY}", user: {id: "foo"}, company: {id: "bar"}, ...${JSON.stringify(initOptions ?? {})}});
      await reflag.initialize();
      console.log("setup clicky", document.querySelector("#give-feedback-button"))
      document.querySelector("#give-feedback-button")?.addEventListener("click", () => {
        console.log("cliked!");
        reflag.requestFeedback({
          flagKey: "flag1",
          title: "baz",
        });
      });
    })()
  `);

  return page.locator(`#${feedbackContainerId}`);
}

async function setScore(container: Locator, score: number) {
  await new Promise((resolve) => setTimeout(resolve, 50)); // allow react to update its state
  await container
    .locator(`#reflag-feedback-score-${score}`)
    .dispatchEvent("click");
}

async function setComment(container: Locator, comment: string) {
  await container.locator("#reflag-feedback-comment-label").fill(comment);
}

async function submitForm(container: Locator) {
  await container.locator(".form-expanded-content").getByRole("button").click();
}

test.beforeEach(async ({ page, browserName }) => {
  // Log any calls to front.reflag.com which aren't mocked by subsequent
  // `page.route` calls. With page.route, the last matching mock takes
  // precedence, so this logs any which may have been missed, and responds
  // with a 200 to prevent an internet request.
  await page.route(/^https:\/\/front\.reflag\.com.*/, async (route) => {
    const meta = `${route.request().method()} ${route.request().url()}`;

    console.debug(`\n Unmocked request:        [${browserName}] > ${meta}`);
    console.debug(`Sent stub mock response: [${browserName}] < ${meta} 200\n`);

    await route.fulfill({ status: 200, body: "{}" });
  });

  // Mock prompting-init as if prompting is `disabled` for all tests.
  await page.route(`${API_HOST}/feedback/prompting-init`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ success: false }),
    });
  });
});

test("Opens a feedback widget", async ({ page }) => {
  const container = await getOpenedWidgetContainer(page);

  await expect(container).toBeAttached();
  await expect(container.locator("dialog")).toHaveAttribute("open", "");
});

test("Opens a feedback widget multiple times in same session", async ({
  page,
}) => {
  const container = await getGiveFeedbackPageContainer(page);

  await page.getByTestId("give-feedback-button").click();
  await expect(container).toBeAttached();
  await expect(container.locator("dialog")).toHaveAttribute("open", "");

  await container.locator("dialog .close").click();
  await expect(container.locator("dialog")).not.toHaveAttribute("open", "");

  await page.getByTestId("give-feedback-button").click();
  await expect(container).toBeAttached();
  await expect(container.locator("dialog")).toHaveAttribute("open", "");
});

test("Opens a feedback widget in the bottom right by default", async ({
  page,
}) => {
  const container = await getOpenedWidgetContainer(page);

  await expect(container).toBeAttached();

  const bbox = await container.locator("dialog").boundingBox();
  expect(bbox?.x).toEqual(WINDOW_WIDTH - bbox!.width - 16);
  expect(bbox?.y).toBeGreaterThan(WINDOW_HEIGHT - bbox!.height - 30); // Account for browser differences
  expect(bbox?.y).toBeLessThan(WINDOW_HEIGHT - bbox!.height);
});

test("Opens a feedback widget in the correct position when overridden", async ({
  page,
}) => {
  const container = await getOpenedWidgetContainer(page, {
    feedback: {
      ui: {
        position: {
          type: "DIALOG",
          placement: "top-left",
        },
      },
    },
  });

  await expect(container).toBeAttached();

  const bbox = await container.locator("dialog").boundingBox();
  expect(bbox?.x).toEqual(16);
  expect(bbox?.y).toBeGreaterThan(0); // Account for browser differences
  expect(bbox?.y).toBeLessThanOrEqual(16);
});

test("Opens a feedback widget with the correct translations", async ({
  page,
}) => {
  const translations: Partial<FeedbackTranslations> = {
    ScoreStatusDescription: "Choisissez une note et laissez un commentaire",
    ScoreVeryDissatisfiedLabel: "Très insatisfait",
    ScoreDissatisfiedLabel: "Insatisfait",
    ScoreNeutralLabel: "Neutre",
    ScoreSatisfiedLabel: "Satisfait",
    ScoreVerySatisfiedLabel: "Très satisfait",
    SendButton: "Envoyer",
  };

  const container = await getOpenedWidgetContainer(page, {
    feedback: {
      ui: {
        translations,
      },
    },
  });

  await expect(container).toBeAttached();
  await expect(container).toContainText(translations.ScoreStatusDescription!);
  await expect(container).toContainText(
    translations.ScoreVeryDissatisfiedLabel!,
  );
  await expect(container).toContainText(translations.ScoreDissatisfiedLabel!);
  await expect(container).toContainText(translations.ScoreNeutralLabel!);
  await expect(container).toContainText(translations.ScoreSatisfiedLabel!);
  await expect(container).toContainText(translations.ScoreVerySatisfiedLabel!);
  await expect(container).toContainText(translations.SendButton!);
});

test("Sends a request when choosing a score immediately", async ({ page }) => {
  const expectedScore = pick([1, 2, 3, 4, 5]);
  let sentJSON: object | null = null;

  await page.route(`${API_HOST}/feedback`, async (route) => {
    sentJSON = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ feedbackId: "123" }),
      contentType: "application/json",
    });
  });

  const container = await getOpenedWidgetContainer(page);
  await setScore(container, expectedScore);

  await expect
    .poll(() => sentJSON)
    .toEqual({
      companyId: "bar",
      key: "flag1",
      score: expectedScore,
      question: "baz",
      userId: "foo",
      source: "widget",
    });
});

test("Shows a success message after submitting a score", async ({ page }) => {
  await page.route(`${API_HOST}/feedback`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ feedbackId: "123" }),
      contentType: "application/json",
    });
  });

  const container = await getOpenedWidgetContainer(page);

  await expect(
    container.getByText(DEFAULT_TRANSLATIONS.ScoreStatusDescription),
  ).toHaveCSS("opacity", "1");
  await expect(
    container.getByText(DEFAULT_TRANSLATIONS.ScoreStatusReceived),
  ).toHaveCSS("opacity", "0");

  await setScore(container, 3);

  await expect(
    container.getByText(DEFAULT_TRANSLATIONS.ScoreStatusDescription),
  ).toHaveCSS("opacity", "0");
  await expect(
    container.getByText(DEFAULT_TRANSLATIONS.ScoreStatusReceived),
  ).toHaveCSS("opacity", "1");
});

test("Updates the score on every change", async ({ page }) => {
  let lastSentJSON: object | null = null;

  await page.route(`${API_HOST}/feedback`, async (route) => {
    lastSentJSON = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ feedbackId: "123" }),
      contentType: "application/json",
    });
  });

  const container = await getOpenedWidgetContainer(page);

  await setScore(container, 1);
  await setScore(container, 5);
  await setScore(container, 3);

  await expect
    .poll(() => lastSentJSON)
    .toEqual({
      feedbackId: "123",
      companyId: "bar",
      key: "flag1",
      question: "baz",
      score: 3,
      userId: "foo",
      source: "widget",
    });
});

test("Shows the comment field after submitting a score", async ({ page }) => {
  await page.route(`${API_HOST}/feedback`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ feedbackId: "123" }),
      contentType: "application/json",
    });
  });

  const container = await getOpenedWidgetContainer(page);

  await expect(container.locator(".form-expanded-content")).toHaveCSS(
    "opacity",
    "0",
  );

  await setScore(container, 1);

  await expect(container.locator(".form-expanded-content")).toHaveCSS(
    "opacity",
    "1",
  );
});

test("Sends a request with both the score and comment when submitting", async ({
  page,
}) => {
  const expectedComment = `This is my comment: ${Math.random()}`;
  const expectedScore = pick([1, 2, 3, 4, 5]);

  let sentJSON: object | null = null;

  await page.route(`${API_HOST}/feedback`, async (route) => {
    sentJSON = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ feedbackId: "123" }),
      contentType: "application/json",
    });
  });

  const container = await getOpenedWidgetContainer(page);

  await setScore(container, expectedScore);
  await setComment(container, expectedComment);
  await submitForm(container);

  expect(sentJSON).toEqual({
    comment: expectedComment,
    score: expectedScore,
    companyId: "bar",
    question: "baz",
    key: "flag1",
    feedbackId: "123",
    userId: "foo",
    source: "widget",
  });
});

test("Shows a success message after submitting", async ({ page }) => {
  await page.route(`${API_HOST}/feedback`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ feedbackId: "123" }),
      contentType: "application/json",
    });
  });

  const container = await getOpenedWidgetContainer(page);

  await setScore(container, 3);
  await setComment(container, "Test comment!");
  await submitForm(container);

  await expect(
    container.getByText(DEFAULT_TRANSLATIONS.SuccessMessage),
  ).toBeVisible();
});

test("Closes the dialog shortly after submitting", async ({ page }) => {
  await page.route(`${API_HOST}/feedback`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ feedbackId: "123" }),
      contentType: "application/json",
    });
  });

  const container = await getOpenedWidgetContainer(page);

  await setScore(container, 3);
  await setComment(container, "Test comment!");
  await submitForm(container);

  await expect(container.locator("dialog")).not.toHaveAttribute("open", "");
});

test("Blocks event propagation to the containing document", async ({
  page,
}) => {
  const container = await getOpenedWidgetContainer(page);
  const textarea = container.locator('textarea[name="comment"]');

  await page.evaluate(
    ({ trackedEvents }) => {
      window.eventsFired = {};

      for (const event of trackedEvents) {
        document.addEventListener(event, () => {
          window.eventsFired[event] = true;
        });
      }
    },
    { trackedEvents: propagatedEvents },
  );

  await textarea.focus();
  // Fires 'keydown', 'keyup' and 'keypress' events
  await page.keyboard.type("Hello World");

  const firedEvents = await page.evaluate(() => {
    return window.eventsFired;
  });

  // No events are allowed to fire, object should be empty
  expect(firedEvents).toEqual({});
});
