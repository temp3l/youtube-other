import crypto from "node:crypto";

export const API_PERMISSIONS = [
  "workspace.admin",
  "content.read",
  "content.write",
  "workflow.start",
  "workflow.cancel",
  "render.execute",
  "validation.read",
  "validation.execute",
  "approval.read",
  "approval.decide",
  "publication.read",
  "publication.execute",
  "publication.schedule",
  "channel.credentials.manage",
  "webhook.manage",
  "audit.read",
  "usage.read",
] as const;

export type ApiPermission = (typeof API_PERMISSIONS)[number];

const permissionVocabulary = new Set<string>(API_PERMISSIONS);
const forbiddenPilotApiKeyPermissions = new Set<ApiPermission>([
  "workspace.admin",
  "publication.execute",
  "publication.schedule",
  "channel.credentials.manage",
  "webhook.manage",
]);

export function normalizeApiPermissions(
  permissions: readonly string[],
  credential: "principal" | "pilot-api-key" = "principal"
): readonly ApiPermission[] {
  const normalized = [...new Set(permissions.map((permission) => permission.trim()))]
    .filter(Boolean)
    .sort();
  if (
    normalized.length < 1 ||
    normalized.length > 100 ||
    normalized.some((permission) => !permissionVocabulary.has(permission)) ||
    (credential === "pilot-api-key" &&
      normalized.some((permission) =>
        forbiddenPilotApiKeyPermissions.has(permission as ApiPermission)
      ))
  ) {
    throw new Error(
      credential === "pilot-api-key"
        ? "Pilot API key permissions must use the approved non-administrative permission vocabulary."
        : "Principal permissions must use the approved permission vocabulary."
    );
  }
  return normalized as ApiPermission[];
}

export function isAllowedPilotApiKeyPermissions(
  permissions: readonly string[]
): permissions is readonly ApiPermission[] {
  try {
    normalizeApiPermissions(permissions, "pilot-api-key");
    return true;
  } catch {
    return false;
  }
}

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
  if (!secret.startsWith("mfk_") || secret.length < 24)
    throw new Error("Pilot API keys must use the mfk_ prefix and contain at least 24 characters.");
  const salt = crypto.randomBytes(16);
  const cost = 16_384;
  const blockSize = 8;
  const parallelization = 1;
  const derived = crypto.scryptSync(secret, salt, 32, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    "v1",
    cost,
    blockSize,
    parallelization,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export function verifyPilotApiKeyHash(secret: string, encoded: string): boolean {
  const [algorithm, version, costValue, blockValue, parallelValue, saltValue, hashValue, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || version !== "v1" || !costValue || !blockValue || !parallelValue || !saltValue || !hashValue || extra !== undefined)
    return false;
  const cost = Number(costValue);
  const blockSize = Number(blockValue);
  const parallelization = Number(parallelValue);
  if (cost !== 16_384 || blockSize !== 8 || parallelization !== 1) return false;
  try {
    const expected = Buffer.from(hashValue, "base64url");
    const actual = crypto.scryptSync(secret, Buffer.from(saltValue, "base64url"), expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function authenticatePilotApiKey(input: {
  readonly token: string | undefined;
  readonly records: readonly PilotApiKeyRecord[];
  readonly now: Date;
}): AuthenticatedPrincipal | null {
  if (!input.token?.startsWith("mfk_")) return null;
  const record = input.records.find((candidate) =>
    verifyPilotApiKeyHash(input.token!, candidate.secretHash)
  );
  if (
    !record ||
    record.revokedAt ||
    new Date(record.expiresAt) <= input.now ||
    !isAllowedPilotApiKeyPermissions(record.permissions)
  )
    return null;
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
