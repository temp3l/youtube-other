import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ensureDir, fileExists, hashText, readJsonIfExists, writeJsonAtomic } from "@mediaforge/shared";
import { type CanonicalStoryFacts, type LanguageCode, type StoryLocalizationCacheEntry } from "./story-localization.types.js";

const cacheEntrySchema = z.object({
  sourceFile: z.string().min(1),
  sourceHash: z.string().min(64),
  configurationHash: z.string().min(64),
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  language: z.enum(["en", "de", "es", "fr", "pt"]),
  generatedAt: z.string().min(1),
  outputFiles: z.array(z.string().min(1)),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});

const factsCacheSchema = z.object({
  sourceHash: z.string().min(64),
  facts: z.record(z.string(), z.unknown()),
  generatedAt: z.string().min(1),
});

export function resolveCacheDirectory(outputDirectory: string): string {
  return path.join(outputDirectory, ".localization-cache");
}

function entryPath(cacheDirectory: string, sourceHash: string, configurationHash: string): string {
  return path.join(cacheDirectory, "entries", `${sourceHash}.${configurationHash}.json`);
}

function factsPath(cacheDirectory: string, sourceHash: string): string {
  return path.join(cacheDirectory, "facts", `${sourceHash}.json`);
}

export async function readLocalizationCacheEntry(
  cacheDirectory: string,
  sourceHash: string,
  configurationHash: string
): Promise<StoryLocalizationCacheEntry | null> {
  const raw = await readJsonIfExists(entryPath(cacheDirectory, sourceHash, configurationHash), (value) =>
    cacheEntrySchema.parse(value) as StoryLocalizationCacheEntry
  );
  return raw;
}

export async function writeLocalizationCacheEntry(
  cacheDirectory: string,
  entry: StoryLocalizationCacheEntry
): Promise<void> {
  await ensureDir(path.dirname(entryPath(cacheDirectory, entry.sourceHash, entry.configurationHash)));
  await writeJsonAtomic(entryPath(cacheDirectory, entry.sourceHash, entry.configurationHash), entry);
}

export async function readCanonicalFactsCache(
  cacheDirectory: string,
  sourceHash: string
): Promise<CanonicalStoryFacts | null> {
  const raw = await readJsonIfExists(factsPath(cacheDirectory, sourceHash), (value) =>
    factsCacheSchema.parse(value)
  );
  return raw ? (raw.facts as unknown as CanonicalStoryFacts) : null;
}

export async function writeCanonicalFactsCache(
  cacheDirectory: string,
  sourceHash: string,
  facts: CanonicalStoryFacts
): Promise<void> {
  await ensureDir(path.dirname(factsPath(cacheDirectory, sourceHash)));
  await writeJsonAtomic(factsPath(cacheDirectory, sourceHash), {
    sourceHash,
    facts,
    generatedAt: new Date().toISOString(),
  });
}

export function buildConfigurationHash(parts: ReadonlyArray<string>): string {
  return hashText(parts.join("\u0000"));
}
