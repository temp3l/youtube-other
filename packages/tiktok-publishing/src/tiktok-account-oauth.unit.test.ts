import { describe, expect, it } from "vitest";

import { buildTikTokOAuthState } from "@mediaforge/domain";
import { redactTikTokPublicationAuditPayload } from "@mediaforge/observability/log-redaction.js";
import { TikTokAccountApplicationService } from "../../application/src/tiktok-account-service.js";
import fixture from "./fixtures/tiktok-oauth-account.fixture.json" with {
  type: "json",
};
import {
  FakeTikTokAccountRepository,
} from "./tiktok-account-fake-repository.js";
import {
  FixtureTikTokTokenExchange,
  TikTokAccountOAuthService,
} from "./tiktok-account-oauth-service.js";
import { InMemoryTikTokSecretStore } from "./in-memory-tiktok-secret-store.js";
import { buildTikTokCredentialHandle } from "./tiktok-secret-store-contracts.js";

describe("tiktok account oauth contracts", () => {
  const repository = new FakeTikTokAccountRepository();
  const secretStore = new InMemoryTikTokSecretStore();
  const tokenExchange = new FixtureTikTokTokenExchange({
    providerAccountId: fixture.providerAccountId,
    displayName: fixture.displayName,
    grantedScopes: fixture.requestedScopes,
    authorizationExpiresAt: fixture.authorizationExpiresAt,
    credentials: {
      schemaVersion: "mediaforge.tiktok-secret-store.v1",
      accessToken: fixture.accessToken,
      refreshToken: fixture.refreshToken,
      tokenType: "Bearer",
    },
  });

  it("begins oauth with official authorization endpoint and fixture state", () => {
    const service = new TikTokAccountOAuthService({
      repository,
      tokenExchange,
      secretStore,
    });
    const started = service.beginOAuthSession({
      workspaceId: fixture.workspaceId,
      sessionId: fixture.sessionId,
      stateNonce: fixture.stateNonce,
      redirectUri: fixture.redirectUri,
      requestedScopes: fixture.requestedScopes,
      expiresAt: fixture.expiresAt,
      createdAt: fixture.evaluatedAt,
      accountId: fixture.accountId,
      clientKey: fixture.clientKey,
    });
    expect(started.beginResult.authorizationUrl).toContain(
      "https://www.tiktok.com/v2/auth/authorize/"
    );
    expect(started.beginResult.oauthState).toBe(
      buildTikTokOAuthState({
        workspaceId: fixture.workspaceId,
        sessionId: fixture.sessionId,
        stateNonce: fixture.stateNonce,
      })
    );
  });

  it("registers an account from a provider-free oauth callback fixture", async () => {
    const oauthService = new TikTokAccountOAuthService({
      repository,
      tokenExchange,
      secretStore,
    });
    oauthService.beginOAuthSession({
      workspaceId: fixture.workspaceId,
      sessionId: fixture.sessionId,
      stateNonce: fixture.stateNonce,
      redirectUri: fixture.redirectUri,
      requestedScopes: fixture.requestedScopes,
      expiresAt: fixture.expiresAt,
      createdAt: fixture.evaluatedAt,
      accountId: fixture.accountId,
      clientKey: fixture.clientKey,
    });
    const completed = await oauthService.completeOAuthCallback({
      workspaceId: fixture.workspaceId,
      sessionId: fixture.sessionId,
      evaluatedAt: fixture.evaluatedAt,
      accountId: fixture.accountId,
      credentialVersionId: "cred.fixture.v1",
      callback: {
        code: fixture.authorizationCode,
        state: buildTikTokOAuthState({
          workspaceId: fixture.workspaceId,
          sessionId: fixture.sessionId,
          stateNonce: fixture.stateNonce,
        }),
      },
      registration: {},
    });
    expect(completed.account.providerAccountId).toBe(fixture.providerAccountId);
    expect(completed.grant.credentialHandle).toBe(
      buildTikTokCredentialHandle({
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountId,
      })
    );
    expect(completed.grant.state).toBe("active");
    expect(secretStore.snapshotSerializedStorage()).not.toContain(
      fixture.accessToken
    );
    expect(
      redactTikTokPublicationAuditPayload({
        credentialHandle: completed.grant.credentialHandle,
        credentialVersionId: completed.grant.credentialVersionId,
        accessToken: fixture.accessToken,
      })
    ).toEqual({
      credentialHandle: completed.grant.credentialHandle,
      credentialVersionId: completed.grant.credentialVersionId,
      accessToken: "[REDACTED]",
    });
  });

  it("revokes account grants without live authorization", async () => {
    const application = new TikTokAccountApplicationService({
      port: repository,
      tokenExchange,
      secretStore,
    });
    const revoked = await application.revokeAccount({
      workspaceId: fixture.workspaceId,
      revocation: {
        accountId: fixture.accountId,
        reason: "fixture-revocation",
        revokedAt: "2026-08-12T12:45:00.000Z",
      },
    });
    expect(revoked.connectionStatus).toBe("revoked");
    expect(application.getActiveGrant({ accountId: fixture.accountId })).toBeNull();
  });

  it("blocks attempt binding mutation after preparation", () => {
    const application = new TikTokAccountApplicationService({
      port: repository,
      tokenExchange,
      secretStore,
    });
    expect(() =>
      application.requireAttemptAccountBinding({
        preparedBinding: {
          providerAccountId: fixture.providerAccountId,
          credentialVersion: "cred.fixture.v1",
        },
        observedBinding: {
          providerAccountId: fixture.providerAccountId,
          credentialVersion: "cred.fixture.v2",
        },
      })
    ).toThrow(/credential version changed/i);
  });
});
