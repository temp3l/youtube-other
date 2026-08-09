import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const REVIEW_LIFECYCLE_SCHEMA_VERSION =
  "mediaforge.review-lifecycle.v1" as const;

export const APPROVAL_DECISIONS = [
  "approved",
  "rejected",
  "request_changes",
] as const;
export const approvalDecisionSchema = z.enum(APPROVAL_DECISIONS);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const REVIEW_VALIDITY_STATUSES = [
  "actionable",
  "expired",
  "consumed",
  "stale",
  "historical",
] as const;
export const reviewValidityStatusSchema = z.enum(REVIEW_VALIDITY_STATUSES);
export type ReviewValidityStatus = z.infer<typeof reviewValidityStatusSchema>;

export const approvalChallengeSubmitInputSchema = z
  .object({
    runId: identifierSchema,
    expectedRevision: z.number().int().nonnegative(),
    artifactHash: sha256Schema,
    expiresAt: isoDateTimeSchema,
    idempotencyKey: identifierSchema.optional(),
  })
  .strict();
export type ApprovalChallengeSubmitInput = z.infer<
  typeof approvalChallengeSubmitInputSchema
>;

export const reviewQueueItemSchema = z
  .object({
    schemaVersion: z.literal(REVIEW_LIFECYCLE_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    projectId: identifierSchema,
    episodeId: identifierSchema,
    challengeId: identifierSchema,
    subjectId: identifierSchema,
    subjectRevision: z.number().int().nonnegative(),
    artifactHash: sha256Schema,
    expiresAt: isoDateTimeSchema,
    validity: reviewValidityStatusSchema,
    claimedByPrincipalId: identifierSchema.optional(),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const reviewQueuePageSchema = z
  .object({
    items: z.array(reviewQueueItemSchema),
  })
  .strict();

export const approvalHistoryEntrySchema = z
  .object({
    schemaVersion: z.literal(REVIEW_LIFECYCLE_SCHEMA_VERSION),
    approvalId: identifierSchema,
    runId: identifierSchema,
    episodeId: identifierSchema.optional(),
    decision: approvalDecisionSchema,
    state: z.enum(["active", "rejected", "revoked"]),
    artifactHash: sha256Schema,
    subjectRevision: z.number().int().nonnegative(),
    reason: nonEmptyStringSchema.max(2_000).optional(),
    revokedAt: isoDateTimeSchema.optional(),
    createdAt: isoDateTimeSchema,
    currentValidity: reviewValidityStatusSchema.optional(),
  })
  .strict();
export type ApprovalHistoryEntry = z.infer<typeof approvalHistoryEntrySchema>;

export const approvalHistoryPageSchema = z
  .object({
    items: z.array(approvalHistoryEntrySchema),
  })
  .strict();

export const reviewValidityRecordSchema = z
  .object({
    status: reviewValidityStatusSchema,
    reason: nonEmptyStringSchema.max(500).optional(),
    boundArtifactHash: sha256Schema.optional(),
    currentArtifactHash: sha256Schema.optional(),
  })
  .strict();
export type ReviewValidityRecord = z.infer<typeof reviewValidityRecordSchema>;
