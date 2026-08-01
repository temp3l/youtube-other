import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalDurableWorkflowExecutor,
  PersistedDurableWorkflowRun,
} from "@mediaforge/application";
import type {
  PostgresPool,
  PostgresWorkflowRepository,
  RelationalWorkflowRun,
  WorkspaceTransactionRepository,
} from "@mediaforge/persistence";

import { createPostgresEpisodeProductionJobHandler } from "./job-process.js";
import { PostgresPersistedDurableWorkflowLoader } from "./postgres-durable-workflow-loader.js";

const execution = {
  input: {
    command: "episode-production",
    input: {
      projectId: "project-1",
      episodeId: "episode-1",
      template: "episode-production",
      episodeRevision: 2,
      locales: ["en"],
      variants: ["full"],
      approvalMode: "required",
      publicationMode: "none",
    },
  },
  configurationVersion: "config-v1",
  promptVersion: "prompt-v1",
  providerSelection: "fixture",
  rendererVersion: "renderer-v1",
  presetVersion: "preset-v1",
  buildVersion: null,
  assetHashes: ["a".repeat(64)],
  taskGraphVersion: "graph-v1",
} as const;

function run(
  overrides: Partial<RelationalWorkflowRun> = {}
): RelationalWorkflowRun {
  return {
    workspaceId: "workspace-1",
    runId: "workflow-1",
    revision: 0,
    status: "queued",
    authority: "database-v1",
    execution,
    supersedesRunId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function repository(
  record: RelationalWorkflowRun | null
): Pick<PostgresWorkflowRepository, "withWorkspaceTransaction"> {
  return {
    withWorkspaceTransaction: async <T>(
      _workspaceId: string,
      work: (transaction: WorkspaceTransactionRepository) => Promise<T>
    ) =>
      work({
        getForJob: async () => record,
      } as unknown as WorkspaceTransactionRepository),
  };
}

describe("PostgreSQL durable workflow loading", () => {
  it("loads the authoritative execution document in a tenant transaction", async () => {
    const loader = new PostgresPersistedDurableWorkflowLoader(
      repository(run())
    );
    await expect(
      loader.load({
        workspaceId: "workspace-1",
        jobId: "job-1",
        workflowRunId: "workflow-1",
      })
    ).resolves.toEqual<PersistedDurableWorkflowRun>({
      workflowRunId: "workflow-1",
      command: "episode-production",
      authority: "database-v1",
      effectClass: "reversible",
      execution,
    });
  });

  it("returns absence and rejects malformed persisted execution", async () => {
    await expect(
      new PostgresPersistedDurableWorkflowLoader(repository(null)).load({
        workspaceId: "workspace-1",
        jobId: "job-1",
        workflowRunId: "workflow-1",
      })
    ).resolves.toBeNull();
    await expect(
      new PostgresPersistedDurableWorkflowLoader(
        repository(
          run({ execution: { ...execution, assetHashes: ["not-a-hash"] } })
        )
      ).load({
        workspaceId: "workspace-1",
        jobId: "job-1",
        workflowRunId: "workflow-1",
      })
    ).rejects.toThrow("persisted workflow execution specification is invalid");
  });

  it("classifies publication-capable specifications as irreversible", async () => {
    const publicationExecution = {
      ...execution,
      input: {
        ...execution.input,
        input: { ...execution.input.input, publicationMode: "manual" as const },
      },
    };
    const loaded = await new PostgresPersistedDurableWorkflowLoader(
      repository(run({ execution: publicationExecution }))
    ).load({
      workspaceId: "workspace-1",
      jobId: "job-1",
      workflowRunId: "workflow-1",
    });
    expect(loaded?.effectClass).toBe("irreversible");
  });

  it("composes the strict handler so only persisted reversible work reaches the executor", async () => {
    const execute = vi.fn<CanonicalDurableWorkflowExecutor["execute"]>();
    const queries: {
      readonly sql: string;
      readonly values?: readonly unknown[];
    }[] = [];
    const pool: PostgresPool = {
      query: async <T>() => ({ rows: [] as T[] }),
      connect: async () => ({
        query: async <T>(sql: string, values?: readonly unknown[]) => {
          queries.push({ sql, ...(values ? { values } : {}) });
          return {
            rows: (sql.includes("FROM workflow_runs")
              ? [
                  {
                    workspace_id: "workspace-1",
                    run_id: "workflow-1",
                    revision: 0,
                    status: "queued",
                    authority: "database-v1",
                    execution_spec: execution,
                    supersedes_run_id: null,
                    created_at: "2026-08-01T00:00:00.000Z",
                    updated_at: "2026-08-01T00:00:00.000Z",
                  },
                ]
              : []) as T[],
          };
        },
        release: () => undefined,
      }),
      end: async () => undefined,
    };
    const handler = createPostgresEpisodeProductionJobHandler({
      pool,
      execute,
    });
    await expect(
      handler.execute(
        {
          workspaceId: "workspace-1",
          jobId: "job-1",
          jobType: "workflow.execute",
          payload: {
            workflowRunId: "workflow-1",
            jobId: "job-1",
            command: "episode-production",
          },
        },
        {
          signal: new AbortController().signal,
          deadlineAt: null,
          leaseFence: 7,
          attempt: 2,
        }
      )
    ).resolves.toEqual({ kind: "succeeded" });
    expect(execute).toHaveBeenCalledOnce();
    expect(
      queries.find(({ sql }) => sql.includes("INNER JOIN jobs"))?.values
    ).toEqual(["workspace-1", "workflow-1", "job-1"]);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      mode: "execute",
      jobId: "job-1",
      run: { workflowRunId: "workflow-1", execution },
      control: { leaseFence: 7, dispatchAttempt: 2 },
    });

    await expect(
      handler.execute(
        {
          workspaceId: "workspace-1",
          jobId: "job-1",
          jobType: "workflow.execute",
          payload: {
            workflowRunId: "workflow-1",
            jobId: "job-1",
            command: "other-production",
          },
        },
        {
          signal: new AbortController().signal,
          deadlineAt: null,
          leaseFence: 8,
          attempt: 3,
        }
      )
    ).resolves.toEqual({
      kind: "terminal_failure",
      error: "The durable job command does not match its persisted workflow run.",
    });
    expect(execute).toHaveBeenCalledOnce();
  });
});
