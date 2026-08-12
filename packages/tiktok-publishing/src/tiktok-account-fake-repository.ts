import type {
  TikTokAccountRecord,
  TikTokCredentialVersionRecord,
  TikTokOAuthGrantRecord,
  TikTokOAuthSessionRecord,
} from "@mediaforge/domain";

export type TikTokAccountRepositoryPort = {
  saveSession(input: {
    readonly session: TikTokOAuthSessionRecord;
  }): TikTokOAuthSessionRecord;
  getSession(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
  }): TikTokOAuthSessionRecord | null;
  saveAccount(input: {
    readonly account: TikTokAccountRecord;
  }): TikTokAccountRecord;
  getAccount(input: {
    readonly workspaceId: string;
    readonly accountId: string;
  }): TikTokAccountRecord | null;
  saveCredentialVersion(input: {
    readonly credentialVersion: TikTokCredentialVersionRecord;
  }): TikTokCredentialVersionRecord;
  getCredentialVersion(input: {
    readonly credentialVersionId: string;
  }): TikTokCredentialVersionRecord | null;
  saveGrant(input: {
    readonly grant: TikTokOAuthGrantRecord;
  }): TikTokOAuthGrantRecord;
  getActiveGrant(input: {
    readonly accountId: string;
  }): TikTokOAuthGrantRecord | null;
};

export class FakeTikTokAccountRepository implements TikTokAccountRepositoryPort {
  private readonly sessions = new Map<string, TikTokOAuthSessionRecord>();
  private readonly accounts = new Map<string, TikTokAccountRecord>();
  private readonly credentialVersions = new Map<string, TikTokCredentialVersionRecord>();
  private readonly grants = new Map<string, TikTokOAuthGrantRecord>();

  public saveSession(input: {
    readonly session: TikTokOAuthSessionRecord;
  }): TikTokOAuthSessionRecord {
    const key = `${input.session.workspaceId}:${input.session.sessionId}`;
    this.sessions.set(key, input.session);
    return input.session;
  }

  public getSession(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
  }): TikTokOAuthSessionRecord | null {
    return this.sessions.get(`${input.workspaceId}:${input.sessionId}`) ?? null;
  }

  public saveAccount(input: {
    readonly account: TikTokAccountRecord;
  }): TikTokAccountRecord {
    const key = `${input.account.workspaceId}:${input.account.accountId}`;
    this.accounts.set(key, input.account);
    return input.account;
  }

  public getAccount(input: {
    readonly workspaceId: string;
    readonly accountId: string;
  }): TikTokAccountRecord | null {
    return this.accounts.get(`${input.workspaceId}:${input.accountId}`) ?? null;
  }

  public saveCredentialVersion(input: {
    readonly credentialVersion: TikTokCredentialVersionRecord;
  }): TikTokCredentialVersionRecord {
    this.credentialVersions.set(
      input.credentialVersion.credentialVersionId,
      input.credentialVersion
    );
    return input.credentialVersion;
  }

  public getCredentialVersion(input: {
    readonly credentialVersionId: string;
  }): TikTokCredentialVersionRecord | null {
    return this.credentialVersions.get(input.credentialVersionId) ?? null;
  }

  public saveGrant(input: {
    readonly grant: TikTokOAuthGrantRecord;
  }): TikTokOAuthGrantRecord {
    this.grants.set(input.grant.accountId, input.grant);
    return input.grant;
  }

  public getActiveGrant(input: {
    readonly accountId: string;
  }): TikTokOAuthGrantRecord | null {
    const grant = this.grants.get(input.accountId);
    return grant?.state === "active" ? grant : null;
  }

  public listAccounts(input: {
    readonly workspaceId: string;
  }): readonly TikTokAccountRecord[] {
    return [...this.accounts.values()].filter(
      (account) => account.workspaceId === input.workspaceId
    );
  }
}
