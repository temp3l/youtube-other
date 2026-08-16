import {
  TIKTOK_OFFICIAL_ENDPOINTS,
  TIKTOK_OFFICIAL_ENDPOINT_KINDS,
} from "@mediaforge/domain";

import oauthFixture from "../../tiktok-publishing/src/fixtures/tiktok-oauth-account.fixture.json" with {
  type: "json",
};
import auditReadyFixture from "../../tiktok-publishing/src/fixtures/tiktok-app-audit-ready.fixture.json" with {
  type: "json",
};

export const MICRO_050_TASK_ID = "MICRO-050";

export const MICRO_050_CANARY_WORKSPACE_ID = oauthFixture.workspaceId;
export const MICRO_050_CANARY_PROVIDER_APP_ID = auditReadyFixture.providerAppId;
export const MICRO_050_CANARY_ACCOUNT_ID = oauthFixture.accountId;
export const MICRO_050_CANARY_PROVIDER_ACCOUNT_ID = oauthFixture.providerAccountId;
export const MICRO_050_CANARY_REQUESTED_SCOPES = [...oauthFixture.requestedScopes] as const;
export const MICRO_050_CANARY_PROVIDER_APP_REVISION =
  auditReadyFixture.configurationRevisionId;

export const MICRO_050_CANARY_ALLOWED_ENDPOINTS = [
  ...TIKTOK_OFFICIAL_ENDPOINT_KINDS,
] as const;

export const MICRO_050_CANARY_OFFICIAL_ENDPOINT_URLS = {
  authorization: TIKTOK_OFFICIAL_ENDPOINTS.authorization,
  token: TIKTOK_OFFICIAL_ENDPOINTS.token,
  revoke: TIKTOK_OFFICIAL_ENDPOINTS.revoke,
  userInfo: TIKTOK_OFFICIAL_ENDPOINTS.userInfo,
} as const;

export const MICRO_050_CANARY_AUTHORIZATION_WINDOW = {
  startAt: oauthFixture.evaluatedAt,
  endAt: oauthFixture.authorizationExpiresAt,
} as const;

export const MICRO_050_INITIAL_CREDENTIAL_VERSION_ID = "cred.fixture.v1";
export const MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID = "cred.fixture.v2";

export const MICRO_050_OAUTH_FIXTURE = oauthFixture;
export const MICRO_050_AUDIT_READY_FIXTURE = auditReadyFixture;
