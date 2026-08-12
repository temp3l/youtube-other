import { createHash } from "node:crypto";

import {
  TIKTOK_TRANSFER_SCHEMA_VERSION,
  type TikTokLocalRenderArtifact,
  type TikTokPullFromUrlEligibility,
  type TikTokTransferChunkConstraints,
  type TikTokTransferChunkRange,
  type TikTokTransferMode,
  type TikTokTransferPlan,
  type TikTokVerifiedPullDomainConfiguration,
  tikTokPullFromUrlEligibilitySchema,
  tikTokTransferPlanSchema,
} from "./tiktok-transfer-contracts.js";

export class TikTokTransferPolicyViolationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "TikTokTransferPolicyViolationError";
    this.code = code;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("TikTok transfer domain cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("TikTok transfer domain contains an unsupported value.");
}

export function assertValidTikTokTransferChunkConstraints(
  constraints: TikTokTransferChunkConstraints
): void {
  if (constraints.minChunkBytes > constraints.maxChunkBytes) {
    throw new Error("TikTok transfer chunk constraints require minChunkBytes <= maxChunkBytes.");
  }
  if (
    constraints.preferredChunkBytes < constraints.minChunkBytes ||
    constraints.preferredChunkBytes > constraints.maxChunkBytes
  ) {
    throw new Error(
      "TikTok transfer chunk constraints require preferredChunkBytes within min/max bounds."
    );
  }
}

export function resolveTikTokTransferMode(input: {
  readonly source: TikTokLocalRenderArtifact;
  readonly requestedMode?: TikTokTransferMode;
}): TikTokTransferMode {
  if (input.requestedMode === "PULL_FROM_URL") {
    return "PULL_FROM_URL";
  }
  return "FILE_UPLOAD";
}

export function planTikTokFileUploadChunks(input: {
  readonly totalBytes: number;
  readonly constraints: TikTokTransferChunkConstraints;
}): TikTokTransferChunkRange[] {
  const { totalBytes, constraints } = input;
  assertValidTikTokTransferChunkConstraints(constraints);

  if (totalBytes <= 0) {
    throw new TikTokTransferPolicyViolationError(
      "EMPTY_SOURCE",
      "TikTok transfer source must contain at least one byte."
    );
  }

  if (totalBytes <= constraints.maxChunkBytes) {
    return [
      {
        chunkIndex: 0,
        byteStart: 0,
        byteEndExclusive: totalBytes,
        byteLength: totalBytes,
      },
    ];
  }

  const targetChunkBytes = Math.min(
    Math.max(constraints.preferredChunkBytes, constraints.minChunkBytes),
    constraints.maxChunkBytes
  );
  const chunks: TikTokTransferChunkRange[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < totalBytes) {
    const remaining = totalBytes - offset;
    let chunkSize = Math.min(targetChunkBytes, remaining);

    if (remaining > constraints.maxChunkBytes) {
      const afterThis = remaining - chunkSize;
      if (afterThis > 0 && afterThis < constraints.minChunkBytes) {
        chunkSize = remaining - constraints.minChunkBytes;
      }
    }

    if (chunkSize <= 0 || chunkSize > remaining) {
      throw new Error("TikTok transfer chunk planning produced an invalid chunk size.");
    }

    chunks.push({
      chunkIndex,
      byteStart: offset,
      byteEndExclusive: offset + chunkSize,
      byteLength: chunkSize,
    });
    offset += chunkSize;
    chunkIndex += 1;
  }

  return chunks;
}

