import { Fragment, FunctionComponent, h } from "preact";
import { useCallback, useState } from "preact/hooks";

import { feedbackContainerId } from "../../ui/constants";
import { Dialog, useDialog } from "../../ui/Dialog";
import { Close } from "../../ui/icons/Close";
import { DEFAULT_TRANSLATIONS } from "./config/defaultTranslations";
import { FeedbackForm } from "./FeedbackForm";
import { useTimer } from "./hooks/useTimer";
import styles from "./index.css?inline";
import { RadialProgress } from "./RadialProgress";
import {
  FeedbackScoreSubmission,
  FeedbackSubmission,
  OpenFeedbackFormOptions,
  WithRequired,
} from "./types";

export type FeedbackDialogProps = WithRequired<
  OpenFeedbackFormOptions,
  "onSubmit" | "position"
>;

const INACTIVE_DURATION_MS = 20 * 1000;
const SUCCESS_DURATION_MS = 3 * 1000;

export const FeedbackDialog: FunctionComponent<FeedbackDialogProps> = ({
  key,
  title = DEFAULT_TRANSLATIONS.DefaultQuestionLabel,
  position,
  translations = DEFAULT_TRANSLATIONS,
  openWithCommentVisible = false,
  onClose,
  onDismiss,
  onSubmit,
  onScoreSubmit,
}) => {
  const [feedbackId, setFeedbackId] = useState<string | undefined>(undefined);
  const [scoreState, setScoreState] = useState<
    "idle" | "submitting" | "submitted"
  >("idle");

  const { isOpen, close } = useDialog({ onClose, initialValue: true });

  const autoClose = useTimer({
    enabled: position.type === "DIALOG",
    initialDuration: INACTIVE_DURATION_MS,
    onEnd: close,
  });

  const submit = useCallback(
    async (data: Omit<FeedbackSubmission, "feedbackId">) => {
      await onSubmit({ ...data, feedbackId });
      autoClose.startWithDuration(SUCCESS_DURATION_MS);
    },
    [autoClose, feedbackId, onSubmit],
  );

  const submitScore = useCallback(
    async (data: Omit<FeedbackScoreSubmission, "feedbackId">) => {
      if (onScoreSubmit !== undefined) {
        setScoreState("submitting");

        const res = await onScoreSubmit({ ...data, feedbackId });
        setFeedbackId(res.feedbackId);
        setScoreState("submitted");
      }
    },
    [feedbackId, onScoreSubmit],
  );
  const dismiss = useCallback(() => {
    autoClose.stop();
    close();
    onDismiss?.();
  }, [autoClose, close, onDismiss]);

  return (
    <Fragment>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <Dialog
        key={key}
        close={close}
        containerId={feedbackContainerId}
        isOpen={isOpen}
        position={position}
        onDismiss={onDismiss}
      >
        <Fragment>
          <FeedbackForm
            key={key}
            openWithCommentVisible={openWithCommentVisible}
            question={title}
            scoreState={scoreState}
            t={{ ...DEFAULT_TRANSLATIONS, ...translations }}
            onInteraction={autoClose.stop}
            onScoreSubmit={submitScore}
            onSubmit={submit}
          />

          <button class="close" onClick={dismiss}>
            {!autoClose.stopped && autoClose.elapsedFraction > 0 && (
              <RadialProgress
                diameter={28}
                progress={1.0 - autoClose.elapsedFraction}
              />
            )}
            <Close />
          </button>
        </Fragment>
      </Dialog>
    </Fragment>
  );
};
