import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  fileExists,
  hashFile,
  readJsonIfExists,
  writeBinaryAtomic,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  type BackgroundArtifactManifest,
  backgroundManifestSchema,
  type FinalThumbnailManifest,
  finalManifestSchema,
  type GenerateThumbnailInput,
  type ThumbnailFormat,
  type ThumbnailStyle,
  THUMBNAIL_OUTPUTS,
  ThumbnailArtifactConflictError,
  ThumbnailPersistenceError,
} from "./thumbnail-contracts.js";

type ReuseCheck<TManifest> =
  | {
      readonly reused: true;
      readonly manifest: TManifest;
      readonly sha256: string;
      readonly byteSize: number;
    }
  | {
      readonly reused: false;
      readonly conflict: boolean;
    };

function thumbnailRoot(workspaceRoot: string, episodeSlug: string): string {
  return path.join(workspaceRoot, episodeSlug, "thumbnails");
}

export function resolveThumbnailArtifactPaths(args: {
  readonly workspaceRoot: string;
  readonly episodeSlug: string;
  readonly locale: string;
  readonly format: ThumbnailFormat;
}): {
  readonly root: string;
  readonly backgroundPath: string;
  readonly backgroundManifestPath: string;
  readonly outputPath: string;
  readonly manifestPath: string;
} {
  const root = thumbnailRoot(args.workspaceRoot, args.episodeSlug);
  return {
    root,
    backgroundPath: path.join(root, "backgrounds", `${args.format}-${args.locale}.png`),
    backgroundManifestPath: path.join(
      root,
      "manifests",
      `background-${args.format}-${args.locale}.json`
    ),
    outputPath: path.join(root, args.format, `${args.locale}.png`),
    manifestPath: path.join(root, "manifests", `${args.format}-${args.locale}.json`),
  };
}

async function validateImageAtPath(
  filePath: string,
  format: ThumbnailFormat
): Promise<void> {
  const expected = THUMBNAIL_OUTPUTS[format];
  const metadata = await sharp(filePath).metadata();
  if (metadata.width !== expected.width || metadata.height !== expected.height) {
    throw new ThumbnailArtifactConflictError(
      `Persisted thumbnail dimensions ${metadata.width ?? "unknown"}x${metadata.height ?? "unknown"} do not match ${expected.width}x${expected.height}.`
    );
  }
}

async function readBackgroundManifest(
  manifestPath: string
): Promise<BackgroundArtifactManifest | null> {
  return readJsonIfExists(manifestPath, (value) => backgroundManifestSchema.parse(value));
}

async function readFinalManifest(
  manifestPath: string
): Promise<FinalThumbnailManifest | null> {
  return readJsonIfExists(manifestPath, (value) => finalManifestSchema.parse(value));
}

function backgroundManifestMatches(
  left: BackgroundArtifactManifest,
  right: BackgroundArtifactManifest
): boolean {
  return (
    left.backgroundFingerprint === right.backgroundFingerprint &&
    left.promptFingerprint === right.promptFingerprint &&
    left.sourceFingerprint === right.sourceFingerprint &&
    left.referenceSha256 === right.referenceSha256 &&
    left.referencePath === right.referencePath &&
    left.model === right.model &&
    left.quality === right.quality &&
    left.style === right.style &&
    left.locale === right.locale &&
    left.format === right.format &&
    left.finalDimensions.width === right.finalDimensions.width &&
    left.finalDimensions.height === right.finalDimensions.height
  );
}

function finalManifestMatches(
  left: FinalThumbnailManifest,
  right: FinalThumbnailManifest
): boolean {
  return (
    left.compositionFingerprint === right.compositionFingerprint &&
    left.backgroundFingerprint === right.backgroundFingerprint &&
    left.backgroundSha256 === right.backgroundSha256 &&
    left.hookText === right.hookText &&
    left.emphasisWord === right.emphasisWord &&
    left.fontFamily === right.fontFamily &&
    left.style === right.style &&
    left.locale === right.locale &&
    left.format === right.format &&
    left.dimensions.width === right.dimensions.width &&
    left.dimensions.height === right.dimensions.height
  );
}

