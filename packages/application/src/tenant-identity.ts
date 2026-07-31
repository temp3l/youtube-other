import crypto from "node:crypto";

export interface PilotApiKeyRecord {
  readonly id: string;
  readonly secretHash: string;
  readonly workspaceId: string;
  readonly permissions: readonly string[];
  readonly expiresAt: string;
  readonly revokedAt?: string;
}

export interface AuthenticatedPrincipal {
  readonly principalId: string;
  readonly workspaceId: string;
  readonly permissions: readonly string[];
  readonly kind: "user" | "service" | "worker";
}

export function hashPilotApiKey(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function authenticatePilotApiKey(input: {
  readonly token: string | undefined;
  readonly records: readonly PilotApiKeyRecord[];
  readonly now: Date;
}): AuthenticatedPrincipal | null {
  if (!input.token?.startsWith("mfk_")) return null;
  const hash = hashPilotApiKey(input.token);
  const record = input.records.find((candidate) =>
    crypto.timingSafeEqual(Buffer.from(candidate.secretHash), Buffer.from(hash))
  );
  if (!record || record.revokedAt || new Date(record.expiresAt) <= input.now) return null;
  return { principalId: record.id, workspaceId: record.workspaceId, permissions: record.permissions, kind: "service" };
}

export function requirePermission(
  principal: AuthenticatedPrincipal,
  workspaceId: string,
  permission: string
): void {
  if (principal.workspaceId !== workspaceId) throw new Error("not_found");
  if (!principal.permissions.includes(permission)) throw new Error("authorization_denied");
}
