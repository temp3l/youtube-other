import {
  VERONICA_DEFAULT_LANDSCAPE_PROFILE,
  VERONICA_DEFAULT_PORTRAIT_PROFILE,
  type VeronicaMediaPlan,
} from "../contracts/media-plan.v1.js";
import { validatePortraitReadiness } from "../localization/translation.js";

export function buildAspectRatioPlanSet(plan: VeronicaMediaPlan) {
  return {
    landscape: {
      profile: plan.aspectProfiles.landscape ?? VERONICA_DEFAULT_LANDSCAPE_PROFILE,
      placements: plan.landscapePlacements,
    },
    portrait: {
      profile: plan.aspectProfiles.portrait ?? VERONICA_DEFAULT_PORTRAIT_PROFILE,
      placements: plan.portraitPlacements,
    },
    portraitReadinessRatio: validatePortraitReadiness(plan),
    independentCompositions:
      plan.landscapePlacements !== plan.portraitPlacements &&
      plan.landscapePlacements.length === plan.portraitPlacements.length,
  };
}
