import { countSpokenWords, normalizeWhitespace } from "@mediaforge/shared";
import {
  type FullStoryOutputConstraints,
  type ShortStoryOutputConstraints,
  type StoryIR,
} from "./story-artifact-model.js";
import {
  DEFAULT_GENRE_POLICY_REGISTRY,
  resolveGenrePolicy,
  validateGenrePolicyCompatibility,
} from "./genre-policy.js";
import {
  type CanonicalStoryFacts,
  type GeneratedStoryPackage,
  type LanguageCode,
  type LanguageProfile,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import { type LocalizedFullRewriteResponseShape } from "./story-localization.schemas.js";
import { type NarrationOnlyFullRewriteResponse } from "./story-prompt-response-schemas.js";
import {
  countWords,
  estimateDurationSeconds,
} from "./story-localization.utils.js";
import {
  detectEditorialCommentary,
  detectProductionLabels,
  firstSentence,
} from "./short-rewrite.utils.js";
import {
  type ShortRewriteAdaptationContract,
  type ShortRewriteResolvedParent,
} from "./short-rewrite.types.js";

const forbiddenPhrases = [
  "Here is the translation",
  "Here is your story",
  "As an AI",
  "The protagonist",
  "The central rule",
  "The source text",
  "The user requested",
] as const;

const localeValidationHints = {
  "es-419": {
    requiredAny: [" el ", " la ", " que ", " de ", " y "],
    forbidden: [" vosotros ", " vosotras ", " ordenador ", " coche "],
  },
  "de-DE": {
    requiredAny: [" der ", " die ", " das ", " und ", " nicht "],
    forbidden: [" vocês ", " vocês ", " você ", " vocês "],
  },
  "fr-FR": {
    requiredAny: [" le ", " la ", " les ", " et ", " dans "],
    forbidden: [" vocês ", " você ", " vosotros "],
  },
  "pt-BR": {
    requiredAny: [" o ", " a ", " que ", " e ", " não "],
    forbidden: [" vosotros ", " vosotras ", " ordinateur ", " vosotros "],
  },
} as const;

export const GENERATED_STORY_VALIDATION_ISSUE_CODES = {
  FULL_WORD_RANGE_INVALID: "FULL_WORD_RANGE_INVALID",
  FULL_DURATION_OUT_OF_RANGE: "FULL_DURATION_OUT_OF_RANGE",
  FULL_CHRONOLOGY_INVALID: "FULL_CHRONOLOGY_INVALID",
  FULL_REQUIRED_ENTITY_MISSING: "FULL_REQUIRED_ENTITY_MISSING",
  FULL_IMMUTABLE_FACT_MISSING: "FULL_IMMUTABLE_FACT_MISSING",
  FULL_MISSING_CLIMAX: "FULL_MISSING_CLIMAX",
  FULL_MISSING_ENDING: "FULL_MISSING_ENDING",
  FULL_GENRE_POLICY_VIOLATION: "FULL_GENRE_POLICY_VIOLATION",
  FULL_NOT_NARRATION_ONLY: "FULL_NOT_NARRATION_ONLY",
  FULL_LANGUAGE_OR_LOCALE_INVALID: "FULL_LANGUAGE_OR_LOCALE_INVALID",
  FULL_TRUNCATED: "FULL_TRUNCATED",
  FULL_DUPLICATED_MAJOR_SECTION: "FULL_DUPLICATED_MAJOR_SECTION",
  FULL_METADATA_AUDIO_VISUAL_LEAKAGE: "FULL_METADATA_AUDIO_VISUAL_LEAKAGE",
  FULL_STORY_ROUTED_TO_SHORT_GENERATOR: "FULL_STORY_ROUTED_TO_SHORT_GENERATOR",
  SHORT_SOURCE_NOT_VALIDATED_FULL: "SHORT_SOURCE_NOT_VALIDATED_FULL",
  SHORT_PARENT_HASH_MISMATCH: "SHORT_PARENT_HASH_MISMATCH",
  SHORT_WORD_RANGE_INVALID: "SHORT_WORD_RANGE_INVALID",
  SHORT_DURATION_OUT_OF_RANGE: "SHORT_DURATION_OUT_OF_RANGE",
  SHORT_HOOK_TOO_LATE: "SHORT_HOOK_TOO_LATE",
  SHORT_STORY_IDENTIFICATION_MISSING: "SHORT_STORY_IDENTIFICATION_MISSING",
  SHORT_INCOHERENT_NARRATIVE_THREAD: "SHORT_INCOHERENT_NARRATIVE_THREAD",
  SHORT_MISSING_CENTRAL_THREAT: "SHORT_MISSING_CENTRAL_THREAT",
  SHORT_MISSING_CENTRAL_RULE: "SHORT_MISSING_CENTRAL_RULE",
  SHORT_UNSUPPORTED_FACT: "SHORT_UNSUPPORTED_FACT",
  SHORT_CONTRADICTS_FULL_STORY: "SHORT_CONTRADICTS_FULL_STORY",
  SHORT_MISSING_CLIMAX: "SHORT_MISSING_CLIMAX",
  SHORT_MISSING_FINAL_CONSEQUENCE: "SHORT_MISSING_FINAL_CONSEQUENCE",
  SHORT_UNRESOLVED_PRONOUN: "SHORT_UNRESOLVED_PRONOUN",
  SHORT_ORPHANED_REFERENCE: "SHORT_ORPHANED_REFERENCE",
  SHORT_METADATA_AUDIO_VISUAL_LEAKAGE: "SHORT_METADATA_AUDIO_VISUAL_LEAKAGE",
  SHORT_READS_AS_SYNOPSIS: "SHORT_READS_AS_SYNOPSIS",
  SHORT_STRUCTURAL_COMMENTARY: "SHORT_STRUCTURAL_COMMENTARY",
  SHORT_LANGUAGE_OR_LOCALE_INVALID: "SHORT_LANGUAGE_OR_LOCALE_INVALID",
  SHORT_TRUNCATED: "SHORT_TRUNCATED",
  SHORT_STORY_ROUTED_TO_FULL_REGENERATION:
    "SHORT_STORY_ROUTED_TO_FULL_REGENERATION",
} as const;

export type GeneratedStoryValidationIssueCode =
  (typeof GENERATED_STORY_VALIDATION_ISSUE_CODES)[keyof typeof GENERATED_STORY_VALIDATION_ISSUE_CODES];

export interface GeneratedStoryValidationIssue {
  readonly code: GeneratedStoryValidationIssueCode;
  readonly variant: "full" | "short";
  readonly message: string;
}

export interface GeneratedStoryValidationResult {
  readonly status: "passed" | "failed";
  readonly issues: readonly GeneratedStoryValidationIssue[];
  readonly messages: readonly string[];
}

export interface GeneratedStorySemanticValidationAdapter {
  readonly validateFull?: (args: {
    readonly language: LanguageCode;
    readonly locale: string;
    readonly narration: string;
    readonly storyIr: StoryIR;
  }) => readonly GeneratedStoryValidationIssue[];
  readonly validateShort?: (args: {
    readonly language: LanguageCode;
    readonly locale: string;
    readonly narration: string;
    readonly contract: ShortRewriteAdaptationContract;
    readonly parentNarration: string;
  }) => readonly GeneratedStoryValidationIssue[];
}

export interface FullNarrationValidationInput {
  readonly language: LanguageCode;
  readonly profile: LanguageProfile;
  readonly storyIr: StoryIR;
  readonly outputConstraints: FullStoryOutputConstraints;
  readonly narrationParagraphs: readonly string[];
  readonly preservationChecklist?: {
    readonly primaryRevealPreserved?: boolean;
    readonly endingPreserved?: boolean;
  };
  readonly semanticValidator?: GeneratedStorySemanticValidationAdapter;
  readonly generatorVariant?: "full" | "short";
}

export interface ShortNarrationValidationInput {
  readonly language: LanguageCode;
  readonly profile: LanguageProfile;
  readonly narration: string;
  readonly parent: Pick<
    ShortRewriteResolvedParent,
    "identity" | "parentFullHash" | "narrationParagraphs"
  > & {
    readonly validated: boolean;
  };
  readonly adaptationContract: ShortRewriteAdaptationContract;
  readonly outputConstraints: ShortStoryOutputConstraints;
  readonly semanticValidator?: GeneratedStorySemanticValidationAdapter;
  readonly generatorVariant?: "full" | "short";
}

function normalizeForLeakage(text: string): string {
  return ` ${normalizeWhitespace(text).toLowerCase()} `;
}

function normalizeForMatch(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

function tokenize(text: string): readonly string[] {
  return normalizeForMatch(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3);
}

function includesPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeForMatch(text);
  const normalizedPhrase = normalizeForMatch(phrase);
  if (normalizedPhrase.length === 0) {
    return true;
  }
  if (normalizedText.includes(normalizedPhrase)) {
    return true;
  }
  const phraseTokens = tokenize(normalizedPhrase);
  if (phraseTokens.length === 0) {
    return false;
  }
  const matched = phraseTokens.filter((token) => normalizedText.includes(token));
  return matched.length >= Math.max(2, Math.ceil(phraseTokens.length * 0.6));
}

function detectDuplicateNarrationParagraphs(
  paragraphs: readonly string[]
): boolean {
  const normalized = paragraphs
    .map((entry) => normalizeWhitespace(entry).toLowerCase())
    .filter((entry) => entry.length > 0);
  return new Set(normalized).size !== normalized.length;
}

function detectTruncation(text: string): boolean {
  const trimmed = normalizeWhitespace(text);
  if (trimmed.length === 0) {
    return false;
  }
  return /(?:\.\.\.|[[({]|\b(?:and|or|que|und|et|e)\s*$)$/iu.test(
    trimmed
  );
}

function validateLocaleSpecificNarration(
  text: string,
  profile: LanguageProfile,
  variant: "full" | "short"
): string[] {
  const issues: string[] = [];
  const normalized = normalizeForLeakage(text);
  const hints =
    localeValidationHints[
      profile.locale as keyof typeof localeValidationHints
    ];
  if (!hints) {
    return issues;
  }
  if (!hints.requiredAny.some((entry) => normalized.includes(entry))) {
    issues.push(
      variant === "full"
        ? "Localized full wrong language/locale."
        : "Short wrong language/locale."
    );
  }
  if (hints.forbidden.some((entry) => normalized.includes(entry))) {
    issues.push(
      variant === "full"
        ? "Localized full locale leakage."
        : "Short locale leakage."
    );
  }
  if (/\b(the|and|with|from|warning)\b/iu.test(normalized)) {
    issues.push(
      variant === "full"
        ? "Localized full source-language leakage."
        : "Short source-language leakage."
    );
  }
  if (
    /(?:here is the translation|exact written messages are|keep each message exactly as written)/iu.test(
      text
    )
  ) {
    issues.push(
      variant === "full"
        ? "Localized full untranslated boilerplate."
        : "Short untranslated boilerplate."
    );
  }
  return [...new Set(issues)];
}

function buildResult(
  issues: readonly GeneratedStoryValidationIssue[]
): GeneratedStoryValidationResult {
  const unique = issues.filter(
    (issue, index, array) =>
      array.findIndex(
        (candidate) =>
          candidate.code === issue.code && candidate.message === issue.message
      ) === index
  );
  return {
    status: unique.length === 0 ? "passed" : "failed",
    issues: unique,
    messages: unique.map((issue) => issue.message),
  };
}

function issue(
  code: GeneratedStoryValidationIssueCode,
  variant: "full" | "short",
  message: string
): GeneratedStoryValidationIssue {
  return { code, variant, message };
}

function firstIndexOfPhrase(text: string, phrase: string): number {
  const normalizedText = normalizeForMatch(text);
  const normalizedPhrase = normalizeForMatch(phrase);
  if (normalizedPhrase.length === 0) {
    return -1;
  }
  return normalizedText.indexOf(normalizedPhrase);
}

function containsNegatedPhrase(text: string, phrase: string): boolean {
  const phraseTokens = tokenize(phrase).slice(0, 4);
  if (phraseTokens.length === 0) {
    return false;
  }
  const joined = phraseTokens.join("\\W+");
  const pattern = new RegExp(
    `\\b(?:not|never|no|didn't|did not|wasn't|was not|isn't|is not)\\b[^.?!]{0,80}\\b${joined}\\b`,
    "iu"
  );
  return pattern.test(text);
}

function inferStoryAnchors(
  contract: ShortRewriteAdaptationContract,
  parentNarration: string
): readonly string[] {
  const anchors = new Set<string>();
  for (const fact of contract.immutableFacts) {
    const tokens = tokenize(fact.statement);
    if (tokens.length > 0) {
      anchors.add(tokens[0] ?? fact.statement);
    }
  }
  for (const message of contract.exactWrittenMessages) {
    const tokens = tokenize(message);
    if (tokens[0]) {
      anchors.add(tokens[0]);
    }
  }
  const parentTokens = tokenize(parentNarration).slice(0, 12);
  for (const token of parentTokens) {
    anchors.add(token);
  }
  return [...anchors];
}

function detectUnsupportedFacts(
  language: LanguageCode,
  narration: string,
  parentNarration: string,
  contract: ShortRewriteAdaptationContract
): boolean {
  if (language !== "en") {
    return false;
  }
  const allowed = new Set<string>([
    ...tokenize(parentNarration),
    ...tokenize(contract.centralThreat),
    ...tokenize(contract.centralRuleOrMechanism),
    ...tokenize(contract.criticalObject),
    ...tokenize(contract.climaxOrIrreversibleTurn),
    ...tokenize(contract.finalConsequenceOrSting),
    ...contract.immutableFacts.flatMap((fact) => tokenize(fact.statement)),
    ...contract.exactWrittenMessages.flatMap((entry) => tokenize(entry)),
  ]);
  const properNouns = narration.match(/\b[A-Z][a-z]{2,}\b/gu) ?? [];
  return properNouns.some((entry) => !allowed.has(entry.toLowerCase()));
}

function isSynopsisLike(text: string): boolean {
  return (
    /\b(?:this story|the story|the protagonist|the narrative|the central rule)\b/iu.test(
      text
    ) || detectGenericFiller(text).length > 0
  );
}

function hasStructuralCommentary(text: string): boolean {
  return (
    detectEditorialCommentary(text).length > 0 ||
    /\b(?:in this story|this is where|the point is|the lesson is|the ending shows)\b/iu.test(
      normalizeForMatch(text)
    )
  );
}

function hasLeakage(text: string): boolean {
  return (
    detectProductionLabels(text).length > 0 ||
    /\b(?:thumbnail|seo description|visual direction|visual guidance|audio instructions?|metadata|hashtags?|sound effect|scene change)\b/iu.test(
      text
    )
  );
}

function chronologyInOrder(text: string, chronology: readonly string[]): boolean {
  let previousIndex = -1;
  for (const step of chronology) {
    const index = firstIndexOfPhrase(text, step);
    if (index < 0) {
      continue;
    }
    if (index < previousIndex) {
      return false;
    }
    previousIndex = index;
  }
  return true;
}

function hasRequiredEntities(text: string, storyIr: StoryIR): boolean {
  const required = storyIr.entities.filter((entity) =>
    ["person", "location", "object", "rule", "written-message"].includes(
      entity.type
    )
  );
  return required.every((entity) => includesPhrase(text, entity.name));
}

function hasImmutableFacts(text: string, storyIr: StoryIR): boolean {
  const immutableFacts = storyIr.immutableFacts.filter((fact) => fact.immutable);
  return immutableFacts.every((fact) => includesPhrase(text, fact.statement));
}

function hasImmediateStoryIdentification(
  language: LanguageCode,
  parentLanguage: LanguageCode,
  opening: string,
  contract: ShortRewriteAdaptationContract,
  parentNarration: string
): boolean {
  if (language !== "en" && parentLanguage === "en") {
    return countSpokenWords(opening) >= 4;
  }
  const anchors = inferStoryAnchors(contract, parentNarration);
  return anchors.some((anchor) => opening.toLowerCase().includes(anchor.toLowerCase()));
}

function requiresCentralRule(text: string): boolean {
  return /\b(?:never|always|must|cannot|can't|only|if|when|until|respond|touch|speak|open)\b/iu.test(
    text
  );
}

function shouldEnforceContractPhrase(args: {
  readonly language: LanguageCode;
  readonly parentLanguage: LanguageCode;
  readonly parentNarration: string;
  readonly phrase: string;
}): boolean {
  if (args.language === "en") {
    return true;
  }
  if (args.parentLanguage === "en") {
    return false;
  }
  return includesPhrase(args.parentNarration, args.phrase);
}

export function detectGenericFiller(text: string): string[] {
  const phrases = [
    "Most frightening stories become exaggerated after they are repeated.",
    "The central rule",
    "The protagonist",
    "This one became more precise.",
    "The story begins",
  ];
  return phrases.filter((phrase) => text.includes(phrase));
}

export function detectForbiddenPhrases(text: string): string[] {
  return forbiddenPhrases.filter((phrase) => text.includes(phrase));
}

export function detectEditorialCommentaryIssues(text: string): string[] {
  return detectEditorialCommentary(text);
}

export function validateHashtags(hashtags: readonly string[]): string[] {
  const invalid = hashtags.filter((tag) => !/^#[^\s#]+$/u.test(tag));
  return [...new Set(invalid)];
}

export function validateTitleAndThumbnail(
  title: string,
  thumbnail: string
): string[] {
  const issues: string[] = [];
  if (normalizeWhitespace(title).length === 0) {
    issues.push("Missing title.");
  }
  if (normalizeWhitespace(thumbnail).length === 0) {
    issues.push("Missing thumbnail text.");
  }
  if (thumbnail.length > 50) {
    issues.push("Thumbnail text is too long.");
  }
  return issues;
}

export function validatePreservationChecklist(
  checklist: GeneratedStoryPackage["preservationChecklist"]
): string[] {
  return Object.entries(checklist)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
}

export function validateWrittenMessagesPreserved(
  original: CanonicalStoryFacts,
  generated: string
): string[] {
  const normalizeMessage = (value: string): string =>
    normalizeWhitespace(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, "");
  const generatedText = normalizeMessage(generated);
  return original.writtenMessages.filter(
    (message) => !generatedText.includes(normalizeMessage(message))
  );
}

export function formatValidationIssues(
  issues: readonly GeneratedStoryValidationIssue[]
): string[] {
  return issues.map((entry) => entry.message);
}

export function validateFullNarrationArtifact(
  args: FullNarrationValidationInput
): GeneratedStoryValidationResult {
  const narrationParagraphs = args.narrationParagraphs.map((entry) =>
    normalizeWhitespace(entry)
  );
  const narration = narrationParagraphs.join(" ").trim();
  const issues: GeneratedStoryValidationIssue[] = [];
  const wordCount = countSpokenWords(narration);
  if (args.generatorVariant === "short") {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_STORY_ROUTED_TO_SHORT_GENERATOR,
        "full",
        "Full story routed to short generator."
      )
    );
  }
  if (
    wordCount < args.outputConstraints.targetWordRange.min ||
    wordCount > args.outputConstraints.targetWordRange.max
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_WORD_RANGE_INVALID,
        "full",
        `Full word count ${wordCount} outside range ${args.outputConstraints.targetWordRange.min}-${args.outputConstraints.targetWordRange.max}.`
      )
    );
  }
  if (args.outputConstraints.targetDuration) {
    const duration = estimateDurationSeconds(
      wordCount,
      args.outputConstraints.targetNarrationWpm
    );
    if (
      duration < args.outputConstraints.targetDuration.minSeconds ||
      duration > args.outputConstraints.targetDuration.maxSeconds
    ) {
      issues.push(
        issue(
          GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_DURATION_OUT_OF_RANGE,
          "full",
          "Full duration estimate out of bounds."
        )
      );
    }
  }
  if (!chronologyInOrder(narration, args.storyIr.chronology)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_CHRONOLOGY_INVALID,
        "full",
        "Full chronology is inconsistent."
      )
    );
  }
  if (!hasRequiredEntities(narration, args.storyIr)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_REQUIRED_ENTITY_MISSING,
        "full",
        "Character names are missing."
      )
    );
  }
  if (!hasImmutableFacts(narration, args.storyIr)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_IMMUTABLE_FACT_MISSING,
        "full",
        "Written messages are not preserved."
      )
    );
  }
  const genrePolicy = resolveGenrePolicy({
    genre: args.storyIr.genre,
    registry: DEFAULT_GENRE_POLICY_REGISTRY,
  });
  if (
    !genrePolicy.ok ||
    validateGenrePolicyCompatibility({
      storyIr: args.storyIr,
      policy: genrePolicy.policy,
    }).some((entry) => entry.severity === "error")
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_GENRE_POLICY_VIOLATION,
        "full",
        "Genre policy violation."
      )
    );
  }
  if (!includesPhrase(narration, args.storyIr.climax)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_MISSING_CLIMAX,
        "full",
        "Missing climax."
      )
    );
  }
  if (!includesPhrase(narration, args.storyIr.endingConsequence)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_MISSING_ENDING,
        "full",
        "Missing ending."
      )
    );
  }
  if (detectForbiddenPhrases(narration).length > 0) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_NOT_NARRATION_ONLY,
        "full",
        "Full contains forbidden boilerplate."
      )
    );
  }
  if (detectEditorialCommentaryIssues(narration).length > 0) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_NOT_NARRATION_ONLY,
        "full",
        "Full contains editorial commentary."
      )
    );
  }
  if (detectGenericFiller(narration).length > 0) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_NOT_NARRATION_ONLY,
        "full",
        "Full contains generic filler."
      )
    );
  }
  if (hasLeakage(narration)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_METADATA_AUDIO_VISUAL_LEAKAGE,
        "full",
        args.language === "en"
          ? "Full metadata leakage."
          : "Localized full metadata leakage."
      )
    );
  }
  if (validateLocaleSpecificNarration(narration, args.profile, "full").length > 0) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_LANGUAGE_OR_LOCALE_INVALID,
        "full",
        validateLocaleSpecificNarration(narration, args.profile, "full")[0] ??
          "Localized full wrong language/locale."
      )
    );
  }
  if (detectDuplicateNarrationParagraphs(narrationParagraphs)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_DUPLICATED_MAJOR_SECTION,
        "full",
        args.language === "en"
          ? "Full duplicated sections."
          : "Localized full duplicated sections."
      )
    );
  }
  if (detectTruncation(narration)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_TRUNCATED,
        "full",
        args.language === "en" ? "Full truncated." : "Localized full truncated."
      )
    );
  }
  if (args.preservationChecklist?.primaryRevealPreserved === false) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_MISSING_CLIMAX,
        "full",
        "Missing climax."
      )
    );
  }
  if (args.preservationChecklist?.endingPreserved === false) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_MISSING_ENDING,
        "full",
        "Missing ending."
      )
    );
  }
  if (args.semanticValidator?.validateFull) {
    issues.push(
      ...args.semanticValidator.validateFull({
        language: args.language,
        locale: args.profile.locale,
        narration,
        storyIr: args.storyIr,
      })
    );
  }
  return buildResult(issues);
}

