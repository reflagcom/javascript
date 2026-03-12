import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { HttpClient } from "../src/httpClient";

const cases = [
  ["https://front.reflag.com", "https://front.reflag.com/path"],
  ["https://front.reflag.com/", "https://front.reflag.com/path"],
  [
    "https://front.reflag.com/basepath",
    "https://front.reflag.com/basepath/path",
  ],
];

test.each(cases)(
  "url construction with `/path`: %s -> %s",
  (base, expected) => {
    const client = new HttpClient("publishableKey", { baseUrl: base });
    expect(client.getUrl("/path").toString()).toBe(expected);
  },
);

test.each(cases)("url construction with `path`: %s -> %s", (base, expected) => {
  const client = new HttpClient("publishableKey", { baseUrl: base });
  expect(client.getUrl("path").toString()).toBe(expected);
});

describe("sets `credentials`", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  test("default credentials", async () => {
    const client = new HttpClient("publishableKey");

    await client.get({ path: "/test" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ credentials: undefined }),
    );

    await client.post({ path: "/test", body: {} });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ credentials: undefined }),
    );
  });

  test("custom credentials", async () => {
    const client = new HttpClient("publishableKey", { credentials: "include" });

    await client.get({ path: "/test" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ credentials: "include" }),
    );

    await client.post({ path: "/test", body: {} });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  test("uses keepalive for small request bodies when requested", async () => {
    const client = new HttpClient("publishableKey");

    await client.post({ path: "/test", body: { ok: true }, keepalive: true });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ keepalive: true }),
    );
  });

  test("does not use keepalive for large request bodies", async () => {
    const client = new HttpClient("publishableKey");
    const largeBody = { payload: "x".repeat(70 * 1024) };

    await client.post({ path: "/test", body: largeBody, keepalive: true });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ keepalive: false }),
    );
  });

  test("does not use keepalive when in-flight keepalive bytes would exceed the budget", async () => {
    let resolveFirstFetch: ((value: Response) => void) | undefined;
    vi.mocked(global.fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstFetch = resolve;
          }),
      )
      .mockResolvedValueOnce(new Response());

    const client = new HttpClient("publishableKey");
    const body = { payload: "x".repeat(35 * 1024) };

    const firstRequest = client.post({
      path: "/test",
      body,
      keepalive: true,
    });
    await Promise.resolve();

    await client.post({ path: "/test", body, keepalive: true });

    expect(vi.mocked(global.fetch).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ keepalive: true }),
    );
    expect(vi.mocked(global.fetch).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ keepalive: false }),
    );

    resolveFirstFetch?.(new Response());
    await firstRequest;
  });

  test("does not use keepalive when the in-flight request count is at the limit", async () => {
    const pendingRequests: Array<{
      resolve: (value: Response) => void;
    }> = [];
    let callCount = 0;
    vi.mocked(global.fetch).mockImplementation(() => {
      callCount += 1;
      if (callCount > 15) {
        return Promise.resolve(new Response());
      }

      let resolve!: (value: Response) => void;
      const promise = new Promise<Response>((promiseResolve) => {
        resolve = promiseResolve;
      });
      pendingRequests.push({ resolve });
      return promise;
    });

    const client = new HttpClient("publishableKey");
    const body = { payload: "ok" };

    const inFlightRequests = Array.from({ length: 15 }, () =>
      client.post({
        path: "/test",
        body,
        keepalive: true,
      }),
    );
    await Promise.resolve();

    await client.post({ path: "/test", body, keepalive: true });

    expect(
      vi
        .mocked(global.fetch)
        .mock.calls.slice(0, 15)
        .every(([, init]) => (init as RequestInit | undefined)?.keepalive),
    ).toBe(true);
    expect(vi.mocked(global.fetch).mock.calls[15]?.[1]).toEqual(
      expect.objectContaining({ keepalive: false }),
    );

    for (const request of pendingRequests) {
      request.resolve(new Response());
    }
    await Promise.all(inFlightRequests);
  });

  test("does not require a writable `URL.search` property", async () => {
    const OriginalURL = global.URL;

    class ReadonlySearchURL extends OriginalURL {
      get search() {
        return super.search;
      }

      set search(_value: string) {
        throw new TypeError(
          "Cannot assign to property 'search' which has only a getter",
        );
      }
    }

    global.URL = ReadonlySearchURL as unknown as typeof URL;

    try {
      const client = new HttpClient("publishableKey");
      await client.get({
        path: "/test",
        params: new URLSearchParams({ hello: "world" }),
      });

      const [firstArg] = vi.mocked(global.fetch).mock.calls[0]!;
      const url = new OriginalURL(String(firstArg));
      expect(url.searchParams.get("hello")).toBe("world");
      expect(url.searchParams.get("publishableKey")).toBe("publishableKey");
    } finally {
      global.URL = OriginalURL;
    }
  });
});
