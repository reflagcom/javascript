import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FlagsFallbackProviderContext } from "../src";
import { fallbackProviders } from "../src";

const context: FlagsFallbackProviderContext = {
  secretKeyHash: "abc123def456ghi789",
};

const snapshot = {
  version: 1 as const,
  savedAt: "2026-03-09T00:00:00.000Z",
  flags: [
    {
      key: "flag-1",
      description: "Flag 1",
      targeting: {
        version: 1,
        rules: [],
      },
    },
  ],
};

describe("flagsFallbackProvider", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("loads static snapshots from a flag map", async () => {
    const provider = fallbackProviders.static({
      flags: {
        "flag-1": true,
        "flag-2": false,
      },
    });

    await expect(provider.load(context)).resolves.toEqual({
      version: 1,
      savedAt: expect.any(String),
      flags: [
        {
          key: "flag-1",
          description: null,
          targeting: {
            version: 1,
            rules: [
              {
                filter: {
                  type: "constant",
                  value: true,
                },
              },
            ],
          },
        },
        {
          key: "flag-2",
          description: null,
          targeting: {
            version: 1,
            rules: [
              {
                filter: {
                  type: "constant",
                  value: false,
                },
              },
            ],
          },
        },
      ],
    });
  });

  it("loads undefined when a file snapshot does not exist", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "reflag-node-sdk-"));
    const provider = fallbackProviders.file({ directory: tempDir });

    await expect(provider.load(context)).resolves.toBeUndefined();
  });

  it("saves and loads file snapshots", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "reflag-node-sdk-"));
    const provider = fallbackProviders.file({ directory: tempDir });

    await provider.save(context, snapshot);

    const files = await readFile(
      path.join(
        tempDir,
        `flags-fallback-${context.secretKeyHash.slice(0, 16)}.json`,
      ),
      "utf-8",
    );
    expect(JSON.parse(files)).toEqual(snapshot);

    await expect(provider.load(context)).resolves.toEqual(snapshot);
  });

  it("loads S3 snapshots", async () => {
    const send = vi.fn().mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(snapshot)),
      },
    });

    const provider = fallbackProviders.s3({
      bucket: "bucket-name",
      client: { send },
    });

    await expect(provider.load(context)).resolves.toEqual(snapshot);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "bucket-name",
          Key: expect.stringMatching(/^reflag\/flags-fallback\//),
        }),
      }),
    );
  });

  it("trims trailing slashes from generated S3 keys without regex backtracking", async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = fallbackProviders.s3({
      bucket: "bucket-name",
      client: { send },
      keyPrefix: "reflag/flags-fallback///",
    });

    await provider.save(context, snapshot);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "bucket-name",
          Key: `reflag/flags-fallback/flags-fallback-${context.secretKeyHash.slice(0, 16)}.json`,
        }),
      }),
    );
  });

  it("returns undefined for missing S3 snapshots", async () => {
    const send = vi.fn().mockRejectedValue({ name: "NoSuchKey" });
    const provider = fallbackProviders.s3({
      bucket: "bucket-name",
      client: { send },
    });

    await expect(provider.load(context)).resolves.toBeUndefined();
  });

  it("saves S3 snapshots", async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = fallbackProviders.s3({
      bucket: "bucket-name",
      client: { send },
    });

    await provider.save(context, snapshot);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "bucket-name",
          Key: expect.stringMatching(/^reflag\/flags-fallback\//),
          Body: JSON.stringify(snapshot),
          ContentType: "application/json",
        }),
      }),
    );
  });

  it("loads GCS snapshots", async () => {
    const exists = vi.fn().mockResolvedValue([true]);
    const download = vi
      .fn()
      .mockResolvedValue([Buffer.from(JSON.stringify(snapshot), "utf-8")]);
    const save = vi.fn();
    const file = vi.fn().mockReturnValue({ exists, download, save });
    const bucket = vi.fn().mockReturnValue({ file });

    const provider = fallbackProviders.gcs({
      bucket: "bucket-name",
      client: { bucket },
    });

    await expect(provider.load(context)).resolves.toEqual(snapshot);
    expect(bucket).toHaveBeenCalledWith("bucket-name");
    expect(file).toHaveBeenCalledWith(
      expect.stringMatching(/^reflag\/flags-fallback\//),
    );
  });

  it("returns undefined for missing GCS snapshots", async () => {
    const exists = vi.fn().mockResolvedValue([false]);
    const download = vi.fn();
    const save = vi.fn();
    const file = vi.fn().mockReturnValue({ exists, download, save });
    const bucket = vi.fn().mockReturnValue({ file });

    const provider = fallbackProviders.gcs({
      bucket: "bucket-name",
      client: { bucket },
    });

    await expect(provider.load(context)).resolves.toBeUndefined();
    expect(download).not.toHaveBeenCalled();
  });

  it("saves GCS snapshots", async () => {
    const exists = vi.fn();
    const download = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const file = vi.fn().mockReturnValue({ exists, download, save });
    const bucket = vi.fn().mockReturnValue({ file });

    const provider = fallbackProviders.gcs({
      bucket: "bucket-name",
      client: { bucket },
      keyPrefix: "reflag/flags-fallback///",
    });

    await provider.save(context, snapshot);

    expect(file).toHaveBeenCalledWith(
      `reflag/flags-fallback/flags-fallback-${context.secretKeyHash.slice(0, 16)}.json`,
    );
    expect(save).toHaveBeenCalledWith(JSON.stringify(snapshot), {
      contentType: "application/json",
    });
  });

  it("loads Redis snapshots", async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify(snapshot));
    const set = vi.fn();
    const provider = fallbackProviders.redis({
      client: { get, set },
    });

    await expect(provider.load(context)).resolves.toEqual(snapshot);
    expect(get).toHaveBeenCalledWith(
      `reflag:flags-fallback:flags-fallback-${context.secretKeyHash.slice(0, 16)}.json`,
    );
  });

  it("returns undefined for missing Redis snapshots", async () => {
    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn();
    const provider = fallbackProviders.redis({
      client: { get, set },
    });

    await expect(provider.load(context)).resolves.toBeUndefined();
  });

  it("saves Redis snapshots", async () => {
    const get = vi.fn();
    const set = vi.fn().mockResolvedValue("OK");
    const provider = fallbackProviders.redis({
      client: { get, set },
      keyPrefix: "reflag:flags-fallback:::",
    });

    await provider.save(context, snapshot);

    expect(set).toHaveBeenCalledWith(
      `reflag:flags-fallback:flags-fallback-${context.secretKeyHash.slice(0, 16)}.json`,
      JSON.stringify(snapshot),
    );
  });

  it("requires REDIS_URL when no Redis client is provided", async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    try {
      const provider = fallbackProviders.redis();

      await expect(provider.load(context)).rejects.toThrow(
        "fallbackProviders.redis() requires REDIS_URL to be set when no client is provided",
      );
    } finally {
      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }
    }
  });
});
