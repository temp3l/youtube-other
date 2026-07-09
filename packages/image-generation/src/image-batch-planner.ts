import fs from "node:fs/promises";
import path from "node:path";
import type { BatchCreateParams } from "openai/resources/batches";
import { scenePlanSchema, type ScenePlan } from "@mediaforge/domain";
import {
  assertInsideWorkspace,
  fileExists,
  hashFile,
  hashText,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  normalizeWhitespace,
  createEpisodePathResolver,
  resolveEpisodeCharacterReferencePath,
  resolveEpisodeImageManifestPath,
  resolveEpisodeImageStateDir,
  resolveEpisodeImagePromptPath,
  resolveEpisodeSharedGeneratedImagePath,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  buildImageBatchCustomId,
  createImageBatchAssetIdentity,
  deriveImageBatchDestinationIdentity,
  endpointForImageBatchOperation,
  normalizeImageBatchDestinationPath,
} from "./image-batch-identity.js";
import type {
  ImageBatchDependency,
  ImageBatchJob,
  ImageBatchManifest,
  ImageBatchManifestItem,
} from "./image-batch.types.js";
import {
  buildCharacterReferencePrompt,
  buildMediaStageDependency,
  loadEpisodeCharacterRegistry,
  loadEpisodeSceneManifest,
  mediaStageIdentitySchema,
  planEpisodeImageGeneration,
  type CharacterDefinition,
  type CharacterRegistry,
  type EpisodeImagePipelineSettings,
  type SceneGenerationManifest,
} from "./episode-image-pipeline.js";
import {
  planShortsImageWork,
  type PlannedShortsDeterministicTransformItem,
  type PlannedShortsImageWork,
  type PlannedShortsItem,
  type PlannedShortsNativeGenerationItem,
  type PlannedShortsReuseItem,
  type ShortsImageConfig,
} from "./shorts-image-strategy.js";
import {
  createImageBatchManifestItem,
  createImageBatchStoragePlan,
  writeImageBatchInputFile,
  writeImageBatchManifest,
  type ImageBatchStoragePlan,
} from "./image-batch-storage.js";
import { assertVideoImageFileMatchesSpec } from "./video-image-spec.js";

export interface ImageBatchPlannerSettings {
  readonly model: string;
  readonly requestedSize: string;
  readonly quality: "low" | "medium" | "high" | "auto";
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly force?: boolean;
  readonly maxRequestsPerBatch?: number;
}

export interface ImageBatchPlannerOptions {
  readonly sceneId?: string;
  readonly sceneIds?: readonly string[];
  readonly characterId?: string;
  readonly language?: string;
  readonly variant?: "full" | "short";
}

type PlannedImageBatchRequestLine = {
  readonly custom_id: string;
  readonly method: "POST";
  readonly url: "/v1/images/generations" | "/v1/images/edits";
  readonly body: Record<string, unknown>;
};

export class ImageBatchPlannerError extends Error {
  readonly code:
    | "missing-reference-image"
    | "unapproved-reference"
    | "unsupported-edit-batch-request"
    | "unsupported-shared-output-multilanguage"
    | "stale-dependency-hash"
    | "missing-scene-plan"
    | "missing-localization"
    | "duplicate-custom-id"
    | "duplicate-destination-path"
    | "path-escape"
    | "missing-short-source-image"
    | "stale-short-source-hash"
    | "invalid-short-portrait-dimensions"
    | "unsupported-short-endpoint";
  readonly details?: Record<string, unknown>;

