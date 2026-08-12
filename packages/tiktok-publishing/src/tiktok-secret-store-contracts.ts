import { createHash } from "node:crypto";
import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nonEmptyStringSchema = z.string().trim().min(1);

export const TIKTOK_SECRET_STORE_SCHEMA_VERSION =
  "mediaforge.tiktok-secret-store.v1" as const;

export const tikTokOAuthCredentialPayloadSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_SECRET_STORE_SCHEMA_VERSION),
    accessToken: nonEmptyStringSchema.max(4_096),
    refreshToken: nonEmptyStringSchema.max(4_096),
    tokenType: z.literal("Bearer").default("Bearer"),
    accessTokenExpiresAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type TikTokOAuthCredentialPayload = z.infer<
  typeof tikTokOAuthCredentialPayloadSchema
>;

export const tikTokCredentialSecretReferenceSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_SECRET_STORE_SCHEMA_VERSION),
    handle: identifierSchema,
    credentialVersionId: identifierSchema,
  })
  .strict();
export type TikTokCredentialSecretReference = z.infer<
  typeof tikTokCredentialSecretReferenceSchema
>;

export const tikTokSecretStoreAvailabilitySchema = z
  .object({
    available: z.boolean(),
    reason: nonEmptyStringSchema.optional(),
  })
  .strict();
export type TikTokSecretStoreAvailability = z.infer<
  typeof tikTokSecretStoreAvailabilitySchema
>;

export function buildTikTokCredentialHandle(input: {
  readonly workspaceId: string;
  readonly accountId: string;
}): string {
  identifierSchema.parse(input.workspaceId);
  identifierSchema.parse(input.accountId);
  const digest = createHash("sha256")
    .update(`${input.workspaceId}:${input.accountId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `tiktok.secret.${digest}`;
}

export function assertTikTokCredentialHandleForAccount(input: {
  readonly handle: string;
  readonly workspaceId: string;
  readonly accountId: string;
}): void {
  if (buildTikTokCredentialHandle(input) !== input.handle) {
    throw new Error("TikTok credential handle is not managed by MediaForge.");
  }
}

export function validateTikTokOAuthCredentialPayload(
  value: unknown
): TikTokOAuthCredentialPayload {
  return tikTokOAuthCredentialPayloadSchema.parse(value);
}

export function redactTikTokSecretStoreAuditPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "credentialHandle" || key === "credentialVersionId") {
      redacted[key] = value;
      continue;
    }
    if (
      /(?:secret|token|credential|authorization|refresh|access)/iu.test(key)
    ) {
      continue;
    }
    if (typeof value === "string" && /^(?:act\.|rft\.|Bearer\s)/u.test(value)) {
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}
