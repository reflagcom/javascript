import { Logger } from "../logger";

let pageIsTearingDown = false;
let listenersRegistered = false;

function markPageActive() {
  pageIsTearingDown = false;
}

function markPageTearingDown() {
  pageIsTearingDown = true;
}

function ensureListenersRegistered() {
  if (
    listenersRegistered ||
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  ) {
    return;
  }

  window.addEventListener("pagehide", markPageTearingDown, { capture: true });
  window.addEventListener("pageshow", markPageActive, { capture: true });
  listenersRegistered = true;
}

export function isPageTearingDown() {
  ensureListenersRegistered();
  return pageIsTearingDown;
}

export function logLifecycleAwareFetchError(
  logger: Pick<Logger, "debug" | "error">,
  message: string,
  error: unknown,
) {
  if (isPageTearingDown()) {
    logger.debug(`${message} (aborted during page teardown)`, error);
    return;
  }

  logger.error(message, error);
}

ensureListenersRegistered();
