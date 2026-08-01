import crypto from "node:crypto";

export interface WebhookEnvelope {
  readonly id: string;
  readonly type: string;
  readonly version: "1";
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectVersion: number;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly data: Record<string, unknown>;
}

export function serializeWebhookEnvelope(event: WebhookEnvelope): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    version: event.version,
    occurred_at: event.occurredAt,
    workspace_id: event.workspaceId,
    subject: { type: event.subjectType, id: event.subjectId },
    subject_version: event.subjectVersion,
    correlation_id: event.correlationId,
    ...(event.causationId ? { causation_id: event.causationId } : {}),
    data: event.data,
  });
}

export function signWebhook(payload: string, secret: string, timestamp: string): string {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

export function verifyWebhook(input: { readonly payload: string; readonly timestamp: string; readonly signature: string; readonly secrets: readonly string[]; readonly now: Date; readonly maxAgeMs?: number }): boolean {
  const timestamp = new Date(input.timestamp);
  if (!Number.isFinite(timestamp.getTime()) || Math.abs(input.now.getTime() - timestamp.getTime()) > (input.maxAgeMs ?? 300_000)) return false;
  return input.secrets.some((secret) => {
    const expected = signWebhook(input.payload, secret, input.timestamp);
    return expected.length === input.signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  });
}
