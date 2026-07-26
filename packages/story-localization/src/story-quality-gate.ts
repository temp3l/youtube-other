import {
  countSpokenWords,
  normalizeWhitespace,
  splitIntoSentences,
} from "@mediaforge/shared";
import {
  type RepairScope,
  type StoryArtifactKind,
  type StoryGenerationBudget,
  type StoryQualityFinding,
  type StoryQualityGateResult,
} from "./story-generation-contracts.js";
import {
  type CanonicalStoryFacts,
  type LanguageCode,
} from "./story-localization.types.js";
import {
  canonicalHookEntities,
  validateSemanticOpeningHook,
} from "./story-semantic-validation.js";
import { detectProfessionalStoryQualityIssues } from "./professional-story-contracts.js";

export const storyAnalysisDeterministicCheckIds = [
  "source-fidelity",
  "source-lineage",
  "accepted-final-line",
  "rename-map",
  "canonical-identity",
  "duration",
  "narration-only",
  "affect-projection",
] as const;
export type StoryAnalysisDeterministicCheckId =
  (typeof storyAnalysisDeterministicCheckIds)[number];

export interface StoryAnalysisDeterministicCheck {
  readonly id: StoryAnalysisDeterministicCheckId;
  readonly pass: boolean;
  readonly reason: string;
}

export interface StoryAnalysisDeterministicContractResult {
  readonly pass: boolean;
  readonly checks: readonly StoryAnalysisDeterministicCheck[];
  readonly failedChecks: readonly StoryAnalysisDeterministicCheck[];
}

const storyAnalysisDeterministicCheckLabels: Readonly<
  Record<StoryAnalysisDeterministicCheckId, string>
> = {
  "source-fidelity": "Source fidelity is valid.",
  "source-lineage": "Source lineage is present and current.",
  "accepted-final-line": "The accepted final line or consequence is preserved.",
  "rename-map": "The accepted character rename map is preserved.",
  "canonical-identity": "The canonical story identity is current.",
  duration: "Narration duration remains within the accepted contract.",
  "narration-only": "The artifact contains narration-only story output.",
  "affect-projection": "The applicable affect projection is valid.",
};

export function buildStoryAnalysisDeterministicContractResult(
  args: {
    readonly failures?: Partial<
      Readonly<Record<StoryAnalysisDeterministicCheckId, string>>
    >;
  } = {}
): StoryAnalysisDeterministicContractResult {
  const checks = storyAnalysisDeterministicCheckIds.map((id) => ({
    id,
    pass: args.failures?.[id] === undefined,
    reason: args.failures?.[id] ?? storyAnalysisDeterministicCheckLabels[id],
  }));
  const failedChecks = checks.filter((check) => !check.pass);
  return {
    pass: failedChecks.length === 0,
    checks,
    failedChecks,
  };
}

const BANNED_OUTLINE_PHRASES = [
  "the protagonist",
  "the account became frightening because",
  "the next event",
  "a witness, recording or physical mark",
  "a witness, recording, or physical mark",
  "a familiar voice, memory or place",
  "the official explanation covered",
  "the surviving evidence did not prove",
  "the central rule",
  "this story follows",
  "in this story",
  "summary",
  "outline",
  "here is the story",
  "the story begins",
  "the threat follows a rule",
  "the final evidence appears",
  "the first real warning came",
  "what followed changed everything",
  "the danger became personal",
  "the pattern became worse",
  "the apparent ending did not survive",
  "the final piece of evidence arrived later",
  "all clues are connected to",
  "alle hinweise stehen im zusammenhang",
  "die geschichte beginnt",
  "die bedrohung folgt einer regel",
  "später erscheint ein letzter beweis",
  "the discovery changed the emotional stakes",
  "at this point, the account accelerated",
  "the purpose of the sound was",
  "the story remains disturbing because",
  "the final action worked because",
  "a second proof confirmed",
  "the central sign returned from an impossible location",
  "the environment reorganized around one person",
  "all clues are connected to",
  "central motif returns",
  "it remains consistent in timing",
  "alle hinweise stehen im zusammenhang",
  "das zentrale motiv kehrt",
  "todas las pistas están relacionadas",
  "el motivo central vuelve",
  "tous les indices sont liés",
  "le motif central revient",
  "todas as pistas estão relacionadas",
  "o motivo central volta",
  "el protagonista",
  "le protagoniste",
  "o protagonista",
  "die hauptfigur",
];

