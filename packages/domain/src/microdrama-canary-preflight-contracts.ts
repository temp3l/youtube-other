import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const backlogTaskIdPattern = /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const backlogTaskIdSchema = z.string().min(1).max(160).regex(backlogTaskIdPattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const MICRODRAMA_CANARY_PREFLIGHT_SCHEMA_VERSION =
  "mediaforge.microdrama-canary-preflight.v1" as const;

export const MICRODRAMA_CANARY_PREFLIGHT_BLOCK_REASONS = [
  "operator_authorization_missing",
  "operator_authorization_stale",
  "operator_authorization_binding_mismatch",
  "asset_generation_not_approved",
  "asset_generation_scope_mismatch",
  "readiness_gate_blocked",
  "budget_preflight_blocked",
  "external_calls_not_permitted",
  "paid_calls_not_permitted",
  "publication_calls_not_permitted",
] as const;
export const microdramaCanaryPreflightBlockReasonSchema = z.enum(
  MICRODRAMA_CANARY_PREFLIGHT_BLOCK_REASONS
);
export type MicrodramaCanaryPreflightBlockReason = z.infer<
  typeof microdramaCanaryPreflightBlockReasonSchema
>;

export const microdramaCanaryReadinessGateResultSchema = z
  .object({
    gate: nonEmptyStringSchema,
    ok: z.boolean(),
    message: z.string().optional(),
  })
  .strict();
export type MicrodramaCanaryReadinessGateResult = z.infer<
  typeof microdramaCanaryReadinessGateResultSchema
>;

export const microdramaCanaryCallPolicySchema = z
  .object({
    externalCallsAllowed: z.boolean(),
    paidCallsAllowed: z.boolean(),
    publicationCallsAllowed: z.boolean(),
  })
  .strict();
export type MicrodramaCanaryCallPolicy = z.infer<
  typeof microdramaCanaryCallPolicySchema
>;

export const microdramaCanaryPreflightResultSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_CANARY_PREFLIGHT_SCHEMA_VERSION),
    taskId: backlogTaskIdSchema,
    allowed: z.boolean(),
    blockReasons: z.array(microdramaCanaryPreflightBlockReasonSchema),
    readinessGates: z.array(microdramaCanaryReadinessGateResultSchema),
    evaluatedAt: isoDateTimeSchema,
    message: z.string().optional(),
  })
  .strict();
export type MicrodramaCanaryPreflightResult = z.infer<
  typeof microdramaCanaryPreflightResultSchema
>;
