import type {
  PositioningVisualPlanV2,
  VisualBeatTreatmentV1,
  VeronicaSequenceDiversityFinding,
  VeronicaSequenceDiversityFindingCode,
  VeronicaSequenceDiversityResult,
  VeronicaDepictedActionFamily,
  VeronicaPresentationMechanism,
  VeronicaVisualTreatmentSignature,
  VeronicaDerivedBeatCandidate,
  VeronicaCandidateSelectionDiagnostics,
  VeronicaNoSafeCandidateDiagnostic,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import { assessVeronicaRemovalConsequenceEvidence } from "./veronica-causal-evidence.js";

export const VERONICA_SEQUENCE_DIVERSITY_POLICY_VERSION =
  "veronica-sequence-diversity-policy.v3" as const;
export const VERONICA_BEAT_CANDIDATE_SCORER_VERSION =
  "veronica-beat-candidate-scorer.v1" as const;
export const VERONICA_MAX_CANDIDATES_PER_BEAT = 6 as const;
export const VERONICA_CANDIDATE_BEAM_WIDTH = 4 as const;
export const VERONICA_CANDIDATE_ROLLING_WINDOW = 5 as const;

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
  if (/\bretained result\b[^.]{0,80}\bemerge\w*/iu.test(action)) return "retained-value-reveal";
  if (/\b(?:compar\w*|versus|beside|side.by.side|separate measures?|two measures?|conflicting signals?|different needs?|different priorities?)\b/iu.test(action)) return "comparison";
  if (/\b(?:subtract|split|break|drain|remove|peel|cost station|outgoing portion|remainder)\w*|\bseparat\w*\b[^.]{0,100}\b(?:into|outgoing|portions?|remainder)\b/iu.test(action)) return "decomposition";
  if (/\b(?:select|pull|extract|isolate)\w*\b[^.]{0,100}\b(?:from|out of|stream|many|larger|several)\b|\b(?:stop|pause)\w*\s+at\s+(?:one|the|a)\s+(?:specific|matching)\b/iu.test(action)) return "selection";
  if (/\b(?:sort|classif|group|arrang|gather|cluster|organi[sz])\w*/iu.test(action)) return "sorting";
  if (/\b(?:allocat|assign|distribut)\w*/iu.test(action)) return "allocation";
  if (/\b(?:convert|transform|turns? into)\w*/iu.test(action)) return "conversion";
  if (/\b(?:transfer|hand|give)\w*\b[^.;]{0,100}\b(?:to|between|across)\b|\bpass\w*\s+(?:an?|the|one|this|that)\s+[^.;]{1,60}\s+to\b|\bplac\w*\b[^.;]{0,100}\binto\b/iu.test(action)) return "transfer";
  if (/\b(?:apply|use|implement|deploy)\w*\b[^.]{0,100}\b(?:framework|method|tool|process|system|knowledge)\b/iu.test(action)) return "application";
  if (/\b(?:inspect|check|diagnos|examin|analy[sz]|calculate|scan)\w*/iu.test(action)) return "inspection";
  if (/\b(?:scale|double|expand|increase|grow|larger|volume)\w*/iu.test(action)) return "scaling";
  if (/\b(?:accumulat|collect|stack|build up)\w*/iu.test(action)) return "accumulation";
  if (/\b(?:reveal|show|surface|make visible)\w*\b[^.]{0,100}\b(?:proof|evidence|result|demonstration)\b|\b(?:proof|evidence)\b[^.]{0,100}\b(?:appear|become visible|emerge)\w*|\b(?:recognize|recall|remember|point)\w*\b[^.;]{0,100}\b(?:association|cue|detail|fit|situation|expertise)\b/iu.test(action)) return "evidence-reveal";
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
  if (/\b(?:decision fork|two-branch|baseline .* doubled|doubled .* baseline)\b/iu.test(presentation)) return "decision-fork";
  if (/\b(?:rule-setting|growth rule|decision criterion)\b/iu.test(presentation)) return "rule-setting";
  if (/\b(?:backlog|bottleneck|choke point)\b/iu.test(presentation)) return "workload-bottleneck";
  if (/\b(?:handoff|customer payment|payment beside|sale-and-fulfillment)\b/iu.test(presentation)) return "handoff-chain";
  if (/\b(?:equal visual depth|directly beside|side.by.side|comparison bench)\b/iu.test(presentation)) return "comparison-layout";
  if (/\b(?:intake gate|intake threshold|unopened gate)\b/iu.test(presentation)) return "intake-threshold";
  if (/\b(?:calculation path|direct outflows|resolves? in .* remainder)\b/iu.test(presentation)) return "calculation-path";
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
    const repeated = comparisonDimensions.filter((dimension) =>
      previous[dimension] === current[dimension]
      && !(dimension === "depictedActionFamily" && current.depictedActionFamily === "other"));
    // "other" is an explicit lack of classification, not evidence that two
    // viewer-visible actions are equivalent. It may contribute to aggregate
    // monotony diagnostics, but cannot by itself trigger the adjacent-action
    // shortcut or its low-information corollary.
    const sameDepictedAction = previous.depictedActionFamily !== "other"
      && previous.depictedActionFamily === current.depictedActionFamily;
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
    // Multiple short beats may deliberately segment one source proposition.
    // They need distinct viewer-visible actions, but cannot truthfully claim
    // distinct semantic mechanisms when the parent proposition is the same.
    const threshold = Math.min(
      current.beatCount,
      current.uniqueSourcePropositions,
      policy.openingMinimumMechanisms[String(seconds) as "5" | "10" | "15"],
    );
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
  // A source may establish the misleading incoming total before it names the
  // outgoings that explain it. That is still a complete, source-grounded
  // contrast: retain the incoming amount and make the small retained result
  // visible. Do not invent a cost breakdown until the narration supplies one.
  const largeIncoming = /\b(?:large|high|impressive|strong|big)\b.{0,40}\b(?:revenue|payment|income|sales?)\b|\b(?:revenue|payment|income|sales?)\b.{0,40}\b(?:large|high|impressive|strong|big)\b/iu.test(meaning);
  const smallRetained = /\b(?:small|thin|low|little|weak)\b.{0,40}\b(?:retained|margin|remainder|profit)\b|\b(?:retained|margin|remainder|profit)\b.{0,40}\b(?:small|thin|low|little|weak)\b/iu.test(meaning);
  if (largeIncoming && smallRetained) {
    add("retained-value-reveal", "the business operator reveals the retained result beside the larger source-supported incoming amount, making the small remainder visible");
  }
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
    add("retained-value-reveal", "the business operator reveals the retained result from the completed depicted transaction as the visible remainder");
  }
  if (/\b(?:take|select|isolate|pull)\b[^.]{0,100}\b(?:one|single|from|out of)\b/iu.test(meaning)) {
    add("selection", "the operator selects one depicted unit from the larger stream and holds it apart for analysis");
  }
  if (/\b(?:which|what)\s+(?:part|piece|aspect)\b[^.]{0,100}\bremember\s+first\b|\bone\s+(?:expertise|message|offer)\s+cue\b/iu.test(meaning)) {
    add("selection", "the observer selects one source-supported expertise cue from several visible possibilities and holds it apart as the first remembered association");
  }
  if (/\bdifferent\s+(?:customers?|people|buyers?)\b[^.]{0,140}\b(?:needs?|fears?|priorities|reasons?)\b/iu.test(meaning)) {
    add("sorting", "the operator arranges the distinct source-supported customer needs and priorities into visibly separate groups");
  }
  if (/\b(?:decide|determine|judge)\b[^.]{0,100}\b(?:applies?|relevant|fit)\b|\bconflicting\s+(?:message\s+)?signals?\b/iu.test(meaning)) {
    add("comparison", "the customer compares the depicted message cues with their own need and finds no clear source-supported fit");
  }
  if (/\b(?:recognize|remember|recall)\w*\b[^.]{0,120}\b(?:this is for me|association|expertise|reason|relevant|fit)\b|\bsimple reason to remember\b/iu.test(meaning)) {
    add("evidence-reveal", "the intended person recognizes one specific source-supported cue and reveals the matching association through their visible response");
  }
  if (/\b(?:not (?:a )?restriction|nobody outside|outside the niche|doorway,? not a wall|routes? remain open)\b/iu.test(meaning)) {
    add("flow", "the intended person follows the specific route while the wider source-supported routes remain visibly open");
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
    composition: {
      ...beat.composition,
      description: variant.composition,
      camera: variant.camera,
    },
  };
  const { beatHash: _beatHash, ...hashInput } = base;
  return { ...base, beatHash: stableHash(hashInput) };
}

