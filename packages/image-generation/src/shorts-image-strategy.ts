import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { type ScenePlan } from "@mediaforge/domain";
import {
  type CharacterRegistry,
  type EpisodeImagePipelineSettings,
  type ImageGenerator,
  type MediaStageDependency,
  type MediaStageIdentity,
  type PreparedImageProviderRequest,
  type SceneVisualSpec,
  buildMediaStageDependency,
  buildSceneVisualSpec,
  buildPromptFromSpec,
  mediaStageDependencySchema,
  mediaStageIdentitySchema,
  OpenAIImageGenerator,
  shortMediaRequirementsSchema,
} from "./episode-image-pipeline.js";
import {
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  resolveEpisodeCharacterRegistryPath,
  resolveEpisodeSharedShortGeneratedImagesDir,
  resolveEpisodeShortsImageManifestPath,
  sceneFilename,
  writeJsonAtomic,
} from "@mediaforge/shared";

export type ShortsImageStrategy =
  | "regenerate"
  | "smart-crop"
  | "pan-and-scan"
  | "blurred-fill";

export interface ShortsImageConfig {
  enabled: boolean;
  keySceneCount: number;
  keySceneRatio?: number;
  portraitWidth: number;
  portraitHeight: number;
  finalWidth: number;
  finalHeight: number;
  reuseLandscapeImages: boolean;
  enablePanAndScan: boolean;
  enableBlurredFallback: boolean;
  forceRegenerateAll: boolean;
  selectionMode?: "first-n" | "importance-based";
  importanceSceneIds?: string[];
}

export interface ShortsScenePlan {
  sceneId: string;
  sequenceNumber: number;
  strategy: ShortsImageStrategy;
  sourceLandscapePath?: string;
  outputPortraitPath: string;
  regenerateReason?: string;
  motion?: {
    mode: "none" | "pan-and-scan";
    startX?: number;
    endX?: number;
    startY?: number;
    endY?: number;
    startZoom?: number;
    endZoom?: number;
  };
}

export interface ShortsSceneManifestEntry {
  sceneId: string;
  sequenceNumber: number;
  stageIdentity?: MediaStageIdentity;
  narrationDependency?: MediaStageDependency;
  parentFullNarrationDependency?: MediaStageDependency;
  aspectRatio?: "9:16";
  imagePlanFingerprint?: string;
  strategy: ShortsImageStrategy;
  sourceImagePath?: string;
  outputImagePath: string;
  reusedExistingImage: boolean;
  regenerated: boolean;
  attemptCount: number;
  status: "success" | "skipped" | "failed";
  error?: string | null;
  sceneHash?: string;
  sourceImageSha256?: string;
  outputImageSha256?: string;
  promptHash?: string;
  generatedAt?: string;
  shortMediaRequirements?: {
    aspectRatio: "9:16";
    safeVerticalComposition: true;
    focalSubjectPlacement: string;
    textSafeArea: string;
    targetSceneCount?: number;
    targetDurationSeconds?: number;
    parentFullFingerprint?: string;
  };
}

export interface ShortsMediaContext {
  readonly identity: MediaStageIdentity;
  readonly narration: MediaStageDependency;
  readonly parentFullNarration?: MediaStageDependency;
  readonly targetDurationSeconds?: number;
}

export interface PreparedShortsImagesResult {
  readonly outputDir: string;
  readonly manifestPath: string;
  readonly entries: ShortsSceneManifestEntry[];
}

export type ShortsBatchStrategy =
  | "native-portrait-generation"
  | "direct-reuse"
  | "deterministic-conversion";

export interface ShortsTransformSettings {
  readonly strategy: Exclude<ShortsImageStrategy, "regenerate">;
  readonly finalWidth: number;
  readonly finalHeight: number;
  readonly motion: ShortsScenePlan["motion"];
}

interface PlannedShortsItemBase {
  readonly sceneId: string;
  readonly sequenceNumber: number;
  readonly sceneHash: string;
  readonly outputPortraitPath: string;
  readonly imagePlanFingerprint: string;
  readonly stageIdentity: MediaStageIdentity;
  readonly narrationDependency: MediaStageDependency;
  readonly parentFullNarrationDependency?: MediaStageDependency;
  readonly shortMediaRequirements: NonNullable<
    ShortsSceneManifestEntry["shortMediaRequirements"]
  >;
  readonly outputExists: boolean;
}

export interface PlannedShortsNativeGenerationItem
  extends PlannedShortsItemBase {
  readonly kind: "native-generation";
  readonly batchStrategy: "native-portrait-generation";
  readonly strategy: "regenerate";
  readonly regenerateReason: string;
  readonly promptHash: string;
  readonly providerRequestHash: string;
  readonly providerRequest: PreparedImageProviderRequest;
  readonly referenceImages: Array<{
    characterId: string;
    filePath: string;
    mimeType: "image/png";
    sha256: string;
  }>;
  readonly dependencyHashes: readonly string[];
}

export interface PlannedShortsReuseItem extends PlannedShortsItemBase {
  readonly kind: "reuse";
  readonly batchStrategy: "direct-reuse";
  readonly strategy: ShortsImageStrategy;
  readonly sourceLandscapePath?: string;
  readonly sourceLandscapeSha256?: string;
  readonly transformSettings: ShortsTransformSettings;
  readonly dependencyHashes: readonly string[];
  readonly cachedEntry: ShortsSceneManifestEntry;
}

export interface PlannedShortsDeterministicTransformItem
  extends PlannedShortsItemBase {
  readonly kind: "deterministic-transform";
  readonly batchStrategy: "deterministic-conversion";
  readonly strategy: Exclude<ShortsImageStrategy, "regenerate">;
  readonly sourceLandscapePath: string;
  readonly sourceLandscapeSha256: string;
  readonly transformSettings: ShortsTransformSettings;
  readonly dependencyHashes: readonly string[];
  readonly promptHash: string;
}

