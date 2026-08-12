import type {
  TikTokCredentialSecretReference,
  TikTokOAuthCredentialPayload,
  TikTokSecretStoreAvailability,
} from "./tiktok-secret-store-contracts.js";

export type TikTokSecretStorePort = {
  availability(): TikTokSecretStoreAvailability;
  storeCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly credentialVersionId: string;
    readonly payload: TikTokOAuthCredentialPayload;
    readonly storedAt: string;
  }): Promise<TikTokCredentialSecretReference>;
  resolveCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly handle: string;
    readonly credentialVersionId: string;
  }): Promise<TikTokOAuthCredentialPayload>;
  rotateCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly previousHandle: string;
    readonly previousCredentialVersionId: string;
    readonly credentialVersionId: string;
    readonly payload: TikTokOAuthCredentialPayload;
    readonly storedAt: string;
    readonly overlapUntil?: string;
  }): Promise<TikTokCredentialSecretReference>;
  revokeCredential(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly handle: string;
    readonly credentialVersionId: string;
    readonly revokedAt: string;
  }): Promise<void>;
};

export class TikTokSecretStoreUnavailableError extends Error {
  public constructor(message = "TikTok secure credential storage is unavailable.") {
    super(message);
    this.name = "TikTokSecretStoreUnavailableError";
  }
}

export function assertTikTokSecretStoreAvailable(
  store: TikTokSecretStorePort
): void {
  const availability = store.availability();
  if (!availability.available) {
    throw new TikTokSecretStoreUnavailableError(availability.reason);
  }
}

export async function requireTikTokCredentialForDispatch(input: {
  readonly store: TikTokSecretStorePort;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly handle: string;
  readonly credentialVersionId: string;
}): Promise<TikTokOAuthCredentialPayload> {
  assertTikTokSecretStoreAvailable(input.store);
  return input.store.resolveCredential({
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    handle: input.handle,
    credentialVersionId: input.credentialVersionId,
  });
}
