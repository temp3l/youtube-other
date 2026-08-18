import type { CanonicalSourcePlannerInput } from "./veronica-content-pack-2-ingestion.js";
import { buildVeronicaCanonicalVisualPlan } from "./positioning-visual-planner.js";
import { stableHash } from "./positioning-visual-semantics.js";
import type { PositioningFormat } from "./positioning-visual-contracts.js";
import type { VeronicaNarrativeFunction } from "./veronica-visual-language.js";
import type { VeronicaStoryVisualDirection } from "./veronica-unified-v3-visual-direction.js";

export const VERONICA_UNIFIED_V3_SEMANTIC_PLAN_VERSION =
  "veronica-unified-v3-semantic-plan.v3" as const;

export type VeronicaSceneSubjectMode =
  | "character-led"
  | "object-led"
  | "environment-led"
  | "process-led"
  | "comparison-led"
  | "evidence-led";

export type VeronicaStoryMode = VeronicaSceneSubjectMode | "mixed";

export interface VeronicaNarrationSpanV3 {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly sourceHash: string;
}

export interface VeronicaEvidenceNeedV3 {
  readonly required: boolean;
  readonly objectPhrase: string | null;
  readonly sourceHash: string | null;
}

export interface VeronicaSubjectPlanV3 {
  readonly mode: VeronicaStoryMode;
  readonly primaryIdentityId: string | null;
  readonly supportingIdentityIds: readonly string[];
  readonly subjectRole: "buyer" | "expert" | "business-operator" | "none";
}

export interface VeronicaConcreteDepictionV3 {
  readonly description: string;
  readonly primarySubject: string;
  readonly primaryAction: string;
  readonly concreteObjects: readonly string[];
  readonly environment: string;
  readonly spatialRelationship: string;
  readonly semanticFocus: string;
}

export interface VeronicaMultiStateDefinitionV3 {
  readonly stateRole: string;
  readonly cropFocus: string;
  readonly semanticPurpose: string;
  /** Normalized renderer viewport. Every viewport preserves the output aspect ratio. */
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly focalObject: string;
  };
}

export interface VeronicaMultiStateAssetPlanV3 {
  readonly assetLevelDepiction: string;
  readonly spatialLayout: string;
  readonly safeFraming: string;
  readonly states: readonly VeronicaMultiStateDefinitionV3[];
}

export interface VeronicaSemanticSceneV3 {
  readonly sceneId: string;
  readonly narrationSpan: VeronicaNarrationSpanV3;
  readonly narrativeFunction: VeronicaNarrativeFunction;
  readonly communicationIntent: string;
  readonly proposition: string;
  readonly visualIntent: string;
  readonly depiction: VeronicaConcreteDepictionV3;
  /** @deprecated Retained for artifact compatibility; compiled from depiction. */
  readonly visualizableClaim: string;
  readonly continuityGroup: string;
  readonly subject: VeronicaSubjectPlanV3;
  readonly evidenceNeed: VeronicaEvidenceNeedV3;
  readonly transitionRelationship:
    | "introduces"
    | "explains"
    | "contrasts"
    | "demonstrates"
    | "resolves";
  readonly treatment: {
    readonly strategy: string;
    readonly environment: string;
    readonly composition: string;
    readonly camera: string;
  };
  readonly assetId: string;
  readonly visualStateId: string;
  readonly multiStateAsset: VeronicaMultiStateAssetPlanV3 | null;
}

export interface VeronicaVisualStateV3 {
  readonly visualStateId: string;
  readonly assetId: string;
  readonly sceneId: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly semanticClaimHash: string;
  readonly explicitMultiStateAsset: boolean;
  readonly stateRole: string;
  readonly cropFocus: string;
  readonly semanticPurpose: string;
  readonly crop: VeronicaMultiStateDefinitionV3["crop"] | null;
}

export interface VeronicaSemanticAssetV3 {
  readonly assetId: string;
  readonly sceneId: string;
  readonly prompt: string;
  readonly promptHash: string;
  readonly textFree: true;
  readonly multiState: VeronicaMultiStateAssetPlanV3 | null;
}

export interface VeronicaSemanticEventV3 {
  readonly eventId: string;
  readonly sceneId: string;
  readonly assetId: string;
  readonly visualStateId: string;
  readonly kind:
    | "establish"
    | "detail-crop"
    | "lateral-crop-shift"
    | "consequence-reveal"
    | "before-after-change"
    | "controlled-push"
    | "pull-back"
    | "focus-transition"
    | "evidence-emphasis";
  readonly startMs: number;
  readonly durationMs: number;
}

export interface VeronicaPortfolioFindingV3 {
  readonly code: string;
  readonly severity: "warning" | "blocker";
  readonly storyIds: readonly string[];
  readonly sceneIds: readonly string[];
  readonly observed: number | string;
  readonly threshold: number | string;
  readonly message: string;
}

export interface VeronicaPortfolioValidationV3 {
  readonly status: "pass" | "fail";
  readonly findings: readonly VeronicaPortfolioFindingV3[];
  readonly distributions: Readonly<
    Record<
      string,
      readonly { readonly value: string; readonly count: number }[]
    >
  >;
}

export interface VeronicaPersonaReviewV3 {
  readonly storyId: string;
  readonly scores: Readonly<Record<string, number>>;
}

export function validateVeronicaPersonaReviewEvidence(
  reviews: readonly VeronicaPersonaReviewV3[],
): readonly VeronicaPortfolioFindingV3[] {
  if (reviews.length < 2) return [];
  const signatures = reviews.map((review) => JSON.stringify(Object.entries(review.scores).sort(([a], [b]) => a.localeCompare(b))));
  if (new Set(signatures).size === 1) {
    return [{ code: "PERSONA_SCORE_DEGENERACY", severity: "warning", storyIds: reviews.map((review) => review.storyId), sceneIds: [], observed: signatures[0]!, threshold: "differentiated evidence or unavailable", message: "Identical local persona scores are not independent editorial-quality evidence." }];
  }
  return [];
}

export interface VeronicaUnifiedV3SemanticPlan {
  readonly schemaVersion: typeof VERONICA_UNIFIED_V3_SEMANTIC_PLAN_VERSION;
  readonly plannerVersion: "veronica-unified-v3-semantic-planner.v2";
  readonly contentId: string;
  readonly format: PositioningFormat;
  readonly canonicalSourceHash: string;
  readonly legacyPlanHash: string;
  readonly sourceNarrationHash: string;
  readonly visualDirectionHash: string;
  readonly subjectPlan: VeronicaSubjectPlanV3;
  readonly scenes: readonly VeronicaSemanticSceneV3[];
  readonly visualStates: readonly VeronicaVisualStateV3[];
  readonly assets: readonly VeronicaSemanticAssetV3[];
  readonly visualEvents: readonly VeronicaSemanticEventV3[];
  readonly thumbnail: {
    readonly centralContradiction: string;
    readonly primaryObjectOrPerson: string;
    readonly visibleActionOrState: string;
    readonly tension: string;
    readonly composition: string;
    readonly titleRelationship: "thumbnail visualizes the consequence or contradiction; title supplies the claim";
    readonly authoredTitleRelationship: string;
    readonly distinctFromNeighboringEpisodes: string;
    readonly sourceHash: string;
  };
  readonly cadence: {
    readonly motionEventCount: number;
    readonly baseVisualStateCount: number;
    readonly semanticNoveltyCount: number;
    readonly longestBaseVisualStateHoldMs: number;
    readonly semanticStateCount: number;
    readonly longestSemanticStateHoldMs: number;
    readonly longestUnchangedSemanticRegionMs: number;
    readonly trueMultiStateAssetCount: number;
    readonly paidBaseAssetCount: number;
  };
  readonly validation: {
    readonly status: "pass" | "fail";
    readonly findings: readonly VeronicaPortfolioFindingV3[];
  };
  readonly planHash: string;
}

interface SentenceUnit {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

const nonObjectWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "between",
  "but",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "isn",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "then",
  "to",
  "was",
  "what",
  "when",
  "with",
  "you",
]);

const concreteHeads = new Set([
  "appointment",
  "brief",
  "book",
  "box",
  "calendar",
  "card",
  "checkout",
  "comparison",
  "contract",
  "display",
  "document",
  "invoice",
  "order",
  "package",
  "page",
  "payment",
  "portfolio",
  "product",
  "proposal",
  "receipt",
  "sample",
  "shelf",
  "shop",
  "slot",
  "table",
  "website",
]);

