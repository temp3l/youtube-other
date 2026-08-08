import { z } from "zod";

export const COMMAND_SECURITY_SCHEMA_VERSION =
  "mediaforge.command-security.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const PRINCIPAL_KINDS = ["user", "service", "worker"] as const;
export const principalKindSchema = z.enum(PRINCIPAL_KINDS);
export type PrincipalKind = z.infer<typeof principalKindSchema>;

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const workspaceMembershipSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SECURITY_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    principalId: identifierSchema,
    oidcSubject: nonEmptyStringSchema,
    kind: principalKindSchema,
    role: workspaceRoleSchema,
    permissions: z.array(nonEmptyStringSchema).min(1).max(100),
    revision: z.number().int().nonnegative(),
    active: z.boolean(),
    revokedAt: isoDateTimeSchema.optional(),
    revokedBySubject: nonEmptyStringSchema.optional(),
    revocationReason: nonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.active && value.revokedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "Active memberships cannot include a revocation timestamp.",
      });
    }
    if (!value.active && !value.revokedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "Revoked memberships must include a revocation timestamp.",
      });
    }
  });
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;

export const COMMAND_ACTION_IDS = [
  "project.create",
  "episode.update",
  "workflow.start",
  "workflow.cancel",
  "approval.decide",
  "approval.revoke",
  "publication.execute",
  "publication.schedule",
  "channel.credentials.rotate",
  "webhook.manage",
  "workspace.settings.update",
  "gate.override",
] as const;
export const commandActionIdSchema = z.enum(COMMAND_ACTION_IDS);
export type CommandActionId = z.infer<typeof commandActionIdSchema>;

export const PLATFORM_INVARIANT_ACTIONS = [
  "tenant_isolation",
  "idempotency_integrity",
  "audit_integrity",
  "credential_retrieval",
  "stale_review_binding",
] as const;
export const platformInvariantActionSchema = z.enum(PLATFORM_INVARIANT_ACTIONS);
export type PlatformInvariantAction = z.infer<
  typeof platformInvariantActionSchema
>;

export const actionGrantSchema = z
  .object({
    actionId: commandActionIdSchema,
    requiredPermissions: z.array(nonEmptyStringSchema).min(1),
    confirmationRequired: z.boolean(),
    stepUpRequired: z.boolean(),
    ownerAdminOverrideAllowed: z.boolean(),
    destructive: z.boolean(),
  })
  .strict();
export type ActionGrant = z.infer<typeof actionGrantSchema>;

export const commandConfirmationPolicySchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SECURITY_SCHEMA_VERSION),
    actionId: commandActionIdSchema,
    confirmationToken: nonEmptyStringSchema.optional(),
    rationale: nonEmptyStringSchema.optional(),
    acknowledgedAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.confirmationToken && !value.rationale) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmationToken"],
        message:
          "Destructive or publishing actions require confirmation token or rationale.",
      });
    }
  });
export type CommandConfirmationPolicy = z.infer<
  typeof commandConfirmationPolicySchema
>;

export const stepUpAssertionSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SECURITY_SCHEMA_VERSION),
    satisfied: z.boolean(),
    method: z.enum(["oidc_step_up", "none"]).optional(),
    assertedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type StepUpAssertion = z.infer<typeof stepUpAssertionSchema>;

export const idempotencyScopeSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SECURITY_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    principalId: identifierSchema,
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    normalizedRoute: nonEmptyStringSchema,
    clientKey: nonEmptyStringSchema.min(1).max(255),
  })
  .strict();
export type IdempotencyScope = z.infer<typeof idempotencyScopeSchema>;

export const requestFingerprintSchema = sha256Schema.brand<"RequestFingerprint">();
export type RequestFingerprint = z.infer<typeof requestFingerprintSchema>;

export const scopedIdempotencyKeySchema = sha256Schema.brand<"ScopedIdempotencyKey">();
export type ScopedIdempotencyKey = z.infer<typeof scopedIdempotencyKeySchema>;

export const idempotencyRecordSchema = z
  .object({
    scopedKey: scopedIdempotencyKeySchema,
    fingerprint: requestFingerprintSchema,
    commandId: identifierSchema,
    response: z.unknown(),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

export const MUTATION_CONFLICT_CODES = [
  "tenant_boundary_violation",
  "membership_revoked",
  "authorization_denied",
  "confirmation_required",
  "step_up_required",
  "precondition_stale",
  "idempotency_conflict",
  "idempotency_in_progress",
  "override_not_permitted",
  "platform_invariant_violation",
] as const;
export const mutationConflictCodeSchema = z.enum(MUTATION_CONFLICT_CODES);
export type MutationConflictCode = z.infer<typeof mutationConflictCodeSchema>;

export const mutationConflictSchema = z
  .object({
    code: mutationConflictCodeSchema,
    message: nonEmptyStringSchema,
    field: nonEmptyStringSchema.optional(),
  })
  .strict();
export type MutationConflict = z.infer<typeof mutationConflictSchema>;

export const optimisticConcurrencyExpectationSchema = z
  .object({
    resourceRevision: z.number().int().nonnegative(),
    ifMatchRevision: z.number().int().nonnegative(),
  })
  .strict();
export type OptimisticConcurrencyExpectation = z.infer<
  typeof optimisticConcurrencyExpectationSchema
>;

export const immutableAuditEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SECURITY_SCHEMA_VERSION),
    auditId: identifierSchema,
    workspaceId: identifierSchema,
    actorPrincipalId: identifierSchema,
    actorPrincipalRevision: z.number().int().nonnegative(),
    action: nonEmptyStringSchema,
    commandId: identifierSchema.optional(),
    resourceType: nonEmptyStringSchema,
    resourceId: identifierSchema,
    resourceRevision: z.number().int().nonnegative().optional(),
    correlationId: identifierSchema,
    causationId: identifierSchema.optional(),
    beforeState: z.record(z.string(), z.unknown()).optional(),
    afterState: z.record(z.string(), z.unknown()).optional(),
    effectIds: z.array(identifierSchema).optional(),
    contentHashes: z.array(sha256Schema).optional(),
    occurredAt: isoDateTimeSchema,
  })
  .strict();
export type ImmutableAuditEnvelope = z.infer<typeof immutableAuditEnvelopeSchema>;

export const authorizationDecisionSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SECURITY_SCHEMA_VERSION),
    allowed: z.boolean(),
    actionId: commandActionIdSchema,
    conflicts: z.array(mutationConflictSchema),
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();
export type AuthorizationDecision = z.infer<typeof authorizationDecisionSchema>;

export const idempotencyDecisionSchema = z
  .object({
    schemaVersion: z.literal(COMMAND_SECURITY_SCHEMA_VERSION),
    outcome: z.enum(["proceed", "replay", "conflict", "in_progress"]),
    scopedKey: scopedIdempotencyKeySchema,
    fingerprint: requestFingerprintSchema,
    replayResponse: z.unknown().optional(),
    conflict: mutationConflictSchema.optional(),
  })
  .strict();
export type IdempotencyDecision = z.infer<typeof idempotencyDecisionSchema>;
