import fs from "node:fs/promises";
import path from "node:path";
import {
  fileExists,
  hashText,
  normalizeWhitespace,
  normalizeContentVariant,
  normalizeLocaleCode,
  resolveEpisodeImageManifestPath,
  resolveEpisodeImagePromptPath,
  resolveEpisodeImageStateDir,
} from "@mediaforge/shared";
import {
  buildImageBatchCustomId,
  createImageBatchAssetIdentity,
  deriveImageBatchDestinationIdentity,
  endpointForImageBatchOperation,
  normalizeImageBatchDestinationPath,
} from "./image-batch-identity.js";
import {
  type ImageBatchManifest,
  type ImageBatchManifestItem,
  type SceneImageJob,
} from "./image-batch.types.js";
import {
  loadEpisodeSceneManifest,
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
  readonly force?: boolean;
}

export interface ImageBatchPlannerOptions {
  readonly sceneId?: string;
  readonly sceneIds?: readonly string[];
  readonly language?: string;
  readonly variant?: "full" | "short";
}

export interface PlannedImageBatchScene {
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly promptPath: string;
  readonly promptHash: string;
  readonly providerRequestHash: string;
  readonly manifestPath: string;
  readonly sceneManifest: SceneGenerationManifest;
  readonly job: SceneImageJob;
  readonly requestLine: {
    readonly custom_id: string;
    readonly method: "POST";
    readonly url: "/v1/images/generations" | "/v1/images/edits";
    readonly body: Record<string, unknown>;
  };
  readonly manifestItem: ImageBatchManifestItem;
}

export interface PlannedImageBatchGroup {
  readonly groupKey: string;
  readonly outputDirectory: string;
  readonly storagePlan: ImageBatchStoragePlan;
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
  readonly language: string;
  readonly variant: string;
  readonly model: string;
  readonly requestedSize: string;
  readonly quality: string;
  readonly outputFormat: string;
}): string {
  return stableHash(
    JSON.stringify({
      language: args.language,
      variant: args.variant,
      model: args.model,
      requestedSize: args.requestedSize,
      quality: args.quality,
      outputFormat: args.outputFormat,
    })
  );
}

