import { http, HttpResponse } from "msw";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from "vitest";

import { ReflagClient } from "../src";
import { API_BASE_URL } from "../src/config";
import { FeedbackPromptHandler } from "../src/feedback/feedback";
import {
  checkPromptMessageCompleted,
  getAuthToken,
  markPromptMessageCompleted,
} from "../src/feedback/promptStorage";
import { FlagsClient } from "../src/flag/flags";
import { HttpClient } from "../src/httpClient";
import {
  AblySSEChannel,
  closeAblySSEChannel,
  openAblySSEChannel,
} from "../src/sse";

import { flagsResult } from "./mocks/handlers";
import { server } from "./mocks/server";

const KEY = "123";

vi.mock("../src/sse");
vi.mock("../src/feedback/promptStorage", () => {
  return {
    markPromptMessageCompleted: vi.fn(),
    checkPromptMessageCompleted: vi.fn(),
    rememberAuthToken: vi.fn(),
    getAuthToken: vi.fn(),
  };
});

// Treat test environment as desktop
window.innerWidth = 1024;

afterEach(() => {
  server.resetHandlers();
});

describe("usage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("golden path - register `user`, `company`, send `event`, send `feedback`, get `flags`", async () => {
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo " },
      company: { id: "bar", name: "bar corp" },
    });
    await reflagInstance.initialize();

    await reflagInstance.track("baz", { baz: true });

    await reflagInstance.feedback({
      flagKey: "huddles",
      score: 5,
      comment: "Sunt bine!",
      question: "Cum esti?",
      promptedQuestion: "How are you?",
    });

    const flags = reflagInstance.getFlags();
    expect(flags).toEqual(flagsResult);

    const flag = reflagInstance.getFlag("flag-1");
    expect(flag).toStrictEqual({
      isEnabled: false,
      track: expect.any(Function),
      requestFeedback: expect.any(Function),
      config: { key: undefined, payload: undefined },
      isEnabledOverride: null,
      setIsEnabledOverride: expect.any(Function),
    });
  });

  test("accepts `flagKey` instead of `featureId` for manual feedback", async () => {
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      company: { id: "bar" },
    });

    await reflagInstance.initialize();

    await reflagInstance.feedback({
      flagKey: "flag-key",
      score: 5,
      question: "What's up?",
      promptedQuestion: "How are you?",
    });
  });
});

// TODO:
// Since we now have AutoFeedback as it's own class, we should rewrite these tests
// to test that class instead of the ReflagClient class.
// Same for feedback state management below

describe("feedback prompting", () => {
  const closeChannel = vi.fn();
  beforeAll(() => {
    vi.mocked(openAblySSEChannel).mockReturnValue({
      close: closeChannel,
    } as unknown as AblySSEChannel);
    vi.mocked(closeAblySSEChannel).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthToken).mockReturnValue(undefined);
  });

  test("initiates and stops feedback prompting", async () => {
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
    });
    await reflagInstance.initialize();

    expect(openAblySSEChannel).toBeCalledTimes(1);

    // call twice, expect only one reset to go through
    await reflagInstance.stop();
    await reflagInstance.stop();

    expect(closeChannel).toBeCalledTimes(1);
  });

  test("does not call tracking endpoints if token cached", async () => {
    const specialChannel = "special-channel";
    vi.mocked(getAuthToken).mockReturnValue({
      channel: specialChannel,
      token: "something",
    });

    server.use(
      http.post(`${API_BASE_URL}/feedback/prompting-init`, () => {
        throw new Error("should not be called");
      }),
    );

    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
    });
    await reflagInstance.initialize();

    expect(openAblySSEChannel).toBeCalledTimes(1);
    const args = vi.mocked(openAblySSEChannel).mock.calls[0][0];
    expect(args.channel).toBe(specialChannel);
    expect(args.userId).toBe("foo");
  });

  test("does not initiate feedback prompting if server does not agree", async () => {
    server.use(
      http.post(`${API_BASE_URL}/feedback/prompting-init`, () => {
        return HttpResponse.json({ success: false });
      }),
    );

    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
    });
    await reflagInstance.initialize();

    expect(openAblySSEChannel).toBeCalledTimes(0);
  });

  test("skip feedback prompting if no user id configured", async () => {
    const reflagInstance = new ReflagClient({ publishableKey: KEY });
    await reflagInstance.initialize();

    expect(openAblySSEChannel).toBeCalledTimes(0);
  });

  test("skip feedback prompting if automated feedback surveys are disabled", async () => {
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      feedback: { enableAutoFeedback: false },
    });
    await reflagInstance.initialize();

    expect(openAblySSEChannel).toBeCalledTimes(0);
  });
});

