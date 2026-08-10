import path from "node:path";
import { episodeIdSchema, type ContentVariant } from "@mediaforge/domain";
import {
  findEpisodeScenesFile,
  generateEpisodeYouTubeMetadata,
  type GenerateEpisodeYouTubeMetadataResult,
  type YoutubeMetadataGenerationOptions,
} from "@mediaforge/metadata";

export type VeronicaMediaVariant = ContentVariant;

export function resolveVeronicaMetadataNarration(input: {
  readonly episodeRoot: string;
  readonly locale: string;
  readonly variant: VeronicaMediaVariant;
}): string {
  return input.variant === "short"
    ? path.join(input.episodeRoot, "languages", "short", `script-${input.locale}.md`)
    : path.join(input.episodeRoot, "languages", `script-${input.locale}.md`);
}

export function resolveVeronicaMetadataArtifact(input: {
  readonly episodeRoot: string;
  readonly locale: string;
  readonly variant: VeronicaMediaVariant;
}): string {
  return path.join(input.episodeRoot, "locales", input.locale, input.variant, "metadata");
}

export async function generateVeronicaYoutubeMetadata(input: {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: VeronicaMediaVariant;
  readonly generationOptions: YoutubeMetadataGenerationOptions;
}): Promise<GenerateEpisodeYouTubeMetadataResult> {
  const episodeId = episodeIdSchema.parse(input.episodeId);
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const episodeRoot = path.resolve(workspaceRoot, episodeId);
  if (path.relative(workspaceRoot, episodeRoot).startsWith("..")) {
    throw new Error(`Invalid Veronica episode path: ${input.episodeId}`);
  }
  return generateEpisodeYouTubeMetadata({
    genre: "veronica",
    episodeId,
    locale: input.locale,
    variant: input.variant,
    narrationPath: resolveVeronicaMetadataNarration({ episodeRoot, locale: input.locale, variant: input.variant }),
    scenesPath: await findEpisodeScenesFile(workspaceRoot, episodeId),
    artifactPath: resolveVeronicaMetadataArtifact({ episodeRoot, locale: input.locale, variant: input.variant }),
    generationOptions: input.generationOptions,
  });
}
