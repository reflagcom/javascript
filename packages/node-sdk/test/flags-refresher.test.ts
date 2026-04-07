import { describe, expect, it, vi } from "vitest";

import { createFlagsSyncController } from "../src/flags-refresher";

describe("flagsSyncController", () => {
  it("catches background refresh failures in in-request mode", async () => {
    const error = new Error("refresh failed");
    const cache = {
      refresh: vi.fn().mockRejectedValue(error),
      getLastRefreshAt: vi.fn().mockReturnValue(undefined),
    } as any;
    const logger = {
      warn: vi.fn(),
    } as any;

    const controller = createFlagsSyncController({
      mode: "in-request",
      cache,
      intervalMs: 1000,
      pushUrl: "https://pubsub.reflag.com/sse",
      headers: {},
      logger,
    });

    controller.onAccess?.();

    await vi.waitFor(() => {
      expect(cache.refresh).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        "background flag refresh failed",
        error,
      );
    });
  });
});
