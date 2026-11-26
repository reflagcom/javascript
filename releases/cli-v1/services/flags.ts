import { z } from "zod";

import { authRequest } from "../utils/auth.js";
import { booleanish, EnvironmentQuerySchema } from "../utils/schemas.js";
import { PaginatedResponse } from "../utils/types.js";

export type Stage = {
  id: string;
  name: string;
  order: number;
};

export type RemoteConfigVariant = {
  key?: string;
  payload?: any;
};

export type RemoteConfig = {
  variants: [
    {
      variant: RemoteConfigVariant;
    },
  ];
};

export type FlagName = {
  id: string;
  name: string;
  key: string;
};

export type Flag = FlagName & {
  description: string | null;
  remoteConfigs: RemoteConfig[];
  stage: Stage | null;
};

export type FlagsResponse = PaginatedResponse<Flag>;

export const FlagsQuerySchema = EnvironmentQuerySchema.extend({
  sortBy: z.string().default("key").describe("Field to sort features by"),
  sortOrder: z
    .enum(["asc", "desc"])
    .default("asc")
    .describe("Sort direction (ascending or descending)"),
  includeRemoteConfigs: booleanish
    .default(false)
    .describe("Include remote configuration data"),
}).strict();

export const FlagCreateSchema = z
  .object({
    name: z
      .string()
      .min(1, "Flag name is required")
      .describe("Name of the flag"),
    key: z
      .string()
      .min(1, "Flag key is required")
      .describe("Unique identifier key for the flag"),
    description: z
      .string()
      .optional()
      .describe("Optional description of the flag"),
  })
  .strict();

export type FlagsQuery = z.input<typeof FlagsQuerySchema>;
export type FlagCreate = z.input<typeof FlagCreateSchema>;

export async function listFlags(appId: string, query: FlagsQuery) {
  return authRequest<FlagsResponse>(`/apps/${appId}/features`, {
    params: FlagsQuerySchema.parse(query),
  });
}

type CreateFlagResponse = {
  feature: FlagName & {
    description: string | null;
  };
};

export async function createFlag(appId: string, featureData: FlagCreate) {
  return authRequest<CreateFlagResponse>(`/apps/${appId}/features`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "event",
      ...FlagCreateSchema.parse(featureData),
    }),
  }).then(({ feature }) => feature);
}