export function assertChunkPlanCoversExactBytes(input: {
  readonly totalBytes: number;
  readonly chunks: readonly TikTokTransferChunkRange[];
  readonly constraints: TikTokTransferChunkConstraints;
}): void {
  const { totalBytes, chunks, constraints } = input;
  if (chunks.length === 0) {
    throw new TikTokTransferPolicyViolationError(
      "EMPTY_CHUNK_PLAN",
      "TikTok transfer chunk plan must contain at least one chunk."
    );
  }

  if (chunks[0]!.byteStart !== 0) {
    throw new TikTokTransferPolicyViolationError(
      "CHUNK_RANGE_GAP",
      "TikTok transfer chunks must start at byte zero."
    );
  }

  let covered = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    const isLast = index === chunks.length - 1;

    if (chunk.byteLength !== chunk.byteEndExclusive - chunk.byteStart) {
      throw new TikTokTransferPolicyViolationError(
        "CHUNK_RANGE_INVALID",
        `TikTok transfer chunk ${chunk.chunkIndex} has inconsistent byte range metadata.`
      );
    }

    if (!isLast) {
      if (chunk.byteLength < constraints.minChunkBytes) {
        throw new TikTokTransferPolicyViolationError(
          "CHUNK_BELOW_MIN",
          `TikTok transfer chunk ${chunk.chunkIndex} is below the provider minimum.`
        );
      }
      if (chunk.byteLength > constraints.maxChunkBytes) {
        throw new TikTokTransferPolicyViolationError(
          "CHUNK_ABOVE_MAX",
          `TikTok transfer chunk ${chunk.chunkIndex} exceeds the provider maximum.`
        );
      }
    } else if (chunk.byteLength > constraints.maxChunkBytes) {
      throw new TikTokTransferPolicyViolationError(
        "CHUNK_ABOVE_MAX",
        `TikTok transfer final chunk ${chunk.chunkIndex} exceeds the provider maximum.`
      );
    }

    if (index > 0) {
      const previous = chunks[index - 1]!;
      if (previous.byteEndExclusive !== chunk.byteStart) {
        throw new TikTokTransferPolicyViolationError(
          "CHUNK_RANGE_GAP",
          `TikTok transfer chunk ${chunk.chunkIndex} is not contiguous with the previous chunk.`
        );
      }
    }

    covered += chunk.byteLength;
  }

  if (covered !== totalBytes) {
    throw new TikTokTransferPolicyViolationError(
      "CHUNK_RANGE_INCOMPLETE",
      "TikTok transfer chunks do not cover the immutable source bytes exactly."
    );
  }
}

export function buildTikTokTransferPlanId(input: {
  readonly mode: TikTokTransferMode;
  readonly contentHash: string;
  readonly totalBytes: number;
  readonly pullFromUrl?: { readonly sourceUrl: string };
}): string {
  const digest = createHash("sha256")
    .update(
      canonicalJson({
        mode: input.mode,
        contentHash: input.contentHash,
        totalBytes: input.totalBytes,
        pullFromUrl: input.pullFromUrl?.sourceUrl ?? null,
      }),
      "utf8"
    )
    .digest("hex")
    .slice(0, 24);
  return `transfer.tiktok.${digest}`;
}

export function buildTikTokFileUploadTransferPlan(input: {
  readonly source: TikTokLocalRenderArtifact;
  readonly constraints: TikTokTransferChunkConstraints;
  readonly plannedAt: string;
}): TikTokTransferPlan {
  const chunks = planTikTokFileUploadChunks({
    totalBytes: input.source.byteLength,
    constraints: input.constraints,
  });
  assertChunkPlanCoversExactBytes({
    totalBytes: input.source.byteLength,
    chunks,
    constraints: input.constraints,
  });

  return tikTokTransferPlanSchema.parse({
    schemaVersion: TIKTOK_TRANSFER_SCHEMA_VERSION,
    transferPlanId: buildTikTokTransferPlanId({
      mode: "FILE_UPLOAD",
      contentHash: input.source.contentHash,
      totalBytes: input.source.byteLength,
    }),
    mode: "FILE_UPLOAD",
    source: input.source,
    totalBytes: input.source.byteLength,
    contentHash: input.source.contentHash,
    chunkConstraints: input.constraints,
    chunks,
    plannedAt: input.plannedAt,
  });
}

