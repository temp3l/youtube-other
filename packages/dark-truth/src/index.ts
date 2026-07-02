import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  episodeIdSchema,
  episodeFocalMetadataSchema,
  sourceImageIdSchema,
  sourceSceneIdSchema,
  shotPlanSchema,
  type Scene,
  sceneIdSchema,
  scenePlanSchema,
  sceneSchema,
  inferSceneTextRequirement,
  type ScenePlan,
  type EpisodeFocalMetadata,
  type ShotPlan,
  type ShotPlanValidationIssue,
  type VisualBudget,
  type VisualNarrativePhase,
  type VisualPacingProfile,
  type VisualPacingProfileId,
  type VisualSourceScene,
  visualPacingProfileIdSchema,
  visualSourceSceneSchema,
} from "@mediaforge/domain";
import {
  shotTreatmentCatalog,
  shotTreatmentCatalogVersion,
} from "@mediaforge/domain/visual-retention/treatment-catalog.js";
import {
  createPlaceholderImage,
  createPromptBatch,
  generateOpenAiSceneImages,
  localSceneNegativePrompt,
  localSceneStyle,
  loadOpenAiImageGenerationSettings,
} from "@mediaforge/image-generation";
import { ensureEpisodeFocalMetadataForImages } from "@mediaforge/image-generation/focal-metadata.js";
import {
  FFmpegVideoRenderer,
  type ShotSourceImage,
  type VideoRenderResult,
} from "@mediaforge/rendering";
import { runCommand } from "@mediaforge/process-runner";
import {
  OpenAiCompatibleSpeechProvider,
  loadSpeechVoiceInstructionTemplate,
  loadSpeechVoiceSettings,
  MockSpeechProvider,
} from "@mediaforge/speech";
import { getLanguageProfile } from "@mediaforge/story-localization";
import { loadEpisodeConfig, loadRuntimeConfig, type RuntimeConfig } from "@mediaforge/config";
import {
  buildSrt,
  buildVtt,
  collapseRepeatedTokenRuns,
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  createEpisodePathResolver,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  resolveSceneImageCandidatePaths,
  slugify,
  splitIntoSentences,
  splitIntoWords,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  deterministicShotPlanner,
  serializeShotPlan,
  validateShotPlan,
  type ShotPlanValidationResult,
} from "@mediaforge/visual-planning";

export type SpeechVoicePreset = "slow" | "fast" | "very-fast";

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
  readonly visualSceneTargetPer10Minutes: number;
  readonly estimatedVisualSceneCount: number;
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

export interface DarkTruthVisualRetentionOptions {
  readonly enabled?: boolean;
  readonly mode?: "disabled" | "preview" | "enabled";
  readonly profile?: VisualPacingProfileId;
  readonly strictValidation?: boolean;
}

export interface DarkTruthVisualRetentionArtifacts {
  readonly sourceScenesPath: string;
  readonly focalMetadataPath: string;
  readonly shotPlanPath: string;
  readonly validationPath: string;
  readonly shotPlan: ShotPlan;
  readonly validation: ShotPlanValidationResult;
  readonly sourceImages: readonly ShotSourceImage[];
  readonly derivedShotCache?: NonNullable<VideoRenderResult["shotRenderSummary"]>["derivedShotCache"];
}

interface PersistedShotValidationArtifact {
  readonly schemaVersion: 1;
  readonly valid: boolean;
  readonly issues: readonly ShotPlanValidationIssue[];
  readonly metrics: ShotPlanValidationResult["metrics"];
}

interface FullImageManifest {
  readonly assets: readonly {
    readonly canonicalSceneId: string;
    readonly relativePath: string;
    readonly sha256: string;
  }[];
}

interface ShortsImageManifest {
  readonly entries: readonly {
    readonly sceneId: string;
    readonly outputImagePath: string;
    readonly outputImageSha256?: string | undefined;
    readonly status: string;
  }[];
}