export function validateShortNarrationArtifact(
  args: ShortNarrationValidationInput
): GeneratedStoryValidationResult {
  const narration = normalizeWhitespace(args.narration);
  const issues: GeneratedStoryValidationIssue[] = [];
  const wordCount = countSpokenWords(narration);
  const duration = estimateDurationSeconds(
    wordCount,
    args.outputConstraints.targetNarrationWpm
  );
  const parentNarration = args.parent.narrationParagraphs.join(" ");
  const openingSeconds =
    estimateDurationSeconds(
      countSpokenWords(firstSentence(narration)),
      args.outputConstraints.targetNarrationWpm
    ) ?? Number.POSITIVE_INFINITY;
  const openingWindowWords = Math.max(
    1,
    Math.ceil(
      (args.outputConstraints.hookDeadlineSeconds / 60) *
        args.outputConstraints.targetNarrationWpm
    )
  );
  const openingWindow = narration
    .split(/\s+/u)
    .slice(0, openingWindowWords)
    .join(" ");
  const enforceThreat = shouldEnforceContractPhrase({
    language: args.language,
    parentLanguage: args.parent.identity.language,
    parentNarration,
    phrase: args.adaptationContract.centralThreat,
  });
  const enforceRule = shouldEnforceContractPhrase({
    language: args.language,
    parentLanguage: args.parent.identity.language,
    parentNarration,
    phrase: args.adaptationContract.centralRuleOrMechanism,
  });
  const enforceClimax = shouldEnforceContractPhrase({
    language: args.language,
    parentLanguage: args.parent.identity.language,
    parentNarration,
    phrase: args.adaptationContract.climaxOrIrreversibleTurn,
  });
  const enforceEnding = shouldEnforceContractPhrase({
    language: args.language,
    parentLanguage: args.parent.identity.language,
    parentNarration,
    phrase: args.adaptationContract.finalConsequenceOrSting,
  });
  if (args.generatorVariant === "full") {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_STORY_ROUTED_TO_FULL_REGENERATION,
        "short",
        "Short story routed to full regeneration."
      )
    );
  }
  if (!args.parent.validated || args.parent.identity.variant !== "full") {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_SOURCE_NOT_VALIDATED_FULL,
        "short",
        "Short source is not a validated full artifact."
      )
    );
  }
  if (
    args.parent.parentFullHash !== args.adaptationContract.parent.parentFullHash
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_PARENT_HASH_MISMATCH,
        "short",
        "Short parent hash mismatch."
      )
    );
  }
  if (
    wordCount < args.outputConstraints.targetWordRange.min ||
    wordCount > args.outputConstraints.targetWordRange.max
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_WORD_RANGE_INVALID,
        "short",
        `Narration word count ${wordCount} is outside the allowed short range ${args.outputConstraints.targetWordRange.min}-${args.outputConstraints.targetWordRange.max}.`
      )
    );
  }
  if (
    duration < args.outputConstraints.targetDuration.minSeconds ||
    duration > args.outputConstraints.targetDuration.maxSeconds
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_DURATION_OUT_OF_RANGE,
        "short",
        "Short duration estimate out of bounds."
      )
    );
  }
  if (
    openingSeconds > args.outputConstraints.hookDeadlineSeconds ||
    (enforceThreat &&
      !includesPhrase(openingWindow, args.adaptationContract.centralThreat))
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_HOOK_TOO_LATE,
        "short",
        "Hook appears too late in the short narration."
      )
    );
  }
  if (
    !hasImmediateStoryIdentification(
      args.language,
      args.parent.identity.language,
      openingWindow,
      args.adaptationContract,
      parentNarration
    )
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_STORY_IDENTIFICATION_MISSING,
        "short",
        "Short does not identify the story immediately."
      )
    );
  }
  if (
    narration.split(/\n{2,}/u).length > 2 ||
    /\b(?:meanwhile|in another story|elsewhere|separately)\b/iu.test(narration)
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_INCOHERENT_NARRATIVE_THREAD,
        "short",
        "Short does not maintain one coherent narrative thread."
      )
    );
  }
  if (
    enforceThreat &&
    !includesPhrase(narration, args.adaptationContract.centralThreat)
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_CENTRAL_THREAT,
        "short",
        "Short is missing the central threat or mystery."
      )
    );
  }
  if (
    normalizeForMatch(args.adaptationContract.centralRuleOrMechanism).length > 0 &&
    enforceRule &&
    requiresCentralRule(args.adaptationContract.centralRuleOrMechanism) &&
    normalizeForMatch(args.adaptationContract.centralRuleOrMechanism) !==
      normalizeForMatch(args.adaptationContract.centralThreat) &&
    !includesPhrase(narration, args.adaptationContract.centralRuleOrMechanism)
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_CENTRAL_RULE,
        "short",
        "Short is missing the central rule or mechanism."
      )
    );
  }
  if (
    detectUnsupportedFacts(
      args.language,
      narration,
      parentNarration,
      args.adaptationContract
    )
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_UNSUPPORTED_FACT,
        "short",
        "Short introduces unsupported facts."
      )
    );
  }
  if (
    args.language === "en" &&
    (args.adaptationContract.immutableFacts.some((fact) =>
      containsNegatedPhrase(narration, fact.statement)
    ) ||
      (enforceClimax &&
        containsNegatedPhrase(
          narration,
          args.adaptationContract.climaxOrIrreversibleTurn
        )) ||
      (enforceEnding &&
        containsNegatedPhrase(
          narration,
          args.adaptationContract.finalConsequenceOrSting
        )))
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_CONTRADICTS_FULL_STORY,
        "short",
        "Short contradicts the parent full story."
      )
    );
  }
  if (
    enforceClimax &&
    !includesPhrase(narration, args.adaptationContract.climaxOrIrreversibleTurn)
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_CLIMAX,
        "short",
        "Short is missing the climax or irreversible turn."
      )
    );
  }
  if (
    enforceEnding &&
    !includesPhrase(narration, args.adaptationContract.finalConsequenceOrSting)
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_FINAL_CONSEQUENCE,
        "short",
        "Short is missing the final consequence or sting."
      )
    );
  }
  if (/^\s*(?:he|she|they|it|this|that|these|those)\b/iu.test(narration)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_UNRESOLVED_PRONOUN,
        "short",
        "Short begins with an unresolved pronoun."
      )
    );
  }
  if (
    args.adaptationContract.sourceExtraction.orphanedReferences.some((entry) =>
      includesPhrase(narration, entry.reference)
    )
  ) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_ORPHANED_REFERENCE,
        "short",
        "Short contains orphaned references."
      )
    );
  }
  if (hasLeakage(narration)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_METADATA_AUDIO_VISUAL_LEAKAGE,
        "short",
        "Narration contains production labels."
      )
    );
  }
  if (isSynopsisLike(narration)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_READS_AS_SYNOPSIS,
        "short",
        "Short reads as synopsis language instead of narration."
      )
    );
  }
  if (hasStructuralCommentary(narration)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_STRUCTURAL_COMMENTARY,
        "short",
        "Narration contains editorial commentary."
      )
    );
  }
  const localeIssues = validateLocaleSpecificNarration(
    narration,
    args.profile,
    "short"
  );
  if (localeIssues.length > 0) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_LANGUAGE_OR_LOCALE_INVALID,
        "short",
        localeIssues[0] ?? "Short wrong language/locale."
      )
    );
  }
  if (detectTruncation(narration)) {
    issues.push(
      issue(
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_TRUNCATED,
        "short",
        "Short appears truncated."
      )
    );
  }
  if (args.semanticValidator?.validateShort) {
    issues.push(
      ...args.semanticValidator.validateShort({
        language: args.language,
        locale: args.profile.locale,
        narration,
        contract: args.adaptationContract,
        parentNarration,
      })
    );
  }
  return buildResult(issues);
}

