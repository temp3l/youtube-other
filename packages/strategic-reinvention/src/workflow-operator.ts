import { createHash } from "node:crypto";
import {
  contentLocaleSchema,
  contentVariantSchema,
  productionUnitIdSchema,
} from "@mediaforge/domain";
import {
  WorkflowOperator,
  createTaskRegistry,
  WorkflowBlockedError,
  type TaskImplementation,
  type WorkflowOperatorOptions,
} from "@mediaforge/workflow-engine";
import {
  createStrategicFullTaskRegistrations,
  createStrategicSupplementalTaskRegistrations,
  STRATEGIC_FULL_TASK_IDS,
  STRATEGIC_SUPPLEMENTAL_TASK_IDS,
  strategicFullWorkflowDefinition,
  strategicSupplementalWorkflowDefinition,
} from "./task-registry.js";

export const STRATEGIC_CANONICAL_WORKFLOW_ADAPTER_VERSION =
  "veronicabenini.canonical-workflow-adapter.v1" as const;

/**
 * The old strategic bridge materialized an entire fixture pipeline for every
 * task invocation. Each task now has an explicit canonical binding instead:
 * provider dispatch and fixture generation are deliberately unavailable until
 * the owning capability contributes verified, revision-bound artifacts.
 */
function disabledCanonicalStage(taskId: string): TaskImplementation {
  return async (context) => {
    if (context.control.signal.aborted) {
      throw new WorkflowBlockedError(
        `Canonical Veronica task ${taskId} was cancelled before execution.`,
      );
    }
    throw new WorkflowBlockedError(
      `Canonical Veronica task ${taskId} is not enabled for direct execution.`,
      "Provide the owning capability's approved, revision-bound artifact; provider dispatch and fixture generation are disabled.",
    );
  };
}

