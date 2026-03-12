import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkEvent, BulkQueue } from "../src/bulkQueue";

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

const lateTrackEvent: BulkEvent = {
  type: "event",
  userId: "u1",
  companyId: "c1",
  event: "late-clicked",
  attributes: { source: "footer" },
};

describe("BulkQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("batches events and flushes after the delay", async () => {
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 75,
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

  it("logs normal retry scheduling for thrown bulk send failures", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(new Response("", { status: 200 }));
    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 10,
      retryBaseDelayMs: 20,
      retryMaxDelayMs: 20,
      logger,
    });

    await queue.enqueue(trackEvent);

    await vi.advanceTimersByTimeAsync(10);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("bulk retry scheduled", {
      retryInMs: 20,
      queueSize: 2,
      consecutiveFailures: 1,
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(sendBulk).toHaveBeenCalledTimes(2);
  });

  it("drops 4xx responses, logs error, and does not retry", async () => {
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(new Response("invalid payload", { status: 400 }));
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 10,
      retryBaseDelayMs: 20,
      retryMaxDelayMs: 20,
      logger,
    });

    await queue.enqueue(trackEvent);

    await vi.advanceTimersByTimeAsync(10);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(await queue.size()).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      "bulk request failed with non-retriable status; dropping batch",
      expect.objectContaining({
        status: 400,
        responseBody: "invalid payload",
      }),
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(sendBulk).toHaveBeenCalledTimes(1);
  });

  it("includes parsed API error details for non-retriable 4xx responses", async () => {
    const body = JSON.stringify({
      success: false,
      error: {
        message: 'Invalid publishableKey "pub_prod_vxuMahSZOnhzvAfiOnZ9rj"',
        code: "INVALID_API_KEY",
      },
    });
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(
        new Response(body, {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 10,
      logger,
    });

    await queue.enqueue(trackEvent);
    await vi.advanceTimersByTimeAsync(10);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("INVALID_API_KEY"),
      expect.objectContaining({
        status: 401,
        apiErrorCode: "INVALID_API_KEY",
        apiErrorMessage:
          'Invalid publishableKey "pub_prod_vxuMahSZOnhzvAfiOnZ9rj"',
      }),
    );
  });

  it("does not drop newly queued events when an older batch completes", async () => {
    let resolveFirstSend: ((res: Response) => void) | undefined;
    const firstSend = new Promise<Response>((resolve) => {
      resolveFirstSend = resolve;
    });
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockReturnValueOnce(firstSend)
      .mockResolvedValue(new Response("", { status: 200 }));

    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 1,
      maxSize: 3,
    });

    await queue.enqueue(userEvent);
    await queue.enqueue(companyEvent);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(sendBulk).toHaveBeenNthCalledWith(1, [userEvent, companyEvent]);

    await queue.enqueue(trackEvent);
    await queue.enqueue(lateTrackEvent);

    expect(await queue.size()).toBe(3);

    resolveFirstSend?.(new Response("", { status: 200 }));
    await vi.advanceTimersByTimeAsync(1);

    expect(sendBulk).toHaveBeenCalledTimes(2);
    expect(sendBulk).toHaveBeenNthCalledWith(2, [lateTrackEvent]);
    expect(await queue.size()).toBe(0);
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
    });

    await queue.enqueue(userEvent);
    await queue.enqueue(companyEvent);
    await queue.enqueue(trackEvent);

    expect(await queue.size()).toBe(2);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(sendBulk).toHaveBeenCalledWith([userEvent, companyEvent]);

    resolveSend?.(new Response("", { status: 200 }));
  });

  it("restores queue state between instances in the same tab", async () => {
    const firstSend = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const firstQueue = new BulkQueue(firstSend, {
      flushDelayMs: 10_000,
    });

    await firstQueue.enqueue(userEvent);
    expect(await firstQueue.size()).toBe(1);

    const secondSend = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const secondQueue = new BulkQueue(secondSend, {
      flushDelayMs: 10_000,
    });

    expect(await secondQueue.size()).toBe(1);
    await secondQueue.flush();
    expect(secondSend).toHaveBeenCalledWith([userEvent]);
  });

  it("requires a second flush to send pending events after an in-flight batch", async () => {
    let resolveFirstSend: ((res: Response) => void) | undefined;
    const firstSend = new Promise<Response>((resolve) => {
      resolveFirstSend = resolve;
    });
    const sendBulk = vi
      .fn<(events: BulkEvent[]) => Promise<Response>>()
      .mockReturnValueOnce(firstSend)
      .mockResolvedValue(new Response("", { status: 200 }));

    const queue = new BulkQueue(sendBulk, {
      flushDelayMs: 10_000,
      maxSize: 4,
    });

    await queue.enqueue(userEvent);
    await queue.enqueue(companyEvent);
    void queue.flush();
    expect(sendBulk).toHaveBeenNthCalledWith(1, [userEvent, companyEvent]);

    await queue.enqueue(trackEvent);
    await queue.enqueue(lateTrackEvent);

    let waitedForInFlight = false;
    const flushWhileInFlight = queue.flush().then(() => {
      waitedForInFlight = true;
    });

    await Promise.resolve();
    expect(waitedForInFlight).toBe(false);

    resolveFirstSend?.(new Response("", { status: 200 }));
    await flushWhileInFlight;

    expect(waitedForInFlight).toBe(true);
    expect(sendBulk).toHaveBeenCalledTimes(1);
    expect(await queue.size()).toBe(2);

    await queue.flush();
    expect(sendBulk).toHaveBeenCalledTimes(2);
    expect(sendBulk).toHaveBeenNthCalledWith(2, [trackEvent, lateTrackEvent]);
    expect(await queue.size()).toBe(0);
  });
});
