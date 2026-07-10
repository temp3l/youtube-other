import path from "node:path";
import sharp from "sharp";
import type { VideoVariant } from "@mediaforge/domain";
import { fileExists } from "@mediaforge/shared";

export interface MediaDimensionSpec {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: "16:9" | "9:16";
  readonly size: string;
}

export interface MediaProfileSpec {
  readonly videoKind: VideoVariant;
  readonly aspectRatio: "16:9" | "9:16";
  readonly imageGenerationSize: MediaDimensionSpec;
  readonly renderSize: MediaDimensionSpec;
  readonly thumbnailSize: MediaDimensionSpec;
}

export interface VideoImageSpec {
  readonly videoKind: VideoVariant;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: "16:9" | "9:16";
}

function createDimensionSpec(
  width: number,
  height: number,
  aspectRatio: "16:9" | "9:16"
): MediaDimensionSpec {
  return {
    width,
    height,
    aspectRatio,
    size: `${width}x${height}`,
  };
}

export const MEDIA_PROFILE_SPECS: Record<VideoVariant, MediaProfileSpec> = {
  full: {
    videoKind: "full",
    aspectRatio: "16:9",
    imageGenerationSize: createDimensionSpec(1536, 864, "16:9"),
    renderSize: createDimensionSpec(1920, 1080, "16:9"),
    thumbnailSize: createDimensionSpec(1536, 864, "16:9"),
  },
  short: {
    videoKind: "short",
    aspectRatio: "9:16",
    imageGenerationSize: createDimensionSpec(864, 1536, "9:16"),
    renderSize: createDimensionSpec(1080, 1920, "9:16"),
    thumbnailSize: createDimensionSpec(864, 1536, "9:16"),
  },
};

export interface MediaImageValidationContext {
  readonly episodeId: string;
  readonly language: string;
  readonly videoKind: VideoVariant;
  readonly imagePath: string;
}

export class MediaImageDimensionError extends Error {
  public readonly episodeId: string;
  public readonly language: string;
  public readonly videoKind: VideoVariant;
  public readonly imagePath: string;
  public readonly purpose: "image-generation" | "render" | "thumbnail";
  public readonly expectedWidth: number;
  public readonly expectedHeight: number;
  public readonly actualWidth: number | undefined;
  public readonly actualHeight: number | undefined;

  public constructor(
    args: MediaImageValidationContext & {
      readonly purpose: "image-generation" | "render" | "thumbnail";
      readonly expectedWidth: number;
      readonly expectedHeight: number;
      readonly expectedAspectRatio: "16:9" | "9:16";
      readonly actualWidth?: number;
      readonly actualHeight?: number;
      readonly reason?: string;
    }
  ) {
    const actual =
      args.actualWidth !== undefined && args.actualHeight !== undefined
        ? `${args.actualWidth}x${args.actualHeight}`
        : "unavailable";
    const reason = args.reason ? ` ${args.reason}` : "";
    super(
      [
        `Invalid ${args.videoKind} ${args.purpose} image dimensions.`,
        `episode=${args.episodeId}`,
        `language=${args.language}`,
        `profile=${args.videoKind}`,
        `imagePath=${path.resolve(args.imagePath)}`,
        `actual=${actual}`,
        `expected=${args.expectedWidth}x${args.expectedHeight}`,
        `aspectRatio=${args.expectedAspectRatio}.`,
      ].join(" ") + reason
    );
    this.name = "MediaImageDimensionError";
    this.episodeId = args.episodeId;
    this.language = args.language;
    this.videoKind = args.videoKind;
    this.imagePath = args.imagePath;
    this.purpose = args.purpose;
    this.expectedWidth = args.expectedWidth;
    this.expectedHeight = args.expectedHeight;
    this.actualWidth = args.actualWidth;
    this.actualHeight = args.actualHeight;
  }
}

export function resolveMediaProfileSpec(videoKind: VideoVariant): MediaProfileSpec {
  return MEDIA_PROFILE_SPECS[videoKind];
}

export function resolveVideoImageSpec(videoKind: VideoVariant): VideoImageSpec {
  const spec = resolveMediaProfileSpec(videoKind).renderSize;
  return {
    videoKind,
    width: spec.width,
    height: spec.height,
    aspectRatio: spec.aspectRatio,
  };
}

export function resolveImageGenerationSizeSpec(
  videoKind: VideoVariant
): MediaDimensionSpec {
  return resolveMediaProfileSpec(videoKind).imageGenerationSize;
}

export function parseMediaDimensionSpec(args: {
  readonly size: string;
  readonly videoKind: VideoVariant;
}): MediaDimensionSpec {
  const match = /^(\d+)x(\d+)$/u.exec(args.size.trim());
  if (!match) {
    throw new Error(`Invalid image size value: ${args.size}`);
  }
  const width = Number.parseInt(match[1] ?? "", 10);
  const height = Number.parseInt(match[2] ?? "", 10);
  const aspectRatio = resolveMediaProfileSpec(args.videoKind).aspectRatio;
  return createDimensionSpec(width, height, aspectRatio);
}

