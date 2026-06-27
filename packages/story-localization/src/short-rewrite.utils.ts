import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import {
  countSpokenWords,
  fileExists,
  hashText,
  normalizeWhitespace,
  splitIntoSentences,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  SHORT_REWRITE_HARD_WORD_RANGE,
  FULL_STORY_PROVENANCE_MARKER,
  SHORT_REWRITE_SUPPORTED_LANGUAGES,
  SHORT_REWRITE_THUMBNAIL_WORD_LIMIT,
  type ShortRewriteLanguage,
} from "./short-rewrite.constants.js";
import { type ShortRewriteGeneration, type ShortRewriteValidation } from "./short-rewrite.types.js";

export function normalizeSourceMarkdown(content: string): string {
  return content.replace(/\r\n/gu, "\n");
}

export function sha256NormalizedSource(content: string): string {
  return hashText(normalizeSourceMarkdown(content));
}

export function resolveShortRewriteEpisodeId(episodeSlug: string): string {
  const match = /^([0-9]{3})[-_]/u.exec(episodeSlug);
  return match?.[1] ?? episodeSlug;
}

export function buildCanonicalEpisodeSlug(args: {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
}): string {
  const normalizedSlug = normalizeWhitespace(args.episodeSlug);
  const numberPrefix = `${args.episodeNumber}-`;
  if (normalizedSlug.startsWith(numberPrefix)) {
    return normalizedSlug;
  }
  return `${args.episodeNumber}-${normalizedSlug}`;
}

export function buildCanonicalSourceFileName(args: {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
}): string {
  return `${buildCanonicalEpisodeSlug(args)}-en-full.md`;
}

export function normalizeStoryLanguage(value: string): ShortRewriteLanguage | null {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (normalized.length === 0) {
    return null;
  }
  const primary = normalized.split("-", 1)[0];
  if (
    primary === "en" ||
    primary === "de" ||
    primary === "es" ||
    primary === "fr" ||
    primary === "pt"
  ) {
    return primary;
  }
  return null;
}

export function parseStoryLanguageList(values: readonly string[]): ShortRewriteLanguage[] {
  const parsed: ShortRewriteLanguage[] = [];
  for (const entry of values) {
    const language = normalizeStoryLanguage(entry);
    if (!language) {
      continue;
    }
    parsed.push(language);
  }
  return [...new Set(parsed)];
}

export function firstSentence(text: string): string {
  const sentences = splitIntoSentences(text);
  return sentences[0] ?? normalizeWhitespace(text);
}

export function normalizeSentenceMatch(value: string): string {
  return normalizeWhitespace(value);
}

export function matchesFirstSentence(hook: string, narration: string): boolean {
  return normalizeSentenceMatch(hook) === normalizeSentenceMatch(firstSentence(narration));
}

export function countThumbnailWords(value: string): number {
  return countSpokenWords(value);
}

export function isNarrationWithinWordRange(wordCount: number): boolean {
  return (
    wordCount >= SHORT_REWRITE_HARD_WORD_RANGE.min &&
    wordCount <= SHORT_REWRITE_HARD_WORD_RANGE.max
  );
}

export function isPreferredNarrationLength(wordCount: number): boolean {
  return wordCount >= 150 && wordCount <= 165;
}

export function roundDuration(value: number): number {
  return Math.round(value * 100) / 100;
}

export function estimateDurationSeconds(wordCount: number, wordsPerMinute: number): number {
  return roundDuration((wordCount / wordsPerMinute) * 60);
}

export function detectProductionLabels(text: string): string[] {
  const patterns = [
    /(?:^|\n)\s*#{1,6}\s+/u,
    /\[pause\]/iu,
    /\[whisper\]/iu,
    /\[sound effect\]/iu,
    /\[music\]/iu,
    /\[scene change\]/iu,
    /\b(audio generation instructions|narration script|production directions|sound effect labels?)\b/iu,
  ];
  return patterns.some((pattern) => pattern.test(text)) ? ["production labels detected"] : [];
}

export function detectEditorialCommentary(text: string): string[] {
  const normalized = normalizeWhitespace(text).toLowerCase();
  const patterns: readonly RegExp[] = [
    /\bthe repeated detail mattered\b/iu,
    /\bthe danger became personal\b/iu,
    /\bthe plan appeared to work\b/iu,
    /\bthe apparent ending did not survive until morning\b/iu,
    /\bthe false calm allowed the next change\b/iu,
    /\bthe final evidence transformed survival\b/iu,
    /\bthis was the point at which\b/iu,
    /\bthe evidence did not explain the event; it only proved\b/iu,
    /\bobservation replaced disbelief\b/iu,
    /\bthe result showed that speed alone was useless\b/iu,
    /\bdie gefahr wurde persönlich\b/iu,
    /\bder plan schien zu funktionieren\b/iu,
    /\bdas detail(?:\s+)?war wichtig\b/iu,
    /\bdie trügerische ruhe\b/iu,
    /\ble danger est devenu personnel\b/iu,
    /\ble plan semblait fonctionner\b/iu,
    /\bla fausse accalmie\b/iu,
    /\bel peligro se volvió personal\b/iu,
    /\bel plan parecía funcionar\b/iu,
    /\bla calma aparente\b/iu,
    /\bo perigo se tornou pessoal\b/iu,
    /\bo plano parecia funcionar\b/iu,
    /\ba aparente calma\b/iu,
  ];
  return patterns.some((pattern) => pattern.test(normalized))
    ? ["editorial commentary detected"]
    : [];
}

export function hasGeneratedFullStoryProvenance(content: string): boolean {
  return content.includes(FULL_STORY_PROVENANCE_MARKER);
}