function validateFullStoryPackageNarration(
  packageValue: Pick<GeneratedStoryPackage, "full">,
  profile: LanguageProfile,
  facts?: CanonicalStoryFacts
): string[] {
  const issues: string[] = [];
  if (packageValue.full) {
    issues.push(
      ...validateTitleAndThumbnail(
        packageValue.full.title,
        packageValue.full.thumbnailText
      ).map((entry) => `full:${entry}`)
    );
    issues.push(
      ...validateHashtags(packageValue.full.hashtags).map(
        (tag) => `full:invalid hashtag ${tag}`
      )
    );
    const fullText = packageValue.full.narrationParagraphs.join(" ");
    if (
      packageValue.full.narrationParagraphs.length === 0 ||
      !/[\w\p{L}\p{N}]/u.test(fullText)
    ) {
      issues.push("Full narration is empty.");
    }
    if (packageValue.full.narrationParagraphs.length < 3) {
      issues.push("Full narration is too short.");
    }
    if (detectForbiddenPhrases(fullText).length > 0) {
      issues.push("Full contains forbidden boilerplate.");
    }
    if (detectEditorialCommentaryIssues(fullText).length > 0) {
      issues.push("Full contains editorial commentary.");
    }
    if (detectGenericFiller(fullText).length > 0 && profile.fullNarrationWpm > 0) {
      issues.push("Full contains generic filler.");
    }
    if (facts) {
      const normalizedText = normalizeWhitespace(fullText).toLowerCase();
      if (
        !normalizedText.includes(
          normalizeWhitespace(facts.primaryReveal).toLowerCase()
        )
      ) {
        issues.push("Missing climax.");
      }
      if (
        !normalizedText.includes(
          normalizeWhitespace(facts.finalConsequence).toLowerCase()
        )
      ) {
        issues.push("Missing ending.");
      }
    }
  }
  return issues;
}

