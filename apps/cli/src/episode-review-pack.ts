import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Command } from "commander";

const execFileAsync = promisify(execFile);

const AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".ac3",
  ".aif",
  ".aiff",
  ".alac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
  ".wma",
]);
const VIDEO_EXTENSIONS = new Set([
  ".avi",
  ".flv",
  ".m2ts",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".mts",
  ".ts",
  ".webm",
  ".wmv",
]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".ass",
  ".csv",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".srt",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vtt",
  ".xml",
  ".yaml",
  ".yml",
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  "node_modules",
  "review-packs",
  "reviews",
]);
const EXCLUDED_ARCHIVE_EXTENSIONS = new Set([
  ".7z",
  ".bz2",
  ".db",
  ".gz",
  ".rar",
  ".sqlite",
  ".tar",
  ".tgz",
  ".xz",
  ".zip",
]);
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_PACK_BYTES = 200 * 1024 * 1024;
const DEFAULT_PROBE_CONCURRENCY = 4;

type MediaKind = "audio" | "video";

interface IncludedFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
}

interface MediaFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly kind: MediaKind;
}

interface Exclusion {
  readonly path: string;
  readonly reason: string;
}

export interface EpisodeMediaProbe {
  readonly path: string;
  readonly kind: MediaKind;
  readonly sizeBytes: number;
  readonly status: "probed" | "failed";
  readonly format?: Readonly<Record<string, string | number>>;
  readonly streams?: readonly Readonly<Record<string, unknown>>[];
  readonly error?: string;
}

export interface EpisodeReviewPackOptions {
  readonly episodeFolder: string;
  readonly maxFileBytes?: number;
  readonly maxPackBytes?: number;
  readonly probeConcurrency?: number;
}

export interface EpisodeReviewPackResult {
  readonly status: "READY" | "PARTIAL";
  readonly episodeId: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly zipBytes: number;
  readonly includedFiles: number;
  readonly mediaFilesProbed: number;
  readonly mediaProbeFailures: number;
  readonly excludedFiles: number;
  readonly redactionCount: number;
}

export interface EpisodeReviewPackRuntime {
  readonly now?: () => Date;
  readonly ffprobeVersion?: () => Promise<string>;
  readonly probeMedia?: (file: MediaFile) => Promise<EpisodeMediaProbe>;
  readonly createArchive?: (
    stagingDirectory: string,
    packName: string,
    zipPath: string
  ) => Promise<void>;
}

export class EpisodeReviewPackError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EpisodeReviewPackError";
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  return sha256(await fs.readFile(filePath));
}

function mediaKind(filePath: string): MediaKind | null {
  const extension = path.extname(filePath).toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return null;
}

function isSecretBearingName(relativePath: string): boolean {
  const name = path.basename(relativePath).toLowerCase();
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    /(?:^|[._-])(?:credential|oauth|private-key|secret)(?:[._-]|$)/u.test(name)
  );
}

