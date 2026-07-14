import crypto from "node:crypto";

import {
  OVERRIDE_SCHEMA_VERSION,
  TASK_SCHEMA_VERSION,
  artifactManifestSchema,
  attemptIdSchema,
  contentLocaleSchema,
  contentVariantSchema,
  operatorOverrideSchema,
  productionUnitIdSchema,
  taskFingerprintSchema,
  taskIdSchema,
  workflowRunIdSchema,
  type ArtifactContract,
  type ArtifactManifest,
  type OperatorOverride,
  type TaskFingerprint,
  type TaskId,
  type WorkflowDefinition,
  type WorkflowInstance,
} from "@mediaforge/domain";

import {
  WorkflowBlockedError,
  WorkflowConflictError,
  WorkflowPermanentFailureError,
  normalizeWorkflowError,
  errorCodeToExitCode,
} from "./workflow-errors.js";
import { AttemptObservabilityStore } from "./attempt-observability.js";
import {
  buildTaskFingerprint,
  evaluateTaskCache,
  planCachePrune,
  type CacheDecision,
  type CachePrunePlan,
  type LegacyCacheAdapter,
  type TaskFingerprintMaterial,
} from "./cache.js";
import { type TaskRegistry } from "./task-registry.js";
import {
  WorkflowStore,
  WorkflowStoreError,
  type ReconcileInput,
  type ReconcileResult,
  type WorkflowStoreIdentity,
} from "./workflow-store.js";

export const WORKFLOW_OPERATOR_VERSION =
  "mediaforge.workflow-operator.v1" as const;

export interface WorkflowOperatorOptions {
  readonly unitRoot: string;
  readonly workflow: WorkflowDefinition;
  readonly registry: TaskRegistry;
  readonly identity: WorkflowStoreIdentity;
  readonly availableArtifacts?: readonly ArtifactContract[];
  readonly approvalArtifactHashes?: Readonly<Record<string, readonly string[]>>;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
  readonly store?: WorkflowStore;
  readonly fingerprintMaterial?: Readonly<
    Record<string, TaskFingerprintMaterial>
  >;
  readonly verifyArtifact?: (
    manifest: ArtifactManifest
  ) => boolean | Promise<boolean>;
  readonly legacyCacheAdapters?: readonly LegacyCacheAdapter[];
}

export interface WorkflowGraph {
  readonly workflow: WorkflowDefinition;
  readonly nodes: readonly {
    readonly taskId: TaskId;
    readonly displayName: string;
    readonly implementationOwner: string;
    readonly implementationBound: boolean;
  }[];
  readonly edges: readonly {
    readonly from: TaskId;
    readonly to: TaskId;
    readonly optional: boolean;
  }[];
}

export interface WorkflowStatus {
  readonly initialized: boolean;
  readonly workflowInstanceId: string;
  readonly nextTaskId: TaskId | null;
  readonly complete: boolean;
  readonly tasks: readonly {
    readonly taskId: TaskId;
    readonly persistedStatus: string;
    readonly readiness: string;
    readonly reasons: readonly string[];
    readonly cache?: CacheDecision;
  }[];
}

export interface WorkflowRunResult {
  readonly dryRun: boolean;
  readonly taskId: TaskId;
  readonly runId?: string;
  readonly attemptId?: string;
  readonly warnings: readonly string[];
  readonly outputManifestIds: readonly string[];
  readonly cacheHit: boolean;
  readonly cacheDecision: CacheDecision;
}

export interface WorkflowInvalidationResult {
  readonly rootTaskId: TaskId;
  readonly invalidatedTaskIds: readonly TaskId[];
  readonly preservedTaskIds: readonly TaskId[];
  readonly reason: string;
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

function defaultId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function isNotInitialized(error: unknown): boolean {
  return (
    error instanceof WorkflowStoreError && error.code === "NOT_INITIALIZED"
  );
}

export class WorkflowOperator {
  public readonly store: WorkflowStore;
  public readonly unitRoot: string;

