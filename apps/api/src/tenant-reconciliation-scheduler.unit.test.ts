import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "@mediaforge/persistence";

import {
  createPostgresTenantYoutubeReconciliationScheduler,
  publicationReconciliationTopic,
} from "./tenant-reconciliation-scheduler.js";

describe("tenant YouTube reconciliation scheduler", () => {
  it("claims only the tenant's reconciliation topic and records an inconclusive lookup", async () => {
    const queries: Array<{
      readonly sql: string;
      readonly values?: readonly unknown[];
    }> = [];
    const pool: PostgresPool = {
      query: async () => ({ rows: [] }),
      end: async () => undefined,
      connect: async () => ({
        query: async (sql: string, values?: readonly unknown[]) => {
          queries.push({ sql, values });
          if (sql.includes("WITH candidate"))
            return {
              rows: [
                {
                  workspace_id: "workspace-1",
                  outbox_id: "outbox-1",
                  topic: publicationReconciliationTopic,
                  payload: {
                    id: "publication-1",
                    projectId: "project-1",
                    approvalRevision: 1,
                    credentialVersion: "credential-r1",
                    assetHash: "a".repeat(64),
                    recoveryIdentity: "recovery-intent-1",
                    state: "reconciliation_required",
                  },
                  lease_fence: 1,
                  lease_owner: "scheduler-1",
                  lease_expires_at: "2026-07-31T12:01:00.000Z",
                  attempt_count: 1,
                },
              ],
            };
          if (sql.includes("SELECT * FROM publications"))
            return {
              rows: [
                {
                  workspace_id: "workspace-1",
                  publication_id: "publication-1",
                  project_id: "project-1",
                  run_id: "run-1",
                  status: "reconciliation_required",
                  revision: 2,
                  approval_revision: 1,
                  credential_version: "credential-r1",
                  asset_hash: "a".repeat(64),
                  recovery_identity: "recovery-intent-1",
                  execution_fence: 7,
                  provider_receipt: null,
                  terminal_evidence: { outcome: "unknown" },
                  created_at: "2026-07-31T11:59:00.000Z",
                  updated_at: "2026-07-31T12:00:00.000Z",
                },
              ],
            };
          if (
            sql.includes("UPDATE workflow_outbox") &&
            sql.includes("SET state = 'delivered'")
          )
            return { rows: [], rowCount: 1 };
          return { rows: [] };
        },
        release: () => undefined,
      }),
    };
    const youtube = {
      search: { list: vi.fn(async () => ({ data: { items: [] } })) },
      videos: { list: vi.fn(async () => ({ data: { items: [] } })) },
    };
    const scheduler = createPostgresTenantYoutubeReconciliationScheduler({
      pool,
      workspaceId: "workspace-1",
      youtube,
      workerId: "scheduler-1",
      now: () => new Date("2026-07-31T12:00:00.000Z"),
    });

    await expect(scheduler.dispatchOne()).resolves.toEqual({
      kind: "delivered",
      outboxId: "outbox-1",
    });
    expect(youtube.search.list).toHaveBeenCalledOnce();
    expect(youtube.search.list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("recovery-intent-1"),
      })
    );
    expect(
      queries.find(({ sql }) => sql.includes("WITH candidate"))?.values
    ).toEqual([
      "workspace-1",
      "2026-07-31T12:00:00.000Z",
      "scheduler-1",
      60,
      publicationReconciliationTopic,
    ]);
    expect(
      queries.some(({ sql }) =>
        sql.includes("INSERT INTO publication_reconciliation_attempts")
      )
    ).toBe(true);
    expect(
      queries.find(({ sql }) => sql.includes("SELECT * FROM publications"))
        ?.values
    ).toEqual(["workspace-1", "project-1", "publication-1"]);
  });
});
