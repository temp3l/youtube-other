import dns from "node:dns/promises";
import type { ClientRequest, IncomingMessage } from "node:http";
import https, { type RequestOptions } from "node:https";
import net from "node:net";

import type {
  WebhookDnsResolver,
  WebhookHttpTransport,
} from "@mediaforge/application";

interface DnsPort {
  resolve4(hostname: string): Promise<readonly string[]>;
  resolve6(hostname: string): Promise<readonly string[]>;
}

type HttpsRequest = (
  options: RequestOptions,
  response: (message: IncomingMessage) => void
) => ClientRequest;

type TimerHandle = ReturnType<typeof setTimeout>;

export class NodeWebhookDnsResolver implements WebhookDnsResolver {
  public constructor(private readonly resolver: DnsPort = dns) {}

  public async resolve(hostname: string): Promise<readonly string[]> {
    const [ipv4, ipv6] = await Promise.allSettled([
      this.resolver.resolve4(hostname),
      this.resolver.resolve6(hostname),
    ]);
    if (ipv4.status === "rejected" && ipv6.status === "rejected") throw ipv4.reason;
    return [...new Set([
      ...(ipv4.status === "fulfilled" ? ipv4.value : []),
      ...(ipv6.status === "fulfilled" ? ipv6.value : []),
    ])];
  }
}

function pinnedLookup(addresses: readonly string[]): NonNullable<RequestOptions["lookup"]> {
  const address = addresses[0];
  const family = address ? net.isIP(address) : 0;
  if (!address || family === 0) throw new Error("Webhook transport requires a validated IP address.");
  const lookup = (
    _hostname: string,
    _options: unknown,
    callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
  ): void => callback(null, address, family);
  return lookup as unknown as NonNullable<RequestOptions["lookup"]>;
}

/** Native HTTPS does not follow redirects; every connection is pinned to a prevalidated DNS answer. */
export class NodeWebhookHttpTransport implements WebhookHttpTransport {
  private readonly maxResponseBytes: number;

  public constructor(
    private readonly request: HttpsRequest = https.request,
    options: {
      readonly maxResponseBytes?: number;
      readonly setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
      readonly clearTimer?: (handle: TimerHandle) => void;
    } = {}
  ) {
    this.maxResponseBytes = options.maxResponseBytes ?? 64 * 1024;
    if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes < 1 || this.maxResponseBytes > 1_048_576)
      throw new Error("Webhook response limit must be between 1 byte and 1 MiB.");
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  private readonly setTimer: (callback: () => void, milliseconds: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  public post(input: {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly timeoutMs: number;
    readonly approvedAddresses: readonly string[];
    readonly followRedirects: false;
  }): Promise<{ readonly status: number }> {
    return new Promise((resolve, reject) => {
      let target: URL;
      try {
        target = new URL(input.url);
        if (target.protocol !== "https:" || input.followRedirects !== false)
          throw new Error("Webhook transport accepts only non-redirecting HTTPS requests.");
      } catch (error) {
        reject(error);
        return;
      }

      let lookup: NonNullable<RequestOptions["lookup"]>;
      try {
        lookup = pinnedLookup(input.approvedAddresses);
      } catch (error) {
        reject(error);
        return;
      }

      let settled = false;
      let timer: TimerHandle | undefined;
      let clientRequest: ClientRequest | undefined;
      const finish = (error: Error | null, status?: number): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) this.clearTimer(timer);
        if (error) reject(error);
        else if (status === undefined) reject(new Error("Webhook response did not include a status."));
        else resolve({ status });
      };

      const onResponse = (response: IncomingMessage): void => {
        let received = 0;
        response.on("data", (chunk: unknown) => {
          received += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
          if (received > this.maxResponseBytes) {
            const error = new Error("Webhook response exceeded the configured byte limit.");
            response.destroy(error);
            clientRequest?.destroy(error);
            finish(error);
          }
        });
        response.once("error", (error) => finish(error));
        response.once("aborted", () => finish(new Error("Webhook response was aborted.")));
        response.once("end", () => {
          const status = response.statusCode;
          if (!Number.isInteger(status) || status === undefined || status < 100 || status > 599)
            finish(new Error("Webhook response status is invalid."));
          else finish(null, status);
        });
      };

      try {
        clientRequest = this.request({
          protocol: "https:",
          hostname: target.hostname,
          port: target.port || undefined,
          path: `${target.pathname}${target.search}`,
          method: "POST",
          servername: target.hostname,
          lookup,
          headers: {
            ...input.headers,
            Host: target.host,
            "Content-Length": Buffer.byteLength(input.body, "utf8"),
          },
        }, onResponse);
        clientRequest.once("error", (error) => finish(error));
        const timeout = (): void => {
          const error = new Error("Webhook request timed out.");
          clientRequest?.destroy(error);
          finish(error);
        };
        clientRequest.setTimeout(input.timeoutMs, timeout);
        timer = this.setTimer(timeout, input.timeoutMs);
        clientRequest.end(input.body);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Webhook request failed."));
      }
    });
  }
}
