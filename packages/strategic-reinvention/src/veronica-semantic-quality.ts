import type {
  PlannedScene,
  PositioningVisualTreatment,
  VeronicaActionOwnerRole,
  VeronicaSemanticConfidence,
  VeronicaSemanticProposition,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";

export const VERONICA_SEMANTIC_PROPOSITION_VERSION = "veronica-semantic-proposition.v1" as const;
export const VERONICA_PROVIDER_PROMPT_QUALITY_VERSION = "veronica-provider-prompt-quality.v1" as const;

type Mechanism = VeronicaSemanticProposition["visualMechanism"];

const internalLanguage = /\b(?:tied to the narrated|at causal step|recognizes? the consequence|chooses? accordingly|changes? the available evidence|occupation-neutral evidence and comparison setting|the narrated claim)\b/iu;
const malformedCauseTemplate = /^because\s+.+\s+changes?\s+the\s+available\s+evidence\b/iu;
const finitePredicate = /\b(?:is|are|has|have|gives?|makes?|shows?|lets?|leaves?|connects?|reinforces?|builds?|creates?|reduces?|keeps?|becomes?|remains?|sits?|scans?|stops?|ignores?|notices?|recognizes?|remembers?|categorizes?|understands?|trusts?|hesitates?|chooses?|commits?|crosses?|opens?|refers?|enters?|leaves?|follows?|compares?|points?|accumulates?|supports?|weakens?|strengthens?|explains?|demonstrates?|reveals?|matches?|fits?|presents?|identif\w*|repeats?|combines?|forms?|aligns?|moves?|arranges?|groups?|places?|inspects?|traces?|contributes?|uses?|arriv\w*|widen\w*|rescues?)\b/iu;
const abstractOnly = /^(?:positioning|clarity|evidence|expertise|recognition|relevance|value|trust|growth|success|transformation)[\s,;/&-]*$/iu;
const stopWords = new Set(["about", "after", "again", "because", "before", "being", "could", "every", "from", "have", "into", "just", "more", "only", "other", "should", "than", "that", "their", "them", "then", "there", "these", "they", "this", "through", "when", "where", "which", "while", "with", "would", "your"]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function contentTokens(value: string): readonly string[] {
  return [...new Set(normalize(value).split(" ").filter((word) => word.length >= 4 && !stopWords.has(word)))];
}

function sentences(value: string): readonly string[] {
  return value.replace(/^---[\s\S]*?---\s*/u, "").split(/(?<=[.!?…])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
}

const mechanismRules: readonly { readonly mechanism: Mechanism; readonly pattern: RegExp; readonly anchors: readonly string[] }[] = [
  { mechanism: "website-first-impression", pattern: /\b(?:website|site|web page|first screen|five seconds|profile|bio)\b/iu, anchors: ["website", "site", "screen", "visitor", "profile", "bio", "category"] },
  { mechanism: "market-problem-solution-chain", pattern: /\b(?:market).{0,100}\bproblem\b|\bproblem\b.{0,120}\bsolution\b|three questions/iu, anchors: ["market", "problem", "solution", "group", "question", "position"] },
  { mechanism: "problem-first-sequence", pattern: /\b(?:package|method|feature).{0,100}\b(?:problem|customer)\b|reverse the (?:order|sequence)/iu, anchors: ["package", "method", "feature", "problem", "customer", "sequence"] },
  { mechanism: "identity-bridge", pattern: /\b(?:past|previous|transferable|professional story|new professional identity|changing direction|evolution)\b/iu, anchors: ["past", "previous", "skills", "story", "identity", "credible", "evolution"] },
  { mechanism: "relevant-context-participation", pattern: /\b(?:events?|conversations?|show up|participat|places where|environments? where|sector)\b/iu, anchors: ["event", "conversation", "participation", "context", "relevant", "sector", "people"] },
  { mechanism: "recognition-accumulation", pattern: /\b(?:recognition|remember|repetition|accumulat|association|reputation|connect the dots|consistent signals?)\b/iu, anchors: ["recognition", "remember", "repetition", "accumulation", "association", "reputation", "signals", "consistent"] },
  { mechanism: "claim-to-proof", pattern: /\b(?:expert|authority|claim|evidence|proof|believ|credib|uncertainty|outcome|case stud)\b/iu, anchors: ["expert", "authority", "claim", "evidence", "proof", "credible", "outcome", "uncertainty"] },
  { mechanism: "signal-coherence", pattern: /\b(?:content|offer|touchpoint|coheren|alignment|same expertise|same promise|same story)\b/iu, anchors: ["content", "offer", "profile", "coherence", "alignment", "expertise", "promise", "touchpoint"] },
  { mechanism: "audience-fit-signal", pattern: /\b(?:everyone|generic|broad|niche|relevant|this is for me|specificity|audience)\b/iu, anchors: ["everyone", "generic", "broad", "niche", "relevant", "specific", "audience", "message"] },
  { mechanism: "customer-context-interpretation", pattern: /\b(?:frustrat\w*|fear|priorit\w*|buying decision|understand the context|describe the problem|their own words|interpretation work|recognize their own situation)\b/iu, anchors: ["frustration", "fear", "priority", "decision", "context", "problem", "understand"] },
  { mechanism: "peer-referral", pattern: /\b(?:referr|introduc|recommend|word of mouth)\b/iu, anchors: ["referral", "introduce", "recommend", "peer", "remember"] },
];

function resolveMechanism(narration: string, treatment: PositioningVisualTreatment): { readonly mechanism: Mechanism; readonly confidence: VeronicaSemanticConfidence; readonly anchors: readonly string[] } {
  if (/\b(?:doorway|threshold|foothold)\b/iu.test(narration)) return { mechanism: "audience-fit-signal", confidence: "HIGH", anchors: ["doorway", "threshold", "foothold", "specific", "relevant", "audience"] };
  const match = mechanismRules.find((rule) => rule.pattern.test(narration));
  if (match) return { mechanism: match.mechanism, confidence: "HIGH", anchors: match.anchors };
  const strategyMechanism: Partial<Record<PositioningVisualTreatment["strategy"], Mechanism>> = {
    "comparison-composition": "audience-fit-signal",
    "client-decision": "customer-context-interpretation",
    "evidence-proof": "claim-to-proof",
    "social-interaction": "peer-referral",
    "identity-perception": "identity-bridge",
    "human-scenario": "customer-context-interpretation",
    "semantic-diagram": "market-problem-solution-chain",
    "publishing-media-authority": "signal-coherence",
    "content-ecosystem": "signal-coherence",
    "process-visualization": "problem-first-sequence",
    "transformation": "identity-bridge",
    "before-after": "identity-bridge",
    "market-crowd": "audience-fit-signal",
    "audience-segmentation": "audience-fit-signal",
    "product-object-still-life": "claim-to-proof",
    "environmental-storytelling": "relevant-context-participation",
  };
  const mechanism = strategyMechanism[treatment.strategy];
  return mechanism ? { mechanism, confidence: "MEDIUM", anchors: contentTokens(treatment.narrativeBeat) } : { mechanism: "UNRESOLVED", confidence: "LOW", anchors: [] };
}

function selectNarrationAnchor(narration: string, anchors: readonly string[]): string {
  const candidates = sentences(narration);
  const scored = candidates.map((sentence, index) => ({
    sentence,
    index,
    score: anchors.filter((anchor) => normalize(sentence).includes(normalize(anchor))).length + (/\b(?:because|so|when|if|but|instead|means?|result|therefore)\b/iu.test(sentence) ? 1 : 0) - (sentence.endsWith("?") ? 0.5 : 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = scored[0]?.sentence ?? narration;
  return selected.split(/\s+/u).slice(0, 24).join(" ").replace(/[“”"]/gu, "");
}

function buyerConsequence(narration: string, mechanism: Mechanism): { readonly value?: string; readonly family: VeronicaSemanticProposition["buyerConsequenceFamily"]; readonly confidence: VeronicaSemanticConfidence } {
  if (/\b(?:remember|association|reputation|repeat what|connect the dots)\b/iu.test(narration)) return { value: "another person remembers the professional for the same specific expertise", family: "REMEMBERS", confidence: "HIGH" };
  if (/\b(?:category|categor\w*|who it is for|what problem|understand\w*|intelligible|clear first impression|five seconds)\b/iu.test(narration)) return { value: "a new visitor categorizes the offer and understands who and what it is for", family: "CATEGORIZES", confidence: "HIGH" };
  if (/\b(?:hesitat\w*|fear|uncertain|confus\w*|work the customer has to do|interpretation work)\b/iu.test(narration)) return { value: "the customer hesitates because the visible signals do not resolve into a clear fit", family: "HESITATES", confidence: "HIGH" };
  if (/\b(?:ignore|nobody|relevant to no one|overlook|scan past)\b/iu.test(narration)) return { value: "the intended customer scans past a broad message that offers no visible sign of relevance", family: "IGNORES", confidence: "HIGH" };
  if (/\b(?:choose\w*|buy|select\w*|decision)\b/iu.test(narration)) return { value: "the customer chooses the option whose visible evidence matches the recognized problem", family: "CHOOSES", confidence: "HIGH" };
  if (/\b(?:trust\w*|believ\w*|credib\w*|authority|reduce uncertainty|evidence lets)\b/iu.test(narration)) return { value: "the observer trusts the expertise after concrete proof resolves the uncertainty", family: "TRUSTS", confidence: "HIGH" };
  if (/\b(?:attention|notice|paying attention|visible in the right places)\b/iu.test(narration)) return { value: "the relevant person notices the specific signal and gives it attention", family: "NOTICES", confidence: "HIGH" };
  if (/\b(?:refer|recommend|introduc)\b/iu.test(narration)) return { value: "one person refers another using the same recognizable expertise association", family: "REFERS", confidence: "HIGH" };
  if (/\b(?:recogniz|this is for me|see how you think|see you as)\b/iu.test(narration)) return { value: "the intended person recognizes that the signal fits their situation", family: "RECOGNIZES", confidence: "HIGH" };
  const defaults: Partial<Record<Mechanism, { readonly value: string; readonly family: VeronicaSemanticProposition["buyerConsequenceFamily"] }>> = {
    "website-first-impression": { value: "a new visitor understands the category before deciding whether to continue", family: "UNDERSTANDS" },
    "claim-to-proof": { value: "the observer recognizes the claimed expertise in the visible proof", family: "RECOGNIZES" },
    "audience-fit-signal": { value: "the intended person recognizes a specific sign of fit", family: "RECOGNIZES" },
    "signal-coherence": { value: "the visitor understands one consistent expertise across the touchpoints", family: "UNDERSTANDS" },
    "market-problem-solution-chain": { value: "the customer understands how the response follows from the recognized problem", family: "UNDERSTANDS" },
    "problem-first-sequence": { value: "the customer understands why the response follows from the problem", family: "UNDERSTANDS" },
    "identity-bridge": { value: "the observer trusts the new role because prior experience visibly supports it", family: "TRUSTS" },
    "relevant-context-participation": { value: "the relevant participants notice the expertise through the concrete contribution", family: "NOTICES" },
    "recognition-accumulation": { value: "another person remembers the recurring expertise association", family: "REMEMBERS" },
    "customer-context-interpretation": { value: "the customer recognizes their own situation in the explanation", family: "RECOGNIZES" },
    "peer-referral": { value: "one person can refer a peer using the recognizable expertise association", family: "REFERS" },
  };
  const fallback = defaults[mechanism];
  return fallback ? { ...fallback, confidence: "MEDIUM" } : { family: "NONE", confidence: "LOW" };
}

function actionOwner(scene: PlannedScene): { readonly role: VeronicaActionOwnerRole; readonly confidence: VeronicaSemanticConfidence } {
  if (scene.treatment.actionOwnerRole) return { role: scene.treatment.actionOwnerRole, confidence: "HIGH" };
  const source = `${scene.treatment.subjectRequirement} ${scene.treatment.action}`;
  if (/\b(?:expert|professional|consultant|seller)\b/iu.test(source)) return { role: "expert", confidence: "MEDIUM" };
  if (/\b(?:buyer|customer|visitor|prospect|audience)\b/iu.test(source)) return { role: "buyer", confidence: "MEDIUM" };
  if (scene.treatment.strategy === "comparison-composition") return { role: "none", confidence: "MEDIUM" };
  return { role: "shared", confidence: "MEDIUM" };
}

const mechanismVisuals: Readonly<Record<Exclude<Mechanism, "UNRESOLVED">, {
  readonly cause: string;
  readonly action: string;
  readonly consequence: string;
  readonly environment: string;
  readonly composition: string;
  readonly props: readonly string[];
}>> = {
  "website-first-impression": { cause: "The first screen presents one dominant audience-and-problem cue instead of unrelated sections", action: "a first-time visitor scans the opening screen and points to the single dominant service cue", consequence: "the visitor can identify the category before deciding to continue", environment: "quiet usability-test setting with one text-free website opening screen", composition: "visitor in profile beside one large opening screen; one dominant service cue occupies the first visual hierarchy", props: ["text-free opening screen", "single dominant service cue", "visitor attention gesture"] },
  "market-problem-solution-chain": { cause: "A defined group, a problem they already recognize, and a matching response form one visible chain", action: "a customer traces three concrete linked artifacts from lived problem evidence to the matching response", consequence: "the fit between market, problem, and response becomes legible", environment: "client discovery workspace with three linked physical evidence stations", composition: "three distinct stations connected in one direction: audience context, recognized problem, matching response", props: ["audience-context artifact", "problem evidence", "matching response prototype"] },
  "problem-first-sequence": { cause: "A seller-led package begins disconnected from the customer's visible problem", action: "the professional moves a prepared package behind the customer's problem evidence and aligns the response with that evidence", consequence: "the customer sees why the response follows from the problem", environment: "service-design worktable with customer problem evidence and a separate response prototype", composition: "problem evidence dominates the foreground; the response aligns behind it rather than leading the frame", props: ["customer problem evidence", "unmatched package", "aligned response prototype"] },
  "identity-bridge": { cause: "Concrete evidence from earlier work connects to the new professional role", action: "the professional places one transferable skill artifact between prior work evidence and the new service outcome", consequence: "the observer sees a credible progression rather than an unexplained title change", environment: "career-transition studio with prior-work evidence and a new service prototype", composition: "prior work at left, transferable skill in the center, new service result at right; one continuous line of evidence", props: ["prior-work artifact", "transferable-skill evidence", "new service result"] },
  "relevant-context-participation": { cause: "The expertise appears inside a conversation where the relevant people already gather", action: "the professional contributes a concrete example while nearby participants inspect it and respond", consequence: "participants connect the contribution to the claimed expertise", environment: "small professional roundtable with an active topic-specific demonstration", composition: "contribution and evidence at the center; participants' attention converges on the demonstrated detail", props: ["demonstration artifact", "participant response", "shared evidence surface"] },
  "recognition-accumulation": { cause: "Varied public signals repeat one consistent area of expertise", action: "another person groups several different proof artifacts around the same professional and recalls the shared association", consequence: "the repeated association becomes easier to remember when the topic appears", environment: "public evidence wall assembled from varied but related work outputs", composition: "different proof formats form one coherent cluster around a single expertise cue", props: ["related proof artifacts", "recognition gesture", "single recurring expertise cue"] },
  "claim-to-proof": { cause: "A claimed title is separated from concrete work, reasoning, and results", action: "an observer ignores the title badge and instead inspects a work example, a decision artifact, and a visible result", consequence: "the observer infers the expertise from proof rather than instruction", environment: "evidence-review setting with a professional, an observer, and three concrete proof artifacts", composition: "empty title badge remains peripheral; work example, reasoning artifact, and outcome lead the frame", props: ["blank title badge", "work example", "reasoning artifact", "visible outcome"] },
  "signal-coherence": { cause: "Offer, profile, website, and content repeat one expertise cue instead of competing stories", action: "a visitor follows the same visual evidence cue across several distinct touchpoints", consequence: "the separate encounters combine into one credible impression", environment: "customer journey review with distinct profile, site, offer, and content touchpoints", composition: "four separate touchpoints share one visible evidence cue while unrelated cues remain absent", props: ["profile touchpoint", "website touchpoint", "focused offer artifact", "content example"] },
  "audience-fit-signal": { cause: "A broad message gives a mixed crowd no visible sign of fit while a specific cue matches one person's situation", action: "people pass the broad display; the intended person stops at the specific situation cue", consequence: "relevance becomes visible without asking the whole crowd to interpret the offer", environment: "public choice space with a mixed flow of people and two differently focused service displays", composition: "broad display recedes beside an uninterested crowd; one specific situation cue stops the intended person", props: ["broad undifferentiated display", "specific situation cue", "mixed crowd", "stopping gesture"] },
  "customer-context-interpretation": { cause: "Concrete details from the customer's situation guide the professional's explanation", action: "the professional arranges the customer's observed frustrations, priorities, and attempted solutions into one causal view", consequence: "the customer recognizes their own situation in the explanation", environment: "one-to-one discovery setting with physical evidence from the customer's real context", composition: "customer evidence in the foreground; professional groups cause, failed attempt, and consequence without readable labels", props: ["context evidence", "failed-attempt artifact", "visible consequence", "customer recognition gesture"] },
  "peer-referral": { cause: "A consistent expertise signal gives one person a concrete reason to introduce another", action: "one person points a peer toward the professional's matching work example", consequence: "the peer recognizes the relevance before the introduction is complete", environment: "small peer conversation beside a concrete work demonstration", composition: "introducing gesture connects peer, professional, and matching work evidence in one triangle", props: ["matching work example", "introducing gesture", "peer response"] },
};

export function deriveVeronicaSemanticProposition(input: { readonly scene: PlannedScene; readonly narration: string }): VeronicaSemanticProposition {
  const resolved = resolveMechanism(input.narration, input.scene.treatment);
  const owner = actionOwner(input.scene);
  const buyer = buyerConsequence(input.narration, resolved.mechanism);
  const narrationAnchor = selectNarrationAnchor(input.narration, resolved.anchors);
  if (resolved.mechanism === "UNRESOLVED") {
    return { schemaVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION, narrationClaim: narrationAnchor, actorRole: owner.role, actorAction: input.scene.treatment.action, consequence: input.scene.treatment.narrativeBeat, visualMechanism: "UNRESOLVED", evidenceAnchors: [narrationAnchor], buyerConsequenceFamily: buyer.family, confidence: { proposition: "LOW", actorOwnership: owner.confidence, consequence: buyer.confidence, visualMechanism: "LOW" }, propositionHash: stableHash({ narrationAnchor, owner, buyer, mechanism: "UNRESOLVED" }) };
  }
  const visual = mechanismVisuals[resolved.mechanism];
  const propositionBase = { schemaVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION, narrationClaim: narrationAnchor, cause: visual.cause, actorRole: owner.role, actorAction: visual.action, ...(buyer.value ? { buyerInterpretation: buyer.value } : {}), consequence: visual.consequence, ...( /\b(?:doorway|threshold|foothold)\b/iu.test(input.narration) ? { narrationNativeMetaphor: "doorway / threshold" } : {}), visualMechanism: resolved.mechanism, evidenceAnchors: [narrationAnchor], buyerConsequenceFamily: buyer.family, confidence: { proposition: resolved.confidence, actorOwnership: owner.confidence, consequence: buyer.value ? buyer.confidence : "MEDIUM", visualMechanism: resolved.confidence } };
  return { ...propositionBase, propositionHash: stableHash(propositionBase) };
}

export function visualTreatmentFromProposition(input: { readonly scene: PlannedScene; readonly proposition: VeronicaSemanticProposition; readonly preserveEnvironment: boolean }): Pick<PositioningVisualTreatment, "narrativeBeat" | "subjectRequirement" | "environment" | "composition" | "camera" | "action" | "actionOwnerRole" | "props" | "diagram" | "strategy"> {
  if (input.proposition.visualMechanism === "UNRESOLVED") throw new Error("SEMANTIC_REMEDIATION_LOW_CONFIDENCE");
  const visual = mechanismVisuals[input.proposition.visualMechanism];
  const consequenceActions: Partial<Record<VeronicaSemanticProposition["buyerConsequenceFamily"], string>> = {
    REMEMBERS: "another person gathers the varied proof artifacts around one recurring expertise cue and recalls the association",
    CATEGORIZES: "a first-time visitor sorts the visible offer into a clear category and points to who it serves",
    HESITATES: "the customer pauses between conflicting signals because none resolves into a clear fit",
    IGNORES: "the intended customer scans past the broad display that offers no specific sign of relevance",
    TRUSTS: "the observer inspects the concrete work and result before accepting the claimed expertise",
    NOTICES: "a relevant participant turns toward the concrete contribution and gives it focused attention",
    REFERS: "one person points a peer toward the matching work example and makes the introduction",
    CHOOSES: "the customer selects the response whose visible evidence matches the recognized problem",
    RECOGNIZES: "the customer points to the concrete detail that matches their own situation",
    UNDERSTANDS: "the visitor traces the visible cause from the recognized problem to the matching response",
  };
  const claim = input.proposition.narrationClaim;
  const claimSpecificAction = /\b(?:test|questions?|answer is yes|answer is no)\b/iu.test(claim)
    ? "a customer checks three distinct artifacts for audience fit, recognized problem, and matching response"
    : /\b(?:reverse|features?|package|method|thing they want to sell)\b/iu.test(claim)
      ? "the professional moves a prepared package behind the customer's problem evidence before aligning the response"
      : /\b(?:first screen|show only|five seconds)\b/iu.test(claim)
        ? "a first-time visitor examines only the opening screen and points to the audience-and-problem cue"
        : /\b(?:design|amplify|beautiful site)\b/iu.test(claim)
          ? "the visitor ignores decorative layout and follows the single clear category cue into the site"
          : /\b(?:accumulation|each useful|each public|each client|signals become a reputation)\b/iu.test(claim)
            ? "another person adds a new work result to a growing sequence of proof around the same expertise cue"
            : /\b(?:problem before|recognize the problem|experiencing|frustration)\b/iu.test(claim)
              ? "the customer points to lived problem evidence before inspecting the matching response"
              : undefined;
  const consequenceAction = consequenceActions[input.proposition.buyerConsequenceFamily];
  const concreteAction = claimSpecificAction
    ? `${claimSpecificAction}${consequenceAction ? `; ${consequenceAction}` : ""}`
    : consequenceAction ? `${visual.action}; ${consequenceAction}` : visual.action;
  const thesisClaim = input.proposition.narrationClaim.replace(/[?]+$/u, ".").replace(/\s+/gu, " ").trim();
  const thesis = input.proposition.narrationNativeMetaphor
    ? "A specific doorway gives the intended audience a visible point of entry while leaving wider paths accessible beyond it."
    : `${thesisClaim}${/[.!]$/u.test(thesisClaim) ? "" : "."} ${visual.consequence.charAt(0).toUpperCase()}${visual.consequence.slice(1)}.`;
  if (input.proposition.narrationNativeMetaphor) {
    return { narrativeBeat: thesis, subjectRequirement: "professional and intended audience with visually distinct roles", environment: "public threshold with a focused entrance and visibly open routes beyond", composition: "the intended person stops at the focused entrance while wider accessible paths remain visible beyond the threshold", camera: "documentary eye-level view with the choice point and open continuation legible in one frame", action: "the intended person enters through the specific doorway while the professional keeps the wider routes visibly open", actionOwnerRole: input.proposition.actorRole, props: ["specific open doorway", "intended audience cue", "wider paths beyond"], diagram: null, strategy: "client-decision" };
  }
  return { narrativeBeat: thesis, subjectRequirement: input.proposition.actorRole === "none" ? "people responding to two simultaneous visible conditions" : "professional and relevant observer with visually distinct roles", environment: input.preserveEnvironment ? input.scene.treatment.environment : visual.environment, composition: visual.composition, camera: "documentary eye-level view with the evidence, action, and visible response legible in one frame", action: concreteAction, actionOwnerRole: input.proposition.actorRole, props: visual.props, diagram: null, strategy: input.proposition.visualMechanism === "peer-referral" || input.proposition.visualMechanism === "relevant-context-participation" ? "social-interaction" : input.proposition.visualMechanism === "audience-fit-signal" || input.proposition.visualMechanism === "problem-first-sequence" ? "client-decision" : "evidence-proof" };
}

export interface VeronicaThesisQualityResult {
  readonly checks: { readonly explicit: boolean; readonly linguisticSanity: boolean; readonly finitePredicate: boolean; readonly narrationGrounded: boolean; readonly visuallyExpressible: boolean; readonly sceneSpecific: boolean; readonly distinctFromPrevious: boolean };
  readonly score: number;
  readonly reasons: readonly string[];
}

export function assessVeronicaVisibleThesisQuality(input: { readonly thesis: string | undefined; readonly narration: string; readonly treatment: PositioningVisualTreatment; readonly proposition?: VeronicaSemanticProposition; readonly previousThesis?: string }): VeronicaThesisQualityResult {
  const thesis = input.thesis?.trim() ?? "";
  const narrationTokens = new Set(contentTokens(input.narration));
  const thesisTokens = contentTokens(thesis);
  const anchors = input.proposition?.evidenceAnchors ?? [];
  const anchorTokens = contentTokens(anchors.join(" "));
  const overlap = thesisTokens.filter((token) => narrationTokens.has(token) || anchorTokens.includes(token)).length;
  const checks = {
    explicit: thesis.length >= 28,
    linguisticSanity: thesis.length <= 260 && !internalLanguage.test(thesis) && !malformedCauseTemplate.test(thesis) && !/\b(?:scene|causal step|narrated claim)\b/iu.test(thesis),
    finitePredicate: finitePredicate.test(thesis),
    narrationGrounded: overlap >= 1 || Boolean(input.proposition && input.proposition.confidence.proposition === "HIGH"),
    visuallyExpressible: !abstractOnly.test(thesis) && /\b(?:person|people|customer|visitor|observer|professional|message|screen|display|evidence|artifact|problem|response|offer|profile|website|work|signal|crowd|peer|participant|page|proof|result|route|doorway|threshold)\b/iu.test(`${thesis} ${input.treatment.action} ${input.treatment.props.join(" ")}`),
    sceneSpecific: !/\b(?:changes the available evidence|recognizes the consequence|chooses accordingly|concrete occupation-neutral evidence pattern)\b/iu.test(`${thesis} ${input.treatment.action}`),
    distinctFromPrevious: !input.previousThesis || normalize(input.previousThesis) !== normalize(thesis),
  } as const;
  const reasons = Object.entries(checks).flatMap(([name, passed]) => passed ? [] : [name]);
  return { checks, score: Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100) / 100, reasons };
}

export function providerPromptInternalLanguageReasons(prompt: string): readonly string[] {
  return [
    ...(internalLanguage.test(prompt) ? ["internal-remediation-language"] : []),
    ...(/MISSING\s+[—-]\s+PROVIDER PROJECTION BLOCKED/iu.test(prompt) ? ["missing-thesis-marker"] : []),
    ...(/\b(?:placeholder|todo|tbd|unresolved)\b/iu.test(prompt) ? ["unresolved-placeholder"] : []),
  ];
}
