import { stableHash } from "./positioning-visual-semantics.js";
import type { AspectRatio, PositioningFormat, ProgressionStage } from "./positioning-visual-contracts.js";

/** Canonical policy projected by both the 9:16 and 16:9 Veronica planners. */
export const VERONICA_VISUAL_LANGUAGE_VERSION = "veronica-visual-language.v1" as const;

export type VeronicaVisualFamily =
  | "human-decision"
  | "professional-evidence"
  | "social-perception"
  | "contrast"
  | "conceptual-editorial"
  | "diagram"
  | "environmental-context";

export type VeronicaNarrativeFunction =
  | "hook" | "setup" | "context" | "conflict" | "evidence" | "contrast"
  | "mechanism" | "example" | "consequence" | "transition" | "resolution" | "payoff" | "recall";

export type VeronicaSemanticGuard =
  | "VISIBLE_THESIS_REQUIRED"
  | "ABSTRACT_PROP_DRIFT"
  | "OCCUPATION_PROXY_DRIFT"
  | "GENERIC_BUSINESS_STOCK_DRIFT"
  | "SEMANTICALLY_DECORATIVE_SCENE"
  | "VISUAL_INFORMATION_GAIN"
  | "BUYER_PERSPECTIVE_REQUIRED";

export interface VeronicaVisualLanguage {
  readonly version: typeof VERONICA_VISUAL_LANGUAGE_VERSION;
  readonly genre: "premium-editorial-business-psychology-documentary";
  readonly coreSubject: "buyer-psychology";
  readonly visualFamilies: readonly VeronicaVisualFamily[];
  readonly narrativeFunctions: readonly VeronicaNarrativeFunction[];
  readonly semanticGuards: readonly VeronicaSemanticGuard[];
  readonly literalBeforeMetaphor: true;
  readonly occupationNeutralByDefault: true;
  readonly buyerCentricByDefault: true;
  readonly continuityRules: readonly string[];
  readonly cameraGrammar: readonly string[];
  readonly motifTaxonomy: readonly string[];
}

export const VERONICA_VISUAL_LANGUAGE: VeronicaVisualLanguage = {
  version: VERONICA_VISUAL_LANGUAGE_VERSION,
  genre: "premium-editorial-business-psychology-documentary",
  coreSubject: "buyer-psychology",
  visualFamilies: ["human-decision", "professional-evidence", "social-perception", "contrast", "conceptual-editorial", "diagram", "environmental-context"],
  narrativeFunctions: ["hook", "setup", "context", "conflict", "evidence", "contrast", "mechanism", "example", "consequence", "transition", "resolution", "payoff", "recall"],
  semanticGuards: ["VISIBLE_THESIS_REQUIRED", "ABSTRACT_PROP_DRIFT", "OCCUPATION_PROXY_DRIFT", "GENERIC_BUSINESS_STOCK_DRIFT", "SEMANTICALLY_DECORATIVE_SCENE", "VISUAL_INFORMATION_GAIN", "BUYER_PERSPECTIVE_REQUIRED"],
  literalBeforeMetaphor: true,
  occupationNeutralByDefault: true,
  buyerCentricByDefault: true,
  continuityRules: ["preserve buyer/expert identity within one causal arc", "reuse references only for linked scenes", "allow callbacks only with compatible chronology and emotional state"],
  cameraGrammar: ["comparison uses buyer POV or over-shoulder framing", "evidence uses controlled detail and buyer interaction", "recognition simplifies hierarchy", "9:16 prioritizes immediate legibility; 16:9 may reveal relationship context"],
  motifTaxonomy: ["perception-reflection", "choice-comparison", "recognition-eye-line", "evidence-proof", "confusion-competing-signals", "specialization-narrowing", "memory-later-recall", "reputation-expert-absent", "recommendation-referral"],
};

export interface VeronicaVisualStoryBible {
  readonly version: typeof VERONICA_VISUAL_LANGUAGE_VERSION;
  readonly format: PositioningFormat;
  readonly thesis: string;
  readonly viewerTransformation: { readonly before: string; readonly mechanism: string; readonly after: string };
  readonly visualConflict: { readonly start: string; readonly end: string };
  readonly roles: { readonly expert: string; readonly buyer: string; readonly market: string };
  readonly semanticProgression: readonly string[];
  readonly preferredVisualFamilies: readonly VeronicaVisualFamily[];
  readonly forbiddenDrift: readonly VeronicaSemanticGuard[];
  readonly continuityStrategy: string;
  readonly visualMotifs: readonly string[];
  readonly fingerprint: string;
}

export interface VeronicaChapterVisualPlan {
  readonly chapterId: string;
  readonly thesis: string;
  readonly narrativeArc: readonly VeronicaNarrativeFunction[];
  readonly continuityGroup: string;
  readonly preferredVisualFamilies: readonly VeronicaVisualFamily[];
  readonly beatIds: readonly string[];
}

