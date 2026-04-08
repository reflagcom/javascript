import { promises as fs } from "fs";
import path from "path";

import type {
  FlagAPIResponse,
  FlagsFallbackProvider,
  FlagsFallbackProviderContext,
  FlagsFallbackSnapshot,
} from "./types";
import { isObject } from "./utils";

export type FileFallbackProviderOptions = {
  /**
   * Directory where per-environment snapshots are stored.
   *
   * @defaultValue `path.join(process.cwd(), ".reflag")`
   */
  directory?: string;
};

export type S3FallbackProviderOptions = {
  /**
   * Bucket where snapshots are stored.
   */
  bucket: string;

  /**
   * Optional S3 client. A default client is created when omitted.
   */
  client?: {
    send(command: unknown): Promise<any>;
  };

  /**
   * Prefix for generated per-environment keys.
   *
   * @defaultValue `reflag/flags-fallback`
   */
  keyPrefix?: string;
};

export type GCSFallbackProviderOptions = {
  /**
   * Bucket where snapshots are stored.
   */
  bucket: string;

  /**
   * Optional GCS client. A default client is created when omitted.
   *
   * TODO(next major): Replace this legacy `bucket().file()` client shape with
   * a simpler object-store interface that doesn't mirror the deprecated
   * `@google-cloud/storage` API.
   */
  client?: {
    bucket(name: string): {
      file(path: string): {
        exists(): Promise<[boolean]>;
        download(): Promise<[Uint8Array]>;
        save(body: string, options: { contentType: string }): Promise<unknown>;
      };
    };
  };

  /**
   * Prefix for generated per-environment keys.
   *
   * @defaultValue `reflag/flags-fallback`
   */
  keyPrefix?: string;
};

type LegacyGCSClient = NonNullable<GCSFallbackProviderOptions["client"]>;

type GCSObjectStore = {
  exists(bucket: string, objectPath: string): Promise<boolean>;
  download(bucket: string, objectPath: string): Promise<Uint8Array>;
  save(
    bucket: string,
    objectPath: string,
    body: string,
    options: { contentType: string },
  ): Promise<unknown>;
};

export type RedisFallbackProviderOptions = {
  /**
   * Optional Redis client. When omitted, a client is created using `REDIS_URL`.
   */
  client?: {
    get(key: string): Promise<string | null | undefined>;
    set(key: string, value: string): Promise<unknown>;
  };

  /**
   * Prefix for generated per-environment keys.
   *
   * @defaultValue `reflag:flags-fallback`
   */
  keyPrefix?: string;
};

export type StaticFallbackProviderOptions = {
  /**
   * Static fallback flags keyed by flag key.
   */
  flags: Record<string, boolean>;
};

function defaultSnapshotName(secretKeyHash: string) {
  return `flags-fallback-${secretKeyHash.slice(0, 16)}.json`;
}

function snapshotFilePath(
  context: FlagsFallbackProviderContext,
  directory = path.join(process.cwd(), ".reflag"),
) {
  return path.join(directory, defaultSnapshotName(context.secretKeyHash));
}

function trimTrailingCharacter(value: string, character: string) {
  let endIndex = value.length;
  while (endIndex > 0 && value[endIndex - 1] === character) {
    endIndex -= 1;
  }
  return value.slice(0, endIndex);
}

function snapshotObjectKey(
  context: FlagsFallbackProviderContext,
  keyPrefix = "reflag/flags-fallback",
) {
  return `${trimTrailingCharacter(keyPrefix, "/")}/${defaultSnapshotName(context.secretKeyHash)}`;
}

function snapshotRedisKey(
  context: FlagsFallbackProviderContext,
  keyPrefix = "reflag:flags-fallback",
) {
  return `${trimTrailingCharacter(keyPrefix, ":")}:${context.secretKeyHash.slice(0, 16)}`;
}

