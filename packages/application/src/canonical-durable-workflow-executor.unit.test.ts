import { describe, expect, it, vi } from "vitest";

import type { PersistedDurableWorkflowRun } from "./durable-workflow-job-handler.js";
import {
  CanonicalDurableWorkflowCommandExecutor,
  createCanonicalDurableWorkflowCommandExecutor,
} from "./canonical-durable-workflow-executor.js";

const run = (
  command = "episode-production"
): PersistedDurableWorkflowRun => ({
  workflowRunId: "run-1",
  command,
  authority: "database-v1",
  effectClass: "reversible",
  execution: { input: { command, persisted: true } },
});

const input = (persistedRun = run()) => ({
  mode: "execute" as const,
  jobId: "job-1",
  run: persistedRun,
  control: {
    signal: new AbortController().signal,
    deadlineAt: "2026-08-01T12:05:00.000Z",
    leaseFence: 7,
    dispatchAttempt: 3,
  },
});

describe("CanonicalDurableWorkflowCommandExecutor", () => {
  it("dispatches a persisted run only to its exact canonical command binding", async () => {
    const execute = vi.fn(async () => undefined);
    const executor = createCanonicalDurableWorkflowCommandExecutor([
      { command: "episode-production", execute },
    ]);
    const dispatch = input();

    await expect(executor.execute(dispatch)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(dispatch);
  });

  it("fails closed for duplicate, unsupported, and mismatched command bindings", async () => {
    const execute = vi.fn(async () => undefined);
    expect(
      () =>
        new CanonicalDurableWorkflowCommandExecutor([
          { command: "episode-production", execute },
          { command: "episode-production", execute },
        ])
    ).toThrow(/Duplicate canonical durable workflow command binding/u);

    const executor = new CanonicalDurableWorkflowCommandExecutor([
      { command: "episode-production", execute },
    ]);
    await expect(executor.execute(input(run("other-production")))).rejects.toThrow(
      /Unsupported canonical durable workflow command/u
    );
    await expect(
      executor.execute(
        input({
          ...run(),
          execution: { input: { command: "other-production" } },
        })
      )
    ).rejects.toThrow(/does not match/u);
    expect(execute).not.toHaveBeenCalled();
  });
});
