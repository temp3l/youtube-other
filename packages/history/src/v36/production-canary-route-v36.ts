import { HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36 } from "./visual-plan-shadow-v36.js";

export const HISTORY_V36_CANARY_EPISODES_ENV =
  "MEDIAFORGE_HISTORY_V36_CANARY_EPISODES" as const;

export type HistoryProductionRouteV36 =
  | "V3_5_PRODUCTION"
  | "V3_6_PRODUCTION_CANDIDATE";

export interface HistoryProductionRouteDecisionV36 {
  readonly route: HistoryProductionRouteV36;
  readonly activationFlag: typeof HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36;
  readonly canaryEpisodesEnv: typeof HISTORY_V36_CANARY_EPISODES_ENV;
  readonly episodeId: string;
  readonly productionActivated: false;
  readonly reason:
    | "V3_6_DISABLED_BY_DEFAULT"
    | "EPISODE_NOT_IN_CANARY_ALLOWLIST"
    | "V3_6_CANARY_EXPLICITLY_ENABLED";
}

/** Exact, normalized episode IDs only; no prefix or genre inference is allowed. */
export function parseHistoryV36CanaryEpisodes(value: string | undefined): readonly string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((episodeId) => episodeId.trim())
        .filter((episodeId) => episodeId.length > 0)
    ),
  ].sort((left, right) => left.localeCompare(right));
}

/**
 * The only V3.6 production-like route is an explicit canary candidate. It is
 * deliberately unable to select V3.6 for an episode not named in the allowlist.
 */
export function resolveHistoryProductionCanaryRouteV36(input: {
  readonly episodeId: string;
  readonly activationFlagValue?: string;
  readonly canaryEpisodesValue?: string;
}): HistoryProductionRouteDecisionV36 {
  const allowlist = parseHistoryV36CanaryEpisodes(input.canaryEpisodesValue);
  if (input.activationFlagValue !== "canary") {
    return {
      route: "V3_5_PRODUCTION",
      activationFlag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
      canaryEpisodesEnv: HISTORY_V36_CANARY_EPISODES_ENV,
      episodeId: input.episodeId,
      productionActivated: false,
      reason: "V3_6_DISABLED_BY_DEFAULT",
    };
  }
  if (!allowlist.includes(input.episodeId)) {
    return {
      route: "V3_5_PRODUCTION",
      activationFlag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
      canaryEpisodesEnv: HISTORY_V36_CANARY_EPISODES_ENV,
      episodeId: input.episodeId,
      productionActivated: false,
      reason: "EPISODE_NOT_IN_CANARY_ALLOWLIST",
    };
  }
  return {
    route: "V3_6_PRODUCTION_CANDIDATE",
    activationFlag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
    canaryEpisodesEnv: HISTORY_V36_CANARY_EPISODES_ENV,
    episodeId: input.episodeId,
    productionActivated: false,
    reason: "V3_6_CANARY_EXPLICITLY_ENABLED",
  };
}
