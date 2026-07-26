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
  const dependents: Readonly<Record<MathStage, readonly MathStage[]>> = {
    "curriculum-import": ["source-validation"],
    "source-validation": ["prerequisite-graph"],
    "prerequisite-graph": ["lesson-spec"],
    "lesson-spec": ["math-verification"],
    "math-verification": ["canonical-narration"],
    "canonical-narration": ["scene-timing"],
    "scene-timing": ["localization", "timing-reflow"],
    localization: ["visual-assets", "tts"],
    "visual-assets": ["render"],
    tts: ["timing-reflow"],
    "timing-reflow": ["render"],
    render: ["metadata-playlists", "quality-gate"],
    "metadata-playlists": ["quality-gate", "publish"],
    "quality-gate": ["publish"],
    publish: [],
  };
  const stale = new Set<MathStage>();
  const queue = [...changedStages];
  while (queue.length > 0) {
    const stage = queue.shift();
    if (!stage || stale.has(stage)) continue;
    stale.add(stage);
    queue.push(...dependents[stage]);
  }
  if (stale.size === 0) return manifest;
  return workflowManifestSchema.parse({
    ...manifest,
    stages: manifest.stages.map((record) => {
      if (!stale.has(record.stage)) return record;
      if (!["succeeded", "cached", "running"].includes(record.status))
        return record;
      return {
        ...record,
        status: "stale",
        updatedAt,
        error: `Invalidated by ${changedStages.join(", ")}.`,
      };
    }),
  });
}
