import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import {
  ensureWorkspacePath,
  fileExists,
  hashText,
  normalizeWhitespace,
  readJsonIfExists,
  readTextIfExists,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  canonicalEnglishFullArtifactSchema,
  readCanonicalEnglishFullManifest,
  resolveCanonicalEnglishFullPaths,
} from "./canonical-full-story.persistence.js";
import { getLanguageProfile } from "./language-profiles.js";
import { resolveEpisodeCacheDirectory } from "./story-localization-cache.js";
import { resolveEpisodeStoryProductionDirectory } from "./story-production.js";
import {
  STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION,
  STORY_PRODUCTION_ANALYSIS_SUPPORTED_FORMAT,
  computeStoryProductionAnalysisFingerprint,
  storyProductionAnalysisArtifactSchema,
  type StoryProductionAnalysisArtifact,
  type StoryProductionAnalysisInput,
} from "./story-production-analysis.js";
import { stableSerialize } from "./stable-json.js";
import { narrationOnlyFullRewriteResponseSchema } from "./story-prompt-response-schemas.js";

const localizedFullArtifactSchema = z
  .object({
    schemaVersion: z.string().min(1),
    lineage: z
      .object({
        kind: z.literal("canonical-english-full"),
        fingerprint: z.string().min(1),
        sourceHash: z.string().min(1),
        language: z.literal("en").optional(),
        locale: z.literal("en-US").optional(),
        variant: z.literal("full").optional(),
        storyIrHash: z.string().min(1).optional(),
        contractHash: z.string().min(1).optional(),
        contractBuildFingerprint: z.string().min(1).optional(),
      })
      .strict(),
    validationIssues: z.array(z.string().min(1)),
    result: narrationOnlyFullRewriteResponseSchema,
  })
  .strict();

export type StoryProductionAnalysisState =
  | "CURRENT"
  | "MISSING"
  | "STALE"
  | "INVALID"
  | "MISMATCHED_SOURCE";

export interface StoryProductionAnalysisPaths {
  readonly episodeDir: string;
  readonly storyDir: string;
  readonly analysisPath: string;
  readonly scriptPath: string;
  readonly localizedLineagePath?: string | undefined;
  readonly canonicalArtifactPath?: string | undefined;
}

export interface StoryProductionAnalysisSourceDescriptor {
  readonly episode: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly locale: string;
  readonly format: "full";
  readonly sourceArtifactPath: string;
  readonly storyText: string;
  readonly sourceContentFingerprint: string;
  readonly sourceLineageFingerprint: string;
  readonly source: StoryProductionAnalysisInput;
  readonly analysisPaths: StoryProductionAnalysisPaths;
  readonly lineagePresent: boolean;
  readonly lineageCurrent: boolean;
}

export interface StoryProductionAnalysisStatus {
  readonly analysisPresent: boolean;
  readonly analysisCurrent: boolean;
  readonly analysisFingerprintMatches: boolean;
  readonly analysisState: StoryProductionAnalysisState;
  readonly pass?: boolean;
  readonly verdict?: StoryProductionAnalysisArtifact["verdict"];
  readonly overallScore?: number;
  readonly failedProductionGates: readonly string[];
  readonly blockingIssueCount: number;
  readonly requiredChangeCount: number;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly analyzedAt?: string;
  readonly estimatedCost?: number | null;
  readonly artifact?: StoryProductionAnalysisArtifact;
}

async function resolveEpisodeDirectorySlug(
  outputRoot: string,
  episode: string
): Promise<string> {
  const normalized = normalizeWhitespace(episode).toLowerCase();
  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const lower = name.toLowerCase();
      if (lower === normalized) {
        return true;
      }
      const prefix = /^(\d{3})[-_]/u.exec(lower)?.[1];
      if (!prefix) {
        return false;
      }
      return prefix === normalized.padStart(3, "0");
    });
  if (matches.length === 0) {
    throw new Error(`No episode directory found for ${episode}.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple episode directories matched ${episode}: ${matches.join(", ")}`
    );
  }
  return matches[0] ?? episode;
}

