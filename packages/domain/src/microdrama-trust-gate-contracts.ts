import { z } from "zod";

export const MICRODRAMA_TRUST_GATE_SCHEMA_VERSION =
  "mediaforge.microdrama-trust-gate.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const MICRODRAMA_ARTIFACT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/wav",
  "audio/mpeg",
  "video/mp4",
  "video/webm",
  "application/json",
  "text/plain",
] as const;
export const microdramaArtifactMimeTypeSchema = z.enum(MICRODRAMA_ARTIFACT_MIME_TYPES);
export type MicrodramaArtifactMimeType = z.infer<
  typeof microdramaArtifactMimeTypeSchema
>;

export const TRUST_GATE_ISSUE_CODES = [
  "untrusted_control_field",
  "prompt_injection_boundary",
  "invalid_artifact_hash",
  "unsupported_mime_type",
  "artifact_size_invalid",
  "artifact_hash_mismatch",
  "storage_uri_escape",
  "storage_uri_forbidden_scheme",
  "signed_url_expired",
  "signed_url_out_of_scope",
  "dispatch_blocked",
] as const;
export const trustGateIssueCodeSchema = z.enum(TRUST_GATE_ISSUE_CODES);
export type TrustGateIssueCode = z.infer<typeof trustGateIssueCodeSchema>;

export const trustGateIssueSchema = z
  .object({
    code: trustGateIssueCodeSchema,
    message: nonEmptyStringSchema,
    field: nonEmptyStringSchema.optional(),
    path: nonEmptyStringSchema.optional(),
  })
  .strict();
export type TrustGateIssue = z.infer<typeof trustGateIssueSchema>;

export const trustGateDecisionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_TRUST_GATE_SCHEMA_VERSION),
    allowed: z.boolean(),
    issues: z.array(trustGateIssueSchema),
    correlationId: identifierSchema,
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();
export type TrustGateDecision = z.infer<typeof trustGateDecisionSchema>;

export const artifactIdentitySchema = z
  .object({
    artifactHash: sha256Schema,
    mimeType: microdramaArtifactMimeTypeSchema,
    byteSize: z.number().int().positive(),
    storageUri: nonEmptyStringSchema,
    contentHash: sha256Schema.optional(),
  })
  .strict();
export type ArtifactIdentity = z.infer<typeof artifactIdentitySchema>;

export const signedUrlScopeSchema = z
  .object({
    allowedHosts: z.array(nonEmptyStringSchema).min(1),
    now: isoDateTimeSchema,
    maxTtlSeconds: z.number().int().positive().default(86_400),
  })
  .strict();
export type SignedUrlScope = z.infer<typeof signedUrlScopeSchema>;

export const microdramaAuditCorrelationSchema = z
  .object({
    correlationId: identifierSchema,
    causationId: identifierSchema.optional(),
    auditId: identifierSchema.optional(),
    commandId: identifierSchema.optional(),
  })
  .strict();
export type MicrodramaAuditCorrelation = z.infer<
  typeof microdramaAuditCorrelationSchema
>;
