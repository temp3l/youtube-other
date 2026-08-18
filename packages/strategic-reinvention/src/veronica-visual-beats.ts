import { z } from "zod";
import { writeJsonAtomic } from "@mediaforge/shared";
import {
  VERONICA_DEPICTED_ACTION_FAMILIES,
  VERONICA_PRESENTATION_MECHANISMS,
  type GeneratedVisualAsset,
  type PlannedScene,
  type PositioningVisualPlanV2,
  type VisualBeatAssetDecision,
  type VisualBeatBoundaryKind,
  type VisualBeatRole,
  type VisualBeatTreatmentV1,
  type VisualEvent,
  type VisualEventKind,
  type VeronicaVisualDensityMetrics,
  type VeronicaVisualBeatPlanV1,
} from "./positioning-visual-contracts.js";
import { finalizeSemanticPlanHash, stableHash } from "./positioning-visual-semantics.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";
import {
  VeronicaExpectedDeterministicOutcomeError,
  type VeronicaDeterministicFinding,
} from "./veronica-deterministic-outcome.js";
import {
  deriveVeronicaSemanticProposition,
  renderVeronicaVisibleThesis,
  visualTreatmentFromProposition,
} from "./veronica-semantic-quality.js";
import {
  analyzeVeronicaSequenceDiversity,
  selectVeronicaBeatCandidateSequence,
  VERONICA_SEQUENCE_DIVERSITY_POLICY_VERSION,
} from "./veronica-sequence-diversity.js";
import { assessVeronicaRemovalConsequenceEvidence } from "./veronica-causal-evidence.js";

export { assessVeronicaRemovalConsequenceEvidence } from "./veronica-causal-evidence.js";

export const VERONICA_VISUAL_BEAT_PLAN_VERSION =
  "veronica-visual-beat-plan.v1" as const;
export const VERONICA_VISUAL_BEAT_PLANNER_VERSION =
  "veronica-visual-beat-planner.v5" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const beatRoleSchema = z.enum([
  "establish",
  "primary",
  "progression",
  "contrast",
  "reaction",
  "payoff",
  "cutaway",
]);
const assetDecisionSchema = z.enum([
  "new-image",
  "reuse-with-motion",
  "reuse-with-crop",
  "reuse-existing-asset",
]);
const boundaryKindSchema = z.enum([
  "narration-aligned",
  "semantic-subspan-aligned",
  "editorially-allocated",
]);

const compositionSchema = z.strictObject({
  description: z.string().min(1),
  camera: z.string().min(1),
  lighting: z.string().min(1),
  subtitleSafeAreaRequired: z.literal(true),
});

const referenceRequirementSchema = z.strictObject({
  kind: z.enum(["canonical-identity", "episode-anchor", "scene-reference"]),
  assetId: z.string().min(1),
  required: z.boolean(),
});

const beatActorRelationSchema = z.strictObject({
  causalActionOwnerRole: z.enum(["expert", "buyer", "business-operator", "shared"]),
  outcomeActorRole: z.enum(["expert", "buyer", "business-operator", "shared"]),
  relationship: z.enum(["ELICITS", "ENABLES"]),
  causalAction: z.string().min(1),
  outcomeAction: z.string().min(1),
});

export const visualBeatTreatmentV1Schema = z.strictObject({
  version: z.literal(1),
  beatId: z.string().min(1),
  sceneId: z.string().min(1),
  role: beatRoleSchema,
  narrationRef: z.strictObject({
    semanticSceneId: z.string().min(1),
    sentenceIds: z.array(z.string().min(1)).min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    spanHash: sha256Schema,
  }),
  parentTreatmentHash: sha256Schema,
  parentSemanticRevisionHash: sha256Schema,
  coreMeaning: z.string().min(1),
  newInformation: z.string().min(1),
  viewerShouldUnderstand: z.string().min(1),
  visualThesis: z.string().min(1),
  subject: z.string().min(1),
  action: z.string().min(1),
  actorRelation: beatActorRelationSchema.optional(),
  state: z.string().min(1),
  environment: z.string().min(1),
  composition: compositionSchema,
  continuationOfPreviousBeat: z.boolean(),
  referenceRequirements: z.array(referenceRequirementSchema),
  assetDecision: assetDecisionSchema,
  reuseSourceBeatId: z.string().min(1).nullable(),
  timingWeight: z.number().positive(),
  boundaryKind: boundaryKindSchema,
  beatHash: sha256Schema,
});

