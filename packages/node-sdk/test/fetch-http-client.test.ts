import { createServer } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { API_TIMEOUT_MS } from "../src/config";
import fetchClient from "../src/fetch-http-client";

const originalFetch = global.fetch;

// mock environment variables
vi.mock("../src/config", () => ({ API_TIMEOUT_MS: 100 }));

describe("fetchClient", () => {
  const url = "https://example.com/api";
  const headers = { "Content-Type": "application/json" };

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it("should make a POST request and return the response", async () => {
    const body = { key: "value" };
    const response = { ok: true, status: 200, body: { success: true } };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
      }),
    } as Response);

    const result = await fetchClient.post<typeof body, typeof response>(
      url,
      headers,
      body,
    );

    expect(result).toEqual(response);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: "post",
        headers,
        body: JSON.stringify(body),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("should make a GET request and return the response", async () => {
    const response = {
      ok: true,
      status: 200,
      body: { success: true },
      etag: 'W/"flags-v1"',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ ETag: 'W/"flags-v1"' }),
      json: async () => ({
        success: true,
      }),
    } as Response);

    const result = await fetchClient.get<typeof response>(url, headers);

    expect(result).toEqual(response);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: "get",
        headers,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("should timeout a POST request that takes too long", async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ ok: true, json: async () => ({}) }),
              API_TIMEOUT_MS + 100,
            ),
          ),
      );

    await fetchClient.post(url, headers, {});
    expect(vi.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(
      true,
    );
  });

  it("should timeout a GET request that takes too long", async () => {
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                headers: new Headers(),
                json: async () => ({}),
              }),
            API_TIMEOUT_MS + 100,
          ),
        ),
    );

    await fetchClient.get(url, headers);
    expect(vi.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(
      true,
    );
  });

  it("should handle POST non-20x responses", async () => {
    const response = {
      ok: false,
      status: 400,
      body: { error: "Something went wrong" },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Something went wrong" }),
    } as Response);

    const result = await fetchClient.post(url, headers, {});

    expect(result).toEqual(response);
  });

  it("should handle GET non-20x responses", async () => {
    const response = {
      ok: false,
      status: 400,
      body: { error: "Something went wrong" },
      etag: undefined,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ error: "Something went wrong" }),
    } as Response);

    const result = await fetchClient.get(url, headers);

    expect(result).toEqual(response);
  });

  it("returns a 304 without attempting to parse an empty JSON body", async () => {
    const response = new Response(null, {
      status: 304,
      headers: { ETag: 'W/"flags-v1"' },
    });
    const json = vi.spyOn(response, "json");
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await fetchClient.get(url, headers, API_TIMEOUT_MS);

    expect(result).toEqual({
      ok: false,
      status: 304,
      body: undefined,
      etag: 'W/"flags-v1"',
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("supports real conditional GETs while retaining cache: no-cache", async () => {
    global.fetch = originalFetch;
    const etag = 'W/"flags-v1"';
    const receivedValidators: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      const validator = request.headers["if-none-match"];
      receivedValidators.push(
        typeof validator === "string" ? validator : undefined,
      );
      response.setHeader("ETag", etag);
      response.setHeader("Cache-Control", "max-age=59");
      if (validator === etag) {
        response.writeHead(304).end();
      } else {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ success: true, features: [] }));
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }
      const originUrl = `http://127.0.0.1:${address.port}/features`;
      const initial = await fetchClient.get(originUrl, headers, 5000);
      const revalidated = await fetchClient.get(
        originUrl,
        { ...headers, "If-None-Match": initial.etag! },
        5000,
      );

      expect(initial.status).toBe(200);
      expect(initial.etag).toBe(etag);
      expect(revalidated).toMatchObject({
        status: 304,
        ok: false,
        body: undefined,
      });
      expect(receivedValidators).toEqual([undefined, etag]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("should not handle POST exceptions", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(fetchClient.post(url, headers, {})).rejects.toThrow(
      "Network error",
    );
  });

  it("should not handle GET exceptions", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(fetchClient.get(url, headers)).rejects.toThrow(
      "Network error",
    );
  });
});