function withAction(beat: VisualBeatTreatmentV1, action: string): VisualBeatTreatmentV1 {
  const base = { ...beat, action };
  const { beatHash: _beatHash, ...hashInput } = base;
  return { ...base, beatHash: stableHash(hashInput) };
}

function structuredSemanticActionCandidates(
  scene: PositioningVisualPlanV2["scenes"][number] | undefined,
  beat: VisualBeatTreatmentV1,
): readonly VisualBeatTreatmentV1[] {
  const proposition = scene?.semanticProposition;
  if (!proposition) return [];
  const owner = proposition.actorRole === "buyer"
    ? "the buyer"
    : proposition.actorRole === "business-operator"
      ? "the business operator"
      : proposition.actorRole === "shared"
        ? "the expert and buyer"
        : "the expert";
  const actions: string[] = [];
  if (proposition.stateRelation === "CONTRAST" || proposition.stateRelation === "CONDITIONAL_ALTERNATIVES") {
    actions.push(`${owner} compares the two source-supported states side by side as distinct visible conditions`);
  }
  if (proposition.stateRelation === "CAUSAL_BEFORE_AFTER") {
    actions.push(`${owner} changes the source-supported condition from its initial state to its consequence in one decisive transition`);
  }
  if (proposition.stateRelation === "SEQUENTIAL_PROGRESSION") {
    actions.push(`${owner} moves the source-supported evidence through the existing causal path to its consequence`);
  }
  if (["CHOOSES", "CATEGORIZES", "REJECTS", "HESITATES"].includes(proposition.buyerConsequenceFamily)) {
    actions.push(`the buyer selects one source-supported option from the visible alternatives and holds it apart for the decision`);
  }
  if (["RECOGNIZES", "REMEMBERS", "NOTICES", "UNDERSTANDS", "CONNECTS", "TRUSTS", "REFERS"].includes(proposition.buyerConsequenceFamily)) {
    actions.push(`the buyer reveals recognition of one source-supported evidence cue as the visible result`);
  }
  const mechanism = proposition.visualMechanism;
  if (/comparison|contrast|categor/iu.test(mechanism)) actions.push(`${owner} compares the source-supported quantities as separate intact measures side by side`);
  if (/retained|remainder|margin/iu.test(mechanism)) actions.push(`${owner} reveals the retained result beside the larger source-supported incoming amount as the visible remainder`);
  if (/flow|chain|path|sequence|input-output/iu.test(mechanism)) actions.push(`${owner} moves one source-supported unit through the visible process from input to result`);
  if (/proof|evidence|recognition|signal/iu.test(mechanism)) actions.push(`${owner} reveals the source-supported evidence cue as the visible result`);
  const byFamily = new Map<VeronicaDepictedActionFamily, VisualBeatTreatmentV1>();
  for (const action of actions) {
    const candidate = withAction(beat, action);
    const family = deriveVeronicaDepictedActionFamily(candidate);
    if (family !== "other" && family !== deriveVeronicaDepictedActionFamily(beat) && !byFamily.has(family)) byFamily.set(family, candidate);
  }
  return [...byFamily.values()];
}