export class ThumbnailArtifactRepository {
  public resolvePaths(args: {
    readonly workspaceRoot: string;
    readonly episodeSlug: string;
    readonly locale: string;
    readonly format: ThumbnailFormat;
  }): ReturnType<typeof resolveThumbnailArtifactPaths> {
    return resolveThumbnailArtifactPaths(args);
  }

  public async reuseBackground(args: {
    readonly path: string;
    readonly manifestPath: string;
    readonly expectedManifest: BackgroundArtifactManifest;
    readonly force: boolean;
  }): Promise<ReuseCheck<BackgroundArtifactManifest>> {
    const manifest = await readBackgroundManifest(args.manifestPath);
    const exists = await fileExists(args.path);
    if (manifest && exists && backgroundManifestMatches(manifest, args.expectedManifest)) {
      const sha256 = await hashFile(args.path);
      if (sha256 === manifest.outputSha256) {
        await validateImageAtPath(args.path, manifest.format);
        return {
          reused: true,
          manifest,
          sha256,
          byteSize: (await fs.stat(args.path)).size,
        };
      }
    }
    if ((manifest || exists) && !args.force) {
      throw new ThumbnailArtifactConflictError(
        `Background thumbnail artifact conflict at ${args.path}. Rerun with --force to replace ${args.expectedManifest.locale}/${args.expectedManifest.format}.`
      );
    }
    return { reused: false, conflict: manifest !== null || exists };
  }

  public async reuseFinal(args: {
    readonly path: string;
    readonly manifestPath: string;
    readonly expectedManifest: FinalThumbnailManifest;
    readonly force: boolean;
  }): Promise<ReuseCheck<FinalThumbnailManifest>> {
    const manifest = await readFinalManifest(args.manifestPath);
    const exists = await fileExists(args.path);
    if (manifest && exists && finalManifestMatches(manifest, args.expectedManifest)) {
      const sha256 = await hashFile(args.path);
      if (sha256 === manifest.outputSha256) {
        await validateImageAtPath(args.path, manifest.format);
        return {
          reused: true,
          manifest,
          sha256,
          byteSize: (await fs.stat(args.path)).size,
        };
      }
    }
    if ((manifest || exists) && !args.force) {
      throw new ThumbnailArtifactConflictError(
        `Final thumbnail artifact conflict at ${args.path}. Rerun with --force to replace ${args.expectedManifest.locale}/${args.expectedManifest.format}.`
      );
    }
    return { reused: false, conflict: manifest !== null || exists };
  }

  public async persistBackground(args: {
    readonly path: string;
    readonly manifestPath: string;
    readonly buffer: Buffer;
    readonly manifest: Omit<BackgroundArtifactManifest, "outputSha256" | "outputBytes">;
  }): Promise<BackgroundArtifactManifest> {
    try {
      await writeBinaryAtomic(args.path, args.buffer);
      const outputSha256 = await hashFile(args.path);
      const outputBytes = (await fs.stat(args.path)).size;
      const manifest = backgroundManifestSchema.parse({
        ...args.manifest,
        outputPath: args.path,
        outputSha256,
        outputBytes,
      });
      await writeJsonAtomic(args.manifestPath, manifest);
      return manifest;
    } catch (error) {
      throw new ThumbnailPersistenceError(
        `Unable to persist background thumbnail artifacts for ${args.path}`,
        error
      );
    }
  }

