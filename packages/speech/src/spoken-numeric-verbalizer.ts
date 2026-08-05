/**
 * Explicit, opt-in numeric speech normalization. It deliberately has no
 * provider, cache, or artifact side effects; callers decide when to adopt it.
 */
export const SPOKEN_NUMERIC_VERBALIZER_VERSION =
  "spoken-numeric-verbalizer.de.v1" as const;

export type SpokenNumericIntent =
  | "cardinal"
  | "ordinal"
  | "year"
  | "date"
  | "time"
  | "decimal"
  | "percentage"
  | "currency"
  | "fraction"
  | "range"
  | "identifier"
  | "digits";

export interface VerbalizedValue {
  readonly display: string;
  readonly spoken: string;
  readonly subtitle: string;
}

export interface GermanNumericVerbalizationInput {
  readonly display: string;
  readonly intent: SpokenNumericIntent;
}

export interface NumericNormalizationChange {
  readonly display: string;
  readonly spoken: string;
  readonly intent: SpokenNumericIntent;
  readonly start: number;
  readonly end: number;
}

export interface GermanNumericNormalizationResult {
  readonly version: typeof SPOKEN_NUMERIC_VERBALIZER_VERSION;
  readonly originalText: string;
  readonly spokenText: string;
  readonly changes: readonly NumericNormalizationChange[];
}

export interface NumericArtifactDescriptor {
  readonly artifactId: string;
  readonly genre: string;
  readonly locale: string;
  readonly narrationText: string;
  readonly subtitleText?: string;
}

export interface NumericArtifactImpact {
  readonly artifactId: string;
  readonly genre: string;
  readonly locale: string;
  readonly narrationChanges: readonly NumericNormalizationChange[];
  readonly subtitleChanges: readonly NumericNormalizationChange[];
  readonly affected: boolean;
}

export interface NumericVerbalizationDryRunReport {
  readonly version: typeof SPOKEN_NUMERIC_VERBALIZER_VERSION;
  readonly mode: "dry-run";
  readonly artifacts: readonly NumericArtifactImpact[];
  readonly affectedArtifactIds: readonly string[];
  readonly regenerationRequiresExplicitApproval: true;
}

/** Required before future integrations alter existing genre artifacts. */
export const NUMERIC_VERBALIZER_CHARACTERIZATION_GENRES = [
  "dark-truth",
  "history",
  "veronica-benini",
  "generic",
] as const;

const digitWords = [
  "null",
  "eins",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
] as const;

const monthWords = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
] as const;

function assertIntegerText(value: string, label: string): void {
  if (!/^-?\d+$/u.test(value)) throw new Error(`${label} must be an integer.`);
}

function cardinal(value: string): string {
  assertIntegerText(value, "Cardinal value");
  const parsed = BigInt(value);
  const negative = parsed < 0n;
  const absolute = negative ? -parsed : parsed;
  if (absolute > 999_999_999n)
    throw new Error("German cardinal verbalization supports values through 999999999.");
  const number = Number(absolute);
  const belowHundred = (input: number, compoundOne = false): string => {
    const direct = ["null", compoundOne ? "ein" : "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"][input];
    if (direct) return direct;
    const tens = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"][Math.floor(input / 10)];
    if (!tens) throw new Error(`Unsupported German cardinal ${input}.`);
    const ones = input % 10;
    return ones === 0 ? tens : `${belowHundred(ones, true)}und${tens}`;
  };
  const belowThousand = (input: number): string => {
    if (input < 100) return belowHundred(input);
    const hundreds = Math.floor(input / 100);
    const remainder = input % 100;
    const prefix = hundreds === 1 ? "einhundert" : `${belowHundred(hundreds)}hundert`;
    return remainder === 0 ? prefix : `${prefix}${belowHundred(remainder)}`;
  };
  if (number === 0) return "null";
  const millions = Math.floor(number / 1_000_000);
  const thousands = Math.floor((number % 1_000_000) / 1_000);
  const remainder = number % 1_000;
  const parts: string[] = [];
  if (millions > 0) parts.push(millions === 1 ? "eine Million" : `${belowThousand(millions)} Millionen`);
  if (thousands > 0) parts.push(thousands === 1 ? "eintausend" : `${belowThousand(thousands)}tausend`);
  if (remainder > 0) parts.push(belowThousand(remainder));
  return `${negative ? "minus " : ""}${parts.join(millions > 0 ? " " : "")}`;
}

