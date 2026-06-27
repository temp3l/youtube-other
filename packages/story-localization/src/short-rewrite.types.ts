import {
  type BatchCategory,
} from "./story-localization.types.js";
import { type ModelPricing } from "@mediaforge/observability";
import { type OpenAiStoryClient } from "./story-localization-openai-batch.js";
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
  readonly schemaVersion: 1;
  readonly promptVersion: string;
  readonly status: "completed" | "failed" | "skipped";
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly targetLanguage: StoryLanguage;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly markdownOutputPath: string;
  readonly jsonOutputPath: string;
  readonly generatedAt: string;
  readonly model: string;
  readonly requestId?: string | undefined;
  readonly generationDurationMs: number;
  readonly inputTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
  readonly reasoningTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
  readonly estimatedCostUsd?: number | null | undefined;
  readonly validation: ShortRewriteValidation;
}

export interface ShortRewriteManifest {
  readonly schemaVersion: 1;
  readonly promptVersion: string;
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly updatedAt: string;
  readonly artifacts: readonly ShortRewriteArtifact[];
}

export interface ShortRewriteJsonSidecar {
  readonly schemaVersion: 1;
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly targetLanguage: StoryLanguage;
  readonly promptVersion: string;
  readonly model: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly generatedAt: string;
  readonly generation: ShortRewriteGeneration;
  readonly usage: ShortRewriteUsage;
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
  readonly reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly retryMaxOutputTokens?: number | undefined;
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
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly targetLanguage: StoryLanguage;
  readonly targetLanguageName: string;
  readonly targetLocale: string;
  readonly sourceStory: string;
  readonly narration: string;
  readonly title: string;
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
