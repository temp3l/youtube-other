import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { google, youtube_v3 } from "googleapis";
import { z } from "zod";
import sharp from "sharp";
import { loadRuntimeConfig, type RuntimeConfig } from "@mediaforge/config";
import { episodeManifestSchema, type EpisodeManifest } from "@mediaforge/domain";
import {
  generateYoutubeMetadataFromScenesFile,
  youtubeMetadataSchema,
  type YoutubeMetadata,
} from "@mediaforge/metadata";
import { currentExecutionTelemetry } from "@mediaforge/observability";
import {
  createEpisodePathResolver,
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  readJsonIfExists,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";

const uploadStatusSchema = z.enum(["planned", "uploaded", "failed", "skipped"]);
const privacyStatusSchema = z.enum(["private", "public", "unlisted"]);
const licenseSchema = z.enum(["youtube", "creativeCommon"]);
const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const SHORT_THUMBNAIL_INTRO_SECONDS = 0.5;
const SHORT_THUMBNAIL_INTRO_WIDTH = 1080;
const SHORT_THUMBNAIL_INTRO_HEIGHT = 1920;
const mediaStageVariantSchema = z.enum(["full", "short"]);
type MediaStageVariant = z.infer<typeof mediaStageVariantSchema>;
const mediaStageOwnerSchema = z.enum([
  "narration",
  "scene-plan",
  "image-plan",
  "image-generation",
  "render",
  "thumbnail",
  "publication",
]);
const mediaStageStatusSchema = z.enum([
  "planned",
  "ready",
  "generated",
  "reused",
  "uploaded",
  "failed",
]);
const mediaStageIdentitySchema = z
  .object({
    episodeId: z.string().min(1),
    language: z.string().min(1),
    locale: z.string().min(1),
    variant: mediaStageVariantSchema,
    owner: mediaStageOwnerSchema,
  })
  .strict();
type MediaStageIdentity = z.infer<typeof mediaStageIdentitySchema>;
const mediaStageDependencySchema = z
  .object({
    owner: mediaStageOwnerSchema,
    episodeId: z.string().min(1),
    language: z.string().min(1),
    locale: z.string().min(1),
    variant: mediaStageVariantSchema,
    fingerprint: z.string().min(1),
    path: z.string().min(1).optional(),
    status: mediaStageStatusSchema.optional(),
  })
  .strict();
type MediaStageDependency = z.infer<typeof mediaStageDependencySchema>;
function buildMediaStageDependency(input: {
  readonly owner: z.infer<typeof mediaStageOwnerSchema>;
  readonly episodeId: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: MediaStageVariant;
  readonly fingerprint: string;
  readonly path?: string;
  readonly status?: z.infer<typeof mediaStageStatusSchema>;
}): MediaStageDependency {
  return mediaStageDependencySchema.parse(input);
}

export type YoutubeUploadStatus = z.infer<typeof uploadStatusSchema>;

export interface YoutubeAuthSettings {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly redirectUri?: string;
  readonly channelId?: string;
}

export interface YoutubeUploadOverrides {
  readonly languageHint?: string;
  readonly playlistId?: string;
  readonly privacyStatus?: z.infer<typeof privacyStatusSchema>;
  readonly publishAt?: string;
  readonly recordingDate?: string;
  readonly notifySubscribers?: boolean;
  readonly madeForKids?: boolean;
  readonly containsSyntheticMedia?: boolean;
  readonly embeddable?: boolean;
  readonly publicStatsViewable?: boolean;
  readonly license?: z.infer<typeof licenseSchema>;
  readonly defaultLanguage?: string;
  readonly defaultAudioLanguage?: string;
  readonly thumbnailPath?: string;
  readonly videoPath?: string;
}

export interface YoutubeUploadReport {
  readonly episodeId: string;
  readonly episodeDir: string;
  readonly publication?: {
    readonly stageIdentity: MediaStageIdentity;
    readonly renderDependency: MediaStageDependency;
    readonly thumbnailDependency: MediaStageDependency;
    readonly metadataFingerprint: string;
    readonly channelTarget?: string | undefined;
    readonly requestFingerprint: string;
  };
  readonly status: YoutubeUploadStatus;
  readonly generatedAt: string;
  readonly completedAt?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly sourceMetadataPath: string;
  readonly sourceMetadataSha256: string;
  readonly metadata: {
    readonly title: string;
    readonly description: string;
    readonly tags: readonly string[];
    readonly categoryId: string;
    readonly defaultLanguage?: string | undefined;
    readonly defaultAudioLanguage?: string | undefined;
    readonly privacyStatus: z.infer<typeof privacyStatusSchema>;
    readonly publishAt?: string | undefined;
    readonly madeForKids: boolean;
    readonly embeddable: boolean;
    readonly publicStatsViewable: boolean;
    readonly license: z.infer<typeof licenseSchema>;
    readonly playlistId?: string | undefined;
    readonly notifySubscribers: boolean;
    readonly recordingDate?: string | undefined;
    readonly chapters: ReadonlyArray<{ readonly timestamp: string; readonly startSeconds: number; readonly title: string }>;
    readonly containsSyntheticMedia: boolean;
  };
  readonly video: {
    readonly path: string;
    readonly sha256: string;
  };
  readonly thumbnail: {
    readonly path: string;
    readonly sourcePath: string;
    readonly sha256: string;
  };
  readonly youtubeVideoId?: string | undefined;
  readonly youtubeChannelId?: string | undefined;
  readonly requestIds: {
    readonly upload?: string | undefined;
    readonly thumbnail?: string | undefined;
    readonly playlist?: string | undefined;
    readonly verification?: string | undefined;
  };
  readonly warnings: readonly string[];
  readonly error?: {
    readonly code?: string | undefined;
    readonly message: string;
    readonly retryable: boolean;
  } | undefined;
}

export interface YoutubeUploadResult {
  readonly report: YoutubeUploadReport;
  readonly reportPath: string;
  readonly markdownPath: string;
  readonly skipped: boolean;
}

export interface YoutubeUploadCommandInput {
  readonly workspaceDir: string;
  readonly episodeId: string;
  readonly episodeDir?: string | undefined;
  readonly metadataPath?: string | undefined;
  readonly generateMetadata?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly reportDir?: string | undefined;
  readonly overrides?: YoutubeUploadOverrides | undefined;
  readonly auth: YoutubeAuthSettings;
  readonly client?: youtube_v3.Youtube | undefined;
  readonly clientFactory?: ((auth: YoutubeAuthSettings) => youtube_v3.Youtube) | undefined;
  readonly shortThumbnailIntroRenderer?: ((input: {
    readonly videoPath: string;
    readonly thumbnailPath: string;
    readonly outputPath: string;
  }) => Promise<string>) | undefined;
  readonly metadataGeneration?: {
    readonly apiKey: string;
    readonly model: string;
    readonly reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
    readonly maxOutputTokens: number | undefined;
    readonly repairModel: string | undefined;
    readonly repairReasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
    readonly repairMaxOutputTokens: number | undefined;
    readonly promptText: string;
    readonly maxRetries: number;
    readonly timeoutMs: number;
    readonly keepFile: boolean;
    readonly baseUrl?: string | undefined;
  } | undefined;
  readonly logger?: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
    debug: (obj: Record<string, unknown>, msg?: string) => void;
  } | undefined;
}

export interface ResolvedYoutubeUploadInputs {
  readonly metadata: YoutubeMetadata;
  readonly metadataPath: string;
  readonly metadataSha256: string;
  readonly resolvedVideoPath: string;
  readonly resolvedLanguage: string;
  readonly resolvedLocale: string;
  readonly resolvedVariant: "full" | "short";
}

