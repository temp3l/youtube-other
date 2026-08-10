import { HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36 } from "./visual-plan-shadow-v36.js";

export const HISTORY_V36_CANARY_EPISODES_ENV =
  "MEDIAFORGE_HISTORY_V36_CANARY_EPISODES" as const;

export const historyProductionModeValuesV36 = [
  "off",
  "canary",
  "global",
] as const;

export type HistoryProductionModeV36 =
  (typeof historyProductionModeValuesV36)[number];

/** Activation changes this single default; the environment remains the rollback seam. */
export const DEFAULT_HISTORY_PRODUCTION_MODE_V36: HistoryProductionModeV36 =
  "off";

export type HistoryProductionRouteV36 =
  | "V3_5_PRODUCTION"
  | "V3_6_PRODUCTION";

export interface HistoryProductionRouteDecisionV36 {
  readonly route: HistoryProductionRouteV36;
  readonly mode: HistoryProductionModeV36;
  readonly activationFlag: typeof HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36;
  readonly canaryEpisodesEnv: typeof HISTORY_V36_CANARY_EPISODES_ENV;
  readonly episodeId: string;
  readonly productionActivated: boolean;
  readonly reason:
    | "V3_6_OFF"
    | "V3_6_SHADOW_IS_NOT_PRODUCTION"
    | "EPISODE_NOT_IN_CANARY_ALLOWLIST"
    | "V3_6_CANARY_EXPLICITLY_ENABLED"
    | "V3_6_GLOBAL_ENABLED";
}

export class HistoryProductionRoutingConfigErrorV36 extends Error {
  readonly code = "HISTORY_V36_ROUTING_MODE_INVALID" as const;

  constructor(readonly configuredValue: string) {
    super(
      `Invalid ${HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36} value ${JSON.stringify(configuredValue)}; expected off, shadow, canary, or global.`
    );
    this.name = "HistoryProductionRoutingConfigErrorV36";
  }
}

export type HistoryProductionCanaryRouteV36 =
  | "V3_5_PRODUCTION"
  | "V3_6_PRODUCTION_CANDIDATE";

export interface HistoryProductionCanaryRouteDecisionV36 {
  readonly route: HistoryProductionCanaryRouteV36;
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
 * `shadow` belongs to the earlier inspection lane and is deliberately OFF for
 * production. Unknown values fail closed instead of silently selecting V3.5.
 */
export function parseHistoryProductionModeV36(
  value: string | undefined,
  defaultMode: HistoryProductionModeV36 = DEFAULT_HISTORY_PRODUCTION_MODE_V36
): HistoryProductionModeV36 {
  if (value === undefined || value.trim() === "") return defaultMode;
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === "shadow") return "off";
  if (
    normalized === "off" ||
    normalized === "canary" ||
    normalized === "global"
  )
    return normalized;
  throw new HistoryProductionRoutingConfigErrorV36(value);
}

export function resolveHistoryProductionRouteV36(input: {
  readonly episodeId: string;
  readonly activationFlagValue?: string;
  readonly canaryEpisodesValue?: string;
  readonly defaultMode?: HistoryProductionModeV36;
}): HistoryProductionRouteDecisionV36 {
  const raw = input.activationFlagValue?.trim().toLocaleLowerCase();
  const mode = parseHistoryProductionModeV36(
    input.activationFlagValue,
    input.defaultMode ?? DEFAULT_HISTORY_PRODUCTION_MODE_V36
  );
  const common = {
    mode,
    activationFlag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
    canaryEpisodesEnv: HISTORY_V36_CANARY_EPISODES_ENV,
    episodeId: input.episodeId,
  } as const;
  if (mode === "off") {
    return {
      ...common,
      route: "V3_5_PRODUCTION",
      productionActivated: false,
      reason:
        raw === "shadow" ? "V3_6_SHADOW_IS_NOT_PRODUCTION" : "V3_6_OFF",
    };
  }
  if (mode === "canary") {
    const allowlist = parseHistoryV36CanaryEpisodes(input.canaryEpisodesValue);
    if (!allowlist.includes(input.episodeId)) {
      return {
        ...common,
        route: "V3_5_PRODUCTION",
        productionActivated: false,
        reason: "EPISODE_NOT_IN_CANARY_ALLOWLIST",
      };
    }
    return {
      ...common,
      route: "V3_6_PRODUCTION",
      productionActivated: false,
      reason: "V3_6_CANARY_EXPLICITLY_ENABLED",
    };
  }
  return {
    ...common,
    route: "V3_6_PRODUCTION",
    productionActivated: true,
    reason: "V3_6_GLOBAL_ENABLED",
  };
}

/**
 * The only V3.6 production-like route is an explicit canary candidate. It is
 * deliberately unable to select V3.6 for an episode not named in the allowlist.
 */
export function resolveHistoryProductionCanaryRouteV36(input: {
  readonly episodeId: string;
  readonly activationFlagValue?: string;
  readonly canaryEpisodesValue?: string;
}): HistoryProductionCanaryRouteDecisionV36 {
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
