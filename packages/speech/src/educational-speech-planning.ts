import { countSpokenWords, hashText, normalizeWhitespace } from "@mediaforge/shared";
import { z } from "zod";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  narrationChunkManifestSchema,
  narrationDirectionSetSchema,
  type NarrationChunk,
  type NarrationChunkManifest,
  type NarrationDirection,
  type NarrationDirectionSet,
  type PronunciationDictionary,
  pronunciationDictionarySchema,
} from "./narration-schemas.js";
import {
  transformPronunciationManifest,
  transformPronunciationText,
} from "./pronunciation.js";
import {
  educationalNarrationBeatKindSchema,
  educationalPauseKindSchema,
  type EducationalNarrationBeatKind,
  type EducationalPauseKind,
  type EducationalSpeechLanguage,
  type SpeechDeliveryProfile,
} from "./speech-delivery-profile.js";

export const EDUCATIONAL_SPEECH_PLAN_VERSION = "educational-speech-plan.v1" as const;
export const EDUCATIONAL_NORMALIZATION_VERSION = "education-math-normalization.v1" as const;
export const EDUCATIONAL_PAUSE_PLANNER_VERSION = "education-pause-planner.v1" as const;

const beatIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,127}$/u);

export const educationalNarrationBeatSchema = z
  .object({
    id: beatIdSchema,
    visualStepId: z.string().min(1).max(128).optional(),
    kind: educationalNarrationBeatKindSchema,
    displayText: z.string().min(1).max(12_000),
    spokenText: z.string().min(1).max(12_000),
    pauseAfterKind: educationalPauseKindSchema.optional(),
    writingBehavior: z
      .enum(["before-narration", "overlap-narration", "after-narration"])
      .default("overlap-narration"),
  })
  .strict();
export type EducationalNarrationBeat = z.input<typeof educationalNarrationBeatSchema>;

export interface PlannedEducationalPause {
  readonly kind: EducationalPauseKind;
  readonly durationMs: number;
  readonly reason: string;
}

export interface PlannedEducationalBeat {
  readonly id: string;
  readonly visualStepId?: string;
  readonly kind: EducationalNarrationBeatKind;
  readonly displayText: string;
  readonly originalSpokenText: string;
  readonly normalizedSpokenText: string;
  readonly ttsText: string;
  readonly writingBehavior: "before-narration" | "overlap-narration" | "after-narration";
  readonly estimatedDurationMs: number;
  readonly pauseAfter: PlannedEducationalPause;
  readonly pronunciationEntryIds: readonly string[];
}

export interface EducationalSemanticChunk {
  readonly chunkId: string;
  readonly sequence: number;
  readonly beatIds: readonly string[];
  readonly visualStepIds: readonly string[];
  readonly dominantKind: EducationalNarrationBeatKind;
  readonly displayText: string;
  readonly originalSpokenText: string;
  readonly normalizedSpokenText: string;
  readonly ttsText: string;
  readonly estimatedDurationMs: number;
  readonly internalPauseCues: readonly {
    readonly beatId: string;
    readonly afterParagraph: number;
    readonly kind: EducationalPauseKind;
    readonly durationMs: number;
  }[];
  readonly pauseAfter: PlannedEducationalPause;
  readonly pronunciationEntryIds: readonly string[];
}

export interface EducationalPresentationStep {
  readonly beatId: string;
  readonly visualStepId?: string;
  readonly writingBehavior: PlannedEducationalBeat["writingBehavior"];
  readonly estimatedNarrationDurationMs: number;
  readonly inspectionPauseMs: number;
  readonly nextStepMayStartAfter: "writing-and-narration" | "narration" | "writing";
}

