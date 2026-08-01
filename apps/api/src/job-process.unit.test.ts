import { describe, expect, it, vi } from "vitest";

import type { DurableJobHandler } from "@mediaforge/application";
import type {
  PostgresPool,
  PostgresQueryResult,
} from "@mediaforge/persistence";

import {
  parseDurableJobProcessEnvironment,
  runDurableJobProcess,
  startPostgresDurableJobProcess,
} from "./job-process.js";

describe("durable job process", () => {
  it("drains ready work and waits only after an idle claim", async () => {
    const controller = new AbortController();
    const dispatchOne = vi
      .fn()
      .mockResolvedValueOnce({ kind: "idle" })
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "job-1" });
    const sleep = vi.fn(async () => undefined);
    const results: string[] = [];

    await runDurableJobProcess({
      worker: { dispatchOne },
      workspaceId: "workspace-1",
      signal: controller.signal,
      pollIntervalMs: 250,
      sleep,
      onDispatch: (result) => {
        results.push(result.kind);
        if (result.kind === "succeeded") controller.abort();
      },
    });

    expect(dispatchOne).toHaveBeenCalledTimes(2);
    expect(dispatchOne).toHaveBeenCalledWith("workspace-1", controller.signal);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(250, controller.signal);
    expect(results).toEqual(["idle", "succeeded"]);
  });

  it("does not claim after shutdown and propagates claim failures", async () => {
    const stopped = new AbortController();
    stopped.abort();
    const dispatchOne = vi.fn();
    await runDurableJobProcess({
      worker: { dispatchOne },
      workspaceId: "workspace-1",
      signal: stopped.signal,
      pollIntervalMs: 1_000,
    });
    expect(dispatchOne).not.toHaveBeenCalled();

    await expect(
      runDurableJobProcess({
        worker: {
          dispatchOne: async () => {
            throw new Error("database unavailable");
          },
        },
        workspaceId: "workspace-1",
        signal: new AbortController().signal,
        pollIntervalMs: 1_000,
      })
    ).rejects.toThrow("database unavailable");
  });

  it("parses bounded settings and rejects a heartbeat at or beyond the lease", () => {
    expect(
      parseDurableJobProcessEnvironment(
        {
          MEDIAFORGE_JOB_WORKSPACE_ID: "workspace-1",
          MEDIAFORGE_JOB_POLL_INTERVAL_MS: "250",
          MEDIAFORGE_JOB_LEASE_SECONDS: "30",
          MEDIAFORGE_JOB_HEARTBEAT_INTERVAL_MS: "5000",
        },
        { hostname: "worker-host", pid: 42 }
      )
    ).toEqual({
      workspaceId: "workspace-1",
      workerId: "durable-job-worker-host-42",
      pollIntervalMs: 250,
      leaseSeconds: 30,
      heartbeatIntervalMs: 5_000,
      maxAttempts: 8,
    });
    expect(() =>
      parseDurableJobProcessEnvironment({
        MEDIAFORGE_JOB_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_JOB_LEASE_SECONDS: "5",
        MEDIAFORGE_JOB_HEARTBEAT_INTERVAL_MS: "5000",
      })
    ).toThrow(/shorter than the job lease/u);
    expect(() =>
      parseDurableJobProcessEnvironment({
        MEDIAFORGE_JOB_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_JOB_MAX_ATTEMPTS: "0",
      })
    ).toThrow();
  });

  it("migrates before starting and closes its owned pool on shutdown", async () => {
    const queries: string[] = [];
    const end = vi.fn(async () => undefined);
    const pool: PostgresPool = {
      query: async <T>(): Promise<PostgresQueryResult<T>> => ({ rows: [] }),
      connect: async () => ({
        query: async <T>(sql: string): Promise<PostgresQueryResult<T>> => {
          queries.push(sql);
          return { rows: [] };
        },
        release: () => undefined,
      }),
      end,
    };
    const stopped = new AbortController();
    stopped.abort();
    const handler: DurableJobHandler = {
      execute: async () => ({ kind: "succeeded" }),
    };

    await startPostgresDurableJobProcess({
      pool,
      handler,
      signal: stopped.signal,
      environment: { MEDIAFORGE_JOB_WORKSPACE_ID: "workspace-1" },
    });

    expect(queries[0]).toBe("BEGIN");
    expect(queries.at(-1)).toBe("COMMIT");
    expect(end).toHaveBeenCalledOnce();
  });
});