const qualitySchema = z.strictObject({
  status: z.enum(["PASS", "WARN", "FAIL"]),
  findings: z.array(z.strictObject({
    code: z.enum([
      "REDUNDANT_SIBLING_BEAT",
      "REDUNDANT_PAID_IMAGE_CANDIDATE",
      "EVENT_ONLY_DENSITY_INCREASE",
      "OPENING_STATIC_HOLD",
      "INSUFFICIENT_SEMANTIC_ASSET_DENSITY",
      "LONG_STATIC_OPENING_ASSET_HOLD",
      "BEAT_OUTSIDE_PARENT_MEANING",
      "INVALID_REUSE_SOURCE",
      "CAUSE_CONSEQUENCE_EVIDENCE_INCOMPLETE",
      "ACTION_OWNER_INVERSION",
      "STATE_ROLE_INVERSION",
      "SEMANTIC_DRIFT",
      "SOURCE_DOMAIN_LOST",
      "NO_SAFE_BEAT_CANDIDATE",
    ]),
    severity: z.enum(["warning", "blocker"]),
    sceneId: z.string().min(1),
    beatId: z.string().min(1).nullable(),
    message: z.string().min(1),
  })),
  beatsInFirst5Seconds: z.number().int().nonnegative(),
  beatsInFirst10Seconds: z.number().int().nonnegative(),
  beatsInFirst15Seconds: z.number().int().nonnegative(),
  density: z.strictObject({
    semanticSceneCount: z.number().int().positive(),
    visualBeatCount: z.number().int().positive(),
    visualEventCount: z.number().int().positive(),
    uniqueCanonicalAssetCount: z.number().int().positive(),
    newImageBeatCount: z.number().int().nonnegative(),
    reuseWithMotionBeatCount: z.number().int().nonnegative(),
    reuseWithCropBeatCount: z.number().int().nonnegative(),
    reuseExistingAssetBeatCount: z.number().int().nonnegative(),
    sameAssetEventCount: z.number().int().nonnegative(),
    firstNewAssetChangeMs: z.number().int().nonnegative().nullable(),
    uniqueAssetsInFirst5Seconds: z.number().int().nonnegative(),
    uniqueAssetsInFirst10Seconds: z.number().int().nonnegative(),
    uniqueAssetsInFirst15Seconds: z.number().int().nonnegative(),
    longestContinuousSameAssetHoldMs: z.number().int().nonnegative(),
    longestSemanticBeatHoldMs: z.number().int().nonnegative().default(0),
    averageCanonicalAssetHoldMs: z.number().nonnegative(),
    redundantPaidImageCandidateBeatIds: z.array(z.string().min(1)),
    informationGain: z.array(z.strictObject({
      beatId: z.string().min(1),
      newInformationHash: sha256Schema,
      addsMaterialInformation: z.boolean(),
    })),
    higherImageDensityThanOnePerScene: z.boolean(),
  }),
  sequenceDiversity: z.strictObject({
    schemaVersion: z.literal("veronica-sequence-diversity.v2"),
    policyVersion: z.literal(VERONICA_SEQUENCE_DIVERSITY_POLICY_VERSION),
    status: z.enum(["PASS", "WARN", "REVIEW_REQUIRED", "BLOCK"]),
    signatures: z.array(z.strictObject({
      beatId: z.string().min(1),
      treatmentFamily: z.string().min(1),
      visualMechanism: z.string().min(1),
      presentationMechanism: z.enum(VERONICA_PRESENTATION_MECHANISMS),
      depictedActionFamily: z.enum(VERONICA_DEPICTED_ACTION_FAMILIES),
      environmentFamily: z.string().min(1),
      primaryAction: z.string().min(1),
      compositionFamily: z.string().min(1),
      cameraFamily: z.string().min(1),
      informationRole: z.string().min(1),
      semanticState: z.string().min(1),
      actorPerspective: z.string().min(1),
      sourcePropositionHash: sha256Schema,
      signatureHash: sha256Schema,
    })),
    findings: z.array(z.strictObject({
      code: z.enum(["ADJACENT_VISUAL_DUPLICATION", "TREATMENT_FAMILY_REPETITION", "ENVIRONMENT_MONOTONY", "ACTION_MONOTONY", "COMPOSITION_MONOTONY", "MECHANISM_REPETITION", "PRESENTATION_MECHANISM_REPETITION", "LOW_INFORMATION_GAIN", "OPENING_NOVELTY_LOW", "OPENING_ACTION_NOVELTY_LOW"]),
      severity: z.enum(["warning", "review-required", "blocker"]),
      beatIds: z.array(z.string().min(1)).min(1),
      window: z.enum(["adjacent", "three-beat", "five-beat", "opening-5s", "opening-10s", "opening-15s", "whole-episode"]),
      repeatedDimensions: z.array(z.string().min(1)),
      observed: z.number().nonnegative(),
      threshold: z.number().nonnegative(),
      evidence: z.string().min(1),
      remediationEligible: z.boolean(),
    })),
    metrics: z.strictObject({
      adjacentDuplicateCount: z.number().int().nonnegative(),
      treatmentFamilyDominantShare: z.number().min(0).max(1),
      environmentDominantShare: z.number().min(0).max(1),
      actionDominantShare: z.number().min(0).max(1),
      depictedActionDominantShare: z.number().min(0).max(1),
      presentationMechanismDominantShare: z.number().min(0).max(1),
      compositionDominantShare: z.number().min(0).max(1),
      mechanismDominantShare: z.number().min(0).max(1),
      lowInformationGainCount: z.number().int().nonnegative(),
      opening: z.record(z.enum(["5", "10", "15"]), z.strictObject({
        beatCount: z.number().int().nonnegative(),
        uniqueSourcePropositions: z.number().int().nonnegative(),
        uniqueTreatmentMechanisms: z.number().int().nonnegative(),
        uniquePresentationMechanisms: z.number().int().nonnegative(),
        uniqueDepictedActionFamilies: z.number().int().nonnegative(),
        uniqueCompositionFamilies: z.number().int().nonnegative(),
        uniqueActionFamilies: z.number().int().nonnegative(),
      })),
    }),
    remediation: z.strictObject({
      passes: z.number().int().nonnegative(),
      changedBeatIds: z.array(z.string().min(1)),
      exhausted: z.boolean(),
    }),
    resultHash: sha256Schema,
  }),
});

const candidateSelectionSchema = z.strictObject({
  schemaVersion: z.literal("veronica-beat-candidate-selection.v1"),
  policyVersion: z.string().min(1),
  maximumCandidatesPerBeat: z.literal(6),
  beamWidth: z.literal(4),
  rollingWindowBeats: z.literal(5),
  candidateCount: z.number().int().nonnegative(),
  hardValidCandidateCount: z.number().int().nonnegative(),
  noSafeCandidateBeatIds: z.array(z.string().min(1)),
  noSafeReasons: z.array(z.strictObject({
    beatId: z.string().min(1),
    sceneId: z.string().min(1),
    applicableCandidateFamilies: z.array(z.string()),
    generatedCandidateIds: z.array(sha256Schema),
    hardGateRejectionCodes: z.array(z.string()),
    primaryReason: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("UNRESOLVED_REQUIRED_MECHANISM"), semanticRelation: z.enum(["STABLE", "CAUSAL_BEFORE_AFTER", "CONTRAST", "CONDITIONAL_ALTERNATIVES", "SEQUENTIAL_PROGRESSION"]) }),
      z.strictObject({ kind: z.literal("ACTOR_AUTHORIZATION_FAILURE"), actorRole: z.enum(["expert", "buyer", "business-operator", "shared", "none"]) }),
      z.strictObject({ kind: z.literal("NO_AUTHORIZED_MECHANISM"), mechanism: z.string() }),
      z.strictObject({ kind: z.literal("CAUSAL_EVIDENCE_INCOMPLETE"), semanticRelation: z.enum(["STABLE", "CAUSAL_BEFORE_AFTER", "CONTRAST", "CONDITIONAL_ALTERNATIVES", "SEQUENTIAL_PROGRESSION"]) }),
      z.strictObject({ kind: z.literal("STATE_RELATION_UNENCODABLE"), semanticRelation: z.enum(["STABLE", "CAUSAL_BEFORE_AFTER", "CONTRAST", "CONDITIONAL_ALTERNATIVES", "SEQUENTIAL_PROGRESSION"]) }),
      z.strictObject({ kind: z.literal("SOURCE_EVIDENCE_INSUFFICIENT"), evidenceSpanCount: z.number().int().nonnegative() }),
      z.strictObject({ kind: z.literal("OPERATOR_APPLICABILITY_MISMATCH"), candidateFamilies: z.array(z.string()) }),
      z.strictObject({ kind: z.literal("ALL_CANDIDATES_SEMANTICALLY_INVALID"), rejectionCodes: z.array(z.string()) }),
    ]),
    secondaryReasons: z.array(z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("UNRESOLVED_REQUIRED_MECHANISM"), semanticRelation: z.enum(["STABLE", "CAUSAL_BEFORE_AFTER", "CONTRAST", "CONDITIONAL_ALTERNATIVES", "SEQUENTIAL_PROGRESSION"]) }),
      z.strictObject({ kind: z.literal("ACTOR_AUTHORIZATION_FAILURE"), actorRole: z.enum(["expert", "buyer", "business-operator", "shared", "none"]) }),
      z.strictObject({ kind: z.literal("NO_AUTHORIZED_MECHANISM"), mechanism: z.string() }),
      z.strictObject({ kind: z.literal("CAUSAL_EVIDENCE_INCOMPLETE"), semanticRelation: z.enum(["STABLE", "CAUSAL_BEFORE_AFTER", "CONTRAST", "CONDITIONAL_ALTERNATIVES", "SEQUENTIAL_PROGRESSION"]) }),
      z.strictObject({ kind: z.literal("STATE_RELATION_UNENCODABLE"), semanticRelation: z.enum(["STABLE", "CAUSAL_BEFORE_AFTER", "CONTRAST", "CONDITIONAL_ALTERNATIVES", "SEQUENTIAL_PROGRESSION"]) }),
      z.strictObject({ kind: z.literal("SOURCE_EVIDENCE_INSUFFICIENT"), evidenceSpanCount: z.number().int().nonnegative() }),
      z.strictObject({ kind: z.literal("OPERATOR_APPLICABILITY_MISMATCH"), candidateFamilies: z.array(z.string()) }),
      z.strictObject({ kind: z.literal("ALL_CANDIDATES_SEMANTICALLY_INVALID"), rejectionCodes: z.array(z.string()) }),
    ])),
    semanticRelation: z.enum(["STABLE", "CAUSAL_BEFORE_AFTER", "CONTRAST", "CONDITIONAL_ALTERNATIVES", "SEQUENTIAL_PROGRESSION"]),
    actorAuthorization: z.enum(["AUTHORIZED", "FAILED", "UNRESOLVED"]),
    environmentAuthorization: z.enum(["AUTHORIZED", "FAILED", "UNRESOLVED"]),
    mechanismStatus: z.enum(["RESOLVED", "UNRESOLVED", "UNAUTHORIZED"]),
    causalStatus: z.enum(["NOT_APPLICABLE", "COMPLETE", "INCOMPLETE"]),
  })),
  selectedCandidateIds: z.array(sha256Schema),
  candidates: z.array(z.strictObject({
    beatId: z.string().min(1),
    candidateId: sha256Schema,
    hardGateEligible: z.boolean(),
    hardGateFindingCodes: z.array(z.string().min(1)),
    visibleInformationDelta: z.number().nonnegative(),
    actionDiversityContribution: z.number().nonnegative(),
    mechanismDiversityContribution: z.number().nonnegative(),
    openingNoveltyContribution: z.number().nonnegative(),
    compositionContribution: z.number().nonnegative(),
    causalCompleteness: z.boolean(),
    scoreTuple: z.array(z.number()),
    selected: z.boolean(),
    reason: z.enum(["SELECTED", "HARD_GATE_REJECTED", "LOWER_SEQUENCE_SCORE", "STABLE_TIE_BREAK", "NO_SAFE_CANDIDATE_FALLBACK"]),
    tieBreakKey: z.string().min(1),
  })),
  selectionHash: sha256Schema,
});

