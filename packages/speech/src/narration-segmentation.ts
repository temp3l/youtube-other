import path from "node:path";
import {
  countSpokenWords,
  hashText,
  normalizeWhitespace,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  LANGUAGE_PROFILES,
  type LanguageCode,
} from "@mediaforge/story-localization";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  type NarrationChunk,
  type NarrationChunkManifest,
  type NarrationFlowIntent,
  type NarrationRole,
  type NarrationVariant,
  narrationChunkManifestSchema,
} from "./narration-schemas.js";
import {
  createNarrationArtifactPaths,
  type NarrationArtifactPathSet,
} from "./narration-paths.js";

export interface NarrationSegmentationConfig {
  readonly mode?: "deterministic" | "manual" | "fallback";
  readonly version?: string;
  readonly minDurationMs?: number;
  readonly targetDurationMs?: number;
  readonly maxDurationMs?: number;
  readonly minWordsPerChunk?: number;
  readonly targetWordsPerChunk?: number;
  readonly maxWordsPerChunk?: number;
  readonly hardMaxWordsPerChunk?: number;
  readonly contextWords?: number;
}

export interface SegmentNarrationRequest {
  readonly episodeDir: string;
  readonly episodeId?: string;
  readonly language: string;
  readonly locale?: string;
  readonly variant?: NarrationVariant;
  readonly spokenText: string;
  readonly spokenTextHash?: string;
  readonly outputPath?: string;
  readonly createdAt?: string;
  readonly config?: NarrationSegmentationConfig;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
  };
}

export interface SegmentNarrationResult {
  readonly manifest: NarrationChunkManifest;
  readonly paths: NarrationArtifactPathSet;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
}

interface SentenceUnit {
  readonly text: string;
  readonly paragraphIndex: number;
  readonly sentenceIndex: number;
}

interface ChunkDraft {
  readonly sentences: readonly SentenceUnit[];
  readonly fallback: boolean;
}

const defaultConfig = {
  minDurationMs: 15_000,
  targetDurationMs: 28_000,
  maxDurationMs: 40_000,
  contextWords: 14,
  version: "deterministic-beat-v1",
} as const;

const sentenceBoundaryPattern = /(?<=[.!?…]["'»”)]*)\s+/u;

function localeForLanguage(language: string): string {
  const normalized = language.toLowerCase();
  return normalized === "en" || normalized === "de" || normalized === "es" || normalized === "fr" || normalized === "pt"
    ? normalized
    : normalized.split("-", 1)[0] ?? normalized;
}

function languageWpm(language: string, variant: NarrationVariant): number {
  const locale = localeForLanguage(language);
  if (locale === "en" || locale === "de" || locale === "es" || locale === "fr" || locale === "pt") {
    const profile = LANGUAGE_PROFILES[locale as LanguageCode];
    return variant === "short" ? profile.shortNarrationWpm : profile.fullNarrationWpm;
  }
  return 170;
}

function estimateDurationMs(wordCount: number, wpm: number): number {
  return (wordCount / Math.max(1, wpm)) * 60_000;
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/gu, "\n")
    .split(/\n{2,}/u)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length > 0);
}

function splitSentences(paragraph: string): string[] {
  const normalized = normalizeWhitespace(paragraph);
  if (normalized.length === 0) {
    return [];
  }
  return normalized
    .split(sentenceBoundaryPattern)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);
}

function parseSentences(text: string): SentenceUnit[] {
  return splitParagraphs(text).flatMap((paragraph, paragraphIndex) =>
    splitSentences(paragraph).map((sentence, sentenceIndex) => ({
      text: sentence,
      paragraphIndex,
      sentenceIndex,
    }))
  );
}

function wordsForDuration(durationMs: number, wpm: number): number {
  return Math.max(1, Math.round((durationMs / 60_000) * wpm));
}

function resolvedConfig(
  config: NarrationSegmentationConfig | undefined,
  wpm: number
): Required<NarrationSegmentationConfig> {
  const targetDurationMs = config?.targetDurationMs ?? defaultConfig.targetDurationMs;
  const maxDurationMs = config?.maxDurationMs ?? defaultConfig.maxDurationMs;
  const targetWordsPerChunk = config?.targetWordsPerChunk ?? wordsForDuration(targetDurationMs, wpm);
  const maxWordsPerChunk = config?.maxWordsPerChunk ?? wordsForDuration(maxDurationMs, wpm);
  return {
    mode: config?.mode ?? "deterministic",
    version: config?.version ?? defaultConfig.version,
    minDurationMs: config?.minDurationMs ?? defaultConfig.minDurationMs,
    targetDurationMs,
    maxDurationMs,
    minWordsPerChunk: config?.minWordsPerChunk ?? wordsForDuration(config?.minDurationMs ?? defaultConfig.minDurationMs, wpm),
    targetWordsPerChunk,
    maxWordsPerChunk,
    hardMaxWordsPerChunk: config?.hardMaxWordsPerChunk ?? Math.max(maxWordsPerChunk + 20, Math.ceil(maxWordsPerChunk * 1.25)),
    contextWords: config?.contextWords ?? defaultConfig.contextWords,
  };
}

