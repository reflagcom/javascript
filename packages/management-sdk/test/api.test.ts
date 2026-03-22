import { describe, expect, it, vi } from "vitest";

import { Api, ReflagApiError } from "../src/api";

describe("Api error normalization", () => {
  it("maps JSON API errors to ReflagApiError", async () => {
    const fetchApi = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            error: {
              message: "Bad request payload",
              code: "INVALID_REQUEST",
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    const api = new Api({
      basePath: "https://example.test",
      accessToken: "test-token",
      fetchApi,
    });

    const error = await api.listApps().catch((e) => e);
    expect(error).toBeInstanceOf(ReflagApiError);
    expect(error).toMatchObject({
      status: 400,
      message: "Bad request payload",
      code: "INVALID_REQUEST",
    });
    expect(error.details).toEqual({
      error: {
        message: "Bad request payload",
        code: "INVALID_REQUEST",
      },
    });
  });

  it("maps text errors to ReflagApiError with text details", async () => {
    const fetchApi = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("Service unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    const api = new Api({
      basePath: "https://example.test",
      accessToken: "test-token",
      fetchApi,
    });

    const error = await api.listApps().catch((e) => e);
    expect(error).toBeInstanceOf(ReflagApiError);
    expect(error).toMatchObject({
      status: 503,
      message: "Request failed with 503: Service unavailable",
      code: undefined,
      details: "Service unavailable",
    });
  });

  it("handles invalid JSON error bodies safely", async () => {
    const fetchApi = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("{not-json", {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const api = new Api({
      basePath: "https://example.test",
      accessToken: "test-token",
      fetchApi,
    });

    const error = await api.listApps().catch((e) => e);
    expect(error).toBeInstanceOf(ReflagApiError);
    expect(error).toMatchObject({
      status: 500,
      message: "Request failed with 500",
      code: undefined,
      details: undefined,
    });
  });
});
