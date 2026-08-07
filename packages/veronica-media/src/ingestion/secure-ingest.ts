import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";

export const VERONICA_INGEST_LIMITS = {
  maxTotalBytes: 500 * 1024 * 1024,
  maxPdfPages: 150,
  maxPresentationSlides: 100,
  maxRetainedCandidates: 50,
  maxSvgBytes: 2 * 1024 * 1024,
  maxArchiveEntries: 500,
  maxDecompressedBytes: 200 * 1024 * 1024,
} as const;

const signatureMatchers: ReadonlyArray<{
  readonly mimeType: string;
  readonly mediaKind:
    | "pdf"
    | "pptx"
    | "png"
    | "jpeg"
    | "webp"
    | "svg"
    | "mp4"
    | "mov";
  readonly match: (bytes: Uint8Array) => boolean;
}> = [
  {
    mimeType: "application/pdf",
    mediaKind: "pdf",
    match: (bytes) =>
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d,
  },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    mediaKind: "pptx",
    match: (bytes) =>
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04,
  },
  {
    mimeType: "image/png",
    mediaKind: "png",
    match: (bytes) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  {
    mimeType: "image/jpeg",
    mediaKind: "jpeg",
    match: (bytes) =>
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    mimeType: "image/webp",
    mediaKind: "webp",
    match: (bytes) =>
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50,
  },
  {
    mimeType: "video/mp4",
    mediaKind: "mp4",
    match: (bytes) =>
      bytes.length >= 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70,
  },
  {
    mimeType: "video/quicktime",
    mediaKind: "mov",
    match: (bytes) =>
      bytes.length >= 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70,
  },
];

export type VeronicaIngestErrorCode =
  | "PATH_TRAVERSAL"
  | "MIME_MISMATCH"
  | "UNSUPPORTED_MEDIA"
  | "SIZE_LIMIT_EXCEEDED"
  | "ARCHIVE_ENTRY_LIMIT"
  | "DECOMPRESSION_BOMB"
  | "SVG_ACTIVE_CONTENT"
  | "MALFORMED_ARCHIVE"
  | "EMPTY_INPUT";

export class VeronicaIngestError extends Error {
  public constructor(
    public readonly code: VeronicaIngestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VeronicaIngestError";
  }
}

export interface VeronicaIngestedAsset {
  readonly assetId: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly mediaKind:
    | "pdf"
    | "pptx"
    | "png"
    | "jpeg"
    | "webp"
    | "svg"
    | "mp4"
    | "mov";
  readonly checksum: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
  readonly extractedCandidates: readonly VeronicaExtractedCandidate[];
}

export interface VeronicaExtractedCandidate {
  readonly candidateId: string;
  readonly label: string;
  readonly pageNumber?: number;
  readonly slideNumber?: number;
  readonly textPreview?: string;
  readonly checksum: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertSafeFilename(filename: string): string {
  const base = path.basename(filename);
  if (!base || base === "." || base === ".." || base.includes("\0")) {
    throw new VeronicaIngestError("PATH_TRAVERSAL", `Unsafe filename: ${filename}`);
  }
  if (base.includes("..") || base.includes("/") || base.includes("\\")) {
    throw new VeronicaIngestError("PATH_TRAVERSAL", `Unsafe filename: ${filename}`);
  }
  return base;
}

function detectSignature(bytes: Uint8Array): (typeof signatureMatchers)[number] | null {
  if (bytes.length >= 5) {
    const textPrefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 256))).toString("utf8");
    if (/^\s*<svg[\s>]/iu.test(textPrefix)) {
      return {
        mimeType: "image/svg+xml",
        mediaKind: "svg",
        match: () => true,
      };
    }
  }
  return signatureMatchers.find((candidate) => candidate.match(bytes)) ?? null;
}

export function sanitizeSvgContent(svg: string): string {
  if (/<script\b|on[a-z]+\s*=|javascript:/iu.test(svg)) {
    throw new VeronicaIngestError("SVG_ACTIVE_CONTENT", "SVG contains active content.");
  }
  return svg
    .replace(/<script[\s\S]*?<\/script>/giu, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/giu, "");
}

function countZipEntries(bytes: Uint8Array): number {
  let offset = 0;
  let entries = 0;
  while (offset + 30 <= bytes.length) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x03 ||
      bytes[offset + 3] !== 0x04
    ) {
      break;
    }
    entries += 1;
    const compressedSize =
      bytes[offset + 18]! |
      (bytes[offset + 19]! << 8) |
      (bytes[offset + 20]! << 16) |
      (bytes[offset + 21]! << 24);
    const nameLength = bytes[offset + 26]! | (bytes[offset + 27]! << 8);
    const extraLength = bytes[offset + 28]! | (bytes[offset + 29]! << 8);
    const headerSize = 30 + nameLength + extraLength;
    const remaining = bytes.length - offset;
    if (headerSize > remaining) {
      break;
    }
    if (compressedSize > remaining - headerSize) {
      break;
    }
    if (entries > VERONICA_INGEST_LIMITS.maxArchiveEntries) {
      throw new VeronicaIngestError(
        "ARCHIVE_ENTRY_LIMIT",
        `Archive exceeds ${VERONICA_INGEST_LIMITS.maxArchiveEntries} entries.`,
      );
    }
    if (compressedSize > VERONICA_INGEST_LIMITS.maxDecompressedBytes) {
      throw new VeronicaIngestError(
        "DECOMPRESSION_BOMB",
        "Archive entry exceeds decompression limit.",
      );
    }
    offset += headerSize + compressedSize;
  }
  return entries;
}

function estimatePdfPages(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/gu) ?? [];
  return Math.max(1, matches.length);
}

function estimatePptxSlides(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/ppt\/slides\/slide\d+\.xml/gu) ?? [];
  return Math.max(1, matches.length);
}