  constructor(args: {
    readonly code: ImageBatchPlannerError["code"];
    readonly message: string;
    readonly details?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "ImageBatchPlannerError";
    this.code = args.code;
    if (args.details) {
      this.details = args.details;
    }
  }
}

export interface PlannedImageBatchReference {
  readonly characterId: string;
  readonly promptHash: string;
  readonly providerRequestHash: string;
  readonly job: ImageBatchJob;
  readonly requestLine: PlannedImageBatchRequestLine;
  readonly manifestItem: ImageBatchManifestItem;
}

export interface PlannedImageBatchScene {
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly promptPath: string;
  readonly promptHash: string;
  readonly providerRequestHash: string;
  readonly manifestPath: string;
  readonly sceneManifest: SceneGenerationManifest;
  readonly job: ImageBatchJob;
  readonly requestLine: PlannedImageBatchRequestLine;
  readonly manifestItem: ImageBatchManifestItem;
}

export interface PlannedImageBatchGroup {
  readonly groupKey: string;
  readonly stageKind: "reference-images" | "scene-images";
  readonly splitGroupIndex: number;
  readonly splitGroupCount: number;
  readonly outputDirectory: string;
  readonly storagePlan: ImageBatchStoragePlan;
  readonly referencePlans: readonly PlannedImageBatchReference[];
  readonly scenePlans: readonly PlannedImageBatchScene[];
  readonly skippedSceneIds: readonly string[];
  readonly inputFileHash?: string;
  readonly manifest?: ImageBatchManifest;
}

export interface PrepareImageBatchResult {
  readonly groups: readonly PlannedImageBatchGroup[];
  readonly stagePreviews: readonly ImageBatchStagePreview[];
  readonly writtenFiles: readonly string[];
}

export interface PreparedFullSceneBatchResult extends PrepareImageBatchResult {
  readonly episodeId: string;
  readonly variant: "full";
  readonly languages: readonly string[];
}

export interface PreparedShortLocalWorkPlan {
  readonly manifestPath: string;
  readonly deterministicTransforms: readonly PlannedShortsDeterministicTransformItem[];
  readonly cacheReuse: readonly PlannedShortsReuseItem[];
}

export interface PreparedShortSceneBatchResult extends PrepareImageBatchResult {
  readonly episodeId: string;
  readonly variant: "short";
  readonly languages: readonly string[];
  readonly localWorkPlan: PreparedShortLocalWorkPlan;
  readonly previewCounts: {
    readonly paidNativeGenerations: number;
    readonly freeLocalTransforms: number;
    readonly cacheHits: number;
    readonly blocked: number;
  };
}

export type ImageBatchStageKind =
  | "reference-prompts"
  | "reference-images"
  | "reference-approval-validation"
  | "scene-prompts"
  | "scene-images";

export interface ImageBatchStagePreview {
  readonly kind: ImageBatchStageKind;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly requestCount: number;
  readonly itemCount: number;
  readonly operation: "generation" | "edit" | "mixed" | "none";
  readonly endpoint?: "/v1/images/generations" | "/v1/images/edits";
  readonly model: string;
  readonly size: string;
  readonly quality: ImageBatchPlannerSettings["quality"];
  readonly dependencyStageKinds: readonly ImageBatchStageKind[];
}

const imageGenerationBatchEndpoint = "/v1/images/generations" as const satisfies BatchCreateParams["endpoint"];
const imageEditBatchEndpoint = "/v1/images/edits" as const satisfies BatchCreateParams["endpoint"];

function stableHash(value: string): string {
  return hashText(value);
}

function scenePlanCustomId(plan: PlannedImageBatchScene): string {
  return plan.manifestItem.customId;
}

function scenePlanOwnsProviderRequest(plan: PlannedImageBatchScene): boolean {
  return plan.manifestItem.aliasedToCustomId === undefined;
}

function scenePlanSharedOutputOwnerCustomId(
  plan: PlannedImageBatchScene
): string {
  return plan.manifestItem.aliasedToCustomId ?? plan.manifestItem.customId;
}

function sharedOutputKeyForScenePlan(plan: PlannedImageBatchScene): string {
  return stableHash(
    JSON.stringify({
      expectedOutputPath: normalizeImageBatchDestinationPath(
        plan.job.expectedOutputPath
      ),
      providerRequestHash: plan.providerRequestHash,
      generationConfigurationHash: plan.job.generationConfigurationHash,
      operation: plan.job.identity.operation,
      outputFormat: plan.job.outputFormat,
      dependencyHashes: plan.job.identity.dependencyHashes,
      visualIntentHash: plan.job.identity.visualIntentHash,
      promptHash: plan.job.identity.promptHash,
      dependencySourceHash: plan.job.identity.dependencySourceHash,
    })
  );
}

function collisionSignatureForScenePlan(plan: PlannedImageBatchScene) {
  return {
    providerRequestHash: plan.providerRequestHash,
    generationConfigurationHash: plan.job.generationConfigurationHash,
    operation: plan.job.identity.operation,
    outputFormat: plan.job.outputFormat,
    dependencyHashes: [...plan.job.identity.dependencyHashes].sort((left, right) =>
      left.localeCompare(right)
    ),
    visualIntentHash: plan.job.identity.visualIntentHash,
    promptHash: plan.job.identity.promptHash,
    dependencySourceHash: plan.job.identity.dependencySourceHash,
    assetPurpose: plan.job.identity.assetPurpose,
    aspectRatio: plan.job.identity.aspectRatio,
    configurationHash: plan.job.identity.configurationHash,
  };
}

function withSharedOutputMetadata(args: {
  readonly plan: PlannedImageBatchScene;
  readonly sharedOutputKey: string;
  readonly ownsSharedOutput: boolean;
  readonly aliasedToCustomId?: string;
}): PlannedImageBatchScene {
  return {
    ...args.plan,
    manifestItem: {
      ...args.plan.manifestItem,
      sharedOutputKey: args.sharedOutputKey,
      ownsSharedOutput: args.ownsSharedOutput,
      ...(args.aliasedToCustomId
        ? { aliasedToCustomId: args.aliasedToCustomId }
        : {}),
    },
  };
}

function applySharedOutputPolicyToScenePlans(
  scenePlans: readonly PlannedImageBatchScene[]
): readonly PlannedImageBatchScene[] {
  const plansByOutputPath = new Map<string, PlannedImageBatchScene[]>();
  for (const plan of scenePlans) {
    const outputPath = normalizeImageBatchDestinationPath(
      plan.job.expectedOutputPath
    );
    const existing = plansByOutputPath.get(outputPath) ?? [];
    existing.push(plan);
    plansByOutputPath.set(outputPath, existing);
  }
  const nextPlans: PlannedImageBatchScene[] = [];
  for (const plansAtPath of plansByOutputPath.values()) {
    if (plansAtPath.length === 1) {
      nextPlans.push(plansAtPath[0]!);
      continue;
    }
    const [first, ...rest] = plansAtPath;
    const firstSignature = JSON.stringify(collisionSignatureForScenePlan(first!));
    const allEquivalent = rest.every(
      (plan) =>
        JSON.stringify(collisionSignatureForScenePlan(plan)) === firstSignature
    );
    if (!allEquivalent) {
      throw new ImageBatchPlannerError({
        code: "duplicate-destination-path",
        message: `Unsafe multilingual shared-output collision detected at ${first!.job.expectedOutputPath}.`,
        details: {
          expectedOutputPath: first!.job.expectedOutputPath,
          languages: plansAtPath.map((plan) => plan.job.identity.language),
          customIds: plansAtPath.map((plan) => scenePlanCustomId(plan)),
          signatures: plansAtPath.map((plan) => ({
            language: plan.job.identity.language,
            ...collisionSignatureForScenePlan(plan),
          })),
        },
      });
    }
    const ordered = [...plansAtPath].sort((left, right) =>
      scenePlanCustomId(left).localeCompare(scenePlanCustomId(right))
    );
    const owner = ordered[0]!;
    const sharedOutputKey = sharedOutputKeyForScenePlan(owner);
    nextPlans.push(
      withSharedOutputMetadata({
        plan: owner,
        sharedOutputKey,
        ownsSharedOutput: true,
      })
    );
    for (const alias of ordered.slice(1)) {
      nextPlans.push(
        withSharedOutputMetadata({
          plan: alias,
          sharedOutputKey,
          ownsSharedOutput: false,
          aliasedToCustomId: owner.manifestItem.customId,
        })
      );
    }
  }
  return nextPlans.sort((left, right) =>
    scenePlanCustomId(left).localeCompare(scenePlanCustomId(right))
  );
}

function shortSharedPortraitKeyForScenePlan(plan: PlannedImageBatchScene): string {
  return stableHash(
    JSON.stringify({
      policy: "short-shared-portrait-v2",
      expectedOutputPath: normalizeImageBatchDestinationPath(
        plan.job.expectedOutputPath
      ),
      visualIntentHash: plan.job.identity.visualIntentHash,
      promptHash: plan.job.identity.promptHash,
      dependencySourceHash: plan.job.identity.dependencySourceHash,
      subject: plan.job.identity.subject,
      assetPurpose: plan.job.identity.assetPurpose,
      aspectRatio: plan.job.identity.aspectRatio,
      configurationHash: plan.job.identity.configurationHash,
    })
  );
}

function shortSharedPortraitSignature(plan: PlannedImageBatchScene): string {
  return JSON.stringify({
    visualIntentHash: plan.job.identity.visualIntentHash,
    promptHash: plan.job.identity.promptHash,
    dependencySourceHash: plan.job.identity.dependencySourceHash,
    subject: plan.job.identity.subject,
    assetPurpose: plan.job.identity.assetPurpose,
    aspectRatio: plan.job.identity.aspectRatio,
    configurationHash: plan.job.identity.configurationHash,
  });
}

function applyShortSharedPortraitAliasPolicy(
  scenePlans: readonly PlannedImageBatchScene[]
): readonly PlannedImageBatchScene[] {
  const plansByOutputPath = new Map<string, PlannedImageBatchScene[]>();
  for (const plan of scenePlans) {
    const outputPath = normalizeImageBatchDestinationPath(
      plan.job.expectedOutputPath
    );
    const existing = plansByOutputPath.get(outputPath) ?? [];
    existing.push(plan);
    plansByOutputPath.set(outputPath, existing);
  }
  const nextPlans: PlannedImageBatchScene[] = [];
  for (const plansAtPath of plansByOutputPath.values()) {
    if (plansAtPath.length === 1) {
      nextPlans.push(plansAtPath[0]!);
      continue;
    }
    const [first] = plansAtPath;
    const firstSubject = JSON.stringify(first!.job.identity.subject);
    const firstSignature = shortSharedPortraitSignature(first!);
    const allSharedPortraits = plansAtPath.every(
      (plan) =>
        plan.job.identity.variant === "short" &&
        plan.job.identity.assetRole === "short-scene" &&
        plan.job.identity.assetPurpose === "short-scene" &&
        plan.job.identity.destination.root === "shared-short-images-generated" &&
        JSON.stringify(plan.job.identity.subject) === firstSubject &&
        shortSharedPortraitSignature(plan) === firstSignature
    );
    if (!allSharedPortraits) {
      throw new ImageBatchPlannerError({
        code: "duplicate-destination-path",
        message: `Unsafe short shared portrait collision detected at ${first!.job.expectedOutputPath}.`,
        details: {
          expectedOutputPath: first!.job.expectedOutputPath,
          languages: plansAtPath.map((plan) => plan.job.identity.language),
          customIds: plansAtPath.map((plan) => scenePlanCustomId(plan)),
          signatures: plansAtPath.map((plan) => ({
            language: plan.job.identity.language,
            signature: shortSharedPortraitSignature(plan),
          })),
        },
      });
    }
    const ordered = [...plansAtPath].sort((left, right) =>
      scenePlanCustomId(left).localeCompare(scenePlanCustomId(right))
    );
    const owner = ordered[0]!;
    const sharedOutputKey = shortSharedPortraitKeyForScenePlan(owner);
    nextPlans.push(
      withSharedOutputMetadata({
        plan: owner,
        sharedOutputKey,
        ownsSharedOutput: true,
      })
    );
    for (const alias of ordered.slice(1)) {
      nextPlans.push(
        withSharedOutputMetadata({
          plan: alias,
          sharedOutputKey,
          ownsSharedOutput: false,
          aliasedToCustomId: owner.manifestItem.customId,
        })
      );
    }
  }
  return nextPlans.sort((left, right) =>
    scenePlanCustomId(left).localeCompare(scenePlanCustomId(right))
  );
}

function buildConfigurationHash(args: {
  readonly stageKind: PlannedImageBatchGroup["stageKind"];
  readonly variant: string;
  readonly model: string;
  readonly requestedSize: string;
  readonly quality: string;
  readonly outputFormat: string;
  readonly endpoint?: "/v1/images/generations" | "/v1/images/edits";
}): string {
  return stableHash(
    JSON.stringify({
      stageKind: args.stageKind,
      variant: args.variant,
      model: args.model,
      requestedSize: args.requestedSize,
      quality: args.quality,
      outputFormat: args.outputFormat,
      endpoint: args.endpoint ?? null,
    })
  );
}

function buildProviderRequestHash(args: {
  readonly operation: "image-generation" | "image-edit";
  readonly model: string;
  readonly prompt: string;
  readonly requestedSize: string;
  readonly quality: string;
  readonly outputFormat: string;
  readonly characterReferenceHashes: readonly string[];
}): string {
  return stableHash(
    JSON.stringify({
      operation: args.operation,
      model: args.model,
      prompt: args.prompt,
      n: 1,
      size: args.requestedSize,
      quality: args.quality,
      outputFormat: args.outputFormat,
      referenceImages: args.characterReferenceHashes,
    })
  );
}

function normalizePrompt(value: string): string {
  return normalizeWhitespace(value).trim();
}

function plannerSettingsForPipeline(
  settings: ImageBatchPlannerSettings
): EpisodeImagePipelineSettings {
  return {
    apiKey: "batch-prepare-only",
    model: settings.model,
    size: settings.requestedSize,
    resolvedSize: settings.requestedSize,
    quality: settings.quality,
    concurrency: 1,
    maxRetries: 0,
    timeoutMs: 1_000,
    allowUnapprovedCharacterReferences:
      settings.allowUnapprovedCharacterReferences ?? false,
    force: settings.force ?? false,
  };
}

function buildStagePreview(args: {
  readonly kind: ImageBatchStageKind;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly requestCount: number;
  readonly itemCount: number;
  readonly operation: ImageBatchStagePreview["operation"];
  readonly endpoint?: "/v1/images/generations" | "/v1/images/edits";
  readonly settings: ImageBatchPlannerSettings;
  readonly dependencyStageKinds: readonly ImageBatchStageKind[];
}): ImageBatchStagePreview {
  return {
    kind: args.kind,
    language: args.language,
    variant: args.variant,
    requestCount: args.requestCount,
    itemCount: args.itemCount,
    operation: args.operation,
    ...(args.endpoint ? { endpoint: args.endpoint } : {}),
    model: args.settings.model,
    size: args.settings.requestedSize,
    quality: args.settings.quality,
    dependencyStageKinds: args.dependencyStageKinds,
  };
}

function deterministicLocalBatchId(args: {
  readonly groupKey: string;
  readonly splitGroupIndex: number;
  readonly splitGroupCount: number;
}): string {
  return [
    "imgb",
    args.groupKey.slice(0, 12),
    `p${String(args.splitGroupIndex + 1).padStart(3, "0")}`,
    `of${String(args.splitGroupCount).padStart(3, "0")}`,
  ].join("-");
}

function splitByLimit<T>(
  items: readonly T[],
  maxRequestsPerBatch: number | undefined
): readonly (readonly T[])[] {
  if (!maxRequestsPerBatch || maxRequestsPerBatch < 1 || items.length <= maxRequestsPerBatch) {
    return [items];
  }
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += maxRequestsPerBatch) {
    groups.push(items.slice(index, index + maxRequestsPerBatch));
  }
  return groups;
}

