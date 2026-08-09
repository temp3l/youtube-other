import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const nonEmptyStringSchema = z.string().trim().min(1);
const webhookEventTypeSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u);

export const WEBHOOK_ENDPOINT_SCHEMA_VERSION =
  "mediaforge.webhook-endpoint.v1" as const;
export const WEBHOOK_DELIVERY_SCHEMA_VERSION =
  "mediaforge.webhook-delivery.v1" as const;

export const webhookEndpointRecordSchema = z
  .object({
    schemaVersion: z.literal(WEBHOOK_ENDPOINT_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    endpointId: identifierSchema,
    url: z.string().url().max(2_048),
    secretVersion: z.number().int().positive(),
    enabled: z.boolean(),
    eventFilters: z.array(webhookEventTypeSchema).max(100),
    overlapUntil: isoDateTimeSchema.optional(),
    revision: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type WebhookEndpointRecord = z.infer<typeof webhookEndpointRecordSchema>;

export const webhookEndpointPageSchema = z
  .object({
    items: z.array(webhookEndpointRecordSchema),
  })
  .strict();

export const webhookEndpointCreateInputSchema = z
  .object({
    url: z.string().url().max(2_048),
    eventFilters: z.array(webhookEventTypeSchema).max(100).default([]),
  })
  .strict();
export type WebhookEndpointCreateInput = z.infer<
  typeof webhookEndpointCreateInputSchema
>;

export const webhookEndpointCreateResultSchema = z
  .object({
    endpoint: webhookEndpointRecordSchema,
    secret: nonEmptyStringSchema,
    showOnce: z.literal(true),
  })
  .strict();
export type WebhookEndpointCreateResult = z.infer<
  typeof webhookEndpointCreateResultSchema
>;

export const webhookEndpointUpdateInputSchema = z
  .object({
    url: z.string().url().max(2_048),
    eventFilters: z.array(webhookEventTypeSchema).max(100),
    enabled: z.boolean(),
  })
  .strict();
export type WebhookEndpointUpdateInput = z.infer<
  typeof webhookEndpointUpdateInputSchema
>;

export const webhookSecretRotateInputSchema = z
  .object({
    overlapMs: z.number().int().nonnegative().optional(),
  })
  .strict();
export type WebhookSecretRotateInput = z.infer<
  typeof webhookSecretRotateInputSchema
>;

export const webhookSecretRotateResultSchema = z
  .object({
    endpoint: webhookEndpointRecordSchema,
    secret: nonEmptyStringSchema,
    showOnce: z.literal(true),
  })
  .strict();
export type WebhookSecretRotateResult = z.infer<
  typeof webhookSecretRotateResultSchema
>;

export const webhookDeliveryStates = ["pending", "delivered", "dead_letter"] as const;
export const webhookDeliveryStateSchema = z.enum(webhookDeliveryStates);

export const webhookDeliveryEventSummarySchema = z
  .object({
    id: identifierSchema,
    type: webhookEventTypeSchema,
    occurredAt: isoDateTimeSchema,
    subjectType: nonEmptyStringSchema,
    subjectId: identifierSchema,
    subjectVersion: z.number().int().positive(),
    correlationId: identifierSchema,
  })
  .strict();

export const webhookDeliveryRecordSchema = z
  .object({
    schemaVersion: z.literal(WEBHOOK_DELIVERY_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    deliveryId: identifierSchema,
    endpointId: identifierSchema,
    eventId: identifierSchema,
    event: webhookDeliveryEventSummarySchema,
    state: webhookDeliveryStateSchema,
    attemptCount: z.number().int().nonnegative(),
    nextAttemptAt: isoDateTimeSchema,
    deliveredAt: isoDateTimeSchema.optional(),
    deadLetteredAt: isoDateTimeSchema.optional(),
    lastStatus: z.number().int().min(100).max(599).optional(),
    lastError: nonEmptyStringSchema.optional(),
    replayOfDeliveryId: identifierSchema.optional(),
    revision: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type WebhookDeliveryRecord = z.infer<typeof webhookDeliveryRecordSchema>;

export const webhookDeliveryPageSchema = z
  .object({
    items: z.array(webhookDeliveryRecordSchema),
    nextAfter: z.string().min(1).max(4_096).optional(),
  })
  .strict();

export const webhookDeliveryAttemptSchema = z
  .object({
    attemptNumber: z.number().int().positive(),
    outcome: z.enum(["delivered", "retry", "dead_letter"]),
    responseStatus: z.number().int().min(100).max(599).optional(),
    error: nonEmptyStringSchema.optional(),
    attemptedAt: isoDateTimeSchema,
  })
  .strict();
export type WebhookDeliveryAttempt = z.infer<typeof webhookDeliveryAttemptSchema>;

export const webhookDeliveryAttemptPageSchema = z
  .object({
    items: z.array(webhookDeliveryAttemptSchema),
  })
  .strict();

export const webhookTestResultSchema = z
  .object({
    delivered: z.boolean(),
    responseStatus: z.number().int().min(100).max(599).optional(),
    error: nonEmptyStringSchema.optional(),
  })
  .strict();
export type WebhookTestResult = z.infer<typeof webhookTestResultSchema>;

export function redactWebhookAuditPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/secret|signature|token|whsec_/iu.test(key)) continue;
    if (typeof value === "string" && value.startsWith("whsec_")) continue;
    redacted[key] = value;
  }
  return redacted;
}
