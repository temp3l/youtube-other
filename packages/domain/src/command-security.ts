import crypto from "node:crypto";

import {
  COMMAND_SECURITY_SCHEMA_VERSION,
  type ActionGrant,
  type AuthorizationDecision,
  type CommandActionId,
  type CommandConfirmationPolicy,
  type IdempotencyDecision,
  type IdempotencyRecord,
  type IdempotencyScope,
  type ImmutableAuditEnvelope,
  type MutationConflict,
  type OptimisticConcurrencyExpectation,
  type RequestFingerprint,
  type ScopedIdempotencyKey,
  type StepUpAssertion,
  type WorkspaceMembership,
  authorizationDecisionSchema,
  idempotencyDecisionSchema,
  immutableAuditEnvelopeSchema,
  requestFingerprintSchema,
  scopedIdempotencyKeySchema,
} from "./command-security-contracts.js";

const SECRET_FIELD_PATTERN =
  /(secret|token|password|credential|api[_-]?key|authorization|private[_-]?key)/iu;
const SECRET_VALUE_PATTERN =
  /^(mfk_[A-Za-z0-9._-]+|Bearer\s+[A-Za-z0-9._~+/=-]+|[A-Za-z0-9+/]{32,}={0,2})$/u;

export const COMMAND_ACTION_GRANTS: Readonly<Record<CommandActionId, ActionGrant>> = {
  "project.create": {
    actionId: "project.create",
    requiredPermissions: ["content.write"],
    confirmationRequired: false,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: false,
    destructive: false,
  },
  "episode.update": {
    actionId: "episode.update",
    requiredPermissions: ["content.write"],
    confirmationRequired: false,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: false,
    destructive: false,
  },
  "workflow.start": {
    actionId: "workflow.start",
    requiredPermissions: ["workflow.start"],
    confirmationRequired: false,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: false,
    destructive: false,
  },
  "workflow.cancel": {
    actionId: "workflow.cancel",
    requiredPermissions: ["workflow.cancel"],
    confirmationRequired: true,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: true,
    destructive: true,
  },
  "approval.decide": {
    actionId: "approval.decide",
    requiredPermissions: ["approval.decide"],
    confirmationRequired: false,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: false,
    destructive: false,
  },
  "approval.revoke": {
    actionId: "approval.revoke",
    requiredPermissions: ["approval.decide"],
    confirmationRequired: true,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: true,
    destructive: true,
  },
  "publication.execute": {
    actionId: "publication.execute",
    requiredPermissions: ["publication.execute"],
    confirmationRequired: true,
    stepUpRequired: true,
    ownerAdminOverrideAllowed: false,
    destructive: true,
  },
  "publication.schedule": {
    actionId: "publication.schedule",
    requiredPermissions: ["publication.schedule"],
    confirmationRequired: true,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: false,
    destructive: false,
  },
  "channel.credentials.rotate": {
    actionId: "channel.credentials.rotate",
    requiredPermissions: ["channel.credentials.manage"],
    confirmationRequired: true,
    stepUpRequired: true,
    ownerAdminOverrideAllowed: false,
    destructive: true,
  },
  "webhook.manage": {
    actionId: "webhook.manage",
    requiredPermissions: ["webhook.manage"],
    confirmationRequired: true,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: false,
    destructive: true,
  },
  "workspace.settings.update": {
    actionId: "workspace.settings.update",
    requiredPermissions: ["workspace.admin"],
    confirmationRequired: false,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: false,
    destructive: false,
  },
  "gate.override": {
    actionId: "gate.override",
    requiredPermissions: ["workspace.admin"],
    confirmationRequired: true,
    stepUpRequired: false,
    ownerAdminOverrideAllowed: true,
    destructive: false,
  },
};

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function conflict(
  code: MutationConflict["code"],
  message: string,
  field?: string
): MutationConflict {
  return field === undefined
    ? { code, message }
    : { code, message, field };
}

export function assertWorkspaceBoundary(input: {
  readonly membership: WorkspaceMembership;
  readonly workspaceId: string;
}): MutationConflict | null {
  if (input.membership.workspaceId !== input.workspaceId) {
    return conflict(
      "tenant_boundary_violation",
      "Principal membership does not belong to the requested workspace.",
      "workspaceId"
    );
  }
  return null;
}

