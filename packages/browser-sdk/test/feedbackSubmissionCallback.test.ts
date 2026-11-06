import { describe, expect, test, vi } from "vitest";

import {
  FeedbackSubmission,
  OnScoreSubmitResult,
  OpenFeedbackFormOptions,
} from "../src/feedback/ui/types";
import { withFeedbackSubmissionCallback } from "../src/feedback/ui/withFeedbackSubmissionCallback";
import { deferred } from "./deferred";

const score = { question: "How was it?", score: 4 };
const feedbackId = "feedback-123";
const savedScore = { ...score, feedbackId, comment: "" };
const submittedFeedback: FeedbackSubmission = {
  ...savedScore,
  comment: "Very useful!",
};

function setup(overrides: Partial<OpenFeedbackFormOptions> = {}) {
  const onAfterSubmit = vi.fn();
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onScoreSubmit = vi.fn().mockResolvedValue({ feedbackId });
  const handlers = withFeedbackSubmissionCallback({
    key: "test",
    onAfterSubmit,
    onClose,
    onSubmit,
    onScoreSubmit,
    ...overrides,
  });
  return { handlers, onAfterSubmit, onClose, onSubmit, onScoreSubmit };
}

describe("feedback submission callback", () => {
  test("does not notify when closing without feedback", () => {
    const { handlers, onAfterSubmit, onClose } = setup();
    handlers.onClose!();
    expect(onAfterSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("notifies once on close with the latest saved score and an empty comment", async () => {
    const { handlers, onAfterSubmit, onScoreSubmit } = setup();
    await handlers.onScoreSubmit!(score);
    await handlers.onScoreSubmit!({ ...score, feedbackId, score: 5 });
    expect(onAfterSubmit).not.toHaveBeenCalled();

    handlers.onClose!();
    handlers.onClose!();
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith({
      ...savedScore,
      score: 5,
    });
    expect(onScoreSubmit).toHaveBeenCalledTimes(2);
  });

  test("notifies after Send, not again when the form closes", async () => {
    const { handlers, onAfterSubmit, onSubmit } = setup();
    await handlers.onScoreSubmit!(score);
    await handlers.onSubmit(submittedFeedback);
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith(submittedFeedback);

    handlers.onClose!();
    handlers.onClose!();
    expect(onAfterSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(submittedFeedback);
  });

  test("notifies after Send with an empty comment too", async () => {
    const { handlers, onAfterSubmit } = setup();
    await handlers.onSubmit(savedScore);
    handlers.onClose!();
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith(savedScore);
  });

  test("waits for an in-flight score save when closing", async () => {
    const pending = deferred<OnScoreSubmitResult>();
    const { handlers, onAfterSubmit } = setup({
      onScoreSubmit: () => pending.promise,
    });
    const saving = handlers.onScoreSubmit!(score);
    handlers.onClose!();
    expect(onAfterSubmit).not.toHaveBeenCalled();

    pending.resolve({ feedbackId });
    await saving;
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith(savedScore);
  });

  test("waits for all score saves and keeps the latest selection even with out-of-order responses", async () => {
    const first = deferred<OnScoreSubmitResult>();
    const second = deferred<OnScoreSubmitResult>();
    const onScoreSubmit = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { handlers, onAfterSubmit } = setup({ onScoreSubmit });
    const savingFirst = handlers.onScoreSubmit!(score);
    const savingSecond = handlers.onScoreSubmit!({ ...score, score: 5 });
    handlers.onClose!();

    second.resolve({ feedbackId });
    await savingSecond;
    expect(onAfterSubmit).not.toHaveBeenCalled();
    first.resolve({ feedbackId });
    await savingFirst;
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith({
      ...savedScore,
      score: 5,
    });
  });

  test("waits for an in-flight Send rather than notifying with just the score", async () => {
    const pending = deferred<void>();
    const { handlers, onAfterSubmit } = setup({
      onSubmit: () => pending.promise,
    });
    await handlers.onScoreSubmit!(score);
    const saving = handlers.onSubmit(submittedFeedback);
    handlers.onClose!();
    expect(onAfterSubmit).not.toHaveBeenCalled();

    pending.resolve();
    await saving;
    handlers.onClose!();
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith(submittedFeedback);
  });

  test("does not notify for a failed score save", async () => {
    const { handlers, onAfterSubmit } = setup({
      onScoreSubmit: vi.fn().mockRejectedValue(new Error("Save failed")),
    });
    const saving = handlers.onScoreSubmit!(score);
    handlers.onClose!();
    await expect(saving).rejects.toThrow("Save failed");
    expect(onAfterSubmit).not.toHaveBeenCalled();
  });

  test("does not notify if the score handler did not save feedback", async () => {
    const { handlers, onAfterSubmit } = setup({
      // The manual feedback handler returns an undefined ID on an unsuccessful response.
      onScoreSubmit: vi.fn().mockResolvedValue({ feedbackId: undefined }),
    });
    await handlers.onScoreSubmit!(score);
    handlers.onClose!();
    expect(onAfterSubmit).not.toHaveBeenCalled();
  });

  test("falls back to the saved score if Send fails after closing", async () => {
    const pending = deferred<void>();
    const { handlers, onAfterSubmit } = setup({
      onSubmit: async () => {
        await pending.promise;
        throw new Error("Send failed");
      },
    });
    await handlers.onScoreSubmit!(score);
    const saving = handlers.onSubmit(submittedFeedback);
    handlers.onClose!();
    pending.resolve();

    await expect(saving).rejects.toThrow("Send failed");
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith(savedScore);
  });

  test("retains a saved score if a subsequent score save fails", async () => {
    const onScoreSubmit = vi
      .fn()
      .mockResolvedValueOnce({ feedbackId })
      .mockRejectedValueOnce(new Error("Save failed"));
    const { handlers, onAfterSubmit } = setup({ onScoreSubmit });
    await handlers.onScoreSubmit!(score);
    await expect(
      handlers.onScoreSubmit!({ ...score, score: 5 }),
    ).rejects.toThrow("Save failed");
    handlers.onClose!();
    expect(onAfterSubmit).toHaveBeenCalledExactlyOnceWith(savedScore);
  });

  test("does not call a throwing callback again or skip the user's close handler", async () => {
    const onAfterSubmit = vi.fn(() => {
      throw new Error("Analytics failed");
    });
    const { handlers, onClose } = setup({ onAfterSubmit });
    await handlers.onScoreSubmit!(score);
    expect(() => handlers.onClose!()).toThrow("Analytics failed");
    expect(onClose).toHaveBeenCalledOnce();
    handlers.onClose!();
    expect(onAfterSubmit).toHaveBeenCalledOnce();
  });

  test("each new form has an independent callback lifecycle", async () => {
    const first = setup();
    const second = setup();
    await first.handlers.onScoreSubmit!(score);
    await second.handlers.onScoreSubmit!(score);
    first.handlers.onClose!();
    second.handlers.onClose!();
    expect(first.onAfterSubmit).toHaveBeenCalledOnce();
    expect(second.onAfterSubmit).toHaveBeenCalledOnce();
  });
});