async function readPromptText(
  episodeDir: string,
  sceneId: string,
  sceneManifest: SceneGenerationManifest
): Promise<{ readonly prompt: string; readonly promptPath: string }> {
  const promptPath = resolveEpisodeImagePromptPath(episodeDir, sceneId);
  if (await fileExists(promptPath)) {
    const prompt = normalizePrompt(await fs.readFile(promptPath, "utf8"));
    if (prompt.length > 0) {
      return { prompt, promptPath };
    }
  }
  const fallback = normalizePrompt(sceneManifest.finalPrompt);
  if (fallback.length === 0) {
    throw new Error(`Missing persisted prompt for scene ${sceneId}.`);
  }
  return { prompt: fallback, promptPath };
}

function buildBaseRequestBody(args: {
  readonly model: string;
  readonly prompt: string;
  readonly requestedSize: string;
  readonly quality: string;
  readonly outputFormat: "png" | "jpeg" | "webp";
}): Record<string, unknown> {
  return {
    model: args.model,
    prompt: args.prompt,
    n: 1,
    size: args.requestedSize,
    quality: args.quality,
    output_format: args.outputFormat,
  };
}

function buildReferenceAssetIdentity(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly character: CharacterDefinition;
  readonly settings: ImageBatchPlannerSettings;
  readonly promptHash: string;
  readonly outputPath: string;
}) {
  return createImageBatchAssetIdentity({
    episodeId: args.episodeId,
    language: args.language,
    variant: args.variant,
    aspectRatio: args.variant === "short" ? "9:16" : "16:9",
    assetRole: "character-reference",
    assetPurpose: "character-reference",
    operation: "generation",
    subject: { kind: "character", id: args.character.id },
    storyBeatId: args.character.id,
    visualIntentHash: args.promptHash,
    promptHash: args.promptHash,
    dependencySourceHash: stableHash(JSON.stringify({ characterId: args.character.id })),
    sourceLanguage: "en",
    targetLanguage: args.language,
    configurationHash: buildConfigurationHash({
      stageKind: "reference-images",
      variant: args.variant,
      model: args.settings.model,
      requestedSize: args.settings.requestedSize,
      quality: args.settings.quality,
      outputFormat: args.settings.outputFormat,
      endpoint: "/v1/images/generations",
    }),
    model: args.settings.model,
    size: args.settings.requestedSize,
    quality: args.settings.quality,
    dependencyHashes: [],
    destination: deriveImageBatchDestinationIdentity({
      assetRole: "character-reference",
      episodeDir: args.episodeDir,
      outputPath: args.outputPath,
    }),
  });
}

async function buildReferenceJob(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly character: CharacterDefinition;
  readonly settings: ImageBatchPlannerSettings;
}): Promise<PlannedImageBatchReference> {
  const outputPath =
    args.character.referenceImagePath ??
    resolveEpisodeCharacterReferencePath(args.episodeDir, args.character.id);
  const prompt = buildCharacterReferencePrompt(args.character);
  const promptHash = stableHash(prompt);
  const providerRequestHash = buildProviderRequestHash({
    operation: "image-generation",
    model: args.settings.model,
    prompt,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
    characterReferenceHashes: [],
  });
  const identity = buildReferenceAssetIdentity({
    episodeDir: args.episodeDir,
    episodeId: args.episodeId,
    language: args.language,
    variant: args.variant,
    character: args.character,
    settings: args.settings,
    promptHash,
    outputPath,
  });
  const customId = buildImageBatchCustomId(identity);
  const job: ImageBatchJob = {
    identity,
    positivePrompt: prompt,
    characterIds: [args.character.id],
    characterReferencePaths: [],
    dependencies: [],
    outputFormat: args.settings.outputFormat,
    expectedOutputPath: outputPath,
    providerRequestHash,
    generationConfigurationHash: buildConfigurationHash({
      stageKind: "reference-images",
      variant: args.variant,
      model: args.settings.model,
      requestedSize: args.settings.requestedSize,
      quality: args.settings.quality,
      outputFormat: args.settings.outputFormat,
      endpoint: "/v1/images/generations",
    }),
  };
  const requestLine: PlannedImageBatchRequestLine = {
    custom_id: customId,
    method: "POST",
    url: "/v1/images/generations",
    body: buildBaseRequestBody({
      model: args.settings.model,
      prompt,
      requestedSize: args.settings.requestedSize,
      quality: args.settings.quality,
      outputFormat: args.settings.outputFormat,
    }),
  };
  return {
    characterId: args.character.id,
    promptHash,
    providerRequestHash,
    job,
    requestLine,
    manifestItem: createImageBatchManifestItem({ job, customId }),
  };
}

async function resolveSceneDependencies(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly settings: ImageBatchPlannerSettings;
  readonly registry: CharacterRegistry;
  readonly sceneId: string;
  readonly sceneManifest: SceneGenerationManifest;
}): Promise<{
  readonly dependencies: readonly ImageBatchDependency[];
}> {
  const dependencies: ImageBatchDependency[] = [];

  for (const reference of args.sceneManifest.referenceImages) {
    const character = args.registry.characters.find(
      (entry) => entry.id === reference.characterId
    );
    if (!character) {
      throw new ImageBatchPlannerError({
        code: "missing-reference-image",
        message: `Missing character registry entry for reference ${reference.characterId} used by scene ${args.sceneId}.`,
        details: {
          sceneId: args.sceneId,
          characterId: reference.characterId,
        },
      });
    }

    const sourcePath =
      character.referenceImagePath ??
      resolveEpisodeCharacterReferencePath(args.episodeDir, character.id);
    if (!(await fileExists(sourcePath))) {
      throw new ImageBatchPlannerError({
        code: "missing-reference-image",
        message: `Missing reference image for character ${character.id}.`,
        details: {
          sceneId: args.sceneId,
          characterId: character.id,
          sourcePath,
        },
      });
    }

    const sha256 = await hashFile(sourcePath);
    if (sha256 !== reference.sha256) {
      throw new ImageBatchPlannerError({
        code: "stale-dependency-hash",
        message: `Reference image hash changed for character ${character.id} in scene ${args.sceneId}.`,
        details: {
          sceneId: args.sceneId,
          characterId: character.id,
          expectedSha256: reference.sha256,
          actualSha256: sha256,
          sourcePath,
        },
      });
    }

    if (
      character.referenceStatus !== "approved" &&
      !args.settings.allowUnapprovedCharacterReferences
    ) {
      throw new ImageBatchPlannerError({
        code: "unapproved-reference",
        message: `Character ${character.id} requires an approved reference before scene generation.`,
        details: {
          sceneId: args.sceneId,
          characterId: character.id,
          referenceStatus: character.referenceStatus,
        },
      });
    }

    const promptHash = stableHash(buildCharacterReferencePrompt(character));
    dependencies.push({
      role: "character-reference",
      approvalStatus: character.referenceStatus,
      sourcePath,
      ...(character.referenceFileId
        ? { openAIFileId: character.referenceFileId }
        : {}),
      sha256,
      assetIdentity: buildReferenceAssetIdentity({
        episodeDir: args.episodeDir,
        episodeId: args.episodeId,
        language: args.language,
        variant: args.variant,
        character,
        settings: args.settings,
        promptHash,
        outputPath: sourcePath,
      }),
    });
  }

  return { dependencies };
}

function unsupportedEditBatchRequestError(args: {
  readonly sceneId: string;
  readonly dependencies: readonly ImageBatchDependency[];
}): ImageBatchPlannerError {
  return new ImageBatchPlannerError({
    code: "unsupported-edit-batch-request",
    message: `Reference-assisted batch scene ${args.sceneId} is blocked until ${imageEditBatchEndpoint} JSONL semantics are manually verified against the provider.`,
    details: {
      sceneId: args.sceneId,
      dependencyPaths: args.dependencies.map((dependency) => dependency.sourcePath),
      sdkBatchEndpoint: imageEditBatchEndpoint,
      jsonlShape: { image: "OpenAI file ID | OpenAI file ID[]" },
      verificationStatus: "manual-only",
      reason:
        "Repository tests prove endpoint allow-list support, but not provider-safe JSONL image input semantics for batch edits.",
    },
  });
}

