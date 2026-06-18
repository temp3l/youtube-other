import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  acquisitionStrategySchema,
  type AcquisitionStrategy,
  sourcePlatformSchema,
  type SourceMedia,
  type SourceMetadata,
  type SourcePlatform,
  transcriptSchema,
  type Transcript
} from "@mediaforge/domain";
import {
  ensureDir,
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