export const veronicaVisualBeatPlanV1Schema = z.strictObject({
  schemaVersion: z.literal(VERONICA_VISUAL_BEAT_PLAN_VERSION),
  policyVersion: z.string().min(1),
  contentId: z.string().min(1),
  semanticSceneCount: z.number().int().positive(),
  beats: z.array(visualBeatTreatmentV1Schema).min(1),
  quality: qualitySchema,
  candidateSelection: candidateSelectionSchema.optional(),
  beatPlanHash: sha256Schema,
});

const beatOverrideSchema = z.strictObject({
  beatId: z.string().min(1),
  role: beatRoleSchema,
  coreMeaning: z.string().min(1),
  newInformation: z.string().min(1),
  viewerShouldUnderstand: z.string().min(1),
  visualThesis: z.string().min(1),
  subject: z.string().min(1),
  action: z.string().min(1),
  sourceEvidence: z.string().min(1).optional(),
  actorRelation: beatActorRelationSchema.optional(),
  state: z.string().min(1),
  environment: z.string().min(1),
  composition: compositionSchema,
  continuationOfPreviousBeat: z.boolean(),
  assetDecision: assetDecisionSchema,
  reuseSourceBeatId: z.string().min(1).nullable().default(null),
  timingWeight: z.number().positive(),
  boundaryKind: boundaryKindSchema,
});

export const veronicaVisualBeatOverrideArtifactSchema = z.strictObject({
  schemaVersion: z.literal("veronica-visual-beat-overrides.v1"),
  episodeId: z.string().min(1),
  baseCanonicalImagePlanHash: sha256Schema,
  scenes: z.array(z.strictObject({
    sceneId: z.string().min(1),
    beats: z.array(beatOverrideSchema).min(1),
  })).min(1),
});
export type VeronicaVisualBeatOverrideArtifact = z.infer<
  typeof veronicaVisualBeatOverrideArtifactSchema
>;

function narrationRef(scene: PlannedScene) {
  const spans = scene.semanticProposition?.evidenceSpans;
  if (!spans || spans.length === 0) {
    throw new Error(`VERONICA_VISUAL_BEAT_NARRATION_REF_MISSING:${scene.sceneId}`);
  }
  return {
    semanticSceneId: scene.sceneId,
    sentenceIds: spans.map((span) => span.sentenceId),
    startOffset: Math.min(...spans.map((span) => span.startOffset)),
    endOffset: Math.max(...spans.map((span) => span.endOffset)),
    spanHash: stableHash(spans.map((span) => span.spanHash)),
  };
}

function narrationRefForEvidence(scene: PlannedScene, sourceEvidence: string | undefined) {
  if (!sourceEvidence) return narrationRef(scene);
  const startOffset = scene.narrationAnchor.indexOf(sourceEvidence);
  if (startOffset < 0) {
    throw new Error(`VERONICA_VISUAL_BEAT_SOURCE_EVIDENCE_MISMATCH:${scene.sceneId}`);
  }
  const chunks = semanticChunks(scene.narrationAnchor);
  const endOffset = startOffset + sourceEvidence.length;
  const sentenceIds = chunks
    .filter((chunk) => chunk.startOffset < endOffset && chunk.endOffset > startOffset)
    .flatMap((chunk) => chunk.sentenceIds);
  return {
    semanticSceneId: scene.sceneId,
    sentenceIds: [...new Set(sentenceIds.length > 0 ? sentenceIds : ["sentence-001"])],
    startOffset,
    endOffset,
    spanHash: stableHash({ text: sourceEvidence, startOffset, endOffset }),
  };
}

export type VeronicaParentChildSemanticDefectCode =
  | "ACTION_OWNER_INVERSION"
  | "STATE_ROLE_INVERSION"
  | "SEMANTIC_DRIFT"
  | "SOURCE_DOMAIN_LOST";

