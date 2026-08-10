import path from "node:path";
import { episodeIdSchema, type ContentVariant } from "@mediaforge/domain";
import {
  findEpisodeScenesFile,
  generateEpisodeYouTubeMetadata,
  type GenerateEpisodeYouTubeMetadataResult,
  type YoutubeMetadataGenerationOptions,
} from "@mediaforge/metadata";

export type HistoryMediaVariant = ContentVariant;

/** History retains its own layout resolver even where it presently matches Veronica. */
export function resolveHistoryMetadataNarration(input: {
  readonly episodeRoot: string;
  readonly locale: string;
  readonly variant: HistoryMediaVariant;
}): string {
  return input.variant === "short"
    ? path.join(input.episodeRoot, "languages", "short", `script-${input.locale}.md`)
    : path.join(input.episodeRoot, "languages", `script-${input.locale}.md`);
}

export function resolveHistoryMetadataArtifact(input: {
  readonly episodeRoot: string;
  readonly locale: string;
  readonly variant: HistoryMediaVariant;
}): string {
  return path.join(input.episodeRoot, "locales", input.locale, input.variant, "metadata");
}

export async function generateHistoryYoutubeMetadata(input: {
  readonly outputRoot: string;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: HistoryMediaVariant;
  readonly generationOptions: YoutubeMetadataGenerationOptions;
}): Promise<GenerateEpisodeYouTubeMetadataResult> {
  const episodeId = episodeIdSchema.parse(input.episodeId);
  const outputRoot = path.resolve(input.outputRoot);
  const episodeRoot = path.resolve(outputRoot, episodeId);
  if (path.relative(outputRoot, episodeRoot).startsWith("..")) {
    throw new Error(`Invalid History episode path: ${input.episodeId}`);
  }
  return generateEpisodeYouTubeMetadata({
    genre: "history",
    episodeId,
    locale: input.locale,
    variant: input.variant,
    narrationPath: resolveHistoryMetadataNarration({ episodeRoot, locale: input.locale, variant: input.variant }),
    scenesPath: await findEpisodeScenesFile(outputRoot, episodeId),
    artifactPath: resolveHistoryMetadataArtifact({ episodeRoot, locale: input.locale, variant: input.variant }),
    generationOptions: input.generationOptions,
  });
}
