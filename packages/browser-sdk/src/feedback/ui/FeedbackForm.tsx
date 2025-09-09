import { FunctionComponent, h } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { Check } from "../../ui/icons/Check";
import { CheckCircle } from "../../ui/icons/CheckCircle";

import { Button } from "./Button";
import { Plug } from "./Plug";
import { StarRating } from "./StarRating";
import {
  FeedbackScoreSubmission,
  FeedbackSubmission,
  FeedbackTranslations,
} from "./types";

const ANIMATION_SPEED = 400;

function getFeedbackDataFromForm(el: HTMLFormElement) {
  const formData = new FormData(el);
  return {
    score: Number(formData.get("score")?.toString()),
    comment: (formData.get("comment")?.toString() || "").trim(),
  };
}

type FeedbackFormProps = {
  t: FeedbackTranslations;
  question: string;
  scoreState: "idle" | "submitting" | "submitted";
  openWithCommentVisible: boolean;
  requireSatisfactionScore?: boolean;
  onInteraction: () => void;
  onSubmit: (
    data: Omit<FeedbackSubmission, "feebackId">,
  ) => Promise<void> | void;
  onScoreSubmit: (
    score: Omit<FeedbackScoreSubmission, "feebackId">,
  ) => Promise<void> | void;
};

export const FeedbackForm: FunctionComponent<FeedbackFormProps> = ({
  question,
  scoreState,
  openWithCommentVisible,
  requireSatisfactionScore = true,
  onInteraction,
  onSubmit,
  onScoreSubmit,
  t,
}) => {
  const [hasRating, setHasRating] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">(
    "idle",
  );
  const [error, setError] = useState<string>();
  const [showForm, setShowForm] = useState(true);

  const handleSubmit: h.JSX.GenericEventHandler<HTMLFormElement> = async (
    e,
  ) => {
    e.preventDefault();
    const data: FeedbackSubmission = {
      ...getFeedbackDataFromForm(e.target as HTMLFormElement),
      question,
    };
    // Validation logic
    if (requireSatisfactionScore) {
      if (!data.score) return;
    } else if (!data.comment) {
      setError("Comment is required");
      return;
    }
    setError("");
    try {
      setStatus("submitting");
      await onSubmit(data);
      setStatus("submitted");
    } catch (err) {
      setStatus("idle");
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("Couldn't submit feedback. Please try again.");
      }
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const expandedContentRef = useRef<HTMLDivElement>(null);
  const submittedRef = useRef<HTMLDivElement>(null);

  const transitionToDefault = useCallback(() => {
    if (containerRef.current === null) return;
    if (headerRef.current === null) return;
    if (expandedContentRef.current === null) return;

    containerRef.current.style.maxHeight = `${headerRef.current.clientHeight}px`;

    expandedContentRef.current.style.position = "absolute";
    expandedContentRef.current.style.opacity = "0";
    expandedContentRef.current.style.pointerEvents = "none";
  }, [containerRef, headerRef, expandedContentRef]);

  const transitionToExpanded = useCallback(() => {
    if (containerRef.current === null) return;
    if (headerRef.current === null) return;
    if (expandedContentRef.current === null) return;

    containerRef.current.style.maxHeight = `${
      headerRef.current.clientHeight + // Header height
      expandedContentRef.current.clientHeight + // Comment + Button Height
      10 // Gap height
    }px`;

    expandedContentRef.current.style.position = "relative";
    expandedContentRef.current.style.opacity = "1";
    expandedContentRef.current.style.pointerEvents = "all";
  }, [containerRef, headerRef, expandedContentRef]);

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
    }, ANIMATION_SPEED + 10);
  }, [formRef, containerRef, submittedRef]);

  useEffect(() => {
    if (status === "submitted") {
      transitionToSuccess();
    } else if (openWithCommentVisible || hasRating) {
      transitionToExpanded();
    } else {
      transitionToDefault();
    }
  }, [
    transitionToDefault,
    transitionToExpanded,
    transitionToSuccess,
    openWithCommentVisible,
    hasRating,
    status,
  ]);

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
          <div ref={expandedContentRef} class="form-expanded-content">
            <div class="form-control">
              <textarea
                class="textarea"
                id="reflag-feedback-comment-label"
                name="comment"
                placeholder={t.QuestionPlaceholder}
                rows={4}
              />
            </div>
            <div
              ref={headerRef}
              aria-labelledby="reflag-feedback-score-label"
              class="form-control"
              role="group"
            >
              <StarRating
                name="score"
                t={t}
                onChange={async (e) => {
                  setHasRating(true);
                  await onScoreSubmit({
                    question,
                    score: Number(e.currentTarget.value),
                  });
                }}
              />

              {/* <ScoreStatus scoreState={scoreState} t={t} /> */}
            </div>

            {error && <p class="error">{error}</p>}

            <Button
              disabled={
                (requireSatisfactionScore
                  ? !hasRating
                  : status === "submitting" ||
                    scoreState === "submitting" ||
                    false) ||
                (requireSatisfactionScore === false &&
                  status === "submitting") ||
                (requireSatisfactionScore === false &&
                  formRef.current !== null &&
                  !getFeedbackDataFromForm(formRef.current).comment)
              }
              type="submit"
            >
              {t.SendButton}
            </Button>

            <Plug />
          </div>
        </form>
      )}
    </div>
  );
};

const ScoreStatus: FunctionComponent<{
  t: FeedbackTranslations;
  scoreState: "idle" | "submitting" | "submitted";
}> = ({ t, scoreState }) => {
  // Keep track of whether we can show a loading indication - only if 400ms have
  // elapsed without the score request finishing.
  const [loadingTimeElapsed, setLoadingTimeElapsed] = useState(false);

  // Keep track of whether we can fall back to the idle/loading states - once
  // it's been submit once it won't, to prevent flashing.
  const [hasBeenSubmitted, setHasBeenSubmitted] = useState(false);

  useEffect(() => {
    if (scoreState === "idle") {
      setLoadingTimeElapsed(false);
      return;
    }

    if (scoreState === "submitted") {
      setLoadingTimeElapsed(false);
      setHasBeenSubmitted(true);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingTimeElapsed(true);
    }, 400);

    return () => clearTimeout(timer);
  }, [scoreState]);

  const showIdle =
    scoreState === "idle" ||
    (scoreState === "submitting" && !hasBeenSubmitted && !loadingTimeElapsed);
  const showLoading =
    scoreState !== "submitted" && !hasBeenSubmitted && loadingTimeElapsed;
  const showSubmitted = scoreState === "submitted" || hasBeenSubmitted;

  return (
    <div class="score-status-container">
      <span class="score-status" style={{ opacity: showIdle ? 1 : 0 }}>
        {t.ScoreStatusDescription}
      </span>

      <div class="score-status" style={{ opacity: showLoading ? 1 : 0 }}>
        {t.ScoreStatusLoading}
      </div>

      <span class="score-status" style={{ opacity: showSubmitted ? 1 : 0 }}>
        <Check height={14} style={{ marginRight: 3 }} width={14} />{" "}
        {t.ScoreStatusReceived}
      </span>
    </div>
  );
};