export function validateGeneratedStoryPackage(
  packageValue: GeneratedStoryPackage,
  facts: CanonicalStoryFacts,
  profile: LanguageProfile,
  source: ParsedSourceStory,
  language: LanguageCode
): string[] {
  const issues: string[] = [];
  if (packageValue.language !== language) {
    issues.push("Language mismatch.");
  }
  issues.push(
    ...validateTitleAndThumbnail(
      packageValue.short.title,
      packageValue.short.thumbnailText
    ).map((entry) => `short:${entry}`)
  );
  issues.push(
    ...validateHashtags(packageValue.short.hashtags).map(
      (tag) => `short:invalid hashtag ${tag}`
    )
  );
  issues.push(...validateFullStoryPackageNarration(packageValue, profile, facts));
  issues.push(
    ...validatePreservationChecklist(packageValue.preservationChecklist).map(
      (entry) => `preservation:${entry}`
    )
  );
  const shortText = packageValue.short.narrationParagraphs.join(" ");
  const shortWordCount = countWords(shortText);
  if (
    shortWordCount < profile.shortWordRange.min ||
    shortWordCount > profile.shortWordRange.max
  ) {
    issues.push(
      `Short word count ${shortWordCount} outside range ${profile.shortWordRange.min}-${profile.shortWordRange.max}.`
    );
  }
  const estimated = estimateDurationSeconds(
    shortWordCount,
    packageValue.short.targetNarrationWpm
  );
  if (estimated < 30 || estimated > 90) {
    issues.push("Short duration estimate out of bounds.");
  }
  if (
    packageValue.short.narrationParagraphs.length === 0 ||
    !/[\w\p{L}\p{N}]/u.test(packageValue.short.narrationParagraphs[0] ?? "")
  ) {
    issues.push("Short narration is empty.");
  }
  if (detectForbiddenPhrases(shortText).length > 0) {
    issues.push("Short contains forbidden boilerplate.");
  }
  if (detectEditorialCommentaryIssues(shortText).length > 0) {
    issues.push("Short contains editorial commentary.");
  }
  if (detectGenericFiller(shortText).length > 0) {
    issues.push("Short contains generic filler.");
  }
  if (validateWrittenMessagesPreserved(facts, shortText).length > 0) {
    issues.push("Written messages are not preserved.");
  }
  if (
    !facts.characters.every(
      (character) =>
        shortText.includes(character.name) ||
        packageValue.full?.narrationParagraphs.join(" ").includes(character.name)
    )
  ) {
    issues.push("Character names are missing.");
  }
  if (!packageValue.preservationChecklist.primaryRevealPreserved) {
    issues.push("Primary reveal not preserved.");
  }
  if (!packageValue.preservationChecklist.endingPreserved) {
    issues.push("Ending not preserved.");
  }
  void source;
  return issues;
}