function packSentenceUnits(sentences: readonly SentenceUnit[], maxWords: number, targetWords: number): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let buffer: SentenceUnit[] = [];
  let bufferWords = 0;
  const flush = (): void => {
    if (buffer.length > 0) {
      chunks.push({ sentences: buffer, fallback: true });
      buffer = [];
      bufferWords = 0;
    }
  };
  for (const sentence of sentences) {
    const sentenceWords = countSpokenWords(sentence.text);
    const candidateWords = bufferWords + sentenceWords;
    if (buffer.length > 0 && (candidateWords > maxWords || bufferWords >= targetWords)) {
      flush();
    }
    buffer.push(sentence);
    bufferWords += sentenceWords;
  }
  flush();
  return chunks;
}

function preferredParagraphChunks(sentences: readonly SentenceUnit[], maxWords: number, targetWords: number): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let paragraphBuffer: SentenceUnit[] = [];
  let paragraphIndex = -1;
  const flushParagraph = (): void => {
    if (paragraphBuffer.length === 0) {
      return;
    }
    const wordCount = countSpokenWords(paragraphBuffer.map((sentence) => sentence.text).join(" "));
    if (wordCount <= maxWords) {
      chunks.push({ sentences: paragraphBuffer, fallback: false });
    } else {
      chunks.push(...packSentenceUnits(paragraphBuffer, maxWords, targetWords));
    }
    paragraphBuffer = [];
  };
  for (const sentence of sentences) {
    if (paragraphIndex !== sentence.paragraphIndex) {
      flushParagraph();
      paragraphIndex = sentence.paragraphIndex;
    }
    paragraphBuffer.push(sentence);
  }
  flushParagraph();
  return chunks;
}

function roleForPosition(index: number, total: number, text: string): NarrationRole {
  const lower = text.toLowerCase();
  if (index === 0) {
    return "hook";
  }
  if (index === total - 1) {
    return /after|finally|ending|never again|seitdem|finalmente|enfin|por fim/u.test(lower) ? "closing" : "aftermath";
  }
  const ratio = index / Math.max(1, total - 1);
  if (/found|discovered|saw|realized|gefunden|descubri|trouv|descobriu/u.test(lower)) {
    return "discovery";
  }
  if (/but then|suddenly|worse|schlimmer|de pronto|soudain|de repente/u.test(lower)) {
    return "escalation";
  }
  if (/truth|reveal|secret|wahrheit|verdad|verite|segredo/u.test(lower)) {
    return "reveal";
  }
  if (ratio < 0.25) {
    return "setup";
  }
  if (ratio < 0.7) {
    return "escalation";
  }
  return "climax";
}

function flowIntentFor(index: number, total: number, text: string): NarrationFlowIntent {
  if (index === total - 1) {
    return "concludes";
  }
  return /[?:…]$/u.test(text.trim()) ? "unresolved_reveal" : "leads_next";
}

function excerpt(text: string, words: number, fromEnd: boolean): string {
  const parts = normalizeWhitespace(text).split(/\s+/u).filter((part) => part.length > 0);
  const selected = fromEnd ? parts.slice(-words) : parts.slice(0, words);
  return selected.join(" ");
}

