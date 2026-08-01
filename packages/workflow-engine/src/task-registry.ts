import {
  taskDefinitionSchema,
  taskIdSchema,
  workflowDefinitionSchema,
  type ArtifactContract,
  type ContentProfileId,
  type TaskDefinition,
  type TaskFingerprint,
  type TaskId,
  type AttemptId,
  type WorkflowRunId,
  type WorkflowDefinition,
} from "@mediaforge/domain";

export const TASK_REGISTRY_VERSION = "mediaforge.task-registry.v1" as const;

export type TaskRegistryErrorCode =
  | "DUPLICATE_TASK_ID"
  | "MISSING_DEPENDENCY"
  | "DEPENDENCY_CYCLE"
  | "PROFILE_APPLICABILITY_INVALID"
  | "ARTIFACT_CONTRACT_INCOMPATIBLE"
  | "IMPLEMENTATION_OWNER_INVALID"
  | "TASK_NOT_REGISTERED"
  | "WORKFLOW_INVALID";

export class TaskRegistryError extends Error {
  public constructor(
    public readonly code: TaskRegistryErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "TaskRegistryError";
  }
}

export interface TaskExecutionControl {
  /** Cooperative cancellation propagated from the owning worker or caller. */
  readonly signal: AbortSignal;
  /** Durable job deadline, when execution is owned by a leased worker. */
  readonly deadlineAt: string | null;
  /** Fence of the durable lease; null for local/filesystem execution. */
  readonly leaseFence: number | null;
  /** One-based durable dispatch attempt; local execution defaults to one. */
  readonly dispatchAttempt: number;
}

export interface TaskExecutionContext {
  readonly unitId: string;
  readonly profileId: ContentProfileId;
  readonly locale: string;
  readonly variant: string;
  readonly dryRun: boolean;
  readonly runId: WorkflowRunId;
  readonly attemptId: AttemptId;
  readonly fingerprint: TaskFingerprint;
  readonly dependencyFingerprints: readonly TaskFingerprint[];
  readonly control: TaskExecutionControl;
}

export interface TaskExecutionResult {
  readonly outputArtifacts: readonly unknown[];
  readonly warnings: readonly string[];
  readonly telemetry?: {
    readonly provider?: string;
    readonly model?: string;
    readonly providerRequestId?: string;
    readonly cacheStatus?: "hit" | "miss" | "disabled";
    readonly usage?: {
      readonly inputTokens?: number;
      readonly cachedInputTokens?: number;
      readonly outputTokens?: number;
      readonly reasoningTokens?: number;
    };
    readonly cost?: {
      readonly estimatedMicros?: number;
      readonly actualMicros?: number;
      readonly currency: "USD";
    };
    readonly revisions?: Readonly<Record<string, string>>;
  };
}

export type TaskImplementation = (
  context: TaskExecutionContext
) => TaskExecutionResult | Promise<TaskExecutionResult>;

export interface TaskImplementationBinding {
  /** The one capability package that owns this task's behavior. */
  readonly owner: `@mediaforge/${string}`;
  /** Optional until the owning caller family migrates in a later batch. */
  readonly execute?: TaskImplementation;
}

export type TaskReadinessStatus =
  | "ready"
  | "blocked"
  | "awaiting-approval"
  | "not-applicable";

export interface TaskReadinessResult {
  readonly status: TaskReadinessStatus;
  readonly reasons: readonly string[];
  readonly missingDependencies: readonly TaskId[];
  readonly missingArtifacts: readonly ArtifactContract[];
}

export interface TaskReadinessContext {
  readonly profileId: ContentProfileId;
  /** The tasks selected for this concrete workflow/variant. */
  readonly activeTaskIds?: ReadonlySet<TaskId>;
  readonly completedTaskIds: ReadonlySet<TaskId>;
  readonly availableArtifacts: readonly ArtifactContract[];
  readonly approvedTaskIds: ReadonlySet<TaskId>;
}

export type TaskReadinessPredicate = (
  context: TaskReadinessContext
) => readonly string[];

export interface TaskRegistration {
  readonly definition: TaskDefinition;
  readonly implementation: TaskImplementationBinding;
  readonly readiness?: TaskReadinessPredicate;
}

export interface TaskListEntry {
  readonly id: TaskId;
  readonly displayName: string;
  readonly implementationVersion: string;
  readonly implementationOwner: string;
  readonly executionKind: TaskDefinition["executionKind"];
  readonly applicableProfiles: TaskDefinition["applicableProfiles"];
}