export function resolveStoryProductionAnalysisPaths(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly format?: "full";
}): StoryProductionAnalysisPaths {
  const format = args.format ?? STORY_PRODUCTION_ANALYSIS_SUPPORTED_FORMAT;
  const episodeDir = ensureWorkspacePath(
    args.outputRoot,
    path.join(args.outputRoot, args.episodeSlug)
  );
  const storyDir = ensureWorkspacePath(
    args.outputRoot,
    path.join(episodeDir, args.language, format)
  );
  return {
    episodeDir,
    storyDir,
    analysisPath: path.join(storyDir, "story-production-analysis.json"),
    scriptPath: path.join(storyDir, "script.md"),
    ...(args.language === "en"
      ? {}
      : {
          localizedLineagePath: path.join(
            resolveEpisodeStoryProductionDirectory(
              resolveEpisodeCacheDirectory(args.outputRoot, args.episodeSlug),
              {
                episodeNumber:
                  /^(\d{3})[-_]/u.exec(args.episodeSlug)?.[1] ?? args.episodeSlug,
                slug: args.episodeSlug,
              }
            ),
            `${args.language}-full-narration-result.json`
          ),
        }),
    canonicalArtifactPath: resolveCanonicalEnglishFullPaths(
      args.outputRoot,
      args.episodeSlug
    ).canonicalArtifactPath,
  };
}

export async function readStoryProductionAnalysisArtifact(
  analysisPath: string
): Promise<StoryProductionAnalysisArtifact | null> {
  return readJsonIfExists(analysisPath, (value) =>
    storyProductionAnalysisArtifactSchema.parse(value)
  );
}

function hashNormalizedText(value: string): string {
  return hashText(normalizeWhitespace(value));
}

