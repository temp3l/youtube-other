import http from "node:http";

import {
  CachingJwksSource,
  OidcJwksAuthenticator,
  type OidcJwk,
} from "@mediaforge/application";
import { z } from "zod";

import {
  createOidcRequestAuthenticator,
} from "./http-server.js";
import { startApiServer } from "./index.js";

const apiProcessEnvironmentSchema = z.object({
  MEDIAFORGE_API_BIND_HOST: z.string().min(1).default("127.0.0.1"),
  MEDIAFORGE_API_OIDC_ISSUER: z.string().url(),
  MEDIAFORGE_API_OIDC_AUDIENCE: z.string().min(1),
  MEDIAFORGE_API_OIDC_JWKS_URL: z.string().url(),
  MEDIAFORGE_API_CURSOR_SECRET: z.string().min(32),
  MEDIAFORGE_API_JWKS_CACHE_TTL_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(300_000),
  MEDIAFORGE_API_JWKS_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
});

export interface ApiProcessEnvironment {
  readonly bindHost: string;
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUrl: string;
  readonly cursorSecret: string;
  readonly jwksCacheTtlMs: number;
  readonly jwksTimeoutMs: number;
}

export function parseApiProcessEnvironment(
  environment: NodeJS.ProcessEnv
): ApiProcessEnvironment {
  const parsed = apiProcessEnvironmentSchema.parse(environment);
  const jwks = new URL(parsed.MEDIAFORGE_API_OIDC_JWKS_URL);
  if (jwks.protocol !== "https:" && jwks.hostname !== "127.0.0.1" && jwks.hostname !== "localhost")
    throw new Error("MEDIAFORGE_API_OIDC_JWKS_URL must use HTTPS outside local development.");
  return {
    bindHost: parsed.MEDIAFORGE_API_BIND_HOST,
    issuer: parsed.MEDIAFORGE_API_OIDC_ISSUER,
    audience: parsed.MEDIAFORGE_API_OIDC_AUDIENCE,
    jwksUrl: parsed.MEDIAFORGE_API_OIDC_JWKS_URL,
    cursorSecret: parsed.MEDIAFORGE_API_CURSOR_SECRET,
    jwksCacheTtlMs: parsed.MEDIAFORGE_API_JWKS_CACHE_TTL_MS,
    jwksTimeoutMs: parsed.MEDIAFORGE_API_JWKS_TIMEOUT_MS,
  };
}

function isJwk(value: unknown): value is OidcJwk {
  if (!value || typeof value !== "object") return false;
  return Reflect.get(value, "kty") === "RSA" &&
    typeof Reflect.get(value, "kid") === "string" &&
    typeof Reflect.get(value, "n") === "string" &&
    typeof Reflect.get(value, "e") === "string";
}

export function createRemoteJwksLoader(input: {
  readonly url: string;
  readonly timeoutMs: number;
  readonly request?: typeof fetch;
}): () => Promise<readonly OidcJwk[]> {
  const request = input.request ?? fetch;
  return async () => {
    const response = await request(input.url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (!response.ok) throw new Error(`JWKS request failed with HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > 1_000_000) throw new Error("JWKS response exceeds 1 MB.");
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > 1_000_000) throw new Error("JWKS response exceeds 1 MB.");
    const parsed = JSON.parse(body) as { readonly keys?: unknown };
    if (!Array.isArray(parsed.keys) || !parsed.keys.every(isJwk))
      throw new Error("JWKS response does not contain a valid RSA key set.");
    return parsed.keys;
  };
}

function waitUntilListening(server: http.Server): Promise<void> {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function close(server: http.Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
}

/** Starts the authenticated API role and blocks until shutdown is requested. */
export async function runApiProcess(input: {
  readonly signal: AbortSignal;
  readonly environment?: NodeJS.ProcessEnv;
  readonly request?: typeof fetch;
  readonly startServer?: typeof startApiServer;
}): Promise<void> {
  const role = parseApiProcessEnvironment(input.environment ?? process.env);
  const keys = new CachingJwksSource(
    createRemoteJwksLoader({ url: role.jwksUrl, timeoutMs: role.jwksTimeoutMs, ...(input.request ? { request: input.request } : {}) }),
    role.jwksCacheTtlMs
  );
  const authenticate = createOidcRequestAuthenticator(new OidcJwksAuthenticator(keys, {
    issuer: role.issuer,
    audience: role.audience,
  }));
  const server = await (input.startServer ?? startApiServer)({
    host: role.bindHost,
    authenticate,
    cursorSecret: role.cursorSecret,
  });
  await waitUntilListening(server);
  if (input.signal.aborted) return close(server);
  await new Promise<void>((resolve, reject) => {
    input.signal.addEventListener("abort", () => {
      void close(server).then(resolve, reject);
    }, { once: true });
    server.once("error", reject);
  });
}
