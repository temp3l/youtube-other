import {
  MATH_STAGES,
  workflowManifestSchema,
  type MathStage,
  type WorkflowManifest,
} from "./workflow.js";

export function invalidateWorkflowStages(
  manifest: WorkflowManifest,
  changedStages: readonly MathStage[],
  updatedAt = new Date().toISOString()
): WorkflowManifest {
  const firstChanged = Math.min(
    ...changedStages.map((stage) => MATH_STAGES.indexOf(stage))
  );
  if (!Number.isFinite(firstChanged)) return manifest;
  return workflowManifestSchema.parse({
    ...manifest,
    stages: manifest.stages.map((record) => {
      if (MATH_STAGES.indexOf(record.stage) < firstChanged) return record;
      if (!["succeeded", "cached", "running"].includes(record.status))
        return record;
      return {
        ...record,
        status: "stale",
        updatedAt,
        error: `Invalidated by ${MATH_STAGES[firstChanged]}.`,
      };
    }),
  });
}
