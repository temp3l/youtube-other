import { computePayloadHash } from "@mediaforge/narrative-core";

import {
  expectedEpisodeRange,
  validateRollingPlanConstraints,
  type RollingPlanConstraintContext,
} from "./rolling-plan-constraints.js";
import {
  NEAR_HORIZON_DEFAULT_SIZE,
  parseCanonicalEpisodeNumber,
  ROLLING_PLAN_SCHEMA_VERSION,
  rollingPlanPayloadSchema,
  rollingPlanRevisionSchema,
  type PlanningHorizon,
  type PlanningIntention,
  type RollingPlanPayload,
  type RollingPlanRevision,
  type RollingPlanValidationResult,
} from "./rolling-plan-contracts.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

export type RollingPlanFixtureInput = {
  readonly planningHorizon: PlanningHorizon;
  readonly anchoredSnapshotRevisionId: string;
  readonly constraintContext: RollingPlanConstraintContext;
  readonly productionEpisodeId: string;
  readonly draftIntentions: readonly PlanningIntention[];
  readonly nearHorizonSize?: number;
  readonly storyArcId?: string;
  readonly createdAt: string;
  readonly revisionNumber?: number;
  readonly parentRevisionIds?: readonly string[];
};

function episodeIdFromNumber(episodeNumber: number): string {
  return `E${String(episodeNumber).padStart(3, "0")}`;
}

function buildEpisodeRange(
  horizon: PlanningHorizon,
  productionEpisodeNumber: number,
  nearHorizonSize: number
): RollingPlanPayload["episodeRange"] {
  const range = expectedEpisodeRange(horizon, productionEpisodeNumber, nearHorizonSize);
  return {
    startEpisodeId: episodeIdFromNumber(range.start),
    endEpisodeId: episodeIdFromNumber(range.end),
  };
}

export function buildRollingPlanPayload(
  input: RollingPlanFixtureInput
): RollingPlanPayload {
  const productionEpisodeNumber = parseCanonicalEpisodeNumber(input.productionEpisodeId);
  if (productionEpisodeNumber === null) {
    throw new Error(`Invalid production episode id ${input.productionEpisodeId}.`);
  }

  const nearHorizonSize = input.nearHorizonSize ?? NEAR_HORIZON_DEFAULT_SIZE;
  const payload = rollingPlanPayloadSchema.parse({
    schemaVersion: ROLLING_PLAN_SCHEMA_VERSION,
    seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
    seasonId: "season-1",
    planningHorizon: input.planningHorizon,
    anchoredSnapshotRevisionId: input.anchoredSnapshotRevisionId,
    anchoredSnapshotId: input.constraintContext.acceptedSnapshot.snapshotId,
    storyArcId: input.storyArcId,
    productionEpisodeId: input.productionEpisodeId,
    episodeRange: buildEpisodeRange(
      input.planningHorizon,
      productionEpisodeNumber,
      nearHorizonSize
    ),
    intentions: [...input.draftIntentions],
    nearHorizonSize:
      input.planningHorizon === "near_horizon" ? nearHorizonSize : undefined,
    provenance: {
      sourceKind: "planning",
      sourceRevisionIds: [input.anchoredSnapshotRevisionId],
      notes: "provider-free fixture compilation",
    },
  });
  return payload;
}

export function buildRollingPlanRevision(
  input: RollingPlanFixtureInput
): RollingPlanRevision {
  const payload = buildRollingPlanPayload(input);
  const revisionNumber = input.revisionNumber ?? 1;
  const revisionId = `rev.rolling-plan.${input.planningHorizon}.${input.productionEpisodeId.toLowerCase()}.v${revisionNumber}`;
  const aggregateId = `rolling-plan.${SEVEN_MINUTES_AHEAD_SERIES_ID}.${input.planningHorizon}`;
  return rollingPlanRevisionSchema.parse({
    schemaVersion: ROLLING_PLAN_SCHEMA_VERSION,
    revisionId,
    aggregateId,
    revisionNumber,
    payload,
    contentHash: computePayloadHash(payload),
    parentRevisionIds: [...(input.parentRevisionIds ?? [])],
    status: "VALIDATED",
    createdAt: input.createdAt,
  });
}

export function compileRollingPlanFromFixture(
  input: RollingPlanFixtureInput
): RollingPlanValidationResult {
  const revision = buildRollingPlanRevision(input);
  return validateRollingPlanConstraints(revision, input.constraintContext);
}