export function assessVeronicaParentChildSemanticCompatibility(input: {
  readonly parentActionOwnerRole: "expert" | "buyer" | "business-operator" | "shared" | "none";
  readonly parentNarration: string;
  readonly child: Pick<VisualBeatTreatmentV1, "coreMeaning" | "viewerShouldUnderstand" | "action" | "state" | "actorRelation">;
}): readonly VeronicaParentChildSemanticDefectCode[] {
  const relation = input.child.actorRelation;
  if (!relation) return [];
  const defects: VeronicaParentChildSemanticDefectCode[] = [];
  if (input.parentActionOwnerRole !== "shared" && input.parentActionOwnerRole !== relation.causalActionOwnerRole) {
    defects.push("ACTION_OWNER_INVERSION");
  }
  const visibleAction = normalize(input.child.action);
  const causalTokens = semanticTokens(relation.causalAction);
  const outcomeTokens = semanticTokens(relation.outcomeAction);
  const hasCausalAction = [...causalTokens].some((token) => visibleAction.includes(token));
  const hasOutcomeAction = [...outcomeTokens].some((token) => visibleAction.includes(token));
  if (!hasCausalAction) defects.push("SOURCE_DOMAIN_LOST");
  if (!hasOutcomeAction || relation.causalActionOwnerRole === relation.outcomeActorRole) defects.push("STATE_ROLE_INVERSION");
  const source = semanticTokens(input.parentNarration);
  const child = semanticTokens(`${input.child.coreMeaning} ${input.child.viewerShouldUnderstand} ${relation.causalAction} ${relation.outcomeAction}`);
  if (![...child].some((token) => source.has(token))) defects.push("SEMANTIC_DRIFT");
  return [...new Set(defects)];
}

function referenceRequirements(plan: PositioningVisualPlanV2, scene: PlannedScene) {
  const asset = plan.assets.find((candidate) => candidate.sceneId === scene.sceneId);
  return asset?.canonicalReferenceAssetId
    ? [{ kind: "canonical-identity" as const, assetId: asset.canonicalReferenceAssetId, required: true }]
    : [];
}

