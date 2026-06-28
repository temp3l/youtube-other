import fs from "node:fs/promises";
import path from "node:path";
import {
  fileExists,
  hashText,
  normalizeWhitespace,
} from "@mediaforge/shared";
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
}

export interface PlannedImageBatchScene {
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly promptPath: string;
  readonly promptHash: string;
  readonly manifestPath: string;
  readonly sceneManifest: SceneGenerationManifest;
  readonly job: SceneImageJob;
  readonly requestLine: {
    readonly custom_id: string;
    readonly method: "POST";
    readonly url: "/v1/images/generations";
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
  readonly model: string;
  readonly requestedSize: string;
  readonly quality: string;
  readonly outputFormat: string;
}): string {
  return stableHash(
    JSON.stringify({
      model: args.model,
      requestedSize: args.requestedSize,
      quality: args.quality,
      outputFormat: args.outputFormat,
    })
  );
}

function buildCustomId(args: {
  readonly episodeNumber: string;
  readonly sceneId: string;
  readonly promptHash: string;
  readonly configurationHash: string;
}): string {
  return [
    "dte-img",
    args.episodeNumber,
    "en",
    "full",
    args.sceneId,
    args.promptHash.slice(0, 8),
    args.configurationHash.slice(0, 8),
  ].join(":");
}

function promptFilePath(episodeDir: string, sceneId: string): string {
  return path.join(episodeDir, "state", "image-generation", "prompts", `${sceneId}.txt`);
}

function normalizePrompt(value: string): string {
  return normalizeWhitespace(value).trim();
}

async function readPromptText(
  episodeDir: string,
  sceneId: string,
  sceneManifest: SceneGenerationManifest
): Promise<{ readonly prompt: string; readonly promptPath: string }> {
  const promptPath = promptFilePath(episodeDir, sceneId);
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
    model: args.settings.model,
    requestedSize: args.settings.requestedSize,
    quality: args.settings.quality,
    outputFormat: args.settings.outputFormat,
  });
  const customId = buildCustomId({
    episodeNumber: args.episodeId,
    sceneId: args.sceneId,
    promptHash,
    configurationHash,
  });
  const job: SceneImageJob = {
    episodeNumber: args.episodeId,
    episodeSlug: args.episodeId,
    language: "en",
    format: "full",
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
    model: args.settings.model,
    quality: args.settings.quality,
    requestedSize: args.settings.requestedSize,
    outputFormat: args.settings.outputFormat,
    expectedOutputPath: args.sceneManifest.outputPath,
    promptHash,
    generationConfigurationHash: configurationHash,
  };
  const requestLine = {
    custom_id: customId,
    method: "POST" as const,
    url: "/v1/images/generations" as const,
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
    outputFormat: args.settings.outputFormat,
    quality: args.settings.quality,
    characterReferenceHashes: args.sceneManifest.referenceImages.map(
      (entry) => entry.sha256
    ),
  });
  return {
    sceneId: args.sceneId,
    sceneIndex: args.sceneIndex,
    promptPath,
    promptHash,
    manifestPath: path.join(
      args.episodeDir,
      "state",
      "image-generation",
      "manifests",
      `${args.sceneId}.json`
    ),
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
  const selectedIds = args.options?.sceneIds?.length
    ? new Set(
        args.options.sceneIds
          .map((entry) => normalizeWhitespace(entry))
          .filter((entry) => entry.length > 0)
      )
    : undefined;
  const batchRoot = path.join(args.episodeDir, "state", "image-generation");
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
    const outputExists = await fileExists(sceneManifest.outputPath);
    const isReusable =
      !args.settings.force &&
      sceneManifest.status === "generated" &&
      outputExists &&
      sceneManifest.promptHash.length > 0 &&
      sceneManifest.model === args.settings.model &&
      sceneManifest.size === args.settings.requestedSize &&
      sceneManifest.quality === args.settings.quality;
    if (isReusable) {
      skippedSceneIds.push(scene.id);
      continue;
    }
    plannedScenes.push(
      await buildSceneJob({
        episodeDir: args.episodeDir,
        episodeId: args.episodeId,
        sceneId: scene.id,
        sceneIndex: scene.sequenceNumber,
        sceneManifest,
        settings: args.settings,
      })
    );
  }
  if (plannedScenes.length === 0) {
    return [
      {
        groupKey: buildConfigurationHash({
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
      schemaVersion: "image-batch-v1",
      category: "image-generation",
      localBatchId: group.storagePlan.localBatchId,
      rootLocalBatchId: group.storagePlan.localBatchId,
      retryNumber: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endpoint: "/v1/images/generations",
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
