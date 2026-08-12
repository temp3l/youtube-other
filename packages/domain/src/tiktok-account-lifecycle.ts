import {
  TIKTOK_ACCOUNT_SCHEMA_VERSION,
  TIKTOK_OFFICIAL_ENDPOINTS,
  type TikTokAccountRecord,
  type TikTokAccountRegistrationInput,
  type TikTokAccountRevocationInput,
  type TikTokAttemptAccountBinding,
  type TikTokCredentialVersionRecord,
  type TikTokEndpointConfiguration,
  type TikTokOAuthBeginResult,
  type TikTokOAuthCallbackInput,
  type TikTokOAuthGrantRecord,
  type TikTokOAuthGrantState,
  type TikTokOAuthSessionRecord,
  tikTokAccountRecordSchema,
  tikTokCredentialVersionRecordSchema,
  tikTokEndpointConfigurationSchema,
  tikTokOAuthBeginResultSchema,
  tikTokOAuthGrantRecordSchema,
  tikTokOAuthSessionRecordSchema,
} from "./tiktok-account-contracts.js";

const FORBIDDEN_ACCOUNT_RESPONSE_FIELDS = [
  "accessToken",
  "refreshToken",
  "token",
  "secret",
  "clientSecret",
] as const;

export function createOfficialTikTokEndpointConfiguration(): TikTokEndpointConfiguration {
  return tikTokEndpointConfigurationSchema.parse({
    schemaVersion: TIKTOK_ACCOUNT_SCHEMA_VERSION,
    authorizationUrl: TIKTOK_OFFICIAL_ENDPOINTS.authorization,
    tokenUrl: TIKTOK_OFFICIAL_ENDPOINTS.token,
    revokeUrl: TIKTOK_OFFICIAL_ENDPOINTS.revoke,
    userInfoUrl: TIKTOK_OFFICIAL_ENDPOINTS.userInfo,
  });
}

export function assertOfficialTikTokEndpointUrl(input: {
  readonly kind: keyof typeof TIKTOK_OFFICIAL_ENDPOINTS;
  readonly url: string;
}): { readonly allowed: boolean; readonly message?: string } {
  if (input.url !== TIKTOK_OFFICIAL_ENDPOINTS[input.kind]) {
    return {
      allowed: false,
      message: `Only official TikTok ${input.kind} endpoints are permitted.`,
    };
  }
  return { allowed: true };
}

export function validateConfiguredTikTokEndpoints(
  value: unknown
): TikTokEndpointConfiguration {
  const configuration = tikTokEndpointConfigurationSchema.parse(value);
  for (const kind of Object.keys(TIKTOK_OFFICIAL_ENDPOINTS) as Array<
    keyof typeof TIKTOK_OFFICIAL_ENDPOINTS
  >) {
    const admission = assertOfficialTikTokEndpointUrl({
      kind,
      url: configuration[`${kind}Url` as keyof TikTokEndpointConfiguration] as string,
    });
    if (!admission.allowed) {
      throw new Error(admission.message ?? "TikTok endpoint configuration rejected.");
    }
  }
  return configuration;
}

export function buildTikTokOAuthState(input: {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly stateNonce: string;
}): string {
  return `${input.workspaceId}:${input.sessionId}:${input.stateNonce}`;
}

export function parseTikTokOAuthState(state: string): {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly stateNonce: string;
} | null {
  const parts = state.split(":");
  if (parts.length !== 3) return null;
  const [workspaceId, sessionId, stateNonce] = parts;
  if (!workspaceId || !sessionId || !stateNonce) return null;
  return { workspaceId, sessionId, stateNonce };
}

export function beginTikTokOAuthSession(input: {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly stateNonce: string;
  readonly redirectUri: string;
  readonly requestedScopes: readonly string[];
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly accountId?: string;
  readonly clientKey: string;
  readonly endpointConfiguration: TikTokEndpointConfiguration;
}): {
  readonly session: TikTokOAuthSessionRecord;
  readonly beginResult: TikTokOAuthBeginResult;
} {
  validateConfiguredTikTokEndpoints(input.endpointConfiguration);
  const oauthState = buildTikTokOAuthState({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    stateNonce: input.stateNonce,
  });
  const session = tikTokOAuthSessionRecordSchema.parse({
    schemaVersion: TIKTOK_ACCOUNT_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    stateNonce: input.stateNonce,
    oauthState,
    sessionState: "pending",
    redirectUri: input.redirectUri,
    requestedScopes: [...input.requestedScopes],
    expiresAt: input.expiresAt,
    createdAt: input.createdAt,
  });
  const authorizationUrl = new URL(input.endpointConfiguration.authorizationUrl);
  authorizationUrl.searchParams.set("client_key", input.clientKey);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", input.requestedScopes.join(","));
  authorizationUrl.searchParams.set("redirect_uri", input.redirectUri);
  authorizationUrl.searchParams.set("state", oauthState);
  const beginResult = tikTokOAuthBeginResultSchema.parse({
    sessionId: input.sessionId,
    authorizationUrl: authorizationUrl.toString(),
    oauthState,
    expiresAt: input.expiresAt,
  });
  return { session, beginResult };
}

