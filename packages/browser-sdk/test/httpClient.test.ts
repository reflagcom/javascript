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
