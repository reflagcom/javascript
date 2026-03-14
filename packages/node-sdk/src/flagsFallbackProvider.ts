import { promises as fs } from "fs";
import path from "path";
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type {
  FlagAPIResponse,
  FlagsFallbackProvider,
  FlagsFallbackProviderContext,
  FlagsFallbackSnapshot,
} from "./types";
import { isObject } from "./utils";

export type FileFlagsFallbackProviderOptions = {
  /**
   * Fixed path to use for the snapshot file.
   */
  path?: string;

  /**
   * Directory where per-environment snapshots are stored.
   *
   * @defaultValue `path.join(process.cwd(), ".reflag")`
   */
  directory?: string;
};

export type S3FlagsFallbackProviderOptions = {
  /**
   * Bucket where snapshots are stored.
   */
  bucket: string;

  /**
   * Optional S3 client. A default client is created when omitted.
   */
  client?: Pick<S3Client, "send">;

  /**
   * Fixed key to use for the snapshot object.
   */
  key?: string;

  /**
   * Prefix for generated per-environment keys.
   *
   * @defaultValue `reflag/flags-fallback`
   */
  keyPrefix?: string;
};

function defaultSnapshotName(secretKeyHash: string) {
  return `flags-fallback-${secretKeyHash.slice(0, 16)}.json`;
}

function defaultFilePath(
  context: FlagsFallbackProviderContext,
  directory = path.join(process.cwd(), ".reflag"),
) {
  return path.join(directory, defaultSnapshotName(context.secretKeyHash));
}

function trimTrailingSlashes(value: string) {
  let endIndex = value.length;
  while (endIndex > 0 && value[endIndex - 1] === "/") {
    endIndex -= 1;
  }
  return value.slice(0, endIndex);
}

function defaultS3Key(
  context: FlagsFallbackProviderContext,
  keyPrefix = "reflag/flags-fallback",
) {
  return `${trimTrailingSlashes(keyPrefix)}/${defaultSnapshotName(context.secretKeyHash)}`;
}

export function isFlagsFallbackSnapshot(
  value: unknown,
): value is FlagsFallbackSnapshot {
  return (
    isObject(value) &&
    value.version === 1 &&
    typeof value.savedAt === "string" &&
    typeof value.apiBaseUrl === "string" &&
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

export function createFileFlagsFallbackProvider({
  path: filePath,
  directory,
}: FileFlagsFallbackProviderOptions = {}): FlagsFallbackProvider {
  return {
    async load(context) {
      const resolvedPath = filePath ?? defaultFilePath(context, directory);
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
      const resolvedPath = filePath ?? defaultFilePath(context, directory);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      const tempPath = `${resolvedPath}.tmp-${process.pid}`;
      await fs.writeFile(tempPath, JSON.stringify(snapshot), "utf-8");
      await fs.rename(tempPath, resolvedPath);
    },
  };
}

export function createS3FlagsFallbackProvider({
  bucket,
  client = new S3Client({}),
  key,
  keyPrefix,
}: S3FlagsFallbackProviderOptions): FlagsFallbackProvider {
  return {
    async load(context) {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key ?? defaultS3Key(context, keyPrefix),
          }),
        );

        const body = await readBodyAsString(response.Body);
        if (!body) return undefined;

        return parseSnapshot(body);
      } catch (error: any) {
        if (
          error instanceof NoSuchKey ||
          error?.name === "NoSuchKey" ||
          error?.$metadata?.httpStatusCode === 404
        ) {
          return undefined;
        }
        throw error;
      }
    },

    async save(context, snapshot) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key ?? defaultS3Key(context, keyPrefix),
          Body: JSON.stringify(snapshot),
          ContentType: "application/json",
        }),
      );
    },
  };
}