function splitSentences(narration: string): readonly SentenceUnit[] {
  const units: SentenceUnit[] = [];
  const matcher = /[^.!?…]+(?:[.!?…]+[”"'’)]*|$)/gu;
  for (const match of narration.matchAll(matcher)) {
    const text = match[0].trim();
    if (!text) continue;
    const offset = match.index ?? 0;
    const startOffset = offset + match[0].indexOf(text);
    units.push({ text, startOffset, endOffset: startOffset + text.length });
  }
  return units.length > 0
    ? units
    : [
        {
          text: narration.trim(),
          startOffset: 0,
          endOffset: narration.trim().length,
        },
      ];
}

function groupSentences(input: {
  readonly narration: string;
  readonly format: PositioningFormat;
}): readonly VeronicaNarrationSpanV3[] {
  const units = splitSentences(input.narration);
  const desired =
    input.format === "long"
      ? Math.max(12, Math.min(16, Math.round(units.length / 2)))
      : Math.max(5, Math.min(8, Math.round(units.length / 2)));
  const count = Math.min(desired, units.length);
  const groups = Array.from(
    { length: Math.max(1, count) },
    () => [] as SentenceUnit[]
  );
  units.forEach((unit, index) =>
    groups[
      Math.min(
        groups.length - 1,
        Math.floor((index * groups.length) / units.length)
      )
    ]!.push(unit)
  );
  return groups.map((group) => {
    const first = group[0]!;
    const last = group.at(-1)!;
    const text = group.map((item) => item.text).join(" ");
    return {
      text,
      startOffset: first.startOffset,
      endOffset: last.endOffset,
      sourceHash: stableHash({
        startOffset: first.startOffset,
        endOffset: last.endOffset,
        text,
      }),
    };
  });
}

export function deriveVeronicaNarrativeFunction(input: {
  readonly span: string;
  readonly index: number;
  readonly count: number;
}): VeronicaNarrativeFunction {
  const text = input.span.toLowerCase();
  if (
    input.index === 0 &&
    (/[?]|\b(?:why|stop|never|most|your)\b/u.test(text) || input.count > 1)
  )
    return "hook";
  if (/\b(?:for example|for instance|imagine|consider)\b/u.test(text))
    return "example";
  if (
    /\b(?:because|therefore|which means|so that|this is why|causes?)\b/u.test(
      text
    )
  )
    return "mechanism";
  if (/\b(?:instead|rather than|but|however|versus|different)\b/u.test(text))
    return "contrast";
  if (/\b(?:proof|evidence|shows?|results?|review|case study)\b/u.test(text))
    return "evidence";
  if (/\b(?:first|then|step|process|method|start by)\b/u.test(text))
    return "resolution";
  if (/\b(?:choose|decision|buy|customer|client)\b/u.test(text))
    return "consequence";
  if (input.index === input.count - 1) return "payoff";
  if (input.index === 1) return "context";
  return "mechanism";
}

export function selectVeronicaEvidenceObject(
  span: VeronicaNarrationSpanV3
): VeronicaEvidenceNeedV3 {
  const words = span.text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)?/gu) ?? [];
  for (let index = 0; index < words.length; index += 1) {
    const head = words[index]!;
    if (!concreteHeads.has(head) || nonObjectWords.has(head)) continue;
    const modifier = words[index - 1];
    const phrase =
      modifier && !nonObjectWords.has(modifier) ? `${modifier} ${head}` : head;
    const generic = new Set(["book", "order", "page", "product", "proposal", "website"]);
    if (!modifier || nonObjectWords.has(modifier) || generic.has(phrase)) continue;
    return {
      required: true,
      objectPhrase: phrase,
      sourceHash: span.sourceHash,
    };
  }
  return { required: false, objectPhrase: null, sourceHash: null };
}

function storySubjectPlan(input: {
  readonly identityId: string | null;
}): VeronicaSubjectPlanV3 {
  return {
    mode: "mixed",
    primaryIdentityId: input.identityId,
    supportingIdentityIds: [],
    subjectRole: input.identityId ? "business-operator" : "none",
  };
}

function sceneModeFor(input: {
  readonly narrativeFunction: VeronicaNarrativeFunction;
  readonly hasProtagonist: boolean;
  readonly index: number;
}): VeronicaSceneSubjectMode {
  if (input.narrativeFunction === "contrast") return "comparison-led";
  if (input.narrativeFunction === "evidence" || input.narrativeFunction === "example") return "evidence-led";
  if (input.narrativeFunction === "mechanism" || input.narrativeFunction === "resolution") return "process-led";
  if (input.narrativeFunction === "context") return "environment-led";
  if (input.hasProtagonist && (input.narrativeFunction === "hook" || input.narrativeFunction === "payoff")) return "character-led";
  return input.index % 2 === 0 ? "object-led" : "environment-led";
}

const treatmentVariants: Readonly<Record<VeronicaSceneSubjectMode, readonly {
  readonly strategy: string;
  readonly composition: string;
  readonly camera: string;
}[]>> = {
  "character-led": [
    { strategy: "character-decision", composition: "person in foreground acts on one concrete business object while the consequence remains visible behind", camera: "40mm eye-level environmental portrait" },
    { strategy: "character-evidence", composition: "hands and evidence lead the frame while the recurring person remains identifiable in context", camera: "55mm three-quarter working portrait" },
    { strategy: "character-consequence", composition: "person occupies one third of frame facing the resolved object system across negative space", camera: "35mm contextual pull-back" },
  ],
  "object-led": [
    { strategy: "object-consequence", composition: "one dominant object and its practical consequence share a clean diagonal", camera: "50mm editorial object view" },
    { strategy: "object-system", composition: "related physical objects form a clear foreground-to-background causal chain", camera: "42mm depth-layered tabletop" },
    { strategy: "object-transformation", composition: "the same object changes state across one continuous setting", camera: "65mm matched-state detail" },
  ],
  "environment-led": [
    { strategy: "environmental-storytelling", composition: "the workspace condition carries the problem with one small human-scale trace", camera: "28mm documentary establishing view" },
    { strategy: "environmental-consequence", composition: "foreground evidence opens onto a wider operational consequence", camera: "35mm deep-focus context view" },
    { strategy: "environmental-transition", composition: "old and new zones meet across a visible threshold", camera: "32mm threshold composition" },
  ],
  "process-led": [
    { strategy: "process-visualization", composition: "physical stages advance left to right with distinct inputs and consequence", camera: "35mm lateral process view" },
    { strategy: "process-depth", composition: "workflow stages recede through depth from immediate input to distant outcome", camera: "30mm depth-axis process view" },
    { strategy: "process-transformation", composition: "one recurring object visibly changes across three ordered work zones", camera: "45mm controlled transformation view" },
  ],
  "comparison-led": [
    { strategy: "comparison-composition", composition: "matched alternatives sit side by side with one decisive physical difference", camera: "50mm symmetrical comparison" },
    { strategy: "comparison-depth", composition: "rejected choice remains soft in foreground while the viable alternative resolves behind", camera: "70mm focus-plane comparison" },
    { strategy: "comparison-paths", composition: "two paths split from one shared input and end in visibly different consequences", camera: "35mm elevated two-path view" },
  ],
  "evidence-led": [
    { strategy: "evidence-proof", composition: "a close proof object stays connected to the wider situation that produced it", camera: "70mm evidence-in-context detail" },
    { strategy: "evidence-interaction", composition: "a hand tests or arranges the proof while supporting objects remain grouped nearby", camera: "60mm over-table evidence view" },
    { strategy: "evidence-consequence", composition: "proof occupies the foreground and its operational consequence fills the background", camera: "45mm split-depth evidence view" },
  ],
};

function treatmentFor(input: {
  readonly mode: VeronicaSceneSubjectMode;
  readonly environment: string;
  readonly index: number;
}): VeronicaSemanticSceneV3["treatment"] {
  const variants = treatmentVariants[input.mode];
  const variant = variants[input.index % variants.length]!;
  return { ...variant, environment: input.environment };
}

function intentFor(fn: VeronicaNarrativeFunction): string {
  switch (fn) {
    case "hook":
      return "create-tension";
    case "contrast":
      return "compare-alternatives";
    case "evidence":
      return "make-proof-visible";
    case "mechanism":
      return "explain-causality";
    case "resolution":
      return "explain-process";
    case "payoff":
      return "deliver-payoff";
    default:
      return "show-consequence";
  }
}

