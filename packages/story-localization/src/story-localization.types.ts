export const languageCodes = ["en", "de", "es", "fr", "pt"] as const;
export type LanguageCode = (typeof languageCodes)[number];

export type AdaptationMode = "faithful" | "retention-optimized";

export interface LanguageProfile {
  readonly code: LanguageCode;
  readonly displayName: string;
  readonly locale: string;
  readonly narratorLanguageName: string;
  readonly fullNarrationWpm: number;
  readonly shortNarrationWpm: number;
  readonly shortWordRange: {
    readonly min: number;
    readonly target: number;
    readonly max: number;
  };
  readonly stylisticGuidance: readonly string[];
  readonly defaultFullHashtags: readonly string[];
  readonly defaultShortHashtags: readonly string[];
}

export interface StoryLocalizationConfig {
  readonly sourceDirectory: string;
  readonly outputDirectory: string;
  readonly languages: readonly Exclude<LanguageCode, "en">[];
  readonly includeEnglishShort: boolean;
  readonly adaptationMode: AdaptationMode;
  readonly shortMinSeconds: number;
  readonly shortMaxSeconds: number;
  readonly shortWpm: number;
  readonly concurrency: number;
  readonly model: string;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly validateOnly: boolean;
  readonly verbose: boolean;
  readonly promptVersion: string;
}

export interface SourceStoryMetadata {
  readonly episodeNumber: string;
  readonly primaryTitle: string;
  readonly sourceTitle?: string;
  readonly audioInstructions: readonly string[];
  readonly soundMotif?: string;
  readonly narration: readonly string[];
  readonly contentDisclosure?: string;
  readonly thumbnailText?: string;
  readonly seoDescription?: string;
  readonly tags: readonly string[];
  readonly hashtags: readonly string[];
  readonly narrationWpm?: number;
  readonly visualDirection?: string;
}

export interface ParsedSourceStory {
  readonly language: "en";
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly episodeNumber: string;
  readonly slug: string;
  readonly title: string;
  readonly sourceTitle?: string;
  readonly audioInstructions: readonly string[];
  readonly soundMotif?: string;
  readonly narrationParagraphs: readonly string[];
  readonly metadata: SourceStoryMetadata;
  readonly content: string;
}

export interface CanonicalStoryFacts {
  readonly episodeNumber: string;
  readonly primaryTitle: string;
  readonly sourceTitle?: string;
  readonly characters: readonly {
    readonly name: string;
    readonly role: string;
    readonly relationship?: string;
  }[];
  readonly setting?: string;
  readonly criticalObjects: readonly string[];
  readonly criticalEvents: readonly string[];
  readonly writtenMessages: readonly string[];
  readonly threat: string;
  readonly primaryReveal: string;
  readonly finalConsequence: string;
  readonly unresolvedQuestion?: string;
}

export type ShortsImageStrategy =
  | "regenerate"
  | "smart-crop"
  | "pan-and-scan"
  | "blurred-fill";

export interface ShortsImageConfig {
  readonly enabled: boolean;
  readonly keySceneCount: number;
  readonly portraitWidth: number;
  readonly portraitHeight: number;
  readonly finalWidth: number;
  readonly finalHeight: number;
  readonly reuseLandscapeImages: boolean;
  readonly enablePanAndScan: boolean;
  readonly enableBlurredFallback: boolean;
  readonly forceRegenerateAll: boolean;
}

export interface ShortsScenePlan {
  readonly sceneId: string;
  readonly sequenceNumber: number;
  readonly strategy: ShortsImageStrategy;
  readonly sourceLandscapePath?: string;
  readonly outputPortraitPath: string;
  readonly regenerateReason?: string;
  readonly motion?: {
    readonly mode: "none" | "pan-and-scan";
    readonly startX?: number;
    readonly endX?: number;
    readonly startY?: number;
    readonly endY?: number;
    readonly startZoom?: number;
    readonly endZoom?: number;
  };
}

export interface ShortsSceneManifestEntry {
  readonly sceneId: string;
  readonly sequenceNumber: number;
  readonly strategy: ShortsImageStrategy;
  readonly sourceImagePath?: string;
  readonly outputImagePath: string;
  readonly reusedExistingImage: boolean;
  readonly regenerated: boolean;
  readonly attemptCount: number;
  readonly status: "success" | "skipped" | "failed";
  readonly error?: string | null;
}

export interface GeneratedStoryPackage {
  readonly language: LanguageCode;
  readonly full: {
    readonly title: string;
    readonly sourceTitle?: string;
    readonly audioInstructions: readonly string[];
    readonly soundMotif?: string;
    readonly narrationParagraphs: readonly string[];
    readonly thumbnailText: string;
    readonly contentDisclosure: string;
    readonly seoDescription: string;
    readonly tags: readonly string[];
    readonly hashtags: readonly string[];
    readonly targetNarrationWpm: number;
    readonly visualDirection: string;
  } | undefined;
  readonly short: {
    readonly title: string;
    readonly narrationInstructions: readonly string[];
    readonly narrationParagraphs: readonly string[];
    readonly thumbnailText: string;
    readonly description: string;
    readonly hashtags: readonly string[];
    readonly targetNarrationWpm: number;
    readonly recommendedDurationSeconds: {
      readonly min: number;
      readonly max: number;
    };
    readonly visualGuidance: string;
  };
  readonly preservationChecklist: {
    readonly charactersPreserved: boolean;
    readonly relationshipsPreserved: boolean;
    readonly chronologyPreserved: boolean;
    readonly criticalObjectsPreserved: boolean;
    readonly cluesPreserved: boolean;
    readonly writtenMessagesPreserved: boolean;
    readonly primaryRevealPreserved: boolean;
    readonly endingPreserved: boolean;
    readonly noNewPlotElementsAdded: boolean;
  };
  readonly diagnostics: {
    readonly fullWordCount: number | undefined;
    readonly shortWordCount: number;
    readonly shortEstimatedDurationSeconds: number;
    readonly removedGenericFiller: readonly string[];
    readonly adaptationNotes: readonly string[];
  };
}

export interface StoryLocalizationCacheEntry {
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly configurationHash: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly language: LanguageCode;
  readonly generatedAt: string;
  readonly outputFiles: readonly string[];
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface ModelPricing {
  readonly inputUsdPerMillionTokens: number;
  readonly cachedInputUsdPerMillionTokens?: number;
  readonly outputUsdPerMillionTokens: number;
}

export interface StoryLocalizationRunCounts {
  readonly discovered: number;
  readonly copiedEnglishFull: number;
  readonly generatedEnglishShort: number;
  readonly generatedGermanFull: number;
  readonly generatedGermanShort: number;
  readonly generatedSpanishFull: number;
  readonly generatedSpanishShort: number;
  readonly generatedFrenchFull: number;
  readonly generatedFrenchShort: number;
  readonly generatedPortugueseFull: number;
  readonly generatedPortugueseShort: number;
  readonly skipped: number;
  readonly cacheHits: number;
  readonly repairAttempts: number;
  readonly failures: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly estimatedTotalCostUsd: number | null;
  readonly totalExecutionTimeMs: number;
}

export interface StoryLocalizationEpisodeResult {
  readonly episodeNumber: string;
  readonly slug: string;
  readonly sourceFile: string;
  readonly copiedEnglishFull?: string;
  readonly generatedFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly cacheHit: boolean;
  readonly repairAttempts: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly failure?: string;
}
