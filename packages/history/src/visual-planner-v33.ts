import { createHash } from "node:crypto";
import {
  allocateHistoryTimingV33,
  estimateHistoryTimingV33,
  HISTORY_LONG_FORM_DURATION_POLICY_V33,
  HISTORY_TIMING_PROFILE_V33,
  type CanonicalNarrationV3_3,
  type DurationPolicyV3_3,
  type TimingResultV3_3,
} from "./history-narration-v33.js";
import {
  assertResearchSnapshotV33,
  hashCanonicalV33,
  type ClaimProvenanceStatusV3_3,
  type HistoryResearchSnapshotV3_3,
} from "./history-research-v33.js";

export const HISTORY_VISUAL_SCHEMA_V33 = "history-visual-plan.v3.3" as const;
export const HISTORY_VISUAL_PLANNER_V33 =
  "history-visual-planner.v3.3.0" as const;
export const HISTORY_APPROVAL_PACK_V33 = "history-approval-pack.v3.3" as const;

export type HistoryVisualModalityV3_3 =
  | "archival image"
  | "historical artwork"
  | "map"
  | "timeline"
  | "diagram"
  | "document/quotation"
  | "comparison card"
  | "restrained atmospheric reconstruction"
  | "text-only transition"
  | "no generated visual";

export interface HistoryDiagnosticV3_3 {
  readonly code: string;
  readonly severity: "error" | "warning" | "information";
  readonly gate: "structural" | "editorial" | "content" | "production";
  readonly message: string;
  readonly remediation: string;
  readonly affectedIds: readonly string[];
}

export interface HistoryVisualPurposeV3_3 {
  readonly id: string;
  readonly beatId: string;
  readonly narrationSpan: {
    readonly startUtf16: number;
    readonly endUtf16Exclusive: number;
  };
  readonly linkedClaimIds: readonly string[];
  readonly protectedFactualMeaning: string;
  readonly recommendedModality: HistoryVisualModalityV3_3;
  readonly semanticJustification: string;
  readonly disallowedMisleadingTreatments: readonly string[];
  readonly requiredEntities: readonly string[];
  readonly requiredDates: readonly string[];
  readonly requiredPlaces: readonly string[];
  readonly requiredQuantities: readonly string[];
  readonly uncertainty: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly fallbackDecision: {
    readonly rejectedModality: HistoryVisualModalityV3_3;
    readonly reasonForRejection: string;
    readonly selectedFallback: HistoryVisualModalityV3_3;
    readonly semanticJustification: string;
    readonly linkedClaimIds: readonly string[];
    readonly linkedEvidenceIds: readonly string[];
  } | null;
}

export interface AspectRatioPlanV3_3 {
  readonly id: string;
  readonly beatId: string;
  readonly visualPurposeId: string;
  readonly ratio: "16:9" | "9:16";
  readonly protectedSubject: string;
  readonly focalEvidence: string;
  readonly safeZones: readonly string[];
  readonly cropStrategy: string;
  readonly reframingStrategy: string;
  readonly labelsRetained: readonly string[];
  readonly labelsRemoved: readonly string[];
  readonly labelPriority: readonly string[];
  readonly minimumTextSizePx: number;
  readonly textDensityResult: "pass" | "warning" | "block";
  readonly mapSimplification: string;
  readonly diagramSimplification: string;
  readonly conflictDiagnostics: readonly string[];
  readonly independentPortraitRenderingMandatory: boolean;
}

export interface HistoryBeatV3_3 {
  readonly id: string;
  readonly narrationUnitIds: readonly string[];
  readonly narrationSpan: {
    readonly startUtf16: number;
    readonly endUtf16Exclusive: number;
  };
  readonly startMs: number;
  readonly endMs: number;
  readonly linkedClaimIds: readonly string[];
  readonly linkedEvidenceIds: readonly string[];
  readonly visualPurposeId: string;
  readonly modality: HistoryVisualModalityV3_3;
  readonly assetIntentId: string;
  readonly mapStateId: string | null;
  readonly diagramStateId: string | null;
  readonly timelineReference: string | null;
  readonly documentReference: string | null;
  readonly shotIds: readonly string[];
  readonly transition: string;
  readonly continuityNotes: string;
  readonly uncertaintyTreatment: string;
  readonly aspectRatioPlanIds: readonly string[];
}

export interface HistoryShotV3_3 {
  readonly id: string;
  readonly beatId: string;
  readonly durationMs: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly framing: string;
  readonly cameraMovement: string;
  readonly subject: string;
  readonly focalEvidence: string;
  readonly foreground: string;
  readonly midground: string;
  readonly background: string;
  readonly permittedMotion: readonly string[];
  readonly prohibitedMisleadingMotion: readonly string[];
  readonly transition: string;
  readonly assetReuseReference: string | null;
  readonly linkedClaimIds: readonly string[];
  readonly linkedEvidenceIds: readonly string[];
  readonly ratioSpecificAdaptations: readonly {
    readonly ratio: "16:9" | "9:16";
    readonly instruction: string;
  }[];
  readonly reconstructionPolicy: "not-applicable" | "illustrative-not-evidence";
}

