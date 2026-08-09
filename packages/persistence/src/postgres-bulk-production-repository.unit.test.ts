import { describe, expect, it } from "vitest";

import {
  POSTGRES_BULK_PRODUCTION_MIGRATION,
  settleBulkProductionItemForTerminalJob,
} from "./postgres-bulk-production-repository.js";
import { POSTGRES_MIGRATION_MODULES } from "./postgres-migration-registry.js";

describe("Postgres bulk production repository", () => {
  it("persists every selected item and enforces tenant-scoped idempotency", () => {
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("CREATE TABLE IF NOT EXISTS bulk_production_batches");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("CREATE TABLE IF NOT EXISTS bulk_production_batch_items");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("UNIQUE (workspace_id, idempotency_key)");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("eligibility_reasons JSONB NOT NULL");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("bulk_production_batch_items_job_id_idx");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("launch_attempt INTEGER NOT NULL DEFAULT 0");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("FORCE ROW LEVEL SECURITY");
    expect(POSTGRES_MIGRATION_MODULES.map((module) => module.id)).toContain("bulk-production");
  });

  it("keeps running claims and completed child outcomes distinct from eligibility", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./postgres-bulk-production-repository.ts", import.meta.url), "utf8"));
    expect(source).toContain("FOR UPDATE OF item SKIP LOCKED");
    expect(source).toContain("AND status='running'");
    expect(source).toContain("workflow_run_id=$5");
    expect(source).toContain("workflow_run_id IS NULL");
    expect(source).toContain("status='cancelling'");
    expect(source).toContain("status='pending'");
    expect(source).toContain("settleBulkProductionItemForTerminalJob");
    expect(source).toContain("WHERE workspace_id=$1 AND job_id=$2 AND status='running'");
    expect(source).toContain("releaseQuotaDimensionsForSubjectInTransaction");
    expect(source).toContain('dimensions: ["active_batches", "batch_items"]');
    expect(source).toContain("retryTerminalItems");
    expect(source).toContain("launch_attempt=launch_attempt + 1");
    expect(source).toContain("status IN ('failed-retryable','cancelled')");
    const workflowSource = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./postgres-workflow-repository.ts", import.meta.url), "utf8"));
    expect(workflowSource).toContain("requestDurableJobCancellation");
    expect(workflowSource).toContain('status: "cancelled"');
  });

  it("settles a linked terminal child through the caller transaction", async () => {
    const statements: string[] = [];
    const connection = {
      async query<T>(sql: string): Promise<{ readonly rows: readonly T[] }> {
        statements.push(sql);
        return statements.length === 1
          ? { rows: [{ batch_id: "batch-1" }] as readonly T[] }
          : statements.length === 2
            ? { rows: [{ status: "succeeded" }] as readonly T[] }
          : { rows: [] };
      },
    };

    await expect(
      settleBulkProductionItemForTerminalJob(connection, {
        workspaceId: "workspace-a",
        jobId: "job-1",
        status: "failed-retryable",
        errorCode: "child_dead_lettered",
        now: "2026-08-09T12:00:00.000Z",
      })
    ).resolves.toBe(true);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("job_id=$2 AND status='running'");
    expect(statements[1]).toContain("batch.status='cancelling'");
    expect(statements[2]).toContain("state = 'released'");
  });
});
