import { describe, expect, it } from "vitest";
import {
  resolveHistoryApprovalPackWorkerExecArgv,
  resolveHistoryApprovalPackWorkerUrl,
} from "./history-approval-pack-worker-pool.js";

describe("history approval-pack worker pool", () => {
  it("resolves a worker entrypoint URL", () => {
    const workerUrl = resolveHistoryApprovalPackWorkerUrl();
    expect(workerUrl.protocol).toBe("file:");
    expect(workerUrl.pathname).toMatch(/history-approval-pack-worker\.(ts|js)$/u);
  });

  it("provides tsx exec argv when not already running under tsx", () => {
    const execArgv = resolveHistoryApprovalPackWorkerExecArgv();
    if (process.execArgv.some((argument) => argument.includes("tsx"))) {
      expect(execArgv).toEqual(process.execArgv);
      return;
    }
    expect(execArgv.length).toBeGreaterThan(0);
    expect(execArgv[0]).toBe("--import");
  });
});
