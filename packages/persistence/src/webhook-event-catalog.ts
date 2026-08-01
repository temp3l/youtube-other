/**
 * Exhaustive persistence-side mirror of the application webhook catalog.
 * Persistence cannot import the higher-level application package. Keep this
 * mapping byte-for-byte aligned with application/src/webhooks.ts.
 */
export const PERSISTED_WEBHOOK_EVENT_SUBJECT_TYPES = Object.freeze({
  "workflow_run.started": "workflow_run",
  "workflow_run.progressed": "workflow_run",
  "workflow_run.awaiting_approval": "workflow_run",
  "workflow_run.succeeded": "workflow_run",
  "workflow_run.partially_succeeded": "workflow_run",
  "workflow_run.failed": "workflow_run",
  "workflow_run.cancelled": "workflow_run",
  "job.retry_scheduled": "job",
  "job.dead_lettered": "job",
  "asset.ready": "asset",
  "asset.rejected": "asset",
  "asset.deleted": "asset",
  "validation.completed": "validation",
  "approval.created": "approval",
  "approval.rejected": "approval",
  "approval.revoked": "approval",
  "publication.started": "publication",
  "publication.succeeded": "publication",
  "publication.failed": "publication",
  "publication.reconciliation_required": "publication",
  "webhook_endpoint.disabled": "webhook_endpoint",
} as const);

export type PersistedWebhookEventType =
  keyof typeof PERSISTED_WEBHOOK_EVENT_SUBJECT_TYPES;
export type PersistedWebhookSubjectType =
  (typeof PERSISTED_WEBHOOK_EVENT_SUBJECT_TYPES)[PersistedWebhookEventType];

export function persistedWebhookSubjectType<T extends PersistedWebhookEventType>(
  type: T
): (typeof PERSISTED_WEBHOOK_EVENT_SUBJECT_TYPES)[T] {
  return PERSISTED_WEBHOOK_EVENT_SUBJECT_TYPES[type];
}
