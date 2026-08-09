import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const API_CREDENTIAL_SCHEMA_VERSION =
  "mediaforge.api-credential.v1" as const;

export const API_CREDENTIAL_STATUSES = [
  "active",
  "overlapping",
  "revoked",
  "expired",
] as const;
export const apiCredentialStatusSchema = z.enum(API_CREDENTIAL_STATUSES);
export type ApiCredentialStatus = z.infer<typeof apiCredentialStatusSchema>;

export const apiCredentialRecordSchema = z
  .object({
    schemaVersion: z.literal(API_CREDENTIAL_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    keyId: identifierSchema,
    name: nonEmptyStringSchema,
    principalId: identifierSchema,
    permissions: z.array(nonEmptyStringSchema).min(1),
    status: apiCredentialStatusSchema,
    expiresAt: isoDateTimeSchema,
    overlapUntil: isoDateTimeSchema.optional(),
    lastUsedAt: isoDateTimeSchema.optional(),
    rotatedFromKeyId: identifierSchema.optional(),
    revision: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type ApiCredentialRecord = z.infer<typeof apiCredentialRecordSchema>;

export const apiCredentialIssueInputSchema = z
  .object({
    name: nonEmptyStringSchema,
    principalId: identifierSchema,
    permissions: z.array(nonEmptyStringSchema).min(1),
    expiresAt: isoDateTimeSchema,
    overlapMs: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ApiCredentialIssueInput = z.infer<
  typeof apiCredentialIssueInputSchema
>;

/** Rotation preserves the owning principal and bounds any dual-key window. */
export const apiCredentialRotateInputSchema = z
  .object({
    name: nonEmptyStringSchema,
    permissions: z.array(nonEmptyStringSchema).min(1),
    expiresAt: isoDateTimeSchema,
    overlapMs: z.number().int().min(0).max(86_400_000).default(0),
  })
  .strict();
export type ApiCredentialRotateInput = z.infer<
  typeof apiCredentialRotateInputSchema
>;

export const apiCredentialIssueResultSchema = z
  .object({
    credential: apiCredentialRecordSchema,
    token: nonEmptyStringSchema.optional(),
    replayed: z.boolean(),
    showOnce: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.replayed && value.token !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["token"],
        message: "Replayed credential issues must not return secrets.",
      });
    }
    if (!value.replayed && !value.showOnce) {
      ctx.addIssue({
        code: "custom",
        path: ["showOnce"],
        message: "Fresh credential issues must be marked show-once.",
      });
    }
  });
export type ApiCredentialIssueResult = z.infer<
  typeof apiCredentialIssueResultSchema
>;

export const apiCredentialRevokeInputSchema = z
  .object({
    reason: nonEmptyStringSchema.max(2_000),
  })
  .strict();
export type ApiCredentialRevokeInput = z.infer<
  typeof apiCredentialRevokeInputSchema
>;

export const apiCredentialPageSchema = z
  .object({
    items: z.array(apiCredentialRecordSchema),
  })
  .strict();
export type ApiCredentialPage = z.infer<typeof apiCredentialPageSchema>;

export const developerJourneyStepSchema = z
  .object({
    operationId: nonEmptyStringSchema,
    method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
    path: nonEmptyStringSchema,
    requestSchema: nonEmptyStringSchema.nullable(),
    responseSchema: nonEmptyStringSchema,
    requiredHeaders: z.array(nonEmptyStringSchema).default([]),
    note: nonEmptyStringSchema.optional(),
  })
  .strict();
export type DeveloperJourneyStep = z.infer<typeof developerJourneyStepSchema>;

export const developerJourneyExamplesSchema = z
  .object({
    schemaVersion: z.literal(API_CREDENTIAL_SCHEMA_VERSION),
    title: nonEmptyStringSchema,
    steps: z.array(developerJourneyStepSchema).min(1),
    projectedAt: isoDateTimeSchema,
  })
  .strict();
export type DeveloperJourneyExamples = z.infer<
  typeof developerJourneyExamplesSchema
>;

export function deriveApiCredentialStatus(input: {
  readonly revokedAt: string | null;
  readonly expiresAt: string;
  readonly overlapUntil?: string | null;
  readonly evaluatedAt: string;
}): ApiCredentialStatus {
  if (input.revokedAt !== null) return "revoked";
  if (input.expiresAt <= input.evaluatedAt) return "expired";
  if (
    input.overlapUntil !== null &&
    input.overlapUntil !== undefined &&
    input.overlapUntil > input.evaluatedAt
  ) {
    return "overlapping";
  }
  return "active";
}

export function redactApiCredentialAuditPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/secret|token|mfk_/iu.test(key)) continue;
    if (typeof value === "string" && value.startsWith("mfk_")) continue;
    redacted[key] = value;
  }
  return redacted;
}
