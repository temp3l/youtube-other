import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresWorkflowRepository,
  WorkflowStateTransitionError,
} from "./index.js";

const host = process.env.POSTGRES_INTEGRATION_HOST;
const port = Number(process.env.POSTGRES_INTEGRATION_PORT ?? "55432");
const database = process.env.POSTGRES_INTEGRATION_DATABASE ?? "mediaforge_task04";
const describePostgres = host ? describe : describe.skip;

const execution = {
  input: { episodeId: "episode-1" },
  configurationVersion: "config-r1",
  promptVersion: "prompt-r1",
  providerSelection: "fixture",
  rendererVersion: "renderer-r1",
  presetVersion: "preset-r1",
  buildVersion: "build-r1",
  assetHashes: ["a".repeat(64)],
  taskGraphVersion: "workflow-r1",
};

describePostgres("PostgreSQL workflow state", () => {
  const adminPool = new Pool({ host, port, database, max: 1 });
  const applicationPool = new Pool({
    host,
    port,
    database,
    user: "mediaforge_task04_app",
    max: 1,
  });
  const admin = new PostgresWorkflowRepository(adminPool);
  const repository = new PostgresWorkflowRepository(applicationPool);

  beforeAll(async () => {
    await admin.migrate();
    await adminPool.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mediaforge_task04_app') THEN CREATE ROLE mediaforge_task04_app LOGIN NOSUPERUSER; END IF; END $$"
    );
    await adminPool.query("GRANT USAGE ON SCHEMA public TO mediaforge_task04_app");
    await adminPool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mediaforge_task04_app");
  });

  beforeEach(async () => {
    await adminPool.query(
      "TRUNCATE workflow_events, job_dead_letters, workflow_outbox, command_admissions, effect_records, jobs, workflow_attempts, workflow_steps, workflow_batches, approvals, assets, publications, workflow_runs, episode_revisions, episodes CASCADE"
    );
  });

  afterAll(async () => {
    await repository.close();
    await admin.close();
  });

  it("migrates transactionally and isolates composite tenant keys through RLS", async () => {
    await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.create({
        workspaceId: "workspace-a",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      })
    );
    await repository.withWorkspaceTransaction("workspace-b", (tx) =>
      tx.create({
        workspaceId: "workspace-b",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      })
    );

    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) => tx.get("workspace-b", "run-1"))
    ).resolves.toBeNull();
    await expect(
      repository.withWorkspaceTransaction("workspace-b", (tx) => tx.get("workspace-b", "run-1"))
    ).resolves.toMatchObject({ workspaceId: "workspace-b", runId: "run-1" });
  });

  it("rolls back transaction work and rejects stale, invalid, and terminal transitions", async () => {
    await expect(
      repository.withWorkspaceTransaction("workspace-a", async (tx) => {
        await tx.create({
          workspaceId: "workspace-a",
          runId: "rolled-back",
          status: "queued",
          execution,
          supersedesRunId: null,
          createdAt: "2026-07-31T12:00:00.000Z",
        });
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");
    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) => tx.get("workspace-a", "rolled-back"))
    ).resolves.toBeNull();

    await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.create({
        workspaceId: "workspace-a",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      })
    );
    const running = await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.transition({
        workspaceId: "workspace-a",
        runId: "run-1",
        expectedRevision: 0,
        authority: "database-v1",
        from: "queued",
        status: "running",
        now: "2026-07-31T12:01:00.000Z",
      })
    );
    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.transition({
          workspaceId: "workspace-a",
          runId: "run-1",
          expectedRevision: 0,
          authority: "database-v1",
          from: "queued",
          status: "running",
          now: "2026-07-31T12:02:00.000Z",
        })
      )
    ).rejects.toBeInstanceOf(WorkflowStateTransitionError);
    await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.transition({
        workspaceId: "workspace-a",
        runId: "run-1",
        expectedRevision: running.revision,
        authority: "database-v1",
        from: "running",
        status: "succeeded",
        now: "2026-07-31T12:03:00.000Z",
      })
    );
    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.transition({
          workspaceId: "workspace-a",
          runId: "run-1",
          expectedRevision: 2,
          authority: "database-v1",
          from: "succeeded",
          status: "running",
          now: "2026-07-31T12:04:00.000Z",
        })
      )
    ).rejects.toBeInstanceOf(WorkflowStateTransitionError);
  });

  it("rejects a PostgreSQL transition from the non-owning authority", async () => {
    await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.create({
        workspaceId: "workspace-a", runId: "legacy-run", status: "queued",
        authority: "filesystem-legacy", execution, supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      })
    );
    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.transition({
          workspaceId: "workspace-a", runId: "legacy-run", expectedRevision: 0,
          authority: "database-v1", from: "queued", status: "running",
          now: "2026-07-31T12:01:00.000Z",
        })
      )
    ).rejects.toBeInstanceOf(WorkflowStateTransitionError);
  });

  it("allows exactly one concurrent live lease and fences a reclaimed lease", async () => {
    await repository.withWorkspaceTransaction("workspace-a", async (tx) => {
      await tx.create({
        workspaceId: "workspace-a",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      });
      await tx.createJob({ workspaceId: "workspace-a", jobId: "job-1", runId: "run-1" });
    });
    const claims = await Promise.all(
      ["worker-a", "worker-b"].map((workerId) =>
        repository.withWorkspaceTransaction("workspace-a", (tx) =>
          tx.claimJob({
            workspaceId: "workspace-a",
            jobId: "job-1",
            workerId,
            now: "2026-07-31T12:00:00.000Z",
            leaseSeconds: 60,
          })
        )
      )
    );
    const winner = claims.filter((claim) => claim !== null);
    expect(winner).toHaveLength(1);
    expect(winner[0]?.leaseFence).toBe(1);

    const reclaimed = await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.claimJob({
        workspaceId: "workspace-a",
        jobId: "job-1",
        workerId: "worker-c",
        now: "2026-07-31T12:02:00.000Z",
        leaseSeconds: 60,
      })
    );
    expect(reclaimed).toMatchObject({ leaseFence: 2, leaseOwner: "worker-c" });
  });

  it("atomically admits one command, replays equal keys, and rejects different fingerprints", async () => {
    await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.create({
        workspaceId: "workspace-a", runId: "run-1", status: "queued", execution,
        supersedesRunId: null, createdAt: "2026-07-31T12:00:00.000Z",
      })
    );
    const admission = {
      workspaceId: "workspace-a", idempotencyKey: "key-1", requestFingerprint: "a".repeat(64),
      commandId: "command-1", response: { workflowRunId: "run-1" },
      job: { jobId: "job-1", runId: "run-1" },
      outbox: { outboxId: "outbox-1", topic: "workflow.queued", payload: { runId: "run-1" }, availableAt: "2026-07-31T12:00:00.000Z" },
      now: "2026-07-31T12:00:00.000Z",
    };
    const admitted = await repository.withWorkspaceTransaction("workspace-a", (tx) => tx.admitCommand(admission));
    const replayed = await repository.withWorkspaceTransaction("workspace-a", (tx) => tx.admitCommand(admission));
    expect(admitted).toMatchObject({ kind: "admitted", commandId: "command-1" });
    expect(replayed).toMatchObject({ kind: "replayed", response: { workflowRunId: "run-1" } });
    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.admitCommand({ ...admission, requestFingerprint: "b".repeat(64), commandId: "command-2" })
      )
    ).rejects.toThrow("different request");
    const outbox = await adminPool.query("SELECT outbox_id FROM workflow_outbox");
    const jobs = await adminPool.query("SELECT job_id FROM jobs");
    expect(outbox.rows).toHaveLength(1);
    expect(jobs.rows).toHaveLength(1);
  });

  it("rejects late heartbeats and never blindly restarts an uncertain effect", async () => {
    await repository.withWorkspaceTransaction("workspace-a", async (tx) => {
      await tx.create({
        workspaceId: "workspace-a", runId: "run-1", status: "queued", execution,
        supersedesRunId: null, createdAt: "2026-07-31T12:00:00.000Z",
      });
      await tx.createJob({ workspaceId: "workspace-a", jobId: "job-1", runId: "run-1" });
    });
    const lease = await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.claimJob({ workspaceId: "workspace-a", jobId: "job-1", workerId: "worker-a", now: "2026-07-31T12:00:00.000Z", leaseSeconds: 10 })
    );
    const late = await repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.heartbeatJob({ workspaceId: "workspace-a", jobId: "job-1", workerId: "worker-a", leaseFence: lease?.leaseFence ?? 0, now: "2026-07-31T12:01:00.000Z", leaseSeconds: 10 })
    );
    expect(late).toBeNull();
    await repository.withWorkspaceTransaction("workspace-a", async (tx) => {
      await tx.prepareEffect({ workspaceId: "workspace-a", effectId: "effect-1", subjectId: "run-1", kind: "provider", now: "2026-07-31T12:00:00.000Z" });
      expect(await tx.beginEffect({ workspaceId: "workspace-a", effectId: "effect-1", now: "2026-07-31T12:00:01.000Z" })).toBe(true);
      await tx.markEffectUncertain({ workspaceId: "workspace-a", effectId: "effect-1", now: "2026-07-31T12:00:02.000Z", evidence: { timeout: true } });
      expect(await tx.beginEffect({ workspaceId: "workspace-a", effectId: "effect-1", now: "2026-07-31T12:00:03.000Z" })).toBe(false);
    });
  });
});
