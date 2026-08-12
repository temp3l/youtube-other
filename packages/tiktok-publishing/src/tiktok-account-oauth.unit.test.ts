import { describe, expect, it } from "vitest";

import { buildTikTokOAuthState } from "@mediaforge/domain";
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

describe("tiktok account oauth contracts", () => {
  const repository = new FakeTikTokAccountRepository();
  const tokenExchange = new FixtureTikTokTokenExchange({
    providerAccountId: fixture.providerAccountId,
    displayName: fixture.displayName,
    credentialHandle: fixture.credentialHandle,
    grantedScopes: fixture.requestedScopes,
    authorizationExpiresAt: fixture.authorizationExpiresAt,
  });

  it("begins oauth with official authorization endpoint and fixture state", () => {
    const service = new TikTokAccountOAuthService({ repository, tokenExchange });
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

  it("registers an account from a provider-free oauth callback fixture", () => {
    const oauthService = new TikTokAccountOAuthService({ repository, tokenExchange });
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
    const completed = oauthService.completeOAuthCallback({
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
    expect(completed.grant.credentialHandle).toBe(fixture.credentialHandle);
    expect(completed.grant.state).toBe("active");
  });

  it("revokes account grants without live authorization", () => {
    const application = new TikTokAccountApplicationService({
      port: repository,
      tokenExchange,
    });
    const revoked = application.revokeAccount({
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
