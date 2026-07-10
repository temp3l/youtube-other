import sharp from "sharp";
import type { ImageBatchItemStatus } from "./image-batch.types.js";

export class ImagePayloadValidationError extends Error {
  readonly status: ImageBatchItemStatus;
  readonly category: string;
  readonly code?: string;

  constructor(args: {
    readonly message: string;
    readonly status: ImageBatchItemStatus;
    readonly category: string;
    readonly code?: string;
  }) {
    super(args.message);
    this.name = "ImagePayloadValidationError";
    this.status = args.status;
    this.category = args.category;
    if (args.code !== undefined) {
      this.code = args.code;
    }
  }
}

export interface ValidatedImagePayload {
  readonly imageBuffer: Buffer;
  readonly normalizedBase64: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  readonly byteSize: number;
}

function expectedMimeType(format: "png" | "jpeg" | "webp"): string {
  return format === "png"
    ? "image/png"
    : format === "jpeg"
      ? "image/jpeg"
      : "image/webp";
}

function mimeTypeFromSharpFormat(format: string | undefined): string {
  return format === "png"
    ? "image/png"
    : format === "jpeg"
      ? "image/jpeg"
      : format === "webp"
        ? "image/webp"
        : "";
}

function parseRequestedSize(value: string | undefined):
  | { readonly width: number; readonly height: number }
  | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^(\d+)x(\d+)$/u.exec(value.trim().toLowerCase());
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

export function decodeBase64ImagePayload(value: string): {
  readonly imageBuffer: Buffer;
  readonly normalizedBase64: string;
} {
  const compact = value.replace(/\s+/gu, "");
  if (!/^[A-Za-z0-9+/=]+$/u.test(compact)) {
    throw new ImagePayloadValidationError({
      message: "Invalid base64 image payload.",
      status: "decode-failed",
      category: "invalid-base64",
      code: "invalid-base64",
    });
  }
  const imageBuffer = Buffer.from(compact, "base64");
  if (imageBuffer.byteLength === 0) {
    throw new ImagePayloadValidationError({
      message: "Empty image payload.",
      status: "decode-failed",
      category: "invalid-base64",
      code: "empty-payload",
    });
  }
  const normalizedBase64 = imageBuffer.toString("base64").replace(/=+$/gu, "");
  const inputNormalized = compact.replace(/=+$/gu, "");
  if (normalizedBase64 !== inputNormalized) {
    throw new ImagePayloadValidationError({
      message: "Invalid base64 image payload.",
      status: "decode-failed",
      category: "invalid-base64",
      code: "invalid-base64",
    });
  }
  return { imageBuffer, normalizedBase64 };
}

export async function validateImagePayload(args: {
  readonly base64: string;
  readonly expectedFormat: "png" | "jpeg" | "webp";
  readonly requestedSize?: string;
  readonly sceneId?: string;
}): Promise<ValidatedImagePayload> {
  const decoded = decodeBase64ImagePayload(args.base64);
  const metadata = await sharp(decoded.imageBuffer).metadata().catch((error) => {
    throw new ImagePayloadValidationError({
      message:
        error instanceof Error
          ? error.message
          : "Decoded image could not be parsed.",
      status: "validation-failed",
      category: "corrupt-file",
      code: "corrupt-file",
    });
  });
  if (!metadata.width || !metadata.height) {
    throw new ImagePayloadValidationError({
      message: "Decoded image is missing dimensions.",
      status: "validation-failed",
      category: "invalid-dimensions",
      code: "missing-dimensions",
    });
  }
  const actualMimeType = mimeTypeFromSharpFormat(metadata.format);
  const expected = expectedMimeType(args.expectedFormat);
  if (actualMimeType !== expected) {
    throw new ImagePayloadValidationError({
      message: `Unexpected image format for ${args.sceneId ?? "image"}: expected ${expected}, received ${actualMimeType || "unknown"}.`,
      status: "validation-failed",
      category: "invalid-mime-type",
      code: "invalid-mime-type",
    });
  }
  const requestedSize = parseRequestedSize(args.requestedSize);
  if (
    requestedSize &&
    (requestedSize.width !== metadata.width ||
      requestedSize.height !== metadata.height)
  ) {
    throw new ImagePayloadValidationError({
      message: `Unexpected image dimensions for ${args.sceneId ?? "image"}: expected ${requestedSize.width}x${requestedSize.height}, received ${metadata.width}x${metadata.height}.`,
      status: "validation-failed",
      category: "invalid-dimensions",
      code: "invalid-dimensions",
    });
  }
  return {
    imageBuffer: decoded.imageBuffer,
    normalizedBase64: decoded.normalizedBase64,
    width: metadata.width,
    height: metadata.height,
    mimeType: actualMimeType,
    byteSize: decoded.imageBuffer.byteLength,
  };
}
