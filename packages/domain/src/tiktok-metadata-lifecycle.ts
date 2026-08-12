import { createHash } from "node:crypto";

import {
  type TikTokDisclosureDeclarations,
  type TikTokLocaleEditorialMetadata,
  type TikTokLocaleProviderPolicy,
  type TikTokMediaProvenance,
  type TikTokMetadataRevision,
  TIKTOK_METADATA_SCHEMA_VERSION,
  tikTokMetadataRevisionSchema,
} from "./tiktok-metadata-contracts.js";

export class TikTokMetadataPolicyViolationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "TikTokMetadataPolicyViolationError";
    this.code = code;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("TikTok metadata cannot contain a non-finite number.");
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
  throw new Error("TikTok metadata contains an unsupported value.");
}

export function computeTikTokMediaProvenanceHash(
  provenance: TikTokMediaProvenance
): string {
  return createHash("sha256").update(canonicalJson(provenance)).digest("hex");
}

export function deriveTikTokDisclosureDeclarations(
  provenance: TikTokMediaProvenance
): TikTokDisclosureDeclarations {
  return {
    aiContentDeclared:
      provenance.syntheticVoiceUsed || provenance.syntheticVisualsUsed,
    commercialContentDeclared:
      provenance.sponsoredContent || provenance.paidPartnership,
    derivationSource: "media_provenance",
    provenanceHash: computeTikTokMediaProvenanceHash(provenance),
  };
}

export function computeTikTokMetadataRevisionContentHash(input: {
  readonly metadataRevisionId: string;
  readonly revision: number;
  readonly episodeId: string;
  readonly episodeRevisionId: string;
  readonly locale: TikTokMetadataRevision["locale"];
  readonly provider: "tiktok";
  readonly metadataProfileId: string;
  readonly metadataProfileVersion: number;
  readonly editorial: TikTokLocaleEditorialMetadata;
  readonly providerPolicy: TikTokLocaleProviderPolicy;
  readonly mediaProvenance: TikTokMediaProvenance;
  readonly disclosure: TikTokDisclosureDeclarations;
  readonly createdAt: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        schemaVersion: TIKTOK_METADATA_SCHEMA_VERSION,
        metadataRevisionId: input.metadataRevisionId,
        revision: input.revision,
        episodeId: input.episodeId,
        episodeRevisionId: input.episodeRevisionId,
        locale: input.locale,
        provider: input.provider,
        metadataProfileId: input.metadataProfileId,
        metadataProfileVersion: input.metadataProfileVersion,
        editorial: input.editorial,
        providerPolicy: input.providerPolicy,
        mediaProvenance: input.mediaProvenance,
        disclosure: input.disclosure,
        createdAt: input.createdAt,
      })
    )
    .digest("hex");
}

export function validateTikTokDisclosureConsistency(input: {
  readonly mediaProvenance: TikTokMediaProvenance;
  readonly disclosure: TikTokDisclosureDeclarations;
}): void {
  const expected = deriveTikTokDisclosureDeclarations(input.mediaProvenance);
  if (input.disclosure.aiContentDeclared !== expected.aiContentDeclared) {
    throw new TikTokMetadataPolicyViolationError(
      "disclosure_ai_mismatch",
      "AI-content disclosure must derive from media provenance, not editorial text."
    );
  }
  if (
    input.disclosure.commercialContentDeclared !==
    expected.commercialContentDeclared
  ) {
    throw new TikTokMetadataPolicyViolationError(
      "disclosure_commercial_mismatch",
      "Commercial-content disclosure must derive from media provenance, not editorial text."
    );
  }
  if (input.disclosure.provenanceHash !== expected.provenanceHash) {
    throw new TikTokMetadataPolicyViolationError(
      "disclosure_provenance_hash_mismatch",
      "Disclosure provenance hash must match the bound media provenance."
    );
  }
  if (input.disclosure.derivationSource !== "media_provenance") {
    throw new TikTokMetadataPolicyViolationError(
      "disclosure_derivation_source_invalid",
      "TikTok disclosure declarations must be provenance-derived."
    );
  }
}

export function validateTikTokMetadataPolicy(
  revision: TikTokMetadataRevision
): void {
  validateTikTokDisclosureConsistency({
    mediaProvenance: revision.mediaProvenance,
    disclosure: revision.disclosure,
  });

  const uniqueHashtags = new Set(
    revision.editorial.hashtags.map((tag) => tag.toLowerCase())
  );
  if (uniqueHashtags.size !== revision.editorial.hashtags.length) {
    throw new TikTokMetadataPolicyViolationError(
      "duplicate_hashtags",
      "TikTok hashtags must be unique per revision."
    );
  }

  if (revision.editorial.caption.length > 2200) {
    throw new TikTokMetadataPolicyViolationError(
      "caption_too_long",
      "TikTok captions must be 2200 characters or fewer."
    );
  }
}

export function projectTikTokMetadataRevision(input: {
  readonly metadataRevisionId: string;
  readonly revision: number;
  readonly episodeId: string;
  readonly episodeRevisionId: string;
  readonly locale: TikTokMetadataRevision["locale"];
  readonly metadataProfileId: string;
  readonly metadataProfileVersion: number;
  readonly editorial: TikTokLocaleEditorialMetadata;
  readonly providerPolicy: TikTokLocaleProviderPolicy;
  readonly mediaProvenance: TikTokMediaProvenance;
  readonly createdAt: string;
}): TikTokMetadataRevision {
  const disclosure = deriveTikTokDisclosureDeclarations(input.mediaProvenance);
  const contentHash = computeTikTokMetadataRevisionContentHash({
    metadataRevisionId: input.metadataRevisionId,
    revision: input.revision,
    episodeId: input.episodeId,
    episodeRevisionId: input.episodeRevisionId,
    locale: input.locale,
    provider: "tiktok",
    metadataProfileId: input.metadataProfileId,
    metadataProfileVersion: input.metadataProfileVersion,
    editorial: input.editorial,
    providerPolicy: input.providerPolicy,
    mediaProvenance: input.mediaProvenance,
    disclosure,
    createdAt: input.createdAt,
  });

  const revision = tikTokMetadataRevisionSchema.parse({
    schemaVersion: TIKTOK_METADATA_SCHEMA_VERSION,
    metadataRevisionId: input.metadataRevisionId,
    revision: input.revision,
    episodeId: input.episodeId,
    episodeRevisionId: input.episodeRevisionId,
    locale: input.locale,
    provider: "tiktok",
    metadataProfileId: input.metadataProfileId,
    metadataProfileVersion: input.metadataProfileVersion,
    editorial: input.editorial,
    providerPolicy: input.providerPolicy,
    mediaProvenance: input.mediaProvenance,
    disclosure,
    contentHash,
    createdAt: input.createdAt,
  });

  validateTikTokMetadataPolicy(revision);
  return revision;
}
