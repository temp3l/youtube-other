import path from "node:path";
import fs from "node:fs/promises";
import { contentHash, ensureDir, fileExists, hashFile, hashText, normalizeWhitespace, splitIntoWords, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";

export function getRepoRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}

export function resolveRepoPath(...segments: readonly string[]): string {
  return path.resolve(getRepoRoot(), ...segments);
}

export function toPosixRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}

export function sha256Text(value: string): string {
  return hashText(value);
}

export function sha256Config(parts: ReadonlyArray<string>): string {
  return contentHash(parts);
}

export function shouldIncludeTemperatureForModel(model: string): boolean {
  return !model.trim().toLowerCase().startsWith("gpt-5");
}

export function countWords(text: string): number {
  if (text.trim().length === 0) {
    return 0;
  }
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) {
        count += 1;
      }
    }
    return count;
  }
  return splitIntoWords(text).length;
}

export function estimateDurationSeconds(wordCount: number, wordsPerMinute: number): number {
  return Math.max(0, (wordCount / Math.max(1, wordsPerMinute)) * 60);
}

export function normalizeParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/gu, "\n")
    .split(/\n{2,}/u)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length > 0);
}

export async function writeTextAtomicIfChanged(filePath: string, value: string, force: boolean): Promise<"written" | "skipped"> {
  const existing = await fileExists(filePath) ? await fs.readFile(filePath, "utf8") : null;
  if (existing !== null && existing === value) {
    return "skipped";
  }
  if (existing !== null && !force) {
    return "skipped";
  }
  await writeTextAtomic(filePath, value);
  return "written";
}

export async function writeJsonAtomicIfChanged(filePath: string, value: unknown, force: boolean): Promise<"written" | "skipped"> {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  return writeTextAtomicIfChanged(filePath, next, force);
}

export async function copyFileAtomicIfChanged(sourceFile: string, targetFile: string, force: boolean): Promise<"written" | "skipped"> {
  if (await fileExists(targetFile)) {
    const [sourceHash, targetHash] = await Promise.all([hashFile(sourceFile), hashFile(targetFile)]);
    if (sourceHash === targetHash) {
      return "skipped";
    }
    if (!force) {
      return "skipped";
    }
  }
  const dir = path.dirname(targetFile);
  await ensureDir(dir);
  const tempPath = path.join(dir, `${path.basename(targetFile)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.copyFile(sourceFile, tempPath);
    await fs.rename(tempPath, targetFile);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => void 0);
    throw error;
  }
  return "written";
}