export interface PlannedShortsBlockedItem extends PlannedShortsItemBase {
  readonly kind: "blocked";
  readonly batchStrategy: ShortsBatchStrategy;
  readonly strategy: ShortsImageStrategy;
  readonly sourceLandscapePath?: string;
  readonly sourceLandscapeSha256?: string;
  readonly dependencyHashes: readonly string[];
  readonly error: string;
}

export type PlannedShortsItem =
  | PlannedShortsNativeGenerationItem
  | PlannedShortsReuseItem
  | PlannedShortsDeterministicTransformItem
  | PlannedShortsBlockedItem;

export interface PlannedShortsImageWork {
  readonly items: readonly PlannedShortsItem[];
  readonly counts: {
    readonly nativeGeneration: number;
    readonly deterministicTransforms: number;
    readonly cacheReuse: number;
    readonly blocked: number;
  };
}

export interface ShortsImageAuditResult {
  readonly warnings: string[];
}

interface CharacterRegistryFile {
  episodeId: string;
  characters: CharacterRegistry["characters"];
  updatedAt: string;
}

interface LandscapeMetadataFile {
  normalizedImagePath?: string;
}

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

export const shortsSceneManifestEntrySchema = z.object({
  sceneId: z.string().min(1),
  sequenceNumber: z.number().int().positive(),
  stageIdentity: mediaStageIdentitySchema.optional(),
  narrationDependency: mediaStageDependencySchema.optional(),
  parentFullNarrationDependency: mediaStageDependencySchema.optional(),
  aspectRatio: z.literal("9:16").optional(),
  imagePlanFingerprint: z.string().min(1).optional(),
  strategy: z.enum(["regenerate", "smart-crop", "pan-and-scan", "blurred-fill"]),
  sourceImagePath: z.string().optional(),
  outputImagePath: z.string().min(1),
  reusedExistingImage: z.boolean(),
  regenerated: z.boolean(),
  attemptCount: z.number().int().nonnegative(),
  status: z.enum(["success", "skipped", "failed"]),
  error: z.string().nullable().optional(),
  sceneHash: z.string().optional(),
  sourceImageSha256: z.string().optional(),
  outputImageSha256: z.string().optional(),
  promptHash: z.string().optional(),
  generatedAt: z.string().optional(),
  shortMediaRequirements: shortMediaRequirementsSchema.optional(),
});

function resolveShortsMediaContext(
  episodeId: string,
  scenePlan: ScenePlan,
  context?: ShortsMediaContext
): ShortsMediaContext {
  if (context) {
    return context;
  }
  const parentFingerprint = hashText(`${episodeId}:narration:en:en-US:short`);
  const targetDurationSeconds =
    scenePlan.scenes[scenePlan.scenes.length - 1]?.timing.endSeconds;
  return {
    identity: mediaStageIdentitySchema.parse({
      episodeId,
      language: "en",
      locale: "en-US",
      variant: "short",
      owner: "image-generation",
    }),
    narration: buildMediaStageDependency({
      owner: "narration",
      episodeId,
      language: "en",
      locale: "en-US",
      variant: "short",
      fingerprint: parentFingerprint,
      status: "ready",
    }),
    ...(targetDurationSeconds !== undefined ? { targetDurationSeconds } : {}),
  };
}

