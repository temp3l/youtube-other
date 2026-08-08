import { describe, expect, it } from "vitest";

import { createProviderFreeProfileExecutor } from "./provider-free-profile-executor.js";

const control = (
  overrides: Partial<{
    readonly signal: AbortSignal;
    readonly deadlineAt: string | null;
  }> = {}
) => ({
  signal: new AbortController().signal,
  deadlineAt: null,
  leaseFence: 3,
  dispatchAttempt: 1,
  ...overrides,
});

describe("provider-free profile executor", () => {
  it.each([
    "mathematics_education",
    "dark_truth",
    "history",
    "strategic_reinvention",
  ] as const)(
    "runs the canonical %s registry without provider effects",
    async (profile) => {
      await expect(
        createProviderFreeProfileExecutor().execute({
          mode: "execute",
          jobId: "job-1",
          run: {
            workflowRunId: "run-1",
            command: "episode-production",
            authority: "database-v1",
            effectClass: "reversible",
            execution: { input: { command: "episode-production", profile } },
          },
          control: control(),
        })
      ).resolves.toBeUndefined();
    }
  );

  it("fails closed for an unpinned profile and an expired deadline", async () => {
    const executor = createProviderFreeProfileExecutor();
    const base = {
      mode: "execute" as const,
      jobId: "job-1",
      run: {
        workflowRunId: "run-1",
        command: "episode-production",
        authority: "database-v1" as const,
        effectClass: "reversible" as const,
        execution: { input: { command: "episode-production" } },
      },
    };
    await expect(
      executor.execute({ ...base, control: control() })
    ).rejects.toThrow("does not contain an entitled profile");
    await expect(
      executor.execute({
        ...base,
        control: control({ deadlineAt: "2020-01-01T00:00:00.000Z" }),
      })
    ).rejects.toThrow("deadline has elapsed");
  });
});