async function buildSceneJob(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly expectedFilename?: string;
  readonly sceneManifest: SceneGenerationManifest;
  readonly registry: CharacterRegistry;
  readonly settings: ImageBatchPlannerSettings;
}): Promise<PlannedImageBatchScene> {
  const { prompt, promptPath } = await readPromptText(
    args.episodeDir,
    args.sceneId,
    args.sceneManifest
  );
  const { dependencies } = await resolveSceneDependencies({
    episodeDir: args.episodeDir,
    episodeId: args.episodeId,
    language: args.language,
    variant: args.variant,
    settings: args.settings,
    registry: args.registry,
    sceneId: args.sceneId,
    sceneManifest: args.sceneManifest,
  });
  const promptHash = stableHash(prompt);
  const isEdit = dependencies.length > 0;
  if (isEdit) {
    throw unsupportedEditBatchRequestError({
      sceneId: args.sceneId,
      dependencies,
    });
  }
  const operation = isEdit ? "edit" : "generation";
  const endpoint = endpointForImageBatchOperation(operation);
  if (!endpoint) {
    throw new Error(
      `Unsupported image batch operation ${operation} for scene:${args.sceneId}.`
    );
  }
  const providerRequestHash = buildProviderRequestHash({
    operation: isEdit ? "image-edit" : "image-generation",
    model: args.settings.model,
    prompt,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
    characterReferenceHashes: dependencies.map((dependency) => dependency.sha256),
  });
  const expectedOutputPath =
    args.variant === "short"
      ? args.sceneManifest.outputPath
      : resolveEpisodeSharedGeneratedImagePath({
          episodeDir: args.episodeDir,
          sceneId: args.sceneId,
          expectedFilename:
            args.expectedFilename ?? path.basename(args.sceneManifest.outputPath),
        });
  const generationConfigurationHash = buildConfigurationHash({
    stageKind: "scene-images",
    variant: args.variant,
    model: args.settings.model,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
    endpoint,
  });
  const identity = createImageBatchAssetIdentity({
    episodeId: args.episodeId,
    language: args.language,
    variant: args.variant,
    aspectRatio: args.variant === "short" ? "9:16" : "16:9",
    assetRole: args.variant === "short" ? "short-scene" : "full-scene",
    assetPurpose: args.variant === "short" ? "short-scene" : "full-scene",
    operation,
    subject: { kind: "scene", id: args.sceneId },
    storyBeatId: args.sceneId,
    visualIntentHash: stableHash(
      JSON.stringify({
        prompt,
        scenePromptHash: args.sceneManifest.promptHash,
        materialDifferencesFromPrevious:
          args.sceneManifest.materialDifferencesFromPrevious,
        renderability: args.sceneManifest.renderability ?? null,
        reusedFromSceneId: args.sceneManifest.reusedFromSceneId ?? null,
      })
    ),
    promptHash,
    dependencySourceHash: stableHash(
      JSON.stringify({
        dependencies: dependencies.map((dependency) => dependency.sha256),
      })
    ),
    sourceLanguage: "en",
    targetLanguage: args.language,
    configurationHash: generationConfigurationHash,
    model: args.settings.model,
    size: args.settings.requestedSize,
    quality: args.settings.quality,
    dependencyHashes: dependencies.map((dependency) => dependency.sha256),
    destination: deriveImageBatchDestinationIdentity({
      assetRole: args.variant === "short" ? "short-scene" : "full-scene",
      episodeDir: args.episodeDir,
      outputPath: expectedOutputPath,
    }),
  });
  const customId = buildImageBatchCustomId(identity);
  const job: ImageBatchJob = {
    identity,
    sceneId: args.sceneId,
    sceneIndex: args.sceneIndex,
    ...(args.sceneManifest.renderability
      ? { renderability: args.sceneManifest.renderability }
      : {}),
    ...(args.sceneManifest.reusedFromSceneId
      ? { reusedFromSceneId: args.sceneManifest.reusedFromSceneId }
      : {}),
    promptPath,
    positivePrompt: prompt,
    characterIds: args.sceneManifest.characterIds,
    characterReferencePaths: dependencies.map((dependency) => dependency.sourcePath),
    dependencies,
    outputFormat: args.settings.outputFormat,
    expectedOutputPath,
    providerRequestHash,
    generationConfigurationHash,
  };
  const requestLine: PlannedImageBatchRequestLine = {
    custom_id: customId,
    method: "POST",
    url: endpoint,
    body: {
      ...buildBaseRequestBody({
        model: args.settings.model,
        prompt,
        requestedSize: args.settings.requestedSize,
        quality: args.settings.quality,
        outputFormat: args.settings.outputFormat,
      }),
      ...(isEdit
        ? {
            image: dependencies.map((dependency) => {
              if (!dependency.openAIFileId) {
                throw unsupportedEditBatchRequestError({
                  sceneId: args.sceneId,
                  dependencies,
                });
              }
              return dependency.openAIFileId;
            }),
          }
        : {}),
    },
  };
  const manifestItem = createImageBatchManifestItem({
    job,
    customId,
  });
  return {
    sceneId: args.sceneId,
    sceneIndex: args.sceneIndex,
    promptPath,
    promptHash,
    providerRequestHash,
    manifestPath: resolveEpisodeImageManifestPath(args.episodeDir, args.sceneId),
    sceneManifest: args.sceneManifest,
    job,
    requestLine,
    manifestItem,
  };
}

function validateUniquePlans(
  plans: ReadonlyArray<{
    readonly customId: string;
    readonly identityHash: string;
    readonly expectedOutputPath: string;
    readonly subjectDescription: string;
    readonly sharedOutputKey?: string;
  }>
): void {
  const identityHashes = new Set<string>();
  const customIds = new Set<string>();
  const destinationPaths = new Map<string, string | undefined>();
  for (const plan of plans) {
    if (identityHashes.has(plan.identityHash)) {
      throw new ImageBatchPlannerError({
        code: "duplicate-custom-id",
        message: `Duplicate image batch identity detected for ${plan.subjectDescription}.`,
        details: {
          subjectDescription: plan.subjectDescription,
          identityHash: plan.identityHash,
        },
      });
    }
    identityHashes.add(plan.identityHash);
    if (customIds.has(plan.customId)) {
      throw new ImageBatchPlannerError({
        code: "duplicate-custom-id",
        message: `Duplicate image batch custom_id detected: ${plan.customId}.`,
        details: { customId: plan.customId },
      });
    }
    customIds.add(plan.customId);
    const normalizedDestinationPath = normalizeImageBatchDestinationPath(
      plan.expectedOutputPath
    );
    const hasDestinationPath = destinationPaths.has(normalizedDestinationPath);
    const existingSharedOutputKey = destinationPaths.get(normalizedDestinationPath);
    if (
      hasDestinationPath &&
      existingSharedOutputKey !== plan.sharedOutputKey
    ) {
      throw new ImageBatchPlannerError({
        code: "duplicate-destination-path",
        message: `Duplicate image batch destination path detected: ${plan.expectedOutputPath}.`,
        details: { expectedOutputPath: plan.expectedOutputPath },
      });
    }
    destinationPaths.set(normalizedDestinationPath, plan.sharedOutputKey);
  }
}

function selectedSceneIds(
  options: ImageBatchPlannerOptions | undefined
): Set<string> | undefined {
  return options?.sceneIds?.length
    ? new Set(
        options.sceneIds
          .map((entry) => normalizeWhitespace(entry))
          .filter((entry) => entry.length > 0)
      )
    : undefined;
}

async function buildPlannedGroup(args: {
  readonly batchRoot: string;
  readonly stageKind: PlannedImageBatchGroup["stageKind"];
  readonly language: string;
  readonly variant: "full" | "short";
  readonly settings: ImageBatchPlannerSettings;
  readonly splitGroupIndex: number;
  readonly splitGroupCount: number;
  readonly endpoint?: "/v1/images/generations" | "/v1/images/edits";
  readonly referencePlans?: readonly PlannedImageBatchReference[];
  readonly scenePlans?: readonly PlannedImageBatchScene[];
  readonly skippedSceneIds?: readonly string[];
}): Promise<PlannedImageBatchGroup> {
  const groupKey = buildConfigurationHash({
    stageKind: args.stageKind,
    variant: args.variant,
    model: args.settings.model,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
    ...(args.endpoint ? { endpoint: args.endpoint } : {}),
  });
  return {
    groupKey,
    stageKind: args.stageKind,
    splitGroupIndex: args.splitGroupIndex,
    splitGroupCount: args.splitGroupCount,
    outputDirectory: args.batchRoot,
    storagePlan: await createImageBatchStoragePlan(
      args.batchRoot,
      deterministicLocalBatchId({
        groupKey: stableHash(
          JSON.stringify({
            groupKey,
            splitGroupIndex: args.splitGroupIndex,
            splitGroupCount: args.splitGroupCount,
            customIds: [
              ...(args.referencePlans ?? []).map((plan) => plan.requestLine.custom_id),
              ...(args.scenePlans ?? []).map((plan) => plan.requestLine.custom_id),
            ],
          })
        ),
        splitGroupIndex: args.splitGroupIndex,
        splitGroupCount: args.splitGroupCount,
      })
    ),
    referencePlans: args.referencePlans ?? [],
    scenePlans: args.scenePlans ?? [],
    skippedSceneIds: args.skippedSceneIds ?? [],
  };
}

function groupRequestLines(group: PlannedImageBatchGroup): readonly PlannedImageBatchRequestLine[] {
  return group.stageKind === "reference-images"
    ? group.referencePlans.map((plan) => plan.requestLine)
    : group.scenePlans
        .filter((plan) => scenePlanOwnsProviderRequest(plan))
        .map((plan) => plan.requestLine);
}

function groupManifestItems(group: PlannedImageBatchGroup): readonly ImageBatchManifestItem[] {
  return group.stageKind === "reference-images"
    ? group.referencePlans.map((plan) => plan.manifestItem)
    : group.scenePlans.map((plan) => plan.manifestItem);
}

