import path from "node:path";
import { createHash } from "node:crypto";
import {
  contentLocaleSchema,
  contentVariantSchema,
  productionUnitIdSchema,
} from "@mediaforge/domain";
import {
  WorkflowOperator,
  createTaskRegistry,
  type TaskImplementation,
} from "@mediaforge/workflow-engine";
import {
  createStrategicFullTaskRegistrations,
  createStrategicSupplementalTaskRegistrations,
  STRATEGIC_FULL_TASK_IDS,
  STRATEGIC_SUPPLEMENTAL_TASK_IDS,
  strategicFullWorkflowDefinition,
  strategicSupplementalWorkflowDefinition,
} from "./task-registry.js";
import { runStrategicEpisodePipeline } from "./episode-pipeline.js";

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

function createStrategicEpisodeImplementations(input: {
  readonly workspaceRoot: string;
  readonly episodeId: string;
}): Readonly<Partial<Record<string, TaskImplementation>>> {
  const runPipeline =
    (stage: string): TaskImplementation =>
    async () => {
      const result = await runStrategicEpisodePipeline({
        workspaceRoot: input.workspaceRoot,
        episodeId: input.episodeId,
        resume: true,
      });
      return {
        outputArtifacts: [],
        warnings: result.resumed
          ? [`${stage} reused cached strategic episode pipeline state.`]
          : [`${stage} materialized strategic episode pipeline state.`],
      };
    };
  const implementations: Record<string, TaskImplementation> = {};
  for (const taskId of STRATEGIC_FULL_TASK_IDS) {
    if (taskId.endsWith("-approval") || taskId.endsWith("-review")) {
      continue;
    }
    implementations[taskId] = runPipeline(taskId);
  }
  return implementations;
}

export function createStrategicFullWorkflowOperator(request: {
  readonly unitRoot: string;
  readonly episodeId: string;
  readonly locale?: string;
  readonly variant?: string;
}): WorkflowOperator {
  const unitId = productionUnitIdSchema.parse(request.episodeId);
  const locale = contentLocaleSchema.parse(request.locale ?? "it");
  const variant = contentVariantSchema.parse(request.variant ?? "full");
  const workspaceRoot = path.dirname(request.unitRoot);
  return new WorkflowOperator({
    unitRoot: request.unitRoot,
    workflow: strategicFullWorkflowDefinition,
    registry: createTaskRegistry(
      createStrategicFullTaskRegistrations(
        createStrategicEpisodeImplementations({ workspaceRoot, episodeId: unitId }),
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
  });
}

export function createStrategicSupplementalWorkflowOperator(request: {
  readonly unitRoot: string;
  readonly episodeId: string;
  readonly locale?: string;
  readonly variant?: string;
}): WorkflowOperator {
  return createStrategicFullWorkflowOperator(request);
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
