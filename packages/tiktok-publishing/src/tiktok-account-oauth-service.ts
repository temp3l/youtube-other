import {
  beginTikTokOAuthSession,
  createOfficialTikTokEndpointConfiguration,
  evaluateTikTokOAuthCallback,
  registerTikTokAccount,
  revokeTikTokAccountGrant,
  type TikTokAccountRecord,
  type TikTokAccountRegistrationInput,
  type TikTokAccountRevocationInput,
  type TikTokOAuthBeginResult,
  type TikTokOAuthCallbackInput,
  type TikTokOAuthGrantRecord,
  type TikTokOAuthSessionRecord,
  validateConfiguredTikTokEndpoints,
} from "@mediaforge/domain";

import type { TikTokAccountRepositoryPort } from "./tiktok-account-fake-repository.js";
import type { TikTokOAuthCredentialPayload } from "./tiktok-secret-store-contracts.js";
import {
  assertTikTokSecretStoreAvailable,
  type TikTokSecretStorePort,
} from "./tiktok-secret-store-port.js";

export type ProviderFreeTikTokTokenExchangeResult = {
  readonly providerAccountId: string;
  readonly displayName: string;
  readonly grantedScopes: readonly string[];
  readonly authorizationExpiresAt?: string;
  readonly credentials: TikTokOAuthCredentialPayload;
};

export type ProviderFreeTikTokTokenExchangePort = {
  exchangeAuthorizationCode(input: {
    readonly authorizationCode: string;
    readonly session: TikTokOAuthSessionRecord;
  }): ProviderFreeTikTokTokenExchangeResult;
};

export class FixtureTikTokTokenExchange implements ProviderFreeTikTokTokenExchangePort {
  public constructor(
    private readonly fixture: ProviderFreeTikTokTokenExchangeResult
  ) {}

  public exchangeAuthorizationCode(): ProviderFreeTikTokTokenExchangeResult {
    return this.fixture;
  }
}

export type TikTokAccountOAuthServiceInput = {
  readonly repository: TikTokAccountRepositoryPort;
  readonly tokenExchange: ProviderFreeTikTokTokenExchangePort;
  readonly secretStore: TikTokSecretStorePort;
  readonly endpointConfiguration?: ReturnType<
    typeof createOfficialTikTokEndpointConfiguration
  >;
};

export class TikTokAccountOAuthService {
  private readonly endpointConfiguration;

  public constructor(private readonly input: TikTokAccountOAuthServiceInput) {
    this.endpointConfiguration =
      input.endpointConfiguration ?? createOfficialTikTokEndpointConfiguration();
    validateConfiguredTikTokEndpoints(this.endpointConfiguration);
  }

  public beginOAuthSession(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly stateNonce: string;
    readonly redirectUri: string;
    readonly requestedScopes: readonly string[];
    readonly expiresAt: string;
    readonly createdAt: string;
    readonly accountId?: string;
    readonly clientKey: string;
  }): {
    readonly session: TikTokOAuthSessionRecord;
    readonly beginResult: TikTokOAuthBeginResult;
  } {
    const started = beginTikTokOAuthSession({
      ...input,
      endpointConfiguration: this.endpointConfiguration,
    });
    this.input.repository.saveSession({ session: started.session });
    return started;
  }

  public async completeOAuthCallback(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly callback: TikTokOAuthCallbackInput;
    readonly evaluatedAt: string;
    readonly accountId: string;
    readonly credentialVersionId: string;
    readonly registration: Omit<
      TikTokAccountRegistrationInput,
      | "workspaceId"
      | "accountId"
      | "providerAccountId"
      | "displayName"
      | "credentialHandle"
      | "grantedScopes"
      | "authorizationExpiresAt"
      | "registeredAt"
    >;
  }): Promise<{
    readonly account: TikTokAccountRecord;
    readonly grant: TikTokOAuthGrantRecord;
    readonly session: TikTokOAuthSessionRecord;
  }> {
    assertTikTokSecretStoreAvailable(this.input.secretStore);
    const session = this.input.repository.getSession({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });
    if (!session) {
      throw new Error("TikTok OAuth session not found.");
    }
    const admission = evaluateTikTokOAuthCallback({
      session,
      callback: input.callback,
      evaluatedAt: input.evaluatedAt,
    });
    if (!admission.allowed || admission.code === undefined) {
      const failedSession: TikTokOAuthSessionRecord = {
        ...session,
        sessionState: admission.sessionState,
      };
      this.input.repository.saveSession({ session: failedSession });
      throw new Error(admission.message ?? "TikTok OAuth callback rejected.");
    }
    const exchanged = this.input.tokenExchange.exchangeAuthorizationCode({
      authorizationCode: admission.code,
      session,
    });
    const storedSecret = await this.input.secretStore.storeCredential({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      credentialVersionId: input.credentialVersionId,
      payload: exchanged.credentials,
      storedAt: input.evaluatedAt,
    });
    const registered = registerTikTokAccount({
      registration: {
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        providerAccountId: exchanged.providerAccountId,
        displayName: exchanged.displayName,
        credentialHandle: storedSecret.handle,
        grantedScopes: [...exchanged.grantedScopes],
        ...(exchanged.authorizationExpiresAt
          ? { authorizationExpiresAt: exchanged.authorizationExpiresAt }
          : {}),
        registeredAt: input.evaluatedAt,
      },
      credentialVersionId: input.credentialVersionId,
    });
    const completedSession: TikTokOAuthSessionRecord = {
      ...session,
      sessionState: "completed",
    };
    this.input.repository.saveSession({ session: completedSession });
    this.input.repository.saveAccount({ account: registered.account });
    this.input.repository.saveCredentialVersion({
      credentialVersion: registered.credentialVersion,
    });
    this.input.repository.saveGrant({ grant: registered.grant });
    return {
      account: registered.account,
      grant: registered.grant,
      session: completedSession,
    };
  }

  public async revokeAccount(input: {
    readonly workspaceId: string;
    readonly revocation: TikTokAccountRevocationInput;
  }): Promise<{
    readonly account: TikTokAccountRecord;
    readonly grant: TikTokOAuthGrantRecord;
  }> {
    assertTikTokSecretStoreAvailable(this.input.secretStore);
    const account = this.input.repository.getAccount({
      workspaceId: input.workspaceId,
      accountId: input.revocation.accountId,
    });
    if (!account?.credentialVersion) {
      throw new Error("TikTok account is not connected.");
    }
    const credentialVersion = this.input.repository.getCredentialVersion({
      credentialVersionId: account.credentialVersion,
    });
    const grant = this.input.repository.getActiveGrant({
      accountId: account.accountId,
    });
    if (!credentialVersion || !grant) {
      throw new Error("TikTok account grant or credential version is missing.");
    }
    await this.input.secretStore.revokeCredential({
      workspaceId: input.workspaceId,
      accountId: account.accountId,
      handle: credentialVersion.credentialHandle,
      credentialVersionId: credentialVersion.credentialVersionId,
      revokedAt: input.revocation.revokedAt,
    });
    const revoked = revokeTikTokAccountGrant({
      account,
      credentialVersion,
      grant,
      revocation: input.revocation,
    });
    this.input.repository.saveAccount({ account: revoked.account });
    this.input.repository.saveCredentialVersion({
      credentialVersion: revoked.credentialVersion,
    });
    this.input.repository.saveGrant({ grant: revoked.grant });
    return { account: revoked.account, grant: revoked.grant };
  }
}
