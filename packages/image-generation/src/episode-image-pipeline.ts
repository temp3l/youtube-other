import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { z } from "zod";
import {
  requiresSceneText,
  type Scene,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  currentExecutionTelemetry,
  estimateImageGenerationCost,
} from "@mediaforge/observability";
import {
  collapseRepeatedTokenRuns,
  copyAtomic,
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  readJsonIfExists,
  resolveEpisodeImageCheckpointPath,
  resolveEpisodeImageCheckpointsDir,
  resolveEpisodeCharacterReferencePath,
  resolveEpisodeCharacterRegistryPath,
  resolveEpisodeImageFailurePath,
  resolveEpisodeImageFailuresDir,
  resolveEpisodeImageManifestPath,
  resolveEpisodeImagePromptPath,
  resolveEpisodeImageProviderRequestPath,
  resolveEpisodeImageProviderRequestsDir,
  resolveEpisodeImageProviderResponsePath,
  resolveEpisodeImageProviderResponsesDir,
  resolveEpisodeImageVisualPlanPath,
  resolveEpisodeImageVisualPlansDir,
  resolveSceneImageCandidatePaths,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  buildSceneNegativePrompt,
  buildSceneTextPromptSection,
} from "./scene-text.js";

export type CharacterId = string;

export interface WardrobeDefinition {
  upperBody: string;
  lowerBody: string;
  footwear: string;
  outerwear?: string;
  accessories: string[];
  carriedObjects: string[];
  colors: string[];
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  role: string;
  aliases?: string[];
  collectiveLabels?: string[];
  physicalDescription: string;
  ageRange: string;
  genderPresentation: string;
  ethnicityOrRegionalAppearance?: string;
  face: {
    shape: string;
    skinTone: string;
    eyeColor: string;
    eyebrows: string;
    nose: string;
    mouth: string;
    distinguishingFeatures: string[];
  };
  hair: {
    color: string;
    length: string;
    style: string;
    texture?: string;
  };
  build: string;
  height?: string;
  defaultWardrobe: WardrobeDefinition;
  continuityTraits: string[];
  referenceImagePath?: string;
  referenceFileId?: string;
  referenceStatus: "missing" | "generated" | "approved";
}

export interface CharacterRegistry {
  episodeId: string;
  characters: CharacterDefinition[];
  updatedAt: string;
}

export type SceneCharacterUsage = {
  characterId: CharacterId;
  wardrobeVariantId?: string;
  pose?: string;
  expression?: string;
  position?: string;
  visibleFeatures?: string[];
};

export type ShotSize =
  | "extreme-wide"
  | "wide"
  | "medium-wide"
  | "medium"
  | "medium-close-up"
  | "close-up"
  | "extreme-close-up"
  | "insert";

export type CameraAngle =
  | "eye-level"
  | "low-angle"
  | "high-angle"
  | "over-the-shoulder"
  | "point-of-view"
  | "profile"
  | "rear-three-quarter"
  | "top-down";

export interface SceneVisualSpec {
  sceneId: string;
  sequenceNumber: number;
  narrativePurpose:
    | "establish"
    | "reveal"
    | "reaction"
    | "escalation"
    | "transition"
    | "climax"
    | "aftermath";
  focalSubject: string;
  visibleAction: string;
  environment: string;
  foreground: string;
  background: string;
  shotSize: ShotSize;
  cameraAngle: CameraAngle;
  cameraMovementImpression?: string;
  sourceNarration: string;
  textRequirement: Scene["textRequirement"];
  composition: string;
  lighting: string;
  timeOfDay: string;
  mood: string;
  distinctiveAnchor: string;
  continuityElements: string[];
  characters: SceneCharacterUsage[];
  unresolvedRecurringCharacterMentions?: string[];
  prohibitedElements: string[];
  allowMatchingComposition?: boolean;
  matchingCompositionReason?: string;
}

export type SceneRenderability =
  | "direct"
  | "requiresInference"
  | "mergeWithPrevious"
  | "mergeWithNext"
  | "skip";

export interface SceneNarrativeBeat {
  sceneId: string;
  sourceNarration: string;
  sourceSegmentIds: readonly string[];
}

export type SceneVisualPlanIssueCode =
  | "DUPLICATED_NARRATION"
  | "TRUNCATED_SENTENCE"
  | "ABSTRACT_VISIBLE_ACTION"
  | "PLACEHOLDER_ENVIRONMENT"
  | "MISSING_FOCAL_SUBJECT"
  | "MISSING_RECURRING_CHARACTER"
  | "UNKNOWN_CHARACTER_ID"
  | "UNRESOLVED_RECURRING_CHARACTER"
  | "NON_MATERIAL_SCENE_DIFFERENCE"
  | "PROMPT_TOO_VERBOSE"
  | "CONTRADICTORY_CONSTRAINTS"
  | "DOUBLE_PUNCTUATION"
  | "NON_VISUAL_AUDIO_REFERENCE"
  | "REQUIRED_TEXT_MISSING"
  | "BLANKET_NO_TEXT_INSTRUCTION"
  | "BLANKET_NO_TEXT_INSTRUCTION_MISSING"
  | "CONTRADICTORY_REQUIRED_FEATURE"
  | "PREVIOUS_SCENE_TEXT_LEAKAGE"
  | "EMPTY_LOCATION"
  | "VISUAL_FIELD_TOO_VERBOSE";

export interface SceneVisualPlanIssue {
  code: SceneVisualPlanIssueCode;
  message: string;
}

export interface ReferenceImage {
  characterId: CharacterId;
  filePath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface ImageProviderCharacterContext {
  characterId: CharacterId;
  usage?: SceneCharacterUsage;
  definition?: CharacterDefinition;
}

export interface ImageProviderRequest {
  sceneId: string;
  scene: SceneVisualSpec;
  previousScene?: SceneVisualSpec;
  model: string;
  size: string;
  quality: "low" | "medium" | "high" | "auto";
  outputFormat: "png";
  background: "opaque";
  outputPath: string;
  operation: "image-generation" | "image-edit";
  aspectRatio: "16:9" | "9:16";
  promptVersion: number;
  referenceImages: Array<{
    characterId: CharacterId;
    path: string;
    sha256: string;
  }>;
  characterContexts: ImageProviderCharacterContext[];
}

export interface PreparedImageProviderRequest extends ImageProviderRequest {
  prompt: string;
  promptHash: string;
  providerRequestHash: string;
}

export interface ImageGenerationRequest {
  providerRequest: PreparedImageProviderRequest;
  referenceImages: ReferenceImage[];
}

export interface GeneratedImageResult {
  outputPath: string;
  outputSha256: string;
  model: string;
  size: string;
  quality: string;
  generationMode: "text-only" | "reference-assisted";
  attempts: number;
  durationMs: number;
  requestId?: string;
  providerRequestHash: string;
  promptHash: string;
  referenceHashes: Array<{ characterId: CharacterId; sha256: string }>;
}

export interface ImageGenerator {
  generate(request: ImageGenerationRequest): Promise<GeneratedImageResult>;
}

export interface SceneGenerationManifest {
  sceneId: string;
  promptVersion: number;
  sceneHash?: string;
  visualPlanHash?: string;
  renderability?: SceneRenderability;
  finalPrompt: string;
  providerRequestHash?: string;
  promptHash: string;
  previousSceneId?: string;
  reusedFromSceneId?: string;
  materialDifferencesFromPrevious: string[];
  validationIssueCodes?: SceneVisualPlanIssueCode[];
  characterIds: CharacterId[];
  referenceImages: Array<{
    characterId: CharacterId;
    path: string;
    sha256: string;
  }>;
  model: string;
  size: string;
  quality: string;
  outputPath: string;
  outputSha256?: string;
  status: "planned" | "generated" | "failed";
  attempts: number;
  generatedAt?: string;
  error?: {
    code?: string;
    message: string;
    retryable: boolean;
  };
}

export interface PersistedSceneVisualPlan {
  sceneId: string;
  previousSceneId?: string;
  narrationBeat: SceneNarrativeBeat;
  visualSpec: SceneVisualSpec;
  renderability: SceneRenderability;
  validationIssues: SceneVisualPlanIssue[];
  materialDifferencesFromPrevious: string[];
  generatedAt: string;
}

export type SceneCheckpointStatus =
  | "planned"
  | "queued_for_next_reuse"
  | "reused_previous_scene"
  | "reused_next_scene"
  | "reused_cached_output"
  | "validation_failed"
  | "provider_requested"
  | "generated"
  | "provider_failed";

export type SceneFailureStage =
  | "visual-planning"
  | "reference-resolution"
  | "provider"
  | "filesystem"
  | "manifest";

export type SceneFailureCategory =
  | "source-data-error"
  | "visual-planning-error"
  | "prompt-validation-error"
  | "character-continuity-error"
  | "path-resolution-error"
  | "cache-error"
  | "provider-safety-rejection"
  | "provider-rate-limit"
  | "provider-transient-error"
  | "provider-permanent-error"
  | "filesystem-error"
  | "manifest-conflict";

export interface PersistedImageProviderRequest {
  sceneId: string;
  provider: "openai";
  operation: "image-generation" | "image-edit";
  model: string;
  size: string;
  quality: "low" | "medium" | "high" | "auto";
  outputFormat: "png";
  background: "opaque";
  prompt: string;
  providerRequestHash: string;
  promptHash: string;
  outputPath: string;
  referenceImages: Array<{
    characterId: string;
    path: string;
    sha256: string;
  }>;
  recordedAt: string;
}

export interface PersistedImageProviderResponse {
  sceneId: string;
  provider: "openai";
  operation: "image-generation" | "image-edit";
  model: string;
  size: string;
  quality: string;
  providerRequestHash: string;
  promptHash: string;
  outputPath: string;
  outputSha256: string;
  attempts: number;
  durationMs: number;
  requestId?: string;
  referenceHashes: Array<{
    characterId: string;
    sha256: string;
  }>;
  recordedAt: string;
}

export interface PersistedImageGenerationCheckpoint {
  sceneId: string;
  status: SceneCheckpointStatus;
  outputPath: string;
  promptHash: string;
  visualPlanHash?: string;
  cacheDecision:
    | "planned"
    | "queued-for-reuse"
    | "reused-previous"
    | "reused-next"
    | "reused-existing"
    | "validation-failed"
    | "provider-requested"
    | "generated"
    | "provider-failed";
  details?: string[];
  recordedAt: string;
}

export interface PersistedImageGenerationFailure {
  sceneId: string;
  stage: SceneFailureStage;
  category: SceneFailureCategory;
  outputPath: string;
  promptHash?: string;
  code?: string;
  message: string;
  retryable: boolean;
  attempts?: number;
  recordedAt: string;
}

export interface EpisodeImagePipelineSettings {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  model: string;
  size: string;
  resolvedSize: string;
  quality: "low" | "medium" | "high" | "auto";
  concurrency: number;
  maxRetries: number;
  timeoutMs: number;
  allowUnapprovedCharacterReferences: boolean;
  force: boolean;
  logger?: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
    debug: (obj: Record<string, unknown>, msg?: string) => void;
  };
}

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2"),
  OPENAI_IMAGE_SIZE: z.string().default("1536x1024"),
  OPENAI_IMAGE_QUALITY: z
    .enum(["low", "medium", "high", "auto"])
    .default("medium"),
  OPENAI_IMAGE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  OPENAI_IMAGE_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  OPENAI_IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES: z.string().optional(),
  OPENAI_IMAGE_FORCE: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_ORGANIZATION: z.string().optional(),
  OPENAI_PROJECT: z.string().optional(),
});

const registrySchema = z.object({
  episodeId: z.string().min(1),
  characters: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.string().min(1),
      aliases: z.array(z.string().min(1)).optional(),
      collectiveLabels: z.array(z.string().min(1)).optional(),
      physicalDescription: z.string().min(1),
      ageRange: z.string().min(1),
      genderPresentation: z.string().min(1),
      ethnicityOrRegionalAppearance: z.string().optional(),
      face: z.object({
        shape: z.string().min(1),
        skinTone: z.string().min(1),
        eyeColor: z.string().min(1),
        eyebrows: z.string().min(1),
        nose: z.string().min(1),
        mouth: z.string().min(1),
        distinguishingFeatures: z.array(z.string()),
      }),
      hair: z.object({
        color: z.string().min(1),
        length: z.string().min(1),
        style: z.string().min(1),
        texture: z.string().optional(),
      }),
      build: z.string().min(1),
      height: z.string().optional(),
      defaultWardrobe: z.object({
        upperBody: z.string().min(1),
        lowerBody: z.string().min(1),
        footwear: z.string().min(1),
        outerwear: z.string().optional(),
        accessories: z.array(z.string()),
        carriedObjects: z.array(z.string()),
        colors: z.array(z.string()),
      }),
      continuityTraits: z.array(z.string()),
      referenceImagePath: z.string().optional(),
      referenceFileId: z.string().optional(),
      referenceStatus: z.enum(["missing", "generated", "approved"]),
    })
  ),
  updatedAt: z.string(),
});

const manifestSchema = z.object({
  sceneId: z.string().min(1),
  promptVersion: z.number().int().positive(),
  sceneHash: z.string().optional(),
  visualPlanHash: z.string().optional(),
  renderability: z
    .enum([
      "direct",
      "requiresInference",
      "mergeWithPrevious",
      "mergeWithNext",
      "skip",
    ])
    .optional(),
  finalPrompt: z.string(),
  providerRequestHash: z.string().optional(),
  promptHash: z.string(),
  previousSceneId: z.string().optional(),
  reusedFromSceneId: z.string().optional(),
  materialDifferencesFromPrevious: z.array(z.string()),
  validationIssueCodes: z.array(z.string()).optional(),
  characterIds: z.array(z.string()),
  referenceImages: z.array(
    z.object({
      characterId: z.string(),
      path: z.string(),
      sha256: z.string(),
    })
  ),
  model: z.string(),
  size: z.string(),
  quality: z.string(),
  outputPath: z.string(),
  outputSha256: z.string().optional(),
  status: z.enum(["planned", "generated", "failed"]),
  attempts: z.number().int().nonnegative(),
  generatedAt: z.string().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string(),
      retryable: z.boolean(),
    })
    .optional(),
});

const sceneVisualPlanIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

const sceneVisualSpecSchema = z.object({
  sceneId: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative(),
  narrativePurpose: z.string().min(1),
  focalSubject: z.string().min(1),
  visibleAction: z.string().min(1),
  environment: z.string().min(1),
  foreground: z.string().min(1),
  background: z.string().min(1),
  shotSize: z.string().min(1),
  cameraAngle: z.string().min(1),
  cameraMovementImpression: z.string().optional(),
  sourceNarration: z.string().min(1),
  textRequirement: z.object({ required: z.boolean() }).passthrough(),
  composition: z.string().min(1),
  lighting: z.string().min(1),
  timeOfDay: z.string().min(1),
  mood: z.string().min(1),
  distinctiveAnchor: z.string().min(1),
  continuityElements: z.array(z.string()),
  characters: z.array(
    z.object({
      characterId: z.string().min(1),
      wardrobeVariantId: z.string().optional(),
      pose: z.string().optional(),
      expression: z.string().optional(),
      position: z.string().optional(),
      visibleFeatures: z.array(z.string()).optional(),
    })
  ),
  unresolvedRecurringCharacterMentions: z.array(z.string().min(1)).optional(),
  prohibitedElements: z.array(z.string()),
  allowMatchingComposition: z.boolean().optional(),
  matchingCompositionReason: z.string().optional(),
});

const persistedSceneVisualPlanSchema = z.object({
  sceneId: z.string().min(1),
  previousSceneId: z.string().optional(),
  narrationBeat: z.object({
    sceneId: z.string().min(1),
    sourceNarration: z.string().min(1),
    sourceSegmentIds: z.array(z.string().min(1)),
  }),
  visualSpec: sceneVisualSpecSchema,
  renderability: z.enum([
    "direct",
    "requiresInference",
    "mergeWithPrevious",
    "mergeWithNext",
    "skip",
  ]),
  validationIssues: z.array(sceneVisualPlanIssueSchema),
  materialDifferencesFromPrevious: z.array(z.string()),
  generatedAt: z.string(),
});

const persistedImageProviderRequestSchema = z.object({
  sceneId: z.string().min(1),
  provider: z.literal("openai"),
  operation: z.enum(["image-generation", "image-edit"]),
  model: z.string().min(1),
  size: z.string().min(1),
  quality: z.enum(["low", "medium", "high", "auto"]),
  outputFormat: z.literal("png"),
  background: z.literal("opaque"),
  prompt: z.string().min(1),
  providerRequestHash: z.string().min(1),
  promptHash: z.string().min(1),
  outputPath: z.string().min(1),
  referenceImages: z.array(
    z.object({
      characterId: z.string().min(1),
      path: z.string().min(1),
      sha256: z.string().min(1),
    })
  ),
  recordedAt: z.string(),
});

const persistedImageProviderResponseSchema = z.object({
  sceneId: z.string().min(1),
  provider: z.literal("openai"),
  operation: z.enum(["image-generation", "image-edit"]),
  model: z.string().min(1),
  size: z.string().min(1),
  quality: z.string().min(1),
  providerRequestHash: z.string().min(1),
  promptHash: z.string().min(1),
  outputPath: z.string().min(1),
  outputSha256: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  requestId: z.string().optional(),
  referenceHashes: z.array(
    z.object({
      characterId: z.string().min(1),
      sha256: z.string().min(1),
    })
  ),
  recordedAt: z.string(),
});

const persistedImageGenerationCheckpointSchema = z.object({
  sceneId: z.string().min(1),
  status: z.enum([
    "planned",
    "queued_for_next_reuse",
    "reused_previous_scene",
    "reused_next_scene",
    "reused_cached_output",
    "validation_failed",
    "provider_requested",
    "generated",
    "provider_failed",
  ]),
  outputPath: z.string().min(1),
  promptHash: z.string().min(1),
  visualPlanHash: z.string().optional(),
  cacheDecision: z.enum([
    "planned",
    "queued-for-reuse",
    "reused-previous",
    "reused-next",
    "reused-existing",
    "validation-failed",
    "provider-requested",
    "generated",
    "provider-failed",
  ]),
  details: z.array(z.string()).optional(),
  recordedAt: z.string(),
});

const persistedImageGenerationFailureSchema = z.object({
  sceneId: z.string().min(1),
  stage: z.enum([
    "visual-planning",
    "reference-resolution",
    "provider",
    "filesystem",
    "manifest",
  ]),
  category: z.enum([
    "source-data-error",
    "visual-planning-error",
    "prompt-validation-error",
    "character-continuity-error",
    "path-resolution-error",
    "cache-error",
    "provider-safety-rejection",
    "provider-rate-limit",
    "provider-transient-error",
    "provider-permanent-error",
    "filesystem-error",
    "manifest-conflict",
  ]),
  outputPath: z.string().min(1),
  promptHash: z.string().optional(),
  code: z.string().optional(),
  message: z.string().min(1),
  retryable: z.boolean(),
  attempts: z.number().int().nonnegative().optional(),
  recordedAt: z.string(),
});

const generationModeSchema = z.enum(["text-only", "reference-assisted"]);

const genericTokens = new Set([
  "shown",
  "static illustrative action",
  "appropriate scene setting",
  "cinematic documentary background",
  "subject inferred from narration",
  "generic",
  "placeholder",
]);

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "there",
  "their",
  "about",
  "into",
  "your",
  "yours",
  "they",
  "them",
  "then",
  "than",
  "when",
  "what",
  "which",
  "while",
  "were",
  "was",
  "are",
  "been",
  "being",
  "have",
  "has",
  "had",
  "you",
  "our",
  "out",
  "over",
  "under",
  "just",
  "some",
  "more",
  "most",
  "very",
  "can",
  "could",
  "would",
  "should",
  "will",
  "not",
  "but",
  "because",
  "since",
  "scene",
  "visual",
  "purpose",
  "current",
  "previous",
  "same",
]);

const supportedImageSizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);
const minimumUniqueSceneFloor = 1;
const unresolvedFocalSubject = "unresolved visual subject";
const unresolvedVisibleAction = "unresolved visible action";
const unresolvedEnvironment = "unresolved environment";

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function tokens(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeToken)
    .filter(
      (token) =>
        token.length > 2 && !stopWords.has(token) && !genericTokens.has(token)
    );
}

function tokenSet(value: string): Set<string> {
  return new Set(tokens(value));
}

function overlapRatio(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function normalizePlanText(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([!?.,;:])\1+/gu, "$1")
    .replace(/([.!?])(?=[A-Za-z])/gu, "$1 ")
    .trim();
}

function normalizedNarrationBeat(scene: Scene): SceneNarrativeBeat {
  return {
    sceneId: scene.id,
    sourceNarration: collapseRepeatedTokenRuns(
      normalizePlanText(scene.canonicalNarration),
      {
        minWindowTokens: 3,
        maxWindowTokens: 12,
      }
    ),
    sourceSegmentIds: scene.sourceSegmentIds,
  };
}

function planSentences(value: string): string[] {
  return collapseRepeatedTokenRuns(normalizePlanText(value), {
    minWindowTokens: 3,
    maxWindowTokens: 12,
  })
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => normalizePlanText(sentence))
    .filter((sentence) => sentence.length > 0);
}

function hasRepeatedNarrationSentence(value: string): boolean {
  const normalized = normalizePlanText(value);
  if (
    collapseRepeatedTokenRuns(normalized, {
      minWindowTokens: 3,
      maxWindowTokens: 12,
    }) !== normalized
  ) {
    return true;
  }
  const sentences = planSentences(value);
  for (let index = 1; index < sentences.length; index += 1) {
    const previous = sentences[index - 1];
    const current = sentences[index];
    if (!previous || !current) {
      continue;
    }
    if (overlapRatio(previous, current) > 0.85) {
      return true;
    }
  }
  return false;
}

function hasPlaceholderLanguage(value: string): boolean {
  return /suggested by|related to|reinforcing/iu.test(value);
}

function looksTruncated(value: string): boolean {
  return /\b(of|to|with|from|by|related|suggested|reinforcing)$/iu.test(
    normalizePlanText(value)
  );
}

function isLikelyAbstractVisualAction(value: string): boolean {
  return /\b(changed everything|could no longer be dismissed|carried a consequence|ended without explanation|meaning of previous events|official account ended)\b/iu.test(
    value
  );
}

function wordCount(value: string): number {
  const normalized = normalizeWhitespace(value);
  return normalized.length === 0 ? 0 : normalized.split(/\s+/u).length;
}

function stableHash(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function sceneHash(scene: Scene): string {
  return stableHash(
    JSON.stringify({
      id: scene.id,
      sequenceNumber: scene.sequenceNumber,
      canonicalNarration: scene.canonicalNarration,
      sourceSegmentIds: scene.sourceSegmentIds,
      estimatedDurationSeconds: scene.estimatedDurationSeconds,
      actualAudioDurationSeconds: scene.actualAudioDurationSeconds ?? null,
      timing: scene.timing,
      visualPurpose: scene.visualPurpose,
      subject: scene.subject,
      action: scene.action,
      setting: scene.setting,
      composition: scene.composition,
      cameraFraming: scene.cameraFraming,
      mood: scene.mood,
      continuityReferences: scene.continuityReferences,
      onScreenText: scene.onScreenText,
      negativeConstraints: scene.negativeConstraints,
      aspectRatios: scene.aspectRatios,
      imagePrompt: scene.imagePrompt,
      expectedImageFilenames: scene.expectedImageFilenames,
      qualityStatus: scene.qualityStatus,
    })
  );
}

async function canReuseSceneImage(input: {
  readonly existing: SceneGenerationManifest | null;
  readonly currentSceneHash: string;
  readonly currentPromptHash: string;
  readonly currentProviderRequestHash: string;
  readonly currentVisualPlanHash: string;
  readonly currentRenderability?: SceneRenderability;
  readonly currentReferenceImages: Array<{ readonly characterId: string; readonly sha256: string }>;
  readonly outputPath: string;
  readonly force: boolean;
}): Promise<boolean> {
  if (input.force) {
    return false;
  }
  if (!input.existing || input.existing.status !== "generated") {
    return false;
  }
  if (!(await fileExists(input.outputPath))) {
    return false;
  }
  if (input.existing.sceneHash !== input.currentSceneHash) {
    return false;
  }
  if (input.existing.promptHash !== input.currentPromptHash) {
    return false;
  }
  if (
    input.existing.providerRequestHash === undefined ||
    input.existing.providerRequestHash !== input.currentProviderRequestHash
  ) {
    return false;
  }
  if (
    input.existing.visualPlanHash !== undefined &&
    input.existing.visualPlanHash !== input.currentVisualPlanHash
  ) {
    return false;
  }
  if (
    input.existing.renderability !== undefined &&
    input.currentRenderability !== undefined &&
    input.existing.renderability !== input.currentRenderability
  ) {
    return false;
  }
  if (input.existing.referenceImages.length !== input.currentReferenceImages.length) {
    return false;
  }
  const existingRefs = new Map(
    input.existing.referenceImages.map((entry) => [entry.characterId, entry.sha256] as const)
  );
  for (const reference of input.currentReferenceImages) {
    if (existingRefs.get(reference.characterId) !== reference.sha256) {
      return false;
    }
  }
  return true;
}

function isGenericText(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = normalizeWhitespace(value).toLowerCase();
  return normalized.length === 0 || genericTokens.has(normalized);
}

function isSupportedImageSize(size: string): boolean {
  return supportedImageSizes.has(size);
}

function resolveRequestedSize(size: string): string {
  const trimmed = normalizeWhitespace(size);
  if (!/^\d+x\d+$/u.test(trimmed)) {
    throw new Error(`Invalid OPENAI_IMAGE_SIZE value: ${size}`);
  }
  const [widthText, heightText] = trimmed.split("x");
  const width = Number.parseInt(widthText ?? "", 10);
  const height = Number.parseInt(heightText ?? "", 10);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`Invalid OPENAI_IMAGE_SIZE value: ${size}`);
  }
  return trimmed;
}