export function isFlagsFallbackSnapshot(
  value: unknown,
): value is FlagsFallbackSnapshot {
  return (
    isObject(value) &&
    value.version === 1 &&
    typeof value.savedAt === "string" &&
    Array.isArray(value.flags) &&
    value.flags.every(isFlagApiResponse)
  );
}

function isFlagApiResponse(value: unknown): value is FlagAPIResponse {
  return (
    isObject(value) &&
    typeof value.key === "string" &&
    typeof value.description !== "undefined" &&
    isObject(value.targeting) &&
    typeof value.targeting.version === "number" &&
    Array.isArray(value.targeting.rules) &&
    (value.config === undefined ||
      (isObject(value.config) &&
        typeof value.config.version === "number" &&
        Array.isArray(value.config.variants)))
  );
}

async function readBodyAsString(body: unknown) {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf-8");
  if (body instanceof ArrayBuffer) return Buffer.from(body).toString("utf-8");
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString(
      "utf-8",
    );
  }
  if (body && typeof body === "object") {
    if (
      "transformToString" in body &&
      typeof body.transformToString === "function"
    ) {
      return await body.transformToString();
    }
  }
  return undefined;
}

function parseSnapshot(raw: string) {
  const parsed = JSON.parse(raw);
  return isFlagsFallbackSnapshot(parsed) ? parsed : undefined;
}

function isNotFoundError(error: any) {
  return (
    error?.code === 404 ||
    error?.status === 404 ||
    error?.response?.status === 404 ||
    error?.$metadata?.httpStatusCode === 404
  );
}

function staticFlagApiResponse(
  key: string,
  isEnabled: boolean,
): FlagAPIResponse {
  return {
    key,
    description: null,
    targeting: {
      version: 1,
      rules: [
        {
          filter: {
            type: "constant",
            value: isEnabled,
          },
        },
      ],
    },
  };
}

async function createDefaultS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({});
}

function createGCSObjectStore(client: LegacyGCSClient): GCSObjectStore {
  return {
    async exists(bucket, objectPath) {
      const [exists] = await client.bucket(bucket).file(objectPath).exists();
      return exists;
    },

    async download(bucket, objectPath) {
      const [contents] = await client.bucket(bucket).file(objectPath).download();
      return contents;
    },

    async save(bucket, objectPath, body, options) {
      return client.bucket(bucket).file(objectPath).save(body, options);
    },
  };
}

async function createDefaultGCSObjectStore(): Promise<GCSObjectStore> {
  const { auth, storage } = await import("@googleapis/storage");
  const gcs = storage({
    version: "v1",
    auth: new auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    }),
  });

  return {
    async exists(bucket, objectPath) {
      try {
        await gcs.objects.get({
          bucket,
          object: objectPath,
        });
        return true;
      } catch (error) {
        if (isNotFoundError(error)) {
          return false;
        }
        throw error;
      }
    },

    async download(bucket, objectPath) {
      const response = await gcs.objects.get(
        {
          bucket,
          object: objectPath,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        },
      );

      if (response.data instanceof Uint8Array) {
        return response.data;
      }
      if (response.data instanceof ArrayBuffer) {
        return new Uint8Array(response.data);
      }

      throw new TypeError("Unexpected GCS download response body format");
    },

    async save(bucket, objectPath, body, options) {
      await gcs.objects.insert({
        bucket,
        name: objectPath,
        uploadType: "media",
        media: {
          mimeType: options.contentType,
          body,
        },
      });
    },
  };
}

export function createStaticFallbackProvider({
  flags,
}: StaticFallbackProviderOptions): FlagsFallbackProvider {
  return {
    async load() {
      return {
        version: 0,
        savedAt: new Date().toISOString(),
        flags: Object.entries(flags).map(([key, isEnabled]) =>
          staticFlagApiResponse(key, isEnabled),
        ),
      };
    },

    async save() {
      // no-op
    },
  };
}

