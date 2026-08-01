import { describe, expect, it, vi } from "vitest";

import {
  parseTenantReconciliationProcessEnvironment,
  runTenantReconciliationProcess,
} from "./reconciliation-process.js";

describe("tenant reconciliation process", () => {
  it("drains ready work, waits only when idle, and stops after abort", async () => {
    const controller = new AbortController();
    const dispatchOne = vi
      .fn()
      .mockResolvedValueOnce({ kind: "idle" })
      .mockResolvedValueOnce({ kind: "delivered", outboxId: "outbox-1" });
    const sleep = vi.fn(async () => undefined);
    const results: string[] = [];

    await runTenantReconciliationProcess({
      scheduler: { dispatchOne },
      signal: controller.signal,
      pollIntervalMs: 250,
      sleep,
      onDispatch: (result) => {
        results.push(result.kind);
        if (result.kind === "delivered") controller.abort();
      },
    });

    expect(dispatchOne).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(250, controller.signal);
    expect(results).toEqual(["idle", "delivered"]);
  });

  it("does not claim work when shutdown was already requested", async () => {
    const controller = new AbortController();
    controller.abort();
    const dispatchOne = vi.fn();

    await runTenantReconciliationProcess({
      scheduler: { dispatchOne },
      signal: controller.signal,
      pollIntervalMs: 1_000,
    });

    expect(dispatchOne).not.toHaveBeenCalled();
  });

  it("fails the process when the scheduler cannot claim from PostgreSQL", async () => {
    await expect(
      runTenantReconciliationProcess({
        scheduler: {
          dispatchOne: async () => {
            throw new Error("database unavailable");
          },
        },
        signal: new AbortController().signal,
        pollIntervalMs: 1_000,
      })
    ).rejects.toThrow("database unavailable");
  });

  it("parses bounded role settings and derives a stable process identity", () => {
    expect(
      parseTenantReconciliationProcessEnvironment(
        {
          MEDIAFORGE_RECONCILIATION_WORKSPACE_ID: "workspace-1",
          MEDIAFORGE_RECONCILIATION_POLL_INTERVAL_MS: "250",
        },
        { hostname: "worker-host", pid: 42 }
      )
    ).toEqual({
      workspaceId: "workspace-1",
      workerId: "youtube-reconcile-worker-host-42",
      pollIntervalMs: 250,
      leaseSeconds: 60,
      maxAttempts: 8,
    });
    expect(() =>
      parseTenantReconciliationProcessEnvironment({
        MEDIAFORGE_RECONCILIATION_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_RECONCILIATION_POLL_INTERVAL_MS: "1",
      })
    ).toThrow();
  });
});