function candidateInformationDelta(
  candidate: VisualBeatTreatmentV1,
  previous: VisualBeatTreatmentV1 | undefined,
): VeronicaDerivedBeatCandidate["visibleInformationDelta"] {
  const categories: VeronicaDerivedBeatCandidate["visibleInformationDelta"]["categories"][number][] = [];
  if (!previous || candidate.narrationRef.spanHash !== previous.narrationRef.spanHash) categories.push("source-span");
  if (!previous || candidate.parentSemanticRevisionHash !== previous.parentSemanticRevisionHash) categories.push("proposition");
  if (!previous || normalized(candidate.state) !== normalized(previous.state)) categories.push("state");
  if (!previous || stableHash(candidate.actorRelation ?? null) !== stableHash(previous.actorRelation ?? null)) categories.push("causal-relation");
  if (!previous
    || deriveVeronicaDepictedActionFamily(candidate) !== deriveVeronicaDepictedActionFamily(previous)
    || normalized(candidate.newInformation) !== normalized(previous.newInformation)) categories.push("visible-evidence");
  return { score: categories.length, categories };
}

function candidateHardGate(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "format" | "scenes">;
  readonly baseBeat: VisualBeatTreatmentV1;
  readonly candidate: VisualBeatTreatmentV1;
}): VeronicaDerivedBeatCandidate["hardGate"] {
  const scene = input.plan.scenes.find((entry) => entry.sceneId === input.candidate.sceneId);
  const findingCodes: VeronicaDerivedBeatCandidate["hardGate"]["findingCodes"][number][] = [];
  const ref = input.candidate.narrationRef;
  const finalizedSemanticParent = scene?.semanticProposition?.semanticRevisionHash;
  if (!scene || ref.semanticSceneId !== input.candidate.sceneId
    || (finalizedSemanticParent && (ref.startOffset < 0 || ref.endOffset > scene.narrationAnchor.length
      || ref.endOffset <= ref.startOffset || !scene.narrationAnchor.slice(ref.startOffset, ref.endOffset).trim()))) findingCodes.push("SOURCE_GROUNDING_FAILED");
  if (!scene || (scene.treatment.treatmentHash && input.candidate.parentTreatmentHash !== scene.treatment.treatmentHash)
    || (finalizedSemanticParent && input.candidate.parentSemanticRevisionHash !== finalizedSemanticParent)) findingCodes.push("SEMANTIC_PARENT_MISMATCH");
  if (normalized(input.candidate.state) !== normalized(input.baseBeat.state)) findingCodes.push("STATE_FIDELITY_FAILED");
  if (normalized(input.candidate.environment) !== normalized(input.baseBeat.environment)) findingCodes.push("ENVIRONMENT_AUTHORIZATION_FAILED");
  const owner = scene?.semanticProposition?.actorRole ?? scene?.treatment.actionOwnerRole ?? "none";
  const changedAction = normalized(input.candidate.action) !== normalized(input.baseBeat.action);
  const action = input.candidate.action;
  if (changedAction && owner === "buyer" && !/\b(?:buyer|customer|client|person|visitor|observer|audience|intended person)\b/iu.test(action)) findingCodes.push("ACTOR_AUTHORIZATION_FAILED");
  if (changedAction && owner === "business-operator" && !/\b(?:business operator|operator|owner|seller)\b/iu.test(action)) findingCodes.push("ACTOR_AUTHORIZATION_FAILED");
  if (changedAction && owner === "expert" && !/\b(?:expert|professional|consultant)\b/iu.test(action)) findingCodes.push("ACTOR_AUTHORIZATION_FAILED");
  if (changedAction && owner === "shared" && !/\b(?:expert|professional)\b/iu.test(action)) findingCodes.push("ACTOR_AUTHORIZATION_FAILED");
  const causal = assessVeronicaRemovalConsequenceEvidence(
    input.candidate,
    scene?.semanticProposition?.stateRelation,
  );
  if (!causal.passes) findingCodes.push("CAUSAL_EVIDENCE_INCOMPLETE");
  if (input.plan.format === "short"
    && scene?.semanticProposition?.visualMechanism === "UNRESOLVED"
    && deriveVeronicaDepictedActionFamily(input.candidate) === "other") findingCodes.push("UNRESOLVED_REQUIRED_MECHANISM");
  return { eligible: findingCodes.length === 0, findingCodes: [...new Set(findingCodes)] };
}