export function narrativeFunctionForStage(stage: ProgressionStage): VeronicaNarrativeFunction {
  return ({ COLD_OPEN: "hook", HOOK: "hook", PROOF: "evidence", MANIFESTATION: "example", REVERSAL: "contrast", EXPLANATION: "mechanism", METHOD: "resolution", PAYOFF: "payoff" } as const)[stage];
}

export function visualFamilyFor(input: { readonly stage: ProgressionStage; readonly concept: string; readonly diagram: boolean }): VeronicaVisualFamily {
  if (input.diagram) return "diagram";
  const text = input.concept.toLowerCase();
  if (/recommend|remember|recogn|reputation|referral|social/i.test(text)) return "social-perception";
  if (/compare|versus|contrast|different|choice/i.test(text) || input.stage === "REVERSAL") return "contrast";
  if (/proof|evidence|portfolio|proposal|signal/i.test(text) || input.stage === "PROOF") return "professional-evidence";
  if (input.stage === "COLD_OPEN" || input.stage === "HOOK" || /buyer|client|select|decision/i.test(text)) return "human-decision";
  return "human-decision";
}

export function visibleThesisFor(input: { readonly stage: ProgressionStage; readonly concept: string; readonly family: VeronicaVisualFamily }): string {
  const idea = input.concept.replace(/[-_]+/gu, " ").replace(/\s+/gu, " ").trim();
  const observableTheses: Readonly<Record<string, string>> = {
    "desired-position": "The expert states what they intend to be known for before any buyer gives an answer.",
    "external-perception-test": "Several buyers separately describe what they would recommend the expert for, without seeing the expert's own answer.",
    "gap-between-intent-and-memory": "The buyer answers reveal that intended positioning and remembered category do not match.",
    "problem-triggers-name": "When a matching problem appears later, the buyer immediately recalls and contacts the relevant specialist.",
    "real-expertise-invisible": "A buyer must choose using visible proof because the expert's underlying skill cannot be inspected directly.",
    "customer-perception": "A buyer categorizes the professional from the signals that remain after the interaction ends.",
    "specialist-vs-generalist": "A buyer compares alternatives and finds one clear reason to choose the specialist.",
    "everyone-message": "A buyer sees a broad offer but cannot tell whether it applies to their problem.",
    "buyer-decision-effort": "A buyer has to do extra interpretation work because the offer gives no clear reason to choose it.",
    "different-customer-needs": "Different buyers compare the same broad offer and each looks for a different unmet need.",
    "niche-recognition": "One defined buyer immediately recognizes that the offer is for them.",
    "generic-vs-specific-offer": "A buyer compares a generic offer with a specific promise and understands the specific option faster.",
    "specificity-advantage": "A qualified buyer recognizes their problem and promised direction without extra interpretation work.",
    "buyer-evaluation": "A buyer tests whether the available signals make the offer relevant to their own problem.",
    "evidence-contrast": "A buyer compares unclear and clear evidence before deciding which professional or offer fits.",
  };
  const direct = observableTheses[input.concept];
  if (direct) return direct;
  if (input.family === "professional-evidence") return `A buyer can verify ${idea} through concrete professional evidence.`;
  if (input.family === "social-perception") return `After the expert is absent, a buyer can or cannot recall ${idea}.`;
  if (input.family === "contrast") return `A buyer sees a meaningful difference between unclear and clear ${idea}.`;
  if (input.family === "diagram") return `The structure of ${idea} is understandable without narration.`;
  if (input.stage === "COLD_OPEN" || input.stage === "HOOK") return `A buyer faces the consequence of not being able to identify ${idea}.`;
  return `A buyer observes how ${idea} changes whether an expert is understood and chosen.`;
}

export function buildVeronicaStoryBible(input: { readonly format: PositioningFormat; readonly narration: string; readonly concepts: readonly string[]; readonly parentLongFormId: string }): VeronicaVisualStoryBible {
  const thesis = input.concepts[0]?.replace(/[-_]+/gu, " ") || "professionals are chosen when buyers can understand and remember their value";
  const base = {
    version: VERONICA_VISUAL_LANGUAGE_VERSION,
    format: input.format,
    thesis,
    viewerTransformation: { before: "buyer sees scattered or hidden expertise", mechanism: "clear repeated evidence and category signals", after: "buyer recognizes, recalls, and can recommend the relevant expert" },
    visualConflict: { start: "buyers cannot explain what the expert is known for", end: "a matching problem triggers immediate recognition and choice" },
    roles: { expert: "occupation-neutral professional-services expert", buyer: "decision-maker evaluating and later recalling evidence", market: "alternatives, proof signals, recommendations, and competing offers" },
    semanticProgression: input.concepts,
    preferredVisualFamilies: ["human-decision", "professional-evidence", "social-perception", "contrast"] as const,
    forbiddenDrift: VERONICA_VISUAL_LANGUAGE.semanticGuards,
    continuityStrategy: input.format === "short" ? "persistent causal short arc" : `chapter arcs with recurring buyer/expert callbacks from ${input.parentLongFormId}`,
    visualMotifs: VERONICA_VISUAL_LANGUAGE.motifTaxonomy,
  } as const;
  return { ...base, fingerprint: stableHash(base) };
}