function relationshipFor(
  fn: VeronicaNarrativeFunction
): VeronicaSemanticSceneV3["transitionRelationship"] {
  if (fn === "hook" || fn === "context") return "introduces";
  if (fn === "contrast") return "contrasts";
  if (fn === "evidence" || fn === "example") return "demonstrates";
  if (fn === "payoff" || fn === "resolution") return "resolves";
  return "explains";
}

export function deriveVeronicaSourceSpanProposition(span: string): string {
  return span
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.!?]+$/u, "");
}

/**
 * These helpers deliberately inspect the narration span. They are not a visual
 * rotation: the story pack supplies the editorial vocabulary and a scene is
 * then grounded in the words, causal language, and practical context of its
 * own span.
 */
function narrationKeywords(span: string): readonly string[] {
  const ignored = new Set([...nonObjectWords, "about", "also", "been", "business", "customer", "every", "from", "into", "more", "only", "people", "really", "that", "their", "there", "they", "this", "when", "will", "with", "your"]);
  return [...new Set((span.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)?/gu) ?? [])
    .filter((word) => word.length > 3 && !ignored.has(word)))]
    .slice(0, 4);
}

function contextualEnvironment(span: string, fallback: string): string {
  const text = span.toLowerCase();
  if (/parcel|packag|ship|return|deliver|inventory|fulfil|fulfill/u.test(text)) return "a compact packing, returns, and dispatch workbench";
  if (/page|post|content|video|view|audience|publish/u.test(text)) return "a creator editing desk with a text-free content workflow";
  if (/client|buyer|customer|choose|decision|sale|price/u.test(text)) return "a quiet client decision table with physical options";
  if (/team|staff|hire|workshop|process|system/u.test(text)) return "a practical workshop table showing the operating system";
  if (/calendar|time|hour|week|schedule|appointment/u.test(text)) return "a daylight planning table with an analog calendar and work materials";
  return fallback;
}

function sceneDepictionFromNarration(input: {
  readonly span: string;
  readonly narrativeFunction: VeronicaNarrativeFunction;
  readonly fallbackObject: string;
  readonly fallbackEnvironment: string;
}) {
  const keywords = narrationKeywords(input.span);
  const focus = keywords.length ? keywords.join(" ") : input.fallbackObject;
  const environment = contextualEnvironment(input.span, input.fallbackEnvironment);
  const primarySubject = `${focus} evidence arrangement`;
  const actionByFunction: Record<VeronicaNarrativeFunction, string> = {
    hook: `${focus} is arranged around one visible contradiction that stops the viewer before the claim is explained`,
    context: `${focus} sits in its working context with the missing connection left visibly unresolved`,
    mechanism: `${focus} is traced through a physical cause-and-effect chain so the changing condition is observable`,
    contrast: `two practical versions of ${focus} are separated by the decision that makes one path fail`,
    evidence: `${focus} is inspected beside the proof object that verifies the narration's claim`,
    example: `a concrete example of ${focus} is assembled from the relevant objects rather than represented as an abstract symbol`,
    resolution: `${focus} is reordered into the next workable step with the before-condition still visible`,
    consequence: `${focus} reaches its visible downstream result beside the choice that caused it`,
    payoff: `${focus} resolves into one finished outcome that makes the lesson legible without on-image text`,
    setup: `${focus} establishes the practical situation through its physical working materials`,
    conflict: `${focus} is held at the point where the practical constraint becomes visible`,
    transition: `${focus} crosses from the earlier condition to the next one through an observable change`,
    recall: `${focus} returns with one altered detail that connects the earlier example to the present claim`,
  };
  const contextAction = /parcel|packag|ship|return|inventory|fulfil|fulfill/u.test(input.span)
    ? `${focus} is opened, sorted, or rerouted at the point where the operational consequence becomes physical`
    : /page|post|content|video|view|audience|publish/u.test(input.span)
      ? `${focus} is cleared from a crowded content field so the relevant signal can be followed to its next decision`
      : /client|buyer|customer|choose|decision|sale|price/u.test(input.span)
        ? `${focus} is placed beside the buyer's viable and rejected choices at the moment the difference matters`
        : /calendar|time|hour|week|schedule|appointment/u.test(input.span)
          ? `${focus} shifts a limited set of time markers until the hidden trade-off can be seen`
          : /team|staff|hire|workshop|process|system/u.test(input.span)
            ? `${focus} passes through the actual handoff where a working system either holds or breaks`
            : actionByFunction[input.narrativeFunction];
  const primaryAction = contextAction;
  const supportingObject = keywords[1] ? `${keywords[1]} working material` : "a supporting proof object";
  const spatialRelationship = `${primarySubject} occupies the active foreground; ${supportingObject} remains connected across the same work surface as the visible cause, evidence, or result`;
  return {
    description: `In ${environment}, ${primarySubject} ${primaryAction}; ${spatialRelationship}.`,
    primarySubject,
    primaryAction,
    concreteObjects: [primarySubject, supportingObject],
    environment,
    spatialRelationship,
    semanticFocus: `make this narration span visually legible: ${input.span.replace(/\s+/gu, " ").trim()}`,
  };
}

export function deriveVeronicaLongStateRoles(input: {
  readonly narrativeFunction: VeronicaNarrativeFunction;
  readonly narrationSpan: string;
}): readonly string[] {
  const text = input.narrationSpan.toLowerCase();
  const middle = /parcel|shipping|return|inventory|fulfil|fulfill|dispatch/u.test(text)
    ? "handoff"
    : /client|buyer|customer|choose|decision|sale|price/u.test(text)
      ? "selection-criterion"
      : /page|post|content|video|view|audience|publish/u.test(text)
        ? "signal-test"
        : /calendar|time|hour|week|schedule|appointment/u.test(text)
          ? "trade-off"
          : /team|staff|hire|workshop|process|system/u.test(text)
            ? "operating-step"
            : "decision-test";
  if (input.narrativeFunction === "contrast") return ["option-a", middle, "option-b"];
  if (input.narrativeFunction === "hook") return ["initial-tension", middle, "stakes"];
  if (input.narrativeFunction === "mechanism" || input.narrativeFunction === "resolution") return ["context", "mechanism", "result"];
  if (input.narrativeFunction === "consequence") return ["problem", middle, "consequence"];
  if (input.narrativeFunction === "evidence" || input.narrativeFunction === "example") return ["claim", "proof", "interpretation"];
  if (input.narrativeFunction === "setup" || input.narrativeFunction === "context") return ["orientation", middle, "relevance"];
  if (input.narrativeFunction === "conflict") return ["pressure", middle, "breaking-point"];
  if (input.narrativeFunction === "transition") return ["before", middle, "after"];
  return ["earlier-evidence", middle, "present-implication"];
}

function authoredStates(input: {
  readonly format: PositioningFormat;
  readonly narrativeFunction: VeronicaNarrativeFunction;
  readonly narrationSpan: string;
  readonly depiction: VeronicaConcreteDepictionV3;
}): VeronicaMultiStateAssetPlanV3 | null {
  if (input.format !== "long") return null;
  const roles = deriveVeronicaLongStateRoles({ narrativeFunction: input.narrativeFunction, narrationSpan: input.narrationSpan });
  const viewports = roles.length === 1
    ? [{ x: 0, y: 0, width: 1, height: 1 }]
    : roles.length === 2
      ? [{ x: 0, y: 0, width: 0.8, height: 0.8 }, { x: 0.2, y: 0.2, width: 0.8, height: 0.8 }]
      : [{ x: 0, y: 0, width: 0.7, height: 0.7 }, { x: 0.15, y: 0.15, width: 0.7, height: 0.7 }, { x: 0.3, y: 0.3, width: 0.7, height: 0.7 }];
  return {
    assetLevelDepiction: `${input.depiction.primarySubject} supports the authored ${roles.join(" → ")} reading of this narration span without text; the middle state isolates the specific narrated mechanism or decision between the opening and outcome.`,
    spatialLayout: `${input.depiction.primarySubject}, ${input.depiction.concreteObjects[1]!}, and the stated consequence are all independently visible inside their planned viewports.`,
    safeFraming: "keep focal objects completely inside every normalized viewport; reserve clean margins and avoid critical details at crop boundaries",
    states: roles.map((stateRole, index) => ({
      stateRole,
      cropFocus: `${stateRole} viewport`,
      semanticPurpose: `${stateRole}: ${input.depiction.semanticFocus}`,
      crop: { ...viewports[index]!, focalObject: index === 0 ? input.depiction.primarySubject : input.depiction.concreteObjects[Math.min(index, input.depiction.concreteObjects.length - 1)]! },
    })),
  };
}

