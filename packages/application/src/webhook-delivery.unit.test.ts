import { describe, expect, it, vi } from "vitest";

import { verifyWebhook } from "./webhooks.js";
import {
  WebhookHttpDelivery,
  type WebhookDnsResolver,
  type WebhookHttpTransport,
} from "./webhook-delivery.js";

const request = {
  endpointUrl: "https://hooks.example.test/mediaforge",
  eventId: "event-1",
  payload: JSON.stringify({ id: "event-1" }),
  timestamp: "2026-08-01T12:00:00.000Z",
  attempt: 2,
  secret: "secret-1",
} as const;

function dependencies(status = 204): {
  readonly dns: WebhookDnsResolver;
  readonly transport: WebhookHttpTransport;
} {
  return {
    dns: { resolve: vi.fn(async () => ["93.184.216.34"]) },
    transport: { post: vi.fn(async () => ({ status })) },
  };
}

describe("webhook HTTP delivery", () => {
  it("sends bounded signed requests without redirects and accepts every 2xx", async () => {
    const ports = dependencies(202);
    const delivery = new WebhookHttpDelivery(ports.dns, ports.transport, {
      timeoutMs: 2_000,
    });

    await expect(delivery.deliver(request)).resolves.toEqual({
      kind: "delivered",
      status: 202,
    });
    const sent = vi.mocked(ports.transport.post).mock.calls[0]![0];
    expect(sent).toMatchObject({
      url: request.endpointUrl,
      body: request.payload,
      timeoutMs: 2_000,
      approvedAddresses: ["93.184.216.34"],
      followRedirects: false,
      headers: {
        "Content-Type": "application/json",
        "Webhook-Id": "event-1",
        "Webhook-Timestamp": request.timestamp,
        "Webhook-Attempt": "2",
      },
    });
    expect(
      verifyWebhook({
        payload: sent.body,
        timestamp: sent.headers["Webhook-Timestamp"]!,
        signature: sent.headers["Webhook-Signature"]!,
        secrets: [request.secret],
        now: new Date(request.timestamp),
      })
    ).toBe(true);
  });

  it.each([
    ["http://hooks.example.test", "invalid_endpoint"],
    ["https://user:password@hooks.example.test", "invalid_endpoint"],
  ])("rejects invalid endpoint %s", async (endpointUrl, reason) => {
    const ports = dependencies();
    const delivery = new WebhookHttpDelivery(ports.dns, ports.transport);
    await expect(delivery.deliver({ ...request, endpointUrl })).resolves.toEqual({
      kind: "terminal",
      reason,
    });
    expect(ports.transport.post).not.toHaveBeenCalled();
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.2.3",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
  ])("rejects unsafe resolved address %s", async (address) => {
    const ports = dependencies();
    ports.dns.resolve = vi.fn(async () => [address]);
    const delivery = new WebhookHttpDelivery(ports.dns, ports.transport);
    await expect(delivery.deliver(request)).resolves.toEqual({
      kind: "terminal",
      reason: "unsafe_endpoint",
    });
    expect(ports.transport.post).not.toHaveBeenCalled();
  });

  it("fails closed if any DNS answer is unsafe", async () => {
    const ports = dependencies();
    ports.dns.resolve = vi.fn(async () => ["93.184.216.34", "192.168.1.2"]);
    const delivery = new WebhookHttpDelivery(ports.dns, ports.transport);
    await expect(delivery.deliver(request)).resolves.toEqual({
      kind: "terminal",
      reason: "unsafe_endpoint",
    });
  });

  it.each([408, 409, 425, 429, 500, 503])("retries transient HTTP status %s", async (status) => {
    const ports = dependencies(status);
    await expect(new WebhookHttpDelivery(ports.dns, ports.transport).deliver(request)).resolves.toEqual({
      kind: "retry",
      reason: "http_status",
      status,
    });
  });

  it.each([301, 400, 404, 422])("does not retry terminal HTTP status %s", async (status) => {
    const ports = dependencies(status);
    await expect(new WebhookHttpDelivery(ports.dns, ports.transport).deliver(request)).resolves.toEqual({
      kind: "terminal",
      reason: "http_status",
      status,
    });
  });

  it("retries DNS and transport network failures", async () => {
    const dnsFailure = dependencies();
    dnsFailure.dns.resolve = vi.fn(async () => { throw new Error("DNS unavailable"); });
    await expect(new WebhookHttpDelivery(dnsFailure.dns, dnsFailure.transport).deliver(request)).resolves.toEqual({
      kind: "retry",
      reason: "network",
    });

    const transportFailure = dependencies();
    transportFailure.transport.post = vi.fn(async () => { throw new Error("timeout"); });
    await expect(new WebhookHttpDelivery(transportFailure.dns, transportFailure.transport).deliver(request)).resolves.toEqual({
      kind: "retry",
      reason: "network",
    });
  });

  it("rejects oversized payloads before DNS or transport", async () => {
    const ports = dependencies();
    const delivery = new WebhookHttpDelivery(ports.dns, ports.transport, {
      maxPayloadBytes: 4,
    });
    await expect(delivery.deliver({ ...request, payload: "12345" })).resolves.toEqual({
      kind: "terminal",
      reason: "payload_too_large",
    });
    expect(ports.dns.resolve).not.toHaveBeenCalled();
    expect(ports.transport.post).not.toHaveBeenCalled();
  });
});