function sanitizeText(value: string): {
  readonly text: string;
  readonly redactions: number;
} {
  let redactions = 0;
  let text = value.replace(
    /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/gu,
    () => {
      redactions += 1;
      return "[REDACTED_PRIVATE_KEY]";
    }
  );
  text = text.replace(/\b(?:sk|rk|pk)[_-][A-Za-z0-9]{20,}/gu, () => {
    redactions += 1;
    return "[REDACTED_SECRET]";
  });
  text = text.replace(
    /\b(password|secret|api[_-]?key|client[_-]?secret)\s*([:=])\s*(["'])([^"'\r\n]+)\3/giu,
    (_match, name: string, separator: string, quote: string) => {
      redactions += 1;
      return `${name}${separator}${quote}[REDACTED_SECRET]${quote}`;
    }
  );
  return { text, redactions };
}

async function discoverEpisodeFiles(
  episodeFolder: string,
  maxFileBytes: number,
  maxPackBytes: number
): Promise<{
  readonly included: readonly IncludedFile[];
  readonly media: readonly MediaFile[];
  readonly exclusions: readonly Exclusion[];
}> {
  const included: IncludedFile[] = [];
  const media: MediaFile[] = [];
  const exclusions: Exclusion[] = [];
  let selectedBytes = 0;

  const visit = async (relativeDirectory: string): Promise<void> => {
    const absoluteDirectory = path.join(episodeFolder, relativeDirectory);
    const entries = (
      await fs.readdir(absoluteDirectory, { withFileTypes: true })
    ).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = toPosix(path.join(relativeDirectory, entry.name));
      const absolutePath = path.join(episodeFolder, relativePath);
      if (entry.isSymbolicLink()) {
        exclusions.push({
          path: relativePath,
          reason: "symbolic link excluded",
        });
        continue;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) {
          exclusions.push({
            path: `${relativePath}/`,
            reason:
              "generated, cache, dependency, or review directory excluded",
          });
          continue;
        }
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile()) {
        exclusions.push({
          path: relativePath,
          reason: "non-regular filesystem entry excluded",
        });
        continue;
      }
      const stat = await fs.stat(absolutePath);
      const kind = mediaKind(relativePath);
      if (kind !== null) {
        media.push({ absolutePath, relativePath, sizeBytes: stat.size, kind });
        exclusions.push({
          path: relativePath,
          reason: `${kind} payload replaced by ffprobe metadata`,
        });
        continue;
      }
      if (isSecretBearingName(relativePath)) {
        exclusions.push({
          path: relativePath,
          reason: "potential credential file excluded",
        });
        continue;
      }
      if (
        EXCLUDED_ARCHIVE_EXTENSIONS.has(
          path.extname(relativePath).toLowerCase()
        )
      ) {
        exclusions.push({
          path: relativePath,
          reason: "archive or database excluded",
        });
        continue;
      }
      if (stat.size > maxFileBytes) {
        exclusions.push({
          path: relativePath,
          reason: `file exceeds max-file-bytes (${stat.size})`,
        });
        continue;
      }
      if (selectedBytes + stat.size > maxPackBytes) {
        exclusions.push({
          path: relativePath,
          reason: "pack byte budget exhausted",
        });
        continue;
      }
      selectedBytes += stat.size;
      included.push({ absolutePath, relativePath, sizeBytes: stat.size });
    }
  };

  await visit("");
  return {
    included: included.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    ),
    media: media.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    ),
    exclusions: exclusions.sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function selectedString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeProbe(file: MediaFile, raw: unknown): EpisodeMediaProbe {
  const root = asRecord(raw);
  if (root === null)
    throw new EpisodeReviewPackError(
      `ffprobe returned a non-object for ${file.relativePath}`
    );
  const rawFormat = asRecord(root["format"]);
  const format: Record<string, string | number> = {};
  if (rawFormat !== null) {
    for (const key of ["format_name", "format_long_name"] as const) {
      const value = selectedString(rawFormat, key);
      if (value !== undefined) format[key] = value;
    }
    for (const key of ["start_time", "duration", "bit_rate"] as const) {
      const value = finiteNumber(rawFormat[key]);
      if (value !== undefined) format[key] = value;
    }
  }
  const rawStreams = Array.isArray(root["streams"]) ? root["streams"] : [];
  const streams = rawStreams.flatMap(
    (entry): readonly Readonly<Record<string, unknown>>[] => {
      const stream = asRecord(entry);
      if (stream === null) return [];
      const normalized: Record<string, unknown> = {};
      for (const key of [
        "index",
        "codec_name",
        "codec_long_name",
        "profile",
        "codec_type",
        "codec_tag_string",
        "width",
        "height",
        "pix_fmt",
        "r_frame_rate",
        "avg_frame_rate",
        "sample_rate",
        "channels",
        "channel_layout",
        "bits_per_sample",
        "duration",
        "bit_rate",
      ] as const) {
        const value = stream[key];
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          normalized[key] = value;
        }
      }
      const tags = asRecord(stream["tags"]);
      if (tags !== null) {
        const selectedTags = Object.fromEntries(
          ["language", "title", "handler_name"].flatMap((key) => {
            const value = selectedString(tags, key);
            return value === undefined ? [] : [[key, value] as const];
          })
        );
        if (Object.keys(selectedTags).length > 0)
          normalized["tags"] = selectedTags;
      }
      const disposition = asRecord(stream["disposition"]);
      if (disposition !== null) {
        normalized["disposition"] = Object.fromEntries(
          ["default", "forced", "attached_pic"].flatMap((key) => {
            const value = disposition[key];
            return typeof value === "number" || typeof value === "boolean"
              ? [[key, value] as const]
              : [];
          })
        );
      }
      return [normalized];
    }
  );
  return {
    path: file.relativePath,
    kind: file.kind,
    sizeBytes: file.sizeBytes,
    status: "probed",
    format,
    streams,
  };
}