describe("feedback state management", () => {
  const message = {
    question: "How are you?",
    showAfter: new Date(Date.now() - 10000).valueOf(),
    showBefore: new Date(Date.now() + 10000).valueOf(),
    promptId: "123",
    featureId: "456",
  };

  let events: string[] = [];
  let reflagInstance: ReflagClient | null = null;
  beforeEach(() => {
    vi.mocked(openAblySSEChannel).mockImplementation(({ callback }) => {
      callback(message);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return { close: () => {} } as AblySSEChannel;
    });
    events = [];
    server.use(
      http.post(
        `${API_BASE_URL}/feedback/prompt-events`,
        async ({ request }) => {
          const body = await request.json();
          if (!(body && typeof body === "object" && "action" in body)) {
            throw new Error("invalid request");
          }
          events.push(String(body["action"]));
          return HttpResponse.json({ success: true });
        },
      ),
    );
  });

  afterEach(async () => {
    if (reflagInstance) await reflagInstance.stop();

    vi.resetAllMocks();
  });

  const createReflagInstance = async (callback: FeedbackPromptHandler) => {
    reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
      feedback: {
        autoFeedbackHandler: callback,
      },
    });
    await reflagInstance.initialize();
    return reflagInstance;
  };

  test("ignores prompt if expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(message.showAfter - 10000);

    const callback = vi.fn();

    await createReflagInstance(callback);

    expect(callback).not.toHaveBeenCalled();

    expect(markPromptMessageCompleted).not.toHaveBeenCalledOnce();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("ignores prompt if already seen", async () => {
    vi.mocked(checkPromptMessageCompleted).mockReturnValue(true);
    expect(checkPromptMessageCompleted).not.toHaveBeenCalled();

    const callback = vi.fn();

    await createReflagInstance(callback);

    expect(callback).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(checkPromptMessageCompleted).toHaveBeenCalledOnce(),
    );

    expect(checkPromptMessageCompleted).toHaveBeenCalledWith("foo", "123");
  });

  test("propagates prompt to the callback", async () => {
    const callback = vi.fn();

    await createReflagInstance(callback);
    await vi.waitUntil(() => callback.mock.calls.length > 0);

    await vi.waitUntil(() => events.length > 1);

    expect(events).toEqual(["received", "shown"]);

    expect(callback).toBeCalledTimes(1);
    expect(callback).toBeCalledWith(
      {
        question: "How are you?",
        showAfter: new Date(message.showAfter),
        showBefore: new Date(message.showBefore),
        promptId: "123",
        featureId: "456",
      },
      expect.anything(),
    );

    expect(markPromptMessageCompleted).not.toHaveBeenCalled();
  });

  test("propagates timed prompt to the callback", async () => {
    const callback = vi.fn();

    vi.useFakeTimers();
    vi.setSystemTime(message.showAfter - 500);

    await createReflagInstance(callback);

    expect(callback).not.toBeCalled();

    vi.runAllTimers();
    await vi.waitUntil(() => callback.mock.calls.length > 0);

    await vi.waitUntil(() => events.length > 1);

    expect(events).toEqual(["received", "shown"]);

    expect(callback).toBeCalledTimes(1);

    expect(markPromptMessageCompleted).not.toHaveBeenCalled();

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("propagates prompt to the callback and reacts to dismissal", async () => {
    const callback: FeedbackPromptHandler = async (_, handlers) => {
      await handlers.reply(null);
    };

    await createReflagInstance(callback);

    await vi.waitUntil(() => events.length > 2);

    expect(events).toEqual(["received", "shown", "dismissed"]);

    expect(markPromptMessageCompleted).toHaveBeenCalledOnce();
    expect(markPromptMessageCompleted).toHaveBeenCalledWith(
      "foo",
      "123",
      new Date(message.showBefore),
    );
  });

  test("propagates prompt to the callback and reacts to feedback", async () => {
    const callback: FeedbackPromptHandler = async (_, handlers) => {
      await handlers.reply({
        companyId: "bar",
        score: 5,
        comment: "hello",
        question: "Cum esti?",
      });
    };

    await createReflagInstance(callback);

    await vi.waitUntil(() => events.length > 1);

    expect(events).toEqual(["received", "shown"]);
    expect(markPromptMessageCompleted).toHaveBeenCalledOnce();
    expect(markPromptMessageCompleted).toHaveBeenCalledWith(
      "foo",
      "123",
      new Date(message.showBefore),
    );
  });
});

