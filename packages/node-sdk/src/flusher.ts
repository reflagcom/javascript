import { constants } from "os";

import { END_FLUSH_TIMEOUT_MS } from "./config";
import { TimeoutError, withTimeout } from "./utils";

type Callback = () => Promise<void>;

const killSignals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const;

export function subscribe(
  callback: Callback,
  timeout: number = END_FLUSH_TIMEOUT_MS,
) {
  let state: boolean | undefined;

  const wrappedCallback = async () => {
    if (state !== undefined) {
      return;
    }

    state = false;

    try {
      await withTimeout(callback(), timeout);
    } catch (error) {
      if (error instanceof TimeoutError) {
        console.error(
          "[Reflag SDK] Timeout while flushing events on process exit.",
        );
      } else {
        console.error(
          "[Reflag SDK] An error occurred while flushing events on process exit.",
          error,
        );
      }
    }

    state = true;
  };

  killSignals.forEach((signal) => {
    const hasListeners = process.listenerCount(signal) > 0;

    if (hasListeners) {
      process.prependListener(signal, wrappedCallback);
    } else {
      process.on(signal, async () => {
        await wrappedCallback();
        process.exit(0x80 + constants.signals[signal]);
      });
    }
  });

  process.on("beforeExit", wrappedCallback);
  process.on("exit", () => {
    if (!state) {
      console.error(
        "[Reflag SDK] Failed to finalize the flushing of events on process exit.",
      );
    }
  });
}
