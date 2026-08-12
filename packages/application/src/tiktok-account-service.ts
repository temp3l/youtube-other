import {
  evaluateTikTokAttemptAccountBindingImmutability,
  redactTikTokAccountRecord,
  type TikTokAccountRecord,
  type TikTokAccountRevocationInput,
  type TikTokAttemptAccountBinding,
  type TikTokOAuthBeginResult,
  type TikTokOAuthCallbackInput,
  type TikTokOAuthGrantRecord,
} from "@mediaforge/domain";
import {
  TikTokAccountOAuthService,
  type TikTokAccountRepositoryPort,
  type ProviderFreeTikTokTokenExchangePort,
} from "@mediaforge/tiktok-publishing";

export type TikTokAccountApplicationPort = TikTokAccountRepositoryPort & {
  listAccounts(input: {
    readonly workspaceId: string;
  }): readonly TikTokAccountRecord[];
};

export type TikTokAccountApplicationServiceInput = {
  readonly port: TikTokAccountApplicationPort;
  readonly tokenExchange: ProviderFreeTikTokTokenExchangePort;
};

export class TikTokAccountApplicationService {
  private readonly oauthService: TikTokAccountOAuthService;

  public constructor(private readonly input: TikTokAccountApplicationServiceInput) {
    this.oauthService = new TikTokAccountOAuthService({
      repository: input.port,
      tokenExchange: input.tokenExchange,
    });
  }

  public beginAccountConnect(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly stateNonce: string;
    readonly redirectUri: string;
    readonly requestedScopes: readonly string[];
    readonly expiresAt: string;
    readonly createdAt: string;
    readonly accountId?: string;
    readonly clientKey: string;
  }): TikTokOAuthBeginResult {
    return this.oauthService.beginOAuthSession(input).beginResult;
  }

  public completeAccountConnect(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly callback: TikTokOAuthCallbackInput;
    readonly evaluatedAt: string;
    readonly accountId: string;
    readonly credentialVersionId: string;
  }): TikTokAccountRecord {
    const result = this.oauthService.completeOAuthCallback({
      ...input,
      registration: {},
    });
    return redactTikTokAccountRecord(result.account);
  }

  public revokeAccount(input: {
    readonly workspaceId: string;
    readonly revocation: TikTokAccountRevocationInput;
  }): TikTokAccountRecord {
    const result = this.oauthService.revokeAccount(input);
    return redactTikTokAccountRecord(result.account);
  }

  public getAccount(input: {
    readonly workspaceId: string;
    readonly accountId: string;
  }): TikTokAccountRecord | null {
    const account = this.input.port.getAccount(input);
    return account ? redactTikTokAccountRecord(account) : null;
  }

  public listAccounts(input: {
    readonly workspaceId: string;
  }): readonly TikTokAccountRecord[] {
    return this.input.port
      .listAccounts(input)
      .map((account) => redactTikTokAccountRecord(account));
  }

  public getActiveGrant(input: {
    readonly accountId: string;
  }): TikTokOAuthGrantRecord | null {
    return this.input.port.getActiveGrant(input);
  }

  public requireAttemptAccountBinding(input: {
    readonly preparedBinding: TikTokAttemptAccountBinding;
    readonly observedBinding: TikTokAttemptAccountBinding;
  }): void {
    const admission = evaluateTikTokAttemptAccountBindingImmutability(input);
    if (!admission.allowed) {
      throw new Error(admission.message ?? "TikTok attempt account binding changed.");
    }
  }
}