function defaultBeat(plan: PositioningVisualPlanV2, scene: PlannedScene): Omit<VisualBeatTreatmentV1, "beatHash"> {
  const proposition = scene.semanticProposition;
  if (!proposition) throw new Error(`VERONICA_VISUAL_BEAT_PROPOSITION_MISSING:${scene.sceneId}`);
  return {
    version: 1,
    beatId: `${scene.sceneId}-B01`,
    sceneId: scene.sceneId,
    role: scene.progressionStage === "HOOK" ? "primary" : scene.progressionStage === "PAYOFF" ? "payoff" : "primary",
    narrationRef: narrationRef(scene),
    parentTreatmentHash: scene.treatment.treatmentHash,
    parentSemanticRevisionHash: scene.semanticProposition?.semanticRevisionHash ?? stableHash({
      sceneId: scene.sceneId,
      narrationAnchor: scene.narrationAnchor,
      compatibility: "unfinalized-parent",
    }),
    coreMeaning: proposition.narrationClaim,
    newInformation: scene.newInformation,
    viewerShouldUnderstand: proposition.buyerInterpretation ?? proposition.consequence,
    visualThesis: scene.visibleThesis,
    subject: scene.treatment.subjectRequirement,
    action: scene.treatment.action,
    state: `${proposition.polarity}; ${proposition.stateRelation}`,
    environment: scene.treatment.environment,
    composition: {
      description: scene.treatment.composition,
      camera: scene.treatment.camera,
      lighting: scene.treatment.lighting,
      subtitleSafeAreaRequired: true,
    },
    continuationOfPreviousBeat: false,
    referenceRequirements: referenceRequirements(plan, scene),
    assetDecision: "new-image",
    reuseSourceBeatId: null,
    timingWeight: 1,
    boundaryKind: "narration-aligned",
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function semanticTokens(value: string): ReadonlySet<string> {
  const stop = new Set(["the", "and", "that", "with", "this", "from", "into", "eine", "einer", "und", "der", "die", "das"]);
  return new Set(normalize(value).split(/\s+/u).filter((token) => token.length > 3 && !stop.has(token)));
}

function overlapsParent(beat: VisualBeatTreatmentV1, scene: PlannedScene): boolean {
  const parent = semanticTokens(`${scene.narrationAnchor} ${scene.semanticProposition?.narrationClaim ?? ""} ${scene.semanticProposition?.consequence ?? ""} ${scene.visibleThesis} ${scene.treatment.action}`);
  const child = semanticTokens(`${beat.coreMeaning} ${beat.newInformation} ${beat.viewerShouldUnderstand} ${beat.visualThesis} ${beat.action}`);
  return [...child].some((token) => parent.has(token));
}

interface SemanticChunk {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly sentenceIds: readonly string[];
}

function semanticChunks(narration: string): readonly SemanticChunk[] {
  const sentences = [...narration.matchAll(/[^.!?…]+(?:[.!?…]+[”"'’)]*|$)/gu)].flatMap((match, index): SemanticChunk[] => {
    const text = match[0].trim();
    if (!text) return [];
    const startOffset = (match.index ?? 0) + match[0].indexOf(text);
    return [{ text, startOffset, endOffset: startOffset + text.length, sentenceIds: [`sentence-${String(index + 1).padStart(3, "0")}`] }];
  });
  const raw = sentences.flatMap((sentence): SemanticChunk[] => {
    const commaIndex = sentence.text.indexOf(",");
    if (!/^if\b/iu.test(sentence.text) || sentence.text.length < 120 || commaIndex < 30) return [sentence];
    const firstText = sentence.text.slice(0, commaIndex).trim();
    const secondText = sentence.text.slice(commaIndex + 1).trim();
    if (!firstText || !secondText) return [sentence];
    const secondStartOffset = sentence.startOffset + commaIndex + 1 + sentence.text.slice(commaIndex + 1).search(/\S/u);
    return [
      { text: firstText, startOffset: sentence.startOffset, endOffset: sentence.startOffset + commaIndex, sentenceIds: sentence.sentenceIds },
      { text: secondText, startOffset: secondStartOffset, endOffset: sentence.endOffset, sentenceIds: sentence.sentenceIds },
    ];
  });
  const chunks: SemanticChunk[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index]!;
    const next = raw[index + 1];
    if (next && /^(?:try|do|use)\s+(?:this|that|it)(?:\s+instead)?\s*[.!?…]*$/iu.test(current.text)) {
      chunks.push({
        text: `${current.text} ${next.text}`,
        startOffset: current.startOffset,
        endOffset: next.endOffset,
        sentenceIds: [...current.sentenceIds, ...next.sentenceIds],
      });
      index += 1;
    } else {
      chunks.push(current);
    }
  }
  return chunks;
}

function automaticSceneBeats(plan: PositioningVisualPlanV2, scene: PlannedScene): readonly Omit<VisualBeatTreatmentV1, "beatHash">[] {
  const chunks = semanticChunks(scene.narrationAnchor);
  if (plan.format !== "short" || scene.durationMs < 8_000 || chunks.length < 2) return [defaultBeat(plan, scene)];
  const proposition = scene.semanticProposition
    ?? deriveVeronicaSemanticProposition({ scene, narration: scene.narrationAnchor });
  if (proposition.visualMechanism === "UNRESOLVED") return [defaultBeat(plan, scene)];
  const usable = chunks;
  const openingWeights = usable.length >= 3 && scene.startMs < 15_000
    ? [0.18, 0.25, ...Array.from({ length: usable.length - 2 }, () => 0.57 / (usable.length - 2))]
    : Array.from({ length: usable.length }, () => 1);
  return usable.map((chunk, index) => {
    const projected = visualTreatmentFromProposition({ scene, proposition, preserveEnvironment: false });
    const beatId = `${scene.sceneId}-B${String(index + 1).padStart(2, "0")}`;
    return {
      version: 1,
      beatId,
      sceneId: scene.sceneId,
      role: index === 0 ? (scene.progressionStage === "HOOK" ? "establish" : "primary") : index === usable.length - 1 ? (scene.progressionStage === "PAYOFF" ? "payoff" : "progression") : "progression",
      narrationRef: {
        semanticSceneId: scene.sceneId,
        sentenceIds: chunk.sentenceIds,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        spanHash: stableHash({ text: chunk.text, startOffset: chunk.startOffset, endOffset: chunk.endOffset }),
      },
      parentTreatmentHash: scene.treatment.treatmentHash,
      parentSemanticRevisionHash: proposition.semanticRevisionHash,
      coreMeaning: chunk.text,
      newInformation: chunk.text,
      viewerShouldUnderstand: proposition.consequence,
      visualThesis: renderVeronicaVisibleThesis(proposition),
      subject: projected.subjectRequirement,
      action: projected.action,
      state: `${proposition.polarity}; ${proposition.stateRelation}; ${proposition.consequence}`,
      environment: projected.environment,
      composition: {
        description: projected.composition,
        camera: projected.camera,
        lighting: scene.treatment.lighting,
        subtitleSafeAreaRequired: true,
      },
      continuationOfPreviousBeat: index > 0,
      referenceRequirements: referenceRequirements(plan, scene),
      assetDecision: "new-image",
      reuseSourceBeatId: null,
      timingWeight: openingWeights[index] ?? 1,
      boundaryKind: "semantic-subspan-aligned",
    };
  });
}

interface DensityEvent {
  readonly visualBeatId?: string;
  readonly assetId: string;
  readonly startMs: number;
  readonly durationMs: number;
}

function materiallyDiffers(current: VisualBeatTreatmentV1, previous: VisualBeatTreatmentV1): boolean {
  const informationDiffers = normalize(current.newInformation) !== normalize(previous.newInformation);
  const visibleStateDiffers = ["subject", "action", "state", "environment"].some((field) =>
    normalize(current[field as "subject" | "action" | "state" | "environment"])
      !== normalize(previous[field as "subject" | "action" | "state" | "environment"]));
  return informationDiffers && visibleStateDiffers;
}

export function calculateVeronicaVisualDensityMetrics(input: {
  readonly semanticSceneCount: number;
  readonly beats: readonly VisualBeatTreatmentV1[];
  readonly events: readonly DensityEvent[];
}): VeronicaVisualDensityMetrics {
  const ordered = [...input.events].sort((left, right) => left.startMs - right.startMs);
  const seenAssets = new Set<string>();
  let sameAssetEventCount = 0;
  let firstNewAssetChangeMs: number | null = null;
  for (const event of ordered) {
    if (seenAssets.has(event.assetId)) sameAssetEventCount += 1;
    else {
      if (seenAssets.size > 0 && firstNewAssetChangeMs === null) firstNewAssetChangeMs = event.startMs;
      seenAssets.add(event.assetId);
    }
  }
  const assetsBefore = (endMs: number) => new Set(ordered.filter((event) => event.startMs < endMs).map((event) => event.assetId)).size;
  let longestContinuousSameAssetHoldMs = 0;
  let runAsset: string | null = null;
  let runStart = 0;
  let runEnd = 0;
  for (const event of ordered) {
    if (event.assetId === runAsset && event.startMs <= runEnd) runEnd = Math.max(runEnd, event.startMs + event.durationMs);
    else {
      longestContinuousSameAssetHoldMs = Math.max(longestContinuousSameAssetHoldMs, runEnd - runStart);
      runAsset = event.assetId;
      runStart = event.startMs;
      runEnd = event.startMs + event.durationMs;
    }
  }
  longestContinuousSameAssetHoldMs = Math.max(longestContinuousSameAssetHoldMs, runEnd - runStart);
  const priorByScene = new Map<string, VisualBeatTreatmentV1>();
  const informationGain = input.beats.map((beat) => {
    const previous = priorByScene.get(beat.sceneId);
    const addsMaterialInformation = !previous || materiallyDiffers(beat, previous);
    priorByScene.set(beat.sceneId, beat);
    return { beatId: beat.beatId, newInformationHash: stableHash(beat.newInformation), addsMaterialInformation };
  });
  const redundantPaidImageCandidateBeatIds = informationGain
    .filter((gain) => !gain.addsMaterialInformation && input.beats.find((beat) => beat.beatId === gain.beatId)?.assetDecision === "new-image")
    .map((gain) => gain.beatId);
  const timelineStart = ordered[0]?.startMs ?? 0;
  const timelineEnd = ordered.reduce((end, event) => Math.max(end, event.startMs + event.durationMs), timelineStart);
  return {
    semanticSceneCount: input.semanticSceneCount,
    visualBeatCount: input.beats.length,
    visualEventCount: ordered.length,
    uniqueCanonicalAssetCount: seenAssets.size,
    newImageBeatCount: input.beats.filter((beat) => beat.assetDecision === "new-image").length,
    reuseWithMotionBeatCount: input.beats.filter((beat) => beat.assetDecision === "reuse-with-motion").length,
    reuseWithCropBeatCount: input.beats.filter((beat) => beat.assetDecision === "reuse-with-crop").length,
    reuseExistingAssetBeatCount: input.beats.filter((beat) => beat.assetDecision === "reuse-existing-asset").length,
    sameAssetEventCount,
    firstNewAssetChangeMs,
    uniqueAssetsInFirst5Seconds: assetsBefore(5_000),
    uniqueAssetsInFirst10Seconds: assetsBefore(10_000),
    uniqueAssetsInFirst15Seconds: assetsBefore(15_000),
    longestContinuousSameAssetHoldMs,
    longestSemanticBeatHoldMs: ordered.reduce((longest, event) => Math.max(longest, event.durationMs), 0),
    averageCanonicalAssetHoldMs: seenAssets.size === 0 ? 0 : Math.round(((timelineEnd - timelineStart) / seenAssets.size) * 1_000) / 1_000,
    redundantPaidImageCandidateBeatIds,
    informationGain,
    higherImageDensityThanOnePerScene: seenAssets.size > input.semanticSceneCount,
  };
}

function predictedDensityEvents(plan: PositioningVisualPlanV2, beats: readonly VisualBeatTreatmentV1[]): readonly DensityEvent[] {
  const assetByBeat = new Map<string, string>();
  return plan.scenes.flatMap((scene) => {
    const siblings = beats.filter((beat) => beat.sceneId === scene.sceneId);
    const total = siblings.reduce((sum, beat) => sum + beat.timingWeight, 0);
    let cursor = scene.startMs;
    return siblings.map((beat, index) => {
      const assetId = beat.assetDecision === "new-image"
        ? beat.beatId
        : assetByBeat.get(beat.reuseSourceBeatId ?? "") ?? `invalid-reuse:${beat.beatId}`;
      assetByBeat.set(beat.beatId, assetId);
      const durationMs = index === siblings.length - 1
        ? scene.startMs + scene.durationMs - cursor
        : Math.round(scene.durationMs * (beat.timingWeight / total));
      const event = { visualBeatId: beat.beatId, assetId, startMs: cursor, durationMs };
      cursor += durationMs;
      return event;
    });
  });
}

function beatStarts(plan: PositioningVisualPlanV2, beats: readonly VisualBeatTreatmentV1[]): Map<string, number> {
  const starts = new Map<string, number>();
  for (const scene of plan.scenes) {
    const siblings = beats.filter((beat) => beat.sceneId === scene.sceneId);
    const total = siblings.reduce((sum, beat) => sum + beat.timingWeight, 0);
    let cursor = scene.startMs;
    for (const beat of siblings) {
      starts.set(beat.beatId, cursor);
      cursor += Math.round(scene.durationMs * (beat.timingWeight / Math.max(total, 0.001)));
    }
  }
  return starts;
}

export function validateVeronicaVisualBeatPlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly beats: readonly VisualBeatTreatmentV1[];
  readonly sequenceDiversity?: ReturnType<typeof analyzeVeronicaSequenceDiversity>;
  readonly candidateSelection?: VeronicaVisualBeatPlanV1["candidateSelection"];
}) {
  const findings: VeronicaVisualBeatPlanV1["quality"]["findings"][number][] = [];
  const beatIds = new Set(input.beats.map((beat) => beat.beatId));
  for (const scene of input.plan.scenes) {
    const siblings = input.beats.filter((beat) => beat.sceneId === scene.sceneId);
    if (siblings.length === 0) throw new Error(`VERONICA_VISUAL_BEAT_SCENE_EMPTY:${scene.sceneId}`);
    siblings.forEach((beat, index) => {
      const previous = siblings[index - 1];
      if (previous && beat.assetDecision === "new-image"
        && normalize(previous.newInformation) === normalize(beat.newInformation)
        && normalize(previous.subject) === normalize(beat.subject)
        && normalize(previous.action) === normalize(beat.action)
        && normalize(previous.state) === normalize(beat.state)
        && normalize(previous.environment) === normalize(beat.environment)) {
        findings.push({
          code: "REDUNDANT_SIBLING_BEAT",
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: "Secondary beat repeats subject, visible action, and environment without adding a material visual state.",
        });
      }
      if (!overlapsParent(beat, scene)) {
        findings.push({
          code: "BEAT_OUTSIDE_PARENT_MEANING",
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: "Visual beat has no meaningful lexical grounding in its parent scene treatment/proposition.",
        });
      }
      if (beat.assetDecision !== "new-image" && (!beat.reuseSourceBeatId || !beatIds.has(beat.reuseSourceBeatId))) {
        findings.push({
          code: "INVALID_REUSE_SOURCE",
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: "Reuse decision requires a valid canonical source beat.",
        });
      }
      const causalEvidence = assessVeronicaRemovalConsequenceEvidence(
        beat,
        scene.semanticProposition?.stateRelation,
      );
      if (!causalEvidence.passes) {
        findings.push({
          code: "CAUSE_CONSEQUENCE_EVIDENCE_INCOMPLETE",
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: "A removal-enablement beat must visibly show the removed obstacle, the buyer's enabled action, and their causal connection in the same text-free frame.",
        });
      }
      for (const code of assessVeronicaParentChildSemanticCompatibility({
        parentActionOwnerRole: scene.treatment.actionOwnerRole ?? scene.semanticProposition?.actorRole ?? "none",
        parentNarration: scene.narrationAnchor.slice(beat.narrationRef.startOffset, beat.narrationRef.endOffset),
        child: beat,
      })) {
        findings.push({
          code,
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: code === "ACTION_OWNER_INVERSION"
            ? "The child assigns the causal intervention to a role that contradicts the parent action owner."
            : code === "STATE_ROLE_INVERSION"
              ? "The child does not preserve distinct causal and outcome roles in the visible transition."
              : code === "SOURCE_DOMAIN_LOST"
                ? "The child outcome omits visible evidence of the source-supported causal mechanism."
                : "The child actor relationship has no semantic grounding in its exact narration evidence.",
        });
      }
    });
  }
  for (const beatId of input.candidateSelection?.noSafeCandidateBeatIds ?? []) {
    const beat = input.beats.find((candidate) => candidate.beatId === beatId);
    findings.push({
      code: "NO_SAFE_BEAT_CANDIDATE",
      severity: "blocker",
      sceneId: beat?.sceneId ?? input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
      beatId,
      message: "No source-grounded, actor-authorized, state-faithful candidate passed every semantic hard gate.",
    });
  }
  const starts = beatStarts(input.plan, input.beats);
  const beatsInFirst5Seconds = [...starts.values()].filter((start) => start < 5_000).length;
  const beatsInFirst10Seconds = [...starts.values()].filter((start) => start < 10_000).length;
  const beatsInFirst15Seconds = [...starts.values()].filter((start) => start < 15_000).length;
  const densityEvents = predictedDensityEvents(input.plan, input.beats);
  const density = calculateVeronicaVisualDensityMetrics({ semanticSceneCount: input.plan.scenes.length, beats: input.beats, events: densityEvents });
  for (const beatId of density.redundantPaidImageCandidateBeatIds) {
    const beat = input.beats.find((candidate) => candidate.beatId === beatId)!;
    findings.push({
      code: "REDUNDANT_PAID_IMAGE_CANDIDATE",
      severity: "blocker",
      sceneId: beat.sceneId,
      beatId,
      message: "A paid new-image beat must add both distinct semantic information and a materially changed visible state.",
    });
  }
  if (input.beats.length > input.plan.scenes.length && !density.higherImageDensityThanOnePerScene) {
    findings.push({
      code: "EVENT_ONLY_DENSITY_INCREASE",
      severity: "warning",
      sceneId: input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
      beatId: input.beats[0]?.beatId ?? null,
      message: "Visual event count increased without increasing unique canonical image density.",
    });
  }
  const policy = resolveVeronicaProductionPolicy(input.plan.format).visualBeatPacing;
  if (policy.enabled && (density.uniqueAssetsInFirst5Seconds < policy.openingTargets.first5Seconds[0]
    || density.uniqueAssetsInFirst10Seconds < policy.openingTargets.first10Seconds[0])) {
    findings.push({
      code: "OPENING_STATIC_HOLD",
      severity: "warning",
      sceneId: input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
      beatId: input.beats[0]?.beatId ?? null,
      message: "Opening unique-image density is below the Veronica Short profile guidance; review whether narration supports another meaningful state.",
    });
  }
  const openingScene = input.plan.scenes[0];
  const openingHasMultiplePropositions = Boolean(
    openingScene?.semanticProposition
    && openingScene.semanticProposition.visualMechanism !== "UNRESOLVED"
    && semanticChunks(openingScene.narrationAnchor).length >= 2,
  );
  if (policy.enabled && openingHasMultiplePropositions && density.uniqueAssetsInFirst15Seconds <= 1) {
    findings.push({
      code: "INSUFFICIENT_SEMANTIC_ASSET_DENSITY",
      severity: "blocker",
      sceneId: input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
      beatId: input.beats[0]?.beatId ?? null,
      message: "Multiple opening propositions remain on one canonical asset through the first fifteen seconds; semantic beat materialization is required.",
    });
  }
  const longOpeningRun = densityEvents.some((event) => event.startMs < 10_000 && event.durationMs >= 8_000);
  if (policy.enabled && longOpeningRun) findings.push({
    code: "LONG_STATIC_OPENING_ASSET_HOLD",
    severity: "warning",
    sceneId: input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
    beatId: input.beats[0]?.beatId ?? null,
    message: "An opening canonical image holds for at least eight seconds and requires explicit editorial justification.",
  });
  const sequenceDiversity = input.sequenceDiversity ?? analyzeVeronicaSequenceDiversity({ plan: input.plan, beats: input.beats });
  return qualitySchema.parse({
    status: findings.some((finding) => finding.severity === "blocker") || sequenceDiversity.status === "BLOCK" || sequenceDiversity.status === "REVIEW_REQUIRED"
      ? "FAIL"
      : findings.length > 0 || sequenceDiversity.status === "WARN" ? "WARN" : "PASS",
    findings,
    beatsInFirst5Seconds,
    beatsInFirst10Seconds,
    beatsInFirst15Seconds,
    density,
    sequenceDiversity,
  });
}

export function deriveVeronicaVisualBeatPlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly overrides?: VeronicaVisualBeatOverrideArtifact;
}): VeronicaVisualBeatPlanV1 {
  const policy = resolveVeronicaProductionPolicy(input.plan.format).visualBeatPacing;
  if (input.overrides && input.overrides.baseCanonicalImagePlanHash !== input.plan.canonicalImagePlanHash) {
    throw new Error("VERONICA_VISUAL_BEAT_OVERRIDE_STALE");
  }
  const overrideByScene = new Map(input.overrides?.scenes.map((entry) => [entry.sceneId, entry.beats] as const) ?? []);
  const lockedBeatIds = new Set(input.overrides?.scenes.flatMap((entry) => entry.beats.map((beat) => beat.beatId)) ?? []);
  const rawBeats = input.plan.scenes.flatMap((scene): VisualBeatTreatmentV1[] => {
    const overrides = overrideByScene.get(scene.sceneId);
    const values = overrides?.map((override) => ({
      version: 1 as const,
      beatId: override.beatId,
      sceneId: scene.sceneId,
      role: override.role as VisualBeatRole,
      narrationRef: narrationRefForEvidence(scene, override.sourceEvidence),
      parentTreatmentHash: scene.treatment.treatmentHash,
      parentSemanticRevisionHash: scene.semanticProposition?.semanticRevisionHash ?? stableHash({
        sceneId: scene.sceneId,
        narrationAnchor: scene.narrationAnchor,
        compatibility: "unfinalized-parent",
      }),
      coreMeaning: override.coreMeaning,
      newInformation: override.newInformation,
      viewerShouldUnderstand: override.viewerShouldUnderstand,
      visualThesis: override.visualThesis,
      subject: override.subject,
      action: override.action,
      ...(override.actorRelation ? { actorRelation: override.actorRelation } : {}),
      state: override.state,
      environment: override.environment,
      composition: override.composition,
      continuationOfPreviousBeat: override.continuationOfPreviousBeat,
      referenceRequirements: referenceRequirements(input.plan, scene),
      assetDecision: override.assetDecision as VisualBeatAssetDecision,
      reuseSourceBeatId: override.reuseSourceBeatId,
      timingWeight: override.timingWeight,
      boundaryKind: override.boundaryKind as VisualBeatBoundaryKind,
    })) ?? automaticSceneBeats(input.plan, scene);
    return values.map((value) => visualBeatTreatmentV1Schema.parse({
      ...value,
      beatHash: stableHash(value),
    }));
  });
  const selected = selectVeronicaBeatCandidateSequence({ plan: input.plan, beats: rawBeats, lockedBeatIds });
  const beats = selected.beats;
  const quality = validateVeronicaVisualBeatPlan({
    plan: input.plan,
    beats,
    sequenceDiversity: selected.analysis,
    candidateSelection: selected.diagnostics,
  });
  const base = {
    schemaVersion: VERONICA_VISUAL_BEAT_PLAN_VERSION,
    policyVersion: `${policy.policyVersion}+${VERONICA_VISUAL_BEAT_PLANNER_VERSION}`,
    contentId: input.plan.contentId,
    semanticSceneCount: input.plan.scenes.length,
    beats,
    quality,
    candidateSelection: selected.diagnostics,
  } as const;
  return veronicaVisualBeatPlanV1Schema.parse({
    ...base,
    beatPlanHash: stableHash(base),
  });
}

