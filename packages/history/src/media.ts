import { z } from "zod";

import {
  historicalPeriodSchema,
  historyAudioPresetIdSchema,
  historyDocumentaryPresetIdSchema,
  historyFormatSchema,
  historyNarrativeModeSchema,
  type HistoricalPeriod,
  type HistoryAudioPresetId,
  type HistoryDocumentaryPresetId,
  type HistoryFormat,
  type HistoryNarrativeMode,
} from "./contracts.js";

const nonEmptyText = z.string().trim().min(1);
const identifier = z.string().regex(/^[a-z][a-z0-9-]*$/u);

export const historyVisualModeSchema = z.enum([
  "cinematic-reconstruction",
  "archival-documentary",
  "illustrated-manuscript",
  "period-art",
  "artifact-museum-object",
  "animated-map",
  "timeline",
  "family-tree",
  "process-diagram",
  "architectural-reconstruction",
  "location-environment",
  "newspaper-document",
  "portrait",
  "statistical-graphic",
]);
export type HistoryVisualMode = z.infer<typeof historyVisualModeSchema>;

export const historyReconstructionStatusSchema = z.enum([
  "authentic-asset",
  "evidence-backed-reconstruction",
  "interpretive-reconstruction",
  "illustrative",
]);
export type HistoryReconstructionStatus = z.infer<
  typeof historyReconstructionStatusSchema
>;

export const historyVisualPromptSchema = z
  .object({
    approximatePeriod: nonEmptyText,
    location: nonEmptyText,
    cultureOrPolity: nonEmptyText,
    subject: nonEmptyText,
    socialRole: nonEmptyText.optional(),
    clothing: z.array(nonEmptyText).default([]),
    architecture: z.array(nonEmptyText).default([]),
    objects: z.array(nonEmptyText).default([]),
    weatherOrTime: nonEmptyText.optional(),
    visualMode: historyVisualModeSchema,
    framing: nonEmptyText,
    shotPurpose: nonEmptyText,
    continuityReferences: z.array(identifier).default([]),
    prohibitedAnachronisms: z.array(nonEmptyText).min(1),
    reconstructionStatus: historyReconstructionStatusSchema,
    reconstructionLabel: nonEmptyText.optional(),
    sensitivityConstraints: z.array(nonEmptyText).default([]),
    evidenceRequirements: z.array(nonEmptyText).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.reconstructionStatus !== "authentic-asset" &&
      !value.reconstructionLabel
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reconstructionLabel"],
        message: "Generated or interpretive scenes require a reconstruction label.",
      });
    }
  });
export type HistoryVisualPrompt = z.infer<typeof historyVisualPromptSchema>;

export const historyMapPlanSchema = z
  .object({
    id: identifier,
    phase: nonEmptyText,
    dateOrRange: nonEmptyText,
    geographicExtent: nonEmptyText,
    entities: z.array(nonEmptyText).min(1),
    routes: z.array(nonEmptyText).default([]),
    labels: z.array(nonEmptyText).default([]),
    uncertainty: nonEmptyText.optional(),
    sourceIds: z.array(identifier).default([]),
    animationInstructions: nonEmptyText.optional(),
    accessibilityDescription: nonEmptyText,
    modernBordersForOrientationOnly: z.boolean().default(false),
  })
  .strict();
export type HistoryMapPlan = z.infer<typeof historyMapPlanSchema>;

export const historyTimelineEntrySchema = z
  .object({
    id: identifier,
    dateOrRange: nonEmptyText,
    label: nonEmptyText,
    detail: nonEmptyText.optional(),
    certainty: z.enum(["established", "consensus", "inference", "disputed", "unknown"]),
    sourceIds: z.array(identifier).default([]),
  })
  .strict();

export const historyTimelinePlanSchema = z
  .object({
    id: identifier,
    kind: z.enum(["episode", "life", "campaign", "dynasty", "adoption", "disaster"]),
    entries: z.array(historyTimelineEntrySchema).min(1),
    accessibilityDescription: nonEmptyText,
  })
  .strict();
