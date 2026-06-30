import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  generateStoryThumbnail,
  readThumbnailStoryFile,
  type GenerateStoryThumbnailInput,
  type GeneratedStoryThumbnail,
  type ThumbnailFormat,
  type ThumbnailQuality,
  type ThumbnailTextStrategy,
} from "@mediaforge/image-generation";

export interface ThumbnailGenerateCliOptions {
  readonly episode?: string;
  readonly locale?: string;
  readonly format?: ThumbnailFormat;
  readonly hookText?: string;
  readonly storyFile?: string;
  readonly emphasisWord?: string;
  readonly quality?: ThumbnailQuality;
  readonly textStrategy?: ThumbnailTextStrategy;
  readonly referenceImage?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly json?: boolean;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function buildOutput(result: GeneratedStoryThumbnail): Record<string, unknown> {
  return {
    episodeSlug: result.episodeSlug,
    locale: result.locale,
    format: result.format,
    outputPath: result.outputPath,
    manifestPath: result.manifestPath,
    model: result.model,
    quality: result.quality,
    textStrategy: result.textStrategy,
    promptVersion: result.promptVersion,
    promptFingerprint: result.promptFingerprint,
    sourceFingerprint: result.sourceFingerprint,
    hookText: result.hookText,
    emphasisWord: result.emphasisWord,
    dryRun: result.dryRun,
    reused: result.reused,
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

export function registerThumbnailCommands(program: Command): void {
  const thumbnailsCommand = program
    .command("thumbnails")
    .description("Thumbnail generation utilities");
  thumbnailsCommand
    .command("generate")
    .requiredOption("--episode <slug>", "episode slug")
    .requiredOption("--locale <locale>", "locale code")
    .requiredOption("--format <full|short>", "thumbnail format")
    .requiredOption("--hook-text <text>", "thumbnail hook text")
    .requiredOption("--story-file <path>", "thumbnail story input JSON")
    .option("--emphasis-word <word>", "explicit emphasis word")
    .option("--quality <low|medium|high|auto>", "image quality")
    .option("--text-strategy <post-rendered|model-rendered>", "text rendering strategy")
    .option("--reference-image <path>", "workspace-relative or absolute reference image path")
    .option("--force", "replace conflicting thumbnail artifacts")
    .option("--dry-run", "validate inputs and compile the prompt without calling OpenAI")
    .option("--verbose", "include the compiled prompt in dry-run output")
    .option("--json", "print machine-readable output")
    .action(async (options: ThumbnailGenerateCliOptions) => {
      const runtimeConfig = await loadRuntimeConfig();
      const workspaceRoot = runtimeConfig.workspaceDir;
      const story = await readThumbnailStoryFile({
        workspaceRoot,
        storyFilePath: options.storyFile ?? "",
      });
      const input: GenerateStoryThumbnailInput = {
        workspaceRoot,
        episodeSlug: options.episode ?? "",
        locale: options.locale ?? "",
        format: (options.format ?? "full") as ThumbnailFormat,
        hookText: options.hookText ?? "",
        title: story.title,
        summary: story.summary,
        protagonistDescription: story.protagonistDescription,
        threatDescription: story.threatDescription,
        settingDescription: story.settingDescription,
        emphasisWord: options.emphasisWord ?? story.emphasisWord,
        referenceImagePath: options.referenceImage ?? story.referenceImagePath,
        quality: options.quality,
        textStrategy: options.textStrategy,
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
            `output: ${result.outputPath}`,
            `manifest: ${result.manifestPath}`,
            `prompt fingerprint: ${result.promptFingerprint}`,
            `source fingerprint: ${result.sourceFingerprint}`,
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
