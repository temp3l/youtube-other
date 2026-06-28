import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
 

export const localeCodes = ["en", "de", "es", "fr", "pt"] as const;
export type LocaleCode = (typeof localeCodes)[number];

export const contentVariants = ["full", "short"] as const;
export type ContentVariant = (typeof contentVariants)[number];

export type EpisodeId = string & { readonly __brand: "EpisodeId" };
export type RelativePath = string & { readonly __brand: "RelativePath" };

const episodeIdPattern = /^[a-z0-9][a-z0-9-]*$/u;
const localeCodePattern = /^(en|de|es|fr|pt)(?:-[a-z0-9]{2,8})*$/iu;

export function normalizeEpisodeId(value: string): EpisodeId {
  const normalized = value.trim().toLowerCase();
  if (!episodeIdPattern.test(normalized)) {
    throw new Error(`Invalid episode id: ${value}`);
  }
  return normalized as EpisodeId;
}

export function normalizeLocaleCode(value: string): LocaleCode {
  const normalized = value.trim().toLowerCase();
  const [primary] = normalized.split("-", 1);
  if (!primary || !localeCodePattern.test(normalized) || !localeCodes.includes(primary as LocaleCode)) {
    throw new Error(`Invalid locale code: ${value}`);
  }
  return primary as LocaleCode;
}

export function normalizeContentVariant(value: string): ContentVariant {
  const normalized = value.trim().toLowerCase();
  if (normalized !== "full" && normalized !== "short") {
    throw new Error(`Invalid content variant: ${value}`);
  }
  return normalized;
}

