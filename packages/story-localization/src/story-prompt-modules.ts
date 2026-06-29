import { z } from "zod";
import { type GenrePolicy } from "./genre-policy.js";
import {
  type FullStoryContract,
  type FullStoryContractEnvelope,
} from "./full-story-contract.js";
import { type SourceCleaningReport } from "./source-cleaning.js";
import {
  storyArtifactOwnerSchema,
  type FullStoryOutputConstraints,
  type ShortStoryOutputConstraints,
  type StoryIR,
  type StoryValidationIssue,
} from "./story-artifact-model.js";
import {
  type AdaptationMode,
  type CanonicalStoryFacts,
  type LanguageCode,
  type LanguageProfile,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import {
  type OriginalityReview,
  type RetentionBeat,
  type StoryBible,
  type StorySourceAnalysis,
} from "./story-production.js";

export const STORY_PROMPT_COMPILER_VERSION = "story-prompt-compiler-v1";

export const storyPromptVariantSchema = z.enum(["full", "short"]);
export type StoryPromptVariant = z.infer<typeof storyPromptVariantSchema>;

export const storyPromptModuleIdSchema = z.enum([
  "core-story-rewrite-task",
  "trust-boundary",
  "source-cleaning-context",
  "full-story-contract",
  "nonfiction-boundaries",
  "genre-policy",
  "locale-rules",
  "dialogue-handling",
  "written-message-handling",
  "names-and-identifiers",
  "critical-object-continuity",
  "opening-requirements",
  "ending-requirements",
  "response-schema",
  "metadata-forbidden",
  "audio-forbidden",
  "scene-plan-forbidden",
  "image-plan-forbidden",
  "render-forbidden",
  "publication-forbidden",
]);
export type StoryPromptModuleId = z.infer<typeof storyPromptModuleIdSchema>;

export const storyPromptClassificationOutcomeSchema = z.enum([
  "confident",
  "unknown-safe",
  "unknown-unsafe",
]);
export type StoryPromptClassificationOutcome = z.infer<
  typeof storyPromptClassificationOutcomeSchema
>;

export const storyPromptDiagnosticSeveritySchema = z.enum([
  "info",
  "warning",
  "error",
]);
export type StoryPromptDiagnosticSeverity = z.infer<
  typeof storyPromptDiagnosticSeveritySchema
>;

export interface StoryPromptDiagnostic {
  readonly code: string;
  readonly severity: StoryPromptDiagnosticSeverity;
  readonly message: string;
  readonly moduleId?: StoryPromptModuleId;
  readonly blocking: boolean;
}

export interface StoryPromptRenderedRule {
  readonly id: string;
  readonly text: string;
}

export interface StoryPromptRenderedSection {
  readonly heading: string;
  readonly body: string;
  readonly rules?: readonly StoryPromptRenderedRule[];
}

export interface StoryPromptSchemaDescriptor {
  readonly name: string;
  readonly version: string;
  readonly fingerprint: string;
  readonly schema: z.ZodTypeAny;
}

export interface StoryPromptProductionContext {
  readonly analysis?: StorySourceAnalysis;
  readonly bible?: StoryBible;
  readonly originalityReview?: OriginalityReview;
  readonly retentionPlan?: ReadonlyArray<RetentionBeat>;
}

export interface StoryPromptSharedInput {
  readonly language: LanguageCode;
  readonly languageProfile: LanguageProfile;
  readonly adaptationMode: AdaptationMode;
  readonly sourceStory: ParsedSourceStory;
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly storyIr: StoryIR;
  readonly genrePolicy: GenrePolicy;
  readonly classificationOutcome: StoryPromptClassificationOutcome;
  readonly responseSchema: StoryPromptSchemaDescriptor;
  readonly productionContext?: StoryPromptProductionContext;
  readonly sourceCleaningReport?: SourceCleaningReport;
  readonly localeModuleVersion: string;
  readonly selectedLocale: string;
}

export interface FullStoryPromptInput extends StoryPromptSharedInput {
  readonly variant: "full";
  readonly contract: FullStoryContract;
  readonly contractEnvelope: FullStoryContractEnvelope;
  readonly outputConstraints: FullStoryOutputConstraints;
}

export interface ShortStoryPromptInput extends StoryPromptSharedInput {
  readonly variant: "short";
  readonly outputConstraints: ShortStoryOutputConstraints;
  readonly fullStoryText: string;
}

export type StoryPromptModuleContext =
  | FullStoryPromptInput
  | ShortStoryPromptInput;

export type StoryPromptApplicability =
  | {
      readonly kind: "include";
    }
  | {
      readonly kind: "skip";
      readonly reason: string;
    }
  | {
      readonly kind: "reject";
      readonly reason: string;
      readonly diagnostic: StoryPromptDiagnostic;
    };

export interface StoryPromptModuleDescriptor {
  readonly id: StoryPromptModuleId;
  readonly semanticVersion: string;
  readonly owner: z.infer<typeof storyArtifactOwnerSchema>;
  readonly stage: "story-rewrite";
  readonly variants: readonly StoryPromptVariant[];
  readonly dependencies: readonly StoryPromptModuleId[];
  readonly conflicts: readonly StoryPromptModuleId[];
  readonly order: number;
  applies(context: StoryPromptModuleContext): StoryPromptApplicability;
  render(context: StoryPromptModuleContext): {
    readonly system?: StoryPromptRenderedSection;
    readonly user?: StoryPromptRenderedSection;
  };
  fingerprint(context: StoryPromptModuleContext): unknown;
}

export interface SelectedStoryPromptModule {
  readonly module: StoryPromptModuleDescriptor;
  readonly system?: StoryPromptRenderedSection;
  readonly user?: StoryPromptRenderedSection;
}

export function isNarrationOwner(
  owner: z.infer<typeof storyArtifactOwnerSchema>
): owner is "narration" {
  return owner === "narration";
}

export function validationIssuesToDiagnostics(
  issues: readonly StoryValidationIssue[]
): readonly StoryPromptDiagnostic[] {
  return issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity === "error" ? "error" : "warning",
    message: issue.message,
    blocking: issue.severity === "error",
  }));
}
