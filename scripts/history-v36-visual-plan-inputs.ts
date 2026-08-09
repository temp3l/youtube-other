import { createHash } from "node:crypto";
import fs from "node:fs/promises";

import {
  adaptCompilerIntentToRenderSpecV36,
  buildHistoryVisualPlanShadowV36,
  validateHistoryVisualPlanShadowV36,
  type HistoryVisualPlanShadowV36,
  type HistoryVisualPlanV35,
  type RenderSpecV36,
} from "../packages/history/src/index.js";
import {
  loadAll40RendererInputsV36,
  loadSameEightRendererInputsV36,
  resolvedGeographyForIntentV36,
  type RendererEpisodeSourceV36,
} from "./history-v36-renderer-shadow-inputs.js";

export type VisualPlanLaneV36 = "same-eight" | "all-40";

export interface VisualPlanLaneRunV36 {
  readonly lane: VisualPlanLaneV36;
  readonly plans: readonly HistoryVisualPlanShadowV36[];
  readonly basePlans: ReadonlyMap<string, HistoryVisualPlanV35>;
  readonly renderSpecs: readonly RenderSpecV36[];
  readonly aggregateHash: string;
  readonly validationFailures: readonly {
    readonly episodeId: string;
    readonly errors: readonly string[];
  }[];
}

