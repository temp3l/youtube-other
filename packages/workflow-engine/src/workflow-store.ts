import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  ERROR_SCHEMA_VERSION,
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  approvalRecordSchema,
  artifactManifestSchema,
  attemptIdSchema,
  normalizedWorkflowErrorSchema,
  operatorOverrideSchema,
  taskFingerprintSchema,
  taskIdSchema,
  taskResultSchema,
  workflowDefinitionSchema,
  workflowEventSchema,
  workflowInstanceIdSchema,
  workflowInstanceSchema,
  workflowRunIdSchema,
  workflowTaskStateSchema,
  type ApprovalRecord,
  type ArtifactContract,
  type ArtifactManifest,
  type OperatorOverride,
  type TaskId,
  type TaskResult,
  type WorkflowDefinition,
  type WorkflowEvent,
  type WorkflowInstance,
  type WorkflowTaskState,
  type WorkflowTaskStatus,
} from "@mediaforge/domain";
import { z } from "zod";

import {
  type TaskReadinessResult,
  type TaskRegistry,
} from "./task-registry.js";
import { cacheDecisionSchema, type CacheDecision } from "./cache.js";

export const WORKFLOW_STORE_VERSION = "mediaforge.workflow-store.v1" as const;

const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nonEmptyStringSchema = z.string().trim().min(1);
const cacheDecisionRecordSchema = cacheDecisionSchema.extend({
  workflowInstanceId: workflowInstanceIdSchema,
  checkedAt: isoDateTimeSchema,
});

const attemptBase = {
  schemaVersion: z.literal(WORKFLOW_STORE_VERSION),
  id: attemptIdSchema,
  runId: workflowRunIdSchema,
  workflowInstanceId: workflowInstanceIdSchema,
  taskId: taskIdSchema,
  fingerprint: taskFingerprintSchema,
  attemptNumber: z.number().int().positive(),
  startedAt: isoDateTimeSchema,
};

export const workflowAttemptRecordSchema = z.discriminatedUnion("status", [
  z.object({ ...attemptBase, status: z.literal("running") }).strict(),
  z
    .object({
      ...attemptBase,
      status: z.literal("completed"),
      completedAt: isoDateTimeSchema,
      result: taskResultSchema,
    })
    .strict(),
]);
export type WorkflowAttemptRecord = z.infer<typeof workflowAttemptRecordSchema>;

const operatorRecordsSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_STORE_VERSION),
    records: z.array(z.unknown()),
  })
  .strict();

export const workflowLockSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_STORE_VERSION),
    token: z.string().regex(/^lock-[a-f0-9]{32}$/u),
    scope: z.enum(["unit", "task", "artifact"]),
    key: nonEmptyStringSchema,
    owner: nonEmptyStringSchema,
    runId: workflowRunIdSchema.optional(),
    attemptId: attemptIdSchema.optional(),
    acquiredAt: isoDateTimeSchema,
    heartbeatAt: isoDateTimeSchema,
  })
  .strict();
export type WorkflowLock = z.infer<typeof workflowLockSchema>;

export type WorkflowStoreErrorCode =
  | "NOT_INITIALIZED"
  | "ALREADY_INITIALIZED"
  | "IDENTITY_MISMATCH"
  | "EVENT_LOG_CORRUPT"
  | "DUPLICATE_EVENT"
  | "INVALID_TRANSITION"
  | "ATTEMPT_INVALID"
  | "OPERATOR_RECORD_INVALID"
  | "OVERRIDE_FORBIDDEN"
  | "LOCK_ACTIVE"
  | "LOCK_OWNERSHIP_MISMATCH"
  | "RECONCILIATION_INVALID";

export class WorkflowStoreError extends Error {
  public constructor(
    public readonly code: WorkflowStoreErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "WorkflowStoreError";
  }
}

export interface WorkflowStoreIdentity {
  readonly instanceId: string;
  readonly unitId: string;
  readonly locale: string;
  readonly variant: string;
}

export interface WorkflowStoreOptions {
  readonly unitRoot: string;
  readonly workflow: WorkflowDefinition;
  readonly identity: WorkflowStoreIdentity;
  readonly now?: () => Date;
  readonly staleAfterMs?: number;
  readonly nonOverridableTaskIds?: ReadonlySet<string>;
  readonly hooks?: {
    readonly afterEventAppend?: (event: WorkflowEvent) => void | Promise<void>;
  };
}

export interface WorkflowTransitionInput {
  readonly taskId: string;
  readonly to: WorkflowTaskStatus;
  readonly reasons?: readonly string[];
  readonly reason?: string;
  readonly attemptId?: string;
  readonly overrideId?: string;
  readonly outputManifestIds?: readonly string[];
  readonly errorCode?: string;
}

export interface CurrentApprovalContext {
  readonly artifactHashes: readonly string[];
  readonly at?: Date;
}

export interface DerivedTaskState {
  readonly taskId: TaskId;
  readonly persistedStatus: WorkflowTaskStatus;
  readonly readiness: TaskReadinessResult;
}

export interface DerivedNextResult {
  readonly workflowInstanceId: string;
  readonly nextTaskId: TaskId | null;
  readonly tasks: readonly DerivedTaskState[];
}

export interface SubsystemReconciliationEvidence {
  readonly taskId: string;
  readonly path: string;
  readonly validated: boolean;
  readonly reason: string;
}

export interface ReconcileInput {
  readonly artifactManifests?: readonly unknown[];
  readonly subsystemEvidence?: readonly SubsystemReconciliationEvidence[];
  readonly verifyArtifact?: (
    manifest: ArtifactManifest
  ) => boolean | Promise<boolean>;
}

export interface ReconcileResult {
  readonly importedSuccessTaskIds: readonly TaskId[];
  readonly invalidatedTaskIds: readonly TaskId[];
  readonly evidenceOnlyTaskIds: readonly TaskId[];
}

export interface StaleWorkflowRecords {
  readonly locks: readonly WorkflowLock[];
  readonly attempts: readonly WorkflowAttemptRecord[];
}

const allowedTransitions = new Map<
  WorkflowTaskStatus,
  ReadonlySet<WorkflowTaskStatus>
>([
  [
    "pending",
    new Set([
      "ready",
      "blocked",
      "awaiting-approval",
      "skipped",
      "invalidated",
    ]),
  ],
  [
    "ready",
    new Set([
      "running",
      "blocked",
      "awaiting-approval",
      "skipped",
      "invalidated",
    ]),
  ],
  [
    "blocked",
    new Set([
      "pending",
      "ready",
      "awaiting-approval",
      "skipped",
      "invalidated",
    ]),
  ],
  [
    "awaiting-approval",
    new Set(["pending", "ready", "blocked", "skipped", "invalidated"]),
  ],
  ["running", new Set(["succeeded", "failed", "interrupted", "skipped"])],
  ["succeeded", new Set(["invalidated"])],
  ["failed", new Set(["pending", "ready", "invalidated"])],
  ["interrupted", new Set(["pending", "ready", "invalidated"])],
  ["skipped", new Set(["pending", "ready", "invalidated"])],
  [
    "invalidated",
    new Set(["pending", "ready", "blocked", "awaiting-approval", "skipped"]),
  ],
]);

