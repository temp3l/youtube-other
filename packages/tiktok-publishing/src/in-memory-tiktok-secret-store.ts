import {
  assertTikTokCredentialHandleForAccount,
  buildTikTokCredentialHandle,
  tikTokCredentialSecretReferenceSchema,
  tikTokOAuthCredentialPayloadSchema,
  tikTokSecretStoreAvailabilitySchema,
  type TikTokCredentialSecretReference,
  type TikTokOAuthCredentialPayload,
  type TikTokSecretStoreAvailability,
} from "./tiktok-secret-store-contracts.js";
import type { TikTokSecretStorePort } from "./tiktok-secret-store-port.js";

type StoredSecret = {
  readonly payload: TikTokOAuthCredentialPayload;
  readonly revokedAt?: string;
  readonly overlapUntil?: string;
};

export class InMemoryTikTokSecretStore implements TikTokSecretStorePort {
  private readonly secrets = new Map<string, Map<string, StoredSecret>>();
  private available = true;
  private unavailableReason: string | undefined;

  public setAvailability(input: {
    readonly available: boolean;
    readonly reason?: string;
  }): void {
    this.available = input.available;
    this.unavailableReason = input.reason;
  }

  public availability(): TikTokSecretStoreAvailability {
    return tikTokSecretStoreAvailabilitySchema.parse({
      available: this.available,
      ...(this.unavailableReason ? { reason: this.unavailableReason } : {}),
    });
  }

  public async storeCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly credentialVersionId: string;
    readonly payload: TikTokOAuthCredentialPayload;
    readonly storedAt: string;
  }): Promise<TikTokCredentialSecretReference> {
    const handle = buildTikTokCredentialHandle({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const versions = this.secrets.get(handle) ?? new Map<string, StoredSecret>();
    versions.set(
      input.credentialVersionId,
      {
        payload: tikTokOAuthCredentialPayloadSchema.parse(input.payload),
      }
    );
    this.secrets.set(handle, versions);
    return tikTokCredentialSecretReferenceSchema.parse({
      schemaVersion: "mediaforge.tiktok-secret-store.v1",
      handle,
      credentialVersionId: input.credentialVersionId,
    });
  }

  public async resolveCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly handle: string;
    readonly credentialVersionId: string;
  }): Promise<TikTokOAuthCredentialPayload> {
    assertTikTokCredentialHandleForAccount({
      handle: input.handle,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const stored = this.secrets
      .get(input.handle)
      ?.get(input.credentialVersionId);
    if (!stored) {
      throw new Error("TikTok credential secret is unavailable.");
    }
    if (stored.revokedAt !== undefined) {
      throw new Error("TikTok credential secret is revoked.");
    }
    return stored.payload;
  }

  public async rotateCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly previousHandle: string;
    readonly previousCredentialVersionId: string;
    readonly credentialVersionId: string;
    readonly payload: TikTokOAuthCredentialPayload;
    readonly storedAt: string;
    readonly overlapUntil?: string;
  }): Promise<TikTokCredentialSecretReference> {
    assertTikTokCredentialHandleForAccount({
      handle: input.previousHandle,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const previous = this.secrets
      .get(input.previousHandle)
      ?.get(input.previousCredentialVersionId);
    if (!previous) {
      throw new Error("TikTok credential secret rotation source is missing.");
    }
    this.secrets
      .get(input.previousHandle)
      ?.set(input.previousCredentialVersionId, {
        ...previous,
        ...(input.overlapUntil ? { overlapUntil: input.overlapUntil } : {}),
      });
    return this.storeCredential({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
      payload: input.payload,
      storedAt: input.storedAt,
    });
  }

  public async revokeCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly handle: string;
    readonly credentialVersionId: string;
    readonly revokedAt: string;
  }): Promise<void> {
    assertTikTokCredentialHandleForAccount({
      handle: input.handle,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    });
    const stored = this.secrets
      .get(input.handle)
      ?.get(input.credentialVersionId);
    if (!stored) {
      throw new Error("TikTok credential secret is unavailable.");
    }
    this.secrets.get(input.handle)?.set(input.credentialVersionId, {
      ...stored,
      revokedAt: input.revokedAt,
    });
  }

  public snapshotSerializedStorage(): string {
    const serializable = Object.fromEntries(
      [...this.secrets.entries()].map(([handle, versions]) => [
        handle,
        Object.fromEntries(
          [...versions.entries()].map(([credentialVersionId, stored]) => [
            credentialVersionId,
            {
              revokedAt: stored.revokedAt,
              overlapUntil: stored.overlapUntil,
            },
          ])
        ),
      ])
    );
    return JSON.stringify(serializable);
  }
}