const ABSTRACT_COMMENTARY_PATTERNS = [
  /\b(?:discovery|reveal|moment|detail|incident|account|proof|evidence|sign|environment)\s+(?:changed|accelerated|confirmed|returned|reorganized|increased|established)\b/iu,
  /\b(?:emotional stakes|story structure|sound motif|audience|viewer|listener|tension|danger|threat)\s+(?:changed|increases|recognise|recognize|functions|works|matters|means)\b/iu,
  /\b(?:purpose|point|function|meaning|implication)\s+of\s+(?:the\s+)?(?:scene|sound|ending|detail|reveal)\b/iu,
  /\b(?:the story|the scene|the ending|the climax|the final action)\s+(?:remains|works|functions|shows|demonstrates|is disturbing because)\b/iu,
  /\b(?:the account|the next event|the surviving evidence|the official explanation|the protagonist)\b/iu,
  /\b(?:witness|recording|physical mark|sound|object|warning|authorities|relatives)\s+or\s+(?:physical mark|warning|relatives)\b/iu,
  /\b(?:attention|invitation|response|error)\b[^.?!]{0,90}\b(?:attention|invitation|response|error)\b/iu,
  /\b(?:atención|invitación|respuesta|error)\b[^.?!]{0,90}\b(?:atención|invitación|respuesta|error)\b/iu,
  /\b(?:attention|invitation|réponse|erreur)\b[^.?!]{0,90}\b(?:attention|invitation|réponse|erreur)\b/iu,
  /\b(?:atenção|convite|resposta|erro)\b[^.?!]{0,90}\b(?:atenção|convite|resposta|erro)\b/iu,
] as const;

const CONCRETE_DETAIL_PATTERNS = [
  /\b(?:opened|closed|picked|pressed|turned|stepped|ran|dragged|held|dropped|cut|sealed|painted|scanned|watched|heard|saw|entered|removed|retrieved|rang|ringing|answer|answered|grabbed|taped|slammed|shook|showed|displayed|vibrated|recorded|whispered)\b/iu,
  /\b(?:door|window|canvas|portrait|painting|mug|watch|light|camera|scanner|room|floor|wall|hand|face|glass|mirror|varnish|primer|phone|receiver|recorder|bell|bells|cable|shelf|booth|car|mobile|cradle|photograph|number)\b/iu,
  /\b(?:wet|cold|white|red|silver|dark|bright|silent|loud|stale|dust|smell|sound|shadow|reflection|rain|lightning|storm|thunder|static)\b/iu,
  /(?:öffnete|schloss|drückte|drehte|rannte|zog|hielt|ließ|schnitt|versiegelte|sah|hörte|verbrannte|verriegelte|abrió|cerró|corrió|arrastró|sostuvo|soltó|cortó|selló|vio|oyó|quemó|abriu|fechou|correu|arrastou|segurou|soltou|cortou|selou|viu|ouviu|queimou|ouvrit|ferma|courut|traîna|tint|lâcha|coupa|scella|vit|entendit|brûla)/iu,
  /(?:tür|fenster|zimmer|wand|hand|gesicht|glas|spiegel|puppe|kleid|foto|treppe|truhe|waschbecken|puerta|ventana|habitación|pared|mano|cara|vidrio|espejo|muñeca|vestido|foto|escalera|baúl|lavabo|porta|janela|sala|parede|mão|rosto|vidro|espelho|boneca|roupa|escada|baú|pia|porte|fenêtre|pièce|mur|main|visage|verre|miroir|poupée|robe|escalier|coffre|lavabo)/iu,
  /(?:nass|kalt|weiß|rot|dunkel|hell|still|laut|staub|geruch|schatten|spiegelung|mojado|frío|blanco|oscuro|silencio|sombra|molhado|frio|branco|escuro|silêncio|sombra|mouillé|froid|blanc|sombre|silence|ombre)/iu,
] as const;

