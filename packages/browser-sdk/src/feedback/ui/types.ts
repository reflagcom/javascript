import { Position } from "../../ui/types";

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export interface FeedbackSubmission {
  question: string;
  feedbackId?: string;
  score?: number;
  comment?: string;
}

export interface OnSubmitResult {
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
   * Decides which user input options are shown in the widget
   */
  inputMode?: "comment-and-score" | "comment-only" | "score-only";

  onSubmit: (data: FeedbackSubmission) => Promise<OnSubmitResult | void>;
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
