import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  cancelImageBatch,
  importImageBatch,
  loadEpisodeImageGenerationSettings,
  loadOpenAiImageGenerationSettings,
  prepareFullSceneImageBatches,
  prepareReferenceImageBatchForEpisode,
  prepareShortSceneImageBatches,
  refreshImageBatch,
  resolveImageBatchManifest,
  retryFailedImageBatch,
  submitImageBatch,
  validateImageBatchArtifacts,
  type ImageBatchManifest,
  type ImageBatchStatus,
} from "@mediaforge/image-generation";
import {
  StoryBatchIndexService,
  createOpenAiStoryClientWithOptions,
  type OpenAiStoryClient,
} from "@mediaforge/story-localization";
import {
  createEpisodePathResolver,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  normalizeWhitespace,
} from "@mediaforge/shared";

export interface ImagesBatchCliOptions {
  readonly episode?: string;
  readonly batch?: string;
  readonly languages?: string;
  readonly variants?: string;
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly force?: boolean;
  readonly revalidate?: boolean;
  readonly phase?: "references" | "scenes" | "auto";
  readonly maxBatchSize?: number;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly workspace?: string;
  readonly openAiApiKey?: string;
  readonly openAiBaseUrl?: string;
}

interface ImagesBatchCommandDeps {
  readonly loadRuntimeConfig: typeof loadRuntimeConfig;
  readonly loadEpisodeImageGenerationSettings: typeof loadEpisodeImageGenerationSettings;
  readonly loadOpenAiImageGenerationSettings: typeof loadOpenAiImageGenerationSettings;
  readonly prepareFullSceneImageBatches: typeof prepareFullSceneImageBatches;
  readonly prepareReferenceImageBatchForEpisode: typeof prepareReferenceImageBatchForEpisode;
  readonly prepareShortSceneImageBatches: typeof prepareShortSceneImageBatches;
  readonly submitImageBatch: typeof submitImageBatch;
  readonly cancelImageBatch: typeof cancelImageBatch;
  readonly validateImageBatchArtifacts: typeof validateImageBatchArtifacts;
  readonly refreshImageBatch: typeof refreshImageBatch;
  readonly importImageBatch: typeof importImageBatch;
  readonly retryFailedImageBatch: typeof retryFailedImageBatch;
  readonly resolveImageBatchManifest: typeof resolveImageBatchManifest;
  readonly createOpenAiStoryClientWithOptions: typeof createOpenAiStoryClientWithOptions;
}

const defaultDeps: ImagesBatchCommandDeps = {
  loadRuntimeConfig,
  loadEpisodeImageGenerationSettings,
  loadOpenAiImageGenerationSettings,
  prepareFullSceneImageBatches,
  prepareReferenceImageBatchForEpisode,
  prepareShortSceneImageBatches,
  submitImageBatch,
  cancelImageBatch,
  validateImageBatchArtifacts,
  refreshImageBatch,
  importImageBatch,
  retryFailedImageBatch,
  resolveImageBatchManifest,
  createOpenAiStoryClientWithOptions,
};

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function hasAliasedFollowerMarker(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "aliasedToCustomId" in value &&
    typeof (value as { aliasedToCustomId?: unknown }).aliasedToCustomId === "string"
  );
}

