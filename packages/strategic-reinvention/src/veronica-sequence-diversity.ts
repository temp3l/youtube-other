import type {
  PositioningVisualPlanV2,
  VisualBeatTreatmentV1,
  VeronicaSequenceDiversityFinding,
  VeronicaSequenceDiversityFindingCode,
  VeronicaSequenceDiversityResult,
  VeronicaDepictedActionFamily,
  VeronicaPresentationMechanism,
  VeronicaVisualTreatmentSignature,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";

export const VERONICA_SEQUENCE_DIVERSITY_POLICY_VERSION =
  "veronica-sequence-diversity-policy.v2" as const;

export interface VeronicaSequenceDiversityPolicy {
  readonly enabled: boolean;
  readonly maximumRefinementPasses: 2;
  readonly adjacentMatchingDimensionThreshold: 5;
  readonly threeBeatDominantShare: 1;
  readonly fiveBeatDominantShare: 0.6;
  readonly wholeEpisodeReviewShare: 0.7;
  readonly openingMinimumMechanisms: Readonly<Record<"5" | "10" | "15", number>>;
  readonly openingMinimumDepictedActions: Readonly<Record<"5" | "10" | "15", number>>;
}

const SHORT_POLICY: VeronicaSequenceDiversityPolicy = {
  enabled: true,
  maximumRefinementPasses: 2,
  adjacentMatchingDimensionThreshold: 5,
  threeBeatDominantShare: 1,
  fiveBeatDominantShare: 0.6,
  wholeEpisodeReviewShare: 0.7,
  openingMinimumMechanisms: { "5": 2, "10": 3, "15": 3 },
  openingMinimumDepictedActions: { "5": 2, "10": 3, "15": 3 },
};

const LONG_POLICY: VeronicaSequenceDiversityPolicy = {
  ...SHORT_POLICY,
  enabled: false,
  openingMinimumMechanisms: { "5": 0, "10": 0, "15": 0 },
  openingMinimumDepictedActions: { "5": 0, "10": 0, "15": 0 },
};

export function resolveVeronicaSequenceDiversityPolicy(
  format: PositioningVisualPlanV2["format"],
): VeronicaSequenceDiversityPolicy {
  return format === "short" ? SHORT_POLICY : LONG_POLICY;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function fallbackFamily(value: string): string {
  return normalized(value).split(/\s+/u).filter((token) => token.length > 3).slice(0, 4).join("-") || "unspecified";
}

function presentationActionFamily(value: string): string {
  if (/\b(?:isolat|single|one .* from|pull .* from)\w*/iu.test(value)) return "isolation";
  if (/\b(?:inspect|check|diagnos|examin|foreground evidence)\w*/iu.test(value)) return "inspection";
  if (/\b(?:compar\w*|versus|beside|parallel|side.by.side)\w*/iu.test(value)) return "comparison";
  if (/\b(?:subtract|remove|peel|drain|cost station|portion)\w*/iu.test(value)) return "decomposition";
  if (/\b(?:double|expand|increase|grow|larger)\w*/iu.test(value)) return "expansion";
  if (/\b(?:flow|move|pass|enter|progression|path)\w*/iu.test(value)) return "flow";
  if (/\b(?:recede|foreground|background)\w*/iu.test(value)) return "depth-emphasis";
  return fallbackFamily(value);
}

function physicalActionClause(value: string): string {
  return value.replace(
    /^[^.]{0,140}\b(?:staging|inspection|view|progression|composition)\b[^.]{0,100}\bwhile\s+/iu,
    "",
  ).trim();
}

/** Presentation words never count as evidence that the depicted action changed. */
export function deriveVeronicaDepictedActionFamily(
  beat: Pick<VisualBeatTreatmentV1, "action">,
): VeronicaDepictedActionFamily {
  const action = physicalActionClause(beat.action);
  if (/\b(?:one more|additional|incremental|marginal)\b[^.]{0,100}\b(?:sale|unit|contribution|input)\b/iu.test(action)) return "incremental-contribution";
  if (/\b(?:queue|backlog)\b[^.]{0,100}\b(?:grow|lengthen|build|increase)\w*/iu.test(action)) return "queue-growth";
  if (/\b(?:bottleneck|constraint|choke point)\b/iu.test(action)) return "bottleneck";
  if (/\b(?:workload|work|burden|effort)\b[^.]{0,100}\b(?:double|grow|increase|expand)\w*|\b(?:double|grow|increase|expand)\w*[^.]{0,100}\b(?:workload|burden|effort)\b/iu.test(action)) return "workload-growth";
  if (/\b(?:compar\w*|versus|beside|side.by.side|separate measures?|two measures?)\b/iu.test(action)) return "comparison";
  if (/\b(?:subtract|split|break|drain|remove|peel|cost station|outgoing portion|remainder)\w*|\bseparat\w*\b[^.]{0,100}\b(?:into|outgoing|portions?|remainder)\b/iu.test(action)) return "decomposition";
  if (/\b(?:select|pull|extract|isolate)\w*\b[^.]{0,100}\b(?:from|out of|stream|many|larger)\b/iu.test(action)) return "selection";
  if (/\b(?:sort|classif|group)\w*/iu.test(action)) return "sorting";
  if (/\b(?:allocat|assign|distribut)\w*/iu.test(action)) return "allocation";
  if (/\b(?:convert|transform|turns? into)\w*/iu.test(action)) return "conversion";
  if (/\b(?:transfer|hand|pass|give)\w*\b[^.]{0,100}\b(?:to|between|across)\b|\bplac\w*\b[^.]{0,100}\binto\b/iu.test(action)) return "transfer";
  if (/\b(?:apply|use|implement|deploy)\w*\b[^.]{0,100}\b(?:framework|method|tool|process|system|knowledge)\b/iu.test(action)) return "application";
  if (/\b(?:inspect|check|diagnos|examin|analy[sz]|calculate)\w*/iu.test(action)) return "inspection";
  if (/\b(?:scale|double|expand|increase|grow|larger|volume)\w*/iu.test(action)) return "scaling";
  if (/\b(?:accumulat|collect|stack|build up)\w*/iu.test(action)) return "accumulation";
  if (/\b(?:retained|residual|remainder)\b[^.]{0,80}\b(?:reveal|remain|emerge|foreground)\w*/iu.test(action)) return "retained-value-reveal";
  if (/\b(?:reveal|show|surface|make visible)\w*\b[^.]{0,100}\b(?:proof|evidence|result|demonstration)\b|\b(?:proof|evidence)\b[^.]{0,100}\b(?:appear|become visible|emerge)\w*/iu.test(action)) return "evidence-reveal";
  if (/\b(?:contrast|opposing condition|while the complete depicted condition)\b/iu.test(action)) return "contrast-reveal";
  if (/\b(?:transition|changes? from|before .* after)\b/iu.test(action)) return "state-transition";
  if (/\b(?:flow|move|enter|travel|progress|route)\w*/iu.test(action)) return "flow";
  return "other";
}

function presentationMechanism(beat: Pick<VisualBeatTreatmentV1, "action" | "environment" | "composition">): VeronicaPresentationMechanism {
  const presentation = `${beat.action} ${beat.environment} ${beat.composition.description}`;
  if (/foreground evidence staging/iu.test(presentation)) return "foreground-evidence";
  if (/isolated diagnostic inspection/iu.test(presentation)) return "isolated-diagnostic";
  if (/modular system view/iu.test(presentation)) return "modular-system";
  if (/diagonal process progression|linear process lane/iu.test(presentation)) return "process-path";
  if (/depth composition|recede in depth/iu.test(presentation)) return "depth-staging";
  if (physicalActionClause(beat.action) === beat.action.trim()) return "unmodified";
  return "other-presentation";
}

function environmentFamily(value: string): string {
  if (/\b(?:station|pipeline|process lane|breakdown line)\b/iu.test(value)) return "process-line";
  if (/\b(?:stream|running flow)\b/iu.test(value)) return "stream-system";
  if (/\b(?:intake|entry point)\b/iu.test(value)) return "intake-point";
  if (/\b(?:diagnostic|inspection)\b/iu.test(value)) return "inspection-surface";
  if (/\b(?:modular|scalable system)\b/iu.test(value)) return "modular-system";
  if (/\b(?:worktable|workspace|surface|setup)\b/iu.test(value)) return "work-surface";
  return fallbackFamily(value);
}

function compositionFamily(value: string): string {
  if (/\b(?:side.by.side|split|left .* right|parallel)\b/iu.test(value)) return "split-comparison";
  if (/\b(?:vertical|top .* bottom|upper .* lower)\b/iu.test(value)) return "vertical-flow";
  if (/\b(?:diagonal|path|station|process)\b/iu.test(value)) return "process-path";
  if (/\b(?:foreground|background|recede|depth)\b/iu.test(value)) return "depth-evidence";
  if (/\b(?:isolated|single focal|one .* center)\b/iu.test(value)) return "single-focus";
  if (/\b(?:modular|system view|input .* output)\b/iu.test(value)) return "system-overview";
  return fallbackFamily(value);
}

function cameraFamily(value: string): string {
  if (/\b(?:overhead|top.down|high.angle)\b/iu.test(value)) return "overhead-evidence";
  if (/\b(?:three.quarter|oblique|diagonal)\b/iu.test(value)) return "oblique-process";
  if (/\b(?:close|detail|macro)\b/iu.test(value)) return "detail-inspection";
  if (/\b(?:eye.level|documentary)\b/iu.test(value)) return "documentary-eye-level";
  return fallbackFamily(value);
}

function beatStarts(plan: Pick<PositioningVisualPlanV2, "scenes">, beats: readonly VisualBeatTreatmentV1[]): Map<string, number> {
  const starts = new Map<string, number>();
  for (const scene of plan.scenes) {
    const siblings = beats.filter((beat) => beat.sceneId === scene.sceneId);
    const total = siblings.reduce((sum, beat) => sum + beat.timingWeight, 0);
    let cursor = scene.startMs;
    siblings.forEach((beat, index) => {
      starts.set(beat.beatId, cursor);
      if (index < siblings.length - 1) cursor += Math.round(scene.durationMs * (beat.timingWeight / Math.max(total, 0.001)));
    });
  }
  return starts;
}

export function buildVeronicaVisualTreatmentSignature(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "scenes">;
  readonly beat: VisualBeatTreatmentV1;
}): VeronicaVisualTreatmentSignature {
  const scene = input.plan.scenes.find((candidate) => candidate.sceneId === input.beat.sceneId);
  const semanticVisualMechanism = scene?.semanticProposition?.visualMechanism ?? "unresolved";
  const depictedActionFamily = deriveVeronicaDepictedActionFamily(input.beat);
  const presentation = presentationMechanism(input.beat);
  const primaryAction = presentationActionFamily(input.beat.action);
  const composition = compositionFamily(input.beat.composition.description);
  const signatureBase = {
    beatId: input.beat.beatId,
    treatmentFamily: `${semanticVisualMechanism}:${depictedActionFamily}:${composition}`,
    visualMechanism: `${semanticVisualMechanism}:${depictedActionFamily}`,
    presentationMechanism: presentation,
    depictedActionFamily,
    environmentFamily: environmentFamily(input.beat.environment),
    primaryAction,
    compositionFamily: composition,
    cameraFamily: cameraFamily(input.beat.composition.camera),
    informationRole: input.beat.role,
    semanticState: scene?.semanticProposition
      ? `${scene.semanticProposition.polarity}:${scene.semanticProposition.stateRelation}`
      : normalized(input.beat.state),
    actorPerspective: scene?.semanticProposition?.actorRole ?? scene?.treatment.actionOwnerRole ?? "unspecified",
    sourcePropositionHash: input.beat.narrationRef.spanHash,
  };
  return { ...signatureBase, signatureHash: stableHash(signatureBase) };
}

function dominantShare(values: readonly string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Math.round(Math.max(...counts.values()) / values.length * 10_000) / 10_000;
}

function finding(input: Omit<VeronicaSequenceDiversityFinding, "evidence"> & { readonly evidence?: string }): VeronicaSequenceDiversityFinding {
  return {
    ...input,
    evidence: input.evidence ?? `${input.repeatedDimensions.join(",")} observed ${input.observed}; threshold ${input.threshold}`,
  };
}

const comparisonDimensions: readonly (keyof Pick<VeronicaVisualTreatmentSignature,
  "treatmentFamily" | "visualMechanism" | "presentationMechanism" | "depictedActionFamily" | "environmentFamily" | "compositionFamily" | "cameraFamily" | "informationRole">)[] = [
  "treatmentFamily", "visualMechanism", "presentationMechanism", "depictedActionFamily", "environmentFamily", "compositionFamily", "cameraFamily", "informationRole",
];

function addWindowFinding(input: {
  readonly findings: VeronicaSequenceDiversityFinding[];
  readonly signatures: readonly VeronicaVisualTreatmentSignature[];
  readonly code: VeronicaSequenceDiversityFindingCode;
  readonly dimension: keyof VeronicaVisualTreatmentSignature;
  readonly size: 3 | 5;
  readonly threshold: number;
}): void {
  for (let start = 0; start <= input.signatures.length - input.size; start += 1) {
    const window = input.signatures.slice(start, start + input.size);
    const share = dominantShare(window.map((signature) => String(signature[input.dimension])));
    if (share < input.threshold) continue;
    const distinctProgression = new Set(window.map((signature) => signature.sourcePropositionHash)).size === window.length
      && new Set(window.map((signature) => `${signature.informationRole}:${signature.semanticState}:${signature.compositionFamily}`)).size >= 2;
    if (distinctProgression && input.dimension === "environmentFamily") continue;
    const continuityCompatible = input.code === "ACTION_MONOTONY"
      || input.code === "PRESENTATION_MECHANISM_REPETITION";
    const severity = continuityCompatible && distinctProgression
      ? "warning"
      : input.size === 3 ? "review-required" : "warning";
    const repeatedValue = String(window[0]?.[input.dimension] ?? "unknown");
    input.findings.push(finding({
      code: input.code,
      severity,
      beatIds: window.map((signature) => signature.beatId),
      window: input.size === 3 ? "three-beat" : "five-beat",
      repeatedDimensions: [String(input.dimension)],
      observed: share,
      threshold: input.threshold,
      evidence: `${String(input.dimension)}=${repeatedValue}; dominant share ${share}; threshold ${input.threshold}`,
      remediationEligible: true,
    }));
  }
}

function openingMetrics(
  signatures: readonly VeronicaVisualTreatmentSignature[],
  starts: ReadonlyMap<string, number>,
  seconds: 5 | 10 | 15,
) {
  const entries = signatures.filter((signature) => (starts.get(signature.beatId) ?? Number.POSITIVE_INFINITY) < seconds * 1_000);
  return {
    beatCount: entries.length,
    uniqueSourcePropositions: new Set(entries.map((entry) => entry.sourcePropositionHash)).size,
    uniqueTreatmentMechanisms: new Set(entries.map((entry) => entry.visualMechanism)).size,
    uniquePresentationMechanisms: new Set(entries.map((entry) => entry.presentationMechanism)).size,
    uniqueDepictedActionFamilies: new Set(entries.map((entry) => entry.depictedActionFamily)).size,
    uniqueCompositionFamilies: new Set(entries.map((entry) => entry.compositionFamily)).size,
    uniqueActionFamilies: new Set(entries.map((entry) => entry.depictedActionFamily)).size,
  };
}

export function analyzeVeronicaSequenceDiversity(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "format" | "scenes">;
  readonly beats: readonly VisualBeatTreatmentV1[];
  readonly remediation?: VeronicaSequenceDiversityResult["remediation"];
}): VeronicaSequenceDiversityResult {
  const policy = resolveVeronicaSequenceDiversityPolicy(input.plan.format);
  const signatures = input.beats.map((beat) => buildVeronicaVisualTreatmentSignature({ plan: input.plan, beat }));
  const findings: VeronicaSequenceDiversityFinding[] = [];
  const starts = beatStarts(input.plan, input.beats);
  for (let index = 1; index < signatures.length; index += 1) {
    const previous = signatures[index - 1]!;
    const current = signatures[index]!;
    const repeated = comparisonDimensions.filter((dimension) => previous[dimension] === current[dimension]);
    const sameDepictedAction = previous.depictedActionFamily === current.depictedActionFamily;
    const sameInformationRelation = previous.informationRole === current.informationRole && previous.semanticState === current.semanticState;
    const openingSensitive = (starts.get(current.beatId) ?? Number.POSITIVE_INFINITY) < 15_000;
    const materiallyEquivalent = repeated.length >= policy.adjacentMatchingDimensionThreshold
      || (sameDepictedAction && (openingSensitive || sameInformationRelation));
    if (!materiallyEquivalent) continue;
    const repeatedDimensions = sameDepictedAction && !repeated.includes("depictedActionFamily")
      ? [...repeated, "depictedActionFamily" as const]
      : repeated;
    findings.push(finding({
      code: "ADJACENT_VISUAL_DUPLICATION",
      severity: "blocker",
      beatIds: [previous.beatId, current.beatId],
      window: "adjacent",
      repeatedDimensions: repeatedDimensions.map(String),
      observed: repeatedDimensions.length,
      threshold: policy.adjacentMatchingDimensionThreshold,
      evidence: sameDepictedAction
        ? `depictedActionFamily=${current.depictedActionFamily}; adjacent${openingSensitive ? " opening" : ""} beats preserve the same viewer-visible action despite presentation changes`
        : `${repeatedDimensions.map(String).join(",")} observed ${repeatedDimensions.length}; threshold ${policy.adjacentMatchingDimensionThreshold}`,
      remediationEligible: true,
    }));
    if (sameDepictedAction && sameInformationRelation && previous.sourcePropositionHash !== current.sourcePropositionHash) findings.push(finding({
      code: "LOW_INFORMATION_GAIN",
      severity: "review-required",
      beatIds: [previous.beatId, current.beatId],
      window: "adjacent",
      repeatedDimensions: ["depictedActionFamily", "informationRole", "semanticState"],
      observed: 3,
      threshold: 3,
      evidence: `depictedActionFamily=${current.depictedActionFamily}; a new source span repeats the same depicted action, information role, and semantic relation`,
      remediationEligible: true,
    }));
  }
  const windows = [
    ["TREATMENT_FAMILY_REPETITION", "treatmentFamily"],
    ["ENVIRONMENT_MONOTONY", "environmentFamily"],
    ["ACTION_MONOTONY", "depictedActionFamily"],
    ["COMPOSITION_MONOTONY", "compositionFamily"],
    ["MECHANISM_REPETITION", "visualMechanism"],
    ["PRESENTATION_MECHANISM_REPETITION", "presentationMechanism"],
  ] as const;
  for (const [code, dimension] of windows) {
    addWindowFinding({ findings, signatures, code, dimension, size: 3, threshold: policy.threeBeatDominantShare });
    addWindowFinding({ findings, signatures, code, dimension, size: 5, threshold: policy.fiveBeatDominantShare });
  }
  const opening = {
    "5": openingMetrics(signatures, starts, 5),
    "10": openingMetrics(signatures, starts, 10),
    "15": openingMetrics(signatures, starts, 15),
  };
  for (const seconds of [5, 10, 15] as const) {
    const current = opening[String(seconds) as "5" | "10" | "15"];
    const threshold = Math.min(current.beatCount, policy.openingMinimumMechanisms[String(seconds) as "5" | "10" | "15"]);
    if (current.uniqueTreatmentMechanisms < threshold) findings.push(finding({
      code: "OPENING_NOVELTY_LOW",
      severity: "review-required",
      beatIds: signatures.filter((signature) => (starts.get(signature.beatId) ?? Infinity) < seconds * 1_000).map((signature) => signature.beatId),
      window: `opening-${seconds}s`,
      repeatedDimensions: ["visualMechanism"],
      observed: current.uniqueTreatmentMechanisms,
      threshold,
      remediationEligible: true,
    }));
    const actionThreshold = Math.min(current.beatCount, policy.openingMinimumDepictedActions[String(seconds) as "5" | "10" | "15"]);
    if (current.uniqueDepictedActionFamilies < actionThreshold) findings.push(finding({
      code: "OPENING_ACTION_NOVELTY_LOW",
      severity: "review-required",
      beatIds: signatures.filter((signature) => (starts.get(signature.beatId) ?? Infinity) < seconds * 1_000).map((signature) => signature.beatId),
      window: `opening-${seconds}s`,
      repeatedDimensions: ["depictedActionFamily"],
      observed: current.uniqueDepictedActionFamilies,
      threshold: actionThreshold,
      evidence: `opening ${seconds}s contains ${current.uniqueDepictedActionFamilies} depicted action families across ${current.beatCount} beats; threshold ${actionThreshold}`,
      remediationEligible: true,
    }));
  }
  const wholeEpisodeActionShare = dominantShare(signatures.map((entry) => entry.depictedActionFamily));
  if (signatures.length >= 5 && wholeEpisodeActionShare >= policy.wholeEpisodeReviewShare) findings.push(finding({
    code: "ACTION_MONOTONY",
    severity: "warning",
    beatIds: signatures.map((entry) => entry.beatId),
    window: "whole-episode",
    repeatedDimensions: ["depictedActionFamily"],
    observed: wholeEpisodeActionShare,
    threshold: policy.wholeEpisodeReviewShare,
    evidence: `whole-episode depicted-action dominant share ${wholeEpisodeActionShare}; threshold ${policy.wholeEpisodeReviewShare}`,
    remediationEligible: false,
  }));
  const metrics = {
    adjacentDuplicateCount: findings.filter((entry) => entry.code === "ADJACENT_VISUAL_DUPLICATION").length,
    treatmentFamilyDominantShare: dominantShare(signatures.map((entry) => entry.treatmentFamily)),
    environmentDominantShare: dominantShare(signatures.map((entry) => entry.environmentFamily)),
    actionDominantShare: dominantShare(signatures.map((entry) => entry.depictedActionFamily)),
    depictedActionDominantShare: dominantShare(signatures.map((entry) => entry.depictedActionFamily)),
    presentationMechanismDominantShare: dominantShare(signatures.map((entry) => entry.presentationMechanism)),
    compositionDominantShare: dominantShare(signatures.map((entry) => entry.compositionFamily)),
    mechanismDominantShare: dominantShare(signatures.map((entry) => entry.visualMechanism)),
    lowInformationGainCount: findings.filter((entry) => entry.code === "LOW_INFORMATION_GAIN").length,
    opening,
  };
  const remediation = input.remediation ?? { passes: 0, changedBeatIds: [], exhausted: false };
  const status: VeronicaSequenceDiversityResult["status"] = !policy.enabled || findings.length === 0
    ? "PASS"
    : findings.some((entry) => entry.severity === "blocker")
      ? "BLOCK"
      : findings.some((entry) => entry.severity === "review-required")
        ? "REVIEW_REQUIRED"
        : "WARN";
  const base = { schemaVersion: "veronica-sequence-diversity.v2" as const, policyVersion: VERONICA_SEQUENCE_DIVERSITY_POLICY_VERSION, status, signatures, findings, metrics, remediation };
  return { ...base, resultHash: stableHash(base) };
}

