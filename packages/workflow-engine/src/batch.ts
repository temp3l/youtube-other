import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  BATCH_SCHEMA_VERSION,
  TASK_SCHEMA_VERSION,
  artifactManifestSchema,
  artifactManifestIdSchema,
  attemptIdSchema,
  attemptTelemetrySchema,
  batchIdSchema,
  batchItemIdSchema,
  batchManifestSchema,
  contentLocaleSchema,
  contentVariantSchema,
  productionUnitIdSchema,
  taskFingerprintSchema,
  taskIdSchema,
  workflowRunIdSchema,
  type AttemptTelemetry,
  type BatchItemId,
  type BatchManifest,
  type ContentProfileId,
  type TaskFingerprint,
} from "@mediaforge/domain";

import { AttemptObservabilityStore } from "./attempt-observability.js";
import {
  type TaskImplementation,
  type TaskExecutionResult,
} from "./task-registry.js";
import {
  errorCodeToExitCode,
  normalizeWorkflowError,
} from "./workflow-errors.js";

export const BATCH_COORDINATOR_VERSION =
  "mediaforge.batch-coordinator.v1" as const;

export interface BatchExecutionConfiguration {
  readonly concurrency: number;
  readonly retryLimit: number;
  readonly rateLimitPerSecond?: number;
}

export interface BatchWorkItem {
  readonly key: string;
  readonly taskId: string;
  readonly unitId: string;
  readonly locale: string;
  readonly variant: string;
  readonly fingerprint: string;
  readonly groupKey?: string;
  readonly revisions?: Readonly<Record<string, string>>;
  /** The same canonical implementation used by non-batch task execution. */
  readonly execute: TaskImplementation;
  readonly classifyError?: (error: unknown) => {
    readonly retryable: boolean;
    readonly code?: string;
  };
}

export interface BatchPlanInput {
  readonly profileId: ContentProfileId;
  readonly provider: string;
  readonly model?: string;
  readonly operation: string;
  readonly executionMode: "sync" | "provider-batch";
  readonly configuration: BatchExecutionConfiguration;
  readonly items: readonly BatchWorkItem[];
}

export interface BatchReconciliationItem {
  readonly itemId: string;
  readonly status: "succeeded" | "failed-retryable" | "failed-permanent";
  readonly providerRequestId?: string;
  readonly outputManifestIds?: readonly string[];
  readonly errorCode?: string;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

export function createDeterministicBatchItemId(input: {
  readonly taskId: string;
  readonly unitId: string;
  readonly locale: string;
  readonly variant: string;
  readonly fingerprint: string;
}): BatchItemId {
  return batchItemIdSchema.parse(
    `item-${digest({
      taskId: input.taskId,
      unitId: input.unitId,
      locale: input.locale,
      variant: input.variant,
      fingerprint: input.fingerprint,
    }).slice(0, 40)}`
  );
}

export function createDeterministicBatchId(input: {
  readonly profileId: ContentProfileId;
  readonly provider: string;
  readonly model?: string;
  readonly operation: string;
  readonly itemIds: readonly string[];
}): string {
  return batchIdSchema.parse(
    `batch-${digest({ ...input, itemIds: [...input.itemIds].sort() }).slice(0, 40)}`
  );
}

function totals(items: BatchManifest["items"]): BatchManifest["totals"] {
  return {
    succeeded: items.filter((item) => item.status === "succeeded").length,
    failedRetryable: items.filter((item) => item.status === "failed-retryable")
      .length,
    failedPermanent: items.filter((item) => item.status === "failed-permanent")
      .length,
    cancelled: items.filter((item) => item.status === "cancelled").length,
    estimatedCostMicros: items.reduce(
      (sum, item) => sum + (item.cost?.estimatedMicros ?? 0),
      0
    ),
    actualCostMicros: items.reduce(
      (sum, item) => sum + (item.cost?.actualMicros ?? 0),
      0
    ),
  };
}

function finalStatus(items: BatchManifest["items"]): BatchManifest["status"] {
  if (items.every((item) => item.status === "succeeded")) return "succeeded";
  if (items.every((item) => item.status === "cancelled")) return "cancelled";
  if (items.some((item) => item.status === "succeeded")) return "partial";
  return "failed";
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await fs.rename(temporaryPath, filePath);
}

export class BatchStore {
  public constructor(public readonly root: string) {}

