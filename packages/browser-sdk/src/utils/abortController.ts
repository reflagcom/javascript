export type AbortControllerLike = {
  signal: AbortSignal;
  abort(): void;
};

type AbortSignalListener = () => void;

export function createAbortController(): AbortControllerLike {
  try {
    if (
      typeof AbortController !== "undefined" &&
      typeof EventTarget !== "undefined"
    ) {
      return new AbortController();
    }
  } catch {
    // fall through to shim
  }

  let aborted = false;
  const listeners = new Set<AbortSignalListener>();

  const signal = {
    get aborted() {
      return aborted;
    },
    addEventListener(_type: string, listener: AbortSignalListener) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: AbortSignalListener) {
      listeners.delete(listener);
    },
  } as AbortSignal;

  return {
    signal,
    abort() {
      if (aborted) return;
      aborted = true;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
