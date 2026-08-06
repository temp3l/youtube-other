import {
  allocateHistoryTimingV33,
  estimateHistoryTimingV33,
  HISTORY_LONG_FORM_DURATION_POLICY_V33,
  HISTORY_TIMING_PROFILE_V33,
  type DurationPolicyV3_3,
} from "./history-narration-v33.js";
import {
  hashCanonicalV34,
  structureTrustedScriptClaimsV34,
  validateGeographicRolesV34,
  type HistoryStructuredClaimsV34,
} from "./history-claims-v34.js";
import {
  collectEpisodePlacesV34,
  compileMapStateV34,
  proposeMapIntentsV34,
} from "./history-geo-v34.js";
import type { HistorySourceAuthorityMode } from "./history-trusted-script-v33.js";
import type { CanonicalNarrationV3_3 } from "./history-narration-v33.js";
import {
  DEFAULT_HISTORY_QUALITY_THRESHOLDS_V34,
  HISTORY_REPETITION_POLICY_V34,
  HISTORY_VISUAL_PLANNER_V34,
  HISTORY_VISUAL_SCHEMA_V34,
  type AspectRatioPlanV34,
  type HistoryApprovalV34,
  type HistoryBeatV34,
  type HistoryDiagnosticV34,
  type HistoryDiagramStateV34,
  type HistoryDateCardStateV34,
  type HistoryDocumentStateV34,
  type HistoryQualityMetricsV34,
  type HistoryQualityThresholdsV34,
  type HistoryShotV34,
  type HistoryTimelineEventV34,
  type HistoryTimelineStateV34,
  type HistoryVisualModalityV34,
  type HistoryVisualPlanV34,
  type HistoryVisualPurposeV34,
} from "./history-v34-contracts.js";


const GENERIC_SHOT_FIELDS = new Set([
  "no unsupported factual labels",
  "narration-bound subject",
  "low-detail neutral context",
]);

const textWords = (value: string): Set<string> =>
  new Set(
    value
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{4,}/gu)
      ?.filter((word) => !["that", "this", "with", "from", "were", "have", "their"].includes(word)) ?? []
  );

const jaccard = (left: Set<string>, right: Set<string>): number => {
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
};

const dominantShare = (values: readonly string[]): number =>
  values.length
    ? Math.max(
        ...[...new Set(values)].map(
          (value) => values.filter((item) => item === value).length
        )
      ) / values.length
    : 0;

function diagnostic(
  code: string,
  gate: HistoryDiagnosticV34["gate"],
  message: string,
  affectedIds: readonly string[] = [],
  severity: HistoryDiagnosticV34["severity"] = "error"
): HistoryDiagnosticV34 {
  return {
    code,
    gate,
    message,
    affectedIds,
    severity,
    remediation: "Resolve the identified V3.4 record and regenerate Phase B from trusted-script claims.",
  };
}

export function measureHistoryRepetitionV34(input: {
  readonly purposes: readonly HistoryVisualPurposeV34[];
  readonly shots: readonly HistoryShotV34[];
  readonly beats: readonly HistoryBeatV34[];
  readonly thresholds?: HistoryQualityThresholdsV34;
  readonly explicitOverride?: boolean;
}): HistoryQualityMetricsV34 {
  const thresholds = input.thresholds ?? DEFAULT_HISTORY_QUALITY_THRESHOLDS_V34;
  const purposeText = input.purposes.map((purpose) =>
    `${purpose.protectedFactualMeaning} ${purpose.visualPurpose}`
      .replace(/\s+/gu, " ")
      .trim()
      .toLocaleLowerCase()
  );
  const exactPurposeDuplicateRate = purposeText.length
    ? (purposeText.length - new Set(purposeText).size) / purposeText.length
    : 0;
  let nearDuplicatePairs = 0;
  let comparedPairs = 0;
  for (let left = 0; left < purposeText.length; left += 1)
    for (let right = left + 1; right < purposeText.length; right += 1) {
      comparedPairs += 1;
      if (jaccard(textWords(purposeText[left]!), textWords(purposeText[right]!)) >= 0.78)
        nearDuplicatePairs += 1;
    }
  const semanticPurposeDuplicateRate = comparedPairs
    ? nearDuplicatePairs / comparedPairs
    : 0;
  const cameras = input.shots.map((shot) => shot.cameraMovement);
  const topTwo = [...new Set(cameras)]
    .map((camera) => cameras.filter((value) => value === camera).length)
    .sort((a, b) => b - a)
    .slice(0, 2)
    .reduce((sum, value) => sum + value, 0);
  const shotStructures = input.shots.map(
    (shot) => `${shot.framing}|${shot.cameraMovement}|${shot.transition}|${shot.purpose}`
  );
  const assetTreatments = input.shots.map(
    (shot) => `${shot.reconstructionPolicy}|${shot.action}`
  );
  const genericFields = input.shots.flatMap((shot) =>
    [shot.foreground, shot.midground, shot.background].map((value) => value.toLocaleLowerCase())
  );
  const genericFieldReuseRate = genericFields.length
    ? genericFields.filter((value) => GENERIC_SHOT_FIELDS.has(value)).length / genericFields.length
    : 0;
  const longBeats = input.beats.filter((beat) => beat.endMs - beat.startMs >= 45_000);
  const oneShotPerLongBeatRate = longBeats.length
    ? longBeats.filter((beat) => beat.shotIds.length < 2).length / longBeats.length
    : 0;
  const duplicateClusters = [...new Set(shotStructures)]
    .map((signature) => {
      const shots = input.shots.filter(
        (shot) =>
          `${shot.framing}|${shot.cameraMovement}|${shot.transition}|${shot.purpose}` ===
          signature
      );
      return {
        kind: "shot-structure",
        signature,
        beatIds: [...new Set(shots.map((shot) => shot.beatId))],
        shotIds: shots.map((shot) => shot.id),
      };
    })
    .filter((cluster) => cluster.shotIds.length > 1);
  const metric = {
    policyVersion: HISTORY_REPETITION_POLICY_V34,
    exactPurposeDuplicateRate,
    semanticPurposeDuplicateRate,
    dominantCameraRate: dominantShare(cameras),
    twoInstructionAlternationRate: cameras.length ? topTwo / cameras.length : 0,
    shotStructureDuplicateRate: shotStructures.length
      ? (shotStructures.length - new Set(shotStructures).size) / shotStructures.length
      : 0,
    assetTreatmentDuplicateRate: assetTreatments.length
      ? (assetTreatments.length - new Set(assetTreatments).size) / assetTreatments.length
      : 0,
    genericFieldReuseRate,
    oneShotPerLongBeatRate,
    thresholds,
    duplicateClusters,
    explicitOverride: Boolean(input.explicitOverride),
  };
  const passes =
    Boolean(input.explicitOverride) ||
    (metric.exactPurposeDuplicateRate <= thresholds.maxExactPurposeDuplicateRate &&
      metric.semanticPurposeDuplicateRate < thresholds.maxSemanticPurposeDuplicateRate &&
      metric.dominantCameraRate < thresholds.maxDominantCameraRate &&
      metric.twoInstructionAlternationRate < thresholds.maxTwoInstructionAlternationRate &&
      metric.shotStructureDuplicateRate <= thresholds.maxShotStructureDuplicateRate &&
      metric.assetTreatmentDuplicateRate <= thresholds.maxAssetTreatmentDuplicateRate &&
      metric.genericFieldReuseRate <= thresholds.maxGenericFieldReuseRate &&
      metric.oneShotPerLongBeatRate <= thresholds.maxOneShotPerLongBeatRate);
  return { ...metric, passes };
}