function eventForState(state: VeronicaVisualStateV3): VeronicaSemanticEventV3["kind"] {
  if (state.stateRole === "single-hook" || state.stateRole === "single-context") return "establish";
  if (state.stateRole === "single-contrast") return "before-after-change";
  if (state.stateRole === "single-evidence" || state.stateRole === "single-example") return "evidence-emphasis";
  if (state.stateRole === "single-mechanism" || state.stateRole === "single-resolution") return "controlled-push";
  if (state.stateRole === "single-consequence" || state.stateRole === "single-payoff") return "consequence-reveal";
  if (state.stateRole === "initial-tension") return "establish";
  if (state.stateRole === "stakes") return "consequence-reveal";
  if (state.stateRole === "orientation" || state.stateRole === "before" || state.stateRole === "earlier-evidence") return "establish";
  if (state.stateRole === "relevance" || state.stateRole === "after" || state.stateRole === "present-implication" || state.stateRole === "breaking-point") return "consequence-reveal";
  if (state.stateRole === "handoff" || state.stateRole === "operating-step") return "controlled-push";
  if (state.stateRole === "signal-test") return "evidence-emphasis";
  if (state.stateRole === "selection-criterion" || state.stateRole === "decision-test") return "focus-transition";
  if (state.stateRole === "trade-off") return "lateral-crop-shift";
  if (state.stateRole === "problem" || state.stateRole === "context") return "establish";
  if (state.stateRole === "mechanism") return "controlled-push";
  if (state.stateRole === "proof") return "evidence-emphasis";
  if (state.stateRole === "option-a" || state.stateRole === "option-b") return "before-after-change";
  if (state.stateRole === "result" || state.stateRole === "consequence") return "consequence-reveal";
  if (state.stateRole === "interpretation") return "focus-transition";
  return "pull-back";
}

function thumbnailFromDirection(input: {
  readonly direction: VeronicaStoryVisualDirection;
  readonly title: string;
}) {
  const source = `${input.title} ${input.direction.visualPremise} ${input.direction.thumbnail.centralContradiction}`.toLowerCase();
  const focal = input.direction.thumbnail.focalSubjectOrObject;
  if (/parcel|return|ship|inventory|product/u.test(source)) return {
    centralContradiction: `A blocked delivery path makes the cost of ${input.title} physical.`, primaryObjectOrPerson: focal,
    visibleActionOrState: `The ${focal} stops at the broken handoff while the usable route remains open behind it.`, tension: "The visible obstruction shows the operational consequence before the title explains it.",
    composition: "A diagonal pathway leads into one blocked object; the working route is visible only in the background.", authoredTitleRelationship: "The image supplies the bottleneck; the title names the business principle that created it.",
    distinctFromNeighboringEpisodes: "This episode is packaged as an operational bottleneck, not a generic success-versus-failure comparison.",
  };
  if (/content|post|view|audience|attention|recognition/u.test(source)) return {
    centralContradiction: `One useful signal is buried inside an overload of ${input.title}.`, primaryObjectOrPerson: focal,
    visibleActionOrState: `The ${focal} is isolated while a surrounding field of irrelevant pieces recedes out of focus.`, tension: "The viewer sees the cost of being hard to recognize at a glance.",
    composition: "One sharply lit focal object breaks a dense field of smaller competing objects, leaving clear negative space.", authoredTitleRelationship: "The image demonstrates signal versus noise; the title gives that contrast its strategic name.",
    distinctFromNeighboringEpisodes: "This concept is an overload-and-recognition image rather than a transaction, price, or workflow image.",
  };
  if (/time|calendar|hour|schedule|week/u.test(source)) return {
    centralContradiction: `A tipped time allocation exposes what ${input.title} quietly costs.`, primaryObjectOrPerson: focal,
    visibleActionOrState: `The ${focal} pulls weighted time markers toward one side of an otherwise balanced planning surface.`, tension: "The imbalance is legible without numbers, charts, or on-image copy.",
    composition: "An off-center balance occupies the frame with one depleted work zone and generous clean space opposite it.", authoredTitleRelationship: "The image makes the trade-off visible; the title identifies the decision behind it.",
    distinctFromNeighboringEpisodes: "The packaging uses a physical allocation imbalance, distinct from the series' customer-choice and proof-object concepts.",
  };
  if (/price|value|expert|position|niche|target/u.test(source)) return {
    centralContradiction: `The wrong fit makes ${input.title} visibly harder to choose.`, primaryObjectOrPerson: focal,
    visibleActionOrState: `The ${focal} aligns with one precise space while a near-match remains visibly unsupported.`, tension: "The empty gap shows why a broad or weak promise does not resolve the buyer's choice.",
    composition: "A single shaped object and its exact receiving space dominate; the near-match sits offset at the edge.", authoredTitleRelationship: "The image contributes fit and mismatch; the title supplies the positioning lesson.",
    distinctFromNeighboringEpisodes: "This is an identity-and-fit composition rather than an overloaded system or a before-and-after outcome.",
  };
  return {
    centralContradiction: `A visible consequence tests the promise behind ${input.title}.`, primaryObjectOrPerson: focal,
    visibleActionOrState: `The ${focal} changes condition at the exact point where the promised outcome must be proved.`, tension: "The viewer can infer the practical stakes from one altered object state.",
    composition: "A close single-object transformation fills the frame, with the decisive changed detail held inside a simple foreground plane.", authoredTitleRelationship: "The image supplies the proof moment; the title states the lesson being tested.",
    distinctFromNeighboringEpisodes: "This episode relies on one proof transformation rather than a crowded comparison or environmental bottleneck.",
  };
}

function promptFor(input: {
  readonly format: PositioningFormat;
  readonly scene: Omit<VeronicaSemanticSceneV3, "assetId" | "visualStateId">;
  readonly identityDescription: string | null;
}): string {
  const ratio = input.format === "long" ? "16:9" : "9:16";
  const depiction = input.scene.depiction;
  return [
    `Text-free ${ratio} ${input.scene.treatment.strategy}.`,
    `Depict: ${depiction.description}.`,
    `Primary subject: ${depiction.primarySubject}. Visible action: ${depiction.primaryAction}.`,
    `Concrete objects: ${depiction.concreteObjects.join("; ")}.`,
    `Spatial relationship: ${depiction.spatialRelationship}. Narrative focus: ${depiction.semanticFocus}.`,
    ...(input.scene.subject.mode === "character-led" && input.scene.subject.primaryIdentityId && input.identityDescription
      ? [`Identity continuity key ${input.scene.subject.primaryIdentityId}; preserve exactly: ${input.identityDescription}.`]
      : []),
    `Environment: ${depiction.environment}.`,
    `Composition: ${input.scene.treatment.composition}. Camera: ${input.scene.treatment.camera}.`,
    ...(input.scene.multiStateAsset
      ? [
          `Compose one coherent crop-safe multi-state base image: ${input.scene.multiStateAsset.assetLevelDepiction}.`,
          `Required spatial layout: ${input.scene.multiStateAsset.spatialLayout}. Safe framing: ${input.scene.multiStateAsset.safeFraming}.`,
          ...input.scene.multiStateAsset.states.map((state, index) =>
            `State ${index + 1} ${state.stateRole}, crop ${state.cropFocus}, communicates ${state.semanticPurpose}.`
          ),
        ]
      : []),
    "Contemporary European editorial realism; no readable text, letters, numbers, logos, UI, generic office, or stock handshake.",
  ].join(" ");
}

