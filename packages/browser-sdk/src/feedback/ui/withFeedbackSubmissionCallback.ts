import { FeedbackSubmission, OpenFeedbackFormOptions } from "./types";

/** Share the once-per-form callback lifecycle between manual and automated feedback. */
export function withFeedbackSubmissionCallback(
  options: OpenFeedbackFormOptions,
): OpenFeedbackFormOptions {
  const { onAfterSubmit, onClose, onScoreSubmit, onSubmit } = options;
  if (!onAfterSubmit) return options;

  let closed = false;
  let notified = false;
  let pendingSubmissions = 0;
  let scoreSubmission = 0;
  let savedScoreSubmission = 0;
  let feedback: FeedbackSubmission | undefined;

  const notify = () => {
    if (notified || !feedback) return;
    // Set this before calling user code, including callbacks that throw or close the form.
    notified = true;
    onAfterSubmit(feedback);
  };

  const notifyOnClose = () => {
    if (closed && pendingSubmissions === 0) notify();
  };

  return {
    ...options,
    onScoreSubmit: onScoreSubmit
      ? async (data) => {
          const submission = ++scoreSubmission;
          pendingSubmissions++;
          try {
            const result = await onScoreSubmit(data);
            if (result.feedbackId && submission > savedScoreSubmission) {
              savedScoreSubmission = submission;
              feedback = {
                ...data,
                feedbackId: result.feedbackId,
                comment: "",
              };
            }
            return result;
          } finally {
            pendingSubmissions--;
            notifyOnClose();
          }
        }
      : undefined,
    onSubmit: async (data) => {
      pendingSubmissions++;
      try {
        await onSubmit(data);
        feedback = data;
        notify();
      } finally {
        pendingSubmissions--;
        notifyOnClose();
      }
    },
    onClose: () => {
      closed = true;
      try {
        notifyOnClose();
      } finally {
        onClose?.();
      }
    },
  };
}