export async function planReferenceImageBatchForEpisode(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly settings: ImageBatchPlannerSettings;
  readonly options?: ImageBatchPlannerOptions;
}): Promise<PlannedImageBatchGroup[]> {
  const language = normalizeLocaleCode(args.options?.language ?? "en");
  const variant = normalizeContentVariant(args.options?.variant ?? "full");
  const batchRoot = resolveEpisodeImageStateDir(args.episodeDir);
  const registry = await loadEpisodeCharacterRegistry(args.episodeDir, args.episodeId);
  const selectedCharacterId = args.options?.characterId?.trim();
  const plannedReferences: PlannedImageBatchReference[] = [];

  for (const character of registry.characters) {
    if (selectedCharacterId && character.id !== selectedCharacterId) {
      continue;
    }
    const referencePath =
      character.referenceImagePath ??
      resolveEpisodeCharacterReferencePath(args.episodeDir, character.id);
    const isReusable =
      !args.settings.force &&
      character.referenceStatus === "approved" &&
      (await fileExists(referencePath));
    if (isReusable) {
      continue;
    }
    plannedReferences.push(
      await buildReferenceJob({
        episodeDir: args.episodeDir,
        episodeId: args.episodeId,
        language,
        variant,
        character,
        settings: args.settings,
      })
    );
  }

  plannedReferences.sort((left, right) =>
    left.requestLine.custom_id.localeCompare(right.requestLine.custom_id)
  );
  validateUniquePlans(
    plannedReferences.map((plan) => ({
      customId: plan.requestLine.custom_id,
      identityHash: plan.job.identity.identityHash,
      expectedOutputPath: plan.job.expectedOutputPath,
      subjectDescription: `character:${plan.characterId}`,
    }))
  );

  if (plannedReferences.length === 0) {
    return [
      await buildPlannedGroup({
        batchRoot,
        stageKind: "reference-images",
        language,
        variant,
        settings: args.settings,
        splitGroupIndex: 0,
        splitGroupCount: 1,
        endpoint: imageGenerationBatchEndpoint,
      }),
    ];
  }

  const chunks = splitByLimit(
    plannedReferences,
    args.settings.maxRequestsPerBatch
  );
  return Promise.all(
    chunks.map((chunk, index) =>
      buildPlannedGroup({
        batchRoot,
        stageKind: "reference-images",
        language,
        variant,
        settings: args.settings,
        splitGroupIndex: index,
        splitGroupCount: chunks.length,
        endpoint: imageGenerationBatchEndpoint,
        referencePlans: chunk,
      })
    )
  );
}

export async function planImageBatchForEpisode(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly scenePlan: {
    readonly scenes: ReadonlyArray<{
      readonly id: string;
      readonly sequenceNumber: number;
      readonly expectedFilename?: string;
      readonly expectedImageFilenames?: readonly string[];
    }>;
  };
  readonly settings: ImageBatchPlannerSettings;
  readonly options?: ImageBatchPlannerOptions;
}): Promise<PlannedImageBatchGroup[]> {
  const language = normalizeLocaleCode(args.options?.language ?? "en");
  const variant = normalizeContentVariant(args.options?.variant ?? "full");
  const selectedIds = selectedSceneIds(args.options);
  const batchRoot = resolveEpisodeImageStateDir(args.episodeDir);
  const registry = await loadEpisodeCharacterRegistry(args.episodeDir, args.episodeId);
  const generationPlans: PlannedImageBatchScene[] = [];
  const editPlans: PlannedImageBatchScene[] = [];
  const skippedSceneIds: string[] = [];

  for (const scene of args.scenePlan.scenes) {
    if (args.options?.sceneId && scene.id !== args.options.sceneId) {
      continue;
    }
    if (selectedIds && !selectedIds.has(scene.id)) {
      continue;
    }
    const sceneManifest = await loadEpisodeSceneManifest(args.episodeDir, scene.id);
    if (!sceneManifest) {
      throw new Error(`Missing scene manifest for ${scene.id}.`);
    }

    const plannedScene = await buildSceneJob({
      episodeDir: args.episodeDir,
      episodeId: args.episodeId,
      language,
      variant,
      sceneId: scene.id,
      sceneIndex: scene.sequenceNumber,
      ...(
        scene.expectedFilename
          ? { expectedFilename: scene.expectedFilename }
          : scene.expectedImageFilenames?.[0]
            ? { expectedFilename: scene.expectedImageFilenames[0] }
            : {}
      ),
      sceneManifest,
      registry,
      settings: args.settings,
    });
    const outputExists = await fileExists(sceneManifest.outputPath);
    if (outputExists) {
      await assertVideoImageFileMatchesSpec({
        episodeId: args.episodeId,
        language,
        videoKind: variant,
        imagePath: sceneManifest.outputPath,
      });
    }
    const isReusable =
      !args.settings.force &&
      sceneManifest.status === "generated" &&
      outputExists &&
      sceneManifest.providerRequestHash === plannedScene.providerRequestHash;
    if (isReusable) {
      skippedSceneIds.push(scene.id);
      continue;
    }
    if (plannedScene.requestLine.url === "/v1/images/edits") {
      editPlans.push(plannedScene);
    } else {
      generationPlans.push(plannedScene);
    }
  }

  generationPlans.sort((left, right) =>
    left.requestLine.custom_id.localeCompare(right.requestLine.custom_id)
  );
  editPlans.sort((left, right) =>
    left.requestLine.custom_id.localeCompare(right.requestLine.custom_id)
  );
  skippedSceneIds.sort((left, right) => left.localeCompare(right));

  validateUniquePlans(
    [...generationPlans, ...editPlans].map((plan) => ({
      customId: plan.requestLine.custom_id,
      identityHash: plan.job.identity.identityHash,
      expectedOutputPath: plan.job.expectedOutputPath,
      subjectDescription: `${plan.job.identity.subject.kind}:${plan.job.identity.subject.id}`,
    }))
  );

  if (generationPlans.length === 0 && editPlans.length === 0) {
    return [
      await buildPlannedGroup({
        batchRoot,
        stageKind: "scene-images",
        language,
        variant,
        settings: args.settings,
        splitGroupIndex: 0,
        splitGroupCount: 1,
        skippedSceneIds,
      }),
    ];
  }

  const groups: PlannedImageBatchGroup[] = [];
  if (generationPlans.length > 0) {
    const generationChunks = splitByLimit(
      generationPlans,
      args.settings.maxRequestsPerBatch
    );
    groups.push(
      ...(await Promise.all(
        generationChunks.map((chunk, index) =>
          buildPlannedGroup({
            batchRoot,
            stageKind: "scene-images",
            language,
            variant,
            settings: args.settings,
            splitGroupIndex: index,
            splitGroupCount: generationChunks.length,
            endpoint: imageGenerationBatchEndpoint,
            scenePlans: chunk,
            skippedSceneIds,
          })
        )
      ))
    );
  }
  if (editPlans.length > 0) {
    const editChunks = splitByLimit(editPlans, args.settings.maxRequestsPerBatch);
    groups.push(
      ...(await Promise.all(
        editChunks.map((chunk, index) =>
          buildPlannedGroup({
            batchRoot,
            stageKind: "scene-images",
            language,
            variant,
            settings: args.settings,
            splitGroupIndex: index,
            splitGroupCount: editChunks.length,
            endpoint: imageEditBatchEndpoint,
            scenePlans: chunk,
            skippedSceneIds,
          })
        )
      ))
    );
  }
  return groups;
}

async function writePreparedGroup(args: {
  readonly group: PlannedImageBatchGroup;
  readonly settings: ImageBatchPlannerSettings;
}): Promise<readonly string[]> {
  const requestLines = groupRequestLines(args.group);
  if (requestLines.length === 0) {
    return [];
  }
  const { inputFilePath, inputFileHash } = await writeImageBatchInputFile(
    args.group.storagePlan,
    requestLines.map((line) => JSON.stringify(line))
  );
  const endpoint =
    requestLines[0]?.url ??
    (args.group.stageKind === "reference-images"
      ? "/v1/images/generations"
      : "/v1/images/generations");
  const manifest: ImageBatchManifest = {
    schemaVersion: "image-batch-v2",
    category: "image-generation",
    localBatchId: args.group.storagePlan.localBatchId,
    rootLocalBatchId: args.group.storagePlan.localBatchId,
    retryNumber: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    endpoint,
    model: args.settings.model,
    completionWindow: "24h",
    inputFilePath,
    inputFileHash,
    status: "prepared",
    items: groupManifestItems(args.group),
  };
  await writeImageBatchManifest(args.group.storagePlan, manifest);
  return [inputFilePath, args.group.storagePlan.manifestPath];
}

function stagePreviewsForReferenceGroups(args: {
  readonly language: string;
  readonly variant: "full" | "short";
  readonly settings: ImageBatchPlannerSettings;
  readonly groups: readonly PlannedImageBatchGroup[];
}): readonly ImageBatchStagePreview[] {
  const referenceItemCount = args.groups.reduce(
    (total, group) => total + group.referencePlans.length,
    0
  );
  return [
    buildStagePreview({
      kind: "reference-prompts",
      language: args.language,
      variant: args.variant,
      requestCount: 0,
      itemCount: referenceItemCount,
      operation: "none",
      settings: args.settings,
      dependencyStageKinds: [],
    }),
    buildStagePreview({
      kind: "reference-images",
      language: args.language,
      variant: args.variant,
      requestCount: referenceItemCount,
      itemCount: referenceItemCount,
      operation: referenceItemCount > 0 ? "generation" : "none",
      ...(referenceItemCount > 0 ? { endpoint: imageGenerationBatchEndpoint } : {}),
      settings: args.settings,
      dependencyStageKinds: ["reference-prompts"],
    }),
    buildStagePreview({
      kind: "reference-approval-validation",
      language: args.language,
      variant: args.variant,
      requestCount: 0,
      itemCount: referenceItemCount,
      operation: "none",
      settings: args.settings,
      dependencyStageKinds: ["reference-images"],
    }),
  ];
}

