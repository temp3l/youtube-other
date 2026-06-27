import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, normalizeWhitespace, slugify } from "@mediaforge/shared";
import {
  AmbiguousStoryInputError,
  StoryInputNotFoundError,
} from "./short-rewrite.errors.js";
import { SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES } from "./short-rewrite.constants.js";
import {
  buildCanonicalEpisodeSlug,
  hasGeneratedFullStoryProvenance,
  isEpisodeOutputFullStoryPath,
  normalizeSourceMarkdown,
  resolveShortRewriteEpisodeId,
  sha256NormalizedSource,
} from "./short-rewrite.utils.js";
import { sourceMetadataBlockSchema } from "./story-localization.schemas.js";
import { type ResolvedShortRewriteSource } from "./short-rewrite.types.js";
import { getRepoRoot } from "./story-localization.utils.js";

const episodeHeadingPattern =
  /^#\s+Episode\s+(?<episodeNumber>\d{3})\s+[—-]\s+(?<title>.+)$/u;
const sectionHeadingPattern = /^#{1,3}\s+(?<name>.+)$/u;

function splitSections(lines: readonly string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current = "preamble";
  sections.set(current, []);
  for (const line of lines) {
    const match = sectionHeadingPattern.exec(line);
    if (match?.groups?.["name"]) {
      current = normalizeWhitespace(match.groups["name"]);
      sections.set(current, []);
      continue;
    }
    sections.get(current)?.push(line);
  }
  return sections;
}

function parseMetadataPairs(lines: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of lines) {
    const match = /^\*\*(.+?)\*\*:\s*(.+)$/u.exec(line) ?? /^(.+?):\s*(.+)$/u.exec(line);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const key = normalizeWhitespace(match[1]).toLowerCase();
    const value = normalizeWhitespace(match[2]);
    result[key] = value;
  }
  return result;
}

function isShortStoryPath(filePath: string): boolean {
  return /(?:^|[-/])short(?:\.md)?$/iu.test(filePath) || /-short\.md$/iu.test(filePath);
}

async function readStoryFile(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new StoryInputNotFoundError(`Story input is not a file: ${filePath}`);
  }
  if (stats.size <= 0) {
    throw new StoryInputNotFoundError(`Story input is empty: ${filePath}`);
  }
  if (stats.size > SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES) {
    throw new StoryInputNotFoundError(
      `Story input exceeds the safe size limit of ${SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES} bytes: ${filePath}`
    );
  }
  return fs.readFile(filePath, "utf8");
}

function inferEpisodeSlugFromSourcePath(sourcePath: string, outputRoot?: string): string {
  const stripEpisodePrefix = (value: string): string => {
    const match = /^([0-9]{3})[-_](.+)$/u.exec(value);
    return match?.[2] ?? value;
  };
  const stripShortSuffix = (value: string): string =>
    value
      .replace(/-en-full$/iu, "")
      .replace(/-full$/iu, "")
      .replace(/-short$/iu, "");
  if (outputRoot) {
    const relativeParts = path.relative(path.resolve(outputRoot), path.resolve(sourcePath)).split(path.sep);
    const first = relativeParts[0];
    if (first && first.length > 0 && !first.startsWith("..")) {
      if (first === "episodes" && relativeParts[1]) {
        return stripEpisodePrefix(stripShortSuffix(relativeParts[1]));
      }
      return stripEpisodePrefix(stripShortSuffix(first));
    }
  }
  const fileStem = stripShortSuffix(path.basename(sourcePath, path.extname(sourcePath)));
  if (fileStem.length > 0) {
    return stripEpisodePrefix(fileStem);
  }
  return stripEpisodePrefix(path.basename(path.dirname(sourcePath)));
}