function evidenceCategory(family: VeronicaDepictedActionFamily, causal: ReturnType<typeof assessVeronicaRemovalConsequenceEvidence>): string {
  if (causal.applies) return "causal-removal-enablement";
  if (["comparison", "contrast-reveal", "retained-value-reveal"].includes(family)) return "state-comparison";
  if (["decomposition", "flow", "transfer", "scaling", "workload-growth"].includes(family)) return "mechanism-process";
  if (["evidence-reveal", "inspection", "selection"].includes(family)) return "visible-evidence";
  return "source-proposition";
}

function materializeCandidate(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "format" | "scenes">;
  readonly baseBeat: VisualBeatTreatmentV1;
  readonly beat: VisualBeatTreatmentV1;
  readonly previousBeat?: VisualBeatTreatmentV1;
  readonly operatorId: string;
}): VeronicaDerivedBeatCandidate {
  const scene = input.plan.scenes.find((entry) => entry.sceneId === input.beat.sceneId);
  const signature = buildVeronicaVisualTreatmentSignature({ plan: input.plan, beat: input.beat });
  const causal = assessVeronicaRemovalConsequenceEvidence(
    input.beat,
    scene?.semanticProposition?.stateRelation,
  );
  const actionFamily = signature.depictedActionFamily;
  const semanticParentIdentity = input.beat.parentSemanticRevisionHash;
  const candidateId = stableHash({
    semanticParentIdentity,
    beatId: input.beat.beatId,
    sourceSpan: input.beat.narrationRef.spanHash,
    operatorId: input.operatorId,
    treatmentHash: input.beat.parentTreatmentHash,
    beatHash: input.beat.beatHash,
    scorerVersion: VERONICA_BEAT_CANDIDATE_SCORER_VERSION,
  });
  return {
    candidateId,
    operatorId: input.operatorId,
    beat: input.beat,
    sourceReference: input.beat.narrationRef,
    actionFamily,
    mechanism: signature.visualMechanism,
    environmentFamily: signature.environmentFamily,
    compositionFamily: signature.compositionFamily,
    evidenceCategory: evidenceCategory(actionFamily, causal),
    actorRoles: scene?.treatment.actors?.map((actor) => actor.role) ?? [scene?.semanticProposition?.actorRole ?? "none"],
    stateRelation: scene?.semanticProposition?.stateRelation ?? "STABLE",
    visibleInformationDelta: candidateInformationDelta(input.beat, input.previousBeat),
    causalCompleteness: causal.passes,
    openingSuitability: (actionFamily === "other" ? 0 : 1)
      + (causal.passes ? 1 : 0)
      + (input.beat.newInformation.trim() ? 1 : 0)
      + (/^(?:source|semantic)-action:/u.test(input.operatorId) ? 1 : 0),
    hardGate: candidateHardGate({ plan: input.plan, baseBeat: input.baseBeat, candidate: input.beat }),
    treatmentReference: input.beat.parentTreatmentHash,
    semanticParentIdentity,
  };
}

