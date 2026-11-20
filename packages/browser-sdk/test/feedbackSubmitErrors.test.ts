import { afterEach, expect, test, vi } from "vitest";

import { ReflagClient } from "../src/client";
import { AutoFeedback } from "../src/feedback/feedback";
import * as feedbackUi from "../src/feedback/ui";
import { HttpClient } from "../src/httpClient";
import { testLogger } from "./testLogger";

const data = { question: "How was it?", score: 4, comment: "Useful!" };

afterEach(() => vi.restoreAllMocks());

test.each(["manual", "automated"] as const)(
  "%s feedback rejects a failed Send without notifying, then allows retry",
  async (source) => {
    const open = vi
      .spyOn(feedbackUi, "openFeedbackForm")
      .mockImplementation(() => undefined);
    const onAfterSubmit = vi.fn();
    let status = 200;
    vi.spyOn(HttpClient.prototype, "post").mockImplementation(async () =>
      Response.json(
        status === 200 ? { feedbackId: "123" } : { message: "Unavailable" },
        { status },
      ),
    );

    if (source === "manual") {
      const client = new ReflagClient({
        publishableKey: "test-key",
        user: { id: "user" },
        logger: testLogger,
      });
      client.requestFeedback({ flagKey: "flag", onAfterSubmit });
      await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    } else {
      const auto = new AutoFeedback(
        "https://front.reflag.com",
        testLogger,
        new HttpClient("test-key"),
        (_prompt, handlers) => handlers.openFeedbackForm({ onAfterSubmit }),
        "user",
      );
      await auto.triggerFeedbackPrompt(
        "user",
        {
          question: data.question,
          promptId: "prompt",
          featureId: "feature",
          showAfter: new Date(),
          showBefore: new Date(Date.now() + 60000),
        },
        vi.fn(),
      );
    }

    const { onSubmit } = open.mock.calls[0]![0];
    status = 500;
    await expect(onSubmit(data)).rejects.toThrow("Couldn't submit feedback");
    expect(onAfterSubmit).not.toHaveBeenCalled();

    status = 200;
    await expect(onSubmit(data)).resolves.toBeUndefined();
  },
);
