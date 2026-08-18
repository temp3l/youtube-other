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

export const VERONICA_SEMANTIC_PROPOSITION_VERSION = "veronica-semantic-proposition.v4" as const;
export const VERONICA_PROVIDER_PROMPT_QUALITY_VERSION = "veronica-provider-prompt-quality.v3" as const;
export const VERONICA_TREATMENT_COMPATIBILITY_VERSION = "veronica-treatment-proposition-compatibility.v2" as const;
export const VERONICA_PROMPT_SANITATION_VERSION = "veronica-provider-prompt-sanitation.v2" as const;

type Mechanism = VeronicaSemanticProposition["visualMechanism"];

type VeronicaSemanticPropositionDraft = Omit<
  VeronicaSemanticProposition,
  | "schemaVersion"
  | "semanticSubject"
  | "causalRelationship"
  | "stateModel"
  | "affectedParty"
  | "buyerPerspective"
  | "requiredVisibleConsequence"
  | "visualAuthorization"
  | "visualEncodingConstraints"
  | "semanticRevisionHash"
  | "propositionHash"
>;

function isConservativeVisualMechanism(mechanism: Mechanism): boolean {
  return mechanism === "quantity-comparison"
    || mechanism === "input-output-flow"
    || mechanism === "retained-remainder"
    || mechanism === "workload-accumulation"
    || mechanism === "scaling-relation";
}