  private readonly workflow: WorkflowDefinition;
  private readonly registry: TaskRegistry;
  private readonly artifacts: readonly ArtifactContract[];
  private readonly approvalArtifactHashes: Readonly<
    Record<string, readonly string[]>
  >;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly verifyArtifact: (
    manifest: ArtifactManifest
  ) => boolean | Promise<boolean>;

  public constructor(private readonly options: WorkflowOperatorOptions) {
    this.unitRoot = options.unitRoot;
    this.workflow = options.registry.validateWorkflow(options.workflow);
    this.registry = options.registry;
    this.artifacts = options.availableArtifacts ?? [];
    this.approvalArtifactHashes = options.approvalArtifactHashes ?? {};
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultId;
    this.verifyArtifact = options.verifyArtifact ?? (() => false);
    this.store =
      options.store ??
      new WorkflowStore({
        unitRoot: options.unitRoot,
        workflow: this.workflow,
        identity: options.identity,
        ...(options.now ? { now: options.now } : {}),
      });
  }

  public list(): ReturnType<TaskRegistry["list"]> {
    return this.registry.list(this.workflow.profileId);
  }

  public explain(taskId: string): ReturnType<TaskRegistry["explain"]> {
    return this.registry.explain(taskId);
  }

  public graph(): WorkflowGraph {
    const nodes = this.workflow.taskIds.map((taskId) => {
      const registration = this.registry.get(taskId);
      return {
        taskId,
        displayName: registration.definition.displayName,
        implementationOwner: registration.implementation.owner,
        implementationBound: registration.implementation.execute !== undefined,
      };
    });
    const edges = this.workflow.taskIds.flatMap((taskId) =>
      this.registry
        .get(taskId)
        .definition.dependencies.filter((dependency) =>
          this.workflow.taskIds.includes(dependency.taskId)
        )
        .map((dependency) => ({
          from: dependency.taskId,
          to: taskId,
          optional: dependency.optional,
        }))
    );
    return { workflow: this.workflow, nodes, edges };
  }

  public async plan(): Promise<ReturnType<TaskRegistry["plan"]>> {
    const state = await this.readStateIfInitialized();
    const cache = state ? await this.inspectCacheInternal(state) : [];
    const invalidated = state
      ? this.cacheInvalidationClosure(state, cache)
      : new Set<TaskId>();
    return this.registry.plan(this.workflow, {
      completedTaskIds: new Set(
        state?.tasks
          .filter(
            (task) => task.status === "succeeded" || task.status === "skipped"
          )
          .filter((task) => !invalidated.has(task.taskId))
          .map((task) => task.taskId) ?? []
      ),
      availableArtifacts: this.artifacts,
      approvedTaskIds: new Set(),
    });
  }

  public async status(): Promise<WorkflowStatus> {
    const state = await this.readStateIfInitialized();
    if (!state) {
      const plan = await this.plan();
      return {
        initialized: false,
        workflowInstanceId: this.options.identity.instanceId,
        nextTaskId:
          plan.tasks.find((task) => task.readiness.status === "ready")
            ?.taskId ?? null,
        complete: false,
        tasks: plan.tasks.map((task) => ({
          taskId: task.taskId,
          persistedStatus: "pending",
          readiness: task.readiness.status,
          reasons: task.readiness.reasons,
        })),
      };
    }
    const cache = await this.inspectCacheInternal(state);
    const cacheByTask = new Map(
      cache.map((decision) => [decision.taskId, decision])
    );
    const invalidatedTaskIds = this.cacheInvalidationClosure(state, cache);
    const derived = await this.store.deriveNext(this.registry, {
      availableArtifacts: this.artifacts,
      approvalArtifactHashes: this.approvalArtifactHashes,
      invalidatedTaskIds,
    });
    return {
      initialized: true,
      workflowInstanceId: derived.workflowInstanceId,
      nextTaskId: derived.nextTaskId,
      complete:
        invalidatedTaskIds.size === 0 &&
        state.tasks.every(
          (task) => task.status === "succeeded" || task.status === "skipped"
        ),
      tasks: derived.tasks.map((task) => ({
        taskId: task.taskId,
        persistedStatus: task.persistedStatus,
        readiness: task.readiness.status,
        reasons: task.readiness.reasons,
        ...(cacheByTask.get(task.taskId)
          ? { cache: cacheByTask.get(task.taskId)! }
          : {}),
      })),
    };
  }