function eventKind(beat: VisualBeatTreatmentV1): VisualEventKind {
  if (beat.assetDecision === "reuse-with-crop") return "alternate-crop";
  if (beat.assetDecision === "reuse-with-motion") return "slow-push";
  if (beat.role === "reaction" || beat.role === "payoff") return "reveal";
  if (beat.role === "contrast") return "split-composition";
  return "establishing-crop";
}

function eventParameters(kind: VisualEventKind) {
  return {
    startScale: kind === "alternate-crop" ? 1.08 : 1,
    endScale: kind === "slow-push" ? 1.16 : kind === "reveal" ? 1.08 : 1.04,
    anchor: kind === "alternate-crop" ? "prop" as const : "center" as const,
  };
}

export function materializeVeronicaVisualBeatPlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly beatPlan: VeronicaVisualBeatPlanV1;
}): PositioningVisualPlanV2 {
  if (input.beatPlan.quality.status === "FAIL") {
    throw new VeronicaVisualBeatQualityBlock(input.plan.contentId, input.beatPlan);
  }
  const {
    imagePromptCompilation: _staleCompilationTelemetry,
    providerReadiness: _staleProviderReadiness,
    hierarchicalReadiness: _staleHierarchicalReadiness,
    ...sourcePlan
  } = input.plan;
  const assets: GeneratedVisualAsset[] = [];
  const events: VisualEvent[] = [];
  const assetByBeat = new Map<string, GeneratedVisualAsset>();
  const scenes = input.plan.scenes.map((scene) => {
    const sourceAsset = input.plan.assets.find((asset) => asset.sceneId === scene.sceneId);
    if (!sourceAsset) throw new Error(`VERONICA_VISUAL_BEAT_SOURCE_ASSET_MISSING:${scene.sceneId}`);
    const siblings = input.beatPlan.beats.filter((beat) => beat.sceneId === scene.sceneId);
    const totalWeight = siblings.reduce((sum, beat) => sum + beat.timingWeight, 0);
    let cursor = scene.startMs;
    const sceneEventIds: string[] = [];
    siblings.forEach((beat, index) => {
      let asset: GeneratedVisualAsset;
      if (beat.assetDecision === "new-image") {
        const assetId = `${scene.sceneId}-beat-${String(index + 1).padStart(2, "0")}`.toLowerCase();
        const {
          projectionProvenance: _staleProjection,
          promptCompilation: _staleCompilation,
          ...sourceAssetBase
        } = sourceAsset;
        asset = {
          ...sourceAssetBase,
          assetId,
          visualBeatId: beat.beatId,
          visualBeatHash: beat.beatHash,
          visualBeatAssetDecision: beat.assetDecision,
          semanticPurpose: beat.visualThesis,
          prompt: beat.visualThesis,
          semanticFingerprint: stableHash({ sceneId: scene.sceneId, beatHash: beat.beatHash }),
          generatedAssetCacheKey: stableHash({
            sceneId: scene.sceneId,
            beatHash: beat.beatHash,
            parentTreatmentHash: beat.parentTreatmentHash,
            referenceAssetId: sourceAsset.referenceAssetId,
          }),
        };
        assets.push(asset);
        assetByBeat.set(beat.beatId, asset);
      } else {
        const source = beat.reuseSourceBeatId ? assetByBeat.get(beat.reuseSourceBeatId) : undefined;
        if (!source) throw new Error(`VERONICA_VISUAL_BEAT_REUSE_SOURCE_MISSING:${beat.beatId}`);
        asset = source;
        assetByBeat.set(beat.beatId, source);
      }
      const durationMs = index === siblings.length - 1
        ? scene.startMs + scene.durationMs - cursor
        : Math.round(scene.durationMs * (beat.timingWeight / totalWeight));
      const timingProvenanceHash = stableHash({
        sceneId: scene.sceneId,
        beatId: beat.beatId,
        boundaryKind: beat.boundaryKind,
        timingWeight: beat.timingWeight,
      });
      const kind = eventKind(beat);
      const eventBase = {
        eventId: `${beat.beatId}-event`.toLowerCase(),
        sceneId: scene.sceneId,
        assetId: asset.assetId,
        visualBeatId: beat.beatId,
        beatBoundaryKind: beat.boundaryKind,
        timingProvenanceHash,
        kind,
        startMs: cursor,
        durationMs,
        aspectRatio: input.plan.aspectRatio,
        safeRegionIds: ["subject", "overlay", "subtitle"] as const,
        semanticFocus: beat.viewerShouldUnderstand,
        deterministicParameters: eventParameters(kind),
      };
      events.push({ ...eventBase, renderCacheKey: stableHash(eventBase) });
      sceneEventIds.push(eventBase.eventId);
      cursor += durationMs;
    });
    return {
      ...scene,
      assetId: assetByBeat.get(siblings[0]!.beatId)!.assetId,
      eventIds: sceneEventIds,
    };
  });
  const base = {
    ...sourcePlan,
    scenes,
    assets,
    visualEvents: events,
    visualBeatPlan: input.beatPlan,
    canonicalImagePlanHash: stableHash({
      assets: assets.map((asset) => ({
        assetId: asset.assetId,
        beatId: asset.visualBeatId,
        beatHash: asset.visualBeatHash,
        cacheKey: asset.generatedAssetCacheKey,
      })),
    }),
    renderEventPlanHash: stableHash(events),
  };
  return finalizeSemanticPlanHash({ ...base, planHash: input.plan.planHash }) as PositioningVisualPlanV2;
}