export interface EducationalSpeechPlan {
  readonly schemaVersion: typeof EDUCATIONAL_SPEECH_PLAN_VERSION;
  readonly episodeId: string;
  readonly language: EducationalSpeechLanguage;
  readonly speechProfileId: SpeechDeliveryProfile["id"];
  readonly speechProfileVersion: string;
  readonly normalizationVersion: typeof EDUCATIONAL_NORMALIZATION_VERSION;
  readonly pronunciationDictionaryVersion: string;
  readonly pronunciationDictionaryFingerprint: string;
  readonly beats: readonly PlannedEducationalBeat[];
  readonly chunks: readonly EducationalSemanticChunk[];
  readonly chunkManifest: NarrationChunkManifest;
  readonly directionSet: NarrationDirectionSet;
  readonly presentationSteps: readonly EducationalPresentationStep[];
  readonly sourceHash: string;
  readonly planFingerprint: string;
  readonly createdAt: string;
}

interface ProtectedText {
  readonly text: string;
  readonly restore: (value: string) => string;
}

const words = {
  en: {
    decimal: "point",
    negative: "negative",
    percent: "percent",
    fraction: "over",
    squared: "squared",
    cubed: "cubed",
    power: "to the power of",
    equals: "equals",
    notEquals: "is not equal to",
    plus: "plus",
    minus: "minus",
    times: "times",
    divided: "divided by",
    range: "to",
    lessOrEqual: "is less than or equal to",
    greaterOrEqual: "is greater than or equal to",
  },
  de: {
    decimal: "Komma",
    negative: "minus",
    percent: "Prozent",
    fraction: "durch",
    squared: "zum Quadrat",
    cubed: "hoch drei",
    power: "hoch",
    equals: "ist gleich",
    notEquals: "ist nicht gleich",
    plus: "plus",
    minus: "minus",
    times: "mal",
    divided: "geteilt durch",
    range: "bis",
    lessOrEqual: "ist kleiner oder gleich",
    greaterOrEqual: "ist größer oder gleich",
  },
  es: {
    decimal: "coma",
    negative: "menos",
    percent: "por ciento",
    fraction: "entre",
    squared: "al cuadrado",
    cubed: "al cubo",
    power: "elevado a",
    equals: "es igual a",
    notEquals: "no es igual a",
    plus: "más",
    minus: "menos",
    times: "por",
    divided: "dividido entre",
    range: "a",
    lessOrEqual: "es menor o igual que",
    greaterOrEqual: "es mayor o igual que",
  },
  fr: {
    decimal: "virgule",
    negative: "moins",
    percent: "pour cent",
    fraction: "sur",
    squared: "au carré",
    cubed: "au cube",
    power: "puissance",
    equals: "est égal à",
    notEquals: "n'est pas égal à",
    plus: "plus",
    minus: "moins",
    times: "fois",
    divided: "divisé par",
    range: "à",
    lessOrEqual: "est inférieur ou égal à",
    greaterOrEqual: "est supérieur ou égal à",
  },
  pt: {
    decimal: "vírgula",
    negative: "menos",
    percent: "por cento",
    fraction: "sobre",
    squared: "ao quadrado",
    cubed: "ao cubo",
    power: "elevado a",
    equals: "é igual a",
    notEquals: "não é igual a",
    plus: "mais",
    minus: "menos",
    times: "vezes",
    divided: "dividido por",
    range: "a",
    lessOrEqual: "é menor ou igual a",
    greaterOrEqual: "é maior ou igual a",
  },
} as const;

const unitWords: Readonly<
  Record<EducationalSpeechLanguage, Readonly<Record<string, string>>>
> = {
  en: { cm: "centimetres", mm: "millimetres", m: "metres", km: "kilometres", kg: "kilograms", g: "grams", l: "litres", ml: "millilitres", s: "seconds", h: "hours" },
  de: { cm: "Zentimeter", mm: "Millimeter", m: "Meter", km: "Kilometer", kg: "Kilogramm", g: "Gramm", l: "Liter", ml: "Milliliter", s: "Sekunden", h: "Stunden" },
  es: { cm: "centímetros", mm: "milímetros", m: "metros", km: "kilómetros", kg: "kilogramos", g: "gramos", l: "litros", ml: "mililitros", s: "segundos", h: "horas" },
  fr: { cm: "centimètres", mm: "millimètres", m: "mètres", km: "kilomètres", kg: "kilogrammes", g: "grammes", l: "litres", ml: "millilitres", s: "secondes", h: "heures" },
  pt: { cm: "centímetros", mm: "milímetros", m: "metros", km: "quilómetros", kg: "quilogramas", g: "gramas", l: "litros", ml: "mililitros", s: "segundos", h: "horas" },
};

