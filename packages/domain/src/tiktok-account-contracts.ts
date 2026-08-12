import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const TIKTOK_ACCOUNT_SCHEMA_VERSION =
  "mediaforge.tiktok-account.v1" as const;

export const TIKTOK_OFFICIAL_ENDPOINTS = {
  authorization: "https://www.tiktok.com/v2/auth/authorize/",
  token: "https://open.tiktokapis.com/v2/oauth/token/",
  revoke: "https://open.tiktokapis.com/v2/oauth/revoke/",
  userInfo: "https://open.tiktokapis.com/v2/user/info/",
} as const;

export const TIKTOK_OFFICIAL_ENDPOINT_KINDS = [
  "authorization",
  "token",
  "revoke",
  "userInfo",
] as const;
export const tikTokOfficialEndpointKindSchema = z.enum(
  TIKTOK_OFFICIAL_ENDPOINT_KINDS
);
export type TikTokOfficialEndpointKind = z.infer<
  typeof tikTokOfficialEndpointKindSchema
>;

export const TIKTOK_OAUTH_SESSION_STATES = [
  "pending",
  "completed",
  "expired",
  "failed",
] as const;
export const tikTokOAuthSessionStateSchema = z.enum(TIKTOK_OAUTH_SESSION_STATES);
export type TikTokOAuthSessionState = z.infer<
  typeof tikTokOAuthSessionStateSchema
>;

export const TIKTOK_OAUTH_GRANT_STATES = ["active", "revoked", "expired"] as const;
export const tikTokOAuthGrantStateSchema = z.enum(TIKTOK_OAUTH_GRANT_STATES);
export type TikTokOAuthGrantState = z.infer<typeof tikTokOAuthGrantStateSchema>;

export const TIKTOK_CREDENTIAL_VERSION_STATES = ["active", "revoked"] as const;
export const tikTokCredentialVersionStateSchema = z.enum(
  TIKTOK_CREDENTIAL_VERSION_STATES
);
export type TikTokCredentialVersionState = z.infer<
  typeof tikTokCredentialVersionStateSchema
>;

export const TIKTOK_ACCOUNT_CONNECTION_STATUSES = [
  "disconnected",
  "connecting",
  "connected",
  "reauthorize_required",
  "revoked",
] as const;
export const tikTokAccountConnectionStatusSchema = z.enum(
  TIKTOK_ACCOUNT_CONNECTION_STATUSES
);
export type TikTokAccountConnectionStatus = z.infer<
  typeof tikTokAccountConnectionStatusSchema
>;

export const tikTokEndpointConfigurationSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_ACCOUNT_SCHEMA_VERSION),
    authorizationUrl: z.literal(TIKTOK_OFFICIAL_ENDPOINTS.authorization),
    tokenUrl: z.literal(TIKTOK_OFFICIAL_ENDPOINTS.token),
    revokeUrl: z.literal(TIKTOK_OFFICIAL_ENDPOINTS.revoke),
    userInfoUrl: z.literal(TIKTOK_OFFICIAL_ENDPOINTS.userInfo),
  })
  .strict();
export type TikTokEndpointConfiguration = z.infer<
  typeof tikTokEndpointConfigurationSchema
>;

export const tikTokAccountRecordSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_ACCOUNT_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    accountId: identifierSchema,
    providerAccountId: identifierSchema,
    displayName: nonEmptyStringSchema.max(200),
    connectionStatus: tikTokAccountConnectionStatusSchema,
    credentialVersion: identifierSchema.optional(),
    registeredAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokAccountRecord = z.infer<typeof tikTokAccountRecordSchema>;

export const tikTokCredentialVersionRecordSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_ACCOUNT_SCHEMA_VERSION),
    credentialVersionId: identifierSchema,
    accountId: identifierSchema,
    providerAccountId: identifierSchema,
    credentialHandle: identifierSchema,
    issuedAt: isoDateTimeSchema,
    revokedAt: isoDateTimeSchema.optional(),
    state: tikTokCredentialVersionStateSchema,
  })
  .strict();
export type TikTokCredentialVersionRecord = z.infer<
  typeof tikTokCredentialVersionRecordSchema
