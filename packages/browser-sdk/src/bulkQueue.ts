import {
  BULK_QUEUE_FLUSH_DELAY_MS,
  BULK_QUEUE_MAX_SIZE,
  BULK_QUEUE_RETRY_BASE_DELAY_MS,
  BULK_QUEUE_RETRY_MAX_DELAY_MS,
} from "./config";
import { Logger } from "./logger";
import { logResponseError } from "./utils/responseError";

const BULK_QUEUE_STORAGE_KEY = "__reflag_bulk_queue_v1";
const WARN_AFTER_CONSECUTIVE_FAILURES = 10;
const WARN_AFTER_FAILURE_MS = 5 * 60 * 1000;
const WARN_THROTTLE_MS = 15 * 60 * 1000;
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
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  storageKey?: string;
  logger?: Logger;
};

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") {
      return null;
    }
    return sessionStorage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBulkEvent(value: unknown): value is BulkEvent {
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "user") {
    return typeof value.userId === "string";
  }

  if (value.type === "company") {
    return typeof value.companyId === "string";
  }

  if (value.type === "event") {
    return typeof value.userId === "string" && typeof value.event === "string";
  }

  if (value.type === "feature-flag-event") {
    return (
      typeof value.key === "string" &&
      (value.action === "check-is-enabled" || value.action === "check-config")
    );
  }

  if (value.type === "prompt-event") {
    return (
      typeof value.featureId === "string" &&
      typeof value.promptId === "string" &&
      typeof value.userId === "string" &&
      typeof value.promptedQuestion === "string" &&
      (value.action === "received" ||
        value.action === "shown" ||
        value.action === "dismissed")
    );
  }

  return false;
}

export class BulkQueue {
  private readonly flushDelayMs: number;
  private readonly maxSize: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly storageKey: string;
  private readonly storage: Storage | null;
  private readonly logger?: Logger;
  private readonly sendBulk: (events: BulkEvent[]) => Promise<Response>;

  private queue: BulkEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlightBatch: BulkEvent[] | null = null;
  private inFlightPromise: Promise<number | null> | null = null;
  private retryCount = 0;
  private consecutiveFailures = 0;
  private firstFailureAt: number | null = null;
  private lastWarnAt: number | null = null;
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
    this.retryBaseDelayMs =
      opts.retryBaseDelayMs ?? BULK_QUEUE_RETRY_BASE_DELAY_MS;
    this.retryMaxDelayMs =
      opts.retryMaxDelayMs ?? BULK_QUEUE_RETRY_MAX_DELAY_MS;
    this.storageKey = opts.storageKey ?? BULK_QUEUE_STORAGE_KEY;
    this.storage = getSessionStorage();
    this.logger = opts.logger;

    this.restoreQueueFromStorage();
    if (this.queue.length > 0) {
      this.schedule(this.flushDelayMs);
    }
  }

  async enqueue(event: BulkEvent) {
    this.queue.push(event);
    this.trimPendingQueueToCapacity();
    this.persistQueueToStorage();

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
    let nextDelayMs: number | null = null;
    try {
      nextDelayMs = await sendPromise;
    } finally {
      if (this.inFlightPromise === sendPromise) {
        this.inFlightPromise = null;
      }
      this.inFlightBatch = null;
      this.persistQueueToStorage();
    }

    if (this.queue.length > 0 && !this.timer && nextDelayMs !== null) {
      this.schedule(nextDelayMs);
    }
  }

  async size() {
    return this.queue.length + this.getInFlightBatchSize();
  }

  private getRetryDelay() {
    const maxExponent = 6;
    const exponent = Math.min(this.retryCount - 1, maxExponent);
    return Math.min(
      this.retryBaseDelayMs * 2 ** exponent,
      this.retryMaxDelayMs,
    );
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
    let nextDelayMs: number | null = null;

    try {
      const res = await this.sendBulk(batch);
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          this.retryCount = 0;
          this.firstFailureAt = null;
          this.consecutiveFailures = 0;
          this.lastWarnAt = null;
          if (this.logger) {
            await logResponseError({
              logger: this.logger,
              res,
              message:
                "bulk request failed with non-retriable status; dropping batch",
            });
          }
          nextDelayMs = this.flushDelayMs;
        } else {
          throw new Error(`unexpected status ${res.status}`);
        }
      } else {
        this.retryCount = 0;
        if (this.firstFailureAt !== null && this.consecutiveFailures > 0) {
          this.logger?.info("bulk delivery recovered", {
            outageMs: Date.now() - this.firstFailureAt,
            failedAttempts: this.consecutiveFailures,
          });
        }
        this.firstFailureAt = null;
        this.consecutiveFailures = 0;
        this.lastWarnAt = null;
        nextDelayMs = this.flushDelayMs;
      }
    } catch (error) {
      this.queue = batch.concat(this.queue);

      const now = Date.now();
      if (this.firstFailureAt === null) {
        this.firstFailureAt = now;
      }
      this.consecutiveFailures += 1;
      this.retryCount += 1;
      const retryInMs = this.getRetryDelay();
      nextDelayMs = retryInMs;
      this.logger?.info("bulk retry scheduled", {
        retryInMs,
        queueSize: this.queue.length + this.getInFlightBatchSize(),
        consecutiveFailures: this.consecutiveFailures,
      });

      const outageMs = now - this.firstFailureAt;
      const shouldWarn =
        this.consecutiveFailures >= WARN_AFTER_CONSECUTIVE_FAILURES ||
        outageMs >= WARN_AFTER_FAILURE_MS;
      const canWarnNow =
        this.lastWarnAt === null || now - this.lastWarnAt >= WARN_THROTTLE_MS;
      if (shouldWarn && canWarnNow) {
        this.logger?.warn("bulk delivery degraded", {
          consecutiveFailures: this.consecutiveFailures,
          outageMs,
          queueSize: this.queue.length + this.getInFlightBatchSize(),
          retryInMs,
          error,
        });
        this.lastWarnAt = now;
      }
    }

    return nextDelayMs;
  }

  private getPersistedQueue() {
    const inFlight = this.inFlightBatch ?? [];
    return inFlight.concat(this.queue).slice(-this.maxSize);
  }

  private persistQueueToStorage() {
    if (!this.storage) {
      return;
    }

    try {
      const persisted = this.getPersistedQueue();
      if (persisted.length === 0) {
        this.storage.removeItem(this.storageKey);
        return;
      }

      this.storage.setItem(this.storageKey, JSON.stringify(persisted));
    } catch {
      // ignore persistence failures
    }
  }

  private restoreQueueFromStorage() {
    if (!this.storage) {
      return;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) {
        return;
      }

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("invalid stored bulk queue");
      }

      this.queue = parsed.filter(isBulkEvent).slice(-this.maxSize);
      if (this.queue.length === 0) {
        this.storage.removeItem(this.storageKey);
      }
    } catch {
      this.queue = [];
      try {
        this.storage.removeItem(this.storageKey);
      } catch {
        // ignore cleanup failures
      }
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
