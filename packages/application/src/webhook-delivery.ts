import net from "node:net";

import { signWebhook } from "./webhooks.js";

const MAX_PAYLOAD_BYTES = 1_048_576;
const MAX_TIMEOUT_MS = 10_000;

export interface WebhookDnsResolver {
  resolve(hostname: string): Promise<readonly string[]>;
}

export interface WebhookHttpTransport {
  post(input: {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly timeoutMs: number;
    /** The transport must connect only to one of these prevalidated addresses. */
    readonly approvedAddresses: readonly string[];
    readonly followRedirects: false;
  }): Promise<{ readonly status: number }>;
}

export interface WebhookDeliveryRequest {
  readonly endpointUrl: string;
  readonly eventId: string;
  readonly payload: string;
  readonly timestamp: string;
  readonly attempt: number;
  readonly secret: string;
}

export type WebhookDeliveryResult =
  | { readonly kind: "delivered"; readonly status: number }
  | {
      readonly kind: "retry";
      readonly reason: "network" | "http_status";
      readonly status?: number;
    }
  | {
      readonly kind: "terminal";
      readonly reason:
        | "invalid_endpoint"
        | "unsafe_endpoint"
        | "payload_too_large"
        | "http_status";
      readonly status?: number;
    };

function ipv4Bytes(address: string): readonly number[] {
  return address.split(".").map(Number);
}

function isUnsafeIpv4(address: string): boolean {
  const [first = 0, second = 0] = ipv4Bytes(address);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first >= 224 && first <= 239) ||
    first >= 240
  );
}

function ipv6Words(address: string): readonly number[] {
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const bytes = ipv4Bytes(normalized.slice(separator + 1));
    normalized = `${normalized.slice(0, separator)}:${((bytes[0] ?? 0) << 8 | (bytes[1] ?? 0)).toString(16)}:${((bytes[2] ?? 0) << 8 | (bytes[3] ?? 0)).toString(16)}`;
  }
  const compressed = normalized.indexOf("::");
  if (compressed < 0) return normalized.split(":").map((word) => Number.parseInt(word, 16));
  const left = normalized.slice(0, compressed).split(":").filter(Boolean);
  const right = normalized.slice(compressed + 2).split(":").filter(Boolean);
  return [
    ...left.map((word) => Number.parseInt(word, 16)),
    ...Array.from({ length: 8 - left.length - right.length }, () => 0),
    ...right.map((word) => Number.parseInt(word, 16)),
  ];
}

function isUnsafeIpv6(address: string): boolean {
  const words = ipv6Words(address);
  const [first = 0] = words;
  const unspecified = words.every((word) => word === 0);
  const loopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const uniqueLocal = (first & 0xfe00) === 0xfc00;
  const linkLocal = (first & 0xffc0) === 0xfe80;
  const multicast = (first & 0xff00) === 0xff00;
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (ipv4Mapped) {
    const high = words[6] ?? 0;
    const low = words[7] ?? 0;
    return isUnsafeIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }
  return unspecified || loopback || uniqueLocal || linkLocal || multicast;
}

function isUnsafeAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isUnsafeIpv4(address);
  if (version === 6) return isUnsafeIpv6(address);
  return true;
}

function hostname(url: URL): string {
  return url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
}

export class WebhookHttpDelivery {
  private readonly maxPayloadBytes: number;
  private readonly timeoutMs: number;

  public constructor(
    private readonly dns: WebhookDnsResolver,
    private readonly transport: WebhookHttpTransport,
    options: {
      readonly maxPayloadBytes?: number;
      readonly timeoutMs?: number;
    } = {}
  ) {
    this.maxPayloadBytes = options.maxPayloadBytes ?? 256 * 1024;
    this.timeoutMs = options.timeoutMs ?? MAX_TIMEOUT_MS;
    if (!Number.isInteger(this.maxPayloadBytes) || this.maxPayloadBytes < 1 || this.maxPayloadBytes > MAX_PAYLOAD_BYTES)
      throw new Error(`Webhook payload limit must be between 1 and ${MAX_PAYLOAD_BYTES} bytes.`);
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > MAX_TIMEOUT_MS)
      throw new Error(`Webhook timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds.`);
  }

  public async deliver(input: WebhookDeliveryRequest): Promise<WebhookDeliveryResult> {
    if (Buffer.byteLength(input.payload, "utf8") > this.maxPayloadBytes)
      return { kind: "terminal", reason: "payload_too_large" };
    if (!Number.isSafeInteger(input.attempt) || input.attempt < 1 || input.eventId.length === 0 || input.secret.length === 0)
      return { kind: "terminal", reason: "invalid_endpoint" };

    let endpoint: URL;
    try {
      endpoint = new URL(input.endpointUrl);
    } catch {
      return { kind: "terminal", reason: "invalid_endpoint" };
    }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash)
      return { kind: "terminal", reason: "invalid_endpoint" };

    const targetHostname = hostname(endpoint);
    let addresses: readonly string[];
    try {
      addresses = net.isIP(targetHostname) ? [targetHostname] : await this.dns.resolve(targetHostname);
    } catch {
      return { kind: "retry", reason: "network" };
    }
    if (addresses.length === 0 || addresses.some(isUnsafeAddress))
      return { kind: "terminal", reason: "unsafe_endpoint" };

    const headers = Object.freeze({
      "Content-Type": "application/json",
      "Webhook-Id": input.eventId,
      "Webhook-Timestamp": input.timestamp,
      "Webhook-Signature": signWebhook(input.payload, input.secret, input.timestamp),
      "Webhook-Attempt": String(input.attempt),
    });
    try {
      const response = await this.transport.post({
        url: endpoint.toString(),
        headers,
        body: input.payload,
        timeoutMs: this.timeoutMs,
        approvedAddresses: addresses,
        followRedirects: false,
      });
      if (response.status >= 200 && response.status < 300)
        return { kind: "delivered", status: response.status };
      if (response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500)
        return { kind: "retry", reason: "http_status", status: response.status };
      return { kind: "terminal", reason: "http_status", status: response.status };
    } catch {
      return { kind: "retry", reason: "network" };
    }
  }
}
