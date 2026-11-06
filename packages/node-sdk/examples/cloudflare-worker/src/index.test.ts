import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import worker from "./index";

const sdk = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getFlags: vi.fn().mockReturnValue({ "example-flag": { isEnabled: true } }),
  flush: vi.fn().mockResolvedValue(undefined),
}));

// Exercise the Worker handler without credentials or outbound Reflag requests.
vi.mock("../../../", () => ({
  EdgeClient: class {
    initialize = sdk.initialize;
    getFlags = sdk.getFlags;
    flush = sdk.flush;
  },
}));

beforeEach(() => vi.clearAllMocks());

it("evaluates flags for the requested context and flushes background work", async () => {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request("https://example.test/?user.id=user42&company.id=company99"),
    {} as Env,
    ctx,
  );
  await waitOnExecutionContext(ctx);

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"example-flag"');
  expect(sdk.initialize).toHaveBeenCalledOnce();
  expect(sdk.getFlags).toHaveBeenCalledWith({
    user: { id: "user42" },
    company: { id: "company99" },
  });
  expect(sdk.flush).toHaveBeenCalledOnce();
});

it("allows requests without user or company IDs", async () => {
  const ctx = createExecutionContext();
  await worker.fetch(new Request("https://example.test/"), {} as Env, ctx);
  await waitOnExecutionContext(ctx);

  expect(sdk.getFlags).toHaveBeenCalledWith({
    user: { id: undefined },
    company: { id: undefined },
  });
});