export function evaluateTikTokOAuthCallback(input: {
  readonly session: TikTokOAuthSessionRecord;
  readonly callback: TikTokOAuthCallbackInput;
  readonly evaluatedAt: string;
}): {
  readonly allowed: boolean;
  readonly code?: string;
  readonly reason?: string;
  readonly message?: string;
  readonly sessionState: TikTokOAuthSessionRecord["sessionState"];
} {
  const parsedState = parseTikTokOAuthState(input.callback.state);
  if (!parsedState) {
    return {
      allowed: false,
      reason: "oauth_state_invalid",
      message: "OAuth callback state is malformed.",
      sessionState: "failed",
    };
  }
  if (parsedState.workspaceId !== input.session.workspaceId) {
    return {
      allowed: false,
      reason: "oauth_workspace_mismatch",
      message: "OAuth callback workspace does not match the initiating tenant.",
      sessionState: "failed",
    };
  }
  if (parsedState.sessionId !== input.session.sessionId) {
    return {
      allowed: false,
      reason: "oauth_session_mismatch",
      message: "OAuth callback session does not match the initiating session.",
      sessionState: "failed",
    };
  }
  if (parsedState.stateNonce !== input.session.stateNonce) {
    return {
      allowed: false,
      reason: "oauth_nonce_mismatch",
      message: "OAuth callback nonce does not match the initiating session.",
      sessionState: "failed",
    };
  }
  if (input.session.sessionState !== "pending") {
    return {
      allowed: false,
      reason: "oauth_session_not_pending",
      message: "OAuth session is no longer pending.",
      sessionState: input.session.sessionState,
    };
  }
  if (input.evaluatedAt > input.session.expiresAt) {
    return {
      allowed: false,
      reason: "oauth_session_expired",
      message: "OAuth session has expired.",
      sessionState: "expired",
    };
  }
  if (input.callback.error !== undefined) {
    return {
      allowed: false,
      reason: input.callback.error,
      message:
        input.callback.errorDescription ??
        "OAuth provider returned an authorization error.",
      sessionState: "failed",
    };
  }
  if (input.callback.code === undefined) {
    return {
      allowed: false,
      reason: "oauth_code_missing",
      message: "OAuth callback is missing an authorization code.",
      sessionState: "failed",
    };
  }
  return {
    allowed: true,
    code: input.callback.code,
    sessionState: "completed",
  };
}

export function issueTikTokCredentialVersion(input: {
  readonly credentialVersionId: string;
  readonly accountId: string;
  readonly providerAccountId: string;
  readonly credentialHandle: string;
  readonly issuedAt: string;
}): TikTokCredentialVersionRecord {
  return tikTokCredentialVersionRecordSchema.parse({
    schemaVersion: TIKTOK_ACCOUNT_SCHEMA_VERSION,
    credentialVersionId: input.credentialVersionId,
    accountId: input.accountId,
    providerAccountId: input.providerAccountId,
    credentialHandle: input.credentialHandle,
    issuedAt: input.issuedAt,
    state: "active",
  });
}

