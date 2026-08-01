import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CachingJwksSource, OidcJwksAuthenticator } from "./oidc-jwks.js";

function jwt(input: { readonly privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]; readonly payload: Record<string, unknown>; readonly kid?: string }): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", kid: input.kid ?? "key-1", typ: "JWT" });
  const payload = encode(input.payload);
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`, "ascii"), input.privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("OIDC JWKS authentication", () => {
  it("accepts a current issuer/audience-bound token and maps tenant permissions", async () => {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const source = new CachingJwksSource(async () => [{ ...pair.publicKey.export({ format: "jwk" }), kty: "RSA", kid: "key-1", use: "sig", alg: "RS256" }], 60_000, () => new Date("2026-07-31T12:00:00.000Z"));
    const authenticate = new OidcJwksAuthenticator(source, { issuer: "https://issuer.example", audience: "mediaforge-api", now: () => new Date("2026-07-31T12:00:00.000Z") });
    const token = jwt({ privateKey: pair.privateKey, payload: { sub: "user-1", iss: "https://issuer.example", aud: "mediaforge-api", exp: 1_785_499_300, workspace_id: "workspace-1", scope: "content.read workflow.start" } });
    await expect(authenticate.authenticate(`Bearer ${token}`)).resolves.toMatchObject({ principalId: "user-1", workspaceId: "workspace-1", permissions: ["content.read", "workflow.start"] });
  });

  it("fails closed for expired, wrong-audience, and unknown-key tokens", async () => {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const source = new CachingJwksSource(async () => [{ ...pair.publicKey.export({ format: "jwk" }), kty: "RSA", kid: "key-1", use: "sig", alg: "RS256" }], 60_000, () => new Date("2026-07-31T12:00:00.000Z"));
    const authenticate = new OidcJwksAuthenticator(source, { issuer: "https://issuer.example", audience: "mediaforge-api", now: () => new Date("2026-07-31T12:00:00.000Z"), clockSkewSeconds: 0 });
    const expired = jwt({ privateKey: pair.privateKey, payload: { sub: "user-1", iss: "https://issuer.example", aud: "mediaforge-api", exp: 1, workspace_id: "workspace-1" } });
    const wrongAudience = jwt({ privateKey: pair.privateKey, payload: { sub: "user-1", iss: "https://issuer.example", aud: "other", exp: 1_785_499_300, workspace_id: "workspace-1" } });
    const unknownKid = jwt({ privateKey: pair.privateKey, kid: "missing", payload: { sub: "user-1", iss: "https://issuer.example", aud: "mediaforge-api", exp: 1_785_499_300, workspace_id: "workspace-1" } });
    await expect(authenticate.authenticate(`Bearer ${expired}`)).resolves.toBeNull();
    await expect(authenticate.authenticate(`Bearer ${wrongAudience}`)).resolves.toBeNull();
    await expect(authenticate.authenticate(`Bearer ${unknownKid}`)).resolves.toBeNull();
  });
});