function parseSourceMarkdown(
  sourcePath: string,
  rawContent: string
): Omit<ResolvedShortRewriteSource, "episodeId" | "episodeSlug" | "resolvedFrom" | "candidatePaths"> & {
  readonly episodeNumber: string;
} {
  const content = normalizeSourceMarkdown(rawContent);
  const lines = content.split("\n");
  const titleLine = lines.find((line) => /^#\s+Episode\b/u.test(line));
  const titleMatch = titleLine ? episodeHeadingPattern.exec(titleLine) : null;
  if (!titleMatch?.groups?.["episodeNumber"] || !titleMatch.groups["title"]) {
    throw new StoryInputNotFoundError(
      `Unable to parse English full story heading in ${sourcePath}.`
    );
  }
  const episodeNumber = titleMatch.groups["episodeNumber"];
  const title = normalizeWhitespace(titleMatch.groups["title"]);
  const sections = splitSections(lines);
  const narrationSection =
    sections.get("Narration Script") ??
    sections.get("Narration") ??
    sections.get("Script") ??
    [];
  if (narrationSection.length === 0) {
    throw new StoryInputNotFoundError(
      `No narration section was found in ${sourcePath}.`
    );
  }
  const audioInstructions = sections
    .get("Audio Generation Instructions")
    ?.map((line) => normalizeWhitespace(line.replace(/^\s*[-*]\s+/u, "")))
    .filter((line) => line.length > 0)
    ?? [];
  const metadataLines = sections.get("Episode Metadata") ?? [];
  const metadataPairs = parseMetadataPairs(metadataLines);
  const metadata = sourceMetadataBlockSchema.parse({
    episodeNumber,
    primaryTitle: metadataPairs["primary title"] ?? title,
    ...(metadataPairs["source title"]
      ? { sourceTitle: metadataPairs["source title"] }
      : {}),
    audioInstructions,
    ...(metadataPairs["sound motif"]
      ? { soundMotif: metadataPairs["sound motif"] }
      : {}),
    ...(metadataPairs["thumbnail text"]
      ? { thumbnailText: metadataPairs["thumbnail text"] }
      : {}),
    ...(metadataPairs["seo description"]
      ? { seoDescription: metadataPairs["seo description"] }
      : {}),
    tags: metadataPairs["tags"]
      ? metadataPairs["tags"]
          .split(/(?:,|\n)/u)
          .map((value) => normalizeWhitespace(value))
          .filter((value) => value.length > 0)
      : [],
    hashtags: metadataPairs["hashtags"]
      ? metadataPairs["hashtags"]
          .split(/(?:,|\n)/u)
          .map((value) => normalizeWhitespace(value))
          .filter((value) => value.length > 0)
      : [],
    ...(metadataPairs["narration wpm"]
      ? { narrationWpm: Number.parseInt(metadataPairs["narration wpm"] ?? "", 10) }
      : {}),
    ...(metadataPairs["content disclosure"]
      ? { contentDisclosure: metadataPairs["content disclosure"] }
      : {}),
    ...(metadataPairs["visual direction"]
      ? { visualDirection: metadataPairs["visual direction"] }
      : {}),
  });
  const narration = narrationSection
    .filter((line) => !/^#{1,6}\s+/u.test(line) && !/^-{3,}\s*$/u.test(line.trim()))
    .join("\n")
    .replace(/\r\n/gu, "\n");
  if (normalizeWhitespace(narration).length === 0) {
    throw new StoryInputNotFoundError(
      `Narration section is empty in ${sourcePath}.`
    );
  }
  return {
    episodeNumber,
    title,
    narration: normalizeWhitespace(narration),
    audioInstructions,
    metadataSection: metadataPairs,
    sourceContent: content,
    sourcePath,
    sourceSha256: sha256NormalizedSource(content),
  };
}

function collectCandidatePaths(episodeDir: string): string[] {
  return [
    path.join(episodeDir, "script.md"),
    path.join(episodeDir, "en", "full", "script.md"),
    path.join(episodeDir, "en", "script.md"),
  ];
}

async function collectAllEnglishFullStoryCandidates(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectAllEnglishFullStoryCandidates(fullPath);
      candidates.push(...nested);
      continue;
    }
    if (entry.isFile() && (entry.name === "script.md" || /-en-full\.md$/iu.test(entry.name))) {
      candidates.push(fullPath);
    }
  }
  return candidates;
}

