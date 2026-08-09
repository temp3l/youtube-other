import crypto from "node:crypto";

import {
  ApplicationError,
  WebhookHttpDelivery,
  serializeWebhookEnvelope,
  type AuthenticatedPrincipal,
} from "@mediaforge/application";
import {
  assertWebhookManageAccess,
  buildWebhookEndpointCreateResult,
  buildWebhookSecretRotateResult,
  buildWebhookTestEnvelope,
  buildWebhookTestResult,
  projectWebhookDeliveryAttempt,
  projectWebhookDeliveryRecord,
  projectWebhookEndpointRecord,
  webhookEndpointCreateInputSchema,
  webhookEndpointUpdateInputSchema,
  webhookSecretRotateInputSchema,
} from "@mediaforge/domain";
import {
  PostgresWebhookRepository,
  PostgresWebhookSigningSecretRepository,
  type PostgresPool,
} from "@mediaforge/persistence";

import {
  NodeWebhookDnsResolver,
  NodeWebhookHttpTransport,
} from "./node-webhook-delivery.js";
import type { ApiRequestContext } from "./http-server.js";
import { WebhookEndpointService } from "./webhook-endpoint-service.js";

function encodeDeliveryCursor(
  value: {
    readonly workspaceId: string;
    readonly collection: "webhook-deliveries";
    readonly createdAt: string;
    readonly id: string;
  },
  secret: string
): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function decodeDeliveryCursor(
  after: string | undefined,
  workspaceId: string,
  secret: string
): { readonly createdAt: string; readonly deliveryId: string } | undefined {
  if (!after) return undefined;
  const [payload, signature, extra] = after.split(".");
  if (!payload || !signature || extra !== undefined)
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    supplied.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(supplied, expectedSignature)
  )
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    workspaceId?: string;
    collection?: string;
    createdAt?: string;
    id?: string;
  };
  if (
    parsed.workspaceId !== workspaceId ||
    parsed.collection !== "webhook-deliveries" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.id !== "string"
  )
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  return { createdAt: parsed.createdAt, deliveryId: parsed.id };
}

