import { describe, expect, it, vi } from "vitest";

import { createAppClient } from "../src/api";
import type { Middleware } from "../src/generated/runtime";

const listFlagsResponse = {
  data: [],
  totalCount: 0,
  pageSize: 0,
  pageIndex: 0,
  sortBy: "name",
  sortOrder: "asc",
};

type ScopedListFlagsClient = {
  listFlags(args: Record<string, never>): Promise<unknown>;
};

describe("createAppClient", () => {
  it("preserves app scoping after withPreMiddleware", async () => {
    const fetchApi = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(listFlagsResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createAppClient("app-123", {
      basePath: "https://example.test",
      fetchApi,
    });

    const withPre = client.withPreMiddleware(async ({ url, init }) => ({
      url,
      init,
    }));

    await expect(
      (withPre as unknown as ScopedListFlagsClient).listFlags({}),
    ).resolves.toEqual(listFlagsResponse);
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
      "https://example.test/apps/app-123/flags",
    );
  });

  it("preserves app scoping after withMiddleware", async () => {
    const fetchApi = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(listFlagsResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createAppClient("app-123", {
      basePath: "https://example.test",
      fetchApi,
    });
    const middleware: Middleware = {
      pre: vi.fn(async ({ url, init }) => ({ url, init })),
    };

    const withMiddleware = client.withMiddleware(middleware);

    await expect(
      (withMiddleware as unknown as ScopedListFlagsClient).listFlags({}),
    ).resolves.toEqual(listFlagsResponse);
    expect(middleware.pre).toHaveBeenCalledTimes(1);
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
      "https://example.test/apps/app-123/flags",
    );
  });

  it("scopes entity management methods and serializes request bodies", async () => {
    const fetchApi = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Response(
          init?.method === "PUT"
            ? JSON.stringify({
                id: "company-1",
                name: "Acme, Inc.",
                attributes: { plan: "enterprise", seats: 50 },
              })
            : JSON.stringify({}),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    const client = createAppClient("app-123", {
      basePath: "https://example.test",
      fetchApi,
    });

    await expect(
      client.upsertCompany({
        envId: "env-456",
        companyId: "company-1",
        name: "Acme, Inc.",
        attributes: { plan: "enterprise", seats: 50 },
      }),
    ).resolves.toEqual({
      id: "company-1",
      name: "Acme, Inc.",
      attributes: { plan: "enterprise", seats: 50 },
    });
    expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
      "https://example.test/apps/app-123/envs/env-456/companies/company-1",
    );
    expect(fetchApi.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({
        name: "Acme, Inc.",
        attributes: { plan: "enterprise", seats: 50 },
      }),
    });

    await expect(
      client.deleteCompany({
        envId: "env-456",
        companyId: "company-1",
        deleteUsers: false,
      }),
    ).resolves.toEqual({});
    expect(String(fetchApi.mock.calls[1]?.[0])).toBe(
      "https://example.test/apps/app-123/envs/env-456/companies/company-1",
    );
    expect(fetchApi.mock.calls[1]?.[1]).toMatchObject({
      method: "DELETE",
      body: JSON.stringify({ deleteUsers: false }),
    });
  });

  it("preserves class-based middleware hooks after withMiddleware", async () => {
    const fetchApi = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(listFlagsResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createAppClient("app-123", {
      basePath: "https://example.test",
      fetchApi,
    });

    class PrototypePreMiddleware implements Middleware {
      preCalls = 0;

      async pre({ url, init }: { url: string; init: RequestInit }) {
        this.preCalls += 1;
        return { url, init };
      }
    }

    const middleware = new PrototypePreMiddleware();
    const withMiddleware = client.withMiddleware(middleware);

    await expect(
      (withMiddleware as unknown as ScopedListFlagsClient).listFlags({}),
    ).resolves.toEqual(listFlagsResponse);
    expect(middleware.preCalls).toBe(1);
    expect(fetchApi).toHaveBeenCalledTimes(1);
  });
});