function resolveCompatibleSize(requestedSize: string, model: string): string {
  const size = resolveRequestedSize(requestedSize);
  if (isSupportedImageSize(size)) {
    return size;
  }
  const [widthText, heightText] = size.split("x");
  const width = Number.parseInt(widthText ?? "", 10);
  const height = Number.parseInt(heightText ?? "", 10);
  if (model.startsWith("gpt-image-2")) {
    if (width === height) return "1024x1024";
    return width > height ? "1536x1024" : "1024x1536";
  }
  if (width === height) return "1024x1024";
  return width > height ? "1536x1024" : "1024x1536";
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sceneOutputPath(episodeDir: string, scene: Scene): string {
  return resolveSceneImageCandidatePaths({
    episodeDir,
    sceneId: scene.id,
    ...(scene.expectedImageFilenames[0]
      ? { expectedFilename: scene.expectedImageFilenames[0] }
      : {}),
  }).canonical;
}

async function hydrateCanonicalSceneImage(
  existingOutputPath: string | undefined,
  targetPath: string
): Promise<void> {
  if (!existingOutputPath || existingOutputPath === targetPath) {
    return;
  }
  if (!(await fileExists(existingOutputPath)) || (await fileExists(targetPath))) {
    return;
  }
  await copyAtomic(existingOutputPath, targetPath);
}

async function reuseSceneImageFromPriorScene(args: {
  previousSceneId: string;
  previousOutputPath: string;
  targetOutputPath: string;
}): Promise<{ outputSha256: string; reusedFromSceneId: string } | null> {
  if (!(await fileExists(args.previousOutputPath))) {
    return null;
  }
  if (args.previousOutputPath !== args.targetOutputPath) {
    await copyAtomic(args.previousOutputPath, args.targetOutputPath);
  }
  return {
    outputSha256: await hashFile(args.targetOutputPath),
    reusedFromSceneId: args.previousSceneId,
  };
}

function canResolveByReusingPreviousScene(
  renderability: SceneRenderability,
  issues: readonly SceneVisualPlanIssue[]
): boolean {
  if (renderability !== "mergeWithPrevious" && renderability !== "skip") {
    return false;
  }
  const reusableIssueCodes = new Set<SceneVisualPlanIssueCode>([
    "ABSTRACT_VISIBLE_ACTION",
    "PLACEHOLDER_ENVIRONMENT",
    "NON_MATERIAL_SCENE_DIFFERENCE",
    "PROMPT_TOO_VERBOSE",
  ]);
  return issues.every((issue) => reusableIssueCodes.has(issue.code));
}

function canResolveByReusingNextScene(
  renderability: SceneRenderability,
  issues: readonly SceneVisualPlanIssue[]
): boolean {
  return renderability === "mergeWithNext" && canResolveByReusingPreviousScene("mergeWithPrevious", issues);
}

interface PendingMergeWithNextScene {
  readonly episodeId: string;
  readonly sceneId: string;
  readonly manifestPath: string;
  readonly outputPath: string;
  readonly sceneHash: string;
  readonly providerRequest: PreparedImageProviderRequest;
  readonly prompt: string;
  readonly promptHash: string;
  readonly visualPlanHash: string;
  readonly renderability: SceneRenderability;
  readonly previousSceneId?: string;
  readonly materialDifferencesFromPrevious: readonly string[];
  readonly validationIssueCodes: readonly SceneVisualPlanIssueCode[];
  readonly characterIds: readonly string[];
  readonly referenceImages: SceneGenerationManifest["referenceImages"];
  readonly spec: SceneVisualSpec;
}

async function materializePendingMergeWithNextScenes(args: {
  readonly pendingScenes: readonly PendingMergeWithNextScene[];
  readonly sourceSceneId?: string;
  readonly sourceOutputPath?: string;
  readonly sourceOutputSha256?: string;
  readonly generator: OpenAIImageGenerator;
  readonly episodeDir: string;
  readonly registry: CharacterRegistry;
  readonly settings: EpisodeImagePipelineSettings;
  readonly client?: OpenAI;
}): Promise<EpisodeImageGenerationResult[]> {
  const results: EpisodeImageGenerationResult[] = [];
  if (args.pendingScenes.length === 0) {
    return results;
  }
  if (
    args.sourceSceneId &&
    args.sourceOutputPath &&
    args.sourceOutputSha256 &&
    (await fileExists(args.sourceOutputPath))
  ) {
    for (const pending of args.pendingScenes) {
      await copyAtomic(args.sourceOutputPath, pending.outputPath);
      const manifest: SceneGenerationManifest = {
        sceneId: pending.sceneId,
        promptVersion: pending.providerRequest.promptVersion,
        sceneHash: pending.sceneHash,
        visualPlanHash: pending.visualPlanHash,
        renderability: pending.renderability,
        finalPrompt: pending.prompt,
        providerRequestHash: pending.providerRequest.providerRequestHash,
        promptHash: pending.promptHash,
        ...(pending.previousSceneId ? { previousSceneId: pending.previousSceneId } : {}),
        reusedFromSceneId: args.sourceSceneId,
        materialDifferencesFromPrevious: [...pending.materialDifferencesFromPrevious],
        ...(pending.validationIssueCodes.length > 0
          ? { validationIssueCodes: [...pending.validationIssueCodes] }
          : {}),
        characterIds: [...pending.characterIds],
        referenceImages: pending.referenceImages,
        model: pending.providerRequest.model,
        size: pending.providerRequest.size,
        quality: pending.providerRequest.quality,
        outputPath: pending.outputPath,
        outputSha256: args.sourceOutputSha256,
        status: "generated",
        attempts: 0,
        generatedAt: new Date().toISOString(),
      };
      await writeManifest(pending.manifestPath, manifest);
      await writeGenerationCheckpoint(args.episodeDir, {
        sceneId: pending.sceneId,
        status: "reused_next_scene",
        outputPath: pending.outputPath,
        promptHash: pending.promptHash,
        visualPlanHash: pending.visualPlanHash,
        cacheDecision: "reused-next",
        details: [`reused output from ${args.sourceSceneId}`],
        recordedAt: new Date().toISOString(),
      });
      results.push({
        episodeId: pending.episodeId,
        sceneId: pending.sceneId,
        manifestPath: pending.manifestPath,
        outputPath: pending.outputPath,
        outputSha256: args.sourceOutputSha256,
        status: "skipped",
      });
    }
    return results;
  }
  for (const pending of args.pendingScenes) {
    let referenceImages: ReferenceImage[];
    try {
      ({ referenceImages } = await loadReferenceImages(
        args.episodeDir,
        args.registry,
        pending.spec,
        args.settings,
        args.client
      ));
    } catch (error) {
      const message = formatError(error);
      const errorCode = parseErrorCode(error);
      const manifest: SceneGenerationManifest = {
        sceneId: pending.sceneId,
        promptVersion: pending.providerRequest.promptVersion,
        sceneHash: pending.sceneHash,
        visualPlanHash: pending.visualPlanHash,
        renderability: pending.renderability,
        finalPrompt: pending.prompt,
        providerRequestHash: pending.providerRequest.providerRequestHash,
        promptHash: pending.promptHash,
        ...(pending.previousSceneId
          ? { previousSceneId: pending.previousSceneId }
          : {}),
        materialDifferencesFromPrevious: [...pending.materialDifferencesFromPrevious],
        ...(pending.validationIssueCodes.length > 0
          ? { validationIssueCodes: [...pending.validationIssueCodes] }
          : {}),
        characterIds: [...pending.characterIds],
        referenceImages: pending.referenceImages,
        model: pending.providerRequest.model,
        size: pending.providerRequest.size,
        quality: pending.providerRequest.quality,
        outputPath: pending.outputPath,
        status: "failed",
        attempts: 0,
        error: { message, retryable: false },
      };
      await writeManifest(pending.manifestPath, manifest);
      await writeGenerationCheckpoint(args.episodeDir, {
        sceneId: pending.sceneId,
        status: "provider_failed",
        outputPath: pending.outputPath,
        promptHash: pending.promptHash,
        visualPlanHash: pending.visualPlanHash,
        cacheDecision: "provider-failed",
        details: [message],
        recordedAt: new Date().toISOString(),
      });
      await writeGenerationFailure(args.episodeDir, {
        sceneId: pending.sceneId,
        stage: "reference-resolution",
        category: "character-continuity-error",
        outputPath: pending.outputPath,
        promptHash: pending.promptHash,
        ...(errorCode ? { code: errorCode } : {}),
        message,
        retryable: false,
        attempts: 0,
        recordedAt: new Date().toISOString(),
      });
      results.push({
        episodeId: pending.episodeId,
        sceneId: pending.sceneId,
        manifestPath: pending.manifestPath,
        outputPath: pending.outputPath,
        status: "failed",
      });
      continue;
    }
    await writeProviderRequestArtifact(
      args.episodeDir,
      pending.sceneId,
      buildProviderRequestArtifact({
        request: pending.providerRequest,
      })
    );
    await writeGenerationCheckpoint(args.episodeDir, {
      sceneId: pending.sceneId,
      status: "provider_requested",
      outputPath: pending.outputPath,
      promptHash: pending.promptHash,
      visualPlanHash: pending.visualPlanHash,
      cacheDecision: "provider-requested",
      details: ["materializing pending merge-with-next scene via provider"],
      recordedAt: new Date().toISOString(),
    });
    let generation: GeneratedImageResult;
    try {
      generation = await args.generator.generate({
        providerRequest: pending.providerRequest,
        referenceImages,
      });
    } catch (error) {
      const message = formatError(error);
      const errorCode = parseErrorCode(error);
      const retryable = isRetryableError(error);
      const manifest: SceneGenerationManifest = {
        sceneId: pending.sceneId,
        promptVersion: pending.providerRequest.promptVersion,
        sceneHash: pending.sceneHash,
        visualPlanHash: pending.visualPlanHash,
        renderability: pending.renderability,
        finalPrompt: pending.prompt,
        providerRequestHash: pending.providerRequest.providerRequestHash,
        promptHash: pending.promptHash,
        ...(pending.previousSceneId
          ? { previousSceneId: pending.previousSceneId }
          : {}),
        materialDifferencesFromPrevious: [...pending.materialDifferencesFromPrevious],
        ...(pending.validationIssueCodes.length > 0
          ? { validationIssueCodes: [...pending.validationIssueCodes] }
          : {}),
        characterIds: [...pending.characterIds],
        referenceImages: pending.referenceImages,
        model: pending.providerRequest.model,
        size: pending.providerRequest.size,
        quality: pending.providerRequest.quality,
        outputPath: pending.outputPath,
        status: "failed",
        attempts: 0,
        error: { message, retryable },
      };
      await writeManifest(pending.manifestPath, manifest);
      await writeGenerationCheckpoint(args.episodeDir, {
        sceneId: pending.sceneId,
        status: "provider_failed",
        outputPath: pending.outputPath,
        promptHash: pending.promptHash,
        visualPlanHash: pending.visualPlanHash,
        cacheDecision: "provider-failed",
        details: [message],
        recordedAt: new Date().toISOString(),
      });
      await writeGenerationFailure(args.episodeDir, {
        sceneId: pending.sceneId,
        stage: "provider",
        category: classifyFailure({
          stage: "provider",
          error,
          retryable,
        }),
        outputPath: pending.outputPath,
        promptHash: pending.promptHash,
        ...(errorCode ? { code: errorCode } : {}),
        message,
        retryable,
        attempts: 0,
        recordedAt: new Date().toISOString(),
      });
      results.push({
        episodeId: pending.episodeId,
        sceneId: pending.sceneId,
        manifestPath: pending.manifestPath,
        outputPath: pending.outputPath,
        status: "failed",
      });
      continue;
    }
    const manifest: SceneGenerationManifest = {
      sceneId: pending.sceneId,
      promptVersion: pending.providerRequest.promptVersion,
      sceneHash: pending.sceneHash,
      visualPlanHash: pending.visualPlanHash,
      renderability: pending.renderability,
      finalPrompt: pending.prompt,
      providerRequestHash: generation.providerRequestHash,
      promptHash: generation.promptHash,
      ...(pending.previousSceneId ? { previousSceneId: pending.previousSceneId } : {}),
      materialDifferencesFromPrevious: [...pending.materialDifferencesFromPrevious],
      ...(pending.validationIssueCodes.length > 0
        ? { validationIssueCodes: [...pending.validationIssueCodes] }
        : {}),
      characterIds: [...pending.characterIds],
      referenceImages: pending.referenceImages,
      model: generation.model,
      size: generation.size,
      quality: generation.quality,
      outputPath: pending.outputPath,
      ...(generation.outputSha256
        ? { outputSha256: generation.outputSha256 }
        : {}),
      status: "generated",
      attempts: generation.attempts,
      generatedAt: new Date().toISOString(),
    };
    await writeManifest(pending.manifestPath, manifest);
    await writeProviderResponseArtifact(
      args.episodeDir,
      pending.sceneId,
      buildProviderResponseArtifact({
        sceneId: pending.sceneId,
        generation,
      })
    );
    await writeGenerationCheckpoint(args.episodeDir, {
      sceneId: pending.sceneId,
      status: "generated",
      outputPath: pending.outputPath,
      promptHash: generation.promptHash,
      visualPlanHash: pending.visualPlanHash,
      cacheDecision: "generated",
      details: ["materialized pending merge-with-next scene"],
      recordedAt: new Date().toISOString(),
    });
    results.push({
      episodeId: pending.episodeId,
      sceneId: pending.sceneId,
      manifestPath: pending.manifestPath,
      outputPath: pending.outputPath,
      ...(generation.outputSha256
        ? { outputSha256: generation.outputSha256 }
        : {}),
      status: "generated",
    });
  }
  return results;
}

export function resolveEpisodeSharedDirectory(episodeDir: string): string {
  return path.join(episodeDir, "shared");
}

function promptSection(title: string, body: string): string {
  return `${title}:\n${body.trim()}`;
}

function normalizeSentence(value: string): string {
  return normalizeWhitespace(value).replace(/\s+/gu, " ");
}

function extractAnchor(value: string, fallback: string): string {
  const cleaned = normalizeSentence(value);
  if (cleaned.length === 0) return fallback;
  const selected = tokens(cleaned).slice(0, 12).join(" ");
  return selected.length > 0 ? selected : fallback;
}

function formatCharacterSubject(
  characters: readonly SceneCharacterUsage[],
  registry: CharacterRegistry
): string | undefined {
  if (characters.length === 0) {
    return undefined;
  }
  const names = characters
    .map((usage) =>
      registry.characters.find((character) => character.id === usage.characterId)
    )
    .filter((character): character is CharacterDefinition => Boolean(character))
    .map((character) => character.name);
  if (names.length === 0) {
    return undefined;
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names[0]}, ${names[1]}, and others`;
}

function inferConcreteSubjectFromNarration(scene: Scene): string | undefined {
  const narration = normalizePlanText(scene.canonicalNarration).toLowerCase();
  if (/\bchildren?\b/u.test(narration)) return "two children at the doorway";
  if (/\bmonitor\b/u.test(narration)) return "the glowing monitor";
  if (/\bwindow\b/u.test(narration) && /\brain\b/u.test(narration)) {
    return "the rain-streaked window";
  }
  if (/record/i.test(narration)) return "the bedside recorder";
  if (/\bphone\b/u.test(narration)) return "the phone on the bedside table";
  if (/\bevidence\b/u.test(narration)) return "the evidence spread across the table";
  if (/\bdoorway?\b|\bthreshold\b/u.test(narration)) return "the motel doorway";
  if (/\bcorridor\b|\bhallway\b/u.test(narration)) return "the empty corridor";
  if (/\blamp\b/u.test(narration)) return "the flickering practical lamp";
  return undefined;
}

function inferConcreteActionFromNarration(
  scene: Scene,
  subject: string
): string | undefined {
  const narration = normalizePlanText(scene.canonicalNarration).toLowerCase();
  if (/\bchildren?\b/u.test(narration)) {
    return "wait silently at the threshold";
  }
  if (/\bmonitor\b/u.test(narration)) {
    return subject.toLowerCase().includes("monitor")
      ? "glows over the desk in the dark"
      : "stares at the monitor glow";
  }
  if (/\bwindow\b/u.test(narration) && /\brain\b/u.test(narration)) {
    return "collects rain that slides down the glass";
  }
  if (/record/i.test(narration)) {
    return "glows red in the dark room";
  }
  if (/\bevidence\b/u.test(narration)) {
    return "lies scattered across the table";
  }
  if (/\bdoorway?\b|\bthreshold\b/u.test(narration)) {
    return "stands half-open against the dark hallway";
  }
  if (/\bcorridor\b|\bhallway\b/u.test(narration)) {
    return "sits empty under weak practical light";
  }
  if (/\blamp\b/u.test(narration) && /\bflicker|\bflickers|\bflickering/u.test(narration)) {
    return "flickers over the room";
  }
  if (/\bphone\b/u.test(narration)) {
    return "rests within reach on the bedside table";
  }
  return undefined;
}

function inferConcreteEnvironmentFromNarration(
  scene: Scene,
  previous?: SceneVisualSpec
): string | undefined {
  const narration = normalizePlanText(scene.canonicalNarration).toLowerCase();
  if (/\bmotel\b/u.test(narration) && /\bwindow\b/u.test(narration)) {
    return "a worn motel room beside a rain-streaked window";
  }
  if (
    /\bmotel\b/u.test(narration) &&
    (/\bdoorway?\b/u.test(narration) || /\bthreshold\b/u.test(narration))
  ) {
    return "a worn motel room opening onto a narrow hallway";
  }
  if (/\bmotel\b/u.test(narration) && /\boutside\b/u.test(narration)) {
    return "the exterior threshold outside a worn motel room";
  }
  if (/\bmotel\b/u.test(narration)) {
    return "a worn motel room under weak practical light";
  }
  if (/\bcorridor\b|\bhallway\b/u.test(narration)) {
    return "a dim corridor with concrete walls and weak practical light";
  }
  if (/record/i.test(narration)) {
    return "a dark motel room with a bedside table";
  }
  if (/\bevidence\b|\btable\b/u.test(narration)) {
    return "a cramped room with evidence spread across a table";
  }
  if (/\blamp\b/u.test(narration)) {
    return "a dim room lit by a single practical lamp";
  }
  if (previous && !isGenericText(previous.environment)) {
    return previous.environment;
  }
  return undefined;
}

function buildForegroundFallback(
  subject: string,
  scene: Scene,
  previous?: SceneVisualSpec
): string {
  const narration = normalizePlanText(scene.canonicalNarration).toLowerCase();
  if (previous?.foreground && !hasPlaceholderLanguage(previous.foreground)) {
    return previous.foreground;
  }
  if (/record/i.test(narration)) {
    return "the recorder light and nearby bedside clutter";
  }
  if (/\bwindow\b/u.test(narration)) {
    return "condensation, glass reflections, and nearby frame details";
  }
  if (/\bdoorway?\b|\bthreshold\b/u.test(narration)) {
    return "the doorframe, threshold, and nearby hands";
  }
  return `${subject} and the nearest physical props in frame`;
}

function buildBackgroundFallback(
  environment: string,
  scene: Scene,
  previous?: SceneVisualSpec
): string {
  const narration = normalizePlanText(scene.canonicalNarration).toLowerCase();
  if (previous?.background && !hasPlaceholderLanguage(previous.background)) {
    return previous.background;
  }
  if (/\bcorridor\b|\bhallway\b/u.test(narration)) {
    return "the corridor receding into shadow";
  }
  if (/\bwindow\b/u.test(narration)) {
    return "the dark exterior beyond the glass";
  }
  if (/\bdoorway?\b|\bthreshold\b/u.test(narration)) {
    return "the hallway beyond the door";
  }
  return `the surrounding walls and negative space of ${environment}`;
}

function deriveNarrativePurpose(
  scene: Scene
): SceneVisualSpec["narrativePurpose"] {
  const source =
    `${scene.visualPurpose} ${scene.canonicalNarration}`.toLowerCase();
  if (
    source.includes("reveal") ||
    source.includes("warning") ||
    source.includes("discover")
  )
    return "reveal";
  if (source.includes("react")) return "reaction";
  if (
    source.includes("climax") ||
    source.includes("collapse") ||
    source.includes("crisis")
  )
    return "climax";
  if (source.includes("aftermath")) return "aftermath";
  if (scene.sequenceNumber === 1) return "establish";
  if (source.includes("transition") || source.includes("bridge"))
    return "transition";
  if (source.includes("escalat")) return "escalation";
  return "transition";
}

function deriveShotSize(scene: Scene): ShotSize {
  const direct = scene.cameraFraming.toLowerCase();
  if (direct.includes("extreme-wide")) return "extreme-wide";
  if (direct.includes("wide")) return "wide";
  if (direct.includes("medium close")) return "medium-close-up";
  if (direct.includes("close")) return "close-up";
  if (direct.includes("insert")) return "insert";
  return scene.sequenceNumber % 2 === 0 ? "medium-close-up" : "medium";
}

function deriveCameraAngle(scene: Scene): CameraAngle {
  const source = `${scene.composition} ${scene.cameraFraming}`.toLowerCase();
  if (source.includes("over-the-shoulder")) return "over-the-shoulder";
  if (source.includes("pov") || source.includes("point of view"))
    return "point-of-view";
  if (source.includes("top")) return "top-down";
  if (source.includes("profile")) return "profile";
  if (source.includes("high")) return "high-angle";
  if (source.includes("low")) return "low-angle";
  return "eye-level";
}

function deriveVisibleAction(
  scene: Scene,
  subject: string
): string {
  if (
    !isGenericText(scene.action) &&
    !isLikelyAbstractVisualAction(scene.action)
  ) {
    return normalizeSentence(scene.action);
  }
  return (
    inferConcreteActionFromNarration(scene, subject) ?? unresolvedVisibleAction
  );
}

function deriveFocalSubject(
  scene: Scene,
  characters: readonly SceneCharacterUsage[],
  registry: CharacterRegistry
): string {
  if (!isGenericText(scene.subject)) return normalizeSentence(scene.subject);
  return (
    formatCharacterSubject(characters, registry) ??
    inferConcreteSubjectFromNarration(scene) ??
    unresolvedFocalSubject
  );
}

function buildSceneContextFragments(scene: Scene): {
  environment: string[];
  foreground: string[];
  background: string[];
} {
  const narration = normalizeSentence(scene.canonicalNarration).toLowerCase();
  const environment: string[] = [];
  const foreground: string[] = [];
  const background: string[] = [];

  if (/\bmotel\b/u.test(narration)) environment.push("the motel room");
  if (/\bdoorway?\b/u.test(narration)) background.push("the doorway");
  if (/\bhallway\b/u.test(narration)) background.push("the hallway");
  if (/\bcorridor\b/u.test(narration)) background.push("the corridor");
  if (/\brain\b/u.test(narration)) environment.push("rain on the window and floor");
  if (/\bwindow\b/u.test(narration)) background.push("the rain-streaked window");
  if (/\bphone\b/u.test(narration)) foreground.push("a phone on the bedside table");
  if (/\bmonitor\b/u.test(narration)) foreground.push("a monitor glow on a desk");
  if (/record/i.test(narration)) foreground.push("a recorder and scattered notes");
  if (/\bevidence\b/u.test(narration)) foreground.push("scattered evidence on a table");
  if (/\bchildren?\b/u.test(narration)) foreground.push("two children at the threshold");
  if (/\btable\b/u.test(narration)) foreground.push("a small table in the center of the room");
  if (/\blamp\b/u.test(narration)) environment.push("a single practical lamp");
  if (/\boutside\b/u.test(narration)) background.push("the dark space outside the room");
  if (/\bthreshold\b/u.test(narration)) foreground.push("the doorway threshold");

  return {
    environment: [...new Set(environment)],
    foreground: [...new Set(foreground)],
    background: [...new Set(background)],
  };
}

function describeSceneSpace(
  scene: Scene,
  subject: string,
  previous?: SceneVisualSpec
): { environment: string; foreground: string; background: string } {
  const fragments = buildSceneContextFragments(scene);
  const environment =
    fragments.environment.length > 0
      ? fragments.environment.join(", ")
      : inferConcreteEnvironmentFromNarration(scene, previous) ??
        unresolvedEnvironment;
  const foreground =
    fragments.foreground.length > 0
      ? fragments.foreground.join(", ")
      : buildForegroundFallback(subject, scene, previous);
  const background =
    fragments.background.length > 0
      ? fragments.background.join(", ")
      : buildBackgroundFallback(environment, scene, previous);
  return { environment, foreground, background };
}

function deriveEnvironment(scene: Scene, previous?: SceneVisualSpec): string {
  if (!isGenericText(scene.setting)) return normalizeSentence(scene.setting);
  return (
    inferConcreteEnvironmentFromNarration(scene, previous) ??
    unresolvedEnvironment
  );
}

function deriveForeground(
  scene: Scene,
  subject: string,
  previous?: SceneVisualSpec
): string {
  return describeSceneSpace(scene, subject, previous).foreground;
}

function deriveBackground(
  scene: Scene,
  subject: string,
  previous?: SceneVisualSpec
): string {
  return describeSceneSpace(scene, subject, previous).background;
}

function deriveLighting(scene: Scene): string {
  const source = `${scene.mood} ${scene.canonicalNarration}`.toLowerCase();
  if (source.includes("night") || source.includes("dark"))
    return "low-key cinematic lighting with controlled contrast";
  if (source.includes("dusk"))
    return "blue-hour dusk lighting with restrained highlights";
  if (source.includes("interrogation"))
    return "hard practical lighting with tense shadows";
  return "moody cinematic lighting with restrained color";
}

function deriveTimeOfDay(scene: Scene): string {
  const source = scene.canonicalNarration.toLowerCase();
  if (source.includes("dusk")) return "dusk";
  if (source.includes("night")) return "night";
  if (source.includes("morning")) return "morning";
  if (source.includes("afternoon")) return "afternoon";
  return scene.sequenceNumber % 2 === 0 ? "night" : "late evening";
}

function deriveMood(scene: Scene): string {
  const source = `${scene.mood} ${scene.canonicalNarration}`.toLowerCase();
  if (source.includes("fear") || source.includes("terrified"))
    return "anxious and haunted";
  if (source.includes("reveal") || source.includes("warning"))
    return "ominous and uneasy";
  if (source.includes("calm")) return "controlled but uneasy";
  return scene.mood.length > 0 ? scene.mood : "uneasy";
}

function isLowValueExposition(scene: Scene): boolean {
  const source = normalizePlanText(
    `${scene.visualPurpose} ${scene.canonicalNarration} ${scene.subject} ${scene.action} ${scene.setting}`
  ).toLowerCase();
  const vagueSurface =
    isGenericText(scene.setting) ||
    isGenericText(scene.subject) ||
    isGenericText(scene.action);
  return (
    /transition|aftermath|consequence|meaning|ordinary details|next incident|same impossible detail|without explanation|official account ended|reveal is therefore|recurring sound|recorded|support part|introduced a contradiction|advance the story|bridge|story began|first reports|detail mattered|became important|witness statements|warning was ignored|survived with evidence|setting was described|time weather|contradiction|deliberate|exaggerated|ignored impossible pattern|central sequence remained|remote roadside motel|ambulance transfer/u.test(
      source
    ) ||
    (scene.sequenceNumber > 1 && wordCount(scene.canonicalNarration) <= 20 && vagueSurface)
  );
}

function deriveRenderability(
  scene: Scene,
  spec: SceneVisualSpec,
  previous?: SceneVisualSpec
): SceneRenderability {
  const narration = normalizePlanText(scene.canonicalNarration);
  const seed = normalizePlanText(
    `${scene.action} ${scene.setting} ${scene.visualPurpose}`
  ).toLowerCase();
  const abstractBeat =
    isLikelyAbstractVisualAction(narration) ||
    isLikelyAbstractVisualAction(seed) ||
    /\btransition|aftermath|consequence|meaning|account ended|without explanation\b/iu.test(
      seed
  );
  if (previous) {
    const comparison = compareSceneSemantics(previous, spec);
    if (
      isNearIdenticalSceneComparison(comparison) &&
      (abstractBeat || isLowValueExposition(scene))
    ) {
      return "mergeWithPrevious";
    }
  }
  if (wordCount(narration) <= 4 && abstractBeat) {
    return previous ? "mergeWithPrevious" : "requiresInference";
  }
  if (abstractBeat && previous) {
    return "requiresInference";
  }
  if (abstractBeat) {
    return "requiresInference";
  }
  if (
    isGenericText(scene.setting) ||
    isGenericText(scene.subject) ||
    isGenericText(scene.action)
  ) {
    return "requiresInference";
  }
  return "direct";
}

interface CharacterResolutionResult {
  readonly usages: SceneCharacterUsage[];
  readonly unresolvedMentions: string[];
}

function wordBoundaryPattern(label: string): RegExp {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^\\p{L}\\p{N}]|$)`,
    "iu"
  );
}

function characterLabels(character: CharacterDefinition): string[] {
  return [
    character.name,
    character.role,
    ...(character.aliases ?? []),
    ...(character.collectiveLabels ?? []),
  ]
    .map((label) => normalizePlanText(label).toLowerCase())
    .filter((label) => label.length >= 3);
}

function likelyNameTokens(character: CharacterDefinition): string[] {
  return [
    ...tokens(character.name),
    ...tokens(character.role),
    ...(character.aliases ?? []).flatMap((alias) => tokens(alias)),
  ].filter((token) => token.length >= 4);
}

function hasCharacterLabelMatch(haystack: string, character: CharacterDefinition): boolean {
  for (const label of characterLabels(character)) {
    if (wordBoundaryPattern(label).test(haystack)) {
      return true;
    }
  }
  for (const token of likelyNameTokens(character)) {
    if (wordBoundaryPattern(token).test(haystack)) {
      return true;
    }
  }
  return false;
}

const recurringCollectiveTerms = [
  "children",
  "kids",
  "boys",
  "girls",
  "siblings",
  "couple",
  "parents",
];

function unresolvedRecurringMentions(
  haystack: string,
  registry: CharacterRegistry,
  matchedCharacterIds: ReadonlySet<string>
): string[] {
  const unresolved = new Set<string>();
  for (const term of recurringCollectiveTerms) {
    if (!wordBoundaryPattern(term).test(haystack)) {
      continue;
    }
    const matched = registry.characters.some(
      (character) =>
        matchedCharacterIds.has(character.id) &&
        (character.collectiveLabels ?? []).some(
          (label) => normalizePlanText(label).toLowerCase() === term
        )
    );
    if (!matched) {
      unresolved.add(term);
    }
  }
  return [...unresolved];
}

function resolveCharactersForScene(
  scene: Scene,
  registry: CharacterRegistry
): CharacterResolutionResult {
  const haystack = normalizePlanText(
    `${scene.canonicalNarration} ${scene.subject} ${scene.action} ${scene.setting}`
  ).toLowerCase();
  const usages: SceneCharacterUsage[] = [];
  for (const character of registry.characters) {
    if (hasCharacterLabelMatch(haystack, character)) {
      usages.push({
        characterId: character.id,
        expression: haystack.includes("reaction") ? "tense" : undefined,
        visibleFeatures: character.continuityTraits.slice(0, 3),
      } as SceneCharacterUsage);
    }
  }
  const matchedCharacterIds = new Set(usages.map((usage) => usage.characterId));
  return {
    usages,
    unresolvedMentions: unresolvedRecurringMentions(
      haystack,
      registry,
      matchedCharacterIds
    ),
  };
}

function buildContinuityElements(
  scene: Scene,
  previous?: SceneVisualSpec
): string[] {
  const elements = new Set<string>();
  for (const entry of scene.continuityReferences) {
    const cleaned = normalizeSentence(entry);
    if (cleaned.length > 0) elements.add(cleaned);
  }
  if (previous) {
    elements.add(
      `continue the episode's visual continuity from ${previous.sceneId}`
    );
  }
  return [...elements];
}

function buildPrimaryVisualEvent(spec: SceneVisualSpec): string {
  const candidates = [spec.visibleAction, spec.focalSubject]
    .map((value) => normalizeSentence(value))
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
  if (candidates.length === 0) {
    return "Show a concrete visible change.";
  }
  if (candidates.length === 1) {
    return candidates[0]!;
  }
  const primary = candidates[0];
  const secondary = candidates[1];
  if (!primary || !secondary) {
    return candidates[0] ?? "Show a concrete visible change.";
  }
  if (
    primary.includes(secondary) ||
    secondary.includes(primary) ||
    overlapRatio(primary, secondary) > 0.45
  ) {
    return primary;
  }
  return `${primary} ${secondary}`;
}