export function registerTikTokAccount(input: {
  readonly registration: TikTokAccountRegistrationInput;
  readonly credentialVersionId: string;
}): {
  readonly account: TikTokAccountRecord;
  readonly credentialVersion: TikTokCredentialVersionRecord;
  readonly grant: TikTokOAuthGrantRecord;
} {
  const credentialVersion = issueTikTokCredentialVersion({
    credentialVersionId: input.credentialVersionId,
    accountId: input.registration.accountId,
    providerAccountId: input.registration.providerAccountId,
    credentialHandle: input.registration.credentialHandle,
    issuedAt: input.registration.registeredAt,
  });
  const account = tikTokAccountRecordSchema.parse({
    schemaVersion: TIKTOK_ACCOUNT_SCHEMA_VERSION,
    workspaceId: input.registration.workspaceId,
    accountId: input.registration.accountId,
    providerAccountId: input.registration.providerAccountId,
    displayName: input.registration.displayName,
    connectionStatus: "connected",
    credentialVersion: credentialVersion.credentialVersionId,
    registeredAt: input.registration.registeredAt,
    updatedAt: input.registration.registeredAt,
  });
  const grant = tikTokOAuthGrantRecordSchema.parse({
    schemaVersion: TIKTOK_ACCOUNT_SCHEMA_VERSION,
    grantId: `${input.registration.accountId}.grant.v1`,
    accountId: input.registration.accountId,
    providerAccountId: input.registration.providerAccountId,
    credentialVersionId: credentialVersion.credentialVersionId,
    credentialHandle: input.registration.credentialHandle,
    grantedScopes: [...input.registration.grantedScopes],
    ...(input.registration.authorizationExpiresAt
      ? { authorizationExpiresAt: input.registration.authorizationExpiresAt }
      : {}),
    state: "active",
    registeredAt: input.registration.registeredAt,
  });
  return { account, credentialVersion, grant };
}

export function deriveTikTokOAuthGrantState(input: {
  readonly revokedAt: string | null;
  readonly authorizationExpiresAt?: string | null;
  readonly evaluatedAt: string;
}): TikTokOAuthGrantState {
  if (input.revokedAt !== null) return "revoked";
  if (
    input.authorizationExpiresAt !== null &&
    input.authorizationExpiresAt !== undefined &&
    input.authorizationExpiresAt <= input.evaluatedAt
  ) {
    return "expired";
  }
  return "active";
}

export function revokeTikTokAccountGrant(input: {
  readonly account: TikTokAccountRecord;
  readonly credentialVersion: TikTokCredentialVersionRecord;
  readonly grant: TikTokOAuthGrantRecord;
  readonly revocation: TikTokAccountRevocationInput;
}): {
  readonly account: TikTokAccountRecord;
  readonly credentialVersion: TikTokCredentialVersionRecord;
  readonly grant: TikTokOAuthGrantRecord;
} {
  if (input.account.accountId !== input.revocation.accountId) {
    throw new Error("TikTok account revocation target does not match the account record.");
  }
  if (input.credentialVersion.accountId !== input.account.accountId) {
    throw new Error("TikTok credential version does not belong to the account.");
  }
  if (input.grant.accountId !== input.account.accountId) {
    throw new Error("TikTok OAuth grant does not belong to the account.");
  }
  const revokedCredentialVersion = tikTokCredentialVersionRecordSchema.parse({
    ...input.credentialVersion,
    state: "revoked",
    revokedAt: input.revocation.revokedAt,
  });
  const revokedGrant = tikTokOAuthGrantRecordSchema.parse({
    ...input.grant,
    state: "revoked",
    revokedAt: input.revocation.revokedAt,
  });
  const revokedAccount = tikTokAccountRecordSchema.parse({
    ...input.account,
    connectionStatus: "revoked",
    credentialVersion: undefined,
    updatedAt: input.revocation.revokedAt,
  });
  return {
    account: revokedAccount,
    credentialVersion: revokedCredentialVersion,
    grant: revokedGrant,
  };
}

export function evaluateTikTokAttemptAccountBindingImmutability(input: {
  readonly preparedBinding: TikTokAttemptAccountBinding;
  readonly observedBinding: TikTokAttemptAccountBinding;
}): { readonly allowed: boolean; readonly reason?: string; readonly message?: string } {
  if (
    input.preparedBinding.providerAccountId !== input.observedBinding.providerAccountId
  ) {
    return {
      allowed: false,
      reason: "provider_account_mismatch",
      message: "Publication attempt provider account identity changed after preparation.",
    };
  }
  if (
    input.preparedBinding.credentialVersion !== input.observedBinding.credentialVersion
  ) {
    return {
      allowed: false,
      reason: "credential_version_mismatch",
      message: "Publication attempt credential version changed after preparation.",
    };
  }
  return { allowed: true };
}

export function redactTikTokAccountRecord(
  record: TikTokAccountRecord
): TikTokAccountRecord {
  const parsed = tikTokAccountRecordSchema.parse(record);
  for (const field of FORBIDDEN_ACCOUNT_RESPONSE_FIELDS) {
    if ((parsed as Record<string, unknown>)[field] !== undefined) {
      throw new Error(`TikTok account projection leaked forbidden field: ${field}`);
    }
  }
  return parsed;
}
