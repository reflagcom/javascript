import { describe, expect, test } from "vitest";

import { sha256Hex } from "../src/utils/hash";

describe("sha256Hex", () => {
  test("returns a 64-character lowercase hex string", async () => {
    const digest = await sha256Hex("hello");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("matches the canonical SHA-256 of 'hello'", async () => {
    // Pre-computed: echo -n "hello" | shasum -a 256
    expect(await sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  test("produces stable output for the same input", async () => {
    const a = await sha256Hex("publishable-key-abc");
    const b = await sha256Hex("publishable-key-abc");
    expect(a).toBe(b);
  });

  test("produces different output for different inputs", async () => {
    const a = await sha256Hex("publishable-key-abc");
    const b = await sha256Hex("publishable-key-xyz");
    expect(a).not.toBe(b);
  });

  test("handles unicode input", async () => {
    await expect(sha256Hex("héllo")).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
