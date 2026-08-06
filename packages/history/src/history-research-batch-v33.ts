import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { HistoryResearchCostConfigV33 } from "./history-research-cost-config-v33.js";
import { hashCanonicalV33, stableJsonV33 } from "./history-research-v33.js";

export interface OpenAiBatchClientV3_3 {
  readonly files: {
    create(body: {
      readonly file: Blob;
      readonly purpose: "batch";
    }): Promise<{ readonly id: string }>;
    content(fileId: string): Promise<{
      readonly text: () => Promise<string>;
    }>;
  };
  readonly batches: {
    create(body: {
      readonly input_file_id: string;
      readonly endpoint: string;
      readonly completion_window: string;
    }): Promise<{ readonly id: string; readonly status: string }>;
    retrieve(batchId: string): Promise<{
      readonly id: string;
      readonly status: string;
      readonly output_file_id?: string | null;
      readonly error_file_id?: string | null;
    }>;
  };
}

export interface HistoryBatchRequestItemV3_3 {
  readonly customId: string;
  readonly body: Record<string, unknown>;
}

export interface HistoryBatchJobStateV3_3 {
  readonly localJobId: string;
  readonly providerBatchId: string | null;
  readonly status:
    | "pending"
    | "submitted"
    | "completed"
    | "failed"
    | "cancelled"
    | "fixture"
    | "sync-fallback";
  readonly customIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resultsPath: string | null;
  readonly error: string | null;
}

export interface HistoryBatchItemResultV3_3 {
  readonly customId: string;
  readonly success: boolean;
  readonly responseJson: unknown;
  readonly error: string | null;
}

const batchOutputLineSchema = z.object({
  custom_id: z.string(),
  response: z
    .object({
      status_code: z.number().optional(),
      body: z.unknown().optional(),
    })
    .optional(),
  error: z.unknown().optional(),
});

export function buildStableBatchCustomIdV33(input: {
  readonly episodeId: string;
  readonly operation: string;
  readonly itemKey: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
}): string {
  return `hist33:${input.operation}:${hashCanonicalV33({
    episodeId: input.episodeId,
    itemKey: input.itemKey,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
  }).slice(0, 24)}`;
}

export function historyBatchJobPathV33(
  stateRoot: string,
  localJobId: string
): string {
  return path.join(stateRoot, "batch-jobs", `${localJobId}.json`);
}