export function validateVeronicaUnifiedV3SemanticPlan(
  plan: Omit<VeronicaUnifiedV3SemanticPlan, "validation" | "planHash">
): readonly VeronicaPortfolioFindingV3[] {
  const findings: VeronicaPortfolioFindingV3[] = [];
  const sceneById = new Map(plan.scenes.map((scene) => [scene.sceneId, scene]));
  const forbiddenProviderPromptPhrases = [
    "evidence arrangement",
    "working material",
    "make this narration span visually legible",
    "visualize the specific narrated change",
  ];
  for (const asset of plan.assets) {
    const forbiddenPhrase = forbiddenProviderPromptPhrases.find((phrase) => asset.prompt.toLowerCase().includes(phrase));
    if (forbiddenPhrase) {
      findings.push({
        code: "SYNTHETIC_PROVIDER_PROMPT_PHRASE",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [asset.sceneId],
        observed: forbiddenPhrase,
        threshold: "independently imageable concrete prompt",
        message: "Provider prompt contains a synthetic planning placeholder.",
      });
    }
    const malformed = asset.prompt.match(
      /\b(?:are|can|after|about|already|actually|but|everyone|between|isn) evidence artifact\b/iu
    );
    if (malformed) {
      findings.push({
        code: "INVALID_EVIDENCE_FRAGMENT",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [asset.sceneId],
        observed: malformed[0],
        threshold: "concrete source object or omission",
        message:
          "Provider prompt contains a malformed evidence-object fragment.",
      });
    } else if (/\bevidence artifact\b/iu.test(asset.prompt)) {
      findings.push({
        code: "MALFORMED_EVIDENCE_ARTIFACT",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [asset.sceneId],
        observed: asset.prompt,
        threshold: "absent",
        message:
          "Provider prompt contains a forbidden invented evidence-artifact fragment.",
      });
    }
  }
  for (const scene of plan.scenes) {
    if (/\b(?:the\s+)?(?:a|an)\s+/iu.test(scene.depiction.primarySubject) || /\b(?:evidence arrangement|working material)\b/iu.test(scene.depiction.primarySubject)) {
      findings.push({ code: "MALFORMED_PRIMARY_SUBJECT", severity: "blocker", storyIds: [plan.contentId], sceneIds: [scene.sceneId], observed: scene.depiction.primarySubject, threshold: "a grammatical concrete subject", message: "Primary subject is a malformed or synthetic phrase." });
    }
    const normalizedProposition = scene.proposition.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
    const normalizedDepiction = scene.depiction.description.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
    if (normalizedProposition === normalizedDepiction || scene.visualizableClaim === scene.proposition) {
      findings.push({
        code: "PROPOSITION_COPY_IS_NOT_VISUAL_TRANSLATION",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [scene.sceneId],
        observed: scene.proposition,
        threshold: "a distinct concrete depiction",
        message: "Scene depiction copies narration instead of translating it into imagery.",
      });
    }
    if (
      scene.depiction.concreteObjects.length === 0 ||
      scene.depiction.primaryAction.trim().split(/\s+/u).length < 3 ||
      scene.depiction.spatialRelationship.trim().split(/\s+/u).length < 5
    ) {
      findings.push({
        code: "DEPICTION_NOT_CONCRETE",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [scene.sceneId],
        observed: scene.depiction.description,
        threshold: "subject, action, objects, environment, and spatial relationship",
        message: "Concrete visual direction is incomplete.",
      });
    }
    const prompt = plan.assets.find((asset) => asset.sceneId === scene.sceneId)?.prompt ?? "";
    if (scene.subject.mode === "character-led") {
      if (!scene.subject.primaryIdentityId || !prompt.includes(scene.subject.primaryIdentityId)) {
        findings.push({
          code: "CHARACTER_CONTINUITY_NOT_COMPILED",
          severity: "blocker",
          storyIds: [plan.contentId],
          sceneIds: [scene.sceneId],
          observed: scene.subject.primaryIdentityId ?? "missing identity",
          threshold: "identity key and stable descriptors in provider prompt",
          message: "Character continuity metadata is not operational in the prompt.",
        });
      }
    } else if (scene.subject.primaryIdentityId !== null) {
      findings.push({
        code: "NON_CHARACTER_SCENE_HAS_FAKE_CONTINUITY",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [scene.sceneId],
        observed: scene.subject.mode,
        threshold: "null scene identity",
        message: "Object, environment, process, comparison, and evidence scenes must not claim active character continuity.",
      });
    }
    if (scene.evidenceNeed.objectPhrase && /^(?:book|order|page|product|proposal|website|same product|this product|important product|after product|improves comparison)$/iu.test(scene.evidenceNeed.objectPhrase.trim())) {
      findings.push({
        code: "WEAK_EVIDENCE_OBJECT",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [scene.sceneId],
        observed: scene.evidenceNeed.objectPhrase,
        threshold: "specific grammatical concrete noun phrase",
        message: "Evidence object is too generic or fragmentary to guide generation.",
      });
    }
    if (
      /a buyer observes how .*changes whether an expert is understood and chosen|it is not a decorative restatement/iu.test(
        scene.proposition
      )
    ) {
      findings.push({
        code: "GENERIC_SEMANTIC_BOILERPLATE",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [scene.sceneId],
        observed: scene.proposition,
        threshold: "source-grounded claim",
        message:
          "Scene proposition contains forbidden generic semantic boilerplate.",
      });
    }
  }
  if (plan.format === "long" && plan.visualStates.length < plan.scenes.length) {
    findings.push({
      code: "LONG_BASE_VISUAL_STATE_COUNT_LOW",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: [],
      observed: plan.visualStates.length,
      threshold: "at least one meaningful state per scene",
      message: "Long-form plan has fewer semantic visual states than scenes.",
    });
  }
  if (plan.format === "long" && plan.cadence.longestSemanticStateHoldMs > 15_000) {
    findings.push({
      code: "BASE_VISUAL_HOLD_TOO_LONG",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: [],
      observed: plan.cadence.longestSemanticStateHoldMs,
      threshold: 15_000,
      message: "A long-form semantic region holds longer than fifteen seconds.",
    });
  }
  const sceneIdentities = new Set(
    plan.scenes.map((scene) => scene.subject.primaryIdentityId).filter(Boolean)
  );
  if (sceneIdentities.size > 1) {
    findings.push({
      code: "UNJUSTIFIED_SUBJECT_CHURN",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: plan.scenes.map((scene) => scene.sceneId),
      observed: sceneIdentities.size,
      threshold: 2,
      message: "A story changes its recurring primary human identity.",
    });
  }
  if (
    plan.visualStates.length === 1 &&
    plan.visualEvents.length > 2 &&
    plan.cadence.semanticNoveltyCount <= 1
  ) {
    findings.push({
      code: "SEMANTIC_STATE_NOVELTY_INSUFFICIENT",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: plan.visualStates.map((state) => state.sceneId),
      observed: `${plan.visualEvents.length} motion events / ${plan.cadence.semanticNoveltyCount} semantic states`,
      threshold: "motion events must not substitute for semantic states",
      message:
        "Motion-event cadence is being counted as semantic visual novelty.",
    });
  }
  for (const asset of plan.assets.filter((entry) => entry.multiState)) {
    const states = plan.visualStates.filter((state) => state.assetId === asset.assetId);
    if (
      states.length < 1 || states.length > 4 ||
      new Set(states.map((state) => state.cropFocus)).size !== states.length ||
      new Set(states.map((state) => state.semanticPurpose)).size !== states.length ||
      !/multi-state|crop-safe/iu.test(asset.prompt)
    ) {
      findings.push({
        code: "FALSE_MULTI_STATE_ASSET",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [asset.sceneId],
        observed: `${states.length} states`,
        threshold: "one to four distinct semantic regions compiled into the base prompt",
        message: "Multi-state metadata is not backed by a deliberately composed provider prompt.",
      });
    }
    for (const [stateIndex, state] of states.entries()) {
      const crop = state.crop;
      const inBounds = crop && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 && crop.x + crop.width <= 1 && crop.y + crop.height <= 1;
      const correctAspect = crop && Math.abs(crop.width / crop.height - 1) < 0.0001;
      if (!inBounds || !correctAspect || !crop?.focalObject.trim()) {
        findings.push({ code: "MULTISTATE_CROP_INVALID", severity: "blocker", storyIds: [plan.contentId], sceneIds: [asset.sceneId], observed: JSON.stringify(crop), threshold: "in-bounds normalized 16:9-source viewport with focal object", message: "A multi-state crop is not executable by the renderer." });
      }
      const previous = states[stateIndex - 1];
      if (previous?.crop && crop && previous.crop.x === crop.x && previous.crop.y === crop.y && previous.crop.width === crop.width && previous.crop.height === crop.height) {
        findings.push({ code: "MULTISTATE_CROP_UNCHANGED", severity: "blocker", storyIds: [plan.contentId], sceneIds: [asset.sceneId], observed: state.visualStateId, threshold: "adjacent states must use materially different viewports", message: "Adjacent semantic states reuse the same crop geometry." });
      }
    }
  }
  for (const event of plan.visualEvents) {
    const state = plan.visualStates.find((entry) => entry.visualStateId === event.visualStateId);
    const scene = sceneById.get(event.sceneId);
    if (!state || !scene || event.durationMs !== state.durationMs) {
      findings.push({
        code: "MOTION_STATE_ALIGNMENT_INVALID",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [event.sceneId],
        observed: event.eventId,
        threshold: "one purpose-aligned event per semantic state",
        message: "Motion choreography is not aligned to a semantic state.",
      });
    }
  }
  if (/^source claim [a-f0-9]+$/iu.test(plan.thumbnail.distinctFromNeighboringEpisodes) || plan.thumbnail.distinctFromNeighboringEpisodes.split(/\s+/u).length < 12) {
    findings.push({
      code: "THUMBNAIL_NEIGHBOR_DISTINCTION_NOT_EDITORIAL",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: [],
      observed: plan.thumbnail.distinctFromNeighboringEpisodes,
      threshold: "human-readable comparison with neighboring stories",
      message: "Thumbnail differentiation must explain the editorial distinction, not supply a hash.",
    });
  }
  return findings;
}