const abbreviationWords: Readonly<
  Record<EducationalSpeechLanguage, Readonly<Record<string, string>>>
> = {
  en: { "e.g.": "for example", "i.e.": "that is", "approx.": "approximately" },
  de: { "z. B.": "zum Beispiel", "d. h.": "das heißt", "ca.": "circa" },
  es: { "p. ej.": "por ejemplo", "aprox.": "aproximadamente" },
  fr: { "p. ex.": "par exemple", "env.": "environ" },
  pt: { "p. ex.": "por exemplo", "aprox.": "aproximadamente" },
};

const protectedMathBoundaryPhrases = [
  ...new Set(
    Object.values(words).flatMap((lexicon) => Object.values(lexicon))
  ),
].sort((left, right) => right.length - left.length);

const normalizedUnitWords = new Set(
  Object.values(unitWords)
    .flatMap((units) => Object.values(units))
    .map((unit) => unit.toLocaleLowerCase())
);

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function phraseTouchesBoundary(
  before: string,
  after: string,
  phrase: string
): boolean {
  const tokens = phrase.split(/\s+/u);
  const beforePattern = (value: string) =>
    new RegExp(`(?:^|\\s)${escapedPattern(value)}$`, "iu").test(before);
  const afterPattern = (value: string) =>
    new RegExp(`^${escapedPattern(value)}(?:\\s|$)`, "iu").test(after);
  if (beforePattern(phrase) || afterPattern(phrase)) return true;
  for (let index = 1; index < tokens.length; index += 1) {
    if (
      beforePattern(tokens.slice(0, index).join(" ")) &&
      afterPattern(tokens.slice(index).join(" "))
    )
      return true;
  }
  return false;
}

function protectMatches(
  source: string,
  expressions: readonly { readonly pattern: RegExp; readonly replace: (...values: string[]) => string }[]
): ProtectedText {
  const values: string[] = [];
  let text = source;
  for (const expression of expressions) {
    text = text.replace(expression.pattern, (...args: unknown[]) => {
      const matchValues = args.slice(0, -2).map(String);
      const replacement = expression.replace(...matchValues);
      const marker = `EDUPROTECTEDTOKEN${values.length}ENDTOKEN`;
      values.push(replacement);
      return marker;
    });
  }
  return {
    text,
    restore: (value: string) =>
      normalizeWhitespace(
        values.reduce(
          (result, value, index) =>
            result.replace(`EDUPROTECTEDTOKEN${index}ENDTOKEN`, value),
          value
        )
      ),
  };
}

function localizedDate(day: string, month: string, year: string, language: EducationalSpeechLanguage): string {
  if (language === "en") return `${month} slash ${day} slash ${year}`;
  if (language === "de") return `${day}. ${month}. ${year}`;
  return `${day} ${words[language].range} ${month} ${words[language].range} ${year}`;
}

