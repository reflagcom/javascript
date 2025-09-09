import { BATCH_INTERVAL_MS, BATCH_MAX_SIZE } from "./config";
import { BatchBufferOptions, Logger } from "./types";
import { isObject, ok } from "./utils";

/**
 * A buffer that accumulates items and flushes them in batches.
 * @typeparam T - The type of items to buffer.
 */
export default class BatchBuffer<T> {
  private buffer: T[] = [];
  private flushHandler: (items: T[]) => Promise<void>;
  private logger?: Logger;
  private maxSize: number;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Creates a new `BatchBuffer` instance.
   * @param options - The options to configure the buffer.
   * @throws If the options are invalid.
   */
  constructor(options: BatchBufferOptions<T>) {
    ok(isObject(options), "options must be an object");
    ok(
      typeof options.flushHandler === "function",
      "flushHandler must be a function",
    );
    ok(isObject(options.logger) || !options.logger, "logger must be an object");
    ok(
      (typeof options.maxSize === "number" && options.maxSize > 0) ||
        typeof options.maxSize !== "number",
      "maxSize must be greater than 0",
    );
    ok(
      (typeof options.intervalMs === "number" && options.intervalMs >= 0) ||
        typeof options.intervalMs !== "number",
      "intervalMs must be greater than or equal to 0",
    );

    this.flushHandler = options.flushHandler;
    this.logger = options.logger;
    this.maxSize = options.maxSize ?? BATCH_MAX_SIZE;
    this.intervalMs = options.intervalMs ?? BATCH_INTERVAL_MS;
  }

  /**
   * Adds an item to the buffer.
   *
   * @param item - The item to add.
   */
  public async add(item: T) {
    this.buffer.push(item);

    if (this.buffer.length >= this.maxSize) {
      await this.flush();
    } else if (!this.timer && this.intervalMs > 0) {
      this.timer = setTimeout(() => this.flush(), this.intervalMs).unref();
    }
  }

  public async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) {
      this.logger?.debug("buffer is empty. nothing to flush");
      return;
    }

    const flushingBuffer = this.buffer;
    this.buffer = [];

    try {
      await this.flushHandler(flushingBuffer);

      this.logger?.info("flushed buffered items", {
        count: flushingBuffer.length,
      });
    } catch (error) {
      this.logger?.error("flush of buffered items failed; discarding items", {
        error,
        count: flushingBuffer.length,
      });
    }
  }
}
