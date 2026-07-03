import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  importImageBatch,
  loadEpisodeImageGenerationSettings,
  prepareFullSceneImageBatches,
  refreshImageBatch,
  resolveImageBatchManifest,
  retryFailedImageBatch,
  submitImageBatch,
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
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly workspace?: string;
  readonly openAiApiKey?: string;
  readonly openAiBaseUrl?: string;
}

interface ImagesBatchCommandDeps {
  readonly loadRuntimeConfig: typeof loadRuntimeConfig;
  readonly loadEpisodeImageGenerationSettings: typeof loadEpisodeImageGenerationSettings;
  readonly prepareFullSceneImageBatches: typeof prepareFullSceneImageBatches;
  readonly submitImageBatch: typeof submitImageBatch;
  readonly refreshImageBatch: typeof refreshImageBatch;
  readonly importImageBatch: typeof importImageBatch;
  readonly retryFailedImageBatch: typeof retryFailedImageBatch;
  readonly resolveImageBatchManifest: typeof resolveImageBatchManifest;
  readonly createOpenAiStoryClientWithOptions: typeof createOpenAiStoryClientWithOptions;
}

const defaultDeps: ImagesBatchCommandDeps = {
  loadRuntimeConfig,
  loadEpisodeImageGenerationSettings,
  prepareFullSceneImageBatches,
  submitImageBatch,
  refreshImageBatch,
  importImageBatch,
  retryFailedImageBatch,
  resolveImageBatchManifest,
  createOpenAiStoryClientWithOptions,
};

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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
  };
}

function createClient(
  deps: ImagesBatchCommandDeps,
  options: ImagesBatchCliOptions
): OpenAiStoryClient {
  return deps.createOpenAiStoryClientWithOptions({
    ...(options.openAiApiKey ? { apiKey: options.openAiApiKey } : {}),
    ...(options.openAiBaseUrl ? { baseUrl: options.openAiBaseUrl } : {}),
  });
}

function summarizeManifest(
  manifest: ImageBatchManifest,
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
  const retryableItemCount = manifest.items.filter((item) => {
    const category = item.error?.category ?? "";
    if (!["api-failed", "expired", "decode-failed", "validation-failed", "retry-required"].includes(item.status)) {
      return false;
    }
    return category !== "policy" && category !== "policy-rejection" && category !== "destination-conflict";
  }).length;
  return {
    episode: manifest.items[0]?.identity.episodeId ?? "unknown",
    languages,
    variants,
    stages,
    localBatchId: manifest.localBatchId,
    providerBatchId: manifest.openAIBatchId ?? null,
    endpoints,
    itemCounts: {
      total: itemCount,
      persisted: manifest.items.filter((item) => item.status === "persisted").length,
      failed: manifest.items.filter((item) => item.status !== "persisted" && item.status !== "skipped-cached").length,
      retryable: retryableItemCount,
    },
    request: {
      model: manifest.model,
      size: manifest.items[0]?.requestedSize ?? null,
      quality: manifest.items[0]?.quality ?? null,
    },
    status: args?.outcome ?? manifest.status,
    providerStatus: args?.providerStatus ?? manifest.status,
    unknownResultCount: args?.unknownResultCount ?? 0,
    duplicateResultCount: args?.duplicateResultCount ?? 0,
  };
}

function summarizePrepared(result: Awaited<ReturnType<typeof prepareFullSceneImageBatches>>) {
  const localBatchIds = result.groups.map((group) => group.storagePlan.localBatchId);
  return {
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
      retryable: 0,
    },
    request: {
      model: result.stagePreviews[0]?.model ?? null,
      size: result.stagePreviews[0]?.size ?? null,
      quality: result.stagePreviews[0]?.quality ?? null,
    },
  };
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
      const { episodeId, episodeDir } = await resolveEpisodeRuntime(deps, options);
      const languages = parseCsv(options.languages, normalizeLocaleCode, ["en"]);
      const variants = parseCsv(options.variants, normalizeContentVariant, ["full"]);
      if (variants.length !== 1 || variants[0] !== "full") {
        throw new Error(
          `Unsupported image batch variant selection: ${variants.join(", ")}.`
        );
      }
      const settings = deps.loadEpisodeImageGenerationSettings({
        OPENAI_API_KEY: "batch-prepare-only",
        OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
        OPENAI_IMAGE_SIZE: process.env["OPENAI_IMAGE_SIZE"],
        OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
        OPENAI_IMAGE_CONCURRENCY: process.env["OPENAI_IMAGE_CONCURRENCY"],
        OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
        OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
        OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
          options.allowUnapprovedCharacterReferences ? "true" : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
        OPENAI_IMAGE_FORCE: options.force ? "true" : process.env["OPENAI_IMAGE_FORCE"],
        OPENAI_BASE_URL: options.openAiBaseUrl ?? process.env["OPENAI_BASE_URL"],
      });
      const prepared = await deps.prepareFullSceneImageBatches({
        episodeDir,
        episodeId,
        languages,
        variant: "full",
        settings: {
          model: settings.model,
          requestedSize: settings.resolvedSize,
          quality: settings.quality,
          outputFormat: "png",
          allowUnapprovedCharacterReferences: settings.allowUnapprovedCharacterReferences,
          force: settings.force,
        },
      });
      const summary = summarizePrepared(prepared);
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
      const { outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const client = createClient(deps, options);
      await deps.submitImageBatch(outputDirectory, options.batch, client);
      const resolved = await deps.resolveImageBatchManifest(outputDirectory, options.batch);
      const summary = summarizeManifest(resolved.manifest);
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
      const { outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const client = createClient(deps, options);
      const manifest = await deps.refreshImageBatch(outputDirectory, options.batch, client);
      const summary = summarizeManifest(manifest);
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
      const { outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const client = createClient(deps, options);
      const result = await deps.importImageBatch(outputDirectory, options.batch, client);
      const resolved = await deps.resolveImageBatchManifest(outputDirectory, options.batch);
      const summary = summarizeManifest(resolved.manifest, {
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
      const { outputDirectory } = await resolveEpisodeRuntime(deps, options);
      const batchRef = await resolveBatchRefForResume(outputDirectory, options);
      const result = await deps.retryFailedImageBatch(outputDirectory, batchRef);
      const resolved = await deps.resolveImageBatchManifest(outputDirectory, result.localBatchId);
      const summary = summarizeManifest(resolved.manifest);
      if (options.json) {
        printJson(summary);
        return;
      }
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
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
    .command("prepare")
    .requiredOption("--episode <episode-id>")
    .option("--languages <comma-separated-languages>", "target languages", "en")
    .option("--variants <comma-separated-variants>", "content variants", "full")
    .option("--allow-unapproved-character-references")
    .option("--force")
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
    .command("resume")
    .requiredOption("--episode <episode-id>")
    .option("--batch <id>")
    .option("--json")
    .action(handlers.resume);
}
