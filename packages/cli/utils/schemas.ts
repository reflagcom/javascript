import { z } from "zod";

export const sortTypeSchema = z
  .enum(["flat", "hierarchical"])
  .describe("Type of sorting to apply");

export const booleanish = z.preprocess((value) => {
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return Boolean(value);
}, z.boolean().describe("Boolean value that can be parsed from strings like 'true' or '1'")) as z.ZodEffects<
  z.ZodBoolean,
  boolean,
  boolean
>;

export const PaginationQueryBaseSchema = (
  {
    sortOrder = "asc",
    pageIndex = 0,
    pageSize = 20,
  }: {
    sortOrder?: "asc" | "desc";
    pageIndex?: number;
    pageSize?: number;
  } = {
    sortOrder: "asc",
    pageIndex: 0,
    pageSize: 20,
  },
) =>
  z.object({
    sortOrder: z
      .enum(["asc", "desc"])
      .default(sortOrder)
      .describe("Sort direction (ascending or descending)"),
    pageIndex: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(pageIndex)
      .describe("Zero-based page index"),
    pageSize: z.coerce
      .number()
      .int()
      .nonnegative()
      .min(1)
      .max(100)
      .default(pageSize)
      .describe("Number of items per page (1-100)"),
  });

export const EnvironmentQuerySchema = z
  .object({
    envId: z.string().min(1).describe("Environment identifier"),
  })
  .strict();

export type EnvironmentQuery = z.infer<typeof EnvironmentQuerySchema>;

export const ExternalIdSchema = z
  .string()
  .nonempty()
  .max(256)
  .describe("External identifier, non-empty string up to 256 characters");
