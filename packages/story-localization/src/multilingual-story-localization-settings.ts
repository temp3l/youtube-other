import fs from "node:fs";
import { resolveRepoPath } from "./story-localization.utils.js";

const settingsCache = new Map<string, string>();

const localeSectionHeadings = [
  ["en", "English Localization"],
  ["de", "German Localization"],
  ["es", "Spanish Localization"],
  ["fr", "French Localization"],
  ["pt", "Portuguese Localization"],
] as const;

function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

function resolveSectionHeading(locale: string): string {
  const normalized = normalizeLocale(locale);
  const primary = normalized.split("-", 1)[0];
  const entry = localeSectionHeadings.find(([code]) => code === primary);
  if (!entry) {
    throw new Error(`Unsupported locale for multilingual settings: ${locale}`);
  }
  return entry[1];
}

function extractSection(document: string, heading: string): string {
  const lines = document.split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (startIndex < 0) {
    throw new Error(`Missing locale settings section: ${heading}`);
  }
  const collected: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    if (index > startIndex && line.trim().startsWith("## ")) {
      break;
    }
    collected.push(line);
  }
  return collected.join("\n").trimEnd();
}

export function loadMultilingualStoryLocalizationSettings(locale: string): string {
  const heading = resolveSectionHeading(locale);
  const cacheKey = `${heading}`;
  const cached = settingsCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const filePath = resolveRepoPath("docs", "multilingual-story-localization-settings.md");
  const document = fs.readFileSync(filePath, "utf8").replace(/\r\n/gu, "\n");
  const section = extractSection(document, heading);
  settingsCache.set(cacheKey, section);
  return section;
}