export interface HistoryMapRouteV3_3 {
  readonly id: string;
  readonly routeType: "maritime" | "overland" | "military" | "disease-transmission";
  readonly origin: { readonly label: string; readonly coordinates: readonly [number, number] };
  readonly destination: { readonly label: string; readonly coordinates: readonly [number, number] };
  readonly movingActor: string;
  readonly carrierOrVehicle: string | null;
  readonly transportedObjectOrPathogen: string | null;
  readonly dateOrPeriod: string;
  readonly label: string;
  readonly uncertainty: string;
  readonly linkedClaimIds: readonly string[];
  readonly linkedEvidenceIds: readonly string[];
}

export interface HistoryMapStateV3_3 {
  readonly id: string;
  readonly masterId: string;
  readonly purpose: string;
  readonly baseGeography: string;
  readonly timePeriod: string;
  readonly affectedArea: string;
  readonly territorialState: string;
  readonly labels: readonly {
    readonly text: string;
    readonly linkedClaimIds: readonly string[];
    readonly linkedEvidenceIds: readonly string[];
  }[];
  readonly routes: readonly HistoryMapRouteV3_3[];
  readonly uncertainty: string;
  readonly semanticStatus: "valid" | "blocked";
}

export interface HistoryDiagramStateV3_3 {
  readonly id: string;
  readonly masterId: string;
  readonly diagramType: string;
  readonly exactQuestion: string;
  readonly timeApplicability: string;
  readonly geographyApplicability: string;
  readonly uncertainty: string;
  readonly nodes: readonly {
    readonly id: string;
    readonly label: string;
    readonly linkedClaimIds: readonly string[];
    readonly linkedEvidenceIds: readonly string[];
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly relationship: string;
    readonly linkedClaimIds: readonly string[];
    readonly linkedEvidenceIds: readonly string[];
  }[];
  readonly rejectedAlternatives: readonly string[];
  readonly fallbackDecision: string;
  readonly semanticStatus: "valid" | "blocked";
}

export interface HistoryQualityMetricsV3_3 {
  readonly policyVersion: "history-repetition-policy.v3.3.0";
  readonly exactPurposeDuplicateRate: number;
  readonly semanticPurposeNearDuplicateRate: number;
  readonly dominantCameraInstructionRate: number;
  readonly dominantTransitionInstructionRate: number;
  readonly twoInstructionAlternationRate: number;
  readonly shotStructureDuplicateRate: number;
  readonly assetTreatmentDuplicateRate: number;
  readonly thresholds: {
    readonly exactPurposeDuplicateRate: 0;
    readonly semanticPurposeNearDuplicateRate: 0.25;
    readonly dominantCameraInstructionRate: 0.5;
    readonly twoInstructionAlternationRate: 0.8;
  };
  readonly passes: boolean;
}