function parseCsv(
  value: string | undefined,
  normalize: (input: string) => string,
  fallback: readonly string[]
): readonly string[] {
  const values =
    value && value.trim().length > 0
      ? value
          .split(",")
          .map((entry) => normalize(entry))
          .filter((entry) => entry.length > 0)
      : [...fallback];
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function resolveEpisodeRuntime(
  deps: ImagesBatchCommandDeps,
  options: ImagesBatchCliOptions
): Promise<{
  readonly episodeId: string;
  readonly episodeDir: string;
  readonly outputDirectory: string;
  readonly runtimeConfig: Awaited<ReturnType<typeof loadRuntimeConfig>>;
}> {
  const runtimeConfig = await deps.loadRuntimeConfig(
    options.workspace ? { workspaceDir: options.workspace } : {}
  );
  const episodeId = normalizeEpisodeId(normalizeWhitespace(options.episode ?? ""));
  if (episodeId.length === 0) {
    throw new Error("--episode is required");
  }
  const resolver = createEpisodePathResolver(runtimeConfig.workspaceDir);
  return {
    episodeId,
    episodeDir: resolver.episodeRoot(episodeId),
    outputDirectory: resolver.imageStateDir(episodeId),
    runtimeConfig,
  };
}

function buildBatchImageEnv(options: ImagesBatchCliOptions): Record<string, string | undefined> {
  return {
    ...process.env,
    ...(options.openAiApiKey ? { OPENAI_API_KEY: options.openAiApiKey } : {}),
    ...(options.openAiBaseUrl ? { OPENAI_BASE_URL: options.openAiBaseUrl } : {}),
    OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
      options.allowUnapprovedCharacterReferences
        ? "true"
        : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
    OPENAI_IMAGE_FORCE: options.force ? "true" : process.env["OPENAI_IMAGE_FORCE"],
  };
}

async function createClient(
  deps: ImagesBatchCommandDeps,
  options: ImagesBatchCliOptions
): Promise<OpenAiStoryClient> {
  const { runtimeConfig } = await resolveEpisodeRuntime(deps, options);
  const imageSettings = deps.loadOpenAiImageGenerationSettings(
    buildBatchImageEnv(options),
    { cwd: runtimeConfig.workspaceDir, profile: "full" }
  );
  return deps.createOpenAiStoryClientWithOptions({
    apiKey: imageSettings.apiKey,
    ...(imageSettings.baseUrl ? { baseUrl: imageSettings.baseUrl } : {}),
    ...(imageSettings.organization ? { organization: imageSettings.organization } : {}),
    ...(imageSettings.project ? { project: imageSettings.project } : {}),
    maxRetries: imageSettings.maxRetries,
    timeoutMs: imageSettings.timeoutMs,
  });
}

function summarizeManifest(
  manifest: ImageBatchManifest,
  episodeDir: string,
  args?: {
    readonly outcome?: "imported" | "imported_with_failures" | "non_terminal";
    readonly providerStatus?: ImageBatchStatus;
    readonly unknownResultCount?: number;
    readonly duplicateResultCount?: number;
  }
): Record<string, unknown> {
  const languages = [...new Set(manifest.items.map((item) => item.identity.language))].sort(
    (left, right) => left.localeCompare(right)
  );
  const variants = [...new Set(manifest.items.map((item) => item.identity.variant))].sort(
    (left, right) => left.localeCompare(right)
  );
  const stages = [
    ...new Set(
      manifest.items.map((item) =>
        item.identity.assetRole === "character-reference"
          ? "reference-images"
          : "scene-images"
      )
    ),
  ].sort((left, right) => left.localeCompare(right));
  const endpoints = [manifest.endpoint];
  const itemCount = manifest.items.length;
  const aliasFollowerCount = manifest.items.filter(
    (item) => hasAliasedFollowerMarker(item)
  ).length;
  const retryableItemCount = manifest.items.filter((item) => {
    const category = item.error?.category ?? "";
    if (!["api-failed", "expired", "decode-failed", "validation-failed", "retry-required"].includes(item.status)) {
      return false;
    }
    return category !== "policy" && category !== "policy-rejection" && category !== "destination-conflict";
  }).length;
  const resolver = createEpisodePathResolver(path.dirname(episodeDir));
  const episodeId = manifest.items[0]?.identity.episodeId ?? "unknown";
  return {
    episode: episodeId,
    languages,
    variants,
    stages,
    localBatchId: manifest.localBatchId,
    providerBatchId: manifest.openAIBatchId ?? null,
    endpoints,
    itemCounts: {
      total: itemCount,
      aliasFollowers: aliasFollowerCount,
      persisted: manifest.items.filter((item) => item.status === "persisted").length,
      failed: manifest.items.filter((item) => item.status !== "persisted" && item.status !== "skipped-cached").length,
      retryable: retryableItemCount,
    },
    request: {
      model: manifest.model,
      size: manifest.items[0]?.requestedSize ?? null,
      quality: manifest.items[0]?.quality ?? null,
    },
    localCache: manifest.localCacheSummary ?? null,
    promptCache: manifest.promptCacheGroupingSummary ?? null,
    dependencies: manifest.dependencyGraphSummary ?? null,
    status: args?.outcome ?? manifest.status,
    providerStatus: args?.providerStatus ?? manifest.status,
    unknownResultCount: args?.unknownResultCount ?? 0,
    duplicateResultCount: args?.duplicateResultCount ?? 0,
    paths: episodeId === "unknown"
      ? undefined
      : {
          batchManifestsDir: resolver.imageBatchManifestsDir(normalizeEpisodeId(episodeId)),
          batchInputsDir: resolver.imageBatchInputsDir(normalizeEpisodeId(episodeId)),
          batchResultsDir: resolver.imageBatchResultsDir(normalizeEpisodeId(episodeId)),
          batchErrorsDir: resolver.imageBatchErrorsDir(normalizeEpisodeId(episodeId)),
          batchReportsDir: resolver.imageBatchReportsDir(normalizeEpisodeId(episodeId)),
          fullImagesDir: resolver.sharedGeneratedImagesDir(normalizeEpisodeId(episodeId)),
          shortImagesDir: resolver.sharedShortGeneratedImagesDir(normalizeEpisodeId(episodeId)),
          characterReferencesDir:
            resolver.sharedCharacterReferencesDir(normalizeEpisodeId(episodeId)),
          shortsImageManifest:
            resolver.shortsImageManifest(normalizeEpisodeId(episodeId)),
        },
  };
}

function summarizePrepared(
  result:
    | Awaited<ReturnType<typeof prepareFullSceneImageBatches>>
    | Awaited<ReturnType<typeof prepareShortSceneImageBatches>>,
  episodeDir: string
) {
  const localBatchIds = result.groups.map((group) => group.storagePlan.localBatchId);
  const resolver = createEpisodePathResolver(path.dirname(episodeDir));
  const episodeId = normalizeEpisodeId(result.episodeId);
  const summary = {
    episode: result.episodeId,
    languages: result.languages,
    variants: [result.variant],
    stages: result.stagePreviews.map((stage) => ({
      kind: stage.kind,
      operation: stage.operation,
      itemCount: stage.itemCount,
      requestCount: stage.requestCount,
      endpoint: stage.endpoint ?? null,
    })),
    localBatchIds,
    providerBatchId: null,
    endpoints: [
      ...new Set(
        result.stagePreviews
          .map((stage) => stage.endpoint)
          .filter(
            (
              endpoint
            ): endpoint is "/v1/images/generations" | "/v1/images/edits" =>
              endpoint !== undefined
          )
      ),
    ].sort((left, right) => left.localeCompare(right)),
    itemCounts: {
      total: result.groups.reduce(
        (sum, group) => sum + group.referencePlans.length + group.scenePlans.length,
        0
      ),
      aliasFollowers: result.groups.reduce(
        (sum, group) =>
          sum +
          group.scenePlans.filter(
            (plan) => hasAliasedFollowerMarker(plan.manifestItem)
          ).length,
        0
      ),
      retryable: 0,
    },
    localCache: {
      hits: result.groups.reduce(
        (sum, group) =>
          sum +
          [...group.referencePlans, ...group.scenePlans].filter(
            (plan) => plan.manifestItem.localCacheState === "hit"
          ).length,
        0
      ),
    },
    promptCacheGroups: [
      ...new Set(
        result.groups.flatMap((group) =>
          [...group.referencePlans, ...group.scenePlans].map(
            (plan) =>
              plan.manifestItem.promptCachePlan?.cacheKey ??
              `${plan.manifestItem.promptCachePlan?.mode ?? "disabled"}:${plan.manifestItem.referenceBundleHash ?? plan.manifestItem.customId}`
          )
        )
      ),
    ].length,
    request: {
      model: result.stagePreviews[0]?.model ?? null,
      size: result.stagePreviews[0]?.size ?? null,
      quality: result.stagePreviews[0]?.quality ?? null,
    },
    paths: {
      batchManifestsDir: resolver.imageBatchManifestsDir(episodeId),
      batchInputsDir: resolver.imageBatchInputsDir(episodeId),
      batchResultsDir: resolver.imageBatchResultsDir(episodeId),
      batchErrorsDir: resolver.imageBatchErrorsDir(episodeId),
      batchReportsDir: resolver.imageBatchReportsDir(episodeId),
      fullImagesDir: resolver.sharedGeneratedImagesDir(episodeId),
      shortImagesDir: resolver.sharedShortGeneratedImagesDir(episodeId),
      characterReferencesDir: resolver.sharedCharacterReferencesDir(episodeId),
      shortsImageManifest: resolver.shortsImageManifest(episodeId),
    },
  };
  if (result.variant === "short") {
    return {
      ...summary,
      previewCounts: result.previewCounts,
      localWorkPlan: result.localWorkPlan.manifestPath,
    };
  }
  return summary;
}

async function resolveBatchRefForResume(
  outputDirectory: string,
  options: ImagesBatchCliOptions
): Promise<string> {
  if (options.batch) {
    return options.batch;
  }
  const episodeId = normalizeEpisodeId(normalizeWhitespace(options.episode ?? ""));
  const index = new StoryBatchIndexService(outputDirectory);
  await index.initialize();
  const entry = await index.getLatest({
    category: "image-generation",
    episodeNumbers: [episodeId],
    hasRetryableFailures: true,
  });
  if (!entry) {
    throw new Error(`No retryable image batch found for ${episodeId}.`);
  }
  return entry.localBatchId;
}

export function createImagesBatchCommandHandlers(
  deps: ImagesBatchCommandDeps = defaultDeps
) {
  return {
    async prepare(options: ImagesBatchCliOptions): Promise<void> {
      const { episodeId, episodeDir, runtimeConfig } = await resolveEpisodeRuntime(deps, options);
      const languages = parseCsv(options.languages, normalizeLocaleCode, ["en"]);
      const variants = parseCsv(options.variants, normalizeContentVariant, ["full"]);
      if (variants.length !== 1 || !["full", "short"].includes(variants[0] ?? "")) {
        throw new Error(
          `Unsupported image batch variant selection: ${variants.join(", ")}.`
        );
      }
      const variant = variants[0] as "full" | "short";
      const imageEnv = {
        ...buildBatchImageEnv(options),
        OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ?? options.openAiApiKey ?? "batch-prepare-only",
      };
      const settings = deps.loadEpisodeImageGenerationSettings(imageEnv, {
        cwd: runtimeConfig.workspaceDir,
        profile: variant,
      });
      const transportSettings = deps.loadOpenAiImageGenerationSettings(imageEnv, {
        cwd: runtimeConfig.workspaceDir,
        profile: variant,
      });
      const plannerSettings = {
        model: settings.model,
        requestedSize: settings.resolvedSize,
        quality: settings.quality,
        outputFormat: transportSettings.outputFormat,
        allowUnapprovedCharacterReferences: settings.allowUnapprovedCharacterReferences,
        force: settings.force,
        revalidate: options.revalidate ?? false,
        ...(options.maxBatchSize ? { maxRequestsPerBatch: options.maxBatchSize } : {}),
        promptCacheMode: runtimeConfig.openAiPromptCacheMode,
        promptCacheShardCount: runtimeConfig.openAiPromptCacheShardCount,
      };
      const referencePlannerSettings = {
        model: runtimeConfig.openAiImageReferenceModel,
        requestedSize: runtimeConfig.openAiImageReferenceSize,
        quality: runtimeConfig.openAiImageReferenceQuality,
        outputFormat: transportSettings.outputFormat,
        allowUnapprovedCharacterReferences: settings.allowUnapprovedCharacterReferences,
        force: settings.force,
        revalidate: options.revalidate ?? false,
        ...(options.maxBatchSize ? { maxRequestsPerBatch: options.maxBatchSize } : {}),
        promptCacheMode: runtimeConfig.openAiPromptCacheMode,
        promptCacheShardCount: runtimeConfig.openAiPromptCacheShardCount,
      };
      const phase = options.phase ?? "auto";
      if (!["references", "scenes", "auto"].includes(phase)) {
        throw new Error(`Unsupported image batch phase: ${phase}.`);
      }
      if (
        options.maxBatchSize !== undefined &&
        (!Number.isInteger(options.maxBatchSize) || options.maxBatchSize < 1)
      ) {
        throw new Error("--max-batch-size must be a positive integer.");
      }
      let prepared: Parameters<typeof summarizePrepared>[0] | undefined;
      if (phase !== "scenes") {
        const references = await deps.prepareReferenceImageBatchForEpisode({
          episodeDir,
          episodeId,
          settings: referencePlannerSettings,
          options: { language: languages[0] ?? "en", variant },
        });
        const hasMissingReferences = references.groups.some(
          (group) => group.referencePlans.length > 0
        );
        if (phase === "references" || hasMissingReferences) {
          prepared = {
            ...references,
            episodeId,
            variant: "full",
            languages,
          };
        }
      }
      if (!prepared) {
        prepared =
          variant === "short"
            ? await deps.prepareShortSceneImageBatches({
                episodeDir,
                episodeId,
                languages,
                variant,
                settings: plannerSettings,
              })
            : await deps.prepareFullSceneImageBatches({
                episodeDir,
                episodeId,
                languages,
                variant,
                settings: plannerSettings,
                includeReferenceGroups: false,
              });
      }
      const summary = summarizePrepared(prepared, episodeDir);
      if (options.json) {
        printJson(summary);
        return;
      }
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    },

    async submit(options: ImagesBatchCliOptions): Promise<void> {
      if (!options.batch) {
        throw new Error("--batch is required");
      }
      const { episodeDir, outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const client = await createClient(deps, options);
      await deps.submitImageBatch(outputDirectory, options.batch, client);
      const resolved = await deps.resolveImageBatchManifest(outputDirectory, options.batch);
      const summary = summarizeManifest(resolved.manifest, episodeDir);
      if (options.json) {
        printJson(summary);
        return;
      }
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    },

    async status(options: ImagesBatchCliOptions): Promise<void> {
      if (!options.batch) {
        throw new Error("--batch is required");
      }
      const { episodeDir, outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const client = await createClient(deps, options);
      const manifest = await deps.refreshImageBatch(outputDirectory, options.batch, client);
      const summary = summarizeManifest(manifest, episodeDir);
      if (options.json) {
        printJson(summary);
        return;
      }
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    },

    async download(options: ImagesBatchCliOptions): Promise<void> {
      if (!options.batch) {
        throw new Error("--batch is required");
      }
      const { episodeDir, outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const client = await createClient(deps, options);
      const result = await deps.importImageBatch(outputDirectory, options.batch, client);
      const resolved = await deps.resolveImageBatchManifest(outputDirectory, options.batch);
      const summary = summarizeManifest(resolved.manifest, episodeDir, {
        outcome: result.status,
        providerStatus: result.providerStatus,
        unknownResultCount: result.unknownResultCount,
        duplicateResultCount: result.duplicateResultCount,
      });
      if (options.json) {
        printJson(summary);
        return;
      }
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    },

    async resume(options: ImagesBatchCliOptions): Promise<void> {
      const { episodeDir, outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const batchRef = await resolveBatchRefForResume(outputDirectory, options);
      const result = await deps.retryFailedImageBatch(outputDirectory, batchRef);
      const retryBatches = result.batches ?? [
        {
          localBatchId: result.localBatchId,
          manifestPath: result.manifestPath,
          inputFilePath: result.inputFilePath,
          itemCount: result.itemCount,
        },
      ];
      const summaries = await Promise.all(
        retryBatches.map(async (batch) => {
          const resolved = await deps.resolveImageBatchManifest(
            outputDirectory,
            batch.localBatchId
          );
          return summarizeManifest(resolved.manifest, episodeDir);
        })
      );
      const summary = {
        sourceBatch: batchRef,
        retryBatchCount: summaries.length,
        batches: summaries,
        nextCommands: retryBatches.map(
          (batch) =>
            `mediaforge images batch submit --episode ${options.episode} --batch ${batch.localBatchId}`
        ),
      };
      if (options.json) {
        printJson(summary);
        return;
      }
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    },

    async inspect(options: ImagesBatchCliOptions): Promise<void> {
      if (!options.batch) throw new Error("--batch is required");
      const { episodeDir, outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const resolved = await deps.resolveImageBatchManifest(outputDirectory, options.batch);
      printJson(summarizeManifest(resolved.manifest, episodeDir));
    },

    async validate(options: ImagesBatchCliOptions): Promise<void> {
      if (!options.batch) throw new Error("--batch is required");
      const { outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const report = await deps.validateImageBatchArtifacts(outputDirectory, options.batch);
      printJson(report);
      if (report.invalidItemCount > 0) process.exitCode = 2;
    },

    async cancel(options: ImagesBatchCliOptions): Promise<void> {
      if (!options.batch) throw new Error("--batch is required");
      const { episodeDir, outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const client = await createClient(deps, options);
      const manifest = await deps.cancelImageBatch(outputDirectory, options.batch, client);
      printJson(summarizeManifest(manifest, episodeDir));
    },
  };
}

export function registerImagesBatchCommands(
  imagesCommand: Command,
  deps: ImagesBatchCommandDeps = defaultDeps
): void {
  const handlers = createImagesBatchCommandHandlers(deps);
  const batch = imagesCommand.command("batch").description("Image batch lifecycle utilities");
  batch
    .command("inspect")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.inspect);
  batch
    .command("prepare")
    .requiredOption("--episode <episode-id>")
    .option("--languages <comma-separated-languages>", "target languages", "en")
    .option("--variants <comma-separated-variants>", "content variants", "full")
    .option("--allow-unapproved-character-references")
    .option("--force")
    .option("--revalidate", "validate cached artifacts without forced regeneration")
    .option("--phase <phase>", "prepare references, scenes, or auto", "auto")
    .option("--max-batch-size <number>", "maximum provider requests per JSONL batch", (value) => Number(value))
    .option("--dry-run", "prepare and inspect local JSONL without provider submission")
    .option("--json")
    .action(handlers.prepare);
  batch
    .command("submit")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.submit);
  batch
    .command("status")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.status);
  batch
    .command("download")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.download);
  batch
    .command("ingest")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.download);
  batch
    .command("validate")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.validate);
  batch
    .command("retry")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.resume);
  batch
    .command("cancel")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--batch <id>")
    .option("--json")
    .action(handlers.cancel);
  batch
    .command("resume")
    .requiredOption("--episode <episode-id>")
    .option("--batch <id>")
    .option("--json")
    .action(handlers.resume);
}