function buildProhibitedElements(scene: Scene): string[] {
  const base = [
    "No malformed anatomy, duplicate figures, or unreadable UI",
  ];
  return [
    ...base,
    ...scene.negativeConstraints
      .map((value) => normalizeSentence(value))
      .filter(Boolean),
  ];
}

export function buildSceneVisualSpec(
  scene: Scene,
  registry: CharacterRegistry,
  previous?: SceneVisualSpec
): SceneVisualSpec {
  const narrationBeat = normalizedNarrationBeat(scene);
  const textRequirement = scene.textRequirement ?? { required: false };
  const characterResolution = resolveCharactersForScene(scene, registry);
  const characters = characterResolution.usages;
  const focalSubject = deriveFocalSubject(scene, characters, registry);
  const visibleAction = deriveVisibleAction(scene, focalSubject);
  const environment = deriveEnvironment(scene, previous);
  return {
    sceneId: scene.id,
    sequenceNumber: scene.sequenceNumber,
    narrativePurpose: deriveNarrativePurpose(scene),
    focalSubject,
    visibleAction,
    environment,
    foreground: deriveForeground(scene, focalSubject, previous),
    background: deriveBackground(scene, focalSubject, previous),
    shotSize: deriveShotSize(scene),
    cameraAngle: deriveCameraAngle(scene),
    ...(scene.sequenceNumber % 3 === 0
      ? { cameraMovementImpression: "subtle handheld documentary drift" }
      : {}),
    sourceNarration: narrationBeat.sourceNarration,
    textRequirement,
    composition: isGenericText(scene.composition)
      ? "strong cinematic composition with a clear visual hierarchy and negative space"
      : normalizeSentence(scene.composition),
    lighting: deriveLighting(scene),
    timeOfDay: deriveTimeOfDay(scene),
    mood: deriveMood(scene),
    distinctiveAnchor: extractAnchor(
      scene.canonicalNarration,
      `${scene.id} anchor`
    ),
    continuityElements: buildContinuityElements(scene, previous),
    characters,
    ...(characterResolution.unresolvedMentions.length > 0
      ? {
          unresolvedRecurringCharacterMentions:
            characterResolution.unresolvedMentions,
        }
      : {}),
    prohibitedElements: buildProhibitedElements(scene),
  } as SceneVisualSpec;
}

export function diffSpec(
  previous: SceneVisualSpec | undefined,
  current: SceneVisualSpec
): string[] {
  if (!previous) {
    return ["opening scene establishes the episode's visual baseline"];
  }
  const diffs: string[] = [];
  if (previous.narrativePurpose !== current.narrativePurpose) {
    diffs.push(
      `narrative purpose changes from ${previous.narrativePurpose} to ${current.narrativePurpose}`
    );
  }
  if (previous.focalSubject !== current.focalSubject) {
    diffs.push(
      `focal subject changes from ${previous.focalSubject} to ${current.focalSubject}`
    );
  }
  if (previous.visibleAction !== current.visibleAction) {
    diffs.push(
      `visible action changes from ${previous.visibleAction} to ${current.visibleAction}`
    );
  }
  if (previous.composition !== current.composition) {
    diffs.push("composition changes to a different visual arrangement");
  }
  if (previous.environment !== current.environment) {
    diffs.push(
      `environment changes from ${previous.environment} to ${current.environment}`
    );
  }
  if (previous.foreground !== current.foreground) {
    diffs.push("foreground emphasis changes");
  }
  if (previous.distinctiveAnchor !== current.distinctiveAnchor) {
    diffs.push("distinctive anchor changes");
  }
  return diffs;
}

interface SceneSemanticComparison {
  score: number;
  materialChangeCount: number;
}

function isNearIdenticalSceneComparison(
  comparison: SceneSemanticComparison
): boolean {
  return comparison.score >= 0.8 && comparison.materialChangeCount <= 1;
}

function compareSceneSemantics(
  previous: SceneVisualSpec | undefined,
  current: SceneVisualSpec
): SceneSemanticComparison {
  if (!previous) {
    return { score: 0, materialChangeCount: 1 };
  }
  const weightedChecks = [
    {
      weight: 5,
      matches:
        overlapRatio(previous.focalSubject, current.focalSubject) > 0.75,
      material: previous.focalSubject !== current.focalSubject,
    },
    {
      weight: 5,
      matches:
        overlapRatio(previous.visibleAction, current.visibleAction) > 0.7,
      material: previous.visibleAction !== current.visibleAction,
    },
    {
      weight: 4,
      matches: overlapRatio(previous.environment, current.environment) > 0.7,
      material: previous.environment !== current.environment,
    },
    {
      weight: 4,
      matches:
        overlapRatio(previous.distinctiveAnchor, current.distinctiveAnchor) > 0.65,
      material: previous.distinctiveAnchor !== current.distinctiveAnchor,
    },
    {
      weight: 3,
      matches: previous.narrativePurpose === current.narrativePurpose,
      material: previous.narrativePurpose !== current.narrativePurpose,
    },
    {
      weight: 3,
      matches:
        previous.characters.map((character) => character.characterId).join(" ") ===
        current.characters.map((character) => character.characterId).join(" "),
      material:
        previous.characters.map((character) => character.characterId).join(" ") !==
        current.characters.map((character) => character.characterId).join(" "),
    },
    {
      weight: 1,
      matches: previous.shotSize === current.shotSize,
      material: false,
    },
    {
      weight: 1,
      matches: previous.cameraAngle === current.cameraAngle,
      material: false,
    },
    {
      weight: 1,
      matches: previous.lighting === current.lighting,
      material: false,
    },
    {
      weight: 1,
      matches: previous.timeOfDay === current.timeOfDay,
      material: false,
    },
  ];
  const totalWeight = weightedChecks.reduce(
    (sum, check) => sum + check.weight,
    0
  );
  const matchedWeight = weightedChecks.reduce(
    (sum, check) => sum + (check.matches ? check.weight : 0),
    0
  );
  const materialChangeCount = weightedChecks.filter(
    (check) => check.material
  ).length;
  return {
    score: matchedWeight / totalWeight,
    materialChangeCount,
  };
}

function hasUsefulSemanticAnchor(
  current: SceneVisualSpec,
  previous: SceneVisualSpec
): boolean {
  const anchor = normalizeSentence(current.distinctiveAnchor);
  return (
    anchor.length > 0 &&
    !isGenericText(anchor) &&
    wordCount(anchor) >= 3 &&
    overlapRatio(anchor, previous.distinctiveAnchor) < 0.65
  );
}

export function repairForSemanticDifference(
  current: SceneVisualSpec,
  previous: SceneVisualSpec
): SceneVisualSpec {
  if (!hasUsefulSemanticAnchor(current, previous)) {
    return current;
  }
  const rewritten = { ...current };
  const anchor = normalizeSentence(current.distinctiveAnchor);
  if (
    rewritten.visibleAction === previous.visibleAction ||
    overlapRatio(rewritten.visibleAction, previous.visibleAction) > 0.7
  ) {
    rewritten.visibleAction = `reveals ${anchor}`;
  }
  if (
    rewritten.focalSubject === previous.focalSubject ||
    overlapRatio(rewritten.focalSubject, previous.focalSubject) > 0.75
  ) {
    rewritten.focalSubject = anchor;
  }
  if (
    rewritten.foreground === previous.foreground ||
    overlapRatio(rewritten.foreground, previous.foreground) > 0.75
  ) {
    rewritten.foreground = `visible evidence of ${anchor}`;
  }
  return rewritten;
}

function fieldIsEmptyLocation(value: string): boolean {
  const normalized = normalizePlanText(value).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === unresolvedEnvironment ||
    normalized === "none" ||
    normalized === "n/a" ||
    normalized === "unknown" ||
    normalized === "unspecified"
  );
}

function hasContradictoryRequiredFeature(current: SceneVisualSpec): boolean {
  const requiredText = requiresSceneText(current.textRequirement)
    ? current.textRequirement.text.toLowerCase()
    : "";
  const requiredFeatureText = [
    current.focalSubject,
    current.visibleAction,
    current.distinctiveAnchor,
    requiredText,
  ]
    .join(" ")
    .toLowerCase();
  const exclusions = current.prohibitedElements.join(" ").toLowerCase();
  if (requiresSceneText(current.textRequirement) && /no readable text|no text|no labels|no signs|no lettering/iu.test(exclusions)) {
    return true;
  }
  if (/\bchildren?\b/iu.test(requiredFeatureText) && /\bno children\b|\bno kids\b/iu.test(exclusions)) {
    return true;
  }
  if (/\bdoor\b|\bdoorway\b|\bthreshold\b/iu.test(requiredFeatureText) && /\bno doors?\b|\bno doorway\b/iu.test(exclusions)) {
    return true;
  }
  if (/\bphone\b/iu.test(requiredFeatureText) && /\bno phones?\b/iu.test(exclusions)) {
    return true;
  }
  if (/\bmonitor\b|\bscreen\b/iu.test(requiredFeatureText) && /\bno screens?\b|\bno monitors?\b/iu.test(exclusions)) {
    return true;
  }
  return false;
}

function hasPreviousSceneTextLeakage(
  current: SceneVisualSpec,
  previous?: SceneVisualSpec
): boolean {
  if (!previous) {
    return false;
  }
  const currentText = normalizePlanText(
    [
      current.focalSubject,
      current.visibleAction,
      current.environment,
      current.foreground,
      current.background,
      current.distinctiveAnchor,
      current.composition,
    ].join(" ")
  );
  const previousNarration = normalizePlanText(previous.sourceNarration);
  return (
    previousNarration.length >= 24 &&
    current.sourceNarration !== previous.sourceNarration &&
    currentText.toLowerCase().includes(previousNarration.toLowerCase())
  );
}

function verboseVisualFields(current: SceneVisualSpec): string[] {
  const fields: Array<[string, string]> = [
    ["focalSubject", current.focalSubject],
    ["visibleAction", current.visibleAction],
    ["environment", current.environment],
    ["foreground", current.foreground],
    ["background", current.background],
    ["composition", current.composition],
    ["distinctiveAnchor", current.distinctiveAnchor],
  ];
  return fields
    .filter(([, value]) => wordCount(value) > 36 || value.length > 260)
    .map(([field]) => field);
}

function expectsRecurringCharacterContinuity(current: SceneVisualSpec): boolean {
  const continuityText = normalizePlanText(
    current.continuityElements.join(" ")
  ).toLowerCase();
  if (continuityText.length === 0) {
    return false;
  }
  return (
    /\b(same|keep|preserve|consistent|continuity)\b/iu.test(
      continuityText
    ) &&
    /\b(character|person|man|woman|child|children|face|facial|hair|hairline|eyes?|skin|build|wardrobe|clothes|clothing|jacket|backpack|accessor(?:y|ies))\b/iu.test(
      continuityText
    )
  );
}

export function validateSceneVisualSpec(
  current: SceneVisualSpec,
  _previousPrompt?: string,
  previous?: SceneVisualSpec
): SceneVisualPlanIssue[] {
  const issues: SceneVisualPlanIssue[] = [];
  const push = (code: SceneVisualPlanIssueCode, message: string): void => {
    issues.push({ code, message });
  };
  if (
    isGenericText(current.focalSubject) ||
    current.focalSubject === unresolvedFocalSubject
  ) {
    push("MISSING_FOCAL_SUBJECT", "prompt does not identify a concrete visible subject");
  }
  if (
    isGenericText(current.visibleAction) ||
    current.visibleAction === unresolvedVisibleAction ||
    current.visibleAction.toLowerCase().includes("shown") ||
    isLikelyAbstractVisualAction(current.visibleAction)
  ) {
    push("ABSTRACT_VISIBLE_ACTION", "visible action is too generic or abstract");
  }
  if (
    isGenericText(current.environment) ||
    current.environment === unresolvedEnvironment ||
    hasPlaceholderLanguage(current.environment)
  ) {
    push("PLACEHOLDER_ENVIRONMENT", "environment is too generic or placeholder-driven");
  }
  if (fieldIsEmptyLocation(current.environment)) {
    push("EMPTY_LOCATION", "scene does not establish a usable location");
  }
  if (hasPlaceholderLanguage(current.foreground) || hasPlaceholderLanguage(current.background)) {
    push("PLACEHOLDER_ENVIRONMENT", "foreground or background contains placeholder phrasing");
  }
  if (hasContradictoryRequiredFeature(current)) {
    push(
      "CONTRADICTORY_REQUIRED_FEATURE",
      "required visual or text feature is contradicted by the exclusions"
    );
  }
  if (hasPreviousSceneTextLeakage(current, previous)) {
    push(
      "PREVIOUS_SCENE_TEXT_LEAKAGE",
      "current visual plan contains previous-scene narration text"
    );
  }
  const verboseFields = verboseVisualFields(current);
  if (verboseFields.length > 0) {
    push(
      "VISUAL_FIELD_TOO_VERBOSE",
      `visual plan fields are too verbose: ${verboseFields.join(", ")}`
    );
  }
  if (isGenericText(current.distinctiveAnchor)) {
    push("TRUNCATED_SENTENCE", "distinctive anchor is missing");
  }
  if (
    /([.!?])\1+/u.test(current.sourceNarration) ||
    /([.!?])\1+/u.test(current.visibleAction)
  ) {
    push("DOUBLE_PUNCTUATION", "text contains repeated punctuation");
  }
  if (
    looksTruncated(current.focalSubject) ||
    looksTruncated(current.visibleAction) ||
    looksTruncated(current.environment)
  ) {
    push("TRUNCATED_SENTENCE", "one or more visual plan fields end in an unfinished clause");
  }
  if (hasRepeatedNarrationSentence(current.sourceNarration)) {
    push("DUPLICATED_NARRATION", "narration beat repeats the same sentence fragment");
  }
  const comparison = compareSceneSemantics(previous, current);
  if (
    previous &&
    isNearIdenticalSceneComparison(comparison)
  ) {
    push(
      "NON_MATERIAL_SCENE_DIFFERENCE",
      "scene differs from the previous scene mostly by framing or lighting instead of visual semantics"
    );
  }
  for (const character of current.characters) {
    if (character.characterId.trim().length === 0) {
      push("UNKNOWN_CHARACTER_ID", "scene includes an empty character id");
    }
  }
  if (
    current.characters.length === 0 &&
    expectsRecurringCharacterContinuity(current)
  ) {
    push(
      "MISSING_RECURRING_CHARACTER",
      "continuity requirements mention a recurring character but no character was resolved"
    );
  }
  for (const mention of current.unresolvedRecurringCharacterMentions ?? []) {
    push(
      "UNRESOLVED_RECURRING_CHARACTER",
      `recurring character mention could not be resolved: ${mention}`
    );
  }
  return issues;
}

function buildCharacterIdentitySection(
  character: CharacterDefinition,
  usage?: SceneCharacterUsage
): string {
  const mutableTraits = [
    usage?.pose ? `pose: ${usage.pose}` : undefined,
    usage?.expression ? `expression: ${usage.expression}` : undefined,
    usage?.position ? `position: ${usage.position}` : undefined,
    usage?.visibleFeatures?.length
      ? `visible features: ${usage.visibleFeatures.join(", ")}`
      : undefined,
  ].filter(Boolean);
  return [
    `Use the approved identity reference image for character \`${character.id}\` as the identity source.`,
    `Preserve the same facial geometry, apparent age, skin tone, eye color, hairline, hair color, build, and distinguishing facial features for ${character.name}.`,
    `Do not redesign, beautify, age, de-age, or replace ${character.name}.`,
    `Immutable traits: ${character.continuityTraits.join(", ")}.`,
    mutableTraits.length > 0
      ? `Scene-specific traits: ${mutableTraits.join("; ")}.`
      : undefined,
    `Wardrobe continuity: ${character.defaultWardrobe.upperBody}; ${character.defaultWardrobe.lowerBody}; ${character.defaultWardrobe.footwear}${character.defaultWardrobe.outerwear ? `; ${character.defaultWardrobe.outerwear}` : ""}. Accessories and carried objects: ${[...character.defaultWardrobe.accessories, ...character.defaultWardrobe.carriedObjects].join(", ") || "none"}. Color continuity: ${character.defaultWardrobe.colors.join(", ") || "unspecified"}.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
}

function renderImageProviderPrompt(request: ImageProviderRequest): string {
  const referenceText =
    request.characterContexts.length === 0
      ? "Use unnamed incidental figures only when the frame requires them."
      : request.characterContexts
          .map((context) => {
            if (!context.definition) {
              return `Use the approved reference image for character \`${context.characterId}\` and preserve identity continuity.`;
            }
            return buildCharacterIdentitySection(
              context.definition,
              context.usage
            );
          })
          .join(" ");

  return [
    promptSection(
      "IMAGE TYPE AND STYLE",
      `Photorealistic cinematic horror documentary still, grounded realism, believable human anatomy, ${request.aspectRatio}, no illustration, no collage, no stylized cartoon look.`
    ),
    promptSection(
      "PRIMARY VISUAL EVENT",
      `${buildPrimaryVisualEvent(request.scene)}${request.scene.characters.length === 0 ? " Focus on visible evidence, reaction, or environmental consequence." : ""}`
    ),
    promptSection(
      "TEXT REQUIREMENT",
      buildSceneTextPromptSection(request.scene.textRequirement)
    ),
    promptSection("CHARACTER IDENTITY AND CONTINUITY", referenceText),
    promptSection(
      "ENVIRONMENT",
      `${request.scene.environment}. Foreground: ${request.scene.foreground}. Background: ${request.scene.background}.`
    ),
    promptSection(
      "CAMERA AND COMPOSITION",
      `${request.scene.shotSize} shot, ${request.scene.cameraAngle} angle${request.scene.cameraMovementImpression ? `, ${request.scene.cameraMovementImpression}` : ""}. ${request.scene.composition}.`
    ),
    promptSection(
      "LIGHTING AND COLOR",
      `${request.scene.lighting}. Time of day: ${request.scene.timeOfDay}. Mood: ${request.scene.mood}.`
    ),
    promptSection("DISTINCTIVE SCENE ANCHOR", request.scene.distinctiveAnchor),
    promptSection(
      "CONTINUITY REQUIREMENTS",
      request.scene.continuityElements.length > 0
        ? request.scene.continuityElements.join(" ")
        : "Maintain episode-level continuity for wardrobe, setting logic, and character identity where applicable."
    ),
    promptSection(
      "EXCLUSIONS",
      buildSceneNegativePrompt(
        request.scene.textRequirement,
        request.scene.prohibitedElements
      )
    ),
  ].join("\n\n");
}

function buildImageProviderRequest(args: {
  readonly scene: SceneVisualSpec;
  readonly previousScene?: SceneVisualSpec;
  readonly registry?: CharacterRegistry;
  readonly settings: EpisodeImagePipelineSettings;
  readonly outputPath: string;
  readonly referenceImages: readonly {
    characterId: CharacterId;
    path: string;
    sha256: string;
  }[];
  readonly aspectRatio?: "16:9" | "9:16";
}): ImageProviderRequest {
  const characterLookup = new Map(
    (args.registry?.characters ?? []).map(
      (character) => [character.id, character] as const
    )
  );
  return {
    sceneId: args.scene.sceneId,
    scene: args.scene,
    ...(args.previousScene ? { previousScene: args.previousScene } : {}),
    model: args.settings.model,
    size: args.settings.resolvedSize,
    quality: args.settings.quality,
    outputFormat: "png",
    background: "opaque",
    outputPath: args.outputPath,
    operation:
      args.referenceImages.length > 0 ? "image-edit" : "image-generation",
    aspectRatio: args.aspectRatio ?? "16:9",
    promptVersion: 1,
    referenceImages: args.referenceImages.map((reference) => ({
      characterId: reference.characterId,
      path: reference.path,
      sha256: reference.sha256,
    })),
    characterContexts: args.scene.characters.map((usage) => {
      const definition = characterLookup.get(usage.characterId);
      return {
        characterId: usage.characterId,
        usage,
        ...(definition ? { definition } : {}),
      };
    }),
  };
}

