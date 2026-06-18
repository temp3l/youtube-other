import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, normalizeWhitespace } from "@mediaforge/shared";
import { writeTextAtomic } from "@mediaforge/shared";

const fallbackScriptPaths = ["script.md", path.join("script", "rewritten-script.md")];

function stripMarkdown(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/\r\n/g, "\n")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
  );
}

export async function loadEpisodeScriptMarkdown(episodeDir: string): Promise<{ readonly filePath: string; readonly text: string }> {
  for (const relativePath of fallbackScriptPaths) {
    const candidate = path.join(episodeDir, relativePath);
    if (await fileExists(candidate)) {
      const text = await fs.readFile(candidate, "utf8");
      return { filePath: candidate, text };
    }
  }
  throw new Error(`Missing script markdown in ${episodeDir}. Expected ${fallbackScriptPaths.map((item) => `"${item}"`).join(" or ")}.`);
}

export function splitEpisodeScriptMarkdown(text: string): string[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/u)
    .map((block) => stripMarkdown(block))
    .map((block) => block.replace(/\n+/gu, " "))
    .map((block) => normalizeWhitespace(block))
    .filter((block) => block.length > 0);
  return blocks.length > 0 ? blocks : [normalizeWhitespace(stripMarkdown(text))].filter((block) => block.length > 0);
}

export async function writeEpisodeScriptMarkdown(episodeDir: string, text: string): Promise<string> {
  const targetPath = path.join(episodeDir, "audio", "script-source.md");
  await ensureDir(path.dirname(targetPath));
  await writeTextAtomic(targetPath, text);
  return targetPath;
}