export function assertActiveMembership(
  membership: WorkspaceMembership
): MutationConflict | null {
  if (!membership.active || membership.revokedAt) {
    return conflict(
      "membership_revoked",
      "Principal membership is revoked or inactive.",
      "principalId"
    );
  }
  return null;
}

export function hasPermission(
  membership: WorkspaceMembership,
  permission: string
): boolean {
  return membership.permissions.includes(permission);
}

export function canOwnerAdminOverride(membership: WorkspaceMembership): boolean {
  return membership.role === "owner" || membership.role === "admin";
}

export function evaluateOptimisticConcurrency(
  expectation: OptimisticConcurrencyExpectation
): MutationConflict | null {
  if (expectation.ifMatchRevision !== expectation.resourceRevision) {
    return conflict(
      "precondition_stale",
      "If-Match does not match the current resource revision.",
      "ifMatchRevision"
    );
  }
  return null;
}

export function evaluateConfirmationPolicy(input: {
  readonly grant: ActionGrant;
  readonly confirmation?: CommandConfirmationPolicy | undefined;
}): MutationConflict | null {
  if (!input.grant.confirmationRequired) return null;
  if (
    input.confirmation?.actionId === input.grant.actionId &&
    (input.confirmation.confirmationToken || input.confirmation.rationale)
  ) {
    return null;
  }
  return conflict(
    "confirmation_required",
    "This action requires explicit confirmation before execution.",
    "confirmationToken"
  );
}

export function evaluateStepUpRequirement(input: {
  readonly grant: ActionGrant;
  readonly stepUp?: StepUpAssertion | undefined;
}): MutationConflict | null {
  if (!input.grant.stepUpRequired) return null;
  if (input.stepUp?.satisfied) return null;
  return conflict(
    "step_up_required",
    "This action requires a satisfied step-up authentication assertion.",
    "stepUp"
  );
}

export function evaluateActionAuthorization(input: {
  readonly membership: WorkspaceMembership;
  readonly workspaceId: string;
  readonly actionId: CommandActionId;
  readonly confirmation?: CommandConfirmationPolicy | undefined;
  readonly stepUp?: StepUpAssertion | undefined;
  readonly overrideRequested?: boolean;
  readonly evaluatedAt: string;
}): AuthorizationDecision {
  const conflicts: MutationConflict[] = [];
  const grant = COMMAND_ACTION_GRANTS[input.actionId];

  const boundary = assertWorkspaceBoundary({
    membership: input.membership,
    workspaceId: input.workspaceId,
  });
  if (boundary) conflicts.push(boundary);

  const active = assertActiveMembership(input.membership);
  if (active) conflicts.push(active);

  const missingPermissions = grant.requiredPermissions.filter(
    (permission) => !hasPermission(input.membership, permission)
  );
  if (missingPermissions.length > 0) {
    if (
      input.overrideRequested &&
      grant.ownerAdminOverrideAllowed &&
      canOwnerAdminOverride(input.membership)
    ) {
      // Owner/admin override permitted for this action only.
    } else {
      conflicts.push(
        conflict(
          "authorization_denied",
          `Missing required permissions: ${missingPermissions.join(", ")}.`,
          "permissions"
        )
      );
    }
  }

  if (input.overrideRequested && !grant.ownerAdminOverrideAllowed) {
    conflicts.push(
      conflict(
        "override_not_permitted",
        "This action cannot be overridden by owner or admin roles.",
        "overrideRequested"
      )
    );
  }

  const confirmationConflict = evaluateConfirmationPolicy({
    grant,
    ...(input.confirmation ? { confirmation: input.confirmation } : {}),
  });
  if (confirmationConflict) conflicts.push(confirmationConflict);

  const stepUpConflict = evaluateStepUpRequirement({
    grant,
    ...(input.stepUp ? { stepUp: input.stepUp } : {}),
  });
  if (stepUpConflict) conflicts.push(stepUpConflict);

  return authorizationDecisionSchema.parse({
    schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
    allowed: conflicts.length === 0,
    actionId: input.actionId,
    conflicts,
    evaluatedAt: input.evaluatedAt,
  });
}

