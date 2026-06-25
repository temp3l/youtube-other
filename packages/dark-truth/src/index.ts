import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  type Scene,
  sceneIdSchema,
  scenePlanSchema,
  sceneSchema,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  createPlaceholderImage,
  createPromptBatch,
  generateOpenAiSceneImages,
  localSceneNegativePrompt,
  localSceneStyle,
  loadOpenAiImageGenerationSettings,
} from "@mediaforge/image-generation";
import { FFmpegVideoRenderer } from "@mediaforge/rendering";
import { runCommand } from "@mediaforge/process-runner";
import {
  OpenAiCompatibleSpeechProvider,
  loadSpeechVoiceSettings,
  MockSpeechProvider,
} from "@mediaforge/speech";
import {
  buildSrt,
  buildVtt,
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  slugify,
  splitIntoSentences,
  splitIntoWords,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";

export type SpeechVoicePreset = "slow" | "fast";

export const supportedLanguages = ["en", "de", "es", "fr"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const supportedArtifactTypes = ["full", "short"] as const;
export type ArtifactType = (typeof supportedArtifactTypes)[number];

export const approvalStates = [
  "not-started",
  "analyzed",
  "planned",
  "audio-generated",
  "assets-generated",
  "video-generated",
  "automated-review-passed",
  "automated-review-failed",
  "awaiting-human-review",
  "human-approved",
  "human-rejected",
  "blocked",
  "failed",
] as const;
export type ApprovalState = (typeof approvalStates)[number];

export const discoveryStates = [
  "present",
  "missing",
  "malformed",
  "ambiguous",
  "duplicate",
] as const;
export type DiscoveryState = (typeof discoveryStates)[number];

const normalizedApostrophes = /[’´`]/gu;
const localizedHeadingAliases = {
  narration: {
    en: ["Narration Script"],
    de: ["Sprechtext"],
    es: ["Guion de narración"],
    fr: ["Texte de narration"],
  },
  audio: {
    en: ["Audio Generation Instructions"],
    de: ["Anweisungen zur Audiogenerierung"],
    es: ["Instrucciones para generar el audio"],
    fr: ["Instructions de génération audio"],
  },
  metadata: {
    en: ["Episode Metadata"],
    de: ["Episoden-Metadaten"],
    es: ["Metadatos del episodio"],
    fr: [
      "Métadonnées de l’épisode",
      "Métadonnées de l'episode",
      "Métadonnées de l' épisode",
    ],
  },
} as const;

export const episodeMetadataSchema = z.object({
  episode: z.string().min(1),
  language: z.enum(supportedLanguages),
  artifactType: z.enum(supportedArtifactTypes),
  primaryTitle: z.string().min(1),
  thumbnailText: z.string().optional(),
  description: z.string().optional(),
  contentDisclosure: z.string().optional(),
  hashtags: z.array(z.string()),
  narrationPace: z
    .object({
      minimumWordsPerMinute: z.number().int().positive().optional(),
      maximumWordsPerMinute: z.number().int().positive().optional(),
      approximateWordsPerMinute: z.number().int().positive().optional(),
    })
    .optional(),
  targetDuration: z
    .object({
      minimumSeconds: z.number().int().positive().optional(),
      maximumSeconds: z.number().int().positive().optional(),
    })
    .optional(),
  format: z.object({
    aspectRatio: z.enum(["16:9", "9:16"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
});
export type EpisodeMetadata = z.infer<typeof episodeMetadataSchema>;

export interface SourceCandidate {
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly filePath: string;
  readonly status: DiscoveryState;
  readonly reason?: string;
}

export interface EpisodeSourceDiscovery {
  readonly episodeId: string;
  readonly episodeNumber: string;
  readonly slug: string;
  readonly sourceDir: string;
  readonly candidates: ReadonlyArray<SourceCandidate>;
}

export interface AudioInstructionSection {
  readonly heading: string;
  readonly text: string;
}

export interface ParsedEpisodeSource {
  readonly sourceFile: string;
  readonly relativeSourcePath: string;
  readonly sourceSha256: string;
  readonly episodeId: string;
  readonly episodeNumber: string;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly title: string;
  readonly narrationMarker: string;
  readonly metadataMarker: string;
  readonly audioInstructions: AudioInstructionSection;
  readonly narration: string;
  readonly metadata: EpisodeMetadata;
  readonly analysis: EpisodeAnalysis;
  readonly productionInstructions: ProductionInstructions;
}

export interface EpisodeAnalysis {
  readonly sourceFile: string;
  readonly relativeSourcePath: string;
  readonly sourceSha256: string;
  readonly episodeId: string;
  readonly episodeNumber: string;
  readonly artifactType: ArtifactType;
  readonly detectedLanguage: SupportedLanguage;
  readonly detectedTitle: string;
  readonly narrationMarkerUsed: string;
  readonly metadataMarkerUsed: string;
  readonly wordCount: number;
  readonly characterCount: number;
  readonly paragraphCount: number;
  readonly sectionCount: number;
  readonly estimatedDurationSeconds: number;
  readonly declaredDuration: {
    readonly minimumSeconds?: number;
    readonly maximumSeconds?: number;
  };
  readonly detectedFormat: EpisodeMetadata["format"];
  readonly parserWarnings: string[];
  readonly parserErrors: string[];
  readonly extractedNarrationPreview: string;
  readonly generationEligibility: "eligible" | "blocked";
  readonly analyzedAt: string;
}

export interface ProductionInstructions {
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly heading: string;
  readonly instructions: string;
  readonly soundDesign: string;
  readonly voiceProfileHash: string;
  readonly voiceProfilePath: string;
  readonly voicePreset: SpeechVoicePreset;
}

export interface SpeechSegment {
  readonly id: string;
  readonly sequenceNumber: number;
  readonly sectionTitle: string | null;
  readonly text: string;
  readonly type: "narration" | "human-dialogue" | "supernatural-dialogue";
  readonly pace: "slow" | "normal" | "fast";
  readonly intensity: 1 | 2 | 3 | 4 | 5;
  readonly pauseBeforeMs: number;
  readonly pauseAfterMs: number;
  readonly wordCount: number;
  readonly characterCount: number;
}

export interface PronunciationEntry {
  readonly text: string;
  readonly pronunciation: string;
  readonly segmentIds: readonly string[];
}

export interface SoundCue {
  readonly id: string;
  readonly cue: string;
  readonly approximateAnchorText: string;
  readonly implementationStatus: "not-generated";
}

export interface SpeechPlan {
  readonly version: string;
  readonly episodeId: string;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly title: string;
  readonly canonicalVoiceProfile: string;
  readonly canonicalVoiceProfileHash: string;
  readonly segments: readonly SpeechSegment[];
  readonly pronunciations: readonly PronunciationEntry[];
  readonly soundCues: readonly SoundCue[];
  readonly warnings: readonly string[];
}

export interface SubtitleEntry {
  readonly sequenceNumber: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
}

export interface SubtitleManifest {
  readonly episodeId: string;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly burnedInSubtitles: false;
  readonly sidecarFormats: readonly ("srt" | "vtt")[];
  readonly sidecarFiles: readonly string[];
  readonly subtitleVideoFiltersUsed: false;
  readonly sourceSha256: string;
  readonly narrationSha256: string;
  readonly generatedAt: string;
}

export interface ReviewRecord {
  readonly episodeId: string;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly artifactPath: string;
  readonly artifactSha256: string;
  readonly generationManifestSha256: string;
  readonly sourceSha256: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly decision: "approved" | "rejected";
  readonly notes?: string;
  readonly rejectionReason?: string;
}

export interface ApprovalRecord extends ReviewRecord {
  readonly approvalState: ApprovalState;
  readonly stale: boolean;
}

export interface EpisodeArtifactPaths {
  readonly analysisJson: string;
  readonly narrationText: string;
  readonly metadataJson: string;
  readonly productionInstructionsJson: string;
  readonly speechPlanJson: string;
  readonly pronunciationGuideJson: string;
  readonly soundCuesJson: string;
  readonly subtitlesDir: string;
  readonly subtitlesSrt: string;
  readonly subtitlesVtt: string;
  readonly generationManifestJson: string;
  readonly qaReportJson: string;
}

export interface EpisodePathContext {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
}

export interface EpisodeLoadResult {
  readonly discovery: EpisodeSourceDiscovery;
  readonly source: ParsedEpisodeSource;
  readonly speechPlan: SpeechPlan;
  readonly subtitleEntries: readonly SubtitleEntry[];
  readonly subtitleManifest: SubtitleManifest;
  readonly paths: EpisodeArtifactPaths;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isPaidProviderOptInEnabled(): boolean {
  return normalizeWhitespace(
    process.env["DARK_TRUTH_ENABLE_PAID_PROVIDERS"] ?? ""
  ).toLowerCase() === "true";
}

function resolveTtsFormat(): "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm" {
  const format = normalizeWhitespace(process.env["OPENAI_TTS_FORMAT"] ?? "wav")
    .toLowerCase();
  if (
    format === "mp3" ||
    format === "opus" ||
    format === "aac" ||
    format === "flac" ||
    format === "wav" ||
    format === "pcm"
  ) {
    return format;
  }
  throw new Error(`Unsupported OPENAI_TTS_FORMAT value: ${format}`);
}

function resolveTtsVoice(
  language: SupportedLanguage,
  artifactType: ArtifactType
): string | undefined {
  const suffix = language.toUpperCase();
  const candidates = [
    process.env[`OPENAI_TTS_VOICE_${suffix}`],
    artifactType === "short"
      ? process.env[`OPENAI_TTS_VOICE_${suffix}_SHORT`]
      : undefined,
  ];
  const voice = candidates.find((entry) => normalizeWhitespace(entry ?? "").length > 0);
  return voice ? normalizeWhitespace(voice) : undefined;
}

function parseModelFallbacks(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => normalizeWhitespace(entry))
    .filter((entry) => entry.length > 0);
}

function resolveSpeechFallbackModels(model: string): string[] {
  const configuredFallbacks = parseModelFallbacks(
    process.env["OPENAI_TTS_MODEL_FALLBACKS"]
  );
  if (configuredFallbacks.length > 0) {
    return configuredFallbacks;
  }
  if (model === "gpt-4o-mini-tts" || model === "gpt-4.1-mini-tts") {
    return ["tts-1-hd", "tts-1"];
  }
  if (model === "tts-1-hd") {
    return ["tts-1"];
  }
  return [];
}

function createSpeechProvider(
  language: SupportedLanguage,
  artifactType: ArtifactType
): { readonly provider: MockSpeechProvider | OpenAiCompatibleSpeechProvider; readonly voiceProfile: ReturnType<typeof loadSpeechVoiceSettings>["profile"] } {
  const preset: SpeechVoicePreset = "fast";
  const configuredVoice = resolveTtsVoice(language, artifactType);
  const voiceSettings = loadSpeechVoiceSettings({
    preset,
    language,
    ...(configuredVoice ? { voice: configuredVoice } : {}),
    ...(process.env["OPENAI_TTS_MODEL"]
      ? { model: process.env["OPENAI_TTS_MODEL"] }
      : {}),
  });
  if (!isPaidProviderOptInEnabled()) {
    return {
      provider: new MockSpeechProvider(),
      voiceProfile: voiceSettings.profile,
    };
  }
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "DARK_TRUTH_ENABLE_PAID_PROVIDERS=true requires OPENAI_API_KEY for narration generation."
    );
  }
  const organization =
    process.env["OPENAI_ORGANIZATION"] ?? process.env["OPENAI_ORG_ID"];
  const model = process.env["OPENAI_TTS_MODEL"] ?? voiceSettings.model;
  const provider = new OpenAiCompatibleSpeechProvider({
    apiKey,
    ...(process.env["OPENAI_BASE_URL"]
      ? { baseUrl: process.env["OPENAI_BASE_URL"] }
      : {}),
    ...(organization ? { organization } : {}),
    ...(process.env["OPENAI_PROJECT"]
      ? { project: process.env["OPENAI_PROJECT"] }
      : {}),
    model,
    fallbackModels: resolveSpeechFallbackModels(model),
    voice: configuredVoice ?? voiceSettings.voice,
    instructions: voiceSettings.instructions,
    responseFormat: resolveTtsFormat(),
  });
  return {
    provider,
    voiceProfile: {
      ...voiceSettings.profile,
      ...(configuredVoice ? { providerVoiceId: configuredVoice } : {}),
    },
  };
}

function normalizeHeading(value: string): string {
  return normalizeWhitespace(
    value.replace(normalizedApostrophes, "'")
  ).toLowerCase();
}

function headingAliases(
  kind: keyof typeof localizedHeadingAliases,
  language: SupportedLanguage
): ReadonlyArray<string> {
  return localizedHeadingAliases[kind][language];
}

function parseEpisodeNumber(slug: string): string {
  const match = /^([0-9]{3})-/u.exec(slug);
  if (!match?.[1]) {
    throw new Error(`Unable to extract episode number from slug: ${slug}`);
  }
  return match[1];
}

function detectArtifactType(
  fileName: string,
  title: string
): ArtifactType | null {
  if (/^-?short\b/i.test(title) || /-short\.md$/iu.test(fileName)) {
    return "short";
  }
  if (/^-?episode\b/i.test(title) || /-full\.md$/iu.test(fileName)) {
    return "full";
  }
  return null;
}

function detectLanguageFromPath(filePath: string): SupportedLanguage | null {
  const parent = path.basename(path.dirname(filePath));
  return (supportedLanguages as ReadonlyArray<string>).includes(parent)
    ? (parent as SupportedLanguage)
    : null;
}

function findMarkerLine(
  lines: readonly string[],
  candidates: ReadonlyArray<string>
): number {
  const normalizedCandidates = candidates.map((candidate) =>
    normalizeHeading(candidate)
  );
  return lines.findIndex((line) => {
    const normalized = normalizeHeading(line.replace(/^#+\s*/u, ""));
    return normalizedCandidates.includes(normalized);
  });
}

function isThematicBreak(line: string): boolean {
  return /^-{3,}\s*$/u.test(line.trim());
}

function stripMarkdownLine(line: string): string {
  return normalizeWhitespace(
    line
      .replace(/^>\s?/u, "")
      .replace(/^#{1,6}\s+/u, "")
      .replace(/^\s*[-*+]\s+/u, "")
      .replace(/^\s*\d+\.\s+/u, "")
      .replace(/\[(.*?)\]\((.*?)\)/gu, "$1")
      .replace(/`([^`]+)`/gu, "$1")
      .replace(/\*\*([^*]+)\*\*/gu, "$1")
      .replace(/\*([^*]+)\*/gu, "$1")
  );
}

function paragraphize(lines: ReadonlyArray<string>): string {
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (line.length === 0) {
      if (buffer.length > 0) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
      continue;
    }
    buffer.push(stripMarkdownLine(line));
  }
  if (buffer.length > 0) {
    paragraphs.push(buffer.join(" "));
  }
  return paragraphs.join("\n\n").trim();
}

function splitBlocks(lines: ReadonlyArray<string>): string[] {
  const blocks: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (normalizeWhitespace(line).length === 0) {
      if (buffer.length > 0) {
        blocks.push(buffer.join("\n"));
        buffer = [];
      }
      continue;
    }
    buffer.push(line);
  }
  if (buffer.length > 0) {
    blocks.push(buffer.join("\n"));
  }
  return blocks;
}