function stagePreviewsForSceneGroups(args: {
  readonly language: string;
  readonly variant: "full" | "short";
  readonly settings: ImageBatchPlannerSettings;
  readonly groups: readonly PlannedImageBatchGroup[];
}): readonly ImageBatchStagePreview[] {
  const sceneItemCount = args.groups.reduce(
    (total, group) => total + group.scenePlans.length,
    0
  );
  const requestCount = args.groups.reduce(
    (total, group) =>
      total +
      group.scenePlans.filter((plan) => scenePlanOwnsProviderRequest(plan)).length,
    0
  );
  const hasEdit = args.groups.some((group) =>
    group.scenePlans.some(
      (plan) =>
        scenePlanOwnsProviderRequest(plan) &&
        plan.job.identity.operation === "edit"
    )
  );
  const hasGeneration = args.groups.some((group) =>
    group.scenePlans.some(
      (plan) =>
        scenePlanOwnsProviderRequest(plan) &&
        plan.job.identity.operation === "generation"
    )
  );
  return [
    buildStagePreview({
      kind: "scene-prompts",
      language: args.language,
      variant: args.variant,
      requestCount: 0,
      itemCount: sceneItemCount,
      operation: "none",
      settings: args.settings,
      dependencyStageKinds: ["reference-approval-validation"],
    }),
    buildStagePreview({
      kind: "scene-images",
      language: args.language,
      variant: args.variant,
      requestCount,
      itemCount: sceneItemCount,
      operation:
        sceneItemCount === 0
          ? "none"
          : hasEdit && hasGeneration
            ? "mixed"
            : hasEdit
              ? "edit"
              : "generation",
      ...(sceneItemCount > 0 && !hasEdit
        ? { endpoint: imageGenerationBatchEndpoint }
        : {}),
      ...(sceneItemCount > 0 && hasEdit && !hasGeneration
        ? { endpoint: imageEditBatchEndpoint }
        : {}),
      settings: args.settings,
      dependencyStageKinds: ["scene-prompts"],
    }),
  ];
}

export async function prepareReferenceImageBatchForEpisode(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly settings: ImageBatchPlannerSettings;
  readonly options?: ImageBatchPlannerOptions;
}): Promise<PrepareImageBatchResult> {
  const groups = await planReferenceImageBatchForEpisode(args);
  const writtenFiles = (
    await Promise.all(
      groups.map((group) => writePreparedGroup({ group, settings: args.settings }))
    )
  ).flat();
  const language = normalizeLocaleCode(args.options?.language ?? "en");
  const variant = normalizeContentVariant(args.options?.variant ?? "full");
  return {
    groups,
    stagePreviews: stagePreviewsForReferenceGroups({
      language,
      variant,
      settings: args.settings,
      groups,
    }),
    writtenFiles,
  };
}

export async function prepareImageBatchForEpisode(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly scenePlan: {
    readonly scenes: ReadonlyArray<{
      readonly id: string;
      readonly sequenceNumber: number;
      readonly expectedFilename?: string;
      readonly expectedImageFilenames?: readonly string[];
    }>;
  };
  readonly settings: ImageBatchPlannerSettings;
  readonly options?: ImageBatchPlannerOptions;
}): Promise<PrepareImageBatchResult> {
  const groups = await planImageBatchForEpisode(args);
  const writtenFiles = (
    await Promise.all(
      groups.map((group) => writePreparedGroup({ group, settings: args.settings }))
    )
  ).flat();
  const language = normalizeLocaleCode(args.options?.language ?? "en");
  const variant = normalizeContentVariant(args.options?.variant ?? "full");
  return {
    groups,
    stagePreviews: stagePreviewsForSceneGroups({
      language,
      variant,
      settings: args.settings,
      groups,
    }),
    writtenFiles,
  };
}

async function loadCanonicalScenePlan(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
}): Promise<ScenePlan> {
  const resolver = createEpisodePathResolver(path.dirname(args.episodeDir));
  const canonicalScenesPath = resolver.canonicalScenesPath(
    normalizeEpisodeId(args.episodeId)
  );
  const resolvedPath = assertInsideWorkspace(args.episodeDir, canonicalScenesPath);
  if (!(await fileExists(resolvedPath))) {
    throw new ImageBatchPlannerError({
      code: "missing-scene-plan",
      message: `Missing canonical scene plan for ${args.episodeId}.`,
      details: { canonicalScenesPath: resolvedPath },
    });
  }
  return scenePlanSchema.parse(
    JSON.parse(await fs.readFile(resolvedPath, "utf8")) as unknown
  );
}

function defaultShortsImageConfig(sceneCount: number): ShortsImageConfig {
  const configuredCount = Number(process.env["SHORTS_KEY_SCENE_COUNT"] ?? 8);
  const configuredRatio = Number(process.env["SHORTS_KEY_SCENE_RATIO"] ?? 0.8);
  const ratioCount =
    Number.isFinite(configuredRatio) && configuredRatio > 0
      ? Math.ceil(sceneCount * configuredRatio)
      : 0;
  return {
    enabled: true,
    keySceneCount: Math.max(0, Math.min(sceneCount, Math.max(configuredCount, ratioCount))),
    portraitWidth: Number(process.env["SHORTS_PORTRAIT_WIDTH"] ?? 1088),
    portraitHeight: Number(process.env["SHORTS_PORTRAIT_HEIGHT"] ?? 1920),
    finalWidth: Number(process.env["SHORTS_FINAL_WIDTH"] ?? 1080),
    finalHeight: Number(process.env["SHORTS_FINAL_HEIGHT"] ?? 1920),
    reuseLandscapeImages: true,
    enablePanAndScan: true,
    enableBlurredFallback: true,
    forceRegenerateAll:
      (process.env["SHORTS_FORCE_REGENERATE_ALL"] ?? "").toLowerCase() === "true",
    selectionMode:
      (process.env["SHORTS_SELECTION_MODE"] as "first-n" | "importance-based" | undefined) ??
      "importance-based",
    ...(process.env["SHORTS_IMPORTANCE_SCENE_IDS"]
      ? {
          importanceSceneIds: process.env["SHORTS_IMPORTANCE_SCENE_IDS"]
            .split(",")
            .map((value) => normalizeWhitespace(value))
            .filter((value) => value.length > 0),
        }
      : {}),
  };
}

async function loadShortScenePlan(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
}): Promise<ScenePlan> {
  const scenePlanPath = path.join(args.episodeDir, args.language, "short", "scenes.json");
  if (!(await fileExists(scenePlanPath))) {
    throw new ImageBatchPlannerError({
      code: "missing-scene-plan",
      message: `Missing short scene plan for ${args.episodeId}:${args.language}.`,
      details: { scenePlanPath },
    });
  }
  return scenePlanSchema.parse(
    JSON.parse(await fs.readFile(scenePlanPath, "utf8")) as unknown
  );
}

