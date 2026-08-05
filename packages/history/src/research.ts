import { z } from "zod";

export const HISTORY_RESEARCH_SCHEMA_VERSION = "history-research-v1" as const;

const nonEmptyText = z.string().trim().min(1);
const boundedText = (max: number) => nonEmptyText.max(max);
const uniqueStrings = (max: number) =>
  z.array(boundedText(240)).max(max).superRefine((values, context) => {
    if (new Set(values.map((value) => value.toLocaleLowerCase())).size !== values.length) {
      context.addIssue({ code: "custom", message: "Values must be unique." });
    }
  });

export const historySourceQualitySchema = z.enum([
  "primary",
  "peer-reviewed-scholarly",
  "museum-archive-university",
  "reputable-reference",
  "reputable-journalism",
  "specialist-secondary",
  "low-confidence-general-web",
  "prohibited-unreliable",
]);
export type HistorySourceQuality = z.infer<typeof historySourceQualitySchema>;

export const importedSourceStatusSchema = z.enum([
  "declared-by-pack",
  "retrieved",
  "assessed",
  "approved",
  "rejected",
  "unavailable",
]);
export type ImportedSourceStatus = z.infer<typeof importedSourceStatusSchema>;

export const historySourceSchema = z
  .object({
    id: boundedText(160).regex(/^[a-z0-9][a-z0-9._:-]*$/u),
    title: boundedText(500),
    url: z.string().url().max(2_048),
    domain: boundedText(253),
    status: importedSourceStatusSchema,
    quality: historySourceQualitySchema.optional(),
    declaredByPack: z.boolean(),
    originalMarkdown: z.string().max(10_000).optional(),
    sourcePosition: z.number().int().nonnegative().optional(),
    retrievedAt: z.string().datetime({ offset: true }).optional(),
    assessmentNotes: boundedText(2_000).optional(),
  })
  .strict()
  .superRefine((source, context) => {
    if (source.status === "approved" && !source.quality) {
      context.addIssue({ code: "custom", path: ["quality"], message: "Approved sources require a quality assessment." });
    }
    if (source.status !== "declared-by-pack" && !source.retrievedAt) {
      context.addIssue({ code: "custom", path: ["retrievedAt"], message: "Retrieved, assessed, approved, rejected, and unavailable sources require a recorded retrieval time." });
    }
  });
export type HistorySource = z.infer<typeof historySourceSchema>;

export const historicalClaimClassificationSchema = z.enum([
  "established",
  "consensus",
  "inference",
  "disputed",
  "legend",
  "unknown",
]);
export type HistoricalClaimClassification = z.infer<
  typeof historicalClaimClassificationSchema
>;

export const historicalClaimSchema = z
  .object({
    id: boundedText(160).regex(/^[a-z0-9][a-z0-9._:-]*$/u),
    statement: boundedText(2_000),
    classification: historicalClaimClassificationSchema,
    confidence: z.number().finite().min(0).max(1),
    sourceIds: uniqueStrings(32),
    requiresCorroboration: z.boolean(),
    sensitivityTags: uniqueStrings(16).default([]),
    isQuotation: z.boolean().default(false),
  })
  .strict()
  .superRefine((claim, context) => {
    if (claim.isQuotation && claim.sourceIds.length === 0) {
      context.addIssue({ code: "custom", path: ["sourceIds"], message: "Quotations require a source association." });
    }
    if (["disputed", "legend", "unknown"].includes(claim.classification) && !claim.requiresCorroboration) {
      context.addIssue({ code: "custom", path: ["requiresCorroboration"], message: "Disputed, legendary, and unknown claims require corroboration." });
    }
  });
export type HistoricalClaim = z.infer<typeof historicalClaimSchema>;

export const historicalDateRangeSchema = z
  .object({
    startYear: z.number().int().min(-10_000).max(10_000).optional(),
    endYear: z.number().int().min(-10_000).max(10_000).optional(),
    precision: z.enum(["exact", "year", "decade", "century", "approximate", "unknown"]),
  })
  .strict()
  .superRefine((range, context) => {
    if (range.startYear !== undefined && range.endYear !== undefined && range.startYear > range.endYear) {
      context.addIssue({ code: "custom", path: ["endYear"], message: "Date range end must not precede its start." });
    }
  });
export type HistoricalDateRange = z.infer<typeof historicalDateRangeSchema>;

export const chronologyEventSchema = z
  .object({
    id: boundedText(160).regex(/^[a-z0-9][a-z0-9._:-]*$/u),
    label: boundedText(500),
    order: z.number().int().nonnegative(),
    dateLabel: boundedText(160).optional(),
    dateRange: historicalDateRangeSchema.optional(),
    claimIds: uniqueStrings(32).default([]),
  })
  .strict();
export type ChronologyEvent = z.infer<typeof chronologyEventSchema>;

export const chronologySchema = z.array(chronologyEventSchema).max(200).superRefine((events, context) => {
  const ids = new Set<string>();
  let previousOrder = -1;
  for (const [index, event] of events.entries()) {
    if (ids.has(event.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Chronology event IDs must be unique." });
    ids.add(event.id);
    if (event.order <= previousOrder) context.addIssue({ code: "custom", path: [index, "order"], message: "Chronology event order must be strictly increasing." });
    previousOrder = event.order;
  }
});
export type Chronology = z.infer<typeof chronologySchema>;

export const historyResearchBriefSchema = z
  .object({
    centralQuestion: boundedText(500),
    timeRange: historicalDateRangeSchema.optional(),
    geographicScope: uniqueStrings(12),
    importantActors: uniqueStrings(32),
    requiredMaps: uniqueStrings(16).default([]),
    requiredTimelines: uniqueStrings(16).default([]),
    likelyDisputedClaims: uniqueStrings(32).default([]),
    terminology: uniqueStrings(32).default([]),
    sensitivityConcerns: uniqueStrings(16).default([]),
    requiredSourceCategories: z.array(historySourceQualitySchema).min(1).max(8),
    exclusions: uniqueStrings(24).default([]),
    targetAudience: z.enum(["general", "enthusiast", "academic-lite"]),
    targetDurationMinutes: z.number().finite().positive().max(180),
  })
  .strict();
export type HistoryResearchBrief = z.infer<typeof historyResearchBriefSchema>;

const SOURCE_QUALITY_SCORES: Readonly<Record<HistorySourceQuality, number>> = {
  primary: 7,
  "peer-reviewed-scholarly": 7,
  "museum-archive-university": 6,
  "reputable-reference": 5,
  "reputable-journalism": 4,
  "specialist-secondary": 4,
  "low-confidence-general-web": 1,
  "prohibited-unreliable": 0,
};

export function sourceQualityScore(quality: HistorySourceQuality): number {
  return SOURCE_QUALITY_SCORES[quality];
}

export function requiresStrongerCorroboration(claim: HistoricalClaim): boolean {
  return claim.requiresCorroboration || claim.isQuotation || ["disputed", "legend", "unknown"].includes(claim.classification) || /\b(?:\d[\d,]*|casualt(?:y|ies)|killed|died|troops?|intent|motive|genocide|atrocit)/iu.test(claim.statement);
}

export function validateChronology(events: readonly ChronologyEvent[]): readonly string[] {
  const parsed = chronologySchema.safeParse(events);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}
