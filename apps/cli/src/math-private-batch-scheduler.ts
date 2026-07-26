import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";

export const MATH_RENDER_QUEUE_VERSION = "math-render-queue.v1" as const;

const sceneStatusSchema = z.enum([
  "pending",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
const phaseSchema = z.enum([
  "preparing",
  "rendering",
  "finalizing",
  "succeeded",
  "failed",
  "cancelled",
]);
const timestampSchema = z.string().datetime();
const queueSceneSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  status: sceneStatusSchema,
  requestFingerprint: z.string().min(1),
  assignmentId: z.string().min(1).optional(),
  lane: z.enum(["local", "remote"]).optional(),
  remoteJobId: z.string().min(1).optional(),
  attempts: z.number().int().nonnegative(),
  reassignments: z.number().int().nonnegative(),
  queuedAt: timestampSchema.optional(),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  updatedAt: timestampSchema,
});
const queueItemSchema = z.strictObject({
  batchItemId: z.string().min(1),
  unitId: z.string().min(1),
  phase: phaseSchema,
  requestFingerprint: z.string().min(1),
  sharedImageId: z.string().min(1),
  retryable: z.boolean(),
  scenes: z.array(queueSceneSchema).length(9),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export const mathRenderQueueSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_QUEUE_VERSION),
  batchId: z.string().min(1),
  items: z.array(queueItemSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type MathRenderQueue = z.infer<typeof mathRenderQueueSchema>;
export type MathRenderQueuePhase = z.infer<typeof phaseSchema>;

export interface MathBatchWorkflowStatus {
  readonly complete: boolean;
  readonly nextTaskId: string | null;
  readonly tasks: readonly {
    readonly taskId: string;
    readonly persistedStatus: string;
  }[];
}

export interface MathBatchWorkflowOperator {
  reconcile(): Promise<unknown>;
  status(): Promise<MathBatchWorkflowStatus>;
  runTask(taskId: string): Promise<unknown>;
  resume(): Promise<unknown>;
  retryFailed(): Promise<unknown>;
}

export interface MathPrivateBatchSchedulerItem {
  readonly batchItemId: string;
  readonly unitId: string;
  readonly requestFingerprint: string;
  readonly sharedImageId: string;
  readonly createOperator: () => Promise<MathBatchWorkflowOperator>;
}

export interface MathRenderQueueSceneEvent {
  readonly unitId: string;
  readonly sceneId: string;
  readonly status: z.infer<typeof sceneStatusSchema>;
  readonly requestFingerprint: string;
  readonly assignmentId?: string;
  readonly lane?: "local" | "remote";
  readonly remoteJobId?: string;
  readonly attempt?: number;
  readonly reassigned?: boolean;
}

class SerialGate {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(work: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const predecessor = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("Math render-ready lesson limit must be positive.");
    }
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

export class MathRenderQueueStore {
  private updateTail: Promise<void> = Promise.resolve();

  constructor(
    readonly filePath: string,
    private readonly now: () => Date
  ) {}

  async initialize(
    batchId: string,
    items: readonly Omit<MathPrivateBatchSchedulerItem, "createOperator">[]
  ): Promise<MathRenderQueue> {
    try {
      const existing = mathRenderQueueSchema.parse(
        JSON.parse(await fs.readFile(this.filePath, "utf8")) as unknown
      );
      if (
        existing.batchId !== batchId ||
        existing.items.map(({ unitId }) => unitId).join("\0") !==
          items.map(({ unitId }) => unitId).join("\0")
      ) {
        throw new Error("Math render queue identity does not match the batch.");
      }
      return existing;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const timestamp = this.now().toISOString();
    const queue = mathRenderQueueSchema.parse({
      artifactVersion: MATH_RENDER_QUEUE_VERSION,
      batchId,
      items: items.map((item) => ({
        ...item,
        phase: "preparing",
        retryable: false,
        scenes: Array.from({ length: 9 }, (_, index) => ({
          sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
          status: "pending",
          requestFingerprint: item.requestFingerprint,
          attempts: 0,
          reassignments: 0,
          updatedAt: timestamp,
        })),
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await writeJsonAtomic(this.filePath, queue);
    return queue;
  }

  async read(): Promise<MathRenderQueue> {
    return mathRenderQueueSchema.parse(
      JSON.parse(await fs.readFile(this.filePath, "utf8")) as unknown
    );
  }

  async updateItem(
    unitId: string,
    update: (item: MathRenderQueue["items"][number], now: string) =>
      MathRenderQueue["items"][number]
  ): Promise<void> {
    await this.serialized(async () => {
      const current = await this.read();
      const timestamp = this.now().toISOString();
      const items = current.items.map((item) =>
        item.unitId === unitId ? update(item, timestamp) : item
      );
      if (!items.some((item) => item.unitId === unitId)) {
        throw new Error(`Unknown math render queue unit: ${unitId}`);
      }
      await writeJsonAtomic(
        this.filePath,
        mathRenderQueueSchema.parse({
          ...current,
          items,
          updatedAt: timestamp,
        })
      );
    });
  }

  async recordScene(event: MathRenderQueueSceneEvent): Promise<void> {
    await this.updateItem(event.unitId, (item, timestamp) => ({
      ...item,
      scenes: item.scenes.map((scene) =>
        scene.sceneId !== event.sceneId
          ? scene
          : {
              ...scene,
              status: event.status,
              requestFingerprint: event.requestFingerprint,
              ...(event.assignmentId
                ? { assignmentId: event.assignmentId }
                : {}),
              ...(event.lane ? { lane: event.lane } : {}),
              ...(event.remoteJobId ? { remoteJobId: event.remoteJobId } : {}),
              attempts: Math.max(scene.attempts, event.attempt ?? 0),
              reassignments:
                scene.reassignments + (event.reassigned ? 1 : 0),
              ...(event.status === "queued" && !scene.queuedAt
                ? { queuedAt: timestamp }
                : {}),
              ...(event.status === "running" && !scene.startedAt
                ? { startedAt: timestamp }
                : {}),
              ...(["succeeded", "failed", "cancelled"].includes(event.status)
                ? { completedAt: timestamp }
                : {}),
              updatedAt: timestamp,
            }
      ),
      updatedAt: timestamp,
    }));
  }

  private async serialized(work: () => Promise<void>): Promise<void> {
    const result = this.updateTail.then(work);
    this.updateTail = result.catch(() => undefined);
    await result;
  }
}

function persistedTask(
  status: MathBatchWorkflowStatus,
  persistedStatus: string
): string | undefined {
  return status.tasks.find((task) => task.persistedStatus === persistedStatus)
    ?.taskId;
}

function publishDryRunSucceeded(status: MathBatchWorkflowStatus): boolean {
  return status.tasks.some(
    (task) =>
      task.taskId === "math.publish-dry-run" &&
      task.persistedStatus === "succeeded"
  );
}

function phaseFromStatus(status: MathBatchWorkflowStatus): MathRenderQueuePhase {
  if (status.complete || publishDryRunSucceeded(status)) return "succeeded";
  const render = status.tasks.find((task) => task.taskId === "math.render");
  if (render?.persistedStatus === "succeeded") return "finalizing";
  if (
    render &&
    ["running", "failed", "interrupted"].includes(render.persistedStatus)
  ) {
    return "rendering";
  }
  return status.nextTaskId === "math.render" ? "rendering" : "preparing";
}

export class MathPrivateBatchScheduler {
  readonly queue: MathRenderQueueStore;
  private readonly preparation = new SerialGate();
  private readonly renderWindow: Semaphore;
  private readonly operators = new Map<
    string,
    Promise<MathBatchWorkflowOperator>
  >();
  private initialization?: Promise<void>;
  private lastSpeechStartMs = Number.NEGATIVE_INFINITY;
  private cancellationStarted = false;

  constructor(
    private readonly options: {
      readonly batchId: string;
      readonly stateRoot: string;
      readonly items: readonly MathPrivateBatchSchedulerItem[];
      readonly maxRenderReadyLessons: number;
      readonly paidSpeechStartsPerSecond: number;
      readonly now?: () => Date;
      readonly sleep?: (milliseconds: number) => Promise<void>;
      readonly signal?: AbortSignal;
      readonly beforePaidSpeech?: (unitId: string) => Promise<void>;
      readonly afterPaidSpeech?: (unitId: string) => Promise<void>;
      readonly classifyError?: (error: unknown) => { readonly retryable: boolean };
      readonly cancelOwnedRemoteJobs?: (
        jobs: readonly { unitId: string; remoteJobId: string }[]
      ) => Promise<void>;
    }
  ) {
    if (
      !Number.isFinite(options.paidSpeechStartsPerSecond) ||
      options.paidSpeechStartsPerSecond <= 0
    ) {
      throw new Error("Paid speech rate must be positive.");
    }
    this.renderWindow = new Semaphore(options.maxRenderReadyLessons);
    this.queue = new MathRenderQueueStore(
      path.join(options.stateRoot, options.batchId, "math-render-queue.json"),
      options.now ?? (() => new Date())
    );
  }

  async initialize(): Promise<void> {
    this.initialization ??= this.queue
      .initialize(
        this.options.batchId,
        this.options.items.map(
          ({ batchItemId, unitId, requestFingerprint, sharedImageId }) => ({
            batchItemId,
            unitId,
            requestFingerprint,
            sharedImageId,
          })
        )
      )
      .then(() => undefined);
    await this.initialization;
  }

  async runUnit(unitId: string, resume: boolean): Promise<void> {
    await this.initialize();
    const item = this.options.items.find((candidate) => candidate.unitId === unitId);
    if (!item) throw new Error(`Unknown staged math batch unit: ${unitId}`);
    const operator =
      this.operators.get(unitId) ??
      item.createOperator().then((created) => {
        this.operators.set(unitId, Promise.resolve(created));
        return created;
      });
    this.operators.set(unitId, operator);
    const activeOperator = await operator;
    try {
      await this.preparation.run(async () => {
        await this.throwIfCancelled(unitId);
        await activeOperator.reconcile();
        await this.advancePreparation(activeOperator, unitId, resume);
      });
      await this.renderWindow.run(async () => {
        await this.throwIfCancelled(unitId);
        await this.setPhase(unitId, "rendering");
        await this.advanceRender(activeOperator, unitId, resume);
      });
      await this.setPhase(unitId, "finalizing");
      await this.advanceFinalization(activeOperator, unitId);
      await this.queue.updateItem(unitId, (current, timestamp) => ({
        ...current,
        phase: "succeeded",
        retryable: false,
        scenes: current.scenes.map((scene) =>
          scene.status === "succeeded"
            ? scene
            : {
                ...scene,
                status: "succeeded",
                attempts: Math.max(1, scene.attempts),
                completedAt: timestamp,
                updatedAt: timestamp,
              }
        ),
        updatedAt: timestamp,
      }));
    } catch (error) {
      const retryable = this.isPersistedRetryable(error);
      await this.queue.updateItem(unitId, (current, timestamp) => ({
        ...current,
        phase: this.options.signal?.aborted ? "cancelled" : "failed",
        retryable,
        scenes: current.scenes.map((scene) =>
          scene.status === "running"
            ? {
                ...scene,
                status: this.options.signal?.aborted ? "cancelled" : "failed",
                completedAt: timestamp,
                updatedAt: timestamp,
              }
            : scene
        ),
        updatedAt: timestamp,
      }));
      if (this.options.signal?.aborted) await this.cancelOnce();
      throw error;
    }
  }

  async recordSceneEvent(event: MathRenderQueueSceneEvent): Promise<void> {
    await this.queue.recordScene(event);
  }

  private async advancePreparation(
    operator: MathBatchWorkflowOperator,
    unitId: string,
    resume: boolean
  ): Promise<void> {
    while (true) {
      const status = await operator.status();
      const phase = phaseFromStatus(status);
      await this.setPhase(unitId, phase);
      if (phase !== "preparing" || status.complete) return;
      const interrupted = persistedTask(status, "interrupted");
      const failed = persistedTask(status, "failed");
      if (interrupted) {
        if (!resume) throw new Error(`Workflow task ${interrupted} is interrupted.`);
        await operator.resume();
        continue;
      }
      if (failed) {
        if (!(resume && (await this.canRetry(unitId)))) {
          throw new Error(`Workflow task ${failed} is not safely retryable.`);
        }
        await operator.retryFailed();
        continue;
      }
      if (!status.nextTaskId) throw new Error("Prepared workflow has no ready task.");
      if (status.nextTaskId === "math.tts") {
        await this.waitForPaidSpeechSlot();
        await this.options.beforePaidSpeech?.(unitId);
        await operator.runTask(status.nextTaskId);
        await this.options.afterPaidSpeech?.(unitId);
      } else {
        await operator.runTask(status.nextTaskId);
      }
    }
  }

  private async advanceRender(
    operator: MathBatchWorkflowOperator,
    unitId: string,
    resume: boolean
  ): Promise<void> {
    const status = await operator.status();
    const render = status.tasks.find((task) => task.taskId === "math.render");
    if (render?.persistedStatus === "succeeded") return;
    if (render?.persistedStatus === "interrupted") {
      if (!resume) throw new Error("Interrupted math render requires resume.");
      await operator.resume();
      return;
    }
    if (render?.persistedStatus === "failed") {
      if (!(resume && (await this.canRetry(unitId)))) {
        throw new Error("Failed math render is not safely retryable.");
      }
      await operator.retryFailed();
      return;
    }
    if (status.nextTaskId !== "math.render") {
      throw new Error("Math workflow did not reach render readiness.");
    }
    await operator.runTask("math.render");
  }

  private async advanceFinalization(
    operator: MathBatchWorkflowOperator,
    unitId: string
  ): Promise<void> {
    while (true) {
      await this.throwIfCancelled(unitId);
      const status = await operator.status();
      if (status.complete || publishDryRunSucceeded(status)) return;
      if (!status.nextTaskId) {
        throw new Error("Math finalization has no ready workflow task.");
      }
      if (status.nextTaskId === "math.tts" || status.nextTaskId === "math.render") {
        throw new Error("Math finalization attempted to re-enter a staged task.");
      }
      await operator.runTask(status.nextTaskId);
    }
  }

  private async waitForPaidSpeechSlot(): Promise<void> {
    const now = this.options.now ?? (() => new Date());
    const sleep =
      this.options.sleep ??
      ((milliseconds: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const interval = 1_000 / this.options.paidSpeechStartsPerSecond;
    const current = now().getTime();
    const delay = Math.max(0, this.lastSpeechStartMs + interval - current);
    if (delay > 0) await sleep(delay);
    this.lastSpeechStartMs = now().getTime();
  }

  private async canRetry(unitId: string): Promise<boolean> {
    return (await this.queue.read()).items.find((item) => item.unitId === unitId)
      ?.retryable ?? false;
  }

  private isPersistedRetryable(error: unknown): boolean {
    const classified = this.options.classifyError?.(error);
    if (classified) return classified.retryable;
    return (
      typeof error === "object" &&
      error !== null &&
      "retryable" in error &&
      (error as { retryable?: unknown }).retryable === true
    );
  }

  private async setPhase(
    unitId: string,
    phase: MathRenderQueuePhase
  ): Promise<void> {
    await this.queue.updateItem(unitId, (current, timestamp) => ({
      ...current,
      phase,
      updatedAt: timestamp,
    }));
  }

  private async throwIfCancelled(unitId: string): Promise<void> {
    if (!this.options.signal?.aborted) return;
    await this.cancelOnce();
    throw this.options.signal.reason ?? new Error(`Math batch cancelled: ${unitId}`);
  }

  private async cancelOnce(): Promise<void> {
    if (this.cancellationStarted) return;
    this.cancellationStarted = true;
    const queue = await this.queue.read();
    const jobs = queue.items.flatMap((item) =>
      item.scenes.flatMap((scene) =>
        scene.status === "running" && scene.remoteJobId
          ? [{ unitId: item.unitId, remoteJobId: scene.remoteJobId }]
          : []
      )
    );
    await this.options.cancelOwnedRemoteJobs?.(jobs);
  }
}
