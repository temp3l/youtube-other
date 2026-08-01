import crypto from "node:crypto";

import { z } from "zod";

export const WEBHOOK_EVENT_TYPES = [
  "workflow_run.started",
  "workflow_run.progressed",
  "workflow_run.awaiting_approval",
  "workflow_run.succeeded",
  "workflow_run.partially_succeeded",
  "workflow_run.failed",
  "workflow_run.cancelled",
  "job.retry_scheduled",
  "job.dead_lettered",
  "asset.ready",
  "asset.rejected",
  "asset.deleted",
  "validation.completed",
  "approval.created",
  "approval.rejected",
  "approval.revoked",
  "publication.started",
  "publication.succeeded",
  "publication.failed",
  "publication.reconciliation_required",
  "webhook_endpoint.disabled",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_SUBJECT_TYPES = [
  "workflow_run",
  "job",
  "asset",
  "validation",
  "approval",
  "publication",
  "webhook_endpoint",
] as const;

export type WebhookSubjectType = (typeof WEBHOOK_SUBJECT_TYPES)[number];

export const WEBHOOK_EVENT_SUBJECT_TYPES = Object.freeze({
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
} as const satisfies Record<WebhookEventType, WebhookSubjectType>);

export const MAX_WEBHOOK_ENVELOPE_BYTES = 64 * 1_024;

const boundedIdSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u);
const eventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
const subjectTypeSchema = z.enum(WEBHOOK_SUBJECT_TYPES);
const jsonObjectSchema = z.record(z.string().min(1).max(120), z.json());

const prohibitedDataKeys = new Set([
  "absolutepath",
  "accesstoken",
  "apikey",
  "credential",
  "credentials",
  "filesystempath",
  "localpath",
  "password",
  "path",
  "presignedurl",
  "prompt",
  "providerpayload",
  "providerrequest",
  "refreshtoken",
  "secret",
  "secrethandle",
  "signedurl",
]);

function sensitiveDataKey(value: string): boolean {
  return prohibitedDataKeys.has(value.toLowerCase().replace(/[^a-z0-9]/gu, ""));
}

function containsSensitiveDataKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveDataKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => sensitiveDataKey(key) || containsSensitiveDataKey(nested)
  );
}

const webhookEnvelopeSchema = z
  .object({
    id: boundedIdSchema,
    type: eventTypeSchema,
    version: z.literal("1"),
    occurredAt: z.iso.datetime({ offset: true }).max(40),
    workspaceId: boundedIdSchema,
    subjectType: subjectTypeSchema,
    subjectId: boundedIdSchema,
    subjectVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    correlationId: boundedIdSchema,
    causationId: boundedIdSchema.optional(),
    data: jsonObjectSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (WEBHOOK_EVENT_SUBJECT_TYPES[event.type] !== event.subjectType) {
      context.addIssue({
        code: "custom",
        path: ["subjectType"],
        message: `Event ${event.type} requires subject type ${WEBHOOK_EVENT_SUBJECT_TYPES[event.type]}.`,
      });
    }
    if (containsSensitiveDataKey(event.data)) {
      context.addIssue({
        code: "custom",
        path: ["data"],
        message:
          "Webhook data cannot contain secrets, credentials, prompts, provider payloads, signed URLs, or filesystem paths.",
      });
    }
  });

export interface WebhookEnvelope {
  readonly id: string;
  readonly type: WebhookEventType;
  readonly version: "1";
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly subjectType: WebhookSubjectType;
  readonly subjectId: string;
  readonly subjectVersion: number;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly data: Record<string, unknown>;
}

export function serializeWebhookEnvelope(event: WebhookEnvelope): string {
  const parsed = webhookEnvelopeSchema.parse(event);
  const serialized = JSON.stringify({
    id: parsed.id,
    type: parsed.type,
    version: parsed.version,
    occurred_at: parsed.occurredAt,
    workspace_id: parsed.workspaceId,
    subject: { type: parsed.subjectType, id: parsed.subjectId },
    subject_version: parsed.subjectVersion,
    correlation_id: parsed.correlationId,
    ...(parsed.causationId ? { causation_id: parsed.causationId } : {}),
    data: parsed.data,
  });
  if (Buffer.byteLength(serialized, "utf8") > MAX_WEBHOOK_ENVELOPE_BYTES) {
    throw new Error(
      `Serialized webhook envelope exceeds ${MAX_WEBHOOK_ENVELOPE_BYTES} bytes.`
    );
  }
  return serialized;
}

export function signWebhook(
  payload: string,
  secret: string,
  timestamp: string
): string {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

export function verifyWebhook(input: {
  readonly payload: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly secrets: readonly string[];
  readonly now: Date;
  readonly maxAgeMs?: number;
}): boolean {
  const timestamp = new Date(input.timestamp);
  if (
    !Number.isFinite(timestamp.getTime()) ||
    Math.abs(input.now.getTime() - timestamp.getTime()) >
      (input.maxAgeMs ?? 300_000)
  )
    return false;
  return input.secrets.some((secret) => {
    const expected = signWebhook(input.payload, secret, input.timestamp);
    return (
      expected.length === input.signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(input.signature)
      )
    );
  });
}
