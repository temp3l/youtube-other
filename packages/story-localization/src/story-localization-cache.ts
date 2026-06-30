import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ensureDir, fileExists, hashText, readJsonIfExists, writeJsonAtomic } from "@mediaforge/shared";
import { stableSerialize } from "./stable-json.js";
import { resolveCanonicalEnglishFullPaths } from "./canonical-full-story.persistence.js";
import { type CanonicalStoryFacts, type LanguageCode, type StoryLocalizationCacheEntry } from "./story-localization.types.js";

const cacheEntrySchema = z.object({
  schemaVersion: z.literal("story-localization-cache-entry-v2").optional(),
  sourceFile: z.string().min(1),
  sourceHash: z.string().min(64),
  configurationHash: z.string().min(64),
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  language: z.enum(["en", "de", "es", "fr", "pt"]),
  locale: z.string().min(1).optional(),
  variant: z.enum(["full", "short"]).optional(),
  owner: z.literal("narration").optional(),
  generatedAt: z.string().min(1),
  outputFiles: z.array(z.string().min(1)),
  compilerVersion: z.string().min(1).optional(),
  promptFingerprint: z.string().min(1).optional(),
  responseSchemaName: z.string().min(1).optional(),
  responseSchemaVersion: z.string().min(1).optional(),
  responseSchemaFingerprint: z.string().min(1).optional(),
  parentArtifactFingerprint: z.string().min(1).optional(),
  canonicalFingerprint: z.string().min(1).optional(),
  parentArtifactSourceHash: z.string().min(1).optional(),
  parentArtifactStoryIrHash: z.string().min(1).optional(),
  parentArtifactContractHash: z.string().min(1).optional(),
  parentArtifactContractBuildFingerprint: z.string().min(1).optional(),
  parentArtifactLocale: z.string().min(1).optional(),
  parentArtifactVariant: z.literal("full").optional(),
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

export function resolveEpisodeCacheDirectory(
  outputDirectory: string,
  episodeSlug: string
): string {
  return path.join(outputDirectory, episodeSlug, ".localization-cache");
}

export function resolveEpisodeOutputDirectory(
  outputDirectory: string,
  episodeSlug: string
): string {
  return path.join(outputDirectory, episodeSlug);
}

export function resolveEpisodeStoryOutputFiles(
  outputDirectory: string,
  episodeSlug: string,
  language: LanguageCode
): {
  readonly episodeDir: string;
  readonly rootScript: string;
  readonly full: string;
  readonly short: string;
} {
  const episodeDir = resolveEpisodeOutputDirectory(outputDirectory, episodeSlug);
  const languageDir = path.join(episodeDir, language);
  if (language === "en") {
    const canonical = resolveCanonicalEnglishFullPaths(outputDirectory, episodeSlug);
    return {
      episodeDir,
      rootScript: canonical.rootCompatibilityMarkdownPath,
      full: canonical.canonicalMarkdownPath,
      short: path.join(languageDir, "short", "script.md"),
    };
  }
  return {
    episodeDir,
    rootScript: path.join(episodeDir, "script.md"),
    full: path.join(languageDir, "full", "script.md"),
    short: path.join(languageDir, "short", "script.md"),
  };
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

export interface StoryArtifactCacheKeyInput {
  readonly episodeSlug: string;
  readonly sourceHash: string;
  readonly language: LanguageCode;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly owner: "narration";
  readonly adaptationMode: string;
  readonly model: string;
  readonly temperature: number;
  readonly reasoningEffort: string;
  readonly promptVersion: string;
  readonly compilerVersion?: string;
  readonly promptFingerprint?: string;
  readonly responseSchemaName?: string;
  readonly responseSchemaVersion?: string;
  readonly responseSchemaFingerprint?: string;
  readonly parentFingerprint?: string;
  readonly parentSourceHash?: string;
  readonly parentStoryIrHash?: string;
  readonly parentContractHash?: string;
  readonly parentLocale?: string;
  readonly parentVariant?: "full" | "short";
  readonly targetWordRange?: Readonly<Record<string, number>>;
  readonly targetShortTiming?: {
    readonly shortWpm: number;
    readonly shortMinSeconds: number;
    readonly shortMaxSeconds: number;
  };
}

export function buildStoryArtifactCacheKey(
  input: StoryArtifactCacheKeyInput
): string {
  return hashText(
    stableSerialize({
      cacheKeyVersion: "story-artifact-cache-key-v2",
      ...input,
    })
  );
}