async function buildShortNativeScenePlan(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly planned: PlannedShortsNativeGenerationItem;
  readonly registry: CharacterRegistry;
}): Promise<PlannedImageBatchScene> {
  const dependencies: ImageBatchDependency[] = [];
  for (const referenceImage of args.planned.referenceImages) {
    const character = args.registry.characters.find(
      (entry) => entry.id === referenceImage.characterId
    );
    if (!character) {
      throw new ImageBatchPlannerError({
        code: "missing-reference-image",
        message: `Missing character registry entry for short scene ${args.planned.sceneId}.`,
        details: {
          sceneId: args.planned.sceneId,
          characterId: referenceImage.characterId,
        },
      });
    }
    dependencies.push({
      role: "character-reference",
      approvalStatus: character.referenceStatus,
      sourcePath: referenceImage.filePath,
      ...(character.referenceFileId ? { openAIFileId: character.referenceFileId } : {}),
      sha256: referenceImage.sha256,
      assetIdentity: buildReferenceAssetIdentity({
        episodeDir: args.episodeDir,
        episodeId: args.episodeId,
        language: args.language,
        variant: "short",
        character,
        settings: {
          model: args.planned.providerRequest.model,
          requestedSize: args.planned.providerRequest.size,
          quality: args.planned.providerRequest.quality,
          outputFormat: args.planned.providerRequest.outputFormat,
        },
        promptHash: stableHash(buildCharacterReferencePrompt(character)),
        outputPath:
          character.referenceImagePath ??
          resolveEpisodeCharacterReferencePath(args.episodeDir, character.id),
      }),
    });
  }
  if (args.planned.providerRequest.operation === "image-edit") {
    throw unsupportedEditBatchRequestError({
      sceneId: args.planned.sceneId,
      dependencies,
    });
  }
  const operation = "generation" as const;
  const endpoint = endpointForImageBatchOperation(operation);
  if (!endpoint) {
    throw new ImageBatchPlannerError({
      code: "unsupported-short-endpoint",
      message: `Unsupported short batch endpoint for ${args.planned.sceneId}.`,
      details: {
        sceneId: args.planned.sceneId,
        operation,
      },
    });
  }
  const identity = createImageBatchAssetIdentity({
    episodeId: args.episodeId,
    language: args.language,
    variant: "short",
    aspectRatio: "9:16",
    assetRole: "short-scene",
    assetPurpose: "short-scene",
    operation,
    subject: { kind: "scene", id: args.planned.sceneId },
    storyBeatId: args.planned.sceneId,
    visualIntentHash: args.planned.imagePlanFingerprint,
    promptHash: args.planned.promptHash,
    dependencySourceHash: stableHash(
      JSON.stringify({
        sceneHash: args.planned.sceneHash,
        imagePlanFingerprint: args.planned.imagePlanFingerprint,
        dependencyHashes: args.planned.dependencyHashes,
      })
    ),
    sourceLanguage: "en",
    targetLanguage: args.language,
    configurationHash: buildConfigurationHash({
      stageKind: "scene-images",
      variant: "short",
      model: args.planned.providerRequest.model,
      requestedSize: args.planned.providerRequest.size,
      quality: args.planned.providerRequest.quality,
      outputFormat: args.planned.providerRequest.outputFormat,
      endpoint,
    }),
    model: args.planned.providerRequest.model,
    size: args.planned.providerRequest.size,
    quality: args.planned.providerRequest.quality,
    dependencyHashes: args.planned.dependencyHashes,
    destination: deriveImageBatchDestinationIdentity({
      assetRole: "short-scene",
      episodeDir: args.episodeDir,
      outputPath: args.planned.outputPortraitPath,
    }),
  });
  const customId = buildImageBatchCustomId(identity);
  const job: ImageBatchJob = {
    identity,
    sceneId: args.planned.sceneId,
    sceneIndex: args.planned.sequenceNumber,
    positivePrompt: args.planned.providerRequest.prompt,
    characterIds: args.planned.referenceImages.map((reference) => reference.characterId),
    characterReferencePaths: dependencies.map((dependency) => dependency.sourcePath),
    dependencies,
    outputFormat: args.planned.providerRequest.outputFormat,
    expectedOutputPath: args.planned.outputPortraitPath,
    providerRequestHash: args.planned.providerRequestHash,
    generationConfigurationHash: buildConfigurationHash({
      stageKind: "scene-images",
      variant: "short",
      model: args.planned.providerRequest.model,
      requestedSize: args.planned.providerRequest.size,
      quality: args.planned.providerRequest.quality,
      outputFormat: args.planned.providerRequest.outputFormat,
      endpoint,
    }),
  };
  const requestLine: PlannedImageBatchRequestLine = {
    custom_id: customId,
    method: "POST",
    url: endpoint,
    body: {
      ...buildBaseRequestBody({
        model: args.planned.providerRequest.model,
        prompt: args.planned.providerRequest.prompt,
        requestedSize: args.planned.providerRequest.size,
        quality: args.planned.providerRequest.quality,
        outputFormat: args.planned.providerRequest.outputFormat,
      }),
      ...(endpoint === imageEditBatchEndpoint
        ? {
            image: dependencies.map((dependency) => {
              if (!dependency.openAIFileId) {
                throw unsupportedEditBatchRequestError({
                  sceneId: args.planned.sceneId,
                  dependencies,
                });
              }
              return dependency.openAIFileId;
            }),
          }
        : {}),
    },
  };
  const manifestItem = createImageBatchManifestItem({ job, customId });
  return {
    sceneId: args.planned.sceneId,
    sceneIndex: args.planned.sequenceNumber,
    promptPath: "",
    promptHash: args.planned.promptHash,
    providerRequestHash: args.planned.providerRequestHash,
    manifestPath: "",
    sceneManifest: {
      sceneId: args.planned.sceneId,
      promptVersion: 1,
      finalPrompt: args.planned.providerRequest.prompt,
      promptHash: args.planned.promptHash,
      providerRequestHash: args.planned.providerRequestHash,
      materialDifferencesFromPrevious: [],
      characterIds: args.planned.referenceImages.map((reference) => reference.characterId),
      referenceImages: dependencies.map((dependency) => ({
        characterId: dependency.assetIdentity.subject.id,
        path: dependency.sourcePath,
        sha256: dependency.sha256,
      })),
      model: args.planned.providerRequest.model,
      size: args.planned.providerRequest.size,
      quality: args.planned.providerRequest.quality,
      outputPath: args.planned.outputPortraitPath,
      status: "planned",
      attempts: 0,
    },
    job,
    requestLine,
    manifestItem,
  };
}

export async function prepareFullSceneImageBatches(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly languages: readonly string[];
  readonly variant: "full";
  readonly settings: ImageBatchPlannerSettings;
  readonly sceneIds?: readonly string[];
  readonly includeReferenceGroups?: boolean;
}): Promise<PreparedFullSceneBatchResult> {
  const normalizedLanguages = [
    ...new Set(args.languages.map((language) => normalizeLocaleCode(language))),
  ].sort((left, right) => left.localeCompare(right));
  const resolver = createEpisodePathResolver(path.dirname(args.episodeDir));
  const episodeId = normalizeEpisodeId(args.episodeId);
  const canonicalScenePlan = await loadCanonicalScenePlan({
    episodeDir: args.episodeDir,
    episodeId,
  });
  const selectedSceneIds = args.sceneIds?.length
    ? new Set(args.sceneIds.map((sceneId) => normalizeWhitespace(sceneId)).filter(Boolean))
    : undefined;
  const scenePlan: ScenePlan = {
    ...canonicalScenePlan,
    scenes: selectedSceneIds
      ? canonicalScenePlan.scenes.filter((scene) => selectedSceneIds.has(scene.id))
      : canonicalScenePlan.scenes,
  };
  const allGroups: PlannedImageBatchGroup[] = [];
  const writtenFiles: string[] = [];
  const firstLanguage = normalizedLanguages[0] ?? "en";

  for (const language of normalizedLanguages) {
    const localizationPath = resolver.narrationScript({
      episodeId,
      locale: language,
      variant: "full",
    });
    const resolvedLocalizationPath = assertInsideWorkspace(
      args.episodeDir,
      localizationPath
    );
    if (!(await fileExists(resolvedLocalizationPath))) {
      throw new ImageBatchPlannerError({
        code: "missing-localization",
        message: `Missing localized full script for ${episodeId}:${language}.`,
        details: { localizationPath: resolvedLocalizationPath, language },
      });
    }
  }

  const referenceGroups = args.includeReferenceGroups === false
    ? []
    : await planReferenceImageBatchForEpisode({
        episodeDir: args.episodeDir,
        episodeId,
        settings: args.settings,
        options: {
          language: firstLanguage,
          variant: "full",
        },
      });
  allGroups.push(...referenceGroups);

  for (const language of normalizedLanguages) {
    await planEpisodeImageGeneration(
      args.episodeDir,
      episodeId,
      scenePlan,
      plannerSettingsForPipeline(args.settings),
      {
        context: {
          identity: mediaStageIdentitySchema.parse({
            episodeId,
            language,
            locale: language,
            variant: "full",
            owner: "image-plan",
          }),
          narration: buildMediaStageDependency({
            owner: "narration",
            episodeId,
            language,
            locale: language,
            variant: "full",
            fingerprint: hashText(`${episodeId}:narration:${language}:full`),
            status: "ready",
          }),
        },
      }
    );
    const planned = await planImageBatchForEpisode({
      episodeDir: args.episodeDir,
      episodeId,
      scenePlan,
      settings: args.settings,
      options: {
        language,
        variant: "full",
      },
    });
    allGroups.push(...planned);
  }

  const allScenePlans = applySharedOutputPolicyToScenePlans(
    allGroups.flatMap((group) => group.scenePlans)
  );
  const skippedSceneIds = [
    ...new Set(
      allGroups.flatMap((group) => group.skippedSceneIds)
    ),
  ].sort((left, right) => left.localeCompare(right));

  validateUniquePlans(
    [
      ...referenceGroups.flatMap((group) =>
        group.referencePlans.map((plan) => ({
          customId: plan.requestLine.custom_id,
          identityHash: plan.job.identity.identityHash,
          expectedOutputPath: plan.job.expectedOutputPath,
          subjectDescription: `${plan.job.identity.subject.kind}:${plan.job.identity.subject.id}:${plan.job.identity.language}`,
        }))
      ),
      ...allScenePlans.map((plan) => ({
        customId: plan.manifestItem.customId,
        identityHash: plan.job.identity.identityHash,
        expectedOutputPath: plan.job.expectedOutputPath,
        subjectDescription: `${plan.job.identity.subject.kind}:${plan.job.identity.subject.id}:${plan.job.identity.language}`,
        ...(plan.manifestItem.sharedOutputKey
          ? { sharedOutputKey: plan.manifestItem.sharedOutputKey }
          : {}),
      })),
    ]
  );

  const generationOwners = allScenePlans.filter(
    (plan) =>
      scenePlanOwnsProviderRequest(plan) &&
      plan.requestLine.url === imageGenerationBatchEndpoint
  );
  const editOwners = allScenePlans.filter(
    (plan) =>
      scenePlanOwnsProviderRequest(plan) &&
      plan.requestLine.url === imageEditBatchEndpoint
  );
  const sceneGroups: PlannedImageBatchGroup[] = [];
  const buildSceneGroups = async (
    owners: readonly PlannedImageBatchScene[],
    endpoint: "/v1/images/generations" | "/v1/images/edits"
  ): Promise<void> => {
    if (owners.length === 0) {
      return;
    }
    const chunks = splitByLimit(owners, args.settings.maxRequestsPerBatch);
    for (const [index, chunk] of chunks.entries()) {
      const ownerCustomIds = new Set(chunk.map((plan) => scenePlanCustomId(plan)));
      const chunkPlans = allScenePlans
        .filter((plan) => ownerCustomIds.has(scenePlanSharedOutputOwnerCustomId(plan)))
        .sort((left, right) => scenePlanCustomId(left).localeCompare(scenePlanCustomId(right)));
      sceneGroups.push(
        await buildPlannedGroup({
          batchRoot: resolveEpisodeImageStateDir(args.episodeDir),
          stageKind: "scene-images",
          language: firstLanguage,
          variant: "full",
          settings: args.settings,
          splitGroupIndex: index,
          splitGroupCount: chunks.length,
          endpoint,
          scenePlans: chunkPlans,
          skippedSceneIds,
        })
      );
    }
  };
  await buildSceneGroups(generationOwners, imageGenerationBatchEndpoint);
  await buildSceneGroups(editOwners, imageEditBatchEndpoint);
  if (generationOwners.length === 0 && editOwners.length === 0) {
    sceneGroups.push(
      await buildPlannedGroup({
        batchRoot: resolveEpisodeImageStateDir(args.episodeDir),
        stageKind: "scene-images",
        language: firstLanguage,
        variant: "full",
        settings: args.settings,
        splitGroupIndex: 0,
        splitGroupCount: 1,
        skippedSceneIds,
      })
    );
  }

  const groups = [
    ...referenceGroups,
    ...sceneGroups,
  ];
  writtenFiles.push(
    ...(
      await Promise.all(
        groups.map((group) => writePreparedGroup({ group, settings: args.settings }))
      )
    ).flat()
  );

  return {
    episodeId,
    languages: normalizedLanguages,
    variant: "full",
    groups,
    stagePreviews: [
      ...stagePreviewsForReferenceGroups({
        language: firstLanguage,
        variant: "full",
        settings: args.settings,
        groups: referenceGroups,
      }),
      ...stagePreviewsForSceneGroups({
        language: firstLanguage,
        variant: "full",
        settings: args.settings,
        groups: sceneGroups,
      }),
    ],
    writtenFiles,
  };
}

