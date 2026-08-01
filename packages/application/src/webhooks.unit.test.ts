import { describe, expect, it } from "vitest";

import {
  MAX_WEBHOOK_ENVELOPE_BYTES,
  WEBHOOK_EVENT_SUBJECT_TYPES,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_SUBJECT_TYPES,
  serializeWebhookEnvelope,
  signWebhook,
  verifyWebhook,
  type WebhookEnvelope,
} from "./webhooks.js";

function event(overrides: Partial<WebhookEnvelope> = {}): WebhookEnvelope {
  return {
    id: "event-1",
    type: "workflow_run.succeeded",
    version: "1",
    occurredAt: "2026-07-31T12:00:00.000Z",
    workspaceId: "workspace-1",
    subjectType: "workflow_run",
    subjectId: "run-1",
    subjectVersion: 2,
    correlationId: "correlation-1",
    data: {},
    ...overrides,
  };
}

describe("webhook event contract", () => {
  it("publishes the stable initial catalog with one compatible subject per event", () => {
    expect(WEBHOOK_EVENT_TYPES).toHaveLength(21);
    expect(new Set(WEBHOOK_EVENT_TYPES).size).toBe(WEBHOOK_EVENT_TYPES.length);
    expect(new Set(Object.keys(WEBHOOK_EVENT_SUBJECT_TYPES))).toEqual(
      new Set(WEBHOOK_EVENT_TYPES)
    );
    expect(
      Object.values(WEBHOOK_EVENT_SUBJECT_TYPES).every((subject) =>
        WEBHOOK_SUBJECT_TYPES.includes(subject)
      )
    ).toBe(true);
  });

  it("serializes a validated compact envelope and preserves signature verification", () => {
    const payload = serializeWebhookEnvelope(
      event({
        causationId: "job-1",
        data: { status: "succeeded", artifact_ids: ["asset-1"] },
      })
    );
    expect(JSON.parse(payload) as unknown).toEqual({
      id: "event-1",
      type: "workflow_run.succeeded",
      version: "1",
      occurred_at: "2026-07-31T12:00:00.000Z",
      workspace_id: "workspace-1",
      subject: { type: "workflow_run", id: "run-1" },
      subject_version: 2,
      correlation_id: "correlation-1",
      causation_id: "job-1",
      data: { status: "succeeded", artifact_ids: ["asset-1"] },
    });
    const timestamp = "2026-07-31T12:00:00.000Z";
    const signature = signWebhook(payload, "old-secret", timestamp);
    expect(
      verifyWebhook({
        payload,
        timestamp,
        signature,
        secrets: ["new-secret", "old-secret"],
        now: new Date(timestamp),
      })
    ).toBe(true);
  });

  it.each([
    ["event subject mismatch", { subjectType: "job" }],
    ["unknown event", { type: "workflow_run.unknown" }],
    ["invalid event ID", { id: "event with spaces" }],
    ["invalid timestamp", { occurredAt: "2026-02-30T12:00:00Z" }],
    ["zero subject version", { subjectVersion: 0 }],
    ["non-object data", { data: [] }],
    ["non-JSON data", { data: { value: undefined } }],
    ["filesystem path", { data: { local_path: "/tmp/output.mp4" } }],
    ["secret", { data: { credentials: { access_token: "hidden" } } }],
  ])("rejects %s", (_name, override) => {
    expect(() =>
      serializeWebhookEnvelope({
        ...event(),
        ...(override as Partial<WebhookEnvelope>),
      })
    ).toThrow();
  });

  it("rejects serialized envelopes above the 64 KiB ceiling", () => {
    expect(() =>
      serializeWebhookEnvelope(
        event({ data: { summary: "x".repeat(MAX_WEBHOOK_ENVELOPE_BYTES) } })
      )
    ).toThrow(/exceeds 65536 bytes/u);
  });
});
