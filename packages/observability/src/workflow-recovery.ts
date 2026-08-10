import { createHash } from "node:crypto";

import { normalizeContentProfileId } from "@mediaforge/domain";
import { z } from "zod";

import { currentExecutionTelemetry } from "./telemetry.js";

/** Stable event shape for retry, reconciliation, and terminal workflow paths. */
export const WORKFLOW_RECOVERY_TELEMETRY_VERSION =
  "mediaforge.workflow-recovery-telemetry.v1" as const;

const failureClassSchema = z.enum([
  "retryable",
  "permanent",
  "blocked",
  "cancelled",
  "uncertain",
]);
export type WorkflowFailureClass = z.infer<typeof failureClassSchema>;

export const workflowRecoveryEventSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_RECOVERY_TELEMETRY_VERSION),
    correlationId: z.string().min(1).max(160),
    status: z.enum([
      "claimed",
      "succeeded",
      "retry_scheduled",
      "dead_letter",
      "failed",
      "cancelled",
      "interrupted",
      "lost_lease",
      "reconciliation_required",
    ]),
    profileId: z.literal("veronicabenini").optional(),
    unitId: z.string().min(1).max(160).optional(),
    revisionId: z.string().min(1).max(160).optional(),
    task: z.string().min(1).max(160),
    attempt: z.number().int().positive(),
    durationMs: z.number().finite().nonnegative().optional(),
    failureClass: failureClassSchema.optional(),
    failureCode: z.string().min(1).max(160).optional(),
    cacheStatus: z.enum(["hit", "miss", "disabled"]).optional(),
    invalidationReason: z.string().min(1).max(160).optional(),
  })
  .strict();
export type WorkflowRecoveryEvent = z.infer<typeof workflowRecoveryEventSchema>;

const secretKey = /(?:authorization|cookie|api[-_]?key|token|secret|password|credential)/iu;
const sensitiveValue = /(?:bearer\s+|sk-[a-z0-9_-]+|https?:\/\/[^\s?]+\?)/iu;

/** Bounded evidence safe for durable reports, logs, and job failure fields. */
export function redactWorkflowFailureEvidence(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  const redacted = text
    .replace(/(authorization|api[-_]?key|token|secret|password|credential)\s*[=:]\s*(?:bearer\s+)?[^\s,;]+/giu, "$1=[REDACTED]")
    .replace(/bearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(/https?:\/\/([^\s?]+)\?[^\s]+/giu, "https://$1?[REDACTED]");
  return sensitiveValue.test(redacted) || secretKey.test(redacted)
    ? "[REDACTED_FAILURE_EVIDENCE]"
    : redacted.slice(0, 2_000);
}

/** Deterministic, non-secret correlation identity for a durable work item. */
export function createWorkflowRecoveryCorrelationId(input: {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly task: string;
}): string {
  return `workflow-${createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 24)}`;
}

/** Records a bounded event through the existing execution report sink. */
export function recordWorkflowRecoveryEvent(
  event: WorkflowRecoveryEvent
): WorkflowRecoveryEvent {
  const profileId = event.profileId
    ? normalizeContentProfileId(event.profileId)
    : undefined;
  const parsed = workflowRecoveryEventSchema.parse({
    ...event,
    ...(profileId ? { profileId } : {}),
  });
  currentExecutionTelemetry()?.recordEvent({
    name: `workflow.recovery.${parsed.status}`,
    at: new Date().toISOString(),
    details: parsed,
  });
  return parsed;
}
