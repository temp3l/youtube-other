import { describe, expect, it } from "vitest";

import {
  ApplicationError,
  createApplicationComposition,
  createApplicationExecutionContext,
  resolveNewInstanceAuthority,
  authenticatePilotApiKey,
  hashPilotApiKey,
  serializeWebhookEnvelope,
  signWebhook,
  verifyWebhook,
  UsageAuditLedger,
  transitionPublication,
  assessPilotGate,
  DurableOutboxWorker,
  PublicationReconciliationWorker,
  WorkflowAdmissionHandler,
  type ApplicationPorts,
} from "./index.js";

const context = () =>
  createApplicationExecutionContext({
    context: {
      actor: {
        principalId: "user-1",
        kind: "user",
        permissions: ["workflow:start", "workflow:write"],
      },
      workspace: { id: "workspace-1" },
      authorization: {
        decision: "allowed",
        requiredPermissions: ["workflow:start", "workflow:write"],
      },
      requestId: "req-1",
      correlationId: "cor-1",
      deadlineAt: "2026-07-31T12:00:00.000Z",
      idempotency: { key: "test-key", fingerprint: "a".repeat(64) },
    },
  });

function ports(): ApplicationPorts {
  return {
    workflows: {
      start: async () => ({ workflowRunId: "run-1" }),
      get: async () => null,
    },
    jobs: { enqueue: async () => ({ jobId: "job-1" }) },
    admissions: { admit: async () => ({ workflowRunId: "run-1", jobId: "job-1", revision: 0 }) },
    assets: { find: async () => null },
    approvals: { record: async () => ({ approvalId: "approval-1" }) },
    providers: [{ name: "fixture" }],
    renderer: { request: async () => undefined },
    publisher: { request: async () => undefined },
    audit: { append: async () => undefined },
    usage: { record: async () => undefined },
    clock: { now: () => new Date("2026-07-31T12:00:00.000Z") },
    ids: { create: (prefix) => `${prefix}-1` },
    idempotency: { replay: async () => null },
  };
}