export function evaluatePullFromUrlEligibility(input: {
  readonly sourceUrl: string;
  readonly artifactContentHash: string;
  readonly expectedContentHash: string;
  readonly domainConfiguration: TikTokVerifiedPullDomainConfiguration | null | undefined;
  readonly evaluatedAt: string;
}): TikTokPullFromUrlEligibility {
  const reject = (reasonCode: string): TikTokPullFromUrlEligibility =>
    tikTokPullFromUrlEligibilitySchema.parse({
      schemaVersion: TIKTOK_TRANSFER_SCHEMA_VERSION,
      eligible: false,
      reasonCode,
      evaluatedAt: input.evaluatedAt,
    });

  if (!input.domainConfiguration) {
    return reject("VERIFIED_DOMAIN_CONFIGURATION_MISSING");
  }
  if (!input.domainConfiguration.active) {
    return reject("VERIFIED_DOMAIN_CONFIGURATION_INACTIVE");
  }
  if (
    !input.domainConfiguration.operatorOwned ||
    !input.domainConfiguration.tiktokVerified ||
    !input.domainConfiguration.httpsOnly
  ) {
    return reject("VERIFIED_DOMAIN_CONFIGURATION_INVALID");
  }
  if (input.artifactContentHash !== input.expectedContentHash) {
    return reject("SOURCE_HASH_MISMATCH");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.sourceUrl);
  } catch {
    return reject("SOURCE_URL_INVALID");
  }
  if (parsed.protocol !== "https:") {
    return reject("SOURCE_URL_NOT_HTTPS");
  }

  const hostname = parsed.hostname.toLowerCase();
  const verifiedDomain = input.domainConfiguration.verifiedDomain.toLowerCase();
  const hostMatches =
    hostname === verifiedDomain || hostname.endsWith(`.${verifiedDomain}`);
  if (!hostMatches) {
    return reject("SOURCE_URL_DOMAIN_NOT_VERIFIED");
  }

  return tikTokPullFromUrlEligibilitySchema.parse({
    schemaVersion: TIKTOK_TRANSFER_SCHEMA_VERSION,
    eligible: true,
    verifiedDomainConfigurationId: input.domainConfiguration.configurationId,
    evaluatedAt: input.evaluatedAt,
  });
}

export function buildTikTokPullFromUrlTransferPlan(input: {
  readonly source: TikTokLocalRenderArtifact;
  readonly sourceUrl: string;
  readonly domainConfiguration: TikTokVerifiedPullDomainConfiguration;
  readonly constraints: TikTokTransferChunkConstraints;
  readonly plannedAt: string;
}): TikTokTransferPlan {
  const eligibility = evaluatePullFromUrlEligibility({
    sourceUrl: input.sourceUrl,
    artifactContentHash: input.source.contentHash,
    expectedContentHash: input.source.contentHash,
    domainConfiguration: input.domainConfiguration,
    evaluatedAt: input.plannedAt,
  });
  if (!eligibility.eligible) {
    throw new TikTokTransferPolicyViolationError(
      eligibility.reasonCode ?? "PULL_FROM_URL_INELIGIBLE",
      "PULL_FROM_URL is not eligible without verified operator-owned HTTPS configuration."
    );
  }

  return tikTokTransferPlanSchema.parse({
    schemaVersion: TIKTOK_TRANSFER_SCHEMA_VERSION,
    transferPlanId: buildTikTokTransferPlanId({
      mode: "PULL_FROM_URL",
      contentHash: input.source.contentHash,
      totalBytes: input.source.byteLength,
      pullFromUrl: { sourceUrl: input.sourceUrl },
    }),
    mode: "PULL_FROM_URL",
    source: input.source,
    totalBytes: input.source.byteLength,
    contentHash: input.source.contentHash,
    chunkConstraints: input.constraints,
    chunks: [
      {
        chunkIndex: 0,
        byteStart: 0,
        byteEndExclusive: input.source.byteLength,
        byteLength: input.source.byteLength,
      },
    ],
    pullFromUrl: {
      sourceUrl: input.sourceUrl,
      verifiedDomainConfigurationId: input.domainConfiguration.configurationId,
    },
    plannedAt: input.plannedAt,
  });
}
