import {
  type GeneratedStoryPackage,
  type LanguageCode,
} from "./story-localization.types.js";
import { type NarrationOnlyFullRewriteResponse } from "./story-prompt-response-schemas.js";

export type LocalizedUnicodeSeverity = "warning" | "error";

export interface LocalizedUnicodeDiagnostic {
  readonly language: string;
  readonly severity: LocalizedUnicodeSeverity;
  readonly terms: readonly string[];
  readonly message: string;
}

const germanSuspiciousTerms = [
  "horte",
  "uber",
  "fur",
  "wurde",
  "ware",
  "konnen",
  "musste",
  "offnete",
  "Tur",
  "Kuche",
  "Kuchentisch",
  "Gerausch",
  "Luftung",
  "Luftungsgitter",
  "zuruck",
  "ungefahr",
  "Worter",
  "Uberschrift",
  "Uberschriften",
] as const;

const suspiciousTermsByLanguage: Readonly<Record<string, readonly string[]>> = {
  de: germanSuspiciousTerms,
  es: [
    "senor",
    "senora",
    "nino",
    "nina",
    "tambien",
    "despues",
    "habitacion",
    "corazon",
    "detras",
    "alli",
    "solo",
    "esta",
    "estas",
    "que",
  ],
  fr: [
    "ete",
    "etait",
    "etre",
    "apres",
    "tres",
    "deja",
    "piece",
    "fenetre",
    "garcon",
    "ca",
    "coeur",
  ],
  pt: [
    "nao",
    "tambem",
    "depois",
    "coracao",
    "habitacao",
    "so",
    "esta",
    "voce",
    "mae",
    "mao",
  ],
  it: ["perche", "citta", "piu", "cosi", "e", "cio"],
};

const diacriticPatternByLanguage: Readonly<Record<string, RegExp>> = {
  de: /[ÄÖÜäöüß]/u,
  es: /[ÁÉÍÓÚÜÑáéíóúüñ¿¡]/u,
  fr: /[ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜàâæçéèêëîïôœùûü]/u,
  pt: /[ÁÀÂÃÇÉÊÍÓÔÕÚáàâãçéêíóôõú]/u,
  it: /[ÀÈÉÌÒÓÙàèéìòóù]/u,
};

const wordThresholdByLanguage: Readonly<Record<string, number>> = {
  de: 80,
  es: 120,
  fr: 120,
  pt: 120,
  it: 160,
};

function countWords(text: string): number {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu)).length;
}

