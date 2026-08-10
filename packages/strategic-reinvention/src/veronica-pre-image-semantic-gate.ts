import { z } from "zod";
import type { GeneratedVisualAsset, PlannedScene, PositioningVisualPlanV2, PositioningVisualTreatment, VeronicaActionOwnerRole, VisualEvent, VisualEventKind } from "./positioning-visual-contracts.js";
import { calculateDiversityMetrics, stableHash } from "./positioning-visual-semantics.js";

export const VERONICA_PRE_IMAGE_SEMANTIC_REVIEW_VERSION = "veronica-pre-image-semantic-review.v2" as const;
export const VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION = "veronica-pre-image-semantic-gate.v3" as const;
export const VERONICA_VIEWER_VISIBLE_FAMILY_VERSION = "veronica-viewer-visible-families.v1" as const;
export const VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION = "veronica-state-aware-provider-projection.v2" as const;

const findingSchema = z.strictObject({
  code: z.enum(["ABSTRACT_PROP_DRIFT", "OCCUPATION_PROXY_DRIFT", "VISIBLE_THESIS_REQUIRED", "BUYER_PERSPECTIVE_REQUIRED", "SEMANTICALLY_DECORATIVE_SCENE", "NARRATION_RELATIONSHIP_MISMATCH", "INSTANT_READ_FAILURE", "HARMFUL_REPETITION", "MULTI_STATE_STILL_AMBIGUITY", "TEXT_FREE_ABSTRACTION_RISK", "MOTIF_OVERUSE_RISK", "WEAK_BUYER_ACTION", "PROVIDER_COMPOSITION_COMPLEXITY"]),
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
  driftFlags: z.array(findingSchema.shape.code), approvedForProviderRequest: z.literal(false),
});
export type VeronicaPreImageSemanticReview = z.infer<typeof veronicaPreImageSemanticReviewSchema>;

const abstract = /\b(?:prism|translucent planes?|shadow grid|light laborator|floating glass|geometric negative-space|symbolic sculpture|abstract-conceptual)\b/iu;
const occupation = /\b(?:hospitality|retail|wellness|pottery|mood board|designer|workshop|service counter|technical consultant|creative director)\b/iu;
const buyerAction = /\b(?:hesitat\w*|scan\w*|ignor\w*|stop\w*|approach\w*|choos\w*|reject\w*|compar\w*|remember\w*|refer\w*|follow\w*|cross\w*|return\w*|commit\w*|recogniz\w*|gather\w*|arriv\w*|paus\w*|overlook\w*)\b/iu;
const doorway = /\b(?:doorway|threshold|foothold|widen|narrow|crossing)\b/iu;
const genericPositioning = /\b(?:niche|positioning|buyer|customer|prospect|referral|recognition|expertise|offer|remember)\b/iu;

function clamp(value: number): number { return Math.max(0, Math.min(1, Math.round(value * 100) / 100)); }
function normalized(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }

export type VeronicaStillStateComplexity = "SINGLE_STATE" | "DECISIVE_TRANSITION_MOMENT" | "MULTI_STATE_REQUIRED";

function family(value: string): string { return normalized(value).replace(/\b(?:the|a|an|with|and|of|to|in)\b/gu, " ").replace(/\s+/gu, " ").trim(); }

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
  const decisive = /\b(?:threshold|doorway|opening|widen\w*|cross\w*|arrival|handoff|contrast|split)\b/iu.test(combined);
  return transition && decisive ? "DECISIVE_TRANSITION_MOMENT" : transition ? "MULTI_STATE_REQUIRED" : "SINGLE_STATE";
}

/**
 * Deterministic Veronica gate. It is intentionally provider-free: model output
 * may enrich prompts later, but it cannot bypass this structured semantic check.
 */