export type HistoryTimelinePlan = z.infer<typeof historyTimelinePlanSchema>;

export const historyRelationshipDiagramSchema = z
  .object({
    id: identifier,
    kind: z.enum(["family-tree", "alliance", "rivalry", "command", "institutional"]),
    nodes: z.array(z.object({ id: identifier, label: nonEmptyText }).strict()).min(2),
    edges: z.array(z.object({ from: identifier, to: identifier, label: nonEmptyText }).strict()).min(1),
    sourceIds: z.array(identifier).default([]),
    accessibilityDescription: nonEmptyText,
  })
  .strict();
export type HistoryRelationshipDiagram = z.infer<typeof historyRelationshipDiagramSchema>;

export const historyProcessDiagramSchema = z
  .object({
    id: identifier,
    subject: nonEmptyText,
    steps: z.array(z.object({ id: identifier, label: nonEmptyText, detail: nonEmptyText.optional() }).strict()).min(2),
    sourceIds: z.array(identifier).default([]),
    accessibilityDescription: nonEmptyText,
  })
  .strict();
export type HistoryProcessDiagram = z.infer<typeof historyProcessDiagramSchema>;

export const historyPronunciationLexiconSchema = z
  .object({
    language: nonEmptyText,
    entries: z.array(z.object({
      id: identifier,
      phrase: nonEmptyText,
      replacement: nonEmptyText,
      note: nonEmptyText.optional(),
    }).strict()).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, entry] of value.entries.entries()) {
      if (ids.has(entry.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["entries", index, "id"], message: "Pronunciation entry IDs must be unique." });
      ids.add(entry.id);
    }
  });
export type HistoryPronunciationLexicon = z.infer<typeof historyPronunciationLexiconSchema>;

export interface HistoryAudioPreset {
  readonly id: HistoryAudioPresetId;
  readonly description: string;
  readonly speakingRate: number;
  readonly chapterPauseMs: number;
  readonly quotationHandling: "measured" | "emphasized";
  readonly providerControls: readonly string[];
}

export const historyAudioPresets: Readonly<Record<HistoryAudioPresetId, HistoryAudioPreset>> = Object.freeze({
  "documentary-neutral": { id: "documentary-neutral", description: "Calm, authoritative, and measured.", speakingRate: 1, chapterPauseMs: 450, quotationHandling: "measured", providerControls: ["voiceId", "locale", "stability", "style", "fallback"] },
  "documentary-epic": { id: "documentary-epic", description: "Broader dynamics for major turning points without theatricality.", speakingRate: 0.96, chapterPauseMs: 650, quotationHandling: "emphasized", providerControls: ["voiceId", "locale", "stability", "style", "fallback"] },
  "documentary-investigative": { id: "documentary-investigative", description: "Controlled suspense and precise pauses for evidence-led mysteries.", speakingRate: 0.94, chapterPauseMs: 600, quotationHandling: "measured", providerControls: ["voiceId", "locale", "stability", "style", "fallback"] },
  "documentary-intimate": { id: "documentary-intimate", description: "Warmer delivery for biographies and everyday history.", speakingRate: 0.98, chapterPauseMs: 500, quotationHandling: "measured", providerControls: ["voiceId", "locale", "stability", "style", "fallback"] },
});

export interface HistoryPresetMediaDefaults {
  readonly narrativeMode: HistoryNarrativeMode;
  readonly audioPresetId: HistoryAudioPresetId;
  readonly visualModes: readonly HistoryVisualMode[];
  readonly mapDensity: "low" | "medium" | "high";
  readonly timelineDensity: "low" | "medium" | "high";
  readonly relationshipDiagram: boolean;
  readonly processDiagram: boolean;
  readonly speculativeReconstruction: "low" | "medium";
  readonly sensitivityLevel: "standard" | "high";
}

const defaults = (value: HistoryPresetMediaDefaults): HistoryPresetMediaDefaults => Object.freeze({ ...value, visualModes: Object.freeze([...value.visualModes]) });

