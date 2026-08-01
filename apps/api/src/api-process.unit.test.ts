import http from "node:http";

import { describe, expect, it } from "vitest";

import {
  createRemoteJwksLoader,
  parseApiProcessEnvironment,
  runApiProcess,
} from "./api-process.js";

function validEnvironment(
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  return {
    MEDIAFORGE_API_OIDC_ISSUER: "https://identity.example.test",
    MEDIAFORGE_API_OIDC_AUDIENCE: "mediaforge-api",
    MEDIAFORGE_API_OIDC_JWKS_URL: "https://identity.example.test/jwks",
    MEDIAFORGE_API_CURSOR_SECRET: "a-secure-cursor-secret-with-32-chars",
    ...overrides,
  };
}

function responseRequest(
  response: Response,
  calls: Array<{ readonly url: string | URL | Request; readonly init?: RequestInit }>
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return response;
  }) as typeof fetch;
}

describe("API process", () => {
  it("validates required environment values and applies bounded defaults", () => {
    expect(parseApiProcessEnvironment(validEnvironment())).toEqual({
      bindHost: "127.0.0.1",
      issuer: "https://identity.example.test",
      audience: "mediaforge-api",
      jwksUrl: "https://identity.example.test/jwks",
      cursorSecret: "a-secure-cursor-secret-with-32-chars",
      jwksCacheTtlMs: 300_000,
      jwksTimeoutMs: 5_000,
    });

    expect(() => parseApiProcessEnvironment(validEnvironment({
      MEDIAFORGE_API_OIDC_AUDIENCE: "",
    }))).toThrow();
    expect(() => parseApiProcessEnvironment(validEnvironment({
      MEDIAFORGE_API_JWKS_TIMEOUT_MS: "30001",
    }))).toThrow();
  });

  it("rejects non-HTTPS JWKS URLs except explicit local development hosts", () => {
    expect(() => parseApiProcessEnvironment(validEnvironment({
      MEDIAFORGE_API_OIDC_JWKS_URL: "http://identity.example.test/jwks",
    }))).toThrow("must use HTTPS outside local development");

    expect(parseApiProcessEnvironment(validEnvironment({
      MEDIAFORGE_API_OIDC_JWKS_URL: "http://localhost:8080/jwks",
    })).jwksUrl).toBe("http://localhost:8080/jwks");
    expect(parseApiProcessEnvironment(validEnvironment({
      MEDIAFORGE_API_OIDC_JWKS_URL: "http://127.0.0.1:8080/jwks",
    })).jwksUrl).toBe("http://127.0.0.1:8080/jwks");
  });

  it("loads only valid bounded RSA JWKS responses and disables redirects", async () => {
    const calls: Array<{ readonly url: string | URL | Request; readonly init?: RequestInit }> = [];
    const key = { kty: "RSA", kid: "key-1", n: "modulus", e: "AQAB" } as const;
    const load = createRemoteJwksLoader({
      url: "https://identity.example.test/jwks",
      timeoutMs: 1_000,
      request: responseRequest(new Response(JSON.stringify({ keys: [key] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }), calls),
    });

    await expect(load()).resolves.toEqual([key]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://identity.example.test/jwks",
      init: {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: expect.any(AbortSignal),
      },
    });

    const invalid = createRemoteJwksLoader({
      url: "https://identity.example.test/jwks",
      timeoutMs: 1_000,
      request: responseRequest(new Response(JSON.stringify({
        keys: [{ kty: "EC", kid: "key-1", n: "modulus", e: "AQAB" }],
      })), []),
    });
    await expect(invalid()).rejects.toThrow("valid RSA key set");
  });

  it("rejects failed and oversized JWKS responses", async () => {
    const failed = createRemoteJwksLoader({
      url: "https://identity.example.test/jwks",
      timeoutMs: 1_000,
      request: responseRequest(new Response("unavailable", { status: 503 }), []),
    });
    await expect(failed()).rejects.toThrow("HTTP 503");

    const declaredOversize = createRemoteJwksLoader({
      url: "https://identity.example.test/jwks",
      timeoutMs: 1_000,
      request: responseRequest(new Response("{}", {
        headers: { "content-length": "1000001" },
      }), []),
    });
    await expect(declaredOversize()).rejects.toThrow("exceeds 1 MB");

    const actualOversize = createRemoteJwksLoader({
      url: "https://identity.example.test/jwks",
      timeoutMs: 1_000,
      request: responseRequest(new Response("x".repeat(1_000_001)), []),
    });
    await expect(actualOversize()).rejects.toThrow("exceeds 1 MB");
  });

  it("closes the injected API server when shutdown is requested", async () => {
    const shutdown = new AbortController();
    const server = http.createServer();
    const started: unknown[] = [];
    const running = runApiProcess({
      signal: shutdown.signal,
      environment: validEnvironment(),
      request: responseRequest(new Response(JSON.stringify({ keys: [] })), []),
      startServer: async (input) => {
        started.push(input);
        server.listen(0, "127.0.0.1");
        return server;
      },
    });
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve();
      server.once("listening", resolve);
      server.once("error", reject);
    });

    shutdown.abort();
    await expect(running).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
    expect(started).toEqual([
      expect.objectContaining({
        host: "127.0.0.1",
        cursorSecret: "a-secure-cursor-secret-with-32-chars",
        authenticate: expect.any(Function),
      }),
    ]);
  });
});
