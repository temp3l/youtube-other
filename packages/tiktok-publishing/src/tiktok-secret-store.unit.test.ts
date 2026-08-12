import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { redactTikTokPublicationAuditPayload } from "@mediaforge/observability/log-redaction.js";
import { InMemoryTikTokSecretStore } from "./in-memory-tiktok-secret-store.js";
import { LocalEncryptedTikTokSecretStore } from "./local-encrypted-tiktok-secret-store.js";
import {
  buildTikTokCredentialHandle,
  redactTikTokSecretStoreAuditPayload,
} from "./tiktok-secret-store-contracts.js";
import {
  assertTikTokSecretStoreAvailable,
  requireTikTokCredentialForDispatch,
  TikTokSecretStoreUnavailableError,
} from "./tiktok-secret-store-port.js";
import { TikTokAccountOAuthService } from "./tiktok-account-oauth-service.js";
import {
  FakeTikTokAccountRepository,
} from "./tiktok-account-fake-repository.js";
import fixture from "./fixtures/tiktok-oauth-account.fixture.json" with {
  type: "json",
};
import { FixtureTikTokTokenExchange } from "./tiktok-account-oauth-service.js";

const fixtureCredentials = {
  schemaVersion: "mediaforge.tiktok-secret-store.v1" as const,
  accessToken: fixture.accessToken,
  refreshToken: fixture.refreshToken,
  tokenType: "Bearer" as const,
};

