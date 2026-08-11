import { z } from "zod";
import type { GeneratedVisualAsset, PlannedScene, PositioningVisualPlanV2, PositioningVisualTreatment, VeronicaActionOwnerRole, VeronicaActorAssignment, VeronicaNarrativeActorRole, VeronicaProviderReadinessResult, VeronicaSemanticProposition, VeronicaSemanticQualityMetrics, VisualEvent, VisualEventKind } from "./positioning-visual-contracts.js";
import { calculateDiversityMetrics, semanticTokens, stableHash } from "./positioning-visual-semantics.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";
import type { SemanticRemediationDirective } from "./source-grounded-visual-qa.js";
import { assessVeronicaNarrationClaimIntegrity, assessVeronicaPropositionInternalCoherence, assessVeronicaSourceGroundedSemanticConsistency, assessVeronicaTreatmentPropositionCompatibility, assessVeronicaVisibleThesisQuality, classifyVeronicaSemanticPolarity, deriveVeronicaSemanticProposition, providerPromptInternalLanguageReasons, providerPromptLexicalIntegrityReasons, renderVeronicaVisibleThesis, resolveVeronicaVisiblePrimaryActionOwner, visualTreatmentFromProposition, VERONICA_PROMPT_SANITATION_VERSION, VERONICA_PROVIDER_PROMPT_QUALITY_VERSION, VERONICA_TREATMENT_COMPATIBILITY_VERSION } from "./veronica-semantic-quality.js";

export const VERONICA_PRE_IMAGE_SEMANTIC_REVIEW_VERSION = "veronica-pre-image-semantic-review.v4" as const;
export const VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION = "veronica-pre-image-semantic-gate.v7" as const;
export const VERONICA_VIEWER_VISIBLE_FAMILY_VERSION = "veronica-viewer-visible-families.v1" as const;
export const VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION = "veronica-state-aware-provider-projection.v6" as const;

const findingSchema = z.strictObject({
  code: z.enum(["ABSTRACT_PROP_DRIFT", "OCCUPATION_PROXY_DRIFT", "VISIBLE_THESIS_REQUIRED", "MALFORMED_VISIBLE_THESIS", "BUYER_PERSPECTIVE_REQUIRED", "SEMANTICALLY_DECORATIVE_SCENE", "NARRATION_RELATIONSHIP_MISMATCH", "INSTANT_READ_FAILURE", "HARMFUL_REPETITION", "VIEWER_VISIBLE_REPETITION_REVIEW", "MULTI_STATE_STILL_AMBIGUITY", "INTENTIONAL_MULTI_STATE_REVIEW", "TEXT_FREE_ABSTRACTION_RISK", "MOTIF_OVERUSE_RISK", "WEAK_BUYER_ACTION", "PROVIDER_COMPOSITION_COMPLEXITY", "SEMANTIC_REMEDIATION_LOW_CONFIDENCE", "REMEDIATION_TEMPLATE_COLLAPSE", "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", "PROVIDER_PROMPT_NOT_READY", "INCOMPLETE_NARRATION_CLAIM", "SEMANTIC_POLARITY_MISMATCH", "SEMANTIC_PROPOSITION_INTERNAL_CONTRADICTION", "TREATMENT_PROPOSITION_COMPATIBILITY", "PROVIDER_PROJECTION_SEMANTIC_MISMATCH", "PROVIDER_PROMPT_SEMANTIC_BLOCKER", "PROVIDER_PROMPT_LEXICAL_CORRUPTION", "CROSS_EPISODE_MOTIF_LEAKAGE"]),
  severity: z.enum(["info", "warning", "error", "blocker"]),
  message: z.string().min(1),
});

export const veronicaPreImageSemanticReviewSchema = z.strictObject({
  schemaVersion: z.literal(VERONICA_PRE_IMAGE_SEMANTIC_REVIEW_VERSION),
  contentId: z.string().min(1), sceneId: z.string().min(1), plannerVersion: z.string().min(1),
  semanticHash: z.string().regex(/^[a-f0-9]{64}$/u), treatmentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  reviewVersion: z.string().min(1), status: z.enum(["pass", "manual-review-required"]),
  findings: z.array(findingSchema), requiredEdits: z.array(z.string()),
  instantReadScore: z.number().min(0).max(1), narrationAlignmentScore: z.number().min(0).max(1),
  visibleThesisScore: z.number().min(0).max(1), buyerPerspectiveScore: z.number().min(0).max(1),
  visualInformationGainScore: z.number().min(0).max(1), continuityScore: z.number().min(0).max(1),
  qualityChecks: z.strictObject({ explicitThesis: z.boolean(), linguisticSanity: z.boolean(), finitePredicate: z.boolean(), narrationGrounded: z.boolean(), visuallyExpressible: z.boolean(), sceneSpecific: z.boolean(), distinctFromPrevious: z.boolean(), buyerConsequenceSupported: z.boolean() }),
  scoreProvenance: z.literal("deterministic-semantic-quality-check-ratio"),
  driftFlags: z.array(findingSchema.shape.code), approvedForProviderRequest: z.literal(false),
});
export type VeronicaPreImageSemanticReview = z.infer<typeof veronicaPreImageSemanticReviewSchema>;

const abstract = /\b(?:prism|translucent planes?|shadow grid|light laborator|floating glass|geometric negative-space|symbolic sculpture|abstract-conceptual)\b/iu;
const occupationTerms = "hospitality|retail|wellness|pottery|bak(?:er|ery)|hotelier|hotel|beautician|beauty business|craftsperson|shopkeeper|shop floor|factory worker|designer|workshop|service counter|technical consultant|creative director";
const occupation = new RegExp(`\\b(?:${occupationTerms})\\b`, "iu");
const occupationGlobal = new RegExp(`\\b(?:${occupationTerms})\\b`, "giu");
const buyerAction = /\b(?:hesitat\w*|withhold\w*|scan\w*|ignor\w*|stop\w*|approach\w*|choos\w*|select\w*|reject\w*|compar\w*|remember\w*|recall\w*|refer\w*|follow\w*|cross\w*|return\w*|commit\w*|recogniz\w*|gather\w*|arriv\w*|paus\w*|overlook\w*|inspect\w*|understand\w*|trust\w*|categor\w*|point\w*|turn\w*|trace\w*|stead\w*)\b/iu;
const doorway = /\b(?:doorway|threshold|foothold|widen|narrow|crossing)\b/iu;
const genericPositioning = /\b(?:niche|positioning|buyer|customer|prospect|referral|recognition|expertise|offer|remember)\b/iu;
const buyerPerspectiveNarration = /\b(?:buyer|customer|prospect|client|audience|visitor|people|person|market|someone|they|them)\b/iu;

function clamp(value: number): number { return Math.max(0, Math.min(1, Math.round(value * 100) / 100)); }
function normalized(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }

export type VeronicaStillStateComplexity = "SINGLE_STATE" | "DECISIVE_TRANSITION_MOMENT" | "MULTI_STATE_REQUIRED";

function family(value: string): string { return normalized(value).replace(/\b(?:the|a|an|with|and|of|to|in)\b/gu, " ").replace(/\s+/gu, " ").trim(); }

function narrationCentersOneProfession(value: string): boolean {
  const mentions = new Set((value.match(occupationGlobal) ?? []).map((match) => {
    const term = normalized(match);
    if (/^bak/iu.test(term)) return "baking";
    if (/hotel|hospitality/iu.test(term)) return "hospitality";
    if (/beaut|wellness/iu.test(term)) return "personal-care";
    if (/design|creative director|mood board/iu.test(term)) return "design";
    if (/shop|retail|service counter/iu.test(term)) return "retail";
    return term;
  }));
  return mentions.size === 1 && !/\b(?:if you|such as|for example|including|whether|multiple professions?)\b/iu.test(value);
}

