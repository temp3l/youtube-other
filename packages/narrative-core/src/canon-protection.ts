import { z } from "zod";

export const CANON_PROTECTED_SURFACES = [
  "prior_truth",
  "canonical_events",
  "knowledge_state",
  "reveal_order",
  "promise_resolution",
] as const;

export const canonProtectedSurfaceSchema = z.enum(CANON_PROTECTED_SURFACES);
export type CanonProtectedSurface = z.infer<typeof canonProtectedSurfaceSchema>;

export const PLANNING_SAFE_SURFACES = [
  "hook_presentation",
  "pacing_ratio",
  "visual_emphasis",
  "metadata_variant",
  "cliffhanger_presentation",
] as const;

export const planningSafeSurfaceSchema = z.enum(PLANNING_SAFE_SURFACES);
export type PlanningSafeSurface = z.infer<typeof planningSafeSurfaceSchema>;

export function isCanonProtectedSurface(
  surface: string
): surface is CanonProtectedSurface {
  return (CANON_PROTECTED_SURFACES as readonly string[]).includes(surface);
}

export function assertPlanningOnlySurfaces(
  surfaces: readonly string[]
): surfaces is readonly PlanningSafeSurface[] {
  return surfaces.every(
    (surface) =>
      (PLANNING_SAFE_SURFACES as readonly string[]).includes(surface) &&
      !isCanonProtectedSurface(surface)
  );
}
