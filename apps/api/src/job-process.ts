import os from "node:os";

import {
  DurableJobWorker,
  type DurableJobDispatchResult,
  type DurableJobHandler,
} from "@mediaforge/application";
import {
  PostgresDurableJobRepository,
  PostgresWorkflowRepository,
  type PostgresPool,
} from "@mediaforge/persistence";
import { z } from "zod";

const opaqueId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);

const jobProcessEnvironmentSchema = z.object({
  MEDIAFORGE_JOB_WORKSPACE_ID: opaqueId,
  MEDIAFORGE_JOB_WORKER_ID: opaqueId.optional(),
  MEDIAFORGE_JOB_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(60_000)
    .default(1_000),
  MEDIAFORGE_JOB_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(3_600)
    .default(60),
  MEDIAFORGE_JOB_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(1_200_000)
    .optional(),
  MEDIAFORGE_JOB_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(8),
});

export interface DurableJobProcessEnvironment {
  readonly workspaceId: string;
  readonly workerId: string;
  readonly pollIntervalMs: number;
  readonly leaseSeconds: number;
  readonly heartbeatIntervalMs: number;
  readonly maxAttempts: number;
}

export function parseDurableJobProcessEnvironment(
  environment: NodeJS.ProcessEnv,
  identity: { readonly hostname: string; readonly pid: number } = {
    hostname: os.hostname(),
    pid: process.pid,
  }
): DurableJobProcessEnvironment {
  const parsed = jobProcessEnvironmentSchema.parse(environment);
  const heartbeatIntervalMs =
    parsed.MEDIAFORGE_JOB_HEARTBEAT_INTERVAL_MS ??
    Math.max(
      250,
      Math.floor((parsed.MEDIAFORGE_JOB_LEASE_SECONDS * 1_000) / 3)
    );
  if (heartbeatIntervalMs >= parsed.MEDIAFORGE_JOB_LEASE_SECONDS * 1_000)
    throw new Error(
      "MEDIAFORGE_JOB_HEARTBEAT_INTERVAL_MS must be shorter than the job lease."
    );
  return {
    workspaceId: parsed.MEDIAFORGE_JOB_WORKSPACE_ID,
    workerId:
      parsed.MEDIAFORGE_JOB_WORKER_ID ??
      `durable-job-${identity.hostname}-${identity.pid}`,
    pollIntervalMs: parsed.MEDIAFORGE_JOB_POLL_INTERVAL_MS,
    leaseSeconds: parsed.MEDIAFORGE_JOB_LEASE_SECONDS,
    heartbeatIntervalMs,
    maxAttempts: parsed.MEDIAFORGE_JOB_MAX_ATTEMPTS,
  };
}

function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

export interface DurableJobProcessWorker {
  dispatchOne(
    workspaceId: string,
    signal?: AbortSignal
  ): Promise<DurableJobDispatchResult>;
}

/** Drains ready jobs continuously and waits only after an idle claim. */
export async function runDurableJobProcess(input: {
  readonly worker: DurableJobProcessWorker;
  readonly workspaceId: string;
  readonly signal: AbortSignal;
  readonly pollIntervalMs: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly onDispatch?: (result: DurableJobDispatchResult) => void;
}): Promise<void> {
  const sleep = input.sleep ?? waitForPoll;
  while (!input.signal.aborted) {
    const result = await input.worker.dispatchOne(
      input.workspaceId,
      input.signal
    );
    input.onDispatch?.(result);
    if (result.kind === "idle" && !input.signal.aborted)
      await sleep(input.pollIntervalMs, input.signal);
  }
}

/**
 * Production PostgreSQL process composition. The caller supplies the canonical
 * task handler; this role deliberately does not map job types to media code.
 * The injected pool is owned by this invocation and always closed.
 */
export async function startPostgresDurableJobProcess(input: {
  readonly pool: PostgresPool;
  readonly handler: DurableJobHandler;
  readonly signal: AbortSignal;
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly retryAt?: (attempt: number, now: Date) => Date;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly onDispatch?: (result: DurableJobDispatchResult) => void;
}): Promise<void> {
  const role = parseDurableJobProcessEnvironment(
    input.environment ?? process.env
  );
  const repository = new PostgresWorkflowRepository(input.pool);
  try {
    await repository.migrate();
    const worker = new DurableJobWorker(
      new PostgresDurableJobRepository(repository),
      input.handler,
      {
        workerId: role.workerId,
        leaseSeconds: role.leaseSeconds,
        heartbeatIntervalMs: role.heartbeatIntervalMs,
        maxAttempts: role.maxAttempts,
        now: input.now ?? (() => new Date()),
        retryAt:
          input.retryAt ??
          ((attempt, now) =>
            new Date(now.getTime() + Math.min(300_000, 1_000 * 2 ** attempt))),
      }
    );
    await runDurableJobProcess({
      worker,
      workspaceId: role.workspaceId,
      signal: input.signal,
      pollIntervalMs: role.pollIntervalMs,
      ...(input.sleep ? { sleep: input.sleep } : {}),
      ...(input.onDispatch ? { onDispatch: input.onDispatch } : {}),
    });
  } finally {
    await input.pool.end();
  }
}