function causalActionSignature(value: string): string {
  return normalized(value).replace(/\b(?:a|an|the|one|buyer|customer|client|professional|expert)\b/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Stable, viewer-visible categories; rates below are adjacent scene-transition reuse rates. */
export function normalizeVeronicaViewerVisibleFamilies(scene: PlannedScene, motif: string | undefined) {
  const fingerprint = scene.treatment.viewerVisibleFingerprint ?? {
    strategyFamily: scene.treatment.strategy, subjectArchetype: scene.treatment.subjectRequirement,
    environmentArchetype: scene.treatment.environment, compositionArchetype: scene.treatment.composition,
    cameraArchetype: scene.treatment.camera, lightingArchetype: "editorial daylight",
    actionArchetype: scene.treatment.action, dominantObjectArchetype: scene.treatment.props[0] ?? "scene-object",
    motionArchetype: (scene.treatment.motionOpportunities ?? []).join(" "),
  };
  const continuityIdentityId = scene.treatment.grammar?.continuityIdentityId ?? "independent";
  const environment = `${fingerprint.environmentArchetype} ${scene.treatment.environment}`;
  const camera = `${fingerprint.cameraArchetype} ${scene.treatment.camera}`;
  const interaction = `${fingerprint.actionArchetype} ${scene.treatment.action}`;
  const environmentFamily = /doorway|threshold|foothold|widen|access/iu.test(environment) ? "threshold-environment" : /consultation|proof surface|evidence/iu.test(environment) ? "evidence-consultation" : /concourse|crowd|public/iu.test(environment) ? "public-concourse" : family(fingerprint.environmentArchetype || scene.treatment.environment);
  const cameraFamily = /(?:32|35|40)mm.*(?:threshold|doorway|buyer.height|lateral)/iu.test(camera) ? "normal-wide-threshold-perspective" : /over.?shoulder|conversational/iu.test(camera) ? "shoulder-height-documentary" : /locked comparison|split/iu.test(camera) ? "comparison-view" : family(fingerprint.cameraArchetype || scene.treatment.camera);
  const interactionFamily = /refer|introduc|direct/iu.test(interaction) ? "peer-referral" : /widen|adjacent.*arriv|opening threshold/iu.test(interaction) ? "threshold-expansion" : /hesitat|choos|commit|cross/iu.test(interaction) ? "threshold-decision" : /recogniz|evidence|scan/iu.test(interaction) ? "evidence-recognition" : /contrast|overlook|remember/iu.test(interaction) ? "buyer-comparison" : family(fingerprint.actionArchetype || scene.treatment.action);
  return {
    sceneId: scene.sceneId,
    strategyFamily: fingerprint.strategyFamily,
    environmentFamily,
    compositionFamily: family(fingerprint.compositionArchetype || scene.treatment.composition),
    cameraFamily,
    interactionFamily,
    dominantObjectFamily: /doorway|threshold|foothold|access/iu.test(`${fingerprint.dominantObjectArchetype} ${scene.treatment.props.join(" ")}`) ? "threshold-object" : family(fingerprint.dominantObjectArchetype),
    motionFamily: family(fingerprint.motionArchetype || (scene.treatment.motionOpportunities ?? []).join(" ")),
    diagramFamily: scene.treatment.diagram?.type ?? "none",
    motifFamily: motif && /doorway|threshold|widen|foothold|access/iu.test(`${scene.visibleThesis} ${scene.treatment.action} ${scene.treatment.props.join(" ")}`) ? "threshold" : "none",
    continuityIdentityFamily: continuityIdentityId,
  } as const;
}

/** Classifies temporal language without assuming any scene identity. */
export function classifyVeronicaStillStateComplexity(narration: string, treatment: PositioningVisualTreatment): VeronicaStillStateComplexity {
  const combined = normalized(`${narration} ${treatment.action} ${treatment.composition}`);
  const transition = /\b(?:then|later|after|before|first|widen\w*|cross\w*|reveal\w*|arriv\w*|transition\w*|from .+ to)\b/iu.test(combined);
  const decisive = /\b(?:decisive|threshold|doorway|opening|widen\w*|cross\w*|arrival|handoff|contrast|split)\b/iu.test(combined);
  return transition && decisive ? "DECISIVE_TRANSITION_MOMENT" : transition ? "MULTI_STATE_REQUIRED" : "SINGLE_STATE";
}

function resolveFinalStateComplexity(scene: PlannedScene, format: PositioningVisualPlanV2["format"]): VeronicaStillStateComplexity {
  const polarity = scene.semanticProposition?.polarity;
  const relation = scene.semanticProposition?.stateRelation ?? "STABLE";
  const contrast = scene.semanticProposition?.contrast;
  const materiallyDistinctStates = contrast !== undefined
    && normalized(contrast.initialState ?? "") !== normalized(contrast.desiredState ?? "");
  if (relation === "CONDITIONAL_ALTERNATIVES") return format === "long" && materiallyDistinctStates ? "MULTI_STATE_REQUIRED" : "DECISIVE_TRANSITION_MOMENT";
  if (relation === "CONTRAST") {
    if (format === "short" || !materiallyDistinctStates) return "DECISIVE_TRANSITION_MOMENT";
    const simultaneousFrame = /\b(?:split|side.by.side|simultaneous|comparison)\b/iu.test(`${scene.treatment.composition} ${scene.treatment.strategy}`);
    return simultaneousFrame ? "DECISIVE_TRANSITION_MOMENT" : "MULTI_STATE_REQUIRED";
  }
  if (relation === "CAUSAL_BEFORE_AFTER" || relation === "SEQUENTIAL_PROGRESSION" || polarity === "TRANSITION_NEGATIVE_TO_POSITIVE" || polarity === "TRANSITION_POSITIVE_TO_NEGATIVE") {
    if (format === "short") return "DECISIVE_TRANSITION_MOMENT";
    return materiallyDistinctStates ? "MULTI_STATE_REQUIRED" : "DECISIVE_TRANSITION_MOMENT";
  }
  if (scene.stateComplexity === "MULTI_STATE_REQUIRED" && format === "long") {
    // A temporal connector alone does not establish two independently
    // renderable conditions. Keep the sequence only when the source
    // proposition provides two distinct states; otherwise one decisive frame
    // avoids inventing a cosmetic before/after pair.
    return materiallyDistinctStates ? "MULTI_STATE_REQUIRED" : "DECISIVE_TRANSITION_MOMENT";
  }
  return scene.stateComplexity === "DECISIVE_TRANSITION_MOMENT" ? scene.stateComplexity : classifyVeronicaStillStateComplexity(scene.narrationAnchor, scene.treatment);
}

/**
 * Deterministic Veronica gate. It is intentionally provider-free: model output
 * may enrich prompts later, but it cannot bypass this structured semantic check.
 */
export function reviewVeronicaPreImageTreatment(input: {
  readonly contentId: string; readonly sceneId: string; readonly plannerVersion: string;
  readonly narration: string; readonly narrationAnchor: string; readonly visibleThesis?: string;
  readonly newInformation: string; readonly treatment: PositioningVisualTreatment;
  readonly previousTreatment?: PositioningVisualTreatment; readonly previousVisibleThesis?: string;
  readonly proposition?: VeronicaSemanticProposition; readonly selectedMotif?: string; readonly episodeMotifSupported?: boolean; readonly format?: PositioningVisualPlanV2["format"]; readonly stateComplexity?: VeronicaStillStateComplexity;
}): VeronicaPreImageSemanticReview {
  const relation = `${input.narration} ${input.narrationAnchor}`;
  const visual = `${input.treatment.strategy} ${input.treatment.subjectRequirement} ${input.treatment.environment} ${input.treatment.composition} ${input.treatment.action} ${input.treatment.props.join(" ")}`;
  const findings: z.infer<typeof findingSchema>[] = [];
  const stateComplexity = input.stateComplexity ?? classifyVeronicaStillStateComplexity(input.narration, input.treatment);
  const thesisQuality = assessVeronicaVisibleThesisQuality({ thesis: input.visibleThesis, narration: relation, treatment: input.treatment, ...(input.proposition ? { proposition: input.proposition } : {}), ...(input.previousVisibleThesis ? { previousThesis: input.previousVisibleThesis } : {}) });
  const claimIntegrity = input.proposition ? assessVeronicaNarrationClaimIntegrity(input.proposition.narrationClaim) : { status: "PASS" as const, reasons: [] };
  const propositionCoherence = input.proposition ? assessVeronicaPropositionInternalCoherence(input.proposition) : { status: "PASS" as const, reasons: [] };
  const treatmentCompatibility = input.proposition ? assessVeronicaTreatmentPropositionCompatibility({ treatment: input.treatment, proposition: input.proposition, narration: relation, ...(input.episodeMotifSupported !== undefined ? { episodeMotifSupported: input.episodeMotifSupported } : {}) }) : { status: "PASS" as const, reasons: [] };
  const sourceGrounding = input.proposition ? assessVeronicaSourceGroundedSemanticConsistency({ narration: input.narration, proposition: input.proposition, treatment: input.treatment, visibleThesis: input.visibleThesis }) : { status: "PASS" as const, reasons: [] };
  const buyerConsequenceSupported = input.proposition
    ? input.proposition.buyerConsequenceFamily !== "NONE" && input.proposition.confidence.consequence !== "LOW"
    : buyerAction.test(visual);
  const add = (code: z.infer<typeof findingSchema>["code"], severity: z.infer<typeof findingSchema>["severity"], message: string): void => { findings.push({ code, severity, message }); };
  const nativeDoorway = doorway.test(relation);
  const unsupportedDoorway = doorway.test(visual) && !nativeDoorway && !input.proposition?.narrationNativeMetaphor && !input.episodeMotifSupported;
  if (claimIntegrity.status === "FAIL") add("INCOMPLETE_NARRATION_CLAIM", "blocker", `Narration claim is incomplete: ${claimIntegrity.reasons.join(", ")}.`);
  if (propositionCoherence.status === "FAIL") add("SEMANTIC_PROPOSITION_INTERNAL_CONTRADICTION", "blocker", `Structured proposition contradicts itself: ${propositionCoherence.reasons.join(", ")}.`);
  if (treatmentCompatibility.status === "FAIL") add("TREATMENT_PROPOSITION_COMPATIBILITY", "blocker", `Treatment fields do not support the final proposition: ${treatmentCompatibility.reasons.join(", ")}.`);
  if (sourceGrounding.status === "FAIL") add("NARRATION_RELATIONSHIP_MISMATCH", "blocker", `Final proposition/treatment is not independently grounded in narration evidence: ${sourceGrounding.reasons.join(", ")}.`);
  if (input.proposition && /polarity-mismatch/iu.test(treatmentCompatibility.reasons.join(" "))) add("SEMANTIC_POLARITY_MISMATCH", "blocker", "Treatment polarity reverses the narration-supported state.");
  if (unsupportedDoorway) add("CROSS_EPISODE_MOTIF_LEAKAGE", "blocker", "Doorway/threshold treatment has no episode-local narration evidence.");
  if (abstract.test(visual) && (nativeDoorway || !/human|buyer|customer|person|expert/iu.test(visual))) add("ABSTRACT_PROP_DRIFT", "blocker", "Replace abstraction with the narration-native concrete relationship and visible human consequence.");
  if (genericPositioning.test(relation) && occupation.test(visual) && !narrationCentersOneProfession(relation)) add("OCCUPATION_PROXY_DRIFT", "blocker", "Use occupation-neutral buyer evidence; profession must not explain a generic positioning claim.");
  if (buyerPerspectiveNarration.test(relation) && (!buyerAction.test(visual) || !buyerConsequenceSupported)) add("BUYER_PERSPECTIVE_REQUIRED", "blocker", "Show the narration-supported buyer/customer consequence without changing primary action ownership.");
  if (!thesisQuality.checks.explicit) add("VISIBLE_THESIS_REQUIRED", "blocker", "Every provider-target scene requires an explicit visible cause-and-consequence thesis.");
  else {
    const malformedReasons = [!thesisQuality.checks.linguisticSanity ? "linguisticSanity" : "", !thesisQuality.checks.finitePredicate ? "finitePredicate" : "", !thesisQuality.checks.sceneSpecific ? "sceneSpecific" : ""].filter(Boolean);
    if (malformedReasons.length > 0) add("MALFORMED_VISIBLE_THESIS", "blocker", `Visible thesis failed deterministic semantic checks: ${malformedReasons.join(", ")}.`);
    if (!thesisQuality.checks.narrationGrounded) add("NARRATION_RELATIONSHIP_MISMATCH", "blocker", "The visible thesis is not grounded in the scene narration proposition.");
    if (!thesisQuality.checks.visuallyExpressible || !thesisQuality.checks.distinctFromPrevious) add("SEMANTICALLY_DECORATIVE_SCENE", "blocker", "The visible thesis must add a distinct, visually expressible causal fact.");
  }
  if (input.proposition && Object.values(input.proposition.confidence).some((confidence) => confidence === "LOW")) add("SEMANTIC_REMEDIATION_LOW_CONFIDENCE", "blocker", "Structured proposition extraction is too uncertain for an automatic provider treatment.");
  if (nativeDoorway && !doorway.test(visual)) add("NARRATION_RELATIONSHIP_MISMATCH", "blocker", "Prefer the narration-native doorway/threshold metaphor over indirect visual symbolism.");
  const repeatsPreviousCausalAction = input.previousTreatment !== undefined
    && causalActionSignature(input.previousTreatment.action) === causalActionSignature(input.treatment.action);
  if (input.newInformation.trim().length < 24 || repeatsPreviousCausalAction) add("SEMANTICALLY_DECORATIVE_SCENE", "blocker", "Add a new causal visual fact beyond the preceding scene; camera, setting, and prop changes alone do not create semantic information gain.");
  if (stateComplexity === "MULTI_STATE_REQUIRED") add(input.format === "long" ? "INTENTIONAL_MULTI_STATE_REVIEW" : "MULTI_STATE_STILL_AMBIGUITY", input.format === "long" ? "info" : "warning", input.format === "long" ? "Full-form sequence intentionally uses separately projected states." : "Project this temporal claim to one decisive transition moment, use deterministic motion, or request manual review.");
  if (input.previousTreatment && normalized(input.previousTreatment.environment) === normalized(input.treatment.environment) && normalized(input.previousTreatment.composition) === normalized(input.treatment.composition) && !nativeDoorway) {
    if (causalActionSignature(input.previousTreatment.action) === causalActionSignature(input.treatment.action)) add("HARMFUL_REPETITION", "blocker", "Repeated environment, composition, and interaction grammar require remediation.");
    else add("VIEWER_VISIBLE_REPETITION_REVIEW", "info", "Environment continuity is retained while the interaction adds distinct information.");
  }
  const driftFlags = [...new Set(findings.map((finding) => finding.code))];
  const blocking = findings.some((finding) => finding.severity === "blocker" || finding.severity === "error");
  const visibleActions = (visual.match(buyerAction) ?? []).length;
  const immediateRelationship = visibleActions > 0 || (nativeDoorway && doorway.test(visual));
  const compactInstantRead = !/\b(?:several|multiple|three|four|many distinct)\b/iu.test(`${input.treatment.composition} ${input.treatment.action}`);
  const motifScore = input.selectedMotif && doorway.test(input.selectedMotif) ? (doorway.test(visual) ? 1 : 0.35) : 0.8;
  const overloaded = stateComplexity === "MULTI_STATE_REQUIRED";
  const checkRatio = (checks: readonly boolean[]) => clamp(checks.filter(Boolean).length / Math.max(1, checks.length));
  const alignment = checkRatio([thesisQuality.checks.narrationGrounded, thesisQuality.checks.sceneSpecific, !nativeDoorway || doorway.test(visual)]);
  const informationGain = checkRatio([thesisQuality.checks.distinctFromPrevious, !repeatsPreviousCausalAction, input.newInformation.trim().length >= 24]);
  return veronicaPreImageSemanticReviewSchema.parse({
    schemaVersion: VERONICA_PRE_IMAGE_SEMANTIC_REVIEW_VERSION, contentId: input.contentId, sceneId: input.sceneId,
    plannerVersion: input.plannerVersion || "legacy-positioning-plan", semanticHash: stableHash({ relation, visibleThesis: input.visibleThesis, newInformation: input.newInformation }), treatmentHash: input.treatment.treatmentHash || stableHash(input.treatment),
    reviewVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, status: blocking ? "manual-review-required" : "pass", findings,
    requiredEdits: findings.filter((finding) => finding.severity === "blocker" || finding.severity === "error").map((finding) => finding.message),
    instantReadScore: checkRatio([immediateRelationship, thesisQuality.checks.visuallyExpressible, !overloaded, compactInstantRead]), narrationAlignmentScore: alignment,
    visibleThesisScore: thesisQuality.score, buyerPerspectiveScore: checkRatio([buyerAction.test(visual), buyerConsequenceSupported]),
    visualInformationGainScore: clamp(informationGain), continuityScore: clamp(motifScore - (input.previousTreatment && normalized(input.previousTreatment.camera) === normalized(input.treatment.camera) ? 0.08 : 0)),
    qualityChecks: { explicitThesis: thesisQuality.checks.explicit, linguisticSanity: thesisQuality.checks.linguisticSanity, finitePredicate: thesisQuality.checks.finitePredicate, narrationGrounded: thesisQuality.checks.narrationGrounded, visuallyExpressible: thesisQuality.checks.visuallyExpressible, sceneSpecific: thesisQuality.checks.sceneSpecific, distinctFromPrevious: thesisQuality.checks.distinctFromPrevious, buyerConsequenceSupported },
    scoreProvenance: "deterministic-semantic-quality-check-ratio",
    driftFlags, approvedForProviderRequest: false,
  });
}

function refreshFinalTreatmentDerivedState(
  treatment: PositioningVisualTreatment,
  actionOwnerRole: VeronicaActionOwnerRole | undefined,
  sourcePropositionHash?: string,
): PositioningVisualTreatment {
  const { treatmentHash: _staleTreatmentHash, ...treatmentWithoutHash } = treatment;
  const grammar = {
    strategy: treatment.strategy,
    subjectArchetype: treatment.subjectRequirement,
    environment: treatment.environment,
    composition: treatment.composition,
    camera: treatment.camera,
    props: treatment.props,
    topology: treatment.diagram?.type ?? "none" as const,
    semanticTokens: semanticTokens(`${treatment.narrativeBeat} ${treatment.action}`),
    continuityIdentityId: treatment.grammar?.continuityIdentityId ?? null,
  };
  const viewerVisibleFingerprint = {
    strategyFamily: treatment.strategy,
    subjectArchetype: treatment.subjectRequirement,
    environmentArchetype: treatment.environment,
    compositionArchetype: treatment.composition,
    cameraArchetype: treatment.camera,
    lightingArchetype: treatment.lighting,
    actionArchetype: treatment.action,
    dominantObjectArchetype: treatment.props[0] ?? "scene-object",
    motionArchetype: (treatment.motionOpportunities ?? []).join("-then-"),
  };
  const finalTreatment = {
    ...treatmentWithoutHash,
    ...(actionOwnerRole ? { actionOwnerRole } : {}),
    ...(sourcePropositionHash ? { sourcePropositionHash } : {}),
    grammar,
    viewerVisibleFingerprint,
  };
  return { ...finalTreatment, treatmentHash: stableHash(finalTreatment) };
}

function eventKindForFinalTreatment(treatment: PositioningVisualTreatment, ordinal: number): VisualEventKind {
  const opportunities = treatment.motionOpportunities ?? ["establishing-crop", "slow-push"] as const;
  const permitted = treatment.diagram === null
    ? opportunities.filter((kind) => kind !== "diagram-build")
    : opportunities;
  return permitted[ordinal % Math.max(1, permitted.length)] ?? "slow-push";
}

function semanticEventForFinalTreatment(treatment: PositioningVisualTreatment, ordinal: number): {
  readonly kind: VisualEventKind;
  readonly semanticFocus: string;
} {
  if (ordinal === 0) return { kind: "establishing-crop", semanticFocus: `establish ${treatment.composition}` };
  const actors = treatment.actors ?? [];
  if (actors.length > 1 && ordinal % 3 === 1) {
    const audience = actors.find((actor) => actor.role !== "expert") ?? actors[1]!;
    return { kind: "subject-detail", semanticFocus: `${audience.role} response: ${audience.visibleAction}` };
  }
  if (treatment.props.length > 0 && ordinal % 3 !== 0) {
    const prop = treatment.props[(ordinal - 1) % treatment.props.length]!;
    return { kind: "prop-detail", semanticFocus: `evidence detail: ${prop}` };
  }
  if (/\b(?:contrast|left|right|old|new|separate|peripheral|lead|hierarchy)\b/iu.test(treatment.composition)) {
    return { kind: "alternate-crop", semanticFocus: `composition relationship: ${treatment.composition}` };
  }
  const kind = eventKindForFinalTreatment(treatment, ordinal);
  return { kind, semanticFocus: `meaningful reframe: ${treatment.action}` };
}

function audienceRoleForScene(narration: string, action: string): Exclude<VeronicaNarrativeActorRole, "expert"> {
  const value = `${narration} ${action}`;
  if (/\b(?:loyal|existing|long[- ]time|returning)\s+(?:followers?|audience|customers?|clients?)\b/iu.test(value)) return "existing-follower";
  if (/\b(?:prospective|new)\s+(?:buyers?|customers?|clients?|people)|\b(?:buyers?|customers?|prospects?)\b/iu.test(value)) return "prospective-buyer";
  return "observer";
}

function actorAssignmentsForScene(input: {
  readonly scene: PlannedScene;
  readonly narration: string;
  readonly continuity: PositioningVisualPlanV2["continuity"];
  readonly owner: VeronicaActionOwnerRole;
}): { readonly actors: readonly VeronicaActorAssignment[]; readonly actionOwnerActorId: string } {
  const action = input.scene.treatment.action;
  const expertVisible = input.owner === "expert" || input.owner === "shared" || /\b(?:the professional|the expert|professional (?:arranges|aligns|places|shows|builds|connects|demonstrates))\b/iu.test(action);
  const audienceVisible = input.owner === "buyer" || input.owner === "shared" || /\b(?:observer|visitor|follower|buyer|customer|prospect|audience|another person|new people)\b/iu.test(action);
  const protagonistId = input.continuity.mode === "persistent-protagonist" ? input.continuity.identityId : `${input.scene.sceneId}-expert`;
  const audienceRole = audienceRoleForScene(input.narration, action);
  const audienceId = `${input.scene.sceneId}-${audienceRole}`.toLowerCase();
  const actionOwnerActorId = input.owner === "expert"
    ? protagonistId
    : input.owner === "buyer"
      ? audienceId
      : input.owner === "shared"
        ? `${input.scene.sceneId}-shared-action`.toLowerCase()
        : `${input.scene.sceneId}-context`.toLowerCase();
  const actors: VeronicaActorAssignment[] = [];
  if (expertVisible) actors.push({
    actorId: protagonistId,
    role: "expert",
    actionOwnership: input.owner === "expert" ? "primary" : input.owner === "shared" ? "supporting" : "context",
    identityAuthority: input.continuity.mode === "persistent-protagonist" ? "canonical-protagonist" : "distinct-scene-actor",
    visibleAction: input.owner === "expert" ? action : "the professional remains visually distinct from the audience actor",
  });
  if (audienceVisible) actors.push({
    actorId: audienceId,
    role: audienceRole,
    actionOwnership: input.owner === "buyer" ? "primary" : input.owner === "shared" ? "supporting" : "context",
    identityAuthority: "distinct-scene-actor",
    visibleAction: input.owner === "buyer" ? action : "the audience actor observes or responds without inheriting the professional identity",
  });
  if (input.owner === "none" && actors.length === 0) actors.push({
    actorId: actionOwnerActorId,
    role: "observer",
    actionOwnership: "context",
    identityAuthority: "distinct-scene-actor",
    visibleAction: action,
  });
  if (input.owner === "shared") {
    if (!expertVisible || !audienceVisible) throw new Error(`VERONICA_ACTOR_OWNERSHIP_CONTRADICTION:${input.scene.sceneId}:shared-owner-requires-distinct-actors`);
    return { actors, actionOwnerActorId };
  }
  const primary = actors.find((actor) => actor.actionOwnership === "primary");
  if ((input.owner === "expert" || input.owner === "buyer") && !primary) throw new Error(`VERONICA_ACTOR_OWNERSHIP_CONTRADICTION:${input.scene.sceneId}:missing-primary-owner`);
  if (actors.some((actor) => actor.role !== "expert" && actor.identityAuthority === "canonical-protagonist")) throw new Error(`VERONICA_ACTOR_REFERENCE_CONTRADICTION:${input.scene.sceneId}`);
  return { actors, actionOwnerActorId: primary?.actorId ?? actionOwnerActorId };
}

function stripSequentialLanguage(value: string | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

/** Prompt-boundary normalization only; source narration is never rewritten. */
export function normalizeProviderPromptSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/\.\.\.$/u.test(trimmed)) return trimmed;
  const withoutRepeatedTerminal = trimmed.replace(/[.!?]{2,}$/u, (marks) => marks.includes("?") ? "?" : marks.includes("!") ? "!" : ".");
  return /[.!?]$/u.test(withoutRepeatedTerminal) ? withoutRepeatedTerminal : `${withoutRepeatedTerminal}.`;
}

function resolveActionOwner(scene: PlannedScene): { readonly role: VeronicaActionOwnerRole | "unresolved"; readonly source: "final-treatment" | "action-grammar" | "continuity" | "unresolved" } {
  if (scene.sourceGroundedRemediation && scene.treatment.actionOwnerRole) {
    return { role: scene.treatment.actionOwnerRole, source: "final-treatment" };
  }
  const visible = resolveVeronicaVisiblePrimaryActionOwner(scene.treatment);
  if (visible) return { role: visible, source: "action-grammar" };
  if (scene.treatment.actionOwnerRole) return { role: scene.treatment.actionOwnerRole, source: "final-treatment" };
  if (scene.treatment.grammar?.continuityIdentityId && /\b(?:expert|professional)\b/iu.test(scene.treatment.subjectRequirement)) return { role: "expert", source: "continuity" };
  return { role: "unresolved", source: "unresolved" };
}

function normalizeProviderAction(value: string): string {
  const cleaned = stripSequentialLanguage(value)
    .replace(/\bwhile\s+independently\s+(?=(?:points?|inspects?|compares?|traces?|sorts?)\b)/giu, "while the observer independently ")
    .replace(/\s*;\s*/gu, "; ")
    .replace(/\b(?:and|while|before|after)\s*$/iu, "")
    .trim();
  const clauses = cleaned.split(/;\s*/u).filter(Boolean);
  const unique = clauses.filter((clause, index) => {
    const signature = normalized(clause).replace(/\b(?:the|a|an|buyer|customer|visitor|observer|professional|expert)\b/gu, " ").replace(/\s+/gu, " ").trim();
    if (clauses.findIndex((candidate) => normalized(candidate).replace(/\b(?:the|a|an|buyer|customer|visitor|observer|professional|expert)\b/gu, " ").replace(/\s+/gu, " ").trim() === signature) !== index) return false;
    const verbs = new Set((normalized(clause).match(/\b(?:inspect|point|compare|trace|group|gather|scan|sort|follow|recognize|recall|remember|align|place)\w*/gu) ?? []));
    return !clauses.slice(0, index).some((candidate) => (normalized(candidate).match(/\b(?:inspect|point|compare|trace|group|gather|scan|sort|follow|recognize|recall|remember|align|place)\w*/gu) ?? []).some((verb) => verbs.has(verb)));
  });
  return unique.join("; ");
}

function providerNegativeConstraints(scene: PlannedScene): string {
  const visible = `${scene.treatment.environment} ${scene.treatment.composition} ${scene.treatment.props.join(" ")}`;
  const needsInterface = /\b(?:website|web page|page frame|screen|profile|bio|mobile|interface|ui)\b/iu.test(visible);
  return needsInterface
    ? "No readable UI copy, legible brand names, logos, dense interface text, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram"
    : "No readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram";
}

function providerRequiredVsNegativeConstraintReasons(prompt: string): readonly string[] {
  const requiredInterface = /Must show:[^.]*\b(?:website|web page|page frame|screen|profile|bio|mobile|interface|ui)\b/iu.test(prompt);
  return [
    ...(requiredInterface && /\bno\s+(?:readable text,\s+logos,\s+)?ui\b/iu.test(prompt) ? ["required-interface-forbidden-by-negative-constraint"] : []),
  ];
}

function multiStateSpecification(scene: PlannedScene, ordinal: number): { readonly moment: "earlier" | "later" | "comparison-a" | "comparison-b" | "alternative-a" | "alternative-b"; readonly condition: string; readonly actor: string; readonly action: string; readonly response: string; readonly composition: string; readonly evidence: readonly string[] } {
  const proposition = scene.semanticProposition;
  const relation = proposition?.stateRelation ?? "STABLE";
  const initial = proposition?.contrast?.initialState ?? proposition?.cause ?? scene.narrationAnchor;
  const desired = proposition?.contrast?.desiredState ?? proposition?.consequence ?? scene.visibleThesis ?? scene.treatment.action;
  const owner = resolveActionOwner(scene).role;
  const actor = owner === "unresolved" ? "the visible observer" : actorLabel(owner);
  const sharesStateMeaning = (value: string, state: string): boolean => {
    const stateTokens = new Set(semanticTokens(state));
    return semanticTokens(value).some((token) => stateTokens.has(token));
  };
  const laterAction = normalizeProviderAction(scene.treatment.action);
  const laterOwner = resolveVeronicaVisiblePrimaryActionOwner({ ...scene.treatment, action: laterAction }) ?? owner;
  const laterActor = laterOwner === "unresolved" ? "the visible observer" : actorLabel(laterOwner);
  const desiredOutcome = proposition?.contrast?.consequence ?? proposition?.consequence ?? "the result becomes visible";
  const desiredPolarity = classifyVeronicaSemanticPolarity(`${desired} ${desiredOutcome}`);
  const laterActionPolarity = classifyVeronicaSemanticPolarity(laterAction);
  const laterActionNegative = laterActionPolarity === "NEGATIVE_STATE"
    || /\b(?:conflicting|unrelated|withhold\w*|hesitat\w*|pause\w*|cannot|no clear|none resolves|without)\b/iu.test(laterAction);
  const relationRequiresStateSpecificAction = relation === "CONTRAST" || relation === "CONDITIONAL_ALTERNATIVES";
  const laterActionConflicts = relationRequiresStateSpecificAction
    || (desiredPolarity === "POSITIVE_STATE" && laterActionNegative)
    || (desiredPolarity === "NEGATIVE_STATE" && laterActionPolarity === "POSITIVE_STATE");
  const laterEvidence = laterActionConflicts ? [] : scene.treatment.props.filter((prop) => normalized(initial) === normalized(desired) || !sharesStateMeaning(prop, initial));
  const laterComposition = normalized(initial) !== normalized(desired) && sharesStateMeaning(scene.treatment.composition, initial)
    ? `one coherent frame makes the resolved condition visible: ${desired}`
    : scene.treatment.composition;
  const temporal = relation === "CAUSAL_BEFORE_AFTER" || relation === "SEQUENTIAL_PROGRESSION";
  const conditional = relation === "CONDITIONAL_ALTERNATIVES";
  if (ordinal === 1) {
    const moment = temporal ? "earlier" as const : conditional ? "alternative-a" as const : "comparison-a" as const;
    return { moment, condition: initial, actor, action: `${actor} faces evidence of this condition`, response: proposition?.contrast?.failureState ?? "the visible response follows from this condition", composition: `one coherent frame makes this condition visible: ${initial}`, evidence: [`visible evidence of ${initial}`, "visible reaction to this condition"] };
  }
  const moment = temporal ? "later" as const : conditional ? "alternative-b" as const : "comparison-b" as const;
  const conditionAndOutcome = normalized(desired) === normalized(desiredOutcome) ? desired : `${desired}; ${desiredOutcome}`;
  return { moment, condition: desired, actor: laterActor, action: laterActionConflicts ? `${laterActor} inspects the concrete evidence that establishes this condition` : laterAction, response: desiredOutcome, composition: laterActionConflicts ? `one coherent frame makes this condition and its outcome visible: ${conditionAndOutcome}` : laterComposition, evidence: laterEvidence.length > 0 ? laterEvidence : [`visible evidence of ${desired}`, "visible response to this condition"] };
}

function stateMomentInstruction(specification: ReturnType<typeof multiStateSpecification>): string {
  switch (specification.moment) {
    case "earlier": return `Depict the earlier causal state: ${specification.condition}`;
    case "later": return `Depict the later causal state: ${specification.condition}`;
    case "comparison-a": return `Depict comparison side A: ${specification.condition}`;
    case "comparison-b": return `Depict comparison side B: ${specification.condition}`;
    case "alternative-a": return `Depict conditional alternative A: ${specification.condition}`;
    case "alternative-b": return `Depict conditional alternative B: ${specification.condition}`;
  }
}

function actorLabel(role: VeronicaActionOwnerRole): string {
  switch (role) {
    case "expert": return "the recurring professional";
    case "buyer": return "the buyer";
    case "shared": return "the professional and buyer together";
    case "none": return "the simultaneous market comparison";
  }
}

function transitionAction(scene: PlannedScene, role: VeronicaActionOwnerRole): string {
  const source = `${scene.treatment.action} ${scene.visibleThesis}`;
  const proposition = scene.semanticProposition;
  if (proposition?.visualMechanism === "work-expertise-separation") {
    return scene.treatment.action;
  }
  if ((proposition?.stateRelation === "CONTRAST" || proposition?.stateRelation === "CONDITIONAL_ALTERNATIVES") && proposition.contrast) {
    return `${actorLabel(role)} compares concrete evidence of ${proposition.contrast.initialState} with concrete evidence of ${proposition.contrast.desiredState}`;
  }
  if (proposition?.stateRelation === "CAUSAL_BEFORE_AFTER" || proposition?.stateRelation === "SEQUENTIAL_PROGRESSION") {
    const laterClause = scene.treatment.action.match(/\b(?:then|later|afterward|eventually)\s+(.+)$/iu)?.[1]?.replace(/^(?:they|he|she|it)\s+/iu, "");
    if (laterClause) return `${actorLabel(role)} ${laterClause}`;
  }
  const motifSupported = Boolean(proposition?.narrationNativeMetaphor) || /\b(?:doorway|threshold|foothold)\b/iu.test(scene.narrationAnchor);
  if (/comparison|everything.at.once|contrast/iu.test(`${scene.treatment.strategy} ${source}`)) return "a simultaneous split comparison holds the crowded signal field beside one clear route";
  if (motifSupported && /\b(?:widen\w*|adjacent.*arriv\w*)\b/iu.test(source)) return `${actorLabel(role)} actively opens the established threshold wider`;
  if (motifSupported && /\b(?:future paths?|foothold)\b/iu.test(source)) return `${actorLabel(role)} stands at the original threshold facing visible connected future paths`;
  if (motifSupported && /\b(?:doorway|threshold|cross\w*|choos\w*|commit\w*)\b/iu.test(source)) return role === "expert" ? "the recurring professional visibly commits toward the narrower doorway" : `${actorLabel(role)} commits through the clear threshold`;
  return stripSequentialLanguage(scene.treatment.action).replace(/,\s*(?:then|later)\s+/giu, " while ").replace(/\s+and\s+then\s+/giu, " while ");
}

function transitionConsequence(scene: PlannedScene): string {
  const source = `${scene.treatment.action} ${scene.visibleThesis}`;
  const motifSupported = Boolean(scene.semanticProposition?.narrationNativeMetaphor) || /\b(?:doorway|threshold|foothold)\b/iu.test(scene.narrationAnchor);
  if (/comparison|everything.at.once|contrast/iu.test(`${scene.treatment.strategy} ${source}`)) return "one dominant association is recognizable while adjacent evidence branches from it";
  if (motifSupported && /\b(?:widen\w*|adjacent.*arriv\w*)\b/iu.test(source)) return "adjacent buyers are visible at the expanding edge";
  if (motifSupported && /\b(?:future paths?|foothold)\b/iu.test(source)) return "connected future paths are visible beyond the original threshold";
  if (motifSupported && /\b(?:doorway|threshold|cross\w*|choos\w*|commit\w*)\b/iu.test(source)) return "a focused relevant audience is visible beyond the doorway";
  return stripSequentialLanguage(scene.semanticProposition?.consequence ?? scene.visibleThesis);
}

function transitionContext(scene: PlannedScene): string {
  const contrast = scene.semanticProposition?.contrast;
  if (contrast && (contrast.relation === "CONTRAST" || contrast.relation === "CONDITIONAL_ALTERNATIVES")) return `simultaneous conditions: ${contrast.initialState}; ${contrast.desiredState}`;
  if (/comparison|everything.at.once|contrast/iu.test(`${scene.treatment.strategy} ${scene.visibleThesis}`)) return "left: many unrelated signals with weak retrieval; right: one dominant clear association with visible adjacent branches";
  return stripSequentialLanguage(scene.treatment.composition);
}

interface VeronicaSequenceAssetProjection {
  readonly ordinal: number;
  readonly total: number;
}

/** Provider projection is deliberately state-aware: a transition is one frame, never a storyboard. */
export function projectVeronicaProviderPrompt(
  plan: Pick<PositioningVisualPlanV2, "aspectRatio"> & { readonly format?: PositioningVisualPlanV2["format"] },
  scene: PlannedScene,
  sequenceAsset?: VeronicaSequenceAssetProjection,
): string {
  const state = resolveFinalStateComplexity(scene, plan.format ?? "short");
  const policy = resolveVeronicaProductionPolicy(plan.format ?? "short");
  const owner = resolveActionOwner(scene);
  const visibleThesis = stripSequentialLanguage(scene.visibleThesis);
  const visibleThesisSentence = visibleThesis
    ? normalizeProviderPromptSentence(`Visible thesis: ${visibleThesis}`)
    : "";
  const actorContract = scene.treatment.actors?.length
    ? normalizeProviderPromptSentence(`Actor ownership: ${scene.treatment.actors.map((actor) => `${actor.actorId} is the ${actor.role} (${actor.actionOwnership}) and ${actor.visibleAction}`).join("; ")}`)
    : "";
  const base = [
    `Text-free ${plan.aspectRatio} ${policy.providerPromptLabel}`,
    `Subject: ${stripSequentialLanguage(scene.treatment.subjectRequirement)}`,
    `Environment: ${stripSequentialLanguage(scene.treatment.environment)}`,
    `Composition: ${stripSequentialLanguage(scene.treatment.composition)}`,
    `Camera: ${stripSequentialLanguage(scene.treatment.camera)}`,
    `Must show: ${scene.treatment.props.map(stripSequentialLanguage).join(", ")}`,
  ].map(normalizeProviderPromptSentence).join(" ");
  if (state === "SINGLE_STATE") return [base, actorContract, normalizeProviderPromptSentence(`Capture one stable condition: ${normalizeProviderAction(scene.treatment.action)}`), visibleThesisSentence, normalizeProviderPromptSentence(providerNegativeConstraints(scene))].filter(Boolean).join(" ");
  if (state === "MULTI_STATE_REQUIRED") {
    if (sequenceAsset) {
      const specification = multiStateSpecification(scene, sequenceAsset.ordinal);
      const stateBase = [
        `Text-free ${plan.aspectRatio} ${policy.providerPromptLabel}`,
        `Subject: ${stripSequentialLanguage(scene.treatment.subjectRequirement)}`,
        `Environment: ${stripSequentialLanguage(scene.treatment.environment)}`,
        `Composition: ${stripSequentialLanguage(specification.composition)}`,
        `Camera: ${stripSequentialLanguage(scene.treatment.camera)}`,
        `Must show: ${specification.evidence.map(stripSequentialLanguage).join(", ")}`,
      ].map(normalizeProviderPromptSentence).join(" ");
      return [stateBase,
        normalizeProviderPromptSentence(stateMomentInstruction(specification)),
        normalizeProviderPromptSentence(`The primary visible actor is ${specification.actor}, and ${specification.action}`),
        normalizeProviderPromptSentence(`The visible reaction is ${specification.response}`),
        visibleThesisSentence,
        normalizeProviderPromptSentence(`Render this moment as one image, never as a storyboard or panel grid. ${providerNegativeConstraints(scene)}`),
      ].filter(Boolean).join(" ");
    }
    const requirement = policy.stateComplexityRepresentation === "multi-state-sequence"
      ? "MULTI-ASSET SEQUENCE REQUIRED: retain the semantic states as separately prepared assets or deterministic sequence events; do not submit this as one storyboard still"
      : "MANUAL REVIEW REQUIRED: this treatment asks for multiple temporal states and must be reprojected before any provider request";
    return [base, normalizeProviderPromptSentence(requirement), visibleThesisSentence, normalizeProviderPromptSentence(providerNegativeConstraints(scene))].filter(Boolean).join(" ");
  }
  if (owner.role === "unresolved") throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:unresolved-action-owner`);
  const relation = scene.semanticProposition?.stateRelation ?? "STABLE";
  const transitionInstruction = relation === "CONDITIONAL_ALTERNATIVES"
    ? "Show the two conditional alternatives as simultaneous branches, not as a timeline"
    : relation === "CONTRAST"
      ? "Show the opposed configurations as a simultaneous comparison"
      : "Capture the decisive causal change in one coherent instant";
  const contextLabel = relation === "CONDITIONAL_ALTERNATIVES" || relation === "CONTRAST" ? "Comparison context" : "Prior context";
  const consequenceLabel = relation === "CONDITIONAL_ALTERNATIVES" || relation === "CONTRAST" ? "Visible outcome" : "Emerging consequence";
  const prompt = [base, actorContract, normalizeProviderPromptSentence(transitionInstruction), normalizeProviderPromptSentence(`${contextLabel}: ${transitionContext(scene)}`), normalizeProviderPromptSentence(`Primary actor: ${actorLabel(owner.role)}`), normalizeProviderPromptSentence(`Current action: ${normalizeProviderAction(transitionAction(scene, owner.role))}`), normalizeProviderPromptSentence(`${consequenceLabel}: ${transitionConsequence(scene)}`), visibleThesisSentence, normalizeProviderPromptSentence(providerNegativeConstraints(scene))].filter(Boolean).join(" ");
  if (/\b(?:first.*then|after.*then|later|eventually|and afterward|arriv\w*.*then.*widen)\b/iu.test(transitionAction(scene, owner.role))) throw new Error(`MULTI_STATE_PROVIDER_PROMPT_RISK:${scene.sceneId}`);
  if (owner.role === "expert" && !/Primary actor: the recurring professional/iu.test(prompt)) throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:expert`);
  if (owner.role === "buyer" && !/Primary actor: the buyer/iu.test(prompt)) throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:buyer`);
  return prompt;
}

function finalAssetForScene(plan: PositioningVisualPlanV2, scene: PlannedScene, previous: GeneratedVisualAsset | undefined, sequenceAsset?: VeronicaSequenceAssetProjection): GeneratedVisualAsset {
  const prompt = projectVeronicaProviderPrompt(plan, scene, sequenceAsset);
  const assetId = sequenceAsset && sequenceAsset.ordinal > 1 ? `${scene.assetId}-state-${String(sequenceAsset.ordinal).padStart(2, "0")}` : scene.assetId;
  const protagonistActor = scene.treatment.actors?.find((actor) => actor.identityAuthority === "canonical-protagonist" && actor.role === "expert");
  const subjectIdentityId = protagonistActor && plan.continuity.mode === "persistent-protagonist" ? plan.continuity.identityId : null;
  const canonicalReferenceAssetId = subjectIdentityId ? `${subjectIdentityId}-approved-reference` : null;
  const continuityReferenceAssetIds = subjectIdentityId && previous?.subjectIdentityId === subjectIdentityId ? [previous.assetId] : [];
  const base = {
    assetId, contentId: plan.contentId, sceneId: scene.sceneId, semanticPurpose: scene.visibleThesis,
    strategy: scene.treatment.strategy, prompt, textFree: true as const, textInGeneratedImage: false as const,
    nativeAspectRatio: plan.aspectRatio, ratioAdaptations: previous?.ratioAdaptations ?? [],
    subjectIdentityId,
    canonicalReferenceAssetId,
    continuityReferenceAssetIds,
    referenceAssetId: canonicalReferenceAssetId,
  };
  const state = resolveFinalStateComplexity(scene, plan.format);
  const projectionStrategy = state === "SINGLE_STATE" ? "SINGLE_STATE" as const : state === "MULTI_STATE_REQUIRED" ? "MULTI_STATE_SEQUENCE" as const : "DECISIVE_TRANSITION" as const;
  const motifId = scene.semanticProposition?.narrationNativeMetaphor ? plan.selectedRecurringMotif?.motifId ?? stableHash({ contentId: plan.contentId, metaphor: scene.semanticProposition.narrationNativeMetaphor }) : null;
  const providerPromptHash = stableHash(prompt);
  const projectedPolarity = classifyVeronicaSemanticPolarity(`${scene.treatment.composition} ${scene.treatment.action} ${scene.treatment.props.join(" ")}`);
  const projectedConsequencePolarity = classifyVeronicaSemanticPolarity(scene.semanticProposition?.consequence ?? scene.visibleThesis);
  const projectedActorRole = resolveActionOwner(scene).role;
  const projectionRevision = {
    sourceTreatmentHash: scene.treatment.treatmentHash,
    sourcePropositionHash: scene.semanticProposition?.propositionHash ?? null,
    materializationRevisionId: scene.materializationRevision?.revisionId ?? stableHash({ sceneId: scene.sceneId, treatmentHash: scene.treatment.treatmentHash, propositionHash: scene.semanticProposition?.propositionHash ?? null }),
    stateProjectionPolicyVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION,
    motifId,
    projectionStrategy,
    providerPromptHash,
    projectedPolarity,
    projectedStateRelation: scene.semanticProposition?.stateRelation ?? "STABLE",
    projectedActorRole,
    projectedConsequencePolarity,
  };
  const projectionProvenance = { ...projectionRevision, projectionRevisionId: stableHash(projectionRevision) };
  return { ...base, semanticFingerprint: stableHash({ sceneId: scene.sceneId, prompt, treatmentHash: scene.treatment.treatmentHash, propositionHash: scene.semanticProposition?.propositionHash ?? null }), generatedAssetCacheKey: stableHash({ prompt, treatmentHash: scene.treatment.treatmentHash, propositionHash: scene.semanticProposition?.propositionHash ?? null, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, projectionVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION, sanitationVersion: VERONICA_PROMPT_SANITATION_VERSION }), projectionProvenance };
}

function cadenceForFinalTimeline(format: PositioningVisualPlanV2["format"], events: readonly VisualEvent[], assets: readonly GeneratedVisualAsset[], durationMs: number) {
  const durations = events.map((event) => event.durationMs / 1_000);
  const targetRangeSeconds = resolveVeronicaProductionPolicy(format).eventDurationRangeSeconds;
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  const hook = events.filter((event) => /hook|cold-open/iu.test(event.sceneId));
  return {
    durationMs, baseAssetCount: assets.length, visualEventCount: events.length,
    eventsPerBaseAsset: round(events.length / Math.max(1, assets.length)), meanSecondsPerEvent: round(durationMs / Math.max(1, events.length) / 1_000),
    shortestEventSeconds: round(Math.min(...durations)), longestEventSeconds: round(Math.max(...durations)), targetRangeSeconds,
    targetComplianceRate: round(durations.filter((value) => value >= targetRangeSeconds[0] && value <= targetRangeSeconds[1]).length / Math.max(1, durations.length)),
    hookMeanSecondsPerEvent: hook.length ? round(hook.reduce((sum, event) => sum + event.durationMs, 0) / hook.length / 1_000) : null,
  };
}

function directivePolarity(
  value: string | undefined,
  fallback: VeronicaSemanticProposition["polarity"],
): VeronicaSemanticProposition["polarity"] {
  const candidate = value?.trim().toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (candidate === "POSITIVE_STATE" || candidate === "NEGATIVE_STATE" || candidate === "CONTRAST" || candidate === "TRANSITION_NEGATIVE_TO_POSITIVE" || candidate === "TRANSITION_POSITIVE_TO_NEGATIVE" || candidate === "NEUTRAL") return candidate;
  if (candidate && /FAIL|WRONG|NEGATIVE|ANTI_PATTERN/iu.test(candidate)) return "NEGATIVE_STATE";
  if (candidate && /SUCCESS|DESIRED|POSITIVE|RECOMMEND/iu.test(candidate)) return "POSITIVE_STATE";
  return fallback;
}

function directiveRelation(
  value: string | undefined,
  fallback: VeronicaSemanticProposition["stateRelation"],
): VeronicaSemanticProposition["stateRelation"] {
  const candidate = value?.trim().toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (candidate === "STABLE" || candidate === "CAUSAL_BEFORE_AFTER" || candidate === "CONTRAST" || candidate === "CONDITIONAL_ALTERNATIVES" || candidate === "SEQUENTIAL_PROGRESSION") return candidate;
  if (candidate && /CAUSE|BEFORE|AFTER/iu.test(candidate)) return "CAUSAL_BEFORE_AFTER";
  if (candidate && /CONDITION|BRANCH/iu.test(candidate)) return "CONDITIONAL_ALTERNATIVES";
  if (candidate && /CONTRAST|VERSUS|SEPARATE|DISTINCT|DIFFERENT/iu.test(candidate)) return "CONTRAST";
  if (candidate && /SEQUENCE|STEP/iu.test(candidate)) return "SEQUENTIAL_PROGRESSION";
  return fallback;
}

function directiveVisualMechanism(
  directive: SemanticRemediationDirective,
): VeronicaSemanticProposition["visualMechanism"] {
  return directive.visualMechanism;
}

interface AuthoritativeSemanticReplacement {
  readonly actorRole: VeronicaActionOwnerRole;
  readonly actorAction: string;
  readonly cause: string;
  readonly consequence: string;
  readonly polarity: VeronicaSemanticProposition["polarity"];
  readonly stateRelation: VeronicaSemanticProposition["stateRelation"];
  readonly contrast?: VeronicaSemanticProposition["contrast"];
  readonly visualMechanism: VeronicaSemanticProposition["visualMechanism"];
  readonly evidenceAnchors: readonly string[];
  readonly buyerInterpretation?: string;
  readonly buyerConsequenceFamily: VeronicaSemanticProposition["buyerConsequenceFamily"];
}

function authoritativeSemanticReplacement(input: {
  readonly directive: SemanticRemediationDirective;
  readonly derived: VeronicaSemanticProposition;
  readonly narration: string;
}): AuthoritativeSemanticReplacement {
  const { directive, derived, narration } = input;
  const actorRole = directive.actionOwnerRole;
  const causalDirection = directive.sourceSemantics.causalDirection?.trim();
  const stateRelation = directiveRelation(
    directive.stateModel?.relation ?? causalDirection,
    derived.stateRelation,
  );
  const causalClauses = causalDirection
    ?.split(/\s*;\s*/u)
    .map((clause) => clause.trim())
    .filter(Boolean) ?? [];
  const explicitStateModel = directive.stateModel;
  const contrast = stateRelation === "STABLE"
    ? undefined
    : {
        relation: stateRelation,
        ...((explicitStateModel?.initialState ?? causalClauses[0])
          ? { initialState: explicitStateModel?.initialState ?? causalClauses[0]! }
          : {}),
        ...((explicitStateModel?.failureState ?? causalClauses[0])
          ? { failureState: explicitStateModel?.failureState ?? causalClauses[0]! }
          : {}),
        ...((explicitStateModel?.desiredState ?? causalClauses[1])
          ? { desiredState: explicitStateModel?.desiredState ?? causalClauses[1]! }
          : {}),
        ...((explicitStateModel?.outcomeState ?? causalClauses[1])
          ? { consequence: explicitStateModel?.outcomeState ?? causalClauses[1]! }
          : {}),
      };
  const directiveEvidence = [
    ...directive.requiredVisibleEvidence,
    ...directive.requiredDomainObjects,
  ];
  const directiveMentionsBuyer = /\b(?:buyer|customer|client|prospect|audience|visitor)\b/iu.test(
    `${directive.sourceSemantics.action ?? ""} ${directive.sourceSemantics.consequence ?? ""} ${directiveEvidence.join(" ")}`,
  );
  return {
    actorRole,
    actorAction: directive.sourceSemantics.action?.trim() || causalClauses[0] || narration.trim(),
    cause: causalClauses[0] || causalDirection || directive.sourceSemantics.action?.trim() || narration.trim(),
    consequence: explicitStateModel?.outcomeState || causalClauses[1] || directive.sourceSemantics.consequence?.trim() || causalDirection || narration.trim(),
    polarity: directivePolarity(directive.sourceSemantics.polarity, derived.polarity),
    stateRelation,
    ...(contrast ? { contrast } : {}),
    visualMechanism: directiveVisualMechanism(directive),
    evidenceAnchors: [...new Set(directiveEvidence)],
    ...(directiveMentionsBuyer && derived.buyerInterpretation
      ? { buyerInterpretation: derived.buyerInterpretation }
      : {}),
    buyerConsequenceFamily: directiveMentionsBuyer
      ? derived.buyerConsequenceFamily
      : "NONE",
  };
}

function replaceTreatmentSemanticFields(input: {
  readonly previous: PositioningVisualTreatment;
  readonly projected: ReturnType<typeof visualTreatmentFromProposition>;
  readonly props: readonly string[];
  readonly actionOwnerRole: VeronicaActionOwnerRole;
  readonly propositionHash: string;
}): PositioningVisualTreatment {
  const motionOpportunities: readonly VisualEventKind[] = input.projected.diagram
    ? ["establishing-crop", "diagram-build", "slow-push"]
    : input.projected.strategy === "comparison-composition"
      ? ["establishing-crop", "split-composition", "punch-in"]
      : ["establishing-crop", "subject-detail", "prop-detail", "slow-push"];
  const seed: PositioningVisualTreatment = {
    treatmentId: input.previous.treatmentId,
    sceneId: input.previous.sceneId,
    progressionStage: input.previous.progressionStage,
    communicationIntent: input.previous.communicationIntent,
    lighting: input.previous.lighting,
    motionOpportunities,
    grammar: input.previous.grammar,
    viewerVisibleFingerprint: input.previous.viewerVisibleFingerprint,
    treatmentHash: input.previous.treatmentHash,
    ...input.projected,
    props: input.props,
    actionOwnerRole: input.actionOwnerRole,
  };
  return refreshFinalTreatmentDerivedState(
    seed,
    input.actionOwnerRole,
    input.propositionHash,
  );
}

/**
 * Applies advisor guidance through the canonical semantic/treatment generator.
 * The advisor never supplies a provider prompt and this function never trusts
 * one: all projections, events, hashes and readiness are rebuilt afterwards.
 */
export function applyVeronicaSourceGroundedRemediationDirectives(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly directives: readonly {
    readonly sceneId: string;
    readonly directive: SemanticRemediationDirective;
  }[];
  readonly narrationByScene: readonly string[];
  readonly round: number;
}): PositioningVisualPlanV2 {
  const byScene = new Map(input.directives.map((entry) => [entry.sceneId, entry.directive] as const));
  const scenes = input.plan.scenes.map((scene, index) => {
    const directive = byScene.get(scene.sceneId);
    if (!directive) return scene;
    if (directive.repairBoundary === "SEGMENTATION" && directive.segmentation?.splitRequired) {
      // Resegmentation needs timing ownership and scene-ID allocation from the
      // production adapter. Never approximate it by mutating one scene here.
      return scene;
    }
    const narration = input.narrationByScene[index] ?? scene.narrationAnchor;
    const derived = deriveVeronicaSemanticProposition({ scene, narration });
    const {
      propositionHash: _derivedPropositionHash,
      ...derivedWithoutHash
    } = derived;
    const replacement = directive.repairBoundary === "SEMANTIC_EXTRACTION"
      ? authoritativeSemanticReplacement({ directive, derived, narration })
      : undefined;
    const actorRole = replacement?.actorRole ?? directive.actionOwnerRole;
    const contrast = replacement?.contrast ?? (directive.stateModel
      ? {
          relation: directiveRelation(directive.stateModel.relation, derived.stateRelation) as Exclude<VeronicaSemanticProposition["stateRelation"], "STABLE">,
          ...(directive.stateModel.initialState ? { initialState: directive.stateModel.initialState } : {}),
          ...(directive.stateModel.failureState ? { failureState: directive.stateModel.failureState } : {}),
          ...(directive.stateModel.desiredState ? { desiredState: directive.stateModel.desiredState } : {}),
          ...(directive.stateModel.outcomeState ? { consequence: directive.stateModel.outcomeState } : {}),
        }
      : derived.contrast);
    const propositionBase = replacement
      ? {
          schemaVersion: derived.schemaVersion,
          narrationClaim: derived.narrationClaim,
          evidenceSpans: derived.evidenceSpans,
          polarity: replacement.polarity,
          stateRelation: replacement.stateRelation,
          cause: replacement.cause,
          actorRole: replacement.actorRole,
          actorAction: replacement.actorAction,
          ...(replacement.buyerInterpretation
            ? { buyerInterpretation: replacement.buyerInterpretation }
            : {}),
          consequence: replacement.consequence,
          ...(replacement.contrast ? { contrast: replacement.contrast } : {}),
          visualMechanism: replacement.visualMechanism,
          evidenceAnchors: replacement.evidenceAnchors,
          buyerConsequenceFamily: replacement.buyerConsequenceFamily,
          confidence: {
            proposition: "HIGH" as const,
            actorOwnership: "HIGH" as const,
            consequence: "HIGH" as const,
            visualMechanism: replacement.visualMechanism === "UNRESOLVED" ? "LOW" as const : "HIGH" as const,
          },
        }
      : {
          ...derivedWithoutHash,
          actorRole,
          actorAction: directive.sourceSemantics.action ?? derived.actorAction,
          consequence: directive.sourceSemantics.consequence ?? derived.consequence,
          polarity: directivePolarity(directive.sourceSemantics.polarity, derived.polarity),
          stateRelation: directiveRelation(directive.stateModel?.relation ?? directive.sourceSemantics.causalDirection, derived.stateRelation),
          visualMechanism: directiveVisualMechanism(directive),
          evidenceAnchors: [...new Set([...derived.evidenceAnchors, ...directive.requiredVisibleEvidence, ...directive.requiredDomainObjects])],
          ...(contrast ? { contrast } : {}),
        };
    const propositionWithoutHash = propositionBase;
    const proposition: VeronicaSemanticProposition = {
      ...propositionWithoutHash,
      propositionHash: stableHash({
        ...propositionWithoutHash,
        directiveHash: stableHash(directive),
      }),
    };
    if (proposition.visualMechanism === "UNRESOLVED") {
      throw new Error(`SOURCE_GROUNDED_REMEDIATION_UNRESOLVED:${scene.sceneId}`);
    }
    const projected = visualTreatmentFromProposition({
      scene: { ...scene, semanticProposition: proposition },
      proposition,
      preserveEnvironment: false,
    });
    const requiredProps = [...new Set([...projected.props, ...directive.requiredDomainObjects, ...directive.requiredVisibleEvidence])].slice(0, 10);
    const treatment = replaceTreatmentSemanticFields({
      previous: scene.treatment,
      projected,
      props: requiredProps,
      actionOwnerRole: actorRole,
      propositionHash: proposition.propositionHash,
    });
    return {
      ...scene,
      narrationAnchor: narration,
      semanticProposition: proposition,
      treatment,
      visibleThesis: renderVeronicaVisibleThesis(proposition),
      newInformation: `${proposition.cause ?? proposition.narrationClaim}; ${proposition.consequence}.`,
      sourceGroundedRemediation: {
        directiveHash: stableHash(directive),
        repairBoundary: directive.repairBoundary,
        regenerationRound: input.round,
      },
    };
  });
  const base = {
    ...input.plan,
    scenes,
    semanticPlanCacheKey: stableHash({
      previous: input.plan.semanticPlanCacheKey,
      controllerVersion: "veronica-source-grounded-visual-qa-controller.v1",
      round: input.round,
      directives: input.directives.map((entry) => ({
        sceneId: entry.sceneId,
        hash: stableHash(entry.directive),
      })),
    }),
  };
  return { ...base, planHash: stableHash(base) } as PositioningVisualPlanV2;
}

/**
 * Final treatment owns all scene-derived state. This is deliberately invoked
 * after canonical timing is known, so stale diagrams, events, prompts, cache
 * keys, diversity and cadence cannot survive semantic remediation.
 */
export function rebuildVeronicaFinalTreatmentState(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly sceneTimings: readonly { readonly id: string; readonly timing: { readonly startSeconds: number; readonly endSeconds: number } }[];
  readonly narrationByScene?: readonly string[];
}): PositioningVisualPlanV2 {
  const policy = resolveVeronicaProductionPolicy(input.plan.format);
  const continuity = input.plan.continuity ?? { mode: "ensemble-independent" as const, variationDimensions: ["age", "gender-presentation", "profession", "environment", "framing"] as const, scenesShareIdentity: false as const };
  const motifProvenanceMatchesEpisode = !input.plan.selectedRecurringMotif?.episodeContentId || input.plan.selectedRecurringMotif.episodeContentId === input.plan.contentId;
  const episodeMotifSupported = Boolean(input.plan.selectedRecurringMotif && doorway.test(input.plan.selectedRecurringMotif.concept) && motifProvenanceMatchesEpisode && input.plan.scenes.some((scene, index) => doorway.test(input.narrationByScene?.[index] ?? scene.narrationAnchor)));
  const timingByIndex = input.sceneTimings;
  if (timingByIndex.length !== input.plan.scenes.length) throw new Error("PRODUCTION_TIMELINE_MISMATCH: scene count differs from final treatment plan.");
  const scenes = input.plan.scenes.map((scene, index) => {
    const narrationAnchor = input.narrationByScene?.[index] ?? scene.narrationAnchor;
    const timing = timingByIndex[index]!;
    const durationMs = Math.round((timing.timing.endSeconds - timing.timing.startSeconds) * 1_000);
    if (durationMs <= 0) throw new Error(`PRODUCTION_TIMELINE_MISMATCH: ${scene.sceneId} has non-positive duration.`);
    const sourceScene = { ...scene, narrationAnchor };
    // A source-grounded directive is applied by the canonical regeneration
    // boundary below. Preserve that canonical proposition on downstream
    // rebuilds; ordinary scenes are always re-derived from source narration.
    const proposition = (scene.sourceGroundedRemediation || scene.editorialTreatmentOverride) && scene.semanticProposition
      ? scene.semanticProposition
      : deriveVeronicaSemanticProposition({ scene: sourceScene, narration: narrationAnchor });
    const propositionCoherence = assessVeronicaPropositionInternalCoherence(proposition);
    const visibleOwner = resolveVeronicaVisiblePrimaryActionOwner(scene.treatment);
    if ((scene.sourceGroundedRemediation || scene.editorialTreatmentOverride) && visibleOwner && visibleOwner !== proposition.actorRole) {
      throw new Error(`SOURCE_GROUNDED_REMEDIATION_ACTION_OWNER_MISMATCH:${scene.sceneId}:${proposition.actorRole}:${visibleOwner}`);
    }
    const baseTreatment = refreshFinalTreatmentDerivedState(
      scene.treatment,
      scene.sourceGroundedRemediation ? proposition.actorRole : visibleOwner ?? proposition.actorRole,
      proposition.propositionHash,
    );
    const owner = baseTreatment.actionOwnerRole ?? proposition.actorRole;
    const actorOwnership = actorAssignmentsForScene({
      scene: { ...sourceScene, treatment: baseTreatment },
      narration: narrationAnchor,
      continuity,
      owner,
    });
    const treatment = refreshFinalTreatmentDerivedState(
      { ...baseTreatment, ...actorOwnership },
      owner,
      proposition.propositionHash,
    );
    const treatmentCompatibility = assessVeronicaTreatmentPropositionCompatibility({ treatment, proposition, narration: narrationAnchor, episodeMotifSupported });
    const visibleThesis = proposition.narrationNativeMetaphor ? scene.visibleThesis : renderVeronicaVisibleThesis(proposition);
    const finalScene = { ...sourceScene, visibleThesis, treatment, semanticProposition: proposition };
    return { ...finalScene, semanticCoherence: { claimIntegrity: assessVeronicaNarrationClaimIntegrity(proposition.narrationClaim).status, polarityCoherence: propositionCoherence.status, propositionInternalCoherence: propositionCoherence.status, treatmentPropositionCompatibility: treatmentCompatibility.status }, startMs: Math.round(timing.timing.startSeconds * 1_000), durationMs, stateComplexity: resolveFinalStateComplexity(finalScene, input.plan.format) };
  });
  const materializedScenes = scenes.map((scene) => {
    const revision = {
      treatmentHash: scene.treatment.treatmentHash,
      propositionHash: scene.semanticProposition?.propositionHash ?? null,
      projectionPolicyVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION,
      subject: scene.treatment.subjectRequirement,
      environment: scene.treatment.environment,
      action: scene.treatment.action,
      props: scene.treatment.props,
      composition: scene.treatment.composition,
      camera: scene.treatment.camera,
      visibleThesis: scene.visibleThesis,
      actors: scene.treatment.actors ?? [],
      actionOwnerActorId: scene.treatment.actionOwnerActorId ?? null,
    };
    return {
      ...scene,
      materializationRevision: {
        revisionId: stableHash(revision),
        treatmentHash: revision.treatmentHash,
        propositionHash: revision.propositionHash,
        projectionPolicyVersion: revision.projectionPolicyVersion,
      },
    };
  });
  const assetGroups = materializedScenes.map((scene, index) => {
    const sequenceAssetCount = input.plan.format === "long" && scene.stateComplexity === "MULTI_STATE_REQUIRED" ? 2 : 1;
    const previousScene = materializedScenes[index - 1];
    const previousSceneHasCanonicalExpert = previousScene?.treatment.actors?.some((actor) => actor.role === "expert" && actor.identityAuthority === "canonical-protagonist") ?? false;
    const previousSceneAsset = index === 0 || !previousSceneHasCanonicalExpert ? undefined : input.plan.assets.find((asset) => asset.sceneId === previousScene?.sceneId);
    return Array.from({ length: sequenceAssetCount }, (_, assetIndex) => finalAssetForScene(
      input.plan,
      scene,
      assetIndex === 0 ? previousSceneAsset : undefined,
      sequenceAssetCount > 1 ? { ordinal: assetIndex + 1, total: sequenceAssetCount } : undefined,
    ));
  });
  const assets = assetGroups.flat();
  const events: VisualEvent[] = materializedScenes.flatMap((scene, index) => {
    const sceneAssets = assetGroups[index]!;
    const count = Math.max(1, Math.ceil(scene.durationMs / (policy.eventDurationRangeSeconds[1] * 1_000)));
    const interval = Math.floor(scene.durationMs / count);
    return Array.from({ length: count }, (_, ordinal) => {
      const asset = sceneAssets[Math.min(sceneAssets.length - 1, Math.floor(ordinal * sceneAssets.length / count))]!;
      const durationMs = ordinal === count - 1 ? scene.durationMs - interval * (count - 1) : interval;
      const semanticEvent = semanticEventForFinalTreatment(scene.treatment, ordinal);
      const kind = semanticEvent.kind;
      const base = { eventId: `${scene.sceneId}-event-${String(ordinal + 1).padStart(2, "0")}`.toLowerCase(), sceneId: scene.sceneId, assetId: asset.assetId, kind, startMs: scene.startMs + interval * ordinal, durationMs, aspectRatio: input.plan.aspectRatio, safeRegionIds: ["subject", "overlay", "subtitle"] as const, semanticFocus: semanticEvent.semanticFocus, deterministicParameters: { startScale: kind === "punch-in" ? 1.12 : 1, endScale: kind === "slow-push" || kind === "punch-in" ? 1.16 : 1.04, anchor: kind === "subject-detail" ? "subject" as const : kind === "prop-detail" ? "prop" as const : "center" as const } };
      return { ...base, renderCacheKey: stableHash({ ...base, finalTreatmentHash: scene.treatment.treatmentHash, finalEventVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION }) };
    });
  });
  const scenesWithEvents = materializedScenes.map((scene) => ({
    ...scene,
    eventIds: events.filter((event) => event.sceneId === scene.sceneId).map((event) => event.eventId),
  }));
  const diagrams = scenesWithEvents.flatMap((scene) => scene.treatment.diagram ? [scene.treatment.diagram] : []);
  const finalEnd = events.at(-1) ? events.at(-1)!.startMs + events.at(-1)!.durationMs : 0;
  const narrationEnd = Math.round(timingByIndex.at(-1)!.timing.endSeconds * 1_000);
  if (Math.abs(finalEnd - narrationEnd) > 2) throw new Error("PRODUCTION_TIMELINE_MISMATCH: final event does not end at canonical narration duration.");
  const motif = input.plan.selectedRecurringMotif;
  const motifNarrationSupport = motif ? scenesWithEvents.filter((scene) => /doorway|threshold|widen|foothold|access/iu.test(scene.narrationAnchor)) : [];
  const selectedRecurringMotif = motif && motifNarrationSupport.length > 0 ? { ...motif, motifId: stableHash({ contentId: input.plan.contentId, family: motif.family, concept: motif.concept }), episodeContentId: input.plan.contentId, semanticMeaning: "episode-local narration-native threshold/access relationship", evidenceSpans: motifNarrationSupport.flatMap((scene) => scene.semanticProposition?.evidenceSpans ?? []), selectionVersion: "veronica-motif-selection.v2", sceneIds: motifNarrationSupport.filter((scene) => /doorway|threshold|widen|foothold|access/iu.test(`${scene.visibleThesis} ${scene.treatment.action} ${scene.treatment.props.join(" ")}`)).map((scene) => scene.sceneId) } : undefined;
  const motifScenes = selectedRecurringMotif?.sceneIds ?? [];
  const viewerVisibleFamilies = scenesWithEvents.map((scene) => normalizeVeronicaViewerVisibleFamilies(scene, selectedRecurringMotif?.concept));
  const baseDiversity = calculateDiversityMetrics({ sceneIds: scenesWithEvents.map((scene) => scene.sceneId), features: scenesWithEvents.map((scene) => scene.treatment.grammar ?? { strategy: scene.treatment.strategy, subjectArchetype: scene.treatment.subjectRequirement, environment: scene.treatment.environment, composition: scene.treatment.composition, camera: scene.treatment.camera, props: scene.treatment.props, topology: scene.treatment.diagram?.type ?? "none", semanticTokens: [], continuityIdentityId: continuity.mode === "persistent-protagonist" ? continuity.identityId : null }), stages: scenesWithEvents.map((scene) => scene.progressionStage), continuity });
  const pairs = viewerVisibleFamilies.slice(1).map((current, index) => {
    const previous = viewerVisibleFamilies[index]!;
    const previousScene = scenesWithEvents[index]!;
    const currentScene = scenesWithEvents[index + 1]!;
    return { pair: `${previous.sceneId}->${current.sceneId}`, sameEnvironment: previous.environmentFamily === current.environmentFamily, sameCamera: previous.cameraFamily === current.cameraFamily, sameInteraction: previous.interactionFamily === current.interactionFamily, sameComposition: previous.compositionFamily === current.compositionFamily, sameIdentity: previous.continuityIdentityFamily === current.continuityIdentityFamily, samePolarity: previousScene.semanticProposition?.polarity === currentScene.semanticProposition?.polarity };
  });
  const rate = (key: "sameEnvironment" | "sameCamera" | "sameInteraction" | "sameIdentity") => pairs.length ? Math.round(pairs.filter((pair) => pair[key]).length / pairs.length * 10_000) / 10_000 : 0;
  const narrationNativeProgression = (pairId: string): boolean => {
    const [leftId, rightId] = pairId.split("->");
    const left = scenesWithEvents.find((scene) => scene.sceneId === leftId);
    const right = scenesWithEvents.find((scene) => scene.sceneId === rightId);
    return Boolean(left?.semanticProposition?.narrationNativeMetaphor && right?.semanticProposition?.narrationNativeMetaphor && motifScenes.includes(leftId ?? "") && motifScenes.includes(rightId ?? ""));
  };
  const usefulSemanticProgression = (pairId: string): boolean => {
    const [leftId, rightId] = pairId.split("->");
    const left = scenesWithEvents.find((scene) => scene.sceneId === leftId)?.semanticProposition;
    const right = scenesWithEvents.find((scene) => scene.sceneId === rightId)?.semanticProposition;
    return Boolean(left && right && left.visualMechanism === right.visualMechanism && (left.polarity !== right.polarity || left.stateRelation !== right.stateRelation || left.buyerConsequenceFamily !== right.buyerConsequenceFamily));
  };
  // Base similarity already captures a concrete adjacent duplicate even when
  // one normalized family label differs. Preserve narration-native progressive
  // motifs, but propagate every other adjacent violation to final readiness.
  const adjacentViolations = baseDiversity.consecutiveSceneSimilarity.violatingPairs.filter((pair) => !narrationNativeProgression(pair) && !usefulSemanticProgression(pair));
  const exactTemplateDuplicates = pairs.filter((pair) => pair.sameEnvironment && pair.sameCamera && pair.sameInteraction && pair.sameComposition && pair.samePolarity).map((pair) => pair.pair).filter((pair) => !narrationNativeProgression(pair) && !usefulSemanticProgression(pair));
  const accidentalPairs = [...new Set([...adjacentViolations, ...exactTemplateDuplicates])];
  const intentionalMotifReuseRate = scenesWithEvents.length ? Math.round(motifScenes.length / scenesWithEvents.length * 10_000) / 10_000 : 0;
  const diversityMetrics = { ...baseDiversity, intentionalMotifReuseRate, accidentalVisualRepetitionRate: scenesWithEvents.length ? Math.round(accidentalPairs.length / Math.max(1, scenesWithEvents.length - 1) * 10_000) / 10_000 : 0, consecutiveViewerVisibleSimilarity: { mean: baseDiversity.consecutiveSceneSimilarity.mean, maximum: baseDiversity.consecutiveSceneSimilarity.maximum, violatingPairs: accidentalPairs }, environmentFamilyReuseRate: rate("sameEnvironment"), cameraFamilyReuseRate: rate("sameCamera"), interactionFamilyReuseRate: rate("sameInteraction"), continuityIdentityReuseRate: rate("sameIdentity"), harmfulRepetitionPairs: accidentalPairs, viewerVisibleFamilies, motifContinuityCoverage: intentionalMotifReuseRate };
  const staleFailures = scenesWithEvents.flatMap((scene) => [
    ...(scene.treatment.diagram === null && diagrams.some((diagram) => diagram.diagramId.toLowerCase().startsWith(scene.sceneId.toLowerCase())) ? [`STALE_SCENE_DIAGRAM:${scene.sceneId}`] : []),
    ...(scene.treatment.diagram === null && events.some((event) => event.sceneId === scene.sceneId && event.kind === "diagram-build") ? [`DIAGRAM_EVENT_WITHOUT_DIAGRAM:${scene.sceneId}`] : []),
  ]);
  if (staleFailures.length) throw new Error(staleFailures.join(","));
  const assetReuseDecisions = (input.plan.assetReuseDecisions ?? []).map((decision) => {
    const target = scenesWithEvents.find((scene) => scene.sceneId === decision.targetSceneId);
    const motifCritical = Boolean(target && selectedRecurringMotif?.sceneIds.includes(target.sceneId));
    const source = assets.find((asset) => asset.assetId === decision.sourceAssetId);
    const previousSource = input.plan.assets.find((asset) => asset.assetId === decision.sourceAssetId);
    const finalTreatmentChanged = source?.semanticPurpose !== previousSource?.semanticPurpose || source?.prompt !== previousSource?.prompt;
    const motifCompatible = !motifCritical || /doorway|threshold|widen|foothold|access/iu.test(`${source?.semanticPurpose ?? ""} ${source?.prompt ?? ""}`);
    const continuityCompatible = continuity.mode !== "persistent-protagonist" || source?.subjectIdentityId === continuity.identityId;
    const automatic = decision.semanticCompatibility >= 0.8 && decision.eligible && motifCompatible && continuityCompatible && !finalTreatmentChanged;
    return { ...decision, eligible: automatic, reuseMode: automatic ? decision.reuseMode : "not-reusable" as const, cropAdaptation: automatic ? decision.cropAdaptation : "none" as const, decision: automatic ? "AUTO_REUSE_APPROVED" as const : decision.semanticCompatibility >= 0.4 && motifCompatible ? "REUSE_REQUIRES_SEMANTIC_REVIEW" as const : "REUSE_REJECTED" as const, reason: automatic ? decision.reason : finalTreatmentChanged ? "final-treatment-changed-recheck-semantic-compatibility" : !motifCompatible ? "recurring-motif-incompatible" : !continuityCompatible ? "subject-continuity-incompatible" : "semantic-purpose-insufficiently-compatible" };
  });
  const cacheInvalidation = input.plan.cacheInvalidation ?? { semanticPlanInvalidatesOn: [], canonicalImageInvalidatesOn: [], renderEventsInvalidateOn: [] };
  const canonical = { ...input.plan, continuity, scenes: scenesWithEvents, assets, visualEvents: events, diagrams, assetReuseDecisions, selectedRecurringMotif, diversityMetrics, cadenceMetrics: cadenceForFinalTimeline(input.plan.format, events, assets, narrationEnd), canonicalImagePlanHash: stableHash({ assets, selectedRecurringMotif, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, providerProjectionVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION, actionOwners: scenesWithEvents.map((scene) => scene.treatment.actionOwnerRole ?? null), format: input.plan.format, stateComplexityRepresentation: policy.stateComplexityRepresentation }), renderEventPlanHash: stableHash({ events, finalTiming: narrationEnd, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, format: input.plan.format }), cacheInvalidation: { ...cacheInvalidation, semanticPlanInvalidatesOn: [...cacheInvalidation.semanticPlanInvalidatesOn, "final-treatment-change", "selected-recurring-motif-change", "state-complexity-change", "viewer-visible-family-version-change", "action-owner-role-change", "veronica-production-policy-change", "semantic-proposition-version-change", "semantic-state-relation-change", "semantic-segmentation-change"], canonicalImageInvalidatesOn: [...cacheInvalidation.canonicalImageInvalidatesOn, "final-treatment-change", "motif-coverage-change", "reuse-decision-change", "state-aware-provider-projection-version-change", "action-owner-role-change", "veronica-production-policy-change", "provider-prompt-quality-version-change", "semantic-state-relation-change"], renderEventsInvalidateOn: [...cacheInvalidation.renderEventsInvalidateOn, "final-treatment-change", "diagram-status-change", "canonical-timing-change", "visual-event-strategy-change", "veronica-production-policy-change", "semantic-segmentation-change"] } } as PositioningVisualPlanV2;
  const semanticQuality = calculateVeronicaSemanticQuality(canonical);
  const qualityPlan = { ...canonical, semanticQuality } as PositioningVisualPlanV2;
  // Rebuild readiness from the current canonical treatment.  A remediation-era
  // validation result is an input cache artifact, not evidence about this
  // freshly projected plan; keeping it would permanently poison a corrected
  // scene (while validateVeronicaProviderReadiness still fails closed for a
  // genuinely supplied failed plan).
  const readinessCandidate = { ...qualityPlan, validation: { status: "pass" as const, failures: [] } } as PositioningVisualPlanV2;
  const providerReadiness = validateVeronicaProviderReadiness(readinessCandidate);
  const validationFailures = providerReadiness.issues.map((issue) => `${issue.code}:${issue.sceneId}:${issue.reason}`);
  const final = { ...qualityPlan, providerReadiness, validation: { status: validationFailures.length === 0 ? "pass" as const : "fail" as const, failures: validationFailures } };
  return { ...final, planHash: stableHash(final) } as PositioningVisualPlanV2;
}

export type VeronicaSemanticFindingCode = VeronicaPreImageSemanticReview["findings"][number]["code"];

export interface VeronicaSemanticRemediationDecision {
  readonly sceneId: string;
  readonly remediationRound: number;
  readonly sourceFindingCodes: readonly VeronicaSemanticFindingCode[];
  readonly treatmentBeforeHash: string;
  readonly treatmentAfterHash: string;
  readonly remediationPolicyVersion: string;
  readonly propositionHash: string;
  readonly remediationConfidence: VeronicaSemanticProposition["confidence"];
  readonly remediationStrategy: VeronicaSemanticProposition["visualMechanism"];
}

export interface VeronicaSemanticRemediationResult {
  readonly plan: PositioningVisualPlanV2;
  readonly initialReviews: readonly VeronicaPreImageSemanticReview[];
  readonly reviews: readonly VeronicaPreImageSemanticReview[];
  readonly decisions: readonly VeronicaSemanticRemediationDecision[];
  readonly unchangedSceneIds: readonly string[];
  readonly rounds: number;
  readonly convergenceStatus: "CONVERGED" | "NO_OP" | "SEMANTIC_REMEDIATION_EXHAUSTED";
  readonly remainingFindings: readonly VeronicaPreImageSemanticReview["findings"][number][];
  readonly semanticPlanHash: string;
}

function gatePlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly narrationByScene: readonly string[];
}): readonly VeronicaPreImageSemanticReview[] {
  const motif = input.plan.selectedRecurringMotif?.concept;
  const motifProvenanceMatchesEpisode = !input.plan.selectedRecurringMotif?.episodeContentId || input.plan.selectedRecurringMotif.episodeContentId === input.plan.contentId;
  const episodeMotifSupported = Boolean(motif && doorway.test(motif) && motifProvenanceMatchesEpisode && input.narrationByScene.some((narration) => doorway.test(narration)));
  return input.plan.scenes.map((scene, index) => {
    const previous = input.plan.scenes[index - 1];
    const narration = input.narrationByScene[index] ?? scene.narrationAnchor;
    // Stored propositions are cacheable output, not narration authority.  A
    // final gate always derives from the selected source again so an older
    // strategy template cannot retain semantic control after remediation.
    const proposition = deriveVeronicaSemanticProposition({ scene, narration });
    return reviewVeronicaPreImageTreatment({
      contentId: input.plan.contentId,
      sceneId: scene.sceneId,
      plannerVersion: input.plan.plannerVersion,
      narration,
      narrationAnchor: scene.narrationAnchor,
      visibleThesis: scene.visibleThesis,
      newInformation: scene.newInformation ?? scene.treatment.narrativeBeat,
      treatment: scene.treatment,
      ...(previous ? { previousTreatment: previous.treatment } : {}),
      ...(previous?.visibleThesis ? { previousVisibleThesis: previous.visibleThesis } : {}),
      proposition,
      ...(motif ? { selectedMotif: motif } : {}),
      episodeMotifSupported,
      format: input.plan.format,
    });
  });
}

function applyEpisodeQualityFindings(
  reviews: readonly VeronicaPreImageSemanticReview[],
  plan: PositioningVisualPlanV2,
): readonly VeronicaPreImageSemanticReview[] {
  const quality = calculateVeronicaSemanticQuality(plan);
  if (quality.status === "PASS" || reviews.length === 0) return reviews;
  return reviews.map((review, index) => {
    if (index !== 0) return review;
    const additions = quality.findingCodes.map((code) => ({
      code,
      severity: "blocker" as const,
      message: code === "REMEDIATION_TEMPLATE_COLLAPSE"
        ? "Remediated scenes reuse the same semantic mechanism, action, and environment across distinct narration beats."
        : "At least one remediated semantic proposition remains low-confidence and cannot be promoted to a provider treatment.",
    }));
    return veronicaPreImageSemanticReviewSchema.parse({
      ...review,
      status: "manual-review-required",
      findings: [...review.findings, ...additions],
      requiredEdits: [...review.requiredEdits, ...additions.map((finding) => finding.message)],
      driftFlags: [...new Set([...review.driftFlags, ...additions.map((finding) => finding.code)])],
    });
  });
}

function maximumReuseRate(values: readonly string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.round(Math.max(...counts.values()) / values.length * 10_000) / 10_000;
}

export function calculateVeronicaSemanticQuality(plan: PositioningVisualPlanV2): VeronicaSemanticQualityMetrics {
  const policy = resolveVeronicaProductionPolicy(plan.format).semanticAutoRemediation;
  const remediated = plan.scenes.filter((scene) => scene.semanticProposition !== undefined);
  const genericFallback = remediated.filter((scene) => scene.semanticProposition?.visualMechanism === "UNRESOLVED" || /\b(?:occupation-neutral evidence and comparison setting|tied to the narrated|at causal step|recognizes? the consequence|chooses? accordingly)\b/iu.test(`${scene.visibleThesis} ${scene.treatment.environment} ${scene.treatment.action}`));
  const mechanisms = remediated.map((scene) => scene.semanticProposition!.visualMechanism);
  const actionFamilies = remediated.map((scene) => `${scene.semanticProposition!.visualMechanism}:${scene.semanticProposition!.buyerConsequenceFamily}`);
  const environmentFamilies = remediated.map((scene) => normalizeVeronicaViewerVisibleFamilies(scene, plan.selectedRecurringMotif?.concept).environmentFamily);
  const intentionalMotif = plan.scenes.filter((scene) => scene.semanticProposition?.narrationNativeMetaphor && /doorway|threshold|foothold/iu.test(`${scene.visibleThesis} ${scene.treatment.environment} ${scene.treatment.props.join(" ")}`));
  const remediationTemplateReuseRate = maximumReuseRate(mechanisms);
  const genericFallbackSceneRate = remediated.length ? Math.round(genericFallback.length / remediated.length * 10_000) / 10_000 : 0;
  const repeatedActionFamilyRate = maximumReuseRate(actionFamilies);
  const repeatedEnvironmentFamilyRate = maximumReuseRate(environmentFamilies);
  const intentionalMotifReuseRate = plan.scenes.length ? Math.round(intentionalMotif.length / plan.scenes.length * 10_000) / 10_000 : 0;
  const findingCodes: VeronicaSemanticQualityMetrics["findingCodes"][number][] = [];
  if (genericFallbackSceneRate > policy.maximumGenericFallbackSceneRate || (intentionalMotifReuseRate < 0.5 && remediated.length >= 3 && remediationTemplateReuseRate > policy.maximumRepeatedSemanticFamilyRate && repeatedActionFamilyRate > policy.maximumRepeatedSemanticFamilyRate && repeatedEnvironmentFamilyRate > policy.maximumRepeatedSemanticFamilyRate)) findingCodes.push("REMEDIATION_TEMPLATE_COLLAPSE");
  if (remediated.some((scene) => Object.values(scene.semanticProposition!.confidence).some((confidence) => confidence === "LOW"))) findingCodes.push("SEMANTIC_REMEDIATION_LOW_CONFIDENCE");
  return {
    schemaVersion: "veronica-semantic-quality.v1",
    remediationTemplateReuseRate,
    genericFallbackSceneRate,
    repeatedActionFamilyRate,
    repeatedEnvironmentFamilyRate,
    intentionalMotifReuseRate,
    accidentalRepetitionRate: plan.diversityMetrics?.accidentalVisualRepetitionRate ?? 0,
    status: findingCodes.length === 0 ? "PASS" : "FAIL",
    findingCodes,
  };
}

export function validateVeronicaProviderReadiness(plan: PositioningVisualPlanV2): VeronicaProviderReadinessResult {
  const issues: VeronicaProviderReadinessResult["issues"][number][] = [];
  if (plan.validation?.status === "fail") {
    issues.push({ sceneId: plan.scenes[0]?.sceneId ?? "episode", code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: `canonical-validation-failed:${plan.validation.failures.join(",") || "unspecified"}` });
  }
  const motifProvenanceMatchesEpisode = !plan.selectedRecurringMotif?.episodeContentId || plan.selectedRecurringMotif.episodeContentId === plan.contentId;
  const episodeMotifSupported = Boolean(plan.selectedRecurringMotif && doorway.test(plan.selectedRecurringMotif.concept) && motifProvenanceMatchesEpisode && plan.scenes.some((scene) => doorway.test(scene.narrationAnchor)));
  for (const [index, scene] of plan.scenes.entries()) {
    const proposition = scene.semanticProposition;
    const actorAssignments = scene.treatment.actors ?? [];
    const ownerAssignment = actorAssignments.find((actor) => actor.actorId === scene.treatment.actionOwnerActorId);
    const invalidActorReference = actorAssignments.some((actor) => actor.role !== "expert" && actor.identityAuthority === "canonical-protagonist")
      || (plan.continuity?.mode === "persistent-protagonist" && actorAssignments.some((actor) => actor.role === "expert" && actor.identityAuthority !== "canonical-protagonist"));
    if (actorAssignments.length === 0 || invalidActorReference || ((scene.treatment.actionOwnerRole === "expert" || scene.treatment.actionOwnerRole === "buyer") && ownerAssignment?.actionOwnership !== "primary")) {
      issues.push({ sceneId: scene.sceneId, code: "PROVIDER_PROMPT_SEMANTIC_BLOCKER", reason: "actor-ownership-contract-invalid-or-contradictory" });
    }
    if (!proposition) issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: "provider-target scene has no structured proposition" });
    if (proposition) {
      const claim = assessVeronicaNarrationClaimIntegrity(proposition.narrationClaim);
      const coherence = assessVeronicaPropositionInternalCoherence(proposition);
      const compatibility = assessVeronicaTreatmentPropositionCompatibility({ treatment: scene.treatment, proposition, narration: scene.narrationAnchor, episodeMotifSupported });
      const grounding = assessVeronicaSourceGroundedSemanticConsistency({ narration: scene.narrationAnchor, proposition, treatment: scene.treatment, visibleThesis: scene.visibleThesis });
      if (claim.status === "FAIL") issues.push({ sceneId: scene.sceneId, code: "INCOMPLETE_NARRATION_CLAIM", reason: claim.reasons.join(",") });
      if (coherence.status === "FAIL") issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROPOSITION_INTERNAL_CONTRADICTION", reason: coherence.reasons.join(",") });
      if (grounding.status === "FAIL") issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: `source-grounding:${grounding.reasons.join(",")}` });
      if (compatibility.status === "FAIL") {
        issues.push({ sceneId: scene.sceneId, code: "TREATMENT_PROPOSITION_COMPATIBILITY", reason: compatibility.reasons.join(",") });
        if (compatibility.reasons.includes("treatment-polarity-mismatch")) issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_POLARITY_MISMATCH", reason: "final treatment reverses proposition polarity" });
        if (compatibility.reasons.includes("unsupported-doorway-motif")) issues.push({ sceneId: scene.sceneId, code: "CROSS_EPISODE_MOTIF_LEAKAGE", reason: "doorway treatment lacks episode-local narration evidence" });
      }
    }
    const quality = assessVeronicaVisibleThesisQuality({ thesis: scene.visibleThesis, narration: scene.narrationAnchor, treatment: scene.treatment, ...(scene.semanticProposition ? { proposition: scene.semanticProposition } : {}), ...(plan.scenes[index - 1]?.visibleThesis ? { previousThesis: plan.scenes[index - 1]!.visibleThesis } : {}) });
    if (!quality.checks.explicit) issues.push({ sceneId: scene.sceneId, code: "VISIBLE_THESIS_REQUIRED", reason: "provider-target scene has no explicit visible thesis" });
    else if (!quality.checks.linguisticSanity || !quality.checks.finitePredicate || !quality.checks.sceneSpecific) issues.push({ sceneId: scene.sceneId, code: "MALFORMED_VISIBLE_THESIS", reason: quality.reasons.join(",") });
    else if (!quality.checks.narrationGrounded || !quality.checks.visuallyExpressible || !quality.checks.distinctFromPrevious) issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: quality.reasons.join(",") });
    const assets = plan.assets.filter((asset) => asset.sceneId === scene.sceneId);
    if (assets.length === 0) issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: "provider-target scene has no projected asset" });
    const finalState = resolveFinalStateComplexity(scene, plan.format);
    if ((proposition?.polarity === "CONTRAST" || proposition?.polarity === "TRANSITION_NEGATIVE_TO_POSITIVE" || proposition?.polarity === "TRANSITION_POSITIVE_TO_NEGATIVE") && finalState === "SINGLE_STATE") {
      issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: "polarity-requires-transition-or-state-specific-projection" });
    }
    if (finalState === "MULTI_STATE_REQUIRED") {
      const stateFingerprints = assets.map((asset) => asset.promptCompilation
        ? normalized(`${asset.promptCompilation.result.compositionSummary} ${asset.promptCompilation.result.depictedState.action} ${asset.promptCompilation.result.depictedState.consequence} ${asset.promptCompilation.result.evidenceIncluded.join(" ")}`)
        : (() => {
        const moment = asset.prompt.match(/Depict (?:the (?:earlier|later) causal state|comparison side [AB]|conditional alternative [AB]):\s*([^.]*)/iu)?.[1] ?? "";
        const composition = asset.prompt.match(/Composition:\s*([^.]*)/iu)?.[1] ?? "";
        const evidence = asset.prompt.match(/Must show:\s*([^.]*)/iu)?.[1] ?? "";
        const action = asset.prompt.match(/primary visible actor is [^.]+, and ([^.]*)/iu)?.[1] ?? "";
        const response = asset.prompt.match(/visible reaction is ([^.]*)/iu)?.[1] ?? "";
        return normalized(`${moment} ${composition} ${evidence} ${action} ${response}`);
      })());
      if (assets.length < 2 || stateFingerprints.some((fingerprint) => !fingerprint) || new Set(stateFingerprints).size !== stateFingerprints.length) {
        issues.push({ sceneId: scene.sceneId, code: "PROVIDER_PROJECTION_SEMANTIC_MISMATCH", reason: "multi-state-assets-lack-distinct-state-specific-fingerprints" });
      }
      const stateProjectionMismatch = assets.some((asset, assetIndex) => {
        if (asset.promptCompilation) {
          return asset.promptCompilation.result.depictedState.stateRelation !== proposition?.stateRelation
            || asset.promptCompilation.result.depictedState.polarity !== proposition?.polarity;
        }
        const specification = multiStateSpecification(scene, assetIndex + 1);
        const projectedAction = asset.prompt.match(/primary visible actor is [^.]+, and ([^.]*)/iu)?.[1] ?? "";
        const statePolarity = classifyVeronicaSemanticPolarity(`${specification.condition} ${specification.response}`);
        const actionPolarity = classifyVeronicaSemanticPolarity(projectedAction);
        const actionNegative = actionPolarity === "NEGATIVE_STATE" || /\b(?:conflicting|unrelated|withhold\w*|hesitat\w*|pause\w*|cannot|no clear|none resolves|without)\b/iu.test(projectedAction);
        return !asset.prompt.includes(stateMomentInstruction(specification))
          || (statePolarity === "POSITIVE_STATE" && actionNegative)
          || (statePolarity === "NEGATIVE_STATE" && actionPolarity === "POSITIVE_STATE");
      });
      if (stateProjectionMismatch) issues.push({ sceneId: scene.sceneId, code: "PROVIDER_PROJECTION_SEMANTIC_MISMATCH", reason: "multi-state-asset-action-or-polarity-does-not-match-its-state" });
    }
    for (const asset of assets) {
      const expectsProtagonist = actorAssignments.some((actor) => actor.role === "expert" && actor.identityAuthority === "canonical-protagonist");
      const expectedIdentityId = plan.continuity?.mode === "persistent-protagonist" ? plan.continuity.identityId : null;
      const canonicalReferenceValid = !expectsProtagonist || (asset.subjectIdentityId === expectedIdentityId && asset.canonicalReferenceAssetId === `${expectedIdentityId}-approved-reference` && asset.referenceAssetId === asset.canonicalReferenceAssetId);
      const observerReferenceInvalid = !expectsProtagonist && (asset.subjectIdentityId !== null || asset.canonicalReferenceAssetId != null || asset.referenceAssetId !== null);
      if (!canonicalReferenceValid || observerReferenceInvalid) issues.push({ sceneId: scene.sceneId, assetId: asset.assetId, code: "PROVIDER_PROMPT_SEMANTIC_BLOCKER", reason: !canonicalReferenceValid ? "canonical-protagonist-reference-authority-missing" : "non-protagonist-scene-inherits-protagonist-reference" });
      if (asset.promptCompilation?.semanticQa?.status === "BLOCKED") issues.push({ sceneId: scene.sceneId, assetId: asset.assetId, code: "PROVIDER_PROMPT_SEMANTIC_BLOCKER", reason: asset.promptCompilation.semanticQa.blockers.map((blocker) => `${blocker.code}:${blocker.canonicalField}`).join(",") });
      const lexicalReasons = providerPromptLexicalIntegrityReasons(asset.prompt);
      if (lexicalReasons.length > 0) issues.push({ sceneId: scene.sceneId, assetId: asset.assetId, code: "PROVIDER_PROMPT_LEXICAL_CORRUPTION", reason: lexicalReasons.join(",") });
      const reasons = [...providerPromptInternalLanguageReasons(asset.prompt).filter((reason) => !lexicalReasons.includes(reason)), ...providerRequiredVsNegativeConstraintReasons(asset.prompt)];
      if (proposition) {
        reasons.push(...assessVeronicaSourceGroundedSemanticConsistency({ narration: scene.narrationAnchor, proposition, treatment: scene.treatment, visibleThesis: scene.visibleThesis, providerPrompt: asset.prompt }).reasons.map((reason) => `source-grounding:${reason}`));
      }
      if ((!asset.promptCompilation && !asset.prompt.includes("Visible thesis:")) || asset.semanticPurpose !== scene.visibleThesis) reasons.push("provider-prompt-thesis-does-not-match-final-scene");
      if (!asset.prompt.includes(plan.aspectRatio)) reasons.push("provider-prompt-aspect-ratio-mismatch");
      if (reasons.length > 0) issues.push({ sceneId: scene.sceneId, assetId: asset.assetId, code: "PROVIDER_PROMPT_NOT_READY", reason: reasons.join(",") });
      const provenance = asset.projectionProvenance;
      const promptPolarity = classifyVeronicaSemanticPolarity(asset.prompt);
      const unsupportedTemporalProjection = (proposition?.stateRelation === "CONTRAST" || proposition?.stateRelation === "CONDITIONAL_ALTERNATIVES")
        && /(?:Depict the (?:earlier|later) causal state:|Prior context:|Emerging consequence:)/iu.test(asset.prompt);
      const promptPolarityInversion = (proposition?.polarity === "NEGATIVE_STATE" && promptPolarity === "POSITIVE_STATE")
        || (proposition?.polarity === "POSITIVE_STATE" && promptPolarity === "NEGATIVE_STATE");
      const projectionReasons = [
        ...(!provenance ? ["missing-projection-provenance"] : []),
        ...(!scene.materializationRevision ? ["missing-scene-materialization-revision"] : []),
        ...(provenance && scene.materializationRevision && provenance.materializationRevisionId !== scene.materializationRevision.revisionId ? ["mixed-scene-materialization-revision"] : []),
        ...(provenance && provenance.sourceTreatmentHash !== scene.treatment.treatmentHash ? ["stale-source-treatment-hash"] : []),
        ...(provenance && provenance.sourcePropositionHash !== (proposition?.propositionHash ?? null) ? ["stale-source-proposition-hash"] : []),
        ...(provenance && provenance.stateProjectionPolicyVersion !== VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION ? ["stale-state-projection-version"] : []),
        ...(provenance && provenance.providerPromptHash !== stableHash(asset.prompt) ? ["provider-prompt-hash-mismatch"] : []),
        ...(plan.imagePromptGenerationStrategy !== "legacy-deterministic" && !asset.promptCompilation ? ["missing-structured-prompt-compilation"] : []),
        ...(asset.promptCompilation && asset.promptCompilation.input.provenance.materializationRevisionId !== scene.materializationRevision?.revisionId ? ["prompt-compilation-mixed-materialization-revision"] : []),
        ...(asset.promptCompilation && asset.promptCompilation.input.provenance.treatmentHash !== scene.treatment.treatmentHash ? ["prompt-compilation-stale-treatment-hash"] : []),
        ...(asset.promptCompilation && asset.promptCompilation.input.provenance.propositionHash !== proposition?.propositionHash ? ["prompt-compilation-stale-proposition-hash"] : []),
        ...(asset.promptCompilation && asset.promptCompilation.inputHash !== provenance?.promptCompilationInputHash ? ["prompt-compilation-input-provenance-mismatch"] : []),
        ...(asset.promptCompilation && asset.promptCompilation.resultHash !== provenance?.promptCompilationResultHash ? ["prompt-compilation-result-provenance-mismatch"] : []),
        ...(asset.promptCompilation && stableHash(asset.promptCompilation.result) !== asset.promptCompilation.resultHash ? ["prompt-compilation-result-hash-mismatch"] : []),
        ...(asset.promptCompilation && asset.promptCompilation.result.imagePrompt !== asset.prompt ? ["compiled-provider-prompt-mismatch"] : []),
        ...(provenance && provenance.projectionRevisionId !== stableHash({
          sourceTreatmentHash: provenance.sourceTreatmentHash,
          sourcePropositionHash: provenance.sourcePropositionHash,
          materializationRevisionId: provenance.materializationRevisionId,
          stateProjectionPolicyVersion: provenance.stateProjectionPolicyVersion,
          motifId: provenance.motifId,
          projectionStrategy: provenance.projectionStrategy,
          providerPromptHash: provenance.providerPromptHash,
          projectedPolarity: provenance.projectedPolarity,
          projectedStateRelation: provenance.projectedStateRelation,
          projectedActorRole: provenance.projectedActorRole,
          projectedConsequencePolarity: provenance.projectedConsequencePolarity,
          ...(provenance.promptCompilerVersion ? { promptCompilerVersion: provenance.promptCompilerVersion } : {}),
          ...(provenance.promptCompilationInputHash ? { promptCompilationInputHash: provenance.promptCompilationInputHash } : {}),
          ...(provenance.promptCompilationResultHash ? { promptCompilationResultHash: provenance.promptCompilationResultHash } : {}),
          ...(provenance.promptCompilerModel ? { promptCompilerModel: provenance.promptCompilerModel } : {}),
          ...(provenance.promptCompilerReasoningEffort ? { promptCompilerReasoningEffort: provenance.promptCompilerReasoningEffort } : {}),
        }) ? ["projection-revision-hash-mismatch"] : []),
        ...(/\b(?:doorway|threshold|foothold|future paths?)\b/iu.test(asset.prompt) && !proposition?.narrationNativeMetaphor && !doorway.test(scene.narrationAnchor) && !episodeMotifSupported ? ["unsupported-doorway-projection"] : []),
        ...(promptPolarityInversion ? ["projection-polarity-inversion"] : []),
        ...(unsupportedTemporalProjection ? ["non-temporal-relation-projected-as-chronology"] : []),
      ];
      if (projectionReasons.length > 0) issues.push({ sceneId: scene.sceneId, assetId: asset.assetId, code: "PROVIDER_PROJECTION_SEMANTIC_MISMATCH", reason: projectionReasons.join(",") });
    }
  }
  for (const pair of plan.diversityMetrics?.harmfulRepetitionPairs ?? []) {
    const sceneId = pair.split("->").at(-1) ?? pair;
    issues.push({ sceneId, code: "HARMFUL_REPETITION", reason: `adjacent pair ${pair}: final viewer-visible environment, composition, camera, and interaction repeat across adjacent scenes` });
  }
  const semanticQuality = plan.semanticQuality ?? calculateVeronicaSemanticQuality(plan);
  if (semanticQuality.status === "FAIL") issues.push({ sceneId: plan.scenes[0]?.sceneId ?? "episode", code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: semanticQuality.findingCodes.join(",") });
  return {
    schemaVersion: "veronica-provider-readiness.v2",
    qualityVersion: VERONICA_PROVIDER_PROMPT_QUALITY_VERSION,
    status: issues.length === 0 ? "PASS" : "FAIL",
    checkedSceneCount: plan.scenes.length,
    checkedAssetCount: plan.assets.length,
    missingThesisCount: issues.filter((issue) => issue.code === "VISIBLE_THESIS_REQUIRED").length,
    malformedThesisCount: issues.filter((issue) => issue.code === "MALFORMED_VISIBLE_THESIS").length,
    blockedProjectionCount: issues.filter((issue) => issue.code === "VISIBLE_THESIS_REQUIRED" || issue.code === "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY" || issue.code === "PROVIDER_PROMPT_SEMANTIC_BLOCKER").length,
    internalLanguageIssueCount: issues.filter((issue) => issue.code === "PROVIDER_PROMPT_NOT_READY" && issue.reason.includes("internal-remediation-language")).length,
    incompleteClaimCount: issues.filter((issue) => issue.code === "INCOMPLETE_NARRATION_CLAIM").length,
    polarityMismatchCount: issues.filter((issue) => issue.code === "SEMANTIC_POLARITY_MISMATCH").length,
    propositionContradictionCount: issues.filter((issue) => issue.code === "SEMANTIC_PROPOSITION_INTERNAL_CONTRADICTION").length,
    treatmentIncompatibilityCount: issues.filter((issue) => issue.code === "TREATMENT_PROPOSITION_COMPATIBILITY").length,
    projectionMismatchCount: issues.filter((issue) => issue.code === "PROVIDER_PROJECTION_SEMANTIC_MISMATCH").length,
    lexicalCorruptionCount: issues.filter((issue) => issue.code === "PROVIDER_PROMPT_LEXICAL_CORRUPTION").length,
    motifLeakageCount: issues.filter((issue) => issue.code === "CROSS_EPISODE_MOTIF_LEAKAGE").length,
    harmfulRepetitionCount: issues.filter((issue) => issue.code === "HARMFUL_REPETITION").length,
    issues,
  };
}

function repairBlockedScene(input: {
  readonly scene: PlannedScene;
  readonly narration: string;
  readonly findings: readonly VeronicaPreImageSemanticReview["findings"][number][];
  readonly format: PositioningVisualPlanV2["format"];
}): PlannedScene {
  const codes = new Set(input.findings.map((finding) => finding.code));
  const proposition = deriveVeronicaSemanticProposition({ scene: input.scene, narration: input.narration });
  const projected = proposition.visualMechanism === "UNRESOLVED" ? undefined : visualTreatmentFromProposition({ scene: input.scene, proposition, preserveEnvironment: false });
  const currentCompatibility = assessVeronicaTreatmentPropositionCompatibility({ treatment: input.scene.treatment, proposition, narration: input.narration });
  const strongReplan = ["ABSTRACT_PROP_DRIFT", "SEMANTICALLY_DECORATIVE_SCENE", "NARRATION_RELATIONSHIP_MISMATCH", "MALFORMED_VISIBLE_THESIS", "SEMANTIC_REMEDIATION_LOW_CONFIDENCE", "REMEDIATION_TEMPLATE_COLLAPSE", "INCOMPLETE_NARRATION_CLAIM", "SEMANTIC_POLARITY_MISMATCH", "SEMANTIC_PROPOSITION_INTERNAL_CONTRADICTION", "TREATMENT_PROPOSITION_COMPATIBILITY", "PROVIDER_PROJECTION_SEMANTIC_MISMATCH", "CROSS_EPISODE_MOTIF_LEAKAGE", "HARMFUL_REPETITION"].some((code) => codes.has(code as VeronicaSemanticFindingCode)) || currentCompatibility.status === "FAIL";
  const needsBuyer = codes.has("BUYER_PERSPECTIVE_REQUIRED");
  const needsThesis = codes.has("VISIBLE_THESIS_REQUIRED") || codes.has("MALFORMED_VISIBLE_THESIS");
  const occupationOnlyRepair = codes.has("OCCUPATION_PROXY_DRIFT") && !strongReplan;
  const needsCompactState = input.format === "short" && codes.has("MULTI_STATE_STILL_AMBIGUITY");
  const neutralizeOccupation = (value: string) => value.replace(occupationGlobal, "professional").replace(/\b(?:shop floor|service counter|trade hall|market aisle)\b/giu, "client-facing work area");
  const thesis = projected?.narrativeBeat ?? input.scene.visibleThesis;
  const baseTreatment: PositioningVisualTreatment = strongReplan && projected
    ? {
        ...input.scene.treatment,
        ...projected,
        motionOpportunities: ["establishing-crop", "subject-detail", "slow-push"],
      }
    : {
        ...input.scene.treatment,
        ...(needsThesis && projected ? { narrativeBeat: projected.narrativeBeat } : {}),
        ...(needsBuyer && projected ? { action: projected.action, actionOwnerRole: projected.actionOwnerRole } : {}),
        ...(occupationOnlyRepair ? { subjectRequirement: neutralizeOccupation(input.scene.treatment.subjectRequirement), environment: neutralizeOccupation(input.scene.treatment.environment), props: input.scene.treatment.props.map(neutralizeOccupation) } : {}),
        ...(needsCompactState && projected ? { composition: `one decisive transition moment; ${projected.composition}`, action: projected.action, actionOwnerRole: projected.actionOwnerRole } : {}),
      };
  const treatment = refreshFinalTreatmentDerivedState(baseTreatment, baseTreatment.actionOwnerRole ?? proposition.actorRole, proposition.propositionHash);
  return {
    ...input.scene,
    narrationAnchor: input.narration,
    treatment,
    visibleThesis: needsThesis || strongReplan ? thesis : input.scene.visibleThesis,
    newInformation: codes.has("SEMANTICALLY_DECORATIVE_SCENE") || strongReplan
      ? `${proposition.cause ?? proposition.narrationClaim}; ${proposition.consequence}.`
      : input.scene.newInformation,
    semanticProposition: proposition,
    semanticCoherence: {
      claimIntegrity: assessVeronicaNarrationClaimIntegrity(proposition.narrationClaim).status,
      polarityCoherence: assessVeronicaPropositionInternalCoherence(proposition).status,
      propositionInternalCoherence: assessVeronicaPropositionInternalCoherence(proposition).status,
      treatmentPropositionCompatibility: assessVeronicaTreatmentPropositionCompatibility({ treatment, proposition, narration: input.narration }).status,
    },
    ...(needsCompactState ? { stateComplexity: "DECISIVE_TRANSITION_MOMENT" as const } : {}),
  };
}

/** Gate-driven, provider-free, bounded semantic remediation. No content ID is special-cased. */
export function runVeronicaSemanticRemediation(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly narrationByScene: readonly string[];
}): VeronicaSemanticRemediationResult {
  const policy = resolveVeronicaProductionPolicy(input.plan.format).semanticAutoRemediation;
  const initialReviews = gatePlan(input);
  const actionable = (review: VeronicaPreImageSemanticReview) => review.findings.filter((finding) =>
    finding.severity === "blocker" || finding.severity === "error" ||
    (finding.severity === "warning" && policy.actionableWarnings.some((code) => code === finding.code)),
  );
  if (!policy.enabled || initialReviews.every((review) => actionable(review).length === 0)) {
    return {
      plan: input.plan,
      initialReviews,
      reviews: initialReviews,
      decisions: [],
      unchangedSceneIds: input.plan.scenes.map((scene) => scene.sceneId),
      rounds: 0,
      convergenceStatus: "NO_OP",
      remainingFindings: initialReviews.flatMap((review) => actionable(review)),
      semanticPlanHash: input.plan.planHash,
    };
  }
  let plan = input.plan;
  let reviews = initialReviews;
  const decisions: VeronicaSemanticRemediationDecision[] = [];
  let rounds = 0;
  for (let round = 1; round <= policy.maxRounds; round += 1) {
    const findingsByScene = new Map(reviews.map((review) => [review.sceneId, actionable(review)] as const));
    const targets = plan.scenes.filter((scene) => (findingsByScene.get(scene.sceneId)?.length ?? 0) > 0);
    if (targets.length === 0) break;
    rounds = round;
    const scenes = plan.scenes.map((scene, index) => {
      const findings = findingsByScene.get(scene.sceneId) ?? [];
      if (findings.length === 0) return scene;
      const repaired = repairBlockedScene({ scene, narration: input.narrationByScene[index] ?? scene.narrationAnchor, findings, format: plan.format });
      decisions.push({
        sceneId: scene.sceneId,
        remediationRound: round,
        sourceFindingCodes: [...new Set(findings.map((finding) => finding.code))],
        treatmentBeforeHash: scene.treatment.treatmentHash,
        treatmentAfterHash: repaired.treatment.treatmentHash,
        remediationPolicyVersion: policy.policyVersion,
        propositionHash: repaired.semanticProposition!.propositionHash,
        remediationConfidence: repaired.semanticProposition!.confidence,
        remediationStrategy: repaired.semanticProposition!.visualMechanism,
      });
      return repaired;
    });
    const remainingBase = {
      ...plan,
      scenes,
      semanticPlanCacheKey: stableHash({ previous: plan.semanticPlanCacheKey, policyVersion: policy.policyVersion, round, treatments: scenes.map((scene) => scene.treatment.treatmentHash) }),
    };
    plan = { ...remainingBase, planHash: stableHash(remainingBase) } as PositioningVisualPlanV2;
    reviews = applyEpisodeQualityFindings(gatePlan({ plan, narrationByScene: input.narrationByScene }), plan);
    if (reviews.every((review) => actionable(review).length === 0)) break;
  }
  const remainingFindings = reviews.flatMap((review) => actionable(review));
  const convergenceStatus = remainingFindings.length === 0 ? "CONVERGED" as const : "SEMANTIC_REMEDIATION_EXHAUSTED" as const;
  const remediatedSceneIds = new Set(decisions.map((decision) => decision.sceneId));
  const provenance = {
    schemaVersion: "veronica-semantic-remediation.v1",
    policyVersion: policy.policyVersion,
    maxRounds: policy.maxRounds,
    rounds,
    convergenceStatus,
    initialBlockerCount: initialReviews.flatMap((review) => review.findings).filter((finding) => finding.severity === "blocker" || finding.severity === "error").length,
    remainingBlockerCount: remainingFindings.filter((finding) => finding.severity === "blocker" || finding.severity === "error").length,
    decisions,
  };
  const finalBase = {
    ...plan,
    semanticRemediation: provenance,
    validation: {
      status: convergenceStatus === "CONVERGED" ? "pass" as const : "fail" as const,
      failures: remainingFindings.map((finding) => `${finding.code}: ${finding.message}`),
    },
  };
  const finalPlan = { ...finalBase, planHash: stableHash(finalBase) } as PositioningVisualPlanV2;
  return {
    plan: finalPlan,
    initialReviews,
    reviews,
    decisions,
    unchangedSceneIds: input.plan.scenes.filter((scene) => !remediatedSceneIds.has(scene.sceneId)).map((scene) => scene.sceneId),
    rounds,
    convergenceStatus,
    remainingFindings,
    semanticPlanHash: finalPlan.planHash,
  };
}

/** Compatibility entry point used by the production adapter. */
export function hardenVeronicaPreImagePlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly narrationByScene: readonly string[];
}): VeronicaSemanticRemediationResult {
  return runVeronicaSemanticRemediation(input);
}