export const historyPresetMediaDefaults: Readonly<Record<HistoryDocumentaryPresetId, HistoryPresetMediaDefaults>> = Object.freeze({
  "military-campaign": defaults({ narrativeMode: "strategic-analysis", audioPresetId: "documentary-epic", visualModes: ["animated-map", "timeline", "cinematic-reconstruction"], mapDensity: "high", timelineDensity: "medium", relationshipDiagram: false, processDiagram: false, speculativeReconstruction: "low", sensitivityLevel: "standard" }),
  "civilization-rise-fall": defaults({ narrativeMode: "rise-and-fall", audioPresetId: "documentary-epic", visualModes: ["animated-map", "timeline", "artifact-museum-object", "architectural-reconstruction"], mapDensity: "medium", timelineDensity: "high", relationshipDiagram: false, processDiagram: false, speculativeReconstruction: "low", sensitivityLevel: "standard" }),
  "historical-biography": defaults({ narrativeMode: "biographical", audioPresetId: "documentary-intimate", visualModes: ["portrait", "newspaper-document", "timeline"], mapDensity: "medium", timelineDensity: "high", relationshipDiagram: true, processDiagram: false, speculativeReconstruction: "low", sensitivityLevel: "standard" }),
  "archaeology-mystery": defaults({ narrativeMode: "investigative", audioPresetId: "documentary-investigative", visualModes: ["artifact-museum-object", "animated-map", "architectural-reconstruction"], mapDensity: "medium", timelineDensity: "medium", relationshipDiagram: false, processDiagram: false, speculativeReconstruction: "low", sensitivityLevel: "standard" }),
  "world-war-geopolitics": defaults({ narrativeMode: "chronological", audioPresetId: "documentary-neutral", visualModes: ["animated-map", "archival-documentary", "timeline", "newspaper-document"], mapDensity: "high", timelineDensity: "high", relationshipDiagram: true, processDiagram: false, speculativeReconstruction: "low", sensitivityLevel: "high" }),
  "royal-court-intrigue": defaults({ narrativeMode: "biographical", audioPresetId: "documentary-intimate", visualModes: ["portrait", "family-tree", "newspaper-document"], mapDensity: "low", timelineDensity: "high", relationshipDiagram: true, processDiagram: false, speculativeReconstruction: "low", sensitivityLevel: "standard" }),
  "everyday-life": defaults({ narrativeMode: "day-in-the-life", audioPresetId: "documentary-intimate", visualModes: ["cinematic-reconstruction", "artifact-museum-object", "process-diagram"], mapDensity: "low", timelineDensity: "medium", relationshipDiagram: false, processDiagram: true, speculativeReconstruction: "medium", sensitivityLevel: "standard" }),
  "disaster-pandemic-survival": defaults({ narrativeMode: "chronological", audioPresetId: "documentary-investigative", visualModes: ["timeline", "animated-map", "process-diagram"], mapDensity: "medium", timelineDensity: "high", relationshipDiagram: false, processDiagram: true, speculativeReconstruction: "low", sensitivityLevel: "high" }),
  "technology-trade-transformation": defaults({ narrativeMode: "chronological", audioPresetId: "documentary-neutral", visualModes: ["process-diagram", "animated-map", "timeline"], mapDensity: "high", timelineDensity: "high", relationshipDiagram: false, processDiagram: true, speculativeReconstruction: "low", sensitivityLevel: "standard" }),
  "dark-strange-history": defaults({ narrativeMode: "investigative", audioPresetId: "documentary-investigative", visualModes: ["newspaper-document", "timeline", "animated-map"], mapDensity: "medium", timelineDensity: "high", relationshipDiagram: false, processDiagram: false, speculativeReconstruction: "low", sensitivityLevel: "high" }),
});

export interface HistoryMediaSelection {
  readonly presetId: HistoryDocumentaryPresetId;
  readonly format: HistoryFormat;
  readonly period: HistoricalPeriod;
}

// Import schemas so consumers can validate configuration from one canonical module.
export const historyMediaSelectionSchema = z.object({ presetId: historyDocumentaryPresetIdSchema, format: historyFormatSchema, period: historicalPeriodSchema }).strict();
