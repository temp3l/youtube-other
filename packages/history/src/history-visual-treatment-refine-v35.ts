import type { HistoryShotV34, HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import type { HistoryBeatV35, HistoryVisualModalityV35 } from "./history-v35-contracts.js";
import { evaluateShotEffectiveChangeV35 } from "./history-effective-change-v35.js";
import {
  LONG_STATIC_SOFT_WARNING_MS,
  LONG_STATIC_STRONG_WARNING_MS,
} from "./history-visual-semantics-v34.js";
import {
  buildVisualTreatmentSignatureV35,
  measureTreatmentWindowConcentrationV35,
  SEGMENT_DIVERSITY_WINDOW_V35,
  type EditorialProgressionRole,
  type VisualTreatmentSignature,
} from "./history-visual-repetition-v35.js";

const STATIC_MODALITIES = new Set<HistoryVisualModalityV35>([
  "archival image",
  "historical artwork",
  "text-only transition",
  "narration-emphasis",
  "document",
  "quotation",
  "comparison card",
  "restrained atmospheric reconstruction",
]);

const CAMERA_ROTATIONS = [
  "static locked hold",
  "measured pull-back reveal",
  "gentle lateral drift",
  "slow push-in on evidence",
  "hold then micro-pan",
] as const;

const FRAMING_ROTATIONS = [
  "wide establishing vista",
  "medium subject hold",
  "tight evidentiary inset",
  "split comparison board",
] as const;

function hashPick<T>(seed: string, values: readonly T[]): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return values[hash % values.length]!;
}

