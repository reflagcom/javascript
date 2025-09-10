import { Fragment, FunctionComponent, h } from "preact";
import { useCallback, useState } from "preact/hooks";

import { feedbackContainerId } from "../../ui/constants";
import { Dialog, useDialog } from "../../ui/Dialog";
import { Close } from "../../ui/icons/Close";

import { DEFAULT_TRANSLATIONS } from "./config/defaultTranslations";
import { useTimer } from "./hooks/useTimer";
import { FeedbackForm } from "./FeedbackForm";
import styles from "./index.css?inline";
import { RadialProgress } from "./RadialProgress";
import {
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

export type FormState = "idle" | "submitting" | "submitted" | "error";

export const FeedbackDialog: FunctionComponent<FeedbackDialogProps> = ({
  key,
  title = DEFAULT_TRANSLATIONS.DefaultQuestionLabel,
  position,
  translations = DEFAULT_TRANSLATIONS,
  inputMode = "comment-and-score",
  onClose,
  onDismiss,
  onSubmit,
}) => {
  const [formState, setFormState] = useState<FormState>("idle");

  const { isOpen, close } = useDialog({ onClose, initialValue: true });

  const autoClose = useTimer({
    enabled: position.type === "DIALOG",
    initialDuration: INACTIVE_DURATION_MS,
    onEnd: close,
  });

  const submit = useCallback(
    async (data: Omit<FeedbackSubmission, "feedbackId">) => {
      try {
        setFormState("submitting");
        const res = await onSubmit({ ...data });
        if (!res) throw new Error("Failed to submit feedback");
        setFormState("submitted");
        autoClose.startWithDuration(SUCCESS_DURATION_MS);
      } catch (error) {
        setFormState("error");
        console.error("Couldn't submit feedback with Reflag:", error);
        throw error;
      }
    },
    [autoClose, onSubmit],
  );

  const dismiss = useCallback(() => {
    autoClose.stop();
    close();
    onDismiss?.();
  }, [autoClose, close, onDismiss]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <Dialog
        key={key}
        close={close}
        containerId={feedbackContainerId}
        isOpen={isOpen}
        position={position}
        onDismiss={onDismiss}
      >
        <>
          <FeedbackForm
            key={key}
            inputMode={inputMode}
            question={title}
            t={{ ...DEFAULT_TRANSLATIONS, ...translations }}
            onInteraction={autoClose.stop}
            onSubmit={submit}
            formState={formState}
          />

          <button class="close" onClick={dismiss}>
            {!autoClose.stopped && autoClose.elapsedFraction > 0 && (
              <RadialProgress
                diameter={28}
                progress={1.0 - autoClose.elapsedFraction}
              />
            )}
            <Close width={18} height={18} />
          </button>
        </>
      </Dialog>
    </>
  );
};