const internalLanguage = /\b(?:tied to the narrated|at causal step|recognizes? the consequence|chooses? accordingly|changes? the available evidence|occupation-neutral evidence and comparison setting|the narrated claim|weaker condition|stronger condition|semantic(?:[- ](?:gate|remediation|quality))?|remediation|validator)\b/iu;
const malformedCauseTemplate = /^because\s+.+\s+changes?\s+the\s+available\s+evidence\b/iu;
const finitePredicate = /\b(?:is|are|has|have|do(?:es)?|need(?:s)?|want(?:s)?|ask(?:s)?|must|may|should|will|means?|can|know\w*|begin\w*|continue\w*|write\w*|click\w*|read\w*|tell\w*|collapse\w*|introduc\w*|gives?|makes?|shows?|lets?|leaves?|connects?|reinforces?|builds?|creates?|reduces?|keeps?|becomes?|remains?|sits?|scans?|stops?|ignores?|notices?|recognizes?|remembers?|categorizes?|understands?|trusts?|hesitates?|chooses?|commits?|crosses?|opens?|refers?|enters?|follows?|compares?|points?|accumulates?|supports?|weakens?|strengthens?|explains?|demonstrates?|reveals?|matches?|fits?|presents?|identif\w*|repeats?|combines?|forms?|aligns?|moves?|arranges?|groups?|places?|takes?|inspects?|traces?|contributes?|uses?|arriv\w*|widen\w*|rescues?|subtracts?|calculates?|pays?|sells?|increases?|grows?|doubles?|produces?|ships?)\b/iu;
const abstractOnly = /^(?:positioning|clarity|evidence|expertise|recognition|relevance|value|trust|growth|success|transformation)[\s,;/&-]*$/iu;
const stopWords = new Set(["about", "after", "again", "because", "before", "being", "could", "every", "from", "have", "into", "just", "more", "only", "other", "should", "than", "that", "their", "them", "then", "there", "these", "they", "this", "through", "when", "where", "which", "while", "with", "would", "your"]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function contentTokens(value: string): readonly string[] {
  return [...new Set(normalize(value).split(" ").filter((word) => word.length >= 4 && !stopWords.has(word)))];
}

function semanticSubjectFromClaim(claim: string): string {
  const subject = claim.match(/^(.{1,120}?)\b(?:is|are|has|have|does|needs?|wants?|asks?|must|can|means?|makes?|shows?|lets?|removes?|moves?|places?|compares?|chooses?|selects?|creates?|becomes?|remains?)\b/iu)?.[1]?.trim();
  return subject || claim.split(/[.!?…]/u)[0]!.trim();
}

function stateModelFromDraft(
  draft: VeronicaSemanticPropositionDraft,
): VeronicaSemanticProposition["stateModel"] {
  if (draft.stateRelation === "STABLE") {
    return { kind: "SINGLE_STATE", relation: "STABLE", state: draft.consequence };
  }
  const initialState = draft.contrast?.initialState ?? draft.cause ?? draft.narrationClaim;
  const resultingState = draft.contrast?.desiredState ?? draft.contrast?.consequence ?? draft.consequence;
  if (draft.stateRelation === "CAUSAL_BEFORE_AFTER" || draft.stateRelation === "CONTRAST") {
    return { kind: "DECISIVE_TRANSITION", relation: draft.stateRelation, initialState, resultingState };
  }
  return {
    kind: "MULTI_STATE_SEQUENCE",
    relation: draft.stateRelation,
    states: [initialState, resultingState],
  };
}

function sourceAuthorizationEntries(
  draft: VeronicaSemanticPropositionDraft,
): VeronicaSemanticProposition["visualAuthorization"] {
  const spanHashes = draft.evidenceSpans.map((span) => span.spanHash);
  const source = draft.evidenceSpans.map((span) => span.text).join(" ");
  const entities: Array<VeronicaSemanticProposition["visualAuthorization"]["entities"][number]> = [];
  if (draft.actorRole !== "none") {
    entities.push({
      concept: draft.actorRole,
      authority: "SEMANTIC_ROLE",
      evidenceSpanHashes: spanHashes,
      semanticRole: draft.actorRole,
    });
  }
  if (draft.buyerInterpretation || draft.buyerConsequenceFamily !== "NONE") {
    entities.push({
      concept: "buyer",
      authority: "SEMANTIC_ROLE",
      evidenceSpanHashes: spanHashes,
      semanticRole: "buyer",
    });
  }
  for (const concept of ["customer", "visitor", "professional"] as const) {
    if (new RegExp(`\\b${concept}\\b`, "iu").test(source)) {
      entities.push({ concept, authority: "SOURCE_SPAN", evidenceSpanHashes: spanHashes });
    }
  }
  const motifFamily = ["doorway", "threshold", "foothold"] as const;
  const sourceMotifs = motifFamily.filter((concept) => new RegExp(`\\b${concept}\\b`, "iu").test(source));
  const motifs = sourceMotifs.length === 0
    ? []
    : motifFamily.map((concept) => ({
        concept,
        authority: sourceMotifs.includes(concept) ? "SOURCE_SPAN" as const : "ENCODING_MECHANISM" as const,
        evidenceSpanHashes: spanHashes,
      }));
  return {
    entities,
    environments: [],
    motifs,
    allowedEncodingMechanisms: draft.visualMechanism === "UNRESOLVED"
      ? []
      : [draft.visualMechanism],
  };
}

export function finalizeVeronicaSemanticProposition(
  draft: VeronicaSemanticPropositionDraft,
): VeronicaSemanticProposition {
  const spanHashes = draft.evidenceSpans.map((span) => span.spanHash);
  const stateModel = stateModelFromDraft(draft);
  const buyerPerspective = draft.buyerInterpretation || draft.buyerConsequenceFamily !== "NONE"
    ? {
        role: "buyer" as const,
        interpretation: draft.buyerInterpretation ?? draft.consequence,
        consequenceFamily: draft.buyerConsequenceFamily,
        evidenceSpanHashes: spanHashes,
      }
    : undefined;
  const finalizedWithoutHash = {
    schemaVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION,
    narrationClaim: draft.narrationClaim,
    evidenceSpans: draft.evidenceSpans,
    semanticSubject: {
      description: semanticSubjectFromClaim(draft.narrationClaim),
      evidenceSpanHashes: spanHashes,
    },
    polarity: draft.polarity,
    stateRelation: draft.stateRelation,
    ...(draft.cause ? { cause: draft.cause } : {}),
    causalRelationship: {
      relation: draft.stateRelation,
      cause: draft.cause ?? draft.narrationClaim,
      consequence: draft.consequence,
    },
    stateModel,
    actorRole: draft.actorRole,
    actorAction: draft.actorAction,
    ...(draft.buyerInterpretation ? { buyerInterpretation: draft.buyerInterpretation } : {}),
    ...(buyerPerspective ? {
      affectedParty: { role: "buyer" as const, evidenceSpanHashes: spanHashes },
      buyerPerspective,
    } : {}),
    consequence: draft.consequence,
    requiredVisibleConsequence: draft.consequence,
    ...(draft.contrast ? { contrast: draft.contrast } : {}),
    ...(draft.narrationNativeMetaphor ? { narrationNativeMetaphor: draft.narrationNativeMetaphor } : {}),
    visualMechanism: draft.visualMechanism,
    evidenceAnchors: draft.evidenceAnchors,
    buyerConsequenceFamily: draft.buyerConsequenceFamily,
    confidence: draft.confidence,
    visualAuthorization: sourceAuthorizationEntries(draft),
    visualEncodingConstraints: {
      textFree: true as const,
      neutralObserver: Boolean(buyerPerspective)
        || /\b(?:observer|visitor|customer|buyer|person|people|participant|peer)\b/iu.test(draft.narrationClaim)
        || ["claim-to-proof", "recognition-accumulation", "work-expertise-separation", "peer-referral"].includes(draft.visualMechanism)
        ? "AUTHORIZED" as const
        : "FORBIDDEN" as const,
      stateEncoding: stateModel.kind === "SINGLE_STATE"
        ? "SINGLE_FRAME" as const
        : stateModel.kind === "DECISIVE_TRANSITION"
          ? "DECISIVE_TRANSITION" as const
          : "SEQUENCE_REQUIRED" as const,
    },
  };
  const semanticRevisionHash = stableHash(finalizedWithoutHash);
  return {
    ...finalizedWithoutHash,
    semanticRevisionHash,
    propositionHash: semanticRevisionHash,
  };
}

export function isFinalizedVeronicaSemanticProposition(
  value: unknown,
): value is VeronicaSemanticProposition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate["schemaVersion"] === VERONICA_SEMANTIC_PROPOSITION_VERSION
    && typeof candidate["semanticRevisionHash"] === "string"
    && candidate["semanticRevisionHash"] === candidate["propositionHash"]
    && typeof candidate["stateModel"] === "object"
    && candidate["stateModel"] !== null
    && typeof candidate["visualAuthorization"] === "object"
    && candidate["visualAuthorization"] !== null;
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
  { mechanism: "workload-accumulation", pattern: /\b(?:workload|support load|labor|effort)\b.{0,100}\b(?:double|grow|increase|volume|sales?)\b|\b(?:double|grow|increase)\b.{0,100}\b(?:workload|support load|labor|effort)\b/iu, anchors: ["workload", "sales", "volume", "double", "margin", "growth"] },
  { mechanism: "input-output-flow", pattern: /\b(?:subtract|production|payment fees?|commissions?|shipping|support|refunds?|variable costs?|customer pays)\b|\bone sale\b.{0,100}\b(?:start to finish|customer pays|cost)\b/iu, anchors: ["sale", "customer pays", "subtract", "production", "payment", "commission", "shipping", "support", "refund", "cost"] },
  { mechanism: "retained-remainder", pattern: /\b(?:what remains|leaves behind|retained|margin)\b|\b(?:revenue|payment|euros?)\b.{0,120}\b(?:goes? .* out|margin|remains?|leaves? behind)\b/iu, anchors: ["revenue", "margin", "payment", "remains", "leaves behind", "sale"] },
  { mechanism: "scaling-relation", pattern: /\b(?:sales?|orders?|volume)\b.{0,120}\b(?:double|doubled|grows?|higher|healthier|economics still work|scal|problem bigger)\b|\b(?:double|doubled|grows?|higher|more)\b.{0,120}\b(?:sales?|orders?|volume|economics)\b/iu, anchors: ["sales", "orders", "volume", "double", "healthier", "economics", "grows", "problem bigger"] },
  { mechanism: "quantity-comparison", pattern: /\b(?:more|less|large|small|higher|lower|most|almost no)\b.{0,100}\b(?:revenue|margin|orders?|sales?|value|volume)\b/iu, anchors: ["revenue", "margin", "orders", "sales", "value", "volume"] },
  { mechanism: "website-first-impression", pattern: /\b(?:first screen|opening screen|five seconds|web page)\b|\b(?:website|site|profile|bio)\b.{0,100}\b(?:visitor|first-time|category|opening|screen|five seconds|interpretation)\b/iu, anchors: ["website", "site", "screen", "visitor", "profile", "bio", "category"] },
  { mechanism: "market-problem-solution-chain", pattern: /\b(?:market).{0,100}\bproblem\b|\bproblem\b.{0,120}\bsolution\b|three questions/iu, anchors: ["market", "problem", "solution", "group", "question", "position"] },
  { mechanism: "problem-first-sequence", pattern: /\b(?:package|method|feature).{0,100}\b(?:problem|customer)\b|reverse the (?:order|sequence)/iu, anchors: ["package", "method", "feature", "problem", "customer", "sequence"] },
  { mechanism: "identity-bridge", pattern: /\b(?:past|previous|transferable|professional story|new professional identity|changing direction|evolution)\b/iu, anchors: ["past", "previous", "skills", "story", "identity", "credible", "evolution"] },
  { mechanism: "relevant-context-participation", pattern: /\b(?:events?|conversations?|show up|participat|places where|environments? where|sector)\b/iu, anchors: ["event", "conversation", "participation", "context", "relevant", "sector", "people"] },
  { mechanism: "recognition-accumulation", pattern: /\b(?:recognition|remember|repetition|accumulat|association|reputation|connect the dots|consistent signals?)\b/iu, anchors: ["recognition", "remember", "repetition", "accumulation", "association", "reputation", "signals", "consistent"] },
  { mechanism: "claim-to-proof", pattern: /\b(?:expert|authority|claim|evidence|proof|believ|credib|uncertainty|outcome|case stud)\b/iu, anchors: ["expert", "authority", "claim", "evidence", "proof", "credible", "outcome", "uncertainty"] },
  { mechanism: "promise-value-translation", pattern: /\bpromise\b.{0,100}\b(?:creative slogan|translation of value)\b|\btranslation of value\b/iu, anchors: ["promise", "creative slogan", "translation", "value"] },
  { mechanism: "description-to-outcome-framing", pattern: /\b(?:technical description|force all four into one sentence)\b/iu, anchors: ["technical description", "four", "sentence", "framework"] },
  { mechanism: "expectation-delivery-check", pattern: /\b(?:real experience|experience)\b.{0,100}\b(?:deliver|fulfill|meet)\b.{0,100}\bexpectation\b|\bexpectation\b.{0,100}\b(?:real experience|experience)\b/iu, anchors: ["experience", "deliver", "expectation", "result"] },
  { mechanism: "promise-calibration", pattern: /\b(?:louder|stronger|more honest)\s+promise\b|\bbetter product\b/iu, anchors: ["promise", "honest", "product"] },
  { mechanism: "promise-experience-alignment", pattern: /\bpromise\b.{0,100}\bstandard\b.{0,160}\b(?:message|experience)\b|\bmessage\b.{0,100}\bexperience\b.{0,100}\b(?:support|cannot|can't)\b/iu, anchors: ["promise", "standard", "message", "experience", "support", "trust"] },
  { mechanism: "reality-bounded-clarity", pattern: /\b(?:clarity|clearer)\b.{0,120}\b(?:credibility|future|reality)\b|\bpromise\b.{0,120}\b(?:bigger than reality|reality clearer)\b/iu, anchors: ["promise", "clarity", "credibility", "future", "reality"] },
  { mechanism: "value-adding-follow-up", pattern: /\bfollow.up\b.{0,140}\b(?:adds? value|answers? a question|useful information|real deadline|agreed moment)\b/iu, anchors: ["follow-up", "value", "question", "information", "deadline"] },
  { mechanism: "pressure-without-value", pattern: /\b(?:chasing|another message)\b.{0,140}\b(?:attention|pressure|without adding|nothing new)\b|\b(?:nothing new|adding pressure)\b/iu, anchors: ["chasing", "attention", "pressure", "nothing new"] },
  { mechanism: "channel-capacity-boundary", pattern: /\b(?:five|two)\s+channels?\b.{0,140}\b(?:answer|manage|neglected)\b/iu, anchors: ["channels", "answer", "manage", "neglected"] },
  { mechanism: "respectful-stop-condition", pattern: /\b(?:when to stop|does not respond|give them space|not relentless|consistency plus respect)\b/iu, anchors: ["stop", "respond", "space", "respect"] },
  { mechanism: "useful-follow-up-evidence", pattern: /\b(?:unresolved question|relevant example|requested document|genuine deadline)\b/iu, anchors: ["question", "example", "document", "deadline"] },
  { mechanism: "relevance-response-reason", pattern: /\brelevance\b.{0,120}\b(?:persistence|chasing|clarity|information|reason to respond)\b|\breason to respond\b/iu, anchors: ["relevance", "persistence", "clarity", "information", "respond"] },
  { mechanism: "platform-attention-tax", pattern: /\b(?:more platforms?|every channel)\b.{0,180}\b(?:ideas|replies|moderation|measurement|follow.up)\b.{0,180}\b(?:no observable buying signal|attention tax|look present)\b/iu, anchors: ["platform", "channel", "replies", "buying signal", "attention tax"] },
  { mechanism: "response-capacity-readiness", pattern: /\bserve this channel well enough\b.{0,100}\brespond\b|\braises a hand\b/iu, anchors: ["channel", "serve", "respond", "raises a hand"] },
  { mechanism: "neglected-account-without-distribution", pattern: /\bneglected account\b.{0,100}\bnot distribution\b|\bopen door with nobody behind it\b/iu, anchors: ["neglected account", "distribution", "nobody"] },
  { mechanism: "customer-signal-channel-decision", pattern: /\bchoose one channel\b.{0,100}\b(?:strengthen|pause)\b.{0,140}\bcustomer behavior\b|\bpausing it creates no measurable loss\b/iu, anchors: ["channel", "strengthen", "pause", "customer behavior", "measurable loss"] },
  { mechanism: "signal-coherence", pattern: /\b(?:content|offer|touchpoint|coheren|alignment|same expertise|same promise|same story)\b/iu, anchors: ["content", "offer", "profile", "coherence", "alignment", "expertise", "promise", "touchpoint"] },
  { mechanism: "audience-fit-signal", pattern: /\b(?:everyone|generic|broad|niche|relevant|this is for me|specificity|audience)\b/iu, anchors: ["everyone", "generic", "broad", "niche", "relevant", "specific", "audience", "message"] },
  { mechanism: "customer-context-interpretation", pattern: /\b(?:frustrat\w*|fear|priorit\w*|buying decision|understand the context|describe the problem|their own words|interpretation work|recognize their own situation)\b/iu, anchors: ["frustration", "fear", "priority", "decision", "context", "problem", "understand"] },
  { mechanism: "peer-referral", pattern: /\b(?:referr|introduc|recommend|word of mouth)\b/iu, anchors: ["referral", "introduce", "recommend", "peer", "remember"] },
];

function resolveMechanism(narration: string, _treatment: PositioningVisualTreatment): { readonly mechanism: Mechanism; readonly confidence: VeronicaSemanticConfidence; readonly anchors: readonly string[] } {
  if (/\bpromise\b.{0,100}\b(?:creative slogan|translation of value)\b|\btranslation of value\b/iu.test(narration)) return { mechanism: "promise-value-translation", confidence: "HIGH", anchors: ["promise", "creative slogan", "translation", "value"] };
  if (/\b(?:technical description|force all four into one sentence)\b/iu.test(narration)) return { mechanism: "description-to-outcome-framing", confidence: "HIGH", anchors: ["technical description", "four", "sentence", "framework"] };
  if (/\b(?:real experience|experience)\b.{0,100}\b(?:deliver|fulfill|meet)\b.{0,100}\bexpectation\b|\bexpectation\b.{0,100}\b(?:real experience|experience)\b/iu.test(narration)) return { mechanism: "expectation-delivery-check", confidence: "HIGH", anchors: ["experience", "deliver", "expectation", "result"] };
  if (/\b(?:louder|stronger|more honest)\s+promise\b|\bbetter product\b/iu.test(narration)) return { mechanism: "promise-calibration", confidence: "HIGH", anchors: ["promise", "honest", "product"] };
  if (/\bpromise\b.{0,100}\bstandard\b.{0,160}\b(?:message|experience)\b|\bmessage\b.{0,100}\bexperience\b.{0,100}\b(?:support|cannot|can't)\b/iu.test(narration)) return { mechanism: "promise-experience-alignment", confidence: "HIGH", anchors: ["promise", "standard", "message", "experience", "support", "trust"] };
  if (/\b(?:clarity|clearer)\b.{0,120}\b(?:credibility|future|reality)\b|\bpromise\b.{0,120}\b(?:bigger than reality|reality clearer)\b/iu.test(narration)) return { mechanism: "reality-bounded-clarity", confidence: "HIGH", anchors: ["promise", "clarity", "credibility", "future", "reality"] };
  if (/\bfollow.up\b.{0,140}\b(?:adds? value|answers? a question|useful information|real deadline|agreed moment)\b/iu.test(narration)) return { mechanism: "value-adding-follow-up", confidence: "HIGH", anchors: ["follow-up", "value", "question", "information", "deadline"] };
  if (/\b(?:unresolved question|relevant example|requested document|genuine deadline)\b/iu.test(narration)) return { mechanism: "useful-follow-up-evidence", confidence: "HIGH", anchors: ["question", "example", "document", "deadline"] };
  if (/\b(?:chasing|another message)\b.{0,140}\b(?:attention|pressure|without adding|nothing new)\b|\b(?:nothing new|adding pressure)\b/iu.test(narration)) return { mechanism: "pressure-without-value", confidence: "HIGH", anchors: ["chasing", "attention", "pressure", "nothing new"] };
  if (/\b(?:five|two)\s+channels?\b.{0,140}\b(?:answer|manage|neglected)\b/iu.test(narration)) return { mechanism: "channel-capacity-boundary", confidence: "HIGH", anchors: ["channels", "answer", "manage", "neglected"] };
  if (/\b(?:when to stop|does not respond|give them space|not relentless|consistency plus respect)\b/iu.test(narration)) return { mechanism: "respectful-stop-condition", confidence: "HIGH", anchors: ["stop", "respond", "space", "respect"] };
  if (/\brelevance\b.{0,120}\b(?:persistence|chasing|clarity|information|reason to respond)\b|\breason to respond\b/iu.test(narration)) return { mechanism: "relevance-response-reason", confidence: "HIGH", anchors: ["relevance", "persistence", "clarity", "information", "respond"] };
  if (/\b(?:more platforms?|every channel)\b.{0,180}\b(?:ideas|replies|moderation|measurement|follow.up)\b.{0,180}\b(?:no observable buying signal|attention tax|look present)\b/iu.test(narration)) return { mechanism: "platform-attention-tax", confidence: "HIGH", anchors: ["platform", "channel", "replies", "buying signal", "attention tax"] };
  if (/\bserve this channel well enough\b.{0,100}\brespond\b|\braises a hand\b/iu.test(narration)) return { mechanism: "response-capacity-readiness", confidence: "HIGH", anchors: ["channel", "serve", "respond", "raises a hand"] };
  if (/\bneglected account\b.{0,100}\bnot distribution\b|\bopen door with nobody behind it\b/iu.test(narration)) return { mechanism: "neglected-account-without-distribution", confidence: "HIGH", anchors: ["neglected account", "distribution", "nobody"] };
  if (/\bchoose one channel\b.{0,100}\b(?:strengthen|pause)\b.{0,140}\bcustomer behavior\b|\bpausing it creates no measurable loss\b/iu.test(narration)) return { mechanism: "customer-signal-channel-decision", confidence: "HIGH", anchors: ["channel", "strengthen", "pause", "customer behavior", "measurable loss"] };
  if (/\bbefore\s+(?:chasing|pursuing|increasing)\b.{0,80}\b(?:revenue|sales?|volume|growth)\b.{0,180}\b(?:understand|examine|calculate)\b.{0,120}\b(?:economically|unit economics?)\b.{0,120}\b(?:each|every)\b.{0,80}\b(?:sale|sell)\b/iu.test(narration)) {
    return { mechanism: "input-output-flow", confidence: "HIGH", anchors: ["before", "revenue", "economically", "every", "sell"] };
  }
  if (/\b(?:revenue|payment|income)\b.{0,100}\b(?:weak business|thin margin|small margin|little margin|almost no margin)\b/iu.test(narration)) {
    return { mechanism: "retained-remainder", confidence: "HIGH", anchors: ["revenue", "weak business", "margin", "goes straight back out", "problem bigger"] };
  }
  if (/\brevenue\b.{0,100}\bweak business\b/iu.test(narration)) return { mechanism: "quantity-comparison", confidence: "HIGH", anchors: ["revenue", "weak business", "impressive"] };
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
  // A visual strategy is output grammar, never source evidence. Falling back
  // from strategy to mechanism allowed a topic-specific template to validate
  // itself after leaking into an unrelated episode.
  return { mechanism: "UNRESOLVED", confidence: "LOW", anchors: [] };
}

const contextualFragment = /^(?:try (?:this|that|it)(?: instead)?|do (?:this|that|it)|use (?:this|that|it)|that is (?:the )?(?:problem|point|reason)|this is (?:the )?(?:problem|point|reason)|it is (?:the )?(?:problem|point|reason))\s*[.!?…]*$/iu;

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
  if (previous && contextualFragment.test(previous.text) && finitePredicate.test(selected.span.text)) {
    return [previous, selected.span];
  }
  if (contextualFragment.test(selected.span.text)) {
    const forward = candidates.slice(selected.index + 1, selected.index + 3).filter((span) => finitePredicate.test(span.text));
    if (/^(?:try|do|use)\b/iu.test(selected.span.text) && forward[0]) return [selected.span, forward[0]];
    if (previous && finitePredicate.test(previous.text)) return [previous, selected.span];
  }
  const pairedAnaphora = Boolean(previous && /^(?:it|this|that|these|those)\b/iu.test(selected.span.text) && /\b(?:does not have to|doesn't have to|rather than|instead of)\b/iu.test(previous.text));
  if (pairedAnaphora && previous) return [previous, selected.span];
  return (pairedConditional || pairedCorrection) && next ? [selected.span, next] : [selected.span];
}

export function classifyVeronicaSemanticPolarity(claim: string): VeronicaSemanticPolarity {
  if (/\b(?:promise|message|expectation)\b.{0,140}\b(?:experience|reality|product)\b.{0,100}\b(?:cannot|can't|does not|doesn't)\b.{0,140}\bconversion\b.{0,80}\b(?:rise|increase)\b.{0,120}\btrust\b.{0,80}\b(?:fall|declin|drop)\b/iu.test(claim)) return "TRANSITION_POSITIVE_TO_NEGATIVE";
  if (/\b(?:weak business|problem (?:gets?|becomes?|grows?) bigger|(?:make|makes|making)\s+(?:the\s+)?problem bigger|structural weakness|thin margin|small margin|little margin|almost no margin|workload backlog|accumulating workload|operational bottleneck|operational strain)\b/iu.test(claim)) return "NEGATIVE_STATE";
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
  if (isConservativeVisualMechanism(mechanism)) {
    return { family: "NONE", confidence: "HIGH" };
  }
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
    "promise-value-translation": { value: "the intended customer understands the concrete value relationship the promise expresses", family: "UNDERSTANDS" },
    "description-to-outcome-framing": { value: "the intended customer understands the outcome rather than only the technical description", family: "UNDERSTANDS" },
    "expectation-delivery-check": { value: "the intended customer understands whether the real experience can deliver the expectation", family: "UNDERSTANDS" },
    "promise-calibration": { value: "the intended customer trusts the promise because it is calibrated to the product", family: "TRUSTS" },
    "promise-experience-alignment": { value: "the intended customer trusts the promise when the delivered experience visibly supports the expectation", family: "TRUSTS" },
    "reality-bounded-clarity": { value: "the intended customer understands the real value without borrowed future credibility", family: "UNDERSTANDS" },
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
  if (new RegExp(`^(?:the\\s+|an?\\s+)?${optionalDescriptor}(?:business\\s+operator|operator|owner|seller)\\b`, "iu").test(action)) return "business-operator";
  if (new RegExp(`^(?:the\\s+|an?\\s+)?${optionalDescriptor}(?:expert|professional|consultant)\\b`, "iu").test(action)) return "expert";
  if (new RegExp(`^(?:the\\s+|an?\\s+)?${optionalDescriptor}(?:(?:another|one)\\s+person|buyer|customer|visitor|prospect|audience|observer|person|people|peer|participant|intended person)\\b`, "iu").test(action)) return "buyer";
  if (/^(?:the\s+)?(?:comparison|contrast|split comparison|market)\b/iu.test(action)) return "none";
  return undefined;
}

function actionOwner(scene: PlannedScene, narrationEvidence = ""): { readonly role: VeronicaActionOwnerRole; readonly confidence: VeronicaSemanticConfidence } {
  if (/^\s*choose one channel\b.{0,100}\b(?:strengthen|pause)\b/iu.test(narrationEvidence)) return { role: "business-operator", confidence: "HIGH" };
  if (/\b(?:platforms?|attention tax|neglected account|distribution|customer behavior|measurable loss)\b.{0,140}\b(?:channel|signal|replies|moderation|pause|strengthen)\b/iu.test(narrationEvidence)) return { role: "business-operator", confidence: "HIGH" };
  const businessOperatorLeads = /\b(?:revenue|payment|income|margin|costs?|sale|sales|orders?|volume|retained|remainder)\b/iu.test(narrationEvidence)
    && /\b(?:calculate|understand|subtract|produce|ship|support|sustain|leaves? behind|goes? (?:straight )?(?:back )?out|more orders?|additional sale)\b/iu.test(narrationEvidence);
  if (businessOperatorLeads) return { role: "business-operator", confidence: "HIGH" };
  if (/\b(?:promise|message|expectation|technical description|offer clearer|reality|credibility|follow.up|chasing|channels?|respond|relevance)\b/iu.test(narrationEvidence)) return { role: "expert", confidence: "HIGH" };
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
  if (/\b(?:business operator|operator|owner|seller)\b/iu.test(source)) return { role: "business-operator", confidence: "MEDIUM" };
  if (/\b(?:expert|professional|consultant)\b/iu.test(source)) return { role: "expert", confidence: "MEDIUM" };
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
  const unsupportedExperience = source.match(/^if\s+(.+?\b(?:experience|reality|product)\b.+?),\s*(conversion\s+may\s+(?:rise|increase)\s+once)\s+and\s+(trust\s+may\s+(?:fall|decline|drop)\s+later)$/iu);
  if (unsupportedExperience) {
    return {
      stateRelation: "SEQUENTIAL_PROGRESSION",
      cause: unsupportedExperience[1]!,
      consequence: unsupportedExperience[3]!,
      contrast: {
        relation: "SEQUENTIAL_PROGRESSION",
        initialState: unsupportedExperience[2]!,
        desiredState: unsupportedExperience[3]!,
        failureState: unsupportedExperience[3]!,
        consequence: unsupportedExperience[3]!,
      },
    };
  }
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
  const correctiveIsTemporal = /\b(?:first|before)\b[\s\S]*\b(?:later|after|then|eventually)\b/iu.test(source);
  if (corrective && (correctiveIsTemporal || polarity === "CONTRAST" || polarity === "TRANSITION_NEGATIVE_TO_POSITIVE" || polarity === "TRANSITION_POSITIVE_TO_NEGATIVE")) {
    const relation = correctiveIsTemporal ? "SEQUENTIAL_PROGRESSION" as const : "CONTRAST" as const;
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
  "promise-value-translation": { cause: "A promise translates the source-stated value instead of functioning as a creative slogan", action: "the professional links one offered item to the concrete result, desired feeling, and removable obstacle it can support", consequence: "the intended customer can see the value relationship the promise must express", environment: "value-translation worktable with one offered item and three concrete customer-outcome objects", composition: "the offered item anchors the lower frame while result, desired feeling, and removable obstacle form a clear upward relationship", props: ["offered-item artifact", "concrete result object", "desired-feeling cue", "removable-obstacle object"] },
  "description-to-outcome-framing": { cause: "A framework moves the offer from technical description toward a customer-relevant outcome", action: "the professional moves technical component objects behind one visible customer-result object", consequence: "the customer-facing outcome becomes the frame for the offer", environment: "offer-framing workspace with technical components and one customer-result object", composition: "technical components recede behind a single outcome object that determines the visual hierarchy", props: ["technical component objects", "customer-result object", "framing gesture"] },
  "expectation-delivery-check": { cause: "The source-stated expected result must be checked against the real experience that can deliver it", action: "the professional places the expected result beside the matching real-experience object while a customer compares the two", consequence: "the customer can see whether the experience can deliver the expectation", environment: "expectation check station with paired expected-result and real-experience objects", composition: "the expected result and real experience sit side by side with the customer's comparison gesture between them", props: ["expected-result cue", "real-experience object", "customer comparison gesture"] },
  "promise-calibration": { cause: "An unsupported louder promise must be replaced by an honest promise or a better product", action: "the professional removes an oversized promise artifact and replaces it with either a realistic promise or an improved product object", consequence: "the customer sees a claim calibrated to what the product can actually support", environment: "promise-calibration table with a replaceable claim artifact and product object", composition: "an oversized promise artifact moves out of the foreground as a realistic promise and improved product occupy the decision point", props: ["oversized-promise artifact", "realistic-promise artifact", "improved-product object"] },
  "promise-experience-alignment": { cause: "A more compelling message creates a standard the delivered experience must meet", action: "the professional compares a compelling message with the delivered experience while initial conversion and later trust occupy distinct visible states", consequence: "initial conversion can give way to lost trust when the experience cannot support the message", environment: "promise-and-delivery review with message, experience, conversion, and trust objects", composition: "the compelling message and one conversion response appear at left while unsupported delivery leads to a separate reduced-trust response at right", props: ["message artifact without readable text", "delivered-experience object", "initial-conversion cue", "reduced-trust response"] },
  "reality-bounded-clarity": { cause: "A strong promise makes the real value clearer without borrowing credibility from an undelivered future", action: "the professional brings the promised result into alignment with the concrete present product outcome", consequence: "the customer sees clarity bounded by what is real now", environment: "reality-bounded offer review with present product outcome and promise artifact", composition: "the concrete present outcome occupies the foreground while the promise aligns to its exact edge instead of extending beyond it", props: ["present product outcome", "aligned-promise artifact", "customer clarity response"] },
  "value-adding-follow-up": { cause: "A follow-up adds a concrete answer, useful information, deadline, or agreed return point", action: "the professional places one useful answer object beside a pending customer question at the agreed follow-up moment", consequence: "the customer receives a reason to re-engage without being chased", environment: "follow-up value desk with a pending question and one useful response object", composition: "the pending question sits at left and the useful response arrives at right on one clear return path", props: ["pending-question object", "useful-information object", "agreed-moment cue"] },
  "pressure-without-value": { cause: "A chasing message asks for attention without adding anything new", action: "the professional withholds a repeated empty message while the customer turns toward the absent new information", consequence: "pressure remains visibly separate from a useful reason to respond", environment: "message-pressure review with an empty repeat object and missing-information space", composition: "one repeated empty message remains peripheral while the unfilled information space occupies the customer-facing center", props: ["repeated-empty-message object", "missing-information space", "customer pause gesture"] },
  "channel-capacity-boundary": { cause: "Only channels the professional can answer reliably should remain active", action: "the professional keeps two active communication lanes supplied while three inactive lanes remain closed and unattended", consequence: "the customer can see the capacity boundary that prevents neglected follow-up", environment: "communication-capacity board with two active lanes and three inactive lanes", composition: "two attended lanes carry response objects in the foreground; three inactive lanes recede as unattended communication paths", props: ["two active response lanes", "three inactive lanes", "response-capacity objects"] },
  "respectful-stop-condition": { cause: "Reasonable relevant contacts end when the other person does not respond", action: "the professional stops the contact sequence and leaves a clear respectful space around the nonresponding customer", consequence: "presence remains visibly different from relentless pressure", environment: "respectful contact timeline with completed relevant contacts and an open quiet interval", composition: "completed contacts form a short sequence at left; a deliberate quiet interval separates the professional from the customer at right", props: ["completed relevant contacts", "quiet interval", "customer space cue"] },
  "useful-follow-up-evidence": { cause: "A useful follow-up contributes one answer, example, document, or real deadline", action: "the professional selects one relevant evidence object and places it beside the customer’s unresolved question", consequence: "the follow-up earns attention by adding information", environment: "follow-up evidence table with unresolved question and selected supporting object", composition: "one selected evidence object moves toward the unresolved question while all unrelated materials remain outside the focal area", props: ["unresolved-question object", "relevant-example object", "requested-document object", "genuine-deadline cue"] },
  "relevance-response-reason": { cause: "Relevance separates persistence from chasing because every follow-up adds clarity, information, or a real reason", action: "the professional aligns one follow-up with a concrete clarity or information object before the customer decides whether to respond", consequence: "the customer can see the real reason the follow-up deserves a response", environment: "response-reason review with follow-up object and concrete clarity evidence", composition: "the follow-up points directly to one clarity or information object, with the customer response positioned as the visible consequence", props: ["follow-up object", "clarity evidence", "information object", "response-reason cue"] },
  "platform-attention-tax": { cause: "Multiple platforms consume recurring attention while producing no observable buying signal", action: "the business operator distributes ideas, replies, moderation, measurement, and follow-up objects across several channels while the buying-signal area remains empty", consequence: "the attention cost becomes visible without mistaking activity for customer demand", environment: "multi-channel attention ledger with several operating channels and an empty buying-signal area", composition: "several channel lanes consume visible work objects across the frame while one empty buying-signal area remains isolated in the foreground", props: ["channel work objects", "ideas-and-replies objects", "moderation-and-measurement objects", "empty buying-signal area"] },
  "response-capacity-readiness": { cause: "A channel is worthwhile only when the professional can respond after a customer raises a hand", action: "the professional keeps one active channel supplied with a ready response object as a customer raises a hand", consequence: "the customer can see that the channel has enough response capacity to be served well", environment: "active-channel response station with a raised-hand customer cue", composition: "the customer signal enters one active channel lane and meets a ready response object held by the professional", props: ["active channel lane", "raised-hand customer cue", "ready response object"] },
  "neglected-account-without-distribution": { cause: "A neglected account does not create real distribution when nobody is present to respond", action: "the business operator leaves an unattended account surface empty while a customer signal receives no response", consequence: "the absence of active service makes the account’s lack of distribution visible", environment: "unattended account review with an empty response surface and a waiting customer signal", composition: "the empty account surface occupies the center while the waiting customer signal remains visibly unanswered at the edge", props: ["empty account surface", "waiting customer signal", "absent response space"] },
  "customer-signal-channel-decision": { cause: "Customer behavior and measurable loss determine which channel to strengthen or pause", action: "the business operator moves one channel with customer signals into a strengthen position and one signal-free channel into a pause position", consequence: "the decision follows observable customer behavior rather than platform fashion", environment: "channel-decision board with customer-signal evidence and two channel positions", composition: "customer-signal evidence anchors the center; one channel moves toward strengthen and one toward pause on opposite sides", props: ["customer-signal evidence", "strengthen channel object", "pause channel object", "measurable-loss check"] },
  "work-expertise-separation": { cause: "Substantive professional work creates actual expertise while external recognition remains a separate state", action: "the professional performs substantive work that produces an expert result while a separate observer remains outside the work context without evaluating proof", consequence: "actual expertise exists through the work even though external recognition is still unresolved", environment: "professional work setting with a clear boundary to a separate external-observer context", composition: "the professional and substantive work process dominate the frame; the completed expert result remains on the work side while the observer stays visibly separate without a proof-inspection gesture", props: ["substantive work process", "expert work result", "clear separation from external observer"] },
  "signal-coherence": { cause: "Offer, profile, website, and content repeat one expertise cue instead of competing stories", action: "a visitor follows the same visual evidence cue across several distinct touchpoints", consequence: "the separate encounters combine into one credible impression", environment: "customer journey review with distinct profile, site, offer, and content touchpoints", composition: "four separate touchpoints share one visible evidence cue while unrelated cues remain absent", props: ["profile touchpoint", "website touchpoint", "focused offer artifact", "content example"] },
  "audience-fit-signal": { cause: "A broad message gives a mixed crowd no visible sign of fit while a specific cue matches one person's situation", action: "people pass the broad display; the intended person stops at the specific situation cue", consequence: "relevance becomes visible without asking the whole crowd to interpret the offer", environment: "public choice space with a mixed flow of people and two differently focused service displays", composition: "broad display recedes beside an uninterested crowd; one specific situation cue stops the intended person", props: ["broad undifferentiated display", "specific situation cue", "mixed crowd", "stopping gesture"] },
  "customer-context-interpretation": { cause: "Concrete details from the customer's situation guide the professional's explanation", action: "the professional arranges the customer's observed frustrations, priorities, and attempted solutions into one causal view", consequence: "the customer recognizes their own situation in the explanation", environment: "one-to-one discovery setting with physical evidence from the customer's real context", composition: "customer evidence in the foreground; professional groups cause, failed attempt, and consequence without readable labels", props: ["context evidence", "failed-attempt artifact", "visible consequence", "customer recognition gesture"] },
  "peer-referral": { cause: "A consistent expertise signal gives one person a concrete reason to introduce another", action: "one person points a peer toward the professional's matching work example", consequence: "the peer recognizes the relevance before the introduction is complete", environment: "small peer conversation beside a concrete work demonstration", composition: "introducing gesture connects peer, professional, and matching work evidence in one triangle", props: ["matching work example", "introducing gesture", "peer response"] },
  "quantity-comparison": { cause: "Two source-supported quantities occupy visibly different proportions", action: "the operator places the larger incoming quantity beside the much smaller retained quantity", consequence: "the imbalance remains legible without labels or readable numbers", environment: "neutral transaction worktable with physical quantity tokens", composition: "large incoming group at left and small retained group at right in a direct vertical comparison", props: ["incoming value tokens", "retained value tokens", "two proportional containers"] },
  "input-output-flow": { cause: "One repeated unit enters a visible process", action: "the operator moves one sale token through successive source-supported cost stations", consequence: "each variable cost removes a visible portion before the remainder exits", environment: "neutral fulfillment worktable with one directional transaction flow", composition: "one incoming sale at top, concrete cost stations down the frame, retained remainder at the bottom", props: ["single sale token", "cost-removal stations", "retained remainder"] },
  "retained-remainder": { cause: "Incoming value is progressively depleted by source-supported costs", action: "the operator separates the incoming payment into outgoing cost portions and one retained remainder", consequence: "the retained value is visibly much smaller than the incoming amount", environment: "neutral unit-economics worktable with no readable text or numbers", composition: "incoming value dominates the upper frame; outgoing portions peel away toward a small retained remainder", props: ["incoming payment tokens", "outgoing cost portions", "retained remainder container"] },
  "workload-accumulation": { cause: "Repeated sales add repeated work while retained value changes very little", action: "the operator faces an accumulating workload backlog while a small retained result remains isolated at the edge", consequence: "more volume visibly amplifies workload without a matching gain in retained value", environment: "neutral operations evidence surface with an accumulating workload backlog", composition: "arriving order units feed one dominant bottleneck and backlog in the center; the small retained result remains visibly isolated at the edge", props: ["arriving order units", "accumulating workload backlog", "small retained result"] },
  "scaling-relation": { cause: "Volume expands while the source-supported economic outcome is compared", action: "the operator compares a baseline order flow with a larger order flow and checks the retained remainder in each", consequence: "higher volume is healthy only when retained economics remain visibly sound", environment: "neutral scaling comparison workspace with two parallel transaction flows", composition: "baseline flow at left and expanded flow at right; matching input, workload, and retained-result positions", props: ["baseline order flow", "expanded order flow", "retained result containers"] },
};

export function deriveVeronicaSemanticProposition(input: { readonly scene: PlannedScene; readonly narration: string }): VeronicaSemanticProposition {
  const resolved = resolveMechanism(input.narration, input.scene.treatment);
  const economicsChain = /\b(?:revenue|payment|income)\b/iu.test(input.narration)
    && /\b(?:margin|costs?|goes? (?:straight )?(?:back )?out|retained|remainder|weak business)\b/iu.test(input.narration)
    && /\b(?:orders?|sales?|volume|problem (?:gets?|becomes?|grows?) bigger)\b/iu.test(input.narration);
  // A tightly connected economics warning is one proposition: selecting only
  // its headline loses the depletion and worsening relationship that makes
  // the warning renderable. This applies by source structure, never episode.
  const narrationAnchors: readonly [SentenceSpan, ...SentenceSpan[]] = economicsChain
    ? (() => {
        const spans = sentenceSpans(input.narration);
        return spans.length > 0
          ? [spans[0]!, ...spans.slice(1)]
          : selectNarrationAnchors(input.narration, resolved.anchors);
      })()
    : selectNarrationAnchors(input.narration, resolved.anchors);
  const explicitAnchors = narrationAnchors.length > 1
    ? narrationAnchors.filter((span) => !contextualFragment.test(span.text))
    : narrationAnchors;
  const narrationClaim = (explicitAnchors.length > 0 ? explicitAnchors : narrationAnchors).map((span) => span.text).join(" ");
  const owner = actionOwner(input.scene, narrationClaim);
  const spanPolarities = narrationAnchors.map((span) => classifyVeronicaSemanticPolarity(span.text));
  const polarity = /\bidentity can change\b/iu.test(narrationClaim) && /\brecognition has to be earned\b/iu.test(narrationClaim)
    ? "CONTRAST"
    : spanPolarities[0] === "NEGATIVE_STATE" && spanPolarities.slice(1).some((value) => value === "POSITIVE_STATE")
    ? "TRANSITION_NEGATIVE_TO_POSITIVE"
    : classifyVeronicaSemanticPolarity(narrationClaim);
  const buyer = buyerConsequence(narrationClaim, resolved.mechanism, polarity);
  if (resolved.mechanism === "UNRESOLVED") {
    const grounded = sourceGroundedCausalFields(narrationClaim, polarity);
    const base = { schemaVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION, narrationClaim, evidenceSpans: narrationAnchors, polarity, stateRelation: grounded.stateRelation, cause: grounded.cause, actorRole: owner.role, actorAction: input.scene.treatment.action, consequence: grounded.consequence, ...(grounded.contrast ? { contrast: grounded.contrast } : {}), visualMechanism: "UNRESOLVED" as const, evidenceAnchors: narrationAnchors.map((span) => span.text), buyerConsequenceFamily: buyer.family, confidence: { proposition: "LOW" as const, actorOwnership: owner.confidence, consequence: buyer.confidence, visualMechanism: "LOW" as const } };
    return finalizeVeronicaSemanticProposition(base);
  }
  // Visual mechanisms are grammar selectors, never semantic templates.  Keep
  // the proposition's causal content anchored in the selected narration.
  const grounded = sourceGroundedCausalFields(narrationClaim, polarity);
  const cause = grounded.cause;
  const consequence = grounded.consequence;
  const contrast = grounded.contrast;
  const propositionBase = { schemaVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION, narrationClaim, evidenceSpans: narrationAnchors, polarity, stateRelation: grounded.stateRelation, cause, actorRole: owner.role, actorAction: narrationClaim, ...(buyer.value ? { buyerInterpretation: buyer.value } : {}), consequence, ...(contrast ? { contrast } : {}), ...( /\b(?:doorway|threshold|foothold)\b/iu.test(input.narration) ? { narrationNativeMetaphor: "doorway / threshold" } : {}), visualMechanism: resolved.mechanism, evidenceAnchors: narrationAnchors.map((span) => span.text), buyerConsequenceFamily: buyer.family, confidence: { proposition: resolved.confidence, actorOwnership: owner.confidence, consequence: buyer.value ? buyer.confidence : "MEDIUM" as const, visualMechanism: resolved.confidence } };
  return finalizeVeronicaSemanticProposition(propositionBase);
}

type VeronicaProjectedTreatment = Pick<PositioningVisualTreatment, "narrativeBeat" | "subjectRequirement" | "environment" | "composition" | "camera" | "action" | "actionOwnerRole" | "props" | "diagram" | "strategy">;

type VeronicaGenericActorResolution =
  | {
      readonly kind: "AUTHORIZED_ACTOR";
      readonly actorRole: Exclude<VeronicaActionOwnerRole, "none">;
      readonly label: "professional" | "buyer" | "business operator" | "source-authorized participants";
      readonly evidenceSpanHashes: readonly string[];
    }
  | {
      readonly kind: "PEOPLE_FREE_REQUIRED";
      readonly reason: "NO_FINALIZED_ACTOR" | "ACTOR_NOT_AUTHORIZED";
    };

/**
 * The generic treatment layer may choose framing, never a persona.  A visible
 * actor has to come from finalized semantic authority and its authorization;
 * otherwise the projection remains people-free.
 */
function resolveVeronicaGenericTreatmentActor(
  proposition: VeronicaSemanticProposition,
): VeronicaGenericActorResolution {
  if (proposition.actorRole === "none") {
    return { kind: "PEOPLE_FREE_REQUIRED", reason: "NO_FINALIZED_ACTOR" };
  }
  const roleIsAuthorized = proposition.visualAuthorization.entities.some(
    (entry) => entry.semanticRole === proposition.actorRole && entry.evidenceSpanHashes.length > 0,
  );
  if (!roleIsAuthorized) return { kind: "PEOPLE_FREE_REQUIRED", reason: "ACTOR_NOT_AUTHORIZED" };
  const evidenceSpanHashes = proposition.visualAuthorization.entities
    .filter((entry) => entry.semanticRole === proposition.actorRole)
    .flatMap((entry) => entry.evidenceSpanHashes);
  switch (proposition.actorRole) {
    case "expert": return { kind: "AUTHORIZED_ACTOR", actorRole: "expert", label: "professional", evidenceSpanHashes };
    case "buyer": return { kind: "AUTHORIZED_ACTOR", actorRole: "buyer", label: "buyer", evidenceSpanHashes };
    case "business-operator": return { kind: "AUTHORIZED_ACTOR", actorRole: "business-operator", label: "business operator", evidenceSpanHashes };
    case "shared": return { kind: "AUTHORIZED_ACTOR", actorRole: "shared", label: "source-authorized participants", evidenceSpanHashes };
  }
}

const genericPeopleSafeMechanismCues: Readonly<Record<Exclude<Mechanism, "UNRESOLVED">, string>> = {
  "website-first-impression": "website opening-screen category",
  "market-problem-solution-chain": "market, problem, and matching response",
  "problem-first-sequence": "recognized problem and matching response",
  "identity-bridge": "prior-work and new-role connection",
  "relevant-context-participation": "relevant-context contribution",
  "recognition-accumulation": "repeated proof and recognition",
  "claim-to-proof": "claim and concrete proof",
  "promise-value-translation": "promise and concrete value",
  "description-to-outcome-framing": "technical description and visible outcome",
  "expectation-delivery-check": "expected result and real experience",
  "promise-calibration": "promise and present product evidence",
  "promise-experience-alignment": "promise, experience, conversion, and trust",
  "reality-bounded-clarity": "present outcome and bounded promise",
  "value-adding-follow-up": "follow-up question and useful information",
  "pressure-without-value": "repeated message and missing information",
  "channel-capacity-boundary": "active and inactive response channels",
  "respectful-stop-condition": "completed contact and respectful space",
  "useful-follow-up-evidence": "follow-up and selected evidence",
  "relevance-response-reason": "follow-up and concrete reason to respond",
  "platform-attention-tax": "platform attention and work accumulation",
  "response-capacity-readiness": "customer signal and ready response",
  "neglected-account-without-distribution": "unanswered customer signal and unattended account",
  "customer-signal-channel-decision": "customer signal and channel decision",
  "work-expertise-separation": "substantive work and external recognition",
  "signal-coherence": "profile, website, offer, and content signals",
  "audience-fit-signal": "specific audience-fit signal",
  "customer-context-interpretation": "situational context, frustration, and explanation",
  "peer-referral": "peer introduction and matching work evidence",
  "quantity-comparison": "quantity comparison evidence",
  "input-output-flow": "transaction flow and retained remainder",
  "retained-remainder": "incoming payment, costs, and retained remainder",
  "workload-accumulation": "workload, order volume, and retained value",
  "scaling-relation": "baseline, expanded volume, and retained contribution",
};

const genericPeopleSafeMechanismActions: Readonly<Record<Exclude<Mechanism, "UNRESOLVED">, string>> = {
  "website-first-impression": "inspects",
  "market-problem-solution-chain": "compares",
  "problem-first-sequence": "orders",
  "identity-bridge": "links",
  "relevant-context-participation": "contributes to",
  "recognition-accumulation": "remembers",
  "claim-to-proof": "inspects",
  "promise-value-translation": "connects",
  "description-to-outcome-framing": "reframes",
  "expectation-delivery-check": "checks",
  "promise-calibration": "aligns",
  "promise-experience-alignment": "compares",
  "reality-bounded-clarity": "bounds",
  "value-adding-follow-up": "adds",
  "pressure-without-value": "separates",
  "channel-capacity-boundary": "sets",
  "respectful-stop-condition": "marks",
  "useful-follow-up-evidence": "selects",
  "relevance-response-reason": "grounds",
  "platform-attention-tax": "measures",
  "response-capacity-readiness": "matches",
  "neglected-account-without-distribution": "reveals",
  "customer-signal-channel-decision": "selects",
  "work-expertise-separation": "separates",
  "signal-coherence": "aligns",
  "audience-fit-signal": "compares",
  "customer-context-interpretation": "recognizes",
  "peer-referral": "refers",
  "quantity-comparison": "compares",
  "input-output-flow": "follows",
  "retained-remainder": "isolates",
  "workload-accumulation": "tracks",
  "scaling-relation": "compares",
};

function projectPeopleSafeGenericTreatment(input: {
  readonly proposition: VeronicaSemanticProposition;
  readonly actor: VeronicaGenericActorResolution;
}): Pick<VeronicaProjectedTreatment, "subjectRequirement" | "environment" | "composition" | "action" | "props"> {
  const cue = genericPeopleSafeMechanismCues[input.proposition.visualMechanism as Exclude<Mechanism, "UNRESOLVED">];
  const action = genericPeopleSafeMechanismActions[input.proposition.visualMechanism as Exclude<Mechanism, "UNRESOLVED">];
  const stateClause = input.proposition.polarity === "NEGATIVE_STATE"
    ? "while the source-grounded failure remains visibly unresolved"
    : "while the stated cause and required consequence remain legible together";
  const actorLabel = input.actor.kind === "AUTHORIZED_ACTOR" ? input.actor.label : undefined;
  return {
    subjectRequirement: actorLabel
      ? `one source-authorized ${actorLabel} with source-grounded evidence`
      : "people-free source-grounded evidence relationship",
    environment: `source-grounded ${cue} evidence setting`,
    composition: `source-grounded evidence makes the stated cause and required consequence legible through ${cue}`,
    action: actorLabel
      ? `the ${actorLabel} ${action} source-grounded ${cue} evidence ${stateClause}`
      : `source-grounded ${cue} evidence makes the stated cause and required consequence legible without a depicted person`,
    props: [`source-grounded ${cue} evidence`, "stated cause cue", "required consequence cue"],
  };
}

function canProjectGenericConsequenceActor(
  proposition: VeronicaSemanticProposition,
): boolean {
  const authorizedEntities = new Set(proposition.visualAuthorization.entities.map((entry) => entry.concept));
  switch (proposition.visualMechanism) {
    case "promise-experience-alignment":
      return proposition.visualAuthorization.entities.some((entry) => entry.semanticRole === "buyer");
    case "platform-attention-tax":
    case "customer-signal-channel-decision":
      return proposition.visualAuthorization.entities.some((entry) => entry.semanticRole === "business-operator");
    case "promise-value-translation":
    case "description-to-outcome-framing":
    case "expectation-delivery-check":
    case "promise-calibration":
    case "reality-bounded-clarity":
    case "value-adding-follow-up":
    case "pressure-without-value":
    case "channel-capacity-boundary":
    case "respectful-stop-condition":
    case "useful-follow-up-evidence":
    case "relevance-response-reason":
    case "response-capacity-readiness":
    case "neglected-account-without-distribution":
      return authorizedEntities.has("customer");
    default:
      // Consequence-family templates name counterpart personas (visitor,
      // observer, peer, customer). They are not supporting actors unless a
      // typed treatment declaration supplies one, so the generic projector
      // intentionally leaves them out.
      return false;
  }
}

function projectAuthorizedBuyerPerspectiveAction(
  proposition: VeronicaSemanticProposition,
): string | undefined {
  const buyerIsAuthorized = proposition.buyerPerspective !== undefined
    && proposition.visualAuthorization.entities.some((entry) => entry.semanticRole === "buyer");
  if (!buyerIsAuthorized) return undefined;
  const cue = genericPeopleSafeMechanismCues[proposition.visualMechanism as Exclude<Mechanism, "UNRESOLVED">];
  const action = genericPeopleSafeMechanismActions[proposition.visualMechanism as Exclude<Mechanism, "UNRESOLVED">];
  const stateClause = proposition.polarity === "NEGATIVE_STATE"
    ? "while the source-grounded failure remains visibly unresolved"
    : "while the required consequence remains legible";
  return `the buyer ${action} source-grounded ${cue} evidence ${stateClause}`;
}

function projectNarrationNativeThreshold(
  proposition: VeronicaSemanticProposition,
): VeronicaProjectedTreatment {
  const foothold = /\bfoothold\b/iu.test(proposition.narrationClaim);
  const widening = /\bwiden\w*\b/iu.test(proposition.narrationClaim);
  const actor = resolveVeronicaGenericTreatmentActor(proposition);
  const actorLabel = actor.kind === "AUTHORIZED_ACTOR" ? actor.label : undefined;
  const narrativeBeat = widening
    ? "The source-grounded doorway visibly widens while its specific point of entry remains clear."
    : foothold
      ? "A niche provides a stable foothold at a visible doorway."
      : "A specific doorway provides a visible point of entry while leaving wider paths accessible beyond it.";
  const shared = {
    narrativeBeat,
    environment: "public threshold with a focused entrance and visibly open routes beyond",
    camera: "documentary eye-level view with the choice point and open continuation legible in one frame",
    props: ["specific open doorway", "focused entry cue", "wider paths beyond"],
    diagram: null,
    strategy: "client-decision" as const,
  };
  if (!actorLabel) {
    return {
      ...shared,
      subjectRequirement: "people-free spatial threshold relation",
      composition: widening
        ? "the focused doorway opens wider while its original entry boundary remains legible"
        : foothold
          ? "a stable foothold marks the focused entrance while wider routes remain visible beyond"
          : "the focused entrance remains distinct while wider accessible paths continue beyond the threshold",
      action: widening
        ? "the source-grounded doorway widens without introducing a depicted person"
        : foothold
          ? "the stable foothold and open continuation remain visible in one people-free frame"
          : "the specific doorway remains open to the wider routes beyond",
      actionOwnerRole: "none",
    };
  }
  return {
    ...shared,
    subjectRequirement: `one authorized ${actorLabel} at the source-grounded threshold`,
    composition: widening
      ? `the ${actorLabel} widens the focused doorway while its original entry boundary remains legible`
      : foothold
        ? `the ${actorLabel} gains a stable foothold at the focused entrance while wider routes remain visible beyond`
        : `the ${actorLabel} stops at the focused entrance while wider accessible paths remain visible beyond the threshold`,
    action: widening
      ? `the ${actorLabel} widens the established doorway`
      : foothold
        ? `the ${actorLabel} steadies at the specific doorway with the wider routes visibly open`
        : `the ${actorLabel} enters through the specific doorway toward the wider routes beyond`,
    actionOwnerRole: proposition.actorRole,
  };
}

export function visualTreatmentFromProposition(input: { readonly scene: PlannedScene; readonly proposition: VeronicaSemanticProposition; readonly preserveEnvironment: boolean }): Pick<PositioningVisualTreatment, "narrativeBeat" | "subjectRequirement" | "environment" | "composition" | "camera" | "action" | "actionOwnerRole" | "props" | "diagram" | "strategy"> {
  if (input.proposition.visualMechanism === "UNRESOLVED") throw new Error("SEMANTIC_REMEDIATION_LOW_CONFIDENCE");
  const visual = mechanismVisuals[input.proposition.visualMechanism];
  const conservativeMechanism = isConservativeVisualMechanism(input.proposition.visualMechanism);
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
  const narratedSaleSubject = claim.match(/\b(?:your|the|a|an)\s+((?:(?:best|top|main|flagship)[-\s]?selling\s+)?(?:product|service|offer|item))\b/iu)?.[1];
  const economicsSpecific = (input.proposition.visualMechanism === "input-output-flow" || input.proposition.visualMechanism === "retained-remainder") && /\bbefore\s+(?:chasing|pursuing)\b.{0,80}\b(?:the\s+)?(?:next|another|additional)\s+(?:order|sale)\b.{0,180}\b(?:calculate|work out|determine)\b.{0,120}\b(?:one|additional)\s+(?:sale|order)\b.{0,100}\b(?:leaves? behind|retained|remainder)\b/iu.test(claim)
    ? { environment: "neutral marginal-contribution evidence surface with one additional sale isolated before the next order", composition: "one additional sale occupies the focal area beside the small retained contribution it leaves; the next order remains peripheral and no cost-decomposition workflow is shown", props: ["one additional sale token", "small retained contribution", "peripheral next-order token"], action: "the business operator isolates one additional sale beside the small retained contribution it leaves before pursuing the next order" }
    : input.proposition.visualMechanism === "input-output-flow" && /\bbefore\s+(?:chasing|pursuing|increasing)\b.{0,80}\b(?:revenue|sales?|volume|growth)\b.{0,180}\b(?:understand|examine|calculate)\b.{0,120}\b(?:economically|unit economics?)\b.{0,120}\b(?:each|every)\b.{0,80}\b(?:sale|sell)\b/iu.test(claim)
    ? { environment: "neutral isolated diagnostic inspection at a unit-economics decision checkpoint before additional-order pursuit", composition: "the already-analyzed sale reaches a clear checkpoint along the near edge beside its retained contribution; additional order units wait beyond the checkpoint and no cost-decomposition workflow is shown", props: ["already-analyzed sale token", "visible retained contribution", "waiting additional order units", "clear decision checkpoint"], action: "the business operator checks one already-analyzed sale at the decision checkpoint beside its retained contribution before allowing additional orders through" }
    : input.proposition.visualMechanism === "input-output-flow" && narratedSaleSubject && /\b(?:calculate|start to finish)\b/iu.test(claim)
    ? { environment: "neutral unit-sale breakdown setup with one source-supported sale subject", composition: `one isolated ${narratedSaleSubject} occupies the top of a clear vertical cost path; customer payment begins the same sale before downstream cost stations`, props: [`isolated source-supported ${narratedSaleSubject}`, "incoming customer payment", "downstream sale cost stations"], action: `the business operator isolates the source-supported ${narratedSaleSubject} and traces its customer payment through one complete sale-cost path` }
    : input.proposition.visualMechanism === "input-output-flow" && /\b(?:calculate|start to finish)\b/iu.test(claim)
    ? { environment: "neutral unit-sale breakdown setup with one isolated transaction", composition: "one incoming sale token is isolated at the top of a clear vertical process before any cost station", props: ["isolated sale token", "incoming payment container", "empty downstream cost stations"], action: "the operator isolates one sale and places the customer's payment at the start of the transaction flow" }
    : input.proposition.visualMechanism === "input-output-flow" && /\bcustomer pays\b/iu.test(claim)
      ? { environment: "neutral transaction intake point with one isolated customer payment", composition: "one incoming payment enters the top of an otherwise empty vertical transaction flow", props: ["incoming customer payment tokens", "single sale unit", "empty downstream flow"], action: "the operator places the customer's payment at the start of one isolated sale flow" }
    : input.proposition.visualMechanism === "input-output-flow" && /\b(?:subtract|production|fees?|commissions?|shipping|support|refunds?|cost)\b/iu.test(claim)
      ? { environment: "neutral variable-cost breakdown line with distinct transaction stages", composition: "one sale moves through distinct physical cost-removal stations toward a visibly smaller remainder", props: ["single sale token", "distinct variable-cost stations", "retained remainder"], action: "the operator moves one sale through distinct cost stations as each removes a visible portion" }
      : undefined;
  const scalingSpecific = (input.proposition.visualMechanism === "scaling-relation" || input.proposition.visualMechanism === "retained-remainder" || input.proposition.visualMechanism === "quantity-comparison") && /\bwhat remains\b.{0,100}\b(?:more than|than)\b.{0,80}\b(?:order|sale) count\b/iu.test(claim)
    ? { environment: "neutral retained-value evidence field with a large contextual mass of order units", composition: "many order units recede as contextual mass while one small retained-value evidence object is isolated prominently in the focal area", props: ["many contextual order units", "isolated small retained-value evidence", "quiet comparison boundary"], action: "the business operator isolates the small retained-value evidence from the much larger contextual mass of order units" }
    : input.proposition.visualMechanism === "scaling-relation" && /\bif\s+(?:sales?|orders?|volume)\s+(?:doubl(?:e|es|ed)|increase|grows?)\b/iu.test(claim)
    ? { environment: "neutral order-volume comparison workspace with simultaneous baseline and doubled sale flows", composition: "baseline order-volume evidence at left and doubled order-volume evidence at right; matching retained-remainder containers remain comparable without asserting a healthier business", props: ["baseline order-volume evidence", "doubled order-volume evidence", "paired retained-remainder containers"], action: "the business operator compares baseline order volume with doubled order volume and checks the retained remainder in each without implying the business is healthier" }
    : input.proposition.visualMechanism === "scaling-relation" && /\b(?:economics?|unit economics?)\s+(?:still\s+)?work\b.{0,100}\b(?:volume|sales?|orders?)\s+(?:grow(?:s|ing)?|increase(?:s|d|ing)?|scale(?:s|d|ing)?)\b/iu.test(claim)
    ? { environment: "neutral controlled-capacity scaling comparison with baseline and expanded operation", composition: "foreground evidence staging holds baseline operation at left and scaled operation at right; the higher order volume and its larger retained contribution form the primary comparison while operating capacity remains orderly without an accumulating backlog", props: ["baseline order volume", "scaled order volume", "controlled operating capacity", "baseline retained contribution", "larger scaled retained contribution"], action: "the business operator scales the operation through controlled capacity from baseline to higher order volume while the retained contribution visibly grows with it" }
    : undefined;
  const specificVisual = economicsSpecific ?? scalingSpecific ?? signalSpecific ?? websiteSpecific ?? marketSpecific ?? identitySpecific ?? enumeratedPlanSpecific;
  const claimSpecificAction = input.proposition.visualMechanism === "signal-coherence" && input.proposition.actorRole === "expert"
    ? "the professional aligns distinct offer, profile, proof, and public-context artifacts around one shared expertise cue while an observer follows the connection"
    : /\b(?:first month|recurring content themes?|regular participation)\b/iu.test(claim)
    ? "the professional groups one defined offer, recurring content themes, and participation evidence around the same problem"
    : input.proposition.visualMechanism === "market-problem-solution-chain" && /\b(?:test|questions?|answer is yes|answer is no)\b/iu.test(claim)
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
  const consequenceAction = (() => {
    switch (input.proposition.visualMechanism) {
      case "promise-value-translation":
        return "the intended customer follows the link from the offered item to the result and obstacle it addresses";
      case "description-to-outcome-framing":
        return "the intended customer turns from the technical components toward the visible customer outcome";
      case "expectation-delivery-check":
        return "the intended customer compares the expected result with the real experience and sees whether delivery is possible";
      case "promise-calibration":
        return "the intended customer sees the realistic promise remain matched to the improved product";
      case "promise-experience-alignment":
        return input.proposition.polarity === "TRANSITION_POSITIVE_TO_NEGATIVE"
          ? "the buyer sees the experience fail to support the expectation, so initial conversion does not become lasting trust"
          : "the buyer compares the expected result with the delivered experience and sees whether the promise remains credible";
      case "reality-bounded-clarity":
        return "the intended customer sees the promise stop at the exact boundary of the present product outcome";
      case "value-adding-follow-up":
        return "the customer receives the useful response and can re-engage without pressure";
      case "pressure-without-value":
        return "the customer pauses because the repeated message adds no new information";
      case "channel-capacity-boundary":
        return "the customer sees reliable responses remain only in the actively managed lanes";
      case "respectful-stop-condition":
        return "the customer retains visible space after the professional stops the contact sequence";
      case "useful-follow-up-evidence":
        return "the customer receives the selected answer or document as new useful information";
      case "relevance-response-reason":
        return "the customer can identify the concrete clarity or information that justifies a response";
      case "platform-attention-tax":
        return "the business operator sees work accumulate without a corresponding buying signal";
      case "response-capacity-readiness":
        return "the customer sees the ready response meet their raised-hand signal";
      case "neglected-account-without-distribution":
        return "the customer signal remains visibly unanswered at the unattended account";
      case "customer-signal-channel-decision":
        return "the business operator selects the strengthen and pause positions from the customer-signal evidence";
      default:
        return consequenceActions[input.proposition.buyerConsequenceFamily];
    }
  })();
  const authorizedConsequenceAction = consequenceAction && canProjectGenericConsequenceActor(input.proposition)
    ? consequenceAction
    : undefined;
  const buyerPerspectiveAction = !authorizedConsequenceAction
    && input.proposition.actorRole !== "buyer"
    ? projectAuthorizedBuyerPerspectiveAction(input.proposition)
    : undefined;
  const concreteAction = conservativeMechanism
    ? specificVisual?.action ?? visual.action
    : specificVisual?.action ?? (claimSpecificAction
    ? `${claimSpecificAction}${authorizedConsequenceAction ?? buyerPerspectiveAction ? `; ${authorizedConsequenceAction ?? buyerPerspectiveAction}` : ""}`
    : authorizedConsequenceAction ?? buyerPerspectiveAction ? `${visual.action}; ${authorizedConsequenceAction ?? buyerPerspectiveAction}` : visual.action);
  const thesis = renderVeronicaVisibleThesis(input.proposition);
  if (input.proposition.narrationNativeMetaphor) {
    return projectNarrationNativeThreshold(input.proposition);
  }
  const actorResolution = resolveVeronicaGenericTreatmentActor(input.proposition);
  const requiresPeopleSafeProjection = !conservativeMechanism
    && (actorResolution.kind !== "AUTHORIZED_ACTOR" || actorResolution.actorRole !== "expert");
  const peopleSafeTreatment = requiresPeopleSafeProjection
    ? projectPeopleSafeGenericTreatment({ proposition: input.proposition, actor: actorResolution })
    : undefined;
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
    subjectRequirement: peopleSafeTreatment?.subjectRequirement ?? (conservativeMechanism
      ? "one occupation-neutral business operator and source-supported transaction objects"
      : input.proposition.actorRole === "none" ? "people-free source-grounded evidence relationship" : "one source-authorized professional with source-grounded evidence"),
    environment: peopleSafeTreatment?.environment ?? (input.preserveEnvironment && samePropositionRevision ? input.scene.treatment.environment : specificVisual?.environment ?? visual.environment),
    composition: peopleSafeTreatment?.composition ?? (input.proposition.polarity === "NEGATIVE_STATE" ? negativeComposition : specificVisual?.composition ?? negativeComposition),
    camera: "documentary eye-level view with the evidence, action, and visible response legible in one frame",
    action: peopleSafeTreatment?.action ?? action,
    actionOwnerRole: input.proposition.actorRole,
    props: peopleSafeTreatment?.props ?? (input.proposition.polarity === "NEGATIVE_STATE" ? negativeProps : specificVisual?.props ?? negativeProps),
    diagram: null,
    strategy: conservativeMechanism
      ? input.proposition.visualMechanism === "input-output-flow" ? "process-visualization" : "comparison-composition"
      : input.proposition.visualMechanism === "peer-referral" || input.proposition.visualMechanism === "relevant-context-participation" ? "social-interaction" : input.proposition.visualMechanism === "audience-fit-signal" || input.proposition.visualMechanism === "problem-first-sequence" ? "client-decision" : "evidence-proof",
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

export type VeronicaTreatmentCompatibilityReason =
  | "visual-fields-do-not-support-mechanism"
  | "stale-environment-for-website-mechanism"
  | "unsupported-doorway-motif"
  | "treatment-polarity-mismatch"
  | "transition-treatment-stuck-in-negative-state"
  | "treatment-causal-order-inversion"
  | `unsupported-treatment-entity:${string}`
  | `unsupported-treatment-action:${string}`
  | `unsupported-treatment-environment:${string}`
  | `unsupported-treatment-symbolism:${string}`
  | `unauthorized-visual-concept:${string}`
  | `treatment-family-mismatch:${string}`;

const concreteTreatmentFamilies: readonly {
  readonly family: string;
  readonly kind: "entity" | "action" | "environment" | "symbolism";
  readonly treatmentPattern: RegExp;
  readonly sourcePattern: RegExp;
}[] = [
  { family: "expertise-recognition", kind: "entity", treatmentPattern: /\b(?:title badge|claimed expertise|expertise cue|work example|reasoning artifact|proof station|professional identity)\b/iu, sourcePattern: /\b(?:expert|expertise|authority|claim|proof|evidence|professional identity|title)\b/iu },
  { family: "audience-offer-fit", kind: "entity", treatmentPattern: /\b(?:audience fit|offer category|who (?:the offer|it) serves|matching their (?:own )?situation|specific sign of fit)\b/iu, sourcePattern: /\b(?:audience|offer|who it serves|customer situation|specific fit|this is for me)\b/iu },
  { family: "first-time-visitor", kind: "entity", treatmentPattern: /\b(?:first-time visitor|new visitor|visitor classification|visitor categorizes?)\b/iu, sourcePattern: /\b(?:visitor|website|site|page|first screen|profile|bio)\b/iu },
  { family: "peer-referral", kind: "action", treatmentPattern: /\b(?:peer referral|peer conversation|introducing gesture|makes? the introduction|points? a peer|matching work example)\b/iu, sourcePattern: /\b(?:peer|refer|referral|recommend|introduc|word of mouth)\b/iu },
  { family: "public-threshold", kind: "environment", treatmentPattern: /\b(?:street-facing public threshold|public threshold|doorway|foothold|future paths?)\b/iu, sourcePattern: /\b(?:doorway|threshold|foothold)\b/iu },
];

export function assessVeronicaVisualConceptAuthorization(input: {
  readonly proposition: VeronicaSemanticProposition;
  readonly treatment: PositioningVisualTreatment;
}): { readonly status: "PASS" | "FAIL"; readonly reasons: readonly `unauthorized-visual-concept:${string}`[] } {
  const visual = `${input.treatment.subjectRequirement} ${input.treatment.environment} ${input.treatment.composition} ${input.treatment.action} ${input.treatment.props.join(" ")}`;
  const source = input.proposition.evidenceSpans.map((span) => span.text).join(" ");
  const authorized = new Set([
    ...input.proposition.visualAuthorization.entities.map((entry) => entry.concept),
    ...input.proposition.visualAuthorization.environments.map((entry) => entry.concept),
    ...input.proposition.visualAuthorization.motifs.map((entry) => entry.concept),
  ].map(normalize));
  const reasons: `unauthorized-visual-concept:${string}`[] = [];
  const requireSource = ["doorway", "threshold", "foothold", "visitor", "customer", "audience-offer-fit", "expertise-recognition"] as const;
  for (const concept of requireSource) {
    if (!new RegExp(`\\b${concept.replaceAll("-", "[- ]")}\\b`, "iu").test(visual)) continue;
    if (!new RegExp(`\\b${concept.replaceAll("-", "[- ]")}\\b`, "iu").test(source) && !authorized.has(normalize(concept))) {
      reasons.push(`unauthorized-visual-concept:${concept}`);
    }
  }
  if (/\bfirst-time visitor\b/iu.test(visual) && !/\b(?:first-time visitor|visitor|website|site|page|first screen|profile|bio)\b/iu.test(source)) {
    reasons.push("unauthorized-visual-concept:first-time-visitor");
  }
  if (/\bprofessional\b/iu.test(visual) && !input.proposition.visualAuthorization.entities.some((entry) => entry.semanticRole === "expert")) {
    reasons.push("unauthorized-visual-concept:professional");
  }
  if (/\bobserver\b/iu.test(visual) && input.proposition.visualEncodingConstraints.neutralObserver === "FORBIDDEN") {
    reasons.push("unauthorized-visual-concept:neutral-observer");
  }
  for (const occupation of ["consultant", "coach", "designer", "lawyer", "architect", "accountant", "therapist", "engineer"] as const) {
    if (new RegExp(`\\b${occupation}\\b`, "iu").test(visual) && !new RegExp(`\\b${occupation}\\b`, "iu").test(source)) {
      reasons.push(`unauthorized-visual-concept:${occupation}`);
    }
  }
  const unique = [...new Set(reasons)];
  return { status: unique.length === 0 ? "PASS" : "FAIL", reasons: unique };
}

export function assessVeronicaTreatmentPropositionCompatibility(input: { readonly treatment: PositioningVisualTreatment; readonly proposition: VeronicaSemanticProposition; readonly narration: string; readonly episodeMotifSupported?: boolean }): { readonly status: "PASS" | "FAIL"; readonly reasons: readonly VeronicaTreatmentCompatibilityReason[] } {
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
    "promise-value-translation": /\b(?:promise|value|result|obstacle|offered item)\b/iu,
    "description-to-outcome-framing": /\b(?:technical|component|outcome|result|offer)\b/iu,
    "expectation-delivery-check": /\b(?:expectation|expected|experience|deliver|result)\b/iu,
    "promise-calibration": /\b(?:promise|product|realistic|oversized|calibrat)\b/iu,
    "promise-experience-alignment": /\b(?:promise|message|experience|conversion|trust|deliver)\b/iu,
    "reality-bounded-clarity": /\b(?:promise|reality|present|clarity|outcome)\b/iu,
    "value-adding-follow-up": /\b(?:follow.up|question|information|deadline|agreed)\b/iu,
    "pressure-without-value": /\b(?:chasing|pressure|message|information|attention)\b/iu,
    "channel-capacity-boundary": /\b(?:channel|lane|active|inactive|response)\b/iu,
    "respectful-stop-condition": /\b(?:contact|stop|space|respond|quiet)\b/iu,
    "useful-follow-up-evidence": /\b(?:follow.up|question|example|document|deadline)\b/iu,
    "relevance-response-reason": /\b(?:relevance|follow.up|clarity|information|respond)\b/iu,
    "platform-attention-tax": /\b(?:platform|channel|attention|signal|replies|moderation)\b/iu,
    "response-capacity-readiness": /\b(?:channel|respond|response|raised.hand|customer)\b/iu,
    "neglected-account-without-distribution": /\b(?:account|distribution|response|waiting|unattended)\b/iu,
    "customer-signal-channel-decision": /\b(?:channel|customer|signal|strengthen|pause|measurable)\b/iu,
    "work-expertise-separation": /\b(?:professional work|work process|substantive work|expert result|actual expertise|external observer|external recognition)\b/iu,
    "market-problem-solution-chain": /\b(?:market|problem|response|solution|group)\b/iu,
    "problem-first-sequence": /\b(?:problem|package|feature|response|customer)\b/iu,
    "peer-referral": /\b(?:peer|refer|introduc|recommend)\b/iu,
    "quantity-comparison": /\b(?:quantity|proportion|incoming|retained|larger|smaller|comparison)\b/iu,
    "input-output-flow": /\b(?:flow|incoming|cost|remov|remainder|sale|transaction)\b/iu,
    "retained-remainder": /\b(?:incoming|outgoing|retained|remainder|deplet|payment|cost)\b/iu,
    "workload-accumulation": /\b(?:workload|order|volume|pile|retained|repeated)\b/iu,
    "scaling-relation": /\b(?:baseline|expanded|volume|scal|order flow|retained)\b/iu,
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
    const stateWords = contentTokens(value ?? "");
    if (stateWords.length < 2) return -1;
    for (let index = 0; index <= actionWords.length - stateWords.length; index += 1) {
      if (stateWords.every((word, offset) => actionWords[index + offset] === word)) {
        return index;
      }
    }
    return -1;
  };
  const initialPosition = firstStatePosition(orderedStates?.initialState);
  const desiredPosition = firstStatePosition(orderedStates?.desiredState);
  const causalOrderInverted = (input.proposition.stateRelation === "CAUSAL_BEFORE_AFTER" || input.proposition.stateRelation === "SEQUENTIAL_PROGRESSION")
    && initialPosition >= 0 && desiredPosition >= 0 && desiredPosition < initialPosition;
  const unsupportedConcreteSemantics = concreteTreatmentFamilies.flatMap((family): VeronicaTreatmentCompatibilityReason[] => {
    if (!family.treatmentPattern.test(visual) || family.sourcePattern.test(input.narration) || (family.family === "public-threshold" && input.episodeMotifSupported)) return [];
    return [`unsupported-treatment-${family.kind}:${family.family}`];
  });
  const leakedPositioningFamily = isConservativeVisualMechanism(input.proposition.visualMechanism)
    && unsupportedConcreteSemantics.some((reason) => !reason.includes("public-threshold"));
  const authorization = assessVeronicaVisualConceptAuthorization({
    proposition: input.proposition,
    treatment: input.treatment,
  });
  const reasons: VeronicaTreatmentCompatibilityReason[] = [
    ...(expected && !expected.test(visual) ? ["visual-fields-do-not-support-mechanism" as const] : []),
    ...(staleWebsiteEnvironment ? ["stale-environment-for-website-mechanism" as const] : []),
    ...(unsupportedDoorway ? ["unsupported-doorway-motif" as const] : []),
    ...(polarityMismatch ? ["treatment-polarity-mismatch" as const] : []),
    ...(transitionStuckInWrongState ? ["transition-treatment-stuck-in-negative-state" as const] : []),
    ...(causalOrderInverted ? ["treatment-causal-order-inversion" as const] : []),
    ...unsupportedConcreteSemantics,
    ...authorization.reasons,
    ...(leakedPositioningFamily ? ["treatment-family-mismatch:positioning-expertise"] as const : []),
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
    visuallyExpressible: !abstractOnly.test(thesis) && /\b(?:person|people|customer|visitor|observer|professional|operator|message|screen|display|evidence|artifact|problem|response|offer|profile|website|work|workload|signal|crowd|peer|participant|page|proof|result|route|doorway|threshold|sale|order|payment|cost|remainder|quantity|flow|volume|margin|revenue)\b/iu.test(`${thesis} ${input.treatment.action} ${input.treatment.props.join(" ")}`),
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
  const visibleThesis = prompt.match(/Visible thesis:\s*([^\n]*?)(?=\s+(?:No readable|Render this|Capture |Prior context:|Primary actor:|Current action:|Emerging consequence:)|$)/iu)?.[1]?.trim() ?? "";
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