  public async initialize(): Promise<WorkflowInstance> {
    const existing = await this.readStateIfInitialized();
    return existing ?? this.store.initialize();
  }

  public async runNext(
    options: {
      readonly dryRun?: boolean;
      readonly continue?: boolean;
    } = {}
  ): Promise<readonly WorkflowRunResult[]> {
    if (options.dryRun) {
      const status = await this.status();
      if (!status.nextTaskId) return [];
      return [await this.runTask(status.nextTaskId, { dryRun: true })];
    }
    await this.initialize();
    const results: WorkflowRunResult[] = [];
    do {
      const status = await this.status();
      if (!status.nextTaskId) {
        if (results.length === 0 && !status.complete) {
          throw new WorkflowBlockedError(
            "No workflow task is ready.",
            this.blockedRemediation(status)
          );
        }
        break;
      }
      results.push(await this.runTask(status.nextTaskId));
    } while (options.continue);
    return results;
  }

  public async runTask(
    taskIdInput: string,
    options: { readonly dryRun?: boolean } = {}
  ): Promise<WorkflowRunResult> {
    const taskId = taskIdSchema.parse(taskIdInput);
    const registration = this.registry.get(taskId);
    if (!this.workflow.taskIds.includes(taskId)) {
      throw new WorkflowBlockedError(
        `Task ${taskId} is not part of workflow ${this.workflow.id}.`
      );
    }
    if (options.dryRun) {
      const plan = await this.plan();
      const task = plan.tasks.find((entry) => entry.taskId === taskId);
      if (!task || task.readiness.status !== "ready") {
        throw new WorkflowBlockedError(
          `Task ${taskId} is not ready for a dry run.`,
          task?.readiness.reasons.join(" ") ?? "Inspect the workflow plan."
        );
      }
      return {
        dryRun: true,
        taskId,
        warnings: [],
        outputManifestIds: [],
        cacheHit: false,
        cacheDecision: await this.cacheDecision(taskId),
      };
    }
    await this.initialize();
    const state = await this.store.readState();
    const initialTaskState = state.tasks.find((task) => task.taskId === taskId);
    const fingerprint = await this.taskFingerprint(taskId, state);
    const dependencyFingerprints = await this.dependencyFingerprints(
      taskId,
      state
    );
    const cacheDecision = await this.cacheDecision(
      taskId,
      state,
      fingerprint,
      dependencyFingerprints
    );
    await this.store.recordCacheDecision(cacheDecision);
    if (
      initialTaskState?.status === "succeeded" &&
      cacheDecision.status === "hit"
    ) {
      return {
        dryRun: false,
        taskId,
        warnings: [],
        outputManifestIds: cacheDecision.outputManifestIds,
        cacheHit: true,
        cacheDecision,
      };
    }
    if (
      initialTaskState?.status === "succeeded" ||
      initialTaskState?.status === "skipped"
    ) {
      await this.invalidate(taskId, `Cache miss: ${cacheDecision.reason}.`);
    }
    const status = await this.status();
    const taskStatus = status.tasks.find((entry) => entry.taskId === taskId);
    if (!taskStatus || taskStatus.readiness !== "ready") {
      throw new WorkflowBlockedError(
        `Task ${taskId} is not ready.`,
        taskStatus?.reasons.join(" ") ?? "Inspect workflow status."
      );
    }
    if (!registration.implementation.execute) {
      throw new WorkflowBlockedError(
        `Task ${taskId} has no migrated implementation binding.`,
        `Use the existing ${registration.definition.cli.resource} command until this task family migrates.`
      );
    }

    const attempts = await this.store.listAttempts(taskId);
    const attemptNumber = attempts.length + 1;
    const suffix = this.idFactory();
    const runId = workflowRunIdSchema.parse(`run-${suffix}`);
    const attemptId = attemptIdSchema.parse(`attempt-${suffix}`);
    const configuredLockScope = registration.definition.policies.lockScope;
    const lock = await this.store.acquireLock({
      scope: configuredLockScope === "none" ? "task" : configuredLockScope,
      key:
        configuredLockScope === "unit" ? this.options.identity.unitId : taskId,
      owner: `workflow-operator-${process.pid}`,
      runId,
      attemptId,
    });
    try {
      const current = (await this.store.readState()).tasks.find(
        (task) => task.taskId === taskId
      );
      if (current?.status !== "ready") {
        await this.store.transition({
          taskId,
          to: "ready",
          reason: "Selected by the workflow operator.",
        });
      }
      await this.store.beginAttempt({
        id: attemptId,
        runId,
        taskId,
        attemptNumber,
        fingerprint,
      });
      const startedAt = this.now();
      try {
        const result = await registration.implementation.execute({
          unitId: this.options.identity.unitId,
          profileId: this.workflow.profileId,
          locale: this.options.identity.locale,
          variant: this.options.identity.variant,
          dryRun: false,
          runId,
          attemptId,
          fingerprint,
          dependencyFingerprints,
        });
        const outputs = result.outputArtifacts.map((output) =>
          artifactManifestSchema.parse(output)
        );
        for (const output of outputs) {
          if (
            output.producerTaskId !== taskId ||
            output.producerTaskVersion !==
              registration.definition.implementationVersion ||
            output.producerAttemptId !== attemptId ||
            [...output.dependencyFingerprints].sort().join("\n") !==
              [...dependencyFingerprints].sort().join("\n") ||
            !(await this.verifyArtifact(output))
          ) {
            throw new WorkflowPermanentFailureError(
              "ARTIFACT_VALIDATION_FAILED",
              `Task ${taskId} returned output manifest ${output.id} without current validated lineage.`,
              "Repair or reconcile the canonical output manifest before retrying."
            );
          }
        }
        await new AttemptObservabilityStore(this.store.runsRoot).write(
          {
            schemaVersion: TASK_SCHEMA_VERSION,
            id: attemptId,
            runId,
            unitId: productionUnitIdSchema.parse(this.options.identity.unitId),
            profileId: this.workflow.profileId,
            taskId,
            locale: contentLocaleSchema.parse(this.options.identity.locale),
            variant: contentVariantSchema.parse(this.options.identity.variant),
            operation: registration.definition.observability.operationName,
            attemptNumber,
            ...(result.telemetry?.provider
              ? { provider: result.telemetry.provider }
              : {}),
            ...(result.telemetry?.model
              ? { model: result.telemetry.model }
              : {}),
            ...(result.telemetry?.providerRequestId
              ? { providerRequestId: result.telemetry.providerRequestId }
              : {}),
            cacheStatus: result.telemetry?.cacheStatus ?? "miss",
            durationMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
            fingerprint,
            revisions: {
              workflow: this.workflow.revision,
              task: registration.definition.implementationVersion,
              ...(result.telemetry?.revisions ?? {}),
            },
            outputManifestIds: outputs.map((output) => output.id),
            warnings: [...result.warnings],
            exitCode: 0,
            ...(result.telemetry?.usage
              ? { usage: result.telemetry.usage }
              : {}),
            ...(result.telemetry?.cost ? { cost: result.telemetry.cost } : {}),
            startedAt: startedAt.toISOString(),
            completedAt: this.now().toISOString(),
          },
          registration.definition.observability.redactedFields
        );
        await this.store.completeAttempt({
          id: attemptId,
          result: {
            schemaVersion: TASK_SCHEMA_VERSION,
            status: "succeeded",
            outputs,
            warnings: [...result.warnings],
          },
        });
        return {
          dryRun: false,
          taskId,
          runId,
          attemptId,
          warnings: result.warnings,
          outputManifestIds: outputs.map((output) => output.id),
          cacheHit: false,
          cacheDecision,
        };
      } catch (error) {
        const normalized = normalizeWorkflowError(error);
        const completedAt = this.now();
        await this.store.completeAttempt({
          id: attemptId,
          result: {
            schemaVersion: TASK_SCHEMA_VERSION,
            status: "failed",
            error: {
              ...normalized,
              taskId,
              attemptId,
            },
          },
        });
        await new AttemptObservabilityStore(this.store.runsRoot).write(
          {
            schemaVersion: TASK_SCHEMA_VERSION,
            id: attemptId,
            runId,
            unitId: productionUnitIdSchema.parse(this.options.identity.unitId),
            profileId: this.workflow.profileId,
            taskId,
            locale: contentLocaleSchema.parse(this.options.identity.locale),
            variant: contentVariantSchema.parse(this.options.identity.variant),
            operation: registration.definition.observability.operationName,
            attemptNumber,
            cacheStatus: "miss",
            durationMs: Math.max(
              0,
              completedAt.getTime() - startedAt.getTime()
            ),
            fingerprint,
            revisions: {
              workflow: this.workflow.revision,
              task: registration.definition.implementationVersion,
            },
            outputManifestIds: [],
            warnings: [],
            error: { ...normalized, taskId, attemptId },
            exitCode: errorCodeToExitCode(normalized.code),
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
          },
          registration.definition.observability.redactedFields
        );
        throw error;
      }
    } finally {
      await this.store.releaseLock(lock).catch(() => undefined);
    }
  }

