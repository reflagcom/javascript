import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkEvent, BulkQueue } from "../src/bulkQueue";
import { StorageAdapter } from "../src/storage";

function createMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>();

  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
    removeItem: async (key) => {
      store.delete(key);
    },
  };
}

const userEvent: BulkEvent = {
  type: "user",
  userId: "u1",
  attributes: { name: "User" },
};

const companyEvent: BulkEvent = {
  type: "company",
  userId: "u1",
  companyId: "c1",
  attributes: { name: "Company" },
};

const trackEvent: BulkEvent = {
  type: "event",
  userId: "u1",
  companyId: "c1",
  event: "clicked",
  attributes: { source: "banner" },
};

describe("BulkQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("batches events and flushes after the delay", async () => {
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 75,
      storage: createMemoryStorage(),
    });

    await queue.enqueue(userEvent);
    await queue.enqueue(companyEvent);

    expect(sendBulk).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(74);
    expect(sendBulk).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(sendBulk).toHaveBeenCalledWith([userEvent, companyEvent]);
  });

  it("retries failed bulk requests later", async () => {
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(new Response("", { status: 200 }));
    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 10,
      retryBaseDelayMs: 20,
      retryMaxDelayMs: 20,
      storage: createMemoryStorage(),
    });

    await queue.enqueue(trackEvent);

    await vi.advanceTimersByTimeAsync(10);
    expect(sendBulk).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(19);
    expect(sendBulk).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(sendBulk).toHaveBeenCalledTimes(2);
    expect(sendBulk).toHaveBeenNthCalledWith(2, [trackEvent]);
  });

  it("keeps only the newest events when max size is exceeded", async () => {
    let resolveSend: ((value: Response) => void) | undefined;
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveSend = resolve;
          }),
      );
    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 10_000,
      maxSize: 2,
      storage: createMemoryStorage(),
    });

    await queue.enqueue(userEvent);
    await queue.enqueue(companyEvent);
    await queue.enqueue(trackEvent);

    expect(await queue.size()).toBe(2);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(sendBulk).toHaveBeenCalledWith([userEvent, companyEvent]);

    resolveSend?.(new Response("", { status: 200 }));
  });

  it("restores queued events from storage", async () => {
    const storage = createMemoryStorage();
    const firstSend = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const firstQueue = new BulkQueue(firstSend, {
      flushDelayMs: 10_000,
      storage,
    });

    await firstQueue.enqueue(userEvent);
    expect(await firstQueue.size()).toBe(1);

    const secondSend = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const secondQueue = new BulkQueue(secondSend, {
      flushDelayMs: 10_000,
      storage,
    });

    expect(await secondQueue.size()).toBe(1);

    await secondQueue.flush();
    expect(secondSend).toHaveBeenCalledWith([userEvent]);
  });
});
