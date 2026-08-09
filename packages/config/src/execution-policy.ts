import { createHash } from "node:crypto";
import {
  contentProfileIdSchema,
  normalizeContentProfileId,
} from "@mediaforge/domain";
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const identifier = z.string().trim().min(1).max(160);

/** Versioned, secret-free policy captured with every paid or irreversible run. */
export const executionPolicySchema = z.strictObject({
  schemaVersion: z.literal("execution-policy.v1"),
  contentProfileId: contentProfileIdSchema,
  policyVersion: identifier,
  configurationRevision: identifier,
  dependencyIdentity: z.record(identifier, hash).refine(
    (dependencies) => Object.keys(dependencies).length > 0,
    "Execution policy requires dependency identity.",
  ),
  provider: z.strictObject({
    id: z.enum(["none", "openai", "elevenlabs", "youtube"]),
    configurationVersion: identifier,
    dispatchEnabled: z.boolean(),
  }),
  budget: z.strictObject({
    currency: z.string().regex(/^[A-Z]{3}$/u),
    maximumMinor: z.bigint().nonnegative(),
    reservationRequired: z.literal(true),
  }),
  requiredApprovalGates: z.array(identifier).min(1).refine(
    (gates) => new Set(gates).size === gates.length,
    "Execution policy approval gates must be distinct.",
  ),
  preflightRequired: z.literal(true),
});
export type ExecutionPolicy = z.infer<typeof executionPolicySchema>;

function canonicalJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function executionPolicyFingerprint(policy: ExecutionPolicy): string {
  return createHash("sha256").update(canonicalJson(policy)).digest("hex");
}

export function resolveExecutionPolicy(input: unknown): ExecutionPolicy {
  const policy = executionPolicySchema.parse(input);
  const contentProfileId = contentProfileIdSchema.parse(
    normalizeContentProfileId(policy.contentProfileId),
  );
  if (contentProfileId === "veronicabenini" && policy.provider.dispatchEnabled) {
    throw new Error("Veronica execution policy must keep provider dispatch disabled.");
  }
  return Object.freeze({ ...policy, contentProfileId }) as ExecutionPolicy;
}

export const runPolicyArtifactSchema = z.strictObject({
  schemaVersion: z.literal("run-policy-artifact.v1"),
  contentProfileId: contentProfileIdSchema,
  runId: identifier,
  revisionId: identifier,
  policy: executionPolicySchema,
  policyFingerprint: hash,
  provenanceSha256: hash,
  budget: z.strictObject({
    reservationId: identifier.nullable(),
    estimatedMinor: z.bigint().nonnegative(),
    reservedMinor: z.bigint().nonnegative(),
  }),
  regenerationRationale: z.enum(["new-policy", "policy-changed", "cache-compatible"]),
});
export type RunPolicyArtifact = z.infer<typeof runPolicyArtifactSchema>;

export function redactPolicyEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPolicyEvidence);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    /(?:api[-_]?key|authorization|token|secret|password)/iu.test(key)
      ? "[REDACTED]"
      : redactPolicyEvidence(nested),
  ]));
}