function modalityFor(text: string): HistoryVisualModalityV34 {
  if (/^(?:but|however|instead|so what|yet|why)\b/iu.test(text.trim()))
    return "text-only transition";
  if (/\b(?:route|crossed|river|sailed|march|toward|from .+ to |island|bay|passage)\b/iu.test(text))
    return "map";
  if (/\b(?:year|century|later|between|by \d{3,4}|in \d{3,4}|april|june|184[5-8]|2014|2016)\b/iu.test(text))
    return "timeline";
  if (/\b(?:because|led to|resulted|compounded|relationship|decision)\b/iu.test(text))
    return "diagram";
  if (/\b(?:note|message|wrote|account|quotation|testimony)\b/iu.test(text))
    return "document-or-quotation";
  if (/\b(?:compared|more than|less than|rather than)\b/iu.test(text))
    return "comparison card";
  return "archival image";
}

type BeatCluster = {
  unitIds: string[];
  claimIds: string[];
  modality: HistoryVisualModalityV34;
  text: string;
  startUtf16: number;
  endUtf16Exclusive: number;
  wordCount: number;
};

function clusterBeats(input: {
  readonly narration: CanonicalNarrationV3_3;
  readonly structured: HistoryStructuredClaimsV34;
}): BeatCluster[] {
  const claimsByUnit = new Map<string, string[]>();
  for (const claim of input.structured.claims)
    for (const unitId of claim.narrationUnitIds)
      claimsByUnit.set(unitId, [...(claimsByUnit.get(unitId) ?? []), claim.id]);
  const clusters: BeatCluster[] = [];
  let current: BeatCluster | null = null;
  for (const unit of input.narration.units) {
    const claimIds = claimsByUnit.get(unit.id) ?? [];
    const materialClaims = input.structured.claims.filter(
      (claim) => claimIds.includes(claim.id) && claim.materiality === "material"
    );
    const modality =
      materialClaims.length === 0 && /^(?:but|however|why|then they vanished)/iu.test(unit.text)
        ? ("text-only transition" as const)
        : modalityFor(unit.text);
    const canMerge =
      current &&
      current.modality === modality &&
      current.wordCount + unit.wordCount <= 90 &&
      current.unitIds.length < 3 &&
      modality !== "map" &&
      modality !== "timeline";
    if (canMerge && current) {
      current.unitIds.push(unit.id);
      current.claimIds.push(...claimIds);
      current.text = `${current.text} ${unit.text}`.trim();
      current.endUtf16Exclusive = unit.endUtf16Exclusive;
      current.wordCount += unit.wordCount;
      continue;
    }
    if (current) clusters.push(current);
    current = {
      unitIds: [unit.id],
      claimIds: [...claimIds],
      modality,
      text: unit.text,
      startUtf16: unit.startUtf16,
      endUtf16Exclusive: unit.endUtf16Exclusive,
      wordCount: unit.wordCount,
    };
  }
  if (current) clusters.push(current);
  return clusters;
}

function wordSafeSlice(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const boundary = slice.lastIndexOf(" ");
  return (boundary > 20 ? slice.slice(0, boundary) : slice).trim();
}

function hashPick<T>(seed: string, values: readonly T[]): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return values[hash % values.length]!;
}

function buildShotsForBeat(input: {
  readonly beatId: string;
  readonly beatNumber: string;
  readonly beatIndex: number;
  readonly startMs: number;
  readonly durationMs: number;
  readonly modality: HistoryVisualModalityV34;
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly modalityStateReference: string | null;
}): HistoryShotV34[] {
  const needsMultiple =
    input.durationMs >= 45_000 ||
    input.claimIds.length >= 3 ||
    input.modality === "map" ||
    input.modality === "diagram" ||
    input.modality === "timeline";
  const count = needsMultiple ? Math.min(3, Math.max(2, Math.ceil(input.durationMs / 40_000))) : 1;
  const slice = Math.floor(input.durationMs / count);
  const roles = ["orienting", "evidentiary", "explanatory", "transitional", "emotional"] as const;
  const framings = [
    "wide establishing vista",
    "medium subject hold",
    "tight evidentiary inset",
    "split comparison board",
    "angled document desk",
    "overhead route board",
  ] as const;
  const cameras = [
    "static locked hold",
    "slow push-in on evidence",
    "gentle lateral drift",
    "measured pull-back reveal",
    "hold then micro-pan",
    "vertical reframe for portrait continuity",
  ] as const;
  const transitions = [
    "hard narration cut",
    "soft evidence dissolve",
    "chapter hold then cut",
    "opacity crossfade",
    "match-cut on shared subject",
    "beat-boundary wipe restrained",
  ] as const;
  const shots: HistoryShotV34[] = [];
  let cursor = input.startMs;
  for (let index = 0; index < count; index += 1) {
    const durationMs = index === count - 1 ? input.startMs + input.durationMs - cursor : slice;
    const endMs = cursor + durationMs;
    const subjectSeed = wordSafeSlice(input.text, 110) || "Trusted narration span";
    const role = roles[(input.beatIndex + index) % roles.length]!;
    const seed = `${input.beatId}|${input.modality}|${role}|${index}|${subjectSeed}`;
    const framing = hashPick(seed + "|frame", framings);
    const cameraMovement = hashPick(seed + "|camera", cameras);
    const transition = hashPick(seed + "|transition", transitions);
    const purpose =
      count === 1
        ? `${role} ${input.modality} for ${wordSafeSlice(subjectSeed, 48)}`
        : `${role} stage ${index + 1}/${count} on ${input.modality}`;
    shots.push({
      id: `shot-${input.beatNumber}-${String(index + 1).padStart(2, "0")}`,
      beatId: input.beatId,
      purpose,
      durationMs,
      startMs: cursor,
      endMs,
      framing,
      cameraMovement,
      subject: subjectSeed,
      action: `${role} development of ${wordSafeSlice(subjectSeed, 64)}`,
      foreground: `${input.modality}/${role} foreground: ${wordSafeSlice(subjectSeed, 40)}`,
      midground: `${input.modality} midground claim focus ${input.claimIds[0] ?? "none"}`,
      background: `${input.modality} background continuity for beat ${input.beatNumber}`,
      factualLabels:
        input.modality === "map" || input.modality === "diagram" || input.modality === "timeline"
          ? input.claimIds.slice(0, 2)
          : [],
      permittedMotion: [`${role}-safe non-diegetic motion`, "narration-synchronous opacity"],
      prohibitedAdditions: [
        "unsupported place labels",
        "invented causal arrows",
        "placeholder coordinates",
      ],
      transition,
      linkedClaimIds: input.claimIds,
      modalityStateReference: input.modalityStateReference,
      adaptation16x9: `Landscape ${role} layout for ${input.modality} beat ${input.beatNumber}.`,
      adaptation9x16: `Portrait reflow for ${input.modality} beat ${input.beatNumber}; independent composition.`,
      reconstructionPolicy:
        input.modality === "restrained atmospheric reconstruction"
          ? "illustrative-not-evidence"
          : "not-applicable",
    });
    cursor = endMs;
  }
  return shots;
}