export class YoutubeUploadError extends Error {
  public readonly code: string = "youtube_upload_error";
  public readonly retryable: boolean;

  public constructor(message: string, retryable = false, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "YoutubeUploadError";
    this.retryable = retryable;
  }
}

export class YoutubeUploadConfigurationError extends YoutubeUploadError {
  public override readonly code: string = "youtube_upload_configuration_error";
  public constructor(message: string, cause?: unknown) {
    super(message, false, cause);
    this.name = "YoutubeUploadConfigurationError";
  }
}

export class YoutubeUploadValidationError extends YoutubeUploadError {
  public override readonly code: string = "youtube_upload_validation_error";
  public constructor(message: string, cause?: unknown) {
    super(message, false, cause);
    this.name = "YoutubeUploadValidationError";
  }
}

export class YoutubeUploadDuplicateError extends YoutubeUploadError {
  public override readonly code: string = "youtube_upload_duplicate_error";
  public constructor(message: string) {
    super(message, false);
    this.name = "YoutubeUploadDuplicateError";
  }
}

const uploadMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  tags: z.array(z.string().min(1)),
  categoryId: z.string().regex(/^\d+$/u),
  defaultLanguage: z.string().min(1).optional(),
  defaultAudioLanguage: z.string().min(1).optional(),
  privacyStatus: privacyStatusSchema.default("private"),
  publishAt: z.string().datetime().optional(),
  madeForKids: z.boolean().default(false),
  containsSyntheticMedia: z.boolean().default(true),
  embeddable: z.boolean().default(true),
  publicStatsViewable: z.boolean().default(true),
  license: licenseSchema.default("youtube"),
  playlistId: z.string().min(1).optional(),
  thumbnailPath: z.string().min(1),
  videoPath: z.string().min(1),
  notifySubscribers: z.boolean().default(false),
  recordingDate: z.string().min(1).optional(),
  chapters: z.array(
    z.object({
      timestamp: z.string().regex(/^\d{2}:\d{2}$/u),
      startSeconds: z.number().nonnegative(),
      title: z.string().min(1),
    })
  ).default([]),
  sourceMetadataPath: z.string().min(1),
  sourceMetadataSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
  episodeId: z.string().min(1),
  episodeDir: z.string().min(1),
});

const publicationReportSchema = z.object({
  stageIdentity: mediaStageIdentitySchema,
  renderDependency: mediaStageDependencySchema,
  thumbnailDependency: mediaStageDependencySchema,
  metadataFingerprint: z.string().min(1),
  channelTarget: z.string().min(1).optional(),
  requestFingerprint: z.string().min(1),
});

type UploadMetadata = z.infer<typeof uploadMetadataSchema>;

function inferPublicationVariantFromVideoPath(videoPath: string): MediaStageVariant {
  return /(?:^|[\\/])vertical(?:[\\/]|$)|9x16/u.test(videoPath) ? "short" : "full";
}

function inferPublicationIdentity(args: {
  readonly episodeId: string;
  readonly metadata: UploadMetadata;
  readonly videoPath: string;
}): MediaStageIdentity {
  const variant = inferPublicationVariantFromVideoPath(args.videoPath);
  const language = args.metadata.defaultLanguage ?? "en";
  return mediaStageIdentitySchema.parse({
    episodeId: args.episodeId,
    language,
    locale: language === "en" ? "en-US" : language,
    variant,
    owner: "publication",
  });
}

function buildPublicationSection(args: {
  readonly episodeId: string;
  readonly metadata: UploadMetadata;
  readonly metadataSha256: string;
  readonly videoPath: string;
  readonly videoSha256: string;
  readonly thumbnailPath: string;
  readonly thumbnailSha256: string;
  readonly channelTarget?: string;
}): NonNullable<YoutubeUploadReport["publication"]> {
  const stageIdentity = inferPublicationIdentity(args);
  const renderDependency = buildMediaStageDependency({
    owner: "render",
    episodeId: stageIdentity.episodeId,
    language: stageIdentity.language,
    locale: stageIdentity.locale,
    variant: stageIdentity.variant,
    fingerprint: args.videoSha256,
    path: args.videoPath,
    status: "generated",
  });
  const thumbnailDependency = buildMediaStageDependency({
    owner: "thumbnail",
    episodeId: stageIdentity.episodeId,
    language: stageIdentity.language,
    locale: stageIdentity.locale,
    variant: stageIdentity.variant,
    fingerprint: args.thumbnailSha256,
    path: args.thumbnailPath,
    status: "generated",
  });
  return publicationReportSchema.parse({
    stageIdentity,
    renderDependency,
    thumbnailDependency,
    metadataFingerprint: args.metadataSha256,
    ...(args.channelTarget ? { channelTarget: args.channelTarget } : {}),
    requestFingerprint: hashText(
      JSON.stringify({
        renderFingerprint: renderDependency.fingerprint,
        thumbnailFingerprint: thumbnailDependency.fingerprint,
        metadataFingerprint: args.metadataSha256,
        channelTarget: args.channelTarget ?? null,
        variant: stageIdentity.variant,
      })
    ),
  });
}

const CATEGORY_NAME_TO_ID: Record<string, string> = {
  entertainment: "24",
  education: "27",
  "science & technology": "28",
  "science and technology": "28",
  "people & blogs": "22",
  "people and blogs": "22",
  film: "1",
  "film & animation": "1",
  music: "10",
  gaming: "20",
  comedy: "23",
  news: "25",
  "howto & style": "26",
  "how-to & style": "26",
  "how to & style": "26",
  travel: "19",
  animals: "15",
  "pets & animals": "15",
  "nonprofits & activism": "29",
  "non-profits & activism": "29",
  "autos & vehicles": "2",
};

function normalizeText(value: string): string {
  return normalizeWhitespace(stripInvisibleControlChars(value));
}

function normalizeDescription(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n/u, "\n")
    .split("")
    .filter((character) => !isInvisibleControlCharacter(character))
    .join("")
    .trim();
}

function isInvisibleControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x0000 && codePoint <= 0x0008) ||
      codePoint === 0x000b ||
      codePoint === 0x000c ||
      (codePoint >= 0x000e && codePoint <= 0x001f) ||
      codePoint === 0x007f)
  );
}

function stripInvisibleControlChars(value: string): string {
  let output = "";
  for (const character of value) {
    if (!isInvisibleControlCharacter(character)) {
      output += character;
    }
  }
  return output;
}

function normalizeLicense(value: string | undefined): z.infer<typeof licenseSchema> {
  const normalized = normalizeText(value ?? "youtube").toLowerCase();
  if (
    normalized === "creativecommons" ||
    normalized === "creativecommon" ||
    normalized === "creative common" ||
    normalized === "creative commons"
  ) {
    return "creativeCommon";
  }
  return "youtube";
}

function normalizeCategoryId(value: string | undefined): string {
  const normalized = normalizeText(value ?? "").toLowerCase();
  if (/^\d+$/u.test(normalized)) {
    return normalized;
  }
  const mapped = CATEGORY_NAME_TO_ID[normalized];
  if (mapped) {
    return mapped;
  }
  throw new YoutubeUploadValidationError(`Unsupported YouTube category: ${value ?? "(missing)"}`);
}

function normalizeLanguageCode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeText(value);
  if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/iu.test(normalized)) {
    throw new YoutubeUploadValidationError(`Invalid language code: ${value}`);
  }
  return normalized;
}

function normalizeTags(tags: readonly string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = normalizeText(tag);
    if (normalized.length === 0) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    cleaned.push(normalized);
  }
  return cleaned;
}

