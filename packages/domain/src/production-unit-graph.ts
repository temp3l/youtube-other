import type { ProductionUnitKind } from "./artifact-lineage-contracts.js";

/** Downstream production-unit kinds invalidated when an upstream kind changes. */
export const PRODUCTION_UNIT_KIND_DEPENDENTS: Readonly<
  Record<ProductionUnitKind, readonly ProductionUnitKind[]>
> = {
  brief_script: ["narration", "visual_plan"],
  narration: ["tts", "subtitles"],
  visual_plan: ["scene_visual", "map", "diagram"],
  scene_visual: ["render"],
  map: ["render"],
  diagram: ["render"],
  tts: ["render"],
  subtitles: ["render"],
  render: ["review_readiness", "publish_readiness"],
  review_readiness: [],
  publish_readiness: [],
};

/** Kinds whose instances are independently addressable by `unitKey`. */
export const INDEPENDENTLY_ADDRESSABLE_PRODUCTION_UNIT_KINDS: Readonly<
  Set<ProductionUnitKind>
> = new Set(["scene_visual", "map", "diagram"]);

/** Kinds invalidated as a cohort when an upstream plan changes. */
export const COHORT_INVALIDATED_KINDS: Readonly<Set<ProductionUnitKind>> =
  new Set(["scene_visual", "map", "diagram"]);

export function listDependentProductionUnitKinds(
  kind: ProductionUnitKind
): readonly ProductionUnitKind[] {
  return PRODUCTION_UNIT_KIND_DEPENDENTS[kind];
}

export function isIndependentlyAddressableProductionUnitKind(
  kind: ProductionUnitKind
): boolean {
  return INDEPENDENTLY_ADDRESSABLE_PRODUCTION_UNIT_KINDS.has(kind);
}

export function isCohortInvalidatedProductionUnitKind(
  kind: ProductionUnitKind
): boolean {
  return COHORT_INVALIDATED_KINDS.has(kind);
}