export async function resolveStoryProductionAnalysisSource(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly format?: "full";
}): Promise<StoryProductionAnalysisSourceDescriptor> {
  const episodeSlug = await resolveEpisodeDirectorySlug(
    args.outputRoot,
    args.episodeSlug
  );
  const language = args.language;
  const profile = getLanguageProfile(language as never);
  const paths = resolveStoryProductionAnalysisPaths({
    outputRoot: args.outputRoot,
    episodeSlug,
    language,
    ...(args.format ? { format: args.format } : {}),
  });
  const storyText = await readTextIfExists(paths.scriptPath);
  if (!storyText || normalizeWhitespace(storyText).length === 0) {
    throw new Error(`Missing persisted rewritten story at ${paths.scriptPath}.`);
  }
  if (language === "en") {
    const canonicalArtifact = paths.canonicalArtifactPath
      ? await readJsonIfExists(paths.canonicalArtifactPath, (value) =>
          canonicalEnglishFullArtifactSchema.parse(value)
        )
      : null;
    if (!canonicalArtifact || canonicalArtifact.status !== "completed") {
      throw new Error(
        `Missing persisted canonical English full artifact for ${args.episodeSlug}.`
      );
    }
    const sourceLineageFingerprint = hashText(
      stableSerialize({
        canonicalArtifactPath: paths.canonicalArtifactPath,
        lineage: canonicalArtifact.lineage,
      })
    );
    return {
      episode: canonicalArtifact.episodeNumber,
      episodeSlug: canonicalArtifact.episodeSlug,
      language,
      locale: canonicalArtifact.locale,
      format: "full",
      sourceArtifactPath: paths.canonicalArtifactPath ?? paths.scriptPath,
      storyText,
      sourceContentFingerprint: hashNormalizedText(storyText),
      sourceLineageFingerprint,
      source: {
        storyText,
        paragraphCount: storyText.split(/\n{2,}/u).filter(Boolean).length,
        language,
        locale: canonicalArtifact.locale,
        format: "full",
      },
      analysisPaths: paths,
      lineagePresent: true,
      lineageCurrent: true,
    };
  }
  const localizedArtifact = paths.localizedLineagePath
    ? await readJsonIfExists(paths.localizedLineagePath, (value) =>
        localizedFullArtifactSchema.parse(value)
      )
    : null;
  const canonicalArtifact = paths.canonicalArtifactPath
    ? await readJsonIfExists(paths.canonicalArtifactPath, (value) =>
        canonicalEnglishFullArtifactSchema.parse(value)
      )
    : null;
  const canonicalManifest = await readCanonicalEnglishFullManifest(
    resolveCanonicalEnglishFullPaths(args.outputRoot, args.episodeSlug)
  );
  if (!localizedArtifact || localizedArtifact.validationIssues.length > 0) {
    return {
      episode:
        /^(\d{3})[-_]/u.exec(args.episodeSlug)?.[1] ?? args.episodeSlug,
      episodeSlug,
      language,
      locale: profile.locale,
      format: "full",
      sourceArtifactPath: paths.scriptPath,
      storyText,
      sourceContentFingerprint: hashNormalizedText(storyText),
      sourceLineageFingerprint: hashText("missing-lineage"),
      source: {
        storyText,
        paragraphCount: storyText.split(/\n{2,}/u).filter(Boolean).length,
        language,
        locale: profile.locale,
        format: "full",
      },
      analysisPaths: paths,
      lineagePresent: false,
      lineageCurrent: false,
    };
  }
  const lineageCurrent =
    Boolean(canonicalArtifact) &&
    Boolean(canonicalManifest) &&
    canonicalArtifact?.status === "completed" &&
    canonicalArtifact?.validation.status === "passed" &&
    localizedArtifact.lineage.fingerprint ===
      canonicalManifest?.canonicalFingerprint;
  return {
    episode:
        /^(\d{3})[-_]/u.exec(args.episodeSlug)?.[1] ?? args.episodeSlug,
    episodeSlug,
    language,
    locale: profile.locale,
    format: "full",
    sourceArtifactPath: paths.localizedLineagePath ?? paths.scriptPath,
    storyText,
    sourceContentFingerprint: hashNormalizedText(storyText),
    sourceLineageFingerprint: hashText(
      stableSerialize({
        localizedLineagePath: paths.localizedLineagePath,
        lineage: localizedArtifact.lineage,
      })
    ),
    source: {
      storyText,
      paragraphCount: storyText.split(/\n{2,}/u).filter(Boolean).length,
      language,
      locale: profile.locale,
      format: "full",
      ...((lineageCurrent && canonicalArtifact
        ? await readTextIfExists(
              resolveCanonicalEnglishFullPaths(
                args.outputRoot,
                episodeSlug
              ).canonicalMarkdownPath
            )
        : null)
        ? {
            canonicalEnglishText:
              (await readTextIfExists(
                resolveCanonicalEnglishFullPaths(
                  args.outputRoot,
                  episodeSlug
                ).canonicalMarkdownPath
              )) ?? "",
          }
        : {}),
    },
    analysisPaths: paths,
    lineagePresent: true,
    lineageCurrent,
  };
}

export function computeStoryProductionAnalysisCanonicalFingerprint(
  artifact: z.infer<typeof canonicalEnglishFullArtifactSchema>
): string {
  return artifact.status === "completed"
    ? artifact.preflight.requestFingerprint
    : hashText(stableSerialize(artifact.lineage));
}

export async function persistStoryProductionAnalysisArtifact(args: {
  readonly analysisPath: string;
  readonly artifact: StoryProductionAnalysisArtifact;
}): Promise<void> {
  await writeJsonAtomic(
    args.analysisPath,
    storyProductionAnalysisArtifactSchema.parse({
      ...args.artifact,
      schemaVersion: STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION,
    })
  );
}

