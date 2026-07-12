import fs from "node:fs/promises";
import path from "node:path";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  buildWorkspacePlannedStoryWorkflowManifest,
  buildStoryProductionStatusReport,
  resolveStoryProductionAnalysisStatus,
  StoryWorkflowManifestStore,
  type StoryWorkflowManifest,
  type StoryProductionStatusReport,
  type WorkflowId,
} from "@mediaforge/story-localization";
import {
  createEpisodePathResolver,
  fileExists,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  resolveAuthoredScript,
} from "@mediaforge/shared";

export interface StoryWorkflowSelectionOptions {
  readonly episode?: string;
  readonly episodes?: string;
  readonly workflow?: string;
  readonly outputRoot?: string;
}

export interface LoadedProductionStatus {
  readonly manifest: StoryWorkflowManifest;
  readonly report: StoryProductionStatusReport;
}

export function splitCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function collectEpisodes(
  options: StoryWorkflowSelectionOptions
): string[] {
  const episodes = [
    ...(options.episode ? [options.episode.trim()] : []),
    ...splitCsv(options.episodes),
  ].filter((entry) => entry.length > 0);
  if (episodes.length === 0) {
    throw new Error("Provide --episode or --episodes.");
  }
  return [...new Set(episodes)];
}

export function workspaceRootFromOutputRoot(outputRoot: string): string {
  return path.basename(outputRoot) === "episodes"
    ? path.dirname(outputRoot)
    : outputRoot;
}

async function loadLatestWorkflowId(
  store: StoryWorkflowManifestStore
): Promise<WorkflowId> {
  const directory = store.paths.workflowsDir;
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    const record = error as NodeJS.ErrnoException;
    if (record.code === "ENOENT") {
      throw new Error(`No workflow manifests found for ${store.episodeId}.`);
    }
    throw error;
  }
  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const workflowId = entry.slice(0, -".json".length) as WorkflowId;
        const manifest = await store.load(workflowId);
        return manifest ? { workflowId, manifest } : null;
      })
  );
  const latest = manifests
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) =>
      right.manifest.updatedAt.localeCompare(left.manifest.updatedAt)
    )[0];
  if (!latest) {
    throw new Error(`No workflow manifests found for ${store.episodeId}.`);
  }
  return latest.workflowId;
}

function markStageCompleted(
  manifest: StoryWorkflowManifest,
  stageId: string
): StoryWorkflowManifest {
  return {
    ...manifest,
    stages: manifest.stages.map((stage) =>
      stage.stageId === stageId
        ? {
            ...stage,
            status: "succeeded",
            outcomeKind: "completed",
          }
        : stage
    ),
  };
}

