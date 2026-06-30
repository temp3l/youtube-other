import { countSpokenWords, normalizeWhitespace } from "@mediaforge/shared";
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
import { detectEditorialCommentary } from "./short-rewrite.utils.js";

const forbiddenPhrases = [
  "Here is the translation",
  "Here is your story",
  "As an AI",
  "The protagonist",
  "The central rule",
  "The source text",
  "The user requested",
];

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

function normalizeForLeakage(text: string): string {
  return ` ${normalizeWhitespace(text).toLowerCase()} `;
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
  return /(?:\.\.\.|[\(\[\{]|and\s*$|or\s*$|que\s*$|und\s*$|et\s*$|e\s*$)$/iu.test(
    trimmed
  );
}

function validateLocaleSpecificNarration(
  text: string,
  profile: LanguageProfile
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
    issues.push("Localized full wrong language/locale.");
  }
  if (hints.forbidden.some((entry) => normalized.includes(entry))) {
    issues.push("Localized full locale leakage.");
  }
  if (/\b(the|and|with|from|warning)\b/iu.test(normalized)) {
    issues.push("Localized full source-language leakage.");
  }
  if (
    /(?:here is the translation|exact written messages are|keep each message exactly as written)/iu.test(
      text
    )
  ) {
    issues.push("Localized full untranslated boilerplate.");
  }
  return [...new Set(issues)];
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
      ).map((issue) => `full:${issue}`)
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
    if (
      detectGenericFiller(fullText).length > 0 &&
      profile.fullNarrationWpm > 0
    ) {
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
    ).map((issue) => `short:${issue}`)
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
  const generatedShortText = packageValue.short.narrationParagraphs.join(" ");
  if (detectForbiddenPhrases(generatedShortText).length > 0) {
    issues.push("Short contains forbidden boilerplate.");
  }
  if (detectEditorialCommentaryIssues(generatedShortText).length > 0) {
    issues.push("Short contains editorial commentary.");
  }
  if (
    detectGenericFiller(generatedShortText).length > 0 &&
    packageValue.short.targetNarrationWpm > 0
  ) {
    issues.push("Short contains generic filler.");
  }
  if (validateWrittenMessagesPreserved(facts, generatedShortText).length > 0) {
    issues.push("Written messages are not preserved.");
  }
  if (
    !facts.characters.every(
      (character) =>
        generatedShortText.includes(character.name) ||
        packageValue.full?.narrationParagraphs
          .join(" ")
          .includes(character.name)
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
    if (
      !facts.characters.every((character) => fullText.includes(character.name))
    ) {
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
    ).map((issue) => `full:${issue}`)
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
  if (
    detectGenericFiller(fullText).length > 0 &&
    profile.fullNarrationWpm > 0
  ) {
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
  if (
    !facts.characters.every((character) => fullText.includes(character.name))
  ) {
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
  if (
    detectGenericFiller(fullText).length > 0 &&
    profile.fullNarrationWpm > 0
  ) {
    issues.push("Full contains generic filler.");
  }
  if (countSpokenWords(fullText) < 1) {
    issues.push("Full story narration is empty.");
  }
  if (
    !facts.characters.every((character) => fullText.includes(character.name))
  ) {
    issues.push("Character names are missing.");
  }
  if (validateWrittenMessagesPreserved(facts, fullText).length > 0) {
    issues.push("Written messages are not preserved.");
  }
  issues.push(...validateLocaleSpecificNarration(fullText, profile));
  if (detectDuplicateNarrationParagraphs(packageValue.full.narrationParagraphs)) {
    issues.push("Localized full duplicated sections.");
  }
  if (detectTruncation(fullText)) {
    issues.push("Localized full truncated.");
  }
  if (
    /\b(?:thumbnail|seo description|visual direction|audio instructions?)\b/iu.test(
      fullText
    )
  ) {
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