function prepareImageProviderRequest(
  request: ImageProviderRequest
): PreparedImageProviderRequest {
  const prompt = renderImageProviderPrompt(request);
  const promptHash = hashText(prompt);
  const providerRequestHash = hashText(
    JSON.stringify({
      operation: request.operation,
      model: request.model,
      size: request.size,
      quality: request.quality,
      outputFormat: request.outputFormat,
      background: request.background,
      promptVersion: request.promptVersion,
      prompt,
      referenceImages: request.referenceImages.map((reference) => ({
        characterId: reference.characterId,
        sha256: reference.sha256,
      })),
    })
  );
  return {
    ...request,
    prompt,
    promptHash,
    providerRequestHash,
  };
}

export function buildPromptFromSpec(
  spec: SceneVisualSpec,
  previous?: SceneVisualSpec,
  registry?: CharacterRegistry,
  aspectRatio: "16:9" | "9:16" = "16:9"
): string {
  return prepareImageProviderRequest(
    buildImageProviderRequest({
      scene: spec,
      ...(previous ? { previousScene: previous } : {}),
      ...(registry ? { registry } : {}),
      settings: {
        apiKey: "",
        model: "gpt-image-2",
        size: "1536x1024",
        resolvedSize: "1536x1024",
        quality: "medium",
        concurrency: 1,
        maxRetries: 0,
        timeoutMs: 1000,
        allowUnapprovedCharacterReferences: true,
        force: false,
      },
      outputPath: "scene-output.png",
      referenceImages: [],
      aspectRatio,
    })
  ).prompt;
}

export function validatePrompt(
  prompt: string,
  current: SceneVisualSpec,
  previousPrompt?: string,
  previous?: SceneVisualSpec
): string[] {
  const issues = validateSceneVisualSpec(current, previousPrompt, previous);
  const push = (code: SceneVisualPlanIssueCode, message: string): void => {
    issues.push({ code, message });
  };
  if (/rough ink collage/i.test(prompt) && /photorealistic/i.test(prompt)) {
    push("CONTRADICTORY_CONSTRAINTS", "prompt contains contradictory style directions");
  }
  const hasBlanketNoText = /do not include captions, subtitles, labels, logos, watermarks, or readable text/i.test(
    prompt
  );
  const hasExactRequiredText = requiresSceneText(current.textRequirement)
    ? prompt.includes(current.textRequirement.text)
    : false;
  if (requiresSceneText(current.textRequirement)) {
    if (!hasExactRequiredText) {
      push(
        "REQUIRED_TEXT_MISSING",
        `required_text_missing: prompt must render exactly ${JSON.stringify(current.textRequirement.text)}`
      );
    }
    if (hasBlanketNoText) {
      push(
        "BLANKET_NO_TEXT_INSTRUCTION",
        "blanket_no_text_instruction: prompt cannot ban readable text when the scene requires it"
      );
    }
  } else {
    if (!hasBlanketNoText && !/no readable text|no captions|no subtitles|no labels/i.test(prompt)) {
      push(
        "BLANKET_NO_TEXT_INSTRUCTION_MISSING",
        "blanket_no_text_instruction_missing: prompt should discourage readable text for ordinary scenes"
      );
    }
  }
  if (wordCount(prompt) > 450) {
    push("PROMPT_TOO_VERBOSE", "prompt is too verbose for the amount of useful visual information");
  }
  if (
    /whisper|sound|audio/i.test(prompt) &&
    !/waveform|reaction|device|recording|looks|turns|reacts/i.test(prompt)
  ) {
    push("NON_VISUAL_AUDIO_REFERENCE", "prompt mentions non-visual sound without visible evidence");
  }
  return issues.map((issue) => issue.message);
}

function parseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as {
    code?: unknown;
    error?: { code?: unknown };
    type?: unknown;
  };
  if (typeof value.code === "string") return value.code;
  if (typeof value.error?.code === "string") return value.error.code;
  if (typeof value.type === "string") return value.type;
  return undefined;
}

export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const value = error as {
    status?: unknown;
    code?: unknown;
    error?: { code?: unknown };
  };
  const code = parseErrorCode(error);
  if (
    code &&
    [
      "invalid_api_key",
      "model_not_found",
      "insufficient_quota",
      "billing_hard_limit_reached",
      "content_policy_violation",
      "invalid_request_error",
    ].includes(code)
  ) {
    return false;
  }
  const status = value.status;
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  return true;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function atomicWriteImage(
  filePath: string,
  b64: string
): Promise<string> {
  const buffer = Buffer.from(b64.replace(/\s+/gu, ""), "base64");
  if (buffer.byteLength === 0) {
    throw new Error("OpenAI image output was empty.");
  }
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const temp = path.join(
    dir,
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await fsPromises.writeFile(temp, buffer);
  await fsPromises.rename(temp, filePath);
  return hashBuffer(buffer);
}

async function validateImageFile(filePath: string): Promise<void> {
  const metadata = await sharp(filePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Generated image is invalid: ${filePath}`);
  }
}

async function loadRegistry(
  episodeDir: string,
  episodeId: string
): Promise<CharacterRegistry> {
  const existing = await readJsonIfExists(
    resolveEpisodeCharacterRegistryPath(episodeDir),
    (value) => registrySchema.parse(value) as unknown as CharacterRegistry
  );
  if (existing) return existing;
  const legacyExisting = await readJsonIfExists(
    path.join(episodeDir, "characters.json"),
    (value) => registrySchema.parse(value) as unknown as CharacterRegistry
  );
  if (legacyExisting) return legacyExisting;
  return {
    episodeId,
    characters: [],
    updatedAt: new Date().toISOString(),
  };
}

async function saveRegistry(
  episodeDir: string,
  registry: CharacterRegistry
): Promise<void> {
  await writeJsonAtomic(resolveEpisodeCharacterRegistryPath(episodeDir), registry);
}

export function loadEpisodeImageGenerationSettings(
  env: Record<string, string | undefined> = process.env
): EpisodeImagePipelineSettings {
  const parsed = envSchema.parse(env);
  const resolvedSize = resolveCompatibleSize(
    parsed.OPENAI_IMAGE_SIZE,
    parsed.OPENAI_IMAGE_MODEL
  );
  return {
    apiKey: parsed.OPENAI_API_KEY,
    baseUrl: parsed.OPENAI_BASE_URL,
    organization: parsed.OPENAI_ORGANIZATION,
    project: parsed.OPENAI_PROJECT,
    model: parsed.OPENAI_IMAGE_MODEL,
    size: parsed.OPENAI_IMAGE_SIZE,
    resolvedSize,
    quality: parsed.OPENAI_IMAGE_QUALITY,
    concurrency: parsed.OPENAI_IMAGE_CONCURRENCY,
    maxRetries: parsed.OPENAI_IMAGE_MAX_RETRIES,
    timeoutMs: parsed.OPENAI_IMAGE_TIMEOUT_MS,
    allowUnapprovedCharacterReferences:
      (
        parsed.OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES ?? ""
      ).toLowerCase() === "true",
    force: (parsed.OPENAI_IMAGE_FORCE ?? "").toLowerCase() === "true",
  } as EpisodeImagePipelineSettings;
}

export class OpenAIImageGenerator implements ImageGenerator {
  private readonly client: OpenAI;

  public constructor(
    private readonly settings: EpisodeImagePipelineSettings,
    client?: OpenAI
  ) {
    this.client =
      client ??
      new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseUrl,
        organization: settings.organization,
        project: settings.project,
      });
  }

  public async generate(
    request: ImageGenerationRequest
  ): Promise<GeneratedImageResult> {
    const start = Date.now();
    const promptHash = request.providerRequest.promptHash;
    const providerRequestHash = request.providerRequest.providerRequestHash;
    const telemetry = currentExecutionTelemetry();
    const generationMode = generationModeSchema.parse(
      request.referenceImages.length > 0 ? "reference-assisted" : "text-only"
    );
    const operation =
      generationMode === "reference-assisted"
        ? "image-edit"
        : "image-generation";
    const requestBodyBase = {
      model: this.settings.model,
      prompt: request.providerRequest.prompt,
      size: this.settings.resolvedSize,
      quality: this.settings.quality,
      output_format: "png" as const,
      background: "opaque" as const,
      stream: false as const,
    };
    let lastError: unknown;
    let attempts = 0;
    for (let attempt = 0; attempt <= this.settings.maxRetries; attempt += 1) {
      attempts = attempt + 1;
      const attemptStartedAt = new Date().toISOString();
      const attemptStartedMs = Date.now();
      try {
        const apiPromise =
          request.referenceImages.length === 0
            ? this.client.images.generate(requestBodyBase)
            : this.client.images.edit({
                ...requestBodyBase,
                image: await Promise.all(
                  request.referenceImages.map(async (reference) =>
                    toFile(
                      await fsPromises.readFile(reference.filePath),
                      path.basename(reference.filePath),
                      { type: reference.mimeType }
                    )
                  )
                ),
              });
        const { data, request_id } = await apiPromise.withResponse();
        const b64 = data.data?.[0]?.b64_json;
        if (!b64) {
          throw new Error(
            "OpenAI image response did not contain base64 image data."
          );
        }
        const outputSha256 = await atomicWriteImage(
          request.providerRequest.outputPath,
          b64
        );
        const referenceHashes = await Promise.all(
          request.referenceImages.map(async (reference) => ({
            characterId: reference.characterId,
            sha256: await hashFile(reference.filePath),
          }))
        );
        await validateImageFile(request.providerRequest.outputPath);
        const cost = telemetry
          ? estimateImageGenerationCost(telemetry.catalog, {
              provider: "openai",
              model: this.settings.model,
              operation: generationMode === "reference-assisted" ? "edit" : "generate",
              size: this.settings.resolvedSize,
              quality: this.settings.quality,
            })
          : { pricingVersion: "unconfigured", costMicros: null, warning: undefined };
        telemetry?.recordApiCall({
          provider: "openai",
          model: this.settings.model,
          operation,
          startedAt: attemptStartedAt,
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - attemptStartedMs,
          attempt: attempt + 1,
          success: true,
          ...(request_id ? { requestId: request_id } : {}),
          usage: { imageCount: 1 },
          details: {
            generationMode,
            size: this.settings.resolvedSize,
            quality: this.settings.quality,
          },
        });
        telemetry?.recordCost({
          provider: "openai",
          model: this.settings.model,
          operation,
          costMicros: cost.costMicros,
          warning: cost.warning,
        });
        telemetry?.recordImage({
          sceneId: request.providerRequest.scene.sceneId,
          outputPath: request.providerRequest.outputPath,
          model: this.settings.model,
          generationMode,
          attempts,
          ...(request_id ? { requestId: request_id } : {}),
          promptHash,
          outputSha256,
          costMicros: cost.costMicros,
        });
        return {
          outputPath: request.providerRequest.outputPath,
          outputSha256,
          model: this.settings.model,
          size: this.settings.resolvedSize,
          quality: this.settings.quality,
          generationMode,
          attempts,
          durationMs: Date.now() - start,
          ...(request_id ? { requestId: request_id } : {}),
          providerRequestHash,
          promptHash,
          referenceHashes,
        } as GeneratedImageResult;
      } catch (error) {
        telemetry?.recordApiCall({
          provider: "openai",
          model: this.settings.model,
          operation,
          startedAt: attemptStartedAt,
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - attemptStartedMs,
          attempt: attempt + 1,
          success: false,
          retryable: isRetryableError(error),
          details: {
            generationMode,
            size: this.settings.resolvedSize,
            quality: this.settings.quality,
          },
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        lastError = error;
        if (!isRetryableError(error) || attempt >= this.settings.maxRetries) {
          break;
        }
        const delayMs = Math.min(
          5000,
          500 * 2 ** attempt + Math.floor(Math.random() * 250)
        );
        await delay(delayMs);
      }
    }
    throw new Error(
      `OpenAI image generation failed: ${formatError(lastError)}`
    );
  }
}

async function ensureReferenceImage(
  episodeDir: string,
  registry: CharacterRegistry,
  character: CharacterDefinition,
  settings: EpisodeImagePipelineSettings,
  client?: OpenAI
): Promise<{ path: string; sha256: string }> {
  const filePath =
    character.referenceImagePath ??
    resolveEpisodeCharacterReferencePath(episodeDir, character.id);
  await ensureDir(path.dirname(filePath));
  if (
    character.referenceStatus === "approved" &&
    (await fileExists(filePath)) &&
    !settings.force
  ) {
    return { path: filePath, sha256: await hashFile(filePath) };
  }
  const generator = new OpenAIImageGenerator(settings, client);
  const prompt = [
    "IMAGE TYPE AND STYLE:",
    "Photorealistic neutral character reference image, adult only, plain background, documentary realism, 16:9, no horror distortion, no text, no labels, no watermark.",
    "",
    "PRIMARY VISUAL EVENT:",
    `One adult character only: ${character.name}. Neutral expression, unobstructed face, front-facing portrait with a three-quarter view if feasible, full wardrobe visible where feasible.`,
    "",
    "CHARACTER IDENTITY AND CONTINUITY:",
    `Identity source for character \`${character.id}\`. Preserve facial structure, hairline, hair color, skin tone, eye color, build, and distinguishing features. ${character.physicalDescription}.`,
    "",
    "ENVIRONMENT:",
    "Plain neutral background with consistent natural lighting.",
    "",
    "CAMERA AND COMPOSITION:",
    "Clean reference-sheet composition, centered, unobstructed face, no dramatic pose.",
    "",
    "LIGHTING AND COLOR:",
    "Soft natural light, no extreme shadows.",
    "",
    "DISTINCTIVE SCENE ANCHOR:",
    `Neutral identity reference for ${character.name}.`,
    "",
    "CONTINUITY REQUIREMENTS:",
    "Neutral identity sheet only. Freeze this appearance for the episode.",
    "",
    "EXPLICIT DIFFERENCES FROM PREVIOUS SCENE:",
    "This is a character reference sheet, not a story scene.",
    "",
    "EXCLUSIONS:",
    "No extra people, no blood, no masks, no hands covering the face, no text, no labels, no watermark, no horror distortion.",
  ].join("\n");
  const result = await generator.generate({
    providerRequest: {
      sceneId: `${character.id}-reference`,
      scene: {
        sceneId: `${character.id}-reference`,
        sequenceNumber: 0,
        narrativePurpose: "establish",
        focalSubject: character.name,
        visibleAction: "holds a neutral identity pose for reference",
        environment: "plain neutral background",
        foreground: "none",
        background: "plain neutral backdrop",
        shotSize: "medium-close-up",
        cameraAngle: "eye-level",
        sourceNarration: "Neutral identity reference for character approval.",
        textRequirement: { required: false },
        composition: "reference-sheet layout",
        lighting: "soft natural light",
        timeOfDay: "daylight",
        mood: "neutral",
        distinctiveAnchor: `Neutral identity reference for ${character.name}`,
        continuityElements: character.continuityTraits,
        characters: [
          {
            characterId: character.id,
            expression: "neutral",
            position: "centered",
          },
        ],
        prohibitedElements: [
          "No extra people, no blood, no masks, no hands covering the face",
        ],
      },
      model: settings.model,
      size: settings.resolvedSize,
      quality: settings.quality,
      outputFormat: "png",
      background: "opaque",
      outputPath: filePath,
      operation: "image-generation",
      aspectRatio: "16:9",
      promptVersion: 1,
      referenceImages: [],
      characterContexts: [
        {
          characterId: character.id,
          definition: character,
          usage: {
            characterId: character.id,
            expression: "neutral",
            position: "centered",
          },
        },
      ],
      prompt,
      promptHash: hashText(prompt),
      providerRequestHash: hashText(
        JSON.stringify({
          operation: "image-generation",
          model: settings.model,
          size: settings.resolvedSize,
          quality: settings.quality,
          outputFormat: "png",
          background: "opaque",
          promptVersion: 1,
          prompt,
          referenceImages: [],
        })
      ),
    },
    referenceImages: [],
  });
  character.referenceImagePath = result.outputPath;
  character.referenceStatus = "generated";
  registry.updatedAt = new Date().toISOString();
  await saveRegistry(episodeDir, registry);
  return { path: result.outputPath, sha256: result.outputSha256 };
}

async function loadReferenceImages(
  episodeDir: string,
  registry: CharacterRegistry,
  scene: SceneVisualSpec,
  settings: EpisodeImagePipelineSettings,
  client?: OpenAI
): Promise<{
  referenceImages: ReferenceImage[];
  referenceHashes: Array<{ characterId: CharacterId; sha256: string }>;
}> {
  const referenceImages: ReferenceImage[] = [];
  const referenceHashes: Array<{ characterId: CharacterId; sha256: string }> =
    [];
  for (const usage of scene.characters) {
    const character = registry.characters.find(
      (item) => item.id === usage.characterId
    );
    if (!character) {
      continue;
    }
    if (character.referenceStatus !== "approved") {
      if (!settings.allowUnapprovedCharacterReferences) {
        throw new Error(
          `Character ${character.id} requires an approved reference before scene generation.`
        );
      }
      if (
        !character.referenceImagePath ||
        !(await fileExists(character.referenceImagePath))
      ) {
        throw new Error(
          `Character ${character.id} does not have a generated reference image.`
        );
      }
    }
    const filePath =
      character.referenceImagePath ??
      resolveEpisodeCharacterReferencePath(episodeDir, character.id);
    if (!(await fileExists(filePath))) {
      throw new Error(`Missing reference image for character ${character.id}.`);
    }
    referenceImages.push({
      characterId: character.id,
      filePath,
      mimeType: "image/png",
    });
    referenceHashes.push({
      characterId: character.id,
      sha256: await hashFile(filePath),
    });
  }
  return { referenceImages, referenceHashes };
}

async function summarizeReferenceImages(
  episodeDir: string,
  registry: CharacterRegistry,
  scene: SceneVisualSpec
): Promise<
  Array<{
    characterId: CharacterId;
    path: string;
    sha256: string;
  }>
> {
  const summaries: Array<{
    characterId: CharacterId;
    path: string;
    sha256: string;
  }> = [];
  for (const usage of scene.characters) {
    const character = registry.characters.find(
      (item) => item.id === usage.characterId
    );
    if (!character) continue;
    const filePath =
      character.referenceImagePath ??
      resolveEpisodeCharacterReferencePath(episodeDir, character.id);
    summaries.push({
      characterId: character.id,
      path: filePath,
      sha256: (await hashFile(filePath).catch(() => "")) ?? "",
    });
  }
  return summaries;
}

function buildPersistedSceneVisualPlan(args: {
  readonly scene: Scene;
  readonly spec: SceneVisualSpec;
  readonly previousSpec?: SceneVisualSpec;
  readonly validationIssues: readonly SceneVisualPlanIssue[];
}): PersistedSceneVisualPlan {
  return {
    sceneId: args.scene.id,
    ...(args.previousSpec ? { previousSceneId: args.previousSpec.sceneId } : {}),
    narrationBeat: normalizedNarrationBeat(args.scene),
    visualSpec: args.spec,
    renderability: deriveRenderability(
      args.scene,
      args.spec,
      args.previousSpec
    ),
    validationIssues: [...args.validationIssues],
    materialDifferencesFromPrevious: diffSpec(args.previousSpec, args.spec),
    generatedAt: new Date().toISOString(),
  };
}

async function writeSceneVisualPlanArtifact(
  episodeDir: string,
  sceneId: string,
  artifact: PersistedSceneVisualPlan
): Promise<string> {
  const filePath = resolveEpisodeImageVisualPlanPath(episodeDir, sceneId);
  await writeJsonAtomic(filePath, persistedSceneVisualPlanSchema.parse(artifact));
  return filePath;
}

function buildProviderRequestArtifact(args: {
  readonly request: PreparedImageProviderRequest;
}): PersistedImageProviderRequest {
  return {
    sceneId: args.request.sceneId,
    provider: "openai",
    operation: args.request.operation,
    model: args.request.model,
    size: args.request.size,
    quality: args.request.quality,
    outputFormat: "png",
    background: "opaque",
    prompt: args.request.prompt,
    providerRequestHash: args.request.providerRequestHash,
    promptHash: args.request.promptHash,
    outputPath: args.request.outputPath,
    referenceImages: args.request.referenceImages.map((reference) => ({
      characterId: reference.characterId,
      path: reference.path,
      sha256: reference.sha256,
    })),
    recordedAt: new Date().toISOString(),
  };
}

async function writeProviderRequestArtifact(
  episodeDir: string,
  sceneId: string,
  artifact: PersistedImageProviderRequest
): Promise<string> {
  const filePath = resolveEpisodeImageProviderRequestPath(episodeDir, sceneId);
  await writeJsonAtomic(
    filePath,
    persistedImageProviderRequestSchema.parse(artifact)
  );
  return filePath;
}

function buildProviderResponseArtifact(args: {
  readonly sceneId: string;
  readonly generation: GeneratedImageResult;
}): PersistedImageProviderResponse {
  return {
    sceneId: args.sceneId,
    provider: "openai",
    operation:
      args.generation.generationMode === "reference-assisted"
        ? "image-edit"
        : "image-generation",
    model: args.generation.model,
    size: args.generation.size,
    quality: args.generation.quality,
    providerRequestHash: args.generation.providerRequestHash,
    promptHash: args.generation.promptHash,
    outputPath: args.generation.outputPath,
    outputSha256: args.generation.outputSha256,
    attempts: args.generation.attempts,
    durationMs: args.generation.durationMs,
    ...(args.generation.requestId ? { requestId: args.generation.requestId } : {}),
    referenceHashes: args.generation.referenceHashes.map((reference) => ({
      characterId: reference.characterId,
      sha256: reference.sha256,
    })),
    recordedAt: new Date().toISOString(),
  };
}

async function writeProviderResponseArtifact(
  episodeDir: string,
  sceneId: string,
  artifact: PersistedImageProviderResponse
): Promise<string> {
  const filePath = resolveEpisodeImageProviderResponsePath(episodeDir, sceneId);
  await writeJsonAtomic(
    filePath,
    persistedImageProviderResponseSchema.parse(artifact)
  );
  return filePath;
}

async function writeGenerationCheckpoint(
  episodeDir: string,
  artifact: PersistedImageGenerationCheckpoint
): Promise<string> {
  const filePath = resolveEpisodeImageCheckpointPath(episodeDir, artifact.sceneId);
  await writeJsonAtomic(
    filePath,
    persistedImageGenerationCheckpointSchema.parse(artifact)
  );
  return filePath;
}

function classifyFailure(args: {
  readonly stage: SceneFailureStage;
  readonly error: unknown;
  readonly retryable: boolean;
}): SceneFailureCategory {
  const code = parseErrorCode(args.error);
  if (args.stage === "visual-planning") {
    return "prompt-validation-error";
  }
  if (args.stage === "reference-resolution") {
    return "character-continuity-error";
  }
  if (args.stage === "filesystem") {
    return "filesystem-error";
  }
  if (args.stage === "manifest") {
    return "manifest-conflict";
  }
  if (code === "content_policy_violation") {
    return "provider-safety-rejection";
  }
  const status =
    typeof (args.error as { status?: unknown })?.status === "number"
      ? ((args.error as { status: number }).status as number)
      : null;
  if (status === 429) {
    return "provider-rate-limit";
  }
  return args.retryable
    ? "provider-transient-error"
    : "provider-permanent-error";
}

async function writeGenerationFailure(
  episodeDir: string,
  artifact: PersistedImageGenerationFailure
): Promise<string> {
  const filePath = resolveEpisodeImageFailurePath(episodeDir, artifact.sceneId);
  await writeJsonAtomic(
    filePath,
    persistedImageGenerationFailureSchema.parse(artifact)
  );
  return filePath;
}

function visualPlanHash(artifact: PersistedSceneVisualPlan): string {
  const { generatedAt: _generatedAt, ...stableArtifact } =
    persistedSceneVisualPlanSchema.parse(artifact);
  return hashText(JSON.stringify(stableArtifact));
}

function episodeReuseBudget(sceneCount: number): number {
  return Math.max(0, Math.floor(sceneCount * 0.1));
}

function episodeUniqueQuota(sceneCount: number): number {
  return Math.max(
    minimumUniqueSceneFloor,
    sceneCount - episodeReuseBudget(sceneCount)
  );
}

function isReusableScenePlan(plan: EpisodeScenePlan): boolean {
  return (
    plan.visualPlanArtifact.renderability === "mergeWithPrevious" ||
    plan.visualPlanArtifact.renderability === "mergeWithNext" ||
    plan.visualPlanArtifact.renderability === "skip"
  );
}

function mergePromotionScore(plan: EpisodeScenePlan): number {
  const comparison = plan.mergeComparison;
  if (!comparison) {
    return Number.POSITIVE_INFINITY;
  }
  return comparison.score - comparison.materialChangeCount * 0.08;
}

function sceneContentSimilarity(previous: Scene, current: Scene): number {
  const weightedFields: Array<{ weight: number; left: string; right: string }> = [
    {
      weight: 4,
      left: previous.canonicalNarration,
      right: current.canonicalNarration,
    },
    { weight: 2, left: previous.subject, right: current.subject },
    { weight: 2, left: previous.action, right: current.action },
    { weight: 2, left: previous.setting, right: current.setting },
    { weight: 1, left: previous.visualPurpose, right: current.visualPurpose },
    { weight: 1, left: previous.composition, right: current.composition },
    { weight: 1, left: previous.cameraFraming, right: current.cameraFraming },
    { weight: 1, left: previous.mood, right: current.mood },
  ];
  const totalWeight = weightedFields.reduce((sum, field) => sum + field.weight, 0);
  const matchedWeight = weightedFields.reduce(
    (sum, field) =>
      sum + overlapRatio(field.left, field.right) * field.weight,
    0
  );
  return totalWeight === 0 ? 0 : matchedWeight / totalWeight;
}

function sceneReuseSignature(scene: Scene): string {
  return [
    normalizePlanText(scene.canonicalNarration).toLowerCase(),
    normalizePlanText(scene.subject).toLowerCase(),
    normalizePlanText(scene.action).toLowerCase(),
    normalizePlanText(scene.setting).toLowerCase(),
    normalizePlanText(scene.visualPurpose).toLowerCase(),
  ].join(" | ");
}

function shouldMergeScenePair(args: {
  readonly previousScene: Scene;
  readonly currentScene: Scene;
  readonly previousSpec: SceneVisualSpec | undefined;
  readonly currentSpec: SceneVisualSpec;
}): boolean {
  if (!args.previousSpec) {
    return false;
  }
  if (sceneReuseSignature(args.previousScene) === sceneReuseSignature(args.currentScene)) {
    return true;
  }
  const semanticComparison = compareSceneSemantics(
    args.previousSpec,
    args.currentSpec
  );
  return (
    isNearIdenticalSceneComparison(semanticComparison) ||
    sceneContentSimilarity(args.previousScene, args.currentScene) >= 0.9
  );
}

function rebalanceEpisodeScenePlans(
  plans: EpisodeScenePlan[]
): { readonly plans: EpisodeScenePlan[]; readonly promotedSceneIds: string[] } {
  const sceneCount = plans.length;
  const reuseBudget = episodeReuseBudget(sceneCount);
  const uniqueQuota = Math.min(sceneCount, episodeUniqueQuota(sceneCount));
  const maxReusableScenes = Math.min(reuseBudget, sceneCount - uniqueQuota);
  const reusablePlans = plans
    .map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => isReusableScenePlan(plan));
  const currentReusableScenes = reusablePlans.length;
  if (currentReusableScenes <= maxReusableScenes) {
    return { plans, promotedSceneIds: [] };
  }

  const promotedSceneIds: string[] = [];
  const nextPlans = plans.map((plan) => ({ ...plan }));
  const candidates = reusablePlans.sort((left, right) => {
    const scoreDelta = mergePromotionScore(left.plan) - mergePromotionScore(right.plan);
    if (scoreDelta !== 0) return scoreDelta;
    const materialDelta =
      (right.plan.mergeComparison?.materialChangeCount ?? 0) -
      (left.plan.mergeComparison?.materialChangeCount ?? 0);
    if (materialDelta !== 0) return materialDelta;
    return right.plan.scene.sequenceNumber - left.plan.scene.sequenceNumber;
  });

  let reusableCount = currentReusableScenes;
  for (const candidate of candidates) {
    if (reusableCount <= maxReusableScenes) {
      break;
    }
    nextPlans[candidate.index] = {
      ...candidate.plan,
      visualPlanArtifact: {
        ...candidate.plan.visualPlanArtifact,
        renderability: "direct",
      },
    };
    reusableCount -= 1;
    promotedSceneIds.push(candidate.plan.scene.id);
  }

  return { plans: nextPlans, promotedSceneIds };
}