export interface TaskExplanation {
  readonly registryVersion: typeof TASK_REGISTRY_VERSION;
  readonly definition: TaskDefinition;
  readonly implementationOwner: string;
  readonly implementationBound: boolean;
  readonly requiredDependencies: readonly TaskId[];
  readonly optionalDependencies: readonly TaskId[];
  readonly directDependents: readonly TaskId[];
  readonly transitiveDependencies: readonly TaskId[];
  readonly readiness?: TaskReadinessResult;
}

export interface PlannedTask {
  readonly order: number;
  readonly taskId: TaskId;
  readonly implementationOwner: string;
  readonly readiness: TaskReadinessResult;
}

export interface WorkflowPlan {
  readonly registryVersion: typeof TASK_REGISTRY_VERSION;
  readonly workflow: WorkflowDefinition;
  readonly dryRun: true;
  readonly tasks: readonly PlannedTask[];
}

function contractsCompatible(
  provided: ArtifactContract,
  required: ArtifactContract
): boolean {
  return (
    provided.kind === required.kind &&
    provided.schemaId === required.schemaId &&
    provided.schemaVersion === required.schemaVersion
  );
}

function taskAppliesToProfile(
  definition: TaskDefinition,
  profileId: ContentProfileId
): boolean {
  return definition.applicableProfiles.includes(profileId);
}

