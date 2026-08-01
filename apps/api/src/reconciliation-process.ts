import os from "node:os";

import { loadRuntimeConfig } from "@mediaforge/config";
import {
  PostgresWorkflowRepository,
  type PostgresPool,
} from "@mediaforge/persistence";
import type { OutboxDispatchResult } from "@mediaforge/application";
import { Pool } from "pg";
import { z } from "zod";

import {
  createLivePostgresTenantYoutubeReconciliationScheduler,
  type TenantReconciliationScheduler,
} from "./tenant-reconciliation-scheduler.js";

const opaqueId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);

const reconciliationEnvironmentSchema = z.object({
  MEDIAFORGE_RECONCILIATION_WORKSPACE_ID: opaqueId,
  MEDIAFORGE_RECONCILIATION_WORKER_ID: opaqueId.optional(),
  MEDIAFORGE_RECONCILIATION_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(60_000)
    .default(1_000),
  MEDIAFORGE_RECONCILIATION_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(3_600)
    .default(60),
  MEDIAFORGE_RECONCILIATION_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(8),
});

export interface TenantReconciliationProcessEnvironment {
  readonly workspaceId: string;
  readonly workerId: string;
  readonly pollIntervalMs: number;
  readonly leaseSeconds: number;
  readonly maxAttempts: number;
}

export function parseTenantReconciliationProcessEnvironment(
  environment: NodeJS.ProcessEnv,
  identity: { readonly hostname: string; readonly pid: number } = {
    hostname: os.hostname(),
    pid: process.pid,
  }
): TenantReconciliationProcessEnvironment {
  const parsed = reconciliationEnvironmentSchema.parse(environment);
  return {
    workspaceId: parsed.MEDIAFORGE_RECONCILIATION_WORKSPACE_ID,
    workerId:
      parsed.MEDIAFORGE_RECONCILIATION_WORKER_ID ??
      `youtube-reconcile-${identity.hostname}-${identity.pid}`,
    pollIntervalMs: parsed.MEDIAFORGE_RECONCILIATION_POLL_INTERVAL_MS,
    leaseSeconds: parsed.MEDIAFORGE_RECONCILIATION_LEASE_SECONDS,
    maxAttempts: parsed.MEDIAFORGE_RECONCILIATION_MAX_ATTEMPTS,
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

/**
 * Drains ready reconciliation work, waits only when the queue is idle, and
 * stops claiming new work after shutdown is requested.
 */
export async function runTenantReconciliationProcess(input: {
  readonly scheduler: TenantReconciliationScheduler;
  readonly signal: AbortSignal;
  readonly pollIntervalMs: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly onDispatch?: (result: OutboxDispatchResult) => void;
}): Promise<void> {
  const sleep = input.sleep ?? waitForPoll;
  while (!input.signal.aborted) {
    const result = await input.scheduler.dispatchOne();
    input.onDispatch?.(result);
    if (result.kind === "idle" && !input.signal.aborted) {
      await sleep(input.pollIntervalMs, input.signal);
    }
  }
}

function required(value: string | undefined, name: string): string {
  if (!value)
    throw new Error(`${name} is required to start the reconciliation process.`);
  return value;
}

/** Production composition for one tenant-bound reconciliation process role. */
export async function startTenantYoutubeReconciliationProcess(input: {
  readonly signal: AbortSignal;
  readonly environment?: NodeJS.ProcessEnv;
  readonly onDispatch?: (result: OutboxDispatchResult) => void;
}): Promise<void> {
  const environment = input.environment ?? process.env;
  const role = parseTenantReconciliationProcessEnvironment(environment);
  const runtime = await loadRuntimeConfig();
  const pool: PostgresPool = new Pool({
    connectionString: required(
      runtime.workflowDatabaseUrl,
      "MEDIAFORGE_WORKFLOW_DATABASE_URL"
    ),
  });
  try {
    await new PostgresWorkflowRepository(pool).migrate();
    const scheduler = createLivePostgresTenantYoutubeReconciliationScheduler({
      pool,
      workspaceId: role.workspaceId,
      workerId: role.workerId,
      leaseSeconds: role.leaseSeconds,
      maxAttempts: role.maxAttempts,
      youtubeAuth: {
        clientId: required(runtime.youtubeClientId, "YOUTUBE_CLIENT_ID"),
        clientSecret: required(
          runtime.youtubeClientSecret,
          "YOUTUBE_CLIENT_SECRET"
        ),
        refreshToken: required(
          runtime.youtubeRefreshToken,
          "YOUTUBE_REFRESH_TOKEN"
        ),
        ...(runtime.youtubeRedirectUri
          ? { redirectUri: runtime.youtubeRedirectUri }
          : {}),
        ...(runtime.youtubeChannelId
          ? { channelId: runtime.youtubeChannelId }
          : {}),
      },
    });
    await runTenantReconciliationProcess({
      scheduler,
      signal: input.signal,
      pollIntervalMs: role.pollIntervalMs,
      ...(input.onDispatch ? { onDispatch: input.onDispatch } : {}),
    });
  } finally {
    await pool.end();
  }
}