export async function prepareShortSceneImageBatches(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly languages: readonly string[];
  readonly variant: "short";
  readonly settings: ImageBatchPlannerSettings;
  readonly sceneIds?: readonly string[];
}): Promise<PreparedShortSceneBatchResult> {
  const normalizedLanguages = [
    ...new Set(args.languages.map((language) => normalizeLocaleCode(language))),
  ].sort((left, right) => left.localeCompare(right));
  const ownerLanguage = normalizedLanguages[0]!;
  const resolver = createEpisodePathResolver(path.dirname(args.episodeDir));
  const selectedSceneIds = args.sceneIds?.length
    ? new Set(args.sceneIds.map((sceneId) => normalizeWhitespace(sceneId)).filter(Boolean))
    : undefined;
  const registry = await loadEpisodeCharacterRegistry(args.episodeDir, args.episodeId);
  const nativePlansByLanguage = await Promise.all(
    normalizedLanguages.map(async (language) => {
      const localizationPath = resolver.narrationScript({
        episodeId: normalizeEpisodeId(args.episodeId),
        locale: language,
        variant: "short",
      });
      if (!(await fileExists(localizationPath))) {
        throw new ImageBatchPlannerError({
          code: "missing-localization",
          message: `Missing localized short script for ${args.episodeId}:${language}.`,
          details: { localizationPath, language },
        });
      }
      const loadedScenePlan = await loadShortScenePlan({
        episodeDir: args.episodeDir,
        episodeId: args.episodeId,
        language,
      });
      const scenePlan: ScenePlan = {
        ...loadedScenePlan,
        scenes: selectedSceneIds
          ? loadedScenePlan.scenes.filter((scene) => selectedSceneIds.has(scene.id))
          : loadedScenePlan.scenes,
      };
      const shortPlan = await planShortsImageWork({
        episodeDir: args.episodeDir,
        episodeId: args.episodeId,
        scenePlan,
        config: defaultShortsImageConfig(scenePlan.scenes.length),
        landscapeDir: path.join(args.episodeDir, "shared", "images", "generated"),
        outputDir: path.join(args.episodeDir, "shared", "short", "images", "generated"),
      });
      const blockedItems = shortPlan.items.filter(
        (item): item is Extract<PlannedShortsItem, { kind: "blocked" }> =>
          item.kind === "blocked"
      );
      if (blockedItems.length > 0) {
        const first = blockedItems[0]!;
        const code =
          first.error.includes("Missing landscape image")
            ? "missing-short-source-image"
            : first.error.includes("Invalid portrait dimensions")
              ? "invalid-short-portrait-dimensions"
              : "stale-short-source-hash";
        throw new ImageBatchPlannerError({
          code,
          message: `Unable to prepare short image batch for ${args.episodeId}:${language}.`,
          details: {
            language,
            blockedItems: blockedItems.map((item) => ({
              sceneId: item.sceneId,
              strategy: item.batchStrategy,
              error: item.error,
              outputPortraitPath: item.outputPortraitPath,
            })),
          },
        });
      }
      const plans = await Promise.all(
        shortPlan.items
          .filter(
            (item): item is PlannedShortsNativeGenerationItem =>
              item.kind === "native-generation"
          )
          .map((planned) =>
            buildShortNativeScenePlan({
              episodeDir: args.episodeDir,
              episodeId: args.episodeId,
              language,
              planned,
              registry,
            })
          )
      );
      return {
        language,
        shortPlan,
        plans,
      };
    })
  );
  const nativePlans = [
    ...applyShortSharedPortraitAliasPolicy(
      nativePlansByLanguage.flatMap((entry) => entry.plans)
    ),
  ];
  nativePlans.sort((left, right) =>
    left.requestLine.custom_id.localeCompare(right.requestLine.custom_id)
  );
  validateUniquePlans(
    nativePlans.map((plan) => {
      const sharedOutputKey = plan.manifestItem.sharedOutputKey;
      return {
        customId: plan.requestLine.custom_id,
        identityHash: plan.job.identity.identityHash,
        expectedOutputPath: plan.job.expectedOutputPath,
        subjectDescription: `${plan.job.identity.subject.kind}:${plan.job.identity.subject.id}`,
        ...(sharedOutputKey ? { sharedOutputKey } : {}),
      };
    })
  );

  const groups: PlannedImageBatchGroup[] =
    nativePlans.length === 0
      ? [
          await buildPlannedGroup({
            batchRoot: resolveEpisodeImageStateDir(args.episodeDir),
            stageKind: "scene-images",
            language: ownerLanguage,
            variant: "short",
            settings: args.settings,
            splitGroupIndex: 0,
            splitGroupCount: 1,
            skippedSceneIds: nativePlansByLanguage.flatMap((entry) => entry.shortPlan.items)
              .filter((item): item is PlannedShortsReuseItem => item.kind === "reuse")
              .map((item) => item.sceneId),
          }),
        ]
      : await Promise.all(
          splitByLimit(nativePlans, args.settings.maxRequestsPerBatch).map(
            (chunk, index, chunks) =>
              buildPlannedGroup({
                batchRoot: resolveEpisodeImageStateDir(args.episodeDir),
                stageKind: "scene-images",
                language: ownerLanguage,
                variant: "short",
                settings: args.settings,
                splitGroupIndex: index,
                splitGroupCount: chunks.length,
                ...(chunk[0]?.requestLine.url
                  ? { endpoint: chunk[0].requestLine.url }
                  : {}),
                scenePlans: chunk,
                skippedSceneIds: nativePlansByLanguage.flatMap((entry) => entry.shortPlan.items)
                  .filter((item): item is PlannedShortsReuseItem => item.kind === "reuse")
                  .map((item) => item.sceneId),
              })
          )
        );
  const writtenFiles = (
    await Promise.all(groups.map((group) => writePreparedGroup({ group, settings: args.settings })))
  ).flat();
  const localWorkPlanPath = path.join(
    resolveEpisodeImageStateDir(args.episodeDir),
    `shorts-local-work.${normalizedLanguages.length === 1 ? ownerLanguage : "shared"}.json`
  );
  const allShortItems = nativePlansByLanguage.flatMap((entry) => entry.shortPlan.items);
  const deterministicTransforms = allShortItems.filter(
    (item): item is PlannedShortsDeterministicTransformItem =>
      item.kind === "deterministic-transform"
  );
  const cacheReuse = allShortItems.filter(
    (item): item is PlannedShortsReuseItem => item.kind === "reuse"
  );
  await writeJsonAtomic(localWorkPlanPath, {
    episodeId: args.episodeId,
    language: normalizedLanguages.length === 1 ? ownerLanguage : "shared",
    languages: normalizedLanguages,
    variant: "short",
    deterministicTransforms,
    cacheReuse,
  });
  writtenFiles.push(localWorkPlanPath);
  return {
    episodeId: normalizeEpisodeId(args.episodeId),
    languages: normalizedLanguages,
    variant: "short",
    groups,
    stagePreviews: stagePreviewsForSceneGroups({
      language: ownerLanguage,
      variant: "short",
      settings: args.settings,
      groups,
    }),
    writtenFiles,
    localWorkPlan: {
      manifestPath: localWorkPlanPath,
      deterministicTransforms,
      cacheReuse,
    },
    previewCounts: {
      paidNativeGenerations: nativePlansByLanguage.reduce(
        (total, entry) => total + entry.shortPlan.counts.nativeGeneration,
        0
      ),
      freeLocalTransforms: nativePlansByLanguage.reduce(
        (total, entry) => total + entry.shortPlan.counts.deterministicTransforms,
        0
      ),
      cacheHits: nativePlansByLanguage.reduce(
        (total, entry) => total + entry.shortPlan.counts.cacheReuse,
        0
      ),
      blocked: nativePlansByLanguage.reduce(
        (total, entry) => total + entry.shortPlan.counts.blocked,
        0
      ),
    },
  };
}