export function buildLongFormChapters(input: { readonly contentId: string; readonly sceneIds: readonly string[]; readonly concepts: readonly string[] }): readonly VeronicaChapterVisualPlan[] {
  const size = Math.max(2, Math.ceil(input.sceneIds.length / 3));
  return Array.from({ length: Math.ceil(input.sceneIds.length / size) }, (_, index) => {
    const beatIds = input.sceneIds.slice(index * size, (index + 1) * size);
    const concepts = input.concepts.slice(index * size, (index + 1) * size);
    return { chapterId: `${input.contentId.toLowerCase()}-chapter-${String(index + 1).padStart(2, "0")}`, thesis: concepts.join(" → ") || "buyer understanding advances", narrativeArc: index === 0 ? ["hook", "context", "conflict"] : index === Math.ceil(input.sceneIds.length / size) - 1 ? ["mechanism", "payoff", "recall"] : ["example", "evidence", "contrast"], continuityGroup: `${input.contentId.toLowerCase()}-buyer-arc-${index + 1}`, preferredVisualFamilies: ["human-decision", "professional-evidence", "social-perception", "contrast"], beatIds };
  });
}

const abstractProp = /\b(?:stones?|marbles?|chess pieces?|puzzle pieces?|boxes?|doors?|masks?|strings?|floating objects?|colored cards?|labyrinths?|tokens?|geometric objects?)\b/iu;
const occupationProxy = /\b(?:ceramics?|fashion|architect(?:ure|ural)?|chef|artisan|painter|workshop|material samples?|swatches?)\b/iu;
const genericStock = /\b(?:people around (?:a )?laptop|staring at (?:a )?screen|looking through (?:a )?window|pointing at (?:a )?tablet|generic boardroom|handshake|presenting slides)\b/iu;

/** Deterministic sequence preflight: it judges semantic relation, not image aesthetics. */
export function validateVeronicaVisualSequence(input: {
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly visibleThesis: string;
    readonly newInformation: string;
    readonly narrativeFunction: VeronicaNarrativeFunction;
    readonly visualFamily: VeronicaVisualFamily;
    readonly narrationAnchor: string;
    readonly treatment: { readonly action: string; readonly subjectRequirement: string; readonly environment: string; readonly props: readonly string[] };
  }[];
  readonly format: PositioningFormat;
  readonly chapters: readonly VeronicaChapterVisualPlan[];
  /** Existing approved catalogue plans are inventory, not automatic regeneration targets. */
  readonly strictSemanticGuards?: boolean;
}): readonly string[] {
  const failures: string[] = [];
  let buyerScenes = 0;
  for (const [index, scene] of input.scenes.entries()) {
    const treatment = `${scene.treatment.action} ${scene.treatment.subjectRequirement} ${scene.treatment.environment} ${scene.treatment.props.join(" ")}`;
    if (scene.visibleThesis.trim().length < 24) failures.push(`${scene.sceneId}:visible-thesis-required`);
    if (index > 0 && scene.newInformation.trim().length < 18) failures.push(`${scene.sceneId}:visual-information-gain-required`);
    if (input.strictSemanticGuards && abstractProp.test(treatment) && !abstractProp.test(`${scene.visibleThesis} ${scene.narrationAnchor}`)) failures.push(`${scene.sceneId}:abstract-prop-drift`);
    if (input.strictSemanticGuards && occupationProxy.test(treatment) && /position|expert|buyer|recogn|reputation|choice/iu.test(scene.narrationAnchor)) failures.push(`${scene.sceneId}:occupation-proxy-drift`);
    if (input.strictSemanticGuards && genericStock.test(treatment) && !/buyer|client|compare|select|evidence|proof|recommend/iu.test(`${scene.visibleThesis} ${scene.treatment.action}`)) failures.push(`${scene.sceneId}:generic-business-stock-drift`);
    if (/buyer|client|decision|select|compare|recall|recommend/iu.test(`${scene.visibleThesis} ${scene.treatment.action} ${scene.treatment.subjectRequirement}`)) buyerScenes += 1;
    const previous = input.scenes[index - 1];
    if (previous && previous.visibleThesis.toLowerCase() === scene.visibleThesis.toLowerCase()) failures.push(`${scene.sceneId}:semantically-decorative-scene`);
  }
  if (buyerScenes === 0) failures.push("buyer-perspective-required");
  if (input.format === "long" && input.chapters.length === 0) failures.push("long-form-chapter-plan-required");
  return [...new Set(failures)];
}
