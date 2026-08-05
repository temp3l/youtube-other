import { z } from "zod";

export const HISTORY_SCHEMA_VERSION = "mediaforge.history.v1" as const;
export const HISTORY_GENRE_ID = "history" as const;

export const historyDocumentaryPresetIds = [
  "military-campaign",
  "civilization-rise-fall",
  "historical-biography",
  "archaeology-mystery",
  "world-war-geopolitics",
  "royal-court-intrigue",
  "everyday-life",
  "disaster-pandemic-survival",
  "technology-trade-transformation",
  "dark-strange-history",
] as const;
export const historyDocumentaryPresetIdSchema = z.enum(historyDocumentaryPresetIds);
export type HistoryDocumentaryPresetId = z.infer<typeof historyDocumentaryPresetIdSchema>;

export const historyFormatSchema = z.enum(["short", "standard", "long"]);
export type HistoryFormat = z.infer<typeof historyFormatSchema>;

export const historicalPeriodSchema = z.enum([
  "prehistory",
  "ancient",
  "late antiquity",
  "medieval",
  "early modern",
  "industrial age",
  "modern",
  "contemporary history",
  "cross-period",
]);
export type HistoricalPeriod = z.infer<typeof historicalPeriodSchema>;

export const historyAudienceLevelSchema = z.enum(["general", "enthusiast", "academic-lite"]);
export type HistoryAudienceLevel = z.infer<typeof historyAudienceLevelSchema>;

export const historyNarrativeModeSchema = z.enum([
  "chronological",
  "investigative",
  "biographical",
  "strategic-analysis",
  "day-in-the-life",
  "rise-and-fall",
]);
export type HistoryNarrativeMode = z.infer<typeof historyNarrativeModeSchema>;

export const historyAudioPresetIdSchema = z.enum([
  "documentary-neutral",
  "documentary-epic",
  "documentary-investigative",
  "documentary-intimate",
]);
export type HistoryAudioPresetId = z.infer<typeof historyAudioPresetIdSchema>;

export const historicalPeriodDateRangeSchema = z.strictObject({
  startYear: z.number().int().optional(),
  endYear: z.number().int().optional(),
  calendar: z.enum(["BCE-CE", "ISO-8601"]).default("BCE-CE"),
  confidence: z.number().min(0).max(1),
  approximate: z.boolean(),
}).superRefine((value, context) => {
  if (value.startYear !== undefined && value.endYear !== undefined && value.startYear > value.endYear) {
    context.addIssue({ code: "custom", path: ["endYear"], message: "End year must not precede start year." });
  }
});

const labels = z.array(z.string().trim().min(1).max(160)).max(40).default([]);
const geographicBase = { originalLabels: labels } as const;
export const geographicScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("global"), ...geographicBase }),
  z.strictObject({ kind: z.literal("regional"), name: z.string().trim().min(1), ...geographicBase }),
  z.strictObject({ kind: z.literal("country"), name: z.string().trim().min(1), ...geographicBase }),
  z.strictObject({ kind: z.literal("empire-civilization"), name: z.string().trim().min(1), ...geographicBase }),
  z.strictObject({ kind: z.literal("city-site"), name: z.string().trim().min(1), ...geographicBase }),
  z.strictObject({ kind: z.literal("battlefield-route"), name: z.string().trim().min(1), ...geographicBase }),
  z.strictObject({ kind: z.literal("custom"), label: z.string().trim().min(1), hierarchy: labels, ...geographicBase }),
]);
export type GeographicScope = z.infer<typeof geographicScopeSchema>;

export const historyEvidencePolicySchema = z.strictObject({
  requireClaimSourceAssociations: z.boolean().default(true),
  requireQuotationVerification: z.boolean().default(true),
  requireChronologyValidation: z.boolean().default(true),
  requireCorroborationForSensitiveClaims: z.boolean().default(true),
  allowUnmarkedSpeculation: z.literal(false).default(false),
  generatedReconstructionsRequireDisclosure: z.literal(true).default(true),
  minimumSourceQuality: z.enum(["scholarly", "institutional", "reputable-secondary"]),
});
export type HistoryEvidencePolicy = z.infer<typeof historyEvidencePolicySchema>;