const PRESENTATION_VARIANTS = [
  {
    id: "depth-evidence",
    environment: "neutral evidence field with background context and one foreground evidence zone",
    composition: "foreground evidence carries the result while supporting quantities recede in depth",
    camera: "documentary three-quarter view with foreground evidence and background context legible together",
    actionLead: "foreground evidence staging makes the distinction visible while",
  },
  {
    id: "diagnostic-focus",
    environment: "neutral diagnostic inspection surface with one isolated evidence cluster",
    composition: "one isolated evidence cluster occupies a dedicated inspection zone; contextual quantities occupy a separate supporting zone",
    camera: "slight high-angle evidence view with one isolated focal action",
    actionLead: "isolated diagnostic inspection frames the action while",
  },
  {
    id: "modular-system",
    environment: "neutral modular flow system with separate input, process, and result zones",
    composition: "a modular system view separates input, process, and result without a panel grid",
    camera: "wide three-quarter system view with the complete causal relation legible",
    actionLead: "a modular system view exposes the relationship while",
  },
  {
    id: "process-path",
    environment: "neutral linear process lane with distinct evidence stations",
    composition: "a diagonal process path leads from the initiating evidence to one visible result",
    camera: "oblique documentary view following one evidence path across the frame",
    actionLead: "diagonal process progression makes each step visible while",
  },
] as const;