async function defaultFfprobeVersion(): Promise<string> {
  try {
    const result = await execFileAsync("ffprobe", ["-version"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    return (
      result.stdout.split(/\r?\n/u)[0]?.trim() || "ffprobe version unavailable"
    );
  } catch (error) {
    throw new EpisodeReviewPackError(
      `ffprobe is required to build an episode review pack: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function defaultProbeMedia(file: MediaFile): Promise<EpisodeMediaProbe> {
  try {
    const result = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=format_name,format_long_name,start_time,duration,bit_rate:stream=index,codec_name,codec_long_name,profile,codec_type,codec_tag_string,width,height,pix_fmt,r_frame_rate,avg_frame_rate,sample_rate,channels,channel_layout,bits_per_sample,duration,bit_rate:stream_tags=language,title,handler_name:stream_disposition=default,forced,attached_pic",
        "-of",
        "json",
        file.absolutePath,
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 }
    );
    return normalizeProbe(file, JSON.parse(result.stdout));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      path: file.relativePath,
      kind: file.kind,
      sizeBytes: file.sizeBytes,
      status: "failed",
      error: message
        .replaceAll(file.absolutePath, file.relativePath)
        .slice(0, 2_000),
    };
  }
}

async function mapBounded<T, R>(
  values: readonly T[],
  concurrency: number,
  work: (value: T) => Promise<R>
): Promise<readonly R[]> {
  const results: R[] = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values[index];
        if (value !== undefined) results[index] = await work(value);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function defaultCreateArchive(
  stagingDirectory: string,
  packName: string,
  zipPath: string
): Promise<void> {
  await execFileAsync("zip", ["-X", "-q", "-r", zipPath, packName], {
    cwd: stagingDirectory,
    maxBuffer: 8 * 1024 * 1024,
  });
  await execFileAsync("unzip", ["-t", zipPath], { maxBuffer: 8 * 1024 * 1024 });
  const listing = (
    await execFileAsync("unzip", ["-Z1", zipPath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    })
  ).stdout.split(/\r?\n/u);
  if (
    !listing.includes(`${packName}/manifest.json`) ||
    !listing.includes(`${packName}/media/ffprobe.json`)
  ) {
    throw new EpisodeReviewPackError(
      "ZIP validation failed: required review-pack files are missing."
    );
  }
}

function mediaMarkdown(probes: readonly EpisodeMediaProbe[]): string {
  const lines = [
    "# Media inventory",
    "",
    "Audio and video payloads are intentionally absent. This file summarizes normalized ffprobe evidence.",
    "",
    "| Path | Kind | Bytes | Duration (s) | Streams | Status |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  ];
  for (const probe of probes) {
    const duration = probe.format?.["duration"];
    lines.push(
      `| \`${probe.path.replaceAll("|", "\\|")}\` | ${probe.kind} | ${probe.sizeBytes} | ${typeof duration === "number" ? duration : "unknown"} | ${probe.streams?.length ?? 0} | ${probe.status} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function reviewInstructions(): string {
  return [
    "# ChatGPT review instructions",
    "",
    "Treat episode files as primary evidence. Cross-check generated summaries against manifests, scripts, plans, QA artifacts, and provider records.",
    "",
    "Audio and video binaries were deliberately excluded. Use `media/ffprobe.json` for exact normalized stream/container metadata and `media/ffprobe.md` for a compact index.",
    "",
    "When reviewing, distinguish intended behavior from actual artifacts, flag missing evidence as uncertain, check locale and variant differences, and never infer media quality that ffprobe cannot establish (for example intelligibility, visual composition, or subjective pacing).",
    "",
  ].join("\n");
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new EpisodeReviewPackError(
      `${optionName} must be a positive integer.`
    );
  }
  return parsed;
}

export async function buildEpisodeReviewPack(
  options: EpisodeReviewPackOptions,
  runtime: EpisodeReviewPackRuntime = {}
): Promise<EpisodeReviewPackResult> {
  const episodeFolder = path.resolve(options.episodeFolder);
  const stat = await fs.stat(episodeFolder).catch(() => null);
  if (stat === null || !stat.isDirectory()) {
    throw new EpisodeReviewPackError(
      `Episode folder does not exist or is not a directory: ${episodeFolder}`
    );
  }
  const episodeId = path.basename(episodeFolder);
  if (
    episodeId.length === 0 ||
    episodeFolder === path.parse(episodeFolder).root
  ) {
    throw new EpisodeReviewPackError(
      "The episode folder must be a specific directory, not a filesystem root."
    );
  }
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxPackBytes = options.maxPackBytes ?? DEFAULT_MAX_PACK_BYTES;
  const probeConcurrency =
    options.probeConcurrency ?? DEFAULT_PROBE_CONCURRENCY;
  if (
    ![maxFileBytes, maxPackBytes, probeConcurrency].every(
      (value) => Number.isSafeInteger(value) && value > 0
    )
  ) {
    throw new EpisodeReviewPackError(
      "Pack size limits and probe concurrency must be positive integers."
    );
  }

  const discovery = await discoverEpisodeFiles(
    episodeFolder,
    maxFileBytes,
    maxPackBytes
  );
  const ffprobeVersion =
    discovery.media.length === 0
      ? "not invoked (no recognized media files)"
      : await (runtime.ffprobeVersion ?? defaultFfprobeVersion)();
  const probes = await mapBounded(
    discovery.media,
    probeConcurrency,
    runtime.probeMedia ?? defaultProbeMedia
  );
  const generatedAt = (runtime.now?.() ?? new Date()).toISOString();
  const stamp = generatedAt.replace(/[-:.]/gu, "");
  const safeEpisodeId =
    episodeId.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "") ||
    "episode";
  const packName = `${safeEpisodeId}-chatgpt-review-${stamp}`;
  const reviewsDirectory = path.join(path.dirname(episodeFolder), "reviews");
  const zipPath = path.join(reviewsDirectory, `${packName}.zip`);
  await fs.mkdir(reviewsDirectory, { recursive: true });
  const stagingDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediaforge-episode-review-pack-")
  );
  const packDirectory = path.join(stagingDirectory, packName);
  await fs.mkdir(path.join(packDirectory, "episode"), { recursive: true });
  await fs.mkdir(path.join(packDirectory, "media"), { recursive: true });

  try {
    const fileIndex: Array<{
      path: string;
      sizeBytes: number;
      sha256: string;
      redactions: number;
    }> = [];
    let redactionCount = 0;
    for (const file of discovery.included) {
      const target = path.join(packDirectory, "episode", file.relativePath);
      const relativeTarget = path.relative(
        path.join(packDirectory, "episode"),
        target
      );
      if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
        throw new EpisodeReviewPackError(
          `Unsafe episode-relative path: ${file.relativePath}`
        );
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      let fileRedactions = 0;
      if (TEXT_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase())) {
        const sanitized = sanitizeText(
          await fs.readFile(file.absolutePath, "utf8")
        );
        fileRedactions = sanitized.redactions;
        redactionCount += fileRedactions;
        await fs.writeFile(target, sanitized.text, "utf8");
      } else {
        await fs.copyFile(file.absolutePath, target);
      }
      fileIndex.push({
        path: `episode/${file.relativePath}`,
        sizeBytes: (await fs.stat(target)).size,
        sha256: await sha256File(target),
        redactions: fileRedactions,
      });
    }

    const probeFailures = probes.filter(
      (probe) => probe.status === "failed"
    ).length;
    await fs.writeFile(
      path.join(packDirectory, "media", "ffprobe.json"),
      `${JSON.stringify(
        {
          schemaVersion: "episode-review-media.v1",
          ffprobeVersion,
          mediaPayloadsIncluded: false,
          files: probes,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(packDirectory, "media", "ffprobe.md"),
      mediaMarkdown(probes),
      "utf8"
    );
    await fs.writeFile(
      path.join(packDirectory, "REVIEW-INSTRUCTIONS.md"),
      reviewInstructions(),
      "utf8"
    );
    await fs.writeFile(
      path.join(packDirectory, "README.md"),
      [
        "# Episode ChatGPT review pack",
        "",
        `- Episode: \`${episodeId}\``,
        `- Generated at: \`${generatedAt}\``,
        `- Included episode files: \`${fileIndex.length}\``,
        `- Audio/video files represented by ffprobe: \`${probes.length}\``,
        `- Media probe failures: \`${probeFailures}\``,
        `- Excluded files/directories: \`${discovery.exclusions.length}\``,
        `- Packed-content redactions: \`${redactionCount}\``,
        "- Audio/video payloads included: `false`",
        "",
        "Start with `REVIEW-INSTRUCTIONS.md`, then inspect `manifest.json`, episode evidence under `episode/`, and normalized media evidence under `media/`.",
        "",
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(
      path.join(packDirectory, "manifest.json"),
      `${JSON.stringify(
        {
          schemaVersion: "episode-chatgpt-review-pack.v1",
          generatorVersion: "1.0.0",
          generatedAt,
          episodeId,
          mediaPayloadsIncluded: false,
          limits: { maxFileBytes, maxPackBytes, probeConcurrency },
          summary: {
            includedFiles: fileIndex.length,
            mediaFilesProbed: probes.length,
            mediaProbeFailures: probeFailures,
            excludedFiles: discovery.exclusions.length,
            redactionCount,
          },
          files: fileIndex,
          media: probes.map((probe) => ({
            path: probe.path,
            kind: probe.kind,
            sizeBytes: probe.sizeBytes,
            status: probe.status,
          })),
          exclusions: discovery.exclusions,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await (runtime.createArchive ?? defaultCreateArchive)(
      stagingDirectory,
      packName,
      zipPath
    );
    const zipBytes = (await fs.stat(zipPath)).size;
    return {
      status: probeFailures === 0 ? "READY" : "PARTIAL",
      episodeId,
      zipPath,
      zipSha256: await sha256File(zipPath),
      zipBytes,
      includedFiles: fileIndex.length,
      mediaFilesProbed: probes.length,
      mediaProbeFailures: probeFailures,
      excludedFiles: discovery.exclusions.length,
      redactionCount,
    };
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }
}

export function registerEpisodeReviewPackCommand(episode: Command): void {
  episode
    .command("review-pack")
    .description(
      "Create a ChatGPT-ready episode ZIP without audio/video payloads"
    )
    .argument("<episode-folder>", "path to the episode folder")
    .option(
      "--max-file-bytes <bytes>",
      "maximum included non-media file size",
      String(DEFAULT_MAX_FILE_BYTES)
    )
    .option(
      "--max-pack-bytes <bytes>",
      "maximum selected non-media bytes",
      String(DEFAULT_MAX_PACK_BYTES)
    )
    .option(
      "--probe-concurrency <count>",
      "maximum concurrent ffprobe processes",
      String(DEFAULT_PROBE_CONCURRENCY)
    )
    .option("--json", "emit machine-readable result")
    .action(
      async (
        episodeFolder: string,
        commandOptions: {
          maxFileBytes: string;
          maxPackBytes: string;
          probeConcurrency: string;
          json?: boolean;
        }
      ) => {
        const result = await buildEpisodeReviewPack({
          episodeFolder,
          maxFileBytes: parsePositiveInteger(
            commandOptions.maxFileBytes,
            "--max-file-bytes"
          ),
          maxPackBytes: parsePositiveInteger(
            commandOptions.maxPackBytes,
            "--max-pack-bytes"
          ),
          probeConcurrency: parsePositiveInteger(
            commandOptions.probeConcurrency,
            "--probe-concurrency"
          ),
        });
        const rootJson = episode.parent?.opts<{ readonly json?: boolean }>()
          .json;
        if (commandOptions.json ?? rootJson) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }
        process.stdout.write(
          [
            `Episode review pack: ${result.status}`,
            `Episode: ${result.episodeId}`,
            `ZIP: ${result.zipPath}`,
            `SHA-256: ${result.zipSha256}`,
            `Included files: ${result.includedFiles}`,
            `Media probed: ${result.mediaFilesProbed}; failures: ${result.mediaProbeFailures}`,
            `Excluded: ${result.excludedFiles}; redactions: ${result.redactionCount}`,
          ].join("\n") + "\n"
        );
      }
    );
}
