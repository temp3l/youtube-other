import fs from "node:fs/promises";
import path from "node:path";
import {
  fileExists,
  hashFile,
  hashText,
  normalizeContentVariant,
  normalizeLocaleCode,
  normalizeWhitespace,
  resolveEpisodeCharacterReferencePath,
  resolveEpisodeImageManifestPath,
  resolveEpisodeImageStateDir,
  resolveEpisodeImagePromptPath,
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
  loadEpisodeCharacterRegistry,
  loadEpisodeSceneManifest,
  type CharacterDefinition,
  type CharacterRegistry,
  type SceneGenerationManifest,
} from "./episode-image-pipeline.js";
import {
  createImageBatchManifestItem,
  createImageBatchStoragePlan,
  writeImageBatchInputFile,
  writeImageBatchManifest,
  type ImageBatchStoragePlan,
} from "./image-batch-storage.js";

export interface ImageBatchPlannerSettings {
  readonly model: string;
  readonly requestedSize: string;
  readonly quality: "low" | "medium" | "high" | "auto";
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly force?: boolean;
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
    | "stale-dependency-hash";
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
  readonly writtenFiles: readonly string[];
}

function stableHash(value: string): string {
  return hashText(value);
}

function buildConfigurationHash(args: {
  readonly stageKind: PlannedImageBatchGroup["stageKind"];
  readonly language: string;
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
      language: args.language,
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
    assetRole: "character-reference",
    operation: "generation",
    subject: { kind: "character", id: args.character.id },
    promptHash: args.promptHash,
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
      language: args.language,
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
  readonly images: ReadonlyArray<{ readonly file_id: string }>;
}> {
  const dependencies: ImageBatchDependency[] = [];
  const images: Array<{ readonly file_id: string }> = [];

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

    if (!character.referenceFileId) {
      throw new ImageBatchPlannerError({
        code: "unsupported-edit-batch-request",
        message: `Reference-assisted batch scene ${args.sceneId} cannot be prepared without a provider file ID for character ${character.id}.`,
        details: {
          sceneId: args.sceneId,
          characterId: character.id,
          sourcePath,
        },
      });
    }

    const promptHash = stableHash(buildCharacterReferencePrompt(character));
    dependencies.push({
      role: "character-reference",
      approvalStatus: character.referenceStatus,
      sourcePath,
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
    images.push({ file_id: character.referenceFileId });
  }

  return { dependencies, images };
}

async function buildSceneJob(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly sceneManifest: SceneGenerationManifest;
  readonly registry: CharacterRegistry;
  readonly settings: ImageBatchPlannerSettings;
}): Promise<PlannedImageBatchScene> {
  const { prompt, promptPath } = await readPromptText(
    args.episodeDir,
    args.sceneId,
    args.sceneManifest
  );
  const { dependencies, images } = await resolveSceneDependencies({
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
  const identity = createImageBatchAssetIdentity({
    episodeId: args.episodeId,
    language: args.language,
    variant: args.variant,
    assetRole: args.variant === "short" ? "short-scene" : "full-scene",
    operation,
    subject: { kind: "scene", id: args.sceneId },
    promptHash,
    model: args.settings.model,
    size: args.settings.requestedSize,
    quality: args.settings.quality,
    dependencyHashes: dependencies.map((dependency) => dependency.sha256),
    destination: deriveImageBatchDestinationIdentity({
      assetRole: args.variant === "short" ? "short-scene" : "full-scene",
      episodeDir: args.episodeDir,
      outputPath: args.sceneManifest.outputPath,
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
    expectedOutputPath: args.sceneManifest.outputPath,
    providerRequestHash,
    generationConfigurationHash: buildConfigurationHash({
      stageKind: "scene-images",
      language: args.language,
      variant: args.variant,
      model: args.settings.model,
      requestedSize: args.settings.requestedSize,
      quality: args.settings.quality,
      outputFormat: args.settings.outputFormat,
      endpoint,
    }),
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
      ...(isEdit ? { images } : {}),
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
  }>
): void {
  const identityHashes = new Set<string>();
  const customIds = new Set<string>();
  const destinationPaths = new Set<string>();
  for (const plan of plans) {
    if (identityHashes.has(plan.identityHash)) {
      throw new Error(
        `Duplicate image batch identity detected for ${plan.subjectDescription}.`
      );
    }
    identityHashes.add(plan.identityHash);
    if (customIds.has(plan.customId)) {
      throw new Error(
        `Duplicate image batch custom_id detected: ${plan.customId}.`
      );
    }
    customIds.add(plan.customId);
    const normalizedDestinationPath = normalizeImageBatchDestinationPath(
      plan.expectedOutputPath
    );
    if (destinationPaths.has(normalizedDestinationPath)) {
      throw new Error(
        `Duplicate image batch destination path detected: ${plan.expectedOutputPath}.`
      );
    }
    destinationPaths.add(normalizedDestinationPath);
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
  readonly endpoint?: "/v1/images/generations" | "/v1/images/edits";
  readonly referencePlans?: readonly PlannedImageBatchReference[];
  readonly scenePlans?: readonly PlannedImageBatchScene[];
  readonly skippedSceneIds?: readonly string[];
}): Promise<PlannedImageBatchGroup> {
  return {
    groupKey: buildConfigurationHash({
      stageKind: args.stageKind,
      language: args.language,
      variant: args.variant,
      model: args.settings.model,
      requestedSize: args.settings.requestedSize,
      quality: args.settings.quality,
      outputFormat: args.settings.outputFormat,
      ...(args.endpoint ? { endpoint: args.endpoint } : {}),
    }),
    stageKind: args.stageKind,
    outputDirectory: args.batchRoot,
    storagePlan: await createImageBatchStoragePlan(args.batchRoot),
    referencePlans: args.referencePlans ?? [],
    scenePlans: args.scenePlans ?? [],
    skippedSceneIds: args.skippedSceneIds ?? [],
  };
}

function groupRequestLines(group: PlannedImageBatchGroup): readonly PlannedImageBatchRequestLine[] {
  return group.stageKind === "reference-images"
    ? group.referencePlans.map((plan) => plan.requestLine)
    : group.scenePlans.map((plan) => plan.requestLine);
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
        endpoint: "/v1/images/generations",
      }),
    ];
  }

  return [
    await buildPlannedGroup({
      batchRoot,
      stageKind: "reference-images",
      language,
      variant,
      settings: args.settings,
      endpoint: "/v1/images/generations",
      referencePlans: plannedReferences,
    }),
  ];
}

export async function planImageBatchForEpisode(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly scenePlan: {
    readonly scenes: ReadonlyArray<{
      readonly id: string;
      readonly sequenceNumber: number;
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
      sceneManifest,
      registry,
      settings: args.settings,
    });
    const outputExists = await fileExists(sceneManifest.outputPath);
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
        skippedSceneIds,
      }),
    ];
  }

  const groups: PlannedImageBatchGroup[] = [];
  if (generationPlans.length > 0) {
    groups.push(
      await buildPlannedGroup({
        batchRoot,
        stageKind: "scene-images",
        language,
        variant,
        settings: args.settings,
        endpoint: "/v1/images/generations",
        scenePlans: generationPlans,
        skippedSceneIds,
      })
    );
  }
  if (editPlans.length > 0) {
    groups.push(
      await buildPlannedGroup({
        batchRoot,
        stageKind: "scene-images",
        language,
        variant,
        settings: args.settings,
        endpoint: "/v1/images/edits",
        scenePlans: editPlans,
        skippedSceneIds,
      })
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
  return { groups, writtenFiles };
}

export async function prepareImageBatchForEpisode(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly scenePlan: {
    readonly scenes: ReadonlyArray<{
      readonly id: string;
      readonly sequenceNumber: number;
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
  return { groups, writtenFiles };
}
