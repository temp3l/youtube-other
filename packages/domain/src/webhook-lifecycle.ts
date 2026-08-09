import {
  WEBHOOK_DELIVERY_SCHEMA_VERSION,
  WEBHOOK_ENDPOINT_SCHEMA_VERSION,
  type WebhookDeliveryAttempt,
  type WebhookDeliveryRecord,
  type WebhookEndpointRecord,
  type WebhookTestResult,
  webhookDeliveryAttemptSchema,
  webhookDeliveryRecordSchema,
  webhookDeliveryEventSummarySchema,
  webhookEndpointCreateResultSchema,
  webhookEndpointRecordSchema,
  webhookSecretRotateResultSchema,
  webhookTestResultSchema,
} from "./webhook-contracts.js";

export function internalWebhookSecretHandle(input: {
  readonly workspaceId: string;
  readonly endpointId: string;
}): string {
  return `mediaforge://workspaces/${input.workspaceId}/webhook-endpoints/${input.endpointId}`;
}

export function projectWebhookEndpointRecord(input: {
  readonly workspaceId: string;
  readonly endpointId: string;
  readonly url: string;
  readonly secretVersion: number;
  readonly enabled: boolean;
  readonly eventFilters: readonly string[];
  readonly overlapUntil?: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}): WebhookEndpointRecord {
  return webhookEndpointRecordSchema.parse({
    schemaVersion: WEBHOOK_ENDPOINT_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    endpointId: input.endpointId,
    url: input.url,
    secretVersion: input.secretVersion,
    enabled: input.enabled,
    eventFilters: [...input.eventFilters],
    ...(input.overlapUntil ? { overlapUntil: input.overlapUntil } : {}),
    revision: input.revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export function buildWebhookEndpointCreateResult(input: {
  readonly endpoint: WebhookEndpointRecord;
  readonly secret: string;
}): ReturnType<typeof webhookEndpointCreateResultSchema.parse> {
  return webhookEndpointCreateResultSchema.parse({
    endpoint: input.endpoint,
    secret: input.secret,
    showOnce: true,
  });
}

export function buildWebhookSecretRotateResult(input: {
  readonly endpoint: WebhookEndpointRecord;
  readonly secret: string;
}): ReturnType<typeof webhookSecretRotateResultSchema.parse> {
  return webhookSecretRotateResultSchema.parse({
    endpoint: input.endpoint,
    secret: input.secret,
    showOnce: true,
  });
}

export function summarizeWebhookEventPayload(
  payload: unknown
): ReturnType<typeof webhookDeliveryEventSummarySchema.parse> {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const subject =
    typeof record["subject"] === "object" && record["subject"] !== null
      ? (record["subject"] as Record<string, unknown>)
      : {};
  return webhookDeliveryEventSummarySchema.parse({
    id: String(record["id"] ?? ""),
    type: String(record["type"] ?? ""),
    occurredAt: String(record["occurred_at"] ?? record["occurredAt"] ?? ""),
    subjectType: String(subject["type"] ?? ""),
    subjectId: String(subject["id"] ?? ""),
    subjectVersion: Number(record["subject_version"] ?? record["subjectVersion"] ?? 0),
    correlationId: String(
      record["correlation_id"] ?? record["correlationId"] ?? record["id"] ?? ""
    ),
  });
}

export function projectWebhookDeliveryRecord(input: {
  readonly workspaceId: string;
  readonly deliveryId: string;
  readonly endpointId: string;
  readonly eventId: string;
  readonly eventPayload: unknown;
  readonly state: "pending" | "delivered" | "dead_letter";
  readonly attemptCount: number;
  readonly nextAttemptAt: string;
  readonly deliveredAt?: string | null;
  readonly deadLetteredAt?: string | null;
  readonly lastStatus?: number | null;
  readonly lastError?: string | null;
  readonly replayOfDeliveryId?: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}): WebhookDeliveryRecord {
  return webhookDeliveryRecordSchema.parse({
    schemaVersion: WEBHOOK_DELIVERY_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    deliveryId: input.deliveryId,
    endpointId: input.endpointId,
    eventId: input.eventId,
    event: summarizeWebhookEventPayload(input.eventPayload),
    state: input.state,
    attemptCount: input.attemptCount,
    nextAttemptAt: input.nextAttemptAt,
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    ...(input.deadLetteredAt ? { deadLetteredAt: input.deadLetteredAt } : {}),
    ...(input.lastStatus !== null && input.lastStatus !== undefined
      ? { lastStatus: input.lastStatus }
      : {}),
    ...(input.lastError ? { lastError: input.lastError } : {}),
    ...(input.replayOfDeliveryId
      ? { replayOfDeliveryId: input.replayOfDeliveryId }
      : {}),
    revision: input.revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export function projectWebhookDeliveryAttempt(input: {
  readonly attemptNumber: number;
  readonly outcome: "delivered" | "retry" | "dead_letter";
  readonly responseStatus?: number | null;
  readonly error?: string | null;
  readonly attemptedAt: string;
}): WebhookDeliveryAttempt {
  return webhookDeliveryAttemptSchema.parse({
    attemptNumber: input.attemptNumber,
    outcome: input.outcome,
    ...(input.responseStatus !== null && input.responseStatus !== undefined
      ? { responseStatus: input.responseStatus }
      : {}),
    ...(input.error ? { error: input.error } : {}),
    attemptedAt: input.attemptedAt,
  });
}

export function buildWebhookTestResult(input: {
  readonly delivered: boolean;
  readonly responseStatus?: number;
  readonly error?: string;
}): WebhookTestResult {
  return webhookTestResultSchema.parse({
    delivered: input.delivered,
    ...(input.responseStatus !== undefined
      ? { responseStatus: input.responseStatus }
      : {}),
    ...(input.error ? { error: input.error } : {}),
  });
}

export function buildWebhookTestEnvelope(input: {
  readonly workspaceId: string;
  readonly endpointId: string;
  readonly occurredAt: string;
}): Record<string, unknown> {
  return {
    id: `test_${input.endpointId}`,
    type: "webhook_endpoint.disabled",
    version: "1",
    occurred_at: input.occurredAt,
    workspace_id: input.workspaceId,
    subject: { type: "webhook_endpoint", id: input.endpointId },
    subject_version: 1,
    correlation_id: `test_${input.endpointId}`,
    data: { test: true },
  };
}

export function assertWebhookManageAccess(permissions: readonly string[]): void {
  if (!permissions.includes("webhook.manage")) {
    throw new Error("Webhook administration requires webhook.manage.");
  }
}
