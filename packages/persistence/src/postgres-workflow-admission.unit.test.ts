import { describe, expect, it } from "vitest";

import {
  PostgresPublicationReconciliationStore,
  PostgresWorkflowAdmissionPort,
  PostgresWorkflowRepository,
  WorkspaceTransactionRepository,
  type PostgresPool,
} from "./postgres-workflow-repository.js";

const execution = {
  input: { episodeRevision: 1 },
  configurationVersion: "config-r1",
  promptVersion: "prompt-r1",
  providerSelection: "fixture",
  rendererVersion: "renderer-r1",
  presetVersion: "preset-r1",
  buildVersion: null,
  assetHashes: [],
  taskGraphVersion: "workflow-r1",
};

function workflowRow(status = "queued", revision = 0) {
  return {
    workspace_id: "workspace-1",
    run_id: "run-1",
    status,
    authority: "database-v1",
    revision,
    execution_spec: execution,
    supersedes_run_id: null,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
  };
}

describe("PostgresWorkflowAdmissionPort", () => {
  it("persists a complete admission atomically and returns the stored replay", async () => {
    const admitted: unknown[] = [];
    const transaction = {
      admitWorkflow: async (input: unknown) => {
        admitted.push(input);
        return {
          kind: "admitted" as const,
          commandId: "command-1",
          response: { workflowRunId: "run-1", jobId: "job-1", revision: 0 },
        };
      },
    };
    const port = new PostgresWorkflowAdmissionPort({
      repository: {
        withWorkspaceTransaction: async (
          _workspaceId: string,
          work: (value: typeof transaction) => Promise<unknown>
        ) => work(transaction),
      } as never,
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      createId: (prefix) =>
        ({
          workflow: "run-1",
          job: "job-1",
          outbox: "outbox-1",
          command: "command-1",
        })[prefix],
    });

    await expect(
      port.admit({
        execution: {
          workspace: { id: "workspace-1" },
          idempotency: { key: "key-1", fingerprint: "a".repeat(64) },
        },
        command: "episode-production",
        input: { episodeRevision: 1 },
      })
    ).resolves.toEqual({ workflowRunId: "run-1", jobId: "job-1", revision: 0 });

    expect(admitted).toEqual([
      expect.objectContaining({
        run: expect.objectContaining({
          workspaceId: "workspace-1",
          runId: "run-1",
          status: "queued",
        }),
        job: { jobId: "job-1", runId: "run-1" },
        outbox: expect.objectContaining({
          outboxId: "outbox-1",
          topic: "workflow.queued",
        }),
      }),
    ]);
  });

  it("refuses an adapter call that bypasses application idempotency enforcement", async () => {
    const port = new PostgresWorkflowAdmissionPort({ repository: {} as never });
    await expect(
      port.admit({
        execution: { workspace: { id: "workspace-1" } },
        command: "episode-production",
        input: {},
      })
    ).rejects.toThrow("idempotency key");
  });

  it("loads a workflow only through its tenant-local durable job binding", async () => {
    const queries: Array<{
      readonly sql: string;
      readonly values?: readonly unknown[];
    }> = [];
    const transaction = new WorkspaceTransactionRepository({
      query: async <T>(sql: string, values?: readonly unknown[]) => {
        queries.push({ sql, values });
        return { rows: [workflowRow() as T], rowCount: 1 };
      },
    });
    await expect(
      transaction.getForJob("workspace-1", "run-1", "job-1")
    ).resolves.toMatchObject({ workspaceId: "workspace-1", runId: "run-1" });
    expect(queries[0]?.sql).toContain("INNER JOIN jobs AS job");
    expect(queries[0]?.sql).toContain(
      "job.workspace_id = run.workspace_id AND job.run_id = run.run_id"
    );
    expect(queries[0]?.sql).toContain("job.job_id = $3");
    expect(queries[0]?.values).toEqual(["workspace-1", "run-1", "job-1"]);
  });

  it("reserves configured workflow concurrency in the admission transaction and bypasses it on replay", async () => {
    const queries: string[] = [];
    const transaction = new WorkspaceTransactionRepository({
      query: async <T>(sql: string) => {
        queries.push(sql);
        if (sql.includes("INSERT INTO command_admissions"))
          return {
            rows: [
              {
                command_id: "command-1",
                response: {
                  workflowRunId: "run-1",
                  jobId: "job-1",
                  revision: 0,
                },
              } as T,
            ],
            rowCount: 1,
          };
        if (sql.includes("FROM quota_dimension_policies"))
          return { rows: [{ limit_units: "2", revision: 0 } as T] };
        if (
          sql.includes("FROM quota_dimension_reservations") &&
          sql.includes("attribution_key")
        )
          return { rows: [] };
        if (sql.includes("AS committed_units"))
          return { rows: [{ committed_units: "0" } as T] };
        if (sql.includes("INSERT INTO quota_dimension_reservations"))
          return {
            rows: [
              {
                workspace_id: "workspace-1",
                reservation_id: "workflow:run-1",
                dimension: "active_workflows",
                attribution_key: "workflow-admission:key-1",
                subject_id: "run-1",
                attempt_id: null,
                reserved_units: "1",
                settled_units: null,
                state: "reserved",
                revision: 0,
                created_at: "2026-08-01T12:00:00.000Z",
                updated_at: "2026-08-01T12:00:00.000Z",
              } as T,
            ],
            rowCount: 1,
          };
        if (sql.includes("INSERT INTO workflow_runs"))
          return { rows: [workflowRow() as T], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
    });
    await transaction.admitWorkflow({
      run: {
        workspaceId: "workspace-1",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-08-01T12:00:00.000Z",
      },
      idempotencyKey: "key-1",
      requestFingerprint: "a".repeat(64),
      commandId: "command-1",
      response: { workflowRunId: "run-1", jobId: "job-1", revision: 0 },
      job: { jobId: "job-1", runId: "run-1" },
      outbox: {
        outboxId: "outbox-1",
        topic: "workflow.queued",
        payload: {},
        availableAt: "2026-08-01T12:00:00.000Z",
      },
      now: "2026-08-01T12:00:00.000Z",
    });
    const commandIndex = queries.findIndex((sql) =>
      sql.includes("INSERT INTO command_admissions")
    );
    const quotaIndex = queries.findIndex((sql) =>
      sql.includes("FROM quota_dimension_policies")
    );
    const runIndex = queries.findIndex((sql) =>
      sql.includes("INSERT INTO workflow_runs")
    );
    expect(commandIndex).toBeLessThan(quotaIndex);
    expect(quotaIndex).toBeLessThan(runIndex);

    const replayQueries: string[] = [];
    const replay = new WorkspaceTransactionRepository({
      query: async <T>(sql: string) => {
        replayQueries.push(sql);
        if (sql.includes("INSERT INTO command_admissions"))
          return { rows: [], rowCount: 0 };
        if (sql.includes("SELECT command_id, request_fingerprint"))
          return {
            rows: [
              {
                command_id: "command-1",
                request_fingerprint: "a".repeat(64),
                response: {
                  workflowRunId: "run-1",
                  jobId: "job-1",
                  revision: 0,
                },
              } as T,
            ],
          };
        return { rows: [] };
      },
    });
    await replay.admitWorkflow({
      run: {
        workspaceId: "workspace-1",
        runId: "run-new",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-08-01T12:01:00.000Z",
      },
      idempotencyKey: "key-1",
      requestFingerprint: "a".repeat(64),
      commandId: "command-new",
      response: {},
      job: { jobId: "job-new", runId: "run-new" },
      outbox: {
        outboxId: "outbox-new",
        topic: "workflow.queued",
        payload: {},
        availableAt: "2026-08-01T12:01:00.000Z",
      },
      now: "2026-08-01T12:01:00.000Z",
    });
    expect(
      replayQueries.some((sql) => sql.includes("quota_dimension_policies"))
    ).toBe(false);
    expect(
      replayQueries.some((sql) => sql.includes("quota_dimension_reservations"))
    ).toBe(false);
  });

  it("releases concurrency only on terminal run transitions", async () => {
    const activeQueries: string[] = [];
    const active = new WorkspaceTransactionRepository({
      query: async <T>(sql: string) => {
        activeQueries.push(sql);
        return sql.includes("UPDATE workflow_runs")
          ? { rows: [workflowRow("running", 1) as T], rowCount: 1 }
          : { rows: [], rowCount: 1 };
      },
    });
    await active.transition({
      workspaceId: "workspace-1",
      runId: "run-1",
      expectedRevision: 0,
      authority: "database-v1",
      from: "queued",
      status: "running",
      now: "2026-08-01T12:01:00.000Z",
    });
    expect(
      activeQueries.some((sql) => sql.includes("quota_dimension_reservations"))
    ).toBe(false);

    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      const terminalQueries: string[] = [];
      const terminal = new WorkspaceTransactionRepository({
        query: async <T>(sql: string) => {
          terminalQueries.push(sql);
          return sql.includes("UPDATE workflow_runs")
            ? { rows: [workflowRow(status, 2) as T], rowCount: 1 }
            : { rows: [], rowCount: 1 };
        },
      });
      await terminal.transition({
        workspaceId: "workspace-1",
        runId: "run-1",
        expectedRevision: 1,
        authority: "database-v1",
        from: "running",
        status,
        now: "2026-08-01T12:02:00.000Z",
      });
      const release = terminalQueries.find((sql) =>
        sql.includes("UPDATE quota_dimension_reservations")
      );
      expect(release).toContain("state = 'reserved'");
      expect(release).toContain("dimension = 'active_workflows'");
    }
  });

  it("keeps inconclusive provider evidence append-only and resolves only through the guarded transition", async () => {
    const resolved: unknown[] = [];
    const attempts: unknown[] = [];
    const transaction = {
      resolvePublicationReconciliation: async (input: unknown) => {
        resolved.push(input);
      },
      recordPublicationReconciliationAttempt: async (input: unknown) => {
        attempts.push(input);
      },
    };
    const store = new PostgresPublicationReconciliationStore({
      repository: {
        withWorkspaceTransaction: async (
          _workspaceId: string,
          work: (value: typeof transaction) => Promise<unknown>
        ) => work(transaction),
      } as never,
      workspaceId: "workspace-1",
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      createAttemptId: () => "attempt-1",
    });
    await store.recordInconclusive({
      publicationId: "publication-1",
      reason: "multiple_matches",
    });
    await store.recordResolved({
      publicationId: "publication-1",
      receipt: {
        providerObjectId: "video-1",
        recoveryIdentity: "publication-1",
        evidence: { marker: true },
      },
    });
    expect(attempts).toEqual([
      expect.objectContaining({
        attemptId: "attempt-1",
        reason: "multiple_matches",
      }),
    ]);
    expect(resolved).toEqual([
      expect.objectContaining({
        publicationId: "publication-1",
        receipt: expect.objectContaining({ providerObjectId: "video-1" }),
      }),
    ]);
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
        release: () => {
          released += 1;
        },
      }),
    };
    const store = new PostgresPublicationReconciliationStore({
      repository: new PostgresWorkflowRepository(pool),
      workspaceId: "workspace-1",
      createAttemptId: () => "attempt-1",
    });

    await expect(
      store.recordInconclusive({
        publicationId: "publication-1",
        reason: "provider_unavailable",
      })
    ).rejects.toThrow("injected database loss");
    expect(statements).toEqual([
      "BEGIN",
      "SELECT set_config('app.workspace_id', $1, true)",
      expect.stringContaining(
        "INSERT INTO publication_reconciliation_attempts"
      ),
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
        release: () => {
          released += 1;
        },
      }),
    };

    await expect(
      new PostgresWorkflowRepository(pool).migrate()
    ).rejects.toThrow("injected migration interruption");
    expect(statements).toEqual([
      "BEGIN",
      expect.stringContaining("CREATE TABLE IF NOT EXISTS episodes"),
      "ROLLBACK",
    ]);
    expect(released).toBe(1);
  });
});
