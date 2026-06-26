import fs from "node:fs/promises";
import path from "node:path";
import { StorySourceParseError } from "./story-localization.errors.js";
import { sourceMetadataBlockSchema, sourceStoryFileSchema } from "./story-localization.schemas.js";
import { normalizeWhitespace, hashText } from "@mediaforge/shared";
import { normalizeParagraphs } from "./story-localization.utils.js";
import { type ParsedSourceStory } from "./story-localization.types.js";

const h1Pattern = /^#\s+Episode\s+(?<episodeNumber>\d{3})\s+[—-]\s+(?<title>.+)$/u;
const sectionPattern = /^#{1,3}\s+(?<name>.+)$/u;

function parseKeyValueLine(line: string): [string, string] | null {
  const match = /^\*\*(.+?)\*\*:\s*(.+)$/u.exec(line) ?? /^(.+?):\s*(.+)$/u.exec(line);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return [normalizeWhitespace(match[1]).toLowerCase(), normalizeWhitespace(match[2])];
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/(?:,|\n)/u)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0);
}

function splitSections(lines: readonly string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current = "preamble";
  sections.set(current, []);
  for (const line of lines) {
    const match = sectionPattern.exec(line);
    if (match?.groups?.["name"]) {
      current = normalizeWhitespace(match.groups["name"]);
      sections.set(current, []);
      continue;
    }
    sections.get(current)?.push(line);
  }
  return sections;
}

function pickMetadataTitle(metadata: Record<string, string>, fallback: string): string {
  return metadata["primary title"] ?? metadata["title"] ?? fallback;
}

export async function parseCanonicalSourceStory(sourceFile: string): Promise<ParsedSourceStory> {
  try {
    const content = await fs.readFile(sourceFile, "utf8");
    const normalized = content.replace(/\r\n/gu, "\n");
    const lines = normalized.split("\n");
    const fileName = path.basename(sourceFile);
    const titleLine = lines.find((line) => /^#\s+Episode\b/u.test(line));
    const titleMatch = titleLine ? h1Pattern.exec(titleLine) : null;
    if (!titleMatch?.groups?.["episodeNumber"] || !titleMatch.groups["title"]) {
      throw new Error("Missing or malformed episode title heading.");
    }
    const episodeNumber = titleMatch.groups["episodeNumber"];
    const title = normalizeWhitespace(titleMatch.groups["title"]);
    const sections = splitSections(lines);
    const narrationSection = sections.get("Narration Script") ?? sections.get("Narration") ?? [];
    const metadataSection = sections.get("Episode Metadata") ?? [];
    if (narrationSection.length === 0 || metadataSection.length === 0) {
      throw new Error("Missing required narration or metadata section.");
    }
    const audioSection = sections.get("Audio Generation Instructions") ?? [];
    const narrationParagraphs = normalizeParagraphs(
      narrationSection
        .filter((line) => !/^#{1,6}\s+/u.test(line) && !/^-{3,}\s*$/u.test(line.trim()))
        .join("\n")
    );
    if (narrationParagraphs.length === 0) {
      throw new Error("No narration text found.");
    }
    const metadataPairs = new Map<string, string>();
    for (const line of metadataSection) {
      const pair = parseKeyValueLine(line);
      if (pair) {
        metadataPairs.set(pair[0], pair[1]);
      }
    }
    const metadata = sourceMetadataBlockSchema.parse({
      episodeNumber,
      primaryTitle: pickMetadataTitle(Object.fromEntries(metadataPairs), title),
      ...(metadataPairs.get("source title") ? { sourceTitle: metadataPairs.get("source title") } : {}),
      audioInstructions: audioSection
        .map((line) => normalizeWhitespace(line.replace(/^\s*[-*]\s+/u, "")))
        .filter((line) => line.length > 0),
      ...(metadataPairs.get("sound motif") ? { soundMotif: metadataPairs.get("sound motif") } : {}),
      ...(metadataPairs.get("thumbnail text") ? { thumbnailText: metadataPairs.get("thumbnail text") } : {}),
      ...(metadataPairs.get("seo description") ? { seoDescription: metadataPairs.get("seo description") } : {}),
      tags: parseStringArray(metadataPairs.get("tags")),
      hashtags: parseStringArray(metadataPairs.get("hashtags")),
      ...(metadataPairs.get("narration wpm")
        ? { narrationWpm: Number.parseInt(metadataPairs.get("narration wpm") ?? "", 10) }
        : {}),
      ...(metadataPairs.get("content disclosure")
        ? { contentDisclosure: metadataPairs.get("content disclosure") }
        : {}),
      ...(metadataPairs.get("visual direction")
        ? { visualDirection: metadataPairs.get("visual direction") }
        : {}),
    });
    const parsed = sourceStoryFileSchema.parse({
      language: "en",
      title,
      episodeNumber,
      slug: fileName.replace(/-en-full\.md$/u, ""),
      narrationParagraphs,
      metadata,
    });
    const parsedMetadata: ParsedSourceStory["metadata"] = {
      episodeNumber: parsed.episodeNumber,
      primaryTitle: parsed.metadata.primaryTitle,
      audioInstructions: parsed.metadata.audioInstructions,
      narration: parsed.narrationParagraphs,
      tags: parsed.metadata.tags,
      hashtags: parsed.metadata.hashtags,
      ...(parsed.metadata.sourceTitle ? { sourceTitle: parsed.metadata.sourceTitle } : {}),
      ...(parsed.metadata.soundMotif ? { soundMotif: parsed.metadata.soundMotif } : {}),
      ...(parsed.metadata.thumbnailText ? { thumbnailText: parsed.metadata.thumbnailText } : {}),
      ...(parsed.metadata.seoDescription ? { seoDescription: parsed.metadata.seoDescription } : {}),
      ...(parsed.metadata.narrationWpm !== undefined ? { narrationWpm: parsed.metadata.narrationWpm } : {}),
      ...(parsed.metadata.contentDisclosure ? { contentDisclosure: parsed.metadata.contentDisclosure } : {}),
      ...(parsed.metadata.visualDirection ? { visualDirection: parsed.metadata.visualDirection } : {}),
    };
    return {
      language: "en",
      sourceFile,
      sourceHash: hashText(content),
      episodeNumber: parsed.episodeNumber,
      slug: parsed.slug,
      title: parsed.title,
      ...(parsed.metadata.sourceTitle ? { sourceTitle: parsed.metadata.sourceTitle } : {}),
      audioInstructions: parsed.metadata.audioInstructions,
      ...(parsed.metadata.soundMotif ? { soundMotif: parsed.metadata.soundMotif } : {}),
      narrationParagraphs: parsed.narrationParagraphs,
      metadata: parsedMetadata,
      content,
    };
  } catch (error) {
    throw new StorySourceParseError(`Unable to parse canonical source story ${sourceFile}.`, error);
  }
}

export function sourceStoryContentHash(content: string): string {
  return hashText(content);
}
