import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MathBatchInterruptedError,
  MathBatchItemError,
  runMathBatch,
} from "./batch.js";

const item = (skillId: string) => ({
  skillId,
  variant: "standard" as const,
  language: "de" as const,
  status: "planned" as const,
  attempts: 0,
});

describe("math batch runner", () => {
  it("checkpoints completed items and does not call them again after interruption", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-batch-"));
    const checkpointPath = path.join(root, "batch.report.json");
    const calls = new Map<string, number>();
    await expect(
      runMathBatch(
        "batch-1",
        [item("M5-ZO-001"), item("M5-ZO-002")],
        async (candidate) => {
          calls.set(candidate.skillId, (calls.get(candidate.skillId) ?? 0) + 1);
          if (candidate.skillId.endsWith("002"))
            throw new MathBatchInterruptedError();
        },
        { retryBudget: 1, checkpointPath }
      )
    ).rejects.toBeInstanceOf(MathBatchInterruptedError);
    const report = await runMathBatch(
      "batch-1",
      [item("M5-ZO-001"), item("M5-ZO-002")],
      async (candidate) => {
        calls.set(candidate.skillId, (calls.get(candidate.skillId) ?? 0) + 1);
      },
      { retryBudget: 1, checkpointPath }
    );
    expect(report.status).toBe("succeeded");
    expect(calls.get("M5-ZO-001")).toBe(1);
    expect(calls.get("M5-ZO-002")).toBe(2);
  });

  it("persists retryable and permanent failures with bounded attempts", async () => {
    const calls = new Map<string, number>();
    const report = await runMathBatch(
      "batch-2",
      [item("M5-ZO-001"), item("M5-ZO-002"), item("M5-ZO-003")],
      async (candidate) => {
        const count = (calls.get(candidate.skillId) ?? 0) + 1;
        calls.set(candidate.skillId, count);
        if (candidate.skillId.endsWith("002") && count < 2)
          throw new MathBatchItemError("retry", true, "provider-timeout");
        if (candidate.skillId.endsWith("003"))
          throw new MathBatchItemError("bad input", false, "validation");
      },
      2
    );
    expect(report.status).toBe("partial");
    expect(report.items[1]).toMatchObject({ status: "succeeded", attempts: 2 });
    expect(report.items[2]).toMatchObject({
      status: "failed",
      attempts: 1,
      errorKind: "permanent",
      errorCategory: "validation",
    });
  });
});