function digits(value: string): string {
  return [...value].map((character) => /^\d$/u.test(character) ? digitWords[Number(character)] : character).join(" ");
}

function decimal(value: string): string {
  const match = value.match(/^(-?)(\d+)[.,](\d+)$/u);
  if (!match) throw new Error("Decimal value must use a comma or full stop.");
  return `${match[1] ? "minus " : ""}${cardinal(match[2]!)} Komma ${digits(match[3]!)}`;
}

function date(value: string, dative = false): string {
  const match = value.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/u);
  if (!match) throw new Error("Date must use DD.MM.YYYY.");
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) throw new Error("Date is outside its supported range.");
  const dayWord = ordinal(String(day));
  return `${dative ? dativeOrdinal(dayWord) : dayWord} ${monthWords[month - 1]} ${cardinal(match[3]!)}`;
}

function dativeOrdinal(value: string): string {
  return value.endsWith("e") ? `${value.slice(0, -1)}en` : value;
}

function ordinal(value: string): string {
  const normalized = value.replace(/\.$/u, "");
  assertIntegerText(normalized, "Ordinal value");
  const special: Record<string, string> = { "1": "erste", "2": "zweite", "3": "dritte", "7": "siebte", "8": "achte" };
  if (special[normalized]) return special[normalized];
  return `${cardinal(normalized)}${Number(normalized) < 20 ? "te" : "ste"}`;
}

function time(value: string): string {
  const match = value.match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) throw new Error("Time must use HH:MM.");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error("Time is outside its supported range.");
  return minutes === 0 ? `${cardinal(String(hours))} Uhr` : `${cardinal(String(hours))} Uhr ${cardinal(String(minutes))}`;
}

export function verbalizeGermanNumericValue(input: GermanNumericVerbalizationInput): VerbalizedValue {
  const display = input.display;
  let spoken: string;
  switch (input.intent) {
    case "cardinal": spoken = cardinal(display); break;
    case "ordinal": spoken = ordinal(display); break;
    case "year":
      if (!/^\d{4}$/u.test(display)) throw new Error("Year must contain four digits.");
      spoken = cardinal(display); break;
    case "date": spoken = date(display); break;
    case "time": spoken = time(display); break;
    case "decimal": spoken = decimal(display); break;
    case "percentage": spoken = `${decimalOrCardinal(display.replace(/\s*%$/u, ""))} Prozent`; break;
    case "currency": {
      const match = display.match(/^(-?\d+(?:[.,]\d+)?)\s*(€|EUR)$/u);
      if (!match) throw new Error("Currency must use an amount followed by € or EUR.");
      spoken = `${decimalOrCardinal(match[1]!)} Euro`;
      break;
    }
    case "fraction": {
      const match = display.match(/^(-?\d+)\s*\/\s*(\d+)$/u);
      if (!match) throw new Error("Fraction must use numerator/denominator.");
      spoken = match[1] === "1" && match[2] === "2" ? "ein Halb" : `${cardinal(match[1]!)} durch ${cardinal(match[2]!)}`;
      break;
    }
    case "range": {
      const match = display.match(/^(-?\d+)\s*(?:-|–|—)\s*(-?\d+)$/u);
      if (!match) throw new Error("Range must use two integer endpoints.");
      spoken = `${cardinal(match[1]!)} bis ${cardinal(match[2]!)}`;
      break;
    }
    case "identifier":
    case "digits": spoken = digits(display); break;
    default: {
      const exhaustive: never = input.intent;
      throw new Error(`Unsupported numeric intent ${exhaustive}.`);
    }
  }
  return { display, spoken, subtitle: display };
}

function decimalOrCardinal(value: string): string {
  return /[.,]/u.test(value) ? decimal(value) : cardinal(value);
}

interface Candidate {
  readonly display: string;
  readonly intent: SpokenNumericIntent;
  readonly start: number;
  readonly end: number;
}

const protectedIdentifierContext = /\b(?:episode|folge|id|code|telefon|raum|koordinate|plz|isbn)\s*$/iu;

function confidentCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (pattern: RegExp, intent: SpokenNumericIntent): void => {
    for (const match of text.matchAll(pattern)) {
      const display = match[0];
      if (display === undefined || match.index === undefined) continue;
      candidates.push({ display, intent, start: match.index, end: match.index + display.length });
    }
  };
  add(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/gu, "date");
  add(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/gu, "time");
  add(/(?<![\p{L}\p{N}])-?\d+[.,]\d+(?![\p{L}\p{N}])/gu, "decimal");
  add(/(?<![\p{L}\p{N}])-?\d+\s*%(?![\p{L}\p{N}])/gu, "percentage");
  add(/(?<![\p{L}\p{N}])-?\d+(?:[.,]\d+)?\s*(?:€|EUR)(?![\p{L}\p{N}])/gu, "currency");
  add(/(?<![\p{L}\p{N}])-?\d+\s*\/\s*\d+(?![\p{L}\p{N}])/gu, "fraction");
  add(/(?<![\p{L}\p{N}])-?\d+\s*(?:–|—)\s*-?\d+(?![\p{L}\p{N}])/gu, "range");
  for (const match of text.matchAll(/(?<![\p{L}\p{N}])\d+(?![\p{L}\p{N}])/gu)) {
    const display = match[0];
    if (display === undefined || match.index === undefined) continue;
    const before = text.slice(Math.max(0, match.index - 20), match.index);
    if (protectedIdentifierContext.test(before)) continue;
    candidates.push({ display, intent: display.length === 4 && /^(?:1\d{3}|20\d{2})$/u.test(display) ? "year" : "cardinal", start: match.index, end: match.index + display.length });
  }
  return candidates.sort((left, right) => left.start - right.start || right.end - left.end).filter((candidate, index, sorted) => index === 0 || candidate.start >= sorted[index - 1]!.end);
}

const annotationPattern = /\[\[numeric:(cardinal|ordinal|year|date|time|decimal|percentage|currency|fraction|range|identifier|digits):([^\]]+)\]\]/gu;

/**
 * Normalizes explicit annotations and unambiguous German numeric forms only.
 * Subtitle text deliberately stays untouched: callers retain standard orthography.
 */
export function normalizeGermanNumericText(text: string): GermanNumericNormalizationResult {
  const candidates = [...text.matchAll(annotationPattern)].map((match) => ({
    display: match[2]!.trim(),
    intent: match[1] as SpokenNumericIntent,
    start: match.index!,
    end: match.index! + match[0]!.length,
  })).concat(confidentCandidates(text)).sort((left, right) => left.start - right.start || right.end - left.end);
  const changes: NumericNormalizationChange[] = [];
  let cursor = 0;
  let spokenText = "";
  for (const candidate of candidates) {
    if (candidate.start < cursor) continue;
    const value = verbalizeGermanNumericValue(candidate);
    const spoken = candidate.intent === "date" && /\bam\s+$/iu.test(text.slice(0, candidate.start))
      ? date(candidate.display, true)
      : value.spoken;
    spokenText += text.slice(cursor, candidate.start) + spoken;
    changes.push({ ...candidate, spoken });
    cursor = candidate.end;
  }
  spokenText += text.slice(cursor);
  return { version: SPOKEN_NUMERIC_VERBALIZER_VERSION, originalText: text, spokenText, changes };
}

export function buildGermanNumericVerbalizationDryRunReport(
  artifacts: readonly NumericArtifactDescriptor[]
): NumericVerbalizationDryRunReport {
  const entries = artifacts.map((artifact) => {
    const narration = /^de(?:-|$)/iu.test(artifact.locale)
      ? normalizeGermanNumericText(artifact.narrationText)
      : { changes: [] as readonly NumericNormalizationChange[] };
    return {
      artifactId: artifact.artifactId,
      genre: artifact.genre,
      locale: artifact.locale,
      narrationChanges: narration.changes,
      // Subtitles preserve the authored numeric orthography by contract.
      subtitleChanges: [] as readonly NumericNormalizationChange[],
      affected: narration.changes.length > 0,
    };
  });
  return {
    version: SPOKEN_NUMERIC_VERBALIZER_VERSION,
    mode: "dry-run",
    artifacts: entries,
    affectedArtifactIds: entries.filter((entry) => entry.affected).map((entry) => entry.artifactId),
    regenerationRequiresExplicitApproval: true,
  };
}