async function buildEpisodeScenePlans(args: {
  readonly episodeDir: string;
  readonly registry: CharacterRegistry;
  readonly scenes: readonly Scene[];
  readonly settings: EpisodeImagePipelineSettings;
  readonly client?: OpenAI;
}): Promise<EpisodeScenePlan[]> {
  const plans: EpisodeScenePlan[] = [];
  let previousScene: Scene | undefined;
  let previousSpec: SceneVisualSpec | undefined;
  let previousPrompt: string | undefined;
  for (const scene of args.scenes) {
    const outputPath = sceneOutputPath(args.episodeDir, scene);
    let spec = buildSceneVisualSpec(scene, args.registry, previousSpec);
    if (previousSpec) {
      const comparison = compareSceneSemantics(previousSpec, spec);
      if (
        comparison.score > 0.83 &&
        comparison.materialChangeCount < 2 &&
        !spec.allowMatchingComposition
      ) {
        spec = repairForSemanticDifference(spec, previousSpec);
      }
    }
    const referenceImages = await summarizeReferenceImages(
      args.episodeDir,
      args.registry,
      spec
    );
    const providerRequest = prepareImageProviderRequest(
      buildImageProviderRequest({
        scene: spec,
        ...(previousSpec ? { previousScene: previousSpec } : {}),
        registry: args.registry,
        settings: args.settings,
        outputPath,
        referenceImages,
      })
    );
    const prompt = providerRequest.prompt;
    const validationIssues = validateSceneVisualSpec(
      spec,
      previousPrompt,
      previousSpec
    );
    let validationFailures = [
      ...validationIssues.map((issue) => issue.message),
      ...validatePrompt(prompt, spec, previousPrompt, previousSpec),
    ];
    await loadReferenceImages(
      args.episodeDir,
      args.registry,
      spec,
      args.settings,
      args.client
    ).catch((error) => {
      validationFailures = [...validationFailures, formatError(error)];
      return null;
    });
    const currentSceneHash = sceneHash(scene);
    let visualPlanArtifact = buildPersistedSceneVisualPlan({
      scene,
      spec,
      ...(previousSpec ? { previousSpec } : {}),
      validationIssues,
    });
    if (
      previousScene &&
      visualPlanArtifact.renderability === "direct" &&
      shouldMergeScenePair({
        previousScene,
        currentScene: scene,
        previousSpec,
        currentSpec: spec,
      })
    ) {
      visualPlanArtifact = {
        ...visualPlanArtifact,
        renderability: "mergeWithPrevious",
      };
    }
    plans.push({
      scene,
      spec,
      providerRequest,
      prompt,
      sceneHash: currentSceneHash,
      promptHash: providerRequest.promptHash,
      providerRequestHash: providerRequest.providerRequestHash,
      validationIssues,
      validationFailures,
      referenceImages,
      visualPlanArtifact,
      visualPlanHash: visualPlanHash(visualPlanArtifact),
      materialDifferencesFromPrevious: diffSpec(previousSpec, spec),
      ...(previousSpec ? { previousSceneId: previousSpec.sceneId } : {}),
      ...(previousSpec
        ? { mergeComparison: compareSceneSemantics(previousSpec, spec) }
        : {}),
    });
    previousSpec = spec;
    previousPrompt = prompt;
    previousScene = scene;
  }
  return plans;
}

async function writeManifest(
  filePath: string,
  manifest: SceneGenerationManifest
): Promise<void> {
  await writeJsonAtomic(filePath, manifest);
}

async function readManifest(
  filePath: string
): Promise<SceneGenerationManifest | null> {
  return readJsonIfExists(
    filePath,
    (value) => manifestSchema.parse(value) as unknown as SceneGenerationManifest
  );
}

export async function loadEpisodeSceneVisualPlan(
  episodeDir: string,
  sceneId: string
): Promise<PersistedSceneVisualPlan | null> {
  return readJsonIfExists(
    resolveEpisodeImageVisualPlanPath(episodeDir, sceneId),
    (value) =>
      persistedSceneVisualPlanSchema.parse(
        value
      ) as unknown as PersistedSceneVisualPlan
  );
}

export interface EpisodeImagePlanResult {
  episodeId: string;
  sceneId: string;
  prompt: string;
  promptHash: string;
  providerRequestHash: string;
  manifestPath: string;
  visualPlanPath: string;
  renderability: SceneRenderability;
  validationIssues: SceneVisualPlanIssue[];
  validationFailures: string[];
  materialDifferencesFromPrevious: string[];
  characterIds: CharacterId[];
  referenceImages: Array<{
    characterId: CharacterId;
    path: string;
    sha256: string;
  }>;
}

interface EpisodeScenePlan {
  readonly scene: Scene;
  readonly spec: SceneVisualSpec;
  readonly providerRequest: PreparedImageProviderRequest;
  readonly prompt: string;
  readonly sceneHash: string;
  readonly promptHash: string;
  readonly providerRequestHash: string;
  readonly validationIssues: SceneVisualPlanIssue[];
  readonly validationFailures: string[];
  readonly referenceImages: Array<{
    characterId: CharacterId;
    path: string;
    sha256: string;
  }>;
  readonly visualPlanArtifact: PersistedSceneVisualPlan;
  readonly visualPlanHash: string;
  readonly materialDifferencesFromPrevious: string[];
  readonly previousSceneId?: string;
  readonly mergeComparison?: SceneSemanticComparison;
}

function sceneRequiresSequentialReuseHandling(
  renderability: SceneRenderability
): boolean {
  return (
    renderability === "mergeWithPrevious" ||
    renderability === "mergeWithNext" ||
    renderability === "skip"
  );
}

function canGenerateScenePlansConcurrently(
  plans: readonly EpisodeScenePlan[]
): boolean {
  return plans.every(
    (plan) =>
      !sceneRequiresSequentialReuseHandling(plan.visualPlanArtifact.renderability)
  );
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const queue = items.map((item, index) => ({ item, index }));
  const results = new Map<number, TOutput>();
  async function runWorker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      const result = await worker(next.item, next.index);
      results.set(next.index, result);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return items.map((_, index) => {
    const result = results.get(index);
    if (result === undefined) {
      throw new Error(`Missing concurrent scene result for index ${index}.`);
    }
    return result;
  });
}

export interface EpisodeImageGenerationResult {
  episodeId: string;
  sceneId: string;
  manifestPath: string;
  outputPath: string;
  outputSha256?: string;
  status: "generated" | "failed" | "skipped";
}

export interface SyncEpisodeSharedImageAssetsOptions {
  readonly includeGeneratedImages?: boolean;
  readonly includeCharacterReferences?: boolean;
}

export interface SyncEpisodeSharedImageAssetsResult {
  readonly episodeId: string;
  readonly copiedGeneratedImages: number;
  readonly copiedCharacterReferences: number;
  readonly skippedGeneratedImages: number;
  readonly skippedCharacterReferences: number;
  readonly missingGeneratedSources: string[];
  readonly missingCharacterSources: string[];
  readonly generatedImagePaths: string[];
  readonly characterReferencePaths: string[];
}