function buildChapterBlock(chapters: UploadMetadata["chapters"]): string {
  return [
    "CHAPTERS",
    ...chapters.map((chapter) => `${chapter.timestamp} ${normalizeText(chapter.title)}`),
  ].join("\n");
}

function appendChaptersToDescription(description: string, chapters: UploadMetadata["chapters"]): string {
  const chapterBlock = buildChapterBlock(chapters);
  const normalizedDescription = normalizeDescription(description);
  if (normalizedDescription.includes(chapterBlock)) {
    return normalizedDescription;
  }
  return `${normalizedDescription}\n\n${chapterBlock}`;
}

function validateChapters(chapters: UploadMetadata["chapters"]): UploadMetadata["chapters"] {
  if (chapters.length === 0) {
    return chapters;
  }
  let lastStart = -1;
  const seenTimestamps = new Set<string>();
  const normalized = chapters.map((chapter) => ({
    timestamp: chapter.timestamp,
    startSeconds: chapter.startSeconds,
    title: normalizeText(chapter.title),
  }));
  if (normalized[0]?.timestamp !== "00:00") {
    throw new YoutubeUploadValidationError("The first chapter must begin at 00:00.");
  }
  for (const chapter of normalized) {
    if (chapter.title.length === 0) {
      throw new YoutubeUploadValidationError("Chapter titles must not be blank.");
    }
    if (seenTimestamps.has(chapter.timestamp)) {
      throw new YoutubeUploadValidationError(`Duplicate chapter timestamp: ${chapter.timestamp}`);
    }
    seenTimestamps.add(chapter.timestamp);
    if (chapter.startSeconds < lastStart) {
      throw new YoutubeUploadValidationError("Chapters must be sorted by time.");
    }
    lastStart = chapter.startSeconds;
  }
  return normalized;
}

function normalizeUploadMetadata(metadata: YoutubeMetadata, overrides: YoutubeUploadOverrides & { readonly episodeId: string; readonly episodeDir: string; readonly sourceMetadataPath: string; readonly sourceMetadataSha256: string }): UploadMetadata {
  const categories = normalizeCategoryId(metadata.uploadSettings.category);
  const chapters = validateChapters(
    metadata.chapters.items.map((chapter: YoutubeMetadata["chapters"]["items"][number]) => ({
      timestamp: chapter.timestamp,
      startSeconds: chapter.startSeconds,
      title: chapter.title,
    }))
  );
  const title = normalizeText(metadata.title.recommended);
  if (title.length === 0 || title.length > 100) {
    throw new YoutubeUploadValidationError(`Title must be 1-100 characters after normalization; got ${title.length}.`);
  }
  const tags = normalizeTags(metadata.tags.items);
  const description = appendChaptersToDescription(metadata.description, chapters);
  if ([...description].length > 5000) {
    throw new YoutubeUploadValidationError(`Description exceeds YouTube's 5000 character limit (${[...description].length}).`);
  }
  const publishAt = overrides.publishAt ? new Date(overrides.publishAt).toISOString() : undefined;
  if (publishAt && new Date(publishAt).getTime() <= Date.now()) {
    throw new YoutubeUploadValidationError("publishAt must be a future RFC 3339 timestamp.");
  }
  const privacyStatus = overrides.privacyStatus ?? "private";
  if (publishAt && privacyStatus !== "private") {
    throw new YoutubeUploadValidationError("Scheduled uploads must use privacyStatus=private.");
  }
  const defaultLanguage = normalizeLanguageCode(overrides.defaultLanguage ?? metadata.source.language);
  const defaultAudioLanguage = normalizeLanguageCode(overrides.defaultAudioLanguage ?? metadata.source.language);
  const uploadMetadataInput: Record<string, unknown> = {
    episodeId: overrides.episodeId,
    episodeDir: overrides.episodeDir,
    sourceMetadataPath: overrides.sourceMetadataPath,
    sourceMetadataSha256: overrides.sourceMetadataSha256,
    title,
    description,
    tags,
    categoryId: categories,
    privacyStatus,
    madeForKids: overrides.madeForKids ?? metadata.uploadSettings.madeForKids,
    containsSyntheticMedia: overrides.containsSyntheticMedia ?? true,
    embeddable: overrides.embeddable ?? true,
    publicStatsViewable: overrides.publicStatsViewable ?? true,
    license: normalizeLicense(overrides.license ?? metadata.uploadSettings.licence),
    notifySubscribers: overrides.notifySubscribers ?? false,
    chapters,
    thumbnailPath: overrides.thumbnailPath ?? "",
    videoPath: overrides.videoPath ?? "",
    ...(defaultLanguage ? { defaultLanguage } : {}),
    ...(defaultAudioLanguage ? { defaultAudioLanguage } : {}),
    ...(publishAt ? { publishAt } : {}),
    ...(overrides.playlistId ? { playlistId: overrides.playlistId } : {}),
    ...(overrides.recordingDate ? { recordingDate: overrides.recordingDate } : {}),
  };
  return uploadMetadataSchema.parse(uploadMetadataInput);
}

function buildReportMarkdown(report: YoutubeUploadReport): string {
  const lines = [
    "# YouTube Upload Report",
    "",
    `- Episode: ${report.episodeId}`,
    `- Status: ${report.status}`,
    `- Video ID: ${report.youtubeVideoId ?? "n/a"}`,
    `- Channel ID: ${report.youtubeChannelId ?? "n/a"}`,
    `- Video path: ${report.video.path}`,
    `- Thumbnail path: ${report.thumbnail.path}`,
    `- Thumbnail source: ${report.thumbnail.sourcePath}`,
    `- Metadata path: ${report.sourceMetadataPath}`,
    `- Playlist ID: ${report.metadata.playlistId ?? "n/a"}`,
    `- Privacy status: ${report.metadata.privacyStatus}`,
    `- Notify subscribers: ${String(report.metadata.notifySubscribers)}`,
    `- Made for kids: ${String(report.metadata.madeForKids)}`,
    `- License: ${report.metadata.license}`,
    `- Generated at: ${report.generatedAt}`,
  ];
  if (report.completedAt) {
    lines.push(`- Completed at: ${report.completedAt}`);
  }
  if (report.durationMs !== undefined) {
    lines.push(`- Duration: ${report.durationMs} ms`);
  }
  if (report.warnings.length > 0) {
    lines.push("", "## Warnings", ...report.warnings.map((warning) => `- ${warning}`));
  }
  if (report.error) {
    lines.push("", "## Error", `- ${report.error.message}`);
  }
  return `${lines.join("\n")}\n`;
}

