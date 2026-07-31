import { describe, expect, it } from "vitest";

import {
  PostgresPublicationReconciliationStore,
  PostgresWorkflowAdmissionPort,
  PostgresWorkflowRepository,
  type PostgresPool,
} from "./postgres-workflow-repository.js";

describe("PostgresWorkflowAdmissionPort", () => {
  it("persists a complete admission atomically and returns the stored replay", async () => {
    const admitted: unknown[] = [];
    const transaction = {
      admitWorkflow: async (input: unknown) => {
        admitted.push(input);
        return { kind: "admitted" as const, commandId: "command-1", response: { workflowRunId: "run-1", jobId: "job-1", revision: 0 } };
      },
    };
    const port = new PostgresWorkflowAdmissionPort({
      repository: {
        withWorkspaceTransaction: async (_workspaceId: string, work: (value: typeof transaction) => Promise<unknown>) => work(transaction),
      } as never,
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      createId: (prefix) => ({ workflow: "run-1", job: "job-1", outbox: "outbox-1", command: "command-1" })[prefix],
    });

    await expect(port.admit({
      execution: { workspace: { id: "workspace-1" }, idempotency: { key: "key-1", fingerprint: "a".repeat(64) } },
      command: "episode-production",
      input: { episodeRevision: 1 },
    })).resolves.toEqual({ workflowRunId: "run-1", jobId: "job-1", revision: 0 });

    expect(admitted).toEqual([expect.objectContaining({
      run: expect.objectContaining({ workspaceId: "workspace-1", runId: "run-1", status: "queued" }),
      job: { jobId: "job-1", runId: "run-1" },
      outbox: expect.objectContaining({ outboxId: "outbox-1", topic: "workflow.queued" }),
    })]);
  });

  it("refuses an adapter call that bypasses application idempotency enforcement", async () => {
    const port = new PostgresWorkflowAdmissionPort({ repository: {} as never });
    await expect(port.admit({ execution: { workspace: { id: "workspace-1" } }, command: "episode-production", input: {} }))
      .rejects.toThrow("idempotency key");
  });

  it("keeps inconclusive provider evidence append-only and resolves only through the guarded transition", async () => {
    const resolved: unknown[] = [];
    const attempts: unknown[] = [];
    const transaction = {
      resolvePublicationReconciliation: async (input: unknown) => { resolved.push(input); },
      recordPublicationReconciliationAttempt: async (input: unknown) => { attempts.push(input); },
    };
    const store = new PostgresPublicationReconciliationStore({
      repository: {
        withWorkspaceTransaction: async (_workspaceId: string, work: (value: typeof transaction) => Promise<unknown>) => work(transaction),
      } as never,
      workspaceId: "workspace-1",
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      createAttemptId: () => "attempt-1",
    });
    await store.recordInconclusive({ publicationId: "publication-1", reason: "multiple_matches" });
    await store.recordResolved({ publicationId: "publication-1", receipt: { providerObjectId: "video-1", recoveryIdentity: "publication-1", evidence: { marker: true } } });
    expect(attempts).toEqual([expect.objectContaining({ attemptId: "attempt-1", reason: "multiple_matches" })]);
    expect(resolved).toEqual([expect.objectContaining({ publicationId: "publication-1", receipt: expect.objectContaining({ providerObjectId: "video-1" }) })]);
  });

  it("rolls back and releases the PostgreSQL connection when reconciliation persistence loses the database", async () => {
    const statements: string[] = [];
    let released = 0;
    const pool: PostgresPool = {
      query: async () => ({ rows: [] }),
      end: async () => undefined,
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          if (sql.includes("INSERT INTO publication_reconciliation_attempts"))
            throw new Error("injected database loss");
          return { rows: [] };
        },
        release: () => { released += 1; },
      }),
    };
    const store = new PostgresPublicationReconciliationStore({
      repository: new PostgresWorkflowRepository(pool),
      workspaceId: "workspace-1",
      createAttemptId: () => "attempt-1",
    });

    await expect(store.recordInconclusive({ publicationId: "publication-1", reason: "provider_unavailable" }))
      .rejects.toThrow("injected database loss");
    expect(statements).toEqual([
      "BEGIN",
      "SELECT set_config('app.workspace_id', $1, true)",
      expect.stringContaining("INSERT INTO publication_reconciliation_attempts"),
      "ROLLBACK",
    ]);
    expect(released).toBe(1);
  });

  it("rolls back a failed PostgreSQL migration and does not leave its connection checked out", async () => {
    const statements: string[] = [];
    let released = 0;
    const pool: PostgresPool = {
      query: async () => ({ rows: [] }),
      end: async () => undefined,
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          if (sql.includes("CREATE TABLE IF NOT EXISTS episodes"))
            throw new Error("injected migration interruption");
          return { rows: [] };
        },
        release: () => { released += 1; },
      }),
    };

    await expect(new PostgresWorkflowRepository(pool).migrate())
      .rejects.toThrow("injected migration interruption");
    expect(statements).toEqual(["BEGIN", expect.stringContaining("CREATE TABLE IF NOT EXISTS episodes"), "ROLLBACK"]);
    expect(released).toBe(1);
  });
});
