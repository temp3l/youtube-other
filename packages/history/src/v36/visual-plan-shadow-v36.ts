import { createHash } from "node:crypto";

import type { HistoryVisualPlanV35 } from "../history-v35-contracts.js";
import type { RenderSpecV36 } from "./renderer-shadow-contract-v36.js";

export const HISTORY_VISUAL_PLAN_SHADOW_SCHEMA_V36 =
  "history-visual-plan-shadow.v1" as const;
export const HISTORY_VISUAL_PLAN_SHADOW_VERSION_V36 =
  "history-visual-plan-shadow.v3.6.0" as const;
export const HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36 =
  "MEDIAFORGE_HISTORY_V36_VISUAL_PLAN" as const;

export type VisualPlanPlacementDiagnosticCodeV36 =
  | "EPISODE_ID_MISMATCH"
  | "SUPPORT_CLAIM_NOT_IN_BASE_PLAN"
  | "INVALID_SUPPORT_BEAT_TIMING";

type PlacementBasePlanV36 = Pick<
  HistoryVisualPlanV35,
  | "schemaVersion"
  | "plannerVersion"
  | "episodeId"
  | "planHash"
  | "timing"
  | "approval"
  | "beats"
  | "shots"
>;

export interface PlacedSemanticVisualV36 {
  readonly disposition: "PLACED";
  readonly placementId: string;
  readonly renderSpecId: string;
  readonly compilerIntentId: string;
  readonly relationId: string;
  readonly relationKind: RenderSpecV36["relationKind"];
  readonly renderTarget: RenderSpecV36["renderTarget"];
  readonly operation: "ATTACH_SEMANTIC_OVERLAY";
  readonly placementRule: "SUPPORT_COMPLETION_BEAT_V1";
  readonly supportClaimIds: readonly string[];
  readonly supportBeatIds: readonly string[];
  readonly anchor: {
    readonly beatId: string;
    readonly startMs: number;
    readonly endMs: number;
    readonly narrationSpan: {
      readonly startUtf16: number;
      readonly endUtf16Exclusive: number;
    };
  };
  readonly preservedBaseShotIds: readonly string[];
  readonly preservesBaseShots: true;
  readonly timingBasis: string;
}

export interface NoSafePlacementV36 {
  readonly disposition: "NO_SAFE_PLACEMENT";
  readonly renderSpecId: string;
  readonly compilerIntentId: string;
  readonly relationId: string;
  readonly relationKind: RenderSpecV36["relationKind"];
  readonly diagnosticCode: VisualPlanPlacementDiagnosticCodeV36;
  readonly reason: string;
}

export type VisualPlanPlacementResultV36 =
  | PlacedSemanticVisualV36
  | NoSafePlacementV36;

export interface HistoryVisualPlanShadowV36 {
  readonly schemaVersion: typeof HISTORY_VISUAL_PLAN_SHADOW_SCHEMA_V36;
  readonly plannerVersion: typeof HISTORY_VISUAL_PLAN_SHADOW_VERSION_V36;
  readonly episodeId: string;
  readonly shadowOnly: true;
  readonly basePlan: {
    readonly schemaVersion: HistoryVisualPlanV35["schemaVersion"];
    readonly plannerVersion: HistoryVisualPlanV35["plannerVersion"];
    readonly planHash: string;
    readonly timingSource: string;
    readonly totalDurationMs: number;
    readonly productionBlockerCodes: readonly string[];
    readonly beatIds: readonly string[];
    readonly shotIds: readonly string[];
  };
  readonly coexistence: {
    readonly mode: "ADDITIVE_SEMANTIC_OVERLAY";
    readonly baseBeatsPreserved: true;
    readonly baseShotsPreserved: true;
    readonly replacementCount: 0;
  };
  readonly renderSpecs: readonly RenderSpecV36[];
  readonly placements: readonly PlacedSemanticVisualV36[];
  readonly safePlacementAbstentions: readonly NoSafePlacementV36[];
  readonly summary: {
    readonly renderSpecs: number;
    readonly placed: number;
    readonly safePlacementAbstentions: number;
    readonly mapPlacements: number;
    readonly diagramPlacements: number;
    readonly duplicatePlacements: 0;
    readonly orphanRenderSpecs: 0;
    readonly replacementCount: 0;
  };
  readonly planHash: string;
}