async function resolveFirstExisting(paths: ReadonlyArray<string>): Promise<string | null> {
  for (const candidate of paths) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function resolveYoutubeMetadataFile(args: {
  readonly episodeDir: string;
  readonly metadataPath?: string;
  readonly preferredLanguage?: string;
}): Promise<{ readonly metadata: YoutubeMetadata; readonly metadataPath: string } | null> {
  const localeRoots = await fs.readdir(path.join(args.episodeDir, "locales"), {
    withFileTypes: true,
  }).catch(() => []);
  const localizedMetadataCandidates = localeRoots
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const targetLocaleNames = localeNamesForPreferredLanguage(
    localizedMetadataCandidates,
    args.preferredLanguage
  );
  const candidatePaths = args.metadataPath
    ? [path.resolve(args.episodeDir, args.metadataPath)]
    : [
        ...targetLocaleNames.flatMap((entry) => {
          try {
            const { resolver, context } = localizedEpisodeContext(args.episodeDir, entry);
            const metadataDir = resolver.metadataDir(context);
            return [
              path.join(metadataDir, "youtube.json"),
              path.join(metadataDir, "youtube-metadata.json"),
            ];
          } catch {
            return [];
          }
        }),
        path.join(args.episodeDir, "metadata", "youtube.json"),
        path.join(args.episodeDir, "metadata", "youtube-metadata.json"),
        path.join(args.episodeDir, "output", "youtube.json"),
        path.join(args.episodeDir, "output", "youtube-metadata.json"),
      ];
  const preferredPrefix = normalizeLanguageHint(args.preferredLanguage);
  let fallback: { readonly metadata: YoutubeMetadata; readonly metadataPath: string } | null = null;
  for (const candidatePath of candidatePaths) {
    if (!(await fileExists(candidatePath))) {
      continue;
    }
    const metadata = youtubeMetadataSchema.parse(
      JSON.parse(await fs.readFile(candidatePath, "utf8")) as unknown
    );
    if (!fallback) {
      fallback = { metadata, metadataPath: candidatePath };
    }
    if (!preferredPrefix) {
      return { metadata, metadataPath: candidatePath };
    }
    if (normalizeLanguageHint(metadata.source.language) === preferredPrefix) {
      return { metadata, metadataPath: candidatePath };
    }
  }
  return fallback;
}

function episodePathsForDir(episodeDir: string) {
  const episodeRoot = path.resolve(episodeDir);
  const resolver = createEpisodePathResolver(path.dirname(episodeRoot));
  const episodeId = normalizeEpisodeId(path.basename(episodeRoot));
  return { resolver, episodeId };
}

function localizedEpisodeContext(episodeDir: string, localeName: string) {
  const { resolver, episodeId } = episodePathsForDir(episodeDir);
  return {
    resolver,
    context: {
      episodeId,
      locale: normalizeLocaleCode(localeName),
      variant: normalizeContentVariant("full"),
    },
  };
}

function normalizeLanguageHint(language: string | undefined): string | undefined {
  const trimmed = (language ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = normalizeLocaleCode(trimmed).trim().toLowerCase();
  return normalized.split("-")[0];
}

function localeNamesForPreferredLanguage(
  localeNames: readonly string[],
  preferredLanguage: string | undefined
): string[] {
  const preferredPrefix = normalizeLanguageHint(preferredLanguage);
  const sorted = [...localeNames].sort((left, right) => left.localeCompare(right));
  if (!preferredPrefix) {
    return sorted;
  }
  const matching = sorted.filter((localeName) => {
    const normalized = normalizeLocaleCode(localeName).toLowerCase();
    return normalized === preferredPrefix || normalized.startsWith(`${preferredPrefix}-`);
  });
  const remaining = sorted.filter((localeName) => !matching.includes(localeName));
  return [...matching, ...remaining];
}

async function loadEpisodeManifest(episodeDir: string): Promise<EpisodeManifest | null> {
  const { resolver, episodeId } = episodePathsForDir(episodeDir);
  const manifestPath = resolver.manifestPath(episodeId);
  return readJsonIfExists(manifestPath, (value) => episodeManifestSchema.parse(value));
}

async function resolveVideoPath(
  episodeDir: string,
  overrides?: YoutubeUploadOverrides,
  manifest?: EpisodeManifest | null
): Promise<string> {
  const resolveEpisodePath = (candidate: string | undefined): string | undefined =>
    candidate
      ? path.isAbsolute(candidate)
        ? candidate
        : path.resolve(episodeDir, candidate)
      : undefined;
  if (overrides?.videoPath) {
    const absolute = resolveEpisodePath(overrides.videoPath);
    if (!absolute) {
      throw new YoutubeUploadValidationError("Invalid video path override.");
    }
    return absolute;
  }
  const preferredLanguage = normalizeLanguageHint(overrides?.languageHint);
  if (!preferredLanguage) {
    const manifestVideo = manifest?.artifacts.find((artifact) => artifact.kind === "video" && artifact.mimeType === "video/mp4");
    const manifestVideoPath = resolveEpisodePath(manifestVideo?.path);
    if (manifestVideoPath && (await fileExists(manifestVideoPath))) {
      return manifestVideoPath;
    }
  }
  const localeRoots = await fs.readdir(path.join(episodeDir, "locales"), {
    withFileTypes: true,
  }).catch(() => []);
  const candidateDirs = [
    ...localeNamesForPreferredLanguage(
      localeRoots
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
      preferredLanguage
    )
      .flatMap((localeName) => {
        try {
          const { resolver, context } = localizedEpisodeContext(episodeDir, localeName);
          return [resolver.renderDir(context, "youtube")];
        } catch {
          return [];
        }
      }),
    path.join(episodeDir, "output"),
  ];
  const mp4Candidates: string[] = [];
  for (const outputDir of candidateDirs) {
    const outputEntries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
    const currentCandidates = outputEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".mp4"))
      .map((entry) => path.join(outputDir, entry.name));
    mp4Candidates.push(...currentCandidates);
  }
  mp4Candidates.sort((left, right) => {
    const score = (value: string): number => {
      const normalized = path.basename(value).toLowerCase();
      if (normalized.includes("youtube-16x9-clean")) {
        return 0;
      }
      if (normalized.includes("clean")) {
        return 1;
      }
      if (normalized.includes("captioned")) {
        return 2;
      }
      return 3;
    };
    return score(left) - score(right) || left.localeCompare(right);
  });
  if (mp4Candidates.length > 0) {
    return mp4Candidates[0]!;
  }
  throw new YoutubeUploadValidationError(`Unable to locate a rendered video for ${episodeDir}.`);
}

function normalizeThumbnailLanguage(language: string | undefined): string | undefined {
  const normalized = normalizeText(language ?? "").toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return normalized.split("-")[0];
}

async function resolveThumbnailPath(
  episodeDir: string,
  language: string | undefined,
  overrides?: YoutubeUploadOverrides
): Promise<string> {
  const resolveEpisodePath = (candidate: string | undefined): string | undefined =>
    candidate
      ? path.isAbsolute(candidate)
        ? candidate
        : path.resolve(episodeDir, candidate)
      : undefined;
  if (overrides?.thumbnailPath) {
    const absolute = resolveEpisodePath(overrides.thumbnailPath);
    if (!absolute) {
      throw new YoutubeUploadValidationError("Invalid thumbnail path override.");
    }
    return absolute;
  }
  const thumbnailLanguage = normalizeThumbnailLanguage(language);
  const thumbnailRoot = thumbnailLanguage
    ? path.resolve("content-ideas", "audio-ready-thumbnails", thumbnailLanguage)
    : undefined;
  const episodeSlug = path.basename(episodeDir);
  const basenames = [
    `${episodeSlug}.png`,
    `${episodeSlug}.jpg`,
    `${episodeSlug}.jpeg`,
    `${episodeSlug}.webp`,
    `${episodeSlug}-thumbnail.png`,
    `${episodeSlug}-thumbnail.jpg`,
    `${episodeSlug}-thumbnail.jpeg`,
    `${episodeSlug}-thumbnail.webp`,
    `${episodeSlug}-short-thumbnail.png`,
    `${episodeSlug}-short-thumbnail.jpg`,
    `${episodeSlug}-short-thumbnail.jpeg`,
    `${episodeSlug}-short-thumbnail.webp`,
  ];
  if (thumbnailRoot) {
    for (const basename of basenames) {
      const candidate = path.join(thumbnailRoot, basename);
      if (await fileExists(candidate)) {
        return candidate;
      }
    }
    const matches = (await fs.readdir(thumbnailRoot).catch(() => [])).filter((entry) => {
      const lower = entry.toLowerCase();
      return (
        lower.startsWith(`${episodeSlug.toLowerCase()}-`) ||
        lower.startsWith(`${episodeSlug.toLowerCase()}.`) ||
        lower.includes(episodeSlug.toLowerCase())
      );
    });
    if (matches.length === 1) {
      return path.join(thumbnailRoot, matches[0]!);
    }
  }
  throw new YoutubeUploadValidationError(
    `Unable to locate a matching thumbnail for ${episodeSlug} in content-ideas/audio-ready-thumbnails/${thumbnailLanguage ?? "(unknown)"}. Provide overrides.thumbnailPath explicitly.`
  );
}

