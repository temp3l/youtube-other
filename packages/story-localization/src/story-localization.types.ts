export const languageCodes = ["en", "de", "es", "fr", "pt"] as const;
export type LanguageCode = (typeof languageCodes)[number];

export type AdaptationMode = "faithful" | "retention-optimized";
export type ProcessingMode = "batch" | "sync";
export type BatchOperation =
  | "canonical-facts"
  | "english-short"
  | "localization"
  | "character-analysis"
  | "visual-analysis"
  | "repair";

export type BatchIndexStatus =
  | "prepared"
  | "submitted"
  | "validating"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "partially_completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled"
  | "imported"
  | "imported_with_failures";

export type LocalBatchManifestStatus =
  | "prepared"
  | "uploading"
  | "submitted"
  | "validating"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled"
  | "imported"
  | "imported_with_failures";

export type LocalBatchManifestItemStatus =
  | "planned"
  | "submitted"
  | "api-succeeded"
  | "api-failed"
  | "expired"
  | "schema-invalid"
  | "content-invalid"
  | "repair-required"
  | "persisted"
  | "skipped-cached";

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
  readonly processingMode: ProcessingMode;
  readonly adaptationMode: AdaptationMode;
  readonly shortMinSeconds: number;
  readonly shortMaxSeconds: number;
  readonly shortWpm: number;
  readonly concurrency: number;
  readonly model: string;
  readonly fallbackToSync: boolean;
  readonly force: boolean;
  readonly submit: boolean;
  readonly prepareBatch: boolean;
  readonly waitForBatch: boolean;
  readonly autoImport: boolean;
  readonly pollIntervalSeconds: number;
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

export interface CompactCanonicalStoryFacts {
  readonly characters: readonly {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly relationship?: string;
  }[];
  readonly setting?: string;
  readonly criticalObjects: readonly string[];
  readonly criticalEvents: readonly string[];
  readonly writtenMessages: readonly string[];
  readonly centralThreat: string;
  readonly primaryReveal: string;
  readonly finalConsequence: string;
}

export interface CompactStorySource {
  readonly episodeNumber: string;
  readonly primaryTitle: string;
  readonly sourceTitle?: string;
  readonly narration: string;
  readonly thumbnailHook?: string;
  readonly contentDisclosure?: string;
  readonly soundMotif?: string;
  readonly canonicalFacts: CompactCanonicalStoryFacts;
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

export interface StoryLocalizationRunResult {
  readonly counts: StoryLocalizationRunCounts;
  readonly results: readonly StoryLocalizationEpisodeResult[];
}

export interface StoryBatchItem<TBody extends object = Record<string, unknown>> {
  readonly customId: string;
  readonly method: "POST";
  readonly url: "/v1/responses";
  readonly body: TBody;
  readonly metadata: {
    readonly episodeNumber: string;
    readonly sourceHash: string;
    readonly operation: BatchOperation;
    readonly language?: LanguageCode;
    readonly promptVersion: string;
    readonly configurationHash: string;
  };
}

export interface OpenAIBatchRequestLine {
  readonly custom_id: string;
  readonly method: "POST";
  readonly url: "/v1/responses";
  readonly body: Record<string, unknown>;
}

export interface LocalBatchManifestItem {
  readonly customId: string;
  readonly episodeNumber: string;
  readonly language?: LanguageCode;
  readonly operation: BatchOperation;
  readonly sourcePath: string;
  readonly sourceHash: string;
  readonly promptVersion: string;
  readonly configurationHash: string;
  readonly plannedOutputPaths: readonly string[];
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens?: number;
  readonly status: LocalBatchManifestItemStatus;
  readonly resultImportedAt?: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly cachedInputTokens?: number;
    readonly outputTokens: number;
  };
  readonly error?: {
    readonly code?: string;
    readonly message: string;
  };
}

