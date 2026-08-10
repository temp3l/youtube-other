import { z } from "zod";
import type { GeneratedVisualAsset, PlannedScene, PositioningVisualPlanV2, PositioningVisualTreatment, VeronicaActionOwnerRole, VeronicaProviderReadinessResult, VeronicaSemanticProposition, VeronicaSemanticQualityMetrics, VisualEvent, VisualEventKind } from "./positioning-visual-contracts.js";
import { calculateDiversityMetrics, semanticTokens, stableHash } from "./positioning-visual-semantics.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";
import { assessVeronicaVisibleThesisQuality, deriveVeronicaSemanticProposition, providerPromptInternalLanguageReasons, visualTreatmentFromProposition, VERONICA_PROVIDER_PROMPT_QUALITY_VERSION } from "./veronica-semantic-quality.js";

export const VERONICA_PRE_IMAGE_SEMANTIC_REVIEW_VERSION = "veronica-pre-image-semantic-review.v3" as const;
export const VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION = "veronica-pre-image-semantic-gate.v5" as const;
export const VERONICA_VIEWER_VISIBLE_FAMILY_VERSION = "veronica-viewer-visible-families.v1" as const;
export const VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION = "veronica-state-aware-provider-projection.v4" as const;

const findingSchema = z.strictObject({
  code: z.enum(["ABSTRACT_PROP_DRIFT", "OCCUPATION_PROXY_DRIFT", "VISIBLE_THESIS_REQUIRED", "MALFORMED_VISIBLE_THESIS", "BUYER_PERSPECTIVE_REQUIRED", "SEMANTICALLY_DECORATIVE_SCENE", "NARRATION_RELATIONSHIP_MISMATCH", "INSTANT_READ_FAILURE", "HARMFUL_REPETITION", "MULTI_STATE_STILL_AMBIGUITY", "TEXT_FREE_ABSTRACTION_RISK", "MOTIF_OVERUSE_RISK", "WEAK_BUYER_ACTION", "PROVIDER_COMPOSITION_COMPLEXITY", "SEMANTIC_REMEDIATION_LOW_CONFIDENCE", "REMEDIATION_TEMPLATE_COLLAPSE", "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", "PROVIDER_PROMPT_NOT_READY"]),
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
const buyerAction = /\b(?:hesitat\w*|scan\w*|ignor\w*|stop\w*|approach\w*|choos\w*|select\w*|reject\w*|compar\w*|remember\w*|recall\w*|refer\w*|follow\w*|cross\w*|return\w*|commit\w*|recogniz\w*|gather\w*|arriv\w*|paus\w*|overlook\w*|inspect\w*|understand\w*|trust\w*|categor\w*|point\w*|turn\w*|trace\w*)\b/iu;
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

/**
 * Deterministic Veronica gate. It is intentionally provider-free: model output
 * may enrich prompts later, but it cannot bypass this structured semantic check.
 */
export function reviewVeronicaPreImageTreatment(input: {
  readonly contentId: string; readonly sceneId: string; readonly plannerVersion: string;
  readonly narration: string; readonly narrationAnchor: string; readonly visibleThesis?: string;
  readonly newInformation: string; readonly treatment: PositioningVisualTreatment;
  readonly previousTreatment?: PositioningVisualTreatment; readonly previousVisibleThesis?: string;
  readonly proposition?: VeronicaSemanticProposition; readonly selectedMotif?: string;
}): VeronicaPreImageSemanticReview {
  const relation = `${input.narration} ${input.narrationAnchor}`;
  const visual = `${input.treatment.strategy} ${input.treatment.subjectRequirement} ${input.treatment.environment} ${input.treatment.composition} ${input.treatment.action} ${input.treatment.props.join(" ")}`;
  const findings: z.infer<typeof findingSchema>[] = [];
  const stateComplexity = classifyVeronicaStillStateComplexity(input.narration, input.treatment);
  const thesisQuality = assessVeronicaVisibleThesisQuality({ thesis: input.visibleThesis, narration: relation, treatment: input.treatment, ...(input.proposition ? { proposition: input.proposition } : {}), ...(input.previousVisibleThesis ? { previousThesis: input.previousVisibleThesis } : {}) });
  const buyerConsequenceSupported = input.proposition
    ? input.proposition.buyerConsequenceFamily !== "NONE" && input.proposition.confidence.consequence !== "LOW"
    : buyerAction.test(visual);
  const add = (code: z.infer<typeof findingSchema>["code"], severity: z.infer<typeof findingSchema>["severity"], message: string): void => { findings.push({ code, severity, message }); };
  const nativeDoorway = doorway.test(relation);
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
  if (stateComplexity === "MULTI_STATE_REQUIRED") add("MULTI_STATE_STILL_AMBIGUITY", "warning", "Project this temporal claim to one decisive transition moment, use deterministic motion, or request manual review.");
  if (input.previousTreatment && normalized(input.previousTreatment.environment) === normalized(input.treatment.environment) && normalized(input.previousTreatment.composition) === normalized(input.treatment.composition) && !nativeDoorway) add("HARMFUL_REPETITION", "warning", "Change the viewer-visible interaction grammar; intentional motif reuse is allowed.");
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

function stripSequentialLanguage(value: string | undefined): string {
  return (value ?? "").replace(/\b(?:first|then|later|after|next|eventually)\b/giu, "").replace(/\b(?:becomes?|begins?)\b/giu, "is").replace(/\s+/gu, " ").trim();
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
  if (scene.treatment.actionOwnerRole) return { role: scene.treatment.actionOwnerRole, source: "final-treatment" };
  if (/\b(?:expert|professional)\b/iu.test(scene.treatment.action)) return { role: "expert", source: "action-grammar" };
  if (/\b(?:buyer|prospect|customer)\b/iu.test(scene.treatment.action)) return { role: "buyer", source: "action-grammar" };
  if (scene.treatment.grammar?.continuityIdentityId && /\b(?:expert|professional)\b/iu.test(scene.treatment.subjectRequirement)) return { role: "expert", source: "continuity" };
  return { role: "unresolved", source: "unresolved" };
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
  if (/comparison|everything.at.once|contrast/iu.test(`${scene.treatment.strategy} ${source}`)) return "a simultaneous split comparison holds the crowded signal field beside one clear route";
  if (/widen|adjacent.*arriv/iu.test(source)) return `${actorLabel(role)} actively opens the established threshold wider`;
  if (/future path|foothold/iu.test(source)) return `${actorLabel(role)} stands at the original threshold facing visible connected future paths`;
  if (/doorway|threshold|cross|choos|commit/iu.test(source)) return role === "expert" ? "the recurring professional visibly commits toward the narrower doorway" : `${actorLabel(role)} commits through the clear threshold`;
  return stripSequentialLanguage(scene.treatment.action);
}

function transitionConsequence(scene: PlannedScene): string {
  const source = `${scene.treatment.action} ${scene.visibleThesis}`;
  if (/comparison|everything.at.once|contrast/iu.test(`${scene.treatment.strategy} ${source}`)) return "one dominant association is recognizable while adjacent evidence branches from it";
  if (/widen|adjacent.*arriv/iu.test(source)) return "adjacent buyers are visible at the expanding edge";
  if (/future path|foothold/iu.test(source)) return "connected future paths are visible beyond the original threshold";
  if (/doorway|threshold|cross|choos|commit/iu.test(source)) return "a focused relevant audience is visible beyond the doorway";
  return stripSequentialLanguage(scene.visibleThesis);
}

function transitionContext(scene: PlannedScene): string {
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
  const state = scene.stateComplexity ?? classifyVeronicaStillStateComplexity(scene.narrationAnchor, scene.treatment);
  const policy = resolveVeronicaProductionPolicy(plan.format ?? "short");
  const owner = resolveActionOwner(scene);
  const visibleThesis = stripSequentialLanguage(scene.visibleThesis);
  const visibleThesisSentence = visibleThesis
    ? normalizeProviderPromptSentence(`Visible thesis: ${visibleThesis}`)
    : "";
  const base = [
    `Text-free ${plan.aspectRatio} ${policy.providerPromptLabel}`,
    `Environment: ${stripSequentialLanguage(scene.treatment.environment)}`,
    `Camera: ${stripSequentialLanguage(scene.treatment.camera)}`,
    `Must show: ${scene.treatment.props.map(stripSequentialLanguage).join(", ")}`,
  ].map(normalizeProviderPromptSentence).join(" ");
  if (state === "SINGLE_STATE") return [base, normalizeProviderPromptSentence(`Capture one stable condition: ${stripSequentialLanguage(scene.treatment.action)}`), visibleThesisSentence, normalizeProviderPromptSentence("No readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram")].filter(Boolean).join(" ");
  if (state === "MULTI_STATE_REQUIRED") {
    if (sequenceAsset) {
      const stateInstruction = sequenceAsset.ordinal === 1
        ? `Sequence asset ${sequenceAsset.ordinal} of ${sequenceAsset.total}: show the initial condition and causal context without the later result`
        : `Sequence asset ${sequenceAsset.ordinal} of ${sequenceAsset.total}: show the resulting buyer-visible condition: ${stripSequentialLanguage(scene.treatment.action)}`;
      return [base, normalizeProviderPromptSentence(stateInstruction), visibleThesisSentence, normalizeProviderPromptSentence("Render only this sequence state as one image; do not render a storyboard, panel grid, readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram")].filter(Boolean).join(" ");
    }
    const requirement = policy.stateComplexityRepresentation === "multi-state-sequence"
      ? "MULTI-ASSET SEQUENCE REQUIRED: retain the semantic states as separately prepared assets or deterministic sequence events; do not submit this as one storyboard still"
      : "MANUAL REVIEW REQUIRED: this treatment asks for multiple temporal states and must be reprojected before any provider request";
    return [base, normalizeProviderPromptSentence(requirement), visibleThesisSentence, normalizeProviderPromptSentence("No readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram")].filter(Boolean).join(" ");
  }
  if (owner.role === "unresolved") throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:unresolved-action-owner`);
  const prompt = [base, normalizeProviderPromptSentence("Capture the instant in which the transition is already visible"), normalizeProviderPromptSentence(`Prior context: ${transitionContext(scene)}`), normalizeProviderPromptSentence(`Primary actor: ${actorLabel(owner.role)}`), normalizeProviderPromptSentence(`Current action: ${transitionAction(scene, owner.role)}`), normalizeProviderPromptSentence(`Emerging consequence: ${transitionConsequence(scene)}`), visibleThesisSentence, normalizeProviderPromptSentence("No readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram")].filter(Boolean).join(" ");
  if (/\b(?:first.*then|after.*then|later|eventually|and afterward|arriv\w*.*then.*widen)\b/iu.test(prompt)) throw new Error(`MULTI_STATE_PROVIDER_PROMPT_RISK:${scene.sceneId}`);
  if (owner.role === "expert" && !/Primary actor: the recurring professional/iu.test(prompt)) throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:expert`);
  if (owner.role === "buyer" && !/Primary actor: the buyer/iu.test(prompt)) throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:buyer`);
  return prompt;
}

function finalAssetForScene(plan: PositioningVisualPlanV2, scene: PlannedScene, previous: GeneratedVisualAsset | undefined, sequenceAsset?: VeronicaSequenceAssetProjection): GeneratedVisualAsset {
  const prompt = projectVeronicaProviderPrompt(plan, scene, sequenceAsset);
  const assetId = sequenceAsset && sequenceAsset.ordinal > 1 ? `${scene.assetId}-state-${String(sequenceAsset.ordinal).padStart(2, "0")}` : scene.assetId;
  const base = {
    assetId, contentId: plan.contentId, sceneId: scene.sceneId, semanticPurpose: scene.visibleThesis,
    strategy: scene.treatment.strategy, prompt, textFree: true as const, textInGeneratedImage: false as const,
    nativeAspectRatio: plan.aspectRatio, ratioAdaptations: previous?.ratioAdaptations ?? [],
    subjectIdentityId: plan.continuity.mode === "persistent-protagonist" ? plan.continuity.identityId : null,
    referenceAssetId: previous?.assetId ?? null,
  };
  return { ...base, semanticFingerprint: stableHash({ sceneId: scene.sceneId, prompt, treatmentHash: scene.treatment.treatmentHash }), generatedAssetCacheKey: stableHash({ prompt, treatmentHash: scene.treatment.treatmentHash, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION }) };
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

/**
 * Final treatment owns all scene-derived state. This is deliberately invoked
 * after canonical timing is known, so stale diagrams, events, prompts, cache
 * keys, diversity and cadence cannot survive semantic remediation.
 */
export function rebuildVeronicaFinalTreatmentState(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly sceneTimings: readonly { readonly id: string; readonly timing: { readonly startSeconds: number; readonly endSeconds: number } }[];
}): PositioningVisualPlanV2 {
  const policy = resolveVeronicaProductionPolicy(input.plan.format);
  const timingByIndex = input.sceneTimings;
  if (timingByIndex.length !== input.plan.scenes.length) throw new Error("PRODUCTION_TIMELINE_MISMATCH: scene count differs from final treatment plan.");
  const scenes = input.plan.scenes.map((scene, index) => {
    const timing = timingByIndex[index]!;
    const durationMs = Math.round((timing.timing.endSeconds - timing.timing.startSeconds) * 1_000);
    if (durationMs <= 0) throw new Error(`PRODUCTION_TIMELINE_MISMATCH: ${scene.sceneId} has non-positive duration.`);
    return { ...scene, startMs: Math.round(timing.timing.startSeconds * 1_000), durationMs, stateComplexity: scene.stateComplexity === "DECISIVE_TRANSITION_MOMENT" ? scene.stateComplexity : classifyVeronicaStillStateComplexity(scene.narrationAnchor, scene.treatment) };
  });
  const assetGroups = scenes.map((scene, index) => {
    const sequenceAssetCount = input.plan.format === "long" && scene.stateComplexity === "MULTI_STATE_REQUIRED" ? 2 : 1;
    const previousSceneAsset = index === 0 ? undefined : input.plan.assets[index - 1];
    return Array.from({ length: sequenceAssetCount }, (_, assetIndex) => finalAssetForScene(
      input.plan,
      scene,
      assetIndex === 0 ? previousSceneAsset : undefined,
      sequenceAssetCount > 1 ? { ordinal: assetIndex + 1, total: sequenceAssetCount } : undefined,
    ));
  });
  const assets = assetGroups.flat();
  const events: VisualEvent[] = scenes.flatMap((scene, index) => {
    const sceneAssets = assetGroups[index]!;
    const count = Math.max(1, Math.ceil(scene.durationMs / (policy.eventDurationRangeSeconds[1] * 1_000)));
    const interval = Math.floor(scene.durationMs / count);
    return Array.from({ length: count }, (_, ordinal) => {
      const asset = sceneAssets[Math.min(sceneAssets.length - 1, Math.floor(ordinal * sceneAssets.length / count))]!;
      const durationMs = ordinal === count - 1 ? scene.durationMs - interval * (count - 1) : interval;
      const kind = eventKindForFinalTreatment(scene.treatment, ordinal);
      const base = { eventId: `${scene.sceneId}-event-${String(ordinal + 1).padStart(2, "0")}`.toLowerCase(), sceneId: scene.sceneId, assetId: asset.assetId, kind, startMs: scene.startMs + interval * ordinal, durationMs, aspectRatio: input.plan.aspectRatio, safeRegionIds: ["subject", "overlay", "subtitle"] as const, deterministicParameters: { startScale: kind === "punch-in" ? 1.12 : 1, endScale: kind === "slow-push" || kind === "punch-in" ? 1.16 : 1.04, anchor: kind === "subject-detail" ? "subject" as const : kind === "prop-detail" ? "prop" as const : "center" as const } };
      return { ...base, renderCacheKey: stableHash({ ...base, finalTreatmentHash: scene.treatment.treatmentHash, finalEventVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION }) };
    });
  });
  const scenesWithEvents = scenes.map((scene) => ({
    ...scene,
    eventIds: events.filter((event) => event.sceneId === scene.sceneId).map((event) => event.eventId),
  }));
  const diagrams = scenesWithEvents.flatMap((scene) => scene.treatment.diagram ? [scene.treatment.diagram] : []);
  const finalEnd = events.at(-1) ? events.at(-1)!.startMs + events.at(-1)!.durationMs : 0;
  const narrationEnd = Math.round(timingByIndex.at(-1)!.timing.endSeconds * 1_000);
  if (Math.abs(finalEnd - narrationEnd) > 2) throw new Error("PRODUCTION_TIMELINE_MISMATCH: final event does not end at canonical narration duration.");
  const motif = input.plan.selectedRecurringMotif;
  const motifNarrationSupport = motif ? scenesWithEvents.filter((scene) => /doorway|threshold|widen|foothold|access/iu.test(scene.narrationAnchor)) : [];
  const selectedRecurringMotif = motif && motifNarrationSupport.length > 0 ? { ...motif, sceneIds: motifNarrationSupport.filter((scene) => /doorway|threshold|widen|foothold|access/iu.test(`${scene.visibleThesis} ${scene.treatment.action} ${scene.treatment.props.join(" ")}`)).map((scene) => scene.sceneId) } : undefined;
  const motifScenes = selectedRecurringMotif?.sceneIds ?? [];
  const viewerVisibleFamilies = scenesWithEvents.map((scene) => normalizeVeronicaViewerVisibleFamilies(scene, selectedRecurringMotif?.concept));
  const baseDiversity = calculateDiversityMetrics({ sceneIds: scenesWithEvents.map((scene) => scene.sceneId), features: scenesWithEvents.map((scene) => scene.treatment.grammar ?? { strategy: scene.treatment.strategy, subjectArchetype: scene.treatment.subjectRequirement, environment: scene.treatment.environment, composition: scene.treatment.composition, camera: scene.treatment.camera, props: scene.treatment.props, topology: scene.treatment.diagram?.type ?? "none", semanticTokens: [], continuityIdentityId: input.plan.continuity.mode === "persistent-protagonist" ? input.plan.continuity.identityId : null }), stages: scenesWithEvents.map((scene) => scene.progressionStage), continuity: input.plan.continuity });
  const pairs = viewerVisibleFamilies.slice(1).map((current, index) => {
    const previous = viewerVisibleFamilies[index]!;
    return { pair: `${previous.sceneId}->${current.sceneId}`, sameEnvironment: previous.environmentFamily === current.environmentFamily, sameCamera: previous.cameraFamily === current.cameraFamily, sameInteraction: previous.interactionFamily === current.interactionFamily, sameComposition: previous.compositionFamily === current.compositionFamily, sameIdentity: previous.continuityIdentityFamily === current.continuityIdentityFamily };
  });
  const rate = (key: "sameEnvironment" | "sameCamera" | "sameInteraction" | "sameIdentity") => pairs.length ? Math.round(pairs.filter((pair) => pair[key]).length / pairs.length * 10_000) / 10_000 : 0;
  // Continuity alone is desirable; repetition requires environment, camera,
  // interaction, and composition all to repeat in the same transition.
  const accidentalPairs = pairs.filter((pair) => pair.sameEnvironment && pair.sameCamera && pair.sameInteraction && pair.sameComposition).map((pair) => pair.pair);
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
    const continuityCompatible = input.plan.continuity.mode !== "persistent-protagonist" || source?.subjectIdentityId === input.plan.continuity.identityId;
    const automatic = decision.semanticCompatibility >= 0.8 && decision.eligible && motifCompatible && continuityCompatible && !finalTreatmentChanged;
    return { ...decision, eligible: automatic, reuseMode: automatic ? decision.reuseMode : "not-reusable" as const, cropAdaptation: automatic ? decision.cropAdaptation : "none" as const, decision: automatic ? "AUTO_REUSE_APPROVED" as const : decision.semanticCompatibility >= 0.4 && motifCompatible ? "REUSE_REQUIRES_SEMANTIC_REVIEW" as const : "REUSE_REJECTED" as const, reason: automatic ? decision.reason : finalTreatmentChanged ? "final-treatment-changed-recheck-semantic-compatibility" : !motifCompatible ? "recurring-motif-incompatible" : !continuityCompatible ? "subject-continuity-incompatible" : "semantic-purpose-insufficiently-compatible" };
  });
  const canonical = { ...input.plan, scenes: scenesWithEvents, assets, visualEvents: events, diagrams, assetReuseDecisions, selectedRecurringMotif, diversityMetrics, cadenceMetrics: cadenceForFinalTimeline(input.plan.format, events, assets, narrationEnd), canonicalImagePlanHash: stableHash({ assets, selectedRecurringMotif, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, providerProjectionVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION, actionOwners: scenesWithEvents.map((scene) => scene.treatment.actionOwnerRole ?? null), format: input.plan.format, stateComplexityRepresentation: policy.stateComplexityRepresentation }), renderEventPlanHash: stableHash({ events, finalTiming: narrationEnd, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, format: input.plan.format }), cacheInvalidation: { ...input.plan.cacheInvalidation, semanticPlanInvalidatesOn: [...input.plan.cacheInvalidation.semanticPlanInvalidatesOn, "final-treatment-change", "selected-recurring-motif-change", "state-complexity-change", "viewer-visible-family-version-change", "action-owner-role-change", "veronica-production-policy-change", "semantic-proposition-version-change"], canonicalImageInvalidatesOn: [...input.plan.cacheInvalidation.canonicalImageInvalidatesOn, "final-treatment-change", "motif-coverage-change", "reuse-decision-change", "state-aware-provider-projection-version-change", "action-owner-role-change", "veronica-production-policy-change", "provider-prompt-quality-version-change"], renderEventsInvalidateOn: [...input.plan.cacheInvalidation.renderEventsInvalidateOn, "final-treatment-change", "diagram-status-change", "canonical-timing-change", "visual-event-strategy-change", "veronica-production-policy-change"] } } as PositioningVisualPlanV2;
  const semanticQuality = calculateVeronicaSemanticQuality(canonical);
  const qualityPlan = { ...canonical, semanticQuality } as PositioningVisualPlanV2;
  const providerReadiness = validateVeronicaProviderReadiness(qualityPlan);
  const validationFailures = [...qualityPlan.validation.failures, ...providerReadiness.issues.map((issue) => `${issue.code}:${issue.sceneId}:${issue.reason}`)];
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
  return input.plan.scenes.map((scene, index) => {
    const previous = input.plan.scenes[index - 1];
    return reviewVeronicaPreImageTreatment({
      contentId: input.plan.contentId,
      sceneId: scene.sceneId,
      plannerVersion: input.plan.plannerVersion,
      narration: input.narrationByScene[index] ?? scene.narrationAnchor,
      narrationAnchor: scene.narrationAnchor,
      visibleThesis: scene.visibleThesis,
      newInformation: scene.newInformation ?? scene.treatment.narrativeBeat,
      treatment: scene.treatment,
      ...(previous ? { previousTreatment: previous.treatment } : {}),
      ...(previous?.visibleThesis ? { previousVisibleThesis: previous.visibleThesis } : {}),
      ...(scene.semanticProposition ? { proposition: scene.semanticProposition } : {}),
      ...(motif ? { selectedMotif: motif } : {}),
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
  for (const [index, scene] of plan.scenes.entries()) {
    const quality = assessVeronicaVisibleThesisQuality({ thesis: scene.visibleThesis, narration: scene.narrationAnchor, treatment: scene.treatment, ...(scene.semanticProposition ? { proposition: scene.semanticProposition } : {}), ...(plan.scenes[index - 1]?.visibleThesis ? { previousThesis: plan.scenes[index - 1]!.visibleThesis } : {}) });
    if (!quality.checks.explicit) issues.push({ sceneId: scene.sceneId, code: "VISIBLE_THESIS_REQUIRED", reason: "provider-target scene has no explicit visible thesis" });
    else if (!quality.checks.linguisticSanity || !quality.checks.finitePredicate || !quality.checks.sceneSpecific) issues.push({ sceneId: scene.sceneId, code: "MALFORMED_VISIBLE_THESIS", reason: quality.reasons.join(",") });
    else if (!quality.checks.narrationGrounded || !quality.checks.visuallyExpressible || !quality.checks.distinctFromPrevious) issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: quality.reasons.join(",") });
    const assets = plan.assets.filter((asset) => asset.sceneId === scene.sceneId);
    if (assets.length === 0) issues.push({ sceneId: scene.sceneId, code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: "provider-target scene has no projected asset" });
    for (const asset of assets) {
      const reasons = [...providerPromptInternalLanguageReasons(asset.prompt)];
      if (!asset.prompt.includes("Visible thesis:") || asset.semanticPurpose !== scene.visibleThesis) reasons.push("provider-prompt-thesis-does-not-match-final-scene");
      if (!asset.prompt.includes(plan.aspectRatio)) reasons.push("provider-prompt-aspect-ratio-mismatch");
      if (reasons.length > 0) issues.push({ sceneId: scene.sceneId, assetId: asset.assetId, code: "PROVIDER_PROMPT_NOT_READY", reason: reasons.join(",") });
    }
  }
  const semanticQuality = plan.semanticQuality ?? calculateVeronicaSemanticQuality(plan);
  if (semanticQuality.status === "FAIL") issues.push({ sceneId: plan.scenes[0]?.sceneId ?? "episode", code: "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY", reason: semanticQuality.findingCodes.join(",") });
  return {
    schemaVersion: "veronica-provider-readiness.v1",
    qualityVersion: VERONICA_PROVIDER_PROMPT_QUALITY_VERSION,
    status: issues.length === 0 ? "PASS" : "FAIL",
    checkedSceneCount: plan.scenes.length,
    checkedAssetCount: plan.assets.length,
    missingThesisCount: issues.filter((issue) => issue.code === "VISIBLE_THESIS_REQUIRED").length,
    malformedThesisCount: issues.filter((issue) => issue.code === "MALFORMED_VISIBLE_THESIS").length,
    blockedProjectionCount: issues.filter((issue) => issue.code === "VISIBLE_THESIS_REQUIRED" || issue.code === "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY").length,
    internalLanguageIssueCount: issues.filter((issue) => issue.code === "PROVIDER_PROMPT_NOT_READY" && issue.reason.includes("internal-remediation-language")).length,
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
  const strongReplan = ["ABSTRACT_PROP_DRIFT", "SEMANTICALLY_DECORATIVE_SCENE", "NARRATION_RELATIONSHIP_MISMATCH", "MALFORMED_VISIBLE_THESIS", "SEMANTIC_REMEDIATION_LOW_CONFIDENCE", "REMEDIATION_TEMPLATE_COLLAPSE"].some((code) => codes.has(code as VeronicaSemanticFindingCode));
  const proposition = deriveVeronicaSemanticProposition({ scene: input.scene, narration: input.narration });
  const projected = proposition.visualMechanism === "UNRESOLVED" ? undefined : visualTreatmentFromProposition({ scene: input.scene, proposition, preserveEnvironment: false });
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
  const treatment = refreshFinalTreatmentDerivedState(baseTreatment, baseTreatment.actionOwnerRole ?? proposition.actorRole);
  return {
    ...input.scene,
    narrationAnchor: input.narration,
    treatment,
    visibleThesis: needsThesis || strongReplan ? thesis : input.scene.visibleThesis,
    newInformation: codes.has("SEMANTICALLY_DECORATIVE_SCENE") || strongReplan
      ? `${proposition.cause ?? proposition.narrationClaim}; ${proposition.consequence}.`
      : input.scene.newInformation,
    semanticProposition: proposition,
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
