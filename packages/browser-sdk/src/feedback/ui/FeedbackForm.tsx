import { FunctionComponent, h } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { CheckCircle } from "../../ui/icons/CheckCircle";

import { Button } from "./Button";
import { FormState } from "./FeedbackDialog";
import { Plug } from "./Plug";
import { StarRating } from "./StarRating";
import {
  FeedbackSubmission,
  FeedbackTranslations,
  OpenFeedbackFormOptions,
} from "./types";

const SCREEN_TRANSITION_SPEED = 400;

type FormData = {
  score: number | null;
  comment: string | null;
};

function getFeedbackDataFromForm(el: HTMLFormElement): FormData {
  const formData = new FormData(el);
  return {
    score: Number(formData.get("score")?.toString()) || null,
    comment: (formData.get("comment")?.toString() || "").trim() || null,
  };
}

type FeedbackFormProps = {
  t: FeedbackTranslations;
  question: string;
  formState: FormState;
  inputMode: Required<OpenFeedbackFormOptions["inputMode"]>;
  onInteraction: () => void;
  onSubmit: (
    data: Omit<FeedbackSubmission, "feebackId">,
  ) => Promise<void> | void;
};

export const FeedbackForm: FunctionComponent<FeedbackFormProps> = ({
  question,
  inputMode,
  onInteraction,
  onSubmit,
  t,
  formState,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const submittedRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<FormData>({
    score: null,
    comment: null,
  });

  const formFieldChanged = useCallback(() => {
    if (!formRef.current) return;
    setFormData(getFeedbackDataFromForm(formRef.current));
  }, []);

  const validateForm = useCallback(() => {
    if (inputMode === "comment-only" && !formData.comment) {
      setError("Comment is required");
      return false;
    } else if (inputMode === "score-only" && !formData.score) {
      setError("Score is required");
      return false;
    } else if (
      inputMode === "comment-and-score" &&
      !formData.score &&
      !formData.comment
    ) {
      setError("Comment or score is required");
      return false;
    }
    setError(null);
    return true;
  }, [inputMode, formData]);

  const handleSubmit: h.JSX.GenericEventHandler<HTMLFormElement> = useCallback(
    async (e) => {
      e.preventDefault();
      if (!validateForm()) return;
      try {
        await onSubmit({
          question,
          score: formData.score ?? undefined,
          comment: formData.comment ?? undefined,
        });
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else if (typeof err === "string") {
          setError(err);
        } else {
          setError("Couldn't submit feedback. Please try again.");
        }
      }
    },
    [onSubmit, question, formData, validateForm],
  );

  const transitionToSuccess = useCallback(() => {
    if (containerRef.current === null) return;
    if (formRef.current === null) return;
    if (submittedRef.current === null) return;

    formRef.current.style.opacity = "0";
    formRef.current.style.pointerEvents = "none";
    containerRef.current.style.maxHeight = `${submittedRef.current.clientHeight}px`;

    // Fade in "submitted" step once container has resized
    setTimeout(() => {
      submittedRef.current!.style.position = "relative";
      submittedRef.current!.style.opacity = "1";
      submittedRef.current!.style.pointerEvents = "all";
      setShowForm(false);
    }, SCREEN_TRANSITION_SPEED);
  }, [formRef, containerRef, submittedRef]);

  useEffect(() => {
    if (formState === "submitted") {
      transitionToSuccess();
    }
  }, [transitionToSuccess, formState]);

  return (
    <div ref={containerRef} class="container">
      <div ref={submittedRef} class="submitted">
        <div class="submitted-check">
          <CheckCircle height={24} width={24} />
        </div>
        <p class="text">{t.SuccessMessage}</p>
        <Plug />
      </div>
      {showForm && (
        <form
          ref={formRef}
          class="form"
          method="dialog"
          style={{ opacity: 1 }}
          onClick={onInteraction}
          onFocus={onInteraction}
          onFocusCapture={onInteraction}
          onSubmit={handleSubmit}
        >
          <div class="title" id="reflag-feedback-score-label">
            {question}
          </div>
          <div class="form-expanded-content">
            {inputMode !== "score-only" && (
              <div class="form-control">
                <textarea
                  class="textarea"
                  id="reflag-feedback-comment-label"
                  name="comment"
                  placeholder={t.QuestionPlaceholder}
                  rows={4}
                  onInput={formFieldChanged}
                />
              </div>
            )}
            {inputMode !== "comment-only" && (
              <div
                ref={headerRef}
                aria-labelledby="reflag-feedback-score-label"
                class="form-control"
                role="group"
              >
                <StarRating name="score" t={t} onChange={formFieldChanged} />
              </div>
            )}

            {error && <p class="error">{error}</p>}

            <Button
              disabled={formState === "submitting" || formState === "submitted"}
              type="submit"
              variant="primary"
            >
              {t.SendButton}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