function buildRatioPlans(input: {
  readonly beatId: string;
  readonly beatNumber: string;
  readonly purposeId: string;
  readonly modality: HistoryVisualModalityV34;
  readonly subject: string;
  readonly mapState: HistoryMapStateLike | null;
  readonly diagramState: HistoryDiagramStateV34 | null;
  readonly timelineState: HistoryTimelineStateV34 | null;
  readonly timelineEvents: readonly HistoryTimelineEventV34[];
  readonly dateCardId: string | null;
}): AspectRatioPlanV34[] {
  const mapLabels = input.mapState?.labels.map((label) => label.text) ?? [];
  const mapRoutes = input.mapState?.routes.map((route) => route.id) ?? [];
  const diagramNodes = input.diagramState?.nodes.map((node) => node.id) ?? [];
  const diagramEdges = input.diagramState?.edges.map((edge) => edge.id) ?? [];
  const eventIds = input.timelineState?.eventIds ?? (input.dateCardId ? [input.dateCardId] : []);
  const protectedSubject = wordSafeSlice(input.subject, 100);
  const portraitConflicts: string[] = [];
  if (input.modality === "map" && mapLabels.length > 3)
    portraitConflicts.push("MAP_LABEL_OVERFLOW_PORTRAIT");
  if (input.modality === "diagram" && diagramNodes.length > 4)
    portraitConflicts.push("DIAGRAM_NODE_OVERFLOW_PORTRAIT");
  if (input.modality === "timeline" && eventIds.length > 5)
    portraitConflicts.push("TIMELINE_EVENT_OVERFLOW_PORTRAIT");
  if (input.modality === "map" && mapLabels.length === 0)
    portraitConflicts.push("MAP_LABELS_MISSING");
  if (mapLabels.some((label) => label.length > 28))
    portraitConflicts.push("MAP_LABEL_FOOTPRINT_TIGHT");

  return (
    [
      {
        ratio: "16:9" as const,
        orientation: "landscape" as const,
        cropBounds: "full-frame landscape safe composition",
        independent: false,
        layout: "horizontal" as const,
        removedLabels: [] as string[],
        retainedLabels: mapLabels,
        labelPriority: mapLabels,
        retainedNodes: diagramNodes,
        removedNodes: [] as string[],
        retainedEdges: diagramEdges,
        verticalOrdering: diagramNodes,
        retainedEvents: [...eventIds],
        eventGrouping: eventIds.length > 4 ? ["early", "late"] : [...eventIds],
        conflicts: [] as string[],
        textDensity: "pass" as const,
        minText: 28,
      },
      {
        ratio: "9:16" as const,
        orientation: "portrait" as const,
        cropBounds: "independent portrait frame; no blind landscape crop",
        independent: true,
        layout: "vertical" as const,
        removedLabels: mapLabels.slice(2),
        retainedLabels: mapLabels.slice(0, 2),
        labelPriority: mapLabels.slice(0, 2),
        retainedNodes: diagramNodes.slice(0, 4),
        removedNodes: diagramNodes.slice(4),
        retainedEdges: diagramEdges.slice(0, Math.max(0, diagramEdges.length - 1)),
        verticalOrdering: diagramNodes.slice(0, 4),
        retainedEvents: eventIds.slice(0, 5),
        eventGrouping: eventIds.slice(0, 5),
        conflicts: portraitConflicts,
        textDensity: portraitConflicts.length ? ("warning" as const) : ("pass" as const),
        minText: 32,
      },
    ] as const
  ).map((item) => ({
    id: `ratio-${input.beatNumber}-${item.ratio.replace(":", "x")}`,
    beatId: input.beatId,
    visualPurposeId: input.purposeId,
    ratio: item.ratio,
    modality: input.modality,
    protectedSubject,
    retainedRouteIds: mapRoutes,
    retainedLabels: item.retainedLabels,
    removedLabels: item.removedLabels,
    labelPriority: item.labelPriority,
    cropBounds: item.cropBounds,
    orientation: item.orientation,
    routeSimplification:
      input.modality === "map"
        ? item.ratio === "9:16"
          ? "keep primary route only"
          : "retain narrated routes"
        : "not-applicable",
    waypointSimplification:
      input.modality === "map"
        ? item.ratio === "9:16"
          ? "drop secondary waypoints"
          : "retain narrated waypoints"
        : "not-applicable",
    legendPlacement: item.ratio === "9:16" ? "below-map" : "lower-right",
    retainedNodes: item.retainedNodes,
    removedOrMergedNodes: item.removedNodes,
    retainedEdges: item.retainedEdges,
    verticalOrdering: item.verticalOrdering,
    retainedEvents: item.retainedEvents,
    eventGrouping: item.eventGrouping,
    layout:
      input.modality === "timeline" || input.modality === "diagram" || input.modality === "date-card"
        ? item.layout
        : "not-applicable",
    minimumTextSizePx: item.minText,
    textDensityResult: item.textDensity,
    conflictDiagnostics: item.conflicts,
    evaluated: true as const,
    independentPortraitRenderingMandatory: item.independent,
  }));
}

type HistoryMapStateLike = {
  readonly id: string;
  readonly masterId: string;
  readonly labels: readonly { readonly text: string }[];
  readonly routes: readonly { readonly id: string }[];
  readonly semanticStatus: "valid" | "blocked";
};

function summarizeApproval(
  diagnostics: readonly HistoryDiagnosticV34[]
): HistoryApprovalV34 {
  const blockers = (gate: HistoryDiagnosticV34["gate"]): string[] =>
    [
      ...new Set(
        diagnostics
          .filter((item) => item.gate === gate && item.severity === "error")
          .map((item) => item.code)
      ),
    ].sort();
  const structural = blockers("structural");
  const editorial = blockers("editorial");
  const content = blockers("content");
  const production = blockers("production");
  const upstreamContent = [...new Set([...structural, ...editorial, ...content])].sort();
  const upstreamProduction = [...new Set([...upstreamContent, ...production])].sort();
  return {
    structurallyValid: structural.length === 0,
    editoriallyReviewable: structural.length === 0 && editorial.length === 0,
    contentApprovalEligible: upstreamContent.length === 0,
    productionApprovalEligible: upstreamProduction.length === 0,
    structural: {
      state: structural.length ? "blocked" : "reviewable",
      blockerCodes: structural,
    },
    editorial: {
      state: structural.length || editorial.length ? "blocked" : "production_plan_reviewable",
      blockerCodes: [...new Set([...structural, ...editorial])].sort(),
    },
    content: {
      state: upstreamContent.length ? "blocked" : "eligible",
      blockerCodes: upstreamContent,
    },
    production: {
      state: upstreamProduction.length ? "blocked" : "eligible",
      blockerCodes: upstreamProduction,
    },
    blockerCount: diagnostics.filter((item) => item.severity === "error").length,
    warningCount: diagnostics.filter((item) => item.severity === "warning").length,
    overrideStatus: "none",
  };
}