function workflowInstanceId(
  workflowId: string,
  revision: string,
  unitId: string,
  locale: string,
  variant: string,
): string {
  return `workflow-${createHash("sha256")
    .update(`${workflowId}\0${revision}\0${unitId}\0${locale}\0${variant}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function createStrategicEpisodeImplementations(
  provided: Readonly<Partial<Record<string, TaskImplementation>>> = {},
): Readonly<Partial<Record<string, TaskImplementation>>> {
  const implementations: Record<string, TaskImplementation> = {};
  for (const taskId of STRATEGIC_FULL_TASK_IDS) {
    if (taskId.endsWith("-approval") || taskId.endsWith("-review")) {
      continue;
    }
    implementations[taskId] = provided[taskId] ?? disabledCanonicalStage(taskId);
  }
  return implementations;
}

export interface StrategicWorkflowOperatorRequest {
  readonly unitRoot: string;
  readonly episodeId: string;
  readonly locale?: string;
  readonly variant?: string;
  readonly implementations?: Readonly<Partial<Record<string, TaskImplementation>>>;
  readonly availableArtifacts?: WorkflowOperatorOptions["availableArtifacts"];
  readonly approvalArtifactHashes?: WorkflowOperatorOptions["approvalArtifactHashes"];
  readonly fingerprintMaterial?: WorkflowOperatorOptions["fingerprintMaterial"];
  readonly verifyArtifact?: WorkflowOperatorOptions["verifyArtifact"];
  readonly executionControl?: WorkflowOperatorOptions["executionControl"];
}

export function createStrategicFullWorkflowOperator(
  request: StrategicWorkflowOperatorRequest,
): WorkflowOperator {
  const unitId = productionUnitIdSchema.parse(request.episodeId);
  const locale = contentLocaleSchema.parse(request.locale ?? "it");
  const variant = contentVariantSchema.parse(request.variant ?? "full");
  return new WorkflowOperator({
    unitRoot: request.unitRoot,
    workflow: strategicFullWorkflowDefinition,
    registry: createTaskRegistry(
      createStrategicFullTaskRegistrations(
        createStrategicEpisodeImplementations(request.implementations),
      ),
    ),
    identity: {
      instanceId: workflowInstanceId(
        strategicFullWorkflowDefinition.id,
        strategicFullWorkflowDefinition.revision,
        unitId,
        locale,
        variant,
      ),
      unitId,
      locale,
      variant,
    },
    ...(request.availableArtifacts ? { availableArtifacts: request.availableArtifacts } : {}),
    ...(request.approvalArtifactHashes ? { approvalArtifactHashes: request.approvalArtifactHashes } : {}),
    ...(request.fingerprintMaterial ? { fingerprintMaterial: request.fingerprintMaterial } : {}),
    ...(request.executionControl ? { executionControl: request.executionControl } : {}),
    // Callers must bind the canonical repository verifier. Unverified fixtures
    // remain rejected when no capability verifier is supplied.
    verifyArtifact: request.verifyArtifact ?? (() => false),
  });
}

export function createStrategicSupplementalWorkflowOperator(
  request: StrategicWorkflowOperatorRequest,
): WorkflowOperator {
  const unitId = productionUnitIdSchema.parse(request.episodeId);
  const locale = contentLocaleSchema.parse(request.locale ?? "it");
  const variant = contentVariantSchema.parse(request.variant ?? "full");
  return new WorkflowOperator({
    unitRoot: request.unitRoot,
    workflow: strategicSupplementalWorkflowDefinition,
    registry: createTaskRegistry(
      createStrategicSupplementalTaskRegistrations(
        createStrategicEpisodeImplementations(request.implementations),
      ),
    ),
    identity: {
      instanceId: workflowInstanceId(
        strategicSupplementalWorkflowDefinition.id,
        strategicSupplementalWorkflowDefinition.revision,
        unitId,
        locale,
        variant,
      ),
      unitId,
      locale,
      variant,
    },
    ...(request.availableArtifacts ? { availableArtifacts: request.availableArtifacts } : {}),
    ...(request.approvalArtifactHashes ? { approvalArtifactHashes: request.approvalArtifactHashes } : {}),
    ...(request.fingerprintMaterial ? { fingerprintMaterial: request.fingerprintMaterial } : {}),
    ...(request.executionControl ? { executionControl: request.executionControl } : {}),
    verifyArtifact: request.verifyArtifact ?? (() => false),
  });
}

function advanceWorkflowFixture(taskIds: readonly string[], registrations: ReturnType<typeof createStrategicFullTaskRegistrations>): {
  readonly taskIds: readonly string[];
} {
  const registry = createTaskRegistry(registrations);
  const completed = new Set<string>();
  const ordered: string[] = [];
  while (completed.size < taskIds.length) {
    const next = taskIds.find((taskId) => {
      if (completed.has(taskId)) return false;
      return registry
        .get(taskId)
        .definition.dependencies.every((dependency) => completed.has(dependency.taskId));
    });
    if (!next) {
      throw new Error("Strategic workflow fixture cannot advance through the DAG.");
    }
    completed.add(next);
    ordered.push(next);
  }
  return { taskIds: ordered };
}

export function runStrategicFullWorkflowFixture(): {
  readonly status: "passed";
  readonly workflowId: string;
  readonly revision: string;
  readonly taskCount: number;
  readonly taskIds: readonly string[];
} {
  const registry = createTaskRegistry(createStrategicFullTaskRegistrations());
  registry.validateWorkflow(strategicFullWorkflowDefinition);
  const { taskIds } = advanceWorkflowFixture(
    STRATEGIC_FULL_TASK_IDS,
    createStrategicFullTaskRegistrations(),
  );
  return {
    status: "passed",
    workflowId: strategicFullWorkflowDefinition.id,
    revision: strategicFullWorkflowDefinition.revision,
    taskCount: strategicFullWorkflowDefinition.taskIds.length,
    taskIds,
  };
}

export function runStrategicSupplementalWorkflowFixture(): {
  readonly status: "passed";
  readonly workflowId: string;
  readonly revision: string;
  readonly taskCount: number;
  readonly taskIds: readonly string[];
} {
  const registry = createTaskRegistry(createStrategicSupplementalTaskRegistrations());
  registry.validateWorkflow(strategicSupplementalWorkflowDefinition);
  const { taskIds } = advanceWorkflowFixture(
    STRATEGIC_SUPPLEMENTAL_TASK_IDS,
    createStrategicSupplementalTaskRegistrations(),
  );
  return {
    status: "passed",
    workflowId: strategicSupplementalWorkflowDefinition.id,
    revision: strategicSupplementalWorkflowDefinition.revision,
    taskCount: strategicSupplementalWorkflowDefinition.taskIds.length,
    taskIds,
  };
}
