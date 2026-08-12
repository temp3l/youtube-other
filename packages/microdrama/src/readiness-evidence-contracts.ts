import { z } from "zod";

export const READINESS_EVIDENCE_SCHEMA_VERSION =
  "mediaforge.microdrama.readiness-evidence.v1" as const;

export const READINESS_DOMAINS = [
  "story_script",
  "audio_tts",
  "visual_render",
  "publication",
] as const;
export const readinessDomainSchema = z.enum(READINESS_DOMAINS);
export type ReadinessDomain = z.infer<typeof readinessDomainSchema>;

export const READINESS_CHECK_RESULTS = ["PASS", "FAIL", "UNAVAILABLE"] as const;
export const readinessCheckResultSchema = z.enum(READINESS_CHECK_RESULTS);
export type ReadinessCheckResult = z.infer<typeof readinessCheckResultSchema>;

export const READINESS_EVIDENCE_STATUSES = [
  "ACTIVE",
  "STALE",
  "REVOKED",
] as const;
export const readinessEvidenceStatusSchema = z.enum(READINESS_EVIDENCE_STATUSES);
export type ReadinessEvidenceStatus = z.infer<typeof readinessEvidenceStatusSchema>;

export const READINESS_FAILURE_CLASSES = [
  "missing",
  "stale",
  "revoked",
  "mismatched_revision",
  "unavailable_check",
  "domain_blocked",
] as const;
export const readinessFailureClassSchema = z.enum(READINESS_FAILURE_CLASSES);
export type ReadinessFailureClass = z.infer<typeof readinessFailureClassSchema>;

const identifierSchema = z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const readinessEvidenceRecordSchema = z
  .object({
    schemaVersion: z.literal(READINESS_EVIDENCE_SCHEMA_VERSION),
    evidenceId: identifierSchema,
    domain: readinessDomainSchema,
    checkId: identifierSchema,
    boundRevisionId: identifierSchema,
    boundRevisionHash: sha256Schema,
    status: readinessEvidenceStatusSchema,
    recordedAt: z.string(),
  })
  .strict();
export type ReadinessEvidenceRecord = z.infer<typeof readinessEvidenceRecordSchema>;

export const readinessCheckEvaluationSchema = z
  .object({
    checkId: identifierSchema,
    result: readinessCheckResultSchema,
    failureClass: readinessFailureClassSchema.optional(),
    reason: z.string().min(1).max(1_000).optional(),
    evidenceId: identifierSchema.optional(),
  })
  .strict();
export type ReadinessCheckEvaluation = z.infer<typeof readinessCheckEvaluationSchema>;

export const readinessProjectionSchema = z
  .object({
    schemaVersion: z.literal(READINESS_EVIDENCE_SCHEMA_VERSION),
    domain: readinessDomainSchema,
    targetRevisionId: identifierSchema,
    targetRevisionHash: sha256Schema,
    evaluations: z.array(readinessCheckEvaluationSchema).min(1),
    projectedAt: z.string(),
  })
  .strict();
export type ReadinessProjection = z.infer<typeof readinessProjectionSchema>;

export const readinessInvalidationReasonSchema = z
  .object({
    schemaVersion: z.literal(READINESS_EVIDENCE_SCHEMA_VERSION),
    evidenceId: identifierSchema,
    domain: readinessDomainSchema,
    failureClass: readinessFailureClassSchema,
    message: z.string().min(1).max(1_000),
    invalidatedAt: z.string(),
  })
  .strict();
export type ReadinessInvalidationReason = z.infer<
  typeof readinessInvalidationReasonSchema
>;

export type ReadinessProjectionResult =
  | { ok: true; projection: ReadinessProjection }
  | { ok: false; projection: ReadinessProjection; blockingReasons: ReadinessInvalidationReason[] };

export function validateReadinessEvidenceRecord(record: unknown): ReadinessEvidenceRecord {
  return readinessEvidenceRecordSchema.parse(record);
}

export function validateReadinessProjection(projection: unknown): ReadinessProjection {
  return readinessProjectionSchema.parse(projection);
}
