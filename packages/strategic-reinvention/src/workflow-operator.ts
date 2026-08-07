import path from "node:path";
import { createHash } from "node:crypto";
import {
  contentLocaleSchema,
  contentVariantSchema,
  productionUnitIdSchema,
  WORKFLOW_SCHEMA_VERSION,
} from "@mediaforge/domain";
import {
  WorkflowOperator,
  createTaskRegistry,
  type TaskImplementation,
} from "@mediaforge/workflow-engine";
import {
  createStrategicSupplementalTaskRegistrations,
  STRATEGIC_SUPPLEMENTAL_TASK_IDS,
  strategicSupplementalWorkflowDefinition,
} from "./task-registry.js";
import { runStrategicSupplementalMediaBridge } from "./supplemental-media-bridge.js";

function workflowInstanceId(
  unitId: string,
  locale: string,
  variant: string,
): string {
  return `workflow-${createHash("sha256")
    .update(
      `${strategicSupplementalWorkflowDefinition.id}\0${strategicSupplementalWorkflowDefinition.revision}\0${unitId}\0${locale}\0${variant}`,
    )
    .digest("hex")
    .slice(0, 32)}`;
}

function createStrategicSupplementalImplementations(input: {
  readonly workspaceRoot: string;
  readonly episodeId: string;
}): Readonly<Partial<Record<string, TaskImplementation>>> {
  const runStage =
    (stage: string): TaskImplementation =>
    async () => {
      const result = await runStrategicSupplementalMediaBridge({
        workspaceRoot: input.workspaceRoot,
        episodeId: input.episodeId,
        resume: true,
      });
      return {
        outputArtifacts: [],
        warnings: result.resumed
          ? [`${stage} reused cached supplemental-media pipeline state.`]
          : [`${stage} materialized supplemental-media pipeline state.`],
      };
    };
  return {
    "strategic.supplemental-ingest": runStage("ingest"),
    "strategic.supplemental-plan": runStage("plan"),
    "strategic.supplemental-prepare": runStage("prepare"),
    "strategic.supplemental-approval-pack": runStage("approval-pack"),
  };
}

export function createStrategicSupplementalWorkflowOperator(request: {
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
    workflow: strategicSupplementalWorkflowDefinition,
    registry: createTaskRegistry(
      createStrategicSupplementalTaskRegistrations(
        createStrategicSupplementalImplementations({ workspaceRoot, episodeId: unitId }),
      ),
    ),
    identity: {
      instanceId: workflowInstanceId(unitId, locale, variant),
      unitId,
      locale,
      variant,
    },
  });
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
  const completed = new Set<string>();
  const taskIds: string[] = [];
  while (completed.size < STRATEGIC_SUPPLEMENTAL_TASK_IDS.length) {
    const next = STRATEGIC_SUPPLEMENTAL_TASK_IDS.find((taskId) => {
      if (completed.has(taskId)) return false;
      return registry
        .get(taskId)
        .definition.dependencies.every((dependency) => completed.has(dependency.taskId));
    });
    if (!next) {
      throw new Error("Strategic supplemental workflow fixture cannot advance through the DAG.");
    }
    completed.add(next);
    taskIds.push(next);
  }
  return {
    status: "passed",
    workflowId: strategicSupplementalWorkflowDefinition.id,
    revision: strategicSupplementalWorkflowDefinition.revision,
    taskCount: strategicSupplementalWorkflowDefinition.taskIds.length,
    taskIds,
  };
}