  public async resume(): Promise<WorkflowRunResult> {
    await this.initialize();
    await this.store.recoverStaleRecords();
    const state = await this.store.readState();
    const task = state.tasks.find((entry) => entry.status === "interrupted");
    if (!task) {
      throw new WorkflowBlockedError(
        "No interrupted task is available to resume.",
        "Use run-next for ready work or retry-failed for failed work."
      );
    }
    await this.store.transition({
      taskId: task.taskId,
      to: "pending",
      reason: "Operator requested resume.",
    });
    return this.runTask(task.taskId);
  }

  public async retryFailed(): Promise<WorkflowRunResult> {
    await this.initialize();
    const state = await this.store.readState();
    const task = state.tasks.find((entry) => entry.status === "failed");
    if (!task) {
      throw new WorkflowBlockedError(
        "No failed task is available to retry.",
        "Inspect workflow status before retrying."
      );
    }
    await this.store.transition({
      taskId: task.taskId,
      to: "pending",
      reason: "Operator requested retry.",
    });
    return this.runTask(task.taskId);
  }

  public async invalidate(
    taskIdInput: string,
    reason: string
  ): Promise<WorkflowInvalidationResult> {
    await this.initialize();
    const rootTaskId = taskIdSchema.parse(taskIdInput);
    if (!this.workflow.taskIds.includes(rootTaskId)) {
      throw new WorkflowBlockedError(
        `Task ${rootTaskId} is not part of workflow ${this.workflow.id}.`
      );
    }
    const affected = this.dependentClosure(rootTaskId);
    const invalidatedTaskIds: TaskId[] = [];
    for (const taskId of affected) {
      const task = (await this.store.readState()).tasks.find(
        (candidate) => candidate.taskId === taskId
      );
      if (!task || task.status === "invalidated") continue;
      if (task.status === "running") {
        throw new WorkflowConflictError(
          "CACHE_CONFLICT",
          `Cannot invalidate running task ${taskId}.`,
          "Interrupt or reconcile the running attempt first."
        );
      }
      await this.store.transition({
        taskId,
        to: "invalidated",
        reason:
          taskId === rootTaskId
            ? reason
            : `Dependency ${rootTaskId} was invalidated: ${reason}`,
      });
      invalidatedTaskIds.push(taskId);
    }
    return {
      rootTaskId,
      invalidatedTaskIds,
      preservedTaskIds: this.workflow.taskIds.filter(
        (taskId) => !affected.includes(taskId)
      ),
      reason,
    };
  }