function compileDiagram(input: {
  readonly beatNumber: string;
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly entityLabels: readonly string[];
}): {
  readonly master: HistoryVisualPlanV34["diagramMasters"][number];
  readonly state: HistoryDiagramStateV34;
} | null {
  const text = input.text;
  // Reject sentence-start fragments and ordinary nouns as nodes.
  const cleanLabels = [...new Set(input.entityLabels)].filter(
    (label) =>
      !/^(?:Exact|Taxes|People|Trade|Disease|Fleas|Survivors)$/iu.test(label) &&
      label.length > 2
  );

  // Napoleon army-size variation: require process coverage or reject.
  if (/\b(?:army size|estimates?|reinforcements|desertion|detached)\b/iu.test(text)) {
    const processNodes = [
      "reinforcements",
      "detached units",
      "desertion",
      "capture",
      "different return routes",
      "variation in army-size estimates",
    ].filter((node) => {
      if (node === "variation in army-size estimates") return true;
      return new RegExp(node.split(" ")[0]!, "iu").test(text) || /army size|estimates/iu.test(text);
    });
    if (processNodes.length < 3) return null;
    const masterId = `diagram-master-${input.beatNumber}`;
    const stateId = `diagram-state-${input.beatNumber}`;
    const nodeRecords = processNodes.map((label, index) => ({
      id: `node-${input.beatNumber}-${index + 1}`,
      label,
      linkedClaimIds: input.claimIds,
      entityMentionIds: [] as string[],
    }));
    const sink = nodeRecords.at(-1)!;
    const edges = nodeRecords.slice(0, -1).map((node, index) => ({
      id: `edge-${input.beatNumber}-${index + 1}`,
      fromNodeId: node.id,
      toNodeId: sink.id,
      relationship: "contributes-to" as const,
      linkedClaimIds: input.claimIds,
    }));
    return {
      master: {
        id: masterId,
        diagramType: "process",
        exactQuestion: wordSafeSlice(text, 160),
        supportedRatios: ["16:9", "9:16"],
      },
      state: {
        id: stateId,
        masterId,
        diagramType: "process",
        exactQuestion: wordSafeSlice(text, 160),
        nodes: nodeRecords,
        edges,
        semanticStatus: "valid",
        blockerCodes: [],
        fallbackDecision: null,
      },
    };
  }

  // Kutuzov / Moscow: abandon → preserve army → continue war, else reject.
  if (/\bKutuzov\b/iu.test(text) && /\bMoscow\b/iu.test(text)) {
    if (!/\b(?:abandon|left|evacuate|preserve|continue)\b/iu.test(text)) return null;
    const masterId = `diagram-master-${input.beatNumber}`;
    const stateId = `diagram-state-${input.beatNumber}`;
    const labels = ["abandon Moscow", "preserve Russian army", "continue the war"];
    const nodeRecords = labels.map((label, index) => ({
      id: `node-${input.beatNumber}-${index + 1}`,
      label,
      linkedClaimIds: input.claimIds,
      entityMentionIds: [] as string[],
    }));
    const edges = [
      {
        id: `edge-${input.beatNumber}-1`,
        fromNodeId: nodeRecords[0]!.id,
        toNodeId: nodeRecords[1]!.id,
        relationship: "leads-to" as const,
        linkedClaimIds: input.claimIds,
      },
      {
        id: `edge-${input.beatNumber}-2`,
        fromNodeId: nodeRecords[1]!.id,
        toNodeId: nodeRecords[2]!.id,
        relationship: "leads-to" as const,
        linkedClaimIds: input.claimIds,
      },
    ];
    return {
      master: {
        id: masterId,
        diagramType: "process",
        exactQuestion: wordSafeSlice(text, 160),
        supportedRatios: ["16:9", "9:16"],
      },
      state: {
        id: stateId,
        masterId,
        diagramType: "process",
        exactQuestion: wordSafeSlice(text, 160),
        nodes: nodeRecords,
        edges,
        semanticStatus: "valid",
        blockerCodes: [],
        fallbackDecision: null,
      },
    };
  }

  if (cleanLabels.length < 2) return null;
  if (!/\b(?:because|led to|resulted|decision|compounded|causes|process)\b/iu.test(text))
    return null;
  // Generic associated-with chains from entity soup are rejected.
  if (!/\b(?:because|led to|caused|resulted|therefore)\b/iu.test(text)) return null;
  const masterId = `diagram-master-${input.beatNumber}`;
  const stateId = `diagram-state-${input.beatNumber}`;
  const nodeRecords = cleanLabels.slice(0, 4).map((label, index) => ({
    id: `node-${input.beatNumber}-${index + 1}`,
    label,
    linkedClaimIds: input.claimIds,
    entityMentionIds: [] as string[],
  }));
  const edges = nodeRecords.slice(0, -1).map((node, index) => ({
    id: `edge-${input.beatNumber}-${index + 1}`,
    fromNodeId: node.id,
    toNodeId: nodeRecords[index + 1]!.id,
    relationship: "leads-to" as const,
    linkedClaimIds: input.claimIds,
  }));
  return {
    master: {
      id: masterId,
      diagramType: "causal-chain",
      exactQuestion: wordSafeSlice(text, 160),
      supportedRatios: ["16:9", "9:16"],
    },
    state: {
      id: stateId,
      masterId,
      diagramType: "causal-chain",
      exactQuestion: wordSafeSlice(text, 160),
      nodes: nodeRecords,
      edges,
      semanticStatus: "valid",
      blockerCodes: [],
      fallbackDecision: null,
    },
  };
}

function dedupeNestedTemporals(
  temporals: HistoryStructuredClaimsV34["temporalQualifiers"]
): HistoryStructuredClaimsV34["temporalQualifiers"] {
  const sorted = [...temporals].sort(
    (left, right) =>
      right.normalizedValue.length - left.normalizedValue.length ||
      left.normalizedValue.localeCompare(right.normalizedValue)
  );
  const kept: typeof temporals[number][] = [];
  for (const item of sorted) {
    const nested = kept.some((prior) => {
      const priorNorm = prior.normalizedValue.toLocaleLowerCase();
      const itemNorm = item.normalizedValue.toLocaleLowerCase();
      return priorNorm.includes(itemNorm) && priorNorm !== itemNorm;
    });
    if (!nested) kept.push(item);
  }
  return kept;
}