export class VeronicaVisualBeatQualityBlock extends VeronicaExpectedDeterministicOutcomeError {
  readonly candidateSelection: VeronicaVisualBeatPlanV1["candidateSelection"];

  constructor(contentId: string, beatPlan: VeronicaVisualBeatPlanV1) {
    const beatFindings: VeronicaDeterministicFinding[] = beatPlan.quality.findings
      .filter((entry) => entry.severity === "blocker")
      .map((entry) => {
        const sourceSemanticReference = entry.beatId
          ? beatPlan.beats.find((beat) => beat.beatId === entry.beatId)?.parentSemanticRevisionHash
          : undefined;
        return {
          code: entry.code,
          stage: "visual-beat-quality",
          message: entry.message,
          contentId,
          sceneId: entry.sceneId,
          beatId: entry.beatId,
          evidencePaths: [`visualBeatPlan.quality.findings:${entry.sceneId}:${entry.beatId ?? "scene"}`],
          rootCause: entry.code,
          retryable: false,
          paidStageEligible: false,
          ...(sourceSemanticReference ? { sourceSemanticReference } : {}),
        };
      });
    const sequenceFindings: VeronicaDeterministicFinding[] = beatPlan.quality.sequenceDiversity.findings
      .filter((entry) => entry.severity !== "warning")
      .map((entry) => ({
        code: entry.code,
        stage: "visual-beat-sequence-quality",
        message: entry.evidence,
        contentId,
        beatIds: entry.beatIds,
        evidencePaths: [`visualBeatPlan.quality.sequenceDiversity.findings:${entry.window}`],
        rootCause: entry.code,
        retryable: false,
        paidStageEligible: false,
      }));
    const findings = [...beatFindings, ...sequenceFindings];
    const codes = [...new Set(findings.map((finding) => finding.code))];
    super(
      "BLOCK",
      "VERONICA_VISUAL_BEAT_QUALITY_FAILED",
      "visual-beat-quality",
      findings,
      `VERONICA_VISUAL_BEAT_QUALITY_FAILED:${codes.join(",")}`,
    );
    this.name = "VeronicaVisualBeatQualityBlock";
    this.candidateSelection = beatPlan.candidateSelection;
  }
}

export async function persistVeronicaVisualBeatPlan(input: {
  readonly path: string;
  readonly plan: VeronicaVisualBeatPlanV1;
}): Promise<void> {
  await writeJsonAtomic(input.path, input.plan);
}
