import { Position } from "../../ui/types";

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export interface FeedbackSubmission {
  question: string;
  feedbackId?: string;
  score: number;
  comment: string;
}

export interface FeedbackScoreSubmission {
  feedbackId?: string;
  question: string;
  score: number;
}

export interface OnScoreSubmitResult {
  feedbackId: string;
}

export interface OpenFeedbackFormOptions {
  key: string;
  title?: string;

  /**
   * Control the placement and behavior of the feedback form.
   */
  position?: Position;

  /**
   * Add your own custom translations for the feedback form.
   * Undefined translation keys fall back to english defaults.
   */
  translations?: Partial<FeedbackTranslations>;

  /**
   * Open the form with both the score and comment fields visible.
   * Defaults to `false`
   */
  openWithCommentVisible?: boolean;

  onSubmit: (data: FeedbackSubmission) => Promise<void> | void;

  /**
   * Handle a copy of submitted feedback, for example to send it to analytics
   * or your own CRM. Called once per form: after submitting the form, or when
   * it closes with a saved score without a form submission. Replacing the
   * form with another feedback form also counts as closing it.
   *
   * On close, includes the latest saved score and an empty comment. Comment
   * text that was not submitted is never included. If a save is in flight,
   * the callback waits for it to finish. Closing without feedback does not
   * call the callback.
   */
  onAfterSubmit?: (data: FeedbackSubmission) => void;

  onScoreSubmit?: (
    data: FeedbackScoreSubmission,
  ) => Promise<OnScoreSubmitResult>;
  onClose?: () => void;
  onDismiss?: () => void;
}
/**
 * You can use this to override text values in the feedback form
 * with desired language translation
 */
export type FeedbackTranslations = {
  /**
   *
   */
  DefaultQuestionLabel: string;
  QuestionPlaceholder: string;
  ScoreStatusDescription: string;
  ScoreStatusLoading: string;
  ScoreStatusReceived: string;
  ScoreVeryDissatisfiedLabel: string;
  ScoreDissatisfiedLabel: string;
  ScoreNeutralLabel: string;
  ScoreSatisfiedLabel: string;
  ScoreVerySatisfiedLabel: string;
  SuccessMessage: string;
  SendButton: string;
};