  public async inspectCache(
    taskIdInput?: string
  ): Promise<readonly CacheDecision[]> {
    const state = await this.readStateIfInitialized();
    if (!state) {
      const ids = taskIdInput
        ? [taskIdSchema.parse(taskIdInput)]
        : this.workflow.taskIds;
      return Promise.all(ids.map((taskId) => this.cacheDecision(taskId)));
    }
    return this.inspectCacheInternal(
      state,
      taskIdInput ? taskIdSchema.parse(taskIdInput) : undefined
    );
  }

  public async explainCacheMiss(taskIdInput: string): Promise<CacheDecision> {
    const decision = (await this.inspectCache(taskIdInput))[0];
    if (!decision) {
      throw new WorkflowBlockedError(`Task ${taskIdInput} is not registered.`);
    }
    return decision;
  }

  public async planCachePrune(): Promise<CachePrunePlan> {
    const attempts = await this.store.listAttempts();
    return planCachePrune(
      attempts.map((attempt) => ({
        family: "canonical-attempt" as const,
        key: attempt.id,
        status: "stale" as const,
      }))
    );
  }

  public async override(input: {
    readonly taskId: string;
    readonly actor: string;
    readonly reason: string;
    readonly scope: OperatorOverride["scope"];
    readonly outputManifestIds?: readonly string[];
  }): Promise<OperatorOverride> {
    const state = await this.initialize();
    const record = operatorOverrideSchema.parse({
      schemaVersion: OVERRIDE_SCHEMA_VERSION,
      id: `override-${this.idFactory()}`,
      workflowInstanceId: state.id,
      taskId: input.taskId,
      actor: input.actor,
      reason: input.reason,
      scope: input.scope,
      ...(input.outputManifestIds
        ? { outputManifestIds: input.outputManifestIds }
        : {}),
      createdAt: this.now().toISOString(),
      boundRevision: state.workflowRevision,
    });
    if (record.scope === "task-success") {
      await this.store.applyManualSuccess(record);
    } else {
      await this.store.recordOverride(record);
    }
    return record;
  }