async function resolveEpisodeSearchRoot(outputRoot: string): Promise<string> {
  const resolvedOutputRoot = path.resolve(outputRoot);
  if (path.basename(resolvedOutputRoot) === "episodes") {
    return resolvedOutputRoot;
  }
  const episodeChildRoot = path.join(resolvedOutputRoot, "episodes");
  if (
    (await fileExists(episodeChildRoot)) &&
    (await fs.stat(episodeChildRoot)).isDirectory()
  ) {
    return episodeChildRoot;
  }
  return resolvedOutputRoot;
}

async function collectMatchingEpisodeDirectories(
  rootDir: string,
  episode: string
): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(rootDir, entry.name);
      if (candidateMatchesEpisodeDirectory(fullPath, episode)) {
        matches.push(fullPath);
      }
    }
  }
  return [...new Set(matches)].sort((left, right) => left.localeCompare(right));
}

function candidateMatchesEpisodeDirectory(candidatePath: string, episode: string): boolean {
  const normalizedEpisode = normalizeWhitespace(episode).toLowerCase();
  const candidateName = path.basename(candidatePath).toLowerCase();
  if (normalizedEpisode === candidateName) {
    return true;
  }
  if (/^\d{1,3}$/u.test(normalizedEpisode)) {
    const padded = normalizedEpisode.padStart(3, "0");
    return candidateName.startsWith(`${padded}-`) || candidateName === padded;
  }
  return candidateName.includes(normalizedEpisode);
}

