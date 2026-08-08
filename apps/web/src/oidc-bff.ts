import crypto from "node:crypto";
import type http from "node:http";

import type { SaasIdentity, SaasSession } from "./saas-runtime.js";

export interface OidcBffOptions {
  readonly authorizationUrl: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly stateSecret: string;
  readonly completeAuthorization: (input: {
    readonly code: string;
    readonly codeVerifier: string;
  }) => Promise<SaasSession | SaasIdentity | null>;
  readonly now?: () => Date;
  readonly secureCookies?: boolean;
}

interface PendingAuthorization {
  readonly state: string;
  readonly verifier: string;
  readonly createdAt: number;
}

interface StoredSession { readonly value: SaasIdentity; readonly expiresAt: number; }

function cookies(request: http.IncomingMessage): ReadonlyMap<string, string> {
  return new Map((request.headers.cookie ?? "").split(";").flatMap((part) => {
    const index = part.indexOf("=");
    return index > 0 ? [[part.slice(0, index).trim(), part.slice(index + 1).trim()] as const] : [];
  }));
}

function encode(value: unknown, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decode<T>(value: string | undefined, secret: string): T | null {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T; } catch { return null; }
}

function cookie(name: string, value: string, secure: boolean, maxAge?: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}`;
}

/** Server-side OIDC BFF boundary. Tokens never enter the session cookie or HTML. */
export class OidcBff {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly now: () => Date;
  private readonly secureCookies: boolean;

  public constructor(private readonly options: OidcBffOptions) {
    if (Buffer.byteLength(options.stateSecret, "utf8") < 32) throw new Error("OIDC state secret must contain at least 32 bytes.");
    this.now = options.now ?? (() => new Date());
    this.secureCookies = options.secureCookies ?? true;
  }

  public session(request: http.IncomingMessage): SaasSession | null {
    return this.identity(request)?.session ?? null;
  }

  /** The access token, when supplied by the IdP adapter, remains server-side. */
  public identity(request: http.IncomingMessage): SaasIdentity | null {
    const id = cookies(request).get("mf_session");
    const stored = id ? this.sessions.get(id) : undefined;
    if (!stored || stored.expiresAt <= this.now().getTime()) { if (id) this.sessions.delete(id); return null; }
    return stored.value;
  }

  public async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? "/", "https://mediaforge.local");
    if (request.method === "GET" && url.pathname === "/auth/sign-in") {
      const pending: PendingAuthorization = { state: crypto.randomUUID(), verifier: crypto.randomBytes(48).toString("base64url"), createdAt: this.now().getTime() };
      const challenge = crypto.createHash("sha256").update(pending.verifier).digest("base64url");
      const authorize = new URL(this.options.authorizationUrl);
      authorize.searchParams.set("response_type", "code"); authorize.searchParams.set("client_id", this.options.clientId);
      authorize.searchParams.set("redirect_uri", this.options.redirectUri); authorize.searchParams.set("scope", "openid");
      authorize.searchParams.set("state", pending.state); authorize.searchParams.set("code_challenge", challenge); authorize.searchParams.set("code_challenge_method", "S256");
      response.setHeader("set-cookie", cookie("mf_oidc", encode(pending, this.options.stateSecret), this.secureCookies, 600));
      response.writeHead(302, { location: authorize.toString() }).end(); return true;
    }
    if (request.method === "GET" && url.pathname === "/auth/callback") {
      const pending = decode<PendingAuthorization>(cookies(request).get("mf_oidc"), this.options.stateSecret);
      const code = url.searchParams.get("code");
      if (!pending || !code || url.searchParams.get("state") !== pending.state || this.now().getTime() - pending.createdAt > 600_000) { response.writeHead(400).end(); return true; }
      const result = await this.options.completeAuthorization({ code, codeVerifier: pending.verifier });
      if (!result) { response.writeHead(401).end(); return true; }
      const value: SaasIdentity = "session" in result ? result : { session: result };
      const id = crypto.randomUUID(); this.sessions.set(id, { value, expiresAt: this.now().getTime() + 3_600_000 });
      response.setHeader("set-cookie", [cookie("mf_oidc", "", this.secureCookies, 0), cookie("mf_session", id, this.secureCookies, 3_600)]);
      response.writeHead(303, { location: "/" }).end(); return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/sign-out") {
      const origin = request.headers.origin;
      if (!origin || new URL(origin).host !== request.headers.host) { response.writeHead(403).end(); return true; }
      const id = cookies(request).get("mf_session"); if (id) this.sessions.delete(id);
      response.setHeader("set-cookie", cookie("mf_session", "", this.secureCookies, 0)); response.writeHead(204).end(); return true;
    }
    return false;
  }
}
