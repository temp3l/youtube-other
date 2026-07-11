import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, normalizeWhitespace } from "@mediaforge/shared";

export type ScriptMarkdownVariant = "full" | "short";

const localizedScriptPath = (
  language: string,
  variant: ScriptMarkdownVariant = "full"
): string =>
  variant === "short"
    ? path.join("languages", "short", `script-${language}.md`)
    : path.join("languages", `script-${language}.md`);
const maxSpeechChunkCharacters = 3200;

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

function extractMarkdownSection(text: string, sectionHeading: string): string | null {
  const normalized = text.replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  const target = normalizeWhitespace(sectionHeading).toLowerCase();
  const targets = new Set([
    target,
    ...(target === "narration script"
      ? [
          "sprechtext",
          "guion de narración",
          "guion de narracion",
          "texte de narration",
          "roteiro de narração",
          "roteiro de narracao",
          "texto da narração",
          "texto da narracao",
        ]
      : []),
  ]);
  let matched = false;
  const collected: string[] = [];
  for (const line of lines) {
    const headingMatch = /^#{1,6}\s+(.+)$/u.exec(line);
    if (headingMatch) {
      const heading = normalizeWhitespace(headingMatch[1] ?? "").toLowerCase();
      if (matched && heading.length > 0 && !targets.has(heading)) {
        break;
      }
      matched = targets.has(heading);
      continue;
    }
    if (matched) {
      collected.push(line);
    }
  }
  if (!matched) {
    return null;
  }
  return collected.join("\n").trim();
}

export async function loadEpisodeScriptMarkdown(
  episodeDir: string,
  language?: string,
  sectionHeading?: string,
  variant: ScriptMarkdownVariant = "full"
): Promise<{ readonly filePath: string; readonly text: string }> {
  if (!language) {
    throw new Error(
      `Missing script language for ${episodeDir}. Pass an explicit language and use languages/script-<language>.md.`
    );
  }
  const languageSlug = language.toLowerCase();
  const candidate = path.join(episodeDir, localizedScriptPath(languageSlug, variant));
  if (await fileExists(candidate)) {
    const text = await fs.readFile(candidate, "utf8");
    const sectionText =
      sectionHeading !== undefined
        ? extractMarkdownSection(text, sectionHeading)
        : null;
    if (
      sectionHeading !== undefined &&
      sectionText === null &&
      /^#{1,6}\s+/mu.test(text)
    ) {
      throw new Error(
        `Missing required Markdown section "${sectionHeading}" in ${candidate}; refusing to send headings, metadata, or production notes to TTS.`
      );
    }
    return {
      filePath: candidate,
      text: sectionText ?? text,
    };
  }
  const available = await listEpisodeScriptLanguages(episodeDir);
  throw new Error(
    `Missing localized script markdown for language "${language}" variant "${variant}" in ${episodeDir}. Expected ${localizedScriptPath(languageSlug, variant)}. Available languages: ${available.length > 0 ? available.join(", ") : "none"}`
  );
}

export async function listEpisodeScriptLanguages(episodeDir: string): Promise<string[]> {
  const languagesDir = path.join(episodeDir, "languages");
  const entries = await fs.readdir(languagesDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .map((name) => name.match(/^script-([a-z0-9-]+)\.md$/iu)?.[1] ?? "")
    .filter((language) => language.length > 0)
    .sort();
}

export function splitEpisodeScriptMarkdown(text: string): string[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/u)
    .map((block) => stripMarkdown(block))
    .map((block) => block.replace(/\n+/gu, " "))
    .map((block) => normalizeWhitespace(block))
    .filter((block) => block.length > 0);

  const sourceBlocks = blocks.length > 0 ? blocks : [normalizeWhitespace(stripMarkdown(text))].filter((block) => block.length > 0);
  const chunks: string[] = [];

  const pushChunk = (chunk: string): void => {
    const normalized = normalizeWhitespace(chunk);
    if (normalized.length > 0) {
      chunks.push(normalized);
    }
  };

  for (const block of sourceBlocks) {
    if (block.length <= maxSpeechChunkCharacters) {
      pushChunk(block);
      continue;
    }

    const sentences = block.split(/(?<=[.!?…]["'»”)]*)\s+/u).map((sentence) => normalizeWhitespace(sentence)).filter((sentence) => sentence.length > 0);
    let buffer = "";

    for (const sentence of sentences.length > 0 ? sentences : [block]) {
      if (sentence.length > maxSpeechChunkCharacters) {
        if (buffer.length > 0) {
          pushChunk(buffer);
          buffer = "";
        }
        let remaining = sentence;
        while (remaining.length > maxSpeechChunkCharacters) {
          let splitAt = remaining.lastIndexOf(" ", maxSpeechChunkCharacters);
          if (splitAt <= 0) {
            splitAt = maxSpeechChunkCharacters;
          }
          pushChunk(remaining.slice(0, splitAt));
          remaining = normalizeWhitespace(remaining.slice(splitAt));
        }
        buffer = remaining;
        continue;
      }

      const candidate = buffer.length > 0 ? `${buffer} ${sentence}` : sentence;
      if (candidate.length > maxSpeechChunkCharacters) {
        pushChunk(buffer);
        buffer = sentence;
      } else {
        buffer = candidate;
      }
    }

    pushChunk(buffer);
  }

  return chunks;
}
