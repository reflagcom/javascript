import { z } from "zod";

import { authRequest } from "../utils/auth.js";
import type { FlagForTypes } from "../utils/gen.js";
import { EnvironmentQuerySchema } from "../utils/schemas.js";

const FlagSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  key: z.string().min(1),
  flagType: z.enum(["boolean", "multivariate"]),
  stage: z.object({ name: z.string() }).optional(),
});
const FlagsResponseSchema = z.object({
  data: z.array(FlagSchema),
  totalCount: z.number().int().nonnegative(),
});
const MultivariateVersionsSchema = z.object({
  flagId: z.string(),
  flagType: z.literal("multivariate"),
  versions: z.array(
    z.object({
      environment: z.object({ id: z.string() }),
      currentVersion: z.boolean(),
      variants: z.record(z.string(), z.json()),
    }),
  ),
});

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
const flagsPath = (appId: string) => `/apps/${encodeURIComponent(appId)}/flags`;

export async function listFlags(
  appId: string,
  query: z.input<typeof FlagsQuerySchema>,
) {
  const response = await authRequest(flagsPath(appId), {
    params: FlagsQuerySchema.parse(query),
  });
  return FlagsResponseSchema.parse(response);
}

/** Generate schemas from current values in the selected environment, never legacy remote-config wrappers. */
export async function listFlagValues(
  appId: string,
  envId: string,
): Promise<FlagForTypes[]> {
  const { data, totalCount } = await listFlags(appId, { envId });
  if (data.length !== totalCount) {
    throw new Error("Cannot generate types from an incomplete flag list");
  }
  const flags: FlagForTypes[] = [];
  for (const { id, key, flagType } of data) {
    if (flagType === "boolean") {
      flags.push({ key, flagType });
      continue;
    }
    const { flagId, versions } = MultivariateVersionsSchema.parse(
      await authRequest(
        `${flagsPath(appId)}/${encodeURIComponent(id)}/targeting`,
        {
          params: { envId },
        },
      ),
    );
    const [version] = versions;
    if (
      flagId !== id ||
      versions.length > 1 ||
      (version && (version.environment.id !== envId || !version.currentVersion))
    ) {
      throw new Error(
        `Unexpected current-version response for flag ${JSON.stringify(key)}`,
      );
    }
    flags.push({
      key,
      flagType,
      values: Object.values(version?.variants ?? {}),
    });
  }
  return flags;
}

export async function createFlag(
  appId: string,
  flag: z.input<typeof FlagCreateSchema>,
) {
  const response = await authRequest(flagsPath(appId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "event",
      flagType: "boolean",
      ...FlagCreateSchema.parse(flag),
    }),
  });
  return z.object({ flag: FlagSchema }).parse(response).flag;
}