const LOCALIZED_EMOTIONAL_COST_PATTERN =
  /(?:verweiger|opfer|verlass|zerstör|verrat|akzeptier|ignorier|zurücklass|ablehn|aufgeb|verlier|verbrann|rechaz|sacrific|abandon|destru|traicion|acept|ignor|dej|renunci|perd|recus|trai|aceit|deix|refus|abandonn|détru|trahi|laiss|renonc|brûl)/iu;

const LOCALIZED_ATTACHMENT_PATTERN =
  /(?:versprechen|schuld|stimme|geliebt|vertraut|beweis|aufnahme|name|scham|vertrauen|promesa|culpa|voz|amado|familiar|prueba|grabación|nombre|vergüenza|confianza|promessa|prova|gravação|vergonha|confi|promesse|voix|aimé|preuve|enregistrement|honte)/iu;

const LOCALIZED_CONCRETE_HOOK_PATTERN =
  /(?:tür|spiegel|telefon|stimme|puppe|puerta|espejo|teléfono|voz|muñeca|porta|espelho|telefone|boneca|porte|miroir|téléphone|voix|poupée)/iu;

function normalizeForDuplicate(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[`*_>#-]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function paragraphDuplicates(text: string): readonly string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const paragraph of text.split(/\n{2,}/u)) {
    const normalized = normalizeForDuplicate(paragraph);
    if (normalized.length < 40) {
      continue;
    }
    if (seen.has(normalized)) {
      duplicates.push(normalized.slice(0, 80));
    }
    seen.add(normalized);
  }
  return duplicates;
}

function tokenizeNormalized(value: string): readonly string[] {
  const normalized = normalizeForDuplicate(value);
  return normalized.split(/\s+/u).filter((token) => token.length >= 4);
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenizeNormalized(left));
  const rightTokens = new Set(tokenizeNormalized(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

const RULE_MATCH_STOPWORDS = new Set([
  "after",
  "away",
  "before",
  "each",
  "every",
  "from",
  "into",
  "make",
  "that",
  "their",
  "then",
  "when",
  "with",
]);

function normalizeRuleToken(token: string): string {
  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }
  if (token.endsWith("ed") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

function semanticRuleTokens(value: string): ReadonlySet<string> {
  return new Set(
    tokenizeNormalized(value)
      .map(normalizeRuleToken)
      .filter((token) => !RULE_MATCH_STOPWORDS.has(token))
  );
}

function hasSemanticRuleEvidence(text: string, rule: string): boolean {
  const ruleTokens = semanticRuleTokens(rule);
  if (ruleTokens.size < 3) {
    return false;
  }
  return splitIntoSentences(text).some((sentence) => {
    const sentenceTokens = semanticRuleTokens(sentence);
    let overlap = 0;
    for (const token of ruleTokens) {
      if (sentenceTokens.has(token)) {
        overlap += 1;
      }
    }
    return overlap >= 3 && overlap / ruleTokens.size >= 0.5;
  });
}

function nearDuplicateParagraphs(text: string): readonly string[] {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => normalizeForDuplicate(paragraph).length >= 60);
  const duplicates: string[] = [];
  for (let left = 0; left < paragraphs.length; left += 1) {
    for (let right = left + 1; right < paragraphs.length; right += 1) {
      const leftParagraph = paragraphs[left];
      const rightParagraph = paragraphs[right];
      if (
        leftParagraph &&
        rightParagraph &&
        tokenSimilarity(leftParagraph, rightParagraph) >= 0.82
      ) {
        duplicates.push(rightParagraph.slice(0, 100));
      }
    }
  }
  return duplicates;
}

function repeatedSentenceOpenings(
  sentences: readonly string[]
): readonly string[] {
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    const opening = tokenizeNormalized(sentence).slice(0, 4).join(" ");
    if (opening.length < 12) {
      continue;
    }
    counts.set(opening, (counts.get(opening) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([opening]) => opening);
}

function paragraphIndexForExcerpt(
  text: string,
  excerpt: string
): number | undefined {
  const normalizedExcerpt = normalizeWhitespace(excerpt).slice(0, 40);
  const paragraphs = text.split(/\n{2,}/u);
  const index = paragraphs.findIndex((paragraph) =>
    normalizeWhitespace(paragraph).includes(normalizedExcerpt)
  );
  return index >= 0 ? index : undefined;
}

function includesAny(
  lower: string,
  values: readonly string[] | undefined
): boolean {
  return (values ?? []).some((value) => lower.includes(value.toLowerCase()));
}

function hasEmotionalCost(
  text: string,
  facts: CanonicalStoryFacts,
  language: LanguageCode
): boolean {
  const lower = text.toLowerCase();
  const cost = facts.emotionalCost?.toLowerCase();
  const attachment = facts.protagonistAttachment?.toLowerCase();
  const hasCostVerb =
    /\b(refus|sacrific|abandon|destroy|burn|betray|accept|ignore|leave|reject|give up|lose)\w*\b/iu.test(
      text
    ) || LOCALIZED_EMOTIONAL_COST_PATTERN.test(text);
  const hasAttachment =
    /\bpromise|guilt|voice|loved|familiar|proof|recording|name|shame|trust\b/iu.test(
      text
    ) || LOCALIZED_ATTACHMENT_PATTERN.test(text);
  return (
    hasCostVerb &&
    (cost
      ? language !== "en" ||
        lower.includes(cost.slice(0, Math.min(32, cost.length))) ||
        includesAny(lower, [cost])
      : true) &&
    (attachment
      ? (language === "en" && includesAny(lower, [attachment])) || hasAttachment
      : true)
  );
}

function finding(args: {
  readonly code: string;
  readonly message: string;
  readonly severity: "warning" | "error";
  readonly category?: StoryQualityFinding["category"];
  readonly evidence?: readonly string[];
  readonly repairable?: boolean;
  readonly repairScope?: RepairScope;
  readonly deterministicFix?: string;
  readonly language?: string | undefined;
  readonly paragraphIndex?: number | undefined;
  readonly excerpt?: string | undefined;
  readonly explanation?: string | undefined;
  readonly suggestedRepairAction?: string | undefined;
}): StoryQualityFinding {
  return {
    code: args.code,
    message: args.message,
    severity: args.severity,
    ...(args.category !== undefined ? { category: args.category } : {}),
    ...(args.evidence !== undefined ? { evidence: args.evidence } : {}),
    ...(args.repairable !== undefined ? { repairable: args.repairable } : {}),
    ...(args.repairScope !== undefined
      ? { repairScope: args.repairScope }
      : {}),
    ...(args.deterministicFix !== undefined
      ? { deterministicFix: args.deterministicFix }
      : {}),
    ...(args.language !== undefined ? { language: args.language } : {}),
    ...(args.paragraphIndex !== undefined
      ? { paragraphIndex: args.paragraphIndex }
      : {}),
    ...(args.excerpt !== undefined ? { excerpt: args.excerpt } : {}),
    ...(args.explanation !== undefined
      ? { explanation: args.explanation }
      : {}),
    ...(args.suggestedRepairAction !== undefined
      ? { suggestedRepairAction: args.suggestedRepairAction }
      : {}),
  };
}

function abstractCommentarySentences(text: string): readonly string[] {
  return splitIntoSentences(text).filter((sentence) =>
    ABSTRACT_COMMENTARY_PATTERNS.some((pattern) => pattern.test(sentence))
  );
}

function concreteSentenceRatio(sentences: readonly string[]): number {
  if (sentences.length === 0) {
    return 0;
  }
  const concrete = sentences.filter((sentence) =>
    CONCRETE_DETAIL_PATTERNS.some((pattern) => pattern.test(sentence))
  ).length;
  return concrete / sentences.length;
}

export function runStoryQualityGate(args: {
  readonly artifactKind: StoryArtifactKind;
  readonly language: LanguageCode;
  readonly text: string;
  readonly facts: CanonicalStoryFacts;
  readonly budget: StoryGenerationBudget;
  readonly targetWordRange?: { readonly min: number; readonly max: number };
  readonly sourceWordCount?: number;
  readonly lengthRatioWarningMin?: number;
  readonly lengthRatioBlockMin?: number;
  readonly lengthRatioWarningMax?: number;
  readonly lengthRatioBlockMax?: number;
}): StoryQualityGateResult {
  const findings: StoryQualityFinding[] = [];
  const warnings: string[] = [];
  const normalized = normalizeWhitespace(args.text);
  const lower = ` ${normalized.toLowerCase()} `;
  const sentences = splitIntoSentences(normalized);
  const wordCount = countSpokenWords(normalized);
  const repairScopes = new Set<RepairScope>();
  const deterministicFixes = new Set<string>();

  for (const professionalIssue of detectProfessionalStoryQualityIssues(
    normalized
  )) {
    findings.push(
      finding({
        code: professionalIssue.code,
        message: professionalIssue.message,
        severity: "error",
        language: args.language,
        category:
          professionalIssue.code === "UNRESOLVED_TEMPLATE_ALTERNATIVE"
            ? "template-leakage"
            : "abstract-language",
        repairable: true,
        repairScope: "targeted-short-repair",
        explanation:
          "Professional narration must depict concrete story events instead of exposing editorial scaffolding.",
        suggestedRepairAction:
          "Replace the flagged language with a specific character action, physical object, observable result, and consequence.",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  if (args.targetWordRange) {
    if (
      wordCount < args.targetWordRange.min ||
      wordCount > args.targetWordRange.max
    ) {
      findings.push(
        finding({
          code: "WORD_RANGE_INVALID",
          message: `Narration word count ${wordCount} is outside ${args.targetWordRange.min}-${args.targetWordRange.max}.`,
          severity: "error",
          category: "length-mismatch",
          repairable: true,
          repairScope: "targeted-short-repair",
        })
      );
      repairScopes.add("targeted-short-repair");
    }
  }

  if (args.sourceWordCount && args.sourceWordCount > 0) {
    const ratio = wordCount / args.sourceWordCount;
    const warningMin = args.lengthRatioWarningMin ?? 0.9;
    const blockMin = args.lengthRatioBlockMin ?? 0.85;
    const warningMax = args.lengthRatioWarningMax ?? 1.1;
    const blockMax = args.lengthRatioBlockMax;
    if (ratio < blockMin || (blockMax !== undefined && ratio > blockMax)) {
      findings.push(
        finding({
          code: "SOURCE_LENGTH_RATIO_BLOCKED",
          message: `Narration/source word ratio ${ratio.toFixed(2)} is outside blocking limits.`,
          severity: "error",
          category: "length-mismatch",
          repairable: true,
          repairScope: "targeted-short-repair",
        })
      );
      repairScopes.add("targeted-short-repair");
    } else if (ratio < warningMin || ratio > warningMax) {
      findings.push(
        finding({
          code: "SOURCE_LENGTH_RATIO_WARNING",
          message: `Narration/source word ratio ${ratio.toFixed(2)} is outside warning limits.`,
          severity: "warning",
          category: "length-mismatch",
          repairable: true,
        })
      );
    }
  }

  if (
    args.budget.maxOutputTokens !== undefined &&
    args.budget.maxOutputTokens > 0
  ) {
    const estimatedTokens = Math.ceil(normalized.length / 4);
    if (estimatedTokens > args.budget.maxOutputTokens * 0.8) {
      warnings.push("Output is close to the configured max output token cap.");
    }
  }

  if (
    (normalized.match(/<!--\s*mediaforge:generated-full-story\s*-->/gu) ?? [])
      .length > 1
  ) {
    findings.push(
      finding({
        code: "DUPLICATE_GENERATED_MARKER",
        message: "Duplicate generated provenance markers detected.",
        severity: "error",
        repairScope: "generated-marker-replacement",
        deterministicFix: "dedupe-generated-marker",
      })
    );
    repairScopes.add("generated-marker-replacement");
    deterministicFixes.add("dedupe-generated-marker");
  }

  const duplicates = paragraphDuplicates(args.text);
  if (duplicates.length > 0) {
    findings.push(
      finding({
        code: "DUPLICATE_NARRATIVE_PARAGRAPH",
        message: "Duplicate or near-duplicate narrative paragraphs detected.",
        severity: "error",
        language: args.language,
        excerpt: duplicates[0],
        paragraphIndex:
          duplicates[0] !== undefined
            ? paragraphIndexForExcerpt(args.text, duplicates[0])
            : undefined,
        explanation:
          "A final narration artifact repeated a normalized paragraph.",
        suggestedRepairAction:
          "Regenerate or repair from the canonical source and remove repeated boilerplate before downstream production.",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const nearDuplicates = nearDuplicateParagraphs(args.text);
  if (nearDuplicates.length > 0) {
    findings.push(
      finding({
        code: "NEAR_DUPLICATE_NARRATIVE_PARAGRAPH",
        message: "Near-duplicate narrative paragraphs detected.",
        severity: "error",
        language: args.language,
        excerpt: nearDuplicates[0],
        paragraphIndex:
          nearDuplicates[0] !== undefined
            ? paragraphIndexForExcerpt(args.text, nearDuplicates[0])
            : undefined,
        explanation:
          "Paragraphs are not byte-identical but repeat the same normalized content.",
        suggestedRepairAction:
          "Repair only the repeated paragraphs from source events; do not append motif boilerplate after each paragraph.",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const repeatedOpenings = repeatedSentenceOpenings(sentences);
  if (repeatedOpenings.length > 0) {
    findings.push(
      finding({
        code: "REPEATED_SENTENCE_OPENING",
        message: "Narration repeats the same sentence opening too often.",
        severity: "error",
        language: args.language,
        excerpt: repeatedOpenings[0],
        explanation:
          "Repeated sentence openings are a structural sign of stitched template or retry output.",
        suggestedRepairAction:
          "Repair repeated sections into source-grounded events with varied concrete actions.",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const bannedPhrase = BANNED_OUTLINE_PHRASES.find((phrase) =>
    lower.includes(` ${phrase} `)
  );
  if (bannedPhrase) {
    findings.push(
      finding({
        code: "BANNED_OUTLINE_PHRASE",
        message: `Narration includes banned outline phrase: ${bannedPhrase}.`,
        severity: "error",
        category: "template-leakage",
        evidence: [bannedPhrase],
        language: args.language,
        paragraphIndex: paragraphIndexForExcerpt(args.text, bannedPhrase),
        excerpt: bannedPhrase,
        explanation:
          "The narration includes planning, motif, or outline language instead of an in-scene event.",
        suggestedRepairAction:
          "Replace the phrase with a concrete event from the canonical story and rerun validation.",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const abstractSentences = abstractCommentarySentences(normalized);
  if (abstractSentences.length > 0) {
    findings.push(
      finding({
        code: "ABSTRACT_PLANNING_LANGUAGE",
        message:
          "Narration contains planning-language or story-analysis leakage.",
        severity: "error",
        category: "abstract-language",
        evidence: abstractSentences.slice(0, 3),
        language: args.language,
        paragraphIndex:
          abstractSentences[0] !== undefined
            ? paragraphIndexForExcerpt(args.text, abstractSentences[0])
            : undefined,
        excerpt: abstractSentences[0],
        explanation:
          "A sentence describes narrative function, evidence category, or audience effect.",
        suggestedRepairAction:
          "Repair the sentence into story-specific actions, evidence, rule discovery, or consequence.",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const concreteRatio = concreteSentenceRatio(sentences);
  const concreteRatioMinimum = args.artifactKind === "short" ? 0.45 : 0.35;
  if (sentences.length >= 6 && concreteRatio < concreteRatioMinimum) {
    findings.push(
      finding({
        code: "CONCRETE_DETAIL_DENSITY_LOW",
        message:
          "Narration has too few observable actions, objects, sensory details, discoveries, decisions, or consequences.",
        severity: "error",
        category: "abstract-language",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const titleAnchor = args.facts.primaryTitle.toLowerCase();
  if (titleAnchor && lower.split(titleAnchor).length > 4) {
    findings.push(
      finding({
        code: "TITLE_USED_AS_GENERIC_ANCHOR",
        message:
          "Story title is repeated as a generic anchor instead of natural narration.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  for (const name of args.facts.protagonistNames ?? []) {
    if (!lower.includes(` ${name.toLowerCase()} `)) {
      const code =
        args.artifactKind === "short"
          ? "CANONICAL_NAME_MISSING"
          : "CANONICAL_NAME_NOT_EXPLICIT";
      if (args.artifactKind === "short") {
        findings.push(
          finding({
            code,
            message: `Canonical protagonist name is missing: ${name}.`,
            severity: "error",
            category: "missing-character",
            repairable: true,
            repairScope: "canonical-name-repair",
          })
        );
        repairScopes.add("canonical-name-repair");
      } else {
        warnings.push(
          `Canonical protagonist name is not explicit in the generated text: ${name}.`
        );
      }
    }
  }

  const criticalObjects = args.facts.keyObjects ?? args.facts.criticalObjects;
  const missingObjects = criticalObjects.filter(
    (object) => !lower.includes(object.toLowerCase())
  );
  if (
    criticalObjects.length > 0 &&
    missingObjects.length > Math.max(0, criticalObjects.length - 2)
  ) {
    findings.push(
      finding({
        code: "CONCRETE_OBJECTS_MISSING",
        message: `Generated text omits too many canonical objects: ${missingObjects.join(", ")}.`,
        severity: "error",
        category: "missing-object",
        evidence: missingObjects.slice(0, 5),
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const locations = args.facts.concreteLocations ?? args.facts.locationAnchors;
  if (
    args.artifactKind === "short" &&
    locations &&
    locations.length > 0 &&
    !includesAny(lower, locations)
  ) {
    findings.push(
      finding({
        code: "CONCRETE_LOCATION_MISSING",
        message: "Short omits canonical concrete locations.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  for (const invention of args.facts.forbiddenInventions ?? []) {
    if (lower.includes(` ${invention.toLowerCase()} `)) {
      const repairScope =
        invention === "Funkgerät"
          ? "german-compound-repair"
          : "targeted-short-repair";
      findings.push(
        repairScope === "german-compound-repair"
          ? finding({
              code: "FORBIDDEN_INVENTION",
              message: `Forbidden invention detected: ${invention}.`,
              severity: "error",
              repairScope,
              deterministicFix: "repair-german-compounds",
            })
          : finding({
              code: "FORBIDDEN_INVENTION",
              message: `Forbidden invention detected: ${invention}.`,
              severity: "error",
              repairScope,
            })
      );
      if (invention === "Funkgerät") {
        repairScopes.add("german-compound-repair");
        deterministicFixes.add("repair-german-compounds");
      } else {
        repairScopes.add("targeted-short-repair");
      }
    }
  }

  if (
    args.language === "de" &&
    /\bServic Eingang\b|\bServic eflur\b/iu.test(normalized)
  ) {
    findings.push(
      finding({
        code: "MALFORMED_GERMAN_COMPOUND",
        message: "Malformed German service compounds detected.",
        severity: "error",
        repairScope: "german-compound-repair",
        deterministicFix: "repair-german-compounds",
      })
    );
    repairScopes.add("german-compound-repair");
    deterministicFixes.add("repair-german-compounds");
  }

  const finalSentence = normalizeWhitespace(sentences.at(-1) ?? normalized);
  if (
    args.language === "en" &&
    args.facts.requiredFinalLine &&
    finalSentence !== args.facts.requiredFinalLine
  ) {
    findings.push(
      finding({
        code: "FINAL_STING_MISSING",
        message: "Required final sting line is missing or altered.",
        severity: "error",
        repairScope: "final-sting-repair",
        deterministicFix: "repair-final-sting",
      })
    );
    repairScopes.add("final-sting-repair");
    deterministicFixes.add("repair-final-sting");
  }
  if (
    args.facts.supernaturalRule &&
    !includesAny(lower, [args.facts.supernaturalRule]) &&
    !hasSemanticRuleEvidence(normalized, args.facts.supernaturalRule) &&
    !/\bdo not\b|\bdon't\b|\bnever\b|\bmust\b|\brule\b/iu.test(normalized)
  ) {
    findings.push(
      finding({
        code: "SUPERNATURAL_RULE_MISSING",
        message: "Generated text does not include a visible supernatural rule.",
        severity: "error",
        category: "missing-event",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  if (
    /\b(?:attention|invitation|response|error|atención|invitación|respuesta|attention|réponse|erreur|atenção|convite|resposta|erro)\b/iu.test(
      normalized
    ) &&
    /\b(?:or|oder|ou|o)\b/iu.test(normalized)
  ) {
    findings.push(
      finding({
        code: "SUPERNATURAL_RULE_ALTERNATIVES_UNRESOLVED",
        message:
          "Supernatural rule is expressed as unresolved alternatives instead of one committed rule.",
        severity: "error",
        category: "rule-contradiction",
        language: args.language,
        explanation:
          "Narration must preserve the selected trigger/consequence/limitation rather than listing possible prompt examples.",
        suggestedRepairAction:
          "State the single canonical rule and use it consistently through the climax.",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  if (!hasEmotionalCost(normalized, args.facts, args.language)) {
    findings.push(
      finding({
        code: "EMOTIONAL_COST_MISSING",
        message:
          "Ending lacks a concrete protagonist attachment and emotionally costly final decision.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  if (
    args.language === "en" &&
    args.facts.requiredFinalReveal &&
    !lower.includes(args.facts.requiredFinalReveal.toLowerCase())
  ) {
    findings.push(
      finding({
        code: "FINAL_REVEAL_MISSING",
        message: "Required final reveal is missing.",
        severity: "error",
        category: "missing-ending",
        repairable: true,
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }
  if (args.artifactKind === "short" && !/\?|!|\./u.test(finalSentence)) {
    findings.push(
      finding({
        code: "FINAL_STING_WEAK",
        message: "Short is missing a clear final sting sentence.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const abstractSignals = ["story", "mystery", "terror", "summary", "follows"];
  const abstractHits = abstractSignals.filter((entry) =>
    lower.includes(` ${entry} `)
  ).length;
  if (abstractHits >= 3 && args.artifactKind === "short") {
    findings.push(
      finding({
        code: "ABSTRACTION_HIGH",
        message:
          "Narration reads too abstractly instead of as a concrete micro-story.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  if (args.artifactKind === "short") {
    const firstTwoSentences = sentences.slice(0, 2).join(" ");
    const semanticHook = validateSemanticOpeningHook({
      opening: firstTwoSentences,
      entities: canonicalHookEntities(args.facts),
    });
    if (
      !semanticHook.valid &&
      !LOCALIZED_CONCRETE_HOOK_PATTERN.test(firstTwoSentences)
    ) {
      findings.push(
        finding({
          code: "SHORT_CONCRETE_HOOK_MISSING",
          message: "Short does not start with a concrete impossible detail.",
          severity: "error",
          repairScope: "targeted-short-repair",
        })
      );
      repairScopes.add("targeted-short-repair");
    }
  }

  const errorCount = findings.filter(
    (entry) => entry.severity === "error"
  ).length;
  const repairable =
    errorCount > 0 &&
    findings.every(
      (entry) =>
        entry.repairScope !== undefined &&
        [
          "metadata-deduplication",
          "generated-marker-replacement",
          "german-compound-repair",
          "canonical-name-repair",
          "final-sting-repair",
          "targeted-short-repair",
        ].includes(entry.repairScope)
    );
  return {
    status: errorCount === 0 ? "PASS" : repairable ? "REPAIRABLE" : "FAIL",
    findings,
    warnings,
    repairScopes: [...repairScopes],
    deterministicFixes: [...deterministicFixes],
  };
}