function hashNumber(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

function assignBalancedCameraMovement(
  shot: HistoryShotV34,
  usage: Map<string, number>
): string {
  const ranked = [...CAMERA_ROTATIONS].sort((left, right) => {
    const leftCount = usage.get(left) ?? 0;
    const rightCount = usage.get(right) ?? 0;
    if (leftCount !== rightCount) return leftCount - rightCount;
    return hashNumber(`${shot.id}|${left}`) - hashNumber(`${shot.id}|${right}`);
  });
  return ranked[0] ?? shot.cameraMovement;
}

function progressionRoleFromPurpose(purpose: string): EditorialProgressionRole {
  return (purpose.split(/\s+/u)[0] ?? "establish") as EditorialProgressionRole;
}

function upgradeShotForEffectiveChange(
  shot: HistoryShotV34,
  breakIndex = 0
): HistoryShotV34 {
  const claimId =
    shot.linkedClaimIds[breakIndex % Math.max(1, shot.linkedClaimIds.length)] ??
    shot.linkedClaimIds[0] ??
    "claim-focus";
  const progressionRole = progressionRoleFromPurpose(shot.purpose);
  const annotationAction =
    progressionRole === "explain"
      ? "explanatory annotation appearance"
      : progressionRole === "develop"
        ? "artifact detail evidence transition with annotation appearance"
        : "label reveal for evidentiary emphasis";
  const alternateFraming = shot.framing.includes("tight")
    ? "wide establishing vista"
    : shot.framing.includes("wide")
      ? "tight evidentiary inset"
      : "split comparison board";
  return {
    ...shot,
    framing: alternateFraming,
    action: annotationAction,
    factualLabels: [...new Set([...shot.factualLabels, claimId, `evidence-layer-${breakIndex}`])],
    midground: `${shot.midground.split(" claim focus ")[0] ?? shot.midground} claim focus ${claimId}`,
    purpose: shot.purpose.replace(/^establish/u, "explain"),
  };
}

function forceStaticRunBreak(
  shot: HistoryShotV34,
  prior: HistoryShotV34,
  breakIndex: number
): HistoryShotV34 {
  return upgradeShotForEffectiveChange(shot, breakIndex);
}

function diversifyTreatmentShot(
  shot: HistoryShotV34,
  window: readonly VisualTreatmentSignature[]
): HistoryShotV34 {
  if (window.length < 2) return shot;
  const concentration = measureTreatmentWindowConcentrationV35(window);
  if (concentration < 0.6) return shot;
  const cameraMovement = hashPick(`${shot.id}|camera`, CAMERA_ROTATIONS);
  const framing = hashPick(`${shot.id}|framing`, FRAMING_ROTATIONS);
  if (cameraMovement === shot.cameraMovement && framing === shot.framing) return shot;
  return {
    ...shot,
    cameraMovement,
    framing,
    transition: "hard narration cut",
  };
}

function splitLongStaticBeatShot(
  shot: HistoryShotV34,
  modality: HistoryVisualModalityV35
): HistoryShotV34[] {
  if (!STATIC_MODALITIES.has(modality) || shot.durationMs <= LONG_STATIC_SOFT_WARNING_MS)
    return [shot];
  const firstDuration = Math.floor(shot.durationMs / 2);
  const secondDuration = shot.durationMs - firstDuration;
  const first: HistoryShotV34 = {
    ...shot,
    durationMs: firstDuration,
    endMs: shot.startMs + firstDuration,
    framing: "wide establishing vista",
    action: "environmental establishing transition",
  };
  const second: HistoryShotV34 = {
    ...upgradeShotForEffectiveChange({
      ...shot,
      id: `${shot.id}-b`,
      startMs: shot.startMs + firstDuration,
      durationMs: secondDuration,
      endMs: shot.endMs,
      purpose: shot.purpose.replace(/^establish/u, "explain"),
    }),
    id: `${shot.id}-b`,
    startMs: shot.startMs + firstDuration,
    durationMs: secondDuration,
    endMs: shot.endMs,
  };
  return [first, second];
}

function evaluateShotChange(input: {
  readonly shot: HistoryShotV34;
  readonly priorShot: HistoryShotV34 | null;
  readonly modality: HistoryVisualModalityV35;
  readonly priorModality: HistoryVisualModalityV35 | null;
  readonly diagramStateById: ReadonlyMap<string, HistoryDiagramStateV34>;
}) {
  return evaluateShotEffectiveChangeV35({
    shot: input.shot,
    priorShot: input.priorShot,
    modality: input.modality,
    priorModality: input.priorModality,
    diagramState: input.shot.modalityStateReference
      ? input.diagramStateById.get(input.shot.modalityStateReference) ?? null
      : null,
    priorDiagramState: input.priorShot?.modalityStateReference
      ? input.diagramStateById.get(input.priorShot.modalityStateReference) ?? null
      : null,
  });
}

function breakAccumulatedStaticRuns(
  shots: readonly HistoryShotV34[],
  beatModality: ReadonlyMap<string, HistoryVisualModalityV35>,
  diagramStateById: ReadonlyMap<string, HistoryDiagramStateV34>
): HistoryShotV34[] {
  const broken: HistoryShotV34[] = [];
  let staticRunMs = 0;
  let breakIndex = 0;

  for (const shot of shots) {
    const modality = beatModality.get(shot.beatId) ?? "archival image";
    const prior = broken[broken.length - 1] ?? null;
    let next = shot;
    if (STATIC_MODALITIES.has(modality) && prior) {
      const evaluated = evaluateShotChange({
        shot: next,
        priorShot: prior,
        modality,
        priorModality: beatModality.get(prior.beatId) ?? "archival image",
        diagramStateById,
      });
      if (staticRunMs >= LONG_STATIC_SOFT_WARNING_MS && !evaluated.resetsVisualClock) {
        next = forceStaticRunBreak(next, prior, breakIndex);
        breakIndex += 1;
      }
      const finalEval = evaluateShotChange({
        shot: next,
        priorShot: prior,
        modality,
        priorModality: beatModality.get(prior.beatId) ?? "archival image",
        diagramStateById,
      });
      staticRunMs = finalEval.resetsVisualClock ? next.durationMs : staticRunMs + next.durationMs;
    } else if (STATIC_MODALITIES.has(modality)) {
      staticRunMs = shot.durationMs;
    } else {
      staticRunMs = 0;
    }
    broken.push(next);
  }
  return broken;
}

function selectSemanticCameraMovement(input: {
  readonly shot: HistoryShotV34;
  readonly modality: HistoryVisualModalityV35;
  readonly progressionRole: EditorialProgressionRole;
}): string {
  const action = input.shot.action.toLocaleLowerCase();
  if (input.modality === "map" || input.modality === "diagram" || input.modality === "timeline")
    return "static locked hold";
  if (input.modality === "document" || input.modality === "quotation") return "static locked hold";
  if (input.progressionRole === "establish" || /environmental establishing/i.test(action))
    return "measured pull-back reveal";
  if (input.progressionRole === "contrast" || /comparison reveal/i.test(action))
    return "hold then micro-pan";
  if (
    input.progressionRole === "develop" ||
    input.progressionRole === "explain" ||
    /artifact|annotation|evidentiary/i.test(action) ||
    input.shot.framing.includes("tight")
  )
    return "slow push-in on evidence";
  if (input.progressionRole === "resolve" || /aftermath/i.test(action))
    return "gentle lateral drift";
  return "static locked hold";
}

function balanceCameraDistribution(
  shots: readonly HistoryShotV34[],
  beatModality: ReadonlyMap<string, HistoryVisualModalityV35>
): HistoryShotV34[] {
  const usage = new Map<string, number>();
  return shots.map((shot) => {
    const modality = beatModality.get(shot.beatId) ?? "archival image";
    const progressionRole = progressionRoleFromPurpose(shot.purpose);
    const semantic = selectSemanticCameraMovement({ shot, modality, progressionRole });
    const ranked = [semantic, ...CAMERA_ROTATIONS.filter((item) => item !== semantic)].sort(
      (left, right) => (usage.get(left) ?? 0) - (usage.get(right) ?? 0)
    );
    const cameraMovement = ranked[0] ?? semantic;
    usage.set(cameraMovement, (usage.get(cameraMovement) ?? 0) + 1);
    return cameraMovement === shot.cameraMovement ? shot : { ...shot, cameraMovement };
  });
}

export function refineVisualTreatmentPlanV35(input: {
  readonly shots: readonly HistoryShotV34[];
  readonly beats: readonly HistoryBeatV35[];
  readonly diagramStates?: readonly HistoryDiagramStateV34[];
}): {
  readonly shots: HistoryShotV34[];
  readonly beats: HistoryBeatV35[];
} {
  const beatModality = new Map(input.beats.map((beat) => [beat.id, beat.modality] as const));
  const diagramStateById = new Map(
    (input.diagramStates ?? []).map((state) => [state.id, state] as const)
  );
  const refined: HistoryShotV34[] = [];
  const treatmentWindow: VisualTreatmentSignature[] = [];

  for (const shot of input.shots) {
    const modality = beatModality.get(shot.beatId) ?? "archival image";
    const prior = refined[refined.length - 1] ?? null;
    const evaluated =
      prior &&
      evaluateShotChange({
        shot,
        priorShot: prior,
        modality,
        priorModality: beatModality.get(prior.beatId) ?? "archival image",
        diagramStateById,
      });
    const ineffectivePair =
      Boolean(evaluated) && prior?.beatId === shot.beatId && !evaluated!.resetsVisualClock;

    if (ineffectivePair && prior) {
      const mergedDuration = prior.durationMs + shot.durationMs;
      if (mergedDuration <= LONG_STATIC_SOFT_WARNING_MS) {
        refined[refined.length - 1] = {
          ...prior,
          durationMs: mergedDuration,
          endMs: shot.endMs,
          linkedClaimIds: [...new Set([...prior.linkedClaimIds, ...shot.linkedClaimIds])],
        };
        continue;
      }
      refined[refined.length - 1] = upgradeShotForEffectiveChange(prior);
      refined.push(diversifyTreatmentShot(upgradeShotForEffectiveChange(shot), treatmentWindow));
      const latest = refined[refined.length - 1]!;
      treatmentWindow.push(
        buildVisualTreatmentSignatureV35({
          shot: latest,
          modality,
          progressionRole: progressionRoleFromPurpose(latest.purpose),
        })
      );
      if (treatmentWindow.length > SEGMENT_DIVERSITY_WINDOW_V35) treatmentWindow.shift();
      continue;
    }

    let nextShots: HistoryShotV34[] = [shot];
    const isFirstShotInBeat = !prior || prior.beatId !== shot.beatId;
    if (
      isFirstShotInBeat &&
      shot.durationMs > LONG_STATIC_SOFT_WARNING_MS &&
      STATIC_MODALITIES.has(modality)
    )
      nextShots = splitLongStaticBeatShot(shot, modality);
    else if (shot.durationMs > LONG_STATIC_STRONG_WARNING_MS && STATIC_MODALITIES.has(modality))
      nextShots = [upgradeShotForEffectiveChange(shot)];

    for (const candidate of nextShots) {
      const diversified = diversifyTreatmentShot(candidate, treatmentWindow);
      refined.push(diversified);
      treatmentWindow.push(
        buildVisualTreatmentSignatureV35({
          shot: diversified,
          modality,
          progressionRole: progressionRoleFromPurpose(diversified.purpose),
        })
      );
      if (treatmentWindow.length > SEGMENT_DIVERSITY_WINDOW_V35) treatmentWindow.shift();
    }
  }

  const staticBroken = breakAccumulatedStaticRuns(refined, beatModality, diagramStateById);
  const balancedShots = balanceCameraDistribution(staticBroken, beatModality);
  const shotsByBeat = new Map<string, string[]>();
  for (const shot of balancedShots) {
    const list = shotsByBeat.get(shot.beatId) ?? [];
    list.push(shot.id);
    shotsByBeat.set(shot.beatId, list);
  }
  const beats = input.beats.map((beat) => ({
    ...beat,
    shotIds: shotsByBeat.get(beat.id) ?? beat.shotIds,
  }));
  return { shots: balancedShots, beats };
}