export function validateGeneratedFullStoryPackage(
  packageValue: Pick<
    GeneratedStoryPackage,
    "language" | "full" | "preservationChecklist" | "diagnostics"
  >,
  facts: CanonicalStoryFacts,
  profile: LanguageProfile,
  language: LanguageCode
): string[] {
  const issues: string[] = [];
  if (packageValue.language !== language) {
    issues.push("Language mismatch.");
  }
  issues.push(...validateFullStoryPackageNarration(packageValue, profile, facts));
  issues.push(
    ...validatePreservationChecklist(packageValue.preservationChecklist).map(
      (entry) => `preservation:${entry}`
    )
  );
  if (packageValue.full) {
    const fullText = packageValue.full.narrationParagraphs.join(" ");
    if (countWords(fullText) < 1) {
      issues.push("Full story narration is empty.");
    }
    if (!facts.characters.every((character) => fullText.includes(character.name))) {
      issues.push("Character names are missing.");
    }
    if (validateWrittenMessagesPreserved(facts, fullText).length > 0) {
      issues.push("Written messages are not preserved.");
    }
  }
  return issues;
}

export function validateGeneratedLocalizedFullRewritePackage(
  packageValue: Pick<
    LocalizedFullRewriteResponseShape,
    "language" | "full" | "preservationChecklist" | "diagnostics"
  >,
  facts: CanonicalStoryFacts,
  profile: LanguageProfile,
  language: LanguageCode
): string[] {
  const issues: string[] = [];
  if (packageValue.language !== language) {
    issues.push("Language mismatch.");
  }
  issues.push(
    ...validateTitleAndThumbnail(
      packageValue.full.title,
      packageValue.full.thumbnailText
    ).map((entry) => `full:${entry}`)
  );
  issues.push(
    ...validateHashtags(packageValue.full.hashtags).map(
      (tag) => `full:invalid hashtag ${tag}`
    )
  );
  const fullText = packageValue.full.narrationParagraphs.join(" ");
  if (
    packageValue.full.narrationParagraphs.length === 0 ||
    !/[\w\p{L}\p{N}]/u.test(fullText)
  ) {
    issues.push("Full narration is empty.");
  }
  if (packageValue.full.narrationParagraphs.length < 1) {
    issues.push("Full narration is too short.");
  }
  if (detectForbiddenPhrases(fullText).length > 0) {
    issues.push("Full contains forbidden boilerplate.");
  }
  if (detectEditorialCommentaryIssues(fullText).length > 0) {
    issues.push("Full contains editorial commentary.");
  }
  if (detectGenericFiller(fullText).length > 0 && profile.fullNarrationWpm > 0) {
    issues.push("Full contains generic filler.");
  }
  issues.push(
    ...validatePreservationChecklist(packageValue.preservationChecklist).map(
      (entry) => `preservation:${entry}`
    )
  );
  if (countSpokenWords(fullText) < 1) {
    issues.push("Full story narration is empty.");
  }
  if (!facts.characters.every((character) => fullText.includes(character.name))) {
    issues.push("Character names are missing.");
  }
  if (validateWrittenMessagesPreserved(facts, fullText).length > 0) {
    issues.push("Written messages are not preserved.");
  }
  return issues;
}