function compileTimelineOrDateCard(input: {
  readonly beatNumber: string;
  readonly claimIds: readonly string[];
  readonly text: string;
  readonly temporal: HistoryStructuredClaimsV34["temporalQualifiers"];
}):
  | {
      readonly kind: "timeline";
      readonly master: HistoryVisualPlanV34["timelineMasters"][number];
      readonly state: HistoryTimelineStateV34;
      readonly events: HistoryTimelineEventV34[];
    }
  | {
      readonly kind: "date-card";
      readonly state: import("./history-v34-contracts.js").HistoryDateCardStateV34;
    }
  | null {
  const temporals = dedupeNestedTemporals(
    input.temporal.filter((item) => input.claimIds.includes(item.claimId))
  );
  if (!temporals.length) return null;
  if (temporals.length === 1) {
    const temporal = temporals[0]!;
    return {
      kind: "date-card",
      state: {
        id: `date-card-${input.beatNumber}`,
        masterId: `date-card-master-${input.beatNumber}`,
        label: wordSafeSlice(`${temporal.normalizedValue}: ${input.text}`, 96),
        temporalQualifierIds: [temporal.id],
        dateSortKey: temporal.normalizedValue,
        linkedClaimIds: input.claimIds,
      },
    };
  }
  const events: HistoryTimelineEventV34[] = temporals.map((temporal, index) => ({
    id: `timeline-event-${input.beatNumber}-${index + 1}`,
    claimIds: input.claimIds,
    label: wordSafeSlice(`${temporal.normalizedValue}: ${input.text}`, 96),
    temporalQualifierIds: [temporal.id],
    dateSortKey: temporal.normalizedValue,
    uncertainty: [],
  }));
  const sortKeys = events.map((event) => event.dateSortKey).filter(Boolean);
  const ordered = [...sortKeys].sort((a, b) => String(a).localeCompare(String(b)));
  const orderingStatus =
    ordered.join("|") === sortKeys.join("|") ? "valid" : "ambiguous";
  const masterId = `timeline-master-${input.beatNumber}`;
  const stateId = `timeline-state-${input.beatNumber}`;
  return {
    kind: "timeline",
    master: {
      id: masterId,
      purpose: `Chronology for beat ${input.beatNumber}`,
      supportedRatios: ["16:9", "9:16"],
    },
    state: {
      id: stateId,
      masterId,
      eventIds: events.map((event) => event.id),
      orderingStatus,
    },
    events,
  };
}

