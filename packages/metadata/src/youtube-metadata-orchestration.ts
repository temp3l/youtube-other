import fs from "node:fs/promises";
import path from "node:path";
import { type ContentVariant } from "@mediaforge/domain";
import { fileExists, hashText, normalizeWhitespace } from "@mediaforge/shared";
import {
  computeYoutubeMetadataCacheKey,
  computeYoutubeMetadataModelConfigFingerprint,
  computeYoutubeMetadataPromptSchemaFingerprint,
  generateYoutubeMetadataForTarget,
  readAndValidateScenesFile,
  type YoutubeMetadataGenerationOptions,
  type YoutubeMetadataOutputs,
} from "./youtube-metadata.js";

/** Closed publication variants shared by genre adapters and the metadata cache. */
export type YouTubeMetadataVariant = ContentVariant;
export type SupportedMetadataGenre = "veronica" | "history";

export class MetadataNarrationResolutionError extends Error {
  public readonly code = "metadata_narration_missing";

  public constructor(input: {
    readonly genre: SupportedMetadataGenre;
    readonly episodeId: string;
    readonly locale: string;
    readonly variant: YouTubeMetadataVariant;
    readonly expectedNarrationPath: string;
  }) {
    super(
      `Missing ${input.genre} narration for ${input.episodeId} (${input.locale}/${input.variant}). Expected: ${input.expectedNarrationPath}`,
    );
    this.name = "MetadataNarrationResolutionError";
  }
}

export interface GenerateEpisodeYouTubeMetadataInput {
  readonly genre: SupportedMetadataGenre;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: YouTubeMetadataVariant;
  readonly narrationPath: string;
  readonly scenesPath: string;
  readonly artifactPath: string;
  readonly sourceId?: string | null;
  readonly generationOptions: YoutubeMetadataGenerationOptions;
}

export interface GenerateEpisodeYouTubeMetadataResult {
  readonly genre: SupportedMetadataGenre;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: YouTubeMetadataVariant;
  readonly narrationPath: string;
  readonly artifactPath: string;
  readonly cacheStatus: "hit" | "miss" | "bypass";
  readonly generated: boolean;
  readonly dryRun: boolean;
  readonly metadataPath: string;
  readonly generationPath: string;
}

function metadataOutputs(artifactPath: string): YoutubeMetadataOutputs {
  return {
    outputDir: artifactPath,
    jsonPath: path.join(artifactPath, "youtube-metadata.json"),
    markdownPath: path.join(artifactPath, "youtube-metadata.md"),
    descriptionPath: path.join(artifactPath, "youtube-description.txt"),
    chaptersPath: path.join(artifactPath, "youtube-chapters.txt"),
    tagsPath: path.join(artifactPath, "youtube-tags.txt"),
    pinnedCommentPath: path.join(artifactPath, "youtube-pinned-comment.txt"),
    generationPath: path.join(artifactPath, "youtube-metadata-generation.json"),
  };
}

/**
 * The generator owns content validation and provider interaction. This layer
 * fixes the resolved narration, artifact location, and cache namespace before
 * either can be used, so a short request cannot become a full request later.
 */
export async function generateEpisodeYouTubeMetadata(
  input: GenerateEpisodeYouTubeMetadataInput,
): Promise<GenerateEpisodeYouTubeMetadataResult> {
  if (!(await fileExists(input.narrationPath))) {
    throw new MetadataNarrationResolutionError({
      genre: input.genre,
      episodeId: input.episodeId,
      locale: input.locale,
      variant: input.variant,
      expectedNarrationPath: input.narrationPath,
    });
  }
  const narrationText = normalizeWhitespace(
    await fs.readFile(input.narrationPath, "utf8"),
  );
  if (!narrationText) {
    throw new MetadataNarrationResolutionError({
      genre: input.genre,
      episodeId: input.episodeId,
      locale: input.locale,
      variant: input.variant,
      expectedNarrationPath: input.narrationPath,
    });
  }
  const target = await readAndValidateScenesFile(input.scenesPath, input.locale);
  const outputs = metadataOutputs(input.artifactPath);
  const promptVersion = input.generationOptions.promptVersion ?? "youtube-metadata-v1";
  const modelConfigFingerprint = computeYoutubeMetadataModelConfigFingerprint({
    model: input.generationOptions.model,
    reasoningEffort: input.generationOptions.reasoningEffort,
    maxOutputTokens: input.generationOptions.maxOutputTokens,
    repairModel: input.generationOptions.repairModel,
    repairReasoningEffort: input.generationOptions.repairReasoningEffort,
    repairMaxOutputTokens: input.generationOptions.repairMaxOutputTokens,
  });
  const promptSchemaFingerprint = computeYoutubeMetadataPromptSchemaFingerprint({
    promptText: input.generationOptions.promptText,
    promptVersion,
    schemaVersion: "1.0",
  });
  const cacheKey = computeYoutubeMetadataCacheKey({
    sourceSha256: target.sourceSha256,
    parentNarrationFingerprint: hashText(narrationText),
    promptText: input.generationOptions.promptText,
    promptVersion,
    model: input.generationOptions.model,
    schemaVersion: "1.0",
    language: input.locale,
    modelConfigFingerprint,
    promptSchemaFingerprint,
    genre: input.genre,
    episodeId: input.episodeId,
    locale: input.locale,
    variant: input.variant,
  });
  const cachedGeneration = await fs.readFile(outputs.generationPath, "utf8")
    .then((raw) => JSON.parse(raw) as { readonly cacheKey?: unknown })
    .catch(() => null);
  const cached = !input.generationOptions.force &&
    cachedGeneration?.cacheKey === cacheKey &&
    await fileExists(outputs.jsonPath);
  const cacheStatus = input.generationOptions.force ? "bypass" : cached ? "hit" : "miss";
  if (input.generationOptions.dryRun) {
    return {
      genre: input.genre, episodeId: input.episodeId, locale: input.locale,
      variant: input.variant, narrationPath: input.narrationPath,
      artifactPath: input.artifactPath, cacheStatus, generated: false, dryRun: true,
      metadataPath: outputs.jsonPath, generationPath: outputs.generationPath,
    };
  }
  const generation = await generateYoutubeMetadataForTarget({
    ...target,
    outputDir: input.artifactPath,
    episodeSlug: input.episodeId,
    sourceId: input.sourceId ?? input.episodeId,
    language: input.locale,
    locale: input.locale,
    variant: input.variant,
    genre: input.genre,
    narration: {
      episodeNumber: input.episodeId.split("-")[0] ?? input.episodeId,
      episodeSlug: input.episodeId,
      language: input.locale,
      locale: input.locale,
      variant: input.variant,
      narrationText,
      narrationFingerprint: hashText(narrationText),
    },
  }, input.generationOptions);
  return {
    genre: input.genre, episodeId: input.episodeId, locale: input.locale,
    variant: input.variant, narrationPath: input.narrationPath,
    artifactPath: input.artifactPath,
    cacheStatus: input.generationOptions.force ? "bypass" : generation.cacheHit ? "hit" : "miss",
    generated: !generation.cacheHit, dryRun: false,
    metadataPath: generation.outputs.jsonPath,
    generationPath: generation.outputs.generationPath,
  };
}
