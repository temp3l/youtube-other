import { type BatchCategory } from "./story-localization.types.js";
import { type ModelPricing } from "@mediaforge/observability";
import { type OpenAiStoryClient } from "./story-localization-openai-batch.js";
import { type CharacterRenameMap } from "./character-rename.service.js";
import {
  type ShortStoryOutputConstraints,
  type StoryIR,
} from "./story-artifact-model.js";
import {
  type CanonicalStoryFacts,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import {
  SHORT_REWRITE_SUPPORTED_LANGUAGES,
  type ShortRewriteLanguage,
} from "./short-rewrite.constants.js";

export type StoryLanguage = ShortRewriteLanguage;

export interface ShortRewriteLanguageDefinition {
  readonly name: string;
  readonly locale: string;
}

export const SUPPORTED_STORY_LANGUAGES: Readonly<
  Record<StoryLanguage, ShortRewriteLanguageDefinition>
> = SHORT_REWRITE_SUPPORTED_LANGUAGES;

export interface ResolvedShortRewriteSource {
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly episodeNumber: string;
  readonly sourcePath: string;
  readonly sourceContent: string;
  readonly sourceSha256: string;
  readonly title: string;
  readonly narration: string;
  readonly audioInstructions: readonly string[];
  readonly metadataSection: Readonly<Record<string, string>>;
  readonly resolvedFrom:
    | "explicit-input"
    | "manifest"
    | "canonical-path"
    | "deterministic-search";
  readonly candidatePaths: readonly string[];
}

export interface ShortRewriteArtifactIdentity {
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly language: StoryLanguage;
  readonly locale: string;
  readonly variant: "short";
}

export interface ShortRewriteParentFullIdentity {
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly language: StoryLanguage;
  readonly locale: string;
  readonly variant: "full";
}

export interface ShortRewriteResolvedParent {
  readonly identity: ShortRewriteParentFullIdentity;
  readonly title: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly parentFullHash: string;
  readonly storyIrHash: string;
  readonly contractHash: string;
  readonly contractBuildFingerprint?: string | undefined;
  readonly narrationParagraphs: readonly string[];
  readonly characterRenameMap: CharacterRenameMap;
  readonly canonical: boolean;
  readonly provenance:
    | "canonical-full-artifact"
    | "localized-full-artifact"
    | "compatibility-source";
}

export interface ShortRewriteSourceBeat {
  readonly id: string;
  readonly paragraphIndex: number;
  readonly sentenceIndex: number;
  readonly text: string;
  readonly references: readonly string[];
  readonly retained: boolean;
}

export interface ShortRewriteOrphanedReference {
  readonly reference: string;
  readonly introducedByBeatId: string;
  readonly firstRetainedBeatId: string;
}

export interface ShortRewriteSourceExtraction {
  readonly version: string;
  readonly parentFullHash: string;
  readonly storyIrHash: string;
  readonly locale: string;
  readonly targetVariant: "short";
  readonly maximumBeats: number;
  readonly selectedBeatIds: readonly string[];
  readonly removedBeatIds: readonly string[];
  readonly beats: readonly ShortRewriteSourceBeat[];
  readonly orphanedReferences: readonly ShortRewriteOrphanedReference[];
  readonly extractionHash: string;
}

export interface ShortRewriteAdaptationContract {
  readonly schemaVersion: string;
  readonly contractVersion: string;
  readonly identity: ShortRewriteArtifactIdentity;
  readonly parent: ShortRewriteResolvedParent["identity"] & {
    readonly parentFullHash: string;
    readonly sourceSha256: string;
  };
  readonly storyIrHash: string;
  readonly immutableFacts: readonly {
    readonly id: string;
    readonly statement: string;
  }[];
  readonly centralThreat: string;
  readonly centralRuleOrMechanism: string;
  readonly criticalObject: string;
  readonly climaxOrIrreversibleTurn: string;
  readonly finalConsequenceOrSting: string;
  readonly exactWrittenMessages: readonly string[];
  readonly allowedCompression: readonly string[];
  readonly forbiddenOmissions: readonly string[];
  readonly retentionBoundaries: {
    readonly factsMustRemain: readonly string[];
    readonly detailsMayCompress: readonly string[];
    readonly detailsMayRemove: readonly string[];
    readonly dialogueMayShorten: readonly string[];
  };
  readonly inventionBoundaries: readonly string[];
  readonly constraints: {
    readonly targetDurationSeconds: {
      readonly min: number;
      readonly max: number;
    };
    readonly targetNarrationWpm: number;
    readonly targetWordRange: {
      readonly min: number;
      readonly max: number;
    };
    readonly hookDeadlineSeconds: number;
    readonly maximumBeats: number;
  };
  readonly sourceExtraction: {
    readonly extractionHash: string;
    readonly selectedBeatIds: readonly string[];
    readonly orphanedReferences: readonly ShortRewriteOrphanedReference[];
  };
  readonly contractHash: string;
}

export interface ShortRewritePromptLineage {
  readonly compilerVersion?: string | undefined;
  readonly promptFingerprint?: string | undefined;
  readonly responseSchemaName?: string | undefined;
  readonly responseSchemaVersion?: string | undefined;
  readonly responseSchemaFingerprint?: string | undefined;
}

export interface ShortRewriteGeneration {
  readonly title: string;
  readonly hook: string;
  readonly narration: string;
  readonly wordCount: number;
  readonly estimatedDurationSecondsAt175Wpm: number;
  readonly estimatedDurationSecondsAt180Wpm: number;
  readonly thumbnailText: string;
  readonly fullVideoBridge: string;
}

export interface ShortRewriteValidation {
  readonly preferredWordRangeSatisfied: boolean;
  readonly hardWordRangeSatisfied: boolean;
  readonly hookMatchesNarration: boolean;
  readonly thumbnailWordCount: number;
  readonly warnings: readonly string[];
}

export interface ShortRewriteUsage {
  readonly inputTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
  readonly reasoningTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
  readonly estimatedCostUsd?: number | null | undefined;
  readonly pricingVersion?: string | undefined;
}

export interface ShortRewriteArtifact {
  readonly schemaVersion: 2;
  readonly promptVersion: string;
  readonly promptFingerprint?: string | undefined;
  readonly status: "completed" | "failed" | "skipped";
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly targetLanguage: StoryLanguage;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly locale: string;
  readonly variant: "short";
  readonly parent: ShortRewriteResolvedParent["identity"] & {
    readonly parentFullHash: string;
    readonly sourceSha256: string;
  };
  readonly storyIrHash: string;
  readonly shortContractHash: string;
  readonly shortContractVersion: string;
  readonly shortContractSchemaVersion: string;
  readonly shortSourceExtractionHash: string;
  readonly shortSourceExtractionVersion: string;
  readonly canonical: boolean;
  readonly markdownOutputPath: string;
  readonly jsonOutputPath: string;
  readonly generatedAt: string;
  readonly model: string;
  readonly reasoningEffort?: string | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly requestId?: string | undefined;
  readonly generationDurationMs: number;
  readonly inputTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
  readonly reasoningTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
  readonly estimatedCostUsd?: number | null | undefined;
  readonly failedRequest?:
    | {
        readonly model: string;
        readonly reasoningEffort?: string | undefined;
        readonly outputCap: number;
        readonly attemptNumber: number;
        readonly requestFingerprint?: string | undefined;
        readonly incompleteReason?: string | undefined;
        readonly usage?: ShortRewriteUsage | undefined;
        readonly estimatedCostUsd?: number | null | undefined;
      }
    | undefined;
  readonly repairHistory?:
    | readonly {
        readonly stage: "repair" | "regenerate";
        readonly issues: readonly string[];
      }[]
    | undefined;
  readonly promptLineage?: ShortRewritePromptLineage | undefined;
  readonly validation: ShortRewriteValidation;
}

export interface ShortRewriteManifest {
  readonly schemaVersion: 2;
  readonly promptVersion: string;
  readonly promptFingerprint?: string | undefined;
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly canonical: boolean;
  readonly model: string;
  readonly generatedAt: string;
  readonly updatedAt: string;
  readonly artifacts: readonly ShortRewriteArtifact[];
}

export interface ShortRewriteJsonSidecar {
  readonly schemaVersion: 2;
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly targetLanguage: StoryLanguage;
  readonly locale: string;
  readonly variant: "short";
  readonly promptVersion: string;
  readonly promptFingerprint?: string | undefined;
  readonly model: string;
  readonly reasoningEffort?: string | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly parent: ShortRewriteResolvedParent["identity"] & {
    readonly parentFullHash: string;
    readonly sourceSha256: string;
  };
  readonly storyIrHash: string;
  readonly shortSourceExtraction: ShortRewriteSourceExtraction;
  readonly shortAdaptationContract: ShortRewriteAdaptationContract;
  readonly promptLineage?: ShortRewritePromptLineage | undefined;
  readonly canonical: boolean;
  readonly generatedAt: string;
  readonly generation: ShortRewriteGeneration;
  readonly usage: ShortRewriteUsage;
  readonly repairHistory?:
    | readonly {
        readonly stage: "repair" | "regenerate";
        readonly issues: readonly string[];
      }[]
    | undefined;
  readonly validation: ShortRewriteValidation;
}

export interface ShortRewriteRunOptions {
  readonly inputPath?: string | undefined;
  readonly episode?: string | undefined;
  readonly episodeSlug?: string | undefined;
  readonly outputRoot?: string | undefined;
  readonly languages: readonly StoryLanguage[];
  readonly model: string;
  readonly allowSourceInput?: boolean | undefined;
  readonly temperature?: number | undefined;
  readonly reasoningEffort?:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly retryMaxOutputTokens?: number | undefined;
  readonly repairModel?: string | undefined;
  readonly repairReasoningEffort?:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  readonly repairMaxOutputTokens?: number | undefined;
  readonly maxConcurrency?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxRetries?: number | undefined;
  readonly overwrite?: boolean | undefined;
  readonly resume?: boolean | undefined;
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly verbose?: boolean | undefined;
  readonly json?: boolean | undefined;
}

export interface ShortRewriteRunSummary {
  readonly command: "stories rewrite-short";
  readonly runId: string;
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly promptVersion: string;
  readonly promptFingerprint?: string | undefined;
  readonly model: string;
  readonly languagesRequested: readonly StoryLanguage[];
  readonly completed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly generationDurationMs: number;
  readonly artifacts: readonly ShortRewriteArtifact[];
  readonly failures: readonly {
    readonly language: StoryLanguage;
    readonly message: string;
  }[];
  readonly dryRun: boolean;
}

export interface ShortRewriteServices {
  readonly client: Pick<OpenAiStoryClient, "responses">;
  readonly modelPricing?: Readonly<Record<string, ModelPricing>>;
}

export interface ShortRewriteResolvedPaths {
  readonly episodeDir: string;
  readonly outputDir: string;
  readonly manifestPath: string;
  readonly candidateSourcePaths: readonly string[];
}

export interface ShortRewriteGenerationResult {
  readonly artifact: ShortRewriteArtifact;
  readonly jsonSidecar: ShortRewriteJsonSidecar;
  readonly markdown: string;
  readonly markdownPath: string;
  readonly jsonPath: string;
}

export interface ShortRewriteResolvedInput {
  readonly source: ResolvedShortRewriteSource;
  readonly resolvedPaths: ShortRewriteResolvedPaths;
}

export interface ShortRewritePromptContext {
  readonly targetLanguage: StoryLanguage;
  readonly targetLocale: string;
  readonly sourceStory: ParsedSourceStory | string;
  readonly canonicalFacts?: CanonicalStoryFacts;
  readonly storyIr?: StoryIR;
  readonly outputConstraints?: ShortStoryOutputConstraints;
  readonly sourceExtraction?: ShortRewriteSourceExtraction;
  readonly adaptationContract?: ShortRewriteAdaptationContract;
  readonly characterRenameMap?: CharacterRenameMap;
  readonly episodeNumber?: string;
  readonly episodeSlug?: string;
  readonly narration?: string;
  readonly title?: string;
}

export interface ShortRewriteApiResult {
  readonly id: string;
  readonly outputText: string;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}