function buildProviderRequestHash(args: {
  readonly model: string;
  readonly prompt: string;
  readonly requestedSize: string;
  readonly quality: string;
  readonly outputFormat: string;
  readonly characterReferenceHashes: readonly string[];
}): string {
  return stableHash(
    JSON.stringify({
      operation: "image-generation",
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

async function buildSceneJob(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly sceneManifest: SceneGenerationManifest;
  readonly settings: ImageBatchPlannerSettings;
}): Promise<PlannedImageBatchScene> {
  const { prompt, promptPath } = await readPromptText(
    args.episodeDir,
    args.sceneId,
    args.sceneManifest
  );
  const promptHash = stableHash(prompt);
  const configurationHash = buildConfigurationHash({
    language: args.language,
    variant: args.variant,
    model: args.settings.model,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
  });
  const characterReferenceHashes = args.sceneManifest.referenceImages.map(
    (entry) => entry.sha256
  );
  const providerRequestHash = buildProviderRequestHash({
    model: args.settings.model,
    prompt,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
    characterReferenceHashes,
  });
  const identity = createImageBatchAssetIdentity({
    episodeId: args.episodeId,
    language: args.language,
    variant: args.variant,
    assetRole: args.variant === "short" ? "short-scene" : "full-scene",
    operation: "generation",
    subject: { kind: "scene", id: args.sceneId },
    promptHash,
    model: args.settings.model,
    size: args.settings.requestedSize,
    quality: args.settings.quality,
    dependencyHashes: characterReferenceHashes,
    destination: deriveImageBatchDestinationIdentity({
      assetRole: args.variant === "short" ? "short-scene" : "full-scene",
      episodeDir: args.episodeDir,
      outputPath: args.sceneManifest.outputPath,
    }),
  });
  const customId = buildImageBatchCustomId(identity);
  const job: SceneImageJob = {
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
    characterReferencePaths: args.sceneManifest.referenceImages.map(
      (entry) => entry.path
    ),
    outputFormat: args.settings.outputFormat,
    expectedOutputPath: args.sceneManifest.outputPath,
    providerRequestHash,
    generationConfigurationHash: configurationHash,
  };
  const endpoint = endpointForImageBatchOperation(identity.operation);
  if (!endpoint) {
    throw new Error(
      `Unsupported image batch operation ${identity.operation} for ${identity.subject.kind}:${identity.subject.id}.`
    );
  }
  const requestLine = {
    custom_id: customId,
    method: "POST" as const,
    url: endpoint,
    body: {
      model: args.settings.model,
      prompt,
      n: 1,
      size: args.settings.requestedSize,
      quality: args.settings.quality,
      output_format: args.settings.outputFormat,
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
  const selectedIds = args.options?.sceneIds?.length
    ? new Set(
        args.options.sceneIds
          .map((entry) => normalizeWhitespace(entry))
          .filter((entry) => entry.length > 0)
      )
    : undefined;
  const batchRoot = resolveEpisodeImageStateDir(args.episodeDir);
  const storagePlan = await createImageBatchStoragePlan(batchRoot);
  const plannedScenes: PlannedImageBatchScene[] = [];
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
    const { prompt } = await readPromptText(
      args.episodeDir,
      scene.id,
      sceneManifest
    );
    const providerRequestHash = buildProviderRequestHash({
      model: args.settings.model,
      prompt,
      requestedSize: args.settings.requestedSize,
      quality: args.settings.quality,
      outputFormat: args.settings.outputFormat,
      characterReferenceHashes: sceneManifest.referenceImages.map(
        (entry) => entry.sha256
      ),
    });
    const outputExists = await fileExists(sceneManifest.outputPath);
    const isReusable =
      !args.settings.force &&
      sceneManifest.status === "generated" &&
      outputExists &&
      sceneManifest.providerRequestHash === providerRequestHash;
    if (isReusable) {
      skippedSceneIds.push(scene.id);
      continue;
    }
    plannedScenes.push(
      await buildSceneJob({
        episodeDir: args.episodeDir,
        episodeId: args.episodeId,
        language,
        variant,
        sceneId: scene.id,
        sceneIndex: scene.sequenceNumber,
        sceneManifest,
        settings: args.settings,
      })
    );
  }
  plannedScenes.sort((left, right) =>
    left.requestLine.custom_id.localeCompare(right.requestLine.custom_id)
  );
  skippedSceneIds.sort((left, right) => left.localeCompare(right));
  const identityHashes = new Set<string>();
  const customIds = new Set<string>();
  const destinationPaths = new Set<string>();
  for (const plannedScene of plannedScenes) {
    if (identityHashes.has(plannedScene.job.identity.identityHash)) {
      throw new Error(
        `Duplicate image batch identity detected for ${plannedScene.job.identity.subject.kind}:${plannedScene.job.identity.subject.id}.`
      );
    }
    identityHashes.add(plannedScene.job.identity.identityHash);
    if (customIds.has(plannedScene.requestLine.custom_id)) {
      throw new Error(
        `Duplicate image batch custom_id detected: ${plannedScene.requestLine.custom_id}.`
      );
    }
    customIds.add(plannedScene.requestLine.custom_id);
    const normalizedDestinationPath = normalizeImageBatchDestinationPath(
      plannedScene.job.expectedOutputPath
    );
    if (destinationPaths.has(normalizedDestinationPath)) {
      throw new Error(
        `Duplicate image batch destination path detected: ${plannedScene.job.expectedOutputPath}.`
      );
    }
    destinationPaths.add(normalizedDestinationPath);
  }
  if (plannedScenes.length === 0) {
    return [
      {
        groupKey: buildConfigurationHash({
          language,
          variant,
          model: args.settings.model,
          requestedSize: args.settings.requestedSize,
          quality: args.settings.quality,
          outputFormat: args.settings.outputFormat,
        }),
        outputDirectory: batchRoot,
        storagePlan,
        scenePlans: [],
        skippedSceneIds,
      },
    ];
  }
  const groupKey = buildConfigurationHash({
    language,
    variant,
    model: args.settings.model,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
  });
  return [
    {
      groupKey,
      outputDirectory: batchRoot,
      storagePlan,
      scenePlans: plannedScenes,
      skippedSceneIds,
    },
  ];
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
  const writtenFiles: string[] = [];
  for (const group of groups) {
    if (group.scenePlans.length === 0) {
      continue;
    }
    const requestLines = group.scenePlans.map((scenePlan) => scenePlan.requestLine);
    const { inputFilePath, inputFileHash } = await writeImageBatchInputFile(
      group.storagePlan,
      requestLines.map((line) => JSON.stringify(line))
    );
    const manifest: ImageBatchManifest = {
      schemaVersion: "image-batch-v2",
      category: "image-generation",
      localBatchId: group.storagePlan.localBatchId,
      rootLocalBatchId: group.storagePlan.localBatchId,
      retryNumber: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endpoint: group.scenePlans[0]?.requestLine.url ?? "/v1/images/generations",
      model: args.settings.model,
      completionWindow: "24h",
      inputFilePath,
      inputFileHash,
      status: "prepared",
      items: group.scenePlans.map((scenePlan) => scenePlan.manifestItem),
    };
    await writeImageBatchManifest(group.storagePlan, manifest);
    writtenFiles.push(inputFilePath, group.storagePlan.manifestPath);
  }
  return { groups, writtenFiles };
}
