import { render } from "preact";

import { feedbackContainerId, toolbarContainerId } from "../src/ui/constants";

/** Unmount Preact before removing its hosts or tearing down jsdom globals. */
export function cleanupUi() {
  if (typeof document === "undefined") return;

  for (const id of [feedbackContainerId, toolbarContainerId]) {
    const host = document.getElementById(id);
    if (host?.shadowRoot) {
      render(null, host.shadowRoot);
    }
    host?.remove();
  }
}
