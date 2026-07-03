import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
 

export const localeCodes = ["en", "de", "es", "fr", "pt"] as const;
export type LocaleCode = (typeof localeCodes)[number];
export type EpisodeLanguage = LocaleCode;

export const contentVariants = ["full", "short"] as const;
export type ContentVariant = (typeof contentVariants)[number];
export type ScriptVariant = ContentVariant;
export type Sha256Fingerprint = string & { readonly __brand: "Sha256Fingerprint" };
export type ScriptContentHash = Sha256Fingerprint;

export type EpisodeId = string & { readonly __brand: "EpisodeId" };
export type EpisodeSlug = EpisodeId;
export type RelativePath = string & { readonly __brand: "RelativePath" };
export type RepositoryRelativePath = RelativePath;
export type AbsolutePath = string & { readonly __brand: "AbsolutePath" };

const episodeIdPattern = /^[a-z0-9][a-z0-9-]*$/u;
const localeCodePattern = /^(en|de|es|fr|pt)(?:-[a-z0-9]{2,8})*$/iu;
const legacySpanishLocaleCodePattern = /^sp(?:-[a-z0-9]{2,8})*$/iu;
const sha256FingerprintPattern = /^[a-f0-9]{64}$/u;

export function normalizeEpisodeId(value: string): EpisodeId {
  const normalized = value.trim().toLowerCase();
  if (!episodeIdPattern.test(normalized)) {
    throw new Error(`Invalid episode id: ${value}`);
  }
  return normalized as EpisodeId;
}

