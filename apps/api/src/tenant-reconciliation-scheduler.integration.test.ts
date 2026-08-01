import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PostgresWorkflowRepository } from "@mediaforge/persistence";
import { youtubePublicationRecoveryMarker } from "@mediaforge/youtube-upload";

import {
  createPostgresTenantYoutubeReconciliationScheduler,
  publicationReconciliationTopic,
} from "./tenant-reconciliation-scheduler.js";

const host = process.env.POSTGRES_INTEGRATION_HOST;
const port = Number(process.env.POSTGRES_INTEGRATION_PORT ?? "55432");
const database =
  process.env.POSTGRES_INTEGRATION_DATABASE ?? "mediaforge_task04";
const adminConnectionString = process.env.POSTGRES_INTEGRATION_ADMIN_URL;
const applicationConnectionString =
  process.env.POSTGRES_INTEGRATION_APPLICATION_URL;
if (Boolean(adminConnectionString) !== Boolean(applicationConnectionString)) {
  throw new Error(
    "POSTGRES_INTEGRATION_ADMIN_URL and POSTGRES_INTEGRATION_APPLICATION_URL must be configured together."
  );
}
const applicationRole =
  process.env.POSTGRES_INTEGRATION_APPLICATION_ROLE ?? "mediaforge_task04_app";
if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(applicationRole)) {
  throw new Error(
    "POSTGRES_INTEGRATION_APPLICATION_ROLE is not a safe PostgreSQL identifier."
  );
}
const describePostgres =
  host || adminConnectionString ? describe : describe.skip;
const now = "2026-07-31T12:00:00.000Z";

function reconciliationPayload(publicationId: string) {
  return {
    id: publicationId,
    approvalRevision: 1,
    credentialVersion: "credential-r1",
    assetHash: "a".repeat(64),
    state: "reconciliation_required",
  };
}