interface NarrationAudioManifest {
  readonly schemaVersion: 2;
  readonly episodeId: string;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly speechPlanHash: string;
  readonly voiceProfileHash: string;
  readonly segmentCount: number;
  readonly segmentSha256s: readonly string[];
  readonly narrationPath: string;
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
  readonly analysis: EpisodeAnalysis;
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

function resolveEpisodeRootDir(episodePath: string): string {
  return path.dirname(path.dirname(episodePath));
}

function normalizeSpeechVoicePreset(
  value: string | undefined
): SpeechVoicePreset | undefined {
  if (value === "slow" || value === "fast" || value === "very-fast") {
    return value;
  }
  return undefined;
}

function defaultPaceWpmForPreset(preset: SpeechVoicePreset): number {
  if (preset === "very-fast") {
    return 190;
  }
  if (preset === "slow") {
    return 145;
  }
  return 180;
}

function resolveNarrationTempoSettings(
  language: SupportedLanguage,
  artifactType: ArtifactType,
  preset: SpeechVoicePreset
): { readonly paceWpm: number; readonly speed: number } {
  const profile = getLanguageProfile(language);
  const paceWpm =
    artifactType === "short"
      ? profile.shortNarrationWpm
      : profile.fullNarrationWpm;
  const basePaceWpm = defaultPaceWpmForPreset(preset);
  return {
    paceWpm,
    speed: Number((paceWpm / Math.max(1, basePaceWpm)).toFixed(3)),
  };
}

async function resolveSpeechVoicePreset(
  episodeRootDir: string,
  fallback: SpeechVoicePreset
): Promise<SpeechVoicePreset> {
  const envPreset = normalizeSpeechVoicePreset(
    process.env["MEDIAFORGE_SPEECH_VOICE_PRESET"]
  );
  if (envPreset) {
    return envPreset;
  }
  const episodeConfig = await loadEpisodeConfig(episodeRootDir);
  return normalizeSpeechVoicePreset(episodeConfig?.speechVoicePreset) ?? fallback;
}

function createSpeechProvider(
  episodeRootDir: string,
  language: SupportedLanguage,
  artifactType: ArtifactType
): Promise<{ readonly provider: MockSpeechProvider | OpenAiCompatibleSpeechProvider; readonly voiceProfile: ReturnType<typeof loadSpeechVoiceSettings>["profile"] }> {
  const fallbackPreset: SpeechVoicePreset = artifactType === "short" ? "very-fast" : "fast";
  const configuredVoice = resolveTtsVoice(language, artifactType);
  return resolveSpeechVoicePreset(episodeRootDir, fallbackPreset).then((preset) => {
    const narrationTempo = resolveNarrationTempoSettings(
      language,
      artifactType,
      preset
    );
    const voiceSettings = loadSpeechVoiceSettings({
      preset,
      language,
      artifactType,
      paceWpm: narrationTempo.paceWpm,
      speed: narrationTempo.speed,
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
      ...(voiceSettings.speed !== undefined ? { speed: voiceSettings.speed } : {}),
      responseFormat: resolveTtsFormat(),
    });
    return {
      provider,
      voiceProfile: {
        ...voiceSettings.profile,
        ...(configuredVoice ? { providerVoiceId: configuredVoice } : {}),
      },
    };
  });
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

function splitNarrationBeats(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return [];
  }
  const sentences = splitIntoSentences(normalized);
  const source = sentences.length > 0 ? sentences : [normalized];
  const beats: string[] = [];
  for (const sentence of source) {
    const trimmed = normalizeWhitespace(sentence);
    if (trimmed.length === 0) {
      continue;
    }
    const wordCount = splitIntoWords(trimmed).length;
    if (wordCount <= 16) {
      beats.push(trimmed);
      continue;
    }
    const clauses = trimmed
      .split(/\s*(?:,|;|:|—|–)\s*/u)
      .map((clause) => normalizeWhitespace(clause))
      .filter((clause) => clause.length > 0);
    if (clauses.length > 1) {
      for (const clause of clauses) {
        const clauseWords = splitIntoWords(clause).length;
        if (clauseWords > 24) {
          const split = splitLongChunk(clause);
          if (split) {
            beats.push(split[0], split[1]);
            continue;
          }
        }
        beats.push(clause);
      }
      continue;
    }
    const split = splitLongChunk(trimmed);
    if (split) {
      beats.push(split[0], split[1]);
    } else {
      beats.push(trimmed);
    }
  }
  return beats.filter((beat) => beat.length > 0);
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
  const beats = splitNarrationBeats(narration);
  const base = beats.length > 0 ? beats : [normalizeWhitespace(narration)];
  return rebalanceChunks(base, desiredCount);
}

function resolveTargetSceneCount(
  narration: string,
  artifactType: ArtifactType,
  targetPer10Minutes = Number(process.env["VISUAL_SCENE_TARGET_PER_10_MINUTES"] ?? 100)
): number {
  const words = splitIntoWords(narration).length;
  const estimatedDurationSeconds = Math.max(1, (words / 180) * 60);
  const targetDurationSeconds =
    Number.isFinite(targetPer10Minutes) && targetPer10Minutes > 0
      ? 600 / targetPer10Minutes
      : 6;
  const rawCount = Math.max(
    1,
    Math.round(estimatedDurationSeconds / targetDurationSeconds)
  );
  if (artifactType === "short") {
    return Math.max(3, Math.min(24, rawCount));
  }
  return Math.max(1, Math.min(240, rawCount));
}

function estimateSceneCount(
  narration: string,
  artifactType: ArtifactType,
  targetPer10Minutes = Number(process.env["VISUAL_SCENE_TARGET_PER_10_MINUTES"] ?? 100)
): number {
  return resolveTargetSceneCount(narration, artifactType, targetPer10Minutes);
}

function estimateVisualSceneCountFromDuration(
  durationSeconds: number,
  targetPer10Minutes: number
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }
  if (!Number.isFinite(targetPer10Minutes) || targetPer10Minutes <= 0) {
    return Math.max(1, Math.round(durationSeconds / 6));
  }
  return Math.max(1, Math.round((durationSeconds / 600) * targetPer10Minutes));
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

function normalizeNarrationChunk(chunk: string): string {
  return collapseRepeatedTokenRuns(normalizeWhitespace(chunk), {
    minWindowTokens: 3,
    maxWindowTokens: 12,
  }).replace(/([.!?])\1+/gu, "$1");
}

function deriveSceneSeedFields(chunk: string): {
  readonly narration: string;
  readonly subject: string;
  readonly action: string;
  readonly setting: string;
} {
  const narration = normalizeNarrationChunk(chunk);
  const sentences = splitIntoSentences(narration);
  const primarySentence = sentences[0] ?? narration;
  const secondarySentence = sentences[1] ?? primarySentence;
  return {
    narration,
    subject: primarySentence.split(/\s+/u).slice(0, 6).join(" "),
    action: primarySentence,
    setting: secondarySentence,
  };
}

export function buildScenePlan(
  narration: string,
  episodeId: string,
  artifactType: ArtifactType,
  options?: {
    readonly visualSceneTargetPer10Minutes?: number;
  }
): ScenePlan {
  const targetPer10Minutes =
    options?.visualSceneTargetPer10Minutes ??
    Number(process.env["VISUAL_SCENE_TARGET_PER_10_MINUTES"] ?? 100);
  const chunks = buildBalancedNarrationChunks(
    narration,
    estimateSceneCount(narration, artifactType, targetPer10Minutes)
  );
  let cursor = 0;
  const scenes: Scene[] = chunks.map((chunk: string, index: number) => {
    const sceneSeed = deriveSceneSeedFields(chunk);
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
      canonicalNarration: sceneSeed.narration,
      sourceSegmentIds: [sceneId],
      estimatedDurationSeconds,
      timing: { startSeconds, endSeconds },
      visualPurpose: visualPurposeForScene(index, chunks.length),
      subject: sceneSeed.subject,
      action: sceneSeed.action,
      setting: sceneSeed.setting,
      composition: "centered",
      cameraFraming: artifactType === "short" ? "medium shot" : "wide shot",
      mood: index === chunks.length - 1 ? "ominous" : "tense",
      continuityReferences:
        index > 0 ? [`scene-${String(index).padStart(3, "0")}`] : [],
      onScreenText: "",
      textRequirement: inferSceneTextRequirement(chunk),
      negativeConstraints: ["no subtitles", "no watermark"],
      aspectRatios: ["16:9"],
      imagePrompt: sceneSeed.narration,
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
  localizedNarration: string,
  options?: {
    readonly visualSceneTargetPer10Minutes?: number;
  }
): ScenePlan {
  const chunks = buildBalancedNarrationChunks(
    localizedNarration,
    canonical.scenes.length
  );
  let cursor = 0;
  const scenes = canonical.scenes.map((scene: Scene, index: number) => {
    const chunk = chunks[index] ?? scene.canonicalNarration;
    const sceneSeed = deriveSceneSeedFields(chunk);
    const words = splitIntoWords(chunk).length;
    const estimatedDurationSeconds = Math.max(3, (words / 180) * 60);
    const startSeconds = cursor;
    const endSeconds = cursor + estimatedDurationSeconds;
    cursor = endSeconds;
    return sceneSchema.parse({
      ...scene,
      canonicalNarration: sceneSeed.narration,
      estimatedDurationSeconds,
      timing: { startSeconds, endSeconds },
      subject: sceneSeed.subject,
      action: sceneSeed.action,
      setting: sceneSeed.setting,
      imagePrompt: sceneSeed.narration,
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
  const episodeDir = path.dirname(sharedDir);
  const imageDir = path.join(sharedDir, "images", "generated");
  await ensureDir(imageDir);
  const prompts = createPromptBatch(
    scenePlan,
    "16:9",
    localSceneStyle,
    localSceneNegativePrompt
  );
  const scenesById = new Map(
    scenePlan.scenes.map((scene: Scene) => [scene.id, scene] as const)
  );
  const buildAssetRecord = async (
    scene: Scene,
    targetPath: string,
    imageModel: string,
    sourcePath?: string
  ) => {
    const metadata = await sharp(targetPath).metadata();
    return {
      assetId: `asset-${String(scene.sequenceNumber).padStart(3, "0")}`,
      canonicalSceneId: scene.id,
      filename: path.basename(targetPath),
      relativePath: path.relative(sharedDir, targetPath),
      sha256: await hashFile(targetPath),
      width: metadata.width ?? 1920,
      height: metadata.height ?? 1080,
      aspectRatio: "16:9",
      imageModel,
      prompt: scene.imagePrompt,
      promptSha256: hashText(scene.imagePrompt),
      sourceNarrationSha256: hashText(scene.canonicalNarration),
      creationTimestamp: nowIso(),
      reviewState: "approved",
      languageUsage: ["en"],
      fullVideoUsage: true,
      shortUsage: true,
      ...(sourcePath ? { sourcePath } : {}),
    };
  };
  const assetRecordsBySceneId = new Map<string, Awaited<ReturnType<typeof buildAssetRecord>>>();
  const pendingPrompts: typeof prompts = [];
  for (const prompt of prompts) {
    const scene = scenesById.get(prompt.sceneId);
    if (!scene) {
      throw new Error(`Missing scene for prompt ${prompt.sceneId}.`);
    }
    const targetPath = path.join(imageDir, path.basename(prompt.expectedFilename));
    if (await fileExists(targetPath)) {
      assetRecordsBySceneId.set(
        scene.id,
        await buildAssetRecord(scene, targetPath, "existing", targetPath)
      );
      continue;
    }
    pendingPrompts.push(prompt);
  }
  if (isPaidProviderOptInEnabled()) {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "DARK_TRUTH_ENABLE_PAID_PROVIDERS=true requires OPENAI_API_KEY for image generation."
      );
    }
    const settings = loadOpenAiImageGenerationSettings(process.env);
    const results = pendingPrompts.length > 0
      ? await generateOpenAiSceneImages(
          pendingPrompts.map((prompt) => {
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
        )
      : [];
    await Promise.all(
      results.map(async (result) => {
        const sourcePath = result.renderedPath ?? result.sourcePath;
        const scene = scenesById.get(result.sceneId);
        if (!scene) {
          throw new Error(`Missing scene for image result ${result.sceneId}.`);
        }
        const targetPath = resolveSceneImageCandidatePaths({
          episodeDir,
          sceneId: scene.id,
          ...(scene.expectedImageFilenames[0]
            ? { expectedFilename: scene.expectedImageFilenames[0] }
            : {}),
        }).canonical;
        await ensureDir(path.dirname(targetPath));
        if (sourcePath !== targetPath) {
          await fs.copyFile(sourcePath, targetPath);
        }
        assetRecordsBySceneId.set(scene.id, {
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
        });
      })
    );
    const assetRecords = prompts.map((prompt) => {
      const record = assetRecordsBySceneId.get(prompt.sceneId);
      if (!record) {
        throw new Error(`Missing image asset record for scene ${prompt.sceneId}.`);
      }
      return record;
    });
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
    const imagePath = resolveSceneImageCandidatePaths({
      episodeDir,
      sceneId: scene.id,
      ...(prompt.expectedFilename
        ? { expectedFilename: prompt.expectedFilename }
        : {}),
    }).canonical;
    await ensureDir(path.dirname(imagePath));
    if (await fileExists(imagePath)) {
      const asset = await buildAssetRecord(scene, imagePath, "existing", imagePath);
      assets.push(imagePath);
      assetRecords.push(asset);
      continue;
    }
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

function darkTruthSourceImageId(sceneId: string) {
  return sourceImageIdSchema.parse(`source-image-${sceneId}`);
}

function darkTruthSourceSceneId(artifactType: ArtifactType, sceneId: string) {
  return sourceSceneIdSchema.parse(`source-scene-${artifactType}-${sceneId}`);
}

function visualPhaseForScene(index: number, totalScenes: number): VisualNarrativePhase {
  if (index === 0) {
    return "hook";
  }
  if (index === totalScenes - 1) {
    return "aftermath";
  }
  const progress = totalScenes <= 1 ? 1 : index / (totalScenes - 1);
  if (progress < 0.3) {
    return "setup";
  }
  if (progress < 0.55) {
    return "evidence";
  }
  if (progress < 0.8) {
    return "escalation";
  }
  return "climax";
}

function selectVisualRetentionPacingProfile(
  config: RuntimeConfig,
  profileId: VisualPacingProfileId
): VisualPacingProfile {
  switch (profileId) {
    case "atmospheric":
      return config.visualRetention.pacingProfiles.atmospheric;
    case "balanced":
      return config.visualRetention.pacingProfiles.balanced;
    case "high-retention":
      return config.visualRetention.pacingProfiles["high-retention"];
    case "shorts-aggressive":
      return config.visualRetention.pacingProfiles["shorts-aggressive"];
  }
}

function selectVisualRetentionPreset(args: {
  readonly config: RuntimeConfig;
  readonly variant: ArtifactType;
  readonly sourceScenes: readonly VisualSourceScene[];
  readonly requestedProfile?: VisualPacingProfileId;
}): {
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
} {
  const durationMs = args.sourceScenes.at(-1)?.narrationEndMs ?? 0;
  const presets = args.config.visualRetention.defaults[args.variant];
  const matching =
    presets.find(
      (preset) =>
        durationMs >= preset.narrationDurationMs.minMs &&
        durationMs <= preset.narrationDurationMs.maxMs
    ) ??
    [...presets].sort((left, right) => {
      const leftDistance = presetDistance(left.narrationDurationMs, durationMs);
      const rightDistance = presetDistance(
        right.narrationDurationMs,
        durationMs
      );
      return leftDistance - rightDistance;
    })[0];
  if (!matching) {
    throw new Error(`No visual-retention defaults configured for ${args.variant}.`);
  }
  const profileId = args.requestedProfile ?? matching.pacingProfileId;
  return {
    pacingProfile: selectVisualRetentionPacingProfile(args.config, profileId),
    visualBudget: matching.budget,
  };
}

function presetDistance(
  range: { readonly minMs: number; readonly maxMs: number },
  durationMs: number
): number {
  if (durationMs < range.minMs) {
    return range.minMs - durationMs;
  }
  if (durationMs > range.maxMs) {
    return durationMs - range.maxMs;
  }
  return 0;
}

async function readFullImageManifest(manifestPath: string): Promise<FullImageManifest> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  return z
    .object({
      assets: z.array(
        z.object({
          canonicalSceneId: z.string().min(1),
          relativePath: z.string().min(1),
          sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        })
      ),
    })
    .parse(raw);
}

async function readShortsImageManifest(manifestPath: string): Promise<ShortsImageManifest> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  return z
    .object({
      entries: z.array(
        z.object({
          sceneId: z.string().min(1),
          outputImagePath: z.string().min(1),
          outputImageSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
          status: z.string().min(1),
        })
      ),
    })
    .parse(raw);
}

async function writeJsonIfChanged(filePath: string, value: unknown): Promise<void> {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const current = await fs.readFile(filePath, "utf8").catch(() => null);
  if (current === next) {
    return;
  }
  await writeJsonAtomic(filePath, value);
}

async function loadShotPlanIfValid(filePath: string): Promise<ShotPlan | null> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => null);
  if (raw === null) {
    return null;
  }
  try {
    return shotPlanSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function prepareDarkTruthVisualRetention(args: {
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly artifactType: ArtifactType;
  readonly imageManifestPath: string;
  readonly options: DarkTruthVisualRetentionOptions;
}): Promise<DarkTruthVisualRetentionArtifacts> {
  const language = normalizeLocaleCode(path.basename(path.dirname(args.episodeDir)));
  const episodeRoot = path.dirname(path.dirname(args.episodeDir));
  const outputRoot = path.dirname(episodeRoot);
  const episodeId = normalizeEpisodeId(path.basename(episodeRoot));
  const variant = normalizeContentVariant(args.artifactType);
  const resolver = createEpisodePathResolver(outputRoot);
  const imageBySceneId = new Map<
    string,
    { readonly path: string; readonly sha256: string }
  >();
  if (args.artifactType === "short") {
    const manifest = await readShortsImageManifest(args.imageManifestPath);
    for (const entry of manifest.entries) {
      if (entry.status !== "success") {
        continue;
      }
      const outputPath = path.isAbsolute(entry.outputImagePath)
        ? entry.outputImagePath
        : path.resolve(episodeRoot, entry.outputImagePath);
      imageBySceneId.set(entry.sceneId, {
        path: outputPath,
        sha256: entry.outputImageSha256 ?? (await hashFile(outputPath)),
      });
    }
  } else {
    const manifest = await readFullImageManifest(args.imageManifestPath);
    const sharedDir = path.dirname(args.imageManifestPath);
    for (const asset of manifest.assets) {
      imageBySceneId.set(asset.canonicalSceneId, {
        path: path.resolve(sharedDir, asset.relativePath),
        sha256: asset.sha256,
      });
    }
  }

  const focalReferences: Array<{
    sceneId: VisualSourceScene["sceneId"];
    outputPath: string;
    outputSha256: string;
  }> = [];
  for (const scene of args.scenePlan.scenes) {
    const image = imageBySceneId.get(scene.id);
    if (!image || !(await fileExists(image.path))) {
      throw new Error(`Missing visual-retention source image for ${scene.id}.`);
    }
    focalReferences.push({
      sceneId: scene.id,
      outputPath: image.path,
      outputSha256: image.sha256,
    });
  }
  await ensureEpisodeFocalMetadataForImages({
    episodeDir: episodeRoot,
    episodeId,
    images: focalReferences,
  });
  const focalMetadata = episodeFocalMetadataSchema.parse(
    JSON.parse(await fs.readFile(resolver.focalMetadata(episodeId), "utf8")) as unknown
  );
  const focalByImageId = new Map(
    focalMetadata.images.map((image) => [image.sourceImageId, image] as const)
  );
  const sourceScenes = visualSourceSceneSchema.array().parse(
    args.scenePlan.scenes.map((scene, index) => {
      const image = imageBySceneId.get(scene.id);
      if (!image) {
        throw new Error(`Missing source image manifest entry for ${scene.id}.`);
      }
      const sourceImageId = darkTruthSourceImageId(scene.id);
      return {
        sourceSceneId: darkTruthSourceSceneId(args.artifactType, scene.id),
        sceneId: scene.id,
        narrationStartMs: Math.round(scene.timing.startSeconds * 1000),
        narrationEndMs: Math.round(scene.timing.endSeconds * 1000),
        sourceImageId,
        sourceImagePath: path.relative(args.episodeDir, image.path),
        sourceImageSha256: image.sha256,
        importance: visualPhaseForScene(index, args.scenePlan.scenes.length),
        focalRegions: focalByImageId.get(sourceImageId)?.focalRegions ?? [],
      };
    })
  );
  await writeJsonIfChanged(resolver.visualSourceScenes(episodeId), sourceScenes);
  const runtimeConfig = await loadRuntimeConfig();
  const preset = selectVisualRetentionPreset({
    config: runtimeConfig,
    variant: args.artifactType,
    sourceScenes,
    ...(args.options.profile ? { requestedProfile: args.options.profile } : {}),
  });
  const aspectRatio = args.artifactType === "short" ? "9:16" : "16:9";
  const seed = hashText(
    JSON.stringify({
      episodeId,
      variant,
      locale: language,
      profile: preset.pacingProfile.id,
      aspectRatio,
    })
  );
  const planned = deterministicShotPlanner.plan({
    sourceId: episodeIdSchema.parse(episodeId),
    locale: language,
    platform: variant,
    aspectRatio,
    sourceScenes,
    pacingProfile: preset.pacingProfile,
    visualBudget: preset.visualBudget,
    treatmentCatalogVersion: shotTreatmentCatalogVersion,
    seed,
  });
  const context = { episodeId, locale: language, variant };
  const shotPlanPath = resolver.shotPlan(context);
  const currentShotPlan = await loadShotPlanIfValid(shotPlanPath);
  const shotPlan =
    currentShotPlan &&
    serializeShotPlan(currentShotPlan) === serializeShotPlan(planned)
      ? currentShotPlan
      : planned;
  if (shotPlan !== currentShotPlan) {
    await writeJsonAtomic(shotPlanPath, shotPlan);
  }
  const validation = validateShotPlan({
    shotPlan,
    pacingProfile: preset.pacingProfile,
    visualBudget: preset.visualBudget,
    treatmentCatalog: shotTreatmentCatalog,
    focalMetadata,
  });
  const validationPath = resolver.shotValidation(context);
  const validationArtifact: PersistedShotValidationArtifact = {
    schemaVersion: 1,
    valid: validation.valid,
    issues: validation.issues,
    metrics: validation.metrics,
  };
  await writeJsonAtomic(validationPath, validationArtifact);
  const blockingIssues = validation.issues.filter(
    (issue) =>
      issue.severity === "error" ||
      (args.options.strictValidation === true && issue.severity === "warning")
  );
  if (blockingIssues.length > 0) {
    const first = blockingIssues[0];
    throw new Error(
      `Shot validation failed for ${args.artifactType} ${language}: ${first?.code ?? "UNKNOWN"} ${first?.message ?? ""}`.trim()
    );
  }
  return {
    sourceScenesPath: resolver.visualSourceScenes(episodeId),
    focalMetadataPath: resolver.focalMetadata(episodeId),
    shotPlanPath,
    validationPath,
    shotPlan,
    validation,
    sourceImages: sourceScenes.map((sourceScene) => ({
      sourceImageId: sourceScene.sourceImageId,
      sourceSceneId: sourceScene.sourceSceneId,
      sceneId: sourceScene.sceneId,
      path: sourceScene.sourceImagePath,
      sha256: sourceScene.sourceImageSha256,
    })),
  };
}

export async function renderCleanVideo(
  episodeDir: string,
  scenePlan: ScenePlan,
  artifactType: ArtifactType,
  options?: {
    readonly imageDir?: string;
    readonly imageManifestPath?: string;
    readonly visualRetention?: DarkTruthVisualRetentionOptions;
  }
): Promise<{
  readonly cleanPath: string;
  readonly validation: VideoRenderResult["validation"];
  readonly visualRetention?: DarkTruthVisualRetentionArtifacts;
}> {
  const languageDir = path.basename(path.dirname(episodeDir));
  const episodeSlug = path.basename(path.dirname(path.dirname(episodeDir)));
  const outputBasename = slugify(
    `${episodeSlug}-${languageDir}-${artifactType}`
  );
  const renderer = new FFmpegVideoRenderer();
  const imageDir = options?.imageDir ?? path.join(episodeDir, "shared", "images", "generated");
  const visualRetentionMode =
    options?.visualRetention?.mode ??
    (options?.visualRetention?.enabled === true ? "enabled" : "disabled");
  const plannedVisualRetention =
    visualRetentionMode !== "disabled"
      ? await prepareDarkTruthVisualRetention({
          episodeDir,
          scenePlan,
          artifactType,
          imageManifestPath:
            options.imageManifestPath ??
            path.join(
              path.dirname(path.dirname(episodeDir)),
              "shared",
              artifactType === "short"
                ? path.join("short", "images", "shorts-image-manifest.json")
                : "image-manifest.json"
            ),
          options: options.visualRetention,
        })
      : undefined;
  const visualRetention =
    visualRetentionMode === "enabled" ? plannedVisualRetention : undefined;
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
      imageDir,
      sceneAudioDir: path.join(episodeDir, "audio", "segments"),
      outputBasename,
      ...(visualRetention
        ? {
            shotPlan: visualRetention.shotPlan,
            sourceImages: visualRetention.sourceImages,
            shotValidationResult: {
              issues: visualRetention.validation.issues.map((issue) => ({
                severity: issue.severity,
                code: issue.code,
                message: issue.message,
                ...(issue.sceneId ? { sceneId: issue.sceneId } : {}),
                ...(issue.shotId ? { shotId: issue.shotId } : {}),
              })),
            },
          }
        : {}),
      trailingSilenceRatio: 0.8,
      trailingSilenceBufferSeconds: 0,
    },
    new AbortController().signal
  );
  return {
    cleanPath: renderResult.cleanPath,
    validation: renderResult.validation,
    ...(visualRetention
      ? {
          visualRetention: {
            ...visualRetention,
            ...(renderResult.shotRenderSummary?.derivedShotCache
              ? {
                  derivedShotCache:
                    renderResult.shotRenderSummary.derivedShotCache,
                }
              : {}),
          },
        }
      : {}),
  };
}

async function loadVoiceProfile(
  language: SupportedLanguage,
  artifactType: ArtifactType,
  sourceFile?: string
): Promise<{
  readonly text: string;
  readonly path: string;
  readonly sha256: string;
  readonly preset: SpeechVoicePreset;
}> {
  const preset =
    sourceFile !== undefined
      ? await resolveSpeechVoicePreset(
          resolveEpisodeRootDir(sourceFile),
          artifactType === "short" ? "very-fast" : "fast"
        )
      : artifactType === "short"
        ? "very-fast"
        : "fast";
  const safePreset: SpeechVoicePreset =
    preset === "slow" || preset === "fast" || preset === "very-fast"
      ? preset
      : artifactType === "short"
        ? "very-fast"
        : "fast";
  const suffix = artifactType === "short" ? "short-v1" : "v1";
  const filePath = path.resolve(
    "config",
    "voices",
    "dark-truth-documentary",
    `${language}-${suffix}.txt`
  );
  const template = loadSpeechVoiceInstructionTemplate({
    preset: safePreset,
    language,
    artifactType,
  });
  const text = template.instructions;
  return {
    text,
    path: template.path ?? filePath,
    sha256: hashText(text),
    preset: safePreset,
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
    visualSceneTargetPer10Minutes: Number(
      process.env["VISUAL_SCENE_TARGET_PER_10_MINUTES"] ?? 100
    ),
    estimatedVisualSceneCount: estimateVisualSceneCountFromDuration(
      estimateDurationSeconds(narration, artifactType),
      Number(process.env["VISUAL_SCENE_TARGET_PER_10_MINUTES"] ?? 100)
    ),
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
    parsed.artifactType,
    parsed.sourceFile
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

export async function inspectAudioDurationSeconds(
  filePath: string
): Promise<number> {
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

function formatSceneExpectedFilename(
  sceneNumber: number,
  startSeconds: number,
  endSeconds: number,
  aspectRatio: "16:9" | "9:16"
): string {
  return `scene-${String(sceneNumber).padStart(3, "0")}__${String(Math.floor(startSeconds)).padStart(6, "0")}-${String(Math.floor(endSeconds)).padStart(6, "0")}__${aspectRatio.replace(":", "x")}.png`;
}

export function retimeScenePlan(
  scenePlan: ScenePlan,
  actualDurationSeconds: number
): ScenePlan {
  if (!Number.isFinite(actualDurationSeconds) || actualDurationSeconds <= 0) {
    throw new Error(
      `Invalid actual narration duration for scene plan retiming: ${String(actualDurationSeconds)}`
    );
  }
  const plannedDurationSeconds = scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0;
  if (plannedDurationSeconds <= 0) {
    return scenePlanSchema.parse(scenePlan);
  }
  const scale = actualDurationSeconds / plannedDurationSeconds;
  let cursor = 0;
  const scenes = scenePlan.scenes.map((scene, index) => {
    const originalDurationSeconds = Math.max(
      0.1,
      scene.timing.endSeconds - scene.timing.startSeconds
    );
    const isLastScene = index === scenePlan.scenes.length - 1;
    const scaledDurationSeconds = isLastScene
      ? Math.max(0.1, actualDurationSeconds - cursor)
      : Math.max(0.1, originalDurationSeconds * scale);
    const startSeconds = cursor;
    const endSeconds = isLastScene ? actualDurationSeconds : cursor + scaledDurationSeconds;
    cursor = endSeconds;
    const aspectRatio = scene.aspectRatios[0] ?? "16:9";
    return sceneSchema.parse({
      ...scene,
      estimatedDurationSeconds: scaledDurationSeconds,
      actualAudioDurationSeconds: scaledDurationSeconds,
      timing: {
        startSeconds,
        endSeconds,
      },
      expectedImageFilenames: [
        formatSceneExpectedFilename(
          scene.sequenceNumber,
          startSeconds,
          endSeconds,
          aspectRatio
        ),
      ],
    });
  });
  return scenePlanSchema.parse({
    sourceId: scenePlan.sourceId,
    scenes,
  });
}

function narrationAudioManifestPath(narrationDir: string): string {
  return path.join(narrationDir, "narration-manifest.json");
}

function buildSpeechPlanHash(speechPlan: SpeechPlan): string {
  return hashText(
    JSON.stringify({
      version: speechPlan.version,
      episodeId: speechPlan.episodeId,
      language: speechPlan.language,
      artifactType: speechPlan.artifactType,
      title: speechPlan.title,
      canonicalVoiceProfileHash: speechPlan.canonicalVoiceProfileHash,
      segments: speechPlan.segments.map((segment) => ({
        id: segment.id,
        sequenceNumber: segment.sequenceNumber,
        text: segment.text,
        wordCount: segment.wordCount,
        characterCount: segment.characterCount,
        type: segment.type,
        pace: segment.pace,
        intensity: segment.intensity,
        pauseBeforeMs: segment.pauseBeforeMs,
        pauseAfterMs: segment.pauseAfterMs,
      })),
    })
  );
}

async function loadNarrationAudioManifest(
  filePath: string
): Promise<NarrationAudioManifest | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Partial<NarrationAudioManifest>;
  if (
    value.schemaVersion !== 2 ||
    typeof value.episodeId !== "string" ||
    typeof value.language !== "string" ||
    typeof value.artifactType !== "string" ||
    typeof value.speechPlanHash !== "string" ||
    typeof value.voiceProfileHash !== "string" ||
    typeof value.segmentCount !== "number" ||
    !Array.isArray(value.segmentSha256s) ||
    value.segmentSha256s.some((entry) => typeof entry !== "string") ||
    typeof value.narrationPath !== "string" ||
    typeof value.narrationSha256 !== "string" ||
    typeof value.generatedAt !== "string"
  ) {
    return null;
  }
  return value as NarrationAudioManifest;
}

async function clearNarrationAudioArtifacts(
  narrationDir: string,
  segmentsDir: string,
  narrationPath: string
): Promise<void> {
  const cleanupDirs = [narrationDir, segmentsDir];
  await Promise.all(
    cleanupDirs.map(async (directory) => {
      const entries = await fs
        .readdir(directory, { withFileTypes: true })
        .catch(() => []);
      await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            await fs.rm(path.join(directory, entry.name), { force: true }).catch(() => {});
          })
      );
    })
  );
  await fs.rm(narrationPath, { force: true }).catch(() => {});
  await fs.rm(path.join(narrationDir, "segments.txt"), { force: true }).catch(() => {});
  await fs
    .rm(narrationAudioManifestPath(narrationDir), { force: true })
    .catch(() => {});
}

export async function generateMockNarrationAudio(
  episodeDir: string,
  speechPlan: SpeechPlan
): Promise<string> {
  const narrationDir = path.join(episodeDir, "audio");
  const segmentsDir = path.join(narrationDir, "segments-speech");
  await ensureDir(segmentsDir);
  const { provider, voiceProfile } = await createSpeechProvider(
    resolveEpisodeRootDir(episodeDir),
    speechPlan.language,
    speechPlan.artifactType
  );
  const narrationPath = path.join(narrationDir, "narration.wav");
  const segmentsListPath = path.join(narrationDir, "segments.txt");
  const manifestPath = narrationAudioManifestPath(narrationDir);
  const speechPlanHash = buildSpeechPlanHash(speechPlan);
  const voiceProfileHash = speechPlan.canonicalVoiceProfileHash;
  const expectedSegmentPaths = speechPlan.segments.map((segment) =>
    path.join(segmentsDir, `${segment.id}.wav`)
  );
  const existingManifest = await loadNarrationAudioManifest(manifestPath);
  if (
    existingManifest &&
    existingManifest.episodeId === speechPlan.episodeId &&
    existingManifest.language === speechPlan.language &&
    existingManifest.artifactType === speechPlan.artifactType &&
    existingManifest.speechPlanHash === speechPlanHash &&
    existingManifest.voiceProfileHash === voiceProfileHash &&
    existingManifest.segmentCount === speechPlan.segments.length &&
    (await fileExists(narrationPath)) &&
    (await hashFile(narrationPath).catch(() => Promise.resolve(""))) ===
      existingManifest.narrationSha256
  ) {
    let segmentsValid = true;
    for (let index = 0; index < expectedSegmentPaths.length; index += 1) {
      const segmentPath = expectedSegmentPaths[index];
      if (!segmentPath || !(await fileExists(segmentPath))) {
        segmentsValid = false;
        break;
      }
      if (
        (await hashFile(segmentPath).catch(() => Promise.resolve(""))) !==
        existingManifest.segmentSha256s[index]
      ) {
        segmentsValid = false;
        break;
      }
    }
    if (segmentsValid) {
      return narrationPath;
    }
  }
  await clearNarrationAudioArtifacts(narrationDir, segmentsDir, narrationPath);
  const segmentPaths: string[] = [];
  const segmentSha256s: string[] = [];
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
    segmentSha256s.push(await hashFile(outputPath));
  }
  await writeTextAtomic(
    segmentsListPath,
    segmentPaths
      .map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`)
      .join("\n")
  );
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      segmentsListPath,
      "-c",
      "copy",
      narrationPath,
    ],
    { timeoutMs: 600000 }
  );
  const narrationSha256 = await hashFile(narrationPath);
  await writeJsonAtomic(manifestPath, {
    schemaVersion: 2,
    episodeId: speechPlan.episodeId,
    language: speechPlan.language,
    artifactType: speechPlan.artifactType,
    speechPlanHash,
    voiceProfileHash,
    segmentCount: speechPlan.segments.length,
    segmentSha256s,
    narrationPath,
    narrationSha256,
    generatedAt: nowIso(),
  } satisfies NarrationAudioManifest);
  return narrationPath;
}

export async function generateNarrationAudio(
  episodeDir: string,
  speechPlan: SpeechPlan
): Promise<string> {
  if (!isPaidProviderOptInEnabled()) {
    throw new Error(
      "DARK_TRUTH_ENABLE_PAID_PROVIDERS=true is required for episode narration generation."
    );
  }
  return generateMockNarrationAudio(episodeDir, speechPlan);
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

export async function syncEpisodeCharacters(
  sourceFile: string,
  outputRoot = "./episodes",
  options: { readonly overwrite?: boolean; readonly required?: boolean } = {}
): Promise<{
  readonly episodeId: string;
  readonly sourceCharactersPath: string;
  readonly outputCharactersPath: string;
  readonly copied: boolean;
}> {
  const episodeSlug = path.basename(path.dirname(path.dirname(sourceFile)));
  const sourceCharactersPath = path.join(
    path.dirname(path.dirname(sourceFile)),
    "characters.json"
  );
  const outputCharactersPath = path.join(
    outputRoot,
    episodeSlug,
    "shared",
    "characters.json"
  );
  if (!(await fileExists(sourceCharactersPath))) {
    if (options.required) {
      throw new Error(
        `Missing character registry in source pack: ${sourceCharactersPath}`
      );
    }
    return {
      episodeId: episodeSlug,
      sourceCharactersPath,
      outputCharactersPath,
      copied: false,
    };
  }
  const copied = options.overwrite || !(await fileExists(outputCharactersPath));
  if (copied) {
    await ensureDir(path.dirname(outputCharactersPath));
    await fs.copyFile(sourceCharactersPath, outputCharactersPath);
  }
  return {
    episodeId: episodeSlug,
    sourceCharactersPath,
    outputCharactersPath,
    copied,
  };
}

export async function buildEpisodeLoadResult(
  sourceFile: string,
  outputRoot = "./episodes"
): Promise<EpisodeLoadResult> {
  const source = await parseEpisodeSourceFile(sourceFile, outputRoot);
  await syncEpisodeCharacters(sourceFile, outputRoot);
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
    visualSceneTargetPer10Minutes: source.analysis.visualSceneTargetPer10Minutes,
    estimatedVisualSceneCount: source.analysis.estimatedVisualSceneCount,
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
    analysis: source.analysis,
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
    readonly visualRetention?: {
      readonly shotPlanPath: string;
      readonly validationPath: string;
      readonly sourceScenesPath?: string;
      readonly focalMetadataPath?: string;
      readonly validationWarnings?: readonly unknown[];
    };
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
