import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

import {
  assertChunkPlanCoversExactBytes,
  buildTikTokFileUploadTransferPlan,
  buildTikTokPullFromUrlTransferPlan,
  evaluatePullFromUrlEligibility,
  type TikTokLocalRenderArtifact,
  type TikTokTransferByteEvidence,
  type TikTokTransferChunkConstraints,
  type TikTokTransferPlan,
  type TikTokVerifiedPullDomainConfiguration,
  validateTikTokTransferByteEvidence,
  validateTikTokTransferPlan,
} from "@mediaforge/domain";

export const TIKTOK_OFFICIAL_FILE_UPLOAD_CHUNK_CONSTRAINTS: TikTokTransferChunkConstraints =
  {
    minChunkBytes: 5 * 1024 * 1024,
    maxChunkBytes: 64 * 1024 * 1024,
    preferredChunkBytes: 10 * 1024 * 1024,
  };

export type TikTokTransferChunkConstraintsPort = {
  getChunkConstraints(): TikTokTransferChunkConstraints;
};

export class FixtureTikTokTransferChunkConstraintsPort
  implements TikTokTransferChunkConstraintsPort
{
  public constructor(
    private readonly constraints: TikTokTransferChunkConstraints = TIKTOK_OFFICIAL_FILE_UPLOAD_CHUNK_CONSTRAINTS
  ) {}

  public getChunkConstraints(): TikTokTransferChunkConstraints {
    return this.constraints;
  }
}

export type TikTokTransferPlanningServiceInput = {
  readonly constraintsPort: TikTokTransferChunkConstraintsPort;
};

export class TikTokTransferPlanningService {
  public constructor(private readonly input: TikTokTransferPlanningServiceInput) {}

  public planFileUpload(input: {
    readonly source: TikTokLocalRenderArtifact;
    readonly plannedAt: string;
  }): TikTokTransferPlan {
    return validateTikTokTransferPlan(
      buildTikTokFileUploadTransferPlan({
        source: input.source,
        constraints: this.input.constraintsPort.getChunkConstraints(),
        plannedAt: input.plannedAt,
      })
    );
  }

  public evaluatePullFromUrl(input: {
    readonly source: TikTokLocalRenderArtifact;
    readonly sourceUrl: string;
    readonly domainConfiguration: TikTokVerifiedPullDomainConfiguration | null;
    readonly evaluatedAt: string;
  }) {
    return evaluatePullFromUrlEligibility({
      sourceUrl: input.sourceUrl,
      artifactContentHash: input.source.contentHash,
      expectedContentHash: input.source.contentHash,
      domainConfiguration: input.domainConfiguration,
      evaluatedAt: input.evaluatedAt,
    });
  }

  public planPullFromUrl(input: {
    readonly source: TikTokLocalRenderArtifact;
    readonly sourceUrl: string;
    readonly domainConfiguration: TikTokVerifiedPullDomainConfiguration;
    readonly plannedAt: string;
  }): TikTokTransferPlan {
    return validateTikTokTransferPlan(
      buildTikTokPullFromUrlTransferPlan({
        source: input.source,
        sourceUrl: input.sourceUrl,
        domainConfiguration: input.domainConfiguration,
        constraints: this.input.constraintsPort.getChunkConstraints(),
        plannedAt: input.plannedAt,
      })
    );
  }
}

export type TikTokTransferChunkDelivery = {
  readonly chunkIndex: number;
  readonly buffer: Buffer;
  readonly byteStart: number;
  readonly byteLength: number;
};

export async function streamTikTokFileUploadPlan(input: {
  readonly filePath: string;
  readonly plan: TikTokTransferPlan;
  readonly maxReadBufferBytes: number;
  readonly streamedAt: string;
  readonly deliverChunk?: (chunk: TikTokTransferChunkDelivery) => Promise<void>;
}): Promise<TikTokTransferByteEvidence> {
  if (input.plan.mode !== "FILE_UPLOAD") {
    throw new Error("Bounded streaming is only supported for FILE_UPLOAD transfer plans.");
  }

  assertChunkPlanCoversExactBytes({
    totalBytes: input.plan.totalBytes,
    chunks: input.plan.chunks,
    constraints: input.plan.chunkConstraints,
  });

  const handle = await open(input.filePath, "r");
  try {
    const chunkEvidence = [];
    let streamedBytes = 0;

    for (const chunk of input.plan.chunks) {
      if (chunk.byteLength > input.maxReadBufferBytes) {
        throw new Error(
          `Chunk ${chunk.chunkIndex} exceeds bounded streaming buffer limit of ${input.maxReadBufferBytes} bytes.`
        );
      }

      const buffer = Buffer.alloc(chunk.byteLength);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        chunk.byteLength,
        chunk.byteStart
      );
      if (bytesRead !== chunk.byteLength) {
        throw new Error(`Short read while streaming chunk ${chunk.chunkIndex}.`);
      }

      const chunkHash = createHash("sha256").update(buffer).digest("hex");
      streamedBytes += chunk.byteLength;

      if (input.deliverChunk) {
        await input.deliverChunk({
          chunkIndex: chunk.chunkIndex,
          buffer,
          byteStart: chunk.byteStart,
          byteLength: chunk.byteLength,
        });
      }

      chunkEvidence.push({
        chunkIndex: chunk.chunkIndex,
        byteLength: chunk.byteLength,
        chunkHash,
        streamedAt: input.streamedAt,
      });
    }

    if (streamedBytes !== input.plan.totalBytes) {
      throw new Error("Streamed byte count does not match the immutable transfer plan.");
    }

    return validateTikTokTransferByteEvidence({
      schemaVersion: "mediaforge.tiktok-transfer.v1",
      transferPlanId: input.plan.transferPlanId,
      mode: input.plan.mode,
      totalBytes: input.plan.totalBytes,
      contentHash: input.plan.contentHash,
      streamedBytes,
      chunkEvidence,
      completedAt: input.streamedAt,
    });
  } finally {
    await handle.close();
  }
}

export function computeLocalFileContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