async function directoryHasFiles(directory: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.some((entry) => entry.isFile());
  } catch (error) {
    const record = error as NodeJS.ErrnoException;
    if (record.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function fullImagesReady(
  resolver: ReturnType<typeof createEpisodePathResolver>,
  episodeId: string
): Promise<boolean> {
  const normalizedEpisodeId = normalizeEpisodeId(episodeId);
  const manifestPath = resolver.canonicalVisualManifest(normalizedEpisodeId, "full");
  if (!(await fileExists(manifestPath))) {
    return false;
  }
  try {
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      readonly scenes?: readonly { readonly imagePath?: string }[];
    };
    const imagePaths = (raw.scenes ?? [])
      .map((scene) => scene.imagePath)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    return (
      imagePaths.length > 0 &&
      (
        await Promise.all(
          imagePaths.map((imagePath) =>
            fileExists(path.join(resolver.episodeRoot(normalizedEpisodeId), imagePath))
          )
        )
      ).every(Boolean)
    );
  } catch {
    return false;
  }
}

function currentLocaleVariantRoot(args: {
  readonly resolver: ReturnType<typeof createEpisodePathResolver>;
  readonly episodeId: string;
  readonly locale: string;
  readonly format: string;
}): string {
  return path.join(
    args.resolver.episodeRoot(normalizeEpisodeId(args.episodeId)),
    normalizeLocaleCode(args.locale),
    normalizeContentVariant(args.format)
  );
}

function currentSharedScenePlanPath(
  resolver: ReturnType<typeof createEpisodePathResolver>,
  episodeId: string
): string {
  return path.join(
    resolver.episodeRoot(normalizeEpisodeId(episodeId)),
    "shared",
    "scenes.json"
  );
}

function currentSharedVisualPlanPath(
  resolver: ReturnType<typeof createEpisodePathResolver>,
  episodeId: string
): string {
  return path.join(
    resolver.episodeRoot(normalizeEpisodeId(episodeId)),
    "shared",
    "visual-plan.json"
  );
}

function currentImageManifestPath(
  resolver: ReturnType<typeof createEpisodePathResolver>,
  episodeId: string,
  format: string
): string {
  return normalizeContentVariant(format) === "short"
    ? path.join(
        resolver.episodeRoot(normalizeEpisodeId(episodeId)),
        "shared",
        "short",
        "images",
        "shorts-image-manifest.json"
      )
    : path.join(
        resolver.episodeRoot(normalizeEpisodeId(episodeId)),
        "shared",
        "image-manifest.json"
      );
}

function currentGeneratedImagesDir(
  resolver: ReturnType<typeof createEpisodePathResolver>,
  episodeId: string,
  format: string
): string {
  return normalizeContentVariant(format) === "short"
    ? path.join(
        resolver.episodeRoot(normalizeEpisodeId(episodeId)),
        "shared",
        "short",
        "images",
        "generated"
      )
    : path.join(
        resolver.episodeRoot(normalizeEpisodeId(episodeId)),
        "shared",
        "images",
        "generated"
      );
}

async function currentLayoutImagesReady(args: {
  readonly resolver: ReturnType<typeof createEpisodePathResolver>;
  readonly episodeId: string;
  readonly format: string;
}): Promise<boolean> {
  const manifestPath = currentImageManifestPath(
    args.resolver,
    args.episodeId,
    args.format
  );
  return (
    (await fileExists(manifestPath)) &&
    (await directoryHasFiles(
      currentGeneratedImagesDir(args.resolver, args.episodeId, args.format)
    ))
  );
}

async function stageArtifactExists(args: {
  readonly resolver: ReturnType<typeof createEpisodePathResolver>;
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly stageType: string;
  readonly locale: string | undefined;
  readonly format: string | undefined;
}): Promise<boolean> {
  const { resolver, workspaceRoot, episodeId, stageType, locale, format } = args;
  if (stageType === "ingest-source" && locale === "en" && format === "full") {
    try {
      await resolveAuthoredScript({
        workspaceRoot,
        episode: episodeId,
        language: "en",
        variant: "full",
      });
      return true;
    } catch {
      return false;
    }
  }
  if (!locale || !format) {
    return false;
  }
  const normalizedEpisodeId = normalizeEpisodeId(episodeId);
  const normalizedLocale = normalizeLocaleCode(locale);
  const normalizedVariant = normalizeContentVariant(format);
  const context = {
    episodeId: normalizedEpisodeId,
    locale: normalizedLocale,
    variant: normalizedVariant,
  };
  const scriptPath = resolver.generatedNarrationScript(context);
  const localeVariantRoot = currentLocaleVariantRoot({
    resolver,
    episodeId,
    locale,
    format,
  });
  const currentNarrationPath = path.join(localeVariantRoot, "narration.txt");
  const currentGenerationManifestPath = path.join(
    localeVariantRoot,
    "generation-manifest.json"
  );
  if (
    stageType === "quality-full" || stageType === "quality-short"
  ) {
    try {
      const analysis = await resolveStoryProductionAnalysisStatus({
        outputRoot: resolver.workspaceRoot,
        episodeSlug: episodeId,
        language: locale,
        format: normalizedVariant,
      });
      return analysis.analysisCurrent && analysis.pass === true;
    } catch {
      return false;
    }
  }
  if (
    stageType === "rewrite-full" ||
    stageType === "validate-full" ||
    stageType === "localize-full" ||
    stageType === "rewrite-short" ||
    stageType === "validate-short"
  ) {
    return (
      (await fileExists(scriptPath)) ||
      (await fileExists(currentNarrationPath)) ||
      (await fileExists(currentGenerationManifestPath))
    );
  }
  if (stageType === "visual-model" && locale === "en" && format === "full") {
    return (
      (await fileExists(resolver.canonicalVisualManifest(normalizedEpisodeId, "full"))) ||
      (await fileExists(currentSharedVisualPlanPath(resolver, episodeId)))
    );
  }
  if (stageType === "image-prompt" && locale === "en" && format === "full") {
    return (
      (await fileExists(resolver.canonicalVisualManifest(normalizedEpisodeId, "full"))) ||
      (await fileExists(currentSharedScenePlanPath(resolver, episodeId)))
    );
  }
  if (stageType === "image-generation" && locale === "en" && format === "full") {
    return (
      (await fullImagesReady(resolver, episodeId)) ||
      (await currentLayoutImagesReady({ resolver, episodeId, format }))
    );
  }
  if (stageType === "audio") {
    return (
      (await fileExists(resolver.audioNarration(context))) ||
      (await fileExists(path.join(localeVariantRoot, "audio", "narration.wav")))
    );
  }
  if (stageType === "captions") {
    return (
      (await fileExists(resolver.captionsFile(context, "ass"))) ||
      (await fileExists(path.join(localeVariantRoot, "subtitles", `narration.${normalizedLocale}.srt`))) ||
      (await fileExists(path.join(localeVariantRoot, "subtitles", `narration.${normalizedLocale}.vtt`)))
    );
  }
  if (stageType === "metadata") {
    return (
      (await directoryHasFiles(resolver.metadataDir(context))) ||
      (await fileExists(path.join(localeVariantRoot, "metadata.json")))
    );
  }
  if (stageType === "thumbnail" && format === "short") {
    return fileExists(resolver.thumbnailFile(context));
  }
  if (stageType === "render") {
    const profile = normalizedVariant === "short" ? "vertical" : "youtube";
    return (
      (await fileExists(resolver.renderManifest(context, profile))) ||
      (await fileExists(resolver.finalVideo(context, profile))) ||
      (await fileExists(path.join(localeVariantRoot, "video", "render.json"))) ||
      (await directoryHasFiles(path.join(localeVariantRoot, "video")))
    );
  }
  return false;
}

async function buildWorkspaceFallbackStatus(args: {
  readonly episodeId: string;
  readonly outputRoot: string;
}): Promise<LoadedProductionStatus> {
  const workspaceRoot = workspaceRootFromOutputRoot(args.outputRoot);
  const resolver = createEpisodePathResolver(args.outputRoot);
  let manifest = await buildWorkspacePlannedStoryWorkflowManifest({
    episodeId: args.episodeId,
    dryRun: true,
    workspaceRoot,
  });
  for (const stage of manifest.stages) {
    if (
      await stageArtifactExists({
        resolver,
        workspaceRoot,
        episodeId: manifest.episodeId,
        stageType: stage.stageType,
        locale: stage.locale,
        format: stage.format,
      })
    ) {
      manifest = markStageCompleted(manifest, stage.stageId);
    }
  }
  return {
    manifest,
    report: buildStoryProductionStatusReport(manifest),
  };
}

export async function loadManifestForEpisode(args: {
  readonly episodeId: string;
  readonly workflowId?: string;
  readonly outputRoot: string;
}): Promise<LoadedProductionStatus> {
  const store = new StoryWorkflowManifestStore(args.outputRoot, args.episodeId);
  const workflowId =
    args.workflowId !== undefined
      ? (args.workflowId as WorkflowId)
      : await loadLatestWorkflowId(store).catch((error) => {
          if (
            error instanceof Error &&
            error.message === `No workflow manifests found for ${store.episodeId}.`
          ) {
            return null;
          }
          throw error;
        });
  if (workflowId === null) {
    return buildWorkspaceFallbackStatus(args);
  }
  const manifest = await store.load(workflowId);
  if (!manifest) {
    throw new Error(`Workflow manifest not found: ${workflowId}`);
  }
  return {
    manifest,
    report: buildStoryProductionStatusReport(manifest),
  };
}

export async function resolveEpisodesRoot(
  outputRoot: string | undefined
): Promise<string> {
  const runtimeConfig = await loadRuntimeConfig();
  return path.resolve(outputRoot ?? runtimeConfig.workspaceDir);
}

export async function loadProductionStatuses(
  options: StoryWorkflowSelectionOptions
): Promise<readonly LoadedProductionStatus[]> {
  const outputRoot = await resolveEpisodesRoot(options.outputRoot);
  const episodes = collectEpisodes(options);
  if (options.workflow && episodes.length !== 1) {
    throw new Error("--workflow may be used only with a single --episode target.");
  }
  return Promise.all(
    episodes.map((episodeId) =>
      loadManifestForEpisode({
        episodeId,
        outputRoot,
        ...(options.workflow !== undefined
          ? { workflowId: options.workflow }
          : {}),
      })
    )
  );
}