export function ensurePortableRelativePath(candidate: string): RelativePath {
  const normalized = candidate.replace(/\\/gu, "/").trim();
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized === "." ||
    normalized === ".." ||
    normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid portable relative path: ${candidate}`);
  }
  return normalized as RelativePath;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists<T>(filePath: string, parser: (value: unknown) => T): Promise<T | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  return parser(JSON.parse(await fs.readFile(filePath, "utf8")) as unknown);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => void 0);
    throw error;
  }
}

export function toPortableRelativePath(root: string, filePath: string): RelativePath {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  return ensurePortableRelativePath(relative);
}

export function assertInsideWorkspace(workspaceRoot: string, candidatePath: string): string {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  if (
    resolvedCandidate !== resolvedWorkspace &&
    !resolvedCandidate.startsWith(`${resolvedWorkspace}${path.sep}`)
  ) {
    throw new Error(`Path escapes workspace: ${candidatePath}`);
  }
  return resolvedCandidate;
}

export interface EpisodeContext {
  readonly episodeId: EpisodeId;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
}

export interface EpisodePathResolver {
  readonly workspaceRoot: string;
  episodeRoot(episodeId: EpisodeId): string;
  manifestPath(episodeId: EpisodeId): string;
  canonicalScenesPath(episodeId: EpisodeId): string;
  sourceRoot(episodeId: EpisodeId): string;
  sourceMediaDir(episodeId: EpisodeId): string;
  sharedRoot(episodeId: EpisodeId): string;
  localeRoot(context: EpisodeContext): string;
  localeVariantRoot(context: EpisodeContext): string;
  narrationScript(context: EpisodeContext): string;
  transcriptFile(context: EpisodeContext, format?: "json" | "srt"): string;
  captionsFile(context: EpisodeContext, format: "srt" | "vtt" | "ass"): string;
  audioDir(context: EpisodeContext): string;
  audioNarration(context: EpisodeContext): string;
  audioSegmentsDir(context: EpisodeContext): string;
  metadataDir(context: EpisodeContext): string;
  thumbnailFile(context: EpisodeContext): string;
  renderDir(context: EpisodeContext, profile: "youtube" | "vertical"): string;
  renderManifest(context: EpisodeContext, profile: "youtube" | "vertical"): string;
  finalVideo(context: EpisodeContext, profile: "youtube" | "vertical"): string;
  clipsDir(context: EpisodeContext): string;
  clipManifest(context: EpisodeContext, sceneId: string): string;
  imageStateDir(episodeId: EpisodeId): string;
  imageManifest(episodeId: EpisodeId, sceneId: string): string;
  imagePrompt(episodeId: EpisodeId, sceneId: string): string;
  generatedImage(episodeId: EpisodeId, sceneId: string, extension?: string): string;
  batchStateDir(episodeId: EpisodeId): string;
  renderStateDir(episodeId: EpisodeId): string;
  uploadStateDir(episodeId: EpisodeId): string;
  logsDir(episodeId: EpisodeId): string;
  sharedGeneratedImagesDir(episodeId: EpisodeId): string;
  legacyGeneratedImagesDir(episodeId: EpisodeId): string;
}

export interface SceneImageCandidatePaths {
  readonly canonical: string;
  readonly legacyExpected: string;
  readonly legacySceneId: string;
}

export function createEpisodePathResolver(workspaceRoot: string): EpisodePathResolver {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const episodeRoot = (episodeId: EpisodeId): string =>
    path.join(resolvedWorkspace, episodeId);
  const localeRoot = (context: EpisodeContext): string =>
    path.join(episodeRoot(context.episodeId), "locales", context.locale);
  const localeVariantRoot = (context: EpisodeContext): string =>
    path.join(localeRoot(context), context.variant);
  return {
    workspaceRoot: resolvedWorkspace,
    episodeRoot,
    manifestPath: (episodeId) => path.join(episodeRoot(episodeId), "manifest.json"),
    canonicalScenesPath: (episodeId) => path.join(episodeRoot(episodeId), "canonical", "scenes.json"),
    sourceRoot: (episodeId) => path.join(episodeRoot(episodeId), "source"),
    sourceMediaDir: (episodeId) => path.join(episodeRoot(episodeId), "source", "media"),
    sharedRoot: (episodeId) => path.join(episodeRoot(episodeId), "shared"),
    localeRoot,
    localeVariantRoot,
    narrationScript: (context) => path.join(localeVariantRoot(context), "script.md"),
    transcriptFile: (context, format = "json") =>
      path.join(localeVariantRoot(context), "transcript", `transcript.${format}`),
    captionsFile: (context, format) =>
      path.join(localeVariantRoot(context), "captions", `captions.${format}`),
    audioDir: (context) => path.join(localeVariantRoot(context), "audio"),
    audioNarration: (context) => path.join(localeVariantRoot(context), "audio", "narration.wav"),
    audioSegmentsDir: (context) => path.join(localeVariantRoot(context), "audio", "segments"),
    metadataDir: (context) => path.join(localeVariantRoot(context), "metadata"),
    thumbnailFile: (context) => path.join(localeVariantRoot(context), "thumbnails", "thumbnail.png"),
    renderDir: (context, profile) => path.join(localeVariantRoot(context), "renders", profile),
    renderManifest: (context, profile) => path.join(localeVariantRoot(context), "renders", profile, "render.json"),
    finalVideo: (context, profile) =>
      path.join(localeVariantRoot(context), "renders", profile, `${profile}-final.mp4`),
    clipsDir: (context) => path.join(localeVariantRoot(context), "renders", "clips"),
    clipManifest: (context, sceneId) =>
      path.join(localeVariantRoot(context), "renders", "clips", `${sceneId}.json`),
    imageStateDir: (episodeId) => path.join(episodeRoot(episodeId), "state", "image-generation"),
    imageManifest: (episodeId, sceneId) =>
      path.join(episodeRoot(episodeId), "state", "image-generation", "manifests", `${sceneId}.json`),
    imagePrompt: (episodeId, sceneId) =>
      path.join(episodeRoot(episodeId), "state", "image-generation", "prompts", `${sceneId}.txt`),
    generatedImage: (episodeId, sceneId, extension = ".png") =>
      path.join(episodeRoot(episodeId), "state", "image-generation", "images", `${sceneId}${extension}`),
    batchStateDir: (episodeId) => path.join(episodeRoot(episodeId), "state", "batch"),
    renderStateDir: (episodeId) => path.join(episodeRoot(episodeId), "state", "render"),
    uploadStateDir: (episodeId) => path.join(episodeRoot(episodeId), "state", "upload"),
    logsDir: (episodeId) => path.join(episodeRoot(episodeId), "logs"),
    sharedGeneratedImagesDir: (episodeId) =>
      path.join(episodeRoot(episodeId), "shared", "images", "generated"),
    legacyGeneratedImagesDir: (episodeId) =>
      path.join(episodeRoot(episodeId), "state", "image-generation", "images"),
  };
}

export function resolveSceneImageCandidatePaths(args: {
  readonly episodeDir: string;
  readonly sceneId: string;
  readonly expectedFilename?: string;
}): SceneImageCandidatePaths {
  const expectedFilename = args.expectedFilename?.trim();
  const canonicalFileName =
    expectedFilename && expectedFilename.length > 0
      ? expectedFilename
      : `${args.sceneId}.png`;
  const legacyExpectedFileName = canonicalFileName;
  return {
    canonical: path.join(
      args.episodeDir,
      "shared",
      "images",
      "generated",
      canonicalFileName
    ),
    legacyExpected: path.join(
      args.episodeDir,
      "state",
      "image-generation",
      "images",
      legacyExpectedFileName
    ),
    legacySceneId: path.join(
      args.episodeDir,
      "state",
      "image-generation",
      "images",
      `${args.sceneId}.png`
    ),
  };
}

export interface ManifestStore<T> {
  load(filePath: string): Promise<T | null>;
  save(filePath: string, value: T): Promise<void>;
}

export function createJsonManifestStore<T>(schema: z.ZodType<T>): ManifestStore<T> {
  return {
    async load(filePath: string): Promise<T | null> {
      return readJsonIfExists(filePath, (value) => schema.parse(value));
    },
    async save(filePath: string, value: T): Promise<void> {
      await ensureDir(path.dirname(filePath));
      await writeJsonAtomic(filePath, schema.parse(value));
    },
  };
}

export interface AtomicJsonWriter {
  write(filePath: string, value: unknown): Promise<void>;
}

export function createAtomicJsonWriter(): AtomicJsonWriter {
  return {
    async write(filePath: string, value: unknown): Promise<void> {
      await ensureDir(path.dirname(filePath));
      await writeJsonAtomic(filePath, value);
    },
  };
}

export async function ensureEpisodeWorkspace(resolver: EpisodePathResolver, episodeId: EpisodeId): Promise<void> {
  const dirs = [
    resolver.episodeRoot(episodeId),
    resolver.sourceRoot(episodeId),
    resolver.sourceMediaDir(episodeId),
    resolver.sharedRoot(episodeId),
    resolver.imageStateDir(episodeId),
    resolver.batchStateDir(episodeId),
    resolver.renderStateDir(episodeId),
    resolver.uploadStateDir(episodeId),
    resolver.logsDir(episodeId),
  ];
  for (const dir of dirs) {
    await ensureDir(dir);
  }
}

export async function loadFirstExisting<T>(paths: readonly string[], parser: (value: unknown) => T): Promise<T | null> {
  for (const candidate of paths) {
    if (!(await fileExists(candidate))) {
      continue;
    }
    return readJsonIfExists(candidate, parser);
  }
  return null;
}
