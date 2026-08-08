import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";

export const EXPECTED_PLANNING_PRODUCTION_BLOCKERS_V35 = [
  "TIMING_MEASUREMENT_REQUIRED",
] as const;

export type ExpectedPlanningProductionBlockerV35 =
  (typeof EXPECTED_PLANNING_PRODUCTION_BLOCKERS_V35)[number];

export function listUnexpectedPlanningProductionBlockersV35(
  productionBlockerCodes: readonly string[]
): readonly string[] {
  const allowed = new Set<string>(EXPECTED_PLANNING_PRODUCTION_BLOCKERS_V35);
  return [...new Set(productionBlockerCodes.filter((code) => !allowed.has(code)))].sort();
}

export function assessPlanningAcceptanceV35(plan: HistoryVisualPlanV35): {
  readonly passes: boolean;
  readonly unexpectedProductionBlockers: readonly string[];
  readonly productionBlockerCodes: readonly string[];
  readonly timingSource: string;
} {
  const productionBlockerCodes = plan.approval.production.blockerCodes;
  const unexpectedProductionBlockers =
    listUnexpectedPlanningProductionBlockersV35(productionBlockerCodes);
  return {
    passes: unexpectedProductionBlockers.length === 0,
    unexpectedProductionBlockers,
    productionBlockerCodes,
    timingSource: plan.timing.timingSource,
  };
}
