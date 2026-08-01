import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { describe, expect, it, vi } from "vitest";

import {
  NodeWebhookDnsResolver,
  NodeWebhookHttpTransport,
} from "./node-webhook-delivery.js";

class FakeRequest extends EventEmitter {
  public body = "";
  public timeoutMs = 0;
  public timeout: (() => void) | undefined;
  public destroyed = false;

  public setTimeout(milliseconds: number, callback: () => void): this {
    this.timeoutMs = milliseconds;
    this.timeout = callback;
    return this;
  }

  public end(body: string): this {
    this.body = body;
    return this;
  }

  public destroy(): this {
    this.destroyed = true;
    return this;
  }
}

class FakeResponse extends EventEmitter {
  public destroyed = false;
  public constructor(public readonly statusCode: number) { super(); }
  public destroy(): this { this.destroyed = true; return this; }
}

function transportFixture(status = 204, chunks: readonly string[] = []) {
  const request = new FakeRequest();
  const response = new FakeResponse(status);
  let requestOptions: RequestOptions | undefined;
  const requestPort = vi.fn((options: RequestOptions, callback: (message: IncomingMessage) => void) => {
    requestOptions = options;
    queueMicrotask(() => {
      callback(response as unknown as IncomingMessage);
      for (const chunk of chunks) response.emit("data", Buffer.from(chunk));
      response.emit("end");
    });
    return request as unknown as ClientRequest;
  });
  const setTimer = vi.fn(() => ({ timer: true }) as unknown as ReturnType<typeof setTimeout>);
  const clearTimer = vi.fn();
  const transport = new NodeWebhookHttpTransport(requestPort, { maxResponseBytes: 16, setTimer, clearTimer });
  return { transport, request, response, requestPort, setTimer, clearTimer, options: () => requestOptions! };
}

const post = {
  url: "https://hooks.example.test:8443/path?source=mediaforge",
  headers: { "Webhook-Id": "event-1" },
  body: "{\"id\":\"event-1\"}",
  timeoutMs: 2_000,
  approvedAddresses: ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
  followRedirects: false as const,
};

describe("Node webhook delivery adapters", () => {
  it("returns every unique A and AAAA address even if one family is unavailable", async () => {
    const resolver = new NodeWebhookDnsResolver({
      resolve4: vi.fn(async () => ["93.184.216.34", "93.184.216.34"]),
      resolve6: vi.fn(async () => ["2606:2800:220:1:248:1893:25c8:1946"]),
    });
    await expect(resolver.resolve("hooks.example.test")).resolves.toEqual([
      "93.184.216.34",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]);

    const ipv4Only = new NodeWebhookDnsResolver({
      resolve4: vi.fn(async () => ["93.184.216.34"]),
      resolve6: vi.fn(async () => { throw new Error("AAAA unavailable"); }),
    });
    await expect(ipv4Only.resolve("hooks.example.test")).resolves.toEqual(["93.184.216.34"]);
  });

  it("pins the connection while preserving TLS servername, Host, path, and body", async () => {
    const fixture = transportFixture();
    await expect(fixture.transport.post(post)).resolves.toEqual({ status: 204 });
    expect(fixture.requestPort).toHaveBeenCalledOnce();
    expect(fixture.options()).toMatchObject({
      protocol: "https:",
      hostname: "hooks.example.test",
      port: "8443",
      path: "/path?source=mediaforge",
      method: "POST",
      servername: "hooks.example.test",
      headers: { Host: "hooks.example.test:8443", "Webhook-Id": "event-1" },
    });
    const lookup = fixture.options().lookup!;
    const resolved = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup("hooks.example.test", {}, ((error: Error | null, address: string, family: number) => {
        if (error) reject(error); else resolve({ address, family });
      }) as never);
    });
    expect(resolved).toEqual({ address: "93.184.216.34", family: 4 });
    expect(fixture.request.body).toBe(post.body);
    expect(fixture.request.timeoutMs).toBe(2_000);
    expect(fixture.setTimer).toHaveBeenCalledWith(expect.any(Function), 2_000);
    expect(fixture.clearTimer).toHaveBeenCalledOnce();
  });

  it("returns redirects without following them", async () => {
    const fixture = transportFixture(302);
    await expect(fixture.transport.post(post)).resolves.toEqual({ status: 302 });
    expect(fixture.requestPort).toHaveBeenCalledOnce();
  });

  it("rejects and destroys a response exceeding the drain limit", async () => {
    const fixture = transportFixture(200, ["1234567890", "1234567890"]);
    await expect(fixture.transport.post(post)).rejects.toThrow(/byte limit/u);
    expect(fixture.response.destroyed).toBe(true);
    expect(fixture.request.destroyed).toBe(true);
  });

  it("enforces the absolute timeout and destroys the request", async () => {
    const request = new FakeRequest();
    let timeout: (() => void) | undefined;
    const transport = new NodeWebhookHttpTransport(
      () => request as unknown as ClientRequest,
      {
        setTimer: (callback) => { timeout = callback; return { timer: true } as unknown as ReturnType<typeof setTimeout>; },
        clearTimer: vi.fn(),
      }
    );
    const pending = transport.post(post);
    timeout!();
    await expect(pending).rejects.toThrow(/timed out/u);
    expect(request.destroyed).toBe(true);
  });
});