export async function buildVeronicaUnifiedV3SemanticPlan(input: {
  readonly plannerInput: CanonicalSourcePlannerInput;
  readonly outputDir: string;
}): Promise<VeronicaUnifiedV3SemanticPlan> {
  const legacy = await buildVeronicaCanonicalVisualPlan(input);
  const narration = input.plannerInput.narration.narration;
  const direction = input.plannerInput.sourceEpisode.visualDirection;
  const visualDirectionHash = input.plannerInput.sourceEpisode.visualDirectionHash;
  if (!direction || !visualDirectionHash) {
    throw new Error(`VERONICA_VISUAL_DIRECTION_REQUIRED:${legacy.contentId}`);
  }
  const spans = groupSentences({ narration, format: legacy.format });
  const subjectPlan = storySubjectPlan({
    identityId: direction.protagonist?.identityId ?? null,
  });
  const totalDurationMs = Math.max(
    1,
    Math.round(
      (narration.trim().split(/\s+/u).filter(Boolean).length /
        input.plannerInput.planningConfiguration.targetWordsPerMinute) *
        60_000
    )
  );
  const sceneDuration = Math.floor(totalDurationMs / Math.max(1, spans.length));
  const authoredScenes = direction.authoredScenes;
  if (!authoredScenes || authoredScenes.length !== spans.length) {
    throw new Error(`VERONICA_AUTHORED_SCENE_DIRECTION_REQUIRED:${legacy.contentId}:expected ${spans.length} scenes`);
  }
  const scenes = spans.map((span, index) => {
    const authored = authoredScenes[index]!;
    const narrativeFunction = deriveVeronicaNarrativeFunction({
      span: span.text,
      index,
      count: spans.length,
    });
    const mode = authored.subjectMode;
    const treatment = {
      strategy: authored.treatmentStrategy,
      environment: authored.environment,
      composition: authored.composition,
      camera: authored.camera,
    };
    const assetId =
      `${legacy.contentId}-${String(index + 1).padStart(2, "0")}-base`.toLowerCase();
    const visualStateId = `${assetId}-state-01`;
    const multiStateAsset: VeronicaMultiStateAssetPlanV3 | null = authored.semanticStates
      ? {
          assetLevelDepiction: authored.depiction,
          spatialLayout: authored.spatialRelationship,
          safeFraming: "Keep every named focal object fully inside its authored normalized viewport with no critical detail at the boundary.",
          states: authored.semanticStates,
        }
      : null;
    return {
      sceneId: `${legacy.contentId}-S${String(index + 1).padStart(2, "0")}`,
      narrationSpan: span,
      narrativeFunction,
      communicationIntent: authored.visualIntent,
      proposition: deriveVeronicaSourceSpanProposition(span.text),
      visualIntent: authored.visualIntent,
      depiction: {
        description: authored.depiction,
        primarySubject: authored.primarySubject,
        primaryAction: authored.primaryAction,
        concreteObjects: authored.concreteObjects,
        environment: authored.environment,
        spatialRelationship: authored.spatialRelationship,
        semanticFocus: authored.semanticFocus,
      },
      visualizableClaim: authored.depiction,
      continuityGroup: `${legacy.contentId.toLowerCase()}-${authored.environment}`,
      subject: {
        mode,
        primaryIdentityId: mode === "character-led" ? (direction.protagonist?.identityId ?? null) : null,
        supportingIdentityIds: [],
        subjectRole: mode === "character-led" ? "business-operator" : "none",
      },
      evidenceNeed: mode === "evidence-led" || mode === "comparison-led"
        ? { required: true, objectPhrase: authored.concreteObjects[0] ?? null, sourceHash: span.sourceHash }
        : { required: false, objectPhrase: null, sourceHash: null },
      transitionRelationship: authored.transitionRelationship,
      treatment,
      assetId,
      visualStateId,
      multiStateAsset,
    } as const;
  });
  const visualStates = scenes.flatMap((scene, index) => {
    const startMs = index * sceneDuration;
    const durationMs =
      index === scenes.length - 1 ? totalDurationMs - startMs : sceneDuration;
    const definitions = scene.multiStateAsset?.states ?? [{
      stateRole: `single-${scene.narrativeFunction}`,
      cropFocus: legacy.format === "short" ? "full vertical frame" : "full frame",
      semanticPurpose: scene.depiction.semanticFocus,
      crop: null,
    }];
    const stateDuration = Math.floor(durationMs / definitions.length);
    return definitions.map((definition, stateIndex) => ({
      visualStateId: `${scene.assetId}-state-${String(stateIndex + 1).padStart(2, "0")}`,
      assetId: scene.assetId,
      sceneId: scene.sceneId,
      startMs: startMs + stateIndex * stateDuration,
      durationMs: stateIndex === definitions.length - 1
        ? durationMs - stateIndex * stateDuration
        : stateDuration,
      semanticClaimHash: stableHash({ scene: scene.sceneId, purpose: definition.semanticPurpose }),
      explicitMultiStateAsset: scene.multiStateAsset !== null,
      stateRole: definition.stateRole,
      cropFocus: definition.cropFocus,
      semanticPurpose: definition.semanticPurpose,
      crop: definition.crop,
    }));
  });
  const assets = scenes.map((scene) => {
    const {
      assetId: _assetId,
      visualStateId: _stateId,
      ...withoutAsset
    } = scene;
    const prompt = promptFor({
      format: legacy.format,
      scene: withoutAsset,
      identityDescription: direction.protagonist?.stableVisibleDescription ?? null,
    });
    return {
      assetId: scene.assetId,
      sceneId: scene.sceneId,
      prompt,
      promptHash: stableHash(prompt),
      textFree: true as const,
      multiState: scene.multiStateAsset,
    };
  });
  const visualEvents = visualStates.map((state) => {
    const semanticKind = eventForState(state);
    return {
      eventId: `${state.visualStateId}-event`.toLowerCase(),
      sceneId: state.sceneId,
      assetId: state.assetId,
      visualStateId: state.visualStateId,
      kind: semanticKind,
      startMs: state.startMs,
      durationMs: state.durationMs,
    };
  });
  const novelty = new Set(visualStates.map((state) => state.semanticClaimHash))
    .size;
  const thumbnail = direction.thumbnail;
  const provisional = {
    schemaVersion: VERONICA_UNIFIED_V3_SEMANTIC_PLAN_VERSION,
    plannerVersion: "veronica-unified-v3-semantic-planner.v2" as const,
    contentId: legacy.contentId,
    format: legacy.format,
    canonicalSourceHash: legacy.canonicalSourceHash,
    legacyPlanHash: legacy.planHash,
    sourceNarrationHash: stableHash(narration),
    visualDirectionHash,
    subjectPlan,
    scenes,
    visualStates,
    assets,
    visualEvents,
    thumbnail: {
      centralContradiction: thumbnail.centralContradiction,
      primaryObjectOrPerson: thumbnail.primaryObjectOrPerson,
      visibleActionOrState: thumbnail.visibleActionOrState,
      tension: thumbnail.tension,
      composition: thumbnail.composition,
      titleRelationship:
        "thumbnail visualizes the consequence or contradiction; title supplies the claim" as const,
      authoredTitleRelationship: thumbnail.authoredTitleRelationship,
      distinctFromNeighboringEpisodes: thumbnail.distinctFromNeighboringEpisodes,
      sourceHash: stableHash({ source: direction.thumbnail, compiled: thumbnail }),
    },
    cadence: {
      motionEventCount: visualEvents.length,
      baseVisualStateCount: visualStates.length,
      semanticNoveltyCount: novelty,
      longestBaseVisualStateHoldMs: Math.max(
        0,
        ...scenes.map((_, index) => index === scenes.length - 1
          ? totalDurationMs - index * sceneDuration
          : sceneDuration)
      ),
      semanticStateCount: visualStates.length,
      longestSemanticStateHoldMs: Math.max(0, ...visualStates.map((state) => state.durationMs)),
      longestUnchangedSemanticRegionMs: Math.max(0, ...visualStates.map((state) => state.durationMs)),
      trueMultiStateAssetCount: assets.filter((asset) => asset.multiState !== null).length,
      paidBaseAssetCount: assets.length,
    },
  } as const;
  const findings = validateVeronicaUnifiedV3SemanticPlan(provisional);
  const withoutHash = {
    ...provisional,
    validation: {
      status: findings.some((finding) => finding.severity === "blocker")
        ? ("fail" as const)
        : ("pass" as const),
      findings,
    },
  };
  return { ...withoutHash, planHash: stableHash(withoutHash) };
}