describe("application contracts", () => {
  it("rejects path, argv, and provider-shaped request context fields", () => {
    expect(() =>
      createApplicationExecutionContext({
        context: {
          ...context(),
          path: "/workspace/episode",
          argv: ["publish"],
          provider: {},
        },
      })
    ).toThrow();
  });

  it("constructs the same selected handlers for adapters and tests", async () => {
    const sharedPorts = ports();
    const handlers = {
      startWorkflow: {
        execute: async (
          _command: unknown,
          execution: ReturnType<typeof context>
        ) =>
          sharedPorts.workflows.start({
            execution,
            command: "episode-production",
            input: {},
          }),
      },
      getWorkflow: { execute: async () => ({ workflowRunId: "run-1" }) },
      recordApproval: { execute: async () => ({ approvalId: "approval-1" }) },
    };
    const cliComposition = createApplicationComposition({
      ports: sharedPorts,
      handlers,
    });
    const testComposition = createApplicationComposition({
      ports: sharedPorts,
      handlers,
    });

    expect(cliComposition.handlers.startWorkflow).toBe(
      testComposition.handlers.startWorkflow
    );
    await expect(
      cliComposition.handlers.startWorkflow.execute({}, context())
    ).resolves.toEqual({ workflowRunId: "run-1" });
  });

  it("uses stable errors independent of transport formatting", () => {
    const error = new ApplicationError(
      "idempotency_key_conflict",
      "The command key belongs to a different request.",
      false
    );
    expect(error).toMatchObject({
      code: "idempotency_key_conflict",
      retryable: false,
    });
  });

  it("uses database authority by default and bounds legacy rollback", () => {
    expect(
      resolveNewInstanceAuthority({ rollbackWindowActive: true })
    ).toMatchObject({ authority: "database-v1" });
    expect(
      resolveNewInstanceAuthority({
        rollbackToFilesystem: true,
        rollbackWindowActive: true,
      })
    ).toMatchObject({ authority: "filesystem-legacy" });
    expect(() =>
      resolveNewInstanceAuthority({
        rollbackToFilesystem: true,
        rollbackWindowActive: false,
      })
    ).toThrow(/no longer available/u);
  });

  it("accepts only active tenant-scoped pilot keys", () => {
    const key = "mfk_test-secret";
    expect(authenticatePilotApiKey({ token: key, now: new Date("2026-07-31T12:00:00Z"), records: [{ id: "key-1", secretHash: hashPilotApiKey(key), workspaceId: "workspace-1", permissions: ["projects:read"], expiresAt: "2026-08-01T00:00:00Z" }] })).toMatchObject({ workspaceId: "workspace-1" });
    expect(authenticatePilotApiKey({ token: key, now: new Date("2026-08-02T12:00:00Z"), records: [{ id: "key-1", secretHash: hashPilotApiKey(key), workspaceId: "workspace-1", permissions: [], expiresAt: "2026-08-01T00:00:00Z" }] })).toBeNull();
  });

  it("signs a versioned webhook envelope and supports rotation overlap", () => {
    const payload = serializeWebhookEnvelope({ id: "event-1", type: "workflow.succeeded", occurredAt: "2026-07-31T12:00:00.000Z", workspaceId: "workspace-1", subjectId: "run-1", subjectVersion: 2, correlationId: "correlation-1", data: {} });
    const timestamp = "2026-07-31T12:00:00.000Z";
    const signature = signWebhook(payload, "old-secret", timestamp);
    expect(verifyWebhook({ payload, timestamp, signature, secrets: ["new-secret", "old-secret"], now: new Date(timestamp) })).toBe(true);
    expect(verifyWebhook({ payload, timestamp, signature, secrets: ["new-secret"], now: new Date(timestamp) })).toBe(false);
  });

  it("fails closed on budget caps and retains immutable audit facts", () => {
    const ledger = new UsageAuditLedger();
    ledger.append({ id: "audit-1", workspaceId: "workspace-1", action: "workflow.admitted", subjectId: "run-1", correlationId: "cor-1", occurredAt: "2026-07-31T12:00:00Z" });
    ledger.reserve({ id: "reserve-1", workspaceId: "workspace-1", amount: 3 }, 5);
    expect(() => ledger.reserve({ id: "reserve-2", workspaceId: "workspace-1", amount: 3 }, 5)).toThrow(/quota/u);
    expect(ledger.audit("workspace-1")).toEqual([expect.objectContaining({ action: "workflow.admitted" })]);
  });

  it("requires reconciliation instead of retrying an uncertain publication", () => {
    const executing = transitionPublication({ id: "publication-1", approvalRevision: 1, credentialVersion: "credential-1", assetHash: "a".repeat(64), state: "pending" }, "executing");
    const uncertain = transitionPublication(executing, "reconciliation_required");
    expect(() => transitionPublication(uncertain, "executing")).toThrow(/transition/u);
    expect(transitionPublication(uncertain, "published")).toMatchObject({ state: "published" });
  });

  it("binds exactly one publication receipt and never uploads during reconciliation", async () => {
    const writes: unknown[] = [];
    const worker = new PublicationReconciliationWorker({
      findByRecoveryIdentity: async () => [{ providerObjectId: "video-1", recoveryIdentity: "intent-1", evidence: { marker: "intent-1" } }],
    }, {
      recordResolved: async (input) => { writes.push(input); },
      recordInconclusive: async (input) => { writes.push(input); },
    });
    await expect(worker.reconcile({ id: "publication-1", approvalRevision: 1, credentialVersion: "credential-1", assetHash: "a".repeat(64), state: "reconciliation_required" })).resolves.toMatchObject({ kind: "published", receipt: { providerObjectId: "video-1" } });
    expect(writes).toEqual([expect.objectContaining({ publicationId: "publication-1", receipt: expect.objectContaining({ providerObjectId: "video-1" }) })]);
  });

  it("keeps zero or multiple provider matches in operator reconciliation", async () => {
    const reasons: string[] = [];
    const worker = new PublicationReconciliationWorker({ findByRecoveryIdentity: async () => [] }, {
      recordResolved: async () => undefined,
      recordInconclusive: async (input) => { reasons.push(input.reason); },
    });
    await expect(worker.reconcile({ id: "publication-1", approvalRevision: 1, credentialVersion: "credential-1", assetHash: "a".repeat(64), state: "reconciliation_required" })).resolves.toEqual({ kind: "reconciliation_required", reason: "no_match" });
    expect(reasons).toEqual(["no_match"]);
  });

  it("keeps release scope internal until every pilot evidence cell passes", () => {
    expect(assessPilotGate({ educationProviderFree: true, controlledProviderSmoke: false, tenantIsolation: true, objectStorage: true, webhooks: true, quotasAndAudit: true, publicationReconciliation: true, operationalRunbooks: true })).toEqual({ eligible: false, missing: ["controlledProviderSmoke"] });
  });

  it("delivers durable outbox events with an immutable consumer deduplication ID", async () => {
    const calls: string[] = [];
    const worker = new DurableOutboxWorker({
      claimNextOutbox: async () => ({ workspaceId: "workspace-1", outboxId: "event-1", topic: "workflow.queued", payload: { runId: "run-1" }, leaseFence: 2, leaseOwner: "worker-1", attemptCount: 1 }),
      markOutboxDelivered: async (input) => { calls.push(`ack:${input.outboxId}:${input.leaseFence}`); return true; },
      rescheduleOutbox: async () => "rescheduled",
    }, { dispatch: async (event) => { calls.push(`send:${event.id}:${event.attempt}`); } }, {
      workerId: "worker-1", leaseSeconds: 30, maxAttempts: 3,
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      retryAt: (_attempt, now) => new Date(now.getTime() + 1_000),
    });
    await expect(worker.dispatchOne("workspace-1")).resolves.toEqual({ kind: "delivered", outboxId: "event-1" });
    expect(calls).toEqual(["send:event-1:1", "ack:event-1:2"]);
  });

  it("uses one authorized, idempotent handler for connected workflow admission", async () => {
    const admitted: unknown[] = [];
    const handler = new WorkflowAdmissionHandler({ admit: async (input) => { admitted.push(input); return { workflowRunId: "run-1", jobId: "job-1", revision: 0 }; } });
    await expect(handler.execute({ template: "episode-production", episodeRevision: 1, locales: ["en"], variants: ["full"], approvalMode: "required", publicationMode: "none" }, context())).resolves.toEqual({ workflowRunId: "run-1", jobId: "job-1", revision: 0 });
    expect(admitted).toEqual([expect.objectContaining({ command: "episode-production", execution: expect.objectContaining({ workspace: { id: "workspace-1" } }) })]);
  });

  it("retains failed outbox delivery for bounded retry or dead-letter handling", async () => {
    const worker = new DurableOutboxWorker({
      claimNextOutbox: async () => ({ workspaceId: "workspace-1", outboxId: "event-1", topic: "workflow.queued", payload: {}, leaseFence: 1, leaseOwner: "worker-1", attemptCount: 3 }),
      markOutboxDelivered: async () => true,
      rescheduleOutbox: async (input) => {
        expect(input.error).toBe("receiver offline");
        expect(input.maxAttempts).toBe(3);
        return "dead_letter";
      },
    }, { dispatch: async () => { throw new Error("receiver offline"); } }, {
      workerId: "worker-1", leaseSeconds: 30, maxAttempts: 3,
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      retryAt: (_attempt, now) => now,
    });
    await expect(worker.dispatchOne("workspace-1")).resolves.toEqual({ kind: "dead_letter", outboxId: "event-1" });
  });
});
