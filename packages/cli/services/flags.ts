import { z } from "zod";

import { authRequest } from "../utils/auth.js";
import type { JSONPrimitive } from "../utils/json.js";
import { EnvironmentQuerySchema } from "../utils/schemas.js";

const JsonValueSchema: z.ZodType<JSONPrimitive> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
const FlagSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  key: z.string().min(1),
  flagType: z.enum(["boolean", "multivariate"]),
  description: z.string().optional(),
  stage: z
    .object({ id: z.string(), name: z.string(), order: z.number() })
    .optional(),
});
const FlagsResponseSchema = z.object({
  data: z.array(FlagSchema),
  totalCount: z.number().int().nonnegative(),
  pageIndex: z.number().int().nonnegative(),
  pageSize: z.number().int().nonnegative(),
  sortBy: z.string(),
  sortOrder: z.enum(["asc", "desc"]),
});
const MultivariateVersionsSchema = z.object({
  flagId: z.string(),
  flagType: z.literal("multivariate"),
  versions: z.array(
    z.object({
      environment: z.object({ id: z.string() }),
      currentVersion: z.boolean(),
      variants: z.record(z.string(), JsonValueSchema),
    }),
  ),
});

export type FlagName = Pick<Flag, "id" | "name" | "key">;
export type Flag = z.infer<typeof FlagSchema>;
export type FlagsResponse = z.infer<typeof FlagsResponseSchema>;
export type FlagWithValues = Flag & { values?: JSONPrimitive[] };

export const FlagsQuerySchema = EnvironmentQuerySchema.extend({
  sortBy: z
    .enum(["key", "name", "stage"])
    .default("key")
    .describe("Field to sort flags by"),
  sortOrder: z.enum(["asc", "desc"]).default("asc").describe("Sort direction"),
}).strict();
export const FlagCreateSchema = z
  .object({
    name: z.string().min(1, "Flag name is required"),
    key: z.string().min(1, "Flag key is required"),
    description: z.string().optional(),
  })
  .strict();
export type FlagsQuery = z.input<typeof FlagsQuerySchema>;
export type FlagCreate = z.input<typeof FlagCreateSchema>;

export async function listFlags(appId: string, query: FlagsQuery) {
  const response = await authRequest(
    `/apps/${encodeURIComponent(appId)}/flags`,
    {
      params: FlagsQuerySchema.parse(query),
    },
  );
  return FlagsResponseSchema.parse(response);
}

/** Generate schemas from current values in the selected environment, never legacy remote-config wrappers. */
export async function listFlagValues(
  appId: string,
  envId: string,
): Promise<FlagWithValues[]> {
  const response = await listFlags(appId, { envId });
  if (response.data.length !== response.totalCount) {
    throw new Error("Cannot generate types from an incomplete flag list");
  }
  const flags: FlagWithValues[] = [];
  for (const flag of response.data) {
    if (flag.flagType === "boolean") {
      flags.push(flag);
      continue;
    }
    const versions = MultivariateVersionsSchema.parse(
      await authRequest(
        `/apps/${encodeURIComponent(appId)}/flags/${encodeURIComponent(flag.id)}/targeting`,
        { params: { envId } },
      ),
    );
    if (
      versions.flagId !== flag.id ||
      versions.versions.length > 1 ||
      versions.versions.some(
        (version) =>
          version.environment.id !== envId || !version.currentVersion,
      )
    ) {
      throw new Error(
        `Unexpected current-version response for flag ${JSON.stringify(flag.key)}`,
      );
    }
    flags.push({
      ...flag,
      values: Object.values(versions.versions[0]?.variants ?? {}),
    });
  }
  return flags;
}

export async function createFlag(appId: string, featureData: FlagCreate) {
  const response = await authRequest(
    `/apps/${encodeURIComponent(appId)}/flags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "event",
        flagType: "boolean",
        ...FlagCreateSchema.parse(featureData),
      }),
    },
  );
  return z.object({ flag: FlagSchema }).parse(response).flag;
}