export const historyVisualPresetSchema = z.strictObject({
  mapDensity: z.enum(["none", "low", "medium", "high"]),
  timelineDensity: z.enum(["none", "low", "medium", "high"]),
  diagramDensity: z.enum(["none", "low", "medium", "high"]),
  reconstructionDensity: z.enum(["none", "low", "medium", "high"]),
  graphicImagery: z.boolean().default(false),
  antiAnachronismValidation: z.literal(true).default(true),
});
export type HistoryVisualPreset = z.infer<typeof historyVisualPresetSchema>;

export const historyAudioPresetSchema = z.strictObject({
  id: historyAudioPresetIdSchema,
  speakingRate: z.number().min(0.75).max(1.15),
  wordsPerMinute: z.number().min(80).max(180),
  chapterPauseMs: z.number().int().min(0).max(5000),
  provider: z.string().trim().min(1).optional(),
  voiceId: z.string().trim().min(1).optional(),
  fallback: z.enum(["fail", "configured-provider-chain"]),
});
export type HistoryAudioPresetConfig = z.infer<typeof historyAudioPresetSchema>;

export const historyMetadataPresetSchema = z.strictObject({
  titleStyle: z.enum(["explanatory", "event-driven", "character-driven", "consequence-driven", "mystery-driven"]),
  thumbnailTextMaxWords: z.number().int().min(0).max(4).default(4),
  chaptersRequired: z.boolean(),
  reconstructionDisclosureRequired: z.boolean(),
});
export type HistoryMetadataPreset = z.infer<typeof historyMetadataPresetSchema>;

export const historyGenreConfigSchema = z.strictObject({
  schemaVersion: z.literal(HISTORY_SCHEMA_VERSION),
  genreId: z.literal(HISTORY_GENRE_ID),
  presetId: historyDocumentaryPresetIdSchema,
  format: historyFormatSchema,
  period: historicalPeriodSchema.optional(),
  dateRange: historicalPeriodDateRangeSchema.optional(),
  geographicScope: geographicScopeSchema.optional(),
  audienceLevel: historyAudienceLevelSchema,
  narrativeMode: historyNarrativeModeSchema,
  evidencePolicy: historyEvidencePolicySchema,
  visualPreset: historyVisualPresetSchema,
  audioPreset: historyAudioPresetSchema,
  metadataPreset: historyMetadataPresetSchema,
});
export type HistoryGenreConfig = z.infer<typeof historyGenreConfigSchema>;

export interface HistoryDocumentaryPresetDefinition {
  readonly id: HistoryDocumentaryPresetId;
  readonly narrativeMode: HistoryNarrativeMode;
  readonly defaultAudioPreset: HistoryAudioPresetId;
  readonly titleStyle: HistoryMetadataPreset["titleStyle"];
  readonly mapDensity: HistoryVisualPreset["mapDensity"];
  readonly timelineDensity: HistoryVisualPreset["timelineDensity"];
  readonly diagramDensity: HistoryVisualPreset["diagramDensity"];
  readonly reconstructionDensity: HistoryVisualPreset["reconstructionDensity"];
  readonly sensitivity: "moderate" | "high";
}

