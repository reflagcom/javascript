import { Position } from "../../ui/types";

import { OpenFeedbackFormOptions } from "./types";

export const DEFAULT_POSITION: Position = {
  type: "DIALOG",
  placement: "bottom-right",
};

export function openFeedbackForm(_options: OpenFeedbackFormOptions): void {
  // React Native doesn't support the web feedback UI.
  // Users should implement their own UI and use `feedback` or `useSendFeedback`.
  console.warn(
    "[Reflag] Feedback UI is not supported in React Native. " +
      "Use `feedback` or `useSendFeedback` with a custom UI instead.",
  );
}