describe("tiktok secret store", () => {
  it("stores credentials behind opaque handles without leaking token material", async () => {
    const store = new InMemoryTikTokSecretStore();
    const stored = await store.storeCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      credentialVersionId: "cred.fixture.v1",
      payload: fixtureCredentials,
      storedAt: fixture.evaluatedAt,
    });

    expect(stored.handle).toBe(
      buildTikTokCredentialHandle({
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountId,
      })
    );
    expect(stored.credentialVersionId).toBe("cred.fixture.v1");
    expect(store.snapshotSerializedStorage()).not.toContain(fixture.accessToken);
    expect(store.snapshotSerializedStorage()).not.toContain(fixture.refreshToken);
  });

  it("resolves stored credentials by handle and credential version", async () => {
    const store = new InMemoryTikTokSecretStore();
    const stored = await store.storeCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      credentialVersionId: "cred.fixture.v1",
      payload: fixtureCredentials,
      storedAt: fixture.evaluatedAt,
    });
    await expect(
      store.resolveCredential({
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountId,
        handle: stored.handle,
        credentialVersionId: stored.credentialVersionId,
      })
    ).resolves.toEqual(fixtureCredentials);
  });

  it("rotates credentials with versioned overlap and fail-closed revocation", async () => {
    const store = new InMemoryTikTokSecretStore();
    const initial = await store.storeCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      credentialVersionId: "cred.fixture.v1",
      payload: fixtureCredentials,
      storedAt: fixture.evaluatedAt,
    });
    const rotated = await store.rotateCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      previousHandle: initial.handle,
      previousCredentialVersionId: initial.credentialVersionId,
      credentialVersionId: "cred.fixture.v2",
      payload: {
        ...fixtureCredentials,
        accessToken: "act.fixture-access-token-v2",
      },
      storedAt: "2026-08-12T12:30:00.000Z",
      overlapUntil: "2026-08-12T13:00:00.000Z",
    });
    await expect(
      store.resolveCredential({
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountId,
        handle: rotated.handle,
        credentialVersionId: rotated.credentialVersionId,
      })
    ).resolves.toMatchObject({ accessToken: "act.fixture-access-token-v2" });
    await store.revokeCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      handle: rotated.handle,
      credentialVersionId: rotated.credentialVersionId,
      revokedAt: "2026-08-12T12:45:00.000Z",
    });
    await expect(
      store.resolveCredential({
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountId,
        handle: rotated.handle,
        credentialVersionId: rotated.credentialVersionId,
      })
    ).rejects.toThrow(/revoked/i);
  });

  it("blocks oauth persistence and dispatch when secure storage is unavailable", async () => {
    const store = new InMemoryTikTokSecretStore();
    store.setAvailability({
      available: false,
      reason: "fixture-unavailable",
    });
    expect(() => assertTikTokSecretStoreAvailable(store)).toThrow(
      TikTokSecretStoreUnavailableError
    );
    await expect(
      requireTikTokCredentialForDispatch({
        store,
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountId,
        handle: buildTikTokCredentialHandle({
          workspaceId: fixture.workspaceId,
          accountId: fixture.accountId,
        }),
        credentialVersionId: "cred.fixture.v1",
      })
    ).rejects.toThrow(/unavailable/i);

    const repository = new FakeTikTokAccountRepository();
    const oauthService = new TikTokAccountOAuthService({
      repository,
      secretStore: store,
      tokenExchange: new FixtureTikTokTokenExchange({
        providerAccountId: fixture.providerAccountId,
        displayName: fixture.displayName,
        grantedScopes: fixture.requestedScopes,
        credentials: fixtureCredentials,
      }),
    });
    oauthService.beginOAuthSession({
      workspaceId: fixture.workspaceId,
      sessionId: "oauth-session.unavailable.001",
      stateNonce: "nonce-unavailable",
      redirectUri: fixture.redirectUri,
      requestedScopes: fixture.requestedScopes,
      expiresAt: fixture.expiresAt,
      createdAt: fixture.evaluatedAt,
      accountId: fixture.accountId,
      clientKey: fixture.clientKey,
    });
    await expect(
      oauthService.completeOAuthCallback({
        workspaceId: fixture.workspaceId,
        sessionId: "oauth-session.unavailable.001",
        evaluatedAt: fixture.evaluatedAt,
        accountId: fixture.accountId,
        credentialVersionId: "cred.fixture.v1",
        callback: {
          code: fixture.authorizationCode,
          state: `${fixture.workspaceId}:oauth-session.unavailable.001:nonce-unavailable`,
        },
        registration: {},
      })
    ).rejects.toThrow(/unavailable/i);
  });

  it("persists encrypted secrets locally without plaintext token material", async () => {
    const storeRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "tiktok-secret-store-")
    );
    const store = new LocalEncryptedTikTokSecretStore({
      storeRoot,
      encryptionKey: "x".repeat(32),
    });
    const stored = await store.storeCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      credentialVersionId: "cred.fixture.v1",
      payload: fixtureCredentials,
      storedAt: fixture.evaluatedAt,
    });
    const files = await fs.readdir(
      path.join(storeRoot, fixture.workspaceId, fixture.accountId)
    );
    const serialized = (
      await Promise.all(
        files.map((file) =>
          fs.readFile(
            path.join(storeRoot, fixture.workspaceId, fixture.accountId, file),
            "utf8"
          )
        )
      )
    ).join("\n");
    expect(serialized).not.toContain(fixture.accessToken);
    expect(serialized).not.toContain(fixture.refreshToken);
    await expect(
      store.resolveCredential({
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountId,
        handle: stored.handle,
        credentialVersionId: stored.credentialVersionId,
      })
    ).resolves.toEqual(fixtureCredentials);
  });

  it("redacts token fields from secret-store audit payloads", () => {
    const handle = buildTikTokCredentialHandle({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
    });
    expect(
      redactTikTokSecretStoreAuditPayload({
        credentialHandle: handle,
        credentialVersionId: "cred.fixture.v1",
        accessToken: fixture.accessToken,
        refreshToken: fixture.refreshToken,
      })
    ).toEqual({
      credentialHandle: handle,
      credentialVersionId: "cred.fixture.v1",
    });
    expect(
      redactTikTokPublicationAuditPayload({
        credentialHandle: handle,
        accessToken: fixture.accessToken,
      })
    ).toEqual({
      credentialHandle: handle,
      accessToken: "[REDACTED]",
    });
  });
});