function buildCandidates(
  mediaKind: VeronicaIngestedAsset["mediaKind"],
  bytes: Uint8Array,
  filename: string,
): VeronicaExtractedCandidate[] {
  const assetStem = path.basename(filename, path.extname(filename));
  if (mediaKind === "pdf") {
    const pages = Math.min(estimatePdfPages(bytes), VERONICA_INGEST_LIMITS.maxPdfPages);
    return Array.from({ length: pages }, (_, index) => ({
      candidateId: `${assetStem}-page-${index + 1}`,
      label: `Page ${index + 1}`,
      pageNumber: index + 1,
      checksum: sha256(bytes.subarray(0, Math.min(bytes.length, 4096 + index))),
    })).slice(0, VERONICA_INGEST_LIMITS.maxRetainedCandidates);
  }
  if (mediaKind === "pptx") {
    const slides = Math.min(
      estimatePptxSlides(bytes),
      VERONICA_INGEST_LIMITS.maxPresentationSlides,
    );
    return Array.from({ length: slides }, (_, index) => ({
      candidateId: `${assetStem}-slide-${index + 1}`,
      label: `Slide ${index + 1}`,
      slideNumber: index + 1,
      checksum: sha256(bytes.subarray(0, Math.min(bytes.length, 4096 + index * 8))),
    })).slice(0, VERONICA_INGEST_LIMITS.maxRetainedCandidates);
  }
  if (mediaKind === "svg") {
    const sanitized = sanitizeSvgContent(Buffer.from(bytes).toString("utf8"));
    return [
      {
        candidateId: `${assetStem}-svg`,
        label: assetStem,
        textPreview: sanitized.slice(0, 120),
        checksum: sha256(Buffer.from(sanitized, "utf8")),
      },
    ];
  }
  return [
    {
      candidateId: `${assetStem}-primary`,
      label: assetStem,
      checksum: sha256(bytes),
    },
  ];
}

export function ingestSupplementalMediaAsset(input: {
  readonly assetId: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly declaredMimeType?: string;
}): VeronicaIngestedAsset {
  if (input.bytes.length === 0) {
    throw new VeronicaIngestError("EMPTY_INPUT", "Input file is empty.");
  }
  if (input.bytes.length > VERONICA_INGEST_LIMITS.maxTotalBytes) {
    throw new VeronicaIngestError(
      "SIZE_LIMIT_EXCEEDED",
      `Input exceeds ${VERONICA_INGEST_LIMITS.maxTotalBytes} bytes.`,
    );
  }
  const originalFilename = assertSafeFilename(input.filename);
  const signature = detectSignature(input.bytes);
  if (!signature) {
    throw new VeronicaIngestError("UNSUPPORTED_MEDIA", `Unsupported media: ${originalFilename}`);
  }
  if (
    input.declaredMimeType &&
    input.declaredMimeType !== signature.mimeType &&
    !(signature.mediaKind === "mov" && input.declaredMimeType === "video/mp4")
  ) {
    throw new VeronicaIngestError(
      "MIME_MISMATCH",
      `Declared MIME ${input.declaredMimeType} does not match detected ${signature.mimeType}.`,
    );
  }
  if (signature.mediaKind === "pptx") {
    const entries = countZipEntries(input.bytes);
    if (entries === 0) {
      throw new VeronicaIngestError("MALFORMED_ARCHIVE", "PPTX archive is malformed.");
    }
  }
  if (signature.mediaKind === "svg" && input.bytes.length > VERONICA_INGEST_LIMITS.maxSvgBytes) {
    throw new VeronicaIngestError("SIZE_LIMIT_EXCEEDED", "SVG exceeds size limit.");
  }
  if (signature.mediaKind === "svg") {
    sanitizeSvgContent(Buffer.from(input.bytes).toString("utf8"));
  }
  const checksum = sha256(input.bytes);
  return {
    assetId: input.assetId,
    originalFilename,
    mimeType: signature.mimeType,
    mediaKind: signature.mediaKind,
    checksum,
    byteLength: input.bytes.length,
    bytes: input.bytes,
    extractedCandidates: buildCandidates(signature.mediaKind, input.bytes, originalFilename),
  };
}

export const veronicaIngestBatchSchema = z.strictObject({
  assets: z.array(
    z.strictObject({
      assetId: z.string().min(1),
      originalFilename: z.string().min(1),
      mimeType: z.string().min(1),
      checksum: z.string().regex(/^[a-f0-9]{64}$/u),
      byteLength: z.number().int().nonnegative(),
      mediaKind: z.enum([
        "pdf",
        "pptx",
        "png",
        "jpeg",
        "webp",
        "svg",
        "mp4",
        "mov",
      ]),
      candidateCount: z.number().int().nonnegative(),
    }),
  ),
  totalBytes: z.number().int().nonnegative(),
});

export function summarizeIngestBatch(
  assets: readonly VeronicaIngestedAsset[],
): z.infer<typeof veronicaIngestBatchSchema> {
  const totalBytes = assets.reduce((sum, asset) => sum + asset.byteLength, 0);
  if (totalBytes > VERONICA_INGEST_LIMITS.maxTotalBytes) {
    throw new VeronicaIngestError(
      "SIZE_LIMIT_EXCEEDED",
      `Batch exceeds ${VERONICA_INGEST_LIMITS.maxTotalBytes} bytes.`,
    );
  }
  return veronicaIngestBatchSchema.parse({
    assets: assets.map((asset) => ({
      assetId: asset.assetId,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      checksum: asset.checksum,
      byteLength: asset.byteLength,
      mediaKind: asset.mediaKind,
      candidateCount: asset.extractedCandidates.length,
    })),
    totalBytes,
  });
}
