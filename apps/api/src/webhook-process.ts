import os from "node:os";

import {
  DurableWebhookWorker,
  WebhookHttpDelivery,
  type DurableWebhookDispatchResult,
  type WebhookSigningSecretResolver,
} from "@mediaforge/application";
import {
  PostgresWebhookRepository,
  PostgresWorkflowRepository,
  type PostgresPool,
} from "@mediaforge/persistence";
import { z } from "zod";

import {
  NodeWebhookDnsResolver,
  NodeWebhookHttpTransport,
} from "./node-webhook-delivery.js";

const opaqueId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);

const environmentSchema = z.object({
  MEDIAFORGE_WEBHOOK_WORKSPACE_ID: opaqueId,
  MEDIAFORGE_WEBHOOK_WORKER_ID: opaqueId.optional(),
  MEDIAFORGE_WEBHOOK_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(60_000)
    .default(1_000),
  MEDIAFORGE_WEBHOOK_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(3_600)
    .default(60),
});

export interface DurableWebhookProcessEnvironment {
  readonly workspaceId: string;
  readonly workerId: string;
  readonly pollIntervalMs: number;
  readonly leaseSeconds: number;
}

export function parseDurableWebhookProcessEnvironment(
  environment: NodeJS.ProcessEnv,
  identity: { readonly hostname: string; readonly pid: number } = {
    hostname: os.hostname(),
    pid: process.pid,
  }
): DurableWebhookProcessEnvironment {
  const parsed = environmentSchema.parse(environment);
  return {
    workspaceId: parsed.MEDIAFORGE_WEBHOOK_WORKSPACE_ID,
    workerId:
      parsed.MEDIAFORGE_WEBHOOK_WORKER_ID ??
      `webhook-${identity.hostname}-${identity.pid}`,
    pollIntervalMs: parsed.MEDIAFORGE_WEBHOOK_POLL_INTERVAL_MS,
    leaseSeconds: parsed.MEDIAFORGE_WEBHOOK_LEASE_SECONDS,
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

export interface DurableWebhookProcessWorker {
  dispatchOne(workspaceId: string): Promise<DurableWebhookDispatchResult>;
}

export async function runDurableWebhookProcess(input: {
  readonly worker: DurableWebhookProcessWorker;
  readonly workspaceId: string;
  readonly signal: AbortSignal;
  readonly pollIntervalMs: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly onDispatch?: (result: DurableWebhookDispatchResult) => void;
}): Promise<void> {
  if (!Number.isSafeInteger(input.pollIntervalMs) || input.pollIntervalMs < 50 || input.pollIntervalMs > 60_000)
    throw new Error("Webhook poll interval must be between 50 and 60000 milliseconds.");
  const sleep = input.sleep ?? waitForPoll;
  while (!input.signal.aborted) {
    const result = await input.worker.dispatchOne(input.workspaceId);
    input.onDispatch?.(result);
    if (result.kind === "idle" && !input.signal.aborted)
      await sleep(input.pollIntervalMs, input.signal);
  }
}

/**
 * Composes the durable webhook role. The caller must provide a secret resolver
 * backed by an external secret store; plaintext signing secrets are never read
 * from process environment or PostgreSQL. The caller owns the injected pool.
 */
export async function startPostgresDurableWebhookProcess(input: {
  readonly pool: PostgresPool;
  readonly secrets: WebhookSigningSecretResolver;
  readonly signal: AbortSignal;
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly retryAt?: (attempt: number, now: Date) => Date;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly onDispatch?: (result: DurableWebhookDispatchResult) => void;
}): Promise<void> {
  const role = parseDurableWebhookProcessEnvironment(
    input.environment ?? process.env
  );
  const repository = new PostgresWebhookRepository(input.pool);
  await new PostgresWorkflowRepository(input.pool).migrate();
  await repository.migrate();
  const worker = new DurableWebhookWorker(
    repository,
    input.secrets,
    new WebhookHttpDelivery(
      new NodeWebhookDnsResolver(),
      new NodeWebhookHttpTransport()
    ),
    {
      workerId: role.workerId,
      leaseSeconds: role.leaseSeconds,
      now: input.now ?? (() => new Date()),
      retryAt:
        input.retryAt ??
        ((attempt, now) =>
          new Date(now.getTime() + Math.min(300_000, 1_000 * 2 ** attempt))),
    }
  );
  await runDurableWebhookProcess({
    worker,
    workspaceId: role.workspaceId,
    signal: input.signal,
    pollIntervalMs: role.pollIntervalMs,
    ...(input.sleep ? { sleep: input.sleep } : {}),
    ...(input.onDispatch ? { onDispatch: input.onDispatch } : {}),
  });
}