function distribution(values: readonly string[]) {
  return [
    ...new Map(
      values.map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ])
    ).entries(),
  ]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value)
    );
}

function firstSeenPattern(values: readonly string[]): string {
  const symbols = new Map<string, string>();
  return values.map((value) => {
    const key = value.toLowerCase().replace(/\s+/gu, " ").trim();
    if (!symbols.has(key)) symbols.set(key, String.fromCharCode(65 + symbols.size));
    return symbols.get(key)!;
  }).join("");
}

function intentBreakpointPattern(values: readonly string[]): string {
  if (!values.length) return "";
  const blocks: number[] = [];
  let length = 1;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] === values[index - 1]) length += 1;
    else { blocks.push(length); length = 1; }
  }
  blocks.push(length);
  return blocks.join("/");
}

function lowPeriodCycle(values: readonly string[]): string | null {
  const pattern = firstSeenPattern(values).split("");
  for (let period = 2; period <= Math.min(4, Math.floor(pattern.length / 2)); period += 1) {
    const seed = pattern.slice(0, period).join("");
    if (pattern.slice(period).every((value, index) => value === seed[index % period])) return seed;
  }
  return null;
}

function normalizedActionShell(value: string): string {
  return value.toLowerCase()
    .replace(/\b(?:a|an|the)\s+[a-z][a-z\s-]{0,45}(?=\s+(?:is|are|moves|sits|reaches|resolves|occupies))/gu, "[subject]")
    .replace(/\b(?:invoice|parcel|order|product|page|portfolio|package|receipt|proposal|calendar)\b/gu, "[object]")
    .replace(/\s+/gu, " ").trim();
}