/** Contextual, TTS-only normalization. Renderer display text is never passed here. */
export function normalizeEducationalSpokenText(
  source: string,
  language: EducationalSpeechLanguage
): string {
  const lexicon = words[language];
  let text = normalizeWhitespace(source.normalize("NFC"));
  for (const [written, spoken] of Object.entries(abbreviationWords[language])) {
    text = text.split(written).join(spoken);
  }
  const units = unitWords[language];
  text = text.replace(
    /\b(-?\d+(?:[.,]\d+)?)\s*(mm|cm|km|kg|ml|m|g|l|s|h)\b/giu,
    (_match, value: string, unit: string) => `${value} ${units[unit.toLowerCase()] ?? unit}`
  );
  text = text.replace(/(-?\d+(?:[.,]\d+)?)\s*%/gu, `$1 ${lexicon.percent}`);
  const protectedText = protectMatches(text, [
    {
      pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/gu,
      replace: (_match, year, month, day) => localizedDate(day ?? "", month ?? "", year ?? "", language),
    },
    {
      pattern: /\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/gu,
      replace: (_match, day, month, year) => localizedDate(day ?? "", month ?? "", year ?? "", language),
    },
    {
      pattern: /(?<![\p{L}\p{N}])(-?\d+)\s*\/\s*(\d+)(?![\p{L}\p{N}])/gu,
      replace: (_match, numerator, denominator) => `${numerator?.startsWith("-") ? `${lexicon.negative} ${numerator.slice(1)}` : numerator} ${lexicon.fraction} ${denominator}`,
    },
    {
      pattern: /(?<![\p{L}\p{N}])(-?\d+)[.,](\d+)(?![\p{L}\p{N}])/gu,
      replace: (_match, whole, fractional) => `${whole?.startsWith("-") ? `${lexicon.negative} ${whole.slice(1)}` : whole} ${lexicon.decimal} ${fractional?.split("").join(" ") ?? ""}`,
    },
  ]);
  text = protectedText.text;
  text = text.replace(/([\p{L}\p{N})])²/gu, `$1 ${lexicon.squared}`);
  text = text.replace(/([\p{L}\p{N})])³/gu, `$1 ${lexicon.cubed}`);
  text = text.replace(/([\p{L}\p{N})])\s*\^\s*(-?\d+)/gu, `$1 ${lexicon.power} $2`);
  text = text.replace(/(^|[^\p{L}\p{N}])-(\d+)/gu, `$1${lexicon.negative} $2`);
  text = text.replace(/\b(\d+)\s*[–—-]\s*(\d+)\b/gu, `$1 ${lexicon.range} $2`);
  text = text.replace(/\s*(≤|<=)\s*/gu, ` ${lexicon.lessOrEqual} `);
  text = text.replace(/\s*(≥|>=)\s*/gu, ` ${lexicon.greaterOrEqual} `);
  text = text.replace(/\s*(≠|!=)\s*/gu, ` ${lexicon.notEquals} `);
  text = text.replace(/\s*=\s*/gu, ` ${lexicon.equals} `);
  text = text.replace(/\s*\+\s*/gu, ` ${lexicon.plus} `);
  text = text.replace(/\s*[×*]\s*/gu, ` ${lexicon.times} `);
  text = text.replace(/\s*[÷]\s*/gu, ` ${lexicon.divided} `);
  text = text.replace(/\s+[−-]\s+/gu, ` ${lexicon.minus} `);
  return protectedText.restore(normalizeWhitespace(text));
}

function pauseKindForBeat(kind: EducationalNarrationBeatKind): EducationalPauseKind {
  if (kind === "introduction" || kind === "recap") return "section-transition";
  if (kind === "final-answer" || kind === "intermediate-result") return "result-reveal";
  if (kind === "calculation-step") return "step-transition";
  if (kind === "explanation") return "micro";
  return "board-reading";
}

export function planEducationalPause(input: {
  readonly beatId: string;
  readonly kind: EducationalNarrationBeatKind;
  readonly requestedKind?: EducationalPauseKind;
  readonly profile: SpeechDeliveryProfile;
}): PlannedEducationalPause {
  const kind = input.requestedKind ?? pauseKindForBeat(input.kind);
  const range = input.profile.pausePolicy[kind];
  const fraction = Number.parseInt(hashText(`${input.profile.version}:${input.beatId}:${kind}`).slice(0, 8), 16) / 0xffffffff;
  const durationMs = Math.round((range.minMs + (range.maxMs - range.minMs) * fraction) / 10) * 10;
  return {
    kind,
    durationMs,
    reason: `Planned ${kind} pause after ${input.kind} beat.`,
  };
}

function estimateDurationMs(text: string, targetWordsPerMinute: number): number {
  return Math.max(500, Math.round((countSpokenWords(text) / targetWordsPerMinute) * 60_000));
}

function isSentenceBoundary(text: string, index: number): boolean {
  const character = text[index];
  if (!character || !/[.!?;:]/u.test(character)) return false;
  if (character === "." && /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "")) return false;
  if (
    character === "." &&
    /(?:^|\s)\d+\.$/u.test(text.slice(Math.max(0, index - 12), index + 1))
  )
    return false;
  const before = text.slice(Math.max(0, index - 8), index + 1).toLowerCase();
  if (/(?:e\.g\.|i\.e\.|z\. b\.|d\. h\.|p\. ex\.|p\. ej\.|aprox\.|approx\.|ca\.)$/u.test(before)) return false;
  return /\s/u.test(text[index + 1] ?? " ");
}