export interface LocalBatchManifest {
  readonly schemaVersion: string;
  readonly localBatchId: string;
  readonly rootLocalBatchId: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly mode: "batch";
  readonly endpoint: "/v1/responses";
  readonly model: string;
  readonly completionWindow: "24h";
  readonly inputFilePath: string;
  readonly inputFileHash: string;
  readonly openAIInputFileId?: string;
  readonly openAIBatchId?: string;
  readonly status: LocalBatchManifestStatus;
  readonly items: readonly LocalBatchManifestItem[];
  readonly outputFileId?: string;
  readonly errorFileId?: string;
  readonly resultFilePath?: string;
  readonly errorFilePath?: string;
  readonly reportFilePath?: string;
  readonly submittedAt?: string;
  readonly completedAt?: string;
  readonly importedAt?: string;
  readonly requestCounts?: {
    readonly total: number;
    readonly completed: number;
    readonly failed: number;
  };
}

export interface BatchIndexEntry {
  readonly localBatchId: string;
  readonly openAIBatchId?: string;
  readonly rootLocalBatchId: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber: number;
  readonly status: BatchIndexStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly completedAt?: string;
  readonly importedAt?: string;
  readonly model: string;
  readonly endpoint: "/v1/responses";
  readonly completionWindow: "24h";
  readonly operations: readonly BatchOperation[];
  readonly episodeNumbers: readonly string[];
  readonly languages: readonly LanguageCode[];
  readonly itemCount: number;
  readonly completedItemCount: number;
  readonly failedItemCount: number;
  readonly persistedItemCount: number;
  readonly inputFilePath: string;
  readonly manifestPath: string;
  readonly resultFilePath?: string;
  readonly errorFilePath?: string;
  readonly reportFilePath?: string;
  readonly openAIInputFileId?: string;
  readonly outputFileId?: string;
  readonly errorFileId?: string;
  readonly sourceHashPrefixes: readonly string[];
  readonly imported: boolean;
  readonly requiresImport: boolean;
  readonly hasRetryableFailures: boolean;
  readonly estimatedInputTokens?: number;
  readonly actualInputTokens?: number;
  readonly actualOutputTokens?: number;
  readonly estimatedCostUsd?: number;
  readonly lastError?: {
    readonly code?: string;
    readonly message: string;
    readonly occurredAt: string;
  };
}

export interface BatchIndexFile {
  readonly schemaVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entries: readonly BatchIndexEntry[];
}

export interface BatchIndexFilter {
  readonly statuses?: readonly BatchIndexStatus[];
  readonly episodeNumbers?: readonly string[];
  readonly languages?: readonly LanguageCode[];
  readonly operations?: readonly BatchOperation[];
  readonly model?: string;
  readonly imported?: boolean;
  readonly requiresImport?: boolean;
  readonly hasRetryableFailures?: boolean;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export interface BatchIndexRepairReport {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly manifestsScanned: number;
  readonly entriesRebuilt: number;
  readonly entriesUpdated: number;
  readonly entriesUnchanged: number;
  readonly malformedManifests: readonly string[];
  readonly duplicateLocalBatchIds: readonly string[];
  readonly duplicateOpenAIBatchIds: readonly string[];
  readonly missingReferencedFiles: readonly string[];
  readonly orphanedResultFiles: readonly string[];
  readonly orphanedErrorFiles: readonly string[];
}

export interface BatchIndexVerificationReport {
  readonly checkedAt: string;
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export interface BatchPreparationResult {
  readonly localBatchId: string;
  readonly manifestPath: string;
  readonly inputFilePath: string;
  readonly itemCount: number;
  readonly skippedCachedItemCount: number;
}

export interface BatchSubmissionResult {
  readonly localBatchId: string;
  readonly openAIBatchId: string;
  readonly openAIInputFileId: string;
  readonly status: BatchIndexStatus;
}

export interface BatchImportResult {
  readonly localBatchId: string;
  readonly importedItemCount: number;
  readonly failedItemCount: number;
  readonly persistedFiles: readonly string[];
  readonly status: BatchIndexStatus;
}