export const HISTORY_DOCUMENTARY_PRESETS: Readonly<Record<HistoryDocumentaryPresetId, HistoryDocumentaryPresetDefinition>> = {
  "military-campaign": { id: "military-campaign", narrativeMode: "strategic-analysis", defaultAudioPreset: "documentary-epic", titleStyle: "consequence-driven", mapDensity: "high", timelineDensity: "medium", diagramDensity: "medium", reconstructionDensity: "low", sensitivity: "high" },
  "civilization-rise-fall": { id: "civilization-rise-fall", narrativeMode: "rise-and-fall", defaultAudioPreset: "documentary-neutral", titleStyle: "explanatory", mapDensity: "medium", timelineDensity: "high", diagramDensity: "medium", reconstructionDensity: "medium", sensitivity: "moderate" },
  "historical-biography": { id: "historical-biography", narrativeMode: "biographical", defaultAudioPreset: "documentary-intimate", titleStyle: "character-driven", mapDensity: "low", timelineDensity: "high", diagramDensity: "medium", reconstructionDensity: "medium", sensitivity: "moderate" },
  "archaeology-mystery": { id: "archaeology-mystery", narrativeMode: "investigative", defaultAudioPreset: "documentary-investigative", titleStyle: "mystery-driven", mapDensity: "medium", timelineDensity: "medium", diagramDensity: "medium", reconstructionDensity: "medium", sensitivity: "moderate" },
  "world-war-geopolitics": { id: "world-war-geopolitics", narrativeMode: "strategic-analysis", defaultAudioPreset: "documentary-neutral", titleStyle: "event-driven", mapDensity: "high", timelineDensity: "high", diagramDensity: "medium", reconstructionDensity: "low", sensitivity: "high" },
  "royal-court-intrigue": { id: "royal-court-intrigue", narrativeMode: "investigative", defaultAudioPreset: "documentary-intimate", titleStyle: "character-driven", mapDensity: "low", timelineDensity: "high", diagramDensity: "high", reconstructionDensity: "medium", sensitivity: "moderate" },
  "everyday-life": { id: "everyday-life", narrativeMode: "day-in-the-life", defaultAudioPreset: "documentary-intimate", titleStyle: "explanatory", mapDensity: "low", timelineDensity: "low", diagramDensity: "medium", reconstructionDensity: "medium", sensitivity: "moderate" },
  "disaster-pandemic-survival": { id: "disaster-pandemic-survival", narrativeMode: "chronological", defaultAudioPreset: "documentary-neutral", titleStyle: "consequence-driven", mapDensity: "medium", timelineDensity: "high", diagramDensity: "medium", reconstructionDensity: "low", sensitivity: "high" },
  "technology-trade-transformation": { id: "technology-trade-transformation", narrativeMode: "chronological", defaultAudioPreset: "documentary-neutral", titleStyle: "consequence-driven", mapDensity: "medium", timelineDensity: "high", diagramDensity: "high", reconstructionDensity: "medium", sensitivity: "moderate" },
  "dark-strange-history": { id: "dark-strange-history", narrativeMode: "investigative", defaultAudioPreset: "documentary-investigative", titleStyle: "mystery-driven", mapDensity: "low", timelineDensity: "medium", diagramDensity: "low", reconstructionDensity: "low", sensitivity: "high" },
};

export const HISTORY_FORMAT_DEFAULTS = {
  short: { minSeconds: 45, maxSeconds: 75, minWords: 80, maxWords: 190, minVisualBeats: 5, maxVisualBeats: 9, chaptersRequired: false },
  standard: { minSeconds: 360, maxSeconds: 660, minWords: 800, maxWords: 1600, minVisualBeats: 8, maxVisualBeats: 16, chaptersRequired: true },
  long: { minSeconds: 900, maxSeconds: 1500, minWords: 1400, maxWords: 4000, minVisualBeats: 16, maxVisualBeats: 40, chaptersRequired: true },
} as const satisfies Readonly<Record<HistoryFormat, object>>;

export const CINEMATIC_PUBLIC_HISTORIAN_PERSONA = {
  id: "cinematic-public-historian",
  displayName: "Cinematic Public Historian",
  description: "Narrative tension with historiographical caution, primary-source awareness, and accessible explanation.",
  boundedBy: ["evidence-policy", "documentary-preset", "locale", "safety", "operator-settings"],
} as const;

export function listHistoryPresets(): readonly HistoryDocumentaryPresetDefinition[] {
  return historyDocumentaryPresetIds.map((id) => HISTORY_DOCUMENTARY_PRESETS[id]);
}
