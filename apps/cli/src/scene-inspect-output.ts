export function buildSceneInspectOutput(
  scene: unknown,
  visualPlan?:
    | {
        readonly previousSceneId?: string;
        readonly renderability?: string;
        readonly reusedFromSceneId?: string;
        readonly materialDifferencesFromPrevious?: readonly string[];
        readonly validationIssues?: readonly { readonly code: string }[];
      }
    | null
): Record<string, unknown> {
  if (!visualPlan) {
    return { scene };
  }
  return {
    scene,
    visualPlanSummary: {
      previousSceneId: visualPlan.previousSceneId,
      renderability: visualPlan.renderability,
      reusedFromSceneId: visualPlan.reusedFromSceneId,
      materialDifferencesFromPrevious:
        visualPlan.materialDifferencesFromPrevious ?? [],
      validationIssueCodes:
        visualPlan.validationIssues?.map((issue) => issue.code) ?? [],
    },
    visualPlan,
  };
}