export interface HistoryVisualPlanShadowValidationV36 {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly counts: {
    readonly duplicatePlacements: number;
    readonly orphanRenderSpecs: number;
    readonly silentRenderSpecDrops: number;
    readonly baseBeatDrops: number;
    readonly baseShotDrops: number;
    readonly replacements: number;
  };
}

export type HistoryVisualPlanRouteV36 = "V3_5_PRODUCTION" | "V3_6_SHADOW";

export interface HistoryVisualPlanRouteDecisionV36 {
  readonly route: HistoryVisualPlanRouteV36;
  readonly activationFlag: typeof HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36;
  readonly configuredValue: "off" | "shadow";
  readonly productionActivated: false;
  readonly reason:
    | "V3_6_DISABLED_BY_DEFAULT"
    | "NON_HISTORY_GENRE"
    | "V3_6_SHADOW_EXPLICITLY_ENABLED";
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function placementId(input: {
  readonly renderSpecId: string;
  readonly anchorBeatId: string;
}): string {
  return `history-visual-placement-${sha256({
    contract: HISTORY_VISUAL_PLAN_SHADOW_SCHEMA_V36,
    renderSpecId: input.renderSpecId,
    anchorBeatId: input.anchorBeatId,
  }).slice(0, 24)}`;
}

function noSafePlacement(
  spec: RenderSpecV36,
  diagnosticCode: VisualPlanPlacementDiagnosticCodeV36,
  reason: string
): NoSafePlacementV36 {
  return {
    disposition: "NO_SAFE_PLACEMENT",
    renderSpecId: spec.renderSpecId,
    compilerIntentId: spec.compilerIntentId,
    relationId: spec.relationId,
    relationKind: spec.relationKind,
    diagnosticCode,
    reason,
  };
}

/**
 * Selects the first exact beat for each supporting claim, then anchors at the
 * beat where the final supporting claim first becomes available. No narration
 * text, labels, or proximity heuristics participate in placement.
 */
export function placeRenderSpecInVisualPlanV36(input: {
  readonly basePlan: PlacementBasePlanV36;
  readonly renderSpec: RenderSpecV36;
}): VisualPlanPlacementResultV36 {
  const { basePlan, renderSpec } = input;
  if (basePlan.episodeId !== renderSpec.episodeId) {
    return noSafePlacement(
      renderSpec,
      "EPISODE_ID_MISMATCH",
      "Render spec and base visual plan belong to different episodes."
    );
  }

  const firstBeatByClaim = renderSpec.provenance.supportClaimIds.map(
    (claimId) => {
      const beats = basePlan.beats
        .filter((beat) => beat.linkedClaimIds.includes(claimId))
        .sort(
          (left, right) =>
            left.endMs - right.endMs || left.id.localeCompare(right.id)
        );
      return { claimId, beat: beats[0] };
    }
  );
  const missingClaimIds = firstBeatByClaim
    .filter((item) => !item.beat)
    .map((item) => item.claimId);
  if (missingClaimIds.length > 0) {
    return noSafePlacement(
      renderSpec,
      "SUPPORT_CLAIM_NOT_IN_BASE_PLAN",
      `No exact V3.5 beat anchor exists for support claim(s): ${missingClaimIds.join(", ")}.`
    );
  }

  const supportBeats = [
    ...new Map(
      firstBeatByClaim.map((item) => [item.beat!.id, item.beat!] as const)
    ).values(),
  ].sort(
    (left, right) =>
      left.endMs - right.endMs || left.id.localeCompare(right.id)
  );
  const anchor = supportBeats.at(-1)!;
  if (
    !Number.isInteger(anchor.startMs) ||
    !Number.isInteger(anchor.endMs) ||
    anchor.startMs < 0 ||
    anchor.endMs <= anchor.startMs
  ) {
    return noSafePlacement(
      renderSpec,
      "INVALID_SUPPORT_BEAT_TIMING",
      "The exact supporting beat has no valid deterministic timing window."
    );
  }

  return {
    disposition: "PLACED",
    placementId: placementId({
      renderSpecId: renderSpec.renderSpecId,
      anchorBeatId: anchor.id,
    }),
    renderSpecId: renderSpec.renderSpecId,
    compilerIntentId: renderSpec.compilerIntentId,
    relationId: renderSpec.relationId,
    relationKind: renderSpec.relationKind,
    renderTarget: renderSpec.renderTarget,
    operation: "ATTACH_SEMANTIC_OVERLAY",
    placementRule: "SUPPORT_COMPLETION_BEAT_V1",
    supportClaimIds: [...renderSpec.provenance.supportClaimIds],
    supportBeatIds: supportBeats.map((beat) => beat.id),
    anchor: {
      beatId: anchor.id,
      startMs: anchor.startMs,
      endMs: anchor.endMs,
      narrationSpan: { ...anchor.narrationSpan },
    },
    preservedBaseShotIds: [...anchor.shotIds],
    preservesBaseShots: true,
    timingBasis: basePlan.timing.timingSource,
  };
}

function assertUniqueRenderSpecs(renderSpecs: readonly RenderSpecV36[]): void {
  for (const [label, values] of [
    ["render spec ID", renderSpecs.map((spec) => spec.renderSpecId)],
    ["compiler intent ID", renderSpecs.map((spec) => spec.compilerIntentId)],
    ["semantic relation ID", renderSpecs.map((spec) => spec.relationId)],
  ] as const) {
    if (new Set(values).size !== values.length) {
      throw new Error(`V3.6 visual-plan integration received a duplicate ${label}.`);
    }
  }
}

export function historyVisualPlanShadowHashV36(
  plan: Omit<HistoryVisualPlanShadowV36, "planHash">
): string {
  return sha256(plan);
}

export function buildHistoryVisualPlanShadowV36(input: {
  readonly basePlan: PlacementBasePlanV36;
  readonly renderSpecs: readonly RenderSpecV36[];
}): HistoryVisualPlanShadowV36 {
  assertUniqueRenderSpecs(input.renderSpecs);
  const results = input.renderSpecs.map((renderSpec) =>
    placeRenderSpecInVisualPlanV36({ basePlan: input.basePlan, renderSpec })
  );
  const placements = results.filter(
    (result): result is PlacedSemanticVisualV36 =>
      result.disposition === "PLACED"
  );
  const safePlacementAbstentions = results.filter(
    (result): result is NoSafePlacementV36 =>
      result.disposition === "NO_SAFE_PLACEMENT"
  );
  const withoutHash: Omit<HistoryVisualPlanShadowV36, "planHash"> = {
    schemaVersion: HISTORY_VISUAL_PLAN_SHADOW_SCHEMA_V36,
    plannerVersion: HISTORY_VISUAL_PLAN_SHADOW_VERSION_V36,
    episodeId: input.basePlan.episodeId,
    shadowOnly: true,
    basePlan: {
      schemaVersion: input.basePlan.schemaVersion,
      plannerVersion: input.basePlan.plannerVersion,
      planHash: input.basePlan.planHash,
      timingSource: input.basePlan.timing.timingSource,
      totalDurationMs: input.basePlan.timing.totalDurationMs,
      productionBlockerCodes: [
        ...input.basePlan.approval.production.blockerCodes,
      ],
      beatIds: input.basePlan.beats.map((beat) => beat.id),
      shotIds: input.basePlan.shots.map((shot) => shot.id),
    },
    coexistence: {
      mode: "ADDITIVE_SEMANTIC_OVERLAY",
      baseBeatsPreserved: true,
      baseShotsPreserved: true,
      replacementCount: 0,
    },
    renderSpecs: [...input.renderSpecs],
    placements,
    safePlacementAbstentions,
    summary: {
      renderSpecs: input.renderSpecs.length,
      placed: placements.length,
      safePlacementAbstentions: safePlacementAbstentions.length,
      mapPlacements: placements.filter(
        (placement) => placement.renderTarget === "MAP_SVG"
      ).length,
      diagramPlacements: placements.filter(
        (placement) => placement.renderTarget === "DIAGRAM_SVG"
      ).length,
      duplicatePlacements: 0,
      orphanRenderSpecs: 0,
      replacementCount: 0,
    },
  };
  return { ...withoutHash, planHash: historyVisualPlanShadowHashV36(withoutHash) };
}

export function validateHistoryVisualPlanShadowV36(
  plan: HistoryVisualPlanShadowV36,
  basePlan: PlacementBasePlanV36
): HistoryVisualPlanShadowValidationV36 {
  const errors: string[] = [];
  const placementSpecIds = plan.placements.map((item) => item.renderSpecId);
  const abstentionSpecIds = plan.safePlacementAbstentions.map(
    (item) => item.renderSpecId
  );
  const resultSpecIds = [...placementSpecIds, ...abstentionSpecIds];
  const renderSpecIds = plan.renderSpecs.map((item) => item.renderSpecId);
  const duplicatePlacements =
    placementSpecIds.length - new Set(placementSpecIds).size;
  const orphanRenderSpecs = renderSpecIds.filter(
    (id) => !resultSpecIds.includes(id)
  ).length;
  const silentRenderSpecDrops = resultSpecIds.filter(
    (id) => !renderSpecIds.includes(id)
  ).length;
  const baseBeatDrops = basePlan.beats.filter(
    (beat) => !plan.basePlan.beatIds.includes(beat.id)
  ).length;
  const baseShotDrops = basePlan.shots.filter(
    (shot) => !plan.basePlan.shotIds.includes(shot.id)
  ).length;
  const replacements = plan.coexistence.replacementCount;
  const expectedHash = historyVisualPlanShadowHashV36(
    Object.fromEntries(
      Object.entries(plan).filter(([key]) => key !== "planHash")
    ) as Omit<HistoryVisualPlanShadowV36, "planHash">
  );

  if (plan.episodeId !== basePlan.episodeId) errors.push("episode-id-mismatch");
  if (plan.basePlan.planHash !== basePlan.planHash)
    errors.push("base-plan-hash-mismatch");
  if (duplicatePlacements > 0) errors.push("duplicate-placement");
  if (orphanRenderSpecs > 0) errors.push("orphan-render-spec");
  if (silentRenderSpecDrops > 0) errors.push("silent-render-spec-drop");
  if (baseBeatDrops > 0) errors.push("base-beat-drop");
  if (baseShotDrops > 0) errors.push("base-shot-drop");
  if (replacements > 0) errors.push("base-visual-replacement");
  if (plan.placements.some((placement) => !placement.preservesBaseShots))
    errors.push("base-shot-preservation-not-declared");
  if (plan.planHash !== expectedHash) errors.push("plan-hash-mismatch");
  return {
    valid: errors.length === 0,
    errors,
    counts: {
      duplicatePlacements,
      orphanRenderSpecs,
      silentRenderSpecDrops,
      baseBeatDrops,
      baseShotDrops,
      replacements,
    },
  };
}

/** Disabled unless the explicit shadow-only value is present. */
export function resolveHistoryVisualPlanRouteV36(input: {
  readonly genre: string;
  readonly activationFlagValue?: string;
}): HistoryVisualPlanRouteDecisionV36 {
  if (input.genre !== "history") {
    return {
      route: "V3_5_PRODUCTION",
      activationFlag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
      configuredValue: "off",
      productionActivated: false,
      reason: "NON_HISTORY_GENRE",
    };
  }
  if (input.activationFlagValue === "shadow") {
    return {
      route: "V3_6_SHADOW",
      activationFlag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
      configuredValue: "shadow",
      productionActivated: false,
      reason: "V3_6_SHADOW_EXPLICITLY_ENABLED",
    };
  }
  return {
    route: "V3_5_PRODUCTION",
    activationFlag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
    configuredValue: "off",
    productionActivated: false,
    reason: "V3_6_DISABLED_BY_DEFAULT",
  };
}