export interface HistoryApprovalV3_3 {
  readonly structural: { readonly state: "reviewable" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly editorial: { readonly state: "production_plan_reviewable" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly content: { readonly state: "approved" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly production: { readonly state: "approved" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly overrideStatus: "none" | "valid" | "invalidated";
}

export interface HistoryVisualPlanV3_3 {
  readonly schemaVersion: typeof HISTORY_VISUAL_SCHEMA_V33;
  readonly plannerVersion: typeof HISTORY_VISUAL_PLANNER_V33;
  readonly episodeId: string;
  readonly title: string;
  readonly researchSnapshotHash: string;
  readonly narration: CanonicalNarrationV3_3;
  readonly durationPolicy: DurationPolicyV3_3;
  readonly timing: TimingResultV3_3;
  readonly entities: readonly { readonly id: string; readonly name: string; readonly claimIds: readonly string[] }[];
  readonly rejectedEntities: readonly { readonly text: string; readonly reason: string }[];
  readonly visualPurposes: readonly HistoryVisualPurposeV3_3[];
  readonly beats: readonly HistoryBeatV3_3[];
  readonly shots: readonly HistoryShotV3_3[];
  readonly assetIntents: readonly { readonly id: string; readonly beatId: string; readonly modality: HistoryVisualModalityV3_3; readonly factual: boolean; readonly linkedClaimIds: readonly string[]; readonly linkedEvidenceIds: readonly string[]; readonly evidenceStatus: string }[];
  readonly mediaDecisions: readonly { readonly id: string; readonly beatId: string; readonly selectedModality: HistoryVisualModalityV3_3; readonly rejectedModalities: readonly HistoryVisualModalityV3_3[]; readonly justification: string; readonly evidenceStatus: string }[];
  readonly mapMasters: readonly { readonly id: string; readonly purpose: string; readonly supportedRatios: readonly ["16:9", "9:16"] }[];
  readonly mapStates: readonly HistoryMapStateV3_3[];
  readonly diagramMasters: readonly { readonly id: string; readonly diagramType: string; readonly exactQuestion: string; readonly supportedRatios: readonly ["16:9", "9:16"] }[];
  readonly diagramStates: readonly HistoryDiagramStateV3_3[];
  readonly aspectRatioPlans: readonly AspectRatioPlanV3_3[];
  readonly qualityMetrics: HistoryQualityMetricsV3_3;
  readonly diagnostics: readonly HistoryDiagnosticV3_3[];
  readonly approval: HistoryApprovalV3_3;
  readonly planHash: string;
}

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

export function measureHistoryRepetitionV33(input: {
  readonly purposes: readonly HistoryVisualPurposeV3_3[];
  readonly shots: readonly HistoryShotV3_3[];
}): HistoryQualityMetricsV3_3 {
  const purposeText = input.purposes.map((purpose) =>
    `${purpose.protectedFactualMeaning} ${purpose.semanticJustification}`
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
  const semanticPurposeNearDuplicateRate = comparedPairs
    ? nearDuplicatePairs / comparedPairs
    : 0;
  const cameras = input.shots.map((shot) => shot.cameraMovement);
  const transitions = input.shots.map((shot) => shot.transition);
  const topTwo = [...new Set(cameras)]
    .map((camera) => cameras.filter((value) => value === camera).length)
    .sort((a, b) => b - a)
    .slice(0, 2)
    .reduce((sum, value) => sum + value, 0);
  const shotStructures = input.shots.map(
    (shot) => `${shot.framing}|${shot.cameraMovement}|${shot.transition}`
  );
  const assetTreatments = input.shots.map(
    (shot) => `${shot.reconstructionPolicy}|${shot.subject}`
  );
  const metric = {
    policyVersion: "history-repetition-policy.v3.3.0" as const,
    exactPurposeDuplicateRate,
    semanticPurposeNearDuplicateRate,
    dominantCameraInstructionRate: dominantShare(cameras),
    dominantTransitionInstructionRate: dominantShare(transitions),
    twoInstructionAlternationRate: cameras.length ? topTwo / cameras.length : 0,
    shotStructureDuplicateRate: shotStructures.length
      ? (shotStructures.length - new Set(shotStructures).size) /
        shotStructures.length
      : 0,
    assetTreatmentDuplicateRate: assetTreatments.length
      ? (assetTreatments.length - new Set(assetTreatments).size) /
        assetTreatments.length
      : 0,
    thresholds: {
      exactPurposeDuplicateRate: 0 as const,
      semanticPurposeNearDuplicateRate: 0.25 as const,
      dominantCameraInstructionRate: 0.5 as const,
      twoInstructionAlternationRate: 0.8 as const,
    },
  };
  return {
    ...metric,
    passes:
      metric.exactPurposeDuplicateRate <= metric.thresholds.exactPurposeDuplicateRate &&
      metric.semanticPurposeNearDuplicateRate < metric.thresholds.semanticPurposeNearDuplicateRate &&
      metric.dominantCameraInstructionRate < metric.thresholds.dominantCameraInstructionRate &&
      metric.twoInstructionAlternationRate < metric.thresholds.twoInstructionAlternationRate,
  };
}

const supportedStatuses = new Set<ClaimProvenanceStatusV3_3>([
  "supported",
  "contested",
  "not_required",
]);

const modalityFor = (text: string, provenanceReady: boolean): HistoryVisualModalityV3_3 => {
  if (!provenanceReady)
    return /\b(?:but|however|instead|so what|yet)\b/iu.test(text)
      ? "text-only transition"
      : "no generated visual";
  if (/\b(?:route|crossed|river|territory|entered|retreat|ships?|roads?)\b/iu.test(text)) return "map";
  if (/\b(?:year|century|later|between|by \d{3,4})\b/iu.test(text)) return "timeline";
  if (/\b(?:because|cycle|system|relationship|led to|resulted)\b/iu.test(text)) return "diagram";
  if (/\b(?:law|statute|account|wrote|decree|quotation)\b/iu.test(text)) return "document/quotation";
  if (/\b(?:compared|more than|less than|rather than)\b/iu.test(text)) return "comparison card";
  return "archival image";
};

const diagnostic = (
  code: string,
  gate: HistoryDiagnosticV3_3["gate"],
  message: string,
  affectedIds: readonly string[] = [],
  severity: HistoryDiagnosticV3_3["severity"] = "error"
): HistoryDiagnosticV3_3 => ({
  code,
  gate,
  message,
  affectedIds,
  severity,
  remediation: "Resolve the identified V3.3 record and regenerate Phase B from the frozen research snapshot.",
});

function summarizeApproval(
  diagnostics: readonly HistoryDiagnosticV3_3[],
  overrides: HistoryResearchSnapshotV3_3["overrides"]
): HistoryApprovalV3_3 {
  const blockers = (gate: HistoryDiagnosticV3_3["gate"]): string[] =>
    [...new Set(diagnostics.filter((item) => item.gate === gate && item.severity === "error").map((item) => item.code))].sort();
  const structural = blockers("structural");
  const editorial = blockers("editorial");
  const content = blockers("content");
  const production = blockers("production");
  const upstreamContent = [...new Set([...structural, ...editorial, ...content])].sort();
  const upstreamProduction = [...new Set([...upstreamContent, ...production])].sort();
  return {
    structural: { state: structural.length ? "blocked" : "reviewable", blockerCodes: structural },
    editorial: { state: structural.length || editorial.length ? "blocked" : "production_plan_reviewable", blockerCodes: [...new Set([...structural, ...editorial])].sort() },
    content: { state: upstreamContent.length ? "blocked" : "approved", blockerCodes: upstreamContent },
    production: { state: upstreamProduction.length ? "blocked" : "approved", blockerCodes: upstreamProduction },
    blockerCount: diagnostics.filter((item) => item.severity === "error").length,
    warningCount: diagnostics.filter((item) => item.severity === "warning").length,
    overrideStatus: overrides.length ? "valid" : "none",
  };
}

export function validateHistoryMapStatesV33(input: {
  readonly mapStates: readonly HistoryMapStateV3_3[];
  readonly claimIds: ReadonlySet<string>;
  readonly evidenceIds: ReadonlySet<string>;
}): HistoryDiagnosticV3_3[] {
  const diagnostics: HistoryDiagnosticV3_3[] = [];
  for (const state of input.mapStates) {
    for (const route of state.routes) {
      const fail = (code: string, message: string): void => {
        diagnostics.push(diagnostic(code, "editorial", message, [state.id, route.id]));
      };
      if (route.origin.label === route.destination.label) fail("MAP_IDENTITY_ROUTE", "Map route endpoints must be distinct.");
      if (route.routeType === "maritime" && /overland|road|land connection/iu.test(route.label)) fail("MAP_ROUTE_LABEL_CONTRADICTION", "A maritime route cannot be labelled overland.");
      if (route.routeType === "overland" && /maritime|ship|sea route/iu.test(route.label)) fail("MAP_ROUTE_LABEL_CONTRADICTION", "An overland route cannot be labelled maritime.");
      if (route.transportedObjectOrPathogen && route.movingActor === route.transportedObjectOrPathogen) fail("MAP_PATHOGEN_ROLE_CONFLICT", "A pathogen cannot be the carrier actor.");
      if (!route.linkedClaimIds.length || !route.linkedEvidenceIds.length) fail("MAP_EVIDENCE_MISSING", "Every route requires claim and evidence bindings.");
      if (route.linkedClaimIds.some((id) => !input.claimIds.has(id)) || route.linkedEvidenceIds.some((id) => !input.evidenceIds.has(id))) fail("MAP_REFERENCE_INVALID", "Map route references must resolve.");
    }
    for (const label of state.labels)
      if (!label.linkedClaimIds.length || !label.linkedEvidenceIds.length)
        diagnostics.push(diagnostic("MAP_LABEL_EVIDENCE_MISSING", "editorial", "Every factual map label requires claim and evidence bindings.", [state.id, label.text]));
  }
  return diagnostics;
}

export function validateHistoryDiagramStatesV33(input: {
  readonly diagramStates: readonly HistoryDiagramStateV3_3[];
  readonly claimIds: ReadonlySet<string>;
  readonly evidenceIds: ReadonlySet<string>;
}): HistoryDiagnosticV3_3[] {
  const diagnostics: HistoryDiagnosticV3_3[] = [];
  for (const state of input.diagramStates) {
    const nodeIds = new Set(state.nodes.map((node) => node.id));
    for (const node of state.nodes)
      if (!node.linkedClaimIds.length || !node.linkedEvidenceIds.length)
        diagnostics.push(diagnostic("DIAGRAM_NODE_EVIDENCE_MISSING", "editorial", "Every diagram node must be independently evidence-bound.", [state.id, node.id]));
    for (const edge of state.edges) {
      if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId))
        diagnostics.push(diagnostic("DIAGRAM_EDGE_REFERENCE_INVALID", "structural", "Diagram edge endpoints must resolve.", [state.id, edge.id]));
      if (!edge.linkedClaimIds.length || !edge.linkedEvidenceIds.length)
        diagnostics.push(diagnostic("DIAGRAM_EDGE_EVIDENCE_MISSING", "editorial", "Every diagram relationship must have its own evidence binding.", [state.id, edge.id]));
      if (edge.linkedClaimIds.some((id) => !input.claimIds.has(id)) || edge.linkedEvidenceIds.some((id) => !input.evidenceIds.has(id)))
        diagnostics.push(diagnostic("DIAGRAM_REFERENCE_INVALID", "structural", "Diagram evidence references must resolve.", [state.id, edge.id]));
    }
  }
  return diagnostics;
}

export function buildHistoryVisualPlanV33(input: {
  readonly title: string;
  readonly researchSnapshot: HistoryResearchSnapshotV3_3;
  readonly durationPolicy?: DurationPolicyV3_3;
  readonly measuredTiming?: {
    readonly source: "measured-tts" | "measured-final-audio";
    readonly durationMs: number;
    readonly audioSha256: string;
  };
}): HistoryVisualPlanV3_3 {
  assertResearchSnapshotV33(input.researchSnapshot);
  const snapshot = input.researchSnapshot;
  const durationPolicy = input.durationPolicy ?? HISTORY_LONG_FORM_DURATION_POLICY_V33;
  const timing = estimateHistoryTimingV33({
    narration: snapshot.canonicalNarration,
    durationPolicy,
    timingProfile: HISTORY_TIMING_PROFILE_V33,
    ...(input.measuredTiming ? { measurement: input.measuredTiming } : {}),
  });
  const provenanceByClaim = new Map(snapshot.provenance.map((item) => [item.claimId, item] as const));
  const purposeProposalByUnit = new Map(
    (snapshot.visualPurposeProposals ?? []).map((item) => [
      item.narrationUnitId,
      item,
    ] as const)
  );
  const claimsByUnit = new Map<string, string[]>();
  for (const claim of snapshot.claims)
    claimsByUnit.set(claim.narrationUnitId, [...(claimsByUnit.get(claim.narrationUnitId) ?? []), claim.id]);
  const durations = allocateHistoryTimingV33(
    timing.totalDurationMs,
    snapshot.canonicalNarration.units.map((unit) => Math.max(1, unit.wordCount))
  );
  const cameras = ["locked evidence frame", "slow lateral reveal", "measured detail push", "static comparison hold", "layered annotation reveal", "restrained pull-back"];
  const transitions = ["direct evidence cut", "brief neutral dissolve", "chapter-matched fade", "hold then cut", "narration-synchronous cut", "restrained crossfade"];
  const framings = ["wide contextual frame", "medium evidence frame", "detail frame", "balanced comparison frame", "centered document frame", "layered context frame"];
  const visualPurposes: HistoryVisualPurposeV3_3[] = [];
  const beats: HistoryBeatV3_3[] = [];
  const shots: HistoryShotV3_3[] = [];
  const aspectRatioPlans: AspectRatioPlanV3_3[] = [];
  const assetIntents: HistoryVisualPlanV3_3["assetIntents"][number][] = [];
  const mediaDecisions: HistoryVisualPlanV3_3["mediaDecisions"][number][] = [];
  let cursor = 0;
  snapshot.canonicalNarration.units.forEach((unit, index) => {
    const beatNumber = String(index + 1).padStart(4, "0");
    const beatId = `beat-${beatNumber}`;
    const shotId = `shot-${beatNumber}-01`;
    const purposeId = `purpose-${beatNumber}`;
    const assetIntentId = `asset-intent-${beatNumber}`;
    const claimIds = claimsByUnit.get(unit.id) ?? [];
    const provenance = claimIds.map((id) => provenanceByClaim.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const provenanceReady = provenance.length > 0 && provenance.every((item) => supportedStatuses.has(item.status));
    const evidenceIds = [...new Set(provenance.flatMap((item) => item.evidenceFragmentIds))].sort();
    const proposedPurpose = purposeProposalByUnit.get(unit.id);
    const modality = provenanceReady
      ? proposedPurpose?.recommendedModality ?? modalityFor(unit.text, true)
      : modalityFor(unit.text, false);
    const durationMs = durations[index]!;
    const endMs = cursor + durationMs;
    const fallback = provenanceReady
      ? null
      : {
          rejectedModality:
            proposedPurpose?.recommendedModality ??
            (/\b(?:route|river|territory|ships?|roads?)\b/iu.test(unit.text)
              ? "map" as const
              : "diagram" as const),
          reasonForRejection: "The frozen snapshot does not contain adequate reproducible evidence for a factual graphic.",
          selectedFallback: modality,
          semanticJustification: "Keep narration audible without manufacturing an unsupported factual depiction.",
          linkedClaimIds: claimIds,
          linkedEvidenceIds: evidenceIds,
        };
    visualPurposes.push({
      id: purposeId,
      beatId,
      narrationSpan: { startUtf16: unit.startUtf16, endUtf16Exclusive: unit.endUtf16Exclusive },
      linkedClaimIds: claimIds,
      protectedFactualMeaning:
        proposedPurpose?.protectedFactualMeaning ?? unit.text,
      recommendedModality: modality,
      semanticJustification:
        proposedPurpose?.semanticJustification ??
        (provenanceReady
          ? `Use ${modality} to clarify the exact narrated proposition without adding unsupported precision.`
          : "Preserve this unique narration span while withholding factual imagery until provenance is adequate."),
      disallowedMisleadingTreatments:
        proposedPurpose?.disallowedMisleadingTreatments ??
        ["invented labels", "unsupported causal arrows", "false geographic precision", "unlabelled photorealistic reconstruction"],
      requiredEntities: [...new Set(snapshot.claims.filter((claim) => claimIds.includes(claim.id)).flatMap((claim) => claim.entities.map((entity) => entity.text)))],
      requiredDates: [...new Set(snapshot.claims.filter((claim) => claimIds.includes(claim.id)).flatMap((claim) => claim.temporalQualifiers))],
      requiredPlaces: [...new Set(snapshot.claims.filter((claim) => claimIds.includes(claim.id)).flatMap((claim) => claim.geographicQualifiers))],
      requiredQuantities: [...new Set(snapshot.claims.filter((claim) => claimIds.includes(claim.id)).flatMap((claim) => claim.quantitativeQualifiers))],
      uncertainty: [...new Set(snapshot.claims.filter((claim) => claimIds.includes(claim.id)).flatMap((claim) => claim.uncertaintyMarkers))],
      evidenceRequirements:
        proposedPurpose?.evidenceRequirements ??
        (provenanceReady
          ? ["retain supplied claim/evidence links"]
          : ["obtain reproducible evidence before selecting a factual visual"]),
      fallbackDecision: fallback,
    });
    const ratioIds = (["16:9", "9:16"] as const).map((ratio) => `ratio-${beatNumber}-${ratio.replace(":", "x")}`);
    aspectRatioPlans.push(
      {
        id: ratioIds[0]!, beatId, visualPurposeId: purposeId, ratio: "16:9", protectedSubject: provenanceReady ? unit.text.slice(0, 120) : "narration-led neutral field", focalEvidence: evidenceIds.join(", ") || "none; factual graphic withheld", safeZones: ["top 10% clear", "bottom 12% clear"], cropStrategy: "native landscape composition", reframingStrategy: "place focal subject on the narration-led third", labelsRetained: [], labelsRemoved: [], labelPriority: [], minimumTextSizePx: 28, textDensityResult: "pass", mapSimplification: "retain only evidenced route and critical labels", diagramSimplification: "retain only evidenced nodes and edges", conflictDiagnostics: [], independentPortraitRenderingMandatory: false,
      },
      {
        id: ratioIds[1]!, beatId, visualPurposeId: purposeId, ratio: "9:16", protectedSubject: provenanceReady ? unit.text.slice(0, 120) : "narration-led neutral field", focalEvidence: evidenceIds.join(", ") || "none; factual graphic withheld", safeZones: ["top 14% clear", "bottom 18% clear", "center 70% protected"], cropStrategy: "no blind landscape crop", reframingStrategy: "independent portrait layout with vertically ordered evidence", labelsRetained: [], labelsRemoved: [], labelPriority: [], minimumTextSizePx: 32, textDensityResult: "pass", mapSimplification: "portrait-specific route isolation", diagramSimplification: "portrait-specific vertical node order", conflictDiagnostics: [], independentPortraitRenderingMandatory: true,
      }
    );
    shots.push({
      id: shotId, beatId, durationMs, startMs: cursor, endMs, framing: framings[index % framings.length]!, cameraMovement: cameras[index % cameras.length]!, subject: provenanceReady ? unit.text.slice(0, 160) : "Neutral narration-led field; no factual depiction", focalEvidence: evidenceIds.join(", ") || "No factual evidence rendered", foreground: "No unsupported factual labels", midground: provenanceReady ? "Evidence-bound subject" : "Restrained non-factual texture", background: "Low-detail neutral context", permittedMotion: ["subtle non-diegetic texture", "narration-synchronous opacity change"], prohibitedMisleadingMotion: ["invented actor movement", "unsupported territorial change", "causal animation without edge evidence"], transition: transitions[index % transitions.length]!, assetReuseReference: null, linkedClaimIds: claimIds, linkedEvidenceIds: evidenceIds, ratioSpecificAdaptations: [{ ratio: "16:9", instruction: "Use native horizontal composition and landscape safe zones." }, { ratio: "9:16", instruction: "Render an independent vertical composition; do not crop the landscape layout." }], reconstructionPolicy: modality === "restrained atmospheric reconstruction" ? "illustrative-not-evidence" : "not-applicable",
    });
    beats.push({
      id: beatId, narrationUnitIds: [unit.id], narrationSpan: { startUtf16: unit.startUtf16, endUtf16Exclusive: unit.endUtf16Exclusive }, startMs: cursor, endMs, linkedClaimIds: claimIds, linkedEvidenceIds: evidenceIds, visualPurposeId: purposeId, modality, assetIntentId, mapStateId: null, diagramStateId: null, timelineReference: null, documentReference: null, shotIds: [shotId], transition: transitions[index % transitions.length]!, continuityNotes: `Beat ${index + 1} continues canonical narration order without template-level semantic substitution.`, uncertaintyTreatment: provenanceReady ? "Retain claim-level uncertainty markers and evidence limits." : "Do not depict factual specifics while material provenance remains blocked.", aspectRatioPlanIds: ratioIds,
    });
    assetIntents.push({ id: assetIntentId, beatId, modality, factual: provenanceReady && !["text-only transition", "no generated visual"].includes(modality), linkedClaimIds: claimIds, linkedEvidenceIds: evidenceIds, evidenceStatus: provenanceReady ? "adequate" : "withheld-until-provenance-resolves" });
    mediaDecisions.push({ id: `media-decision-${beatNumber}`, beatId, selectedModality: modality, rejectedModalities: fallback ? [fallback.rejectedModality] : [], justification: fallback?.semanticJustification ?? `The frozen evidence supports this beat-specific ${modality} choice.`, evidenceStatus: provenanceReady ? "adequate" : "blocked" });
    cursor = endMs;
  });
  const qualityMetrics = measureHistoryRepetitionV33({ purposes: visualPurposes, shots });
  const diagnostics: HistoryDiagnosticV3_3[] = [];
  const withheldMapPurposes = visualPurposes.filter(
    (purpose) => purpose.fallbackDecision?.rejectedModality === "map"
  );
  const withheldDiagramPurposes = visualPurposes.filter(
    (purpose) => purpose.fallbackDecision?.rejectedModality === "diagram"
  );
  if (withheldMapPurposes.length)
    diagnostics.push(
      diagnostic(
        "MAP_PLAN_WITHHELD_FOR_PROVENANCE",
        "editorial",
        "Map candidates are documented but no factual map state is reviewable until its route, labels, actors, dates, and boundaries have adequate evidence.",
        withheldMapPurposes.map((purpose) => purpose.beatId)
      )
    );
  if (withheldDiagramPurposes.length)
    diagnostics.push(
      diagnostic(
        "DIAGRAM_PLAN_WITHHELD_FOR_PROVENANCE",
        "editorial",
        "Diagram candidates are documented but rejected until every proposed node and relationship has independent evidence.",
        withheldDiagramPurposes.map((purpose) => purpose.beatId)
      )
    );
  for (const provenance of snapshot.provenance)
    if (provenance.approvalBlocking)
      diagnostics.push(diagnostic(`CLAIM_${provenance.status.toUpperCase()}`, "content", provenance.rationale, [provenance.claimId]));
  if (!timing.withinAllowedRange || timing.aboveHardMaximum)
    diagnostics.push(diagnostic("TIMING_OUTSIDE_ALLOWED_RANGE", "production", `Narration duration ${timing.totalDurationMs}ms is outside ${durationPolicy.allowedMinDurationMs}-${durationPolicy.allowedMaxDurationMs}ms.`));
  if (timing.timingSource === "provisional-text-estimate" && !durationPolicy.estimatedOnlyProductionApproval)
    diagnostics.push(diagnostic("TIMING_MEASUREMENT_REQUIRED", "production", "Final production approval requires measured TTS or measured final audio."));
  if (timing.preferredDeltaPercent !== null && Math.abs(timing.preferredDeltaPercent) > durationPolicy.editorialTolerancePercent && timing.withinAllowedRange)
    diagnostics.push(diagnostic("TIMING_PREFERRED_DEVIATION", "editorial", "Duration differs from the preferred target but remains inside the allowed History range.", [], "warning"));
  if (!qualityMetrics.passes)
    diagnostics.push(diagnostic("EDITORIAL_REPETITION_THRESHOLD", "editorial", "Purpose or shot repetition exceeds the V3.3 threshold.", beats.map((beat) => beat.id)));
  const mapMasters: HistoryVisualPlanV3_3["mapMasters"] = [];
  const mapStates: HistoryMapStateV3_3[] = [];
  const diagramMasters: HistoryVisualPlanV3_3["diagramMasters"] = [];
  const diagramStates: HistoryDiagramStateV3_3[] = [];
  diagnostics.push(...validateHistoryMapStatesV33({ mapStates, claimIds: new Set(snapshot.claims.map((claim) => claim.id)), evidenceIds: new Set(snapshot.evidenceFragments.map((fragment) => fragment.id)) }));
  diagnostics.push(...validateHistoryDiagramStatesV33({ diagramStates, claimIds: new Set(snapshot.claims.map((claim) => claim.id)), evidenceIds: new Set(snapshot.evidenceFragments.map((fragment) => fragment.id)) }));
  const body = {
    schemaVersion: HISTORY_VISUAL_SCHEMA_V33,
    plannerVersion: HISTORY_VISUAL_PLANNER_V33,
    episodeId: snapshot.episodeId,
    title: input.title,
    researchSnapshotHash: snapshot.snapshotHash,
    narration: snapshot.canonicalNarration,
    durationPolicy,
    timing,
    entities: [...new Map(snapshot.claims.flatMap((claim) => claim.entities.map((entity) => [entity.text.toLocaleLowerCase(), entity.text] as const))).entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, name]) => ({ id: `entity-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`, name, claimIds: snapshot.claims.filter((claim) => claim.entities.some((entity) => entity.text.toLocaleLowerCase() === key)).map((claim) => claim.id) })),
    rejectedEntities: [],
    visualPurposes,
    beats,
    shots,
    assetIntents,
    mediaDecisions,
    mapMasters,
    mapStates,
    diagramMasters,
    diagramStates,
    aspectRatioPlans,
    qualityMetrics,
    diagnostics,
    approval: summarizeApproval(diagnostics, snapshot.overrides),
  };
  const plan = { ...body, planHash: hashCanonicalV33(body) };
  validateHistoryVisualPlanV33(plan);
  return plan;
}

export function validateHistoryVisualPlanV33(plan: HistoryVisualPlanV3_3): {
  readonly valid: boolean;
  readonly diagnostics: readonly HistoryDiagnosticV3_3[];
  readonly referenceCount: number;
} {
  const { planHash, ...body } = plan;
  if (hashCanonicalV33(body) !== planHash)
    throw new Error("History V3.3 plan hash is invalid.");
  const unitIds = new Set(plan.narration.units.map((unit) => unit.id));
  const beatIds = new Set(plan.beats.map((beat) => beat.id));
  const shotIds = new Set(plan.shots.map((shot) => shot.id));
  const purposeIds = new Set(plan.visualPurposes.map((purpose) => purpose.id));
  const assetIds = new Set(plan.assetIntents.map((asset) => asset.id));
  const ratioIds = new Set(plan.aspectRatioPlans.map((ratio) => ratio.id));
  for (const beat of plan.beats) {
    if (beat.narrationUnitIds.some((id) => !unitIds.has(id)) || !purposeIds.has(beat.visualPurposeId) || !assetIds.has(beat.assetIntentId) || beat.shotIds.some((id) => !shotIds.has(id)) || beat.aspectRatioPlanIds.some((id) => !ratioIds.has(id)))
      throw new Error(`History V3.3 beat ${beat.id} has dangling references.`);
    if (beat.endMs <= beat.startMs) throw new Error(`History V3.3 beat ${beat.id} has invalid timing.`);
  }
  const ordered = [...plan.beats].sort((left, right) => left.startMs - right.startMs);
  if (ordered[0]?.startMs !== 0 || ordered.at(-1)?.endMs !== plan.timing.totalDurationMs || ordered.some((beat, index) => index > 0 && ordered[index - 1]!.endMs !== beat.startMs))
    throw new Error("History V3.3 beat timing is not contiguous across the planned duration.");
  for (const shot of plan.shots) {
    if (!beatIds.has(shot.beatId) || shot.durationMs <= 0 || shot.endMs - shot.startMs !== shot.durationMs)
      throw new Error(`History V3.3 shot ${shot.id} is invalid.`);
  }
  for (const ratio of plan.aspectRatioPlans)
    if (!beatIds.has(ratio.beatId) || !purposeIds.has(ratio.visualPurposeId) || ratio.conflictDiagnostics.length || ratio.textDensityResult === "block")
      throw new Error(`History V3.3 ratio plan ${ratio.id} is not production-reviewable.`);
  return { valid: true, diagnostics: plan.diagnostics, referenceCount: plan.beats.length + plan.shots.length + plan.aspectRatioPlans.length };
}