function termPattern(term: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${term}([^\\p{L}\\p{N}]|$)`, "gu");
}

function findSuspiciousTerms(text: string, language: string): readonly string[] {
  const terms = suspiciousTermsByLanguage[language] ?? [];
  return terms.filter((term) => termPattern(term).test(text));
}

function hasNativeCharacters(text: string, language: string): boolean {
  return diacriticPatternByLanguage[language]?.test(text) ?? true;
}

export function normalizeLocalizedContentText(value: string): string {
  // Content text must remain Unicode. Do not reuse slug/filename helpers here:
  // those intentionally ASCII-fold by removing combining marks.
  return value.normalize("NFC");
}

export function normalizeLocalizedTextArray(
  values: readonly string[]
): string[] {
  return values.map((value) => normalizeLocalizedContentText(value));
}

export function normalizeNarrationOnlyFullRewriteResponseContent(
  response: NarrationOnlyFullRewriteResponse
): NarrationOnlyFullRewriteResponse {
  return {
    ...response,
    full: {
      ...response.full,
      narrationParagraphs: normalizeLocalizedTextArray(
        response.full.narrationParagraphs
      ),
    },
    diagnostics: {
      removedGenericFiller: normalizeLocalizedTextArray(
        response.diagnostics.removedGenericFiller
      ),
      adaptationNotes: normalizeLocalizedTextArray(
        response.diagnostics.adaptationNotes
      ),
    },
  };
}

function normalizeFullPackage(
  full: NonNullable<GeneratedStoryPackage["full"]>
): NonNullable<GeneratedStoryPackage["full"]> {
  return {
    ...full,
    title: normalizeLocalizedContentText(full.title),
    ...(full.sourceTitle
      ? { sourceTitle: normalizeLocalizedContentText(full.sourceTitle) }
      : {}),
    audioInstructions: normalizeLocalizedTextArray(full.audioInstructions),
    ...(full.soundMotif
      ? { soundMotif: normalizeLocalizedContentText(full.soundMotif) }
      : {}),
    narrationParagraphs: normalizeLocalizedTextArray(full.narrationParagraphs),
    thumbnailText: normalizeLocalizedContentText(full.thumbnailText),
    contentDisclosure: normalizeLocalizedContentText(full.contentDisclosure),
    seoDescription: normalizeLocalizedContentText(full.seoDescription),
    tags: normalizeLocalizedTextArray(full.tags),
    hashtags: normalizeLocalizedTextArray(full.hashtags),
    visualDirection: normalizeLocalizedContentText(full.visualDirection),
  };
}

function normalizeShortPackage(
  short: GeneratedStoryPackage["short"]
): GeneratedStoryPackage["short"] {
  return {
    ...short,
    title: normalizeLocalizedContentText(short.title),
    narrationInstructions: normalizeLocalizedTextArray(
      short.narrationInstructions
    ),
    narrationParagraphs: normalizeLocalizedTextArray(short.narrationParagraphs),
    thumbnailText: normalizeLocalizedContentText(short.thumbnailText),
    description: normalizeLocalizedContentText(short.description),
    hashtags: normalizeLocalizedTextArray(short.hashtags),
    visualGuidance: normalizeLocalizedContentText(short.visualGuidance),
  };
}

export function normalizeGeneratedStoryPackageContent(
  packageValue: GeneratedStoryPackage
): GeneratedStoryPackage {
  return {
    ...packageValue,
    ...(packageValue.full ? { full: normalizeFullPackage(packageValue.full) } : {}),
    short: normalizeShortPackage(packageValue.short),
  };
}

export function detectLocalizedUnicodeIssues(args: {
  readonly language: LanguageCode | string;
  readonly text: string;
  readonly includeMetadata?: string;
}): readonly LocalizedUnicodeDiagnostic[] {
  const language = args.language.toLowerCase();
  if (language === "en") {
    return [];
  }
  const searchableText = normalizeLocalizedContentText(
    [args.text, args.includeMetadata ?? ""].filter(Boolean).join(" ")
  );
  const suspiciousTerms = findSuspiciousTerms(searchableText, language);
  const wordCount = countWords(searchableText);
  const hasNative = hasNativeCharacters(searchableText, language);
  const threshold = wordThresholdByLanguage[language] ?? 160;
  const diagnostics: LocalizedUnicodeDiagnostic[] = [];

  if (language === "de") {
    if (suspiciousTerms.length >= 3) {
      diagnostics.push({
        language,
        severity: "error",
        terms: suspiciousTerms,
        message: `German localized narration must preserve native German characters before TTS; suspicious ASCII-transliterated terms found: ${suspiciousTerms.join(", ")}.`,
      });
    }
    if (!hasNative && wordCount >= threshold) {
      diagnostics.push({
        language,
        severity: "error",
        terms: [],
        message:
          "German localized narration must preserve native German characters before TTS; long German text contains no umlauts or ß.",
      });
    }
    return diagnostics;
  }

  if ((suspiciousTerms.length > 0 || !hasNative) && wordCount >= threshold) {
    diagnostics.push({
      language,
      severity: "warning",
      terms: suspiciousTerms,
      message: `${language} localized narration appears suspiciously ASCII-only; preserve natural accents, punctuation, and language-specific characters before TTS.`,
    });
  }
  return diagnostics;
}