function sortedTaskIds(ids: Iterable<TaskId>): TaskId[] {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function ownerIsValid(owner: string): owner is `@mediaforge/${string}` {
  return /^@mediaforge\/[a-z0-9][a-z0-9-]*$/u.test(owner);
}

/**
 * Adapts an existing capability service without moving or duplicating its
 * implementation. The mapping stays in the owning profile package.
 */
export function adaptTaskImplementation<TInput, TResult>(args: {
  readonly owner: `@mediaforge/${string}`;
  readonly service: (input: TInput) => TResult | Promise<TResult>;
  readonly mapInput: (context: TaskExecutionContext) => TInput;
  readonly mapResult: (
    result: TResult,
    context: TaskExecutionContext
  ) => TaskExecutionResult;
}): TaskImplementationBinding {
  return {
    owner: args.owner,
    execute: async (context) => {
      const result = await args.service(args.mapInput(context));
      return args.mapResult(result, context);
    },
  };
}

export class TaskRegistry {
  private readonly registrations = new Map<TaskId, TaskRegistration>();

  public constructor(registrations: readonly TaskRegistration[]) {
    for (const registrationInput of registrations) {
      const definition = taskDefinitionSchema.parse(
        registrationInput.definition
      );
      if (this.registrations.has(definition.id)) {
        throw new TaskRegistryError(
          "DUPLICATE_TASK_ID",
          `Task ${definition.id} is registered more than once.`,
          { taskId: definition.id }
        );
      }
      if (!ownerIsValid(registrationInput.implementation.owner)) {
        throw new TaskRegistryError(
          "IMPLEMENTATION_OWNER_INVALID",
          `Task ${definition.id} must declare exactly one MediaForge package owner.`,
          {
            taskId: definition.id,
            owner: registrationInput.implementation.owner,
          }
        );
      }
      this.registrations.set(definition.id, {
        definition,
        implementation: registrationInput.implementation,
        ...(registrationInput.readiness
          ? { readiness: registrationInput.readiness }
          : {}),
      });
    }
    this.validateDependencies();
    this.validateProfileGraphs();
    this.validateArtifactContracts();
  }

  public list(profileId?: ContentProfileId): readonly TaskListEntry[] {
    return [...this.registrations.values()]
      .filter(
        ({ definition }) =>
          profileId === undefined || taskAppliesToProfile(definition, profileId)
      )
      .map(({ definition, implementation }) => ({
        id: definition.id,
        displayName: definition.displayName,
        implementationVersion: definition.implementationVersion,
        implementationOwner: implementation.owner,
        executionKind: definition.executionKind,
        applicableProfiles: definition.applicableProfiles,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public get(taskIdInput: TaskId | string): TaskRegistration {
    const taskId = taskIdSchema.parse(taskIdInput);
    const registration = this.registrations.get(taskId);
    if (!registration) {
      throw new TaskRegistryError(
        "TASK_NOT_REGISTERED",
        `Task ${taskId} is not registered.`,
        { taskId }
      );
    }
    return registration;
  }

  public validateWorkflow(input: WorkflowDefinition): WorkflowDefinition {
    const workflow = workflowDefinitionSchema.parse(input);
    const selected = new Set(workflow.taskIds);
    for (const taskId of workflow.taskIds) {
      const { definition } = this.get(taskId);
      if (!taskAppliesToProfile(definition, workflow.profileId)) {
        throw new TaskRegistryError(
          "PROFILE_APPLICABILITY_INVALID",
          `Task ${taskId} does not apply to profile ${workflow.profileId}.`,
          { taskId, profileId: workflow.profileId, workflowId: workflow.id }
        );
      }
      const missing = definition.dependencies
        .filter(
          (dependency) =>
            !dependency.optional && !selected.has(dependency.taskId)
        )
        .map((dependency) => dependency.taskId);
      if (missing.length > 0) {
        throw new TaskRegistryError(
          "WORKFLOW_INVALID",
          `Workflow ${workflow.id} omits required dependencies for ${taskId}.`,
          { taskId, missingDependencies: missing }
        );
      }
    }
    this.topologicalOrder(workflow.profileId, workflow.taskIds);
    return workflow;
  }

  public readiness(
    taskIdInput: TaskId | string,
    context: TaskReadinessContext
  ): TaskReadinessResult {
    const registration = this.get(taskIdInput);
    const { definition } = registration;
    if (!taskAppliesToProfile(definition, context.profileId)) {
      return {
        status: "not-applicable",
        reasons: [`Task does not apply to profile ${context.profileId}.`],
        missingDependencies: [],
        missingArtifacts: [],
      };
    }

    const activeTaskIds =
      context.activeTaskIds ??
      new Set(this.list(context.profileId).map((entry) => entry.id));
    const applicableDependencies = definition.dependencies.filter(
      (dependency) =>
        !dependency.optional || activeTaskIds.has(dependency.taskId)
    );
    const missingDependencies = applicableDependencies
      .filter((dependency) => !context.completedTaskIds.has(dependency.taskId))
      .map((dependency) => dependency.taskId);
    const missingArtifacts = definition.inputs
      .filter((contract) => contract.required)
      .filter(
        (required) =>
          !context.availableArtifacts.some((available) =>
            contractsCompatible(available, required)
          )
      );
    const customReasons = registration.readiness?.(context) ?? [];
    const reasons = [
      ...missingDependencies.map(
        (dependency) => `Dependency ${dependency} has not completed.`
      ),
      ...missingArtifacts.map(
        (contract) =>
          `Required artifact ${contract.kind} (${contract.schemaId}@${contract.schemaVersion}) is unavailable.`
      ),
      ...customReasons,
    ];

    if (reasons.length > 0) {
      return {
        status: "blocked",
        reasons,
        missingDependencies,
        missingArtifacts,
      };
    }
    if (
      definition.policies.approvalRequired &&
      !context.approvedTaskIds.has(definition.id)
    ) {
      return {
        status: "awaiting-approval",
        reasons: [`Task ${definition.id} requires a current approval.`],
        missingDependencies: [],
        missingArtifacts: [],
      };
    }
    return {
      status: "ready",
      reasons: [],
      missingDependencies: [],
      missingArtifacts: [],
    };
  }

  public explain(
    taskIdInput: TaskId | string,
    context?: TaskReadinessContext
  ): TaskExplanation {
    const registration = this.get(taskIdInput);
    const { definition } = registration;
    const directDependents = [...this.registrations.values()]
      .filter(({ definition: candidate }) =>
        candidate.dependencies.some(
          (dependency) => dependency.taskId === definition.id
        )
      )
      .map(({ definition: candidate }) => candidate.id);
    const transitive = new Set<TaskId>();
    const visit = (taskId: TaskId): void => {
      for (const dependency of this.get(taskId).definition.dependencies) {
        if (
          !this.registrations.has(dependency.taskId) ||
          transitive.has(dependency.taskId)
        ) {
          continue;
        }
        transitive.add(dependency.taskId);
        visit(dependency.taskId);
      }
    };
    visit(definition.id);

    return {
      registryVersion: TASK_REGISTRY_VERSION,
      definition,
      implementationOwner: registration.implementation.owner,
      implementationBound: registration.implementation.execute !== undefined,
      requiredDependencies: definition.dependencies
        .filter((dependency) => !dependency.optional)
        .map((dependency) => dependency.taskId),
      optionalDependencies: definition.dependencies
        .filter((dependency) => dependency.optional)
        .map((dependency) => dependency.taskId),
      directDependents: sortedTaskIds(directDependents),
      transitiveDependencies: sortedTaskIds(transitive),
      ...(context ? { readiness: this.readiness(definition.id, context) } : {}),
    };
  }

  public plan(
    workflowInput: WorkflowDefinition,
    context: Omit<TaskReadinessContext, "profileId" | "activeTaskIds">
  ): WorkflowPlan {
    const workflow = this.validateWorkflow(workflowInput);
    const activeTaskIds = new Set(workflow.taskIds);
    const order = this.topologicalOrder(workflow.profileId, workflow.taskIds);
    return {
      registryVersion: TASK_REGISTRY_VERSION,
      workflow,
      dryRun: true,
      tasks: order.map((taskId, index) => ({
        order: index + 1,
        taskId,
        implementationOwner: this.get(taskId).implementation.owner,
        readiness: this.readiness(taskId, {
          ...context,
          profileId: workflow.profileId,
          activeTaskIds,
        }),
      })),
    };
  }

  private validateDependencies(): void {
    for (const { definition } of this.registrations.values()) {
      for (const dependency of definition.dependencies) {
        const registeredDependency = this.registrations.get(dependency.taskId);
        if (!registeredDependency) {
          if (dependency.optional) continue;
          throw new TaskRegistryError(
            "MISSING_DEPENDENCY",
            `Task ${definition.id} requires unregistered task ${dependency.taskId}.`,
            { taskId: definition.id, dependencyTaskId: dependency.taskId }
          );
        }
        for (const profileId of definition.applicableProfiles) {
          if (
            !dependency.optional &&
            !taskAppliesToProfile(registeredDependency.definition, profileId)
          ) {
            throw new TaskRegistryError(
              "PROFILE_APPLICABILITY_INVALID",
              `Dependency ${dependency.taskId} does not apply to ${profileId}, required by ${definition.id}.`,
              {
                taskId: definition.id,
                dependencyTaskId: dependency.taskId,
                profileId,
              }
            );
          }
        }
      }
    }
  }

  private validateProfileGraphs(): void {
    for (const profileId of [
      "dark-truth",
      "mathematics-education",
    ] as const satisfies readonly ContentProfileId[]) {
      const taskIds = this.list(profileId).map((entry) => entry.id);
      this.topologicalOrder(profileId, taskIds);
    }
  }

  private validateArtifactContracts(): void {
    for (const { definition } of this.registrations.values()) {
      const upstreamOutputs = definition.dependencies.flatMap((dependency) => {
        const registered = this.registrations.get(dependency.taskId);
        return registered?.definition.outputs ?? [];
      });
      for (const required of definition.inputs.filter(
        (input) => input.required
      )) {
        const sameKind = upstreamOutputs.filter(
          (provided) => provided.kind === required.kind
        );
        if (
          sameKind.length > 0 &&
          !sameKind.some((provided) => contractsCompatible(provided, required))
        ) {
          throw new TaskRegistryError(
            "ARTIFACT_CONTRACT_INCOMPATIBLE",
            `Task ${definition.id} requires ${required.schemaId}@${required.schemaVersion}, but its dependencies provide an incompatible ${required.kind} contract.`,
            { taskId: definition.id, required, provided: sameKind }
          );
        }
      }
    }
  }

  private topologicalOrder(
    profileId: ContentProfileId,
    taskIds: readonly TaskId[]
  ): TaskId[] {
    const selected = new Set(taskIds);
    const indegree = new Map<TaskId, number>();
    const dependents = new Map<TaskId, TaskId[]>();
    for (const taskId of taskIds) {
      indegree.set(taskId, 0);
      dependents.set(taskId, []);
    }
    for (const taskId of taskIds) {
      const { definition } = this.get(taskId);
      for (const dependency of definition.dependencies) {
        if (!selected.has(dependency.taskId)) continue;
        indegree.set(taskId, (indegree.get(taskId) ?? 0) + 1);
        dependents.get(dependency.taskId)?.push(taskId);
      }
    }

    const ready = sortedTaskIds(
      [...indegree.entries()]
        .filter(([, count]) => count === 0)
        .map(([taskId]) => taskId)
    );
    const ordered: TaskId[] = [];
    while (ready.length > 0) {
      const taskId = ready.shift();
      if (!taskId) break;
      ordered.push(taskId);
      for (const dependent of sortedTaskIds(dependents.get(taskId) ?? [])) {
        const count = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, count);
        if (count === 0) {
          ready.push(dependent);
          ready.sort((left, right) => left.localeCompare(right));
        }
      }
    }
    if (ordered.length !== taskIds.length) {
      const cyclicTaskIds = sortedTaskIds(
        [...indegree.entries()]
          .filter(([, count]) => count > 0)
          .map(([taskId]) => taskId)
      );
      throw new TaskRegistryError(
        "DEPENDENCY_CYCLE",
        `Task dependency cycle detected for profile ${profileId}.`,
        { profileId, taskIds: cyclicTaskIds }
      );
    }
    return ordered;
  }
}

export function createTaskRegistry(
  registrations: readonly TaskRegistration[]
): TaskRegistry {
  return new TaskRegistry(registrations);
}