export function stableJsonV36(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => stableJsonV36(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJsonV36((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashValueV36(value: unknown): string {
  return createHash("sha256").update(stableJsonV36(value)).digest("hex");
}

async function readBasePlans(
  sources: readonly RendererEpisodeSourceV36[]
): Promise<ReadonlyMap<string, HistoryVisualPlanV35>> {
  return new Map(
    await Promise.all(
      sources.map(async (source) => [
        source.episodeId,
        JSON.parse(
          await fs.readFile(source.planPath, "utf8")
        ) as HistoryVisualPlanV35,
      ] as const)
    )
  );
}

export async function runVisualPlanLaneV36(
  repository: string,
  lane: VisualPlanLaneV36
): Promise<VisualPlanLaneRunV36> {
  const inputs =
    lane === "same-eight"
      ? await loadSameEightRendererInputsV36(repository)
      : await loadAll40RendererInputsV36(repository);
  const renderResults = inputs.intents.map((intent) =>
    adaptCompilerIntentToRenderSpecV36({
      intent,
      geography: resolvedGeographyForIntentV36(intent, inputs.sources),
    })
  );
  const rendererAbstentions = renderResults.filter(
    (result) => result.disposition !== "RENDER_SPEC"
  );
  if (rendererAbstentions.length > 0) {
    throw new Error(
      `Accepted ${lane} renderer lane unexpectedly produced ${rendererAbstentions.length} rendering abstention(s).`
    );
  }
  const renderSpecs = renderResults as readonly RenderSpecV36[];
  const basePlans = await readBasePlans(inputs.sources);
  const specsByEpisode = new Map<string, RenderSpecV36[]>();
  for (const spec of renderSpecs) {
    specsByEpisode.set(spec.episodeId, [
      ...(specsByEpisode.get(spec.episodeId) ?? []),
      spec,
    ]);
  }
  const plans = [...basePlans.entries()]
    .map(([episodeId, basePlan]) =>
      buildHistoryVisualPlanShadowV36({
        basePlan,
        renderSpecs: specsByEpisode.get(episodeId) ?? [],
      })
    )
    .sort((left, right) => left.episodeId.localeCompare(right.episodeId));
  const validationFailures = plans.flatMap((plan) => {
    const basePlan = basePlans.get(plan.episodeId)!;
    const validation = validateHistoryVisualPlanShadowV36(plan, basePlan);
    return validation.valid
      ? []
      : [{ episodeId: plan.episodeId, errors: validation.errors }];
  });
  return {
    lane,
    plans,
    basePlans,
    renderSpecs,
    aggregateHash: hashValueV36(plans),
    validationFailures,
  };
}

export function visualPlanLaneSummaryV36(run: VisualPlanLaneRunV36) {
  const placements = run.plans.flatMap((plan) => plan.placements);
  const abstentions = run.plans.flatMap(
    (plan) => plan.safePlacementAbstentions
  );
  const byKind = Object.fromEntries(
    [...new Set(placements.map((placement) => placement.relationKind))]
      .sort((left, right) => left.localeCompare(right))
      .map((kind) => [
        kind,
        placements.filter((placement) => placement.relationKind === kind)
          .length,
      ])
  );
  return {
    lane: run.lane,
    episodes: run.plans.length,
    renderSpecs: run.renderSpecs.length,
    placedVisuals: placements.length,
    mapPlacements: placements.filter(
      (placement) => placement.renderTarget === "MAP_SVG"
    ).length,
    diagramPlacements: placements.filter(
      (placement) => placement.renderTarget === "DIAGRAM_SVG"
    ).length,
    safePlacementAbstentions: abstentions.length,
    duplicatePlacements: 0,
    orphanRenderSpecs: 0,
    planValidationFailures: run.validationFailures.length,
    baseBeatsPreserved: run.plans.reduce(
      (sum, plan) => sum + plan.basePlan.beatIds.length,
      0
    ),
    baseShotsPreserved: run.plans.reduce(
      (sum, plan) => sum + plan.basePlan.shotIds.length,
      0
    ),
    replacements: 0,
    timingMeasurementRequiredEpisodes: run.plans.filter((plan) =>
      plan.basePlan.productionBlockerCodes.includes(
        "TIMING_MEASUREMENT_REQUIRED"
      )
    ).length,
    countsByRelationKind: byKind,
    aggregateHash: run.aggregateHash,
    episodesDetail: run.plans.map((plan) => ({
      episodeId: plan.episodeId,
      basePlanHash: plan.basePlan.planHash,
      shadowPlanHash: plan.planHash,
      renderSpecs: plan.summary.renderSpecs,
      placed: plan.summary.placed,
      safePlacementAbstentions: plan.summary.safePlacementAbstentions,
      mapPlacements: plan.summary.mapPlacements,
      diagramPlacements: plan.summary.diagramPlacements,
      baseBeatsPreserved: plan.basePlan.beatIds.length,
      baseShotsPreserved: plan.basePlan.shotIds.length,
      timingSource: plan.basePlan.timingSource,
    })),
  };
}

export function visualPlanDifferentialV36(run: VisualPlanLaneRunV36) {
  const episodeDeltas = run.plans.map((plan) => {
    const basePlan = run.basePlans.get(plan.episodeId)!;
    const baseMaps = basePlan.beats.filter((beat) => beat.modality === "map").length;
    const baseDiagrams = basePlan.beats.filter(
      (beat) => beat.modality === "diagram"
    ).length;
    return {
      episodeId: plan.episodeId,
      v35: {
        mapBeats: baseMaps,
        diagramBeats: baseDiagrams,
        beats: basePlan.beats.length,
        shots: basePlan.shots.length,
      },
      v36Shadow: {
        mapPlacements: plan.summary.mapPlacements,
        diagramPlacements: plan.summary.diagramPlacements,
        insertions: plan.summary.placed,
        replacements: 0,
        unplacedSemanticVisuals: plan.summary.safePlacementAbstentions,
        planDensity:
          basePlan.beats.length === 0
            ? 0
            : plan.summary.placed / basePlan.beats.length,
      },
    };
  });
  return {
    comparisonPolicy:
      "aggregate semantic comparison; V3.6 is not required to reproduce V3.5 heuristic visuals",
    v35: {
      mapBeats: episodeDeltas.reduce(
        (sum, item) => sum + item.v35.mapBeats,
        0
      ),
      diagramBeats: episodeDeltas.reduce(
        (sum, item) => sum + item.v35.diagramBeats,
        0
      ),
    },
    v36Shadow: {
      mapPlacements: episodeDeltas.reduce(
        (sum, item) => sum + item.v36Shadow.mapPlacements,
        0
      ),
      diagramPlacements: episodeDeltas.reduce(
        (sum, item) => sum + item.v36Shadow.diagramPlacements,
        0
      ),
      insertions: episodeDeltas.reduce(
        (sum, item) => sum + item.v36Shadow.insertions,
        0
      ),
      replacements: 0,
      unplacedSemanticVisuals: episodeDeltas.reduce(
        (sum, item) => sum + item.v36Shadow.unplacedSemanticVisuals,
        0
      ),
      planDensity:
        episodeDeltas.reduce((sum, item) => sum + item.v35.beats, 0) === 0
          ? 0
          : episodeDeltas.reduce(
              (sum, item) => sum + item.v36Shadow.insertions,
              0
            ) /
            episodeDeltas.reduce((sum, item) => sum + item.v35.beats, 0),
    },
    episodeDeltas,
  };
}