describe(`sends "check" events `, () => {
  test("getFlags() does not send `check` events", async () => {
    vi.spyOn(FlagsClient.prototype, "sendCheckEvent");

    const client = new ReflagClient({
      publishableKey: KEY,
      user: { id: "123" },
    });
    await client.initialize();

    expect(
      vi.mocked(FlagsClient.prototype.sendCheckEvent),
    ).toHaveBeenCalledTimes(0);

    const flagA = client.getFlags()?.flagA;

    expect(flagA?.isEnabled).toBe(true);
    expect(
      vi.mocked(FlagsClient.prototype.sendCheckEvent),
    ).toHaveBeenCalledTimes(0);
  });

  describe("getFlag", async () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it(`returns get the expected flag details`, async () => {
      const client = new ReflagClient({
        publishableKey: KEY,
        user: { id: "uid" },
        company: { id: "cid" },
      });

      await client.initialize();

      expect(client.getFlag("flagA")).toStrictEqual({
        isEnabled: true,
        config: { key: undefined, payload: undefined },
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
        isEnabledOverride: null,
        setIsEnabledOverride: expect.any(Function),
      });

      expect(client.getFlag("flagB")).toStrictEqual({
        isEnabled: true,
        config: {
          key: "gpt3",
          payload: {
            model: "gpt-something",
            temperature: 0.5,
          },
        },
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
        isEnabledOverride: null,
        setIsEnabledOverride: expect.any(Function),
      });

      expect(client.getFlag("flagC")).toStrictEqual({
        isEnabled: false,
        config: { key: undefined, payload: undefined },
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
        isEnabledOverride: null,
        setIsEnabledOverride: expect.any(Function),
      });
    });

    it(`does not send check events when offline`, async () => {
      const postSpy = vi.spyOn(HttpClient.prototype, "post");

      const client = new ReflagClient({
        publishableKey: KEY,
        user: { id: "uid" },
        company: { id: "cid" },
        offline: true,
      });
      await client.initialize();

      const flagA = client.getFlag("flagA");
      expect(flagA.isEnabled).toBe(false);

      expect(postSpy).not.toHaveBeenCalled();
    });

    it(`sends check event when accessing "isEnabled"`, async () => {
      const sendCheckEventSpy = vi.spyOn(
        FlagsClient.prototype,
        "sendCheckEvent",
      );

      const postSpy = vi.spyOn(HttpClient.prototype, "post");

      const client = new ReflagClient({
        publishableKey: KEY,
        user: { id: "uid" },
        company: { id: "cid" },
      });
      await client.initialize();

      const flagA = client.getFlag("flagA");

      expect(sendCheckEventSpy).toHaveBeenCalledTimes(0);
      expect(flagA.isEnabled).toBe(true);

      expect(sendCheckEventSpy).toHaveBeenCalledTimes(1);
      expect(sendCheckEventSpy).toHaveBeenCalledWith(
        {
          action: "check-is-enabled",
          key: "flagA",
          value: true,
          version: 1,
          missingContextFields: ["field1", "field2"],
          ruleEvaluationResults: [false, true],
        },
        expect.any(Function),
      );

      expect(postSpy).toHaveBeenCalledWith({
        body: {
          action: "check-is-enabled",
          evalContext: {
            company: {
              id: "cid",
            },
            other: undefined,
            user: {
              id: "uid",
            },
          },
          evalResult: true,
          evalRuleResults: [false, true],
          evalMissingFields: ["field1", "field2"],
          key: "flagA",
          targetingVersion: 1,
        },
        path: "features/events",
      });
    });

    it(`sends check event when accessing "config"`, async () => {
      const postSpy = vi.spyOn(HttpClient.prototype, "post");

      const client = new ReflagClient({
        publishableKey: KEY,
        user: { id: "uid" },
      });

      await client.initialize();
      const flagB = client.getFlag("flagB");
      expect(flagB.config).toMatchObject({
        key: "gpt3",
      });

      expect(postSpy).toHaveBeenCalledWith({
        body: {
          action: "check-config",
          evalContext: {
            other: undefined,
            user: {
              id: "uid",
            },
          },
          evalResult: {
            key: "gpt3",
            payload: { model: "gpt-something", temperature: 0.5 },
          },
          evalRuleResults: [true, false, false],
          evalMissingFields: ["field3"],
          key: "flagB",
          targetingVersion: 12,
        },
        path: "features/events",
      });
    });

    it("sends check event for not-enabled flags", async () => {
      // disabled flags don't appear in the API response
      vi.spyOn(FlagsClient.prototype, "sendCheckEvent");

      const client = new ReflagClient({ publishableKey: KEY });
      await client.initialize();

      const nonExistentFlag = client.getFlag("non-existent");

      expect(
        vi.mocked(FlagsClient.prototype.sendCheckEvent),
      ).toHaveBeenCalledTimes(0);
      expect(nonExistentFlag.isEnabled).toBe(false);

      expect(
        vi.mocked(FlagsClient.prototype.sendCheckEvent),
      ).toHaveBeenCalledTimes(1);
      expect(
        vi.mocked(FlagsClient.prototype.sendCheckEvent),
      ).toHaveBeenCalledWith(
        {
          action: "check-is-enabled",
          value: false,
          key: "non-existent",
          version: undefined,
        },
        expect.any(Function),
      );
    });

    it("calls client.track with the flagKey", async () => {
      const client = new ReflagClient({ publishableKey: KEY });
      await client.initialize();

      const flag = client.getFlag("flag-1");
      expect(flag).toStrictEqual({
        isEnabled: false,
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
        config: { key: undefined, payload: undefined },
        isEnabledOverride: null,
        setIsEnabledOverride: expect.any(Function),
      });

      vi.spyOn(client, "track");

      await flag.track();

      expect(client.track).toHaveBeenCalledWith("flag-1");
    });

    it("calls client.requestFeedback with the flagKey", async () => {
      const client = new ReflagClient({ publishableKey: KEY });
      await client.initialize();

      const flag = client.getFlag("flag-1");
      expect(flag).toStrictEqual({
        isEnabled: false,
        track: expect.any(Function),
        requestFeedback: expect.any(Function),
        config: { key: undefined, payload: undefined },
        isEnabledOverride: null,
        setIsEnabledOverride: expect.any(Function),
      });

      vi.spyOn(client, "requestFeedback");

      flag.requestFeedback({
        title: "Feedback",
      });

      expect(client.requestFeedback).toHaveBeenCalledWith({
        flagKey: "flag-1",
        title: "Feedback",
      });
    });
  });
});
