import { OpenFeedbackFormOptions } from "./types";

export function openFeedbackForm(_options: OpenFeedbackFormOptions): void {
  // React Native doesn't support the web feedback UI.
  // Users should implement their own UI and use `feedback` or `useSendFeedback`.
  console.warn(
    "[Reflag] Feedback UI is not supported in React Native. " +
      "Use `feedback` or `useSendFeedback` with a custom UI instead.",
  );
}
