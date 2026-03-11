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
  window.addEventListener("beforeunload", markPageTearingDown, {
    capture: true,
  });
  window.addEventListener("pageshow", markPageActive, { capture: true });
  listenersRegistered = true;
}

function isAbortLikeError(error: unknown) {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.message === "Failed to fetch" ||
    error.message === "Load failed" ||
    error.message === "Network request failed"
  );
}

export function isPageLifecycleAbortError(error: unknown) {
  ensureListenersRegistered();
  return pageIsTearingDown && isAbortLikeError(error);
}

export function logLifecycleAwareNetworkError(
  logger: Pick<Logger, "debug" | "error">,
  message: string,
  error: unknown,
) {
  if (isPageLifecycleAbortError(error)) {
    logger.debug(`${message} (aborted during page teardown)`, error);
    return;
  }

  logger.error(message, error);
}

ensureListenersRegistered();