  public manifestPath(batchId: string): string {
    return path.join(this.root, batchIdSchema.parse(batchId), "manifest.json");
  }

  public async write(manifest: BatchManifest): Promise<BatchManifest> {
    const parsed = batchManifestSchema.parse(manifest);
    await atomicJson(this.manifestPath(parsed.id), parsed);
    return parsed;
  }

  public async read(batchId: string): Promise<BatchManifest> {
    return batchManifestSchema.parse(
      JSON.parse(
        await fs.readFile(this.manifestPath(batchId), "utf8")
      ) as unknown
    );
  }
}

export class BatchCoordinator {
  public readonly store: BatchStore;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private updateTail: Promise<void> = Promise.resolve();

  public constructor(options: {
    readonly root: string;
    readonly now?: () => Date;
    readonly sleep?: (milliseconds: number) => Promise<void>;
  }) {
    this.store = new BatchStore(options.root);
    this.now = options.now ?? (() => new Date());
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public createManifest(input: BatchPlanInput): BatchManifest {
    if (
      !Number.isInteger(input.configuration.concurrency) ||
      input.configuration.concurrency < 1
    ) {
      throw new Error("Batch concurrency must be a positive integer.");
    }
    if (
      !Number.isInteger(input.configuration.retryLimit) ||
      input.configuration.retryLimit < 0
    ) {
      throw new Error("Batch retry limit must be a non-negative integer.");
    }
    const seenKeys = new Set<string>();
    const items = input.items.map((item) => {
      if (seenKeys.has(item.key))
        throw new Error(`Duplicate batch item key: ${item.key}`);
      seenKeys.add(item.key);
      const normalized = {
        taskId: taskIdSchema.parse(item.taskId),
        unitId: productionUnitIdSchema.parse(item.unitId),
        locale: contentLocaleSchema.parse(item.locale),
        variant: contentVariantSchema.parse(item.variant),
        fingerprint: taskFingerprintSchema.parse(item.fingerprint),
      };
      return {
        id: createDeterministicBatchItemId(normalized),
        ...normalized,
        groupKey:
          item.groupKey ??
          [
            input.provider,
            input.model ?? "none",
            item.locale,
            item.variant,
            input.operation,
          ].join(":"),
        status: "pending" as const,
        attemptIds: [],
        outputManifestIds: [],
        warnings: [],
      };
    });
    const now = this.now().toISOString();
    return batchManifestSchema.parse({
      schemaVersion: BATCH_SCHEMA_VERSION,
      id: createDeterministicBatchId({
        profileId: input.profileId,
        provider: input.provider,
        ...(input.model ? { model: input.model } : {}),
        operation: input.operation,
        itemIds: items.map((item) => item.id),
      }),
      profileId: input.profileId,
      provider: input.provider,
      ...(input.model ? { model: input.model } : {}),
      operation: input.operation,
      executionMode: input.executionMode,
      status: "planned",
      configuration: input.configuration,
      items,
      totals: totals(items),
      createdAt: now,
      updatedAt: now,
    });
  }

  public async plan(input: BatchPlanInput): Promise<BatchManifest> {
    return this.store.write(this.createManifest(input));
  }

  public async run(
    input: BatchPlanInput,
    signal?: AbortSignal
  ): Promise<BatchManifest> {
    const planned = this.createManifest(input);
    let manifest: BatchManifest;
    try {
      const previous = await this.store.read(planned.id);
      const previousById = new Map(
        previous.items.map((item) => [item.id, item])
      );
      manifest = batchManifestSchema.parse({
        ...planned,
        createdAt: previous.createdAt,
        items: planned.items.map((item) => previousById.get(item.id) ?? item),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      manifest = planned;
    }
    manifest = await this.persist({ ...manifest, status: "running" });
    const workById = new Map(
      input.items.map((item) => [createDeterministicBatchItemId(item), item])
    );
    const queue = manifest.items
      .filter(
        (item) =>
          item.status !== "succeeded" &&
          item.status !== "failed-permanent" &&
          item.status !== "cancelled"
      )
      .map((item) => item.id);
    let nextAllowedStart = 0;
    const take = (): BatchItemId | undefined => queue.shift();
    const worker = async (): Promise<void> => {
      for (let itemId = take(); itemId; itemId = take()) {
        if (signal?.aborted) {
          await this.cancel(manifest.id, "Batch execution aborted.");
          return;
        }
        if (input.configuration.rateLimitPerSecond) {
          const interval = 1_000 / input.configuration.rateLimitPerSecond;
          const delay = Math.max(0, nextAllowedStart - Date.now());
          nextAllowedStart = Math.max(Date.now(), nextAllowedStart) + interval;
          if (delay > 0) await this.sleep(delay);
        }
        const work = workById.get(itemId);
        if (!work)
          throw new Error(`Missing work implementation for ${itemId}.`);
        manifest = await this.executeItem(manifest, itemId, work);
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(
            input.configuration.concurrency,
            Math.max(queue.length, 1)
          ),
        },
        () => worker()
      )
    );
    const current = await this.store.read(manifest.id);
    if (current.status === "cancelled") return current;
    return this.persist({ ...current, status: finalStatus(current.items) });
  }

  public async cancel(batchId: string, reason: string): Promise<BatchManifest> {
    const manifest = await this.store.read(batchId);
    return this.persist({
      ...manifest,
      status: "cancelled",
      cancellationReason: reason,
      items: manifest.items.map((item) =>
        item.status === "pending" ||
        item.status === "running" ||
        item.status === "failed-retryable"
          ? { ...item, status: "cancelled" as const }
          : item
      ),
    });
  }

  public async reconcile(
    batchId: string,
    evidence: readonly BatchReconciliationItem[]
  ): Promise<BatchManifest> {
    const manifest = await this.store.read(batchId);
    const byId = new Map(
      evidence.map((item) => [batchItemIdSchema.parse(item.itemId), item])
    );
    const items = manifest.items.map((item) => {
      const resolved = byId.get(item.id);
      if (!resolved || item.status === "succeeded") return item;
      return {
        ...item,
        status: resolved.status,
        ...(resolved.providerRequestId
          ? { providerRequestId: resolved.providerRequestId }
          : {}),
        ...(resolved.outputManifestIds
          ? {
              outputManifestIds: resolved.outputManifestIds.map((id) =>
                artifactManifestIdSchema.parse(id)
              ),
            }
          : {}),
        ...(resolved.errorCode ? { errorCode: resolved.errorCode } : {}),
        retryable: resolved.status === "failed-retryable",
      };
    });
    return this.persist({ ...manifest, items, status: finalStatus(items) });
  }

  private async executeItem(
    manifest: BatchManifest,
    itemId: BatchItemId,
    work: BatchWorkItem
  ): Promise<BatchManifest> {
    let current = manifest;
    const startingAttempts =
      current.items.find((candidate) => candidate.id === itemId)?.attemptIds
        .length ?? 0;
    const maxAttempts = startingAttempts + current.configuration.retryLimit + 1;
    while (true) {
      const item = current.items.find((candidate) => candidate.id === itemId)!;
      if (item.attemptIds.length >= maxAttempts) return current;
      const attemptNumber = item.attemptIds.length + 1;
      const attemptHash = digest({
        batchId: current.id,
        itemId,
        attemptNumber,
      });
      const attemptId = attemptIdSchema.parse(
        `attempt-${attemptHash.slice(0, 40)}`
      );
      const runId = workflowRunIdSchema.parse(
        `run-${digest({ batchId: current.id }).slice(0, 40)}`
      );
      const startedAt = this.now();
      current = await this.replaceItem(current, itemId, {
        ...item,
        status: "running",
        attemptIds: [...item.attemptIds, attemptId],
      });
      let result: TaskExecutionResult | undefined;
      let failure: ReturnType<typeof normalizeWorkflowError> | undefined;
      try {
        result = await work.execute({
          unitId: item.unitId,
          profileId: current.profileId,
          locale: item.locale,
          variant: item.variant,
          dryRun: false,
          runId,
          attemptId,
          fingerprint: item.fingerprint as TaskFingerprint,
          dependencyFingerprints: [],
        });
      } catch (error) {
        failure = normalizeWorkflowError(error);
        const classification = work.classifyError?.(error);
        if (classification) {
          failure = { ...failure, retryable: classification.retryable };
        }
      }
      const completedAt = this.now();
      const outputs = (result?.outputArtifacts ?? []).map((output) =>
        artifactManifestSchema.parse(output)
      );
      const retryable = failure?.retryable ?? false;
      const exhausted = attemptNumber >= maxAttempts;
      const status = failure
        ? retryable
          ? ("failed-retryable" as const)
          : ("failed-permanent" as const)
        : ("succeeded" as const);
      const telemetry = attemptTelemetrySchema.parse({
        schemaVersion: TASK_SCHEMA_VERSION,
        id: attemptId,
        runId,
        batchId: current.id,
        batchItemId: itemId,
        unitId: item.unitId,
        profileId: current.profileId,
        taskId: item.taskId,
        locale: item.locale,
        variant: item.variant,
        operation: current.operation,
        attemptNumber,
        provider: result?.telemetry?.provider ?? current.provider,
        ...((result?.telemetry?.model ?? current.model)
          ? { model: result?.telemetry?.model ?? current.model }
          : {}),
        ...(result?.telemetry?.providerRequestId
          ? { providerRequestId: result.telemetry.providerRequestId }
          : {}),
        cacheStatus: result?.telemetry?.cacheStatus ?? "miss",
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        fingerprint: item.fingerprint,
        revisions: {
          coordinator: BATCH_COORDINATOR_VERSION,
          ...(work.revisions ?? {}),
          ...(result?.telemetry?.revisions ?? {}),
        },
        outputManifestIds: outputs.map((output) => output.id),
        warnings: [...(result?.warnings ?? [])],
        ...(failure ? { error: failure } : {}),
        exitCode: failure ? errorCodeToExitCode(failure.code) : 0,
        ...(result?.telemetry?.usage ? { usage: result.telemetry.usage } : {}),
        ...(result?.telemetry?.cost ? { cost: result.telemetry.cost } : {}),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
      });
      await this.writeAttempt(current.id, telemetry);
      current = await this.replaceItem(current, itemId, {
        ...current.items.find((candidate) => candidate.id === itemId)!,
        status,
        ...(result?.telemetry?.providerRequestId
          ? { providerRequestId: result.telemetry.providerRequestId }
          : {}),
        ...(failure ? { errorCode: failure.code, retryable } : {}),
        cacheStatus: result?.telemetry?.cacheStatus ?? "miss",
        outputManifestIds: outputs.map((output) => output.id),
        warnings: [...(result?.warnings ?? [])],
        ...(result?.telemetry?.usage ? { usage: result.telemetry.usage } : {}),
        ...(result?.telemetry?.cost ? { cost: result.telemetry.cost } : {}),
      });
      if (!failure || !retryable || exhausted) return current;
    }
  }

  private async writeAttempt(
    batchId: string,
    record: AttemptTelemetry
  ): Promise<void> {
    const store = new AttemptObservabilityStore(
      path.join(this.store.root, batchId, "runs")
    );
    await store.write(record);
  }

  private async replaceItem(
    manifest: BatchManifest,
    itemId: BatchItemId,
    item: BatchManifest["items"][number]
  ): Promise<BatchManifest> {
    return this.serializedUpdate(manifest.id, (latest) => ({
      ...latest,
      items: latest.items.map((candidate) =>
        candidate.id === itemId ? item : candidate
      ),
    }));
  }

  private async serializedUpdate(
    batchId: string,
    update: (manifest: BatchManifest) => BatchManifest
  ): Promise<BatchManifest> {
    let resolveResult!: (manifest: BatchManifest) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<BatchManifest>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    this.updateTail = this.updateTail
      .catch(() => undefined)
      .then(async () => {
        try {
          resolveResult(
            await this.persist(update(await this.store.read(batchId)))
          );
        } catch (error) {
          rejectResult(error);
        }
      });
    return result;
  }

  private async persist(
    input: Omit<BatchManifest, "totals" | "updatedAt"> &
      Partial<Pick<BatchManifest, "totals" | "updatedAt">>
  ): Promise<BatchManifest> {
    const manifest = batchManifestSchema.parse({
      ...input,
      totals: totals(input.items),
      updatedAt: this.now().toISOString(),
    });
    return this.store.write(manifest);
  }
}
