import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, normalizeWhitespace, slugify } from "@mediaforge/shared";
import { AmbiguousStoryInputError, StoryInputNotFoundError } from "./short-rewrite.errors.js";
import { SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES } from "./short-rewrite.constants.js";
import {
  buildCanonicalEpisodeSlug,
  buildCanonicalSourceFileName,
  resolveShortRewriteEpisodeId,
  sha256NormalizedSource,
} from "./short-rewrite.utils.js";
import { discoverCanonicalSourceStories, selectSourceCandidates } from "./source-story-discovery.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { type ParsedSourceStory } from "./story-localization.types.js";

export interface ResolvedFullRewriteSource {
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly episodeNumber: string;
  readonly sourcePath: string;
  readonly sourceContent: string;
  readonly sourceSha256: string;
  readonly title: string;
  readonly resolvedFrom: "explicit-input" | "canonical-search";
  readonly candidatePaths: readonly string[];
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

function stripEpisodePrefix(value: string): string {
  const match = /^([0-9]{3})[-_](.+)$/u.exec(value);
  return match?.[2] ?? value;
}

function stripRewriteSuffixes(value: string): string {
  return value
    .replace(/-en-full-optimized$/iu, "")
    .replace(/-en-full$/iu, "")
    .replace(/-full-optimized$/iu, "")
    .replace(/-full$/iu, "")
    .replace(/-short$/iu, "")
    .replace(/-optimized$/iu, "");
}

function inferEpisodeSlugFromInputPath(sourcePath: string, outputRoot: string): string {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedRoot = path.resolve(outputRoot);
  const relative = path.relative(resolvedRoot, resolvedSource).split(path.sep);
  const directFolder = relative[0];
  const directStem = path.basename(resolvedSource, path.extname(resolvedSource));
  if (directFolder && !directFolder.startsWith("..")) {
    if (directFolder === "episodes" && relative[1]) {
      return stripEpisodePrefix(stripRewriteSuffixes(relative[1]));
    }
    const directName = directFolder.endsWith(".md")
      ? path.basename(directFolder, path.extname(directFolder))
      : directFolder;
    return stripEpisodePrefix(stripRewriteSuffixes(directName || directStem));
  }
  const fileStem = stripRewriteSuffixes(directStem);
  if (fileStem.length > 0) {
    return stripEpisodePrefix(fileStem);
  }
  return stripEpisodePrefix(path.basename(path.dirname(resolvedSource)));
}

async function resolveEpisodeSearchRoot(outputRoot: string): Promise<string> {
  const resolvedOutputRoot = path.resolve(outputRoot);
  if (path.basename(resolvedOutputRoot) === "episodes") {
    return resolvedOutputRoot;
  }
  const episodeChildRoot = path.join(resolvedOutputRoot, "episodes");
  if ((await fileExists(episodeChildRoot)) && (await fs.stat(episodeChildRoot)).isDirectory()) {
    return episodeChildRoot;
  }
  return resolvedOutputRoot;
}

async function collectResolvedCanonicalCandidates(
  outputRoot: string,
  episode?: string,
  episodeSlug?: string
): Promise<readonly string[]> {
  const searchRoot = await resolveEpisodeSearchRoot(outputRoot);
  const discovered = await discoverCanonicalSourceStories(searchRoot);
  const selected = selectSourceCandidates(
    discovered,
    {
      ...(episode ? { episode } : {}),
      ...(episodeSlug
        ? { slug: slugify(normalizeWhitespace(episodeSlug)) }
        : {}),
    }
  );
  return selected.map((candidate) => candidate.filePath);
}

function normalizeEpisodeSlugCandidate(
  parsed: ParsedSourceStory,
  sourcePath: string,
  outputRoot: string,
  episodeSlug?: string
): string {
  const candidateSlug = episodeSlug
    ? slugify(normalizeWhitespace(episodeSlug))
    : inferEpisodeSlugFromInputPath(sourcePath, outputRoot);
  return buildCanonicalEpisodeSlug({
    episodeNumber: parsed.episodeNumber,
    episodeSlug: candidateSlug,
  });
}

export async function resolveFullRewriteInput(args: {
  readonly inputPath: string | undefined;
  readonly episode: string | undefined;
  readonly episodeSlug?: string | undefined;
  readonly outputRoot: string;
}): Promise<ResolvedFullRewriteSource> {
  if (args.inputPath) {
    const absoluteInput = path.resolve(args.inputPath);
    if (!(await fileExists(absoluteInput))) {
      throw new StoryInputNotFoundError(`No story input found at ${absoluteInput}.`);
    }
    const content = await readStoryFile(absoluteInput);
    if (isShortStoryPath(absoluteInput) || /^#\s*Short\b/imu.test(content)) {
      throw new StoryInputNotFoundError(
        `The selected input appears to be a Short rather than a canonical full story: ${absoluteInput}`
      );
    }
    const parsed = await parseCanonicalSourceStory(absoluteInput);
    const canonicalEpisodeSlug = normalizeEpisodeSlugCandidate(
      parsed,
      absoluteInput,
      args.outputRoot,
      args.episodeSlug
    );
    return {
      episodeId: resolveShortRewriteEpisodeId(canonicalEpisodeSlug),
      episodeSlug: canonicalEpisodeSlug,
      episodeNumber: parsed.episodeNumber,
      sourcePath: absoluteInput,
      sourceContent: content,
      sourceSha256: sha256NormalizedSource(content),
      title: parsed.title,
      resolvedFrom: "explicit-input",
      candidatePaths: [absoluteInput],
    };
  }

  const candidatePaths = await collectResolvedCanonicalCandidates(
    args.outputRoot,
    args.episode,
    args.episodeSlug
  );
  if (candidatePaths.length === 0) {
    throw new StoryInputNotFoundError(
      args.episode
        ? `No English full story could be resolved for episode ${args.episode}.`
        : `No English full story could be resolved under ${args.outputRoot}.`
    );
  }
  if (candidatePaths.length > 1) {
    throw new AmbiguousStoryInputError(
      `Multiple English full stories were found. Pass --input explicitly:\n${candidatePaths.map((candidate) => `- ${candidate}`).join("\n")}`
    );
  }
  const sourcePath = candidatePaths[0];
  if (!sourcePath) {
    throw new StoryInputNotFoundError("Unable to resolve source story.");
  }
  const content = await readStoryFile(sourcePath);
  if (isShortStoryPath(sourcePath) || /^#\s*Short\b/imu.test(content)) {
    throw new StoryInputNotFoundError(
      `The resolved source appears to be a Short rather than an English full story: ${sourcePath}`
    );
  }
  const parsed = await parseCanonicalSourceStory(sourcePath);
  const canonicalEpisodeSlug = normalizeEpisodeSlugCandidate(
    parsed,
    sourcePath,
    args.outputRoot,
    args.episodeSlug
  );
  return {
    episodeId: resolveShortRewriteEpisodeId(canonicalEpisodeSlug),
    episodeSlug: canonicalEpisodeSlug,
    episodeNumber: parsed.episodeNumber,
    sourcePath,
    sourceContent: content,
    sourceSha256: sha256NormalizedSource(content),
    title: parsed.title,
    resolvedFrom: "canonical-search",
    candidatePaths,
  };
}