interface SourceCompatibleDepictedActionCandidate {
  readonly family: VeronicaDepictedActionFamily;
  readonly action: string;
}

function sourceCompatibleDepictedActionCandidates(
  beat: VisualBeatTreatmentV1,
  sourceNarration: string,
): readonly VisualBeatTreatmentV1[] {
  const evidence = sourceNarration.slice(beat.narrationRef.startOffset, beat.narrationRef.endOffset);
  const meaning = `${evidence} ${beat.coreMeaning} ${beat.newInformation} ${beat.viewerShouldUnderstand} ${beat.visualThesis} ${beat.state}`;
  const candidates: SourceCompatibleDepictedActionCandidate[] = [];
  const add = (family: VeronicaDepictedActionFamily, action: string): void => {
    if (family === deriveVeronicaDepictedActionFamily(beat) || candidates.some((candidate) => candidate.family === family)) return;
    candidates.push({ family, action });
  };
  const protectedEconomicFlow = /\bbefore\s+(?:chasing|pursuing|increasing)\b.{0,80}\b(?:revenue|sales?|volume|growth)\b.{0,180}\b(?:understand|examine|calculate)\b.{0,120}\b(?:economically|unit economics?)\b.{0,120}\b(?:each|every)\b.{0,80}\b(?:sale|sell)\b/iu.test(meaning);
  if (/\b(?:revenue|payment|income|sales?)\b.{0,180}\b(?:weak business|thin margin|small margin|little margin|almost no margin)\b/iu.test(meaning)) {
    add("retained-value-reveal", "the operator reveals the small retained result beside the larger incoming amount after source-supported outgoings leave the visible remainder");
  }
  if (/\b(?:and still|but still|yet|despite|even though|while|contrast|not enough|insufficient|falls? short)\b/iu.test(meaning)
    && /\b(?:indicator|measure|amount|value|result|evidence|remainder)\b/iu.test(meaning)) {
    add("contrast-reveal", "the operator reveals one prominent indicator while the complete depicted condition remains visibly in the contrasting state");
  }
  if (/\b(?:show|reveal|surface|make visible|visible proof|evidence|demonstrat)\w*\b/iu.test(meaning)) {
    add("evidence-reveal", "the operator reveals the source-supported evidence as the visible result");
  }
  const deductionContext = /\b(?:subtract|production|payment fees?|commissions?|shipping|support|refunds?|variable costs?|cost stations?)\b/iu.test(meaning);
  if (!deductionContext && /\b(?:one more|additional|incremental|marginal|extra)\b[^.]{0,100}\b(?:sale|unit|contribution|input)\b/iu.test(meaning)) {
    add("incremental-contribution", "the operator adds one additional depicted unit to the running system and isolates its contribution");
  }
  if (/\b(?:not the same|versus|compared with|difference between|distinct measures?|more than|less than)\b/iu.test(meaning)) {
    add("comparison", "the operator places the two depicted measures side by side as separate intact quantities");
  }
  if (/\b(?:goes? (?:straight )?(?:back )?out|passes? out|flows? out)\b[^.]{0,120}\b(?:produce|ship|support|sustain|fulfil|deliver)\w*/iu.test(meaning)) {
    add("transfer", "the operator transfers the depicted payment from intake to the source-supported work it funds");
  }
  if (/\b(?:subtract|goes? (?:straight )?(?:back )?out|outgoing|costs?|fees?|commissions?|remainder|residual)\b/iu.test(meaning)) {
    add("decomposition", "the operator routes one depicted input into its outgoing components and the resulting retained remainder");
  }
  if (/\b(?:what remains|leaves? behind|retained|remainder|residual)\b/iu.test(meaning)) {
    add("retained-value-reveal", "the retained result emerges from the completed depicted transaction as the visible remainder");
  }
  if (/\b(?:take|select|isolate|pull)\b[^.]{0,100}\b(?:one|single|from|out of)\b/iu.test(meaning)) {
    add("selection", "the operator selects one depicted unit from the larger stream and holds it apart for analysis");
  }
  if (!protectedEconomicFlow && /\b(?:inspect|analy[sz]e|calculate|check|look at|understand)\b/iu.test(meaning)) {
    add("inspection", "the operator examines one already-selected depicted unit as a single intact item");
  }
  if (/\b(?:double|scale|more orders?|increase volume|larger volume|volume grows?|growth)\b/iu.test(meaning)) {
    if (/\b(?:workload|work|burden|effort)\b/iu.test(meaning)) {
      add("workload-growth", "the operator increases the depicted volume while the corresponding workload visibly grows");
    }
    add("scaling", "the operator increases the depicted volume through the same operating system so the resulting change becomes visible");
  }
  if (/\b(?:flow|moves? through|passes? through|enters?|start to finish)\b/iu.test(meaning)) {
    add("flow", "the operator moves one depicted unit through the existing process from entry to result");
  }
  return candidates.flatMap((candidate) => {
    const base = { ...beat, action: candidate.action };
    const { beatHash: _beatHash, ...hashInput } = base;
    const materialized = { ...base, beatHash: stableHash(hashInput) };
    return deriveVeronicaDepictedActionFamily(materialized) === candidate.family ? [materialized] : [];
  });
}