export async function persistHistoryBatchJobV33(
  stateRoot: string,
  job: HistoryBatchJobStateV3_3
): Promise<void> {
  const file = historyBatchJobPathV33(stateRoot, job.localJobId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${stableJsonV33(job)}\n`, "utf8");
}

export async function readHistoryBatchJobV33(
  stateRoot: string,
  localJobId: string
): Promise<HistoryBatchJobStateV3_3 | null> {
  try {
    return JSON.parse(
      await fs.readFile(historyBatchJobPathV33(stateRoot, localJobId), "utf8")
    ) as HistoryBatchJobStateV3_3;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function parseHistoryBatchOutputJsonlV33(
  text: string
): HistoryBatchItemResultV3_3[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = batchOutputLineSchema.parse(JSON.parse(line) as unknown);
      if (parsed.error)
        return {
          customId: parsed.custom_id,
          success: false,
          responseJson: null,
          error: typeof parsed.error === "string"
            ? parsed.error
            : JSON.stringify(parsed.error),
        };
      return {
        customId: parsed.custom_id,
        success: true,
        responseJson: parsed.response?.body ?? null,
        error: null,
      };
    });
}

/**
 * Batch API runner with fixture simulation and safe synchronous fallback.
 * Does not weaken correctness when Batch is unsupported.
 */
export async function runHistorySemanticBatchV33<T>(input: {
  readonly config: Pick<HistoryResearchCostConfigV33, "useBatchApi" | "resumeCompletedBatches">;
  readonly stateRoot: string;
  readonly localJobId: string;
  readonly items: readonly HistoryBatchRequestItemV3_3[];
  readonly client?: OpenAiBatchClientV3_3;
  readonly fixtureMode?: boolean;
  readonly fixtureResults?: readonly HistoryBatchItemResultV3_3[];
  readonly syncFallback: (
    item: HistoryBatchRequestItemV3_3
  ) => Promise<HistoryBatchItemResultV3_3>;
  readonly now?: () => string;
}): Promise<{
  readonly job: HistoryBatchJobStateV3_3;
  readonly results: readonly HistoryBatchItemResultV3_3[];
  readonly mode: "batch" | "sync-fallback" | "fixture" | "resumed";
}> {
  const now = input.now ?? (() => new Date().toISOString());
  if (input.config.resumeCompletedBatches) {
    const existing = await readHistoryBatchJobV33(
      input.stateRoot,
      input.localJobId
    );
    if (
      existing &&
      (existing.status === "completed" || existing.status === "fixture") &&
      existing.resultsPath
    ) {
      const raw = await fs.readFile(existing.resultsPath, "utf8");
      return {
        job: existing,
        results: JSON.parse(raw) as HistoryBatchItemResultV3_3[],
        mode: "resumed",
      };
    }
  }

  if (input.fixtureMode) {
    const results =
      input.fixtureResults ??
      input.items.map((item) => ({
        customId: item.customId,
        success: true,
        responseJson: { fixture: true },
        error: null,
      }));
    const resultsPath = path.join(
      input.stateRoot,
      "batch-jobs",
      `${input.localJobId}.results.json`
    );
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });
    await fs.writeFile(resultsPath, `${stableJsonV33(results)}\n`, "utf8");
    const job: HistoryBatchJobStateV3_3 = {
      localJobId: input.localJobId,
      providerBatchId: null,
      status: "fixture",
      customIds: input.items.map((item) => item.customId),
      createdAt: now(),
      updatedAt: now(),
      resultsPath,
      error: null,
    };
    await persistHistoryBatchJobV33(input.stateRoot, job);
    return { job, results, mode: "fixture" };
  }

  if (!input.config.useBatchApi || !input.client) {
    const results: HistoryBatchItemResultV3_3[] = [];
    for (const item of input.items) {
      try {
        results.push(await input.syncFallback(item));
      } catch (error) {
        results.push({
          customId: item.customId,
          success: false,
          responseJson: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const resultsPath = path.join(
      input.stateRoot,
      "batch-jobs",
      `${input.localJobId}.results.json`
    );
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });
    await fs.writeFile(resultsPath, `${stableJsonV33(results)}\n`, "utf8");
    const job: HistoryBatchJobStateV3_3 = {
      localJobId: input.localJobId,
      providerBatchId: null,
      status: "sync-fallback",
      customIds: input.items.map((item) => item.customId),
      createdAt: now(),
      updatedAt: now(),
      resultsPath,
      error: null,
    };
    await persistHistoryBatchJobV33(input.stateRoot, job);
    return { job, results, mode: "sync-fallback" };
  }

  const jsonl = input.items
    .map((item) =>
      JSON.stringify({
        custom_id: item.customId,
        method: "POST",
        url: "/v1/responses",
        body: item.body,
      })
    )
    .join("\n");
  const file = await input.client.files.create({
    file: new Blob([jsonl], { type: "application/jsonl" }),
    purpose: "batch",
  });
  const created = await input.client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
  });
  let status = await input.client.batches.retrieve(created.id);
  // Polling is intentionally shallow here; callers may resume later.
  for (let attempt = 0; attempt < 3 && !["completed", "failed", "cancelled", "expired"].includes(status.status); attempt += 1)
    status = await input.client.batches.retrieve(created.id);

  if (status.status !== "completed" || !status.output_file_id) {
    const job: HistoryBatchJobStateV3_3 = {
      localJobId: input.localJobId,
      providerBatchId: created.id,
      status: status.status === "cancelled" ? "cancelled" : "failed",
      customIds: input.items.map((item) => item.customId),
      createdAt: now(),
      updatedAt: now(),
      resultsPath: null,
      error: `Batch job ${created.id} ended with status ${status.status}`,
    };
    await persistHistoryBatchJobV33(input.stateRoot, job);
    // Partial failure recovery: sync-fallback only failed/missing items.
    const results: HistoryBatchItemResultV3_3[] = [];
    for (const item of input.items)
      results.push(await input.syncFallback(item));
    return { job: { ...job, status: "sync-fallback" }, results, mode: "sync-fallback" };
  }

  const output = await input.client.files.content(status.output_file_id);
  const results = parseHistoryBatchOutputJsonlV33(await output.text());
  const failed = new Set(
    results.filter((item) => !item.success).map((item) => item.customId)
  );
  const recovered = [...results];
  for (const item of input.items) {
    if (!failed.has(item.customId)) continue;
    recovered.push(await input.syncFallback(item));
  }
  const resultsPath = path.join(
    input.stateRoot,
    "batch-jobs",
    `${input.localJobId}.results.json`
  );
  await fs.mkdir(path.dirname(resultsPath), { recursive: true });
  await fs.writeFile(resultsPath, `${stableJsonV33(recovered)}\n`, "utf8");
  const job: HistoryBatchJobStateV3_3 = {
    localJobId: input.localJobId,
    providerBatchId: created.id,
    status: "completed",
    customIds: input.items.map((item) => item.customId),
    createdAt: now(),
    updatedAt: now(),
    resultsPath,
    error: null,
  };
  await persistHistoryBatchJobV33(input.stateRoot, job);
  return { job, results: recovered, mode: "batch" };
}