export function generateVeronicaDerivedBeatCandidates(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "format" | "scenes">;
  readonly beat: VisualBeatTreatmentV1;
  readonly previousBeat?: VisualBeatTreatmentV1;
  readonly locked?: boolean;
}): readonly VeronicaDerivedBeatCandidate[] {
  const scene = input.plan.scenes.find((entry) => entry.sceneId === input.beat.sceneId);
  const sourceNarration = scene?.narrationAnchor ?? "";
  const actionCandidates = input.locked ? [] : sourceCompatibleDepictedActionCandidates(input.beat, sourceNarration);
  const structuredCandidates = input.locked ? [] : structuredSemanticActionCandidates(scene, input.beat);
  const presentationCandidates = input.locked ? [] : PRESENTATION_VARIANTS.map((variant) => ({
    beat: withVariant(input.beat, variant),
    operatorId: `presentation:${variant.id}`,
  }));
  const raw = [
    { beat: input.beat, operatorId: "canonical-treatment" },
    ...structuredCandidates.map((beat) => ({ beat, operatorId: `semantic-action:${deriveVeronicaDepictedActionFamily(beat)}` })),
    ...actionCandidates.map((beat) => ({ beat, operatorId: `source-action:${deriveVeronicaDepictedActionFamily(beat)}` })),
    ...presentationCandidates,
  ];
  const unique = [...new Map(raw.map((entry) => [entry.beat.beatHash, entry])).values()]
    .map((entry) => materializeCandidate({ ...input, baseBeat: input.beat, beat: entry.beat, operatorId: entry.operatorId }));
  return unique.slice(0, VERONICA_MAX_CANDIDATES_PER_BEAT);
}