>;

export const tikTokOAuthSessionRecordSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_ACCOUNT_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    sessionId: identifierSchema,
    accountId: identifierSchema.optional(),
    stateNonce: nonEmptyStringSchema.max(200),
    oauthState: nonEmptyStringSchema.max(500),
    sessionState: tikTokOAuthSessionStateSchema,
    redirectUri: z.string().url(),
    requestedScopes: z.array(nonEmptyStringSchema).min(1),
    expiresAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokOAuthSessionRecord = z.infer<
  typeof tikTokOAuthSessionRecordSchema
>;

export const tikTokOAuthGrantRecordSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_ACCOUNT_SCHEMA_VERSION),
    grantId: identifierSchema,
    accountId: identifierSchema,
    providerAccountId: identifierSchema,
    credentialVersionId: identifierSchema,
    credentialHandle: identifierSchema,
    grantedScopes: z.array(nonEmptyStringSchema).min(1),
    authorizationExpiresAt: isoDateTimeSchema.optional(),
    state: tikTokOAuthGrantStateSchema,
    registeredAt: isoDateTimeSchema,
    revokedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type TikTokOAuthGrantRecord = z.infer<typeof tikTokOAuthGrantRecordSchema>;

export const tikTokOAuthBeginResultSchema = z
  .object({
    sessionId: identifierSchema,
    authorizationUrl: z.string().url(),
    oauthState: nonEmptyStringSchema,
    expiresAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokOAuthBeginResult = z.infer<typeof tikTokOAuthBeginResultSchema>;

export const tikTokOAuthCallbackInputSchema = z
  .object({
    code: nonEmptyStringSchema.optional(),
    state: nonEmptyStringSchema,
    error: nonEmptyStringSchema.optional(),
    errorDescription: nonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.error === undefined && value.code === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "OAuth callback must include either an authorization code or an error.",
      });
    }
    if (value.error !== undefined && value.code !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "OAuth callback cannot include both an authorization code and an error.",
      });
    }
  });
export type TikTokOAuthCallbackInput = z.infer<
  typeof tikTokOAuthCallbackInputSchema
>;

export const tikTokAccountRegistrationInputSchema = z
  .object({
    workspaceId: identifierSchema,
    accountId: identifierSchema,
    providerAccountId: identifierSchema,
    displayName: nonEmptyStringSchema.max(200),
    credentialHandle: identifierSchema,
    grantedScopes: z.array(nonEmptyStringSchema).min(1),
    authorizationExpiresAt: isoDateTimeSchema.optional(),
    registeredAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokAccountRegistrationInput = z.infer<
  typeof tikTokAccountRegistrationInputSchema
>;

export const tikTokAccountRevocationInputSchema = z
  .object({
    accountId: identifierSchema,
    reason: nonEmptyStringSchema.max(2_000),
    revokedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokAccountRevocationInput = z.infer<
  typeof tikTokAccountRevocationInputSchema
>;

export const tikTokAttemptAccountBindingSchema = z
  .object({
    providerAccountId: identifierSchema,
    credentialVersion: identifierSchema,
  })
  .strict();
export type TikTokAttemptAccountBinding = z.infer<
  typeof tikTokAttemptAccountBindingSchema
>;

export function validateTikTokEndpointConfiguration(
  value: unknown
): TikTokEndpointConfiguration {
  return tikTokEndpointConfigurationSchema.parse(value);
}

export function validateTikTokAccountRecord(value: unknown): TikTokAccountRecord {
  return tikTokAccountRecordSchema.parse(value);
}

export function validateTikTokCredentialVersionRecord(
  value: unknown
): TikTokCredentialVersionRecord {
  return tikTokCredentialVersionRecordSchema.parse(value);
}

export function validateTikTokOAuthSessionRecord(
  value: unknown
): TikTokOAuthSessionRecord {
  return tikTokOAuthSessionRecordSchema.parse(value);
}

export function validateTikTokOAuthGrantRecord(
  value: unknown
): TikTokOAuthGrantRecord {
  return tikTokOAuthGrantRecordSchema.parse(value);
}