export function normalizeLocaleCode(value: string): LocaleCode {
  const normalized = value.trim().toLowerCase();
  if (legacySpanishLocaleCodePattern.test(normalized)) {
    throw new Error(`Invalid locale code: ${value}. Use "es" for Spanish.`);
  }
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

export function normalizeSha256Fingerprint(value: string): Sha256Fingerprint {
  const normalized = value.trim().toLowerCase();
  if (!sha256FingerprintPattern.test(normalized)) {
    throw new Error(`Invalid sha256 fingerprint: ${value}`);
  }
  return normalized as Sha256Fingerprint;
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

export function normalizeAbsolutePath(value: string): AbsolutePath {
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) {
    throw new Error(`Invalid absolute path: ${value}`);
  }
  return resolved as AbsolutePath;
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

export type AuthoredScriptResolverVersion = `authored-script-resolver-v${number}`;
export const authoredScriptResolverVersion =
  "authored-script-resolver-v2" as const satisfies AuthoredScriptResolverVersion;
export type AuthoredScriptCacheIdentity = string & {
  readonly __brand: "AuthoredScriptCacheIdentity";
};

export interface AuthoredScriptSourceIdentity {
  readonly resolverVersion: AuthoredScriptResolverVersion;
  readonly episodeId: EpisodeSlug;
  readonly language: EpisodeLanguage;
  readonly variant: ScriptVariant;
  readonly relativePath: RepositoryRelativePath;
  readonly contentHash: ScriptContentHash;
}

export type AuthoredScriptResolverErrorCode =
  | "INVALID_REQUEST"
  | "PATH_ESCAPE"
  | "MISSING_SCRIPT"
  | "NOT_A_FILE"
  | "STALE_LAYOUT"
  | "AMBIGUOUS_SCRIPT"
  | "FILESYSTEM_ERROR";

export interface AuthoredScriptResolverErrorDetails {
  readonly workspaceRoot?: string;
  readonly episodeId?: string;
  readonly language?: string;
  readonly variant?: string;
  readonly canonicalRelativePath?: string;
  readonly candidates?: readonly string[];
  readonly causeMessage?: string;
}

export class AuthoredScriptResolverError extends Error {
  readonly code: AuthoredScriptResolverErrorCode;
  readonly details: AuthoredScriptResolverErrorDetails;

  constructor(
    code: AuthoredScriptResolverErrorCode,
    message: string,
    details: AuthoredScriptResolverErrorDetails = {}
  ) {
    super(message);
    this.name = "AuthoredScriptResolverError";
    this.code = code;
    this.details = details;
  }
}

export interface ResolveAuthoredScriptRequest {
  readonly workspaceRoot: string;
  readonly episode: string;
  readonly language: string;
  readonly variant: string;
}

export interface ResolvedAuthoredScript {
  readonly episodeId: EpisodeSlug;
  readonly language: EpisodeLanguage;
  readonly variant: ScriptVariant;
  readonly absolutePath: AbsolutePath;
  readonly relativePath: RepositoryRelativePath;
  readonly contentHash: ScriptContentHash;
  readonly identity: AuthoredScriptSourceIdentity;
  readonly cacheIdentity: AuthoredScriptCacheIdentity;
  readonly resolverVersion: typeof authoredScriptResolverVersion;
  readonly logContext: {
    readonly episodeId: string;
    readonly language: string;
    readonly variant: string;
    readonly relativePath: string;
    readonly contentHash: string;
    readonly cacheIdentity: string;
    readonly scriptPath: string;
    readonly scriptHash: string;
    readonly resolverVersion: typeof authoredScriptResolverVersion;
  };
}

async function statIfExists(filePath: string): Promise<import("node:fs").Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function hashExistingFile(filePath: string): Promise<ScriptContentHash> {
  const content = await fs.readFile(filePath);
  return normalizeSha256Fingerprint(
    crypto.createHash("sha256").update(content).digest("hex")
  ) as ScriptContentHash;
}

function authoredScriptRelativePath(args: {
  readonly episodeId: EpisodeSlug;
  readonly language: EpisodeLanguage;
  readonly variant: ScriptVariant;
}): RepositoryRelativePath {
  const segments =
    args.variant === "short"
      ? ["episodes", args.episodeId, "languages", "short", `script-${args.language}.md`]
      : ["episodes", args.episodeId, "languages", `script-${args.language}.md`];
  return ensurePortableRelativePath(segments.join("/"));
}

export function buildAuthoredScriptCacheIdentity(
  identity: AuthoredScriptSourceIdentity
): AuthoredScriptCacheIdentity {
  return [
    identity.resolverVersion,
    identity.episodeId,
    identity.language,
    identity.variant,
    identity.relativePath,
    identity.contentHash,
  ].join(":") as AuthoredScriptCacheIdentity;
}

function staleAuthoredScriptRelativePaths(args: {
  readonly episodeId: EpisodeSlug;
  readonly language: EpisodeLanguage;
  readonly variant: ScriptVariant;
}): readonly RepositoryRelativePath[] {
  const variantPaths =
    args.variant === "short"
      ? [
          ["episodes", args.episodeId, args.language, "short", "script.md"],
          ["episodes", args.episodeId, "locales", args.language, "short", "script.md"],
        ]
      : [
          ["episodes", args.episodeId, "script.md"],
          ["episodes", args.episodeId, args.language, "script.md"],
          ["episodes", args.episodeId, args.language, "full", "script.md"],
          ["episodes", args.episodeId, "locales", args.language, "full", "script.md"],
        ];
  return variantPaths.map((segments) => ensurePortableRelativePath(segments.join("/")));
}

function resolverDetails(args: {
  readonly workspaceRoot: string;
  readonly episodeId?: string;
  readonly language?: string;
  readonly variant?: string;
  readonly canonicalRelativePath?: string;
  readonly candidates?: readonly string[];
  readonly causeMessage?: string;
}): AuthoredScriptResolverErrorDetails {
  return args;
}

export async function resolveAuthoredScript(
  request: ResolveAuthoredScriptRequest
): Promise<ResolvedAuthoredScript> {
  const workspaceRoot = path.resolve(request.workspaceRoot);
  let episodeId: EpisodeSlug;
  let language: EpisodeLanguage;
  let variant: ScriptVariant;

  try {
    episodeId = normalizeEpisodeId(request.episode);
    language = normalizeLocaleCode(request.language);
    variant = normalizeContentVariant(request.variant);
  } catch (error) {
    throw new AuthoredScriptResolverError(
      "INVALID_REQUEST",
      error instanceof Error ? error.message : "Invalid authored script request",
      resolverDetails({
        workspaceRoot,
        episodeId: request.episode,
        language: request.language,
        variant: request.variant,
      })
    );
  }

  const canonicalRelativePath = authoredScriptRelativePath({
    episodeId,
    language,
    variant,
  });
  const canonicalPath = assertInsideWorkspace(
    workspaceRoot,
    path.join(workspaceRoot, canonicalRelativePath)
  );

  let canonicalStat: import("node:fs").Stats | null;
  try {
    canonicalStat = await statIfExists(canonicalPath);
  } catch (error) {
    throw new AuthoredScriptResolverError(
      "FILESYSTEM_ERROR",
      `Unable to inspect authored script: ${canonicalRelativePath}`,
      resolverDetails({
        workspaceRoot,
        episodeId,
        language,
        variant,
        canonicalRelativePath,
        causeMessage: error instanceof Error ? error.message : String(error),
      })
    );
  }

  const staleCandidates = staleAuthoredScriptRelativePaths({
    episodeId,
    language,
    variant,
  });
  const existingStaleCandidates: RepositoryRelativePath[] = [];
  for (const candidate of staleCandidates) {
    const candidatePath = assertInsideWorkspace(
      workspaceRoot,
      path.join(workspaceRoot, candidate)
    );
    const candidateStat = await statIfExists(candidatePath);
    if (candidateStat?.isFile()) {
      existingStaleCandidates.push(candidate);
    }
  }

  if (existingStaleCandidates.length > 0) {
    throw new AuthoredScriptResolverError(
      "STALE_LAYOUT",
      [
        `Stale authored script layout exists for ${episodeId} ${language} ${variant}.`,
        `Use ${canonicalRelativePath} and remove: ${existingStaleCandidates.join(", ")}`,
      ].join(" "),
      resolverDetails({
        workspaceRoot,
        episodeId,
        language,
        variant,
        canonicalRelativePath,
        candidates: existingStaleCandidates,
      })
    );
  }

  if (canonicalStat === null) {
    throw new AuthoredScriptResolverError(
      "MISSING_SCRIPT",
      `Missing authored script: ${canonicalRelativePath}`,
      resolverDetails({
        workspaceRoot,
        episodeId,
        language,
        variant,
        canonicalRelativePath,
      })
    );
  }
  if (!canonicalStat.isFile()) {
    throw new AuthoredScriptResolverError(
      "NOT_A_FILE",
      `Authored script is not a regular file: ${canonicalRelativePath}`,
      resolverDetails({
        workspaceRoot,
        episodeId,
        language,
        variant,
        canonicalRelativePath,
      })
    );
  }

  let realCanonicalPath: string;
  try {
    realCanonicalPath = await fs.realpath(canonicalPath);
  } catch (error) {
    throw new AuthoredScriptResolverError(
      "FILESYSTEM_ERROR",
      `Unable to resolve authored script realpath: ${canonicalRelativePath}`,
      resolverDetails({
        workspaceRoot,
        episodeId,
        language,
        variant,
        canonicalRelativePath,
        causeMessage: error instanceof Error ? error.message : String(error),
      })
    );
  }
  if (
    realCanonicalPath !== workspaceRoot &&
    !realCanonicalPath.startsWith(`${workspaceRoot}${path.sep}`)
  ) {
    throw new AuthoredScriptResolverError(
      "PATH_ESCAPE",
      `Authored script resolves outside workspace: ${canonicalRelativePath}`,
      resolverDetails({
        workspaceRoot,
        episodeId,
        language,
        variant,
        canonicalRelativePath,
      })
    );
  }

  const contentHash = await hashExistingFile(realCanonicalPath);
  const identity: AuthoredScriptSourceIdentity = {
    resolverVersion: authoredScriptResolverVersion,
    episodeId,
    language,
    variant,
    relativePath: canonicalRelativePath,
    contentHash,
  };
  const cacheIdentity = buildAuthoredScriptCacheIdentity(identity);

  return {
    episodeId,
    language,
    variant,
    absolutePath: normalizeAbsolutePath(realCanonicalPath),
    relativePath: canonicalRelativePath,
    contentHash,
    identity,
    cacheIdentity,
    resolverVersion: authoredScriptResolverVersion,
    logContext: {
      episodeId,
      language,
      variant,
      relativePath: canonicalRelativePath,
      contentHash,
      cacheIdentity,
      scriptPath: canonicalRelativePath,
      scriptHash: contentHash,
      resolverVersion: authoredScriptResolverVersion,
    },
  };
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
  imageManifestsDir(episodeId: EpisodeId): string;
  imageManifest(episodeId: EpisodeId, sceneId: string): string;
  imagePromptsDir(episodeId: EpisodeId): string;
  imagePrompt(episodeId: EpisodeId, sceneId: string): string;
  imageVisualPlansDir(episodeId: EpisodeId): string;
  imageVisualPlan(episodeId: EpisodeId, sceneId: string): string;
  imageProviderRequestsDir(episodeId: EpisodeId): string;
  imageProviderRequest(episodeId: EpisodeId, sceneId: string): string;
  imageProviderResponsesDir(episodeId: EpisodeId): string;
  imageProviderResponse(episodeId: EpisodeId, sceneId: string): string;
  imageCheckpointsDir(episodeId: EpisodeId): string;
  imageCheckpoint(episodeId: EpisodeId, sceneId: string): string;
  imageFailuresDir(episodeId: EpisodeId): string;
  imageFailure(episodeId: EpisodeId, sceneId: string): string;
  sharedCharactersPath(episodeId: EpisodeId): string;
  sharedCharacterReferencesDir(episodeId: EpisodeId): string;
  characterReferenceImage(
    episodeId: EpisodeId,
    characterId: string,
    extension?: string
  ): string;
  generatedImage(
    episodeId: EpisodeId,
    sceneId: string,
    expectedFilename?: string
  ): string;
  batchStateDir(episodeId: EpisodeId): string;
  renderStateDir(episodeId: EpisodeId): string;
  visualRetentionDir(episodeId: EpisodeId): string;
  visualSourceScenes(episodeId: EpisodeId): string;
  focalMetadata(episodeId: EpisodeId): string;
  shotPlan(context: EpisodeContext): string;
  shotValidation(context: EpisodeContext): string;
  shotStoryboard(context: EpisodeContext): string;
  shotContactSheet(context: EpisodeContext): string;
  derivedShotsDir(episodeId: EpisodeId): string;
  derivedShotClip(episodeId: EpisodeId, fingerprint: string): string;
  derivedShotManifest(episodeId: EpisodeId, fingerprint: string): string;
  uploadStateDir(episodeId: EpisodeId): string;
  logsDir(episodeId: EpisodeId): string;
  sharedGeneratedImagesDir(episodeId: EpisodeId): string;
}

export interface SceneImageCandidatePaths {
  readonly canonical: string;
  readonly legacyExpected: string;
  readonly legacySceneId: string;
}

export function resolveEpisodeCharacterRegistryPath(episodeDir: string): string {
  return path.join(episodeDir, "shared", "characters.json");
}

export function resolveEpisodeCharacterReferencePath(
  episodeDir: string,
  characterId: string,
  extension = ".png"
): string {
  return path.join(
    episodeDir,
    "shared",
    "images",
    "character-references",
    `${characterId}${extension}`
  );
}

export function resolveEpisodeImageStateDir(episodeDir: string): string {
  return path.join(episodeDir, "state", "image-generation");
}

export function resolveEpisodeImageManifestsDir(episodeDir: string): string {
  return path.join(resolveEpisodeImageStateDir(episodeDir), "manifests");
}

export function resolveEpisodeImageManifestPath(
  episodeDir: string,
  sceneId: string
): string {
  return path.join(resolveEpisodeImageManifestsDir(episodeDir), `${sceneId}.json`);
}

export function resolveEpisodeImagePromptsDir(episodeDir: string): string {
  return path.join(resolveEpisodeImageStateDir(episodeDir), "prompts");
}

export function resolveEpisodeImagePromptPath(
  episodeDir: string,
  sceneId: string
): string {
  return path.join(resolveEpisodeImagePromptsDir(episodeDir), `${sceneId}.txt`);
}

export function resolveEpisodeImageVisualPlansDir(episodeDir: string): string {
  return path.join(resolveEpisodeImageStateDir(episodeDir), "visual-plans");
}

export function resolveEpisodeImageVisualPlanPath(
  episodeDir: string,
  sceneId: string
): string {
  return path.join(resolveEpisodeImageVisualPlansDir(episodeDir), `${sceneId}.json`);
}

export function resolveEpisodeImageProviderRequestsDir(
  episodeDir: string
): string {
  return path.join(resolveEpisodeImageStateDir(episodeDir), "provider-requests");
}

export function resolveEpisodeImageProviderRequestPath(
  episodeDir: string,
  sceneId: string
): string {
  return path.join(
    resolveEpisodeImageProviderRequestsDir(episodeDir),
    `${sceneId}.json`
  );
}

export function resolveEpisodeImageProviderResponsesDir(
  episodeDir: string
): string {
  return path.join(resolveEpisodeImageStateDir(episodeDir), "provider-responses");
}

export function resolveEpisodeImageProviderResponsePath(
  episodeDir: string,
  sceneId: string
): string {
  return path.join(
    resolveEpisodeImageProviderResponsesDir(episodeDir),
    `${sceneId}.json`
  );
}

export function resolveEpisodeImageCheckpointsDir(episodeDir: string): string {
  return path.join(resolveEpisodeImageStateDir(episodeDir), "checkpoints");
}

export function resolveEpisodeImageCheckpointPath(
  episodeDir: string,
  sceneId: string
): string {
  return path.join(resolveEpisodeImageCheckpointsDir(episodeDir), `${sceneId}.json`);
}

export function resolveEpisodeImageFailuresDir(episodeDir: string): string {
  return path.join(resolveEpisodeImageStateDir(episodeDir), "failures");
}

export function resolveEpisodeImageFailurePath(
  episodeDir: string,
  sceneId: string
): string {
  return path.join(resolveEpisodeImageFailuresDir(episodeDir), `${sceneId}.json`);
}

function resolveEpisodeContainedPath(
  episodeDir: string,
  ...segments: readonly string[]
): string {
  return assertInsideWorkspace(episodeDir, path.join(episodeDir, ...segments));
}

function resolveVariantLocaleArtifactName(args: {
  readonly prefix: string;
  readonly locale: string;
  readonly variant: string;
  readonly extension: string;
}): string {
  const variant = normalizeContentVariant(args.variant);
  const locale = normalizeLocaleCode(args.locale);
  return `${args.prefix}.${variant}.${locale}.${args.extension}`;
}

/**
 * Visual-retention artifacts are canonical state owned by the shared resolver.
 * Later planners/renderers should consume these helpers instead of rebuilding filenames.
 */
export function resolveEpisodeVisualRetentionDir(episodeDir: string): string {
  return resolveEpisodeContainedPath(episodeDir, "state", "visual-retention");
}

export function resolveEpisodeVisualSourceScenesPath(episodeDir: string): string {
  return resolveEpisodeContainedPath(
    episodeDir,
    "state",
    "visual-retention",
    "source-scenes.json"
  );
}

export function resolveEpisodeFocalMetadataPath(episodeDir: string): string {
  return resolveEpisodeContainedPath(
    episodeDir,
    "state",
    "visual-retention",
    "focal-metadata.json"
  );
}

export function resolveEpisodeShotPlanPath(args: {
  readonly episodeDir: string;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
}): string {
  return resolveEpisodeContainedPath(
    args.episodeDir,
    "state",
    "visual-retention",
    resolveVariantLocaleArtifactName({
      prefix: "shot-plan",
      locale: args.locale,
      variant: args.variant,
      extension: "json",
    })
  );
}

export function resolveEpisodeShotValidationPath(args: {
  readonly episodeDir: string;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
}): string {
  return resolveEpisodeContainedPath(
    args.episodeDir,
    "state",
    "visual-retention",
    resolveVariantLocaleArtifactName({
      prefix: "validation",
      locale: args.locale,
      variant: args.variant,
      extension: "json",
    })
  );
}

export function resolveEpisodeShotStoryboardPath(args: {
  readonly episodeDir: string;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
}): string {
  return resolveEpisodeContainedPath(
    args.episodeDir,
    "state",
    "visual-retention",
    resolveVariantLocaleArtifactName({
      prefix: "storyboard",
      locale: args.locale,
      variant: args.variant,
      extension: "html",
    })
  );
}

export function resolveEpisodeShotContactSheetPath(args: {
  readonly episodeDir: string;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
}): string {
  return resolveEpisodeContainedPath(
    args.episodeDir,
    "state",
    "visual-retention",
    resolveVariantLocaleArtifactName({
      prefix: "contact-sheet",
      locale: args.locale,
      variant: args.variant,
      extension: "png",
    })
  );
}

export function resolveEpisodeDerivedShotsDir(episodeDir: string): string {
  return resolveEpisodeContainedPath(
    episodeDir,
    "state",
    "render",
    "derived-shots"
  );
}

/**
 * Derived-shot fingerprints must already be content-addressed sha256 hex values.
 * The resolver validates them before constructing a filename so invalid inputs cannot collide.
 */
export function resolveEpisodeDerivedShotClipPath(
  episodeDir: string,
  fingerprint: string
): string {
  const normalizedFingerprint = normalizeSha256Fingerprint(fingerprint);
  return resolveEpisodeContainedPath(
    episodeDir,
    "state",
    "render",
    "derived-shots",
    `${normalizedFingerprint}.mp4`
  );
}

export function resolveEpisodeDerivedShotManifestPath(
  episodeDir: string,
  fingerprint: string
): string {
  const normalizedFingerprint = normalizeSha256Fingerprint(fingerprint);
  return resolveEpisodeContainedPath(
    episodeDir,
    "state",
    "render",
    "derived-shots",
    `${normalizedFingerprint}.json`
  );
}

export function resolveEpisodeSharedGeneratedImagePath(args: {
  readonly episodeDir: string;
  readonly sceneId: string;
  readonly expectedFilename?: string;
}): string {
  const expectedFilename = args.expectedFilename?.trim();
  const canonicalFileName =
    expectedFilename && expectedFilename.length > 0
      ? expectedFilename
      : `${args.sceneId}.png`;
  return path.join(
    args.episodeDir,
    "shared",
    "images",
    "generated",
    canonicalFileName
  );
}

export function resolveEpisodeLegacyGeneratedImagePath(args: {
  readonly episodeDir: string;
  readonly sceneId: string;
  readonly expectedFilename?: string;
}): string {
  const expectedFilename = args.expectedFilename?.trim();
  const legacyFileName =
    expectedFilename && expectedFilename.length > 0
      ? expectedFilename
      : `${args.sceneId}.png`;
  return path.join(
    args.episodeDir,
    "state",
    "image-generation",
    "images",
    legacyFileName
  );
}

export function resolveEpisodeDirFromSceneOutputPath(
  outputPath: string
): string | null {
  const normalized = path.resolve(outputPath);
  const outputDir = path.dirname(normalized);
  const outputDirName = path.basename(outputDir);

  if (outputDirName === "generated") {
    const imagesDir = path.dirname(outputDir);
    const sharedDir = path.dirname(imagesDir);
    if (
      path.basename(imagesDir) === "images" &&
      path.basename(sharedDir) === "shared"
    ) {
      return path.dirname(sharedDir);
    }
  }

  if (outputDirName === "images") {
    const imageGenerationDir = path.dirname(outputDir);
    const stateDir = path.dirname(imageGenerationDir);
    if (
      path.basename(imageGenerationDir) === "image-generation" &&
      path.basename(stateDir) === "state"
    ) {
      return path.dirname(stateDir);
    }
  }

  return null;
}

export function resolveEpisodeImageManifestPathFromSceneOutputPath(args: {
  readonly outputPath: string;
  readonly sceneId: string;
}): string {
  const episodeDir = resolveEpisodeDirFromSceneOutputPath(args.outputPath);
  if (episodeDir) {
    return resolveEpisodeImageManifestPath(episodeDir, args.sceneId);
  }
  return path.join(
    path.dirname(path.dirname(args.outputPath)),
    "manifests",
    `${args.sceneId}.json`
  );
}

export function createEpisodePathResolver(workspaceRoot: string): EpisodePathResolver {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const episodeRoot = (episodeId: EpisodeId): string =>
    path.join(resolvedWorkspace, episodeId);
  const episodeVisualRetentionDir = (episodeId: EpisodeId): string =>
    resolveEpisodeVisualRetentionDir(episodeRoot(episodeId));
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
    imageStateDir: (episodeId) =>
      resolveEpisodeImageStateDir(episodeRoot(episodeId)),
    imageManifestsDir: (episodeId) =>
      resolveEpisodeImageManifestsDir(episodeRoot(episodeId)),
    imageManifest: (episodeId, sceneId) =>
      resolveEpisodeImageManifestPath(episodeRoot(episodeId), sceneId),
    imagePromptsDir: (episodeId) =>
      resolveEpisodeImagePromptsDir(episodeRoot(episodeId)),
    imagePrompt: (episodeId, sceneId) =>
      resolveEpisodeImagePromptPath(episodeRoot(episodeId), sceneId),
    imageVisualPlansDir: (episodeId) =>
      resolveEpisodeImageVisualPlansDir(episodeRoot(episodeId)),
    imageVisualPlan: (episodeId, sceneId) =>
      resolveEpisodeImageVisualPlanPath(episodeRoot(episodeId), sceneId),
    imageProviderRequestsDir: (episodeId) =>
      resolveEpisodeImageProviderRequestsDir(episodeRoot(episodeId)),
    imageProviderRequest: (episodeId, sceneId) =>
      resolveEpisodeImageProviderRequestPath(episodeRoot(episodeId), sceneId),
    imageProviderResponsesDir: (episodeId) =>
      resolveEpisodeImageProviderResponsesDir(episodeRoot(episodeId)),
    imageProviderResponse: (episodeId, sceneId) =>
      resolveEpisodeImageProviderResponsePath(episodeRoot(episodeId), sceneId),
    imageCheckpointsDir: (episodeId) =>
      resolveEpisodeImageCheckpointsDir(episodeRoot(episodeId)),
    imageCheckpoint: (episodeId, sceneId) =>
      resolveEpisodeImageCheckpointPath(episodeRoot(episodeId), sceneId),
    imageFailuresDir: (episodeId) =>
      resolveEpisodeImageFailuresDir(episodeRoot(episodeId)),
    imageFailure: (episodeId, sceneId) =>
      resolveEpisodeImageFailurePath(episodeRoot(episodeId), sceneId),
    sharedCharactersPath: (episodeId) =>
      resolveEpisodeCharacterRegistryPath(episodeRoot(episodeId)),
    sharedCharacterReferencesDir: (episodeId) =>
      path.dirname(resolveEpisodeCharacterReferencePath(episodeRoot(episodeId), "placeholder")),
    characterReferenceImage: (episodeId, characterId, extension = ".png") =>
      resolveEpisodeCharacterReferencePath(
        episodeRoot(episodeId),
        characterId,
        extension
      ),
    generatedImage: (episodeId, sceneId, expectedFilename) =>
      resolveEpisodeSharedGeneratedImagePath({
        episodeDir: episodeRoot(episodeId),
        sceneId,
        ...(expectedFilename ? { expectedFilename } : {}),
      }),
    batchStateDir: (episodeId) => path.join(episodeRoot(episodeId), "state", "batch"),
    renderStateDir: (episodeId) => path.join(episodeRoot(episodeId), "state", "render"),
    visualRetentionDir: episodeVisualRetentionDir,
    visualSourceScenes: (episodeId) =>
      resolveEpisodeVisualSourceScenesPath(episodeRoot(episodeId)),
    focalMetadata: (episodeId) =>
      resolveEpisodeFocalMetadataPath(episodeRoot(episodeId)),
    shotPlan: (context) =>
      resolveEpisodeShotPlanPath({
        episodeDir: episodeRoot(context.episodeId),
        locale: context.locale,
        variant: context.variant,
      }),
    shotValidation: (context) =>
      resolveEpisodeShotValidationPath({
        episodeDir: episodeRoot(context.episodeId),
        locale: context.locale,
        variant: context.variant,
      }),
    shotStoryboard: (context) =>
      resolveEpisodeShotStoryboardPath({
        episodeDir: episodeRoot(context.episodeId),
        locale: context.locale,
        variant: context.variant,
      }),
    shotContactSheet: (context) =>
      resolveEpisodeShotContactSheetPath({
        episodeDir: episodeRoot(context.episodeId),
        locale: context.locale,
        variant: context.variant,
      }),
    derivedShotsDir: (episodeId) =>
      resolveEpisodeDerivedShotsDir(episodeRoot(episodeId)),
    derivedShotClip: (episodeId, fingerprint) =>
      resolveEpisodeDerivedShotClipPath(episodeRoot(episodeId), fingerprint),
    derivedShotManifest: (episodeId, fingerprint) =>
      resolveEpisodeDerivedShotManifestPath(episodeRoot(episodeId), fingerprint),
    uploadStateDir: (episodeId) => path.join(episodeRoot(episodeId), "state", "upload"),
    logsDir: (episodeId) => path.join(episodeRoot(episodeId), "logs"),
    sharedGeneratedImagesDir: (episodeId) =>
      path.join(episodeRoot(episodeId), "shared", "images", "generated"),
  };
}

export function resolveSceneImageCandidatePaths(args: {
  readonly episodeDir: string;
  readonly sceneId: string;
  readonly expectedFilename?: string;
}): SceneImageCandidatePaths {
  return {
    canonical: resolveEpisodeSharedGeneratedImagePath(args),
    legacyExpected: resolveEpisodeLegacyGeneratedImagePath(args),
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