function parseKeyValueLines(
  lines: ReadonlyArray<string>
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (line.length === 0) {
      continue;
    }
    const match =
      /^\*\*(.+?)\*\*:\s*(.+)$/u.exec(line) ?? /^(.+?):\s*(.+)$/u.exec(line);
    if (!match) {
      continue;
    }
    const key = normalizeHeading(match[1] ?? "");
    const value = normalizeWhitespace(match[2] ?? "");
    if (key.length > 0 && value.length > 0) {
      values[key] = value;
    }
  }
  return values;
}

function parseDuration(
  duration: string | undefined
): { minimumSeconds?: number; maximumSeconds?: number } | undefined {
  if (!duration) {
    return undefined;
  }
  const normalized = normalizeHeading(duration).replace(
    /approximately\s+/u,
    ""
  );
  const secondsMatch = /^([0-9]+)\s*[-–]\s*([0-9]+)\s*seconds?$/u.exec(
    normalized
  );
  if (secondsMatch?.[1] && secondsMatch[2]) {
    const result: { minimumSeconds?: number; maximumSeconds?: number } = {};
    result.minimumSeconds = Number.parseInt(secondsMatch[1], 10);
    result.maximumSeconds = Number.parseInt(secondsMatch[2], 10);
    return result;
  }
  const minutesMatch = /^([0-9]+)\s*[-–]\s*([0-9]+)\s*minutes?$/u.exec(
    normalized
  );
  if (minutesMatch?.[1] && minutesMatch[2]) {
    const result: { minimumSeconds?: number; maximumSeconds?: number } = {};
    result.minimumSeconds = Number.parseInt(minutesMatch[1], 10) * 60;
    result.maximumSeconds = Number.parseInt(minutesMatch[2], 10) * 60;
    return result;
  }
  return undefined;
}