  public async reconcile(input: ReconcileInput = {}): Promise<{
    readonly recovered: Awaited<
      ReturnType<WorkflowStore["recoverStaleRecords"]>
    >;
    readonly result: ReconcileResult;
  }> {
    await this.initialize();
    const recovered = await this.store.recoverStaleRecords();
    const result = await this.store.reconcile(input);
    return { recovered, result };
  }

  public async validateState(): Promise<WorkflowInstance> {
    await this.initialize();
    return this.store.rebuildState();
  }

  private async readStateIfInitialized(): Promise<WorkflowInstance | null> {
    try {
      return await this.store.readState();
    } catch (error) {
      if (isNotInitialized(error)) return null;
      throw new WorkflowConflictError(
        "PERSISTENCE_CONFLICT",
        error instanceof Error ? error.message : "Workflow state is invalid."
      );
    }
  }

  private async taskFingerprint(
    taskId: TaskId,
    state?: WorkflowInstance
  ): Promise<TaskFingerprint> {
    const registration = this.registry.get(taskId);
    const dependencyFingerprints = state
      ? await this.dependencyFingerprints(taskId, state)
      : [];
    return buildTaskFingerprint({
      workflowId: this.workflow.id,
      workflowRevision: this.workflow.revision,
      taskId,
      taskVersion: registration.definition.implementationVersion,
      unitId: this.options.identity.unitId,
      profileId: this.workflow.profileId,
      locale: this.options.identity.locale,
      variant: this.options.identity.variant,
      dependencyFingerprints,
      ...(this.options.fingerprintMaterial?.[taskId]
        ? { material: this.options.fingerprintMaterial[taskId] }
        : {}),
    });
  }

