import type {
  PlannedScene,
  PositioningVisualTreatment,
  VeronicaActionOwnerRole,
  VeronicaSemanticConfidence,
  VeronicaSemanticPolarity,
  VeronicaSemanticProposition,
  VeronicaSemanticStateRelation,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";

export const VERONICA_SEMANTIC_PROPOSITION_VERSION = "veronica-semantic-proposition.v3" as const;
export const VERONICA_PROVIDER_PROMPT_QUALITY_VERSION = "veronica-provider-prompt-quality.v3" as const;
export const VERONICA_TREATMENT_COMPATIBILITY_VERSION = "veronica-treatment-proposition-compatibility.v1" as const;
export const VERONICA_PROMPT_SANITATION_VERSION = "veronica-provider-prompt-sanitation.v2" as const;

type Mechanism = VeronicaSemanticProposition["visualMechanism"];

const internalLanguage = /\b(?:tied to the narrated|at causal step|recognizes? the consequence|chooses? accordingly|changes? the available evidence|occupation-neutral evidence and comparison setting|the narrated claim|weaker condition|stronger condition|semantic(?:[- ](?:gate|remediation|quality))?|remediation|validator)\b/iu;
const malformedCauseTemplate = /^because\s+.+\s+changes?\s+the\s+available\s+evidence\b/iu;
const finitePredicate = /\b(?:is|are|has|have|do(?:es)?|need(?:s)?|want(?:s)?|ask(?:s)?|must|may|should|will|means?|can|know\w*|begin\w*|write\w*|click\w*|read\w*|tell\w*|collapse\w*|introduc\w*|gives?|makes?|shows?|lets?|leaves?|connects?|reinforces?|builds?|creates?|reduces?|keeps?|becomes?|remains?|sits?|scans?|stops?|ignores?|notices?|recognizes?|remembers?|categorizes?|understands?|trusts?|hesitates?|chooses?|commits?|crosses?|opens?|refers?|enters?|leaves?|follows?|compares?|points?|accumulates?|supports?|weakens?|strengthens?|explains?|demonstrates?|reveals?|matches?|fits?|presents?|identif\w*|repeats?|combines?|forms?|aligns?|moves?|arranges?|groups?|places?|inspects?|traces?|contributes?|uses?|arriv\w*|widen\w*|rescues?)\b/iu;
const abstractOnly = /^(?:positioning|clarity|evidence|expertise|recognition|relevance|value|trust|growth|success|transformation)[\s,;/&-]*$/iu;
const stopWords = new Set(["about", "after", "again", "because", "before", "being", "could", "every", "from", "have", "into", "just", "more", "only", "other", "should", "than", "that", "their", "them", "then", "there", "these", "they", "this", "through", "when", "where", "which", "while", "with", "would", "your"]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function contentTokens(value: string): readonly string[] {
  return [...new Set(normalize(value).split(" ").filter((word) => word.length >= 4 && !stopWords.has(word)))];
}

interface SentenceSpan { readonly sentenceId: string; readonly startOffset: number; readonly endOffset: number; readonly text: string; readonly spanHash: string }

function sentenceSpans(value: string): readonly SentenceSpan[] {
  const body = value.replace(/^---[\s\S]*?---\s*/u, "");
  // A closing quote belongs to the sentence whose punctuation precedes it.
  // Keeping it here prevents the next semantic span from starting with an
  // orphaned quote and preserves exact source offsets/provenance.
  const matches = [...body.matchAll(/[^.!?…]+(?:[.!?…]+[”"'’)]*|$)/gu)];
  return matches.flatMap((match, index) => {
    const raw = match[0];
    const text = raw.trim();
    if (!text) return [];
    const leading = raw.indexOf(text);
    const startOffset = (match.index ?? 0) + Math.max(0, leading);
    const endOffset = startOffset + text.length;
    return [{ sentenceId: `sentence-${String(index + 1).padStart(3, "0")}`, startOffset, endOffset, text, spanHash: stableHash({ text, startOffset, endOffset }) }];
  });
}

const incompleteEnding = /\b(?:has to be|have to be|needs? to be|can be|could be|should be|would be|becomes? harder|participation in (?:one|two|three)|shows? what|excludes? some|the audience has|the visitor has|because|although|while|unless|with (?:a|the)|into (?:a|the)|from (?:a|the)|to (?:a|the))\s*[.!?…]*$/iu;

export function assessVeronicaNarrationClaimIntegrity(claim: string): { readonly status: "PASS" | "FAIL"; readonly reasons: readonly string[] } {
  const normalizedClaim = claim.trim();
  const reasons = [
    ...(!normalizedClaim ? ["empty-claim"] : []),
    ...(!/[.!?…][”'’)]?$/u.test(normalizedClaim) ? ["missing-semantic-boundary"] : []),
    ...(incompleteEnding.test(normalizedClaim) ? ["incomplete-trailing-structure"] : []),
  ];
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

const mechanismRules: readonly { readonly mechanism: Mechanism; readonly pattern: RegExp; readonly anchors: readonly string[] }[] = [
  { mechanism: "website-first-impression", pattern: /\b(?:first screen|opening screen|five seconds|web page)\b|\b(?:website|site|profile|bio)\b.{0,100}\b(?:visitor|first-time|category|opening|screen|five seconds|interpretation)\b/iu, anchors: ["website", "site", "screen", "visitor", "profile", "bio", "category"] },
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
  if (/\b(?:specific niche|smaller niche|opposite of breadth|starting broad|narrower focus)\b/iu.test(narration)) return { mechanism: "audience-fit-signal", confidence: "HIGH", anchors: ["niche", "specific", "breadth", "broad", "relevant", "remember"] };
  if (/\b(?:other people start using the label|other people begin to describe you|name becomes easier to remember)\b/iu.test(narration)) return { mechanism: "recognition-accumulation", confidence: "HIGH", anchors: ["other people", "label", "describe", "remember", "recognition"] };
  if (/\b(?:build the system around|every touchpoint|different stor|same expertise|alignment beats volume|coherent signals?)\b/iu.test(narration)) return { mechanism: "signal-coherence", confidence: "HIGH", anchors: ["system", "touchpoint", "different story", "same expertise", "alignment", "coherent", "signal"] };
  if (/\b(?:call(?:ing)? yourself an expert|bio.{0,40}expert|word [‘'"]?expert|announc\w* a new title)\b/iu.test(narration)) return { mechanism: "claim-to-proof", confidence: "HIGH", anchors: ["expert", "title", "claim", "evidence", "proof", "believable"] };
  if (/\b(?:thing they want to sell|start with (?:a )?(?:package|method|feature))\b/iu.test(narration)) return { mechanism: "problem-first-sequence", confidence: "HIGH", anchors: ["fuzzy", "package", "method", "feature", "problem", "customer"] };
  if (/\b(?:page|first screen).{0,120}\b(?:visitor|interpretation work|three questions)\b/iu.test(narration)) return { mechanism: "website-first-impression", confidence: "HIGH", anchors: ["page", "screen", "visitor", "questions", "answers", "category"] };
  if (/\b(?:identity can change|new professional role|label change|past and your new professional identity|professional story)\b/iu.test(narration)) return { mechanism: "identity-bridge", confidence: "HIGH", anchors: ["identity", "recognition", "role", "evidence", "past", "bridge"] };
  if (/\b(?:different stor|conflicting identit|reconcile (?:three|different)|unrelated services|motion without accumulation|resetting with every|alignment beats volume)\b/iu.test(narration)) return { mechanism: /motion without accumulation|resetting with every/iu.test(narration) ? "recognition-accumulation" : "signal-coherence", confidence: "HIGH", anchors: ["conflict", "different", "unrelated", "accumulation", "resetting", "alignment", "coherent"] };
  const narrationTokenSet = new Set(contentTokens(narration));
  const match = mechanismRules
    .filter((rule) => rule.pattern.test(narration))
    .map((rule) => ({ rule, score: rule.anchors.filter((anchor) => contentTokens(anchor).some((token) => narrationTokenSet.has(token))).length }))
    .sort((left, right) => right.score - left.score)[0]?.rule;
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

function selectNarrationAnchors(narration: string, anchors: readonly string[]): readonly [SentenceSpan, ...SentenceSpan[]] {
  const candidates = sentenceSpans(narration);
  const scored = candidates.map((span, index) => ({
    span,
    index,
    score: anchors.filter((anchor) => normalize(span.text).includes(normalize(anchor))).length
      + (/\b(?:because|so|when|if|but|instead|means?|result|therefore|without|while)\b/iu.test(span.text) ? 1 : 0)
      - (span.text.endsWith("?") ? 0.5 : 0)
      - (finitePredicate.test(span.text) ? 0 : 2),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = scored[0];
  if (!selected) return [{ sentenceId: "sentence-001", startOffset: 0, endOffset: narration.trim().length, text: narration.trim(), spanHash: stableHash(narration.trim()) }];
  const next = candidates[selected.index + 1];
  const selectedPolarity = classifyVeronicaSemanticPolarity(selected.span.text);
  const nextPolarity = next ? classifyVeronicaSemanticPolarity(next.text) : "NEUTRAL";
  const pairedConditional = /^if\b/iu.test(selected.span.text) && Boolean(next && /^if\b/iu.test(next.text));
  const pairedCorrection = Boolean(next && (
    (selectedPolarity === "NEGATIVE_STATE" && (nextPolarity === "POSITIVE_STATE" || /\b(?:needs?|instead|rather|but|with|after)\b/iu.test(next.text)))
    || (selectedPolarity === "POSITIVE_STATE" && nextPolarity === "NEGATIVE_STATE")
    || (/\bdo(?:es)? not need\b/iu.test(selected.span.text) && /\bneed\b/iu.test(next.text))
    || (/\bcan\b/iu.test(selected.span.text) && /\bcannot\b/iu.test(next.text))
  ));
  const previous = candidates[selected.index - 1];
  const pairedAnaphora = Boolean(previous && /^(?:it|this|that|these|those)\b/iu.test(selected.span.text) && /\b(?:does not have to|doesn't have to|rather than|instead of)\b/iu.test(previous.text));
  if (pairedAnaphora && previous) return [previous, selected.span];
  return (pairedConditional || pairedCorrection) && next ? [selected.span, next] : [selected.span];
}

export function classifyVeronicaSemanticPolarity(claim: string): VeronicaSemanticPolarity {
  if (/\b(?:withholds? recognition|missing work evidence|empty proof stations?)\b/iu.test(claim)) return "NEGATIVE_STATE";
  if (/\b(?:motion without accumulation|resets? instead of accumulat|no (?:recognition|association) accumulat|fails? to accumulat)\b/iu.test(claim)) return "NEGATIVE_STATE";
  if (/\b(?:conflicting|unrelated|different)\b/iu.test(claim) && /\b(?:cannot|hesitat\w*|no .{0,30}(?:clear|category|coherent))\b/iu.test(claim)) return "NEGATIVE_STATE";
  const negative = /\b(?:cannot|can't|may not|do not (?:become|show|support|explain|help|resolve|create|build)|does not (?:become|show|support|explain|help|resolve|create|build)|doesn't (?:become|show|support|explain|help|resolve|create|build)|not (?:clear|coherent|enough|recognizable)|without (?:evidence|clarity|recognition|a clear|a recurring)|conflict\w*|different stor\w*|unrelated|collapse\w*|confus\w*|vague|fuzzy|hesitat\w*|ignore\w*|reset\w*|motion without accumulation|no (?:visible|reason|fit|selection|client|customer)|fails? to|weakens?|los(?:e|es|t|ing)|rejected?|turns? away|chooses? another)\b/iu.test(claim);
  const positive = /\b(?:can become|clear|coheren\w*|recogniz\w*|recognit\w*|remember\w*|accumulat\w*|compound\w*|trust\w*|understand\w*|alignment|matching|credible|strengthen\w*)\b/iu.test(claim);
  const corrective = /\b(?:but|instead|rather|while|from .+ to|first.+then|after alignment|once aligned)\b/iu.test(claim);
  if (negative && positive && corrective) return "TRANSITION_NEGATIVE_TO_POSITIVE";
  if (negative && positive) return "CONTRAST";
  if (negative) return "NEGATIVE_STATE";
  if (positive) return "POSITIVE_STATE";
  return "NEUTRAL";
}

function buyerConsequence(claim: string, mechanism: Mechanism, polarity: VeronicaSemanticPolarity): { readonly value?: string; readonly family: VeronicaSemanticProposition["buyerConsequenceFamily"]; readonly confidence: VeronicaSemanticConfidence } {
  if (polarity === "NEGATIVE_STATE") {
    if (mechanism === "recognition-accumulation") return { value: "each new signal resets the association, so no recognizable reputation accumulates", family: "FAILS_TO_ACCUMULATE", confidence: "HIGH" };
    if (mechanism === "signal-coherence" || mechanism === "website-first-impression") return { value: "the visitor hesitates because the visible identities do not resolve into one category", family: "HESITATES", confidence: "HIGH" };
    if (mechanism === "audience-fit-signal") return { value: "the intended customer ignores the broad signal because no specific fit is visible", family: "IGNORES", confidence: "HIGH" };
    if (mechanism === "problem-first-sequence") return { value: "the customer hesitates because the prepared package does not begin from a recognized problem", family: "HESITATES", confidence: "HIGH" };
    if (mechanism === "customer-context-interpretation") return { value: "the customer hesitates because vague answers leave the situation unresolved", family: "HESITATES", confidence: "HIGH" };
    return { value: "the observer cannot identify a clear fit from the visible condition", family: "HESITATES", confidence: "HIGH" };
  }
  if (/\b(?:remember|association|reputation|repeat what|connect the dots)\b/iu.test(claim)) return { value: "another person remembers the professional for the same specific expertise", family: "REMEMBERS", confidence: "HIGH" };
  if (/\b(?:category|categor\w*|who it is for|what problem|understand\w*|intelligible|clear first impression|five seconds)\b/iu.test(claim)) return { value: "a new visitor categorizes the offer and understands who and what it is for", family: "CATEGORIZES", confidence: "HIGH" };
  if (/\b(?:hesitat\w*|fear|uncertain|confus\w*|work the customer has to do|interpretation work)\b/iu.test(claim)) return { value: "the customer hesitates because the visible signals do not resolve into a clear fit", family: "HESITATES", confidence: "HIGH" };
  if (/\b(?:ignore|nobody|relevant to no one|overlook|scan past)\b/iu.test(claim)) return { value: "the intended customer scans past a broad message that offers no visible sign of relevance", family: "IGNORES", confidence: "HIGH" };
  if (/\b(?:choose\w*|buy|select\w*|decision)\b/iu.test(claim)) return { value: "the customer chooses the option whose visible evidence matches the recognized problem", family: "CHOOSES", confidence: "HIGH" };
  if (/\b(?:trust\w*|believ\w*|credib\w*|authority|reduce uncertainty|evidence lets)\b/iu.test(claim)) return { value: "the observer trusts the expertise after concrete proof resolves the uncertainty", family: "TRUSTS", confidence: "HIGH" };
  if (/\b(?:attention|notice|paying attention|visible in the right places)\b/iu.test(claim)) return { value: "the relevant person notices the specific signal and gives it attention", family: "NOTICES", confidence: "HIGH" };
  if (/\b(?:refer|recommend|introduc)\b/iu.test(claim)) return { value: "one person refers another using the same recognizable expertise association", family: "REFERS", confidence: "HIGH" };
  if (/\b(?:recogniz|this is for me|see how you think|see you as)\b/iu.test(claim)) return { value: "the intended person recognizes that the signal fits their situation", family: "RECOGNIZES", confidence: "HIGH" };
  const defaults: Partial<Record<Mechanism, { readonly value: string; readonly family: VeronicaSemanticProposition["buyerConsequenceFamily"] }>> = {
    "website-first-impression": { value: "a new visitor understands the category before deciding whether to continue", family: "UNDERSTANDS" },
    "claim-to-proof": { value: "the observer recognizes the claimed expertise in the visible proof", family: "RECOGNIZES" },
    "audience-fit-signal": { value: "the intended person recognizes a specific sign of fit", family: "RECOGNIZES" },
    "signal-coherence": { value: "the visitor connects the separate touchpoints into one consistent expertise", family: "CONNECTS" },
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

export function resolveVeronicaVisiblePrimaryActionOwner(treatment: PositioningVisualTreatment): VeronicaActionOwnerRole | undefined {
  const action = treatment.action.trim();
  const optionalDescriptor = "(?:(?:relevant|nearby|intended|first-time|prospective|recurring)\\s+)?";
  if (new RegExp(`^(?:the\\s+|an?\\s+)?${optionalDescriptor}(?:expert|professional|consultant|seller)\\b`, "iu").test(action)) return "expert";
  if (new RegExp(`^(?:the\\s+|an?\\s+)?${optionalDescriptor}(?:(?:another|one)\\s+person|buyer|customer|visitor|prospect|audience|observer|person|people|peer|participant|intended person)\\b`, "iu").test(action)) return "buyer";
  if (/^(?:the\s+)?(?:comparison|contrast|split comparison|market)\b/iu.test(action)) return "none";
  return undefined;
}

function actionOwner(scene: PlannedScene, narrationEvidence = ""): { readonly role: VeronicaActionOwnerRole; readonly confidence: VeronicaSemanticConfidence } {
  const buyerLeads = /^\s*(?:the\s+|an?\s+)?(?:buyer|customer|visitor|prospect|audience|observer|participant|intended person|people)\b/iu.test(narrationEvidence)
    || /^\s*you\b[^.!?]*(?:have|gain|get)\b[^.!?]*(?:idea|understanding|clarity)\b/iu.test(narrationEvidence)
    || /(?:^|\bwhen\s+)(?:other people|the market|the audience)\b[^.!?]*\b(?:understand|recognize|remember|repeat|notice|choose|decide)\w*\b/iu.test(narrationEvidence);
  const expertLeads = /^\s*(?:the\s+|an?\s+)?(?:expert|professional|consultant|seller)\b/iu.test(narrationEvidence)
    || /^\s*you\b[^.!?]*\b(?:become|announce|build|choose|define|introduce|arrange|publish|participate|focus|start|create|show|need)\w*\b/iu.test(narrationEvidence)
    || /:\s*[^,]+,\s*[^,]+,\s*(?:and\s+)?[^,]+/u.test(narrationEvidence)
    || /^\s*(?:first|second|third|next|then)?[:,]?\s*(?:show|build|choose|define|introduce|arrange|publish|participate|focus|start|create)\b/iu.test(narrationEvidence);
  if (buyerLeads) return { role: "buyer", confidence: "HIGH" };
  if (expertLeads) return { role: "expert", confidence: "HIGH" };
  const visible = resolveVeronicaVisiblePrimaryActionOwner(scene.treatment);
  if (visible) return { role: visible, confidence: "HIGH" };
  if (scene.treatment.actionOwnerRole) return { role: scene.treatment.actionOwnerRole, confidence: "MEDIUM" };
  const source = `${scene.treatment.subjectRequirement} ${scene.treatment.action}`;
  if (/\b(?:expert|professional|consultant|seller)\b/iu.test(source)) return { role: "expert", confidence: "MEDIUM" };
  if (/\b(?:buyer|customer|visitor|prospect|audience)\b/iu.test(source)) return { role: "buyer", confidence: "MEDIUM" };
  if (scene.treatment.strategy === "comparison-composition") return { role: "none", confidence: "MEDIUM" };
  return { role: "shared", confidence: "MEDIUM" };
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/([.!?…]+)([”"'’)]*)$/u, "$2");
}

function completeSentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?…][”"'’)]?$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function sourceGroundedCausalFields(claim: string, polarity: VeronicaSemanticPolarity): { readonly stateRelation: VeronicaSemanticStateRelation; readonly cause: string; readonly consequence: string; readonly contrast?: NonNullable<VeronicaSemanticProposition["contrast"]> } {
  const source = withoutTerminalPunctuation(claim);
  const parseConditional = (value: string): readonly [string, string] | undefined => {
    const body = value.match(/^if\s+(.+)$/iu)?.[1];
    if (!body) return undefined;
    const delimiters = [...body.matchAll(/,/gu)].map((match) => match.index).reverse();
    for (const index of delimiters) {
      const cause = body.slice(0, index).trim();
      const consequence = body.slice(index + 1).trim();
      if (cause && consequence && finitePredicate.test(consequence)) return [cause, consequence];
    }
    return undefined;
  };
  const pairedStates = source.split(/\.\s+/u).filter(Boolean);
  if (pairedStates.length === 2 && (polarity === "CONTRAST" || polarity === "TRANSITION_NEGATIVE_TO_POSITIVE" || polarity === "TRANSITION_POSITIVE_TO_NEGATIVE")) {
    const temporal = /^(?:then|later|after|next|eventually)\b/iu.test(pairedStates[1]!);
    const relation = temporal ? "SEQUENTIAL_PROGRESSION" as const : "CONTRAST" as const;
    return { stateRelation: relation, cause: pairedStates[0]!, consequence: pairedStates[1]!, contrast: { relation, initialState: pairedStates[0]!, failureState: pairedStates[0]!, desiredState: pairedStates[1]!, consequence: pairedStates[1]! } };
  }
  const comparative = source.match(/^(.+?)\s+(?:can|will)\s+.+?\s+than\s+(.+)$/iu);
  if (comparative && polarity === "CONTRAST") {
    return { stateRelation: "CONTRAST", cause: comparative[2]!, consequence: comparative[1]!, contrast: { relation: "CONTRAST", initialState: comparative[2]!, failureState: comparative[2]!, desiredState: comparative[1]!, consequence: comparative[1]! } };
  }
  const sequentialConditionals = source.split(/\.\s+(?=if\s)/iu).map(parseConditional).filter((match): match is readonly [string, string] => match !== undefined);
  if (sequentialConditionals.length >= 2) {
    const initial = sequentialConditionals[0]!;
    const desired = sequentialConditionals[1]!;
    return { stateRelation: "CONDITIONAL_ALTERNATIVES", cause: initial[0], consequence: initial[1], contrast: { relation: "CONDITIONAL_ALTERNATIVES", initialState: initial[0], failureState: initial[1], desiredState: desired[0], consequence: desired[1] } };
  }
  const conditional = parseConditional(source);
  const causal = source.match(/^(.+?)(?:,?\s+(?:so|therefore|which means|and as a result)\s+)(.+)$/iu);
  const temporal = source.match(/^(.+?),\s+(?:then|later|afterward|eventually)\s+(.+)$/iu)
    ?? source.match(/^(first\s+.+?)\s+then\s+(.+)$/iu);
  const beforeAfter = source.match(/^before\s+(.+?),\s+after\s+(.+)$/iu);
  const corrective = source.match(/^(.+?)(?:,?\s+(?:but|while|rather than|instead)\s+)(.+)$/iu);
  if (conditional) return { stateRelation: "STABLE", cause: conditional[0], consequence: conditional[1] };
  if (causal) {
    const opposedOutcome = causal[2]!.match(/^(.+?)\s+instead of\s+(.+)$/iu);
    if (opposedOutcome) return { stateRelation: "CONTRAST", cause: causal[1]!, consequence: opposedOutcome[1]!, contrast: { relation: "CONTRAST", initialState: opposedOutcome[2]!, failureState: opposedOutcome[2]!, desiredState: opposedOutcome[1]!, consequence: opposedOutcome[1]! } };
    return { stateRelation: "STABLE", cause: causal[1]!, consequence: causal[2]! };
  }
  if (temporal) return { stateRelation: "SEQUENTIAL_PROGRESSION", cause: temporal[1]!, consequence: temporal[2]!, contrast: { relation: "SEQUENTIAL_PROGRESSION", initialState: temporal[1]!, desiredState: temporal[2]!, failureState: temporal[1]!, consequence: temporal[2]! } };
  if (beforeAfter) return { stateRelation: "CAUSAL_BEFORE_AFTER", cause: beforeAfter[1]!, consequence: beforeAfter[2]!, contrast: { relation: "CAUSAL_BEFORE_AFTER", initialState: beforeAfter[1]!, desiredState: beforeAfter[2]!, failureState: beforeAfter[1]!, consequence: beforeAfter[2]! } };
  if (corrective && (polarity === "CONTRAST" || polarity === "TRANSITION_NEGATIVE_TO_POSITIVE" || polarity === "TRANSITION_POSITIVE_TO_NEGATIVE")) {
    const relation = /\b(?:first|before)\b[\s\S]*\b(?:later|after|then|eventually)\b/iu.test(source) ? "SEQUENTIAL_PROGRESSION" as const : "CONTRAST" as const;
    return { stateRelation: relation, cause: corrective[1]!, consequence: corrective[2]!, contrast: { relation, initialState: corrective[1]!, desiredState: corrective[2]!, failureState: corrective[1]!, consequence: corrective[2]! } };
  }
  return { stateRelation: "STABLE", cause: source, consequence: source };
}

export function renderVeronicaVisibleThesis(proposition: VeronicaSemanticProposition): string {
  const claim = proposition.narrationClaim.trim();
  const cause = proposition.cause?.trim() ?? "";
  const consequence = proposition.consequence.trim();
  if (!cause || normalize(cause) === normalize(consequence)) return completeSentence(claim);
  const contrast = proposition.contrast;
  if (contrast?.initialState && contrast.desiredState) {
    const firstOutcome = contrast.failureState ?? cause;
    const secondOutcome = contrast.consequence ?? consequence;
    if (normalize(contrast.initialState) === normalize(firstOutcome)
      && normalize(contrast.desiredState) === normalize(secondOutcome)) {
      return completeSentence(claim);
    }
    if (contrast.relation === "CONDITIONAL_ALTERNATIVES") return `Alternative A: ${withoutTerminalPunctuation(contrast.initialState)} — ${withoutTerminalPunctuation(firstOutcome)}; alternative B: ${withoutTerminalPunctuation(contrast.desiredState)} — ${withoutTerminalPunctuation(secondOutcome)}.`;
    if (contrast.relation === "CONTRAST") return `Comparison: ${withoutTerminalPunctuation(contrast.initialState)} — ${withoutTerminalPunctuation(firstOutcome)}; ${withoutTerminalPunctuation(contrast.desiredState)} — ${withoutTerminalPunctuation(secondOutcome)}.`;
    return `Before: ${withoutTerminalPunctuation(contrast.initialState)}. After: ${withoutTerminalPunctuation(contrast.desiredState)}. Result: ${withoutTerminalPunctuation(secondOutcome)}.`;
  }
  return `${withoutTerminalPunctuation(cause)}; as a result, ${withoutTerminalPunctuation(consequence)}.`;
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
  "work-expertise-separation": { cause: "Substantive professional work creates actual expertise while external recognition remains a separate state", action: "the professional performs substantive work that produces an expert result while a separate observer remains outside the work context without evaluating proof", consequence: "actual expertise exists through the work even though external recognition is still unresolved", environment: "professional work setting with a clear boundary to a separate external-observer context", composition: "the professional and substantive work process dominate the frame; the completed expert result remains on the work side while the observer stays visibly separate without a proof-inspection gesture", props: ["substantive work process", "expert work result", "clear separation from external observer"] },
  "signal-coherence": { cause: "Offer, profile, website, and content repeat one expertise cue instead of competing stories", action: "a visitor follows the same visual evidence cue across several distinct touchpoints", consequence: "the separate encounters combine into one credible impression", environment: "customer journey review with distinct profile, site, offer, and content touchpoints", composition: "four separate touchpoints share one visible evidence cue while unrelated cues remain absent", props: ["profile touchpoint", "website touchpoint", "focused offer artifact", "content example"] },
  "audience-fit-signal": { cause: "A broad message gives a mixed crowd no visible sign of fit while a specific cue matches one person's situation", action: "people pass the broad display; the intended person stops at the specific situation cue", consequence: "relevance becomes visible without asking the whole crowd to interpret the offer", environment: "public choice space with a mixed flow of people and two differently focused service displays", composition: "broad display recedes beside an uninterested crowd; one specific situation cue stops the intended person", props: ["broad undifferentiated display", "specific situation cue", "mixed crowd", "stopping gesture"] },
  "customer-context-interpretation": { cause: "Concrete details from the customer's situation guide the professional's explanation", action: "the professional arranges the customer's observed frustrations, priorities, and attempted solutions into one causal view", consequence: "the customer recognizes their own situation in the explanation", environment: "one-to-one discovery setting with physical evidence from the customer's real context", composition: "customer evidence in the foreground; professional groups cause, failed attempt, and consequence without readable labels", props: ["context evidence", "failed-attempt artifact", "visible consequence", "customer recognition gesture"] },
  "peer-referral": { cause: "A consistent expertise signal gives one person a concrete reason to introduce another", action: "one person points a peer toward the professional's matching work example", consequence: "the peer recognizes the relevance before the introduction is complete", environment: "small peer conversation beside a concrete work demonstration", composition: "introducing gesture connects peer, professional, and matching work evidence in one triangle", props: ["matching work example", "introducing gesture", "peer response"] },
};

export function deriveVeronicaSemanticProposition(input: { readonly scene: PlannedScene; readonly narration: string }): VeronicaSemanticProposition {
  const resolved = resolveMechanism(input.narration, input.scene.treatment);
  const narrationAnchors = selectNarrationAnchors(input.narration, resolved.anchors);
  const narrationClaim = narrationAnchors.map((span) => span.text).join(" ");
  const owner = actionOwner(input.scene, narrationClaim);
  const spanPolarities = narrationAnchors.map((span) => classifyVeronicaSemanticPolarity(span.text));
  const polarity = /\bidentity can change\b/iu.test(narrationClaim) && /\brecognition has to be earned\b/iu.test(narrationClaim)
    ? "CONTRAST"
    : spanPolarities[0] === "NEGATIVE_STATE" && spanPolarities.slice(1).some((value) => value === "POSITIVE_STATE")
    ? "TRANSITION_NEGATIVE_TO_POSITIVE"
    : classifyVeronicaSemanticPolarity(narrationClaim);
  const buyer = buyerConsequence(narrationClaim, resolved.mechanism, polarity);
  if (resolved.mechanism === "UNRESOLVED") {
    const base = { schemaVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION, narrationClaim, evidenceSpans: narrationAnchors, polarity, stateRelation: "STABLE" as const, actorRole: owner.role, actorAction: input.scene.treatment.action, consequence: input.scene.treatment.narrativeBeat, visualMechanism: "UNRESOLVED" as const, evidenceAnchors: narrationAnchors.map((span) => span.text), buyerConsequenceFamily: buyer.family, confidence: { proposition: "LOW" as const, actorOwnership: owner.confidence, consequence: buyer.confidence, visualMechanism: "LOW" as const } };
    return { ...base, propositionHash: stableHash(base) };
  }
  // Visual mechanisms are grammar selectors, never semantic templates.  Keep
  // the proposition's causal content anchored in the selected narration.
  const grounded = sourceGroundedCausalFields(narrationClaim, polarity);
  const cause = grounded.cause;
  const consequence = grounded.consequence;
  const contrast = grounded.contrast;
  const propositionBase = { schemaVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION, narrationClaim, evidenceSpans: narrationAnchors, polarity, stateRelation: grounded.stateRelation, cause, actorRole: owner.role, actorAction: narrationClaim, ...(buyer.value ? { buyerInterpretation: buyer.value } : {}), consequence, ...(contrast ? { contrast } : {}), ...( /\b(?:doorway|threshold|foothold)\b/iu.test(input.narration) ? { narrationNativeMetaphor: "doorway / threshold" } : {}), visualMechanism: resolved.mechanism, evidenceAnchors: narrationAnchors.map((span) => span.text), buyerConsequenceFamily: buyer.family, confidence: { proposition: resolved.confidence, actorOwnership: owner.confidence, consequence: buyer.value ? buyer.confidence : "MEDIUM" as const, visualMechanism: resolved.confidence } };
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
    CONNECTS: "the visitor follows one matching evidence cue across the profile, website, offer, and content",
    FAILS_TO_ACCUMULATE: "the observer places each unrelated signal in a separate cluster, leaving no recurring association to remember",
    REJECTS: "the intended person turns away because the visible condition does not match their situation",
  };
  const claim = input.proposition.narrationClaim;
  const signalSpecific = input.proposition.visualMechanism === "signal-coherence" && /\b(?:design portfolio|conversion strategist|three incompatible identities)\b/iu.test(`${claim} ${input.proposition.consequence}`)
    ? { environment: "cross-channel identity audit with profile, portfolio, and offer evidence", composition: "conversion-strategy profile at left, design-portfolio website at center, unrelated service cards at right; visitor caught between three incompatible clusters", props: ["strategy profile cue", "design portfolio evidence", "unrelated service cards"], action: "the visitor compares the profile, portfolio, and offer clusters but cannot place them under one expertise" }
    : input.proposition.visualMechanism === "signal-coherence" && /\b(?:twenty unrelated services|focused offer)\b/iu.test(claim)
      ? { environment: "offer-architecture review with one specialist promise and a spread of unrelated service artifacts", composition: "specialist promise isolated above a scattered field of unrelated service cards; one focused service group begins to replace the clutter", props: ["specialist promise cue", "unrelated service cards", "focused service group"], action: "the professional removes unrelated service cards until one problem-focused offer remains legible; a visitor points to the focused group and understands the specialist position" }
      : input.proposition.visualMechanism === "signal-coherence" && /\bten coherent signals\b/iu.test(claim)
        ? { environment: "recognition study with a compact coherent evidence cluster beside a much larger unrelated field", composition: "ten varied proofs converge on one expertise cue while fifty unrelated artifacts disperse without a center", props: ["coherent proof cluster", "dispersed unrelated artifacts", "single expertise cue"], action: "an observer groups the ten aligned signals around one remembered expertise while the larger unrelated field remains unconnected" }
        : input.proposition.visualMechanism === "signal-coherence" && /\bbuild the system around\b/iu.test(claim)
          ? { environment: "positioning system workspace with offer, profile, proof, public-context, and career-story artifacts", composition: "five distinct evidence stations form one connected system around a central expertise cue", props: ["offer artifact", "profile artifact", "proof result", "public-context evidence", "career-story evidence"], action: "the professional aligns each evidence station around the same expertise cue while an observer traces the complete system" }
          : undefined;
  const websiteSpecific = input.proposition.visualMechanism === "website-first-impression" && /\bentire career\b/iu.test(claim)
    ? { environment: "first-screen usability review with the rest of the career history deliberately out of view", composition: "one category cue dominates the opening screen while deeper career evidence remains beyond the frame", props: ["text-free opening screen", "single category cue", "visitor classification gesture"], action: "the visitor points to the category cue without needing to inspect the hidden career history" }
    : input.proposition.visualMechanism === "website-first-impression" && /\b(?:brutal test|show only the first screen|ask three questions)\b/iu.test(claim)
      ? { environment: "brief first-screen recall test with the website now covered", composition: "covered screen at one side; visitor reconstructs three remembered visual cues for audience, problem, and offer", props: ["covered website screen", "three text-free recall objects", "visitor recall gesture"], action: "after the screen is hidden, the visitor sorts three remembered cues for audience, problem, and offer" }
      : input.proposition.visualMechanism === "website-first-impression" && /\binterpretation work\b/iu.test(claim)
        ? { environment: "website comprehension review with unresolved opening-screen fragments", composition: "visitor pauses between three disconnected page cues that fail to form one category", props: ["disconnected opening-screen cues", "unresolved category object", "visitor hesitation gesture"], action: "the visitor moves between vague page cues but cannot assemble a clear audience, problem, and offer" }
        : undefined;
  const marketSpecific = input.proposition.visualMechanism === "market-problem-solution-chain" && /\brecognize the problem before\b/iu.test(claim)
    ? { environment: "buyer decision table with lived problem evidence foregrounded before a response prototype", composition: "buyer touches the recognized problem evidence in the foreground; the matching response waits directly behind it", props: ["recognized problem evidence", "matching response prototype", "buyer recognition gesture"], action: "the buyer points to the lived problem evidence before reaching for the matching response" }
    : undefined;
  const identitySpecific = input.proposition.visualMechanism === "identity-bridge" && /\bidentity can change\b/iu.test(claim) && /\brecognition has to be earned\b/iu.test(claim)
    ? { environment: "market-recognition review with a new role marker and a growing sequence of proof encounters", composition: "new role marker appears instantly at left; separate work-evidence encounters accumulate toward a market observer at right", props: ["new role marker without readable text", "repeated work evidence", "market observer recognition gesture"], action: "the professional adopts the new role immediately while the observer withholds recognition until repeated proof artifacts form a consistent sequence" }
    : undefined;
  const listedClauses = claim.includes(":")
    ? claim.slice(claim.indexOf(":") + 1).split(/,\s+|\s+and\s+/u).map((clause) => clause.trim()).filter(Boolean)
    : [];
  const enumeratedPlanSpecific = listedClauses.length >= 3
    ? { environment: "implementation planning workspace connecting concrete component artifacts to their relevant contexts", composition: "distinct component artifacts form one coordinated plan around a shared problem cue", props: ["distinct plan-component artifacts", "shared problem cue", "text-free coordination timeline"], action: "the professional arranges one concrete artifact for each narrated plan component around the same problem cue while an observer traces the coordinated plan" }
    : undefined;
  const specificVisual = signalSpecific ?? websiteSpecific ?? marketSpecific ?? identitySpecific ?? enumeratedPlanSpecific;
  const claimSpecificAction = input.proposition.visualMechanism === "signal-coherence" && input.proposition.actorRole === "expert"
    ? "the professional aligns distinct offer, profile, proof, and public-context artifacts around one shared expertise cue while an observer follows the connection"
    : /\b(?:first month|recurring content themes?|regular participation)\b/iu.test(claim)
    ? "the professional groups one defined offer, recurring content themes, and participation evidence around the same problem"
    : /\b(?:test|questions?|answer is yes|answer is no)\b/iu.test(claim)
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
              : /\b(?:audience reach the conclusion|without being instructed)\b/iu.test(claim)
                ? "the observer inspects a work example, reasoning artifact, and result, then independently points to the expertise they prove"
                : /\b(?:other people start using the label|other people begin to describe)\b/iu.test(claim)
                  ? "a peer points to the professional's repeated proof and introduces them using the earned expertise association"
              : undefined;
  const consequenceAction = consequenceActions[input.proposition.buyerConsequenceFamily];
  const concreteAction = specificVisual?.action ?? (claimSpecificAction
    ? `${claimSpecificAction}${consequenceAction ? `; ${consequenceAction}` : ""}`
    : consequenceAction ? `${visual.action}; ${consequenceAction}` : visual.action);
  const thesis = input.proposition.narrationNativeMetaphor
    ? /\bwiden\w*\b/iu.test(input.proposition.narrationClaim)
      ? "Recognition lets the professional widen the doorway for adjacent customers with the same underlying expertise."
      : /\bfoothold\b/iu.test(input.proposition.narrationClaim)
      ? "A niche gives the intended audience a stable foothold at a visible doorway."
      : "A specific doorway gives the intended audience a visible point of entry while leaving wider paths accessible beyond it."
    : renderVeronicaVisibleThesis(input.proposition);
  if (input.proposition.narrationNativeMetaphor) {
    const foothold = /\bfoothold\b/iu.test(input.proposition.narrationClaim);
    const widening = /\bwiden\w*\b/iu.test(input.proposition.narrationClaim);
    return { narrativeBeat: thesis, subjectRequirement: "professional and intended audience with visually distinct roles", environment: "public threshold with a focused entrance and visibly open routes beyond", composition: widening ? "adjacent intended people arrive at the focused threshold as the professional visibly widens it" : foothold ? "the intended person gains a stable foothold at the focused entrance while wider routes remain visible beyond" : "the intended person stops at the focused entrance while wider accessible paths remain visible beyond the threshold", camera: "documentary eye-level view with the choice point and open continuation legible in one frame", action: widening ? "the professional widens the established doorway as adjacent intended people arrive" : foothold ? "the intended person steadies at the specific doorway while the professional keeps the wider routes visibly open" : "the intended person enters through the specific doorway while the professional keeps the wider routes visibly open", actionOwnerRole: widening ? "expert" : "buyer", props: ["specific open doorway", "intended audience cue", "wider paths beyond"], diagram: null, strategy: "client-decision" };
  }
  const expertClaimContrast = input.proposition.actorRole === "expert"
    && input.proposition.visualMechanism === "claim-to-proof"
    && (input.proposition.polarity === "NEGATIVE_STATE" || input.proposition.polarity === "CONTRAST" || input.proposition.polarity === "TRANSITION_POSITIVE_TO_NEGATIVE");
  const negativeAction = expertClaimContrast
    ? "the professional presents a new title marker while the observer withholds recognition and turns toward the missing work evidence"
    : input.proposition.polarity === "NEGATIVE_STATE"
    ? input.proposition.visualMechanism === "recognition-accumulation"
      ? "the observer sorts each newly changed theme into a separate cluster, leaving no repeated expertise cue"
      : input.proposition.visualMechanism === "signal-coherence" || input.proposition.visualMechanism === "website-first-impression"
        ? "the visitor looks between conflicting profile, website, and offer cues without finding one matching category"
        : concreteAction
    : concreteAction;
  const negativeComposition = input.proposition.polarity === "NEGATIVE_STATE" && input.proposition.visualMechanism === "signal-coherence"
    ? "profile, website, offer, and content occupy visibly separate identity clusters; visitor gaze moves between them without a shared cue"
    : input.proposition.polarity === "NEGATIVE_STATE" && input.proposition.visualMechanism === "recognition-accumulation"
      ? "separate evidence clusters point in different directions with no repeated cue connecting them"
      : input.proposition.polarity === "NEGATIVE_STATE" && input.proposition.visualMechanism === "claim-to-proof"
        ? "a new title marker stands alone beside visibly empty proof stations while the observer withholds recognition"
      : visual.composition;
  const negativeProps = input.proposition.polarity === "NEGATIVE_STATE"
    ? input.proposition.visualMechanism === "claim-to-proof"
      ? ["new title marker without readable text", "empty proof stations", "observer withholding gesture"]
      : input.proposition.visualMechanism === "signal-coherence"
        ? ["conflicting profile cue", "unrelated website cue", "undifferentiated offer artifacts", "disconnected content cue"]
        : visual.props
    : visual.props;
  const baseVisibleOwner = resolveVeronicaVisiblePrimaryActionOwner({ ...input.scene.treatment, action: visual.action });
  const action = input.proposition.polarity === "NEGATIVE_STATE"
    ? negativeAction
    : input.proposition.actorRole === "buyer" && consequenceAction
      ? baseVisibleOwner === "buyer" ? concreteAction : consequenceAction
      : specificVisual?.action ?? negativeAction;
  const samePropositionRevision = input.scene.treatment.sourcePropositionHash === input.proposition.propositionHash;
  return {
    narrativeBeat: thesis,
    subjectRequirement: input.proposition.actorRole === "none" ? "people responding to two simultaneous visible conditions" : "professional and relevant observer with visually distinct roles",
    environment: input.preserveEnvironment && samePropositionRevision ? input.scene.treatment.environment : specificVisual?.environment ?? visual.environment,
    composition: input.proposition.polarity === "NEGATIVE_STATE" ? negativeComposition : specificVisual?.composition ?? negativeComposition,
    camera: "documentary eye-level view with the evidence, action, and visible response legible in one frame",
    action,
    actionOwnerRole: input.proposition.actorRole,
    props: input.proposition.polarity === "NEGATIVE_STATE" ? negativeProps : specificVisual?.props ?? negativeProps,
    diagram: null,
    strategy: input.proposition.visualMechanism === "peer-referral" || input.proposition.visualMechanism === "relevant-context-participation" ? "social-interaction" : input.proposition.visualMechanism === "audience-fit-signal" || input.proposition.visualMechanism === "problem-first-sequence" ? "client-decision" : "evidence-proof",
  };
}

export function assessVeronicaPropositionInternalCoherence(proposition: VeronicaSemanticProposition): { readonly status: "PASS" | "FAIL"; readonly reasons: readonly string[] } {
  const explicitOutcome = `${proposition.consequence} ${proposition.contrast?.failureState ?? ""} ${proposition.contrast?.consequence ?? ""}`;
  const outcomePolarity = classifyVeronicaSemanticPolarity(explicitOutcome);
  const negativeOutcome = outcomePolarity === "NEGATIVE_STATE" || outcomePolarity === "CONTRAST" || outcomePolarity === "TRANSITION_POSITIVE_TO_NEGATIVE";
  const positiveOutcome = outcomePolarity === "POSITIVE_STATE" || outcomePolarity === "TRANSITION_NEGATIVE_TO_POSITIVE";
  const reasons = [
    ...(proposition.polarity === "NEGATIVE_STATE" && positiveOutcome && !negativeOutcome ? ["negative-polarity-positive-explicit-outcome"] : []),
    ...(proposition.polarity === "POSITIVE_STATE" && negativeOutcome && !positiveOutcome ? ["positive-polarity-negative-explicit-outcome"] : []),
    ...(proposition.polarity === "NEGATIVE_STATE" && !negativeOutcome ? ["negative-polarity-missing-negative-consequence"] : []),
    ...(proposition.polarity === "TRANSITION_NEGATIVE_TO_POSITIVE" && (!proposition.contrast?.initialState || !proposition.contrast.desiredState) ? ["transition-missing-contrast-states"] : []),
    ...(proposition.stateRelation === "STABLE" && proposition.contrast ? ["stable-relation-has-multiple-states"] : []),
    ...(proposition.stateRelation !== "STABLE" && proposition.contrast?.relation !== proposition.stateRelation ? ["state-relation-does-not-match-structured-states"] : []),
  ];
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

export function assessVeronicaTreatmentPropositionCompatibility(input: { readonly treatment: PositioningVisualTreatment; readonly proposition: VeronicaSemanticProposition; readonly narration: string; readonly episodeMotifSupported?: boolean }): { readonly status: "PASS" | "FAIL"; readonly reasons: readonly string[] } {
  const visual = `${input.treatment.environment} ${input.treatment.composition} ${input.treatment.action} ${input.treatment.props.join(" ")}`;
  const mechanismChecks: Partial<Record<Exclude<Mechanism, "UNRESOLVED">, RegExp>> = {
    "website-first-impression": /\b(?:website|site|screen|page|visitor|usability)\b/iu,
    "signal-coherence": /\b(?:profile|website|offer|content|touchpoint|signal|identity|coherent|aligned|expertise cue|evidence cluster|proof cluster)\b/iu,
    "recognition-accumulation": /\b(?:evidence|proof|signal|association|cluster|reputation|recurring)\b/iu,
    "identity-bridge": /\b(?:prior|past|new role|transferable|identity|career|work evidence)\b/iu,
    "relevant-context-participation": /\b(?:participant|conversation|roundtable|demonstration|event|contexts?)\b/iu,
    "audience-fit-signal": /\b(?:broad|specific|audience|crowd|fit|message|relevance)\b/iu,
    "customer-context-interpretation": /\b(?:customer|context|frustration|priority|situation|explanation)\b/iu,
    "claim-to-proof": /\b(?:proof|evidence|work example|result|reasoning)\b/iu,
    "work-expertise-separation": /\b(?:professional work|work process|substantive work|expert result|actual expertise|external observer|external recognition)\b/iu,
    "market-problem-solution-chain": /\b(?:market|problem|response|solution|group)\b/iu,
    "problem-first-sequence": /\b(?:problem|package|feature|response|customer)\b/iu,
    "peer-referral": /\b(?:peer|refer|introduc|recommend)\b/iu,
  };
  const expected = input.proposition.visualMechanism === "UNRESOLVED" ? undefined : mechanismChecks[input.proposition.visualMechanism];
  const staleWebsiteEnvironment = input.proposition.visualMechanism === "website-first-impression" && /\b(?:podcast|booth|stage|backstage|interview|microphone|camera rig)\b/iu.test(visual) && !/\b(?:podcast|booth|stage|backstage|interview)\b/iu.test(input.narration);
  const unsupportedDoorway = /\b(?:doorway|threshold|foothold|future paths?)\b/iu.test(visual) && !/\b(?:doorway|threshold|foothold)\b/iu.test(input.narration) && !input.proposition.narrationNativeMetaphor && !input.episodeMotifSupported;
  const visualPolarity = classifyVeronicaSemanticPolarity(visual);
  const polarityMismatch = (input.proposition.polarity === "NEGATIVE_STATE" && visualPolarity === "POSITIVE_STATE")
    || (input.proposition.polarity === "POSITIVE_STATE" && visualPolarity === "NEGATIVE_STATE");
  const transitionStuckInWrongState = input.proposition.polarity === "TRANSITION_NEGATIVE_TO_POSITIVE" && visualPolarity === "NEGATIVE_STATE";
  const orderedStates = input.proposition.contrast;
  const actionWords = normalize(input.treatment.action).split(" ");
  const firstStatePosition = (value: string | undefined): number => {
    const indexes = contentTokens(value ?? "").map((token) => actionWords.indexOf(token)).filter((index) => index >= 0);
    return indexes.length > 0 ? Math.min(...indexes) : -1;
  };
  const initialPosition = firstStatePosition(orderedStates?.initialState);
  const desiredPosition = firstStatePosition(orderedStates?.desiredState);
  const causalOrderInverted = (input.proposition.stateRelation === "CAUSAL_BEFORE_AFTER" || input.proposition.stateRelation === "SEQUENTIAL_PROGRESSION")
    && initialPosition >= 0 && desiredPosition >= 0 && desiredPosition < initialPosition;
  const reasons = [
    ...(expected && !expected.test(visual) ? ["visual-fields-do-not-support-mechanism"] : []),
    ...(staleWebsiteEnvironment ? ["stale-environment-for-website-mechanism"] : []),
    ...(unsupportedDoorway ? ["unsupported-doorway-motif"] : []),
    ...(polarityMismatch ? ["treatment-polarity-mismatch"] : []),
    ...(transitionStuckInWrongState ? ["transition-treatment-stuck-in-negative-state"] : []),
    ...(causalOrderInverted ? ["treatment-causal-order-inversion"] : []),
  ];
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
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
    explicit: thesis.length >= 20,
    linguisticSanity: thesis.length <= 420 && !internalLanguage.test(thesis) && !malformedCauseTemplate.test(thesis) && !/\b(?:scene|causal step|narrated claim)\b/iu.test(thesis) && visibleThesisStructuralReasons(thesis).length === 0,
    finitePredicate: finitePredicate.test(thesis),
    narrationGrounded: overlap >= 1 || Boolean(input.proposition && input.proposition.confidence.proposition === "HIGH"),
    visuallyExpressible: !abstractOnly.test(thesis) && /\b(?:person|people|customer|visitor|observer|professional|message|screen|display|evidence|artifact|problem|response|offer|profile|website|work|signal|crowd|peer|participant|page|proof|result|route|doorway|threshold)\b/iu.test(`${thesis} ${input.treatment.action} ${input.treatment.props.join(" ")}`),
    sceneSpecific: !/\b(?:changes the available evidence|recognizes the consequence|chooses accordingly|concrete occupation-neutral evidence pattern)\b/iu.test(`${thesis} ${input.treatment.action}`),
    distinctFromPrevious: !input.previousThesis || normalize(input.previousThesis) !== normalize(thesis),
  } as const;
  const reasons = Object.entries(checks).flatMap(([name, passed]) => passed ? [] : [name]);
  return { checks, score: Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100) / 100, reasons };
}

/**
 * Independent final grounding check.  This deliberately does not use a visual
 * strategy as evidence: a strategy may shape a treatment only after the
 * narration proposition is established.
 */
export function assessVeronicaSourceGroundedSemanticConsistency(input: {
  readonly narration: string;
  readonly proposition: VeronicaSemanticProposition;
  readonly treatment: PositioningVisualTreatment;
  readonly visibleThesis: string | undefined;
  readonly providerPrompt?: string;
}): { readonly status: "PASS" | "FAIL"; readonly reasons: readonly string[] } {
  const narration = input.narration.trim();
  const claim = input.proposition.narrationClaim.trim();
  const evidenceMatchesSource = input.proposition.evidenceSpans.length > 0
    && input.proposition.evidenceSpans.every((span) => narration.slice(span.startOffset, span.endOffset) === span.text || narration.includes(span.text));
  const source = `${narration} ${claim}`;
  const sourceTokens = new Set(contentTokens(source));
  const causalFieldHasSourceAnchor = (value: string | undefined): boolean => !value || contentTokens(value).some((token) => sourceTokens.has(token));
  const causalFieldSourceOverlap = (value: string | undefined): number => value ? contentTokens(value).filter((token) => sourceTokens.has(token)).length : 0;
  // Provider framing (camera, environment, props and generic action grammar)
  // can add a compatible visual grammar.  Causal fields must remain anchored
  // to the independently selected narration evidence, rather than to that
  // reusable framing.
  const visibleOwner = resolveVeronicaVisiblePrimaryActionOwner(input.treatment);
  const reasons = [
    ...(!evidenceMatchesSource ? ["evidence-spans-do-not-match-selected-narration"] : []),
    ...(normalize(claim) && !normalize(narration).includes(normalize(claim)) ? ["narration-claim-not-selected-source"] : []),
    ...(!causalFieldHasSourceAnchor(input.proposition.cause) ? ["cause-lacks-source-anchor"] : []),
    ...(!causalFieldHasSourceAnchor(input.proposition.consequence) ? ["consequence-lacks-source-anchor"] : []),
    ...(input.visibleThesis && causalFieldSourceOverlap(input.visibleThesis) < (input.proposition.narrationNativeMetaphor ? 1 : 2) ? ["visible-thesis-lacks-source-anchor"] : []),
    ...((visibleOwner !== undefined && input.treatment.actionOwnerRole !== undefined && visibleOwner !== input.treatment.actionOwnerRole) ? ["stale-action-owner-role"] : []),
    ...((visibleOwner !== undefined && visibleOwner !== input.proposition.actorRole) ? ["semantic-actor-role-disagrees-with-visible-primary-action"] : []),
  ];
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

export function providerPromptInternalLanguageReasons(prompt: string): readonly string[] {
  return [
    ...(internalLanguage.test(prompt) ? ["internal-remediation-language"] : []),
    ...(/\b(?:sequence asset|causal role|state condition|state action|state evidence|observer response|multi-asset sequence required|manual review required)\b/iu.test(prompt) ? ["internal-projection-language"] : []),
    ...(/MISSING\s+[—-]\s+PROVIDER PROJECTION BLOCKED/iu.test(prompt) ? ["missing-thesis-marker"] : []),
    ...(/\b(?:placeholder|todo|tbd)\b/iu.test(prompt) || /\bUNRESOLVED\b/u.test(prompt) ? ["unresolved-placeholder"] : []),
    ...providerPromptLexicalIntegrityReasons(prompt),
  ];
}

export function providerPromptLexicalIntegrityReasons(prompt: string): readonly string[] {
  const visibleThesis = prompt.match(/Visible thesis:\s*([^\n]*?)(?=\s+(?:No readable|Render this|Capture |Prior context:|Primary actor:|Current action:|Emerging consequence:|$))/iu)?.[1]?.trim() ?? "";
  const openCurlyQuotes = (prompt.match(/“/gu) ?? []).length;
  const closeCurlyQuotes = (prompt.match(/”/gu) ?? []).length;
  return [
    ...(/\b(?:a|the)\s+-\w+/iu.test(prompt) ? ["orphaned-hyphen"] : []),
    ...(/Visible thesis:\s*:/iu.test(prompt) ? ["malformed-visible-thesis-colon"] : []),
    ...(/Visible thesis:\s*(?:[.!?]|$)/iu.test(prompt) ? ["empty-visible-thesis"] : []),
    ...(/(?:^|\s):\s+[a-z]/u.test(prompt) ? ["dangling-colon"] : []),
    ...(/(?<!\.)\.\.(?!\.)|!!|\?\?|::/u.test(prompt) ? ["duplicated-punctuation"] : []),
    ...(/\b(?:a|an|the)\s+(?:,|;|\.|:)/iu.test(prompt) ? ["empty-noun-phrase"] : []),
    ...(/(?:Current action|State action):[^.]*\b(?:while|and|before|after)\s*(?:[.;]|$)/iu.test(prompt) ? ["dangling-action-conjunction"] : []),
    ...(/\bwhile\s+(?:independently\s+)?(?:points?|inspects?|compares?|traces?)\b/iu.test(prompt) && !/\bwhile\s+(?:the\s+)?(?:buyer|visitor|customer|observer|professional|expert|person|peer)\b/iu.test(prompt) ? ["actorless-action-conjunction"] : []),
    ...visibleThesisStructuralReasons(visibleThesis),
    ...(openCurlyQuotes !== closeCurlyQuotes ? ["unbalanced-quotation-boundary"] : []),
  ];
}

export function visibleThesisStructuralReasons(thesis: string): readonly string[] {
  const clauses = thesis.split(/\s*;\s*/u).map((clause) => normalize(clause.replace(/^(?:visible thesis|comparison|alternative [ab]|before|after|result):\s*/iu, ""))).filter(Boolean);
  const duplicates = clauses.some((clause, index) => clauses.indexOf(clause) !== index);
  return [
    ...(duplicates ? ["duplicated-visible-thesis-clause"] : []),
    ...(/\b(?:when|before|after)\s+(?:if|when|before|after)\b/iu.test(thesis) ? ["nested-semantic-transition-introducer"] : []),
    ...(/(?:^|[.;])\s*(?:when|before|after|if)\s+(?:it is|this is|that is)\b/iu.test(thesis) ? ["copied-complete-clause-in-transition-slot"] : []),
  ];
}
