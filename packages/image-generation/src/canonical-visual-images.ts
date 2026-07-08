import path from "node:path";
import {
  canonicalVisualManifestSchema,
  type CanonicalVisualManifest,
  type CanonicalVisualScene,
} from "@mediaforge/domain";
import {
  assertInsideWorkspace,
  ensureDir,
  fileExists,
  hashFile,
  resolveCanonicalVisualImageDir,
  resolveCanonicalVisualImagePath,
  resolveCanonicalVisualManifestPath,
  writeJsonAtomic,
} from "@mediaforge/shared";

export interface CanonicalVisualImageGenerationInput {
  readonly scene: CanonicalVisualScene;
  readonly outputPath: string;
  readonly prompt: string;
}

export interface CanonicalVisualImageGenerator {
  generate(input: CanonicalVisualImageGenerationInput): Promise<void>;
}

export interface EnsureCanonicalVisualManifestImagesOptions {
  readonly episodeDir: string;
  readonly manifest: CanonicalVisualManifest;
  readonly manifestPath?: string;
  readonly forceRegenerateImages?: boolean;
  readonly imageGenerator?: CanonicalVisualImageGenerator;
}

export interface CanonicalVisualImageReference {
  readonly sceneId: string;
  readonly imagePath: string;
  readonly reused: boolean;
  readonly generated: boolean;
  readonly sha256?: string;
}

export interface EnsureCanonicalVisualManifestImagesResult {
  readonly manifest: CanonicalVisualManifest;
  readonly manifestPath: string;
  readonly imageDir: string;
  readonly images: readonly CanonicalVisualImageReference[];
}

function toPortableEpisodeRelativePath(episodeDir: string, filePath: string): string {
  return path.relative(episodeDir, filePath).replace(/\\/gu, "/");
}

function resolveManifestImagePath(args: {
  readonly episodeDir: string;
  readonly variant: CanonicalVisualManifest["variant"];
  readonly scene: CanonicalVisualScene;
}): string {
  const imageDir = resolveCanonicalVisualImageDir({
    episodeDir: args.episodeDir,
    variant: args.variant,
  });
  const rawImagePath = args.scene.imagePath;
  const candidate =
    rawImagePath && rawImagePath.trim().length > 0
      ? path.resolve(args.episodeDir, rawImagePath)
      : resolveCanonicalVisualImagePath({
          episodeDir: args.episodeDir,
          variant: args.variant,
          sceneId: args.scene.sceneId,
        });
  const resolved = assertInsideWorkspace(args.episodeDir, candidate);
  const resolvedImageDir = path.resolve(imageDir);
  if (resolved !== resolvedImageDir && !resolved.startsWith(`${resolvedImageDir}${path.sep}`)) {
    throw new Error(
      `Canonical ${args.variant} visual image for ${args.scene.sceneId} must be under ${toPortableEpisodeRelativePath(
        args.episodeDir,
        imageDir
      )}.`
    );
  }
  return resolved;
}

function missingImageMessage(args: {
  readonly episodeDir: string;
  readonly variant: CanonicalVisualManifest["variant"];
  readonly sceneId: string;
  readonly expectedPath: string;
}): string {
  const relativeExpected = toPortableEpisodeRelativePath(args.episodeDir, args.expectedPath);
  if (args.variant === "short") {
    return [
      `Missing short visual image for ${args.sceneId}.`,
      `Expected path: ${relativeExpected}.`,
      "Full-video image fallback is disabled for short renders.",
    ].join(" ");
  }
  return [
    `Missing full visual image for ${args.sceneId}.`,
    `Expected path: ${relativeExpected}.`,
    "Short-video image fallback is disabled for full renders.",
  ].join(" ");
}

export async function ensureCanonicalVisualManifestImages(
  options: EnsureCanonicalVisualManifestImagesOptions
): Promise<EnsureCanonicalVisualManifestImagesResult> {
  const manifest = canonicalVisualManifestSchema.parse(options.manifest);
  const manifestPath =
    options.manifestPath ??
    resolveCanonicalVisualManifestPath({
      episodeDir: options.episodeDir,
      variant: manifest.variant,
    });
  const imageDir = resolveCanonicalVisualImageDir({
    episodeDir: options.episodeDir,
    variant: manifest.variant,
  });
  await ensureDir(imageDir);

  const images: CanonicalVisualImageReference[] = [];
  const scenes: CanonicalVisualScene[] = [];

  for (const scene of manifest.scenes) {
    const outputPath = resolveManifestImagePath({
      episodeDir: options.episodeDir,
      variant: manifest.variant,
      scene,
    });
    const exists = await fileExists(outputPath);
    if (exists && options.forceRegenerateImages !== true) {
      const imagePath = toPortableEpisodeRelativePath(options.episodeDir, outputPath);
      scenes.push({ ...scene, imagePath });
      images.push({
        sceneId: scene.sceneId,
        imagePath,
        reused: true,
        generated: false,
        sha256: await hashFile(outputPath),
      });
      continue;
    }

    if (!options.imageGenerator) {
      throw new Error(
        missingImageMessage({
          episodeDir: options.episodeDir,
          variant: manifest.variant,
          sceneId: scene.sceneId,
          expectedPath: outputPath,
        })
      );
    }
    if (!scene.imagePrompt) {
      throw new Error(`Missing image prompt for canonical visual scene ${scene.sceneId}.`);
    }

    await options.imageGenerator.generate({
      scene,
      outputPath,
      prompt: scene.imagePrompt,
    });
    if (!(await fileExists(outputPath))) {
      throw new Error(`Image generator did not create expected output for ${scene.sceneId}: ${outputPath}`);
    }
    const imagePath = toPortableEpisodeRelativePath(options.episodeDir, outputPath);
    scenes.push({ ...scene, imagePath });
    images.push({
      sceneId: scene.sceneId,
      imagePath,
      reused: false,
      generated: true,
      sha256: await hashFile(outputPath),
    });
  }

  const updatedManifest = canonicalVisualManifestSchema.parse({
    ...manifest,
    scenes,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonAtomic(manifestPath, updatedManifest);
  return {
    manifest: updatedManifest,
    manifestPath,
    imageDir,
    images,
  };
}