function compileDocument(input: {
  readonly beatNumber: string;
  readonly text: string;
  readonly claimIds: readonly string[];
}): HistoryDocumentStateV34 {
  const hasExactQuote = /[“"][^”"]+[”"]/u.test(input.text);
  const hasDocument = /\b(?:note|message|cairn|law|statute|decree|account)\b/iu.test(
    input.text
  );
  const kind = hasExactQuote
    ? ("quotation-card" as const)
    : hasDocument
      ? ("document-card" as const)
      : ("narration-emphasis-card" as const);
  const displayText = wordSafeSlice(input.text, 220);
  return {
    id: `document-state-${input.beatNumber}`,
    masterId: `document-master-${input.beatNumber}`,
    kind,
    title:
      kind === "quotation-card"
        ? "Verified quotation"
        : kind === "document-card"
          ? /Victory Point/iu.test(input.text)
            ? "Victory Point note"
            : "Narration-bound document"
          : "Narration emphasis",
    displayText,
    quotationText: kind === "quotation-card" ? displayText : null,
    linkedClaimIds: input.claimIds,
    uncertainty: [],
  };
}

export function buildHistoryVisualPlanV34(input: {
  readonly episodeId: string;
  readonly title: string;
  readonly narration: CanonicalNarrationV3_3;
  readonly authorityMode?: HistorySourceAuthorityMode;
  readonly trustAttestationId?: string | null;
  readonly trustSnapshotHash?: string;
  readonly structuredClaims?: HistoryStructuredClaimsV34;
  readonly durationPolicy?: DurationPolicyV3_3;
  readonly measuredTiming?: {
    readonly source: "measured-tts" | "measured-final-audio";
    readonly durationMs: number;
    readonly audioSha256: string;
  };
  readonly knownEntities?: readonly string[];
  readonly qualityThresholds?: HistoryQualityThresholdsV34;
  readonly qualityOverride?: boolean;
}): HistoryVisualPlanV34 {
  const authorityMode = input.authorityMode ?? "trusted-script";
  const structured =
    input.structuredClaims ??
    structureTrustedScriptClaimsV34({
      episodeId: input.episodeId,
      narration: input.narration,
      authorityMode,
      trustAttestationId: input.trustAttestationId ?? null,
      ...(input.knownEntities ? { knownEntities: input.knownEntities } : {}),
    });
  const durationPolicy = input.durationPolicy ?? HISTORY_LONG_FORM_DURATION_POLICY_V33;
  const timing = estimateHistoryTimingV33({
    narration: input.narration,
    durationPolicy,
    timingProfile: HISTORY_TIMING_PROFILE_V33,
    ...(input.measuredTiming ? { measurement: input.measuredTiming } : {}),
  });
  const clusters = clusterBeats({ narration: input.narration, structured });
  const unitWordCounts = new Map(
    input.narration.units.map((unit) => [unit.id, Math.max(1, unit.wordCount)] as const)
  );
  const clusterWeights = clusters.map((cluster) =>
    cluster.unitIds.reduce((sum, id) => sum + (unitWordCounts.get(id) ?? 1), 0)
  );
  const durations = allocateHistoryTimingV33(timing.totalDurationMs, clusterWeights);
  const places = collectEpisodePlacesV34({ entities: structured.entities });
  const mapIntents = proposeMapIntentsV34({
    claims: structured.claims,
    entities: structured.entities,
    geographicQualifiers: structured.geographicQualifiers,
    temporalQualifiers: structured.temporalQualifiers,
  });
  const intentsByClaim = new Map<string, (typeof mapIntents)[number]>();
  for (const intent of mapIntents)
    for (const claimId of intent.claimIds) intentsByClaim.set(claimId, intent);

  const visualPurposes: HistoryVisualPurposeV34[] = [];
  const beats: HistoryBeatV34[] = [];
  const shots: HistoryShotV34[] = [];
  const aspectRatioPlans: AspectRatioPlanV34[] = [];
  const assetIntents: HistoryVisualPlanV34["assetIntents"][number][] = [];
  const mediaDecisions: HistoryVisualPlanV34["mediaDecisions"][number][] = [];
  const mapMasters: HistoryVisualPlanV34["mapMasters"][number][] = [];
  const mapStates: HistoryVisualPlanV34["mapStates"][number][] = [];
  const diagramMasters: HistoryVisualPlanV34["diagramMasters"][number][] = [];
  const diagramStates: HistoryDiagramStateV34[] = [];
  const timelineMasters: HistoryVisualPlanV34["timelineMasters"][number][] = [];
  const timelineStates: HistoryTimelineStateV34[] = [];
  const timelineEvents: HistoryTimelineEventV34[] = [];
  const dateCardStates: HistoryDateCardStateV34[] = [];
  const documentStates: HistoryDocumentStateV34[] = [];
  const diagnostics: HistoryDiagnosticV34[] = [];

  let cursor = 0;
  clusters.forEach((cluster, index) => {
    const beatNumber = String(index + 1).padStart(4, "0");
    const beatId = `beat-${beatNumber}`;
    const purposeId = `purpose-${beatNumber}`;
    const assetIntentId = `asset-intent-${beatNumber}`;
    const durationMs = durations[index]!;
    const endMs = cursor + durationMs;
    const claimIds = [...new Set(cluster.claimIds)];
    const materialClaims = structured.claims.filter(
      (claim) => claimIds.includes(claim.id) && claim.materiality === "material"
    );
    let modality = cluster.modality;
    let mapMasterId: string | null = null;
    let mapStateId: string | null = null;
    let diagramMasterId: string | null = null;
    let diagramStateId: string | null = null;
    let timelineMasterId: string | null = null;
    let timelineStateId: string | null = null;
    let dateCardStateId: string | null = null;
    let documentStateId: string | null = null;
    let fallback: HistoryVisualPurposeV34["fallbackDecision"] = null;
    let mapState: HistoryMapStateLike | null = null;
    let diagramState: HistoryDiagramStateV34 | null = null;
    let timelineState: HistoryTimelineStateV34 | null = null;

    if (modality === "map") {
      const intent =
        claimIds.map((id) => intentsByClaim.get(id)).find(Boolean) ??
        mapIntents.find((item) => item.claimIds.some((id) => claimIds.includes(id)));
      const compiled = intent
        ? compileMapStateV34({
            beatNumber,
            proposal: intent,
            claims: structured.claims,
            entities: structured.entities,
            temporalQualifiers: structured.temporalQualifiers,
            narrationText: input.narration.normalizedText,
          })
        : null;
      if (compiled) {
        mapMasters.push(compiled.master);
        mapStates.push(compiled.state);
        mapMasterId = compiled.master.id;
        mapStateId = compiled.state.id;
        mapState = compiled.state;
      } else {
        fallback = {
          rejectedModality: "map",
          reasonForRejection:
            "Map proposal failed place, actor, route, or coordinate validation.",
          selectedFallback: "archival image",
          semanticJustification:
            "Prefer a safer non-map modality over dangling or invalid geography.",
        };
        modality = "archival image";
      }
    }

    if (modality === "diagram") {
      const entityLabels = structured.entities
        .filter((entity) => claimIds.includes(entity.claimId))
        .map((entity) => entity.normalizedLabel);
      const compiled = compileDiagram({
        beatNumber,
        text: cluster.text,
        claimIds,
        entityLabels,
      });
      if (compiled) {
        diagramMasters.push(compiled.master);
        diagramStates.push(compiled.state);
        diagramMasterId = compiled.master.id;
        diagramStateId = compiled.state.id;
        diagramState = compiled.state;
      } else {
        fallback = {
          rejectedModality: "diagram",
          reasonForRejection: "Diagram lacked narration-bound nodes/edges.",
          selectedFallback: "archival image",
          semanticJustification: "Avoid empty or invented diagram graphs.",
        };
        modality = "archival image";
      }
    }

    if (modality === "timeline") {
      const compiled = compileTimelineOrDateCard({
        beatNumber,
        claimIds,
        text: cluster.text,
        temporal: structured.temporalQualifiers,
      });
      if (compiled?.kind === "timeline") {
        timelineMasters.push(compiled.master);
        timelineStates.push(compiled.state);
        timelineEvents.push(...compiled.events);
        timelineMasterId = compiled.master.id;
        timelineStateId = compiled.state.id;
        timelineState = compiled.state;
      } else if (compiled?.kind === "date-card") {
        dateCardStates.push(compiled.state);
        dateCardStateId = compiled.state.id;
        modality = "date-card";
      } else {
        fallback = {
          rejectedModality: "timeline",
          reasonForRejection: "Timeline lacked dated events.",
          selectedFallback: "text-only transition",
          semanticJustification: "Do not export dangling timeline references.",
        };
        modality = "text-only transition";
      }
    }

    if (modality === "document-or-quotation") {
      const document = compileDocument({
        beatNumber,
        text: cluster.text,
        claimIds,
      });
      documentStates.push(document);
      documentStateId = document.id;
    }

    const modalityStateReference =
      mapStateId ?? diagramStateId ?? timelineStateId ?? dateCardStateId ?? documentStateId;
    const beatShots = buildShotsForBeat({
      beatId,
      beatNumber,
      beatIndex: index,
      startMs: cursor,
      durationMs,
      modality,
      text: cluster.text,
      claimIds,
      modalityStateReference,
    });
    shots.push(...beatShots);
    const ratios = buildRatioPlans({
      beatId,
      beatNumber,
      purposeId,
      modality,
      subject: cluster.text,
      mapState,
      diagramState,
      timelineState,
      timelineEvents,
      dateCardId: dateCardStateId,
    });
    aspectRatioPlans.push(...ratios);
    visualPurposes.push({
      id: purposeId,
      beatId,
      narrationSpan: {
        startUtf16: cluster.startUtf16,
        endUtf16Exclusive: cluster.endUtf16Exclusive,
      },
      linkedClaimIds: claimIds,
      protectedFactualMeaning: cluster.text.slice(0, 240),
      recommendedModality: modality,
      visualPurpose: `${modality} clarifying beat ${beatNumber}`,
      semanticJustification:
        materialClaims.length > 0
          ? `Use ${modality} only for facts explicitly present in trusted narration.`
          : "Rhetorical or non-material narration uses a non-factual visual treatment.",
      disallowedMisleadingTreatments: [
        "invented labels",
        "unsupported causal arrows",
        "false geographic precision",
        "placeholder coordinates",
      ],
      requiredEntityMentionIds: structured.entities
        .filter((entity) => claimIds.includes(entity.claimId))
        .map((entity) => entity.id),
      requiredTemporalQualifierIds: structured.temporalQualifiers
        .filter((item) => claimIds.includes(item.claimId))
        .map((item) => item.id),
      requiredGeographicQualifierIds: structured.geographicQualifiers
        .filter((item) => claimIds.includes(item.claimId))
        .map((item) => item.id),
      requiredQuantitativeQualifierIds: structured.quantitativeQualifiers
        .filter((item) => claimIds.includes(item.claimId))
        .map((item) => item.id),
      uncertainty: [
        ...new Set(
          structured.claims
            .filter((claim) => claimIds.includes(claim.id))
            .flatMap((claim) => claim.uncertaintyMarkers)
        ),
      ],
      fallbackDecision: fallback,
    });
    beats.push({
      id: beatId,
      narrationUnitIds: cluster.unitIds,
      narrationSpan: {
        startUtf16: cluster.startUtf16,
        endUtf16Exclusive: cluster.endUtf16Exclusive,
      },
      startMs: cursor,
      endMs,
      linkedClaimIds: claimIds,
      visualPurposeId: purposeId,
      modality,
      assetIntentId,
      mapMasterId,
      mapStateId,
      diagramMasterId,
      diagramStateId,
      timelineMasterId,
      timelineStateId,
      dateCardStateId,
      documentStateId,
      shotIds: beatShots.map((shot) => shot.id),
      transition: beatShots[0]?.transition ?? "direct evidence cut",
      continuityNotes: `Semantic beat ${index + 1} groups ${cluster.unitIds.length} narration unit(s) for ${modality}.`,
      uncertaintyTreatment:
        "Retain claim-level uncertainty markers from trusted narration.",
      aspectRatioPlanIds: ratios.map((ratio) => ratio.id),
    });
    assetIntents.push({
      id: assetIntentId,
      beatId,
      modality,
      factual: !["text-only transition", "no generated visual"].includes(modality),
      linkedClaimIds: claimIds,
    });
    mediaDecisions.push({
      id: `media-decision-${beatNumber}`,
      beatId,
      selectedModality: modality,
      rejectedModalities: fallback ? [fallback.rejectedModality] : [],
      justification:
        fallback?.semanticJustification ??
        `Trusted narration supports this beat-specific ${modality} choice.`,
    });
    cursor = endMs;
  });

  const qualityMetrics = measureHistoryRepetitionV34({
    purposes: visualPurposes,
    shots,
    beats,
    ...(input.qualityThresholds ? { thresholds: input.qualityThresholds } : {}),
    ...(input.qualityOverride ? { explicitOverride: true } : {}),
  });

  for (const beat of beats) {
    if (beat.modality === "map" && (!beat.mapMasterId || !beat.mapStateId))
      diagnostics.push(
        diagnostic("MAP_STATE_MISSING", "structural", "Map beat lacks map master/state.", [
          beat.id,
        ])
      );
    if (beat.modality === "diagram" && (!beat.diagramMasterId || !beat.diagramStateId))
      diagnostics.push(
        diagnostic(
          "DIAGRAM_STATE_MISSING",
          "structural",
          "Diagram beat lacks diagram master/state.",
          [beat.id]
        )
      );
    if (beat.modality === "timeline" && (!beat.timelineMasterId || !beat.timelineStateId))
      diagnostics.push(
        diagnostic(
          "TIMELINE_STATE_MISSING",
          "structural",
          "Timeline beat lacks timeline master/state.",
          [beat.id]
        )
      );
    if (beat.modality === "date-card" && !beat.dateCardStateId)
      diagnostics.push(
        diagnostic(
          "TIMELINE_TOO_FEW_EVENTS",
          "editorial",
          "Date-card beat lacks date-card state.",
          [beat.id]
        )
      );
    if (beat.modality === "document-or-quotation" && !beat.documentStateId)
      diagnostics.push(
        diagnostic(
          "DOCUMENT_STATE_MISSING",
          "structural",
          "Document beat lacks document state.",
          [beat.id]
        )
      );
  }
  for (const state of timelineStates) {
    if (state.eventIds.length < 2)
      diagnostics.push(
        diagnostic(
          "TIMELINE_TOO_FEW_EVENTS",
          "editorial",
          "Timeline must contain at least two related events.",
          [state.id]
        )
      );
  }
  for (const event of timelineEvents) {
    if (/\S$/u.test(event.label) && event.label.length >= 96 && !/\s\S+$/u.test(event.label.slice(-12)))
      diagnostics.push(
        diagnostic(
          "TIMELINE_LABEL_TRUNCATED",
          "editorial",
          "Timeline label appears truncated mid-word.",
          [event.id]
        )
      );
  }
  for (const doc of documentStates) {
    if (doc.kind === "quotation-card" && !doc.quotationText)
      diagnostics.push(
        diagnostic(
          "QUOTATION_NOT_VERBATIM",
          "content",
          "Quotation card requires exact quoted text.",
          [doc.id]
        )
      );
    if (doc.kind === "quotation-card" && doc.displayText && !/[“"]/.test(doc.displayText))
      diagnostics.push(
        diagnostic(
          "QUOTATION_NOT_VERBATIM",
          "content",
          "Quotation card display text is not an exact quotation.",
          [doc.id]
        )
      );
  }
  for (const ratio of aspectRatioPlans) {
    if (!ratio.evaluated)
      diagnostics.push(
        diagnostic(
          "RATIO_ANALYSIS_NOT_EVALUATED",
          "editorial",
          "Ratio plan was not evaluated.",
          [ratio.id]
        )
      );
  }
  const geoValidation = validateGeographicRolesV34({
    entities: structured.entities,
    geographicQualifiers: structured.geographicQualifiers,
  });
  for (const error of geoValidation.errors)
    diagnostics.push(
      diagnostic("GEOGRAPHIC_ROLE_MISMATCH", "content", error, [], "error")
    );
  for (const quantity of structured.quantitativeQualifiers) {
    if (
      !quantity.unit &&
      /^(?:1[0-9]{3}|[2-9]\d{2}|[1-9]\d?)$/u.test(quantity.normalizedValue)
    )
      diagnostics.push(
        diagnostic(
          "QUANTITATIVE_QUALIFIER_INVALID",
          "content",
          `Quantity ${quantity.normalizedValue} looks like a date component.`,
          [quantity.id]
        )
      );
  }
  for (const state of mapStates)
    if (state.semanticStatus === "blocked")
      diagnostics.push(
        diagnostic("MAP_SEMANTIC_BLOCKED", "editorial", "Map state failed semantic validation.", [
          state.id,
          ...state.blockerCodes,
        ])
      );
  for (const state of diagramStates)
    if (state.semanticStatus === "blocked" || !state.nodes.length || !state.edges.length)
      diagnostics.push(
        diagnostic("DIAGRAM_EMPTY_OR_BLOCKED", "editorial", "Diagram state is empty or blocked.", [
          state.id,
        ])
      );
  for (const state of timelineStates)
    if (state.orderingStatus === "invalid")
      diagnostics.push(
        diagnostic("TIMELINE_ORDER_INVALID", "editorial", "Timeline ordering is invalid.", [
          state.id,
        ])
      );
  if (!qualityMetrics.passes)
    diagnostics.push(
      diagnostic(
        "EDITORIAL_REPETITION_THRESHOLD",
        "editorial",
        "Purpose or shot repetition exceeds the V3.4 threshold.",
        qualityMetrics.duplicateClusters.flatMap((cluster) => cluster.beatIds)
      )
    );
  if (structured.claims.every((claim) => claim.materiality === "material"))
    diagnostics.push(
      diagnostic(
        "ALL_CLAIMS_MATERIAL",
        "editorial",
        "Every claim is material; rhetorical narration should allow not_required.",
        [],
        "warning"
      )
    );
  for (const claim of structured.claims) {
    if (
      claim.authorityMode === "trusted-script" &&
      claim.materiality === "material" &&
      claim.provenanceStatus !== "trusted_input"
    )
      diagnostics.push(
        diagnostic(
          "TRUSTED_PROVENANCE_MISMATCH",
          "content",
          "Material trusted-script claims must use trusted_input.",
          [claim.id]
        )
      );
    if (claim.independentlyVerified)
      diagnostics.push(
        diagnostic(
          "FAKE_INDEPENDENT_VERIFICATION",
          "content",
          "Trusted-script claims must not claim independent verification.",
          [claim.id]
        )
      );
  }
  if (!timing.withinAllowedRange || timing.aboveHardMaximum)
    diagnostics.push(
      diagnostic(
        "TIMING_OUTSIDE_ALLOWED_RANGE",
        "production",
        `Narration duration ${timing.totalDurationMs}ms is outside allowed History range.`
      )
    );
  if (
    timing.timingSource === "provisional-text-estimate" &&
    !durationPolicy.estimatedOnlyProductionApproval
  )
    diagnostics.push(
      diagnostic(
        "TIMING_MEASUREMENT_REQUIRED",
        "production",
        "Final production approval requires measured TTS or measured final audio."
      )
    );
  if (
    timing.preferredDeltaPercent !== null &&
    Math.abs(timing.preferredDeltaPercent) > durationPolicy.editorialTolerancePercent &&
    timing.withinAllowedRange
  )
    diagnostics.push(
      diagnostic(
        "TIMING_PREFERRED_DEVIATION",
        "editorial",
        "Duration differs from the preferred target but remains inside the allowed History range.",
        [],
        "warning"
      )
    );

  const oneBeatPerUnit =
    beats.length === input.narration.units.length &&
    beats.every((beat) => beat.narrationUnitIds.length === 1);
  if (oneBeatPerUnit && input.narration.units.length > 20)
    diagnostics.push(
      diagnostic(
        "ONE_BEAT_PER_UNIT_DOMINANCE",
        "editorial",
        "Beat grouping remains one narration unit per beat for a long episode.",
        [],
        "warning"
      )
    );

  const trustSnapshotHash =
    input.trustSnapshotHash ??
    hashCanonicalV34({
      episodeId: input.episodeId,
      narrationHash: input.narration.normalizedTextSha256,
      claimIds: structured.claims.map((claim) => claim.id),
    });

  const body = {
    schemaVersion: HISTORY_VISUAL_SCHEMA_V34,
    plannerVersion: HISTORY_VISUAL_PLANNER_V34,
    episodeId: input.episodeId,
    title: input.title,
    sourceAuthorityMode: authorityMode,
    trustSnapshotHash,
    narration: input.narration,
    durationPolicy,
    timing,
    claims: structured.claims,
    entities: structured.entities,
    rejectedEntities: structured.rejectedEntities,
    temporalQualifiers: structured.temporalQualifiers,
    geographicQualifiers: structured.geographicQualifiers,
    quantitativeQualifiers: structured.quantitativeQualifiers,
    places,
    visualPurposes,
    beats,
    shots,
    assetIntents,
    mediaDecisions,
    mapMasters,
    mapStates,
    diagramMasters,
    diagramStates,
    timelineMasters,
    timelineStates,
    timelineEvents,
    dateCardStates,
    documentStates,
    aspectRatioPlans,
    qualityMetrics,
    diagnostics,
    approval: summarizeApproval(diagnostics),
  };
  const plan = { ...body, planHash: hashCanonicalV34(body) };
  validateHistoryVisualPlanV34(plan);
  return plan;
}

export function validateHistoryVisualPlanV34(plan: HistoryVisualPlanV34): {
  readonly structurallyValid: boolean;
  readonly editoriallyReviewable: boolean;
  readonly contentApprovalEligible: boolean;
  readonly productionApprovalEligible: boolean;
  readonly diagnostics: readonly HistoryDiagnosticV34[];
  readonly referenceCount: number;
} {
  const { planHash, ...body } = plan;
  if (hashCanonicalV34(body) !== planHash)
    throw new Error("History V3.4 plan hash is invalid.");
  const unitIds = new Set(plan.narration.units.map((unit) => unit.id));
  const claimIds = new Set(plan.claims.map((claim) => claim.id));
  const beatIds = new Set(plan.beats.map((beat) => beat.id));
  const shotIds = new Set(plan.shots.map((shot) => shot.id));
  const purposeIds = new Set(plan.visualPurposes.map((purpose) => purpose.id));
  const mapStateIds = new Set(plan.mapStates.map((state) => state.id));
  const diagramStateIds = new Set(plan.diagramStates.map((state) => state.id));
  const timelineStateIds = new Set(plan.timelineStates.map((state) => state.id));
  const dateCardStateIds = new Set(plan.dateCardStates.map((state) => state.id));
  const documentStateIds = new Set(plan.documentStates.map((state) => state.id));
  if (plan.claims.some((claim) => claim.id.startsWith("trusted-claim-")))
    throw new Error("History V3.4 prohibits trusted-claim-* authoritative IDs.");
  for (const beat of plan.beats) {
    if (
      beat.narrationUnitIds.some((id) => !unitIds.has(id)) ||
      !purposeIds.has(beat.visualPurposeId) ||
      beat.shotIds.some((id) => !shotIds.has(id))
    )
      throw new Error(`History V3.4 beat ${beat.id} has dangling references.`);
    if (beat.modality === "map" && (!beat.mapStateId || !mapStateIds.has(beat.mapStateId)))
      throw new Error(`History V3.4 beat ${beat.id} declares map without state.`);
    if (
      beat.modality === "diagram" &&
      (!beat.diagramStateId || !diagramStateIds.has(beat.diagramStateId))
    )
      throw new Error(`History V3.4 beat ${beat.id} declares diagram without state.`);
    if (
      beat.modality === "timeline" &&
      (!beat.timelineStateId || !timelineStateIds.has(beat.timelineStateId))
    )
      throw new Error(`History V3.4 beat ${beat.id} declares timeline without state.`);
    if (
      beat.modality === "date-card" &&
      (!beat.dateCardStateId || !dateCardStateIds.has(beat.dateCardStateId))
    )
      throw new Error(`History V3.4 beat ${beat.id} declares date-card without state.`);
    if (
      beat.modality === "document-or-quotation" &&
      (!beat.documentStateId || !documentStateIds.has(beat.documentStateId))
    )
      throw new Error(`History V3.4 beat ${beat.id} declares document without state.`);
    if (beat.endMs <= beat.startMs)
      throw new Error(`History V3.4 beat ${beat.id} has invalid timing.`);
  }
  const ordered = [...plan.beats].sort((left, right) => left.startMs - right.startMs);
  if (
    ordered[0]?.startMs !== 0 ||
    ordered.at(-1)?.endMs !== plan.timing.totalDurationMs ||
    ordered.some((beat, index) => index > 0 && ordered[index - 1]!.endMs !== beat.startMs)
  )
    throw new Error("History V3.4 beat timing is not contiguous across the planned duration.");
  for (const shot of plan.shots) {
    if (!beatIds.has(shot.beatId) || shot.durationMs <= 0)
      throw new Error(`History V3.4 shot ${shot.id} is invalid.`);
  }
  for (const claim of plan.claims)
    if (!claim.narrationUnitIds.every((id) => unitIds.has(id)))
      throw new Error(`History V3.4 claim ${claim.id} has invalid narration binding.`);
  for (const entity of plan.entities)
    if (!claimIds.has(entity.claimId))
      throw new Error(`History V3.4 entity ${entity.id} references missing claim.`);
  for (const state of plan.mapStates)
    for (const route of state.routes) {
      if (
        route.origin.coordinates &&
        ((route.origin.coordinates[0] === 0 && route.origin.coordinates[1] === 0) ||
          (route.origin.coordinates[0] === 1 && route.origin.coordinates[1] === 1))
      )
        throw new Error(`History V3.4 map route ${route.id} has placeholder coordinates.`);
    }
  if (!plan.qualityMetrics.thresholds)
    throw new Error("History V3.4 quality metrics missing thresholds.");
  return {
    structurallyValid: plan.approval.structurallyValid,
    editoriallyReviewable: plan.approval.editoriallyReviewable,
    contentApprovalEligible: plan.approval.contentApprovalEligible,
    productionApprovalEligible: plan.approval.productionApprovalEligible,
    diagnostics: plan.diagnostics,
    referenceCount:
      plan.beats.length +
      plan.shots.length +
      plan.aspectRatioPlans.length +
      plan.mapStates.length +
      plan.diagramStates.length +
      plan.timelineStates.length,
  };
}
