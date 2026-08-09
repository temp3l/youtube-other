import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const CONTENT_LIFECYCLE_SCHEMA_VERSION =
  "mediaforge.content-lifecycle.v1" as const;
export const RETENTION_POLICY_SCHEMA_VERSION =
  "mediaforge.retention-policy.v1" as const;

export const EPISODE_VISIBILITY_STATES = [
  "active",
  "archived",
  "tombstoned",
] as const;
export const episodeVisibilityStateSchema = z.enum(EPISODE_VISIBILITY_STATES);
export type EpisodeVisibilityState = z.infer<typeof episodeVisibilityStateSchema>;

export const RETENTION_CATEGORIES = [
  "artifact",
  "workflow",
  "log",
  "approval",
  "source_media",
] as const;
export const retentionCategorySchema = z.enum(RETENTION_CATEGORIES);
export type RetentionCategory = z.infer<typeof retentionCategorySchema>;

export const RETENTION_POLICY_STATUSES = [
  "configured",
  "unresolved",
  "inherited_read_only",
] as const;
export const retentionPolicyStatusSchema = z.enum(RETENTION_POLICY_STATUSES);

export const RETENTION_HOLD_STATES = ["none", "legal_hold"] as const;
export const retentionHoldStateSchema = z.enum(RETENTION_HOLD_STATES);

export const episodeContentLifecycleRecordSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_LIFECYCLE_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    projectId: identifierSchema,
    episodeId: identifierSchema,
    visibility: episodeVisibilityStateSchema,
    revision: z.number().int().nonnegative(),
    archiveReason: nonEmptyStringSchema.max(500).optional(),
    archivedAt: isoDateTimeSchema.optional(),
    tombstonedAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type EpisodeContentLifecycleRecord = z.infer<
  typeof episodeContentLifecycleRecordSchema
>;

export const episodeArchiveInputSchema = z
  .object({
    reason: nonEmptyStringSchema.max(500).optional(),
  })
  .strict();
export type EpisodeArchiveInput = z.infer<typeof episodeArchiveInputSchema>;

export const episodeRestoreInputSchema = z
  .object({
    reason: nonEmptyStringSchema.max(500).optional(),
  })
  .strict();
export type EpisodeRestoreInput = z.infer<typeof episodeRestoreInputSchema>;

export const lifecycleTransitionResultSchema = z
  .object({
    lifecycle: episodeContentLifecycleRecordSchema,
    replayed: z.boolean(),
    startedWorkflow: z.literal(false),
  })
  .strict();
export type LifecycleTransitionResult = z.infer<
  typeof lifecycleTransitionResultSchema
>;

export const deletionBlockerSchema = z
  .object({
    code: nonEmptyStringSchema.max(80),
    message: nonEmptyStringSchema.max(500),
  })
  .strict();
export type DeletionBlocker = z.infer<typeof deletionBlockerSchema>;

export const deletionImpactSchema = z
  .object({
    code: nonEmptyStringSchema.max(80),
    message: nonEmptyStringSchema.max(500),
  })
  .strict();
export type DeletionImpact = z.infer<typeof deletionImpactSchema>;

export const episodeDeletionEvaluationSchema = z
  .object({
    allowed: z.boolean(),
    blockers: z.array(deletionBlockerSchema),
    impacts: z.array(deletionImpactSchema),
    evaluationToken: nonEmptyStringSchema.max(512),
  })
  .strict();
export type EpisodeDeletionEvaluation = z.infer<
  typeof episodeDeletionEvaluationSchema
>;

export const episodeDeletionInputSchema = z
  .object({
    evaluationToken: nonEmptyStringSchema.max(512),
    confirmation: nonEmptyStringSchema.max(160),
  })
  .strict();
export type EpisodeDeletionInput = z.infer<typeof episodeDeletionInputSchema>;

export const episodeDeletionResultSchema = z
  .object({
    lifecycle: episodeContentLifecycleRecordSchema,
    tombstoned: z.literal(true),
    replayed: z.boolean(),
  })
  .strict();
export type EpisodeDeletionResult = z.infer<typeof episodeDeletionResultSchema>;

export const retentionCategoryPolicySchema = z
  .object({
    category: retentionCategorySchema,
    retentionDays: z.number().int().positive().optional(),
    hold: retentionHoldStateSchema.default("none"),
  })
  .strict();

export const retentionPolicyRecordSchema = z
  .object({
    schemaVersion: z.literal(RETENTION_POLICY_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    status: retentionPolicyStatusSchema,
    revision: z.number().int().nonnegative(),
    categories: z.array(retentionCategoryPolicySchema),
    inheritedFromPlatform: z.boolean(),
    updatedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type RetentionPolicyRecord = z.infer<typeof retentionPolicyRecordSchema>;

export const LIFECYCLE_AUDIT_REDACTED_KEYS = [
  "evaluationToken",
  "confirmation",
  "token",
] as const;

export function redactLifecycleAuditPayload(
  value: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      LIFECYCLE_AUDIT_REDACTED_KEYS.some((candidate) =>
        key.toLowerCase().includes(candidate)
      )
    )
      continue;
    redacted[key] = entry;
  }
  return redacted;
}
