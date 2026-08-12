import { describe, expect, it } from "vitest";

import {
  assertOfficialTikTokEndpointUrl,
  beginTikTokOAuthSession,
  buildTikTokOAuthState,
  createOfficialTikTokEndpointConfiguration,
  evaluateTikTokAttemptAccountBindingImmutability,
  evaluateTikTokOAuthCallback,
  parseTikTokOAuthState,
  registerTikTokAccount,
  revokeTikTokAccountGrant,
  validateConfiguredTikTokEndpoints,
} from "./tiktok-account-lifecycle.js";
import { TIKTOK_OFFICIAL_ENDPOINTS } from "./tiktok-account-contracts.js";

describe("tiktok account lifecycle", () => {
  const endpointConfiguration = createOfficialTikTokEndpointConfiguration();
  const evaluatedAt = "2026-08-12T12:00:00.000Z";

  it("accepts only official TikTok endpoint configuration", () => {
    expect(() =>
      validateConfiguredTikTokEndpoints({
        schemaVersion: "mediaforge.tiktok-account.v1",
        authorizationUrl: "https://evil.example/oauth",
        tokenUrl: TIKTOK_OFFICIAL_ENDPOINTS.token,
        revokeUrl: TIKTOK_OFFICIAL_ENDPOINTS.revoke,
        userInfoUrl: TIKTOK_OFFICIAL_ENDPOINTS.userInfo,
      })
    ).toThrow(/authorization/i);
    expect(
      assertOfficialTikTokEndpointUrl({
        kind: "token",
        url: TIKTOK_OFFICIAL_ENDPOINTS.token,
      }).allowed
    ).toBe(true);
  });

  it("builds and validates oauth state", () => {
    const state = buildTikTokOAuthState({
      workspaceId: "workspace.001",
      sessionId: "oauth-session.001",
      stateNonce: "nonce-001",
    });
    expect(parseTikTokOAuthState(state)).toEqual({
      workspaceId: "workspace.001",
      sessionId: "oauth-session.001",
      stateNonce: "nonce-001",
    });
    expect(parseTikTokOAuthState("broken-state")).toBeNull();
  });

  it("rejects oauth callback state and nonce mismatches", () => {
    const started = beginTikTokOAuthSession({
      workspaceId: "workspace.001",
      sessionId: "oauth-session.001",
      stateNonce: "nonce-001",
      redirectUri: "https://localhost:8787/oauth/tiktok/callback",
      requestedScopes: ["user.info.basic"],
      expiresAt: "2026-08-12T12:15:00.000Z",
      createdAt: evaluatedAt,
      clientKey: "fixture-client-key",
      endpointConfiguration,
    });
    const mismatch = evaluateTikTokOAuthCallback({
      session: started.session,
      callback: {
        code: "fixture-code",
        state: buildTikTokOAuthState({
          workspaceId: "workspace.002",
          sessionId: "oauth-session.001",
          stateNonce: "nonce-001",
        }),
      },
      evaluatedAt,
    });
    expect(mismatch.allowed).toBe(false);
    expect(mismatch.reason).toBe("oauth_workspace_mismatch");
  });

  it("keeps account and credential identities immutable per attempt", () => {
    const admission = evaluateTikTokAttemptAccountBindingImmutability({
      preparedBinding: {
        providerAccountId: "tiktok.account.001",
        credentialVersion: "cred.v1",
      },
      observedBinding: {
        providerAccountId: "tiktok.account.001",
        credentialVersion: "cred.v2",
      },
    });
    expect(admission.allowed).toBe(false);
    expect(admission.reason).toBe("credential_version_mismatch");
  });

  it("registers and revokes accounts with immutable credential versions", () => {
    const registered = registerTikTokAccount({
      registration: {
        workspaceId: "workspace.001",
        accountId: "tiktok.account.001",
        providerAccountId: "tiktok.open-id.001",
        displayName: "Creator One",
        credentialHandle: "tiktok-cred-handle.001",
        grantedScopes: ["user.info.basic", "video.publish"],
        registeredAt: evaluatedAt,
      },
      credentialVersionId: "cred.v1",
    });
    expect(registered.account.credentialVersion).toBe("cred.v1");
    expect(registered.credentialVersion.state).toBe("active");

    const revoked = revokeTikTokAccountGrant({
      account: registered.account,
      credentialVersion: registered.credentialVersion,
      grant: registered.grant,
      revocation: {
        accountId: "tiktok.account.001",
        reason: "operator-revoked",
        revokedAt: "2026-08-12T12:30:00.000Z",
      },
    });
    expect(revoked.account.connectionStatus).toBe("revoked");
    expect(revoked.credentialVersion.state).toBe("revoked");
    expect(revoked.grant.state).toBe("revoked");
  });
});