export function reviewVeronicaPreImageTreatment(input: {
  readonly contentId: string; readonly sceneId: string; readonly plannerVersion: string;
  readonly narration: string; readonly narrationAnchor: string; readonly visibleThesis: string;
  readonly newInformation: string; readonly treatment: PositioningVisualTreatment;
  readonly previousTreatment?: PositioningVisualTreatment; readonly selectedMotif?: string;
}): VeronicaPreImageSemanticReview {
  const relation = `${input.narration} ${input.narrationAnchor}`;
  const visual = `${input.treatment.strategy} ${input.treatment.subjectRequirement} ${input.treatment.environment} ${input.treatment.composition} ${input.treatment.action} ${input.treatment.props.join(" ")}`;
  const findings: z.infer<typeof findingSchema>[] = [];
  const stateComplexity = classifyVeronicaStillStateComplexity(input.narration, input.treatment);
  const add = (code: z.infer<typeof findingSchema>["code"], severity: z.infer<typeof findingSchema>["severity"], message: string): void => { findings.push({ code, severity, message }); };
  const nativeDoorway = doorway.test(relation);
  if (abstract.test(visual) && (nativeDoorway || !/human|buyer|customer|person|expert/iu.test(visual))) add("ABSTRACT_PROP_DRIFT", "blocker", "Replace abstraction with the narration-native concrete relationship and visible human consequence.");
  if (genericPositioning.test(relation) && occupation.test(visual)) add("OCCUPATION_PROXY_DRIFT", "blocker", "Use occupation-neutral buyer evidence; profession must not explain a generic positioning claim.");
  if (genericPositioning.test(relation) && !buyerAction.test(visual)) add("BUYER_PERSPECTIVE_REQUIRED", "blocker", "Show an observable buyer/customer action or expert-buyer interaction.");
  if (input.visibleThesis.trim().length < 28) add("VISIBLE_THESIS_REQUIRED", "blocker", "State the visible cause-and-consequence relationship, not an abstract topic label.");
  if (nativeDoorway && !doorway.test(visual)) add("NARRATION_RELATIONSHIP_MISMATCH", "blocker", "Prefer the narration-native doorway/threshold metaphor over indirect visual symbolism.");
  if (input.newInformation.trim().length < 24) add("SEMANTICALLY_DECORATIVE_SCENE", "blocker", "Add a new causal visual fact beyond the preceding scene.");
  if (stateComplexity === "MULTI_STATE_REQUIRED") add("MULTI_STATE_STILL_AMBIGUITY", "warning", "Project this temporal claim to one decisive transition moment, use deterministic motion, or request manual review.");
  if (input.previousTreatment && normalized(input.previousTreatment.environment) === normalized(input.treatment.environment) && normalized(input.previousTreatment.composition) === normalized(input.treatment.composition) && !nativeDoorway) add("HARMFUL_REPETITION", "warning", "Change the viewer-visible interaction grammar; intentional motif reuse is allowed.");
  const driftFlags = [...new Set(findings.map((finding) => finding.code))];
  const blocking = findings.some((finding) => finding.severity === "blocker" || finding.severity === "error");
  const visibleActions = (visual.match(buyerAction) ?? []).length;
  const immediateRelationship = visibleActions > 0 || (nativeDoorway && doorway.test(visual));
  const motifScore = input.selectedMotif && doorway.test(input.selectedMotif) ? (doorway.test(visual) ? 1 : 0.35) : 0.8;
  const overloaded = stateComplexity === "MULTI_STATE_REQUIRED";
  const alignment = nativeDoorway ? (doorway.test(visual) ? 0.96 : 0.2) : /recogniz|referr|evidence|contrast|buyer/iu.test(visual) ? 0.9 : 0.7;
  const informationGain = input.previousTreatment && normalized(input.previousTreatment.action) === normalized(input.treatment.action) ? 0.55 : /contrast|referr|widen|future|pattern/iu.test(visual) ? 0.92 : 0.82;
  return veronicaPreImageSemanticReviewSchema.parse({
    schemaVersion: VERONICA_PRE_IMAGE_SEMANTIC_REVIEW_VERSION, contentId: input.contentId, sceneId: input.sceneId,
    plannerVersion: input.plannerVersion || "legacy-positioning-plan", semanticHash: stableHash({ relation, visibleThesis: input.visibleThesis, newInformation: input.newInformation }), treatmentHash: input.treatment.treatmentHash || stableHash(input.treatment),
    reviewVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, status: blocking ? "manual-review-required" : "pass", findings,
    requiredEdits: findings.filter((finding) => finding.severity === "blocker" || finding.severity === "error").map((finding) => finding.message),
    instantReadScore: clamp((immediateRelationship ? 0.78 : 0.35) + Math.min(0.14, visibleActions * 0.04) + (nativeDoorway && doorway.test(visual) ? 0.08 : 0) - (overloaded ? 0.16 : 0)), narrationAlignmentScore: clamp(alignment),
    visibleThesisScore: clamp((input.visibleThesis.length >= 28 ? 0.78 : 0.25) + (/buyer|doorway|recogniz|contrast|evidence/iu.test(input.visibleThesis) ? 0.12 : 0) - (overloaded ? 0.08 : 0)), buyerPerspectiveScore: clamp(visibleActions > 0 ? Math.min(0.96, 0.72 + visibleActions * 0.06) : 0.2),
    visualInformationGainScore: clamp(informationGain), continuityScore: clamp(motifScore - (input.previousTreatment && normalized(input.previousTreatment.camera) === normalized(input.treatment.camera) ? 0.08 : 0)),
    driftFlags, approvedForProviderRequest: false,
  });
}