  private async dependencyFingerprints(
    taskId: TaskId,
    state: WorkflowInstance
  ): Promise<readonly TaskFingerprint[]> {
    const fingerprints: TaskFingerprint[] = [];
    for (const dependency of this.registry.get(taskId).definition
      .dependencies) {
      if (!this.workflow.taskIds.includes(dependency.taskId)) continue;
      const dependencyState = state.tasks.find(
        (task) => task.taskId === dependency.taskId
      );
      if (
        dependencyState?.status === "succeeded" &&
        dependencyState.attemptId
      ) {
        fingerprints.push(
          (await this.store.readAttempt(dependencyState.attemptId)).fingerprint
        );
      } else if (
        dependencyState?.status === "succeeded" ||
        dependencyState?.status === "skipped"
      ) {
        fingerprints.push(
          taskFingerprintSchema.parse(
            digest({
              taskId: dependency.taskId,
              status: dependencyState.status,
              updatedAt: dependencyState.updatedAt,
            })
          )
        );
      }
    }
    return fingerprints.sort((left, right) => left.localeCompare(right));
  }

  private async cacheDecision(
    taskId: TaskId,
    state?: WorkflowInstance,
    fingerprint?: TaskFingerprint,
    dependencyFingerprints?: readonly TaskFingerprint[]
  ): Promise<CacheDecision> {
    const registration = this.registry.get(taskId);
    const resolvedDependencies =
      dependencyFingerprints ??
      (state ? await this.dependencyFingerprints(taskId, state) : []);
    return evaluateTaskCache({
      taskId,
      taskVersion: registration.definition.implementationVersion,
      policy: registration.definition.policies.cache,
      fingerprint: fingerprint ?? (await this.taskFingerprint(taskId, state)),
      attempts: state ? await this.store.listAttempts(taskId) : [],
      outputsRequired: registration.definition.outputs.length > 0,
      expectedDependencyFingerprints: resolvedDependencies,
      explicitlyInvalidated:
        state?.tasks.find((task) => task.taskId === taskId)?.status ===
        "invalidated",
      verifyManifest: this.verifyArtifact,
      ...(this.options.legacyCacheAdapters
        ? { legacyAdapters: this.options.legacyCacheAdapters }
        : {}),
    });
  }

  private async inspectCacheInternal(
    state: WorkflowInstance,
    taskId?: TaskId
  ): Promise<readonly CacheDecision[]> {
    const taskIds = taskId ? [taskId] : this.workflow.taskIds;
    return Promise.all(
      taskIds.map(async (id) => {
        const dependencies = await this.dependencyFingerprints(id, state);
        const fingerprint = await this.taskFingerprint(id, state);
        return this.cacheDecision(id, state, fingerprint, dependencies);
      })
    );
  }

  private dependentClosure(rootTaskId: TaskId): TaskId[] {
    const affected = new Set<TaskId>([rootTaskId]);
    const queue: TaskId[] = [rootTaskId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dependent of this.registry.explain(current).directDependents) {
        if (
          !this.workflow.taskIds.includes(dependent) ||
          affected.has(dependent)
        ) {
          continue;
        }
        affected.add(dependent);
        queue.push(dependent);
      }
    }
    return this.workflow.taskIds.filter((taskId) => affected.has(taskId));
  }

  private cacheInvalidationClosure(
    state: WorkflowInstance,
    decisions: readonly CacheDecision[]
  ): Set<TaskId> {
    const staleRoots = decisions
      .filter((decision) => {
        const task = state.tasks.find(
          (candidate) => candidate.taskId === decision.taskId
        );
        return (
          task?.status === "succeeded" &&
          this.registry.get(decision.taskId).definition.policies.cache ===
            "fingerprint" &&
          decision.status !== "hit"
        );
      })
      .map((decision) => decision.taskId);
    return new Set(
      staleRoots.flatMap((taskId) => this.dependentClosure(taskId))
    );
  }

  private blockedRemediation(status: WorkflowStatus): string {
    const reasons = status.tasks
      .filter((task) => task.readiness !== "not-applicable")
      .flatMap((task) => task.reasons)
      .slice(0, 3);
    return reasons.length > 0
      ? reasons.join(" ")
      : "Inspect workflow status and reconcile state.";
  }
}
