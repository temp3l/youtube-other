import { describe, expect, it, vi } from "vitest";

import {
  DurableJobWorker,
  type DurableJobLease,
  type DurableJobRepository,
} from "./durable-job-worker.js";

const now = () => new Date("2026-08-01T12:00:00.000Z");
const lease = (overrides: Partial<DurableJobLease> = {}): DurableJobLease => ({
  workspaceId: "workspace-1",
  jobId: "job-1",
  jobType: "workflow.execute",
  payload: { workflowRunId: "run-1" },
  leaseFence: 3,
  leaseOwner: "worker-1",
  attemptCount: 1,
  deadlineAt: "2026-08-01T12:05:00.000Z",
  cancellationRequested: false,
  ...overrides,
});

function repository(
  overrides: Partial<DurableJobRepository> = {}
): DurableJobRepository {
  return {
    claimNextJob: async () => lease(),
    heartbeatJob: async () => "renewed",
    completeJob: async () => true,
    failJob: async () => true,
    scheduleJobRetry: async () => "retry_scheduled",
    markJobCancelled: async () => true,
    ...overrides,
  };
}

function worker(
  repo: DurableJobRepository,
  execute: ConstructorParameters<typeof DurableJobWorker>[1]["execute"],
  options: Partial<ConstructorParameters<typeof DurableJobWorker>[2]> = {}
): DurableJobWorker {
  return new DurableJobWorker(
    repo,
    { execute },
    {
      workerId: "worker-1",
      leaseSeconds: 30,
      maxAttempts: 3,
      heartbeatIntervalMs: 10_000,
      now,
      retryAt: (_attempt, value) => new Date(value.getTime() + 1_000),
      ...options,
    }
  );
}

describe("DurableJobWorker", () => {
  it("returns idle without invoking a handler when no job is ready", async () => {
    const execute = vi.fn();
    const subject = worker(
      repository({ claimNextJob: async () => null }),
      execute
    );

    await expect(subject.dispatchOne("workspace-1")).resolves.toEqual({
      kind: "idle",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("fenced-completes a successful handler result", async () => {
    const completeJob = vi.fn(async () => true);
    const subject = worker(
      repository({ completeJob }),
      async (_job, context) => {
        expect(context).toMatchObject({ leaseFence: 3, attempt: 1 });
        expect(context.signal.aborted).toBe(false);
        return { kind: "succeeded" };
      }
    );

    await expect(subject.dispatchOne("workspace-1")).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(completeJob).toHaveBeenCalledWith(
      expect.objectContaining({ leaseFence: 3 })
    );
  });

  it("schedules a bounded retry for a retryable handler result", async () => {
    const scheduleJobRetry = vi.fn(async () => "retry_scheduled" as const);
    const subject = worker(repository({ scheduleJobRetry }), async () => ({
      kind: "retryable_failure",
      error: "provider temporarily unavailable",
    }));

    await expect(subject.dispatchOne("workspace-1")).resolves.toEqual({
      kind: "retry_scheduled",
      jobId: "job-1",
    });
    expect(scheduleJobRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "provider temporarily unavailable",
        maxAttempts: 3,
        nextAttemptAt: "2026-08-01T12:00:01.000Z",
      })
    );
  });

  it("dead-letters an exhausted retry and terminally fails non-retryable work", async () => {
    const scheduleJobRetry = vi.fn(async () => "dead_letter" as const);
    const failJob = vi.fn(async () => true);
    const retrying = worker(repository({ scheduleJobRetry }), async () => ({
      kind: "retryable_failure",
      error: "still unavailable",
    }));
    const terminal = worker(repository({ failJob }), async () => ({
      kind: "terminal_failure",
      error: "invalid immutable input",
    }));

    await expect(retrying.dispatchOne("workspace-1")).resolves.toEqual({
      kind: "dead_letter",
      jobId: "job-1",
    });
    await expect(terminal.dispatchOne("workspace-1")).resolves.toEqual({
      kind: "failed",
      jobId: "job-1",
    });
    expect(failJob).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "invalid immutable input",
      })
    );
  });

  it("aborts cooperative work and marks a heartbeat-requested cancellation", async () => {
    const markJobCancelled = vi.fn(async () => true);
    const subject = worker(
      repository({
        heartbeatJob: async () => "cancel_requested",
        markJobCancelled,
      }),
      async (_job, context) =>
        new Promise((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => resolve({ kind: "terminal_failure", error: "aborted" }),
            { once: true }
          );
        }),
      { wait: async () => undefined }
    );

    await expect(subject.dispatchOne("workspace-1")).resolves.toEqual({
      kind: "cancelled",
      jobId: "job-1",
    });
    expect(markJobCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ leaseFence: 3 })
    );
  });

  it("aborts after lease loss and never commits a late handler outcome", async () => {
    const completeJob = vi.fn(async () => true);
    const failJob = vi.fn(async () => true);
    const scheduleJobRetry = vi.fn(async () => "retry_scheduled" as const);
    const subject = worker(
      repository({
        heartbeatJob: async () => "lost_lease",
        completeJob,
        failJob,
        scheduleJobRetry,
      }),
      async (_job, context) =>
        new Promise((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => resolve({ kind: "succeeded" }),
            { once: true }
          );
        }),
      { wait: async () => undefined }
    );

    await expect(subject.dispatchOne("workspace-1")).resolves.toEqual({
      kind: "lost_lease",
      jobId: "job-1",
    });
    expect(completeJob).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
    expect(scheduleJobRetry).not.toHaveBeenCalled();
  });
});
