import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { hashFile } from "@mediaforge/shared";
import {
  THUMBNAIL_OUTPUTS,
  type ThumbnailFormat,
  type ThumbnailGenerationConfig,
  type ResolvedThumbnailReference,
  ThumbnailReferenceNotFoundError,
  ThumbnailReferenceValidationError,
} from "./thumbnail-contracts.js";

const supportedFormats = new Map<string, string>([
  ["png", "image/png"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
]);

function resolveReferenceCandidate(args: {
  readonly repoRoot: string;
  readonly format: ThumbnailFormat;
  readonly overridePath?: string;
  readonly config: Pick<
    ThumbnailGenerationConfig,
    "fullReferencePath" | "shortReferencePath"
  >;
}): string {
  const configuredDefault =
    args.format === "full"
      ? args.config.fullReferencePath
      : args.config.shortReferencePath;
  const raw = args.overridePath ?? configuredDefault;
  const resolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(args.repoRoot, raw);
  const normalizedRoot = path.resolve(args.repoRoot);
  if (
    resolved !== normalizedRoot &&
    !resolved.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new ThumbnailReferenceValidationError(
      `Reference image path escapes the repository root: ${raw}`
    );
  }
  return resolved;
}

function validateOrientation(
  format: ThumbnailFormat,
  width: number,
  height: number
): void {
  if (format === "full" && width <= height) {
    throw new ThumbnailReferenceValidationError(
      `Full thumbnail reference must be landscape, received ${width}x${height}.`
    );
  }
  if (format === "short" && height <= width) {
    throw new ThumbnailReferenceValidationError(
      `Short thumbnail reference must be portrait, received ${width}x${height}.`
    );
  }
}

export async function resolveThumbnailReference(args: {
  readonly repoRoot: string;
  readonly format: ThumbnailFormat;
  readonly overridePath?: string;
  readonly config: Pick<
    ThumbnailGenerationConfig,
    "fullReferencePath" | "shortReferencePath" | "maxReferenceBytes"
  >;
}): Promise<ResolvedThumbnailReference> {
  const resolvedPath = resolveReferenceCandidate(args);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolvedPath);
  } catch (error) {
    throw new ThumbnailReferenceNotFoundError(
      `Reference image not found: ${resolvedPath}`,
      error
    );
  }
  if (!stat.isFile()) {
    throw new ThumbnailReferenceValidationError(
      `Reference image is not a file: ${resolvedPath}`
    );
  }
  if (stat.size > args.config.maxReferenceBytes) {
    throw new ThumbnailReferenceValidationError(
      `Reference image exceeds the configured byte limit (${stat.size} > ${args.config.maxReferenceBytes}).`
    );
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(resolvedPath).metadata();
  } catch (error) {
    throw new ThumbnailReferenceValidationError(
      `Reference image is not a supported decodable image: ${resolvedPath}`,
      error
    );
  }
  if (!metadata.format || !supportedFormats.has(metadata.format)) {
    throw new ThumbnailReferenceValidationError(
      `Reference image uses an unsupported format: ${metadata.format ?? "unknown"}.`
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new ThumbnailReferenceValidationError(
      `Reference image dimensions are unavailable: ${resolvedPath}`
    );
  }
  validateOrientation(args.format, metadata.width, metadata.height);

  const repoRelativePath = path
    .relative(args.repoRoot, resolvedPath)
    .replace(/\\/gu, "/");
  const expectedDefault = THUMBNAIL_OUTPUTS[args.format].referencePath;
  const sha256 = await hashFile(resolvedPath);

  return {
    format: args.format,
    path: resolvedPath,
    repoRelativePath:
      repoRelativePath.length > 0 ? repoRelativePath : expectedDefault,
    sha256,
    byteSize: stat.size,
    width: metadata.width,
    height: metadata.height,
    mimeType: supportedFormats.get(metadata.format) ?? "application/octet-stream",
  };
}