export function validateNarrationOnlyFullRewritePackage(
  packageValue: NarrationOnlyFullRewriteResponse,
  facts: CanonicalStoryFacts,
  profile: LanguageProfile,
  language: LanguageCode
): string[] {
  const issues: string[] = [];
  if (packageValue.language !== language) {
    issues.push("Language mismatch.");
  }
  issues.push(
    ...validatePreservationChecklist(packageValue.preservationChecklist).map(
      (entry) => `preservation:${entry}`
    )
  );
  const fullText = packageValue.full.narrationParagraphs.join(" ");
  if (
    packageValue.full.narrationParagraphs.length === 0 ||
    !/[\w\p{L}\p{N}]/u.test(fullText)
  ) {
    issues.push("Full narration is empty.");
  }
  if (packageValue.full.narrationParagraphs.length < 1) {
    issues.push("Full narration is too short.");
  }
  if (detectForbiddenPhrases(fullText).length > 0) {
    issues.push("Full contains forbidden boilerplate.");
  }
  if (detectEditorialCommentaryIssues(fullText).length > 0) {
    issues.push("Full contains editorial commentary.");
  }
  if (detectGenericFiller(fullText).length > 0 && profile.fullNarrationWpm > 0) {
    issues.push("Full contains generic filler.");
  }
  if (countSpokenWords(fullText) < 1) {
    issues.push("Full story narration is empty.");
  }
  if (!facts.characters.every((character) => fullText.includes(character.name))) {
    issues.push("Character names are missing.");
  }
  if (validateWrittenMessagesPreserved(facts, fullText).length > 0) {
    issues.push("Written messages are not preserved.");
  }
  issues.push(...validateLocaleSpecificNarration(fullText, profile, "full"));
  if (detectDuplicateNarrationParagraphs(packageValue.full.narrationParagraphs)) {
    issues.push("Localized full duplicated sections.");
  }
  if (detectTruncation(fullText)) {
    issues.push("Localized full truncated.");
  }
  if (hasLeakage(fullText)) {
    issues.push("Localized full metadata leakage.");
  }
  if (!packageValue.preservationChecklist.primaryRevealPreserved) {
    issues.push("Missing climax.");
  }
  if (!packageValue.preservationChecklist.endingPreserved) {
    issues.push("Missing ending.");
  }
  return issues;
}
