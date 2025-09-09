import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import BatchBuffer from "../src/batch-buffer";
import { BATCH_INTERVAL_MS, BATCH_MAX_SIZE } from "../src/config";
import { Logger } from "../src/types";

describe("BatchBuffer", () => {
  const mockFlushHandler = vi.fn();

  const mockLogger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should throw an error if options are invalid", () => {
      expect(() => new BatchBuffer(null as any)).toThrow(
        "options must be an object",
      );

      expect(() => new BatchBuffer("bad" as any)).toThrow(
        "options must be an object",
      );

      expect(
        () => new BatchBuffer({ flushHandler: null as any } as any),
      ).toThrow("flushHandler must be a function");

      expect(
        () => new BatchBuffer({ flushHandler: "not a function" } as any),
      ).toThrow("flushHandler must be a function");

      expect(
        () =>
          new BatchBuffer({
            flushHandler: mockFlushHandler,
            logger: "string",
          } as any),
      ).toThrow("logger must be an object");

      expect(
        () =>
          new BatchBuffer({
            flushHandler: mockFlushHandler,
            maxSize: -1,
          } as any),
      ).toThrow("maxSize must be greater than 0");
    });

    it("should initialize with specified values", () => {
      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        maxSize: 22,
        intervalMs: 33,
      });

      expect(buffer).toEqual({
        buffer: [],
        flushHandler: mockFlushHandler,
        timer: null,
        intervalMs: 33,
        logger: undefined,
        maxSize: 22,
      });
    });

    it("should initialize with default values if not provided", () => {
      const buffer = new BatchBuffer({ flushHandler: mockFlushHandler });
      expect(buffer).toEqual({
        buffer: [],
        flushHandler: mockFlushHandler,
        intervalMs: BATCH_INTERVAL_MS,
        maxSize: BATCH_MAX_SIZE,
        timer: null,
      });
    });
  });

  describe("add", () => {
    it("should add item to the buffer and flush immediately if maxSize is reached", async () => {
      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        maxSize: 1,
      });

      await buffer.add("item1");

      expect(mockFlushHandler).toHaveBeenCalledWith(["item1"]);
      expect(mockFlushHandler).toHaveBeenCalledTimes(1);
    });

    it("should set a flush timer if buffer does not reach maxSize", async () => {
      vi.useFakeTimers();

      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        maxSize: 2,
        intervalMs: 1000,
      });

      await buffer.add("item1");
      expect(mockFlushHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(mockFlushHandler).toHaveBeenCalledWith(["item1"]);
      expect(mockFlushHandler).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe("flush", () => {
    it("should not do anything if there are no items to flush", async () => {
      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        logger: mockLogger,
      });

      await buffer.flush();

      expect(mockFlushHandler).not.toHaveBeenCalled();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "buffer is empty. nothing to flush",
      );
    });

    it("calling flush simultaneously should only flush data once", async () => {
      let itemsFlushed = 0;
      const buffer = new BatchBuffer({
        flushHandler: async (items) => {
          itemsFlushed += items.length;
          await new Promise((resolve) => setTimeout(resolve, 100));
          mockFlushHandler();
        },
        logger: mockLogger,
      });

      await buffer.add("item1");
      await Promise.all([buffer.flush(), buffer.flush()]);
      expect(itemsFlushed).toBe(1);
    });

    it("should flush buffer", async () => {
      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        logger: mockLogger,
      });

      await buffer.add("item1");
      await buffer.flush();

      expect(mockFlushHandler).toHaveBeenCalledWith(["item1"]);
      await buffer.flush();

      expect(mockFlushHandler).toHaveBeenCalledTimes(1);
    });

    it("should log correctly during flush", async () => {
      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        logger: mockLogger,
      });

      await buffer.add("item1");
      await buffer.flush();

      expect(mockLogger.info).toHaveBeenCalledWith("flushed buffered items", {
        count: 1,
      });
    });
  });

  describe("timer logic", () => {
    beforeAll(() => {
      vi.useFakeTimers();
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    beforeEach(() => {
      vi.clearAllTimers();
      mockFlushHandler.mockReset();
    });

    it("should start the normal timer when adding first item", async () => {
      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        logger: mockLogger,
        intervalMs: 100,
      });

      expect(buffer["timer"]).toBeNull();
      await buffer.add("item1");

      expect(buffer["timer"]).toBeDefined();

      await vi.advanceTimersByTimeAsync(100);
      expect(mockFlushHandler).toHaveBeenCalledTimes(1);

      expect(buffer["timer"]).toBeNull();

      expect(mockLogger.info).toHaveBeenCalledWith("flushed buffered items", {
        count: 1,
      });
    });

    it("should stop the normal timer if flushed manually", async () => {
      const buffer = new BatchBuffer({
        flushHandler: mockFlushHandler,
        logger: mockLogger,
        intervalMs: 100,
        maxSize: 2,
      });

      await buffer.add("item1");
      await buffer.add("item2");

      expect(buffer["timer"]).toBeNull();

      expect(mockLogger.info).toHaveBeenCalledWith("flushed buffered items", {
        count: 2,
      });
    });
  });
});
