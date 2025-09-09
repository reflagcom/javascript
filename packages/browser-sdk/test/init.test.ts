import { DefaultBodyType, http, StrictRequest } from "msw";
import { beforeEach, describe, expect, test, vi, vitest } from "vitest";

import { ReflagClient } from "../src";
import { HttpClient } from "../src/httpClient";

import { getFlags } from "./mocks/handlers";
import { server } from "./mocks/server";

const KEY = "123";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("init", () => {
  test("will accept setup with key and debug logger", async () => {
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: 42 },
      company: { id: 42 },
      logger,
    });
    const spyInit = vi.spyOn(reflagInstance, "initialize");

    await reflagInstance.initialize();
    expect(spyInit).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });

  test("will accept setup with custom host", async () => {
    let usedSpecialHost = false;

    server.use(
      http.get(
        "https://example.com/features/evaluated",
        ({ request }: { request: StrictRequest<DefaultBodyType> }) => {
          usedSpecialHost = true;
          return getFlags({ request });
        },
      ),
    );
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      apiBaseUrl: "https://example.com",
    });
    await reflagInstance.initialize();

    expect(usedSpecialHost).toBe(true);
  });

  test("automatically does user/company tracking", async () => {
    const user = vitest.spyOn(ReflagClient.prototype as any, "user");
    const company = vitest.spyOn(ReflagClient.prototype as any, "company");

    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      company: { id: "bar" },
    });
    await reflagInstance.initialize();

    expect(user).toHaveBeenCalled();
    expect(company).toHaveBeenCalled();
  });

  test("can disable tracking and auto. feedback surveys", async () => {
    const post = vitest.spyOn(HttpClient.prototype as any, "post");

    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      apiBaseUrl: "https://example.com",
      enableTracking: false,
      feedback: {
        enableAutoFeedback: false,
      },
    });
    await reflagInstance.initialize();
    await reflagInstance.track("test");

    expect(post).not.toHaveBeenCalled();
  });

  test("passes credentials correctly to httpClient", async () => {
    const credentials = "include";
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      credentials,
    });

    await reflagInstance.initialize();

    expect(reflagInstance["httpClient"]["fetchOptions"].credentials).toBe(
      credentials,
    );
  });
});
