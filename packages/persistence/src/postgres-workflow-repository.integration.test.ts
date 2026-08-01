import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresDurableJobRepository,
  PostgresWorkflowAdmissionPort,
  PostgresWorkflowRepository,
  WorkflowStateTransitionError,
} from "./index.js";

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
  const repository = new PostgresWorkflowRepository(applicationPool);

  beforeAll(async () => {
    await admin.migrate();
    if (!applicationConnectionString) {
      await adminPool.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${applicationRole}') THEN CREATE ROLE ${applicationRole} LOGIN NOSUPERUSER; END IF; END $$`
      );
    }
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${applicationRole}`);
    await adminPool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${applicationRole}`
    );
  });

  beforeEach(async () => {
    await adminPool.query(
      "TRUNCATE workflow_events, job_dead_letters, workflow_outbox, command_admissions, effect_records, jobs, workflow_attempts, workflow_steps, workflow_batches, approvals, approval_challenges, validation_results, assets, publications, workflow_run_bindings, workflow_runs, episode_revisions, episodes, projects CASCADE"
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
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.get("workspace-b", "run-1")
      )
    ).resolves.toBeNull();
    await expect(
      repository.withWorkspaceTransaction("workspace-b", (tx) =>
        tx.get("workspace-b", "run-1")
      )
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
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.get("workspace-a", "rolled-back")
      )
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
    const running = await repository.withWorkspaceTransaction(
      "workspace-a",
      (tx) =>
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
        workspaceId: "workspace-a",
        runId: "legacy-run",
        status: "queued",
        authority: "filesystem-legacy",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      })
    );
    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.transition({
          workspaceId: "workspace-a",
          runId: "legacy-run",
          expectedRevision: 0,
          authority: "database-v1",
          from: "queued",
          status: "running",
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
      await tx.createJob({
        workspaceId: "workspace-a",
        jobId: "job-1",
        runId: "run-1",
      });
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

    const reclaimed = await repository.withWorkspaceTransaction(
      "workspace-a",
      (tx) =>
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
        workspaceId: "workspace-a",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      })
    );
    const admission = {
      workspaceId: "workspace-a",
      idempotencyKey: "key-1",
      requestFingerprint: "a".repeat(64),
      commandId: "command-1",
      response: { workflowRunId: "run-1" },
      job: { jobId: "job-1", runId: "run-1" },
      outbox: {
        outboxId: "outbox-1",
        topic: "workflow.queued",
        payload: { runId: "run-1" },
        availableAt: "2026-07-31T12:00:00.000Z",
      },
      now: "2026-07-31T12:00:00.000Z",
    };
    const admitted = await repository.withWorkspaceTransaction(
      "workspace-a",
      (tx) => tx.admitCommand(admission)
    );
    const replayed = await repository.withWorkspaceTransaction(
      "workspace-a",
      (tx) => tx.admitCommand(admission)
    );
    expect(admitted).toMatchObject({
      kind: "admitted",
      commandId: "command-1",
    });
    expect(replayed).toMatchObject({
      kind: "replayed",
      response: { workflowRunId: "run-1" },
    });
    await expect(
      repository.withWorkspaceTransaction("workspace-a", (tx) =>
        tx.admitCommand({
          ...admission,
          requestFingerprint: "b".repeat(64),
          commandId: "command-2",
        })
      )
    ).rejects.toThrow("different request");
    const outbox = await adminPool.query(
      "SELECT outbox_id FROM workflow_outbox"
    );
    const jobs = await adminPool.query("SELECT job_id FROM jobs");
    expect(outbox.rows).toHaveLength(1);
    expect(jobs.rows).toHaveLength(1);
  });

  it("rejects late heartbeats and never blindly restarts an uncertain effect", async () => {
    await repository.withWorkspaceTransaction("workspace-a", async (tx) => {
      await tx.create({
        workspaceId: "workspace-a",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      });
      await tx.createJob({
        workspaceId: "workspace-a",
        jobId: "job-1",
        runId: "run-1",
      });
    });
    const lease = await repository.withWorkspaceTransaction(
      "workspace-a",
      (tx) =>
        tx.claimJob({
          workspaceId: "workspace-a",
          jobId: "job-1",
          workerId: "worker-a",
          now: "2026-07-31T12:00:00.000Z",
          leaseSeconds: 10,
        })
    );
    const late = await repository.withWorkspaceTransaction(
      "workspace-a",
      (tx) =>
        tx.heartbeatJob({
          workspaceId: "workspace-a",
          jobId: "job-1",
          workerId: "worker-a",
          leaseFence: lease?.leaseFence ?? 0,
          now: "2026-07-31T12:01:00.000Z",
          leaseSeconds: 10,
        })
    );
    expect(late).toBeNull();
    await repository.withWorkspaceTransaction("workspace-a", async (tx) => {
      await tx.prepareEffect({
        workspaceId: "workspace-a",
        effectId: "effect-1",
        subjectId: "run-1",
        kind: "provider",
        now: "2026-07-31T12:00:00.000Z",
      });
      expect(
        await tx.beginEffect({
          workspaceId: "workspace-a",
          effectId: "effect-1",
          now: "2026-07-31T12:00:01.000Z",
        })
      ).toBe(true);
      await tx.markEffectUncertain({
        workspaceId: "workspace-a",
        effectId: "effect-1",
        now: "2026-07-31T12:00:02.000Z",
        evidence: { timeout: true },
      });
      expect(
        await tx.beginEffect({
          workspaceId: "workspace-a",
          effectId: "effect-1",
          now: "2026-07-31T12:00:03.000Z",
        })
      ).toBe(false);
    });
  });

  it("persists tenant-scoped projects and episodes and atomically binds admitted workflows", async () => {
    await repository.withWorkspaceTransaction("workspace-a", async (tx) => {
      await tx.createProject({
        workspaceId: "workspace-a",
        projectId: "project-1",
        name: "Project One",
        profile: "dark_truth",
        now: "2026-07-31T12:00:00.000Z",
      });
      await tx.createEpisode({
        workspaceId: "workspace-a",
        projectId: "project-1",
        episodeId: "episode-1",
        content: { type: "dark_truth", version: "1", premise: "A test" },
        now: "2026-07-31T12:00:00.000Z",
      });
    });
    const admission = new PostgresWorkflowAdmissionPort({
      repository,
      now: () => new Date("2026-07-31T12:01:00.000Z"),
      createId: (prefix) => ({ workflow: "run-bound", job: "job-bound", outbox: "outbox-bound", command: "command-bound" })[prefix],
    });
    await admission.admit({
      execution: {
        workspace: { id: "workspace-a" },
        idempotency: { key: "bound-key", fingerprint: "c".repeat(64) },
      },
      command: "episode-production",
      input: {
        projectId: "project-1",
        episodeId: "episode-1",
        episodeRevision: 0,
      },
    });
    await expect(repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.getBoundWorkflow({ workspaceId: "workspace-a", projectId: "project-1", runId: "run-bound" })
    )).resolves.toMatchObject({ runId: "run-bound", status: "queued" });
    await expect(repository.withWorkspaceTransaction("workspace-a", (tx) =>
      tx.getBoundWorkflow({ workspaceId: "workspace-a", projectId: "project-foreign", runId: "run-bound" })
    )).resolves.toBeNull();
    await expect(repository.withWorkspaceTransaction("workspace-b", (tx) =>
      tx.getProject("workspace-a", "project-1")
    )).resolves.toBeNull();
  });

  it("executes the fenced durable job lifecycle with retry and late-writer rejection", async () => {
    await repository.withWorkspaceTransaction("workspace-a", async (tx) => {
      await tx.create({
        workspaceId: "workspace-a",
        runId: "run-job",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      });
      await tx.createJob({
        workspaceId: "workspace-a",
        jobId: "job-durable",
        runId: "run-job",
        jobType: "workflow.execute",
        payload: { runId: "run-job" },
        availableAt: "2026-07-31T12:00:00.000Z",
      });
    });
    const jobs = new PostgresDurableJobRepository(repository);
    const first = await jobs.claimNextJob({
      workspaceId: "workspace-a",
      workerId: "worker-a",
      now: "2026-07-31T12:00:00.000Z",
      leaseSeconds: 60,
    });
    expect(first).toMatchObject({ jobType: "workflow.execute", attemptCount: 1, leaseFence: 1 });
    await expect(jobs.scheduleJobRetry({
      workspaceId: "workspace-a",
      jobId: "job-durable",
      workerId: "worker-a",
      leaseFence: 1,
      now: "2026-07-31T12:00:10.000Z",
      nextAttemptAt: "2026-07-31T12:00:20.000Z",
      error: "temporary",
      maxAttempts: 3,
    })).resolves.toBe("retry_scheduled");
    const second = await jobs.claimNextJob({
      workspaceId: "workspace-a",
      workerId: "worker-b",
      now: "2026-07-31T12:00:20.000Z",
      leaseSeconds: 60,
    });
    expect(second).toMatchObject({ attemptCount: 2, leaseFence: 2 });
    await expect(jobs.completeJob({
      workspaceId: "workspace-a",
      jobId: "job-durable",
      workerId: "worker-a",
      leaseFence: 1,
      now: "2026-07-31T12:00:21.000Z",
    })).resolves.toBe(false);
    await expect(jobs.completeJob({
      workspaceId: "workspace-a",
      jobId: "job-durable",
      workerId: "worker-b",
      leaseFence: 2,
      now: "2026-07-31T12:00:21.000Z",
    })).resolves.toBe(true);
  });
});
