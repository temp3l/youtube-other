import fs from "node:fs/promises";
import path from "node:path";
import { StorySourceDiscoveryError } from "./story-localization.errors.js";
import { normalizeWhitespace } from "@mediaforge/shared";
import { getRepoRoot } from "./story-localization.utils.js";

export interface SourceStoryCandidate {
  readonly episodeNumber: string;
  readonly slug: string;
  readonly filePath: string;
}

export const DEFAULT_SOURCE_DIRECTORY =
  "./content/dark-truth-episodes-multilingual-production-pack";

export const DEFAULT_OUTPUT_DIRECTORY =
  "./content-ideas/content/dark-truth-episodes";

const canonicalSourceFilePattern =
  /^(?<episodeNumber>\d{3})-(?<slug>.+)-en-full\.md$/u;

function isIgnoredName(name: string): boolean {
  return name.startsWith(".") || name === "node_modules" || name === "dist" || name === "coverage" || name === "build" || name === "cache" || name === "tmp";
}

async function walkMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (isIgnoredName(entry.name)) {
      continue;
    }
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.resolve(fullPath));
    }
  }
  return files;
}

export function resolveDefaultSourceDirectory(): string {
  return path.resolve(getRepoRoot(), DEFAULT_SOURCE_DIRECTORY);
}

export function resolveDefaultOutputDirectory(): string {
  return path.resolve(getRepoRoot(), DEFAULT_OUTPUT_DIRECTORY);
}

export function parseCanonicalSourceFilename(fileName: string): SourceStoryCandidate {
  const match = canonicalSourceFilePattern.exec(fileName);
  const episodeNumber = match?.groups?.["episodeNumber"];
  const slug = match?.groups?.["slug"];
  if (!episodeNumber || !slug) {
    throw new StorySourceDiscoveryError(`Invalid canonical source filename: ${fileName}`);
  }
  return {
    episodeNumber,
    slug: normalizeWhitespace(slug),
    filePath: fileName,
  };
}

export async function discoverCanonicalSourceStories(sourceDirectory: string): Promise<SourceStoryCandidate[]> {
  try {
    const files = await walkMarkdownFiles(sourceDirectory);
    const candidates = files
      .map((filePath) => ({
        filePath,
        name: path.basename(filePath),
      }))
      .filter(({ name }) => canonicalSourceFilePattern.test(name))
      .map(({ filePath, name }) => {
        const parsed = parseCanonicalSourceFilename(name);
        return { ...parsed, filePath };
      });
    return candidates.sort((left, right) =>
      left.episodeNumber === right.episodeNumber
        ? left.filePath.localeCompare(right.filePath)
        : left.episodeNumber.localeCompare(right.episodeNumber)
    );
  } catch (error) {
    throw new StorySourceDiscoveryError(
      `Unable to discover canonical source stories under ${sourceDirectory}.`,
      error
    );
  }
}

export function selectSourceCandidates(
  candidates: readonly SourceStoryCandidate[],
  options: {
    readonly episode?: string;
    readonly file?: string;
    readonly slug?: string;
  }
): SourceStoryCandidate[] {
  if (options.file) {
    return candidates.filter((candidate) => candidate.filePath === path.resolve(options.file!));
  }
  if (options.episode) {
    const normalized = normalizeWhitespace(options.episode);
    return candidates.filter(
      (candidate) => candidate.episodeNumber === normalized || candidate.slug === normalized
    );
  }
  if (options.slug) {
    return candidates.filter((candidate) => candidate.slug === options.slug);
  }
  return [...candidates];
}