async function prepareThumbnailForUpload(episodeDir: string, sourcePath: string): Promise<{
  readonly path: string;
  readonly sourcePath: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly optimized: boolean;
}> {
  const { resolver, episodeId } = episodePathsForDir(episodeDir);
  const thumbnailDir = path.join(resolver.uploadStateDir(episodeId), "thumbnails");
  await ensureDir(thumbnailDir);
  const stagedPath = path.join(thumbnailDir, "youtube-thumbnail.jpg");
  const originalStats = await fs.stat(sourcePath);
  if (originalStats.size <= YOUTUBE_THUMBNAIL_MAX_BYTES) {
    const ext = path.extname(sourcePath).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
      await fs.copyFile(sourcePath, stagedPath);
      return {
        path: stagedPath,
        sourcePath,
        mimeType: ext === ".webp" ? "image/webp" : "image/jpeg",
        optimized: false,
      };
    }
    await sharp(sourcePath)
      .jpeg({ quality: 95, mozjpeg: true })
      .toFile(stagedPath);
    return {
      path: stagedPath,
      sourcePath,
      mimeType: "image/jpeg",
      optimized: false,
    };
  }

  let quality = 92;
  for (const width of [1280, 1152, 1024, 960, 896, 768]) {
    await sharp(sourcePath)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toFile(stagedPath);
    const optimizedStats = await fs.stat(stagedPath);
    if (optimizedStats.size <= YOUTUBE_THUMBNAIL_MAX_BYTES) {
      return {
        path: stagedPath,
        sourcePath,
        mimeType: "image/jpeg",
        optimized: true,
      };
    }
    quality = Math.max(70, quality - 6);
  }

  throw new YoutubeUploadValidationError(
    `Unable to compress thumbnail below YouTube's 2 MB limit: ${sourcePath}.`
  );
}

function shortThumbnailIntroPath(videoPath: string): string {
  const extension = path.extname(videoPath) || ".mp4";
  const basename = path.basename(videoPath, extension);
  return path.join(path.dirname(videoPath), `${basename}-with-thumbnail-intro.mp4`);
}

