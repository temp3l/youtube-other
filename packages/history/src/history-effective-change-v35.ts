import type { HistoryShotV34 } from "./history-v34-contracts.js";
import type {
  HistoryBeatV35,
  HistoryEffectiveChangeAuditV35,
  HistoryEffectiveChangeMetricsV35,
  HistoryShotVisualChangeV35,
  HistoryVisualModalityV35,
} from "./history-v35-contracts.js";
import type { HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import {
  LONG_STATIC_SOFT_WARNING_MS,
  LONG_STATIC_STRONG_WARNING_MS,
} from "./history-visual-semantics-v34.js";

export type EffectiveChangeKind =
  | "asset-change"
  | "subject-visual-change"
  | "map-state-change"
  | "diagram-state-change"
  | "document-state-change"
  | "annotation-state-change"
  | "composition-replacement"
  | "text-state-change"
  | "camera-motion"
  | "transition"
  | "animated-reveal";

export type CompositionFamily =
  | "wide-establish"
  | "medium-hold"
  | "tight-inset"
  | "comparison-board"
  | "overhead-board"
  | "document-desk";

export type MotionFamily =
  | "static-hold"
  | "push-in"
  | "lateral-drift"
  | "pull-back"
  | "micro-pan";

export type TransitionFamily =
  | "hard-cut"
  | "dissolve"
  | "crossfade"
  | "match-cut"
  | "wipe"
  | "other";

export interface EffectiveChangeEvidence {
  readonly kind: EffectiveChangeKind;
  readonly previousStateRef: string | null;
  readonly nextStateRef: string | null;
  readonly resetsVisualClock: boolean;
}

const MICRO_MOTION_PATTERN =
  /^(?:static locked hold|slow push-in on evidence|gentle lateral drift|hold then micro-pan|measured pull-back reveal)$/iu;

function isMicroMotionCamera(cameraMovement: string): boolean {
  return MICRO_MOTION_PATTERN.test(cameraMovement.trim());
}
const STRUCTURED_ANNOTATION_PATTERN =
  /\b(?:annotation appearance|label reveal|route progression with annotation|diagram progression with causal|diagram layer introduction|temporal marker progression|comparison reveal|document evidence transition)\b/iu;

const GENERIC_REVEAL_PATTERN = /\b(?:reveal|opacity|transition)\b/iu;

export function classifyCompositionFamilyV35(framing: string): CompositionFamily {
  const value = framing.toLocaleLowerCase();
  if (/wide establishing/i.test(value)) return "wide-establish";
  if (/tight evidentiary/i.test(value)) return "tight-inset";
  if (/split comparison/i.test(value)) return "comparison-board";
  if (/overhead/i.test(value)) return "overhead-board";
  if (/document desk/i.test(value)) return "document-desk";
  return "medium-hold";
}

export function classifyMotionFamilyV35(cameraMovement: string): MotionFamily {
  const value = cameraMovement.trim().toLocaleLowerCase();
  if (/static locked/i.test(value)) return "static-hold";
  if (/push-in/i.test(value)) return "push-in";
  if (/lateral drift/i.test(value)) return "lateral-drift";
  if (/pull-back/i.test(value)) return "pull-back";
  if (/micro-pan/i.test(value)) return "micro-pan";
  return "static-hold";
}

export function classifyTransitionFamilyV35(transition: string): TransitionFamily {
  const value = transition.toLocaleLowerCase();
  if (/hard|cut/i.test(value)) return "hard-cut";
  if (/dissolve/i.test(value)) return "dissolve";
  if (/crossfade|opacity/i.test(value)) return "crossfade";
  if (/match-cut/i.test(value)) return "match-cut";
  if (/wipe/i.test(value)) return "wipe";
  return "other";
}

function isStaticHoldModality(modality: HistoryVisualModalityV35): boolean {
  return [
    "archival image",
    "historical artwork",
    "text-only transition",
    "narration-emphasis",
    "document",
    "quotation",
    "comparison card",
    "restrained atmospheric reconstruction",
  ].includes(modality);
}

function extractClaimFocus(midground: string): string {
  const match = midground.match(/claim focus\s+(.+)$/iu);
  return match?.[1]?.trim().toLocaleLowerCase() ?? midground.toLocaleLowerCase();
}

function meaningfulCompositionReplacement(
  prior: CompositionFamily,
  next: CompositionFamily
): boolean {
  if (prior === next) return false;
  const pairs = new Set([
    "wide-establish|tight-inset",
    "wide-establish|comparison-board",
    "wide-establish|document-desk",
    "medium-hold|tight-inset",
    "medium-hold|comparison-board",
    "tight-inset|comparison-board",
    "overhead-board|tight-inset",
  ]);
  return pairs.has(`${prior}|${next}`) || pairs.has(`${next}|${prior}`);
}

function factualLabelsKey(shot: HistoryShotV34): string {
  return [...shot.factualLabels].sort().join(",");
}

export function computeDiagramRenderSignatureV35(
  state: Pick<HistoryDiagramStateV34, "diagramType" | "exactQuestion" | "nodes" | "edges">
): string {
  const nodeLabelById = new Map(
    state.nodes.map((node) => [
      node.id,
      node.label.replace(/\s+/gu, " ").trim().toLocaleLowerCase(),
    ] as const)
  );
  const visibleNodes = [...nodeLabelById.values()].sort().join("|");
  const visibleEdges = [...state.edges]
    .map((edge) => {
      const from = nodeLabelById.get(edge.fromNodeId) ?? edge.fromNodeId;
      const to = nodeLabelById.get(edge.toNodeId) ?? edge.toNodeId;
      return `${from}->${to}:${edge.relationship}`;
    })
    .sort()
    .join("|");
  return [state.diagramType, state.exactQuestion, visibleNodes, visibleEdges].join("::");
}

export function evaluateShotEffectiveChangeV35(input: {
  readonly shot: HistoryShotV34;
  readonly priorShot: HistoryShotV34 | null;
  readonly modality: HistoryVisualModalityV35;
  readonly priorModality: HistoryVisualModalityV35 | null;
  readonly diagramState?: HistoryDiagramStateV34 | null;
  readonly priorDiagramState?: HistoryDiagramStateV34 | null;
}): {
  readonly changeKinds: readonly EffectiveChangeKind[];
  readonly evidence: readonly EffectiveChangeEvidence[];
  readonly resetsVisualClock: boolean;
  readonly motionOnly: boolean;
  readonly transitionOnly: boolean;
  readonly unstructuredReveal: boolean;
} {
  const { shot, priorShot } = input;
  const evidence: EffectiveChangeEvidence[] = [];
  const changeKinds: EffectiveChangeKind[] = [];
  const previousStateRef = priorShot?.modalityStateReference ?? null;
  const nextStateRef = shot.modalityStateReference;
  const priorDiagramRender =
    input.priorDiagramState && input.modality === "diagram"
      ? computeDiagramRenderSignatureV35(input.priorDiagramState)
      : null;
  const nextDiagramRender =
    input.diagramState && input.modality === "diagram"
      ? computeDiagramRenderSignatureV35(input.diagramState)
      : null;
  const diagramRenderChanged =
    input.modality === "diagram" &&
    Boolean(priorDiagramRender) &&
    Boolean(nextDiagramRender) &&
    priorDiagramRender !== nextDiagramRender;
  const diagramRenderUnchanged =
    input.modality === "diagram" &&
    input.priorModality === "diagram" &&
    Boolean(priorDiagramRender) &&
    priorDiagramRender === nextDiagramRender;
  const assetStateChanged =
    Boolean(priorShot) &&
    (input.modality === "diagram"
      ? diagramRenderChanged
      : previousStateRef !== nextStateRef);
  const modalityChanged =
    Boolean(input.priorModality) && input.priorModality !== input.modality;
  const claimFocusChanged =
    Boolean(priorShot) &&
    extractClaimFocus(priorShot.midground) !== extractClaimFocus(shot.midground);
  const factualLabelsChanged =
    Boolean(priorShot) && factualLabelsKey(priorShot) !== factualLabelsKey(shot);
  const subjectChanged = Boolean(priorShot) && priorShot.subject !== shot.subject;
  const compositionPrior = priorShot
    ? classifyCompositionFamilyV35(priorShot.framing)
    : null;
  const compositionNext = classifyCompositionFamilyV35(shot.framing);
  const compositionReplacement =
    Boolean(priorShot) &&
    !assetStateChanged &&
    !diagramRenderUnchanged &&
    meaningfulCompositionReplacement(compositionPrior!, compositionNext);

  let motionOnly = false;
  let transitionOnly = false;
  let unstructuredReveal = false;

  if (assetStateChanged) {
    changeKinds.push("asset-change");
    evidence.push({
      kind: "asset-change",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  }
  if (subjectChanged && assetStateChanged) {
    changeKinds.push("subject-visual-change");
    evidence.push({
      kind: "subject-visual-change",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  }
  if (input.modality === "map" && (assetStateChanged || modalityChanged)) {
    changeKinds.push("map-state-change");
    evidence.push({
      kind: "map-state-change",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  }
  if (input.modality === "diagram" && (diagramRenderChanged || modalityChanged)) {
    changeKinds.push("diagram-state-change");
    evidence.push({
      kind: "diagram-state-change",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  }
  if (
    (input.modality === "document" || input.modality === "quotation") &&
    (assetStateChanged || modalityChanged)
  ) {
    changeKinds.push("document-state-change");
    evidence.push({
      kind: "document-state-change",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  }
  if (
    ["timeline", "date-card", "narration-emphasis", "text-only transition"].includes(
      input.modality
    ) &&
    (assetStateChanged || modalityChanged)
  ) {
    changeKinds.push("text-state-change");
    evidence.push({
      kind: "text-state-change",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  }
  if (
    STRUCTURED_ANNOTATION_PATTERN.test(shot.action) &&
    !diagramRenderUnchanged &&
    (assetStateChanged || claimFocusChanged || factualLabelsChanged || modalityChanged)
  ) {
    changeKinds.push("annotation-state-change");
    evidence.push({
      kind: "annotation-state-change",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  } else if (GENERIC_REVEAL_PATTERN.test(shot.action)) {
    unstructuredReveal = true;
    changeKinds.push("animated-reveal");
    evidence.push({
      kind: "animated-reveal",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: false,
    });
  }
  if (compositionReplacement) {
    changeKinds.push("composition-replacement");
    evidence.push({
      kind: "composition-replacement",
      previousStateRef,
      nextStateRef,
      resetsVisualClock: true,
    });
  }

  const hasCameraMotion =
    shot.cameraMovement.trim().length > 0 &&
    !/portrait|reframe|aspect-ratio/i.test(shot.cameraMovement);
  if (hasCameraMotion) {
    changeKinds.push("camera-motion");
    if (
      !evidence.some((item) => item.resetsVisualClock) &&
      (isMicroMotionCamera(shot.cameraMovement) ||
        /push-in|lateral drift|micro-pan|pull-back/i.test(shot.cameraMovement))
    )
      motionOnly = true;
  }
  if (priorShot && shot.transition !== priorShot.transition) {
    changeKinds.push("transition");
    if (!evidence.some((item) => item.resetsVisualClock)) transitionOnly = true;
  }

  let resetsVisualClock = evidence.some((item) => item.resetsVisualClock);
  if (diagramRenderUnchanged && !modalityChanged) resetsVisualClock = false;
  return {
    changeKinds,
    evidence,
    resetsVisualClock,
    motionOnly,
    transitionOnly,
    unstructuredReveal,
  };
}

export function measureEffectiveVisualChangeV35(input: {
  readonly shots: readonly HistoryShotV34[];
  readonly beats: readonly HistoryBeatV35[];
  readonly diagramStates?: readonly HistoryDiagramStateV34[];
}): HistoryEffectiveChangeMetricsV35 {
  const beatModality = new Map(input.beats.map((beat) => [beat.id, beat.modality] as const));
  const diagramStateById = new Map(
    (input.diagramStates ?? []).map((state) => [state.id, state] as const)
  );
  const audit: HistoryEffectiveChangeAuditV35 = {
    assetChanges: 0,
    structuredStateChanges: 0,
    annotationChanges: 0,
    mapChanges: 0,
    diagramChanges: 0,
    documentChanges: 0,
    compositionChanges: 0,
    motionOnlyEvents: 0,
    transitionOnlyEvents: 0,
    unstructuredRevealEvents: 0,
    clockResetsBackedByState: 0,
    clockResetsMotionOrTransitionOnly: 0,
  };

  const visualChanges: HistoryShotVisualChangeV35[] = input.shots.map((shot, index) => {
    const prior = index > 0 ? input.shots[index - 1]! : null;
    const modality = beatModality.get(shot.beatId) ?? "archival image";
    const priorModality = prior ? beatModality.get(prior.beatId) ?? "archival image" : null;
    const evaluated = evaluateShotEffectiveChangeV35({
      shot,
      priorShot: prior,
      modality,
      priorModality,
      diagramState: shot.modalityStateReference
        ? diagramStateById.get(shot.modalityStateReference) ?? null
        : null,
      priorDiagramState: prior?.modalityStateReference
        ? diagramStateById.get(prior.modalityStateReference) ?? null
        : null,
    });

    if (evaluated.changeKinds.includes("asset-change")) audit.assetChanges += 1;
    if (evaluated.changeKinds.includes("map-state-change")) audit.mapChanges += 1;
    if (evaluated.changeKinds.includes("diagram-state-change")) audit.diagramChanges += 1;
    if (evaluated.changeKinds.includes("document-state-change")) audit.documentChanges += 1;
    if (evaluated.changeKinds.includes("annotation-state-change")) audit.annotationChanges += 1;
    if (evaluated.changeKinds.includes("composition-replacement")) audit.compositionChanges += 1;
    if (
      evaluated.changeKinds.includes("map-state-change") ||
      evaluated.changeKinds.includes("diagram-state-change") ||
      evaluated.changeKinds.includes("document-state-change") ||
      evaluated.changeKinds.includes("text-state-change")
    )
      audit.structuredStateChanges += 1;
    if (evaluated.motionOnly) audit.motionOnlyEvents += 1;
    if (evaluated.transitionOnly) audit.transitionOnlyEvents += 1;
    if (evaluated.unstructuredReveal) audit.unstructuredRevealEvents += 1;
    if (evaluated.resetsVisualClock) audit.clockResetsBackedByState += 1;
    if ((evaluated.motionOnly || evaluated.transitionOnly) && !evaluated.resetsVisualClock)
      audit.clockResetsMotionOrTransitionOnly += 1;

    return {
      shotId: shot.id,
      beatId: shot.beatId,
      durationMs: shot.durationMs,
      changeKinds: evaluated.changeKinds as HistoryShotVisualChangeV35["changeKinds"],
      resetsVisualClock: evaluated.resetsVisualClock,
    };
  });

  const totalRuntime = input.shots.reduce((sum, shot) => sum + shot.durationMs, 0) || 1;
  let longStaticMs = 0;
  let strongLongStaticMs = 0;
  let longestUnchanged = 0;
  let currentUnchanged = 0;
  let staticRunMs = 0;
  let changeCount = 0;

  for (const [index, change] of visualChanges.entries()) {
    const shot = input.shots[index]!;
    const modality = beatModality.get(change.beatId) ?? "archival image";
    const staticHold = isStaticHoldModality(modality);

    if (change.resetsVisualClock) {
      if (staticRunMs > LONG_STATIC_SOFT_WARNING_MS) longStaticMs += staticRunMs;
      if (staticRunMs > LONG_STATIC_STRONG_WARNING_MS) strongLongStaticMs += staticRunMs;
      staticRunMs = staticHold ? shot.durationMs : 0;
      longestUnchanged = Math.max(longestUnchanged, currentUnchanged);
      currentUnchanged = shot.durationMs;
      changeCount += 1;
    } else {
      currentUnchanged += shot.durationMs;
      if (staticHold) staticRunMs += shot.durationMs;
    }
  }
  if (staticRunMs > LONG_STATIC_SOFT_WARNING_MS) longStaticMs += staticRunMs;
  if (staticRunMs > LONG_STATIC_STRONG_WARNING_MS) strongLongStaticMs += staticRunMs;
  longestUnchanged = Math.max(longestUnchanged, currentUnchanged);

  return {
    longStaticRuntimeShare: longStaticMs / totalRuntime,
    strongLongStaticRuntimeShare: strongLongStaticMs / totalRuntime,
    longestUnchangedVisualIntervalMs: longestUnchanged,
    effectiveChangeCadenceMs: changeCount ? totalRuntime / changeCount : totalRuntime,
    shotVisualChanges: visualChanges,
    audit,
  };
}