function contribution(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "scenes">;
  readonly candidate: VeronicaDerivedBeatCandidate;
  readonly previous: readonly VeronicaDerivedBeatCandidate[];
}): readonly number[] {
  const window = input.previous.slice(-VERONICA_CANDIDATE_ROLLING_WINDOW);
  const action = window.every((prior) => prior.actionFamily !== input.candidate.actionFamily) ? 1 : 0;
  const mechanism = window.every((prior) => prior.mechanism !== input.candidate.mechanism) ? 1 : 0;
  const composition = window.every((prior) => prior.compositionFamily !== input.candidate.compositionFamily) ? 1 : 0;
  const sceneStart = input.plan.scenes.find((scene) => scene.sceneId === input.candidate.beat.sceneId)?.startMs ?? Number.POSITIVE_INFINITY;
  const opening = sceneStart < 15_000 ? input.candidate.openingSuitability + action + mechanism : 0;
  return [input.candidate.visibleInformationDelta.score, action, mechanism, opening, composition, input.candidate.causalCompleteness ? 1 : 0];
}

interface CandidateBeam {
  readonly candidates: readonly VeronicaDerivedBeatCandidate[];
  readonly scoreTuple: readonly number[];
  readonly tieBreakKey: string;
}

function scoreBeam(plan: Pick<PositioningVisualPlanV2, "format" | "scenes">, candidates: readonly VeronicaDerivedBeatCandidate[]): readonly number[] {
  const beats = candidates.map((candidate) => candidate.beat);
  const analysis = analyzeVeronicaSequenceDiversity({ plan, beats });
  const severity = (value: VeronicaSequenceDiversityFinding["severity"]) => analysis.findings.filter((finding) => finding.severity === value).length;
  const totals = candidates.reduce((result, candidate, index) => {
    const values = contribution({ plan, candidate, previous: candidates.slice(0, index) });
    return result.map((value, valueIndex) => value + (values[valueIndex] ?? 0));
  }, [0, 0, 0, 0, 0, 0]);
  return [-severity("blocker"), -severity("review-required"), -severity("warning"), ...totals];
}

