import { WorkflowProviderRetriesExhaustedError } from "@mediaforge/workflow-engine";
import { describe, expect, it, vi } from "vitest";

import type { DurableJobExecutionContext } from "./durable-job-worker.js";
import {
  DurableWorkflowJobHandler,
  type PersistedDurableWorkflowRun,
} from "./durable-workflow-job-handler.js";

const run = (
  overrides: Partial<PersistedDurableWorkflowRun> = {}
): PersistedDurableWorkflowRun => ({
  workflowRunId: "run-1",
  authority: "database-v1",
  effectClass: "reversible",
  execution: { input: { canonical: true } },
  ...overrides,
});

const control = (): DurableJobExecutionContext => ({
  signal: new AbortController().signal,
  deadlineAt: "2026-08-01T12:05:00.000Z",
  leaseFence: 9,
  attempt: 2,
});

describe("DurableWorkflowJobHandler", () => {
  it("loads and executes only the persisted run with durable control", async () => {
    const load = vi.fn(async () => run());
    const execute = vi.fn(async () => undefined);
    const handler = new DurableWorkflowJobHandler({ load }, { execute });

    await expect(
      handler.execute(
        {
          workspaceId: "workspace-1",
          jobId: "job-1",
          jobType: "workflow.execute",
          payload: {
            workflowRunId: "run-1",
            jobId: "job-1",
            command: "darktruth.production",
          },
        },
        control()
      )
    ).resolves.toEqual({ kind: "succeeded" });

    expect(load).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workflowRunId: "run-1",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "execute",
        jobId: "job-1",
        run: expect.objectContaining({
          execution: { input: { canonical: true } },
        }),
        control: expect.objectContaining({
          deadlineAt: "2026-08-01T12:05:00.000Z",
          leaseFence: 9,
          dispatchAttempt: 2,
        }),
      })
    );
  });

  it("supports resume without accepting execution arguments from the payload", async () => {
    const execute = vi.fn(async () => undefined);
    const handler = new DurableWorkflowJobHandler(
      { load: async () => run() },
      { execute }
    );

    await expect(
      handler.execute(
        {
          workspaceId: "workspace-1",
          jobId: "job-2",
          jobType: "workflow.resume",
          payload: { workflowRunId: "run-1" },
        },
        control()
      )
    ).resolves.toEqual({ kind: "succeeded" });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "resume" })
    );
  });

  it("terminally rejects unknown, malformed, legacy, and irreversible work", async () => {
    const load = vi.fn(async () => run());
    const execute = vi.fn(async () => undefined);
    const handler = new DurableWorkflowJobHandler({ load }, { execute });
    const base = {
      workspaceId: "workspace-1",
      jobId: "job-1",
    } as const;

    await expect(
      handler.execute(
        { ...base, jobType: "shell.execute", payload: {} },
        control()
      )
    ).resolves.toMatchObject({ kind: "terminal_failure" });
    await expect(
      handler.execute(
        {
          ...base,
          jobType: "workflow.execute",
          payload: {
            workflowRunId: "run-1",
            jobId: "job-other",
            command: "darktruth.production",
            mediaPath: "/tmp/untrusted.mp4",
          },
        },
        control()
      )
    ).resolves.toMatchObject({ kind: "terminal_failure" });

    load.mockResolvedValueOnce(run({ authority: "filesystem-legacy" }));
    await expect(
      handler.execute(
        {
          ...base,
          jobType: "workflow.resume",
          payload: { workflowRunId: "run-1" },
        },
        control()
      )
    ).resolves.toMatchObject({ kind: "terminal_failure" });
    load.mockResolvedValueOnce(run({ effectClass: "irreversible" }));
    await expect(
      handler.execute(
        {
          ...base,
          jobType: "workflow.resume",
          payload: { workflowRunId: "run-1" },
        },
        control()
      )
    ).resolves.toMatchObject({
      kind: "terminal_failure",
      error: expect.stringContaining("reconciliation"),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps canonical retryability without making unknown failures retryable", async () => {
    const execute = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new WorkflowProviderRetriesExhaustedError("Provider unavailable.")
      )
      .mockRejectedValueOnce(new Error("Unclassified failure."));
    const handler = new DurableWorkflowJobHandler(
      { load: async () => run() },
      { execute }
    );
    const job = {
      workspaceId: "workspace-1",
      jobId: "job-1",
      jobType: "workflow.resume",
      payload: { workflowRunId: "run-1" },
    };

    await expect(handler.execute(job, control())).resolves.toEqual({
      kind: "retryable_failure",
      error: "Provider unavailable.",
    });
    await expect(handler.execute(job, control())).resolves.toEqual({
      kind: "terminal_failure",
      error: "Unclassified failure.",
    });
  });
});
