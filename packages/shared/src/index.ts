import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function ensureWorkspacePath(workspaceDir: string, candidate: string): string {
  const resolvedWorkspace = path.resolve(workspaceDir);
  const resolvedCandidate = path.resolve(candidate);
  if (!resolvedCandidate.startsWith(resolvedWorkspace + path.sep) && resolvedCandidate !== resolvedWorkspace) {
    throw new Error(`Path escapes workspace: ${candidate}`);
  }
  return resolvedCandidate;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  return fs.readFile(filePath, "utf8");
}

export async function readJsonIfExists<T>(filePath: string, parser: (value: unknown) => T): Promise<T | null> {
  const raw = await readTextIfExists(filePath);
  if (raw === null) {
    return null;
  }
  return parser(JSON.parse(raw) as unknown);
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
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

export async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tempPath, value, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => void 0);
    throw error;
  }
}

export async function writeBinaryAtomic(filePath: string, value: Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tempPath, value);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => void 0);
    throw error;
  }
}

export async function copyAtomic(sourcePath: string, targetPath: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await ensureDir(dir);
  const tempPath = path.join(dir, `${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.copyFile(sourcePath, tempPath);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => void 0);
    throw error;
  }
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      const { bytesRead } = await stream.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await stream.close();
  }
  return hash.digest("hex");
}

export function hashText(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeTimestampToken(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join("");
}

export function formatTimestampLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remaining = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export function secondsToSrtTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  const wholeSeconds = Math.floor(remaining);
  const millis = Math.round((remaining - wholeSeconds) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export function secondsToVttTimestamp(seconds: number): string {
  return secondsToSrtTimestamp(seconds).replace(",", ".");
}

export function secondsToAssTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  const wholeSeconds = Math.floor(remaining);
  const centis = Math.round((remaining - wholeSeconds) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function buildSrt(entries: ReadonlyArray<{ startSeconds: number; endSeconds: number; text: string }>): string {
  return entries
    .map(
      (entry, index) =>
        `${index + 1}\n${secondsToSrtTimestamp(entry.startSeconds)} --> ${secondsToSrtTimestamp(entry.endSeconds)}\n${entry.text}\n`
    )
    .join("\n");
}

export function buildVtt(entries: ReadonlyArray<{ startSeconds: number; endSeconds: number; text: string }>): string {
  return `WEBVTT\n\n${entries
    .map(
      (entry) =>
        `${secondsToVttTimestamp(entry.startSeconds)} --> ${secondsToVttTimestamp(entry.endSeconds)}\n${entry.text}\n`
    )
    .join("\n")}`;
}

export function buildAss(entries: ReadonlyArray<{ startSeconds: number; endSeconds: number; text: string }>): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,80,80,80,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ];
  const events = entries.map(
    (entry) =>
      `Dialogue: 0,${secondsToAssTimestamp(entry.startSeconds)},${secondsToAssTimestamp(entry.endSeconds)},Default,,0,0,0,,${entry.text.replace(/\n/g, "\\N")}`
  );
  return [...header, ...events].join("\n");
}

export function safeBasename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function sceneFilename(sceneNumber: number, startSeconds: number, endSeconds: number, aspectRatio: "16:9" | "9:16"): string {
  return `scene-${String(sceneNumber).padStart(3, "0")}__${safeTimestampToken(startSeconds)}-${safeTimestampToken(endSeconds)}__${aspectRatio.replace(":", "x")}.png`;
}

export function averageWordsPerMinute(words: number, seconds: number): number {
  if (seconds <= 0) {
    return 0;
  }
  return (words / seconds) * 60;
}

export function splitIntoSentences(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return [];
  }
  return normalized.split(/(?<=[.!?])\s+/u).filter((part) => part.length > 0);
}

export function splitIntoWords(text: string): string[] {
  return normalizeWhitespace(text).split(/\s+/u).filter((part) => part.length > 0);
}

export function countSpokenWords(text: string): number {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return 0;
  }
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    let count = 0;
    for (const segment of segmenter.segment(normalized)) {
      if (segment.isWordLike) {
        count += 1;
      }
    }
    return count;
  }
  const fallbackPattern = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;
  return Array.from(normalized.matchAll(fallbackPattern)).length;
}

export function collapseRepeatedTokenRuns(
  text: string,
  options: {
    readonly minWindowTokens?: number;
    readonly maxWindowTokens?: number;
  } = {}
): string {
  const minWindowTokens = options.minWindowTokens ?? 3;
  const maxWindowTokens = options.maxWindowTokens ?? 48;
  const tokens = normalizeWhitespace(text).split(/\s+/u).filter((part) => part.length > 0);
  if (tokens.length < minWindowTokens * 2) {
    return normalizeWhitespace(text);
  }
  const output: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    let collapsed = false;
    const remaining = tokens.length - index;
    const maxWindow = Math.min(maxWindowTokens, Math.floor(remaining / 2));
    for (let windowSize = maxWindow; windowSize >= minWindowTokens; windowSize -= 1) {
      const candidate = tokens.slice(index, index + windowSize);
      if (candidate.length < minWindowTokens) {
        continue;
      }
      let repeatCount = 1;
      while (index + repeatCount * windowSize + windowSize <= tokens.length) {
        const left = tokens.slice(index + (repeatCount - 1) * windowSize, index + repeatCount * windowSize);
        const right = tokens.slice(index + repeatCount * windowSize, index + (repeatCount + 1) * windowSize);
        if (left.length !== windowSize || right.length !== windowSize) {
          break;
        }
        let matches = true;
        for (let tokenIndex = 0; tokenIndex < windowSize; tokenIndex += 1) {
          if (left[tokenIndex] !== right[tokenIndex]) {
            matches = false;
            break;
          }
        }
        if (!matches) {
          break;
        }
        repeatCount += 1;
      }
      if (repeatCount > 1) {
        output.push(...candidate);
        index += repeatCount * windowSize;
        collapsed = true;
        break;
      }
    }
    if (!collapsed) {
      const token = tokens[index];
      if (token) {
        output.push(token);
      }
      index += 1;
    }
  }
  return normalizeWhitespace(output.join(" "));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function contentHash(parts: ReadonlyArray<string>): string {
  return crypto.createHash("sha256").update(parts.join("\u0000"), "utf8").digest("hex");
}

export function unique<T>(values: ReadonlyArray<T>): T[] {
  return [...new Set(values)];
}

export function sortBy<T>(values: ReadonlyArray<T>, selector: (value: T) => number): T[] {
  return [...values].sort((left, right) => selector(left) - selector(right));
}

export function tempDir(): string {
  return os.tmpdir();
}

export * from "./episode-filesystem.js";