export async function resolveShortRewriteInput(args: {
  readonly inputPath: string | undefined;
  readonly episode: string | undefined;
  readonly episodeSlug?: string | undefined;
  readonly outputRoot: string;
}): Promise<ResolvedShortRewriteSource> {
  if (args.inputPath) {
    const absoluteInput = path.resolve(args.inputPath);
    if (!(await fileExists(absoluteInput))) {
      throw new StoryInputNotFoundError(`No story input found at ${absoluteInput}.`);
    }
  const content = await readStoryFile(absoluteInput);
  if (
    isEpisodeOutputFullStoryPath(absoluteInput, args.outputRoot) &&
    !hasGeneratedFullStoryProvenance(content)
  ) {
    throw new StoryInputNotFoundError(
      `The selected input looks like a copied source story rather than a validated generated full story: ${absoluteInput}`
    );
  }
  if (isShortStoryPath(absoluteInput) || /^#\s*Short\b/imu.test(content)) {
    throw new StoryInputNotFoundError(
      `The selected input appears to be a Short rather than an English full story: ${absoluteInput}`
    );
    }
    const episodeSlug = args.episodeSlug
      ? slugify(normalizeWhitespace(args.episodeSlug))
      : inferEpisodeSlugFromSourcePath(absoluteInput, args.outputRoot);
    const parsed = parseSourceMarkdown(absoluteInput, content);
    const canonicalEpisodeSlug = buildCanonicalEpisodeSlug({
      episodeNumber: parsed.episodeNumber,
      episodeSlug,
    });
    const episodeId = resolveShortRewriteEpisodeId(canonicalEpisodeSlug);
    return {
      episodeId,
      episodeSlug: canonicalEpisodeSlug,
      episodeNumber: parsed.episodeNumber,
      sourcePath: absoluteInput,
      sourceContent: parsed.sourceContent,
      sourceSha256: parsed.sourceSha256,
      title: parsed.title,
      narration: parsed.narration,
      audioInstructions: parsed.audioInstructions,
      metadataSection: parsed.metadataSection,
      resolvedFrom: "explicit-input",
      candidatePaths: [absoluteInput],
    };
  }

  const outputRoot = path.resolve(args.outputRoot);
  const candidateRoots: string[] = [];
  if (args.episode) {
    const searchRoot = await resolveEpisodeSearchRoot(outputRoot);
    let episodeMatches = await collectMatchingEpisodeDirectories(searchRoot, args.episode ?? "");
    if (episodeMatches.length === 0 && searchRoot !== outputRoot) {
      episodeMatches = await collectMatchingEpisodeDirectories(outputRoot, args.episode ?? "");
    }
    if (episodeMatches.length === 0) {
      throw new StoryInputNotFoundError(
        `No English full story could be resolved for episode ${args.episode}.`
      );
    }
    if (episodeMatches.length > 1) {
      throw new AmbiguousStoryInputError(
        `Multiple episode directories matched ${args.episode}: ${episodeMatches.join(", ")}`
      );
    }
    candidateRoots.push(episodeMatches[0] ?? "");
  } else {
    const entries = await fs.readdir(outputRoot, { withFileTypes: true });
    candidateRoots.push(
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(outputRoot, entry.name))
        .sort((left, right) => left.localeCompare(right))
    );
  }

  const discovered: Array<{
    readonly path: string;
    readonly priority: number;
  }> = [];
  for (const episodeDir of candidateRoots) {
    for (const candidate of collectCandidatePaths(episodeDir)) {
      if (await fileExists(candidate)) {
        const priority =
          path.basename(candidate) === "script.md" && path.dirname(candidate) === episodeDir
            ? 0
            : candidate.includes(path.join("en", "full", "script.md"))
              ? 1
              : candidate.includes(path.join("en", "script.md"))
                ? 2
                : 3;
        discovered.push({ path: candidate, priority });
      }
    }
    const recursiveCandidates = await collectAllEnglishFullStoryCandidates(episodeDir);
    for (const candidate of recursiveCandidates) {
      discovered.push({ path: candidate, priority: 3 });
    }
  }
  discovered.sort((left, right) =>
    left.priority === right.priority
      ? left.path.localeCompare(right.path)
      : left.priority - right.priority
  );
  const bestPriority = discovered[0]?.priority;
  if (bestPriority === undefined) {
    throw new StoryInputNotFoundError(
      args.episode
        ? `No English full story could be resolved for episode ${args.episode}.`
        : `No English full story could be resolved under ${outputRoot}.`
    );
  }
  const winners = discovered.filter((candidate) => candidate.priority === bestPriority);
  if (winners.length > 1) {
    throw new AmbiguousStoryInputError(
      `Multiple English full stories were found. Pass --input explicitly:\n${winners.map((candidate) => `- ${candidate.path}`).join("\n")}`
    );
  }
  const sourcePath = winners[0]?.path;
  if (!sourcePath) {
    throw new StoryInputNotFoundError("Unable to resolve source story.");
  }
  const content = await readStoryFile(sourcePath);
  if (
    isEpisodeOutputFullStoryPath(sourcePath, args.outputRoot) &&
    !hasGeneratedFullStoryProvenance(content)
  ) {
    throw new StoryInputNotFoundError(
      `The resolved source looks like a copied source story rather than a validated generated full story: ${sourcePath}`
    );
  }
  if (isShortStoryPath(sourcePath) || /^#\s*Short\b/imu.test(content)) {
    throw new StoryInputNotFoundError(
      `The resolved source appears to be a Short rather than an English full story: ${sourcePath}`
    );
  }
  const episodeSlug = args.episodeSlug
    ? slugify(normalizeWhitespace(args.episodeSlug))
    : inferEpisodeSlugFromSourcePath(sourcePath, outputRoot);
  const parsed = parseSourceMarkdown(sourcePath, content);
  const canonicalEpisodeSlug = buildCanonicalEpisodeSlug({
    episodeNumber: parsed.episodeNumber,
    episodeSlug,
  });
  const episodeId = resolveShortRewriteEpisodeId(canonicalEpisodeSlug);
  return {
    episodeId,
    episodeSlug: canonicalEpisodeSlug,
    episodeNumber: parsed.episodeNumber,
    sourcePath,
    sourceContent: parsed.sourceContent,
    sourceSha256: parsed.sourceSha256,
    title: parsed.title,
    narration: parsed.narration,
    audioInstructions: parsed.audioInstructions,
    metadataSection: parsed.metadataSection,
    resolvedFrom: args.episode ? "canonical-path" : "deterministic-search",
    candidatePaths: discovered.map((candidate) => candidate.path),
  };
}