export function isWorkflowTransitionAllowed(
  from: WorkflowTaskStatus,
  to: WorkflowTaskStatus
): boolean {
  return allowedTransitions.get(from)?.has(to) ?? false;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function durableWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.open(temporaryPath, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function durableJson(filePath: string, value: unknown): Promise<void> {
  await durableWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, "a");
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function eventId(): string {
  return `event-${crypto.randomUUID()}`;
}

function lockToken(): string {
  return `lock-${crypto.randomBytes(16).toString("hex")}`;
}

function isExpired(timestamp: string | undefined, at: Date): boolean {
  return (
    timestamp !== undefined && new Date(timestamp).getTime() <= at.getTime()
  );
}

function defaultNonOverridable(taskId: string): boolean {
  return (
    taskId === "math.math-verification" ||
    taskId.endsWith(".publish") ||
    taskId.endsWith(".publish-approval")
  );
}

export class WorkflowStore {
  public readonly root: string;
  public readonly statePath: string;
  public readonly eventsPath: string;
  public readonly approvalsPath: string;
  public readonly overridesPath: string;
  public readonly locksRoot: string;
  public readonly runsRoot: string;
  public readonly cacheDecisionsPath: string;

  private readonly workflow: WorkflowDefinition;
  private readonly now: () => Date;
  private readonly staleAfterMs: number;
  private readonly nonOverridableTaskIds: ReadonlySet<string>;

  public constructor(private readonly options: WorkflowStoreOptions) {
    this.workflow = workflowDefinitionSchema.parse(options.workflow);
    const instanceId = workflowInstanceIdSchema.parse(
      options.identity.instanceId
    );
    this.root = path.join(
      path.resolve(options.unitRoot),
      "state",
      "workflow",
      this.workflow.id
    );
    this.statePath = path.join(this.root, "state.json");
    this.eventsPath = path.join(this.root, "events.jsonl");
    this.approvalsPath = path.join(this.root, "approvals.json");
    this.overridesPath = path.join(this.root, "overrides.json");
    this.locksRoot = path.join(this.root, "locks");
    this.runsRoot = path.join(this.root, "runs");
    this.cacheDecisionsPath = path.join(this.root, "cache", "decisions.jsonl");
    this.now = options.now ?? (() => new Date());
    this.staleAfterMs = options.staleAfterMs ?? 15 * 60 * 1_000;
    this.nonOverridableTaskIds =
      options.nonOverridableTaskIds ?? new Set<string>();
    workflowInstanceIdSchema.parse(instanceId);
  }

  public async initialize(): Promise<WorkflowInstance> {
    if (await pathExists(this.eventsPath)) {
      const events = await this.readEvents();
      if (events.length > 0) {
        throw new WorkflowStoreError(
          "ALREADY_INITIALIZED",
          "Workflow event history already exists."
        );
      }
    }
    await this.ensureOperatorFiles();
    const now = this.now().toISOString();
    const created = workflowEventSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      eventId: eventId(),
      workflowInstanceId: this.options.identity.instanceId,
      occurredAt: now,
      eventType: "workflow-created",
      workflow: this.workflow,
      unitId: this.options.identity.unitId,
      profileId: this.workflow.profileId,
      locale: this.options.identity.locale,
      variant: this.options.identity.variant,
    });
    await appendJsonLine(this.eventsPath, created);
    await this.options.hooks?.afterEventAppend?.(created);
    return this.rebuildState();
  }

  public async readEvents(): Promise<readonly WorkflowEvent[]> {
    let content: string;
    try {
      content = await fs.readFile(this.eventsPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const events: WorkflowEvent[] = [];
    const ids = new Set<string>();
    for (const [index, line] of content.split("\n").entries()) {
      if (line.trim().length === 0) continue;
      try {
        const event = workflowEventSchema.parse(JSON.parse(line) as unknown);
        if (ids.has(event.eventId)) {
          throw new WorkflowStoreError(
            "DUPLICATE_EVENT",
            `Duplicate workflow event ${event.eventId}.`
          );
        }
        ids.add(event.eventId);
        events.push(event);
      } catch (error) {
        if (error instanceof WorkflowStoreError) throw error;
        throw new WorkflowStoreError(
          "EVENT_LOG_CORRUPT",
          `Workflow event line ${index + 1} is invalid.`,
          { line: index + 1 },
          error
        );
      }
    }
    return events;
  }

  public async readState(): Promise<WorkflowInstance> {
    try {
      const state = workflowInstanceSchema.parse(
        JSON.parse(await fs.readFile(this.statePath, "utf8")) as unknown
      );
      const events = await this.readEvents();
      if (
        state.id !== this.options.identity.instanceId ||
        state.materializedFromEventId !== events.at(-1)?.eventId
      ) {
        return this.rebuildState();
      }
      return state;
    } catch {
      return this.rebuildState();
    }
  }

  public async rebuildState(): Promise<WorkflowInstance> {
    const events = await this.readEvents();
    const createdEvents = events.filter(
      (event) => event.eventType === "workflow-created"
    );
    if (
      createdEvents.length !== 1 ||
      events[0]?.eventType !== "workflow-created"
    ) {
      throw new WorkflowStoreError(
        "NOT_INITIALIZED",
        "Workflow history must begin with exactly one creation event."
      );
    }
    const created = createdEvents[0];
    if (!created || created.eventType !== "workflow-created") {
      throw new WorkflowStoreError(
        "NOT_INITIALIZED",
        "Creation event is missing."
      );
    }
    this.assertCreationIdentity(created);
    const approvals = await this.readOperatorRecords(
      this.approvalsPath,
      approvalRecordSchema
    );
    const overrides = await this.readOperatorRecords(
      this.overridesPath,
      operatorOverrideSchema
    );
    const approvalById = new Map(
      approvals.map((record) => [record.id, record])
    );
    const overrideById = new Map(
      overrides.map((record) => [record.id, record])
    );
    const tasks = new Map<TaskId, WorkflowTaskState>();
    for (const taskId of created.workflow.taskIds) {
      tasks.set(
        taskId,
        workflowTaskStateSchema.parse({
          taskId,
          status: "pending",
          reasons: [],
          updatedAt: created.occurredAt,
        })
      );
    }
    for (const event of events.slice(1)) {
      if (event.workflowInstanceId !== created.workflowInstanceId) {
        throw new WorkflowStoreError(
          "IDENTITY_MISMATCH",
          `Event ${event.eventId} belongs to another workflow instance.`
        );
      }
      if (event.eventType === "approval-recorded") {
        const record = approvalById.get(event.approvalId);
        if (
          !record ||
          record.taskId !== event.taskId ||
          record.workflowInstanceId !== created.workflowInstanceId ||
          record.profileId !== created.profileId ||
          record.unitId !== created.unitId ||
          record.locale !== created.locale ||
          record.variant !== created.variant ||
          !tasks.has(record.taskId)
        ) {
          throw new WorkflowStoreError(
            "OPERATOR_RECORD_INVALID",
            `Approval event ${event.eventId} has no matching validated record.`
          );
        }
        continue;
      }
      if (event.eventType === "override-recorded") {
        const record = overrideById.get(event.overrideId);
        if (
          !record ||
          record.taskId !== event.taskId ||
          record.workflowInstanceId !== created.workflowInstanceId ||
          !tasks.has(record.taskId)
        ) {
          throw new WorkflowStoreError(
            "OPERATOR_RECORD_INVALID",
            `Override event ${event.eventId} has no matching validated record.`
          );
        }
        continue;
      }
      if (event.eventType !== "task-state-changed") continue;
      const previous = tasks.get(event.taskId);
      if (!previous || previous.status !== event.from) {
        throw new WorkflowStoreError(
          "INVALID_TRANSITION",
          `Event ${event.eventId} expected ${event.taskId} in ${event.from}.`,
          { actual: previous?.status }
        );
      }
      const next =
        event.taskState ?? (await this.deriveLegacyEventState(event));
      const manualOverride =
        next.status === "succeeded" && next.overrideId
          ? overrideById.get(next.overrideId)
          : undefined;
      if (manualOverride) {
        if (
          manualOverride.scope !== "task-success" ||
          manualOverride.taskId !== event.taskId ||
          manualOverride.boundRevision !== created.workflow.revision ||
          this.nonOverridableTaskIds.has(event.taskId) ||
          defaultNonOverridable(event.taskId)
        ) {
          throw new WorkflowStoreError(
            "OVERRIDE_FORBIDDEN",
            `Manual success event ${event.eventId} is not backed by a current permitted override.`
          );
        }
      }
      this.assertTransition(event.from, event.to, manualOverride !== undefined);
      if (
        next.taskId !== event.taskId ||
        next.status !== event.to ||
        next.updatedAt !== event.occurredAt
      ) {
        throw new WorkflowStoreError(
          "EVENT_LOG_CORRUPT",
          `Event ${event.eventId} task state does not match its transition.`
        );
      }
      tasks.set(event.taskId, next);
    }
    const state = workflowInstanceSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: created.workflowInstanceId,
      workflowId: created.workflow.id,
      workflowRevision: created.workflow.revision,
      unitId: created.unitId,
      profileId: created.profileId,
      locale: created.locale,
      variant: created.variant,
      tasks: created.workflow.taskIds.map((taskId) => tasks.get(taskId)),
      materializedFromEventId: events.at(-1)?.eventId,
      createdAt: created.occurredAt,
      updatedAt: events.at(-1)?.occurredAt ?? created.occurredAt,
    });
    await durableJson(this.statePath, state);
    return state;
  }

  public async transition(
    input: WorkflowTransitionInput
  ): Promise<WorkflowInstance> {
    return this.transitionInternal(input, false);
  }

  private async transitionInternal(
    input: WorkflowTransitionInput,
    allowManualSuccess: boolean
  ): Promise<WorkflowInstance> {
    const state = await this.readState();
    const taskId = taskIdSchema.parse(input.taskId);
    const previous = state.tasks.find((task) => task.taskId === taskId);
    if (!previous) {
      throw new WorkflowStoreError(
        "INVALID_TRANSITION",
        `Task ${taskId} is not part of this workflow.`
      );
    }
    this.assertTransition(previous.status, input.to, allowManualSuccess);
    const occurredAt = this.now().toISOString();
    const taskState = this.buildTaskState(input, occurredAt);
    const event = workflowEventSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      eventId: eventId(),
      workflowInstanceId: state.id,
      occurredAt,
      eventType: "task-state-changed",
      taskId,
      from: previous.status,
      to: input.to,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      taskState,
    });
    return this.appendEventAndRebuild(event);
  }

  public async beginAttempt(input: {
    readonly id: string;
    readonly runId: string;
    readonly taskId: string;
    readonly fingerprint: string;
    readonly attemptNumber: number;
  }): Promise<WorkflowAttemptRecord> {
    const state = await this.readState();
    const startedAt = this.now().toISOString();
    const attempt = workflowAttemptRecordSchema.parse({
      schemaVersion: WORKFLOW_STORE_VERSION,
      status: "running",
      id: input.id,
      runId: input.runId,
      workflowInstanceId: state.id,
      taskId: input.taskId,
      fingerprint: input.fingerprint,
      attemptNumber: input.attemptNumber,
      startedAt,
    });
    await this.writeAttempt(attempt, false);
    await this.transition({
      taskId: attempt.taskId,
      to: "running",
      attemptId: attempt.id,
    });
    return attempt;
  }

  public async completeAttempt(input: {
    readonly id: string;
    readonly result: TaskResult;
  }): Promise<WorkflowAttemptRecord> {
    const running = await this.readAttempt(input.id);
    if (running.status !== "running") {
      throw new WorkflowStoreError(
        "ATTEMPT_INVALID",
        `Attempt ${running.id} is already completed.`
      );
    }
    const result = taskResultSchema.parse(input.result);
    const completedAt = this.now().toISOString();
    const completed = workflowAttemptRecordSchema.parse({
      ...running,
      status: "completed",
      completedAt,
      result,
    });
    await this.writeAttempt(completed, true);
    if (result.status === "succeeded") {
      await this.transition({
        taskId: completed.taskId,
        to: "succeeded",
        attemptId: completed.id,
        outputManifestIds: result.outputs.map((output) => output.id),
      });
    } else if (result.status === "failed") {
      await this.transition({
        taskId: completed.taskId,
        to: result.error.code === "INTERRUPTED" ? "interrupted" : "failed",
        attemptId: completed.id,
        errorCode: result.error.code,
        reason: result.error.message,
      });
    } else {
      await this.transition({
        taskId: completed.taskId,
        to: "skipped",
        reason: result.reason,
      });
    }
    return completed;
  }

  public async readAttempt(attemptId: string): Promise<WorkflowAttemptRecord> {
    const parsedId = attemptIdSchema.parse(attemptId);
    const matches = await this.findAttemptPaths(parsedId);
    if (matches.length !== 1) {
      throw new WorkflowStoreError(
        "ATTEMPT_INVALID",
        `Expected one attempt record for ${parsedId}, found ${matches.length}.`
      );
    }
    return workflowAttemptRecordSchema.parse(
      JSON.parse(await fs.readFile(matches[0]!, "utf8")) as unknown
    );
  }

  public async listAttempts(
    taskIdInput?: string
  ): Promise<readonly WorkflowAttemptRecord[]> {
    const taskId =
      taskIdInput === undefined ? undefined : taskIdSchema.parse(taskIdInput);
    return (await this.readAllAttempts())
      .filter((attempt) => taskId === undefined || attempt.taskId === taskId)
      .sort((left, right) =>
        left.startedAt === right.startedAt
          ? left.id.localeCompare(right.id)
          : left.startedAt.localeCompare(right.startedAt)
      );
  }

  public async recordCacheDecision(
    decisionInput: CacheDecision
  ): Promise<void> {
    const state = await this.readState();
    const decision = cacheDecisionSchema.parse(decisionInput);
    this.assertTaskInState(decision.taskId, state);
    await appendJsonLine(this.cacheDecisionsPath, {
      ...decision,
      workflowInstanceId: state.id,
      checkedAt: this.now().toISOString(),
    });
  }

  public async readCacheDecisions(): Promise<
    readonly (CacheDecision & {
      readonly workflowInstanceId: string;
      readonly checkedAt: string;
    })[]
  > {
    let content: string;
    try {
      content = await fs.readFile(this.cacheDecisionsPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const state = await this.readState();
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        try {
          const record = cacheDecisionRecordSchema.parse(
            JSON.parse(line) as unknown
          );
          if (record.workflowInstanceId !== state.id) {
            throw new Error("Cache decision identity is invalid.");
          }
          return record;
        } catch (error) {
          throw new WorkflowStoreError(
            "EVENT_LOG_CORRUPT",
            `Cache decision line ${index + 1} is invalid.`,
            { line: index + 1 },
            error
          );
        }
      });
  }

  public async interruptAttempt(
    attemptId: string,
    reason: string
  ): Promise<void> {
    const running = await this.readAttempt(attemptId);
    if (running.status !== "running") return;
    const error = normalizedWorkflowErrorSchema.parse({
      schemaVersion: ERROR_SCHEMA_VERSION,
      code: "INTERRUPTED",
      message: reason,
      retryable: true,
      remediation: "Resume the interrupted workflow when ready.",
      taskId: running.taskId,
      attemptId: running.id,
    });
    await this.completeAttempt({
      id: running.id,
      result: {
        schemaVersion: TASK_SCHEMA_VERSION,
        status: "failed",
        error,
      },
    });
  }

  public async recordApproval(recordInput: ApprovalRecord): Promise<void> {
    const record = approvalRecordSchema.parse(recordInput);
    const state = await this.readState();
    this.assertOperatorIdentity(record, state);
    this.assertTaskInState(record.taskId, state);
    await this.ensureOperatorRecord(
      this.approvalsPath,
      record,
      approvalRecordSchema
    );
    if (
      (await this.readEvents()).some(
        (event) =>
          event.eventType === "approval-recorded" &&
          event.approvalId === record.id
      )
    ) {
      return;
    }
    await this.appendEventAndRebuild(
      workflowEventSchema.parse({
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        eventId: eventId(),
        workflowInstanceId: state.id,
        occurredAt: this.now().toISOString(),
        eventType: "approval-recorded",
        approvalId: record.id,
        taskId: record.taskId,
      })
    );
  }

  public async recordOverride(recordInput: OperatorOverride): Promise<void> {
    const record = operatorOverrideSchema.parse(recordInput);
    const state = await this.readState();
    if (record.workflowInstanceId !== state.id) {
      throw new WorkflowStoreError(
        "IDENTITY_MISMATCH",
        "Override belongs to another workflow instance."
      );
    }
    this.assertTaskInState(record.taskId, state);
    await this.ensureOperatorRecord(
      this.overridesPath,
      record,
      operatorOverrideSchema
    );
    if (
      (await this.readEvents()).some(
        (event) =>
          event.eventType === "override-recorded" &&
          event.overrideId === record.id
      )
    ) {
      return;
    }
    await this.appendEventAndRebuild(
      workflowEventSchema.parse({
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        eventId: eventId(),
        workflowInstanceId: state.id,
        occurredAt: this.now().toISOString(),
        eventType: "override-recorded",
        overrideId: record.id,
        taskId: record.taskId,
      })
    );
  }

  public async applyManualSuccess(
    recordInput: OperatorOverride
  ): Promise<void> {
    const record = operatorOverrideSchema.parse(recordInput);
    if (record.scope !== "task-success") {
      throw new WorkflowStoreError(
        "OPERATOR_RECORD_INVALID",
        "Manual success requires a task-success override."
      );
    }
    const state = await this.readState();
    if (record.boundRevision !== state.workflowRevision) {
      throw new WorkflowStoreError(
        "OPERATOR_RECORD_INVALID",
        "Manual success override is stale."
      );
    }
    if (
      this.nonOverridableTaskIds.has(record.taskId) ||
      defaultNonOverridable(record.taskId)
    ) {
      throw new WorkflowStoreError(
        "OVERRIDE_FORBIDDEN",
        `Task ${record.taskId} cannot be manually marked successful.`
      );
    }
    await this.recordOverride(record);
    await this.transitionInternal(
      {
        taskId: record.taskId,
        to: "succeeded",
        overrideId: record.id,
        outputManifestIds: record.outputManifestIds ?? [],
        reason: record.reason,
      },
      true
    );
  }

  public async currentApproval(
    taskIdInput: string,
    context: CurrentApprovalContext
  ): Promise<ApprovalRecord | null> {
    const state = await this.readState();
    const taskId = taskIdSchema.parse(taskIdInput);
    const at = context.at ?? this.now();
    const records = await this.readOperatorRecords(
      this.approvalsPath,
      approvalRecordSchema
    );
    const recordedApprovalIds = new Set(
      (await this.readEvents())
        .filter((event) => event.eventType === "approval-recorded")
        .map((event) => event.approvalId)
    );
    const matching = records
      .filter(
        (record) =>
          record.taskId === taskId && recordedApprovalIds.has(record.id)
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const latest = matching.at(-1);
    if (
      !latest ||
      latest.decision !== "approved" ||
      latest.boundRevision !== state.workflowRevision ||
      isExpired(latest.expiresAt, at) ||
      !sameStrings(latest.artifactHashes, context.artifactHashes)
    ) {
      return null;
    }
    return latest;
  }

  public async deriveNext(
    registry: TaskRegistry,
    options: {
      readonly availableArtifacts: readonly ArtifactContract[];
      readonly approvalArtifactHashes?: Readonly<
        Record<string, readonly string[]>
      >;
      readonly invalidatedTaskIds?: ReadonlySet<TaskId>;
    }
  ): Promise<DerivedNextResult> {
    const state = await this.readState();
    const invalidatedTaskIds = options.invalidatedTaskIds ?? new Set<TaskId>();
    const completedTaskIds = new Set<TaskId>(
      state.tasks
        .filter(
          (task) => task.status === "succeeded" || task.status === "skipped"
        )
        .filter((task) => !invalidatedTaskIds.has(task.taskId))
        .map((task) => task.taskId)
    );
    const approvedTaskIds = new Set<TaskId>();
    const currentOverrides = await this.currentOverrides();
    for (const taskId of this.workflow.taskIds) {
      if (
        await this.currentApproval(taskId, {
          artifactHashes: options.approvalArtifactHashes?.[taskId] ?? [],
        })
      ) {
        approvedTaskIds.add(taskId);
      }
    }
    const plan = registry.plan(this.workflow, {
      completedTaskIds,
      availableArtifacts: options.availableArtifacts,
      approvedTaskIds,
    });
    const persistedById = new Map(
      state.tasks.map((task) => [task.taskId, task] as const)
    );
    const tasks = plan.tasks.map((entry): DerivedTaskState => {
      const persisted = persistedById.get(entry.taskId);
      if (!persisted) {
        throw new WorkflowStoreError(
          "IDENTITY_MISMATCH",
          `Planned task ${entry.taskId} is absent from state.`
        );
      }
      let readiness = entry.readiness;
      const overrides = currentOverrides.get(entry.taskId) ?? [];
      const overrideAllowed =
        !this.nonOverridableTaskIds.has(entry.taskId) &&
        !defaultNonOverridable(entry.taskId);
      if (
        readiness.status === "blocked" &&
        overrideAllowed &&
        readiness.missingDependencies.length === 0
      ) {
        const overridesArtifactCompatibility = overrides.some(
          (record) => record.scope === "artifact-compatibility"
        );
        const overridesOtherGate =
          readiness.missingArtifacts.length === 0 &&
          overrides.some(
            (record) =>
              record.scope === "readiness" || record.scope === "quality"
          );
        if (overridesArtifactCompatibility || overridesOtherGate) {
          readiness = {
            status: "ready",
            reasons: overrides.map(
              (record) => `Operator override ${record.id}: ${record.reason}`
            ),
            missingDependencies: [],
            missingArtifacts: [],
          };
        }
      }
      if (persisted.status === "running") {
        readiness = {
          status: "blocked",
          reasons: [`Task ${entry.taskId} already has a running attempt.`],
          missingDependencies: [],
          missingArtifacts: [],
        };
      } else if (
        persisted.status === "failed" ||
        persisted.status === "interrupted"
      ) {
        readiness = {
          status: "blocked",
          reasons: [
            `Task ${entry.taskId} requires an explicit retry or resume.`,
          ],
          missingDependencies: [],
          missingArtifacts: [],
        };
      } else if (
        (persisted.status === "succeeded" || persisted.status === "skipped") &&
        !invalidatedTaskIds.has(entry.taskId)
      ) {
        readiness = {
          status: "not-applicable",
          reasons: [`Task ${entry.taskId} is already complete.`],
          missingDependencies: [],
          missingArtifacts: [],
        };
      } else if (invalidatedTaskIds.has(entry.taskId)) {
        readiness = {
          ...readiness,
          reasons: [
            `Task ${entry.taskId} has stale cache or dependency evidence.`,
            ...readiness.reasons,
          ],
        };
      }
      return {
        taskId: entry.taskId,
        persistedStatus: persisted.status,
        readiness,
      };
    });
    return {
      workflowInstanceId: state.id,
      nextTaskId:
        tasks.find((task) => task.readiness.status === "ready")?.taskId ?? null,
      tasks,
    };
  }

  public async acquireLock(input: {
    readonly scope: WorkflowLock["scope"];
    readonly key: string;
    readonly owner: string;
    readonly runId?: string;
    readonly attemptId?: string;
  }): Promise<WorkflowLock> {
    const lockPath = this.lockPath(input.scope, input.key);
    await fs.mkdir(this.locksRoot, { recursive: true });
    if (await pathExists(lockPath)) {
      const existing = workflowLockSchema.parse(
        JSON.parse(await fs.readFile(lockPath, "utf8")) as unknown
      );
      if (!this.isStale(existing.heartbeatAt)) {
        throw new WorkflowStoreError(
          "LOCK_ACTIVE",
          `Lock ${input.scope}:${input.key} is held by ${existing.owner}.`,
          { lock: existing }
        );
      }
      const current = workflowLockSchema.parse(
        JSON.parse(await fs.readFile(lockPath, "utf8")) as unknown
      );
      if (
        current.token !== existing.token ||
        !this.isStale(current.heartbeatAt)
      ) {
        throw new WorkflowStoreError(
          "LOCK_ACTIVE",
          `Lock ${input.scope}:${input.key} changed during stale-lock recovery.`
        );
      }
      await fs.unlink(lockPath);
      await this.appendEventAndRebuild(
        workflowEventSchema.parse({
          schemaVersion: WORKFLOW_SCHEMA_VERSION,
          eventId: eventId(),
          workflowInstanceId: this.options.identity.instanceId,
          occurredAt: this.now().toISOString(),
          eventType: "lock-recovered",
          lockKey: `${input.scope}:${input.key}`,
          previousOwner: existing.owner,
          reason: "Stale lock exceeded the configured threshold.",
        })
      );
    }
    const now = this.now().toISOString();
    const lock = workflowLockSchema.parse({
      schemaVersion: WORKFLOW_STORE_VERSION,
      token: lockToken(),
      scope: input.scope,
      key: input.key,
      owner: input.owner,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      acquiredAt: now,
      heartbeatAt: now,
    });
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new WorkflowStoreError(
          "LOCK_ACTIVE",
          `Lock ${input.scope}:${input.key} was acquired concurrently.`
        );
      }
      throw error;
    }
    return lock;
  }

  public async heartbeatLock(lock: WorkflowLock): Promise<WorkflowLock> {
    const current = await this.readOwnedLock(lock);
    const heartbeat = workflowLockSchema.parse({
      ...current,
      heartbeatAt: this.now().toISOString(),
    });
    await durableJson(this.lockPath(lock.scope, lock.key), heartbeat);
    return heartbeat;
  }

  public async releaseLock(lock: WorkflowLock): Promise<void> {
    await this.readOwnedLock(lock);
    await fs.unlink(this.lockPath(lock.scope, lock.key));
  }

  public async detectStaleRecords(): Promise<StaleWorkflowRecords> {
    const locks = (await this.readLocks()).filter((lock) =>
      this.isStale(lock.heartbeatAt)
    );
    const attempts = (await this.readAllAttempts()).filter(
      (attempt) =>
        attempt.status === "running" && this.isStale(attempt.startedAt)
    );
    return { locks, attempts };
  }

  public async recoverStaleRecords(): Promise<StaleWorkflowRecords> {
    const stale = await this.detectStaleRecords();
    for (const lock of stale.locks) {
      await this.releaseStaleLock(lock);
    }
    for (const attempt of stale.attempts) {
      const state = await this.readState();
      const task = state.tasks.find(
        (candidate) => candidate.taskId === attempt.taskId
      );
      if (task?.status === "running" && task.attemptId === attempt.id) {
        await this.interruptAttempt(
          attempt.id,
          "The run exceeded the stale-attempt threshold and was interrupted during reconciliation."
        );
      } else if (attempt.status === "running") {
        await this.interruptOrphanAttempt(
          attempt,
          "The stale attempt was not reflected in task state and was interrupted during reconciliation."
        );
      }
    }
    return stale;
  }

  public async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    const importedSuccessTaskIds: TaskId[] = [];
    const invalidatedTaskIds: TaskId[] = [];
    const evidenceOnlyTaskIds: TaskId[] = [];
    if (input.verifyArtifact) {
      const state = await this.readState();
      for (const task of state.tasks) {
        if (task.status !== "succeeded" || !task.attemptId) continue;
        const attempt = await this.readAttempt(task.attemptId);
        if (
          attempt.status !== "completed" ||
          attempt.result.status !== "succeeded" ||
          attempt.result.outputs.length === 0
        ) {
          continue;
        }
        const verified = await Promise.all(
          attempt.result.outputs.map((manifest) =>
            input.verifyArtifact!(manifest)
          )
        );
        if (verified.every(Boolean)) continue;
        await this.recordReconciliationEvent({
          taskId: task.taskId,
          evidenceKind: "artifact-manifest",
          evidencePaths: attempt.result.outputs.map(
            (manifest) => manifest.relativePath
          ),
          disposition: "task-invalidated",
          reason:
            "Materialized success referenced a missing or invalid output artifact.",
        });
        await this.transition({
          taskId: task.taskId,
          to: "invalidated",
          reason: "Reconciliation found missing or invalid output artifacts.",
        });
        invalidatedTaskIds.push(task.taskId);
      }
    }
    for (const rawEvidence of input.subsystemEvidence ?? []) {
      const taskId = taskIdSchema.parse(rawEvidence.taskId);
      await this.recordReconciliationEvent({
        taskId,
        evidenceKind: "subsystem-manifest",
        evidencePaths: [rawEvidence.path],
        disposition: "evidence-only",
        reason: rawEvidence.validated
          ? rawEvidence.reason
          : `Unvalidated subsystem evidence: ${rawEvidence.reason}`,
      });
      evidenceOnlyTaskIds.push(taskId);
    }

    const manifests = (input.artifactManifests ?? []).map((manifest) =>
      artifactManifestSchema.parse(manifest)
    );
    const grouped = new Map<TaskId, ArtifactManifest[]>();
    for (const manifest of manifests) {
      const existing = grouped.get(manifest.producerTaskId) ?? [];
      existing.push(manifest);
      grouped.set(manifest.producerTaskId, existing);
    }
    for (const [taskId, taskManifests] of grouped) {
      const state = await this.readState();
      const task = state.tasks.find((candidate) => candidate.taskId === taskId);
      if (!task) {
        throw new WorkflowStoreError(
          "RECONCILIATION_INVALID",
          `Artifact evidence names unknown task ${taskId}.`
        );
      }
      const verified = input.verifyArtifact
        ? await Promise.all(
            taskManifests.map((manifest) => input.verifyArtifact!(manifest))
          )
        : taskManifests.map(() => false);
      if (task.status === "succeeded" && verified.some((value) => !value)) {
        await this.recordReconciliationEvent({
          taskId,
          evidenceKind: "artifact-manifest",
          evidencePaths: taskManifests.map((manifest) => manifest.relativePath),
          disposition: "task-invalidated",
          reason:
            "A materialized success referenced an invalid output artifact.",
        });
        await this.transition({
          taskId,
          to: "invalidated",
          reason: "Reconciliation found invalid output artifacts.",
        });
        invalidatedTaskIds.push(taskId);
        continue;
      }
      const attemptIds = new Set(
        taskManifests.map((manifest) => manifest.producerAttemptId)
      );
      if (
        task.status !== "running" ||
        attemptIds.size !== 1 ||
        !attemptIds.has(task.attemptId) ||
        verified.some((value) => !value)
      ) {
        await this.recordReconciliationEvent({
          taskId,
          evidenceKind: "artifact-manifest",
          evidencePaths: taskManifests.map((manifest) => manifest.relativePath),
          disposition: "evidence-only",
          reason:
            "Evidence was retained but did not prove a matching running attempt with valid outputs.",
        });
        evidenceOnlyTaskIds.push(taskId);
        continue;
      }
      const attempt = await this.readAttempt(task.attemptId);
      if (attempt.status !== "running") {
        throw new WorkflowStoreError(
          "RECONCILIATION_INVALID",
          `Attempt ${attempt.id} is not running during output reconciliation.`
        );
      }
      await this.recordReconciliationEvent({
        taskId,
        evidenceKind: "artifact-manifest",
        evidencePaths: taskManifests.map((manifest) => manifest.relativePath),
        disposition: "task-succeeded",
        reason:
          "Validated canonical artifact manifests completed before state persistence.",
      });
      await this.completeAttempt({
        id: attempt.id,
        result: {
          schemaVersion: TASK_SCHEMA_VERSION,
          status: "succeeded",
          outputs: taskManifests,
          warnings: ["Success was reconciled after artifact promotion."],
        },
      });
      importedSuccessTaskIds.push(taskId);
    }
    return { importedSuccessTaskIds, invalidatedTaskIds, evidenceOnlyTaskIds };
  }

  private async appendEventAndRebuild(
    event: WorkflowEvent
  ): Promise<WorkflowInstance> {
    const parsed = workflowEventSchema.parse(event);
    const events = await this.readEvents();
    if (events.some((candidate) => candidate.eventId === parsed.eventId)) {
      throw new WorkflowStoreError(
        "DUPLICATE_EVENT",
        `Event ${parsed.eventId} already exists.`
      );
    }
    await appendJsonLine(this.eventsPath, parsed);
    await this.options.hooks?.afterEventAppend?.(parsed);
    return this.rebuildState();
  }

  private buildTaskState(
    input: WorkflowTransitionInput,
    updatedAt: string
  ): WorkflowTaskState {
    const base = { taskId: input.taskId, updatedAt };
    switch (input.to) {
      case "pending":
      case "ready":
        return workflowTaskStateSchema.parse({
          ...base,
          status: input.to,
          reasons: input.reasons ?? (input.reason ? [input.reason] : []),
        });
      case "blocked":
      case "awaiting-approval":
        return workflowTaskStateSchema.parse({
          ...base,
          status: input.to,
          reasons: input.reasons ?? (input.reason ? [input.reason] : []),
        });
      case "running":
        return workflowTaskStateSchema.parse({
          ...base,
          status: input.to,
          attemptId: input.attemptId,
          startedAt: updatedAt,
        });
      case "succeeded":
        return workflowTaskStateSchema.parse({
          ...base,
          status: input.to,
          ...(input.attemptId ? { attemptId: input.attemptId } : {}),
          ...(input.overrideId ? { overrideId: input.overrideId } : {}),
          outputManifestIds: input.outputManifestIds ?? [],
          completedAt: updatedAt,
        });
      case "failed":
      case "interrupted":
        return workflowTaskStateSchema.parse({
          ...base,
          status: input.to,
          attemptId: input.attemptId,
          errorCode: input.errorCode,
          completedAt: updatedAt,
        });
      case "skipped":
      case "invalidated":
        return workflowTaskStateSchema.parse({
          ...base,
          status: input.to,
          reason: input.reason,
        });
    }
  }

  private assertTransition(
    from: WorkflowTaskStatus,
    to: WorkflowTaskStatus,
    allowManualSuccess = false
  ): void {
    if (
      !isWorkflowTransitionAllowed(from, to) &&
      !(allowManualSuccess && to === "succeeded" && from !== "running")
    ) {
      throw new WorkflowStoreError(
        "INVALID_TRANSITION",
        `Workflow task cannot transition from ${from} to ${to}.`,
        { from, to }
      );
    }
  }

  private assertCreationIdentity(
    event: Extract<WorkflowEvent, { eventType: "workflow-created" }>
  ): void {
    if (
      event.workflowInstanceId !== this.options.identity.instanceId ||
      event.workflow.id !== this.workflow.id ||
      event.workflow.revision !== this.workflow.revision ||
      event.unitId !== this.options.identity.unitId ||
      event.profileId !== this.workflow.profileId ||
      event.locale !== this.options.identity.locale ||
      event.variant !== this.options.identity.variant
    ) {
      throw new WorkflowStoreError(
        "IDENTITY_MISMATCH",
        "Workflow creation event does not match the configured store identity."
      );
    }
  }

  private async deriveLegacyEventState(
    event: Extract<WorkflowEvent, { eventType: "task-state-changed" }>
  ): Promise<WorkflowTaskState> {
    const input: WorkflowTransitionInput = {
      taskId: event.taskId,
      to: event.to,
      ...(event.attemptId ? { attemptId: event.attemptId } : {}),
      ...(event.reason
        ? { reason: event.reason, errorCode: event.reason }
        : {}),
    };
    if (event.to === "succeeded" && event.attemptId) {
      const attempt = await this.readAttempt(event.attemptId);
      if (
        attempt.status === "completed" &&
        attempt.result.status === "succeeded"
      ) {
        return this.buildTaskState(
          {
            ...input,
            outputManifestIds: attempt.result.outputs.map(
              (output) => output.id
            ),
          },
          event.occurredAt
        );
      }
    }
    return this.buildTaskState(input, event.occurredAt);
  }

  private async ensureOperatorFiles(): Promise<void> {
    const empty = { schemaVersion: WORKFLOW_STORE_VERSION, records: [] };
    if (!(await pathExists(this.approvalsPath))) {
      await durableJson(this.approvalsPath, empty);
    }
    if (!(await pathExists(this.overridesPath))) {
      await durableJson(this.overridesPath, empty);
    }
  }

  private async readOperatorRecords<T>(
    filePath: string,
    schema: z.ZodType<T>
  ): Promise<readonly T[]> {
    await this.ensureOperatorFiles();
    let container: z.infer<typeof operatorRecordsSchema>;
    try {
      container = operatorRecordsSchema.parse(
        JSON.parse(await fs.readFile(filePath, "utf8")) as unknown
      );
      return container.records.map((record) => schema.parse(record));
    } catch (error) {
      throw new WorkflowStoreError(
        "OPERATOR_RECORD_INVALID",
        `Operator record file ${path.basename(filePath)} is invalid.`,
        {},
        error
      );
    }
  }

  private async ensureOperatorRecord<T>(
    filePath: string,
    record: T,
    schema: z.ZodType<T>
  ): Promise<void> {
    const records = await this.readOperatorRecords(filePath, schema);
    const id = Reflect.get(record as object, "id");
    const parsed = schema.parse(record);
    const existing = records.find(
      (candidate) => Reflect.get(candidate as object, "id") === id
    );
    if (existing && JSON.stringify(existing) !== JSON.stringify(parsed)) {
      throw new WorkflowStoreError(
        "OPERATOR_RECORD_INVALID",
        `Operator record ${String(id)} already exists with different content.`
      );
    }
    if (existing) return;
    await durableJson(filePath, {
      schemaVersion: WORKFLOW_STORE_VERSION,
      records: [...records, parsed],
    });
  }

  private assertOperatorIdentity(
    record: ApprovalRecord,
    state: WorkflowInstance
  ): void {
    if (
      record.workflowInstanceId !== state.id ||
      record.profileId !== state.profileId ||
      record.unitId !== state.unitId ||
      record.locale !== state.locale ||
      record.variant !== state.variant
    ) {
      throw new WorkflowStoreError(
        "IDENTITY_MISMATCH",
        "Approval does not match the workflow instance identity."
      );
    }
  }

  private assertTaskInState(taskId: TaskId, state: WorkflowInstance): void {
    if (!state.tasks.some((task) => task.taskId === taskId)) {
      throw new WorkflowStoreError(
        "OPERATOR_RECORD_INVALID",
        `Operator record names task ${taskId}, which is not in this workflow.`
      );
    }
  }

  private async currentOverrides(): Promise<
    ReadonlyMap<TaskId, readonly OperatorOverride[]>
  > {
    const state = await this.readState();
    const at = this.now();
    const records = await this.readOperatorRecords(
      this.overridesPath,
      operatorOverrideSchema
    );
    const recordedOverrideIds = new Set(
      (await this.readEvents())
        .filter((event) => event.eventType === "override-recorded")
        .map((event) => event.overrideId)
    );
    const current = records.filter(
      (record) =>
        recordedOverrideIds.has(record.id) &&
        record.workflowInstanceId === state.id &&
        record.boundRevision === state.workflowRevision &&
        !isExpired(record.expiresAt, at) &&
        record.scope !== "task-success"
    );
    const byTask = new Map<TaskId, OperatorOverride[]>();
    for (const record of current) {
      const values = byTask.get(record.taskId) ?? [];
      values.push(record);
      byTask.set(record.taskId, values);
    }
    return byTask;
  }

  private attemptPath(runId: string, attemptId: string): string {
    return path.join(
      this.runsRoot,
      workflowRunIdSchema.parse(runId),
      `${attemptIdSchema.parse(attemptId)}.json`
    );
  }

  private async writeAttempt(
    attempt: WorkflowAttemptRecord,
    replace: boolean
  ): Promise<void> {
    const parsed = workflowAttemptRecordSchema.parse(attempt);
    const filePath = this.attemptPath(parsed.runId, parsed.id);
    if (!replace && (await pathExists(filePath))) {
      throw new WorkflowStoreError(
        "ATTEMPT_INVALID",
        `Attempt ${parsed.id} already exists.`
      );
    }
    await durableJson(filePath, parsed);
  }

  private async findAttemptPaths(
    attemptId: string
  ): Promise<readonly string[]> {
    let runEntries: import("node:fs").Dirent[];
    try {
      runEntries = await fs.readdir(this.runsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const matches: string[] = [];
    for (const entry of runEntries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(
        this.runsRoot,
        entry.name,
        `${attemptId}.json`
      );
      if (await pathExists(candidate)) matches.push(candidate);
    }
    return matches;
  }

  private async readAllAttempts(): Promise<readonly WorkflowAttemptRecord[]> {
    let runEntries: import("node:fs").Dirent[];
    try {
      runEntries = await fs.readdir(this.runsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const attempts: WorkflowAttemptRecord[] = [];
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory()) continue;
      const runRoot = path.join(this.runsRoot, runEntry.name);
      for (const entry of await fs.readdir(runRoot, { withFileTypes: true })) {
        if (
          !entry.isFile() ||
          !entry.name.endsWith(".json") ||
          entry.name.endsWith(".telemetry.json")
        )
          continue;
        attempts.push(
          workflowAttemptRecordSchema.parse(
            JSON.parse(
              await fs.readFile(path.join(runRoot, entry.name), "utf8")
            ) as unknown
          )
        );
      }
    }
    return attempts;
  }

  private lockPath(scope: WorkflowLock["scope"], key: string): string {
    return path.join(
      this.locksRoot,
      `${scope}-${sha256(key).slice(0, 24)}.json`
    );
  }

  private isStale(timestamp: string): boolean {
    return (
      this.now().getTime() - new Date(timestamp).getTime() >= this.staleAfterMs
    );
  }

  private async readLocks(): Promise<readonly WorkflowLock[]> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(this.locksRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const locks: WorkflowLock[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      locks.push(
        workflowLockSchema.parse(
          JSON.parse(
            await fs.readFile(path.join(this.locksRoot, entry.name), "utf8")
          ) as unknown
        )
      );
    }
    return locks;
  }

  private async readOwnedLock(lock: WorkflowLock): Promise<WorkflowLock> {
    const current = workflowLockSchema.parse(
      JSON.parse(
        await fs.readFile(this.lockPath(lock.scope, lock.key), "utf8")
      ) as unknown
    );
    if (current.token !== lock.token || current.owner !== lock.owner) {
      throw new WorkflowStoreError(
        "LOCK_OWNERSHIP_MISMATCH",
        `Lock ${lock.scope}:${lock.key} is owned by another process.`
      );
    }
    return current;
  }

  private async releaseStaleLock(lock: WorkflowLock): Promise<void> {
    const current = workflowLockSchema.parse(
      JSON.parse(
        await fs.readFile(this.lockPath(lock.scope, lock.key), "utf8")
      ) as unknown
    );
    if (current.token !== lock.token || !this.isStale(current.heartbeatAt)) {
      throw new WorkflowStoreError(
        "LOCK_ACTIVE",
        `Lock ${lock.scope}:${lock.key} changed during stale-lock recovery.`
      );
    }
    await fs.unlink(this.lockPath(lock.scope, lock.key));
    await this.appendEventAndRebuild(
      workflowEventSchema.parse({
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        eventId: eventId(),
        workflowInstanceId: this.options.identity.instanceId,
        occurredAt: this.now().toISOString(),
        eventType: "lock-recovered",
        lockKey: `${lock.scope}:${lock.key}`,
        previousOwner: lock.owner,
        reason: "Stale lock was removed during workflow reconciliation.",
      })
    );
  }

  private async recordReconciliationEvent(input: {
    readonly taskId: TaskId;
    readonly evidenceKind: "artifact-manifest" | "subsystem-manifest";
    readonly evidencePaths: readonly string[];
    readonly disposition:
      | "evidence-only"
      | "task-succeeded"
      | "task-invalidated";
    readonly reason: string;
  }): Promise<void> {
    await this.appendEventAndRebuild(
      workflowEventSchema.parse({
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        eventId: eventId(),
        workflowInstanceId: this.options.identity.instanceId,
        occurredAt: this.now().toISOString(),
        eventType: "reconciliation-recorded",
        ...input,
      })
    );
  }

  private async interruptOrphanAttempt(
    running: Extract<WorkflowAttemptRecord, { status: "running" }>,
    reason: string
  ): Promise<void> {
    const error = normalizedWorkflowErrorSchema.parse({
      schemaVersion: ERROR_SCHEMA_VERSION,
      code: "INTERRUPTED",
      message: reason,
      retryable: true,
      remediation: "Reconcile task state before starting a new attempt.",
      taskId: running.taskId,
      attemptId: running.id,
    });
    await this.writeAttempt(
      workflowAttemptRecordSchema.parse({
        ...running,
        status: "completed",
        completedAt: this.now().toISOString(),
        result: {
          schemaVersion: TASK_SCHEMA_VERSION,
          status: "failed",
          error,
        },
      }),
      true
    );
    await this.recordReconciliationEvent({
      taskId: running.taskId,
      evidenceKind: "subsystem-manifest",
      evidencePaths: [
        path.relative(this.root, this.attemptPath(running.runId, running.id)),
      ],
      disposition: "evidence-only",
      reason,
    });
  }
}
