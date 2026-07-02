import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  episodeFocalMetadataSchema,
  episodeIdSchema,
  focalMetadataOriginSchema,
  focalRegionIdSchema,
  sceneIdSchema,
  sourceImageFocalMetadataSchema,
  sourceImageIdSchema,
  type EpisodeFocalMetadata,
  type FocalMetadataOrigin,
  type SourceImageFocalMetadata,
} from "@mediaforge/domain";
import {
  ensureDir,
  fileExists,
  readJsonIfExists,
  resolveEpisodeFocalMetadataPath,
  writeJsonAtomic,
} from "@mediaforge/shared";

const focalMetadataAnalysisVersion = "focal-metadata-v1";

const focalMetadataImageReferenceSchema = z.object({
  sceneId: sceneIdSchema,
  outputPath: z.string().min(1),
  outputSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type FocalMetadataImageReference = z.infer<
  typeof focalMetadataImageReferenceSchema
>;

function buildSourceImageId(sceneId: string) {
  return sourceImageIdSchema.parse(`source-image-${sceneId}`);
}

function buildRegionId(sourceImageId: string, suffix: string) {
  return focalRegionIdSchema.parse(`${sourceImageId}-${suffix}`);
}

function resolveFocalMetadataPath(episodeDir: string, episodeId: string) {
  episodeIdSchema.parse(episodeId);
  return resolveEpisodeFocalMetadataPath(episodeDir);
}

function buildConservativeRegions(sourceImageId: string, width: number, height: number) {
  const portrait = height > width;
  const square = height === width;
  const safeCrop = square
    ? { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
    : portrait
      ? { x: 0.1, y: 0.08, width: 0.8, height: 0.84 }
      : { x: 0.08, y: 0.12, width: 0.84, height: 0.76 };
  const captionSafe = square
    ? { x: 0.1, y: 0.04, width: 0.8, height: 0.16 }
    : portrait
      ? { x: 0.1, y: 0.04, width: 0.8, height: 0.18 }
      : { x: 0.08, y: 0.04, width: 0.84, height: 0.16 };

  return [
    {
      id: buildRegionId(sourceImageId, "safe-crop"),
      kind: "safe-crop-region" as const,
      bounds: safeCrop,
      confidence: 0.25,
      label: "conservative-central-safe-crop",
    },
    {
      id: buildRegionId(sourceImageId, "caption-safe"),
      kind: "caption-safe-negative-space" as const,
      bounds: captionSafe,
      confidence: 0.15,
      label: "heuristic-caption-safe-band",
    },
  ];
}

function normalizeEpisodeFocalMetadata(
  value: EpisodeFocalMetadata,
): EpisodeFocalMetadata {
  return episodeFocalMetadataSchema.parse({
    ...value,
    images: [...value.images].sort((left, right) =>
      left.sourceImageId.localeCompare(right.sourceImageId),
    ),
  });
}

export async function loadEpisodeFocalMetadata(
  episodeDir: string,
  episodeId: string,
): Promise<EpisodeFocalMetadata | null> {
  return readJsonIfExists(
    resolveFocalMetadataPath(episodeDir, episodeId),
    (value) => episodeFocalMetadataSchema.parse(value),
  );
}

export function buildSourceImageFocalMetadata(input: {
  sourceImageId: string;
  sourceImagePath: string;
  sourceImageSha256?: string;
  imageWidth: number;
  imageHeight: number;
  origin: FocalMetadataOrigin;
  focalRegions: SourceImageFocalMetadata["focalRegions"];
  warnings?: readonly string[];
  limitations?: readonly string[];
}): SourceImageFocalMetadata {
  return sourceImageFocalMetadataSchema.parse({
    schemaVersion: 1,
    analysisVersion: focalMetadataAnalysisVersion,
    sourceImageId: sourceImageIdSchema.parse(input.sourceImageId),
    sourceImagePath: input.sourceImagePath,
    ...(input.sourceImageSha256
      ? { sourceImageSha256: input.sourceImageSha256 }
      : {}),
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    origin: focalMetadataOriginSchema.parse(input.origin),
    focalRegions: input.focalRegions,
    warnings: [...(input.warnings ?? [])],
    limitations: [...(input.limitations ?? [])],
  });
}

export async function buildConservativeFocalMetadata(args: {
  sourceImageId: string;
  sourceImagePath: string;
  sourceImageSha256?: string;
  origin?: Extract<FocalMetadataOrigin, "local-fallback" | "legacy-unknown">;
}): Promise<SourceImageFocalMetadata> {
  const metadata = await sharp(args.sourceImagePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Image dimensions are required for focal metadata: ${args.sourceImagePath}`);
  }

  return buildSourceImageFocalMetadata({
    sourceImageId: args.sourceImageId,
    sourceImagePath: args.sourceImagePath,
    ...(args.sourceImageSha256
      ? { sourceImageSha256: args.sourceImageSha256 }
      : {}),
    imageWidth: metadata.width,
    imageHeight: metadata.height,
    origin: args.origin ?? "local-fallback",
    focalRegions: buildConservativeRegions(
      args.sourceImageId,
      metadata.width,
      metadata.height,
    ),
    warnings: [
      "Conservative geometric fallback only; no face or object detection was performed.",
    ],
    limitations: [
      "Caption-safe guidance is heuristic and should be validated by later shot planning.",
    ],
  });
}

export async function upsertEpisodeFocalMetadata(args: {
  episodeDir: string;
  episodeId: string;
  entry: SourceImageFocalMetadata;
  expectedSourceImagePath?: string;
}): Promise<EpisodeFocalMetadata> {
  if (
    args.expectedSourceImagePath !== undefined &&
    args.entry.sourceImagePath !== args.expectedSourceImagePath
  ) {
    throw new Error(
      `Focal metadata path mismatch for ${args.entry.sourceImageId}: expected ${args.expectedSourceImagePath}`,
    );
  }

  const filePath = resolveFocalMetadataPath(args.episodeDir, args.episodeId);
  await ensureDir(path.dirname(filePath));
  const existing =
    (await loadEpisodeFocalMetadata(args.episodeDir, args.episodeId)) ?? {
      schemaVersion: 1 as const,
      analysisVersion: focalMetadataAnalysisVersion,
      images: [],
    };

  const filteredImages = existing.images.filter(
    (image) => image.sourceImageId !== args.entry.sourceImageId,
  );
  const next = normalizeEpisodeFocalMetadata({
    schemaVersion: 1,
    analysisVersion: focalMetadataAnalysisVersion,
    images: [...filteredImages, args.entry],
  });
  await writeJsonAtomic(filePath, next);
  return next;
}

export async function ensureEpisodeFocalMetadataForImages(args: {
  episodeDir: string;
  episodeId: string;
  images: readonly FocalMetadataImageReference[];
}): Promise<EpisodeFocalMetadata | null> {
  const existing = await loadEpisodeFocalMetadata(args.episodeDir, args.episodeId);
  const knownSourceImageIds = new Set(
    existing?.images.map((image) => image.sourceImageId) ?? [],
  );
  let current = existing;

  for (const imageReference of args.images) {
    const parsedReference = focalMetadataImageReferenceSchema.parse(imageReference);
    if (!(await fileExists(parsedReference.outputPath))) {
      continue;
    }

    const sourceImageId = buildSourceImageId(parsedReference.sceneId);
    if (knownSourceImageIds.has(sourceImageId)) {
      continue;
    }

    const entry = await buildConservativeFocalMetadata({
      sourceImageId,
      sourceImagePath: parsedReference.outputPath,
      ...(parsedReference.outputSha256
        ? { sourceImageSha256: parsedReference.outputSha256 }
        : {}),
      origin: "local-fallback",
    });
    current = await upsertEpisodeFocalMetadata({
      episodeDir: args.episodeDir,
      episodeId: args.episodeId,
      entry,
      expectedSourceImagePath: parsedReference.outputPath,
    });
    knownSourceImageIds.add(sourceImageId);
  }

  return current;
}
