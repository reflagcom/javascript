import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ReflagClient } from "../src";
import { AutoFeedback } from "../src/feedback/feedback";
import type { EventSourceLike } from "../src/sse";

const clients: ReflagClient[] = [];
const prompt = { name: "feedback-prompt", data: { promptId: "zero-user" } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()));
  vi.restoreAllMocks();
});

function create(userId: string | number) {
  const received = vi
    .spyOn(AutoFeedback.prototype, "handleFeedbackPromptRequest")
    .mockImplementation(() => undefined);
  const eventSourceFactory = vi.fn((url: string) => {
    const listeners = new Map<
      string,
      Parameters<EventSourceLike["addEventListener"]>[1]
    >();
    return {
      url,
      listeners,
      close: vi.fn(),
      addEventListener: (
        type: string,
        listener: Parameters<EventSourceLike["addEventListener"]>[1],
      ) => {
        listeners.set(type, listener);
      },
    };
  });
  const client = new ReflagClient({
    publishableKey: "feedback-context",
    user: { id: userId },
    enableTracking: false,
    toolbar: false,
    eventSourceFactory,
  });
  clients.push(client);
  return { client, eventSourceFactory, received };
}

test("routes automatic feedback to numeric user ID zero", async () => {
  const { client, eventSourceFactory, received } = create(0);
  await client.initialize();
  expect(eventSourceFactory).toHaveBeenCalledOnce();
  const source = eventSourceFactory.mock.results[0].value;
  expect(
    JSON.parse(new URL(source.url).searchParams.get("contextJson")!),
  ).toMatchObject({
    user: { id: 0 },
  });
  source.listeners.get("message")!({ data: JSON.stringify(prompt) });
  expect(received).toHaveBeenCalledWith("0", prompt.data);
});

test.each(["setContext", "updateUser", "bootstrap"] as const)(
  "updates automatic feedback identity to zero via %s",
  async (method) => {
    const { client, eventSourceFactory, received } = create("alice");
    const setUserId = vi.spyOn(AutoFeedback.prototype, "setUserId");
    await client.initialize();
    const first = eventSourceFactory.mock.results[0].value;
    if (method === "setContext") {
      await client.setContext({ user: { id: 0 } });
    } else if (method === "updateUser") {
      await client.updateUser({ id: 0 });
    } else {
      client.applyBootstrappedState({
        ...client.getFlagsForBootstrap(),
        context: { user: { id: 0 } },
      });
    }
    await vi.waitFor(() => expect(eventSourceFactory).toHaveBeenCalledTimes(2));
    expect(first.close).toHaveBeenCalledOnce();
    expect(setUserId).toHaveBeenCalledWith("0");
    const source = eventSourceFactory.mock.results[1].value;
    expect(
      JSON.parse(new URL(source.url).searchParams.get("contextJson")!),
    ).toMatchObject({
      user: { id: 0 },
    });
    source.listeners.get("message")!({ data: JSON.stringify(prompt) });
    expect(received).toHaveBeenCalledWith("0", prompt.data);
  },
);
