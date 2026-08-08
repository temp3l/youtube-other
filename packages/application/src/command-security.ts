/** Domain command-security contracts re-exported for application handlers. */
export {
  COMMAND_ACTION_GRANTS,
  assertPlatformInvariantNotOverridden,
  assertWorkspaceBoundary,
  buildImmutableAuditEnvelope,
  computeRequestFingerprint,
  computeScopedIdempotencyKey,
  evaluateActionAuthorization,
  evaluateIdempotencyReplay,
  evaluateOptimisticConcurrency,
  redactSecretsForAudit,
} from "@mediaforge/domain";
export type {
  AuthorizationDecision,
  CommandActionId,
  CommandConfirmationPolicy,
  IdempotencyDecision,
  IdempotencyScope,
  ImmutableAuditEnvelope,
  WorkspaceMembership,
} from "@mediaforge/domain";