function safeBoundary(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd();
  const after = text.slice(index).trimStart();
  if (before.length === 0 || after.length === 0) return false;
  if (/[-+×*÷/=^]$/u.test(before) || /^[-+×*÷/=^%]/u.test(after)) return false;
  if (/\d\/$/u.test(before) || (/^\d/u.test(after) && before.slice(-3).includes("/"))) return false;
  if (/\d$/u.test(before) && /^(?:mm|cm|km|kg|ml|m|g|l|s|h)\b/iu.test(after)) return false;
  const normalizedUnit = after.match(/^[\p{L}]+/u)?.[0]?.toLocaleLowerCase();
  if (/\d$/u.test(before) && normalizedUnit && normalizedUnitWords.has(normalizedUnit)) return false;
  if (
    protectedMathBoundaryPhrases.some((phrase) =>
      phraseTouchesBoundary(before, after, phrase)
    )
  )
    return false;
  const prefix = text.slice(0, index);
  const openParentheses = (prefix.match(/\(/gu)?.length ?? 0) - (prefix.match(/\)/gu)?.length ?? 0);
  const openQuotes = (prefix.match(/["“”]/gu)?.length ?? 0) % 2;
  return openParentheses === 0 && openQuotes === 0;
}

function splitOversizedUnit(text: string, maximumChars: number, hardMaximumChars: number): string[] {
  if (text.length <= maximumChars) return [text];
  const units: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maximumChars) {
    const limit = Math.min(hardMaximumChars, remaining.length - 1);
    let boundary = -1;
    for (let index = limit; index >= Math.floor(maximumChars * 0.55); index -= 1) {
      if ((isSentenceBoundary(remaining, index - 1) || /\n/u.test(remaining[index] ?? "")) && safeBoundary(remaining, index)) {
        boundary = index;
        break;
      }
    }
    if (boundary < 0) {
      for (let index = limit; index >= Math.floor(maximumChars * 0.7); index -= 1) {
        if (/\s/u.test(remaining[index] ?? "") && safeBoundary(remaining, index)) {
          boundary = index;
          break;
        }
      }
    }
    if (boundary < 0) {
      throw new Error("Educational narration contains an oversized semantic unit with no safe split boundary.");
    }
    units.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining.length > 0) units.push(remaining);
  return units;
}

interface BeatUnit {
  readonly beat: z.output<typeof educationalNarrationBeatSchema>;
  readonly partIndex: number;
  readonly partCount: number;
  readonly normalizedText: string;
  readonly estimatedDurationMs: number;
  readonly pauseAfter: PlannedEducationalPause;
}

function createBeatUnits(
  beats: readonly z.output<typeof educationalNarrationBeatSchema>[],
  profile: SpeechDeliveryProfile
): BeatUnit[] {
  const targetWordsPerMinute = profile.targetWordsPerMinute ?? 150;
  return beats.flatMap((beat) => {
    const normalizedText = normalizeEducationalSpokenText(beat.spokenText, profile.language);
    const parts = splitOversizedUnit(
      normalizedText,
      profile.chunkingPolicy.maximumTextCharacters,
      profile.chunkingPolicy.hardMaximumTextCharacters
    );
    return parts.map((part, partIndex) => ({
      beat,
      partIndex,
      partCount: parts.length,
      normalizedText: part,
      estimatedDurationMs: estimateDurationMs(part, targetWordsPerMinute),
      pauseAfter:
        partIndex === parts.length - 1
          ? planEducationalPause({
              beatId: beat.id,
              kind: beat.kind,
              ...(beat.pauseAfterKind ? { requestedKind: beat.pauseAfterKind } : {}),
              profile,
            })
          : planEducationalPause({
              beatId: `${beat.id}-part-${partIndex + 1}`,
              kind: beat.kind,
              requestedKind: "micro",
              profile,
            }),
    }));
  });
}

function packUnits(units: readonly BeatUnit[], profile: SpeechDeliveryProfile): readonly BeatUnit[][] {
  const groups: BeatUnit[][] = [];
  let current: BeatUnit[] = [];
  let characters = 0;
  let durationMs = 0;
  const flush = (): void => {
    if (current.length > 0) groups.push(current);
    current = [];
    characters = 0;
    durationMs = 0;
  };
  for (const unit of units) {
    const separatorChars = current.length > 0 ? 2 : 0;
    const wouldExceed =
      characters + separatorChars + unit.normalizedText.length > profile.chunkingPolicy.maximumTextCharacters ||
      durationMs + unit.estimatedDurationMs > profile.chunkingPolicy.preferredDurationMs.maxMs;
    if (wouldExceed && current.length > 0 && characters >= profile.chunkingPolicy.minimumTextCharacters) flush();
    current.push(unit);
    characters += separatorChars + unit.normalizedText.length;
    durationMs += unit.estimatedDurationMs;
    if (durationMs >= profile.chunkingPolicy.targetDurationMs && characters >= profile.chunkingPolicy.minimumTextCharacters) flush();
  }
  flush();
  if (groups.length > 1) {
    const last = groups.at(-1);
    const previous = groups.at(-2);
    if (last && previous) {
      const lastChars = last.reduce((sum, unit) => sum + unit.normalizedText.length, 0);
      const mergedChars = [...previous, ...last].reduce((sum, unit) => sum + unit.normalizedText.length, 0);
      if (lastChars < profile.chunkingPolicy.minimumTextCharacters && mergedChars <= profile.chunkingPolicy.maximumTextCharacters) {
        groups.splice(groups.length - 2, 2, [...previous, ...last]);
      }
    }
  }
  return groups;
}

function excerpt(text: string, side: "start" | "end", wordCount: number): string {
  const values = normalizeWhitespace(text).split(" ").filter(Boolean);
  return (side === "start" ? values.slice(0, wordCount) : values.slice(-wordCount)).join(" ");
}

function emphasisTargets(text: string): readonly string[] {
  return [...new Set([...text.matchAll(/(?:\b\d+(?:[.,]\d+)?\b|\b[xyzabc]\b|[+−×÷=])/giu)].map((match) => match[0] ?? "").filter(Boolean))].slice(0, 12);
}

function buildDirection(chunk: NarrationChunk, pause: PlannedEducationalPause): NarrationDirection {
  const isResult = chunk.role === "final-answer" || chunk.role === "intermediate-result";
  const isWarning = chunk.role === "warning";
  return {
    chunkId: chunk.chunkId,
    role: chunk.role,
    mood: isResult ? "reflective" : isWarning ? "restrained" : "neutral",
    pace: chunk.role === "definition" || chunk.role === "think-pause" ? "slow" : "measured",
    intensity: isResult ? 0.5 : isWarning ? 0.48 : 0.36,
    restraint: isResult ? 0.88 : 0.9,
    pauseBeforeMs: chunk.sequence === 0 ? 0 : Math.min(180, Math.round(pause.durationMs * 0.25)),
    pauseAfterMs: pause.durationMs,
    emphasisTargets: [...emphasisTargets(chunk.text)],
    deliveryNote: `Teach this ${chunk.role} beat conversationally. Use the planned ${pause.kind} pause at the end; do not add a dramatic pause after every sentence.`,
    negativeConstraints: [
      "No announcer or commercial voice.",
      "No newsreader or audiobook cadence.",
      "No exaggerated children's-presenter delivery.",
      "No uniform emphasis or continuous increase in intensity.",
    ],
    continuityGuidance: chunk.flowIntent === "concludes"
      ? "Resolve the explanation naturally and leave the viewer time to inspect the board."
      : "Continue as one lesson; context is guidance and must not be spoken.",
    flowIntent: chunk.flowIntent,
  };
}

export function buildEducationalSpeechPlan(input: {
  readonly episodeId: string;
  readonly profile: SpeechDeliveryProfile;
  readonly beats: readonly EducationalNarrationBeat[];
  readonly pronunciationDictionaries?: readonly PronunciationDictionary[];
  readonly createdAt?: string;
}): EducationalSpeechPlan {
  const beats = z.array(educationalNarrationBeatSchema).min(1).parse(input.beats);
  if (new Set(beats.map((beat) => beat.id)).size !== beats.length) {
    throw new Error("Educational narration beat IDs must be unique.");
  }
  if (input.profile.language === undefined) throw new Error("Educational speech profile requires a language.");
  const dictionaries = (input.pronunciationDictionaries ?? []).map((dictionary) => pronunciationDictionarySchema.parse(dictionary));
  const units = createBeatUnits(beats, input.profile);
  const groups = packUnits(units, input.profile);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const rawChunks: NarrationChunk[] = groups.map((group, sequence) => {
    const text = group.map((unit) => unit.normalizedText).join("\n\n");
    const previous = groups[sequence - 1]?.map((unit) => unit.normalizedText).join(" ") ?? "";
    const next = groups[sequence + 1]?.map((unit) => unit.normalizedText).join(" ") ?? "";
    const estimatedDurationMs = group.reduce((sum, unit) => sum + unit.estimatedDurationMs, 0);
    const finalUnit = group.at(-1);
    if (!finalUnit) throw new Error("Educational semantic chunk cannot be empty.");
    return {
      chunkId: `narr-chunk-${String(sequence + 1).padStart(3, "0")}`,
      sequence,
      text,
      textHash: hashText(text),
      role: group[0]?.beat.kind ?? "explanation",
      estimatedWordCount: countSpokenWords(text),
      estimatedDurationMs,
      estimatedDurationSeconds: estimatedDurationMs / 1000,
      previousContextExcerpt: excerpt(previous, "end", input.profile.chunkingPolicy.contextWords),
      nextContextExcerpt: excerpt(next, "start", input.profile.chunkingPolicy.contextWords),
      flowIntent: sequence === groups.length - 1 ? "concludes" : "continues",
    };
  });
  const sourceHash = hashText(JSON.stringify(beats.map((beat) => ({ displayText: beat.displayText, spokenText: beat.spokenText }))));
  const manifestMaterial = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: input.episodeId,
    locale: input.profile.language,
    variant: "full" as const,
    sourceSpokenTextHash: sourceHash,
    segmentationConfig: {
      mode: "deterministic" as const,
      version: input.profile.chunkingPolicy.version,
      targetDurationMs: input.profile.chunkingPolicy.targetDurationMs,
      fingerprint: hashText(JSON.stringify(input.profile.chunkingPolicy)),
    },
    chunks: rawChunks,
  };
  const chunkManifest = narrationChunkManifestSchema.parse({
    ...manifestMaterial,
    manifestFingerprint: hashText(JSON.stringify(manifestMaterial)),
    createdAt,
  });
  const pronunciation = transformPronunciationManifest({
    manifest: chunkManifest,
    language: input.profile.language,
    locale: input.profile.language,
    dictionaries,
    createdAt,
  });
  const transformedById = new Map(pronunciation.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const directions = chunkManifest.chunks.map((chunk, sequence) => {
    const finalUnit = groups[sequence]?.at(-1);
    if (!finalUnit) throw new Error(`Missing educational pause for ${chunk.chunkId}.`);
    return buildDirection(chunk, finalUnit.pauseAfter);
  });
  const directionMaterial = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    manifestFingerprint: chunkManifest.manifestFingerprint,
    plannerMode: "deterministic" as const,
    plannerVersion: EDUCATIONAL_PAUSE_PLANNER_VERSION,
    sourceFingerprint: hashText(JSON.stringify(directions)),
    fallbackUsage: { used: false },
    directions,
  };
  const directionSet = narrationDirectionSetSchema.parse({
    ...directionMaterial,
    setFingerprint: hashText(JSON.stringify(directionMaterial)),
    createdAt,
  });
  const plannedBeats: PlannedEducationalBeat[] = beats.map((beat) => {
    const beatUnits = units.filter((unit) => unit.beat.id === beat.id);
    const normalizedSpokenText = beatUnits.map((unit) => unit.normalizedText).join(" ");
    const beatPronunciation = transformPronunciationText({
      text: normalizedSpokenText,
      language: input.profile.language,
      dictionaries,
    });
    const finalUnit = beatUnits.at(-1);
    if (!finalUnit) throw new Error(`Missing normalized educational beat ${beat.id}.`);
    return {
      id: beat.id,
      ...(beat.visualStepId ? { visualStepId: beat.visualStepId } : {}),
      kind: beat.kind,
      displayText: beat.displayText,
      originalSpokenText: beat.spokenText,
      normalizedSpokenText,
      ttsText: beatPronunciation.text,
      writingBehavior: beat.writingBehavior,
      estimatedDurationMs: beatUnits.reduce((sum, unit) => sum + unit.estimatedDurationMs, 0),
      pauseAfter: finalUnit.pauseAfter,
      pronunciationEntryIds: beatPronunciation.appliedEntryIds,
    };
  });
  const semanticChunks: EducationalSemanticChunk[] = groups.map((group, sequence) => {
    const chunkId = `narr-chunk-${String(sequence + 1).padStart(3, "0")}`;
    const transformed = transformedById.get(chunkId);
    const finalUnit = group.at(-1);
    if (!transformed || !finalUnit) throw new Error(`Missing transformed educational chunk ${chunkId}.`);
    return {
      chunkId,
      sequence,
      beatIds: [...new Set(group.map((unit) => unit.beat.id))],
      visualStepIds: [...new Set(group.map((unit) => unit.beat.visualStepId).filter((value): value is string => value !== undefined))],
      dominantKind: group[0]?.beat.kind ?? "explanation",
      displayText: group.map((unit) => unit.beat.displayText).join("\n\n"),
      originalSpokenText: group.map((unit) => unit.beat.spokenText).join("\n\n"),
      normalizedSpokenText: group.map((unit) => unit.normalizedText).join("\n\n"),
      ttsText: transformed.text,
      estimatedDurationMs: group.reduce((sum, unit) => sum + unit.estimatedDurationMs, 0),
      internalPauseCues: group.slice(0, -1).map((unit, index) => ({
        beatId: unit.beat.id,
        afterParagraph: index + 1,
        kind: unit.pauseAfter.kind,
        durationMs: unit.pauseAfter.durationMs,
      })),
      pauseAfter: finalUnit.pauseAfter,
      pronunciationEntryIds: transformed.appliedEntryIds,
    };
  });
  const presentationSteps: EducationalPresentationStep[] = plannedBeats.map((beat) => ({
    beatId: beat.id,
    ...(beat.visualStepId ? { visualStepId: beat.visualStepId } : {}),
    writingBehavior: beat.writingBehavior,
    estimatedNarrationDurationMs: beat.estimatedDurationMs,
    inspectionPauseMs: beat.pauseAfter.durationMs,
    nextStepMayStartAfter:
      beat.writingBehavior === "overlap-narration"
        ? "writing-and-narration"
        : beat.writingBehavior === "before-narration"
          ? "narration"
          : "writing",
  }));
  const dictionaryFingerprint = pronunciation.report.dictionaryFingerprint;
  const planMaterial = {
    schemaVersion: EDUCATIONAL_SPEECH_PLAN_VERSION,
    episodeId: input.episodeId,
    language: input.profile.language,
    speechProfileId: input.profile.id,
    speechProfileVersion: input.profile.version,
    normalizationVersion: EDUCATIONAL_NORMALIZATION_VERSION,
    pronunciationDictionaryVersion: input.profile.pronunciationDictionaryVersion,
    pronunciationDictionaryFingerprint: dictionaryFingerprint,
    beats: plannedBeats,
    chunks: semanticChunks,
    chunkManifestFingerprint: chunkManifest.manifestFingerprint,
    directionSetFingerprint: directionSet.setFingerprint,
    presentationSteps,
    sourceHash,
  };
  return {
    ...planMaterial,
    chunkManifest,
    directionSet,
    planFingerprint: hashText(JSON.stringify(planMaterial)),
    createdAt,
  };
}
