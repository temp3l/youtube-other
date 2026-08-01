import fs from "node:fs/promises";
import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  acquisitionStrategySchema,
  type AcquisitionStrategy,
  contentSourceManifestSchema,
  type ContentSourceManifest,
  sourcePlatformSchema,
  type SourceMedia,
  type SourceMetadata,
  type SourcePlatform,
  transcriptSchema,
  type Transcript
} from "@mediaforge/domain";
import {
  ensureDir,
  assertInsideWorkspace,
  type EpisodePathResolver,
  fileExists,
  normalizeWhitespace,
  safeBasename,
  splitIntoSentences,
  writeJsonAtomic
} from "@mediaforge/shared";
import { HumanActionRequiredError, SourceAcquisitionError, UnsupportedSourceError } from "@mediaforge/domain";
import { z } from "zod";

export interface TranscriptAcquisitionResult {
  readonly transcript: Transcript;
  readonly strategy: AcquisitionStrategy;
}

export interface SourceAdapter {
  readonly platform: SourcePlatform;

  supports(url: URL): boolean;

  inspect(url: URL, signal: AbortSignal): Promise<SourceMetadata>;

  acquireTranscript(source: SourceMetadata, signal: AbortSignal): Promise<TranscriptAcquisitionResult>;

  acquireMedia?(source: SourceMetadata, signal: AbortSignal): Promise<SourceMedia>;
}

const localTranscriptSidecarSchema = transcriptSchema;

const directoryOpenFlags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;

function descriptorPath(handle: FileHandle, entry?: string): string {
  const root = `/proc/self/fd/${handle.fd}`;
  return entry ? `${root}/${entry}` : root;
}

