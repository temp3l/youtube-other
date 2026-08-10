import { normalizeContentProfileId } from "@mediaforge/domain";
import { z } from "zod";

const identifier = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const revisionAnalyticsComparisonRequestSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;
    return { ...(value as Record<string, unknown>), contentProfileId: normalizeContentProfileId(Reflect.get(value, "contentProfileId")) };
  },
  z.strictObject({
    schemaVersion: z.literal("revision-analytics-comparison-request.v1"),
    contentProfileId: z.literal("veronicabenini"),
    episodeId: identifier,
    metric: identifier,
    comparisonDimensions: z.array(z.enum(["locale", "format"])).min(1).max(2).refine((values) => new Set(values).size === values.length, "Comparison dimensions must be unique."),
    cohorts: z.array(z.strictObject({ observationId: identifier, format: z.enum(["full", "short"]) })).min(2).max(100).refine((values) => new Set(values.map((value) => value.observationId)).size === values.length, "Comparison observations must be unique."),
    effectiveConfigurationHash: sha256,
    dependencyIdentity: z.record(identifier, sha256).refine(
      (value) => Object.keys(value).length >= 1 && Object.keys(value).length <= 100,
      "Comparison dependency identity requires 1 to 100 entries.",
    ),
  }),
);
export type RevisionAnalyticsComparisonRequest = z.infer<typeof revisionAnalyticsComparisonRequestSchema>;
