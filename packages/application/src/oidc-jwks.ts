import { createPublicKey, verify } from "node:crypto";

import type { AuthenticatedPrincipal } from "./tenant-identity.js";

interface JwtHeader {
  readonly alg: string;
  readonly kid: string;
}

interface JwtClaims {
  readonly sub: string;
  readonly iss: string;
  readonly aud: string | readonly string[];
  readonly exp: number;
  readonly nbf?: number;
  readonly workspace_id: string;
  readonly scope?: string;
  readonly permissions?: readonly string[];
  readonly client_id?: string;
}

export interface OidcJwk {
  readonly kty: "RSA";
  readonly kid: string;
  readonly n: string;
  readonly e: string;
  readonly use?: "sig";
  readonly alg?: "RS256";
}

export interface JwksSource {
  load(): Promise<readonly OidcJwk[]>;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    return object(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function parseHeader(value: Record<string, unknown> | null): JwtHeader | null {
  if (!value || value["alg"] !== "RS256" || typeof value["kid"] !== "string" || value["kid"].length === 0) return null;
  return { alg: value["alg"], kid: value["kid"] };
}

function parseClaims(value: Record<string, unknown> | null): JwtClaims | null {
  if (!value || typeof value["sub"] !== "string" || typeof value["iss"] !== "string" ||
    (typeof value["aud"] !== "string" && (!Array.isArray(value["aud"]) || !value["aud"].every((item) => typeof item === "string"))) ||
    typeof value["exp"] !== "number" || typeof value["workspace_id"] !== "string" ||
    (value["nbf"] !== undefined && typeof value["nbf"] !== "number") ||
    (value["scope"] !== undefined && typeof value["scope"] !== "string") ||
    (value["permissions"] !== undefined && (!Array.isArray(value["permissions"]) || !value["permissions"].every((item) => typeof item === "string"))) ||
    (value["client_id"] !== undefined && typeof value["client_id"] !== "string")) return null;
  return value as unknown as JwtClaims;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(segment)) return null;
  return parseJson(Buffer.from(segment, "base64url").toString("utf8"));
}

function permissionSet(claims: JwtClaims): readonly string[] {
  return [...new Set([...(claims.scope?.split(/\s+/u).filter(Boolean) ?? []), ...(claims.permissions ?? [])])].sort();
}

/**
 * Caches a JWKS for a bounded interval and refreshes once on an unknown key
 * ID, which accommodates normal issuer rotation without trusting token URLs.
 */
export class CachingJwksSource {
  private keys: readonly OidcJwk[] = [];
  private expiresAt = 0;

  public constructor(
    private readonly loadKeys: () => Promise<readonly OidcJwk[]>,
    private readonly cacheTtlMs: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async key(kid: string): Promise<OidcJwk | null> {
    if (this.now().getTime() >= this.expiresAt) await this.refresh();
    let key = this.keys.find((candidate) => candidate.kid === kid) ?? null;
    if (!key) {
      await this.refresh();
      key = this.keys.find((candidate) => candidate.kid === kid) ?? null;
    }
    return key;
  }

  private async refresh(): Promise<void> {
    const keys = await this.loadKeys();
    this.keys = keys.filter((key) => key.kty === "RSA" && key.kid.length > 0 && (key.use === undefined || key.use === "sig") && (key.alg === undefined || key.alg === "RS256"));
    this.expiresAt = this.now().getTime() + this.cacheTtlMs;
  }
}

export class OidcJwksAuthenticator {
  public constructor(
    private readonly keys: Pick<CachingJwksSource, "key">,
    private readonly options: {
      readonly issuer: string;
      readonly audience: string;
      readonly now?: () => Date;
      readonly clockSkewSeconds?: number;
    }
  ) {}

  public async authenticate(authorization: string | undefined): Promise<AuthenticatedPrincipal | null> {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u)?.[1];
    if (!token) return null;
    const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedClaims || !encodedSignature) return null;
    const header = parseHeader(decodeSegment(encodedHeader));
    const claims = parseClaims(decodeSegment(encodedClaims));
    if (!header || !claims) return null;
    const now = (this.options.now ?? (() => new Date()))().getTime() / 1_000;
    const skew = this.options.clockSkewSeconds ?? 30;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== this.options.issuer || !audience.includes(this.options.audience) || claims.exp <= now - skew || (claims.nbf !== undefined && claims.nbf > now + skew)) return null;
    const key = await this.keys.key(header.kid);
    if (!key) return null;
    try {
      const publicKey = createPublicKey({ key: key as never, format: "jwk" });
      const valid = verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedClaims}`, "ascii"), publicKey, Buffer.from(encodedSignature, "base64url"));
      if (!valid) return null;
    } catch {
      return null;
    }
    return {
      principalId: claims.sub,
      workspaceId: claims.workspace_id,
      permissions: permissionSet(claims),
      kind: claims.client_id ? "service" : "user",
    };
  }
}
