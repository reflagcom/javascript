"use server";

import type {
  AppHeaderCollection,
  EnvironmentHeaderCollection,
  EntityFlagsResponse,
  FlagHeaderCollection,
} from "@reflag/rest-api-sdk";
import { Api, createAppClient } from "@reflag/rest-api-sdk";

const apiKey = process.env.REFLAG_API_KEY;
const basePath = process.env.REFLAG_BASE_URL ?? "https://app.reflag.com/api";

function getClient() {
  if (!apiKey) {
    throw new Error("REFLAG_API_KEY is not set");
  }
  return new Api({
    accessToken: apiKey,
    basePath,
  });
}

function getAppClient(appId: string) {
  if (!appId) {
    throw new Error("appId is required");
  }
  return createAppClient(appId, {
    accessToken: apiKey ?? "",
    basePath,
  });
}

export async function listApps(): Promise<AppHeaderCollection> {
  const client = getClient();
  return await client.listApps();
}

export async function listEnvironments(
  appId: string,
): Promise<EnvironmentHeaderCollection> {
  const client = getAppClient(appId);
  return await client.listEnvironments({
    sortBy: "order",
    sortOrder: "asc",
  });
}

export async function listFlags(appId: string): Promise<FlagHeaderCollection> {
  const client = getAppClient(appId);
  return await client.listFlags({});
}

export async function fetchUserFlags(
  appId: string,
  envId: string,
  userId: string,
): Promise<EntityFlagsResponse> {
  if (!envId) {
    throw new Error("envId is required");
  }
  if (!userId) {
    throw new Error("userId is required");
  }
  const client = getAppClient(appId);
  return await client.getUserFlags({
    envId,
    userId,
  });
}

export async function toggleUserFlag(
  appId: string,
  envId: string,
  userId: string,
  flagKey: string,
  enabled: boolean,
): Promise<EntityFlagsResponse> {
  if (!envId) {
    throw new Error("envId is required");
  }
  if (!userId || !flagKey) {
    throw new Error("userId and flagKey are required");
  }
  const client = getAppClient(appId);
  await client.updateUserFlags({
    envId,
    userId,
    updates: [{ flagKey, value: enabled ? true : null }],
  });
  return await fetchUserFlags(appId, envId, userId);
}

export async function fetchCompanyFlags(
  appId: string,
  envId: string,
  companyId: string,
): Promise<EntityFlagsResponse> {
  if (!envId) {
    throw new Error("envId is required");
  }
  if (!companyId) {
    throw new Error("companyId is required");
  }
  const client = getAppClient(appId);
  return await client.getCompanyFlags({
    envId,
    companyId,
  });
}

export async function toggleCompanyFlag(
  appId: string,
  envId: string,
  companyId: string,
  flagKey: string,
  enabled: boolean,
): Promise<EntityFlagsResponse> {
  if (!envId) {
    throw new Error("envId is required");
  }
  if (!companyId || !flagKey) {
    throw new Error("companyId and flagKey are required");
  }
  const client = getAppClient(appId);
  await client.updateCompanyFlags({
    envId,
    companyId,
    updates: [{ flagKey, value: enabled ? true : null }],
  });
  return await fetchCompanyFlags(appId, envId, companyId);
}
