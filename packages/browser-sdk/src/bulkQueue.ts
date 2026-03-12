import { logResponseError } from "./utils/responseError";
import { BULK_QUEUE_FLUSH_DELAY_MS, BULK_QUEUE_MAX_SIZE } from "./config";
import { Logger } from "./logger";

const DROP_ERROR_THROTTLE_MS = 15 * 60 * 1000;

type PayloadContext = {
  active?: boolean;
};

export type BulkEvent =
  | {
      type: "company";
      companyId: string;
      userId?: string;
      attributes?: Record<string, any>;
      context?: PayloadContext;
    }
  | {
      type: "user";
      userId: string;
      attributes?: Record<string, any>;
      context?: PayloadContext;
    }
  | {
      type: "event";
      event: string;
      companyId?: string;
      userId: string;
      attributes?: Record<string, any>;
      context?: PayloadContext;
    }
  | {
      type: "feature-flag-event";
      action: "check-is-enabled" | "check-config";
      key: string;
      targetingVersion?: number;
      evalResult?: boolean | { key: string; payload: any };
      evalContext?: Record<string, any>;
      evalRuleResults?: boolean[];
      evalMissingFields?: string[];
    }
  | {
      type: "prompt-event";
      action: "received" | "shown" | "dismissed";
      featureId: string;
      promptId: string;
      userId: string;
      promptedQuestion: string;
    };

export type BulkQueueOptions = {
  flushDelayMs?: number;
  maxSize?: number;
  logger?: Logger;
};

export class BulkQueue {
  private readonly flushDelayMs: number;
  private readonly maxSize: number;
  private readonly logger?: Logger;
  private readonly sendBulk: (events: BulkEvent[]) => Promise<Response>;

  private queue: BulkEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlightBatch: BulkEvent[] | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private lastDropErrorAt: number | null = null;
  private totalDroppedEvents = 0;
  private droppedSinceLastError = 0;

  constructor(
    sendBulk: (events: BulkEvent[]) => Promise<Response>,
    opts: BulkQueueOptions = {},
  ) {
    this.sendBulk = sendBulk;
    this.flushDelayMs = opts.flushDelayMs ?? BULK_QUEUE_FLUSH_DELAY_MS;
    this.maxSize = opts.maxSize ?? BULK_QUEUE_MAX_SIZE;
    this.logger = opts.logger;
  }

  async enqueue(event: BulkEvent) {
    this.queue.push(event);
    this.trimPendingQueueToCapacity();

    const maxPending = Math.max(0, this.maxSize - this.getInFlightBatchSize());
    if (this.queue.length > 0 && this.queue.length >= maxPending) {
      void this.flush();
      return;
    }

    this.schedule(this.flushDelayMs);
  }

  async flush() {
    if (this.inFlightPromise) {
      await this.inFlightPromise;
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const batch = this.queue.splice(0, this.maxSize);
    this.inFlightBatch = batch;

    const sendPromise = this.sendBatch(batch);
    this.inFlightPromise = sendPromise;
    try {
      await sendPromise;
    } finally {
      if (this.inFlightPromise === sendPromise) {
        this.inFlightPromise = null;
      }
      this.inFlightBatch = null;
    }

    if (this.queue.length > 0 && !this.timer) {
      this.schedule(this.flushDelayMs);
    }
  }

  async size() {
    return this.queue.length + this.getInFlightBatchSize();
  }

  private schedule(delayMs: number) {
    if (this.timer || this.inFlightPromise || this.queue.length === 0) {
      return;
    }

    if (delayMs <= 0) {
      void this.flush();
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  private async sendBatch(batch: BulkEvent[]) {
    let res: Response;
    try {
      res = await this.sendBulk(batch);
    } catch (error) {
      this.logger?.error("bulk request failed; dropping batch", {
        error,
        batchSize: batch.length,
      });
      return;
    }

    if (!res.ok) {
      if (this.logger) {
        await logResponseError({
          logger: this.logger,
          res,
          message: "bulk request failed; dropping batch",
        });
      }
      return;
    }
  }

  private getInFlightBatchSize() {
    return this.inFlightBatch?.length ?? 0;
  }

  private trimPendingQueueToCapacity() {
    const maxPending = Math.max(0, this.maxSize - this.getInFlightBatchSize());
    if (this.queue.length <= maxPending) {
      return;
    }

    const removed = this.queue.length - maxPending;
    this.queue = maxPending === 0 ? [] : this.queue.slice(-maxPending);
    this.totalDroppedEvents += removed;
    this.droppedSinceLastError += removed;

    const now = Date.now();
    if (
      !this.lastDropErrorAt ||
      now - this.lastDropErrorAt >= DROP_ERROR_THROTTLE_MS
    ) {
      this.logger?.error("bulk queue dropped events due to max size", {
        droppedEvents: this.droppedSinceLastError,
        totalDroppedEvents: this.totalDroppedEvents,
        queueSize: this.queue.length + this.getInFlightBatchSize(),
        maxSize: this.maxSize,
      });
      this.lastDropErrorAt = now;
      this.droppedSinceLastError = 0;
    }
  }
}
