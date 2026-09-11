import { END_FLUSH_TIMEOUT_MS } from "./config";
import { TimeoutError, withTimeout } from "./utils";

type Callback = () => Promise<void>;

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

  // Signal listeners suppress Node's default termination behavior. Leave signals
  // and shutdown coordination to the application; only flush on natural exit.
  process.on("beforeExit", wrappedCallback);
  process.on("exit", () => {
    // If beforeExit never ran, the application may have flushed explicitly.
    if (state === false) {
      console.error(
        "[Reflag SDK] Failed to finalize the flushing of events on process exit.",
      );
    }
  });
}
