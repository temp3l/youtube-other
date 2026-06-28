import { loadRuntimeConfig } from "@mediaforge/config";
import { syncEpisodeSharedImageAssets } from "@mediaforge/image-generation";
import { Command } from "commander";
import path from "node:path";

export interface ImagesSyncSharedCliOptions {
  readonly episode?: string;
  readonly generatedImages?: boolean;
  readonly characterReferences?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly workspace?: string;
}

export async function commandImagesSyncSharedAssets(
  options: ImagesSyncSharedCliOptions
): Promise<void> {
  const runtimeConfig = await loadRuntimeConfig(
    options.workspace ? { workspaceDir: options.workspace } : {}
  );
  const episodeId = options.episode?.trim();
  if (!episodeId) {
    throw new Error("Episode id is required.");
  }
  const episodeDir = path.join(runtimeConfig.workspaceDir, episodeId);
  const result = await syncEpisodeSharedImageAssets(episodeDir, episodeId, {
    includeGeneratedImages: options.generatedImages ?? true,
    includeCharacterReferences: options.characterReferences ?? true,
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `Episode: ${result.episodeId}`,
      `Generated copied: ${result.copiedGeneratedImages}`,
      `Generated skipped: ${result.skippedGeneratedImages}`,
      `Character refs copied: ${result.copiedCharacterReferences}`,
      `Character refs skipped: ${result.skippedCharacterReferences}`,
    ].join("\n") + "\n"
  );
}

export function registerImagesSyncSharedCommand(imagesCommand: Command): void {
  imagesCommand
    .command("sync-shared")
    .requiredOption("--episode <episode-id>")
    .option("--no-generated-images", "skip copying scene renders into shared outputs")
    .option(
      "--no-character-references",
      "skip restoring character reference images into shared outputs"
    )
    .option("--json")
    .option("--verbose")
    .action(async (opts: ImagesSyncSharedCliOptions) => {
      await commandImagesSyncSharedAssets(opts);
    });
}