async function generateIndependentScenePlan(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly plan: EpisodeScenePlan;
  readonly settings: EpisodeImagePipelineSettings;
  readonly registry: CharacterRegistry;
  readonly generator: OpenAIImageGenerator;
  readonly force: boolean;
  readonly client?: OpenAI;
}): Promise<EpisodeImageGenerationResult> {
  const manifestPath = resolveEpisodeImageManifestPath(
    args.episodeDir,
    args.plan.scene.id
  );
  const existing = await readManifest(manifestPath);
  const outputPath = sceneOutputPath(args.episodeDir, args.plan.scene);
  await hydrateCanonicalSceneImage(existing?.outputPath, outputPath);

  await writeSceneVisualPlanArtifact(
    args.episodeDir,
    args.plan.scene.id,
    args.plan.visualPlanArtifact
  );

  if (
    args.plan.validationFailures.length === 0 &&
    (await canReuseSceneImage({
      existing,
      currentSceneHash: args.plan.sceneHash,
      currentPromptHash: args.plan.promptHash,
      currentProviderRequestHash: args.plan.providerRequestHash,
      currentVisualPlanHash: args.plan.visualPlanHash,
      currentRenderability: args.plan.visualPlanArtifact.renderability,
      currentReferenceImages: args.plan.referenceImages,
      outputPath,
      force: args.force,
    }))
  ) {
    await writeGenerationCheckpoint(args.episodeDir, {
      sceneId: args.plan.scene.id,
      status: "reused_cached_output",
      outputPath,
      promptHash: args.plan.promptHash,
      visualPlanHash: args.plan.visualPlanHash,
      cacheDecision: "reused-existing",
      details: ["reused previously generated canonical output"],
      recordedAt: new Date().toISOString(),
    });
    return {
      episodeId: args.episodeId,
      sceneId: args.plan.scene.id,
      manifestPath,
      outputPath,
      ...(existing?.outputSha256 ? { outputSha256: existing.outputSha256 } : {}),
      status: "skipped",
    };
  }

  if (args.plan.validationFailures.length > 0) {
    const manifest: SceneGenerationManifest = {
      sceneId: args.plan.scene.id,
      promptVersion: args.plan.providerRequest.promptVersion,
      sceneHash: args.plan.sceneHash,
      visualPlanHash: args.plan.visualPlanHash,
      renderability: args.plan.visualPlanArtifact.renderability,
      finalPrompt: args.plan.prompt,
      providerRequestHash: args.plan.providerRequestHash,
      promptHash: args.plan.promptHash,
      ...(args.plan.previousSceneId
        ? { previousSceneId: args.plan.previousSceneId }
        : {}),
      materialDifferencesFromPrevious: args.plan.materialDifferencesFromPrevious,
      ...(args.plan.validationIssues.length > 0
        ? {
            validationIssueCodes: args.plan.validationIssues.map(
              (issue) => issue.code
            ),
          }
        : {}),
      characterIds: args.plan.spec.characters.map(
        (character) => character.characterId
      ),
      referenceImages: args.plan.referenceImages,
      model: args.plan.providerRequest.model,
      size: args.plan.providerRequest.size,
      quality: args.plan.providerRequest.quality,
      outputPath,
      status: "failed",
      attempts: 0,
      error: {
        message: args.plan.validationFailures.join("; "),
        retryable: false,
      },
    };
    await writeManifest(manifestPath, manifest);
    await writeGenerationCheckpoint(args.episodeDir, {
      sceneId: args.plan.scene.id,
      status: "validation_failed",
      outputPath,
      promptHash: args.plan.promptHash,
      visualPlanHash: args.plan.visualPlanHash,
      cacheDecision: "validation-failed",
      details: [...args.plan.validationFailures],
      recordedAt: new Date().toISOString(),
    });
    await writeGenerationFailure(args.episodeDir, {
      sceneId: args.plan.scene.id,
      stage: "visual-planning",
      category: "prompt-validation-error",
      outputPath,
      promptHash: args.plan.promptHash,
      message: args.plan.validationFailures.join("; "),
      retryable: false,
      attempts: 0,
      recordedAt: new Date().toISOString(),
    });
    return {
      episodeId: args.episodeId,
      sceneId: args.plan.scene.id,
      manifestPath,
      outputPath,
      status: "failed",
    };
  }

  let referenceImages: ReferenceImage[];
  try {
    ({ referenceImages } = await loadReferenceImages(
      args.episodeDir,
      args.registry,
      args.plan.spec,
      args.settings,
      args.client
    ));
  } catch (error) {
    const message = formatError(error);
    const errorCode = parseErrorCode(error);
    const manifest: SceneGenerationManifest = {
      sceneId: args.plan.scene.id,
      promptVersion: args.plan.providerRequest.promptVersion,
      sceneHash: args.plan.sceneHash,
      visualPlanHash: args.plan.visualPlanHash,
      renderability: args.plan.visualPlanArtifact.renderability,
      finalPrompt: args.plan.prompt,
      providerRequestHash: args.plan.providerRequestHash,
      promptHash: args.plan.promptHash,
      ...(args.plan.previousSceneId
        ? { previousSceneId: args.plan.previousSceneId }
        : {}),
      materialDifferencesFromPrevious: args.plan.materialDifferencesFromPrevious,
      ...(args.plan.validationIssues.length > 0
        ? {
            validationIssueCodes: args.plan.validationIssues.map(
              (issue) => issue.code
            ),
          }
        : {}),
      characterIds: args.plan.spec.characters.map(
        (character) => character.characterId
      ),
      referenceImages: args.plan.referenceImages,
      model: args.plan.providerRequest.model,
      size: args.plan.providerRequest.size,
      quality: args.plan.providerRequest.quality,
      outputPath,
      status: "failed",
      attempts: 0,
      error: { message, retryable: false },
    };
    await writeManifest(manifestPath, manifest);
    await writeGenerationCheckpoint(args.episodeDir, {
      sceneId: args.plan.scene.id,
      status: "provider_failed",
      outputPath,
      promptHash: args.plan.promptHash,
      visualPlanHash: args.plan.visualPlanHash,
      cacheDecision: "provider-failed",
      details: [message],
      recordedAt: new Date().toISOString(),
    });
    await writeGenerationFailure(args.episodeDir, {
      sceneId: args.plan.scene.id,
      stage: "reference-resolution",
      category: "character-continuity-error",
      outputPath,
      promptHash: args.plan.promptHash,
      ...(errorCode ? { code: errorCode } : {}),
      message,
      retryable: false,
      attempts: 0,
      recordedAt: new Date().toISOString(),
    });
    return {
      episodeId: args.episodeId,
      sceneId: args.plan.scene.id,
      manifestPath,
      outputPath,
      status: "failed",
    };
  }

  await writeProviderRequestArtifact(
    args.episodeDir,
    args.plan.scene.id,
    buildProviderRequestArtifact({
      request: args.plan.providerRequest,
    })
  );
  await writeGenerationCheckpoint(args.episodeDir, {
    sceneId: args.plan.scene.id,
    status: "provider_requested",
    outputPath,
    promptHash: args.plan.promptHash,
    visualPlanHash: args.plan.visualPlanHash,
    cacheDecision: "provider-requested",
    details: ["provider request persisted"],
    recordedAt: new Date().toISOString(),
  });

  let generation: GeneratedImageResult;
  try {
    generation = await args.generator.generate({
      providerRequest: args.plan.providerRequest,
      referenceImages,
    });
  } catch (error) {
    const message = formatError(error);
    const errorCode = parseErrorCode(error);
    const retryable = isRetryableError(error);
    const manifest: SceneGenerationManifest = {
      sceneId: args.plan.scene.id,
      promptVersion: args.plan.providerRequest.promptVersion,
      sceneHash: args.plan.sceneHash,
      visualPlanHash: args.plan.visualPlanHash,
      renderability: args.plan.visualPlanArtifact.renderability,
      finalPrompt: args.plan.prompt,
      providerRequestHash: args.plan.providerRequestHash,
      promptHash: args.plan.promptHash,
      ...(args.plan.previousSceneId
        ? { previousSceneId: args.plan.previousSceneId }
        : {}),
      materialDifferencesFromPrevious: args.plan.materialDifferencesFromPrevious,
      ...(args.plan.validationIssues.length > 0
        ? {
            validationIssueCodes: args.plan.validationIssues.map(
              (issue) => issue.code
            ),
          }
        : {}),
      characterIds: args.plan.spec.characters.map(
        (character) => character.characterId
      ),
      referenceImages: args.plan.referenceImages,
      model: args.plan.providerRequest.model,
      size: args.plan.providerRequest.size,
      quality: args.plan.providerRequest.quality,
      outputPath,
      status: "failed",
      attempts: 0,
      error: {
        message,
        retryable,
      },
    };
    await writeManifest(manifestPath, manifest);
    await writeGenerationCheckpoint(args.episodeDir, {
      sceneId: args.plan.scene.id,
      status: "provider_failed",
      outputPath,
      promptHash: args.plan.promptHash,
      visualPlanHash: args.plan.visualPlanHash,
      cacheDecision: "provider-failed",
      details: [message],
      recordedAt: new Date().toISOString(),
    });
    await writeGenerationFailure(args.episodeDir, {
      sceneId: args.plan.scene.id,
      stage: "provider",
      category: classifyFailure({
        stage: "provider",
        error,
        retryable,
      }),
      outputPath,
      promptHash: args.plan.promptHash,
      ...(errorCode ? { code: errorCode } : {}),
      message,
      retryable,
      attempts: 0,
      recordedAt: new Date().toISOString(),
    });
    return {
      episodeId: args.episodeId,
      sceneId: args.plan.scene.id,
      manifestPath,
      outputPath,
      status: "failed",
    };
  }

  const manifest: SceneGenerationManifest = {
    sceneId: args.plan.scene.id,
    promptVersion: args.plan.providerRequest.promptVersion,
    sceneHash: args.plan.sceneHash,
    visualPlanHash: args.plan.visualPlanHash,
    renderability: args.plan.visualPlanArtifact.renderability,
    finalPrompt: args.plan.prompt,
    providerRequestHash: generation.providerRequestHash,
    promptHash: generation.promptHash,
    ...(args.plan.previousSceneId ? { previousSceneId: args.plan.previousSceneId } : {}),
    materialDifferencesFromPrevious: args.plan.materialDifferencesFromPrevious,
    ...(args.plan.validationIssues.length > 0
      ? {
          validationIssueCodes: args.plan.validationIssues.map(
            (issue) => issue.code
          ),
        }
      : {}),
    characterIds: args.plan.spec.characters.map(
      (character) => character.characterId
    ),
    referenceImages: args.plan.referenceImages,
    model: generation.model,
    size: generation.size,
    quality: generation.quality,
    outputPath,
    ...(generation.outputSha256 ? { outputSha256: generation.outputSha256 } : {}),
    status: "generated",
    attempts: generation.attempts,
    generatedAt: new Date().toISOString(),
  };
  await writeManifest(manifestPath, manifest);
  await writeProviderResponseArtifact(
    args.episodeDir,
    args.plan.scene.id,
    buildProviderResponseArtifact({
      sceneId: args.plan.scene.id,
      generation,
    })
  );
  await writeGenerationCheckpoint(args.episodeDir, {
    sceneId: args.plan.scene.id,
    status: "generated",
    outputPath,
    promptHash: generation.promptHash,
    visualPlanHash: args.plan.visualPlanHash,
    cacheDecision: "generated",
    details: ["provider response persisted"],
    recordedAt: new Date().toISOString(),
  });
  return {
    episodeId: args.episodeId,
    sceneId: args.plan.scene.id,
    manifestPath,
    outputPath,
    ...(generation.outputSha256 ? { outputSha256: generation.outputSha256 } : {}),
    status: "generated",
  };
}

export async function planEpisodeImageGeneration(
  episodeDir: string,
  episodeId: string,
  scenePlan: ScenePlan,
  settings: EpisodeImagePipelineSettings,
  options?: { sceneId?: string; client?: OpenAI }
): Promise<EpisodeImagePlanResult[]> {
  const registry = await loadRegistry(episodeDir, episodeId);
  await ensureDir(path.join(episodeDir, "state", "image-generation", "manifests"));
  await ensureDir(path.join(episodeDir, "state", "image-generation", "prompts"));
  await ensureDir(resolveEpisodeImageVisualPlansDir(episodeDir));
  await ensureDir(resolveEpisodeImageProviderRequestsDir(episodeDir));
  await ensureDir(resolveEpisodeImageProviderResponsesDir(episodeDir));
  await ensureDir(resolveEpisodeImageCheckpointsDir(episodeDir));
  await ensureDir(resolveEpisodeImageFailuresDir(episodeDir));
  const scenes = options?.sceneId
    ? scenePlan.scenes.filter((scene) => scene.id === options.sceneId)
    : scenePlan.scenes;
  const draftPlans = await buildEpisodeScenePlans({
    episodeDir,
    registry,
    scenes,
    settings,
    ...(options?.client ? { client: options.client } : {}),
  });
  const { plans, promotedSceneIds } = rebalanceEpisodeScenePlans(draftPlans);
  if (promotedSceneIds.length > 0 && settings.logger) {
    settings.logger.warn(
      {
        episodeId,
        promotedSceneIds,
        reuseBudget: episodeReuseBudget(plans.length),
        uniqueQuota: Math.min(plans.length, episodeUniqueQuota(plans.length)),
      },
      "Episode image plan exceeded the reuse budget; promoting marginal merge candidates to direct generation."
    );
  }
  const results: EpisodeImagePlanResult[] = [];
  for (const plan of plans) {
    const visualPlanPath = await writeSceneVisualPlanArtifact(
      episodeDir,
      plan.scene.id,
      plan.visualPlanArtifact
    );
    const manifest: SceneGenerationManifest = {
      sceneId: plan.scene.id,
      promptVersion: plan.providerRequest.promptVersion,
      sceneHash: plan.sceneHash,
      visualPlanHash: plan.visualPlanHash,
      renderability: plan.visualPlanArtifact.renderability,
      finalPrompt: plan.prompt,
      providerRequestHash: plan.providerRequestHash,
      promptHash: plan.promptHash,
      ...(plan.previousSceneId ? { previousSceneId: plan.previousSceneId } : {}),
      materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
      ...(plan.validationIssues.length > 0
        ? { validationIssueCodes: plan.validationIssues.map((issue) => issue.code) }
        : {}),
      characterIds: plan.spec.characters.map((character) => character.characterId),
      referenceImages: plan.referenceImages,
      model: plan.providerRequest.model,
      size: plan.providerRequest.size,
      quality: plan.providerRequest.quality,
      outputPath: sceneOutputPath(episodeDir, plan.scene),
      status: plan.validationFailures.length > 0 ? "failed" : "planned",
      attempts: 0,
      ...(plan.validationFailures.length > 0
        ? {
            error: {
              message: plan.validationFailures.join("; "),
              retryable: false,
            },
          }
        : {}),
    };
    const manifestPath = resolveEpisodeImageManifestPath(episodeDir, plan.scene.id);
    await writeManifest(manifestPath, manifest);
    await writeTextAtomic(
      resolveEpisodeImagePromptPath(episodeDir, plan.scene.id),
      `${plan.prompt}\n`
    );
    await writeGenerationCheckpoint(episodeDir, {
      sceneId: plan.scene.id,
      status: plan.validationFailures.length > 0 ? "validation_failed" : "planned",
      outputPath: manifest.outputPath,
      promptHash: plan.promptHash,
      visualPlanHash: plan.visualPlanHash,
      cacheDecision: plan.validationFailures.length > 0 ? "validation-failed" : "planned",
      ...(plan.validationFailures.length > 0
        ? { details: [...plan.validationFailures] }
        : {}),
      recordedAt: new Date().toISOString(),
    });
    if (plan.validationFailures.length > 0) {
      await writeGenerationFailure(episodeDir, {
        sceneId: plan.scene.id,
        stage: "visual-planning",
        category: "prompt-validation-error",
        outputPath: manifest.outputPath,
        promptHash: plan.promptHash,
        message: plan.validationFailures.join("; "),
        retryable: false,
        attempts: 0,
        recordedAt: new Date().toISOString(),
      });
    }
    results.push({
      episodeId,
      sceneId: plan.scene.id,
      prompt: plan.prompt,
      promptHash: plan.promptHash,
      providerRequestHash: plan.providerRequestHash,
      manifestPath,
      visualPlanPath,
      renderability: plan.visualPlanArtifact.renderability,
      validationIssues: plan.validationIssues,
      validationFailures: plan.validationFailures,
      materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
      characterIds: plan.spec.characters.map((character) => character.characterId),
      referenceImages: plan.referenceImages,
    });
  }
  return results;
}

export async function generateEpisodeImageReferences(
  episodeDir: string,
  episodeId: string,
  settings: EpisodeImagePipelineSettings,
  options?: { characterId?: string; client?: OpenAI }
): Promise<CharacterRegistry> {
  const registry = await loadRegistry(episodeDir, episodeId);
  for (const character of registry.characters) {
    if (options?.characterId && character.id !== options.characterId) continue;
    if (character.referenceStatus === "approved" && !settings.force) continue;
    const ref = await ensureReferenceImage(
      episodeDir,
      registry,
      character,
      settings,
      options?.client
    );
    character.referenceImagePath = ref.path;
    character.referenceStatus = "generated";
  }
  registry.updatedAt = new Date().toISOString();
  await saveRegistry(episodeDir, registry);
  return registry;
}

export async function approveEpisodeCharacter(
  episodeDir: string,
  episodeId: string,
  characterId: string
): Promise<CharacterRegistry> {
  const registry = await loadRegistry(episodeDir, episodeId);
  const character = registry.characters.find((item) => item.id === characterId);
  if (!character) {
    throw new Error(`Unknown character: ${characterId}`);
  }
  if (
    !character.referenceImagePath ||
    !(await fileExists(character.referenceImagePath))
  ) {
    throw new Error(
      `Character ${characterId} does not have a reference image to approve.`
    );
  }
  character.referenceStatus = "approved";
  registry.updatedAt = new Date().toISOString();
  await saveRegistry(episodeDir, registry);
  return registry;
}

export async function regenerateEpisodeCharacter(
  episodeDir: string,
  episodeId: string,
  characterId: string,
  settings: EpisodeImagePipelineSettings,
  options?: { client?: OpenAI }
): Promise<CharacterRegistry> {
  const registry = await loadRegistry(episodeDir, episodeId);
  const character = registry.characters.find((item) => item.id === characterId);
  if (!character) {
    throw new Error(`Unknown character: ${characterId}`);
  }
  character.referenceStatus = "missing";
  delete character.referenceImagePath;
  registry.updatedAt = new Date().toISOString();
  await saveRegistry(episodeDir, registry);
  await generateEpisodeImageReferences(
    episodeDir,
    episodeId,
    { ...settings, force: true },
    options?.client ? { characterId, client: options.client } : { characterId }
  );
  return loadRegistry(episodeDir, episodeId);
}

