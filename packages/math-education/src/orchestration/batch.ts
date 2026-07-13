import fs from "node:fs/promises";
import { createMathCorrelationId } from "@mediaforge/observability";
import { writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import {
  lessonVariantSchema,
  mathLanguageSchema,
  skillIdSchema,
} from "../domain/index.js";
import { withMathFileLock } from "./workflow.js";

export interface MathBatchItem {
  skillId: string;
  variant: z.infer<typeof lessonVariantSchema>;
  language: z.infer<typeof mathLanguageSchema>;
  status: "planned" | "succeeded" | "failed" | "blocked";
  attempts: number;
  correlationId?: string | undefined;
  error?: string | undefined;
  errorKind?: "retryable" | "permanent" | undefined;
  errorCategory?: string | undefined;
}
const batchItemSchema = z.strictObject({
  skillId: skillIdSchema,
  variant: lessonVariantSchema,
  language: mathLanguageSchema,
  status: z.enum(["planned", "succeeded", "failed", "blocked"]),
  attempts: z.number().int().nonnegative(),
  correlationId: z.string().optional(),
  error: z.string().optional(),
  errorKind: z.enum(["retryable", "permanent"]).optional(),
  errorCategory: z.string().optional(),
});
export const mathBatchReportSchema = z.strictObject({
  artifactVersion: z.literal("math-batch-report.v2"),
  batchId: z.string().min(1),
  status: z.enum(["running", "succeeded", "partial", "failed"]),
  items: z.array(batchItemSchema),
  exitCode: z.union([z.literal(0), z.literal(2), z.literal(3)]),
  updatedAt: z.string().datetime(),
});
export type MathBatchReport = z.infer<typeof mathBatchReportSchema>;

export class MathBatchItemError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly category: string
  ) {
    super(message);
    this.name = "MathBatchItemError";
  }
}

export class MathBatchInterruptedError extends Error {
  constructor(message = "Math batch interrupted.") {
    super(message);
    this.name = "MathBatchInterruptedError";
  }
}

export interface MathBatchRunOptions {
  retryBudget?: number;
  checkpointPath?: string;
  lockPath?: string;
}

function summarize(
  batchId: string,
  items: MathBatchItem[],
  running = false
): MathBatchReport {
  const succeeded = items.filter((item) => item.status === "succeeded").length;
  const finished = items.filter((item) => item.status !== "planned").length;
  const status =
    running && finished < items.length
      ? "running"
      : succeeded === items.length
        ? "succeeded"
        : succeeded === 0
          ? "failed"
          : "partial";
  return mathBatchReportSchema.parse({
    artifactVersion: "math-batch-report.v2",
    batchId,
    status,
    items,
    exitCode: status === "succeeded" ? 0 : status === "partial" ? 2 : 3,
    updatedAt: new Date().toISOString(),
  });
}

async function loadCheckpoint(
  checkpointPath: string | undefined,
  batchId: string
): Promise<MathBatchReport | null> {
  if (!checkpointPath) return null;
  try {
    const parsed = mathBatchReportSchema.parse(
      JSON.parse(await fs.readFile(checkpointPath, "utf8")) as unknown
    );
    if (parsed.batchId !== batchId)
      throw new Error("Batch checkpoint id mismatch.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    const target = `${checkpointPath}.corrupt-${Date.now()}`;
    await fs.rename(checkpointPath, target).catch(() => undefined);
    throw new Error(`Math batch checkpoint was quarantined: ${target}`, {
      cause: error,
    });
  }
}

export async function runMathBatch(
  batchId: string,
  items: readonly MathBatchItem[],
  runner: (item: MathBatchItem) => Promise<void>,
  options: number | MathBatchRunOptions = 1
): Promise<MathBatchReport> {
  const normalized =
    typeof options === "number" ? { retryBudget: options } : options;
  const retryBudget = normalized.retryBudget ?? 1;
  const execute = async () => {
    const checkpoint = await loadCheckpoint(normalized.checkpointPath, batchId);
    const previous = new Map(
      checkpoint?.items.map((item) => [
        `${item.skillId}:${item.variant}:${item.language}`,
        item,
      ])
    );
    const results = items.map(
      (item) =>
        previous.get(`${item.skillId}:${item.variant}:${item.language}`) ?? {
          ...item,
          correlationId:
            item.correlationId ??
            createMathCorrelationId({
              batchId,
              skillId: item.skillId,
              variant: item.variant,
              language: item.language,
              stage: "batch",
            }),
        }
    );
    const persist = async (running: boolean) => {
      const report = summarize(batchId, results, running);
      if (normalized.checkpointPath)
        await writeJsonAtomic(normalized.checkpointPath, report);
      return report;
    };
    for (let index = 0; index < results.length; index += 1) {
      const item = results[index]!;
      const maxAttempts = retryBudget + 1;
      if (
        item.status === "succeeded" ||
        item.status === "blocked" ||
        (item.status === "failed" &&
          (item.errorKind === "permanent" || item.attempts >= maxAttempts))
      )
        continue;
      while (item.attempts < maxAttempts) {
        item.attempts += 1;
        try {
          await runner(item);
          Object.assign(item, { status: "succeeded" as const });
          delete item.error;
          delete item.errorKind;
          delete item.errorCategory;
          break;
        } catch (error) {
          if (error instanceof MathBatchInterruptedError) throw error;
          const classified =
            error instanceof MathBatchItemError
              ? error
              : new MathBatchItemError(
                  error instanceof Error ? error.message : String(error),
                  false,
                  "unclassified"
                );
          Object.assign(item, {
            status: "failed" as const,
            error: classified.message,
            errorKind: classified.retryable
              ? ("retryable" as const)
              : ("permanent" as const),
            errorCategory: classified.category,
          });
          if (!classified.retryable) break;
        }
      }
      await persist(true);
    }
    return persist(false);
  };
  const lockPath =
    normalized.lockPath ??
    (normalized.checkpointPath
      ? `${normalized.checkpointPath}.lock`
      : undefined);
  return lockPath ? withMathFileLock(lockPath, execute) : execute();
}