describePostgres("PostgreSQL tenant reconciliation scheduler", () => {
  const adminPool = new Pool(
    adminConnectionString
      ? { connectionString: adminConnectionString, max: 1 }
      : { host, port, database, max: 1 }
  );
  const applicationPool = new Pool(
    applicationConnectionString
      ? { connectionString: applicationConnectionString, max: 1 }
      : { host, port, database, user: applicationRole, max: 1 }
  );
  const admin = new PostgresWorkflowRepository(adminPool);

  async function seedReconciliation(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly outboxId: string;
    readonly topic?: string;
  }): Promise<void> {
    const runId = `run-${input.publicationId}`;
    await adminPool.query(
      `INSERT INTO workflow_runs (
        workspace_id, run_id, status, authority, execution_spec, supersedes_run_id, created_at, updated_at
      ) VALUES ($1, $2, 'queued', 'database-v1', $3::jsonb, NULL, $4::timestamptz, $4::timestamptz)`,
      [input.workspaceId, runId, JSON.stringify({ fixture: true }), now]
    );
    await adminPool.query(
      `INSERT INTO publications (workspace_id, publication_id, run_id, status)
       VALUES ($1, $2, $3, 'reconciliation_required')`,
      [input.workspaceId, input.publicationId, runId]
    );
    await adminPool.query(
      `INSERT INTO workflow_outbox (workspace_id, outbox_id, topic, payload, available_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
      [
        input.workspaceId,
        input.outboxId,
        input.topic ?? publicationReconciliationTopic,
        JSON.stringify(reconciliationPayload(input.publicationId)),
        now,
      ]
    );
  }

  async function workspaceRows(
    workspaceId: string
  ): Promise<
    readonly { readonly workspace_id: string; readonly outbox_id: string }[]
  > {
    const client = await applicationPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
      const result = await client.query<{
        readonly workspace_id: string;
        readonly outbox_id: string;
      }>(
        "SELECT workspace_id, outbox_id FROM workflow_outbox ORDER BY workspace_id, outbox_id"
      );
      await client.query("ROLLBACK");
      return result.rows;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await admin.migrate();
    if (!applicationConnectionString) {
      await adminPool.query(
        `DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${applicationRole}') THEN
            CREATE ROLE ${applicationRole} LOGIN NOSUPERUSER;
          END IF;
        END $$`
      );
    }
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${applicationRole}`);
    await adminPool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${applicationRole}`
    );
  });

  beforeEach(async () => {
    await adminPool.query(
      "TRUNCATE publication_reconciliation_attempts, workflow_events, job_dead_letters, workflow_outbox, command_admissions, effect_records, jobs, workflow_attempts, workflow_steps, workflow_batches, approvals, assets, publications, workflow_runs, episode_revisions, episodes CASCADE"
    );
  });

  afterAll(async () => {
    await applicationPool.end();
    await admin.close();
  });

  it("filters to the reconciliation topic and RLS prevents tenant-a from seeing tenant-b", async () => {
    await seedReconciliation({
      workspaceId: "tenant-a",
      publicationId: "publication-a",
      outboxId: "reconcile-a",
    });
    await seedReconciliation({
      workspaceId: "tenant-a",
      publicationId: "publication-general",
      outboxId: "general-a",
      topic: "workflow.queued",
    });
    await seedReconciliation({
      workspaceId: "tenant-b",
      publicationId: "publication-b",
      outboxId: "reconcile-b",
    });
    const youtube = {
      search: {
        list: vi.fn(async () => ({
          data: { items: [{ id: { videoId: "video-a" } }] },
        })),
      },
      videos: {
        list: vi.fn(async () => ({
          data: {
            items: [
              {
                id: "video-a",
                snippet: {
                  description:
                    youtubePublicationRecoveryMarker("publication-a"),
                  channelId: "channel-a",
                },
                status: { privacyStatus: "private" },
              },
            ],
          },
        })),
      },
    };
    const scheduler = createPostgresTenantYoutubeReconciliationScheduler({
      pool: applicationPool,
      workspaceId: "tenant-a",
      youtube,
      workerId: "scheduler-a",
      now: () => new Date(now),
    });

    await expect(scheduler.dispatchOne()).resolves.toEqual({
      kind: "delivered",
      outboxId: "reconcile-a",
    });
    expect(youtube.search.list).toHaveBeenCalledOnce();
    expect(
      await applicationPool.query("SELECT outbox_id FROM workflow_outbox")
    ).toMatchObject({ rows: [] });
    await expect(workspaceRows("tenant-a")).resolves.toEqual([
      { workspace_id: "tenant-a", outbox_id: "general-a" },
      { workspace_id: "tenant-a", outbox_id: "reconcile-a" },
    ]);

    const outbox = await adminPool.query<{
      readonly workspace_id: string;
      readonly outbox_id: string;
      readonly state: string;
    }>(
      "SELECT workspace_id, outbox_id, state FROM workflow_outbox ORDER BY workspace_id, outbox_id"
    );
    expect(outbox.rows).toEqual([
      { workspace_id: "tenant-a", outbox_id: "general-a", state: "pending" },
      {
        workspace_id: "tenant-a",
        outbox_id: "reconcile-a",
        state: "delivered",
      },
      { workspace_id: "tenant-b", outbox_id: "reconcile-b", state: "pending" },
    ]);
    const publications = await adminPool.query<{
      readonly workspace_id: string;
      readonly publication_id: string;
      readonly status: string;
    }>(
      "SELECT workspace_id, publication_id, status FROM publications ORDER BY workspace_id, publication_id"
    );
    expect(publications.rows).toEqual([
      {
        workspace_id: "tenant-a",
        publication_id: "publication-a",
        status: "published",
      },
      {
        workspace_id: "tenant-a",
        publication_id: "publication-general",
        status: "reconciliation_required",
      },
      {
        workspace_id: "tenant-b",
        publication_id: "publication-b",
        status: "reconciliation_required",
      },
    ]);
  });

  it("retains the publication when YouTube is unavailable and records the provider failure", async () => {
    await seedReconciliation({
      workspaceId: "tenant-a",
      publicationId: "publication-a",
      outboxId: "provider-failure-a",
    });
    const youtube = {
      search: {
        list: vi.fn(async () => {
          throw new Error("youtube unavailable");
        }),
      },
      videos: { list: vi.fn(async () => ({ data: { items: [] } })) },
    };
    const scheduler = createPostgresTenantYoutubeReconciliationScheduler({
      pool: applicationPool,
      workspaceId: "tenant-a",
      youtube,
      workerId: "scheduler-a",
      now: () => new Date(now),
    });

    await expect(scheduler.dispatchOne()).resolves.toEqual({
      kind: "delivered",
      outboxId: "provider-failure-a",
    });
    const publication = await adminPool.query<{ readonly status: string }>(
      "SELECT status FROM publications WHERE workspace_id = 'tenant-a' AND publication_id = 'publication-a'"
    );
    const attempts = await adminPool.query<{ readonly reason: string }>(
      "SELECT reason FROM publication_reconciliation_attempts WHERE workspace_id = 'tenant-a' AND publication_id = 'publication-a'"
    );
    expect(publication.rows).toEqual([{ status: "reconciliation_required" }]);
    expect(attempts.rows).toEqual([{ reason: "provider_unavailable" }]);
  });

  it("rolls back a database failure and reschedules the fenced outbox lease", async () => {
    await seedReconciliation({
      workspaceId: "tenant-a",
      publicationId: "publication-a",
      outboxId: "database-failure-a",
    });
    await adminPool.query(
      `CREATE OR REPLACE FUNCTION reject_reconciliation_attempt_for_test() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'forced reconciliation database failure'; END;
       $$ LANGUAGE plpgsql;
       CREATE TRIGGER reject_reconciliation_attempt_for_test
         BEFORE INSERT ON publication_reconciliation_attempts
         FOR EACH ROW EXECUTE FUNCTION reject_reconciliation_attempt_for_test();`
    );
    const youtube = {
      search: { list: vi.fn(async () => ({ data: { items: [] } })) },
      videos: { list: vi.fn(async () => ({ data: { items: [] } })) },
    };
    const scheduler = createPostgresTenantYoutubeReconciliationScheduler({
      pool: applicationPool,
      workspaceId: "tenant-a",
      youtube,
      workerId: "scheduler-a",
      now: () => new Date(now),
      retryAt: () => new Date("2026-07-31T12:01:00.000Z"),
    });

    try {
      await expect(scheduler.dispatchOne()).resolves.toEqual({
        kind: "rescheduled",
        outboxId: "database-failure-a",
      });
    } finally {
      await adminPool.query(
        "DROP TRIGGER IF EXISTS reject_reconciliation_attempt_for_test ON publication_reconciliation_attempts"
      );
      await adminPool.query(
        "DROP FUNCTION IF EXISTS reject_reconciliation_attempt_for_test()"
      );
    }

    const attempts = await adminPool.query(
      "SELECT attempt_id FROM publication_reconciliation_attempts WHERE workspace_id = 'tenant-a'"
    );
    const outbox = await adminPool.query<{
      readonly state: string;
      readonly attempt_count: number;
      readonly available_at: Date;
    }>(
      "SELECT state, attempt_count, available_at FROM workflow_outbox WHERE workspace_id = 'tenant-a' AND outbox_id = 'database-failure-a'"
    );
    expect(attempts.rows).toEqual([]);
    expect(outbox.rows).toEqual([
      {
        state: "pending",
        attempt_count: 1,
        available_at: new Date("2026-07-31T12:01:00.000Z"),
      },
    ]);
  });
});
