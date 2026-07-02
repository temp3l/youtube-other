import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  generateStoryThumbnail,
  readThumbnailStoryFile,
  type GenerateThumbnailInput,
  type GeneratedThumbnailResult,
  type ThumbnailFormat,
  type ThumbnailQuality,
  type ThumbnailStyle,
} from "@mediaforge/image-generation";

export interface ThumbnailGenerateCliOptions {
  readonly episodeSlug?: string;
  readonly episode?: string;
  readonly locale?: string;
  readonly format?: ThumbnailFormat;
  readonly style?: ThumbnailStyle;
  readonly hookText?: string;
  readonly storyFile?: string;
  readonly emphasisWord?: string;
  readonly quality?: ThumbnailQuality;
  readonly referenceImage?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly json?: boolean;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function buildOutput(result: GeneratedThumbnailResult): Record<string, unknown> {
  return {
    episodeSlug: result.episodeSlug,
    locale: result.locale,
    format: result.format,
    style: result.style,
    outputPath: result.outputPath,
    manifestPath: result.manifestPath,
    backgroundPath: result.backgroundPath,
    backgroundManifestPath: result.backgroundManifestPath,
    model: result.model,
    quality: result.quality,
    promptVersion: result.promptVersion,
    promptFingerprint: result.promptFingerprint,
    sourceFingerprint: result.sourceFingerprint,
    backgroundFingerprint: result.backgroundFingerprint,
    compositionFingerprint: result.compositionFingerprint,
    hookText: result.hookText,
    emphasisWord: result.emphasisWord,
    generationSize: result.generationSize,
    referencePath: result.referencePath,
    referenceSha256: result.referenceSha256,
    dryRun: result.dryRun,
    reused: result.reused,
    backgroundReused: result.backgroundReused,
    compositionReused: result.compositionReused,
    generated: result.generated,
    ...(result.requestId ? { requestId: result.requestId } : {}),
    ...(result.imageSha256 ? { imageSha256: result.imageSha256 } : {}),
    ...(result.byteSize !== undefined ? { byteSize: result.byteSize } : {}),
    ...(result.pricingVersion ? { pricingVersion: result.pricingVersion } : {}),
    ...(result.estimatedCostMicros !== undefined
      ? { estimatedCostMicros: result.estimatedCostMicros }
      : {}),
    ...(result.promptText ? { promptText: result.promptText } : {}),
  };
}

async function resolveStoryFilePath(args: {
  readonly workspaceRoot: string;
  readonly episodeSlug: string;
  readonly storyFile?: string;
}): Promise<string> {
  const explicit = args.storyFile
    ? path.isAbsolute(args.storyFile)
      ? args.storyFile
      : path.resolve(args.storyFile)
    : path.join(
        args.workspaceRoot,
        args.episodeSlug,
        "story-production",
        "thumbnail-story.json"
      );
  await fs.access(explicit);
  return explicit;
}

async function resolveHookText(args: {
  readonly workspaceRoot: string;
  readonly episodeSlug: string;
  readonly locale: string;
  readonly format: ThumbnailFormat;
  readonly explicitHookText?: string;
}): Promise<string> {
  if (args.explicitHookText) {
    return args.explicitHookText;
  }
  const metadataPath = path.join(
    args.workspaceRoot,
    args.episodeSlug,
    "locales",
    args.locale,
    args.format,
    "metadata",
    "youtube-metadata.json"
  );
  const parsed = JSON.parse(await fs.readFile(metadataPath, "utf8")) as {
    readonly thumbnail?: { readonly recommendedText?: string };
  };
  if (typeof parsed.thumbnail?.recommendedText === "string") {
    return parsed.thumbnail.recommendedText;
  }
  throw new Error(
    `Unable to resolve hook text from ${metadataPath}. Pass --hook-text explicitly.`
  );
}

export function registerThumbnailCommands(program: Command): void {
  const thumbnailsCommand = program
    .command("thumbnails")
    .description("Thumbnail generation utilities");
  thumbnailsCommand
    .command("generate")
    .requiredOption("--episode-slug <slug>", "episode slug")
    .option("--episode <slug>", "legacy alias for --episode-slug")
    .requiredOption("--locale <locale>", "locale code")
    .requiredOption("--format <full|short>", "thumbnail format")
    .option("--style <cinematic-horror|editorial-card>", "thumbnail style")
    .option("--hook-text <text>", "exact localized hook text")
    .option("--story-file <path>", "story summary input JSON")
    .option("--emphasis-word <word>", "explicit emphasis word")
    .option("--reference-image <path>", "repository-root relative or absolute reference image path")
    .option("--quality <low|medium|high|auto>", "image quality override")
    .option("--force", "replace conflicting thumbnail artifacts")
    .option("--dry-run", "validate inputs, compile prompt, and report reuse decisions without calling OpenAI")
    .option("--verbose", "include the compiled prompt in dry-run output")
    .option("--json", "print machine-readable output")
    .action(async (options: ThumbnailGenerateCliOptions) => {
      const runtimeConfig = await loadRuntimeConfig();
      const workspaceRoot = runtimeConfig.workspaceDir;
      const episodeSlug = options.episodeSlug ?? options.episode ?? "";
      const storyFilePath = await resolveStoryFilePath(
        options.storyFile
          ? {
              workspaceRoot,
              episodeSlug,
              storyFile: options.storyFile,
            }
          : {
              workspaceRoot,
              episodeSlug,
            }
      );
      const story = await readThumbnailStoryFile({
        workspaceRoot,
        storyFilePath,
      });
      const hookText = await resolveHookText(
        options.hookText
          ? {
              workspaceRoot,
              episodeSlug,
              locale: options.locale ?? "",
              format: (options.format ?? "full") as ThumbnailFormat,
              explicitHookText: options.hookText,
            }
          : {
              workspaceRoot,
              episodeSlug,
              locale: options.locale ?? "",
              format: (options.format ?? "full") as ThumbnailFormat,
            }
      );
      const input: GenerateThumbnailInput = {
        workspaceRoot,
        episodeSlug,
        locale: options.locale ?? "",
        format: (options.format ?? "full") as ThumbnailFormat,
        style: options.style,
        episodeNumber: story.episodeNumber,
        storyTitle: story.storyTitle,
        storySummary: story.storySummary,
        hookText,
        protagonistDescription: story.protagonistDescription,
        threatDescription: story.threatDescription,
        settingDescription: story.settingDescription,
        ...(story.moodDescription ? { moodDescription: story.moodDescription } : {}),
        ...(story.keyVisualMoment
          ? { keyVisualMoment: story.keyVisualMoment }
          : {}),
        emphasisWord: options.emphasisWord ?? story.emphasisWord,
        referenceImagePath: options.referenceImage ?? story.referenceImagePath,
        quality: options.quality,
        dryRun: options.dryRun ?? false,
        force: options.force ?? false,
        verbose: options.verbose ?? false,
      };
      const result = await generateStoryThumbnail(input);
      if (options.json) {
        printJson(buildOutput(result));
        return;
      }
      if (result.dryRun) {
        process.stdout.write(
          [
            "Thumbnail dry-run",
            `episode: ${result.episodeSlug}`,
            `locale: ${result.locale}`,
            `format: ${result.format}`,
            `style: ${result.style}`,
            `background: ${result.backgroundPath}`,
            `output: ${result.outputPath}`,
            `background manifest: ${result.backgroundManifestPath}`,
            `manifest: ${result.manifestPath}`,
            `prompt fingerprint: ${result.promptFingerprint}`,
            `background fingerprint: ${result.backgroundFingerprint}`,
            `composition fingerprint: ${result.compositionFingerprint}`,
            `reference: ${result.referencePath} (${result.referenceSha256})`,
            `background reuse: ${result.backgroundReused ? "yes" : "no"}`,
            `final reuse: ${result.compositionReused ? "yes" : "no"}`,
            ...(result.promptText ? [`prompt:\n${result.promptText}`] : []),
          ].join("\n") + "\n"
        );
        return;
      }
      process.stdout.write(
        `Thumbnail ${result.reused ? "reused" : "generated"}: ${path.resolve(result.outputPath)}\n`
      );
    });
}