async function toEndpointRecord(
  service: WebhookEndpointService,
  record: NonNullable<Awaited<ReturnType<PostgresWebhookRepository["getEndpoint"]>>>
) {
  const overlapUntil = await service.resolveOverlapUntil({
    workspaceId: record.workspaceId,
    endpointId: record.endpointId,
    secretVersion: record.secretVersion,
  });
  return projectWebhookEndpointRecord({
    workspaceId: record.workspaceId,
    endpointId: record.endpointId,
    url: record.url,
    secretVersion: record.secretVersion,
    enabled: record.enabled,
    eventFilters: record.eventFilters,
    overlapUntil,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function createApiWebhookUseCases(input: {
  readonly pool: PostgresPool;
  readonly cursorSecret: string;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}) {
  if (Buffer.byteLength(input.cursorSecret, "utf8") < 32)
    throw new Error("Webhook API cursor signing secret must contain at least 32 bytes.");
  const endpoints = new PostgresWebhookRepository(input.pool);
  const secrets = new PostgresWebhookSigningSecretRepository(
    input.pool,
    input.cursorSecret
  );
  const now = input.now ?? (() => new Date());
  const createId =
    input.createId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID()}`);
  const service = new WebhookEndpointService(endpoints, secrets, {
    now,
    createId: (kind) =>
      createId(kind === "endpoint" ? "webhook-endpoint" : "webhook-delivery"),
  });
  const testDelivery = new WebhookHttpDelivery(
    new NodeWebhookDnsResolver(),
    new NodeWebhookHttpTransport()
  );

  function assertManage(principal: AuthenticatedPrincipal): void {
    try {
      assertWebhookManageAccess(principal.permissions);
    } catch {
      throw new ApplicationError(
        "authorization_denied",
        "Webhook administration requires webhook.manage.",
        false
      );
    }
  }

  return {
    createWebhookEndpoint: async (
      body: unknown,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertManage(context.principal);
      const parsed = webhookEndpointCreateInputSchema.parse(body);
      const created = await service.createEndpoint({
        workspaceId: context.workspaceId,
        url: parsed.url,
        eventFilters: parsed.eventFilters,
      });
      return buildWebhookEndpointCreateResult({
        endpoint: await toEndpointRecord(service, created.endpoint),
        secret: created.secret,
      });
    },
    listWebhookEndpoints: async (
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertManage(context.principal);
      const records = await endpoints.listEndpoints({
        workspaceId: context.workspaceId,
        includeDisabled: true,
      });
      return {
        items: await Promise.all(
          records.map((record) => toEndpointRecord(service, record))
        ),
      };
    },
    getWebhookEndpoint: async (
      endpointId: string,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertManage(context.principal);
      const record = await endpoints.getEndpoint({
        workspaceId: context.workspaceId,
        endpointId,
      });
      if (!record)
        throw new ApplicationError("not_found", "Resource not found.", false);
      return toEndpointRecord(service, record);
    },
    updateWebhookEndpoint: async (
      endpointId: string,
      body: unknown,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "ifMatch">
      >
    ) => {
      assertManage(context.principal);
      const parsed = webhookEndpointUpdateInputSchema.parse(body);
      const expectedRevision = Number(String(context.ifMatch).replace(/"/g, ""));
      const updated =
        (await endpoints.updateEndpoint({
          workspaceId: context.workspaceId,
          endpointId,
          expectedRevision,
          url: parsed.url,
          eventFilters: parsed.eventFilters,
          enabled: parsed.enabled,
          now: now().toISOString(),
        })) ?? null;
      if (!updated)
        throw new ApplicationError(
          "precondition_failed",
          "Webhook endpoint is missing or stale.",
          false
        );
      return toEndpointRecord(service, updated);
    },
    rotateWebhookEndpointSecret: async (
      endpointId: string,
      body: unknown,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "ifMatch">
      >
    ) => {
      assertManage(context.principal);
      const parsed = webhookSecretRotateInputSchema.parse(body ?? {});
      const expectedRevision = Number(String(context.ifMatch).replace(/"/g, ""));
      try {
        const rotated = await service.rotateSecret({
          workspaceId: context.workspaceId,
          endpointId,
          expectedRevision,
          ...(parsed.overlapMs !== undefined ? { overlapMs: parsed.overlapMs } : {}),
        });
        return buildWebhookSecretRotateResult({
          endpoint: await toEndpointRecord(service, rotated.endpoint),
          secret: rotated.secret,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("stale"))
          throw new ApplicationError(
            "precondition_failed",
            "Webhook endpoint is missing or stale.",
            false
          );
        throw error;
      }
    },
    testWebhookEndpoint: async (
      endpointId: string,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertManage(context.principal);
      const endpoint = await endpoints.getEndpoint({
        workspaceId: context.workspaceId,
        endpointId,
      });
      if (!endpoint)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const secret = await secrets.resolveSecret({
        workspaceId: context.workspaceId,
        endpointId,
        secretVersion: endpoint.secretVersion,
      });
      if (!secret)
        throw new ApplicationError(
          "upstream_unavailable",
          "Webhook signing secret is unavailable.",
          false
        );
      const occurredAt = now().toISOString();
      const envelope = buildWebhookTestEnvelope({
        workspaceId: context.workspaceId,
        endpointId,
        occurredAt,
      });
      const payload = serializeWebhookEnvelope({
        id: String(envelope["id"]),
        type: "webhook_endpoint.disabled",
        version: "1",
        occurredAt,
        workspaceId: context.workspaceId,
        subjectType: "webhook_endpoint",
        subjectId: endpointId,
        subjectVersion: 1,
        correlationId: String(envelope["correlation_id"]),
        data: { test: true },
      });
      const result = await testDelivery.deliver({
        endpointUrl: endpoint.url,
        eventId: String(envelope["id"]),
        payload,
        timestamp: occurredAt,
        attempt: 1,
        secret,
      });
      if (result.kind === "delivered")
        return buildWebhookTestResult({
          delivered: true,
          responseStatus: result.status,
        });
      return buildWebhookTestResult({
        delivered: false,
        ...(result.status !== undefined ? { responseStatus: result.status } : {}),
        error:
          result.kind === "terminal"
            ? result.reason
            : result.reason === "http_status"
              ? `HTTP ${result.status ?? "error"}`
              : result.reason,
      });
    },
    listWebhookDeliveries: async (
      endpointId: string | undefined,
      after: string | undefined,
      size: number,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertManage(context.principal);
      const cursor = decodeDeliveryCursor(
        after,
        context.workspaceId,
        input.cursorSecret
      );
      const records = await endpoints.listDeliveries({
        workspaceId: context.workspaceId,
        ...(endpointId ? { endpointId } : {}),
        ...(cursor
          ? {
              after: {
                createdAt: cursor.createdAt,
                deliveryId: cursor.deliveryId,
              },
            }
          : {}),
        size: size + 1,
      });
      const page = records.slice(0, size);
      const last = page.at(-1);
      return {
        items: page.map((record) =>
          projectWebhookDeliveryRecord({
            workspaceId: record.workspaceId,
            deliveryId: record.deliveryId,
            endpointId: record.endpointId,
            eventId: record.eventId,
            eventPayload: record.eventPayload,
            state: record.state,
            attemptCount: record.attemptCount,
            nextAttemptAt: record.nextAttemptAt,
            deliveredAt: record.deliveredAt,
            deadLetteredAt: record.deadLetteredAt,
            lastStatus: record.lastStatus,
            lastError: record.lastError,
            replayOfDeliveryId: record.replayOfDeliveryId,
            revision: record.revision,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          })
        ),
        ...(records.length > size && last
          ? {
              nextAfter: encodeDeliveryCursor(
                {
                  workspaceId: context.workspaceId,
                  collection: "webhook-deliveries",
                  createdAt: last.createdAt,
                  id: last.deliveryId,
                },
                input.cursorSecret
              ),
            }
          : {}),
      };
    },
    listWebhookDeliveryAttempts: async (
      deliveryId: string,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertManage(context.principal);
      const attempts = await endpoints.listDeliveryAttempts({
        workspaceId: context.workspaceId,
        deliveryId,
      });
      return {
        items: attempts.map((attempt) =>
          projectWebhookDeliveryAttempt({
            attemptNumber: attempt.attemptNumber,
            outcome: attempt.outcome,
            responseStatus: attempt.responseStatus,
            error: attempt.error,
            attemptedAt: attempt.attemptedAt,
          })
        ),
      };
    },
    resendWebhookDelivery: async (
      deliveryId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "ifMatch">
      >
    ) => {
      assertManage(context.principal);
      const expectedRevision = Number(String(context.ifMatch).replace(/"/g, ""));
      const replayed = await endpoints.replay({
        workspaceId: context.workspaceId,
        sourceDeliveryId: deliveryId,
        expectedRevision,
        newDeliveryId: createId("webhook-delivery"),
        now: now().toISOString(),
      });
      return projectWebhookDeliveryRecord({
        workspaceId: replayed.workspaceId,
        deliveryId: replayed.deliveryId,
        endpointId: replayed.endpointId,
        eventId: replayed.eventId,
        eventPayload: replayed.eventPayload,
        state: replayed.state,
        attemptCount: replayed.attemptCount,
        nextAttemptAt: replayed.nextAttemptAt,
        deliveredAt: replayed.deliveredAt,
        deadLetteredAt: replayed.deadLetteredAt,
        lastStatus: replayed.lastStatus,
        lastError: replayed.lastError,
        replayOfDeliveryId: replayed.replayOfDeliveryId,
        revision: replayed.revision,
        createdAt: replayed.createdAt,
        updatedAt: replayed.updatedAt,
      });
    },
  };
}
