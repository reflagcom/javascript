import { http, HttpResponse } from "msw";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { ReflagClient } from "../src";
import { API_BASE_URL } from "../src/config";
import { FeedbackPromptHandler } from "../src/feedback/feedback";
import {
  checkPromptMessageCompleted,
  markPromptMessageCompleted,
} from "../src/feedback/promptStorage";
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
  };
});

// Treat test environment as desktop
window.innerWidth = 1024;

afterEach(() => {
  server.resetHandlers();
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
    expect(flags).toEqual(
      Object.fromEntries(
        Object.entries(flagsResult).map(([key, flag]) => [key, flag.value]),
      ),
    );
    expect(reflagInstance.getFlag("flag-1")).toBe(false);
    await reflagInstance.stop();
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

  test("uses the direct client SSE endpoint for feedback prompting", async () => {
    const reflagInstance = new ReflagClient({
      publishableKey: KEY,
      user: { id: "foo" },
    });
    await reflagInstance.initialize();

    expect(openAblySSEChannel).toBeCalledTimes(1);
    const args = vi.mocked(openAblySSEChannel).mock.calls[0][0];
    expect(args.path).toBe("sse/client");
    expect(args.channels).toEqual([]);
    expect(args.publishableKey).toBe(KEY);
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

  test("does not call legacy prompting-init when opening feedback prompting SSE", async () => {
    const post = vi.spyOn(HttpClient.prototype, "post");

    try {
      const reflagInstance = new ReflagClient({
        publishableKey: KEY,
        user: { id: "foo" },
        enableTracking: false,
      });
      await reflagInstance.initialize();

      expect(post).not.toHaveBeenCalled();
      expect(openAblySSEChannel).toBeCalledTimes(1);
    } finally {
      post.mockRestore();
    }
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
      http.post(`${API_BASE_URL}/bulk`, async ({ request }) => {
        const body = await request.json();
        if (!Array.isArray(body)) {
          throw new Error("invalid request");
        }

        body
          .filter(
            (event) =>
              event &&
              typeof event === "object" &&
              "type" in event &&
              event["type"] === "prompt-event" &&
              "action" in event,
          )
          .forEach((event) => {
            events.push(String(event["action"]));
          });

        return HttpResponse.json({ success: true });
      }),
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
      trackingQueue: {
        flushDelayMs: 0,
      },
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