export function createFileFallbackProvider({
  directory,
}: FileFallbackProviderOptions = {}): FlagsFallbackProvider {
  return {
    async load(context) {
      const resolvedPath = snapshotFilePath(context, directory);
      try {
        const fileContents = await fs.readFile(resolvedPath, "utf-8");
        return parseSnapshot(fileContents);
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    },

    async save(context, snapshot) {
      const resolvedPath = snapshotFilePath(context, directory);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      const tempPath = `${resolvedPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await fs.writeFile(tempPath, JSON.stringify(snapshot), "utf-8");
      await fs.rename(tempPath, resolvedPath);
    },
  };
}

export function createS3FallbackProvider({
  bucket,
  client,
  keyPrefix,
}: S3FallbackProviderOptions): FlagsFallbackProvider {
  let defaultClient:
    | {
        send(command: unknown): Promise<any>;
      }
    | undefined;

  const getClient = async () => {
    defaultClient ??= client ?? (await createDefaultS3Client());
    return defaultClient;
  };

  return {
    async load(context) {
      const s3 = await getClient();
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");

      try {
        const response = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: snapshotObjectKey(context, keyPrefix),
          }),
        );

        const body = await readBodyAsString(response.Body);
        if (!body) return undefined;

        return parseSnapshot(body);
      } catch (error: any) {
        if (error?.name === "NoSuchKey" || isNotFoundError(error)) {
          return undefined;
        }
        throw error;
      }
    },

    async save(context, snapshot) {
      const s3 = await getClient();
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: snapshotObjectKey(context, keyPrefix),
          Body: JSON.stringify(snapshot),
          ContentType: "application/json",
        }),
      );
    },
  };
}

export function createGCSFallbackProvider({
  bucket,
  client,
  keyPrefix,
}: GCSFallbackProviderOptions): FlagsFallbackProvider {
  let defaultClient: GCSObjectStore | undefined;

  const getClient = async () => {
    defaultClient ??= client
      ? createGCSObjectStore(client)
      : await createDefaultGCSObjectStore();
    return defaultClient;
  };

  return {
    async load(context) {
      const storage = await getClient();
      const objectKey = snapshotObjectKey(context, keyPrefix);
      const exists = await storage.exists(bucket, objectKey);
      if (!exists) {
        return undefined;
      }

      const contents = await storage.download(bucket, objectKey);
      return parseSnapshot(Buffer.from(contents).toString("utf-8"));
    },

    async save(context, snapshot) {
      const storage = await getClient();
      await storage.save(
        bucket,
        snapshotObjectKey(context, keyPrefix),
        JSON.stringify(snapshot),
        {
          contentType: "application/json",
        },
      );
    },
  };
}

export function createRedisFallbackProvider({
  client,
  keyPrefix,
}: RedisFallbackProviderOptions = {}): FlagsFallbackProvider {
  let defaultClient:
    | {
        get(key: string): Promise<string | null | undefined>;
        set(key: string, value: string): Promise<unknown>;
        connect(): Promise<unknown>;
        isOpen: boolean;
      }
    | undefined;
  let connectPromise: Promise<unknown> | undefined;

  const getClient = async () => {
    if (client) {
      return client;
    }

    if (!process.env.REDIS_URL) {
      throw new Error(
        "fallbackProviders.redis() requires REDIS_URL to be set when no client is provided",
      );
    }

    if (!defaultClient) {
      const { createClient } = await import("@redis/client");
      defaultClient = createClient({ url: process.env.REDIS_URL });
    }

    if (!defaultClient.isOpen) {
      connectPromise ??= defaultClient.connect();
      await connectPromise;
    }

    return defaultClient;
  };

  return {
    async load(context) {
      const redis = await getClient();
      const raw = await redis.get(snapshotRedisKey(context, keyPrefix));
      if (!raw) {
        return undefined;
      }

      return parseSnapshot(raw);
    },

    async save(context, snapshot) {
      const redis = await getClient();
      await redis.set(
        snapshotRedisKey(context, keyPrefix),
        JSON.stringify(snapshot),
      );
    },
  };
}
