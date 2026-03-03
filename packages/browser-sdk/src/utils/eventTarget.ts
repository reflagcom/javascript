export type EventListener = () => void;

export type EventTargetLike = {
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | { signal?: AbortSignal | null },
  ): void;
  removeEventListener(type: string, listener: EventListener): void;
  dispatchEvent(event: { type: string }): void;
};

class SimpleEventTarget implements EventTargetLike {
  private listeners = new Map<string, Set<EventListener>>();

  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | { signal?: AbortSignal | null },
  ) {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }

    bucket.add(listener);

    if (options && typeof options === "object" && options.signal) {
      const signal = options.signal;
      if (signal.aborted) {
        bucket.delete(listener);
        return;
      }

      const onAbort = () => {
        bucket?.delete(listener);
        signal.removeEventListener?.("abort", onAbort);
      };

      signal.addEventListener?.("abort", onAbort, { once: true });
    }
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { type: string }) {
    const bucket = this.listeners.get(event.type);
    if (!bucket) return;

    for (const listener of bucket) {
      listener();
    }
  }
}

export function createEventTarget(): EventTargetLike {
  return new SimpleEventTarget();
}
