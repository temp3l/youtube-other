import crypto from "node:crypto";

import {
  hashPilotApiKey,
  isAllowedPilotApiKeyPermissions,
  normalizeApiPermissions,
  verifyPilotApiKeyHash,
  type AuthenticatedPrincipal,
} from "./tenant-identity.js";

const opaqueWorkspace = /^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/u;
const tokenPattern = /^mfk_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43,})$/u;

export interface DurablePilotApiKeyRecord {
  readonly workspaceId: string;
  readonly keyId: string;
  readonly principalId: string;
  readonly permissions: readonly string[];
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly revision: number;
}

export interface DurablePilotApiKeyCandidate extends DurablePilotApiKeyRecord {
  readonly secretHash: string;
  readonly principalPermissions: readonly string[];
}

export interface DurablePilotApiKeyRepository {
  issue(input: {
    readonly workspaceId: string;
    readonly keyId: string;
    readonly principalId: string;
    readonly lookupFingerprint: string;
    readonly secretHash: string;
    readonly permissions: readonly string[];
    readonly expiresAt: string;
    readonly actorSubject: string;
    readonly auditId: string;
    readonly now: string;
  }): Promise<DurablePilotApiKeyRecord>;
  rotate(input: {
    readonly workspaceId: string;
    readonly previousKeyId: string;
    readonly previousExpectedRevision: number;
    readonly keyId: string;
    readonly principalId: string;
    readonly lookupFingerprint: string;
    readonly secretHash: string;
    readonly permissions: readonly string[];
    readonly expiresAt: string;
    readonly actorSubject: string;
    readonly auditId: string;
    readonly now: string;
  }): Promise<DurablePilotApiKeyRecord>;
  revoke(input: {
    readonly workspaceId: string;
    readonly keyId: string;
    readonly expectedRevision: number;
    readonly actorSubject: string;
    readonly reason: string;
    readonly auditId: string;
    readonly now: string;
  }): Promise<DurablePilotApiKeyRecord>;
  findActiveByFingerprint(input: {
    readonly workspaceId: string;
    readonly lookupFingerprint: string;
    readonly now: string;
  }): Promise<DurablePilotApiKeyCandidate | null>;
}

export function fingerprintPilotApiKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parsePilotApiKeyWorkspace(token: string): string | null {
  const encoded = token.match(tokenPattern)?.[1];
  if (!encoded) return null;
  try {
    const workspaceId = Buffer.from(encoded, "base64url").toString("utf8");
    return opaqueWorkspace.test(workspaceId) && Buffer.from(workspaceId).toString("base64url") === encoded
      ? workspaceId
      : null;
  } catch {
    return null;
  }
}

export class PilotApiKeyService {
  public constructor(
    private readonly repository: DurablePilotApiKeyRepository,
    private readonly options: {
      readonly now: () => Date;
      readonly createId: (kind: "key" | "audit") => string;
      readonly randomBytes?: (size: number) => Buffer;
    }
  ) {}

  public async issue(input: {
    readonly workspaceId: string;
    readonly principalId: string;
    readonly permissions: readonly string[];
    readonly expiresAt: string;
    readonly actorSubject: string;
  }): Promise<{ readonly token: string; readonly key: DurablePilotApiKeyRecord }> {
    return this.create(input, null);
  }

  public async rotate(input: {
    readonly workspaceId: string;
    readonly previousKeyId: string;
    readonly previousExpectedRevision: number;
    readonly principalId: string;
    readonly permissions: readonly string[];
    readonly expiresAt: string;
    readonly actorSubject: string;
  }): Promise<{ readonly token: string; readonly key: DurablePilotApiKeyRecord }> {
    return this.create(input, {
      keyId: input.previousKeyId,
      expectedRevision: input.previousExpectedRevision,
    });
  }

  public revoke(input: Parameters<DurablePilotApiKeyRepository["revoke"]>[0]): Promise<DurablePilotApiKeyRecord> {
    return this.repository.revoke(input);
  }

  private async create(
    input: {
      readonly workspaceId: string;
      readonly principalId: string;
      readonly permissions: readonly string[];
      readonly expiresAt: string;
      readonly actorSubject: string;
    },
    previous: { readonly keyId: string; readonly expectedRevision: number } | null
  ): Promise<{ readonly token: string; readonly key: DurablePilotApiKeyRecord }> {
    if (!opaqueWorkspace.test(input.workspaceId)) throw new Error("Pilot API key workspace is invalid.");
    const now = this.options.now();
    if (!Number.isFinite(new Date(input.expiresAt).getTime()) || new Date(input.expiresAt) <= now)
      throw new Error("Pilot API key expiry must be in the future.");
    const random = (this.options.randomBytes ?? crypto.randomBytes)(32).toString("base64url");
    const token = `mfk_${Buffer.from(input.workspaceId).toString("base64url")}.${random}`;
    const common = {
      workspaceId: input.workspaceId,
      keyId: this.options.createId("key"),
      principalId: input.principalId,
      lookupFingerprint: fingerprintPilotApiKey(token),
      secretHash: hashPilotApiKey(token),
      permissions: normalizeApiPermissions(input.permissions, "pilot-api-key"),
      expiresAt: input.expiresAt,
      actorSubject: input.actorSubject,
      auditId: this.options.createId("audit"),
      now: now.toISOString(),
    };
    const key = previous
      ? await this.repository.rotate({
        ...common,
        previousKeyId: previous.keyId,
        previousExpectedRevision: previous.expectedRevision,
      })
      : await this.repository.issue(common);
    return { token, key };
  }
}

export class DurablePilotApiKeyAuthenticator {
  public constructor(
    private readonly repository: Pick<DurablePilotApiKeyRepository, "findActiveByFingerprint">,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async authenticate(token: string | undefined): Promise<AuthenticatedPrincipal | null> {
    if (!token) return null;
    const workspaceId = parsePilotApiKeyWorkspace(token);
    if (!workspaceId) return null;
    const candidate = await this.repository.findActiveByFingerprint({
      workspaceId,
      lookupFingerprint: fingerprintPilotApiKey(token),
      now: this.now().toISOString(),
    });
    if (
      !candidate ||
      !verifyPilotApiKeyHash(token, candidate.secretHash) ||
      !isAllowedPilotApiKeyPermissions(candidate.permissions) ||
      !isAllowedPilotApiKeyPermissions(candidate.principalPermissions)
    )
      return null;
    const current = new Set(candidate.principalPermissions);
    return {
      workspaceId,
      principalId: candidate.principalId,
      kind: "service",
      permissions: candidate.permissions.filter((permission) => current.has(permission)),
    };
  }
}
