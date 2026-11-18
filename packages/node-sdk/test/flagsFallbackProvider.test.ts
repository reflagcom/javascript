import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fallbackProviders, type FlagsFallbackSnapshot } from "../src";
import { graph } from "./fixtures";

const context = { secretKeyHash: "abc123def456ghi789" };
const snapshot: FlagsFallbackSnapshot = {
  version: 2,
  savedAt: "2026-03-09T00:00:00.000Z",
  flagStateVersion: 1,
  flags: graph().flags,
  segments: graph().segments,
};
const filename = `flags-fallback-v2-${context.secretKeyHash.slice(0, 16)}.json`;
const objectKey = `reflag/flags-fallback/${filename}`;

describe("flagsFallbackProvider", () => {
  let tempDir: string | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("creates complete static snapshots with explicitly local selection provenance", async () => {
    const provider = fallbackProviders.static({
      flags: { a: true, b: false, json: null },
    });
    const result = await provider.load(context);
    expect(result).toMatchObject({
      version: 2,
      source: "static",
      savedAt: expect.any(String),
      segments: [],
    });
    expect(result?.flags.map((flag) => flag.variants.default)).toEqual([
      true,
      false,
      null,
    ]);
  });
  it("returns undefined for missing files", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "reflag-node-sdk-"));
    await expect(
      fallbackProviders.file({ directory: tempDir }).load(context),
    ).resolves.toBeUndefined();
  });
  it("round-trips full file snapshots in a versioned namespace", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "reflag-node-sdk-"));
    const provider = fallbackProviders.file({ directory: tempDir });
    await provider.save(context, snapshot);
    expect(
      JSON.parse(await readFile(path.join(tempDir, filename), "utf8")),
    ).toEqual(snapshot);
    await expect(provider.load(context)).resolves.toEqual(snapshot);
  });
  it.each([
    { ...snapshot, version: 1 },
    { ...snapshot, segments: undefined },
    { ...snapshot, flagStateVersion: -1 },
    { ...snapshot, savedAt: "invalid" },
  ])("rejects incompatible fallback envelopes %#", async (value) => {
    const provider = fallbackProviders.redis({
      client: { get: vi.fn(async () => JSON.stringify(value)), set: vi.fn() },
    });
    await expect(provider.load(context)).resolves.toBeUndefined();
  });
  it("loads S3 snapshots", async () => {
    const send = vi.fn(async () => ({
      Body: { transformToString: async () => JSON.stringify(snapshot) },
    }));
    await expect(
      fallbackProviders
        .s3({ bucket: "bucket", client: { send } })
        .load(context),
    ).resolves.toEqual(snapshot);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ input: { Bucket: "bucket", Key: objectKey } }),
    );
  });
  it("trims S3 key-prefix slashes and saves versioned objects", async () => {
    const send = vi.fn();
    await fallbackProviders
      .s3({
        bucket: "bucket",
        client: { send },
        keyPrefix: "reflag/flags-fallback///",
      })
      .save(context, snapshot);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: "bucket",
          Key: objectKey,
          ContentType: "application/json",
          Body: JSON.stringify(snapshot),
        },
      }),
    );
  });
  it("loads and saves legacy GCS injected clients", async () => {
    const download = vi.fn(
      async () => [Buffer.from(JSON.stringify(snapshot))] as [Buffer],
    );
    const save = vi.fn();
    const file = vi.fn(() => ({
      exists: async () => [true] as [boolean],
      download,
      save,
    }));
    const provider = fallbackProviders.gcs({
      bucket: "bucket",
      client: { bucket: () => ({ file }) },
    });
    await expect(provider.load(context)).resolves.toEqual(snapshot);
    await provider.save(context, snapshot);
    expect(file).toHaveBeenCalledWith(objectKey);
    expect(save).toHaveBeenCalledWith(JSON.stringify(snapshot), {
      contentType: "application/json",
    });
  });
  it("loads and saves Google APIs GCS clients", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: { kind: "storage#object" } })
      .mockResolvedValueOnce({ data: Buffer.from(JSON.stringify(snapshot)) });
    const insert = vi.fn();
    const provider = fallbackProviders.gcs({
      bucket: "bucket",
      keyPrefix: "reflag/flags-fallback///",
      client: { objects: { get, insert } },
    });
    await expect(provider.load(context)).resolves.toEqual(snapshot);
    await provider.save(context, snapshot);
    expect(get).toHaveBeenNthCalledWith(1, {
      bucket: "bucket",
      object: objectKey,
    });
    expect(get).toHaveBeenNthCalledWith(
      2,
      { bucket: "bucket", object: objectKey, alt: "media" },
      { responseType: "arraybuffer" },
    );
    expect(insert).toHaveBeenCalledWith({
      bucket: "bucket",
      name: objectKey,
      uploadType: "media",
      media: { mimeType: "application/json", body: JSON.stringify(snapshot) },
    });
  });
  it("creates the default GCS client from @googleapis/storage", async () => {
    vi.resetModules();
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: { kind: "storage#object" } })
      .mockResolvedValueOnce({ data: Buffer.from(JSON.stringify(snapshot)) });
    const insert = vi.fn();
    const storage = vi.fn(() => ({ objects: { get, insert } }));
    const GoogleAuth = vi.fn();
    vi.doMock("@googleapis/storage", () => ({ auth: { GoogleAuth }, storage }));
    try {
      const { createGCSFallbackProvider } =
        await import("../src/flagsFallbackProvider");
      const provider = createGCSFallbackProvider({ bucket: "bucket" });
      await expect(provider.load(context)).resolves.toEqual(snapshot);
      await provider.save(context, snapshot);
      expect(GoogleAuth).toHaveBeenCalledWith({
        scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
      });
      expect(storage).toHaveBeenCalledWith(
        expect.objectContaining({ version: "v1" }),
      );
    } finally {
      vi.doUnmock("@googleapis/storage");
      vi.resetModules();
    }
  });
  it("loads Redis snapshots in a versioned namespace", async () => {
    const get = vi.fn(async () => JSON.stringify(snapshot));
    const provider = fallbackProviders.redis({ client: { get, set: vi.fn() } });
    await expect(provider.load(context)).resolves.toEqual(snapshot);
    expect(get).toHaveBeenCalledWith(
      `reflag:flags-fallback:v2:${context.secretKeyHash.slice(0, 16)}`,
    );
  });
  it("returns undefined for missing Redis snapshots", async () => {
    await expect(
      fallbackProviders
        .redis({ client: { get: vi.fn(async () => null), set: vi.fn() } })
        .load(context),
    ).resolves.toBeUndefined();
  });
  it("trims Redis prefixes and saves versioned keys", async () => {
    const set = vi.fn();
    await fallbackProviders
      .redis({
        client: { get: vi.fn(), set },
        keyPrefix: "reflag:flags-fallback:::",
      })
      .save(context, snapshot);
    expect(set).toHaveBeenCalledWith(
      `reflag:flags-fallback:v2:${context.secretKeyHash.slice(0, 16)}`,
      JSON.stringify(snapshot),
    );
  });
  it("requires REDIS_URL when no Redis client is provided", async () => {
    const previous = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      await expect(fallbackProviders.redis().load(context)).rejects.toThrow(
        "requires REDIS_URL",
      );
    } finally {
      if (previous === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previous;
    }
  });
});