export function isEpisodeOutputFullStoryPath(
  candidatePath: string,
  outputRoot: string
): boolean {
  const relativePath = path.relative(path.resolve(outputRoot), path.resolve(candidatePath));
  if (relativePath.startsWith("..")) {
    return false;
  }
  const normalized = relativePath.split(path.sep).join("/");
  return /^(?:episodes\/)?[^/]+\/(?:script\.md|en\/full\/script\.md|en\/script\.md)$/iu.test(
    normalized
  ) || /^(?:episodes\/)?[^/]+\/script\.md$/iu.test(normalized);
}

export function ensureWithinOutputRoot(outputRoot: string, candidatePath: string): string {
  const resolvedRoot = path.resolve(outputRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Path escapes output root: ${candidatePath}`);
  }
  return resolvedCandidate;
}

export function buildShortRewriteBaseName(args: {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly language: ShortRewriteLanguage;
}): string {
  return `${buildCanonicalEpisodeSlug(args)}-${args.language}-short`;
}

export function resolveShortRewriteOutputPaths(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly episodeNumber: string;
  readonly language: ShortRewriteLanguage;
}): {
  readonly languageDir: string;
  readonly shortDir: string;
  readonly baseName: string;
  readonly markdownPath: string;
  readonly jsonPath: string;
  readonly compatibilityMarkdownPath: string;
  readonly compatibilityJsonPath: string;
  readonly manifestPath: string;
} {
  const episodeDir = ensureWithinOutputRoot(
    args.outputRoot,
    path.join(args.outputRoot, buildCanonicalEpisodeSlug(args))
  );
  const languageDir = path.join(episodeDir, args.language);
  const shortDir = path.join(languageDir, "short");
  const baseName = buildShortRewriteBaseName(args);
  return {
    languageDir,
    shortDir,
    baseName,
    markdownPath: path.join(shortDir, `${baseName}.md`),
    jsonPath: path.join(shortDir, `${baseName}.json`),
    compatibilityMarkdownPath: path.join(shortDir, "script.md"),
    compatibilityJsonPath: path.join(shortDir, "metadata.json"),
    manifestPath: path.join(episodeDir, "manifests", "short-rewrite-manifest.json"),
  };
}

export async function readJsonIfExists<T>(
  filePath: string,
  parser: (value: unknown) => T
): Promise<T | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  return parser(JSON.parse(await fs.readFile(filePath, "utf8")) as unknown);
}

export async function writeTextAtomicIfChanged(filePath: string, value: string): Promise<"written" | "skipped"> {
  if (await fileExists(filePath)) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === value) {
      return "skipped";
    }
  }
  await writeTextAtomic(filePath, value);
  return "written";
}

export async function writeJsonAtomicIfChanged(filePath: string, value: unknown): Promise<"written" | "skipped"> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  return writeTextAtomicIfChanged(filePath, serialized);
}

export function buildValidationSummary(args: {
  readonly wordCount: number;
  readonly hookMatchesNarration: boolean;
  readonly thumbnailText: string;
  readonly narration: string;
}): ShortRewriteValidation {
  const thumbnailWordCount = countThumbnailWords(args.thumbnailText);
  const warnings: string[] = [];
  if (args.wordCount < 150) {
    warnings.push("Narration is below the preferred word range.");
  }
  if (args.wordCount > 165) {
    warnings.push("Narration exceeds the preferred word range.");
  }
  if (args.wordCount < SHORT_REWRITE_HARD_WORD_RANGE.min) {
    warnings.push("Narration is below the hard minimum.");
  }
  if (args.wordCount > SHORT_REWRITE_HARD_WORD_RANGE.max) {
    warnings.push("Narration exceeds the hard maximum.");
  }
  if (thumbnailWordCount > SHORT_REWRITE_THUMBNAIL_WORD_LIMIT) {
    warnings.push("Thumbnail text exceeds the four-word limit.");
  }
  if (!args.hookMatchesNarration) {
    warnings.push("Hook does not match the first sentence of the narration.");
  }
  if (detectProductionLabels(args.narration).length > 0) {
    warnings.push("Narration contains production labels.");
  }
  if (detectEditorialCommentary(args.narration).length > 0) {
    warnings.push("Narration contains editorial commentary.");
  }
  return {
    preferredWordRangeSatisfied: args.wordCount >= 150 && args.wordCount <= 165,
    hardWordRangeSatisfied:
      args.wordCount >= SHORT_REWRITE_HARD_WORD_RANGE.min &&
      args.wordCount <= SHORT_REWRITE_HARD_WORD_RANGE.max,
    hookMatchesNarration: args.hookMatchesNarration,
    thumbnailWordCount,
    warnings,
  };
}

export function buildUsageRecord(args: {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number | null;
}): {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number | null;
} {
  return {
    ...(args.inputTokens !== undefined ? { inputTokens: args.inputTokens } : {}),
    ...(args.cachedInputTokens !== undefined ? { cachedInputTokens: args.cachedInputTokens } : {}),
    ...(args.reasoningTokens !== undefined ? { reasoningTokens: args.reasoningTokens } : {}),
    ...(args.outputTokens !== undefined ? { outputTokens: args.outputTokens } : {}),
    ...(args.totalTokens !== undefined ? { totalTokens: args.totalTokens } : {}),
    ...(args.estimatedCostUsd !== undefined ? { estimatedCostUsd: args.estimatedCostUsd } : {}),
  };
}

export function isSupportedStoryLanguage(value: string): value is ShortRewriteLanguage {
  return value in SHORT_REWRITE_SUPPORTED_LANGUAGES;
}