interface Proposal { readonly thesis: string; readonly action: string; readonly actionOwnerRole: VeronicaActionOwnerRole; readonly environment: string; readonly composition: string; readonly camera: string; readonly props: readonly string[]; readonly strategy: PositioningVisualTreatment["strategy"]; readonly motion: PositioningVisualTreatment["motionOpportunities"]; }

function proposalFor(narration: string, index: number, total: number): Proposal | null {
  const text = normalized(narration);
  if (!/\b(?:niche|positioning|expertise|recognition|referrals?|foothold|examples|content|offer|prospects?)\b/iu.test(narration)) return null;
  if (/throwing customers|opposite of breadth|simple reason to remember/iu.test(narration)) return { thesis: "A smaller doorway looks risky beside a broad crowd route, then reveals the relevant audience beyond it.", action: "an expert hesitates, then chooses the narrower doorway while relevant buyers approach beyond it", actionOwnerRole: "expert", environment: "occupation-neutral public threshold between a broad crowd route and a focused route", composition: "broad crowd route in the foreground, narrow doorway leading to a visible relevant audience", camera: "35mm buyer-height documentary view", props: ["narrow doorway", "broad crowd route", "focused audience beyond threshold"], strategy: "client-decision", motion: ["establishing-crop", "subject-detail", "reveal", "slow-push"] };
  if (/examples sharper|content easier|offer easier|position of strength/iu.test(narration)) return { thesis: "One clear positioning signal connects examples, recurring content, and an offer so a buyer recognizes the same pattern.", action: "a buyer recognizes one repeated evidence pattern across a concrete example, content output, and offer artifact", actionOwnerRole: "buyer", environment: "occupation-neutral consultation threshold with connected proof surfaces", composition: "one central evidence pattern visibly repeated across three concrete text-free outputs, buyer gaze fixed on the repeated signal", camera: "45mm over-shoulder buyer view", props: ["repeated evidence pattern", "concrete example output", "content and offer artifacts"], strategy: "evidence-proof", motion: ["establishing-crop", "reveal", "prop-detail", "slow-push"] };
  if (/starting broad|doorway not a wall/iu.test(narration)) return { thesis: "Many broad signals make a buyer hesitate; one clear doorway creates access to a larger space beyond it.", action: "a buyer pauses before competing broad signals, then crosses a clear doorway toward the continuing space", actionOwnerRole: "buyer", environment: "occupation-neutral threshold with a visible larger space beyond", composition: "scattered broad signals behind a hesitant buyer, one open doorway and deep continuation ahead", camera: "40mm buyer-height threshold view", props: ["open doorway", "competing broad signals", "visible space beyond threshold"], strategy: "client-decision", motion: ["establishing-crop", "subject-detail", "reveal", "slow-push"] };
  if (/referrals|recurring problems|prospects.*relevant/iu.test(narration)) return { thesis: "A recognizable signal travels through referral and repeated evidence until a prospect recognizes relevance faster.", action: "one buyer introduces a second buyer to the expert while the prospect immediately recognizes the same repeated evidence signal", actionOwnerRole: "buyer", environment: "occupation-neutral referral conversation at the same threshold environment", composition: "one buyer visibly directs another toward the recurring evidence and doorway, with the prospect's recognition response in frame", camera: "50mm conversational over-shoulder view", props: ["introducing gesture", "repeated evidence set", "doorway signal"], strategy: "social-interaction", motion: ["establishing-crop", "subject-detail", "reveal", "slow-push"] };
  if (/adjacent customers.*widen the doorway/iu.test(narration)) return { thesis: "Original matched buyers use an established doorway; adjacent buyers arrive, then access visibly widens.", action: "matched buyers cross first, adjacent buyers gather, and the doorway widens only after demand appears", actionOwnerRole: "expert", environment: "same occupation-neutral threshold and larger space", composition: "existing flow through a narrow doorway, adjacent buyers arriving at its edge, widening transition visible", camera: "35mm lateral threshold view", props: ["established doorway", "matched buyers", "adjacent arrivals"], strategy: "human-scenario", motion: ["establishing-crop", "reveal", "transition-state", "slow-push"] };
  if (/expanding after recognition|everything about you from day one/iu.test(narration)) return { thesis: "Everything-at-once creates weak memory; one clear association first produces recognition before adjacent associations arrive.", action: "a buyer overlooks an all-at-once signal field but remembers one clear route before later associations appear", actionOwnerRole: "none", environment: "same threshold environment arranged as an explicit sequence contrast", composition: "split sequence: crowded all-at-once side versus clear-first doorway route with later branches", camera: "40mm locked comparison view", props: ["scattered signals", "single clear route", "later adjacent paths"], strategy: "comparison-composition", motion: ["split-composition", "reveal", "transition-state", "slow-push"] };
  if (/foothold|entire future/iu.test(narration) || index === total - 1) return { thesis: "The initial doorway is a secure foothold into a larger connected future, not a boundary around it.", action: "the expert and buyer cross the original threshold as the camera reveals multiple future paths beyond", actionOwnerRole: "expert", environment: "resolved version of the recurring threshold opening into connected space", composition: "opening doorway in foreground, foothold at the threshold, several future paths visible beyond", camera: "32mm slow forward threshold reveal", props: ["original doorway", "secure foothold", "connected future paths"], strategy: "transformation", motion: ["establishing-crop", "reveal", "transition-state", "slow-push"] };
  return null;
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

/** Provider projection is deliberately state-aware: a transition is one frame, never a storyboard. */
export function projectVeronicaProviderPrompt(plan: Pick<PositioningVisualPlanV2, "aspectRatio">, scene: PlannedScene): string {
  const state = scene.stateComplexity ?? classifyVeronicaStillStateComplexity(scene.narrationAnchor, scene.treatment);
  const owner = resolveActionOwner(scene);
  const base = [
    `Text-free ${plan.aspectRatio} Veronica conceptual Short`,
    `Environment: ${stripSequentialLanguage(scene.treatment.environment)}`,
    `Camera: ${stripSequentialLanguage(scene.treatment.camera)}`,
    `Must show: ${scene.treatment.props.map(stripSequentialLanguage).join(", ")}`,
  ].map(normalizeProviderPromptSentence).join(" ");
  if (state === "SINGLE_STATE") return `${base} ${normalizeProviderPromptSentence(`Capture one stable condition: ${stripSequentialLanguage(scene.treatment.action)}`)} ${normalizeProviderPromptSentence(`Visible thesis: ${stripSequentialLanguage(scene.visibleThesis)}`)} ${normalizeProviderPromptSentence("No readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram")}`;
  if (state === "MULTI_STATE_REQUIRED") return `${base} ${normalizeProviderPromptSentence("MANUAL REVIEW REQUIRED: this treatment asks for multiple temporal states and must be reprojected before any provider request")} ${normalizeProviderPromptSentence("No readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram")}`;
  if (owner.role === "unresolved") throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:unresolved-action-owner`);
  const prompt = `${base} ${normalizeProviderPromptSentence("Capture the instant in which the transition is already visible")} ${normalizeProviderPromptSentence(`Prior context: ${transitionContext(scene)}`)} ${normalizeProviderPromptSentence(`Primary actor: ${actorLabel(owner.role)}`)} ${normalizeProviderPromptSentence(`Current action: ${transitionAction(scene, owner.role)}`)} ${normalizeProviderPromptSentence(`Emerging consequence: ${transitionConsequence(scene)}`)} ${normalizeProviderPromptSentence("No readable text, logos, UI, occupation proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram")}`;
  if (/\b(?:first.*then|after.*then|later|eventually|and afterward|arriv\w*.*then.*widen)\b/iu.test(prompt)) throw new Error(`MULTI_STATE_PROVIDER_PROMPT_RISK:${scene.sceneId}`);
  if (owner.role === "expert" && !/Primary actor: the recurring professional/iu.test(prompt)) throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:expert`);
  if (owner.role === "buyer" && !/Primary actor: the buyer/iu.test(prompt)) throw new Error(`SEMANTIC_ACTOR_ROLE_MISMATCH:${scene.sceneId}:buyer`);
  return prompt;
}