  public async persistFinal(args: {
    readonly path: string;
    readonly manifestPath: string;
    readonly buffer: Buffer;
    readonly manifest: Omit<FinalThumbnailManifest, "outputSha256" | "outputBytes">;
  }): Promise<FinalThumbnailManifest> {
    try {
      await writeBinaryAtomic(args.path, args.buffer);
      const outputSha256 = await hashFile(args.path);
      const outputBytes = (await fs.stat(args.path)).size;
      const manifest = finalManifestSchema.parse({
        ...args.manifest,
        outputPath: args.path,
        outputSha256,
        outputBytes,
      });
      await writeJsonAtomic(args.manifestPath, manifest);
      return manifest;
    } catch (error) {
      throw new ThumbnailPersistenceError(
        `Unable to persist final thumbnail artifacts for ${args.path}`,
        error
      );
    }
  }
}

export function createExpectedBackgroundManifest(args: {
  readonly input: GenerateThumbnailInput;
  readonly style: ThumbnailStyle;
  readonly model: string;
  readonly quality: "low" | "medium" | "high" | "auto";
  readonly promptVersion: string;
  readonly promptFingerprint: string;
  readonly sourceFingerprint: string;
  readonly backgroundFingerprint: string;
  readonly referencePath: string;
  readonly referenceSha256: string;
  readonly requestId?: string;
  readonly retryCount: number;
  readonly pricingVersion: string;
  readonly estimatedCostMicros: number | null;
  readonly generatedAt: string;
}): Omit<BackgroundArtifactManifest, "outputSha256" | "outputBytes"> {
  const output = THUMBNAIL_OUTPUTS[args.input.format];
  const [generationWidth, generationHeight] = output.generationSize
    .split("x")
    .map((value) => Number.parseInt(value, 10));
  return {
    manifestVersion: 2,
    episodeSlug: args.input.episodeSlug,
    locale: args.input.locale,
    format: args.input.format,
    style: args.style,
    model: args.model,
    quality: args.quality,
    generationDimensions: {
      width: generationWidth ?? output.width,
      height: generationHeight ?? output.height,
    },
    finalDimensions: {
      width: output.width,
      height: output.height,
      aspectRatio: output.aspectRatio,
    },
    promptVersion: args.promptVersion,
    promptFingerprint: args.promptFingerprint,
    sourceFingerprint: args.sourceFingerprint,
    backgroundFingerprint: args.backgroundFingerprint,
    referencePath: args.referencePath,
    referenceSha256: args.referenceSha256,
    ...(args.requestId ? { requestId: args.requestId } : {}),
    retryCount: args.retryCount,
    pricingVersion: args.pricingVersion,
    estimatedCostMicros: args.estimatedCostMicros,
    generatedAt: args.generatedAt,
    outputPath: "",
  };
}

export function createExpectedFinalManifest(args: {
  readonly input: GenerateThumbnailInput;
  readonly style: ThumbnailStyle;
  readonly backgroundSha256: string;
  readonly backgroundFingerprint: string;
  readonly hookText: string;
  readonly emphasisWord: string;
  readonly fontFamily: string;
  readonly textLayoutVersion: string;
  readonly compositionFingerprint: string;
  readonly generatedAt: string;
}): Omit<FinalThumbnailManifest, "outputSha256" | "outputBytes"> {
  const output = THUMBNAIL_OUTPUTS[args.input.format];
  return {
    manifestVersion: 2,
    episodeSlug: args.input.episodeSlug,
    ...(args.input.episodeNumber !== undefined
      ? { episodeNumber: args.input.episodeNumber }
      : {}),
    locale: args.input.locale,
    format: args.input.format,
    style: args.style,
    dimensions: {
      width: output.width,
      height: output.height,
      aspectRatio: output.aspectRatio,
    },
    backgroundSha256: args.backgroundSha256,
    backgroundFingerprint: args.backgroundFingerprint,
    hookText: args.hookText,
    emphasisWord: args.emphasisWord,
    fontFamily: args.fontFamily,
    textLayoutVersion: args.textLayoutVersion,
    compositionFingerprint: args.compositionFingerprint,
    generatedAt: args.generatedAt,
    outputPath: "",
  };
}