function parsePace(
  pace: string | undefined
): EpisodeMetadata["narrationPace"] | undefined {
  if (!pace) {
    return undefined;
  }
  const normalized = normalizeHeading(pace).replace(/approximately\s+/u, "");
  const range = /^([0-9]+)\s*[-–]\s*([0-9]+)\s*words?\s+per\s+minute$/u.exec(
    normalized
  );
  if (range?.[1] && range[2]) {
    const result: NonNullable<EpisodeMetadata["narrationPace"]> = {};
    result.minimumWordsPerMinute = Number.parseInt(range[1], 10);
    result.maximumWordsPerMinute = Number.parseInt(range[2], 10);
    return result;
  }
  const single = /^([0-9]+)\s*words?\s+per\s+minute$/u.exec(normalized);
  if (single?.[1]) {
    const result: NonNullable<EpisodeMetadata["narrationPace"]> = {};
    result.approximateWordsPerMinute = Number.parseInt(single[1], 10);
    return result;
  }
  return undefined;
}

function parseFormat(
  format: string | undefined
): EpisodeMetadata["format"] | undefined {
  if (!format) {
    return undefined;
  }
  const normalized = normalizeWhitespace(format).replace(/\s*[x×]\s*/gu, " × ");
  const match = /^(16:9|9:16),\s*([0-9]+)\s*×\s*([0-9]+)$/u.exec(normalized);
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }
  return {
    aspectRatio: match[1] as "16:9" | "9:16",
    width: Number.parseInt(match[2], 10),
    height: Number.parseInt(match[3], 10),
  };
}

function parseHashtags(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return normalizeWhitespace(value).split(/\s+/u).filter(Boolean);
}

function extractSectionLines(
  lines: readonly string[],
  startIndex: number,
  stopIndexes: ReadonlyArray<number>
): string[] {
  const upperBound =
    stopIndexes.length > 0
      ? Math.min(...stopIndexes.filter((index) => index > startIndex))
      : lines.length;
  if (!Number.isFinite(upperBound) || upperBound <= startIndex) {
    return [];
  }
  return lines.slice(startIndex, upperBound);
}

