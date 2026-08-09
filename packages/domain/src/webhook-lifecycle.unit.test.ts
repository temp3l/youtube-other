import { describe, expect, it } from "vitest";

import { redactWebhookAuditPayload } from "./webhook-contracts.js";
import {
  buildWebhookTestEnvelope,
  projectWebhookDeliveryRecord,
  projectWebhookEndpointRecord,
  summarizeWebhookEventPayload,
} from "./webhook-lifecycle.js";

const evaluatedAt = "2026-08-09T12:00:00.000Z";

describe("webhook lifecycle", () => {
  it("projects endpoint records without secret material", () => {
    const endpoint = projectWebhookEndpointRecord({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      url: "https://example.com/hooks",
      secretVersion: 2,
      enabled: true,
      eventFilters: ["workflow_run.succeeded"],
      overlapUntil: "2026-08-10T12:00:00.000Z",
      revision: 1,
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
    });
    expect(endpoint).not.toHaveProperty("secret");
    expect(endpoint.overlapUntil).toBe("2026-08-10T12:00:00.000Z");
  });

  it("summarizes delivery payloads without retaining sensitive data fields", () => {
    const delivery = projectWebhookDeliveryRecord({
      workspaceId: "workspace-1",
      deliveryId: "delivery-1",
      endpointId: "endpoint-1",
      eventId: "event-1",
      eventPayload: {
        id: "event-1",
        type: "workflow_run.succeeded",
        occurred_at: evaluatedAt,
        subject: { type: "workflow_run", id: "run-1" },
        subject_version: 3,
        correlation_id: "corr-1",
        data: { status: "succeeded", secret: "hidden" },
      },
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: evaluatedAt,
      revision: 0,
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
    });
    expect(delivery.event).toMatchObject({
      id: "event-1",
      type: "workflow_run.succeeded",
      subjectId: "run-1",
    });
    expect(delivery).not.toHaveProperty("data");
  });

  it("redacts secrets from audit payloads", () => {
    expect(
      redactWebhookAuditPayload({
        endpointId: "endpoint-1",
        secret: "whsec_test",
        signature: "v1=abc",
      })
    ).toEqual({ endpointId: "endpoint-1" });
  });

  it("builds a canonical test envelope", () => {
    const envelope = buildWebhookTestEnvelope({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      occurredAt: evaluatedAt,
    });
    expect(envelope).toMatchObject({
      type: "webhook_endpoint.disabled",
      workspace_id: "workspace-1",
    });
    expect(
      summarizeWebhookEventPayload(envelope).type
    ).toBe("webhook_endpoint.disabled");
  });
});