export async function resolveStoryProductionAnalysisStatus(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly format?: "full";
  readonly model?: string;
  readonly reasoningEffort?: string;
}): Promise<StoryProductionAnalysisStatus> {
  const source = await resolveStoryProductionAnalysisSource(args);
  const artifact = await readStoryProductionAnalysisArtifact(
    source.analysisPaths.analysisPath
  ).catch(() => null);
  if (!artifact) {
    return {
      analysisPresent: false,
      analysisCurrent: false,
      analysisFingerprintMatches: false,
      analysisState: "MISSING",
      failedProductionGates: [],
      blockingIssueCount: 0,
      requiredChangeCount: 0,
    };
  }
  const expectedFingerprint =
    args.model && args.reasoningEffort
      ? computeStoryProductionAnalysisFingerprint({
          sourceContentFingerprint: source.sourceContentFingerprint,
          sourceLineageFingerprint: source.sourceLineageFingerprint,
          language: source.language,
          locale: source.locale,
          format: source.format,
          sourceArtifactPath: source.sourceArtifactPath,
          model: args.model,
          reasoningEffort: args.reasoningEffort,
        })
      : artifact.analysisFingerprint;
  const analysisFingerprintMatches =
    artifact.analysisFingerprint === expectedFingerprint;
  const sourceMatches =
    artifact.sourceContentFingerprint === source.sourceContentFingerprint &&
    artifact.sourceLineageFingerprint === source.sourceLineageFingerprint;
  const analysisCurrent =
    analysisFingerprintMatches && sourceMatches && source.lineageCurrent;
  const analysisState: StoryProductionAnalysisState = !sourceMatches
    ? "MISMATCHED_SOURCE"
    : !source.lineageCurrent
      ? "STALE"
      : !analysisFingerprintMatches
        ? "STALE"
        : "CURRENT";
  return {
    analysisPresent: true,
    analysisCurrent,
    analysisFingerprintMatches,
    analysisState,
    ...(analysisCurrent ? { pass: artifact.pass } : {}),
    ...(analysisCurrent ? { verdict: artifact.verdict } : {}),
    ...(analysisCurrent ? { overallScore: artifact.overallScore } : {}),
    failedProductionGates: analysisCurrent
      ? artifact.gateResults.failedChecks.map((check) => check.id)
      : [],
    blockingIssueCount: artifact.blockingIssues.length,
    requiredChangeCount: artifact.requiredChanges.length,
    ...(artifact.model ? { model: artifact.model } : {}),
    ...(artifact.reasoningEffort
      ? { reasoningEffort: artifact.reasoningEffort }
      : {}),
    ...(artifact.updatedAt ? { analyzedAt: artifact.updatedAt } : {}),
    estimatedCost: artifact.estimatedCost,
    ...(artifact ? { artifact } : {}),
  };
}

export function buildStoryProductionInspectPayload(args: {
  readonly source: StoryProductionAnalysisSourceDescriptor;
  readonly status: StoryProductionAnalysisStatus;
}): Record<string, unknown> {
  return {
    episode: args.source.episode,
    episodeSlug: args.source.episodeSlug,
    language: args.source.language,
    locale: args.source.locale,
    format: args.source.format,
    sourceArtifactPath: args.source.sourceArtifactPath,
    scriptPath: args.source.analysisPaths.scriptPath,
    analysisPath: args.source.analysisPaths.analysisPath,
    analysisPresent: args.status.analysisPresent,
    analysisCurrent: args.status.analysisCurrent,
    analysisFingerprintMatches: args.status.analysisFingerprintMatches,
    analysisState: args.status.analysisState,
    pass: args.status.pass,
    verdict: args.status.verdict,
    overallScore: args.status.overallScore,
    failedProductionGates: args.status.failedProductionGates,
    blockingIssueCount: args.status.blockingIssueCount,
    requiredChangeCount: args.status.requiredChangeCount,
    model: args.status.model,
    reasoningEffort: args.status.reasoningEffort,
    analyzedAt: args.status.analyzedAt,
    estimatedCost: args.status.estimatedCost,
    lineagePresent: args.source.lineagePresent,
    lineageCurrent: args.source.lineageCurrent,
  };
}