function createChunks(
  drafts: readonly ChunkDraft[],
  wpm: number,
  config: Required<NarrationSegmentationConfig>
): NarrationChunk[] {
  return drafts.map((draft, index) => {
    const text = normalizeWhitespace(draft.sentences.map((sentence) => sentence.text).join(" "));
    const wordCount = countSpokenWords(text);
    const estimatedDurationMs = estimateDurationMs(wordCount, wpm);
    const previous = drafts[index - 1];
    const next = drafts[index + 1];
    const warnings =
      wordCount > config.maxWordsPerChunk || estimatedDurationMs > config.maxDurationMs
        ? [{ code: "CHUNK_SOFT_LIMIT_EXCEEDED", message: "Chunk exceeds preferred word or duration limits." }]
        : undefined;
    return {
      chunkId: `narr-chunk-${String(index + 1).padStart(3, "0")}`,
      sequence: index,
      text,
      textHash: hashText(text),
      role: roleForPosition(index, drafts.length, text),
      estimatedWordCount: wordCount,
      estimatedDurationMs,
      estimatedDurationSeconds: estimatedDurationMs / 1000,
      previousContextExcerpt: previous ? excerpt(previous.sentences.map((sentence) => sentence.text).join(" "), config.contextWords, true) : "",
      nextContextExcerpt: next ? excerpt(next.sentences.map((sentence) => sentence.text).join(" "), config.contextWords, false) : "",
      sourceParagraphRange: {
        start: draft.sentences[0]?.paragraphIndex ?? 0,
        end: draft.sentences[draft.sentences.length - 1]?.paragraphIndex ?? 0,
      },
      sourceSentenceRange: {
        start: draft.sentences[0]?.sentenceIndex ?? 0,
        end: draft.sentences[draft.sentences.length - 1]?.sentenceIndex ?? 0,
      },
      flowIntent: flowIntentFor(index, drafts.length, text),
      ...(warnings ? { warnings } : {}),
    };
  });
}

function validateHardLimits(chunks: readonly NarrationChunk[], config: Required<NarrationSegmentationConfig>): void {
  const oversized = chunks.find((chunk) => chunk.estimatedWordCount > config.hardMaxWordsPerChunk);
  if (oversized) {
    throw new Error(`Narration chunk ${oversized.chunkId} exceeds hard word limit.`);
  }
}

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

export async function segmentNarration(
  request: SegmentNarrationRequest
): Promise<SegmentNarrationResult> {
  const episodeId = request.episodeId ?? path.basename(request.episodeDir);
  const locale = request.locale ?? localeForLanguage(request.language);
  const variant = request.variant ?? "full";
  const paths = createNarrationArtifactPaths({
    episodeId,
    locale,
    variant,
    episodeRoot: request.episodeDir,
  });
  const spokenText = request.spokenText;
  const sentences = parseSentences(spokenText);
  if (sentences.length === 0) {
    throw new Error("Cannot segment empty spoken narration text.");
  }
  const wpm = languageWpm(request.language, variant);
  const config = resolvedConfig(request.config, wpm);
  let drafts = preferredParagraphChunks(sentences, config.maxWordsPerChunk, config.targetWordsPerChunk);
  let fallbackUsed = drafts.some((draft) => draft.fallback);
  let fallbackReason: string | undefined = fallbackUsed ? "paragraph-overflow" : undefined;
  try {
    validateHardLimits(createChunks(drafts, wpm, config), config);
  } catch {
    drafts = packSentenceUnits(sentences, config.maxWordsPerChunk, config.targetWordsPerChunk);
    fallbackUsed = true;
    fallbackReason = "sentence-packing";
  }
  const chunks = createChunks(drafts, wpm, config);
  validateHardLimits(chunks, config);
  const configFingerprint = hashText(JSON.stringify(config));
  const manifestWithoutFingerprint = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId,
    locale,
    variant,
    sourceSpokenTextHash: request.spokenTextHash ?? hashText(spokenText),
    segmentationConfig: {
      mode: config.mode,
      version: config.version,
      maxWordsPerChunk: config.maxWordsPerChunk,
      targetDurationMs: config.targetDurationMs,
      fingerprint: configFingerprint,
    },
    chunks,
    manifestFingerprint: hashText("pending"),
    createdAt: request.createdAt ?? new Date().toISOString(),
  };
  const manifest = narrationChunkManifestSchema.parse({
    ...manifestWithoutFingerprint,
    manifestFingerprint: hashText(JSON.stringify(manifestWithoutFingerprint)),
  });
  const outputPath = request.outputPath ?? paths.chunkManifest;
  await writeJsonAtomic(outputPath, manifest);
  const durations = chunks.map((chunk) => chunk.estimatedDurationMs / 1000);
  request.logger?.info(
    {
      episodeId,
      language: request.language,
      locale,
      variant,
      chunkCount: chunks.length,
      minEstimatedDurationSeconds: Math.min(...durations),
      maxEstimatedDurationSeconds: Math.max(...durations),
      avgEstimatedDurationSeconds: durations.reduce((sum, value) => sum + value, 0) / durations.length,
      fallbackUsed,
      fallbackReason,
      manifestFingerprint: manifest.manifestFingerprint,
      manifestPath: relative(request.episodeDir, outputPath),
    },
    "Segmented spoken narration."
  );
  return {
    manifest,
    paths,
    fallbackUsed,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