function withVariant(beat: VisualBeatTreatmentV1, variant: typeof PRESENTATION_VARIANTS[number]): VisualBeatTreatmentV1 {
  const base = {
    ...beat,
    action: `${variant.actionLead} ${beat.action}`,
    environment: variant.environment,
    composition: {
      ...beat.composition,
      description: variant.composition,
      camera: variant.camera,
    },
  };
  const { beatHash: _beatHash, ...hashInput } = base;
  return { ...base, beatHash: stableHash(hashInput) };
}

function candidateNovelty(
  plan: Pick<PositioningVisualPlanV2, "scenes">,
  candidate: VisualBeatTreatmentV1,
  previous: readonly VisualBeatTreatmentV1[],
): number {
  const signature = buildVeronicaVisualTreatmentSignature({ plan, beat: candidate });
  return previous.slice(-5).reduce((score, beat) => {
    const prior = buildVeronicaVisualTreatmentSignature({ plan, beat });
    return score + comparisonDimensions.filter((dimension) => signature[dimension] !== prior[dimension]).length;
  }, 0);
}

function diversityPenalty(result: VeronicaSequenceDiversityResult): readonly number[] {
  const count = (severity: VeronicaSequenceDiversityFinding["severity"]): number =>
    result.findings.filter((finding) => finding.severity === severity).length;
  return [
    count("blocker"),
    count("review-required"),
    count("warning"),
    result.metrics.adjacentDuplicateCount,
    result.metrics.lowInformationGainCount,
    Math.round((result.metrics.depictedActionDominantShare
      + result.metrics.presentationMechanismDominantShare
      + result.metrics.compositionDominantShare
      + result.metrics.mechanismDominantShare) * 10_000),
  ];
}

