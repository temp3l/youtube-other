import type { HistoryDocumentaryPresetId } from "./contracts.js";

export interface HistoryContentPackEpisodeOverlay {
  readonly sourceFile: string;
  readonly presetId: HistoryDocumentaryPresetId;
  readonly canonicalFormat: "standard";
  readonly audienceLevel: "general";
  readonly requiredFeatures: {
    readonly maps: boolean;
    readonly timeline: boolean;
    readonly relationshipDiagram?: boolean;
    readonly processDiagram?: boolean;
  };
  readonly sensitivityTags: readonly string[];
}

export interface HistoryFormatImportRule {
  readonly sourceFormat: string;
  readonly canonicalFormat: "short" | "standard" | "long";
  readonly appliesWhen: {
    readonly targetDurationMinutes?: { readonly minInclusive: number; readonly maxInclusive: number };
    readonly wordCount?: { readonly minInclusive: number; readonly maxInclusive: number };
  };
  readonly reason: string;
}

export interface HistoryContentPackCompatibility {
  readonly packId: string;
  readonly contractVersion: string;
  readonly genreAliases: Readonly<Record<string, "history">>;
  readonly formatRules: readonly HistoryFormatImportRule[];
  readonly episodeOverlays: readonly HistoryContentPackEpisodeOverlay[];
}

const standard = (sourceFile: string, presetId: HistoryDocumentaryPresetId, maps: boolean, timeline: boolean, sensitivityTags: readonly string[], extras: Partial<HistoryContentPackEpisodeOverlay["requiredFeatures"]> = {}): HistoryContentPackEpisodeOverlay => ({
  sourceFile,
  presetId,
  canonicalFormat: "standard",
  audienceLevel: "general",
  requiredFeatures: { maps, timeline, ...extras },
  sensitivityTags,
});

export const YOUTUBE_HISTORY_10_VIDEO_PACK_COMPATIBILITY: HistoryContentPackCompatibility = {
  packId: "youtube-history-10-video-story-pack",
  contractVersion: "youtube-history-story-pack.v1",
  genreAliases: { "history-documentary": "history", history: "history" },
  formatRules: [{
    sourceFormat: "long-form-youtube-video",
    canonicalFormat: "standard",
    appliesWhen: {
      targetDurationMinutes: { minInclusive: 6, maxInclusive: 12 },
      wordCount: { minInclusive: 800, maxInclusive: 1_600 },
    },
    reason: "Pack v1 uses a legacy long-form label for approximately ten-minute scripts; canonical History classifies 6–10 minute documentaries as standard.",
  }],
  episodeOverlays: [
    standard("01-bronze-age-collapse.md", "civilization-rise-fall", true, true, ["warfare", "famine", "societal-collapse"]),
    standard("02-napoleons-invasion-of-russia.md", "military-campaign", true, true, ["warfare", "mass-death"]),
    standard("03-fall-of-the-roman-empire.md", "civilization-rise-fall", true, true, ["warfare", "political-collapse"]),
    standard("04-black-death.md", "disaster-pandemic-survival", true, true, ["pandemic", "mass-death", "persecution"]),
    standard("05-franklin-expedition.md", "archaeology-mystery", true, true, ["death", "survival", "indigenous-knowledge"]),
    standard("06-mongol-war-machine.md", "military-campaign", true, true, ["warfare", "civilian-harm"]),
    standard("07-day-life-medieval-peasant.md", "everyday-life", false, true, ["class", "representativeness"], { processDiagram: true }),
    standard("08-cuban-missile-crisis.md", "world-war-geopolitics", true, true, ["nuclear-weapons", "living-political-sensitivity"], { relationshipDiagram: true }),
    standard("09-cleopatra-beyond-legend.md", "historical-biography", true, true, ["gendered-myth", "warfare"], { relationshipDiagram: true }),
    standard("10-titanic-decisions-disaster.md", "disaster-pandemic-survival", true, true, ["mass-death", "victim-sensitive"], { processDiagram: true }),
  ],
};

export function resolveHistoryPackCompatibility(packId: string): HistoryContentPackCompatibility | undefined {
  return packId === YOUTUBE_HISTORY_10_VIDEO_PACK_COMPATIBILITY.packId
    ? YOUTUBE_HISTORY_10_VIDEO_PACK_COMPATIBILITY
    : undefined;
}
