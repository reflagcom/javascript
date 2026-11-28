import { createServer, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

import { expect, test as base } from "@playwright/test";

import { ReflagClient } from "../../src/client";

type SSEFixture = {
  url: string;
  requests: number;
  respond: (response: ServerResponse, attempt: number) => void;
};

declare global {
  interface Window {
    sseTestClient: ReflagClient;
    sseTestEvents: { type: string; readyState: number }[];
  }
}

const test = base.extend<{ sseServer: SSEFixture }>({
  sseServer: async ({ page }, use) => {
    const fixture: SSEFixture = {
      url: "",
      requests: 0,
      respond: (response) => response.end(),
    };
    const server = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      if (request.url?.startsWith("/sse/client?")) {
        fixture.requests++;
        fixture.respond(response, fixture.requests);
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({ success: true, features: {}, flagStateVersion: 1 }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    fixture.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      await use(fixture);
    } finally {
      await page.goto("about:blank");
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  },
});

test.beforeEach(async ({ page, sseServer }) => {
  // Advance SDK timers without waiting 30 seconds per retry. Native
  // EventSource networking and its retry delay still use the real browser.
  await page.clock.install();
  await page.goto("http://localhost:8001/test/e2e/empty.html");
  await page.evaluate(async (apiBaseUrl) => {
    window.sseTestEvents = [];
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        for (const type of ["open", "error"]) {
          this.addEventListener(type, () => {
            window.sseTestEvents.push({ type, readyState: this.readyState });
          });
        }
      }
    };

    const modulePath = "/dist/reflag-browser-sdk.mjs";
    const { ReflagClient } = await import(modulePath);
    window.sseTestClient = new ReflagClient({
      publishableKey: "pub_sse_regression_test",
      apiBaseUrl,
      enableTracking: false,
      enableLiveFlagUpdates: true,
      feedback: { enableAutoFeedback: false },
      toolbar: false,
    });
  }, sseServer.url);
});

test("does not retry an HTTP 403, but permits explicit reinitialization", async ({
  page,
  sseServer,
}) => {
  sseServer.respond = (response) => {
    response.writeHead(403);
    response.end("invalid publishableKey");
  };
  await page.evaluate(() => window.sseTestClient.initialize());
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sseTestEvents.some(
          (event) => event.type === "error" && event.readyState === 2,
        ),
      ),
    )
    .toBe(true);

  await page.clock.runFor(90_000);
  await page.waitForTimeout(300);
  expect(sseServer.requests).toBe(1);

  sseServer.respond = (response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(": connected\n\n");
  };
  await page.evaluate(async () => {
    await window.sseTestClient.stop();
    await window.sseTestClient.initialize();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sseTestEvents.some((event) => event.type === "open"),
      ),
    )
    .toBe(true);
  expect(sseServer.requests).toBe(2);
  await page.evaluate(() => window.sseTestClient.stop());
});

test("uses native reconnection after a stream ends, and stop cancels it", async ({
  page,
  sseServer,
}) => {
  sseServer.respond = (response, attempt) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write("retry: 100\n\n");
    if (attempt === 1) response.end();
  };
  await page.evaluate(() => window.sseTestClient.initialize());
  await expect.poll(() => sseServer.requests).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.sseTestEvents.filter((event) => event.type === "open").length,
      ),
    )
    .toBe(2);

  await page.evaluate(() => window.sseTestClient.stop());
  await page.clock.runFor(90_000);
  await page.waitForTimeout(300);
  expect(sseServer.requests).toBe(2);
});

test("stops after a formerly healthy stream reconnects with HTTP 403", async ({
  page,
  sseServer,
}) => {
  sseServer.respond = (response, attempt) => {
    if (attempt > 1) {
      response.writeHead(403);
      response.end("invalid publishableKey");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end("retry: 100\n\n");
  };
  await page.evaluate(() => window.sseTestClient.initialize());
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sseTestEvents.some(
          (event) => event.type === "error" && event.readyState === 2,
        ),
      ),
    )
    .toBe(true);

  await page.clock.runFor(90_000);
  await page.waitForTimeout(300);
  expect(sseServer.requests).toBe(2);
  await page.evaluate(() => window.sseTestClient.stop());
});