function comparePenalty(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Diversity is presentation grammar, never semantic evidence. Refinement is
 * bounded and may only restage an already-grounded action; source spans,
 * proposition fields, actor roles, semantic states, timing and beat IDs stay
 * immutable. Source compatibility therefore always outranks novelty.
 */
export function diversifyVeronicaVisualBeatSequence(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "format" | "scenes">;
  readonly beats: readonly VisualBeatTreatmentV1[];
}): { readonly beats: readonly VisualBeatTreatmentV1[]; readonly analysis: VeronicaSequenceDiversityResult } {
  const policy = resolveVeronicaSequenceDiversityPolicy(input.plan.format);
  let beats = [...input.beats];
  let analysis = analyzeVeronicaSequenceDiversity({ plan: input.plan, beats });
  if (!policy.enabled || analysis.status === "PASS") return { beats, analysis };
  const changed = new Set<string>();
  const visited = new Set([stableHash(beats.map((beat) => beat.beatHash))]);
  let passes = 0;
  while (passes < policy.maximumRefinementPasses && analysis.status !== "PASS") {
    passes += 1;
    const targetIds = new Set(analysis.findings
      .filter((finding) => finding.remediationEligible)
      .flatMap((finding) => finding.beatIds));
    let passChanged = false;
    for (let index = 0; index < beats.length; index += 1) {
      const beat = beats[index]!;
      if (!targetIds.has(beat.beatId)) continue;
      const sourceNarration = input.plan.scenes.find((scene) => scene.sceneId === beat.sceneId)?.narrationAnchor ?? "";
      // A workload consequence is grounded in one accumulating burden. A
      // decision checkpoint and healthy scaling comparison likewise carry
      // source-critical relationships. Preserve those grammars rather than
      // trading them for generic action or presentation novelty.
      const protectedEconomicGrammar = /\b(?:workload|backlog|bottleneck|burden|operational strain|decision checkpoint|controlled capacity|retained contribution)\b/iu.test(`${sourceNarration} ${beat.action} ${beat.state}`)
        || (/\b(?:economics?|unit economics?)\s+(?:still\s+)?work\b/iu.test(sourceNarration)
          && /\b(?:volume|sales?|orders?)\s+(?:grow(?:s|ing)?|increase(?:s|d|ing)?|scale(?:s|d|ing)?)\b/iu.test(sourceNarration));
      const actionBases = protectedEconomicGrammar
        ? [beat]
        : [beat, ...sourceCompatibleDepictedActionCandidates(beat, sourceNarration)];
      const presentationVariants = protectedEconomicGrammar
        ? []
        : PRESENTATION_VARIANTS;
      const candidates = actionBases.flatMap((base) => [
        base,
        ...presentationVariants.map((variant) => withVariant(base, variant)),
      ]);
      const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.beatHash, candidate])).values()];
      const currentPenalty = diversityPenalty(analysis);
      const ranked = uniqueCandidates.map((candidate) => {
        const proposed = beats.map((current, currentIndex) => currentIndex === index ? candidate : current);
        const candidateAnalysis = analyzeVeronicaSequenceDiversity({ plan: input.plan, beats: proposed });
        return {
          candidate,
          analysis: candidateAnalysis,
          penalty: diversityPenalty(candidateAnalysis),
          novelty: candidateNovelty(input.plan, candidate, beats.slice(0, index)),
        };
      }).sort((left, right) => comparePenalty(left.penalty, right.penalty)
        || right.novelty - left.novelty
        || left.candidate.beatHash.localeCompare(right.candidate.beatHash));
      const selected = ranked[0];
      if (!selected || comparePenalty(selected.penalty, currentPenalty) >= 0) continue;
      beats[index] = selected.candidate;
      analysis = selected.analysis;
      changed.add(beat.beatId);
      passChanged = true;
    }
    const revision = stableHash(beats.map((beat) => beat.beatHash));
    if (!passChanged || visited.has(revision)) break;
    visited.add(revision);
    analysis = analyzeVeronicaSequenceDiversity({
      plan: input.plan,
      beats,
      remediation: { passes, changedBeatIds: [...changed], exhausted: false },
    });
  }
  const exhausted = analysis.status !== "PASS";
  analysis = analyzeVeronicaSequenceDiversity({
    plan: input.plan,
    beats,
    remediation: { passes, changedBeatIds: [...changed], exhausted },
  });
  return { beats, analysis };
}