function compareScoreDescending(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function selectVeronicaBeatCandidateSequence(input: {
  readonly plan: Pick<PositioningVisualPlanV2, "format" | "scenes">;
  readonly beats: readonly VisualBeatTreatmentV1[];
  readonly lockedBeatIds?: ReadonlySet<string>;
}): { readonly beats: readonly VisualBeatTreatmentV1[]; readonly analysis: VeronicaSequenceDiversityResult; readonly diagnostics: VeronicaCandidateSelectionDiagnostics } {
  const candidateSets = input.beats.map((beat, index) => generateVeronicaDerivedBeatCandidates({
    plan: input.plan,
    beat,
    ...(input.beats[index - 1] ? { previousBeat: input.beats[index - 1] } : {}),
    locked: input.lockedBeatIds?.has(beat.beatId) ?? false,
  }));
  const noSafeCandidateBeatIds: string[] = [];
  const noSafeReasons: VeronicaNoSafeCandidateDiagnostic[] = [];
  let beam: CandidateBeam[] = [{ candidates: [], scoreTuple: [], tieBreakKey: "" }];
  for (const candidates of candidateSets) {
    let eligible = candidates.filter((candidate) => candidate.hardGate.eligible);
    if (eligible.length === 0) {
      const first = candidates[0];
      const beatId = first?.beat.beatId ?? "unknown-beat";
      noSafeCandidateBeatIds.push(beatId);
      const scene = input.plan.scenes.find((entry) => entry.sceneId === first?.beat.sceneId);
      const rejectionCodes = [...new Set(candidates.flatMap((candidate) => candidate.hardGate.findingCodes))];
      const semanticRelation = scene?.semanticProposition?.stateRelation ?? "STABLE";
      const actorRole = scene?.semanticProposition?.actorRole ?? scene?.treatment.actionOwnerRole ?? "none";
      const reasons = [
        ...(rejectionCodes.includes("UNRESOLVED_REQUIRED_MECHANISM")
          ? [{ kind: "UNRESOLVED_REQUIRED_MECHANISM" as const, semanticRelation }]
          : []),
        ...(rejectionCodes.includes("ACTOR_AUTHORIZATION_FAILED")
          ? [{ kind: "ACTOR_AUTHORIZATION_FAILURE" as const, actorRole }]
          : []),
        ...(scene?.semanticProposition?.visualMechanism === "UNRESOLVED"
          ? [{ kind: "NO_AUTHORIZED_MECHANISM" as const, mechanism: "UNRESOLVED" }]
          : []),
        ...(rejectionCodes.includes("CAUSAL_EVIDENCE_INCOMPLETE")
          ? [{ kind: "CAUSAL_EVIDENCE_INCOMPLETE" as const, semanticRelation }]
          : []),
        ...(rejectionCodes.includes("STATE_FIDELITY_FAILED")
          ? [{ kind: "STATE_RELATION_UNENCODABLE" as const, semanticRelation }]
          : []),
        ...((scene?.semanticProposition?.evidenceSpans.length ?? 0) === 0
          ? [{ kind: "SOURCE_EVIDENCE_INSUFFICIENT" as const, evidenceSpanCount: 0 }]
          : []),
        {
          kind: "ALL_CANDIDATES_SEMANTICALLY_INVALID" as const,
          rejectionCodes,
        },
      ];
      noSafeReasons.push({
        beatId,
        sceneId: first?.beat.sceneId ?? scene?.sceneId ?? "unknown-scene",
        applicableCandidateFamilies: [...new Set(candidates.map((candidate) => candidate.operatorId))],
        generatedCandidateIds: candidates.map((candidate) => candidate.candidateId),
        hardGateRejectionCodes: rejectionCodes,
        primaryReason: reasons[0]!,
        secondaryReasons: reasons.slice(1),
        semanticRelation,
        actorAuthorization: rejectionCodes.includes("ACTOR_AUTHORIZATION_FAILED")
          ? "FAILED"
          : actorRole === "none" ? "UNRESOLVED" : "AUTHORIZED",
        environmentAuthorization: rejectionCodes.includes("ENVIRONMENT_AUTHORIZATION_FAILED")
          ? "FAILED" : "AUTHORIZED",
        mechanismStatus: scene?.semanticProposition?.visualMechanism === "UNRESOLVED"
          ? "UNRESOLVED" : "RESOLVED",
        causalStatus: rejectionCodes.includes("CAUSAL_EVIDENCE_INCOMPLETE")
          ? "INCOMPLETE"
          : semanticRelation === "CAUSAL_BEFORE_AFTER" || semanticRelation === "SEQUENTIAL_PROGRESSION"
            ? "COMPLETE" : "NOT_APPLICABLE",
      });
      eligible = candidates.slice(0, 1);
    }
    beam = beam.flatMap((entry) => eligible.map((candidate): CandidateBeam => {
      const selected = [...entry.candidates, candidate];
      return {
        candidates: selected,
        scoreTuple: scoreBeam(input.plan, selected),
        tieBreakKey: selected.map((value) => value.candidateId).join(":"),
      };
    })).sort((left, right) => compareScoreDescending(left.scoreTuple, right.scoreTuple)
      || left.tieBreakKey.localeCompare(right.tieBreakKey)).slice(0, VERONICA_CANDIDATE_BEAM_WIDTH);
  }
  const selected = beam[0]?.candidates ?? [];
  const selectedIds = new Set(selected.map((candidate) => candidate.candidateId));
  const changedBeatIds = selected.filter((candidate, index) => candidate.beat.beatHash !== input.beats[index]?.beatHash).map((candidate) => candidate.beat.beatId);
  const selectedBeats = selected.map((candidate) => candidate.beat);
  const analysis = analyzeVeronicaSequenceDiversity({
    plan: input.plan,
    beats: selectedBeats,
    remediation: { passes: changedBeatIds.length > 0 ? 1 : 0, changedBeatIds, exhausted: false },
  });
  const diagnosticRows = candidateSets.flatMap((candidates, beatIndex) => candidates.map((candidate) => {
    const prior = selected.slice(0, beatIndex);
    const [information, action, mechanism, opening, composition, causal] = contribution({ plan: input.plan, candidate, previous: prior });
    const localTuple = [information ?? 0, action ?? 0, mechanism ?? 0, opening ?? 0, composition ?? 0, causal ?? 0];
    const isSelected = selectedIds.has(candidate.candidateId);
    const selectedForBeat = selected[beatIndex];
    const sameScore = selectedForBeat && compareScoreDescending(localTuple, contribution({ plan: input.plan, candidate: selectedForBeat, previous: prior })) === 0;
    return {
      beatId: candidate.beat.beatId,
      candidateId: candidate.candidateId,
      hardGateEligible: candidate.hardGate.eligible,
      hardGateFindingCodes: candidate.hardGate.findingCodes,
      visibleInformationDelta: information ?? 0,
      actionDiversityContribution: action ?? 0,
      mechanismDiversityContribution: mechanism ?? 0,
      openingNoveltyContribution: opening ?? 0,
      compositionContribution: composition ?? 0,
      causalCompleteness: candidate.causalCompleteness,
      scoreTuple: localTuple,
      selected: isSelected,
      reason: isSelected
        ? noSafeCandidateBeatIds.includes(candidate.beat.beatId) ? "NO_SAFE_CANDIDATE_FALLBACK" as const : "SELECTED" as const
        : !candidate.hardGate.eligible ? "HARD_GATE_REJECTED" as const
          : sameScore ? "STABLE_TIE_BREAK" as const : "LOWER_SEQUENCE_SCORE" as const,
      tieBreakKey: candidate.candidateId,
    };
  }));
  const diagnosticBase = {
    schemaVersion: "veronica-beat-candidate-selection.v1" as const,
    policyVersion: VERONICA_BEAT_CANDIDATE_SCORER_VERSION,
    maximumCandidatesPerBeat: VERONICA_MAX_CANDIDATES_PER_BEAT,
    beamWidth: VERONICA_CANDIDATE_BEAM_WIDTH,
    rollingWindowBeats: VERONICA_CANDIDATE_ROLLING_WINDOW,
    candidateCount: candidateSets.reduce((sum, candidates) => sum + candidates.length, 0),
    hardValidCandidateCount: candidateSets.flat().filter((candidate) => candidate.hardGate.eligible).length,
    noSafeCandidateBeatIds,
    noSafeReasons,
    selectedCandidateIds: selected.map((candidate) => candidate.candidateId),
    candidates: diagnosticRows,
  };
  const diagnostics = { ...diagnosticBase, selectionHash: stableHash(diagnosticBase) };
  return { beats: selectedBeats, analysis, diagnostics };
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
  /** Reviewed beat overrides are authoritative and may be evaluated, but never rewritten. */
  readonly lockedBeatIds?: ReadonlySet<string>;
}): { readonly beats: readonly VisualBeatTreatmentV1[]; readonly analysis: VeronicaSequenceDiversityResult } {
  const policy = resolveVeronicaSequenceDiversityPolicy(input.plan.format);
  if (!policy.enabled) return { beats: input.beats, analysis: analyzeVeronicaSequenceDiversity(input) };
  const selected = selectVeronicaBeatCandidateSequence(input);
  return { beats: selected.beats, analysis: selected.analysis };
}
