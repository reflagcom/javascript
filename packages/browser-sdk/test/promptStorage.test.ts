import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import {
  checkPromptMessageCompleted,
  forgetAuthToken,
  getAuthToken,
  markPromptMessageCompleted,
  rememberAuthToken,
} from "../src/feedback/promptStorage";

describe("prompt-storage", () => {
  beforeAll(() => {
    const cookies: Record<string, string> = {};

    Object.defineProperty(document, "cookie", {
      set: (val: string) => {
        if (!val) {
          Object.keys(cookies).forEach((k) => delete cookies[k]);
          return;
        }
        const i = val.indexOf("=");
        cookies[val.slice(0, i)] = val.slice(i + 1);
      },
      get: () =>
        Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
    });

    vi.setSystemTime(new Date("2024-01-11T09:55:37.000Z"));
  });

  afterEach(() => {
    document.cookie = undefined!;
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  describe("markPromptMessageCompleted", () => {
    test("adds new cookie", async () => {
      markPromptMessageCompleted(
        "user",
        "prompt2",
        new Date("2024-01-04T14:01:20.000Z"),
      );

      expect(document.cookie).toBe(
        "reflag-prompt-user=prompt2; path=/; expires=Thu, 04 Jan 2024 14:01:20 GMT; sameSite=strict; secure",
      );
    });

    test("rewrites existing cookie", async () => {
      document.cookie =
        "reflag-prompt-user=prompt1; path=/; expires=Thu, 04 Jan 2021 14:01:20 GMT; sameSite=strict; secure";

      markPromptMessageCompleted(
        "user",
        "prompt2",
        new Date("2024-01-04T14:01:20.000Z"),
      );

      expect(document.cookie).toBe(
        "reflag-prompt-user=prompt2; path=/; expires=Thu, 04 Jan 2024 14:01:20 GMT; sameSite=strict; secure",
      );
    });
  });

  describe("checkPromptMessageCompleted", () => {
    test("cookie with same use and prompt results in true", async () => {
      document.cookie =
        "reflag-prompt-user=prompt; path=/; expires=Thu, 04 Jan 2024 14:01:20 GMT; sameSite=strict; secure";

      expect(checkPromptMessageCompleted("user", "prompt")).toBe(true);

      expect(document.cookie).toBe(
        "reflag-prompt-user=prompt; path=/; expires=Thu, 04 Jan 2024 14:01:20 GMT; sameSite=strict; secure",
      );
    });

    test("cookie with different prompt results in false", async () => {
      document.cookie =
        "reflag-prompt-user=prompt1; path=/; expires=Thu, 04 Jan 2024 14:01:20 GMT; sameSite=strict; secure";

      expect(checkPromptMessageCompleted("user", "prompt2")).toBe(false);
    });

    test("cookie with different user results in false", async () => {
      document.cookie =
        "reflag-prompt-user1=prompt1; path=/; expires=Thu, 04 Jan 2024 14:01:20 GMT; sameSite=strict; secure";

      expect(checkPromptMessageCompleted("user2", "prompt1")).toBe(false);
    });

    test("no cookie results in false", async () => {
      expect(checkPromptMessageCompleted("user", "prompt2")).toBe(false);
    });
  });

  describe("rememberAuthToken", () => {
    test("adds new cookie if none was there", async () => {
      expect(document.cookie).toBe("");

      rememberAuthToken(
        'user1"%%',
        "channel:suffix",
        "secret$%",
        new Date("2024-01-02T15:02:20.000Z"),
      );

      expect(document.cookie).toBe(
        "reflag-token-user1%22%25%25={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure",
      );
    });

    test("replaces existing cookie for same user", async () => {
      document.cookie =
        "reflag-token-user1%22%25%25={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure";

      rememberAuthToken(
        'user1"%%',
        "channel2:suffix2",
        "secret2$%",
        new Date("2023-01-02T15:02:20.000Z"),
      );

      expect(document.cookie).toBe(
        "reflag-token-user1%22%25%25={%22channel%22:%22channel2:suffix2%22%2C%22token%22:%22secret2$%25%22}; path=/; expires=Mon, 02 Jan 2023 15:02:20 GMT; sameSite=strict; secure",
      );
    });
  });

  describe("forgetAuthToken", () => {
    test("clears the user's cookie if even if there was nothing before", async () => {
      forgetAuthToken("user");

      expect(document.cookie).toBe(
        "reflag-token-user=; path=/; expires=Wed, 10 Jan 2024 09:55:37 GMT",
      );
    });

    test("clears the user's cookie", async () => {
      document.cookie =
        "reflag-token-user1={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure";

      forgetAuthToken("user1");

      expect(document.cookie).toBe(
        "reflag-token-user1=; path=/; expires=Wed, 10 Jan 2024 09:55:37 GMT",
      );
    });

    test("does nothing if there is a cookie for a different user", async () => {
      document.cookie =
        "reflag-token-user1={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2028 15:02:20 GMT; sameSite=strict; secure";

      forgetAuthToken("user2");

      expect(document.cookie).toBe(
        "reflag-token-user1={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2028 15:02:20 GMT; sameSite=strict; secure; reflag-token-user2=; path=/; expires=Wed, 10 Jan 2024 09:55:37 GMT",
      );
    });
  });

  describe("getAuthToken", () => {
    test("returns the auth token if it's available for the user", async () => {
      document.cookie =
        "reflag-token-user1%22%25%25={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure";

      expect(getAuthToken('user1"%%')).toStrictEqual({
        channel: "channel:suffix",
        token: "secret$%",
      });
    });

    test("return undefined if no cookie for user", async () => {
      document.cookie =
        "reflag-token-user1={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure";

      expect(getAuthToken("user2")).toBeUndefined();
    });

    test("returns undefined if no cookie", async () => {
      expect(getAuthToken("user")).toBeUndefined();
    });

    test("return undefined if corrupted cookie", async () => {
      document.cookie =
        "reflag-token-user={channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure";

      expect(getAuthToken("user")).toBeUndefined();
    });

    test("return undefined if a field is missing", async () => {
      document.cookie =
        "reflag-token-user={%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure";

      expect(getAuthToken("user")).toBeUndefined();
    });
  });

  test("manages all cookies for the user", () => {
    rememberAuthToken(
      "user1",
      "channel:suffix",
      "secret$%",
      new Date("2024-01-02T15:02:20.000Z"),
    );

    markPromptMessageCompleted(
      "user1",
      "alex-prompt",
      new Date("2024-01-02T15:03:20.000Z"),
    );

    expect(document.cookie).toBe(
      "reflag-token-user1={%22channel%22:%22channel:suffix%22%2C%22token%22:%22secret$%25%22}; path=/; expires=Tue, 02 Jan 2024 15:02:20 GMT; sameSite=strict; secure; reflag-prompt-user1=alex-prompt; path=/; expires=Tue, 02 Jan 2024 15:03:20 GMT; sameSite=strict; secure",
    );

    forgetAuthToken("user1");

    expect(document.cookie).toBe(
      "reflag-token-user1=; path=/; expires=Wed, 10 Jan 2024 09:55:37 GMT; reflag-prompt-user1=alex-prompt; path=/; expires=Tue, 02 Jan 2024 15:03:20 GMT; sameSite=strict; secure",
    );
  });
});