async function renderShortThumbnailIntro(input: {
  readonly videoPath: string;
  readonly thumbnailPath: string;
  readonly outputPath: string;
}): Promise<string> {
  await ensureDir(path.dirname(input.outputPath));
  const tempPath = path.join(
    path.dirname(input.outputPath),
    `.${path.basename(input.outputPath)}.${process.pid}.tmp.mp4`
  );
  await fs.rm(tempPath, { force: true }).catch(() => undefined);
  const filter = [
    [
      `[1:v]scale=${SHORT_THUMBNAIL_INTRO_WIDTH}:${SHORT_THUMBNAIL_INTRO_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${SHORT_THUMBNAIL_INTRO_WIDTH}:${SHORT_THUMBNAIL_INTRO_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
      "fps=30",
      "format=yuv420p[thumbv]",
    ].join(","),
    [
      `[2:v]scale=${SHORT_THUMBNAIL_INTRO_WIDTH}:${SHORT_THUMBNAIL_INTRO_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${SHORT_THUMBNAIL_INTRO_WIDTH}:${SHORT_THUMBNAIL_INTRO_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
      "fps=30",
      "format=yuv420p[mainv]",
    ].join(","),
    "[thumbv][0:a][mainv][2:a]concat=n=2:v=1:a=1[outv][outa]",
  ].join(";");
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-t",
    String(SHORT_THUMBNAIL_INTRO_SECONDS),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-loop",
    "1",
    "-t",
    String(SHORT_THUMBNAIL_INTRO_SECONDS),
    "-i",
    input.thumbnailPath,
    "-i",
    input.videoPath,
    "-filter_complex",
    filter,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    tempPath,
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new YoutubeUploadError(
          `Failed to render short thumbnail intro with ffmpeg: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          false
        )
      );
    });
  });
  await fs.rename(tempPath, input.outputPath);
  return input.outputPath;
}

async function prepareVideoForUpload(input: {
  readonly videoPath: string;
  readonly thumbnailPath: string;
  readonly variant: MediaStageVariant;
  readonly renderer?: YoutubeUploadCommandInput["shortThumbnailIntroRenderer"];
}): Promise<string> {
  if (input.variant !== "short") {
    return input.videoPath;
  }
  const outputPath = shortThumbnailIntroPath(input.videoPath);
  const renderer = input.renderer ?? renderShortThumbnailIntro;
  return renderer({
    videoPath: input.videoPath,
    thumbnailPath: input.thumbnailPath,
    outputPath,
  });
}

function createYoutubeClient(auth: YoutubeAuthSettings): youtube_v3.Youtube {
  const oauth2Client = new google.auth.OAuth2(
    auth.clientId,
    auth.clientSecret,
    auth.redirectUri ?? "http://localhost"
  );
  oauth2Client.setCredentials({ refresh_token: auth.refreshToken });
  google.options({ auth: oauth2Client });
  return google.youtube("v3");
}

function readRequestId(response: { readonly headers?: Record<string, unknown> }): string | undefined {
  const headers = response.headers ?? {};
  const candidates = [
    headers["x-goog-request-id"],
    headers["x-request-id"],
    headers["x-guploader-uploadid"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function isRetryableYoutubeError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return true;
  }
  const value = error as {
    readonly code?: unknown;
    readonly response?: {
      readonly status?: unknown;
      readonly data?: {
        readonly error?: {
          readonly code?: unknown;
          readonly errors?: ReadonlyArray<{ readonly reason?: unknown }>;
        };
      };
    };
    readonly message?: unknown;
  };
  const status = typeof value.response?.status === "number" ? value.response.status : undefined;
  const reason = value.response?.data?.error?.errors?.[0]?.reason;
  if (
    reason === "invalidCredentials" ||
    reason === "insufficientPermissions" ||
    reason === "forbidden" ||
    reason === "badRequest" ||
    reason === "invalidVideoId" ||
    reason === "invalidThumbnail" ||
    reason === "duplicate" ||
    reason === "authError"
  ) {
    return false;
  }
  if (status === undefined) {
    return true;
  }
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isMissingYoutubeScopeError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const value = error as {
    readonly response?: {
      readonly data?: {
        readonly error?: {
          readonly errors?: ReadonlyArray<{ readonly reason?: unknown }>;
        };
      };
    };
  };
  return (
    value.response?.data?.error?.errors?.some(
      (entry) => entry.reason === "insufficientPermissions"
    ) ?? false
  );
}

function isThumbnailUploadRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const value = error as {
    readonly cause?: unknown;
    readonly response?: {
      readonly status?: unknown;
      readonly data?: {
        readonly error?: {
          readonly errors?: ReadonlyArray<{ readonly reason?: unknown }>;
        };
      };
    };
    readonly message?: unknown;
  };
  if (
    value.response?.status === 429 &&
    value.response.data?.error?.errors?.some(
      (entry) => entry.reason === "uploadRateLimitExceeded"
    )
  ) {
    return true;
  }
  if (typeof value.message === "string" && value.message.includes("too many thumbnails")) {
    return true;
  }
  return isThumbnailUploadRateLimitError(value.cause);
}

function describeYoutubeError(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as {
      readonly message?: unknown;
      readonly response?: {
        readonly status?: unknown;
        readonly data?: unknown;
      };
    };
    const message = typeof value.message === "string" ? value.message : "YouTube API request failed.";
    const status = typeof value.response?.status === "number" ? ` (status ${value.response.status})` : "";
    return `${message}${status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    readonly maxRetries: number;
    readonly logger?: YoutubeUploadCommandInput["logger"];
    readonly label: string;
  }
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableYoutubeError(error) || attempt > options.maxRetries) {
        throw error;
      }
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250);
      options.logger?.warn({ label: options.label, attempt, delayMs, error: describeYoutubeError(error) }, "Retrying YouTube API request");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function writeUploadReport(reportDir: string, report: YoutubeUploadReport): Promise<{ readonly jsonPath: string; readonly markdownPath: string }> {
  await ensureDir(reportDir);
  const jsonPath = path.join(reportDir, "youtube-upload.json");
  const markdownPath = path.join(reportDir, "youtube-upload.md");
  await writeJsonAtomic(jsonPath, report);
  await writeTextAtomic(markdownPath, buildReportMarkdown(report));
  return { jsonPath, markdownPath };
}

async function loadPreviousReport(reportDir: string): Promise<YoutubeUploadReport | null> {
  const reportPath = path.join(reportDir, "youtube-upload.json");
  return readJsonIfExists(reportPath, (value) => {
    const parsed = value as Record<string, unknown>;
    const status = uploadStatusSchema.parse(parsed["status"]);
    const publication =
      typeof parsed["publication"] === "object" && parsed["publication"] !== null
        ? publicationReportSchema.parse(parsed["publication"])
        : null;
    return {
      episodeId: String(parsed["episodeId"] ?? ""),
      episodeDir: String(parsed["episodeDir"] ?? ""),
      ...(publication ? { publication } : {}),
      status,
      generatedAt: String(parsed["generatedAt"] ?? ""),
      completedAt: typeof parsed["completedAt"] === "string" ? parsed["completedAt"] : undefined,
      durationMs: typeof parsed["durationMs"] === "number" ? parsed["durationMs"] : undefined,
      sourceMetadataPath: String(parsed["sourceMetadataPath"] ?? ""),
      sourceMetadataSha256: String(parsed["sourceMetadataSha256"] ?? ""),
      metadata: parsed["metadata"] as YoutubeUploadReport["metadata"],
      video: parsed["video"] as YoutubeUploadReport["video"],
      thumbnail: {
        ...(parsed["thumbnail"] as YoutubeUploadReport["thumbnail"]),
        sourcePath:
          typeof (parsed["thumbnail"] as { readonly sourcePath?: unknown })?.sourcePath === "string"
            ? (parsed["thumbnail"] as { readonly sourcePath: string }).sourcePath
            : String((parsed["thumbnail"] as { readonly path?: unknown })?.path ?? ""),
      },
      youtubeVideoId: typeof parsed["youtubeVideoId"] === "string" ? parsed["youtubeVideoId"] : undefined,
      youtubeChannelId: typeof parsed["youtubeChannelId"] === "string" ? parsed["youtubeChannelId"] : undefined,
      requestIds: (parsed["requestIds"] as YoutubeUploadReport["requestIds"]) ?? {},
      warnings: Array.isArray(parsed["warnings"]) ? parsed["warnings"].filter((entry): entry is string => typeof entry === "string") : [],
      error: typeof parsed["error"] === "object" && parsed["error"] !== null ? (parsed["error"] as YoutubeUploadReport["error"]) : undefined,
    } satisfies YoutubeUploadReport;
  });
}

export async function loadYoutubeUploadConfig(): Promise<RuntimeConfig> {
  return loadRuntimeConfig();
}

export async function resolveUploadInputsForEpisode(
  episodeDir: string,
  episodeId: string,
  overrides: YoutubeUploadOverrides = {},
  metadataPath?: string
): Promise<ResolvedYoutubeUploadInputs> {
  const manifest = await loadEpisodeManifest(episodeDir);
  const resolvedMetadata = await resolveYoutubeMetadataFile({
    episodeDir,
    ...(metadataPath ? { metadataPath } : {}),
    ...(overrides.languageHint ? { preferredLanguage: overrides.languageHint } : {}),
  });
  if (!resolvedMetadata) {
    throw new YoutubeUploadValidationError(`Missing generated YouTube metadata for episode ${episodeId}.`);
  }
  const resolvedVideoPath = await resolveVideoPath(episodeDir, overrides, manifest);
  return {
    metadata: resolvedMetadata.metadata,
    metadataPath: resolvedMetadata.metadataPath,
    metadataSha256: hashText(JSON.stringify(resolvedMetadata.metadata)),
    resolvedVideoPath,
    resolvedLanguage: resolvedMetadata.metadata.source.language,
    resolvedLocale:
      resolvedMetadata.metadata.source.language === "en"
        ? "en-US"
        : resolvedMetadata.metadata.source.language,
    resolvedVariant: inferPublicationVariantFromVideoPath(resolvedVideoPath),
  };
}

export async function generateUploadMetadataForEpisode(
  episodeDir: string,
  episodeId: string,
  overrides: YoutubeUploadOverrides = {},
  metadataPath?: string
): Promise<ResolvedYoutubeUploadInputs & { readonly resolvedThumbnailPath: string }> {
  const resolved = await resolveUploadInputsForEpisode(
    episodeDir,
    episodeId,
    overrides,
    metadataPath
  );
  const resolvedThumbnailPath = await resolveThumbnailPath(
    episodeDir,
    resolved.resolvedLanguage,
    overrides
  );
  return {
    ...resolved,
    resolvedThumbnailPath,
  };
}

async function resolveScenesFileForEpisode(episodeDir: string): Promise<string> {
  const { resolver, episodeId } = episodePathsForDir(episodeDir);
  const candidates = [
    resolver.canonicalScenesPath(episodeId),
    path.join(episodeDir, "scenes.json"),
    path.join(episodeDir, "output", "scenes.json"),
  ];
  const resolved = await resolveFirstExisting(candidates);
  if (!resolved) {
    throw new YoutubeUploadValidationError(`Unable to locate scenes.json for ${episodeDir}.`);
  }
  return resolved;
}

function toUploadReport(input: {
  readonly episodeId: string;
  readonly episodeDir: string;
  readonly metadata: UploadMetadata;
  readonly metadataPath: string;
  readonly metadataSha256: string;
  readonly videoPath: string;
  readonly videoSha256: string;
  readonly thumbnailPath: string;
  readonly thumbnailSourcePath: string;
  readonly thumbnailSha256: string;
  readonly generatedAt: string;
  readonly status: YoutubeUploadStatus;
  readonly channelTarget?: string | undefined;
  readonly requestIds?: YoutubeUploadReport["requestIds"];
  readonly youtubeVideoId?: string | undefined;
  readonly youtubeChannelId?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly warnings?: string[];
  readonly error?: YoutubeUploadReport["error"];
}): YoutubeUploadReport {
  return {
    episodeId: input.episodeId,
    episodeDir: input.episodeDir,
    publication: buildPublicationSection({
      episodeId: input.episodeId,
      metadata: input.metadata,
      metadataSha256: input.metadataSha256,
      videoPath: input.videoPath,
      videoSha256: input.videoSha256,
      thumbnailPath: input.thumbnailPath,
      thumbnailSha256: input.thumbnailSha256,
      ...(input.channelTarget ? { channelTarget: input.channelTarget } : {}),
    }),
    status: input.status,
    generatedAt: input.generatedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    sourceMetadataPath: input.metadataPath,
    sourceMetadataSha256: input.metadataSha256,
    metadata: {
      title: input.metadata.title,
      description: input.metadata.description,
      tags: input.metadata.tags,
      categoryId: input.metadata.categoryId,
      defaultLanguage: input.metadata.defaultLanguage,
      defaultAudioLanguage: input.metadata.defaultAudioLanguage,
      privacyStatus: input.metadata.privacyStatus,
      publishAt: input.metadata.publishAt,
      madeForKids: input.metadata.madeForKids,
      embeddable: input.metadata.embeddable,
      publicStatsViewable: input.metadata.publicStatsViewable,
      license: input.metadata.license,
      playlistId: input.metadata.playlistId,
      notifySubscribers: input.metadata.notifySubscribers,
      recordingDate: input.metadata.recordingDate,
      chapters: input.metadata.chapters,
      containsSyntheticMedia: input.metadata.containsSyntheticMedia,
    },
    video: {
      path: input.videoPath,
      sha256: input.videoSha256,
    },
    thumbnail: {
      path: input.thumbnailPath,
      sourcePath: input.thumbnailSourcePath,
      sha256: input.thumbnailSha256,
    },
    youtubeVideoId: input.youtubeVideoId,
    youtubeChannelId: input.youtubeChannelId,
    requestIds: input.requestIds ?? {},
    warnings: input.warnings ?? [],
    error: input.error,
  };
}

async function validateChannelOwnership(
  youtube: youtube_v3.Youtube,
  expectedChannelId: string | undefined,
  telemetry: ReturnType<typeof currentExecutionTelemetry>
): Promise<string | undefined> {
  const response = await withRetry(
    async () =>
      youtube.channels.list({
        part: ["id", "snippet"],
        mine: true,
      }),
    { maxRetries: 2, label: "channels.list" }
  );
  const channelId = response.data.items?.[0]?.id ?? undefined;
  const requestId = readRequestId(response);
  telemetry?.recordApiCall({
    provider: "googleapis",
    model: "youtube.v3",
    operation: "youtube-upload",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 0,
    attempt: 1,
    success: true,
    ...(requestId ? { requestId } : {}),
    details: {
      endpoint: "channels.list",
      channelId,
      expectedChannelId,
    },
  });
  if (expectedChannelId && channelId && expectedChannelId !== channelId) {
    throw new YoutubeUploadConfigurationError(
      `Authenticated YouTube channel ${channelId} does not match configured channel ID ${expectedChannelId}.`
    );
  }
  return expectedChannelId ?? channelId;
}

export async function uploadYoutubeEpisode(input: YoutubeUploadCommandInput): Promise<YoutubeUploadResult> {
  const startedAt = Date.now();
  const episodeDir = input.episodeDir ?? path.join(input.workspaceDir, input.episodeId);
  const { resolver, episodeId } = episodePathsForDir(episodeDir);
  const reportDir = input.reportDir ?? path.join(resolver.uploadStateDir(episodeId), "reports");
  const warnings: string[] = [];
  const resolved = await generateUploadMetadataForEpisode(
    episodeDir,
    input.episodeId,
    input.overrides,
    input.metadataPath
  );
  const uploadThumbnail = await prepareThumbnailForUpload(
    episodeDir,
    resolved.resolvedThumbnailPath
  );
  const uploadVariant = inferPublicationVariantFromVideoPath(resolved.resolvedVideoPath);
  const uploadVideoPath = await prepareVideoForUpload({
    videoPath: resolved.resolvedVideoPath,
    thumbnailPath: resolved.resolvedThumbnailPath,
    variant: uploadVariant,
    renderer: input.shortThumbnailIntroRenderer,
  });
  const previousReport = await loadPreviousReport(reportDir);
  if (
    !input.force &&
    previousReport &&
    previousReport.status === "uploaded"
  ) {
    const videoSha = await hashFile(uploadVideoPath);
    const thumbnailSha = await hashFile(uploadThumbnail.path);
    if (
      previousReport.video.sha256 === videoSha &&
      previousReport.thumbnail.sha256 === thumbnailSha &&
      previousReport.sourceMetadataSha256 === resolved.metadataSha256 &&
      previousReport.metadata.title === resolved.metadata.title.recommended
    ) {
      const report = previousReport;
      const paths = await writeUploadReport(reportDir, report);
      return { report, reportPath: paths.jsonPath, markdownPath: paths.markdownPath, skipped: true };
    }
  }

  await ensureDir(reportDir);
  const rawMetadata = input.generateMetadata
    ? input.metadataGeneration
      ? (
          await generateYoutubeMetadataFromScenesFile(
            await resolveScenesFileForEpisode(episodeDir),
            {
              apiKey: input.metadataGeneration.apiKey,
              model: input.metadataGeneration.model,
              maxOutputTokens: input.metadataGeneration.maxOutputTokens,
              repairModel: input.metadataGeneration.repairModel,
              repairReasoningEffort: input.metadataGeneration.repairReasoningEffort,
              repairMaxOutputTokens: input.metadataGeneration.repairMaxOutputTokens,
              language: "en",
              promptText: input.metadataGeneration.promptText,
              maxRetries: input.metadataGeneration.maxRetries,
              timeoutMs: input.metadataGeneration.timeoutMs,
              keepFile: input.metadataGeneration.keepFile,
              ...(input.metadataGeneration.baseUrl ? { baseUrl: input.metadataGeneration.baseUrl } : {}),
            }
          )
        ).metadata
      : (() => {
          throw new YoutubeUploadConfigurationError("--generate-metadata requires metadataGeneration settings.");
        })()
      : input.metadataPath
      ? youtubeMetadataSchema.parse(JSON.parse(await fs.readFile(path.resolve(episodeDir, input.metadataPath), "utf8")) as unknown)
      : resolved.metadata;
  const metadata = normalizeUploadMetadata(rawMetadata, {
    ...(input.overrides ?? {}),
    episodeId: input.episodeId,
    episodeDir,
    sourceMetadataPath: resolved.metadataPath,
    sourceMetadataSha256: resolved.metadataSha256,
    videoPath: uploadVideoPath,
    thumbnailPath: uploadThumbnail.path,
  });
  const videoSha256 = await hashFile(uploadVideoPath);
  const thumbnailSha256 = await hashFile(uploadThumbnail.path);
  const telemetry = currentExecutionTelemetry();
  const plannedReport = toUploadReport({
    episodeId: input.episodeId,
    episodeDir,
    metadata,
    metadataPath: resolved.metadataPath,
    metadataSha256: resolved.metadataSha256,
    videoPath: uploadVideoPath,
    videoSha256,
    thumbnailPath: uploadThumbnail.path,
    thumbnailSourcePath: uploadThumbnail.sourcePath,
    thumbnailSha256,
    generatedAt: new Date().toISOString(),
    status: "planned",
    channelTarget: input.auth.channelId,
    warnings: [],
  });
  const plannedPaths = await writeUploadReport(reportDir, plannedReport);
  try {
    const youtube =
      input.client ??
      input.clientFactory?.(input.auth) ??
      createYoutubeClient(input.auth);
    const authChannelId = await validateChannelOwnership(
      youtube,
      input.auth.channelId,
      telemetry
    );
    const requestBody: youtube_v3.Schema$Video = {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.categoryId,
        ...(metadata.defaultLanguage
          ? { defaultLanguage: metadata.defaultLanguage }
          : {}),
        ...(metadata.defaultAudioLanguage
          ? { defaultAudioLanguage: metadata.defaultAudioLanguage }
          : {}),
      },
      status: {
        privacyStatus: metadata.privacyStatus,
        selfDeclaredMadeForKids: metadata.madeForKids,
        embeddable: metadata.embeddable,
        publicStatsViewable: metadata.publicStatsViewable,
        license: metadata.license,
        ...(metadata.publishAt ? { publishAt: metadata.publishAt } : {}),
      },
    };
    const uploadResponse = await withRetry(
    async () =>
      youtube.videos.insert(
        {
          part: ["snippet", "status"],
          notifySubscribers: metadata.notifySubscribers,
          requestBody,
          media: {
            mimeType: "video/mp4",
            body: createReadStream(uploadVideoPath),
          },
          uploadType: "resumable",
        },
        { timeout: input.metadataGeneration?.timeoutMs ?? 180000 }
      ),
    { maxRetries: 2, label: "videos.insert", logger: input.logger }
    ).catch((error: unknown) => {
      throw new YoutubeUploadError(
        describeYoutubeError(error),
        isRetryableYoutubeError(error),
        error
      );
    });
    const videoId = uploadResponse.data.id;
    if (!videoId) {
      throw new YoutubeUploadError(
        "YouTube upload succeeded but did not return a video ID."
      );
    }
    const uploadRequestId = readRequestId(uploadResponse as {
      readonly headers?: Record<string, unknown>;
    });
    telemetry?.recordApiCall({
    provider: "googleapis",
    model: "youtube.v3",
    operation: "youtube-upload",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 0,
    attempt: 1,
    success: true,
    ...(uploadRequestId ? { requestId: uploadRequestId } : {}),
    details: {
      endpoint: "videos.insert",
      videoId,
      videoPath: uploadVideoPath,
    },
  });
    const thumbnailResponse =
      uploadVariant === "short"
        ? undefined
        : await withRetry(
            async () =>
              youtube.thumbnails.set(
                {
                  videoId,
                  media: {
                    mimeType: uploadThumbnail.mimeType,
                    body: createReadStream(uploadThumbnail.path),
                  },
                },
                { timeout: input.metadataGeneration?.timeoutMs ?? 120000 }
              ),
            { maxRetries: 2, label: "thumbnails.set", logger: input.logger }
          ).catch((error: unknown) => {
            if (isThumbnailUploadRateLimitError(error)) {
              const warning = `Skipping thumbnail update because YouTube rate limited thumbnail uploads: ${describeYoutubeError(error)}`;
              warnings.push(warning);
              input.logger?.warn(
                {
                  episodeId: input.episodeId,
                  videoId,
                  error: describeYoutubeError(error),
                },
                "Skipping thumbnail update because YouTube rate limited thumbnail uploads"
              );
              return undefined;
            }
            throw new YoutubeUploadError(
              describeYoutubeError(error),
              isRetryableYoutubeError(error),
              error
            );
          });
    const thumbnailRequestId = thumbnailResponse ? readRequestId(thumbnailResponse as {
      readonly headers?: Record<string, unknown>;
    }) : undefined;
    if (thumbnailResponse) {
      telemetry?.recordApiCall({
    provider: "googleapis",
    model: "youtube.v3",
    operation: "youtube-upload",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 0,
    attempt: 1,
    success: true,
    ...(thumbnailRequestId ? { requestId: thumbnailRequestId } : {}),
    details: {
      endpoint: "thumbnails.set",
      videoId,
      thumbnailPath: resolved.resolvedThumbnailPath,
    },
  });
    }
    let playlistRequestId: string | undefined;
    if (metadata.playlistId) {
    const playlistSnippet: youtube_v3.Schema$PlaylistItemSnippet = {
      resourceId: {
        kind: "youtube#video",
        videoId,
      },
      ...(metadata.playlistId ? { playlistId: metadata.playlistId } : {}),
    };
    const playlistResponse = await withRetry(
      async () =>
        youtube.playlistItems.insert(
          {
            part: ["snippet"],
            requestBody: {
              snippet: playlistSnippet,
            },
          },
          { timeout: input.metadataGeneration?.timeoutMs ?? 120000 }
        ),
      { maxRetries: 2, label: "playlistItems.insert", logger: input.logger }
    ).catch((error: unknown) => {
      throw new YoutubeUploadError(describeYoutubeError(error), isRetryableYoutubeError(error), error);
    });
    playlistRequestId = readRequestId(playlistResponse as { readonly headers?: Record<string, unknown> });
    telemetry?.recordApiCall({
      provider: "googleapis",
      model: "youtube.v3",
      operation: "youtube-upload",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 0,
      attempt: 1,
      success: true,
      ...(playlistRequestId ? { requestId: playlistRequestId } : {}),
      details: {
        endpoint: "playlistItems.insert",
        videoId,
        playlistId: metadata.playlistId,
      },
    });
    }
    let verificationRequestId: string | undefined;
    try {
    const verificationResponse = await withRetry(
      async () =>
        youtube.videos.list({
          part: ["id", "snippet", "status"],
          id: [videoId],
        }),
      { maxRetries: 1, label: "videos.list", logger: input.logger }
    );
    verificationRequestId = readRequestId(verificationResponse as { readonly headers?: Record<string, unknown> });
    telemetry?.recordApiCall({
      provider: "googleapis",
      model: "youtube.v3",
      operation: "youtube-upload",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 0,
      attempt: 1,
      success: true,
      ...(verificationRequestId ? { requestId: verificationRequestId } : {}),
      details: {
        endpoint: "videos.list",
        videoId,
      },
    });
    } catch (error: unknown) {
      if (!isMissingYoutubeScopeError(error)) {
        throw new YoutubeUploadError(
          describeYoutubeError(error),
          isRetryableYoutubeError(error),
          error
        );
      }
      input.logger?.warn(
      {
        episodeId: input.episodeId,
        videoId,
        error: describeYoutubeError(error),
      },
      "Skipping video verification because the OAuth token does not grant videos.list scope"
      );
    }
    const finalReport = toUploadReport({
    episodeId: input.episodeId,
    episodeDir,
    metadata,
    metadataPath: resolved.metadataPath,
    metadataSha256: resolved.metadataSha256,
    videoPath: uploadVideoPath,
    videoSha256,
    thumbnailPath: uploadThumbnail.path,
    thumbnailSourcePath: uploadThumbnail.sourcePath,
    thumbnailSha256,
    generatedAt: plannedReport.generatedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    status: "uploaded",
    channelTarget: authChannelId,
    requestIds: {
      upload: readRequestId(uploadResponse),
      thumbnail: thumbnailRequestId,
      playlist: playlistRequestId,
      verification: verificationRequestId,
    },
    youtubeVideoId: videoId,
    youtubeChannelId: authChannelId,
    warnings,
    });
    const finalPaths = await writeUploadReport(reportDir, finalReport);
    return {
      report: finalReport,
      reportPath: finalPaths.jsonPath,
      markdownPath: finalPaths.markdownPath,
      skipped: false,
    };
  } catch (error) {
    const uploadError =
      error instanceof YoutubeUploadError
        ? error
        : new YoutubeUploadError(
            error instanceof Error ? error.message : String(error),
            false,
            error
          );
    const failedReport = toUploadReport({
      episodeId: input.episodeId,
      episodeDir,
      metadata,
      metadataPath: resolved.metadataPath,
      metadataSha256: resolved.metadataSha256,
      videoPath: uploadVideoPath,
      videoSha256,
      thumbnailPath: uploadThumbnail.path,
      thumbnailSourcePath: uploadThumbnail.sourcePath,
      thumbnailSha256,
      generatedAt: plannedReport.generatedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      status: "failed",
      channelTarget: input.auth.channelId,
      warnings,
      error: {
        code: uploadError.code,
        message: uploadError.message,
        retryable: uploadError.retryable,
      },
    });
    await writeUploadReport(reportDir, failedReport);
    throw uploadError;
  }
}