export async function generateEpisodeImages(
  episodeDir: string,
  episodeId: string,
  scenePlan: ScenePlan,
  settings: EpisodeImagePipelineSettings,
  options?: { sceneId?: string; force?: boolean; client?: OpenAI }
): Promise<EpisodeImageGenerationResult[]> {
  const registry = await loadRegistry(episodeDir, episodeId);
  await ensureDir(path.join(episodeDir, "state", "image-generation", "manifests"));
  await ensureDir(path.join(episodeDir, "shared", "images", "generated"));
  await ensureDir(resolveEpisodeImageVisualPlansDir(episodeDir));
  await ensureDir(resolveEpisodeImageProviderRequestsDir(episodeDir));
  await ensureDir(resolveEpisodeImageProviderResponsesDir(episodeDir));
  await ensureDir(resolveEpisodeImageCheckpointsDir(episodeDir));
  await ensureDir(resolveEpisodeImageFailuresDir(episodeDir));
  const scenes = options?.sceneId
    ? scenePlan.scenes.filter((scene) => scene.id === options.sceneId)
    : scenePlan.scenes;
  const force = options?.force ?? settings.force;
  const generator = new OpenAIImageGenerator(settings, options?.client);
  const draftPlans = await buildEpisodeScenePlans({
    episodeDir,
    registry,
    scenes,
    settings,
    ...(options?.client ? { client: options.client } : {}),
  });
  const { plans, promotedSceneIds } = rebalanceEpisodeScenePlans(draftPlans);
  if (promotedSceneIds.length > 0 && settings.logger) {
    settings.logger.warn(
      {
        episodeId,
        promotedSceneIds,
        reuseBudget: episodeReuseBudget(plans.length),
        uniqueQuota: Math.min(plans.length, episodeUniqueQuota(plans.length)),
      },
      "Episode image plan exceeded the reuse budget; promoting marginal merge candidates to direct generation."
    );
  }
  if (
    settings.concurrency > 1 &&
    canGenerateScenePlansConcurrently(plans)
  ) {
    settings.logger?.info(
      {
        episodeId,
        concurrency: settings.concurrency,
        sceneCount: plans.length,
      },
      "Generating independent episode scenes with bounded concurrency."
    );
    return mapWithConcurrency(
      plans,
      settings.concurrency,
      async (plan) =>
        generateIndependentScenePlan({
          episodeDir,
          episodeId,
          plan,
          settings,
          registry,
          generator,
          force,
          ...(options?.client ? { client: options.client } : {}),
        })
    );
  }
  const results: EpisodeImageGenerationResult[] = [];
  let currentImageRunLength = 0;
  let previousResolvedOutput:
    | {
        sceneId: string;
        outputPath: string;
      }
      | undefined;
  let pendingMergeWithNextScenes: PendingMergeWithNextScene[] = [];
  for (const [sceneIndex, plan] of plans.entries()) {
    const manifestPath = resolveEpisodeImageManifestPath(episodeDir, plan.scene.id);
    const existing = await readManifest(manifestPath);
    const outputPath = sceneOutputPath(episodeDir, plan.scene);
    await hydrateCanonicalSceneImage(existing?.outputPath, outputPath);
    const spec = plan.spec;
    const prompt = plan.prompt;
    const providerRequest = plan.providerRequest;
    const currentSceneHash = plan.sceneHash;
    const currentPromptHash = plan.promptHash;
    const currentProviderRequestHash = plan.providerRequestHash;
    const validationIssues = plan.validationIssues;
    const referenceImagesSummary = plan.referenceImages;
    let visualPlanArtifact = plan.visualPlanArtifact;
    let currentVisualPlanHash = plan.visualPlanHash;
    const reuseQueueLimitReached =
      visualPlanArtifact.renderability === "mergeWithNext" &&
      pendingMergeWithNextScenes.length >= 2;
    const reuseRunLimitReached =
      visualPlanArtifact.renderability === "mergeWithPrevious" &&
      currentImageRunLength >= 3;
    if (reuseQueueLimitReached || reuseRunLimitReached) {
      visualPlanArtifact = {
        ...visualPlanArtifact,
        renderability: "direct",
      };
      currentVisualPlanHash = visualPlanHash(visualPlanArtifact);
    }
    await writeSceneVisualPlanArtifact(
      episodeDir,
      plan.scene.id,
      visualPlanArtifact
    );
    if (
      canResolveByReusingNextScene(
        visualPlanArtifact.renderability,
        validationIssues
      ) &&
      sceneIndex < plans.length - 1 &&
      pendingMergeWithNextScenes.length < 2
    ) {
      pendingMergeWithNextScenes.push({
        episodeId,
        sceneId: plan.scene.id,
        manifestPath,
        outputPath,
        sceneHash: currentSceneHash,
        providerRequest,
        prompt,
        promptHash: currentPromptHash,
        visualPlanHash: currentVisualPlanHash,
        renderability: visualPlanArtifact.renderability,
        ...(plan.previousSceneId ? { previousSceneId: plan.previousSceneId } : {}),
        materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
        validationIssueCodes: validationIssues.map((issue) => issue.code),
        characterIds: spec.characters.map((character) => character.characterId),
        referenceImages: referenceImagesSummary,
        spec,
      });
      await writeGenerationCheckpoint(episodeDir, {
        sceneId: plan.scene.id,
        status: "queued_for_next_reuse",
        outputPath,
        promptHash: currentPromptHash,
        visualPlanHash: currentVisualPlanHash,
        cacheDecision: "queued-for-reuse",
        details: ["queued to reuse next concrete scene output"],
        recordedAt: new Date().toISOString(),
      });
      currentImageRunLength = Math.min(3, pendingMergeWithNextScenes.length + 1);
      continue;
    }
    if (
      previousResolvedOutput &&
      canResolveByReusingPreviousScene(
        visualPlanArtifact.renderability,
        validationIssues
      ) &&
      currentImageRunLength < 3
    ) {
      const reused = await reuseSceneImageFromPriorScene({
        previousSceneId: previousResolvedOutput.sceneId,
        previousOutputPath: previousResolvedOutput.outputPath,
        targetOutputPath: outputPath,
      });
      if (reused) {
        const manifest: SceneGenerationManifest = {
          sceneId: plan.scene.id,
          promptVersion: providerRequest.promptVersion,
          sceneHash: currentSceneHash,
          visualPlanHash: currentVisualPlanHash,
          renderability: visualPlanArtifact.renderability,
          finalPrompt: prompt,
          providerRequestHash: currentProviderRequestHash,
          promptHash: currentPromptHash,
          ...(plan.previousSceneId ? { previousSceneId: plan.previousSceneId } : {}),
          reusedFromSceneId: reused.reusedFromSceneId,
          materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
          ...(validationIssues.length > 0
            ? {
                validationIssueCodes: validationIssues.map((issue) => issue.code),
              }
            : {}),
          characterIds: spec.characters.map((character) => character.characterId),
          referenceImages: referenceImagesSummary,
          model: providerRequest.model,
          size: providerRequest.size,
          quality: providerRequest.quality,
          outputPath,
          outputSha256: reused.outputSha256,
          status: "generated",
          attempts: 0,
          generatedAt: new Date().toISOString(),
        };
        await writeManifest(manifestPath, manifest);
        await writeGenerationCheckpoint(episodeDir, {
          sceneId: plan.scene.id,
          status: "reused_previous_scene",
          outputPath,
          promptHash: currentPromptHash,
          visualPlanHash: currentVisualPlanHash,
          cacheDecision: "reused-previous",
          details: [`reused output from ${reused.reusedFromSceneId}`],
          recordedAt: new Date().toISOString(),
        });
        results.push({
          episodeId,
          sceneId: plan.scene.id,
          manifestPath,
          outputPath,
          outputSha256: reused.outputSha256,
          status: "skipped",
        });
        previousResolvedOutput = {
          sceneId: plan.scene.id,
          outputPath,
        };
        currentImageRunLength = Math.min(3, currentImageRunLength + 1);
        continue;
      }
    }
    const validationFailures = plan.validationFailures;
    if (
      validationFailures.length === 0 &&
      (await canReuseSceneImage({
        existing,
        currentSceneHash,
        currentPromptHash,
        currentProviderRequestHash,
        currentVisualPlanHash,
        currentRenderability: visualPlanArtifact.renderability,
        currentReferenceImages: referenceImagesSummary,
        outputPath,
        force,
      }))
      &&
      currentImageRunLength < 3
      ) {
      if (pendingMergeWithNextScenes.length > 0) {
        const pendingResults = await materializePendingMergeWithNextScenes({
          pendingScenes: pendingMergeWithNextScenes,
          sourceSceneId: plan.scene.id,
          sourceOutputPath: outputPath,
          sourceOutputSha256:
            existing?.outputSha256 ?? (await hashFile(outputPath)),
          generator,
          episodeDir,
          registry,
          settings,
          ...(options?.client ? { client: options.client } : {}),
        });
        results.push(...pendingResults);
        pendingMergeWithNextScenes = [];
      }
      results.push({
        episodeId,
        sceneId: plan.scene.id,
        manifestPath,
        outputPath,
        ...(existing?.outputSha256
          ? { outputSha256: existing.outputSha256 }
          : {}),
        status: "skipped",
      });
      await writeGenerationCheckpoint(episodeDir, {
        sceneId: plan.scene.id,
        status: "reused_cached_output",
        outputPath,
        promptHash: currentPromptHash,
        visualPlanHash: currentVisualPlanHash,
        cacheDecision: "reused-existing",
        details: ["reused previously generated canonical output"],
        recordedAt: new Date().toISOString(),
      });
      previousResolvedOutput = {
        sceneId: plan.scene.id,
        outputPath,
      };
      currentImageRunLength = Math.max(currentImageRunLength, 1);
      continue;
    }
    if (validationFailures.length > 0) {
      const manifest: SceneGenerationManifest = {
        sceneId: plan.scene.id,
        promptVersion: providerRequest.promptVersion,
        sceneHash: currentSceneHash,
        visualPlanHash: currentVisualPlanHash,
        renderability: visualPlanArtifact.renderability,
        finalPrompt: prompt,
        providerRequestHash: currentProviderRequestHash,
        promptHash: currentPromptHash,
        ...(plan.previousSceneId ? { previousSceneId: plan.previousSceneId } : {}),
        materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
        ...(validationIssues.length > 0
          ? { validationIssueCodes: validationIssues.map((issue) => issue.code) }
          : {}),
        characterIds: spec.characters.map((character) => character.characterId),
        referenceImages: referenceImagesSummary,
        model: providerRequest.model,
        size: providerRequest.size,
        quality: providerRequest.quality,
        outputPath,
        status: "failed",
        attempts: 0,
        error: { message: validationFailures.join("; "), retryable: false },
      };
      await writeManifest(manifestPath, manifest);
      await writeGenerationCheckpoint(episodeDir, {
        sceneId: plan.scene.id,
        status: "validation_failed",
        outputPath,
        promptHash: currentPromptHash,
        visualPlanHash: currentVisualPlanHash,
        cacheDecision: "validation-failed",
        details: [...validationFailures],
        recordedAt: new Date().toISOString(),
      });
      await writeGenerationFailure(episodeDir, {
        sceneId: plan.scene.id,
        stage: "visual-planning",
        category: "prompt-validation-error",
        outputPath,
        promptHash: currentPromptHash,
        message: validationFailures.join("; "),
        retryable: false,
        attempts: 0,
        recordedAt: new Date().toISOString(),
      });
      results.push({
        episodeId,
        sceneId: plan.scene.id,
        manifestPath,
        outputPath,
        status: "failed",
      });
      previousResolvedOutput = undefined;
      currentImageRunLength = 0;
      continue;
    }
    let referenceImages: ReferenceImage[];
    try {
      ({ referenceImages } = await loadReferenceImages(
        episodeDir,
        registry,
        spec,
        settings,
        options?.client
      ));
    } catch (error) {
      const message = formatError(error);
      const errorCode = parseErrorCode(error);
      const manifest: SceneGenerationManifest = {
        sceneId: plan.scene.id,
        promptVersion: providerRequest.promptVersion,
        sceneHash: currentSceneHash,
        visualPlanHash: currentVisualPlanHash,
        renderability: visualPlanArtifact.renderability,
        finalPrompt: prompt,
        providerRequestHash: currentProviderRequestHash,
        promptHash: currentPromptHash,
        ...(plan.previousSceneId ? { previousSceneId: plan.previousSceneId } : {}),
        materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
        ...(validationIssues.length > 0
          ? { validationIssueCodes: validationIssues.map((issue) => issue.code) }
          : {}),
        characterIds: spec.characters.map((character) => character.characterId),
        referenceImages: referenceImagesSummary,
        model: providerRequest.model,
        size: providerRequest.size,
        quality: providerRequest.quality,
        outputPath,
        status: "failed",
        attempts: 0,
        error: { message, retryable: false },
      };
      await writeManifest(manifestPath, manifest);
      await writeGenerationCheckpoint(episodeDir, {
        sceneId: plan.scene.id,
        status: "provider_failed",
        outputPath,
        promptHash: currentPromptHash,
        visualPlanHash: currentVisualPlanHash,
        cacheDecision: "provider-failed",
        details: [message],
        recordedAt: new Date().toISOString(),
      });
      await writeGenerationFailure(episodeDir, {
        sceneId: plan.scene.id,
        stage: "reference-resolution",
        category: "character-continuity-error",
        outputPath,
        promptHash: currentPromptHash,
        ...(errorCode ? { code: errorCode } : {}),
        message,
        retryable: false,
        attempts: 0,
        recordedAt: new Date().toISOString(),
      });
      results.push({
        episodeId,
        sceneId: plan.scene.id,
        manifestPath,
        outputPath,
        status: "failed",
      });
      previousResolvedOutput = undefined;
      currentImageRunLength = 0;
      continue;
    }
    await writeProviderRequestArtifact(
      episodeDir,
      plan.scene.id,
      buildProviderRequestArtifact({
        request: providerRequest,
      })
    );
    await writeGenerationCheckpoint(episodeDir, {
      sceneId: plan.scene.id,
      status: "provider_requested",
      outputPath,
      promptHash: currentPromptHash,
      visualPlanHash: currentVisualPlanHash,
      cacheDecision: "provider-requested",
      details: ["provider request persisted"],
      recordedAt: new Date().toISOString(),
    });
    let generation:
      | Awaited<ReturnType<typeof generator.generate>>
      | undefined;
    try {
      generation = await generator.generate({
        providerRequest,
        referenceImages,
      });
    } catch (error) {
      const errorCode = parseErrorCode(error);
      const manifest: SceneGenerationManifest = {
        sceneId: plan.scene.id,
        promptVersion: providerRequest.promptVersion,
        sceneHash: currentSceneHash,
        visualPlanHash: currentVisualPlanHash,
        renderability: visualPlanArtifact.renderability,
        finalPrompt: prompt,
        providerRequestHash: currentProviderRequestHash,
        promptHash: currentPromptHash,
        ...(plan.previousSceneId ? { previousSceneId: plan.previousSceneId } : {}),
        materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
        ...(validationIssues.length > 0
          ? { validationIssueCodes: validationIssues.map((issue) => issue.code) }
          : {}),
        characterIds: spec.characters.map((character) => character.characterId),
        referenceImages: referenceImagesSummary,
        model: providerRequest.model,
        size: providerRequest.size,
        quality: providerRequest.quality,
        outputPath,
        status: "failed",
        attempts: 0,
        error: {
          message: formatError(error),
          retryable: isRetryableError(error),
        },
      };
      await writeManifest(manifestPath, manifest);
      await writeGenerationCheckpoint(episodeDir, {
        sceneId: plan.scene.id,
        status: "provider_failed",
        outputPath,
        promptHash: currentPromptHash,
        visualPlanHash: currentVisualPlanHash,
        cacheDecision: "provider-failed",
        details: [formatError(error)],
        recordedAt: new Date().toISOString(),
      });
      await writeGenerationFailure(episodeDir, {
        sceneId: plan.scene.id,
        stage: "provider",
        category: classifyFailure({
          stage: "provider",
          error,
          retryable: isRetryableError(error),
        }),
        outputPath,
        promptHash: currentPromptHash,
        ...(errorCode ? { code: errorCode } : {}),
        message: formatError(error),
        retryable: isRetryableError(error),
        attempts: 0,
        recordedAt: new Date().toISOString(),
      });
      results.push({
        episodeId,
        sceneId: plan.scene.id,
        manifestPath,
        outputPath,
        status: "failed",
      });
      previousResolvedOutput = undefined;
      currentImageRunLength = 0;
      continue;
    }
    const manifest: SceneGenerationManifest = {
      sceneId: plan.scene.id,
      promptVersion: providerRequest.promptVersion,
      sceneHash: currentSceneHash,
      visualPlanHash: currentVisualPlanHash,
      renderability: visualPlanArtifact.renderability,
      finalPrompt: prompt,
      providerRequestHash: generation.providerRequestHash,
      promptHash: generation.promptHash,
      ...(plan.previousSceneId ? { previousSceneId: plan.previousSceneId } : {}),
      materialDifferencesFromPrevious: plan.materialDifferencesFromPrevious,
      ...(validationIssues.length > 0
        ? { validationIssueCodes: validationIssues.map((issue) => issue.code) }
        : {}),
      characterIds: spec.characters.map((character) => character.characterId),
      referenceImages: referenceImagesSummary,
      model: generation.model,
      size: generation.size,
      quality: generation.quality,
      outputPath,
      ...(generation?.outputSha256
        ? { outputSha256: generation.outputSha256 }
        : {}),
      status: "generated",
      attempts: generation?.attempts ?? 0,
      generatedAt: new Date().toISOString(),
    };
    await writeManifest(manifestPath, manifest);
    await writeProviderResponseArtifact(
      episodeDir,
      plan.scene.id,
      buildProviderResponseArtifact({
        sceneId: plan.scene.id,
        generation,
      })
    );
    await writeGenerationCheckpoint(episodeDir, {
      sceneId: plan.scene.id,
      status: "generated",
      outputPath,
      promptHash: generation.promptHash,
      visualPlanHash: currentVisualPlanHash,
      cacheDecision: "generated",
      details: ["provider response persisted"],
      recordedAt: new Date().toISOString(),
    });
    if (pendingMergeWithNextScenes.length > 0) {
      const pendingResults = await materializePendingMergeWithNextScenes({
        pendingScenes: pendingMergeWithNextScenes,
        sourceSceneId: plan.scene.id,
        sourceOutputPath: outputPath,
        sourceOutputSha256:
          generation.outputSha256 ?? (await hashFile(outputPath)),
        generator,
        episodeDir,
        registry,
        settings,
        ...(options?.client ? { client: options.client } : {}),
      });
      results.push(...pendingResults);
      currentImageRunLength = Math.min(3, pendingMergeWithNextScenes.length + 1);
      pendingMergeWithNextScenes = [];
    }
    results.push({
      episodeId,
      sceneId: plan.scene.id,
      manifestPath,
      outputPath,
      ...(generation?.outputSha256
        ? { outputSha256: generation.outputSha256 }
        : {}),
      status: "generated",
    });
    previousResolvedOutput = {
      sceneId: plan.scene.id,
      outputPath,
    };
    currentImageRunLength = 1;
  }
  if (pendingMergeWithNextScenes.length > 0) {
    results.push(
      ...(await materializePendingMergeWithNextScenes({
        pendingScenes: pendingMergeWithNextScenes,
        generator,
        episodeDir,
        registry,
        settings,
        ...(options?.client ? { client: options.client } : {}),
      }))
    );
  }
  return results;
}

export async function syncEpisodeSharedImageAssets(
  episodeDir: string,
  episodeId: string,
  options?: SyncEpisodeSharedImageAssetsOptions
): Promise<SyncEpisodeSharedImageAssetsResult> {
  const includeGeneratedImages = options?.includeGeneratedImages ?? true;
  const includeCharacterReferences = options?.includeCharacterReferences ?? true;
  const copiedGeneratedImages: string[] = [];
  const copiedCharacterReferences: string[] = [];
  const missingGeneratedSources: string[] = [];
  const missingCharacterSources: string[] = [];
  let skippedGeneratedImages = 0;
  let skippedCharacterReferences = 0;

  if (includeGeneratedImages) {
    const manifestsDir = path.join(episodeDir, "state", "image-generation", "manifests");
    const stateImagesDir = path.join(episodeDir, "state", "image-generation", "images");
    const manifestFiles = await fsPromises
      .readdir(manifestsDir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of manifestFiles) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const manifestPath = path.join(manifestsDir, entry.name);
      const manifest = await readJsonIfExists(manifestPath, (value) =>
        manifestSchema.parse(value) as unknown as SceneGenerationManifest
      );
      if (!manifest || !manifest.outputPath) {
        continue;
      }
      const sourcePath = path.join(stateImagesDir, `${manifest.sceneId}.png`);
      if (!(await fileExists(sourcePath))) {
        missingGeneratedSources.push(sourcePath);
        continue;
      }
      if (await fileExists(manifest.outputPath)) {
        skippedGeneratedImages += 1;
        continue;
      }
      await copyAtomic(sourcePath, manifest.outputPath);
      copiedGeneratedImages.push(manifest.outputPath);
    }
  }

  if (includeCharacterReferences) {
    const preferredCharacterRefDir = path.join(
      episodeDir,
      "shared",
      "images",
      "character-references"
    );
    const backupCharacterRefDir = path.join(
      episodeDir,
      "shared",
      "images.bak",
      "character-references"
    );
    const sourceDir = (await fileExists(preferredCharacterRefDir))
      ? preferredCharacterRefDir
      : backupCharacterRefDir;
    const characterFiles = await fsPromises
      .readdir(sourceDir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of characterFiles) {
      if (!entry.isFile()) continue;
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(preferredCharacterRefDir, entry.name);
      if (!(await fileExists(sourcePath))) {
        missingCharacterSources.push(sourcePath);
        continue;
      }
      if (await fileExists(targetPath)) {
        skippedCharacterReferences += 1;
        continue;
      }
      await copyAtomic(sourcePath, targetPath);
      copiedCharacterReferences.push(targetPath);
    }
  }

  return {
    episodeId,
    copiedGeneratedImages: copiedGeneratedImages.length,
    copiedCharacterReferences: copiedCharacterReferences.length,
    skippedGeneratedImages,
    skippedCharacterReferences,
    missingGeneratedSources,
    missingCharacterSources,
    generatedImagePaths: copiedGeneratedImages,
    characterReferencePaths: copiedCharacterReferences,
  };
}

export async function loadEpisodeSceneManifest(
  episodeDir: string,
  sceneId: string
): Promise<SceneGenerationManifest | null> {
  return readManifest(resolveEpisodeImageManifestPath(episodeDir, sceneId));
}

export async function upsertCharacterRegistry(
  episodeDir: string,
  episodeId: string,
  characters: CharacterDefinition[]
): Promise<CharacterRegistry> {
  const registry: CharacterRegistry = {
    episodeId,
    characters,
    updatedAt: new Date().toISOString(),
  };
  await saveRegistry(episodeDir, registry);
  return registry;
}