function normalizedThumbnailTemplate(value: string): string {
  return value.toLowerCase()
    .replace(/[“"][^”"]+[”"]/gu, "[title]")
    .replace(/\b(?:a|an|the)\s+(?:phone|parcel|package|receipt|portfolio|product|page|calendar|table|sample|order)[a-z\s,-]{0,55}/gu, "[focal]")
    .replace(/\b(?:attention is not conversion|views are not sales|trust comes before conversion)\b/gu, "[title]")
    .replace(/\s+/gu, " ").trim();
}

export function validateVeronicaUnifiedV3Portfolio(
  plans: readonly VeronicaUnifiedV3SemanticPlan[]
): VeronicaPortfolioValidationV3 {
  const findings: VeronicaPortfolioFindingV3[] = [];
  const byFormat = new Map<
    PositioningFormat,
    VeronicaUnifiedV3SemanticPlan[]
  >();
  for (const plan of plans)
    byFormat.set(plan.format, [...(byFormat.get(plan.format) ?? []), plan]);
  for (const [format, entries] of byFormat) {
    if (entries.length < 8) continue;
    const signatures = entries.map((plan) =>
      plan.scenes.map((scene) => scene.narrativeFunction).join(",")
    );
    for (const item of distribution(signatures)) {
      const share = item.count / entries.length;
      if (share > 0.35)
        findings.push({
          code: "NARRATIVE_SIGNATURE_CONCENTRATION",
          severity: share > 0.5 ? "blocker" : "warning",
          storyIds: entries
            .filter(
              (plan) =>
                plan.scenes
                  .map((scene) => scene.narrativeFunction)
                  .join(",") === item.value
            )
            .map((plan) => plan.contentId),
          sceneIds: [],
          observed: share,
          threshold: share > 0.5 ? 0.5 : 0.35,
          message: `${format} narrative-function signature is overly concentrated.`,
        });
    }
  }
  const allScenes = plans.flatMap((plan) =>
    plan.scenes.map((scene) => ({ plan, scene }))
  );
  const fields: ReadonlyArray<
    [string, (item: (typeof allScenes)[number]) => string]
  > = [
    ["treatment", (item) => item.scene.treatment.strategy],
    ["camera", (item) => item.scene.treatment.camera],
    ["environment", (item) => item.scene.treatment.environment],
    ["composition", (item) => item.scene.treatment.composition],
    [
      "tuple",
      (item) => [
        item.scene.treatment.strategy,
        item.scene.treatment.environment,
        item.scene.treatment.composition,
        item.scene.treatment.camera,
      ].join(" | "),
    ],
    ["subjectMode", (item) => item.scene.subject.mode],
  ];
  const distributions: Record<
    string,
    readonly { readonly value: string; readonly count: number }[]
  > = {};
  for (const [name, select] of fields) {
    const values = allScenes.map(select);
    distributions[name] = distribution(values);
    const top = distributions[name][0];
    if (top && top.count / Math.max(1, values.length) > 0.35) {
      findings.push({
        code: `PORTFOLIO_${name.toUpperCase()}_CONCENTRATION`,
        severity: top.count / values.length > 0.5 ? "blocker" : "warning",
        storyIds: allScenes
          .filter((item) => select(item) === top.value)
          .map((item) => item.plan.contentId),
        sceneIds: allScenes
          .filter((item) => select(item) === top.value)
          .map((item) => item.scene.sceneId),
        observed: top.count / values.length,
        threshold: top.count / values.length > 0.5 ? 0.5 : 0.35,
        message: `Portfolio ${name} is overly concentrated.`,
      });
    }
  }
  const adjacentTuples = plans.flatMap((plan) => {
    const tuples = plan.scenes.map((scene) => [
      scene.treatment.strategy,
      scene.treatment.environment,
      scene.treatment.composition,
      scene.treatment.camera,
    ].join(" | "));
    return tuples.slice(1).map((tuple, index) => `${tuples[index]} => ${tuple}`);
  });
  distributions["adjacentTuple"] = distribution(adjacentTuples);
  const repeatedAdjacent = distributions["adjacentTuple"][0];
  if (repeatedAdjacent && repeatedAdjacent.count / Math.max(1, adjacentTuples.length) > 0.12) {
    findings.push({
      code: "PORTFOLIO_ADJACENT_TUPLE_PATTERN_CONCENTRATION",
      severity: repeatedAdjacent.count / adjacentTuples.length > 0.2 ? "blocker" : "warning",
      storyIds: plans.map((plan) => plan.contentId),
      sceneIds: [],
      observed: repeatedAdjacent.count / adjacentTuples.length,
      threshold: 0.12,
      message: "One adjacent full visual-grammar transition repeats suspiciously often.",
    });
  }
  const sequences = plans.map((plan) => ({
    id: plan.contentId,
    values: plan.scenes.map((scene) => [
      scene.treatment.strategy,
      scene.treatment.environment,
      scene.treatment.composition,
      scene.treatment.camera,
    ].join(" | ")),
  }));
  let maximumSequenceSimilarity = 0;
  let mostSimilarPair: readonly [string, string] = ["", ""];
  for (let left = 0; left < sequences.length; left += 1) {
    for (let right = left + 1; right < sequences.length; right += 1) {
      const a = sequences[left]!;
      const b = sequences[right]!;
      const compared = Math.min(a.values.length, b.values.length);
      const matches = a.values.slice(0, compared).filter((value, index) => value === b.values[index]).length;
      const similarity = matches / Math.max(a.values.length, b.values.length);
      if (similarity > maximumSequenceSimilarity) {
        maximumSequenceSimilarity = similarity;
        mostSimilarPair = [a.id, b.id];
      }
    }
  }
  distributions["storySequenceSimilarity"] = [{
    value: mostSimilarPair.join(" <> ") || "none",
    count: Math.round(maximumSequenceSimilarity * 10_000),
  }];
  if (maximumSequenceSimilarity > 0.8) {
    findings.push({
      code: "PORTFOLIO_STORY_TUPLE_SEQUENCE_SIMILARITY",
      severity: maximumSequenceSimilarity > 0.92 ? "blocker" : "warning",
      storyIds: [...mostSimilarPair].filter(Boolean),
      sceneIds: [],
      observed: maximumSequenceSimilarity,
      threshold: 0.8,
      message: "Two stories reuse nearly the same full visual-grammar sequence.",
    });
  }
  const concepts = plans.map((plan) =>
    plan.thumbnail.centralContradiction.toLowerCase()
  );
  distributions["thumbnail"] = distribution(concepts);
  for (const item of distributions["thumbnail"].filter(
    (entry) => entry.count > 2
  )) {
    findings.push({
      code: "THUMBNAIL_CONCEPT_DUPLICATION",
      severity: item.count > 4 ? "blocker" : "warning",
      storyIds: plans
        .filter(
          (plan) =>
            plan.thumbnail.centralContradiction.toLowerCase() === item.value
        )
        .map((plan) => plan.contentId),
      sceneIds: [],
      observed: item.count,
      threshold: item.count > 4 ? 4 : 2,
      message: "Thumbnail concept is reused across too many stories.",
    });
  }
  const structuralSequences: ReadonlyArray<[string, (plan: VeronicaUnifiedV3SemanticPlan) => string]> = [
    ["environmentSequence", (plan) => firstSeenPattern(plan.scenes.map((scene) => scene.depiction.environment))],
    ["intentBreakpointPattern", (plan) => intentBreakpointPattern(plan.scenes.map((scene) => scene.visualIntent))],
    ["subjectSequence", (plan) => firstSeenPattern(plan.scenes.map((scene) => scene.depiction.primarySubject))],
    ["motionSequence", (plan) => plan.visualEvents.map((event) => event.kind).join(">")] ,
  ];
  for (const [name, select] of structuralSequences) {
    const values = plans.map(select);
    distributions[name] = distribution(values);
    const top = distributions[name][0];
    const share = (top?.count ?? 0) / Math.max(1, plans.length);
    if (top && share > 0.5 && !(name === "intentBreakpointPattern" && /^1(?:\/1)+$/u.test(top.value))) {
      const code = name === "environmentSequence" ? "ENVIRONMENT_SEQUENCE_TEMPLATE_CONCENTRATION"
        : name === "intentBreakpointPattern" ? "VISUAL_INTENT_BREAKPOINT_TEMPLATE_CONCENTRATION"
          : name === "motionSequence" ? "MOTION_SEQUENCE_CONCENTRATION"
            : "SUBJECT_SEQUENCE_PATTERN_CONCENTRATION";
      findings.push({ code, severity: "blocker", storyIds: plans.filter((plan) => select(plan) === top.value).map((plan) => plan.contentId), sceneIds: [], observed: `${top.value} (${top.count}/${plans.length})`, threshold: "no portfolio-wide positional sequence", message: `A normalized ${name} repeats across most of the portfolio.` });
    }
  }
  for (const plan of plans) {
    const cycle = lowPeriodCycle(plan.scenes.map((scene) => scene.depiction.primarySubject));
    if (cycle) findings.push({ code: "SUBJECT_SEQUENCE_CYCLE", severity: "blocker", storyIds: [plan.contentId], sceneIds: plan.scenes.map((scene) => scene.sceneId), observed: cycle, threshold: "no unannotated low-period cycle", message: "Primary subjects form a low-period cyclic assignment rather than narrative recurrence." });
  }
  const actionShells = allScenes.map((item) => normalizedActionShell(item.scene.depiction.primaryAction));
  distributions["primaryActionShell"] = distribution(actionShells);
  const actionTop = distributions["primaryActionShell"]![0];
  if (actionTop && actionTop.count / Math.max(1, actionShells.length) > 0.2) findings.push({ code: "PRIMARY_ACTION_SHELL_CONCENTRATION", severity: "blocker", storyIds: allScenes.filter((item) => normalizedActionShell(item.scene.depiction.primaryAction) === actionTop.value).map((item) => item.plan.contentId), sceneIds: [], observed: `${actionTop.value} (${actionTop.count}/${actionShells.length})`, threshold: 0.2, message: "Variable substitution is hiding a repeated generic primary-action shell." });
  const stateRoles = plans.filter((plan) => plan.format === "long").flatMap((plan) => plan.assets.filter((asset) => asset.multiState).map((asset) => asset.multiState!.states.map((state) => state.stateRole).join(">")));
  distributions["semanticStateRoleSequence"] = distribution(stateRoles);
  const roleTop = distributions["semanticStateRoleSequence"]![0];
  if (roleTop && roleTop.count / Math.max(1, stateRoles.length) > 0.5) findings.push({ code: "SEMANTIC_STATE_ROLE_SEQUENCE_CONCENTRATION", severity: "blocker", storyIds: plans.filter((plan) => plan.format === "long").map((plan) => plan.contentId), sceneIds: [], observed: `${roleTop.value} (${roleTop.count}/${stateRoles.length})`, threshold: 0.5, message: "Long assets share one synthetic semantic-state role sequence." });
  const cropSequences = plans.filter((plan) => plan.format === "long").flatMap((plan) => plan.assets.filter((asset) => asset.multiState).map((asset) => asset.multiState!.states.map((state) => `${state.crop.x},${state.crop.y},${state.crop.width},${state.crop.height}`).join(">")));
  distributions["cropCoordinateSequence"] = distribution(cropSequences);
  const cropTop = distributions["cropCoordinateSequence"]![0];
  if (cropTop && cropTop.count / Math.max(1, cropSequences.length) > 0.2) findings.push({ code: "CROP_COORDINATE_SEQUENCE_CONCENTRATION", severity: "blocker", storyIds: plans.filter((plan) => plan.format === "long").map((plan) => plan.contentId), sceneIds: [], observed: `${cropTop.value} (${cropTop.count}/${cropSequences.length})`, threshold: 0.2, message: "Long assets repeat one crop-coordinate sequence too often." });
  for (const asset of plans.flatMap((plan) => plan.assets.filter((entry) => entry.multiState).map((entry) => ({ plan, asset: entry })))) {
    const focalObjects = asset.asset.multiState!.states.map((state) => state.crop.focalObject.toLowerCase());
    if (new Set(focalObjects).size === 1 && focalObjects.length > 1) findings.push({ code: "MULTISTATE_FOCAL_PURPOSE_DUPLICATION", severity: "blocker", storyIds: [asset.plan.contentId], sceneIds: [asset.asset.sceneId], observed: focalObjects[0]!, threshold: "distinct focal object or explicitly changed state", message: "Every semantic state uses the same focal object without an authored differentiator." });
  }
  for (const plan of plans) {
    const subjects = plan.scenes.map((scene) => scene.depiction.primarySubject.toLowerCase());
    if (subjects.length >= 7 && new Set(subjects).size / subjects.length > 0.9) findings.push({ code: "NEAR_TOTAL_OBJECT_CHURN", severity: "blocker", storyIds: [plan.contentId], sceneIds: plan.scenes.map((scene) => scene.sceneId), observed: `${new Set(subjects).size}/${subjects.length}`, threshold: "intentional anchor recurrence", message: "Nearly every scene introduces a new primary subject instead of developing visual anchors." });
  }
  const thumbnailFields: ReadonlyArray<[string, (plan: VeronicaUnifiedV3SemanticPlan) => string, string]> = [
    ["thumbnailActionTemplate", (plan) => normalizedThumbnailTemplate(plan.thumbnail.visibleActionOrState), "THUMBNAIL_ACTION_TEMPLATE_CONCENTRATION"],
    ["thumbnailCompositionTemplate", (plan) => normalizedThumbnailTemplate(plan.thumbnail.composition), "THUMBNAIL_COMPOSITION_TEMPLATE_CONCENTRATION"],
    ["thumbnailTitleRelationshipTemplate", (plan) => normalizedThumbnailTemplate(plan.thumbnail.authoredTitleRelationship), "THUMBNAIL_TITLE_RELATIONSHIP_TEMPLATE_CONCENTRATION"],
  ];
  for (const [name, select, code] of thumbnailFields) {
    const values = plans.map(select);
    distributions[name] = distribution(values);
    const top = distributions[name][0];
    if (top && top.count / Math.max(1, values.length) > 0.35) findings.push({ code, severity: "blocker", storyIds: plans.filter((plan) => select(plan) === top.value).map((plan) => plan.contentId), sceneIds: [], observed: `${top.value} (${top.count}/${values.length})`, threshold: 0.35, message: "Thumbnail prose is structurally repeated after variable names are normalized." });
  }
  const localFailures = plans.flatMap((plan) => plan.validation.findings);
  return {
    status: [...findings, ...localFailures].some(
      (finding) => finding.severity === "blocker"
    )
      ? "fail"
      : "pass",
    findings: [...localFailures, ...findings],
    distributions,
  };
}