export function formatVideoImageSpec(spec: VideoImageSpec): string {
  return `${spec.width}x${spec.height}`;
}

export async function readImageDimensions(
  imagePath: string
): Promise<{ readonly width: number; readonly height: number }> {
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to inspect image dimensions for ${imagePath}.`);
  }
  return {
    width: metadata.width,
    height: metadata.height,
  };
}

async function assertImageFileMatchesExpectedDimensions(args: {
  readonly context: MediaImageValidationContext;
  readonly purpose: "image-generation" | "render" | "thumbnail";
  readonly expected: MediaDimensionSpec;
}): Promise<{
  readonly width: number;
  readonly height: number;
  readonly spec: MediaDimensionSpec;
}> {
  if (!(await fileExists(args.context.imagePath))) {
    throw new MediaImageDimensionError({
      ...args.context,
      purpose: args.purpose,
      expectedWidth: args.expected.width,
      expectedHeight: args.expected.height,
      expectedAspectRatio: args.expected.aspectRatio,
      reason: " Image file is missing.",
    });
  }

  const dimensions = await readImageDimensions(args.context.imagePath).catch((error) => {
    const reason =
      error instanceof Error ? ` Unable to decode image dimensions: ${error.message}` : undefined;
    throw new MediaImageDimensionError({
      ...args.context,
      purpose: args.purpose,
      expectedWidth: args.expected.width,
      expectedHeight: args.expected.height,
      expectedAspectRatio: args.expected.aspectRatio,
      ...(reason ? { reason } : {}),
    });
  });

  if (dimensions.width !== args.expected.width || dimensions.height !== args.expected.height) {
    throw new MediaImageDimensionError({
      ...args.context,
      purpose: args.purpose,
      expectedWidth: args.expected.width,
      expectedHeight: args.expected.height,
      expectedAspectRatio: args.expected.aspectRatio,
      actualWidth: dimensions.width,
      actualHeight: dimensions.height,
    });
  }

  return {
    ...dimensions,
    spec: args.expected,
  };
}

export async function assertGeneratedImageFileMatchesSpec(
  context: MediaImageValidationContext & {
    readonly expectedSize?: string | MediaDimensionSpec;
  }
): Promise<{
  readonly width: number;
  readonly height: number;
  readonly spec: MediaDimensionSpec;
}> {
  const expected =
    typeof context.expectedSize === "string"
      ? parseMediaDimensionSpec({
          size: context.expectedSize,
          videoKind: context.videoKind,
        })
      : context.expectedSize ?? resolveImageGenerationSizeSpec(context.videoKind);
  return assertImageFileMatchesExpectedDimensions({
    context,
    purpose: "image-generation",
    expected,
  });
}

export async function assertVideoImageFileMatchesSpec(
  context: MediaImageValidationContext
): Promise<{ readonly width: number; readonly height: number; readonly spec: VideoImageSpec }> {
  const renderSpec = resolveVideoImageSpec(context.videoKind);
  const validated = await assertImageFileMatchesExpectedDimensions({
    context,
    purpose: "render",
    expected: {
      width: renderSpec.width,
      height: renderSpec.height,
      aspectRatio: renderSpec.aspectRatio,
      size: `${renderSpec.width}x${renderSpec.height}`,
    },
  });
  return {
    width: validated.width,
    height: validated.height,
    spec: renderSpec,
  };
}

export async function assertVideoImageFilesMatchSpec(args: {
  readonly episodeId: string;
  readonly language: string;
  readonly videoKind: VideoVariant;
  readonly imagePaths: readonly string[];
}): Promise<void> {
  for (const imagePath of args.imagePaths) {
    await assertVideoImageFileMatchesSpec({
      episodeId: args.episodeId,
      language: args.language,
      videoKind: args.videoKind,
      imagePath,
    });
  }
}

export async function normalizeImageBufferToSpec(args: {
  readonly imageBuffer: Buffer;
  readonly videoKind: VideoVariant;
  readonly format: "png" | "jpeg" | "webp";
}): Promise<Buffer> {
  const spec = resolveVideoImageSpec(args.videoKind);
  let pipeline = sharp(args.imageBuffer).resize(spec.width, spec.height, {
    fit: "cover",
    position: "centre",
  });
  if (args.format === "jpeg") {
    pipeline = pipeline.jpeg();
  } else if (args.format === "webp") {
    pipeline = pipeline.webp();
  } else {
    pipeline = pipeline.png();
  }
  return pipeline.toBuffer();
}

export async function normalizeImageFileToSpec(args: {
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly videoKind: VideoVariant;
  readonly format: "png" | "jpeg" | "webp";
}): Promise<void> {
  const buffer = await normalizeImageBufferToSpec({
    imageBuffer: await sharp(args.sourcePath).toBuffer(),
    videoKind: args.videoKind,
    format: args.format,
  });
  await sharp(buffer).toFile(args.outputPath);
}
