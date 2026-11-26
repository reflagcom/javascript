export const FunnelStepList = [
  "company",
  "segment",
  "tried",
  "adopted",
  "retained",
] as const;

export type FunnelStep = (typeof FunnelStepList)[number];

export type FeedbackSource = "api" | "manual" | "prompt" | "sdk" | "widget";

export type SatisfactionScore = 0 | 1 | 2 | 3 | 4 | 5;

export type ParamType = string | number | boolean | Date;

export type PaginatedResponse<T> = {
  data: T[];
  metadata: Record<string, any>;
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  sortBy: string;
  sortOrder: string;
};