function sceneHash(scene: ScenePlan["scenes"][number]): string {
  return hashText(
    JSON.stringify({
      id: scene.id,
      sequenceNumber: scene.sequenceNumber,
      canonicalNarration: scene.canonicalNarration,
      sourceSegmentIds: scene.sourceSegmentIds,
      estimatedDurationSeconds: scene.estimatedDurationSeconds,
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

function normalizeSceneIdPath(scene: ScenePlan["scenes"][number]): string {
  return scene.expectedImageFilenames.find((name) => name.includes("__16x9"))
    ?? scene.expectedImageFilenames[0]
    ?? `${scene.id}.png`;
}

async function resolveLandscapeImagePath(
  scene: ScenePlan["scenes"][number],
  landscapeDir: string
): Promise<string | undefined> {
  const expectedPath = path.join(landscapeDir, normalizeSceneIdPath(scene));
  if (await fileExists(expectedPath)) {
    return expectedPath;
  }
  const candidates = (await fs.readdir(landscapeDir).catch(() => [])).filter(
    (entry) => entry.startsWith(`${scene.id}__`) && entry.endsWith(".png")
  );
  if (candidates.length === 1) {
    return path.join(landscapeDir, candidates[0] ?? "");
  }
  if (candidates.length > 1) {
    const metadataPath = path.join(landscapeDir, "metadata", `${scene.id}.json`);
    if (await fileExists(metadataPath)) {
      try {
        const metadata = JSON.parse(
          await fs.readFile(metadataPath, "utf8")
        ) as LandscapeMetadataFile;
        const normalizedImageName = metadata.normalizedImagePath
          ? path.basename(metadata.normalizedImagePath)
          : undefined;
        if (normalizedImageName && candidates.includes(normalizedImageName)) {
          return path.join(landscapeDir, normalizedImageName);
        }
      } catch {
        // Fall through to the duplicate error below when metadata is unreadable.
      }
    }
    throw new Error(
      `Multiple landscape images found for ${scene.id} in ${landscapeDir}: ${candidates.join(", ")}`
    );
  }
  return undefined;
}

function portraitFilename(scene: ScenePlan["scenes"][number]): string {
  return (
    scene.expectedImageFilenames.find((name) => name.includes("__9x16")) ??
    sceneFilename(
      scene.sequenceNumber,
      scene.timing.startSeconds,
      scene.timing.endSeconds,
      "9:16"
    )
  );
}

function expectedPortraitFilenames(scenePlan: ScenePlan): Set<string> {
  return new Set(scenePlan.scenes.map((scene) => portraitFilename(scene)));
}

async function removeStalePortraitAssets(
  outputDir: string,
  scenePlan: ScenePlan
): Promise<void> {
  const expected = expectedPortraitFilenames(scenePlan);
  const entries = await fs.readdir(outputDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".png") && !expected.has(entry))
      .map(async (entry) => {
        const target = path.join(outputDir, entry);
        await fs.rm(target, { force: true }).catch(() => undefined);
      })
  );
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function resolveKeySceneIds(
  scenePlan: ScenePlan,
  config: ShortsImageConfig
): Set<string> {
  const explicitImportanceIds = config.importanceSceneIds
    ?.map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const ratioTarget =
    typeof config.keySceneRatio === "number" &&
    Number.isFinite(config.keySceneRatio) &&
    config.keySceneRatio > 0
      ? Math.ceil(scenePlan.scenes.length * config.keySceneRatio)
      : 0;
  const keySceneCount = Math.max(
    0,
    Math.min(
      scenePlan.scenes.length,
      Math.max(config.keySceneCount, ratioTarget)
    )
  );

  if (config.selectionMode === "importance-based" && explicitImportanceIds?.length) {
    return new Set(
      explicitImportanceIds.slice(0, keySceneCount)
    );
  }
  if (config.selectionMode === "importance-based") {
    const rankedScenes = [...scenePlan.scenes]
      .map((scene, index) => {
        let score = 0;
        if (index === 0) {
          score += 1000;
        }
        if (index === scenePlan.scenes.length - 1) {
          score += 900;
        }
        if (index === Math.floor(scenePlan.scenes.length / 2)) {
          score += 500;
        }
        if (scene.textRequirement.required) {
          score += 150;
        }
        if (scene.continuityReferences.length === 0) {
          score += 120;
        }
        if (/reveal|final|ending|consequence|question/i.test(scene.visualPurpose)) {
          score += 80;
        }
        score += Math.min(60, Math.round(scene.estimatedDurationSeconds * 10));
        return { sceneId: scene.id, score, sequenceNumber: scene.sequenceNumber };
      })
      .sort(
        (left, right) =>
          right.score - left.score || left.sequenceNumber - right.sequenceNumber
      )
      .slice(0, keySceneCount)
      .map((scene) => scene.sceneId);
    return new Set(rankedScenes);
  }
  return new Set(
    scenePlan.scenes
      .slice(0, keySceneCount)
      .map((scene) => scene.id)
  );
}

function shouldReuseExistingPortrait(args: {
  readonly cached?: ShortsSceneManifestEntry;
  readonly currentSceneHash: string;
  readonly imagePlanFingerprint: string;
  readonly strategy: ShortsImageStrategy;
  readonly outputPortraitPath: string;
}): boolean {
  if (!args.cached || args.cached.status !== "success") {
    return false;
  }
  if (args.cached.outputImagePath !== args.outputPortraitPath) {
    return false;
  }
  return (
    args.cached.imagePlanFingerprint === args.imagePlanFingerprint &&
    args.cached.sceneHash === args.currentSceneHash &&
    args.cached.strategy === args.strategy
  );
}

function buildMotionPlan(index: number, strategy: ShortsImageStrategy) {
  if (strategy !== "pan-and-scan") {
    return { mode: "none" as const };
  }
  const direction = index % 2 === 0 ? 1 : -1;
  return {
    mode: "pan-and-scan" as const,
    startX: direction < 0 ? 0.08 : 0.0,
    endX: direction < 0 ? 0.0 : 0.08,
    startY: 0.0,
    endY: 0.0,
    startZoom: 1.06,
    endZoom: 1.12,
  };
}

async function loadCharacterRegistry(
  episodeDir: string,
  episodeId: string
): Promise<CharacterRegistry> {
  const registryPath = resolveEpisodeCharacterRegistryPath(episodeDir);
  if (!(await fileExists(registryPath))) {
    const legacyRegistryPath = path.join(episodeDir, "characters.json");
    if (await fileExists(legacyRegistryPath)) {
      const parsed = registrySchema.parse(
        JSON.parse(await fs.readFile(legacyRegistryPath, "utf8")) as unknown
      ) as CharacterRegistryFile;
      return parsed;
    }
    return {
      episodeId,
      characters: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const parsed = registrySchema.parse(
    JSON.parse(await fs.readFile(registryPath, "utf8")) as unknown
  ) as CharacterRegistryFile;
  return parsed;
}

async function loadReferenceImages(
  registry: CharacterRegistry,
  usages: ReadonlyArray<SceneVisualSpec["characters"][number]>
): Promise<
  Array<{
    characterId: string;
    filePath: string;
    mimeType: "image/png";
    sha256: string;
  }>
> {
  const references: Array<{
    characterId: string;
    filePath: string;
    mimeType: "image/png";
    sha256: string;
  }> = [];
  const selectedCharacterIds = new Set(usages.map((usage) => usage.characterId));
  for (const character of registry.characters) {
    if (!selectedCharacterIds.has(character.id)) {
      continue;
    }
    if (!character.referenceImagePath) {
      continue;
    }
    if (
      character.referenceStatus !== "approved" &&
      character.referenceStatus !== "generated"
    ) {
      continue;
    }
    if (!(await fileExists(character.referenceImagePath))) {
      continue;
    }
    references.push({
      characterId: character.id,
      filePath: character.referenceImagePath,
      mimeType: "image/png",
      sha256: await hashFile(character.referenceImagePath),
    });
  }
  return references;
}

function buildShortsProviderRequest(args: {
  readonly spec: SceneVisualSpec;
  readonly previous?: SceneVisualSpec;
  readonly registry: CharacterRegistry;
  readonly outputPath: string;
  readonly portraitWidth: number;
  readonly portraitHeight: number;
  readonly referenceImages: Array<{
    characterId: string;
    filePath: string;
    sha256: string;
  }>;
}): PreparedImageProviderRequest {
  const prompt = buildPromptFromSpec(
    args.spec,
    args.previous,
    args.registry,
    "9:16"
  );
  return {
    sceneId: args.spec.sceneId,
    scene: args.spec,
    ...(args.previous ? { previousScene: args.previous } : {}),
    model: "gpt-image-2",
    size: `${args.portraitWidth}x${args.portraitHeight}`,
    quality: "medium",
    outputFormat: "png",
    background: "opaque",
    outputPath: args.outputPath,
    operation:
      args.referenceImages.length > 0 ? "image-edit" : "image-generation",
    aspectRatio: "9:16",
    promptVersion: 1,
    promptProfile: "horror-short",
    referenceImages: args.referenceImages.map((reference) => ({
      characterId: reference.characterId,
      path: reference.filePath,
      sha256: reference.sha256,
    })),
    characterContexts: args.spec.characters.map((usage) => ({
      characterId: usage.characterId,
      usage,
    })),
    prompt,
    promptHash: hashText(prompt),
    providerRequestHash: hashText(
      JSON.stringify({
        operation:
          args.referenceImages.length > 0 ? "image-edit" : "image-generation",
        model: "gpt-image-2",
        size: `${args.portraitWidth}x${args.portraitHeight}`,
        quality: "medium",
        outputFormat: "png",
        background: "opaque",
        promptVersion: 1,
        prompt,
        referenceImages: args.referenceImages.map((reference) => ({
          characterId: reference.characterId,
          sha256: reference.sha256,
        })),
      })
    ),
  };
}

function resolveShortsSceneStrategy(args: {
  readonly scene: ScenePlan["scenes"][number];
  readonly keySceneIds: ReadonlySet<string>;
  readonly config: ShortsImageConfig;
}): {
  readonly shouldRegenerate: boolean;
  readonly strategy: ShortsImageStrategy;
  readonly regenerateReason?: string;
} {
  const shouldRegenerate =
    args.config.forceRegenerateAll ||
    args.keySceneIds.has(args.scene.id) ||
    !args.config.reuseLandscapeImages;
  const strategy: ShortsImageStrategy = shouldRegenerate
    ? "regenerate"
    : args.config.enablePanAndScan
      ? "smart-crop"
      : args.config.enableBlurredFallback
        ? "blurred-fill"
        : "smart-crop";
  return {
    shouldRegenerate,
    strategy,
    ...(shouldRegenerate
      ? {
          regenerateReason: args.config.forceRegenerateAll
            ? "force_regenerate_all"
            : `key_scene_${args.scene.sequenceNumber}`,
        }
      : {}),
  };
}

function buildShortsImagePlanFingerprint(args: {
  readonly narrationFingerprint: string;
  readonly sceneHash: string;
  readonly strategy: ShortsImageStrategy;
  readonly scene: ScenePlan["scenes"][number];
}): string {
  return hashText(
    JSON.stringify({
      narrationFingerprint: args.narrationFingerprint,
      sceneHash: args.sceneHash,
      strategy: args.strategy,
      aspectRatio: "9:16",
      output: portraitFilename(args.scene),
    })
  );
}

async function hasValidPortraitDimensions(
  outputPath: string,
  config: ShortsImageConfig
): Promise<boolean> {
  const metadata = await sharp(outputPath).metadata().catch(() => null);
  return (
    metadata?.width === config.portraitWidth &&
    metadata.height === config.portraitHeight
  );
}

function buildDeterministicTransformPromptHash(args: {
  readonly sceneHash: string;
  readonly sourceLandscapeSha256: string;
  readonly transformSettings: ShortsTransformSettings;
}): string {
  return hashText(
    JSON.stringify({
      sceneHash: args.sceneHash,
      sourceLandscapeSha256: args.sourceLandscapeSha256,
      transformSettings: args.transformSettings,
    })
  );
}

export async function planShortsImageWork(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly scenePlan: ScenePlan;
  readonly config: ShortsImageConfig;
  readonly landscapeDir?: string;
  readonly outputDir?: string;
  readonly context?: ShortsMediaContext;
}): Promise<PlannedShortsImageWork> {
  const outputDir =
    args.outputDir ?? resolveEpisodeSharedShortGeneratedImagesDir(args.episodeDir);
  const manifestPath = resolveEpisodeShortsImageManifestPath(args.episodeDir);
  const existingEntries = new Map(
    (await loadExistingManifest(manifestPath) ?? []).map((entry) => [entry.sceneId, entry] as const)
  );
  const context = resolveShortsMediaContext(
    args.episodeId,
    args.scenePlan,
    args.context
  );
  const registry = await loadCharacterRegistry(args.episodeDir, args.episodeId);
  const keySceneIds = resolveKeySceneIds(args.scenePlan, args.config);
  const destinationOwners = new Map<string, string>();
  const items: PlannedShortsItem[] = [];
  let previousSpec: SceneVisualSpec | undefined;

  for (const [index, scene] of args.scenePlan.scenes.entries()) {
    const outputPortraitPath = path.join(outputDir, portraitFilename(scene));
    const existingOwner = destinationOwners.get(outputPortraitPath);
    if (existingOwner) {
      throw new Error(
        `Duplicate short portrait destination detected for ${scene.id}: ${outputPortraitPath} is already assigned to ${existingOwner}.`
      );
    }
    destinationOwners.set(outputPortraitPath, scene.id);
    const currentSceneHash = sceneHash(scene);
    const landscapePath = args.landscapeDir
      ? await resolveLandscapeImagePath(scene, args.landscapeDir)
      : undefined;
    const sourceLandscapeSha256 =
      landscapePath && (await fileExists(landscapePath))
        ? await hashFile(landscapePath)
        : undefined;
    const resolvedStrategy = resolveShortsSceneStrategy({
      scene,
      keySceneIds,
      config: args.config,
    });
    const imagePlanFingerprint = buildShortsImagePlanFingerprint({
      narrationFingerprint: context.narration.fingerprint,
      sceneHash: currentSceneHash,
      strategy: resolvedStrategy.strategy,
      scene,
    });
    const shortMediaRequirements = {
      aspectRatio: "9:16" as const,
      safeVerticalComposition: true as const,
      focalSubjectPlacement: "center third",
      textSafeArea: "top and bottom 12 percent",
      targetSceneCount: args.scenePlan.scenes.length,
      ...(context.targetDurationSeconds
        ? { targetDurationSeconds: context.targetDurationSeconds }
        : {}),
      ...(context.parentFullNarration
        ? { parentFullFingerprint: context.parentFullNarration.fingerprint }
        : {}),
    };
    const baseItem = {
      sceneId: scene.id,
      sequenceNumber: scene.sequenceNumber,
      sceneHash: currentSceneHash,
      outputPortraitPath,
      imagePlanFingerprint,
      stageIdentity: context.identity,
      narrationDependency: context.narration,
      ...(context.parentFullNarration
        ? { parentFullNarrationDependency: context.parentFullNarration }
        : {}),
      shortMediaRequirements,
      outputExists: await fileExists(outputPortraitPath),
    } satisfies PlannedShortsItemBase;
    const cached = existingEntries.get(scene.id);
    const transformSettings: ShortsTransformSettings = {
      strategy:
        resolvedStrategy.strategy === "regenerate"
          ? "smart-crop"
          : resolvedStrategy.strategy,
      finalWidth: args.config.portraitWidth,
      finalHeight: args.config.portraitHeight,
      motion:
        resolvedStrategy.shouldRegenerate
          ? { mode: "none" as const }
          : args.config.enablePanAndScan
            ? buildMotionPlan(index, "pan-and-scan")
            : { mode: "none" as const },
    };

    if (!resolvedStrategy.shouldRegenerate) {
      const transformStrategy = transformSettings.strategy;
      if (cached && baseItem.outputExists) {
        const validDimensions = await hasValidPortraitDimensions(
          outputPortraitPath,
          args.config
        );
        if (!validDimensions) {
          items.push({
            ...baseItem,
            kind: "blocked",
            batchStrategy: "direct-reuse",
            strategy: resolvedStrategy.strategy,
            ...(landscapePath ? { sourceLandscapePath: landscapePath } : {}),
            ...(sourceLandscapeSha256
              ? { sourceLandscapeSha256 }
              : {}),
            dependencyHashes: [
              context.narration.fingerprint,
              ...(sourceLandscapeSha256 ? [sourceLandscapeSha256] : []),
            ],
            error: `Invalid portrait dimensions for ${scene.id}: expected ${args.config.portraitWidth}x${args.config.portraitHeight}.`,
          });
          previousSpec = buildSceneVisualSpec(scene, registry, previousSpec);
          continue;
        }
        if (
          shouldReuseExistingPortrait({
            cached,
            currentSceneHash,
            imagePlanFingerprint,
            strategy: resolvedStrategy.strategy,
            outputPortraitPath,
          })
        ) {
          items.push({
            ...baseItem,
            kind: "reuse",
            batchStrategy: "direct-reuse",
            strategy: transformStrategy,
            ...(landscapePath ? { sourceLandscapePath: landscapePath } : {}),
            ...(sourceLandscapeSha256
              ? { sourceLandscapeSha256 }
              : {}),
            transformSettings,
            dependencyHashes: [
              context.narration.fingerprint,
              ...(sourceLandscapeSha256 ? [sourceLandscapeSha256] : []),
            ],
            cachedEntry: cached,
          });
          previousSpec = buildSceneVisualSpec(scene, registry, previousSpec);
          continue;
        }
      }
      if (!landscapePath || !sourceLandscapeSha256) {
        items.push({
          ...baseItem,
          kind: "blocked",
          batchStrategy: "deterministic-conversion",
          strategy: transformStrategy,
          dependencyHashes: [context.narration.fingerprint],
          error: `Missing landscape image for ${scene.id}.`,
        });
        previousSpec = buildSceneVisualSpec(scene, registry, previousSpec);
        continue;
      }
      items.push({
        ...baseItem,
        kind: "deterministic-transform",
        batchStrategy: "deterministic-conversion",
        strategy: transformStrategy,
        sourceLandscapePath: landscapePath,
        sourceLandscapeSha256,
        transformSettings,
        dependencyHashes: [context.narration.fingerprint, sourceLandscapeSha256],
        promptHash: buildDeterministicTransformPromptHash({
          sceneHash: currentSceneHash,
          sourceLandscapeSha256,
          transformSettings,
        }),
      });
      previousSpec = buildSceneVisualSpec(scene, registry, previousSpec);
      continue;
    }

    if (cached && baseItem.outputExists) {
      const validDimensions = await hasValidPortraitDimensions(
        outputPortraitPath,
        args.config
      );
      if (!validDimensions) {
        items.push({
          ...baseItem,
          kind: "blocked",
          batchStrategy: "native-portrait-generation",
          strategy: resolvedStrategy.strategy,
          ...(landscapePath ? { sourceLandscapePath: landscapePath } : {}),
          ...(sourceLandscapeSha256 ? { sourceLandscapeSha256 } : {}),
          dependencyHashes: [
            context.narration.fingerprint,
            ...(sourceLandscapeSha256 ? [sourceLandscapeSha256] : []),
          ],
          error: `Invalid portrait dimensions for ${scene.id}: expected ${args.config.portraitWidth}x${args.config.portraitHeight}.`,
        });
        previousSpec = buildSceneVisualSpec(scene, registry, previousSpec);
        continue;
      }
      if (
        shouldReuseExistingPortrait({
          cached,
          currentSceneHash,
          imagePlanFingerprint,
          strategy: resolvedStrategy.strategy,
          outputPortraitPath,
        })
      ) {
        items.push({
          ...baseItem,
          kind: "reuse",
          batchStrategy: "direct-reuse",
          strategy: "regenerate",
          ...(landscapePath ? { sourceLandscapePath: landscapePath } : {}),
          ...(sourceLandscapeSha256 ? { sourceLandscapeSha256 } : {}),
          transformSettings,
          dependencyHashes: [
            context.narration.fingerprint,
            ...(sourceLandscapeSha256 ? [sourceLandscapeSha256] : []),
          ],
          cachedEntry: cached,
        });
        previousSpec = buildSceneVisualSpec(scene, registry, previousSpec);
        continue;
      }
    }

    const spec = buildSceneVisualSpec(scene, registry, previousSpec);
    const referenceImages = await loadReferenceImages(registry, spec.characters);
    const providerRequest = buildShortsProviderRequest({
      spec,
      ...(previousSpec ? { previous: previousSpec } : {}),
      registry,
      outputPath: `${outputPortraitPath}.native.tmp.png`,
      portraitWidth: args.config.portraitWidth,
      portraitHeight: args.config.portraitHeight,
      referenceImages,
    });
    items.push({
      ...baseItem,
      kind: "native-generation",
      batchStrategy: "native-portrait-generation",
      strategy: "regenerate",
      regenerateReason:
        resolvedStrategy.regenerateReason ?? "short_native_generation",
      promptHash: providerRequest.promptHash,
      providerRequestHash: providerRequest.providerRequestHash,
      providerRequest,
      referenceImages,
      dependencyHashes: [
        context.narration.fingerprint,
        ...referenceImages.map((reference) => reference.sha256),
      ],
    });
    previousSpec = spec;
  }

  return {
    items,
    counts: {
      nativeGeneration: items.filter((item) => item.kind === "native-generation")
        .length,
      deterministicTransforms: items.filter(
        (item) => item.kind === "deterministic-transform"
      ).length,
      cacheReuse: items.filter((item) => item.kind === "reuse").length,
      blocked: items.filter((item) => item.kind === "blocked").length,
    },
  };
}

async function normalizePortraitImage(
  sourcePath: string,
  outputPath: string,
  finalWidth: number,
  finalHeight: number,
  strategy: ShortsImageStrategy
): Promise<void> {
  await ensureDir(path.dirname(outputPath));
  if (strategy === "blurred-fill") {
    const base = sharp(sourcePath).resize({
      width: finalWidth,
      height: finalHeight,
      fit: "cover",
      position: "attention",
    });
    const foreground = await sharp(sourcePath)
      .resize({
        width: Math.round(finalWidth * 0.92),
        height: Math.round(finalHeight * 0.92),
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    await base
      .blur(28)
      .composite([{ input: foreground, gravity: "center" }])
      .png()
      .toFile(outputPath);
    return;
  }
  await sharp(sourcePath)
    .resize({
      width: finalWidth,
      height: finalHeight,
      fit: "cover",
      position: "attention",
    })
    .png()
    .toFile(outputPath);
}

async function createNativeVerticalImage(
  generator: OpenAIImageGenerator,
  scene: ScenePlan["scenes"][number],
  previous: SceneVisualSpec | undefined,
  registry: CharacterRegistry,
  outputPath: string,
  portraitWidth: number,
  portraitHeight: number,
  finalWidth: number,
  finalHeight: number
): Promise<{ outputSha256: string; promptHash: string }> {
  const spec = buildSceneVisualSpec(scene, registry, previous);
  const tempPath = `${outputPath}.native.tmp.png`;
  const referenceImages = await loadReferenceImages(registry, spec.characters);
  const result = await generator.generate({
    providerRequest: buildShortsProviderRequest({
      spec,
      ...(previous ? { previous } : {}),
      registry,
      outputPath: tempPath,
      portraitWidth,
      portraitHeight,
      referenceImages,
    }),
    referenceImages,
    context: {
      episodeId: registry.episodeId,
      language: "en",
      profile: "short",
      creatorMedia: { syntheticLikeness: false },
    },
  });
  await normalizePortraitImage(tempPath, outputPath, portraitWidth, portraitHeight, "smart-crop");
  await fs.rm(tempPath, { force: true }).catch(() => undefined);
  return {
    outputSha256: await hashFile(outputPath),
    promptHash: result.promptHash,
  };
}

async function transformLandscapeImage(
  sourcePath: string,
  outputPath: string,
  finalWidth: number,
  finalHeight: number,
  strategy: ShortsImageStrategy
): Promise<void> {
  await normalizePortraitImage(sourcePath, outputPath, finalWidth, finalHeight, strategy);
}

function loadExistingManifest(
  manifestPath: string
): Promise<ShortsSceneManifestEntry[] | null> {
  return fs
    .readFile(manifestPath, "utf8")
    .then((raw) =>
      z.array(shortsSceneManifestEntrySchema).parse(
        JSON.parse(raw) as unknown
      ) as ShortsSceneManifestEntry[]
    )
    .catch(() => null);
}

export function buildShortsImageStrategyPlan(
  scenePlan: ScenePlan,
  config: ShortsImageConfig,
  options?: {
    readonly landscapeDir?: string;
    readonly outputDir?: string;
  }
): ShortsScenePlan[] {
  const keySceneIds = resolveKeySceneIds(scenePlan, config);
  const outputDir = options?.outputDir ?? resolveEpisodeSharedShortGeneratedImagesDir(".");
  return scenePlan.scenes.map((scene, index) => {
    const portraitPath = path.join(outputDir, portraitFilename(scene));
    const sourceLandscapePath = options?.landscapeDir
      ? path.join(options.landscapeDir, normalizeSceneIdPath(scene))
      : undefined;
    const resolvedStrategy = resolveShortsSceneStrategy({
      scene,
      keySceneIds,
      config,
    });
    const plan: ShortsScenePlan = {
      sceneId: scene.id,
      sequenceNumber: scene.sequenceNumber,
      strategy: resolvedStrategy.strategy,
      outputPortraitPath: portraitPath,
      motion:
        !resolvedStrategy.shouldRegenerate && config.enablePanAndScan
          ? buildMotionPlan(index, "pan-and-scan")
          : { mode: "none" as const },
    };
    if (sourceLandscapePath) {
      plan.sourceLandscapePath = sourceLandscapePath;
    }
    if (resolvedStrategy.shouldRegenerate && resolvedStrategy.regenerateReason) {
      plan.regenerateReason = resolvedStrategy.regenerateReason;
    }
    return plan;
  });
}

export async function prepareShortsImageAssets(
  episodeDir: string,
  episodeId: string,
  scenePlan: ScenePlan,
  settings: EpisodeImagePipelineSettings,
  config: ShortsImageConfig,
  options?: {
    readonly landscapeDir?: string;
    readonly outputDir?: string;
    readonly force?: boolean;
    readonly client?: ConstructorParameters<typeof OpenAIImageGenerator>[1];
    readonly generator?: ImageGenerator;
    readonly context?: ShortsMediaContext;
  }
): Promise<PreparedShortsImagesResult> {
  if (!config.enabled) {
    return {
      outputDir:
        options?.outputDir ?? resolveEpisodeSharedShortGeneratedImagesDir(episodeDir),
      manifestPath: resolveEpisodeShortsImageManifestPath(episodeDir),
      entries: [],
    };
  }
  const outputDir =
    options?.outputDir ?? resolveEpisodeSharedShortGeneratedImagesDir(episodeDir);
  const manifestPath = resolveEpisodeShortsImageManifestPath(episodeDir);
  await ensureDir(outputDir);
  await ensureDir(path.dirname(manifestPath));
  await removeStalePortraitAssets(outputDir, scenePlan);
  const generator = options?.generator ?? new OpenAIImageGenerator(settings, options?.client);
  const plan = await planShortsImageWork({
    episodeDir,
    episodeId,
    scenePlan,
    config,
    ...(options?.landscapeDir ? { landscapeDir: options.landscapeDir } : {}),
    outputDir,
    ...(options?.context ? { context: options.context } : {}),
  });
  const entries = await mapWithConcurrency(
    plan.items,
    settings.concurrency,
    async (planned): Promise<ShortsSceneManifestEntry> => {
      try {
      if (planned.kind === "reuse") {
        const entry: ShortsSceneManifestEntry = {
          sceneId: planned.sceneId,
          sequenceNumber: planned.sequenceNumber,
          stageIdentity: planned.stageIdentity,
          narrationDependency: planned.narrationDependency,
          ...(planned.parentFullNarrationDependency
            ? { parentFullNarrationDependency: planned.parentFullNarrationDependency }
            : {}),
          aspectRatio: "9:16",
          imagePlanFingerprint: planned.imagePlanFingerprint,
          strategy: planned.strategy,
          outputImagePath: planned.outputPortraitPath,
          reusedExistingImage: true,
          regenerated: false,
          attemptCount: planned.cachedEntry.attemptCount,
          status: "success",
          error: null,
          sceneHash: planned.sceneHash,
          ...(planned.sourceLandscapeSha256
            ? { sourceImageSha256: planned.sourceLandscapeSha256 }
            : {}),
          outputImageSha256: await hashFile(planned.outputPortraitPath),
          ...(planned.cachedEntry.promptHash
            ? { promptHash: planned.cachedEntry.promptHash }
            : {}),
          ...(planned.cachedEntry.generatedAt
            ? { generatedAt: planned.cachedEntry.generatedAt }
            : {}),
          shortMediaRequirements: planned.shortMediaRequirements,
        };
        const sourceImagePath =
          planned.cachedEntry.sourceImagePath ?? planned.sourceLandscapePath;
        if (sourceImagePath) {
          entry.sourceImagePath = sourceImagePath;
        }
        return entry;
      }

      if (planned.kind === "blocked") {
        throw new Error(planned.error);
      }

      if (planned.kind === "native-generation") {
        const tempPath = planned.providerRequest.outputPath;
        const result = await generator.generate({
          providerRequest: planned.providerRequest,
          referenceImages: planned.referenceImages,
          context: {
            episodeId: planned.stageIdentity.episodeId,
            language: planned.stageIdentity.language,
            profile: planned.stageIdentity.variant,
            creatorMedia: { syntheticLikeness: false },
          },
        });
        await normalizePortraitImage(
          tempPath,
          planned.outputPortraitPath,
          config.portraitWidth,
          config.portraitHeight,
          "smart-crop"
        );
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
        return {
          sceneId: planned.sceneId,
          sequenceNumber: planned.sequenceNumber,
          stageIdentity: planned.stageIdentity,
          narrationDependency: planned.narrationDependency,
          ...(planned.parentFullNarrationDependency
            ? { parentFullNarrationDependency: planned.parentFullNarrationDependency }
            : {}),
          aspectRatio: "9:16",
          imagePlanFingerprint: planned.imagePlanFingerprint,
          strategy: "regenerate",
          outputImagePath: planned.outputPortraitPath,
          reusedExistingImage: false,
          regenerated: true,
          attemptCount: result.attempts,
          status: "success",
          error: null,
          sceneHash: planned.sceneHash,
          outputImageSha256: await hashFile(planned.outputPortraitPath),
          promptHash: result.promptHash,
          generatedAt: new Date().toISOString(),
          shortMediaRequirements: planned.shortMediaRequirements,
        };
      }

      await transformLandscapeImage(
        planned.sourceLandscapePath,
        planned.outputPortraitPath,
        config.portraitWidth,
        config.portraitHeight,
        planned.strategy
      );
      return {
        sceneId: planned.sceneId,
        sequenceNumber: planned.sequenceNumber,
        stageIdentity: planned.stageIdentity,
        narrationDependency: planned.narrationDependency,
        ...(planned.parentFullNarrationDependency
          ? { parentFullNarrationDependency: planned.parentFullNarrationDependency }
          : {}),
        aspectRatio: "9:16",
        imagePlanFingerprint: planned.imagePlanFingerprint,
        strategy: planned.strategy,
        outputImagePath: planned.outputPortraitPath,
        reusedExistingImage: true,
        regenerated: false,
        attemptCount: 1,
        status: "success",
        error: null,
        sceneHash: planned.sceneHash,
        outputImageSha256: await hashFile(planned.outputPortraitPath),
        promptHash: planned.promptHash,
        shortMediaRequirements: planned.shortMediaRequirements,
        sourceImagePath: planned.sourceLandscapePath,
        sourceImageSha256: planned.sourceLandscapeSha256,
      };
    } catch (error) {
      const entry: ShortsSceneManifestEntry = {
        sceneId: planned.sceneId,
        sequenceNumber: planned.sequenceNumber,
        stageIdentity: planned.stageIdentity,
        narrationDependency: planned.narrationDependency,
        ...(planned.parentFullNarrationDependency
          ? { parentFullNarrationDependency: planned.parentFullNarrationDependency }
          : {}),
        aspectRatio: "9:16",
        imagePlanFingerprint: planned.imagePlanFingerprint,
        strategy: planned.strategy,
        outputImagePath: planned.outputPortraitPath,
        reusedExistingImage: planned.kind !== "native-generation",
        regenerated: planned.kind === "native-generation",
        attemptCount: 1,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        sceneHash: planned.sceneHash,
        shortMediaRequirements: planned.shortMediaRequirements,
      };
      if ("sourceLandscapePath" in planned && planned.sourceLandscapePath) {
        entry.sourceImagePath = planned.sourceLandscapePath;
      }
      if ("sourceLandscapeSha256" in planned && planned.sourceLandscapeSha256) {
        entry.sourceImageSha256 = planned.sourceLandscapeSha256;
      }
      return entry;
      }
    }
  );
  const failures = entries.filter((entry) => entry.status === "failed");
  if (failures.length > 0) {
    throw new Error(
      `Unable to prepare all Shorts images for ${episodeId}: ${failures
        .map((entry) => `${entry.sceneId}${entry.error ? ` (${entry.error})` : ""}`)
        .join(", ")}`
    );
  }
  await writeJsonAtomic(manifestPath, entries);
  return {
    outputDir,
    manifestPath,
    entries,
  };
}

export async function auditShortsImageAssets(
  scenePlan: ScenePlan,
  outputDir: string,
  manifestPath: string
): Promise<ShortsImageAuditResult> {
  const warnings: string[] = [];
  const manifestEntries = await loadExistingManifest(manifestPath);
  if (!manifestEntries) {
    warnings.push(`Shorts image manifest is missing or unreadable: ${manifestPath}`);
    return { warnings };
  }
  if (manifestEntries.length !== scenePlan.scenes.length) {
    warnings.push(
      `Shorts image manifest has ${manifestEntries.length} entries but the short scene plan has ${scenePlan.scenes.length} scenes.`
    );
  }
  const expectedFiles = new Set(scenePlan.scenes.map((scene) => portraitFilename(scene)));
  const actualFiles = (await fs.readdir(outputDir).catch(() => [])).filter((entry) => entry.endsWith(".png"));
  for (const scene of scenePlan.scenes) {
    const candidates = actualFiles.filter((entry) => entry.startsWith(`${scene.id}__`));
    if (candidates.length === 0) {
      warnings.push(`Missing Shorts image for ${scene.id} in ${outputDir}.`);
      continue;
    }
    if (candidates.length > 1) {
      warnings.push(
        `Duplicate Shorts images found for ${scene.id} in ${outputDir}: ${candidates.join(", ")}`
      );
    }
    const expectedName = portraitFilename(scene);
    if (!actualFiles.includes(expectedName)) {
      warnings.push(`Shorts image name mismatch for ${scene.id}; expected ${expectedName}.`);
    }
    const checkedPath = path.join(outputDir, candidates.includes(expectedName) ? expectedName : candidates[0]!);
    const metadata = await sharp(checkedPath).metadata().catch(() => null);
    if (!metadata?.width || !metadata?.height) {
      warnings.push(`Unable to inspect Shorts image dimensions for ${checkedPath}.`);
      continue;
    }
    if (metadata.width >= metadata.height) {
      warnings.push(
        `Shorts image is not portrait for ${scene.id}: ${metadata.width}x${metadata.height}.`
      );
    }
  }
  for (const entry of actualFiles) {
    if (!expectedFiles.has(entry)) {
      warnings.push(`Unexpected stale Shorts image present in ${outputDir}: ${entry}`);
    }
  }
  return { warnings };
}