function finalAssetForScene(plan: PositioningVisualPlanV2, scene: PlannedScene, previous: GeneratedVisualAsset | undefined): GeneratedVisualAsset {
  const prompt = projectVeronicaProviderPrompt(plan, scene);
  const assetId = scene.assetId;
  const base = {
    assetId, contentId: plan.contentId, sceneId: scene.sceneId, semanticPurpose: scene.visibleThesis,
    strategy: scene.treatment.strategy, prompt, textFree: true as const, textInGeneratedImage: false as const,
    nativeAspectRatio: plan.aspectRatio, ratioAdaptations: previous?.ratioAdaptations ?? [],
    subjectIdentityId: plan.continuity.mode === "persistent-protagonist" ? plan.continuity.identityId : null,
    referenceAssetId: previous?.assetId ?? null,
  };
  return { ...base, semanticFingerprint: stableHash({ sceneId: scene.sceneId, prompt, treatmentHash: scene.treatment.treatmentHash }), generatedAssetCacheKey: stableHash({ prompt, treatmentHash: scene.treatment.treatmentHash, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION }) };
}

function cadenceForFinalTimeline(events: readonly VisualEvent[], assets: readonly GeneratedVisualAsset[], durationMs: number) {
  const durations = events.map((event) => event.durationMs / 1_000);
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  const hook = events.filter((event) => /hook|cold-open/iu.test(event.sceneId));
  return {
    durationMs, baseAssetCount: assets.length, visualEventCount: events.length,
    eventsPerBaseAsset: round(events.length / Math.max(1, assets.length)), meanSecondsPerEvent: round(durationMs / Math.max(1, events.length) / 1_000),
    shortestEventSeconds: round(Math.min(...durations)), longestEventSeconds: round(Math.max(...durations)), targetRangeSeconds: [3, 7] as const,
    targetComplianceRate: round(durations.filter((value) => value >= 3 && value <= 7).length / Math.max(1, durations.length)),
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
  const timingByIndex = input.sceneTimings;
  if (timingByIndex.length !== input.plan.scenes.length) throw new Error("PRODUCTION_TIMELINE_MISMATCH: scene count differs from final treatment plan.");
  const scenes = input.plan.scenes.map((scene, index) => {
    const timing = timingByIndex[index]!;
    const durationMs = Math.round((timing.timing.endSeconds - timing.timing.startSeconds) * 1_000);
    if (durationMs <= 0) throw new Error(`PRODUCTION_TIMELINE_MISMATCH: ${scene.sceneId} has non-positive duration.`);
    return { ...scene, startMs: Math.round(timing.timing.startSeconds * 1_000), durationMs, stateComplexity: classifyVeronicaStillStateComplexity(scene.narrationAnchor, scene.treatment) };
  });
  const assets = scenes.map((scene, index) => finalAssetForScene(input.plan, scene, index === 0 ? undefined : input.plan.assets[index - 1]));
  const events: VisualEvent[] = scenes.flatMap((scene, index) => {
    const asset = assets[index]!;
    const count = Math.max(1, Math.ceil(scene.durationMs / 7_000));
    const interval = Math.floor(scene.durationMs / count);
    return Array.from({ length: count }, (_, ordinal) => {
      const durationMs = ordinal === count - 1 ? scene.durationMs - interval * (count - 1) : interval;
      const kind = eventKindForFinalTreatment(scene.treatment, ordinal);
      const base = { eventId: `${scene.sceneId}-event-${String(ordinal + 1).padStart(2, "0")}`.toLowerCase(), sceneId: scene.sceneId, assetId: asset.assetId, kind, startMs: scene.startMs + interval * ordinal, durationMs, aspectRatio: input.plan.aspectRatio, safeRegionIds: ["subject", "overlay", "subtitle"] as const, deterministicParameters: { startScale: kind === "punch-in" ? 1.12 : 1, endScale: kind === "slow-push" || kind === "punch-in" ? 1.16 : 1.04, anchor: kind === "subject-detail" ? "subject" as const : kind === "prop-detail" ? "prop" as const : "center" as const } };
      return { ...base, renderCacheKey: stableHash({ ...base, finalTreatmentHash: scene.treatment.treatmentHash, finalEventVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION }) };
    });
  });
  const diagrams = scenes.flatMap((scene) => scene.treatment.diagram ? [scene.treatment.diagram] : []);
  const finalEnd = events.at(-1) ? events.at(-1)!.startMs + events.at(-1)!.durationMs : 0;
  const narrationEnd = Math.round(timingByIndex.at(-1)!.timing.endSeconds * 1_000);
  if (Math.abs(finalEnd - narrationEnd) > 2) throw new Error("PRODUCTION_TIMELINE_MISMATCH: final event does not end at canonical narration duration.");
  const motif = input.plan.selectedRecurringMotif;
  const selectedRecurringMotif = motif ? { ...motif, sceneIds: scenes.filter((scene) => /doorway|threshold|widen|foothold|access/iu.test(`${scene.visibleThesis} ${scene.treatment.action} ${scene.treatment.props.join(" ")}`)).map((scene) => scene.sceneId) } : undefined;
  const motifScenes = selectedRecurringMotif?.sceneIds ?? [];
  const viewerVisibleFamilies = scenes.map((scene) => normalizeVeronicaViewerVisibleFamilies(scene, selectedRecurringMotif?.concept));
  const baseDiversity = calculateDiversityMetrics({ sceneIds: scenes.map((scene) => scene.sceneId), features: scenes.map((scene) => scene.treatment.grammar ?? { strategy: scene.treatment.strategy, subjectArchetype: scene.treatment.subjectRequirement, environment: scene.treatment.environment, composition: scene.treatment.composition, camera: scene.treatment.camera, props: scene.treatment.props, topology: scene.treatment.diagram?.type ?? "none", semanticTokens: [], continuityIdentityId: input.plan.continuity.mode === "persistent-protagonist" ? input.plan.continuity.identityId : null }), stages: scenes.map((scene) => scene.progressionStage), continuity: input.plan.continuity });
  const pairs = viewerVisibleFamilies.slice(1).map((current, index) => {
    const previous = viewerVisibleFamilies[index]!;
    return { pair: `${previous.sceneId}->${current.sceneId}`, sameEnvironment: previous.environmentFamily === current.environmentFamily, sameCamera: previous.cameraFamily === current.cameraFamily, sameInteraction: previous.interactionFamily === current.interactionFamily, sameComposition: previous.compositionFamily === current.compositionFamily, sameIdentity: previous.continuityIdentityFamily === current.continuityIdentityFamily };
  });
  const rate = (key: "sameEnvironment" | "sameCamera" | "sameInteraction" | "sameIdentity") => pairs.length ? Math.round(pairs.filter((pair) => pair[key]).length / pairs.length * 10_000) / 10_000 : 0;
  // Continuity alone is desirable; repetition requires environment, camera,
  // interaction, and composition all to repeat in the same transition.
  const accidentalPairs = pairs.filter((pair) => pair.sameEnvironment && pair.sameCamera && pair.sameInteraction && pair.sameComposition).map((pair) => pair.pair);
  const intentionalMotifReuseRate = scenes.length ? Math.round(motifScenes.length / scenes.length * 10_000) / 10_000 : 0;
  const diversityMetrics = { ...baseDiversity, intentionalMotifReuseRate, accidentalVisualRepetitionRate: scenes.length ? Math.round(accidentalPairs.length / Math.max(1, scenes.length - 1) * 10_000) / 10_000 : 0, consecutiveViewerVisibleSimilarity: { mean: baseDiversity.consecutiveSceneSimilarity.mean, maximum: baseDiversity.consecutiveSceneSimilarity.maximum, violatingPairs: accidentalPairs }, environmentFamilyReuseRate: rate("sameEnvironment"), cameraFamilyReuseRate: rate("sameCamera"), interactionFamilyReuseRate: rate("sameInteraction"), continuityIdentityReuseRate: rate("sameIdentity"), harmfulRepetitionPairs: accidentalPairs, viewerVisibleFamilies, motifContinuityCoverage: intentionalMotifReuseRate };
  const staleFailures = scenes.flatMap((scene) => [
    ...(scene.treatment.diagram === null && diagrams.some((diagram) => diagram.diagramId.toLowerCase().startsWith(scene.sceneId.toLowerCase())) ? [`STALE_SCENE_DIAGRAM:${scene.sceneId}`] : []),
    ...(scene.treatment.diagram === null && events.some((event) => event.sceneId === scene.sceneId && event.kind === "diagram-build") ? [`DIAGRAM_EVENT_WITHOUT_DIAGRAM:${scene.sceneId}`] : []),
  ]);
  if (staleFailures.length) throw new Error(staleFailures.join(","));
  const assetReuseDecisions = (input.plan.assetReuseDecisions ?? []).map((decision) => {
    const target = scenes.find((scene) => scene.sceneId === decision.targetSceneId);
    const motifCritical = Boolean(target && selectedRecurringMotif?.sceneIds.includes(target.sceneId));
    const source = input.plan.assets.find((asset) => asset.assetId === decision.sourceAssetId);
    const motifCompatible = !motifCritical || /doorway|threshold|widen|foothold|access/iu.test(`${source?.semanticPurpose ?? ""} ${source?.prompt ?? ""}`);
    const continuityCompatible = input.plan.continuity.mode !== "persistent-protagonist" || source?.subjectIdentityId === input.plan.continuity.identityId;
    const automatic = decision.semanticCompatibility >= 0.8 && decision.eligible && motifCompatible && continuityCompatible;
    return { ...decision, eligible: automatic, reuseMode: automatic ? decision.reuseMode : "not-reusable" as const, cropAdaptation: automatic ? decision.cropAdaptation : "none" as const, decision: automatic ? "AUTO_REUSE_APPROVED" as const : decision.semanticCompatibility >= 0.4 && motifCompatible ? "REUSE_REQUIRES_SEMANTIC_REVIEW" as const : "REUSE_REJECTED" as const, reason: automatic ? decision.reason : !motifCompatible ? "recurring-motif-incompatible" : !continuityCompatible ? "subject-continuity-incompatible" : "semantic-purpose-insufficiently-compatible" };
  });
  const canonical = { ...input.plan, scenes, assets, visualEvents: events, diagrams, assetReuseDecisions, ...(selectedRecurringMotif ? { selectedRecurringMotif } : {}), diversityMetrics, cadenceMetrics: cadenceForFinalTimeline(events, assets, narrationEnd), canonicalImagePlanHash: stableHash({ assets, selectedRecurringMotif, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, providerProjectionVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION, actionOwners: scenes.map((scene) => scene.treatment.actionOwnerRole ?? null) }), renderEventPlanHash: stableHash({ events, finalTiming: narrationEnd, finalTreatmentVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION }), cacheInvalidation: { ...input.plan.cacheInvalidation, semanticPlanInvalidatesOn: [...input.plan.cacheInvalidation.semanticPlanInvalidatesOn, "final-treatment-change", "selected-recurring-motif-change", "state-complexity-change", "viewer-visible-family-version-change", "action-owner-role-change"], canonicalImageInvalidatesOn: [...input.plan.cacheInvalidation.canonicalImageInvalidatesOn, "final-treatment-change", "motif-coverage-change", "reuse-decision-change", "state-aware-provider-projection-version-change", "action-owner-role-change"], renderEventsInvalidateOn: [...input.plan.cacheInvalidation.renderEventsInvalidateOn, "final-treatment-change", "diagram-status-change", "canonical-timing-change", "visual-event-strategy-change"] } };
  return { ...canonical, planHash: stableHash(canonical) } as PositioningVisualPlanV2;
}

/** Re-projects generic positioning scenes before provider review. No scene ID is special-cased. */
export function hardenVeronicaPreImagePlan(input: { readonly plan: PositioningVisualPlanV2; readonly narrationByScene: readonly string[] }): { readonly plan: PositioningVisualPlanV2; readonly reviews: readonly VeronicaPreImageSemanticReview[] } {
  const motif = /\b(?:doorway|wall|foothold|widen)\b/iu.test(input.narrationByScene.join(" ")) ? "doorway / threshold / widening access" : undefined;
  const scenes = input.plan.scenes.map((scene, index) => {
    const narration = input.narrationByScene[index] ?? scene.narrationAnchor;
    const proposal = proposalFor(narration, index, input.plan.scenes.length);
    if (!proposal) return scene;
    const treatmentBase = { ...scene.treatment, strategy: proposal.strategy, narrativeBeat: proposal.thesis, subjectRequirement: "recurring occupation-neutral expert and buyer", actionOwnerRole: proposal.actionOwnerRole, environment: proposal.environment, composition: proposal.composition, camera: proposal.camera, action: proposal.action, props: proposal.props, motionOpportunities: proposal.motion, diagram: null };
    const treatment: PositioningVisualTreatment = { ...treatmentBase, grammar: { ...scene.treatment.grammar, strategy: proposal.strategy, subjectArchetype: "recurring occupation-neutral expert and buyer", environment: proposal.environment, composition: proposal.composition, camera: proposal.camera, props: proposal.props, topology: "none", continuityIdentityId: `${input.plan.contentId.toLowerCase()}-causal-arc` }, viewerVisibleFingerprint: { ...scene.treatment.viewerVisibleFingerprint, strategyFamily: proposal.strategy, subjectArchetype: "recurring expert-buyer pair", environmentArchetype: "recurring threshold environment", compositionArchetype: proposal.composition, cameraArchetype: proposal.camera, actionArchetype: proposal.action, dominantObjectArchetype: proposal.props[0] ?? "threshold", motionArchetype: proposal.motion.join("-then-") }, treatmentHash: stableHash(treatmentBase) };
    return { ...scene, narrationAnchor: narration, treatment, visibleThesis: proposal.thesis, newInformation: `Adds the next causal doorway/recognition relationship: ${proposal.thesis}`, visualFamily: "human-decision" as const, continuityGroup: `${input.plan.contentId.toLowerCase()}-causal-arc` };
  });
  const assets = input.plan.assets.map((asset, index) => {
    const scene = scenes[index];
    if (!scene) return asset;
    const prompt = `Text-free ${input.plan.aspectRatio} Veronica business-psychology scene. Visible thesis: ${scene.visibleThesis} Human action: ${scene.treatment.action}. Environment: ${scene.treatment.environment}. Composition: ${scene.treatment.composition}. Camera: ${scene.treatment.camera}. Must show: ${scene.treatment.props.join(", ")}. No readable text, logos, UI, occupation-specific proxy, generic stock pose, decorative abstraction, prism, light laboratory, or unexplained diagram.`;
    return { ...asset, semanticPurpose: scene.visibleThesis, strategy: scene.treatment.strategy, prompt, semanticFingerprint: stableHash({ sceneId: scene.sceneId, prompt }), generatedAssetCacheKey: stableHash({ prompt, semanticGateVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION }), subjectIdentityId: `${input.plan.contentId.toLowerCase()}-causal-arc`, referenceAssetId: index === 0 ? null : input.plan.assets[0]?.assetId ?? null };
  });
  const reviews = scenes.map((scene, index) => {
    const previous = index > 0 ? scenes[index - 1] : undefined;
    return reviewVeronicaPreImageTreatment({ contentId: input.plan.contentId, sceneId: scene.sceneId, plannerVersion: input.plan.plannerVersion, narration: input.narrationByScene[index] ?? scene.narrationAnchor, narrationAnchor: scene.narrationAnchor, visibleThesis: scene.visibleThesis ?? scene.treatment.narrativeBeat, newInformation: scene.newInformation ?? scene.treatment.narrativeBeat, treatment: scene.treatment, ...(previous ? { previousTreatment: previous.treatment } : {}), ...(motif ? { selectedMotif: motif } : {}) });
  });
  const hardFailure = reviews.some((review) => review.status !== "pass");
  const legacy = input.plan as PositioningVisualPlanV2 & {
    readonly visualVocabulary?: PositioningVisualPlanV2["visualVocabulary"];
    readonly cacheInvalidation?: PositioningVisualPlanV2["cacheInvalidation"];
    readonly visualEvents?: PositioningVisualPlanV2["visualEvents"];
  };
  const visualVocabulary = legacy.visualVocabulary ?? {
    schemaVersion: "veronicabenini-positioning-visual-vocabulary.v1",
    episodeId: input.plan.contentId,
    semanticDomains: [], recurringMotifs: [], environments: [], materialPalette: [], excludedCliches: [],
    sourceSemanticHash: stableHash(input.plan.contentId), cacheKey: stableHash({ contentId: input.plan.contentId, legacy: true }), vocabularyHash: stableHash({ contentId: input.plan.contentId, legacy: true, version: 1 }),
  } as PositioningVisualPlanV2["visualVocabulary"];
  const cacheInvalidation = legacy.cacheInvalidation ?? {
    semanticPlanInvalidatesOn: [], canonicalImageInvalidatesOn: [], titleQaInvalidatesOn: [], renderEventsInvalidateOn: [],
  } as PositioningVisualPlanV2["cacheInvalidation"];
  const visualEvents = legacy.visualEvents ?? [];
  const base = { ...input.plan, continuity: { mode: "persistent-protagonist" as const, identityId: `${input.plan.contentId.toLowerCase()}-causal-arc`, identityFingerprint: stableHash({ contentId: input.plan.contentId, motif }), appearance: { ageBand: "adult", genderPresentation: "unspecified", hair: "consistent but non-identifying", wardrobeAnchor: "neutral structured outerwear" }, referencePolicy: "reuse-only-for-linked-scenes" as const, linkedSceneIds: scenes.map((scene) => scene.sceneId) }, scenes, assets, visualVocabulary: { ...visualVocabulary, recurringMotifs: motif ? [motif, ...visualVocabulary.recurringMotifs.filter((candidate) => candidate !== motif)] : visualVocabulary.recurringMotifs }, ...(motif ? { selectedRecurringMotif: { schemaVersion: "veronica-selected-recurring-motif.v1" as const, family: "threshold", concept: motif, source: "narration-native" as const, sceneIds: [] } } : {}), semanticPlanCacheKey: stableHash({ previous: input.plan.semanticPlanCacheKey, semanticGateVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, motif, continuity: "persistent-causal" }), canonicalImagePlanHash: stableHash(assets), validation: { status: hardFailure ? "fail" as const : "pass" as const, failures: hardFailure ? reviews.flatMap((review) => review.requiredEdits) : [] } };
  const plan = { ...base, visualEvents, renderEventPlanHash: stableHash({ events: visualEvents, canonicalTiming: "locale-timing-artifact" }), planHash: stableHash(base), cacheInvalidation: { ...cacheInvalidation, semanticPlanInvalidatesOn: [...cacheInvalidation.semanticPlanInvalidatesOn, "selected-recurring-motif-change", "continuity-strategy-change", "semantic-gate-version-change"], canonicalImageInvalidatesOn: [...cacheInvalidation.canonicalImageInvalidatesOn, "treatment-remediation-change", "anti-drift-projection-change"], renderEventsInvalidateOn: [...cacheInvalidation.renderEventsInvalidateOn, "canonical-locale-timing-change", "motion-plan-change"] } } as PositioningVisualPlanV2;
  return { plan, reviews };
}