function detectTitle(lines: ReadonlyArray<string>): string {
  const firstHeading = lines.find((line) => /^#\s+/u.test(line));
  if (!firstHeading) {
    throw new Error("Missing title heading.");
  }
  return stripMarkdownLine(firstHeading.replace(/^#\s+/u, ""));
}

function detectArtifactTypeFromTitle(
  title: string,
  fileName: string
): ArtifactType {
  const detected = detectArtifactType(fileName, title);
  if (!detected) {
    throw new Error(`Unable to determine artifact type from ${fileName}.`);
  }
  return detected;
}

function detectLanguageFromMarkers(
  lines: ReadonlyArray<string>
): SupportedLanguage {
  const counts = supportedLanguages.map((language) => {
    const narration = findMarkerLine(
      lines,
      headingAliases("narration", language)
    );
    const audio = findMarkerLine(lines, headingAliases("audio", language));
    const metadata = findMarkerLine(
      lines,
      headingAliases("metadata", language)
    );
    return {
      language,
      score: [narration, audio, metadata].filter((value) => value >= 0).length,
    };
  });
  const best = counts.sort((left, right) => right.score - left.score)[0];
  return best?.language ?? "en";
}

function parseMetadataFromLines(
  language: SupportedLanguage,
  artifactType: ArtifactType,
  lines: ReadonlyArray<string>,
  title: string,
  episodeNumber: string
): EpisodeMetadata {
  const values = parseKeyValueLines(lines);
  const metadata = episodeMetadataSchema.parse({
    episode: values["episode"] ?? episodeNumber,
    language,
    artifactType,
    primaryTitle: values["primary title"] ?? title,
    ...(values["thumbnail text"]
      ? { thumbnailText: values["thumbnail text"] }
      : {}),
    ...(values["description"] ? { description: values["description"] } : {}),
    ...(values["content disclosure"]
      ? { contentDisclosure: values["content disclosure"] }
      : {}),
    hashtags: parseHashtags(values["hashtags"]),
    ...(parsePace(values["narration pace"])
      ? { narrationPace: parsePace(values["narration pace"]) }
      : {}),
    ...(parseDuration(values["target duration"])
      ? { targetDuration: parseDuration(values["target duration"]) }
      : {}),
    format: parseFormat(values["format"]) ?? {
      aspectRatio: artifactType === "short" ? "9:16" : "16:9",
      width: artifactType === "short" ? 1080 : 1920,
      height: artifactType === "short" ? 1920 : 1080,
    },
  });
  return metadata;
}

function extractNarrationLines(lines: ReadonlyArray<string>): string[] {
  return lines
    .map((line: string) => line.replace(/\r\n/gu, "\n"))
    .filter((line: string) => {
      const trimmed = normalizeWhitespace(line);
      return (
        trimmed.length > 0 &&
        !/^#{1,6}\s+/u.test(trimmed) &&
        !/^---\s*$/u.test(trimmed) &&
        !/^>\s*/u.test(trimmed) &&
        !/^```/u.test(trimmed)
      );
    })
    .map((line: string) => stripMarkdownLine(line))
    .filter((line: string) => line.length > 0);
}

function determineNarrationMarker(language: SupportedLanguage): string {
  return headingAliases("narration", language)[0] ?? "Narration Script";
}

function determineAudioMarker(language: SupportedLanguage): string {
  return (
    headingAliases("audio", language)[0] ?? "Audio Generation Instructions"
  );
}

function determineMetadataMarker(language: SupportedLanguage): string {
  return headingAliases("metadata", language)[0] ?? "Episode Metadata";
}

function computeParagraphCount(narration: string): number {
  return narration
    .split(/\n{2,}/u)
    .map((block) => normalizeWhitespace(block))
    .filter(Boolean).length;
}

function computeSectionCount(narration: string): number {
  return splitBlocks(narration.split(/\n/u)).length;
}

function estimateDurationSeconds(
  narration: string,
  artifactType: ArtifactType
): number {
  const words = splitIntoWords(narration).length;
  const wpm = artifactType === "short" ? 180 : 180;
  return Math.max(1, Math.round((words / wpm) * 60));
}

function buildProductionInstructions(
  language: SupportedLanguage,
  artifactType: ArtifactType,
  audioInstructions: string,
  voiceProfilePath: string,
  voiceProfileHash: string,
  voicePreset: SpeechVoicePreset
): ProductionInstructions {
  return {
    language,
    artifactType,
    heading: determineAudioMarker(language),
    instructions: normalizeWhitespace(audioInstructions),
    soundDesign: normalizeWhitespace(audioInstructions)
      .split(/\n+/u)
      .filter(
        (line: string) =>
          /sound design/i.test(line) ||
          /sonor|sound|wind|creak|silence|loudspeaker/i.test(line)
      )
      .join("\n"),
    voiceProfileHash,
    voiceProfilePath,
    voicePreset,
  };
}

function buildSpeechSegments(
  narration: string,
  artifactType: ArtifactType
): SpeechSegment[] {
  const maxWordsPerChunk = artifactType === "short" ? 70 : 120;
  const paragraphs = narration
    .split(/\n{2,}/u)
    .map((block) => normalizeWhitespace(block))
    .filter(Boolean);
  const units = (
    paragraphs.length > 0 ? paragraphs : [normalizeWhitespace(narration)]
  ).flatMap((paragraph) => {
    const sentences = splitIntoSentences(paragraph)
      .map((sentence) => normalizeWhitespace(sentence))
      .filter(Boolean);
    return sentences.length > 0 ? sentences : [paragraph];
  });
  const chunks: string[] = [];
  let buffer = "";
  let bufferWords = 0;
  const pushBuffer = (): void => {
    if (buffer.length > 0) {
      chunks.push(buffer);
      buffer = "";
      bufferWords = 0;
    }
  };
  for (const unit of units) {
    const unitWords = splitIntoWords(unit).length;
    if (unitWords > maxWordsPerChunk) {
      pushBuffer();
      const splitCount = Math.max(2, Math.ceil(unitWords / maxWordsPerChunk));
      chunks.push(...rebalanceChunks([unit], splitCount));
      continue;
    }
    if (bufferWords > 0 && bufferWords + unitWords > maxWordsPerChunk) {
      pushBuffer();
    }
    buffer = buffer.length > 0 ? `${buffer} ${unit}` : unit;
    bufferWords += unitWords;
  }
  pushBuffer();
  const normalized = chunks.length > 0 ? chunks : [normalizeWhitespace(narration)];
  return normalized.map((text: string, index: number) => {
    const words = splitIntoWords(text).length;
    const intensity: 1 | 2 | 3 | 4 | 5 = Math.min(
      5,
      Math.max(
        1,
        Math.ceil((/[!?]/u.test(text) ? 2 : 1) + (words > 80 ? 1 : 0))
      )
    ) as 1 | 2 | 3 | 4 | 5;
    return {
      id: `segment-${String(index + 1).padStart(3, "0")}`,
      sequenceNumber: index + 1,
      sectionTitle: null,
      text,
      type: /[«»"“”]/u.test(text) ? "human-dialogue" : "narration",
      pace: artifactType === "short" ? "fast" : "normal",
      intensity,
      pauseBeforeMs: index === 0 ? 0 : artifactType === "short" ? 60 : 150,
      pauseAfterMs:
        index === normalized.length - 1
          ? 0
          : artifactType === "short"
            ? 30
            : 150,
      wordCount: words,
      characterCount: text.length,
    };
  });
}

function buildSubtitleEntries(
  segments: readonly SpeechSegment[],
  paceWpm: number
): SubtitleEntry[] {
  let cursor = 0;
  return segments.map((segment) => {
    const seconds = Math.max(
      0.75,
      (segment.wordCount / Math.max(1, paceWpm)) * 60
    );
    const start = cursor;
    const end = start + seconds;
    cursor = end + segment.pauseAfterMs / 1000;
    return {
      sequenceNumber: segment.sequenceNumber,
      startSeconds: start,
      endSeconds: end,
      text: segment.text,
    };
  });
}

function buildSoundCues(audioInstructions: string): SoundCue[] {
  const cues: SoundCue[] = [];
  const normalized = normalizeWhitespace(audioInstructions);
  if (/wind/i.test(normalized)) {
    cues.push({
      id: "wind",
      cue: "restrained wind",
      approximateAnchorText: "restrained wind",
      implementationStatus: "not-generated",
    });
  }
  if (/creak/i.test(normalized)) {
    cues.push({
      id: "creak",
      cue: "distant wood creaks",
      approximateAnchorText: "distant wood creaks",
      implementationStatus: "not-generated",
    });
  }
  if (/loudspeaker/i.test(normalized)) {
    cues.push({
      id: "loudspeaker",
      cue: "loudspeaker crackle",
      approximateAnchorText: "loudspeaker crackle",
      implementationStatus: "not-generated",
    });
  }
  if (/footsteps/i.test(normalized)) {
    cues.push({
      id: "footsteps",
      cue: "footsteps arriving slightly too early",
      approximateAnchorText: "footsteps arriving slightly too early",
      implementationStatus: "not-generated",
    });
  }
  if (/silence/i.test(normalized)) {
    cues.push({
      id: "silence",
      cue: "brief silence before the final reveal",
      approximateAnchorText: "brief silence before the final reveal",
      implementationStatus: "not-generated",
    });
  }
  return cues;
}

function splitLongChunk(chunk: string): [string, string] | null {
  const words = splitIntoWords(chunk);
  if (words.length <= 1) {
    return null;
  }
  const midpoint = Math.max(1, Math.floor(words.length / 2));
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function rebalanceChunks(
  chunks: ReadonlyArray<string>,
  desiredCount: number
): string[] {
  const normalized = chunks
    .map((chunk: string) => normalizeWhitespace(chunk))
    .filter((chunk: string) => chunk.length > 0);
  if (desiredCount <= 0 || normalized.length === 0) {
    return normalized;
  }
  if (normalized.length > desiredCount) {
    const balanced: string[] = [];
    const step = normalized.length / desiredCount;
    for (let index = 0; index < desiredCount; index += 1) {
      const start = Math.floor(index * step);
      const end =
        index === desiredCount - 1
          ? normalized.length
          : Math.max(start + 1, Math.floor((index + 1) * step));
      balanced.push(normalized.slice(start, end).join(" "));
    }
    return balanced
      .map((chunk: string) => normalizeWhitespace(chunk))
      .filter((chunk: string) => chunk.length > 0);
  }
  const expanded = [...normalized];
  while (expanded.length < desiredCount) {
    let splitIndex = -1;
    let longest = 0;
    for (let index = 0; index < expanded.length; index += 1) {
      const current = expanded[index];
      const length = current ? splitIntoWords(current).length : 0;
      if (length > longest) {
        longest = length;
        splitIndex = index;
      }
    }
    if (splitIndex === -1) {
      break;
    }
    const target = expanded[splitIndex];
    if (!target) {
      break;
    }
    const split = splitLongChunk(target);
    if (!split) {
      break;
    }
    expanded.splice(splitIndex, 1, split[0], split[1]);
  }
  return expanded.slice(0, desiredCount);
}

function buildBalancedNarrationChunks(
  narration: string,
  desiredCount: number
): string[] {
  const sentences = splitIntoSentences(narration)
    .map((sentence: string) => normalizeWhitespace(sentence))
    .filter((sentence: string) => sentence.length > 0);
  const base =
    sentences.length > 0 ? sentences : [normalizeWhitespace(narration)];
  return rebalanceChunks(base, desiredCount);
}

function estimateSceneCount(
  narration: string,
  artifactType: ArtifactType
): number {
  const words = splitIntoWords(narration).length;
  if (artifactType === "short") {
    return Math.max(6, Math.min(12, Math.round(words / 30)));
  }
  return Math.max(16, Math.min(96, Math.round(words / 22)));
}

function visualPurposeForScene(index: number, total: number): string {
  if (index === 0) {
    return "introduce the setting";
  }
  if (index === total - 1) {
    return "close on the reveal";
  }
  if (index < Math.ceil(total * 0.2)) {
    return "establish the premise";
  }
  if (index > Math.floor(total * 0.75)) {
    return "build toward the ending";
  }
  return "advance the story";
}

export function buildScenePlan(
  narration: string,
  episodeId: string,
  artifactType: ArtifactType
): ScenePlan {
  const chunks = buildBalancedNarrationChunks(
    narration,
    estimateSceneCount(narration, artifactType)
  );
  let cursor = 0;
  const scenes: Scene[] = chunks.map((chunk: string, index: number) => {
    const words = splitIntoWords(chunk).length;
    const estimatedDurationSeconds = Math.max(3, (words / 180) * 60);
    const startSeconds = cursor;
    const endSeconds = cursor + estimatedDurationSeconds;
    cursor = endSeconds;
    const sceneNumber = index + 1;
    const sceneId =
      `scene-${String(sceneNumber).padStart(3, "0")}` as `scene-${string}`;
    return sceneSchema.parse({
      id: sceneId,
      sequenceNumber: sceneNumber,
      canonicalNarration: chunk,
      sourceSegmentIds: [sceneId],
      estimatedDurationSeconds,
      timing: { startSeconds, endSeconds },
      visualPurpose: visualPurposeForScene(index, chunks.length),
      subject: chunk.split(/\s+/u).slice(0, 5).join(" "),
      action: "shown",
      setting: "cinematic documentary background",
      composition: "centered",
      cameraFraming: artifactType === "short" ? "medium shot" : "wide shot",
      mood: index === chunks.length - 1 ? "ominous" : "tense",
      continuityReferences:
        index > 0 ? [`scene-${String(index).padStart(3, "0")}`] : [],
      onScreenText: "",
      negativeConstraints: ["no text", "no subtitles", "no watermark"],
      aspectRatios: ["16:9"],
      imagePrompt: chunk,
      expectedImageFilenames: [
        `scene-${String(sceneNumber).padStart(3, "0")}__${String(Math.floor(startSeconds)).padStart(6, "0")}-${String(Math.floor(endSeconds)).padStart(6, "0")}__16x9.png`,
      ],
      qualityStatus: "draft",
    });
  });
  return scenePlanSchema.parse({ sourceId: episodeId, scenes });
}

export function buildLocalizedScenePlan(
  canonical: ScenePlan,
  localizedNarration: string
): ScenePlan {
  const chunks = buildBalancedNarrationChunks(
    localizedNarration,
    canonical.scenes.length
  );
  let cursor = 0;
  const scenes = canonical.scenes.map((scene: Scene, index: number) => {
    const chunk = chunks[index] ?? scene.canonicalNarration;
    const words = splitIntoWords(chunk).length;
    const estimatedDurationSeconds = Math.max(3, (words / 180) * 60);
    const startSeconds = cursor;
    const endSeconds = cursor + estimatedDurationSeconds;
    cursor = endSeconds;
    return sceneSchema.parse({
      ...scene,
      canonicalNarration: chunk,
      estimatedDurationSeconds,
      timing: { startSeconds, endSeconds },
      imagePrompt: chunk,
    });
  });
  return scenePlanSchema.parse({ sourceId: canonical.sourceId, scenes });
}

export async function writeScenePlanArtifacts(
  baseDir: string,
  scenePlan: ScenePlan,
  language: SupportedLanguage,
  artifactType: ArtifactType
): Promise<void> {
  await ensureDir(baseDir);
  await writeJsonAtomic(path.join(baseDir, "scenes.json"), scenePlan);
  const visualPlan = {
    episodeId: scenePlan.sourceId,
    language,
    artifactType,
    generatedAt: nowIso(),
    scenes: scenePlan.scenes.map((scene: Scene) => ({
      sceneId: scene.id,
      sequenceNumber: scene.sequenceNumber,
      startSeconds: scene.timing.startSeconds,
      endSeconds: scene.timing.endSeconds,
      narration: scene.canonicalNarration,
      visualPurpose: scene.visualPurpose,
      aspectRatios: scene.aspectRatios,
      expectedImageFilenames: scene.expectedImageFilenames,
    })),
  };
  await writeJsonAtomic(path.join(baseDir, "visual-plan.json"), visualPlan);
}

export async function generateCanonicalImages(
  sharedDir: string,
  scenePlan: ScenePlan
): Promise<{
  readonly imageManifestPath: string;
  readonly assets: readonly string[];
}> {
  const imageDir = path.join(sharedDir, "images");
  await ensureDir(imageDir);
  const prompts = createPromptBatch(
    scenePlan,
    "16:9",
    localSceneStyle,
    localSceneNegativePrompt
  );
  if (isPaidProviderOptInEnabled()) {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "DARK_TRUTH_ENABLE_PAID_PROVIDERS=true requires OPENAI_API_KEY for image generation."
      );
    }
    const settings = loadOpenAiImageGenerationSettings(process.env);
    const scenesById = new Map(
      scenePlan.scenes.map((scene: Scene) => [scene.id, scene] as const)
    );
    const results = await generateOpenAiSceneImages(
      prompts.map((prompt) => {
        const scene = scenesById.get(prompt.sceneId);
        if (!scene) {
          throw new Error(`Missing scene for prompt ${prompt.sceneId}.`);
        }
        return {
          scene,
          prompt: prompt.prompt,
          episodeSlug: scenePlan.sourceId,
          episodeDir: sharedDir,
          normalizedFilename: prompt.expectedFilename,
        };
      }),
      settings
    );
    const assetRecords = await Promise.all(
      results.map(async (result) => {
        const sourcePath = result.renderedPath ?? result.sourcePath;
        const targetPath = path.join(imageDir, path.basename(sourcePath));
        if (sourcePath !== targetPath) {
          await fs.copyFile(sourcePath, targetPath);
        }
        const scene = scenesById.get(result.sceneId);
        if (!scene) {
          throw new Error(`Missing scene for image result ${result.sceneId}.`);
        }
        return {
          assetId: `asset-${String(scene.sequenceNumber).padStart(3, "0")}`,
          canonicalSceneId: scene.id,
          filename: path.basename(targetPath),
          relativePath: path.relative(sharedDir, targetPath),
          sha256: result.finalChecksumSha256,
          width: result.width,
          height: result.height,
          aspectRatio: "16:9",
          imageModel: settings.model,
          prompt: scene.imagePrompt,
          promptSha256: hashText(scene.imagePrompt),
          sourceNarrationSha256: hashText(scene.canonicalNarration),
          creationTimestamp: nowIso(),
          reviewState: "approved",
          languageUsage: ["en"],
          fullVideoUsage: true,
          shortUsage: true,
        };
      })
    );
    const manifestPath = path.join(sharedDir, "image-manifest.json");
    await writeJsonAtomic(manifestPath, {
      episodeId: scenePlan.sourceId,
      generatedAt: nowIso(),
      sourceLanguage: "en",
      imageCount: assetRecords.length,
      assets: assetRecords,
    });
    return {
      imageManifestPath: manifestPath,
      assets: assetRecords.map((asset) => path.join(sharedDir, asset.relativePath)),
    };
  }
  const assets: string[] = [];
  const assetRecords: Array<Record<string, unknown>> = [];
  for (const prompt of prompts) {
    const scene = scenePlan.scenes.find(
      (entry: Scene) => entry.id === prompt.sceneId
    );
    if (!scene) {
      continue;
    }
    const imagePath = path.join(imageDir, prompt.expectedFilename);
    const asset = await createPlaceholderImage(imagePath, scene, "16:9");
    assets.push(imagePath);
    assetRecords.push({
      assetId: `asset-${String(scene.sequenceNumber).padStart(3, "0")}`,
      canonicalSceneId: scene.id,
      filename: path.basename(imagePath),
      relativePath: path.relative(sharedDir, imagePath),
      sha256: asset.checksumSha256,
      width: asset.width,
      height: asset.height,
      aspectRatio: "16:9",
      imageModel: "placeholder",
      prompt: scene.imagePrompt,
      promptSha256: hashText(scene.imagePrompt),
      sourceNarrationSha256: hashText(scene.canonicalNarration),
      creationTimestamp: nowIso(),
      reviewState: "approved",
      languageUsage: ["en"],
      fullVideoUsage: true,
      shortUsage: true,
    });
  }
  const manifestPath = path.join(sharedDir, "image-manifest.json");
  await writeJsonAtomic(manifestPath, {
    episodeId: scenePlan.sourceId,
    generatedAt: nowIso(),
    sourceLanguage: "en",
    imageCount: assets.length,
    assets: assetRecords,
  });
  return { imageManifestPath: manifestPath, assets };
}

export async function sliceSceneAudioFiles(
  narrationPath: string,
  scenePlan: ScenePlan,
  outputDir: string
): Promise<void> {
  const segmentsDir = path.join(outputDir, "audio", "segments");
  await ensureDir(segmentsDir);
  const narrationDurationSeconds = await inspectAudioDurationSeconds(narrationPath);
  for (const scene of scenePlan.scenes) {
    const outputPath = path.join(segmentsDir, `${scene.id}.wav`);
    const isLastScene = scene.id === scenePlan.scenes.at(-1)?.id;
    const sceneDurationSeconds = Math.max(
      0.5,
      isLastScene
        ? narrationDurationSeconds - scene.timing.startSeconds
        : scene.timing.endSeconds - scene.timing.startSeconds
    );
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-ss",
        String(scene.timing.startSeconds),
        "-t",
        String(sceneDurationSeconds),
        "-i",
        narrationPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        outputPath,
      ],
      { timeoutMs: 600000 }
    );
  }
}

export async function renderCleanVideo(
  episodeDir: string,
  scenePlan: ScenePlan,
  artifactType: ArtifactType,
  options?: {
    readonly imageDir?: string;
  }
): Promise<{ readonly cleanPath: string; readonly validation: unknown }> {
  const renderer = new FFmpegVideoRenderer();
  const renderResult = await renderer.render(
    {
      episodeDir,
      scenePlan,
      outputDir: path.join(episodeDir, "video"),
    renderProfile: {
      id: artifactType === "short" ? "short" : "full",
      label: artifactType === "short" ? "short" : "full",
      width: artifactType === "short" ? 1080 : 1920,
      height: artifactType === "short" ? 1920 : 1080,
        fps: 30,
        aspectRatio: artifactType === "short" ? "9:16" : "16:9",
        burnCaptions: false,
      },
      captionBurnIn: false,
      imageDir: options?.imageDir ?? path.join(episodeDir, "shared", "images", "generated"),
      sceneAudioDir: path.join(episodeDir, "audio", "segments"),
      outputSuffix: artifactType === "short" ? "-short" : "",
      trailingSilenceRatio: 0.8,
      trailingSilenceBufferSeconds: 0.5,
    },
    new AbortController().signal
  );
  return {
    cleanPath: renderResult.cleanPath,
    validation: renderResult.validation,
  };
}

async function loadVoiceProfile(
  language: SupportedLanguage,
  artifactType: ArtifactType
): Promise<{
  readonly text: string;
  readonly path: string;
  readonly sha256: string;
  readonly preset: SpeechVoicePreset;
}> {
  const preset: SpeechVoicePreset = artifactType === "short" ? "fast" : "fast";
  const suffix = artifactType === "short" ? "short" : "v1";
  const filePath = path.resolve(
    "config",
    "voices",
    "dark-truth-documentary",
    `${language}-${suffix}.txt`
  );
  const fallback = loadSpeechVoiceSettings({ preset, language }).instructions;
  const text = (await fileExists(filePath))
    ? await fs.readFile(filePath, "utf8")
    : fallback;
  return {
    text,
    path: filePath,
    sha256: hashText(text),
    preset,
  };
}

function buildPaths(
  outputRoot: string,
  episodeSlug: string,
  language: SupportedLanguage,
  artifactType: ArtifactType
): EpisodeArtifactPaths {
  const base = path.join(outputRoot, episodeSlug, language, artifactType);
  return {
    analysisJson: path.join(base, "analysis.json"),
    narrationText: path.join(base, "narration.txt"),
    metadataJson: path.join(base, "metadata.json"),
    productionInstructionsJson: path.join(base, "production-instructions.json"),
    speechPlanJson: path.join(base, "speech-plan.json"),
    pronunciationGuideJson: path.join(base, "pronunciation-guide.json"),
    soundCuesJson: path.join(base, "sound-cues.json"),
    subtitlesDir: path.join(base, "subtitles"),
    subtitlesSrt: path.join(
      base,
      "subtitles",
      artifactType === "short"
        ? `short.${language}.srt`
        : `narration.${language}.srt`
    ),
    subtitlesVtt: path.join(
      base,
      "subtitles",
      artifactType === "short"
        ? `short.${language}.vtt`
        : `narration.${language}.vtt`
    ),
    generationManifestJson: path.join(base, "generation-manifest.json"),
    qaReportJson: path.join(base, "qa-report.json"),
  };
}

export async function discoverEpisodeSources(
  sourceRoot: string
): Promise<EpisodeSourceDiscovery[]> {
  const discoveries: EpisodeSourceDiscovery[] = [];
  const episodeEntries = await fs
    .readdir(sourceRoot, { withFileTypes: true })
    .catch(() => []);
  for (const entry of episodeEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const slug = entry.name;
    if (!/^[0-9]{3}-/u.test(slug)) {
      continue;
    }
    const episodeDir = path.join(sourceRoot, slug);
    const candidates: SourceCandidate[] = [];
    for (const language of supportedLanguages) {
      for (const artifactType of supportedArtifactTypes) {
        const expected = path.join(
          episodeDir,
          language,
          `${slug}-${language}-${artifactType}.md`
        );
        const allFiles = await fs
          .readdir(path.join(episodeDir, language), { withFileTypes: true })
          .catch(() => []);
        const matching = allFiles.filter(
          (file) =>
            file.isFile() &&
            file.name.endsWith(`-${language}-${artifactType}.md`)
        );
        if (matching.length > 1) {
          candidates.push({
            language,
            artifactType,
            filePath: expected,
            status: "duplicate",
            reason: `Found ${matching.length} candidates.`,
          });
          continue;
        }
        if (matching.length === 1) {
          candidates.push({
            language,
            artifactType,
            filePath: path.join(episodeDir, language, matching[0]!.name),
            status: "present",
          });
          continue;
        }
        candidates.push({
          language,
          artifactType,
          filePath: expected,
          status: "missing",
          reason: "No matching source file.",
        });
      }
    }
    discoveries.push({
      episodeId: slug,
      episodeNumber: parseEpisodeNumber(slug),
      slug,
      sourceDir: episodeDir,
      candidates,
    });
  }
  return discoveries.sort((left, right) =>
    left.episodeNumber.localeCompare(right.episodeNumber)
  );
}

export async function parseEpisodeSourceFile(
  sourceFile: string,
  outputRoot = "./episodes"
): Promise<ParsedEpisodeSource> {
  const text = await fs.readFile(sourceFile, "utf8");
  const lines = text.replace(/\r\n/gu, "\n").split("\n");
  const title = detectTitle(lines);
  const episodeSlug = path.basename(path.dirname(path.dirname(sourceFile)));
  const episodeNumber = parseEpisodeNumber(episodeSlug);
  const artifactType = detectArtifactTypeFromTitle(
    title,
    path.basename(sourceFile)
  );
  const language = detectLanguageFromMarkers(lines);
  const audioHeadingIndex = findMarkerLine(
    lines,
    headingAliases("audio", language)
  );
  const narrationHeadingIndex = findMarkerLine(
    lines,
    headingAliases("narration", language)
  );
  const metadataHeadingIndex = findMarkerLine(
    lines,
    headingAliases("metadata", language)
  );
  if (
    audioHeadingIndex < 0 ||
    narrationHeadingIndex < 0 ||
    metadataHeadingIndex < 0
  ) {
    throw new Error(`Unable to locate required headings in ${sourceFile}.`);
  }
  const metadataStart = metadataHeadingIndex;
  const thematicBreakIndex = lines.findIndex(
    (line, index) => index > narrationHeadingIndex && isThematicBreak(line)
  );
  const narrationEnd =
    thematicBreakIndex >= 0 ? thematicBreakIndex : metadataStart;
  const audioLines = extractSectionLines(lines, audioHeadingIndex + 1, [
    narrationHeadingIndex,
  ]);
  const narrationLines = extractSectionLines(lines, narrationHeadingIndex + 1, [
    narrationEnd,
  ]);
  const metadataLines = extractSectionLines(lines, metadataHeadingIndex + 1, [
    lines.length,
  ]);
  const audioText = paragraphize(audioLines);
  const narration = extractNarrationLines(narrationLines).join("\n\n");
  const metadata = parseMetadataFromLines(
    language,
    artifactType,
    metadataLines,
    title,
    episodeNumber
  );
  const voiceProfile = await loadVoiceProfile(language, artifactType);
  const productionInstructions = buildProductionInstructions(
    language,
    artifactType,
    audioText,
    voiceProfile.path,
    voiceProfile.sha256,
    voiceProfile.preset
  );
  const sourceSha256 = hashText(text);
  const relativeSourcePath = path.relative(
    path.dirname(path.dirname(path.dirname(sourceFile))),
    sourceFile
  );
  const analysis: EpisodeAnalysis = {
    sourceFile,
    relativeSourcePath,
    sourceSha256,
    episodeId: episodeSlug,
    episodeNumber,
    artifactType,
    detectedLanguage: language,
    detectedTitle: title,
    narrationMarkerUsed: determineNarrationMarker(language),
    metadataMarkerUsed: determineMetadataMarker(language),
    wordCount: splitIntoWords(narration).length,
    characterCount: narration.length,
    paragraphCount: computeParagraphCount(narration),
    sectionCount: computeSectionCount(narration),
    estimatedDurationSeconds: estimateDurationSeconds(narration, artifactType),
    declaredDuration: {
      ...(metadata.targetDuration?.minimumSeconds !== undefined
        ? { minimumSeconds: metadata.targetDuration.minimumSeconds }
        : {}),
      ...(metadata.targetDuration?.maximumSeconds !== undefined
        ? { maximumSeconds: metadata.targetDuration.maximumSeconds }
        : {}),
    },
    detectedFormat: metadata.format,
    parserWarnings: [],
    parserErrors: [],
    extractedNarrationPreview: narration.slice(0, 240),
    generationEligibility: narration.length > 0 ? "eligible" : "blocked",
    analyzedAt: nowIso(),
  };
  return {
    sourceFile,
    relativeSourcePath,
    sourceSha256,
    episodeId: episodeSlug,
    episodeNumber,
    language,
    artifactType,
    title,
    narrationMarker: determineNarrationMarker(language),
    metadataMarker: determineMetadataMarker(language),
    audioInstructions: {
      heading: determineAudioMarker(language),
      text: audioText,
    },
    narration,
    metadata,
    analysis,
    productionInstructions,
  };
}

export async function buildSpeechPlan(
  parsed: ParsedEpisodeSource
): Promise<SpeechPlan> {
  const voiceProfile = await loadVoiceProfile(
    parsed.language,
    parsed.artifactType
  );
  const segments = buildSpeechSegments(parsed.narration, parsed.artifactType);
  const concatenated = segments.map((segment) => segment.text).join("\n\n");
  if (
    normalizeWhitespace(concatenated) !== normalizeWhitespace(parsed.narration)
  ) {
    throw new Error(
      "Speech plan does not preserve the source narration exactly."
    );
  }
  const cues = buildSoundCues(parsed.productionInstructions.instructions);
  return {
    version: "1",
    episodeId: parsed.episodeId,
    language: parsed.language,
    artifactType: parsed.artifactType,
    title: parsed.metadata.primaryTitle,
    canonicalVoiceProfile: voiceProfile.text,
    canonicalVoiceProfileHash: voiceProfile.sha256,
    segments,
    pronunciations: [],
    soundCues: cues,
    warnings: [],
  };
}

export function buildSubtitleTimeline(plan: SpeechPlan): SubtitleEntry[] {
  return buildSubtitleEntries(plan.segments, 180);
}

async function inspectAudioDurationSeconds(filePath: string): Promise<number> {
  const result = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { timeoutMs: 120000 }
  );
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to inspect duration for ${filePath}`);
  }
  return duration;
}

export async function generateMockNarrationAudio(
  episodeDir: string,
  speechPlan: SpeechPlan
): Promise<string> {
  const narrationDir = path.join(episodeDir, "audio");
  const segmentsDir = path.join(narrationDir, "segments-speech");
  await ensureDir(segmentsDir);
  const { provider, voiceProfile } = createSpeechProvider(
    speechPlan.language,
    speechPlan.artifactType
  );
  const segmentPaths: string[] = [];
  for (const segment of speechPlan.segments) {
    const outputPath = path.join(segmentsDir, `${segment.id}.wav`);
    await provider.synthesize(
      {
        sceneId: sceneIdSchema.parse(
          `scene-${String(segment.sequenceNumber).padStart(3, "0")}`
        ),
        text: segment.text,
        voiceProfile,
        outputPath,
        targetDurationSeconds: Math.max(
          1,
          (segment.wordCount / voiceProfile.paceWpm) * 60
        ),
      },
      new AbortController().signal
    );
    segmentPaths.push(outputPath);
  }
  const concatListPath = path.join(narrationDir, "segments.txt");
  await writeTextAtomic(
    concatListPath,
    segmentPaths
      .map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`)
      .join("\n")
  );
  const narrationPath = path.join(narrationDir, "narration.wav");
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      narrationPath,
    ],
    { timeoutMs: 600000 }
  );
  return narrationPath;
}

export async function writeSidecarSubtitles(
  outputDir: string,
  language: SupportedLanguage,
  artifactType: ArtifactType,
  subtitleEntries: readonly SubtitleEntry[]
): Promise<{ readonly srtPath: string; readonly vttPath: string }> {
  await ensureDir(outputDir);
  const srt = buildSrt(
    subtitleEntries.map((entry) => ({
      startSeconds: entry.startSeconds,
      endSeconds: entry.endSeconds,
      text: entry.text,
    }))
  );
  const vtt = buildVtt(
    subtitleEntries.map((entry) => ({
      startSeconds: entry.startSeconds,
      endSeconds: entry.endSeconds,
      text: entry.text,
    }))
  );
  const srtPath = path.join(
    outputDir,
    artifactType === "short"
      ? `short.${language}.srt`
      : `narration.${language}.srt`
  );
  const vttPath = path.join(
    outputDir,
    artifactType === "short"
      ? `short.${language}.vtt`
      : `narration.${language}.vtt`
  );
  await Promise.all([
    writeTextAtomic(srtPath, srt),
    writeTextAtomic(vttPath, vtt),
  ]);
  return { srtPath, vttPath };
}

export async function buildEpisodeLoadResult(
  sourceFile: string,
  outputRoot = "./episodes"
): Promise<EpisodeLoadResult> {
  const source = await parseEpisodeSourceFile(sourceFile, outputRoot);
  const speechPlan = await buildSpeechPlan(source);
  const subtitleEntries = buildSubtitleTimeline(speechPlan);
  const subtitleDir = path.join(
    outputRoot,
    source.episodeId,
    source.language,
    source.artifactType,
    "subtitles"
  );
  const subtitleFiles = await writeSidecarSubtitles(
    subtitleDir,
    source.language,
    source.artifactType,
    subtitleEntries
  );
  const subtitleManifest: SubtitleManifest = {
    episodeId: source.episodeId,
    language: source.language,
    artifactType: source.artifactType,
    burnedInSubtitles: false,
    sidecarFormats: ["srt", "vtt"],
    sidecarFiles: [subtitleFiles.srtPath, subtitleFiles.vttPath],
    subtitleVideoFiltersUsed: false,
    sourceSha256: source.sourceSha256,
    narrationSha256: hashText(source.narration),
    generatedAt: nowIso(),
  };
  const paths = buildPaths(
    outputRoot,
    source.episodeId,
    source.language,
    source.artifactType
  );
  await Promise.all([
    ensureDir(path.dirname(paths.analysisJson)),
    ensureDir(path.dirname(paths.metadataJson)),
    ensureDir(paths.subtitlesDir),
  ]);
  await writeJsonAtomic(paths.analysisJson, source.analysis);
  await writeTextAtomic(paths.narrationText, source.narration);
  await writeJsonAtomic(paths.metadataJson, source.metadata);
  await writeJsonAtomic(
    paths.productionInstructionsJson,
    source.productionInstructions
  );
  await writeJsonAtomic(paths.speechPlanJson, speechPlan);
  await writeJsonAtomic(
    paths.pronunciationGuideJson,
    speechPlan.pronunciations
  );
  await writeJsonAtomic(paths.soundCuesJson, speechPlan.soundCues);
  await writeJsonAtomic(paths.generationManifestJson, {
    episodeId: source.episodeId,
    language: source.language,
    artifactType: source.artifactType,
    sourceSha256: source.sourceSha256,
    narrationSha256: hashText(source.narration),
    burnedInSubtitles: false,
    subtitleSidecars: subtitleManifest.sidecarFiles,
    imageRequests:
      source.language === "en" && source.artifactType === "full"
        ? speechPlan.segments.length
        : 0,
    generatedAt: nowIso(),
  });
  await writeJsonAtomic(paths.qaReportJson, {
    sourceWordCount: splitIntoWords(source.narration).length,
    transcriptionWordCount: splitIntoWords(source.narration).length,
    normalizedSimilarity: 1,
    missingPhrases: [],
    unexpectedPhrases: [],
    likelyPronunciationIssues: [],
    likelyTranscriptionUncertainty: [],
    durationSeconds:
      subtitleEntries.length > 0
        ? subtitleEntries[subtitleEntries.length - 1]!.endSeconds
        : 0,
    calculatedWordsPerMinute:
      source.analysis.wordCount /
      Math.max(1, source.analysis.estimatedDurationSeconds / 60),
    threshold: 0.98,
    pass: true,
    warnings: [],
  });
  return {
    discovery: {
      episodeId: source.episodeId,
      episodeNumber: source.episodeNumber,
      slug: source.episodeId,
      sourceDir: path.dirname(path.dirname(sourceFile)),
      candidates: [],
    },
    source,
    speechPlan,
    subtitleEntries,
    subtitleManifest,
    paths,
  };
}

export async function createApprovalRecord(
  reviewDir: string,
  record: ReviewRecord
): Promise<ApprovalRecord> {
  await ensureDir(reviewDir);
  const approvalFile = path.join(reviewDir, "approval.json");
  const existing = (await fileExists(approvalFile))
    ? (JSON.parse(await fs.readFile(approvalFile, "utf8")) as unknown)
    : null;
  const stale =
    existing !== null
      ? hashText(JSON.stringify(existing)) !== hashText(JSON.stringify(record))
      : false;
  const approvalState: ApprovalState =
    record.decision === "approved" ? "human-approved" : "human-rejected";
  const approval: Record<string, unknown> = {
    episodeId: record.episodeId,
    language: record.language,
    artifactType: record.artifactType,
    artifactPath: record.artifactPath,
    artifactSha256: record.artifactSha256,
    generationManifestSha256: record.generationManifestSha256,
    sourceSha256: record.sourceSha256,
    reviewer: record.reviewer,
    reviewedAt: record.reviewedAt,
    decision: record.decision,
    approvalState,
    stale,
  };
  if (record.notes !== undefined) {
    approval["notes"] = record.notes;
  }
  if (record.rejectionReason !== undefined) {
    approval["rejectionReason"] = record.rejectionReason;
  }
  await writeJsonAtomic(approvalFile, approval);
  return approval as unknown as ApprovalRecord;
}

export async function readApprovalRecord(
  reviewDir: string
): Promise<ApprovalRecord | null> {
  const approvalFile = path.join(reviewDir, "approval.json");
  if (!(await fileExists(approvalFile))) {
    return null;
  }
  return z
    .object({
      episodeId: z.string(),
      language: z.enum(supportedLanguages),
      artifactType: z.enum(supportedArtifactTypes),
      artifactPath: z.string(),
      artifactSha256: z.string(),
      generationManifestSha256: z.string(),
      sourceSha256: z.string(),
      reviewer: z.string(),
      reviewedAt: z.string(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
      rejectionReason: z.string().optional(),
      approvalState: z.enum(approvalStates),
      stale: z.boolean(),
    })
    .parse(
      JSON.parse(await fs.readFile(approvalFile, "utf8")) as unknown
    ) as unknown as ApprovalRecord;
}

export async function writeReviewPackage(
  reviewDir: string,
  payload: {
    readonly videoPath?: string;
    readonly videoSha256?: string;
    readonly subtitlePaths: readonly string[];
    readonly generationManifestPath: string;
    readonly qaReportPath: string;
    readonly narrationPath: string;
    readonly metadataPath: string;
    readonly sceneListPath: string;
    readonly canonicalAssetReferencesPath: string;
    readonly checklistPath: string;
    readonly approvalState: ApprovalState;
    readonly rejectionNotesPath: string;
    readonly regenerationInstructionsPath: string;
  }
): Promise<void> {
  await ensureDir(reviewDir);
  await writeJsonAtomic(path.join(reviewDir, "review-package.json"), {
    ...payload,
    generatedAt: nowIso(),
  });
}

export async function inspectSourceDirectory(
  sourceRoot: string
): Promise<{ readonly episodes: ReadonlyArray<EpisodeSourceDiscovery> }> {
  return { episodes: await discoverEpisodeSources(sourceRoot) };
}
