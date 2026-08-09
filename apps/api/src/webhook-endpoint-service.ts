import crypto from "node:crypto";

import { internalWebhookSecretHandle } from "@mediaforge/domain";
import type {
  PostgresWebhookRepository,
  PostgresWebhookSigningSecretRepository,
  WebhookEndpointRecord as PersistedWebhookEndpointRecord,
} from "@mediaforge/persistence";

const DEFAULT_OVERLAP_MS = 24 * 60 * 60 * 1_000;

export function generateWebhookSigningSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

export class WebhookEndpointService {
  public constructor(
    private readonly endpoints: PostgresWebhookRepository,
    private readonly secrets: PostgresWebhookSigningSecretRepository,
    private readonly options: {
      readonly now: () => Date;
      readonly createId: (kind: "endpoint" | "delivery") => string;
      readonly overlapMs?: number;
    }
  ) {}

  public async createEndpoint(input: {
    readonly workspaceId: string;
    readonly url: string;
    readonly eventFilters: readonly string[];
  }): Promise<{
    readonly endpoint: PersistedWebhookEndpointRecord;
    readonly secret: string;
  }> {
    await this.secrets.migrate();
    const endpointId = this.options.createId("endpoint");
    const secret = generateWebhookSigningSecret();
    const now = this.options.now().toISOString();
    const endpoint = await this.endpoints.createEndpoint({
      workspaceId: input.workspaceId,
      endpointId,
      url: input.url,
      secretVersion: 1,
      secretHandle: internalWebhookSecretHandle({
        workspaceId: input.workspaceId,
        endpointId,
      }),
      eventFilters: input.eventFilters,
      now,
    });
    await this.secrets.storeSecret({
      workspaceId: input.workspaceId,
      endpointId,
      secretVersion: 1,
      secret,
      now,
    });
    return { endpoint, secret };
  }

  public async rotateSecret(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly expectedRevision: number;
    readonly overlapMs?: number;
  }): Promise<{
    readonly endpoint: PersistedWebhookEndpointRecord;
    readonly secret: string;
  }> {
    const endpoint = await this.endpoints.getEndpoint({
      workspaceId: input.workspaceId,
      endpointId: input.endpointId,
    });
    if (!endpoint) throw new Error("Webhook endpoint could not be found.");
    const secret = generateWebhookSigningSecret();
    const now = this.options.now();
    const overlapMs =
      input.overlapMs ?? this.options.overlapMs ?? DEFAULT_OVERLAP_MS;
    const overlapUntil =
      overlapMs > 0
        ? new Date(now.getTime() + overlapMs).toISOString()
        : undefined;
    if (overlapUntil) {
      await this.secrets.setOverlapUntil({
        workspaceId: input.workspaceId,
        endpointId: input.endpointId,
        secretVersion: endpoint.secretVersion,
        overlapUntil,
      });
    }
    const nextVersion = endpoint.secretVersion + 1;
    await this.secrets.storeSecret({
      workspaceId: input.workspaceId,
      endpointId: input.endpointId,
      secretVersion: nextVersion,
      secret,
      now: now.toISOString(),
    });
    const rotated =
      (await this.endpoints.rotateEndpointSecret({
        workspaceId: input.workspaceId,
        endpointId: input.endpointId,
        expectedRevision: input.expectedRevision,
        secretVersion: nextVersion,
        secretHandle: internalWebhookSecretHandle({
          workspaceId: input.workspaceId,
          endpointId: input.endpointId,
        }),
        now: now.toISOString(),
      })) ?? null;
    if (!rotated) throw new Error("Webhook endpoint revision is stale.");
    return { endpoint: rotated, secret };
  }

  public async resolveOverlapUntil(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly secretVersion: number;
  }): Promise<string | null> {
    return this.secrets.activeOverlapUntil({
      workspaceId: input.workspaceId,
      endpointId: input.endpointId,
      beforeVersion: input.secretVersion,
      evaluatedAt: this.options.now().toISOString(),
    });
  }
}
