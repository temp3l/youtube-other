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
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  readJsonIfExists,
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
  prohibitedElements: string[];
  allowMatchingComposition?: boolean;
  matchingCompositionReason?: string;
}

export interface ReferenceImage {
  characterId: CharacterId;
  filePath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface ImageGenerationRequest {
  scene: SceneVisualSpec;
  prompt: string;
  referenceImages: ReferenceImage[];
  outputPath: string;
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
  finalPrompt: string;
  promptHash: string;
  previousSceneId?: string;
  materialDifferencesFromPrevious: string[];
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
  finalPrompt: z.string(),
  promptHash: z.string(),
  previousSceneId: z.string().optional(),
  materialDifferencesFromPrevious: z.array(z.string()),
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

const shotRotation: ShotSize[] = [
  "wide",
  "medium",
  "medium-wide",
  "medium-close-up",
  "close-up",
  "insert",
  "extreme-close-up",
  "extreme-wide",
];

const cameraRotation: CameraAngle[] = [
  "eye-level",
  "over-the-shoulder",
  "low-angle",
  "high-angle",
  "profile",
  "rear-three-quarter",
  "point-of-view",
  "top-down",
];

const supportedImageSizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);

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

function jaccard(left: string, right: string): number {
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

function sceneManifestPath(episodeDir: string, sceneId: string): string {
  return path.join(
    episodeDir,
    "generated-assets",
    "image-manifests",
    `${sceneId}.json`
  );
}

function scenePromptPath(episodeDir: string, sceneId: string): string {
  return path.join(episodeDir, "generated-assets", "prompts", `${sceneId}.txt`);
}

function sceneOutputPath(episodeDir: string, sceneId: string): string {
  return path.join(episodeDir, "generated-assets", "images", `${sceneId}.png`);
}

function registryPath(episodeDir: string): string {
  return path.join(episodeDir, "characters.json");
}

function referencePath(episodeDir: string, characterId: string): string {
  return path.join(
    episodeDir,
    "generated-assets",
    "character-references",
    `${characterId}.png`
  );
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

function deriveShotSize(scene: Scene, previous?: SceneVisualSpec): ShotSize {
  const direct = scene.cameraFraming.toLowerCase();
  if (direct.includes("extreme-wide")) return "extreme-wide";
  if (direct.includes("wide")) return "wide";
  if (direct.includes("medium close")) return "medium-close-up";
  if (direct.includes("close")) return "close-up";
  if (direct.includes("insert")) return "insert";
  if (previous) {
    const index = shotRotation.indexOf(previous.shotSize);
    return shotRotation[(index + 1) % shotRotation.length] ?? "medium";
  }
  return scene.sequenceNumber % 2 === 0 ? "medium-close-up" : "medium";
}

function deriveCameraAngle(
  scene: Scene,
  previous?: SceneVisualSpec
): CameraAngle {
  const source = `${scene.composition} ${scene.cameraFraming}`.toLowerCase();
  if (source.includes("over-the-shoulder")) return "over-the-shoulder";
  if (source.includes("pov") || source.includes("point of view"))
    return "point-of-view";
  if (source.includes("top")) return "top-down";
  if (source.includes("profile")) return "profile";
  if (source.includes("high")) return "high-angle";
  if (source.includes("low")) return "low-angle";
  if (previous) {
    const index = cameraRotation.indexOf(previous.cameraAngle);
    return cameraRotation[(index + 1) % cameraRotation.length] ?? "eye-level";
  }
  return "eye-level";
}

function deriveVisibleAction(scene: Scene): string {
  if (!isGenericText(scene.action)) return normalizeSentence(scene.action);
  const narration = normalizeSentence(scene.canonicalNarration);
  return narration.length > 0 ? narration : "reacts to an unseen disturbance";
}

function deriveFocalSubject(scene: Scene): string {
  if (!isGenericText(scene.subject)) return normalizeSentence(scene.subject);
  const narration = normalizeSentence(scene.canonicalNarration);
  if (narration.length > 0) return narration;
  return "the central figure";
}

function deriveEnvironment(scene: Scene): string {
  if (!isGenericText(scene.setting)) return normalizeSentence(scene.setting);
  const narration = normalizeSentence(scene.canonicalNarration);
  if (narration.length > 0) {
    return `a grounded environment suggested by ${extractAnchor(narration, "the narration")}`;
  }
  return "a grounded cinematic environment";
}

function deriveForeground(scene: Scene): string {
  const anchor = extractAnchor(scene.canonicalNarration, "evidence");
  return scene.sequenceNumber % 2 === 0
    ? `foreground evidence related to ${anchor}`
    : `subtle foreground detail related to ${anchor}`;
}

function deriveBackground(scene: Scene): string {
  const anchor = extractAnchor(scene.canonicalNarration, "background tension");
  return `background context reinforcing ${anchor}`;
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

function inferCharactersForScene(
  scene: Scene,
  registry: CharacterRegistry
): SceneCharacterUsage[] {
  const haystack =
    `${scene.canonicalNarration} ${scene.subject} ${scene.action} ${scene.setting}`.toLowerCase();
  const usages: SceneCharacterUsage[] = [];
  for (const character of registry.characters) {
    const needle = character.name.toLowerCase();
    const role = character.role.toLowerCase();
    if (haystack.includes(needle) || haystack.includes(role)) {
      usages.push({
        characterId: character.id,
        expression: haystack.includes("reaction") ? "tense" : undefined,
        visibleFeatures: character.continuityTraits.slice(0, 3),
      } as SceneCharacterUsage);
    }
  }
  return usages;
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
  const characters = inferCharactersForScene(scene, registry);
  return {
    sceneId: scene.id,
    sequenceNumber: scene.sequenceNumber,
    narrativePurpose: deriveNarrativePurpose(scene),
    focalSubject: deriveFocalSubject(scene),
    visibleAction: deriveVisibleAction(scene),
    environment: deriveEnvironment(scene),
    foreground: deriveForeground(scene),
    background: deriveBackground(scene),
    shotSize: deriveShotSize(scene, previous),
    cameraAngle: deriveCameraAngle(scene, previous),
    ...(scene.sequenceNumber % 3 === 0
      ? { cameraMovementImpression: "subtle handheld documentary drift" }
      : {}),
    sourceNarration: scene.canonicalNarration,
    textRequirement: scene.textRequirement,
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
    prohibitedElements: buildProhibitedElements(scene),
  } as SceneVisualSpec;
}

export function diffSpec(
  previous: SceneVisualSpec | undefined,
  current: SceneVisualSpec
): string[] {
  if (!previous)
    return ["opening scene establishes the episode's visual baseline"];
  const diffs: string[] = [];
  if (previous.narrativePurpose !== current.narrativePurpose)
    diffs.push(
      `narrative purpose changes from ${previous.narrativePurpose} to ${current.narrativePurpose}`
    );
  if (previous.focalSubject !== current.focalSubject)
    diffs.push(
      `focal subject changes from ${previous.focalSubject} to ${current.focalSubject}`
    );
  if (previous.visibleAction !== current.visibleAction)
    diffs.push(
      `visible action changes from ${previous.visibleAction} to ${current.visibleAction}`
    );
  if (previous.shotSize !== current.shotSize)
    diffs.push(
      `shot size changes from ${previous.shotSize} to ${current.shotSize}`
    );
  if (previous.cameraAngle !== current.cameraAngle)
    diffs.push(
      `camera angle changes from ${previous.cameraAngle} to ${current.cameraAngle}`
    );
  if (previous.composition !== current.composition)
    diffs.push("composition changes to a different visual arrangement");
  if (previous.environment !== current.environment)
    diffs.push(
      `environment changes from ${previous.environment} to ${current.environment}`
    );
  if (previous.foreground !== current.foreground)
    diffs.push("foreground emphasis changes");
  if (previous.lighting !== current.lighting) diffs.push("lighting changes");
  if (previous.timeOfDay !== current.timeOfDay)
    diffs.push(
      `time of day changes from ${previous.timeOfDay} to ${current.timeOfDay}`
    );
  if (previous.distinctiveAnchor !== current.distinctiveAnchor)
    diffs.push("distinctive anchor changes");
  return diffs;
}

export function rewriteForDifference(
  current: SceneVisualSpec,
  previous: SceneVisualSpec
): SceneVisualSpec {
  const rewritten = { ...current };
  if (rewritten.shotSize === previous.shotSize) {
    const currentIndex = shotRotation.indexOf(previous.shotSize);
    rewritten.shotSize =
      shotRotation[(currentIndex + 1) % shotRotation.length] ?? "medium";
  }
  if (rewritten.cameraAngle === previous.cameraAngle) {
    const currentIndex = cameraRotation.indexOf(previous.cameraAngle);
    rewritten.cameraAngle =
      cameraRotation[(currentIndex + 1) % cameraRotation.length] ?? "eye-level";
  }
  if (rewritten.visibleAction === previous.visibleAction) {
    rewritten.visibleAction = `${rewritten.visibleAction} while emphasizing ${extractAnchor(current.distinctiveAnchor, "a new detail")}`;
  }
  if (rewritten.focalSubject === previous.focalSubject) {
    rewritten.focalSubject = `${rewritten.focalSubject} in a different pose`;
  }
  if (rewritten.composition === previous.composition) {
    rewritten.composition =
      "reframed to place the subject off-center with stronger visual tension";
  }
  return rewritten;
}

export function validateSceneVisualSpec(
  current: SceneVisualSpec,
  previousPrompt?: string,
  previous?: SceneVisualSpec
): string[] {
  const failures: string[] = [];
  if (isGenericText(current.focalSubject))
    failures.push("focal subject is too generic");
  if (
    isGenericText(current.visibleAction) ||
    current.visibleAction.toLowerCase().includes("shown")
  )
    failures.push("visible action is too generic or uses shown");
  if (isGenericText(current.environment))
    failures.push("environment is too generic");
  if (isGenericText(current.distinctiveAnchor))
    failures.push("distinctive anchor is missing");
  if (
    current.shotSize === previous?.shotSize &&
    current.cameraAngle === previous?.cameraAngle
  )
    failures.push("scene repeats the previous shot size and camera angle");
  if (
    previous &&
    current.focalSubject === previous.focalSubject &&
    current.visibleAction === previous.visibleAction
  )
    failures.push(
      "scene repeats the previous focal subject and visible action"
    );
  if (
    previousPrompt &&
    jaccard(previousPrompt, buildPromptFromSpec(current, previous)) > 0.7
  ) {
    failures.push("prompt is overly similar to the previous prompt");
  }
  return failures;
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

export function buildPromptFromSpec(
  spec: SceneVisualSpec,
  previous?: SceneVisualSpec,
  registry?: CharacterRegistry
): string {
  const characterLookup = new Map(
    (registry?.characters ?? []).map(
      (character) => [character.id, character] as const
    )
  );
  const referenceText =
    spec.characters.length === 0
      ? "No recurring characters are required for this shot. Keep the cast limited to unnamed background figures only if the scene needs them."
      : spec.characters
          .map((usage) => {
            const character = characterLookup.get(usage.characterId);
            if (!character)
              return `Use the approved reference image for character \`${usage.characterId}\` and preserve identity continuity.`;
            return buildCharacterIdentitySection(character, usage);
          })
          .join(" ");

  const differences = diffSpec(previous, spec);

  return [
    promptSection(
      "IMAGE TYPE AND STYLE",
      "Photorealistic cinematic horror documentary still, grounded realism, believable human anatomy, 16:9, no illustration, no collage, no stylized cartoon look."
    ),
    promptSection(
      "PRIMARY VISUAL EVENT",
      `${spec.sourceNarration}. ${spec.focalSubject}. ${spec.visibleAction}. ${spec.characters.length === 0 ? "Focus on visible evidence, reaction, or environmental consequence rather than narration." : ""}`
    ),
    promptSection("NARRATION BEAT", spec.sourceNarration),
    promptSection(
      "TEXT REQUIREMENT",
      buildSceneTextPromptSection(spec.textRequirement)
    ),
    promptSection("CHARACTER IDENTITY AND CONTINUITY", referenceText),
    promptSection(
      "ENVIRONMENT",
      `${spec.environment}. Foreground: ${spec.foreground}. Background: ${spec.background}.`
    ),
    promptSection(
      "CAMERA AND COMPOSITION",
      `${spec.shotSize} shot, ${spec.cameraAngle} angle${spec.cameraMovementImpression ? `, ${spec.cameraMovementImpression}` : ""}. ${spec.composition}.`
    ),
    promptSection(
      "LIGHTING AND COLOR",
      `${spec.lighting}. Time of day: ${spec.timeOfDay}. Mood: ${spec.mood}.`
    ),
    promptSection("DISTINCTIVE SCENE ANCHOR", spec.distinctiveAnchor),
    promptSection(
      "CONTINUITY REQUIREMENTS",
      spec.continuityElements.length > 0
        ? spec.continuityElements.join(" ")
        : "Maintain episode-level continuity for wardrobe, setting logic, and character identity where applicable."
    ),
    promptSection(
      "EXPLICIT DIFFERENCES FROM PREVIOUS SCENE",
      differences.length > 0
        ? differences.map((entry) => `- ${entry}`).join("\n")
        : "This is the opening scene; establish a fresh visual baseline."
    ),
    promptSection(
      "EXCLUSIONS",
      buildSceneNegativePrompt(spec.textRequirement, spec.prohibitedElements)
    ),
  ].join("\n\n");
}

export function validatePrompt(
  prompt: string,
  current: SceneVisualSpec,
  previousPrompt?: string,
  previous?: SceneVisualSpec
): string[] {
  const failures: string[] = [];
  if (isGenericText(current.sourceNarration))
    failures.push("narration beat is too generic");
  if (current.focalSubject.length === 0 || isGenericText(current.focalSubject))
    failures.push("prompt does not identify a concrete visible subject");
  if (
    current.visibleAction.toLowerCase().includes("shown") ||
    current.visibleAction.length === 0
  )
    failures.push("prompt uses shown or otherwise generic action");
  if (isGenericText(current.environment))
    failures.push("prompt uses a generic setting");
  if (isGenericText(current.distinctiveAnchor))
    failures.push("prompt lacks a distinctive visual anchor");
  if (/rough ink collage/i.test(prompt) && /photorealistic/i.test(prompt))
    failures.push("prompt contains contradictory style directions");
  const hasBlanketNoText = /do not include captions, subtitles, labels, logos, watermarks, or readable text/i.test(
    prompt
  );
  const hasExactRequiredText = requiresSceneText(current.textRequirement)
    ? prompt.includes(current.textRequirement.text)
    : false;
  if (requiresSceneText(current.textRequirement)) {
    if (!hasExactRequiredText) {
      failures.push(
        `required_text_missing: prompt must render exactly ${JSON.stringify(current.textRequirement.text)}`
      );
    }
    if (hasBlanketNoText) {
      failures.push(
        "blanket_no_text_instruction: prompt cannot ban readable text when the scene requires it"
      );
    }
  } else {
    if (!hasBlanketNoText && !/no readable text|no captions|no subtitles|no labels/i.test(prompt)) {
      failures.push(
        "blanket_no_text_instruction_missing: prompt should discourage readable text for ordinary scenes"
      );
    }
  }
  if (
    previous &&
    current.focalSubject === previous.focalSubject &&
    current.visibleAction === previous.visibleAction &&
    current.cameraAngle === previous.cameraAngle
  )
    failures.push(
      "prompt repeats the previous scene's camera, action, and dominant subject"
    );
  const promptTokens = tokenSet(prompt);
  if (promptTokens.size > 0 && previousPrompt) {
    const previousTokens = tokenSet(previousPrompt);
    let overlap = 0;
    for (const token of promptTokens) {
      if (previousTokens.has(token)) overlap += 1;
    }
    const ratio = overlap / Math.max(promptTokens.size, previousTokens.size);
    if (ratio > 0.7)
      failures.push("prompt overlaps too much with the previous prompt");
  }
  if (
    /whisper|sound|audio/i.test(prompt) &&
    !/waveform|reaction|device|recording/i.test(prompt)
  ) {
    failures.push("prompt mentions non-visual sound without visible evidence");
  }
  return failures;
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
    registryPath(episodeDir),
    (value) => registrySchema.parse(value) as unknown as CharacterRegistry
  );
  if (existing) return existing;
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
  await writeJsonAtomic(registryPath(episodeDir), registry);
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
    const promptHash = hashText(request.prompt);
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
      prompt: request.prompt,
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
        const outputSha256 = await atomicWriteImage(request.outputPath, b64);
        const referenceHashes = await Promise.all(
          request.referenceImages.map(async (reference) => ({
            characterId: reference.characterId,
            sha256: await hashFile(reference.filePath),
          }))
        );
        await validateImageFile(request.outputPath);
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
          sceneId: request.scene.sceneId,
          outputPath: request.outputPath,
          model: this.settings.model,
          generationMode,
          attempts,
          ...(request_id ? { requestId: request_id } : {}),
          promptHash,
          outputSha256,
          costMicros: cost.costMicros,
        });
        return {
          outputPath: request.outputPath,
          outputSha256,
          model: this.settings.model,
          size: this.settings.resolvedSize,
          quality: this.settings.quality,
          generationMode,
          attempts,
          durationMs: Date.now() - start,
          ...(request_id ? { requestId: request_id } : {}),
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
    character.referenceImagePath ?? referencePath(episodeDir, character.id);
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
    prompt,
    referenceImages: [],
    outputPath: filePath,
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
      character.referenceImagePath ?? referencePath(episodeDir, character.id);
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
      character.referenceImagePath ?? referencePath(episodeDir, character.id);
    summaries.push({
      characterId: character.id,
      path: filePath,
      sha256: (await hashFile(filePath).catch(() => "")) ?? "",
    });
  }
  return summaries;
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

export interface EpisodeImagePlanResult {
  episodeId: string;
  sceneId: string;
  prompt: string;
  promptHash: string;
  manifestPath: string;
  validationFailures: string[];
  materialDifferencesFromPrevious: string[];
  characterIds: CharacterId[];
  referenceImages: Array<{
    characterId: CharacterId;
    path: string;
    sha256: string;
  }>;
}

export interface EpisodeImageGenerationResult {
  episodeId: string;
  sceneId: string;
  manifestPath: string;
  outputPath: string;
  outputSha256?: string;
  status: "generated" | "failed" | "skipped";
}

export async function planEpisodeImageGeneration(
  episodeDir: string,
  episodeId: string,
  scenePlan: ScenePlan,
  settings: EpisodeImagePipelineSettings,
  options?: { sceneId?: string; client?: OpenAI }
): Promise<EpisodeImagePlanResult[]> {
  const registry = await loadRegistry(episodeDir, episodeId);
  await ensureDir(path.join(episodeDir, "generated-assets", "image-manifests"));
  await ensureDir(path.join(episodeDir, "generated-assets", "prompts"));
  const scenes = options?.sceneId
    ? scenePlan.scenes.filter((scene) => scene.id === options.sceneId)
    : scenePlan.scenes;
  const results: EpisodeImagePlanResult[] = [];
  let previousSpec: SceneVisualSpec | undefined;
  let previousPrompt: string | undefined;
  for (const scene of scenes) {
    let spec = buildSceneVisualSpec(scene, registry, previousSpec);
    if (previousSpec) {
      const diffs = diffSpec(previousSpec, spec);
      if (diffs.length < 3 && !spec.allowMatchingComposition) {
        spec = rewriteForDifference(spec, previousSpec);
      }
    }
    const prompt = buildPromptFromSpec(spec, previousSpec, registry);
    const validationFailures = validatePrompt(
      prompt,
      spec,
      previousPrompt,
      previousSpec
    );
    const referenceImagesSummary = await summarizeReferenceImages(
      episodeDir,
      registry,
      spec
    );
    await loadReferenceImages(
      episodeDir,
      registry,
      spec,
      settings,
      options?.client
    ).catch((error) => {
      validationFailures.push(formatError(error));
      return {
        referenceImages: [] as ReferenceImage[],
        referenceHashes: referenceImagesSummary.map((entry) => ({
          characterId: entry.characterId,
          sha256: entry.sha256,
        })),
      };
    });
    const manifest: SceneGenerationManifest = {
      sceneId: scene.id,
      promptVersion: 1,
      sceneHash: sceneHash(scene),
      finalPrompt: prompt,
      promptHash: hashText(prompt),
      ...(previousSpec ? { previousSceneId: previousSpec.sceneId } : {}),
      materialDifferencesFromPrevious: diffSpec(previousSpec, spec),
      characterIds: spec.characters.map((character) => character.characterId),
      referenceImages: referenceImagesSummary,
      model: settings.model,
      size: settings.resolvedSize,
      quality: settings.quality,
      outputPath: sceneOutputPath(episodeDir, scene.id),
      status: validationFailures.length > 0 ? "failed" : "planned",
      attempts: 0,
      ...(validationFailures.length > 0
        ? {
            error: { message: validationFailures.join("; "), retryable: false },
          }
        : {}),
    };
    const manifestPath = sceneManifestPath(episodeDir, scene.id);
    await writeManifest(manifestPath, manifest);
    await writeTextAtomic(scenePromptPath(episodeDir, scene.id), `${prompt}\n`);
    results.push({
      episodeId,
      sceneId: scene.id,
      prompt,
      promptHash: manifest.promptHash,
      manifestPath,
      validationFailures,
      materialDifferencesFromPrevious: manifest.materialDifferencesFromPrevious,
      characterIds: manifest.characterIds,
      referenceImages: manifest.referenceImages,
    });
    previousSpec = spec;
    previousPrompt = prompt;
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
  await ensureDir(path.join(episodeDir, "generated-assets", "image-manifests"));
  await ensureDir(path.join(episodeDir, "generated-assets", "images"));
  const scenes = options?.sceneId
    ? scenePlan.scenes.filter((scene) => scene.id === options.sceneId)
    : scenePlan.scenes;
  const force = options?.force ?? settings.force;
  const generator = new OpenAIImageGenerator(settings, options?.client);
  const results: EpisodeImageGenerationResult[] = [];
  let previousSpec: SceneVisualSpec | undefined;
  let previousPrompt: string | undefined;
  for (const scene of scenes) {
    const manifestPath = sceneManifestPath(episodeDir, scene.id);
    const existing = await readManifest(manifestPath);
    const outputPath = sceneOutputPath(episodeDir, scene.id);
    let spec = buildSceneVisualSpec(scene, registry, previousSpec);
    if (previousSpec) {
      const diffs = diffSpec(previousSpec, spec);
      if (diffs.length < 3 && !spec.allowMatchingComposition) {
        spec = rewriteForDifference(spec, previousSpec);
      }
    }
    const prompt = buildPromptFromSpec(spec, previousSpec, registry);
    const currentSceneHash = sceneHash(scene);
    const currentPromptHash = hashText(prompt);
    const validationFailures = validatePrompt(
      prompt,
      spec,
      previousPrompt,
      previousSpec
    );
    const referenceImagesSummary = await summarizeReferenceImages(
      episodeDir,
      registry,
      spec
    );
    if (
      validationFailures.length === 0 &&
      (await canReuseSceneImage({
        existing,
        currentSceneHash,
        currentPromptHash,
        currentReferenceImages: referenceImagesSummary,
        outputPath,
        force,
      }))
    ) {
      results.push({
        episodeId,
        sceneId: scene.id,
        manifestPath,
        outputPath,
        ...(existing?.outputSha256
          ? { outputSha256: existing.outputSha256 }
          : {}),
        status: "skipped",
      });
      previousSpec = spec;
      previousPrompt = prompt;
      continue;
    }
    if (validationFailures.length > 0) {
      const manifest: SceneGenerationManifest = {
        sceneId: scene.id,
        promptVersion: 1,
        sceneHash: currentSceneHash,
        finalPrompt: prompt,
        promptHash: currentPromptHash,
        ...(previousSpec ? { previousSceneId: previousSpec.sceneId } : {}),
        materialDifferencesFromPrevious: diffSpec(previousSpec, spec),
        characterIds: spec.characters.map((character) => character.characterId),
        referenceImages: referenceImagesSummary,
        model: settings.model,
        size: settings.resolvedSize,
        quality: settings.quality,
        outputPath,
        status: "failed",
        attempts: 0,
        error: { message: validationFailures.join("; "), retryable: false },
      };
      await writeManifest(manifestPath, manifest);
      results.push({
        episodeId,
        sceneId: scene.id,
        manifestPath,
        outputPath,
        status: "failed",
      });
      previousSpec = spec;
      previousPrompt = prompt;
      continue;
    }
    const { referenceImages } = await loadReferenceImages(
      episodeDir,
      registry,
      spec,
      settings,
      options?.client
    );
    const generation = await generator.generate({
      scene: spec,
      prompt,
      referenceImages,
      outputPath,
    });
    const manifest: SceneGenerationManifest = {
      sceneId: scene.id,
      promptVersion: 1,
      sceneHash: currentSceneHash,
      finalPrompt: prompt,
      promptHash: generation.promptHash,
      ...(previousSpec ? { previousSceneId: previousSpec.sceneId } : {}),
      materialDifferencesFromPrevious: diffSpec(previousSpec, spec),
      characterIds: spec.characters.map((character) => character.characterId),
      referenceImages: referenceImagesSummary,
      model: generation.model,
      size: generation.size,
      quality: generation.quality,
      outputPath,
      ...(generation.outputSha256
        ? { outputSha256: generation.outputSha256 }
        : {}),
      status: "generated",
      attempts: generation.attempts,
      generatedAt: new Date().toISOString(),
    };
    await writeManifest(manifestPath, manifest);
    results.push({
      episodeId,
      sceneId: scene.id,
      manifestPath,
      outputPath,
      ...(generation.outputSha256
        ? { outputSha256: generation.outputSha256 }
        : {}),
      status: "generated",
    });
    previousSpec = spec;
    previousPrompt = prompt;
  }
  return results;
}

export async function loadEpisodeSceneManifest(
  episodeDir: string,
  sceneId: string
): Promise<SceneGenerationManifest | null> {
  return readManifest(sceneManifestPath(episodeDir, sceneId));
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