export function computeRequestFingerprint(payload: unknown): RequestFingerprint {
  return requestFingerprintSchema.parse(digest(payload));
}

export function computeScopedIdempotencyKey(
  scope: IdempotencyScope
): ScopedIdempotencyKey {
  return scopedIdempotencyKeySchema.parse(
    digest({
      workspaceId: scope.workspaceId,
      principalId: scope.principalId,
      method: scope.method,
      normalizedRoute: scope.normalizedRoute,
      clientKey: scope.clientKey,
    })
  );
}

export function evaluateIdempotencyReplay(input: {
  readonly scope: IdempotencyScope;
  readonly fingerprint: RequestFingerprint;
  readonly existing?: IdempotencyRecord | null;
  readonly inProgress?: boolean;
}): IdempotencyDecision {
  const scopedKey = computeScopedIdempotencyKey(input.scope);

  if (input.inProgress) {
    return idempotencyDecisionSchema.parse({
      schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
      outcome: "in_progress",
      scopedKey,
      fingerprint: input.fingerprint,
      conflict: conflict(
        "idempotency_in_progress",
        "An identical idempotency key is already being processed.",
        "clientKey"
      ),
    });
  }

  if (!input.existing) {
    return idempotencyDecisionSchema.parse({
      schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
      outcome: "proceed",
      scopedKey,
      fingerprint: input.fingerprint,
    });
  }

  if (input.existing.fingerprint === input.fingerprint) {
    return idempotencyDecisionSchema.parse({
      schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
      outcome: "replay",
      scopedKey,
      fingerprint: input.fingerprint,
      replayResponse: input.existing.response,
    });
  }

  return idempotencyDecisionSchema.parse({
    schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
    outcome: "conflict",
    scopedKey,
    fingerprint: input.fingerprint,
    conflict: conflict(
      "idempotency_conflict",
      "Idempotency key is already associated with a different request.",
      "clientKey"
    ),
  });
}

export function redactSecretsForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value) ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecretsForAudit(entry));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactSecretsForAudit(entry);
      }
    }
    return output;
  }
  return value;
}

export function buildImmutableAuditEnvelope(input: {
  readonly auditId: string;
  readonly workspaceId: string;
  readonly membership: WorkspaceMembership;
  readonly action: string;
  readonly commandId?: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resourceRevision?: number;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly beforeState?: Record<string, unknown>;
  readonly afterState?: Record<string, unknown>;
  readonly effectIds?: readonly string[];
  readonly contentHashes?: readonly string[];
  readonly occurredAt: string;
}): ImmutableAuditEnvelope {
  const boundary = assertWorkspaceBoundary({
    membership: input.membership,
    workspaceId: input.workspaceId,
  });
  if (boundary) {
    throw new Error("Audit envelopes must remain tenant-bound.");
  }

  return immutableAuditEnvelopeSchema.parse({
    schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
    auditId: input.auditId,
    workspaceId: input.workspaceId,
    actorPrincipalId: input.membership.principalId,
    actorPrincipalRevision: input.membership.revision,
    action: input.action,
    ...(input.commandId ? { commandId: input.commandId } : {}),
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    ...(input.resourceRevision !== undefined
      ? { resourceRevision: input.resourceRevision }
      : {}),
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.beforeState
      ? {
          beforeState: redactSecretsForAudit(input.beforeState) as Record<
            string,
            unknown
          >,
        }
      : {}),
    ...(input.afterState
      ? {
          afterState: redactSecretsForAudit(input.afterState) as Record<
            string,
            unknown
          >,
        }
      : {}),
    ...(input.effectIds ? { effectIds: [...input.effectIds] } : {}),
    ...(input.contentHashes ? { contentHashes: [...input.contentHashes] } : {}),
    occurredAt: input.occurredAt,
  });
}

export function assertPlatformInvariantNotOverridden(input: {
  readonly invariant: "tenant_isolation" | "idempotency_integrity" | "audit_integrity";
  readonly overrideRequested: boolean;
}): MutationConflict | null {
  if (!input.overrideRequested) return null;
  return conflict(
    "platform_invariant_violation",
    `Platform invariant ${input.invariant} cannot be overridden.`,
    "overrideRequested"
  );
}