async function openChildDirectory(parent: FileHandle, name: string, create: boolean): Promise<FileHandle> {
  const childPath = descriptorPath(parent, name);
  if (create) {
    await fs.mkdir(childPath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
  }
  return fs.open(childPath, directoryOpenFlags);
}

async function traverseDirectories(
  start: FileHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileHandle> {
  let current = start;
  let ownsCurrent = false;
  try {
    for (const segment of segments) {
      const child = await openChildDirectory(current, segment, create);
      if (ownsCurrent) await current.close();
      current = child;
      ownsCurrent = true;
    }
    if (!ownsCurrent) throw new SourceAcquisitionError("Source manifest directory must be below the workspace.");
    return current;
  } catch (error) {
    if (ownsCurrent) await current.close().catch(() => undefined);
    throw error;
  }
}

async function openWorkspaceNoFollow(workspaceRoot: string): Promise<FileHandle> {
  if (process.platform !== "linux" || !Number.isInteger(fsConstants.O_NOFOLLOW) || !Number.isInteger(fsConstants.O_DIRECTORY)) {
    throw new SourceAcquisitionError("Race-safe source persistence is unavailable on this platform.");
  }
  await fs.access("/proc/self/fd").catch(() => {
    throw new SourceAcquisitionError("Race-safe source persistence requires descriptor filesystem access.");
  });
  const absoluteSegments = path.resolve(workspaceRoot).split(path.sep).filter(Boolean);
  const filesystemRoot = await fs.open(path.parse(path.resolve(workspaceRoot)).root, directoryOpenFlags);
  if (absoluteSegments.length === 0) return filesystemRoot;
  try {
    return await traverseDirectories(filesystemRoot, absoluteSegments, false);
  } finally {
    await filesystemRoot.close();
  }
}

async function sameDirectory(left: FileHandle, right: FileHandle): Promise<boolean> {
  const [leftStat, rightStat] = await Promise.all([left.stat(), right.stat()]);
  return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
}

async function persistJsonThroughBoundDirectory<T>(args: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly value: unknown;
  readonly beforeCommit: () => T;
}): Promise<T> {
  const resolvedWorkspace = path.resolve(args.workspaceRoot);
  const targetDirectory = path.dirname(path.resolve(args.targetPath));
  const relativeDirectory = path.relative(resolvedWorkspace, targetDirectory);
  if (!relativeDirectory || relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) {
    throw new SourceAcquisitionError("Source manifest path escapes the resolver workspace.");
  }
  const workspace = await openWorkspaceNoFollow(resolvedWorkspace);
  let boundDirectory: FileHandle | undefined;
  let currentDirectory: FileHandle | undefined;
  let temporary: FileHandle | undefined;
  const temporaryName = `.${path.basename(args.targetPath)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const segments = relativeDirectory.split(path.sep).filter(Boolean);
    boundDirectory = await traverseDirectories(workspace, segments, true);
    const result = args.beforeCommit();
    currentDirectory = await traverseDirectories(workspace, segments, false);
    if (!(await sameDirectory(boundDirectory, currentDirectory))) {
      throw new SourceAcquisitionError("Source manifest directory changed during persistence.");
    }
    const temporaryPath = descriptorPath(boundDirectory, temporaryName);
    temporary = await fs.open(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    await temporary.writeFile(`${JSON.stringify(args.value, null, 2)}\n`, "utf8");
    await temporary.sync();
    await temporary.close();
    temporary = undefined;
    await fs.rename(temporaryPath, descriptorPath(boundDirectory, path.basename(args.targetPath)));
    await boundDirectory.sync();
    return result;
  } catch (error) {
    await fs.unlink(descriptorPath(boundDirectory ?? workspace, temporaryName)).catch(() => undefined);
    throw error instanceof SourceAcquisitionError
      ? error
      : new SourceAcquisitionError("Race-safe source manifest persistence failed.");
  } finally {
    await temporary?.close().catch(() => undefined);
    await currentDirectory?.close().catch(() => undefined);
    await boundDirectory?.close().catch(() => undefined);
    await workspace.close().catch(() => undefined);
  }
}

/** Hashes exactly the captured source bytes; titles, rights and other mutable
 * manifest metadata are deliberately excluded. */
export function hashCanonicalSourceBytes(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export interface PersistContentSourceManifestRequest {
  readonly resolver: EpisodePathResolver;
  readonly episodeId: Parameters<EpisodePathResolver["episodeRoot"]>[0];
  readonly manifest: ContentSourceManifest;
  readonly sourceBytes: Uint8Array;
  /** Concrete profiles supply their authorization gate; generic ingestion
   * intentionally does not own creator, rights, or editorial policy. */
  readonly authorize: (manifest: ContentSourceManifest) => SourceAuthorizationDecision;
}

export interface SourceAuthorizationDecision {
  readonly allowed: boolean;
  readonly reasonCodes: readonly string[];
}

export interface SourceAuthorizationTelemetry {
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly allowed: boolean;
  readonly reasonCodes: readonly string[];
}

export interface PersistContentSourceManifestResult {
  readonly manifestPath: string;
  readonly decision: SourceAuthorizationDecision;
  readonly telemetry: SourceAuthorizationTelemetry;
}

/**
 * Stores only a schema-checked source manifest at the strategic resolver's
 * canonical location. The source hash is bound to immutable captured bytes,
 * while the decision remains fail-closed for downstream adaptation/publishing.
 */
export async function persistContentSourceManifest(
  request: PersistContentSourceManifestRequest,
): Promise<PersistContentSourceManifestResult> {
  const manifest = contentSourceManifestSchema.parse(request.manifest);
  const sourceHash = hashCanonicalSourceBytes(request.sourceBytes);
  if (manifest.sourceHash !== sourceHash) {
    throw new SourceAcquisitionError("Source manifest hash does not match canonical source bytes.");
  }
  const episodeRoot = request.resolver.episodeRoot(request.episodeId);
  const manifestPath = request.resolver.sourceManifest(request.episodeId, manifest.sourceId);
  assertInsideWorkspace(episodeRoot, manifestPath);
  const decision = await persistJsonThroughBoundDirectory({
    workspaceRoot: request.resolver.workspaceRoot,
    targetPath: manifestPath,
    value: manifest,
    beforeCommit: () => request.authorize(manifest),
  });
  return {
    manifestPath,
    decision,
    telemetry: { sourceId: manifest.sourceId, sourceHash: manifest.sourceHash, allowed: decision.allowed, reasonCodes: decision.reasonCodes },
  };
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".local")) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const octets = normalized.split(".").map((part) => Number(part));
    const [first = 0, second = 0] = octets;
    if (first === 10 || first === 127) {
      return true;
    }
    if (first === 169 && second === 254) {
      return true;
    }
    if (first === 192 && second === 168) {
      return true;
    }
    if (first === 172 && second >= 16 && second <= 31) {
      return true;
    }
  }
  return false;
}

function assertPublicHost(url: URL, allowedHosts: ReadonlyArray<string>): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsupportedSourceError(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (isPrivateHost(url.hostname)) {
    throw new UnsupportedSourceError(`Private or localhost URLs are not allowed: ${url.hostname}`);
  }
  if (!allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new UnsupportedSourceError(`Unsupported hostname: ${url.hostname}`);
  }
}

function buildLocalTranscriptFromText(sourceId: string, text: string): Transcript {
  const segments = splitIntoSentences(text).map((segmentText, index) => {
    const startSeconds = index * 4;
    return {
      id: `scene-${String(index + 1).padStart(3, "0")}` as never,
      startSeconds,
      endSeconds: startSeconds + 4,
      text: segmentText,
      words: []
    };
  });
  return transcriptSchema.parse({
    sourceId,
    language: "en",
    text,
    segments,
    words: []
  });
}

async function readSidecarTranscript(mediaPath: string): Promise<Transcript | null> {
  const candidates = [
    `${mediaPath}.transcript.json`,
    `${path.dirname(mediaPath)}/${path.basename(mediaPath, path.extname(mediaPath))}.transcript.json`,
    `${path.dirname(mediaPath)}/${path.basename(mediaPath, path.extname(mediaPath))}.json`,
    `${mediaPath}.srt`,
    `${mediaPath}.vtt`
  ];
  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }
    if (candidate.endsWith(".json")) {
      return localTranscriptSidecarSchema.parse(JSON.parse(await fs.readFile(candidate, "utf8")) as unknown);
    }
    const raw = await fs.readFile(candidate, "utf8");
    const sentences = raw
      .split(/\n+/u)
      .map((line) => normalizeWhitespace(line))
      .filter((line) => line.length > 0 && !/^\d+$/u.test(line) && !line.includes("-->"));
    return buildLocalTranscriptFromText(path.basename(mediaPath), sentences.join(" "));
  }
  return null;
}

function inferPlatformFromPath(filePath: string): SourcePlatform {
  const extension = path.extname(filePath).toLowerCase();
  if ([".mp4", ".mov", ".mkv", ".webm", ".mp3", ".wav", ".m4a"].includes(extension)) {
    return "local-file";
  }
  throw new UnsupportedSourceError(`Unsupported local file type: ${extension}`);
}

export class LocalFileSourceAdapter implements SourceAdapter {
  public readonly platform = "local-file" as const;

  public supports(url: URL): boolean {
    return url.protocol === "file:";
  }

  public async inspect(url: URL, signal: AbortSignal): Promise<SourceMetadata> {
    signal.throwIfAborted();
    const filePath = url.protocol === "file:" ? url.pathname : url.toString();
    const stats = await fs.stat(filePath);
    return {
      platform: "local-file",
      sourceUrl: url.toString(),
      title: safeBasename(path.basename(filePath)),
      author: "local-file",
      durationSeconds: Math.max(0, stats.size / 16000),
      acquisitionStrategy: "sidecar-subtitle",
      localPath: filePath
    };
  }

  public async acquireTranscript(source: SourceMetadata, signal: AbortSignal): Promise<TranscriptAcquisitionResult> {
    signal.throwIfAborted();
    if (!source.localPath) {
      throw new SourceAcquisitionError("Local file source metadata did not include a local path.");
    }
    const sidecar = await readSidecarTranscript(source.localPath);
    if (sidecar) {
      return { transcript: sidecar, strategy: "sidecar-subtitle" };
    }
    throw new SourceAcquisitionError("No sidecar transcript was found next to the local media file.");
  }

  public async acquireMedia(source: SourceMetadata, signal: AbortSignal): Promise<SourceMedia> {
    signal.throwIfAborted();
    if (!source.localPath) {
      throw new SourceAcquisitionError("Local file source metadata did not include a local path.");
    }
    const stats = await fs.stat(source.localPath);
    return {
      path: source.localPath,
      mimeType: "video/mp4",
      sizeBytes: stats.size,
      durationSeconds: source.durationSeconds
    };
  }
}

export class YouTubeSourceAdapter implements SourceAdapter {
  public readonly platform = "youtube" as const;

  public supports(url: URL): boolean {
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  }

  public async inspect(url: URL, signal: AbortSignal): Promise<SourceMetadata> {
    signal.throwIfAborted();
    assertPublicHost(url, ["youtube.com", "youtu.be"]);
    return {
      platform: "youtube",
      sourceUrl: url.toString(),
      title: "YouTube source",
      author: "unknown",
      durationSeconds: 0,
      acquisitionStrategy: "manual-subtitle"
    };
  }

  public async acquireTranscript(): Promise<TranscriptAcquisitionResult> {
    throw new HumanActionRequiredError("YouTube transcript acquisition is scaffolded but not wired to any undocumented API.");
  }
}

export class TikTokSourceAdapter implements SourceAdapter {
  public readonly platform = "tiktok" as const;

  public supports(url: URL): boolean {
    return ["tiktok.com", "www.tiktok.com"].includes(url.hostname);
  }

  public async inspect(url: URL, signal: AbortSignal): Promise<SourceMetadata> {
    signal.throwIfAborted();
    assertPublicHost(url, ["tiktok.com"]);
    return {
      platform: "tiktok",
      sourceUrl: url.toString(),
      title: "TikTok source",
      author: "unknown",
      durationSeconds: 0,
      acquisitionStrategy: "manual-subtitle"
    };
  }

  public async acquireTranscript(): Promise<TranscriptAcquisitionResult> {
    throw new HumanActionRequiredError("TikTok transcript acquisition is scaffolded but not wired to any undocumented API.");
  }
}

export function selectSourceAdapterFromUrl(url: URL): SourceAdapter {
  const adapters: SourceAdapter[] = [new YouTubeSourceAdapter(), new TikTokSourceAdapter()];
  const adapter = adapters.find((candidate) => candidate.supports(url));
  if (!adapter) {
    throw new UnsupportedSourceError(`No source adapter is available for ${url.hostname}`);
  }
  return adapter;
}

export async function createLocalSourceMetadata(filePath: string): Promise<SourceMetadata> {
  const stats = await fs.stat(filePath);
  return {
    platform: inferPlatformFromPath(filePath),
    sourceUrl: pathToFileURL(filePath).toString(),
    title: safeBasename(path.basename(filePath)),
    author: "local-file",
    durationSeconds: Math.max(0, stats.size / 16000),
    acquisitionStrategy: "sidecar-subtitle",
    localPath: filePath
  };
}

export async function exportLocalTranscript(source: SourceMetadata, outputPath: string): Promise<void> {
  if (!source.localPath) {
    throw new SourceAcquisitionError("Cannot export transcript without a local file path.");
  }
  const transcript = await readSidecarTranscript(source.localPath);
  if (!transcript) {
    throw new SourceAcquisitionError("No transcript could be exported.");
  }
  await ensureDir(path.dirname(outputPath));
  await writeJsonAtomic(outputPath, transcript);
}
