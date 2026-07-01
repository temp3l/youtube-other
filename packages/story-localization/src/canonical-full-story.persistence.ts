import path from "node:path";
import { hashText, readJsonIfExists, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import { ensureDir } from "@mediaforge/shared";
import { stableSerialize } from "./stable-json.js";
import {
  type CanonicalStoryFacts,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import {
  narrationOnlyFullRewriteResponseSchema,
  type NarrationOnlyFullRewriteResponse,
} from "./story-prompt-response-schemas.js";
import { adaptNarrationOnlyFullToLegacyRendererPackage } from "./story-prompt-response-schemas.js";
import {
  renderCanonicalEnglishFullStory,
  renderNarrationOnlyStoryMarkdown,
} from "./story-markdown-renderer.js";
import { writeTextAtomicIfChanged } from "./story-localization.utils.js";
import { getLanguageProfile } from "./language-profiles.js";
import { type StoryPreflightResult } from "./story-generation-preflight.js";

export const CANONICAL_ENGLISH_FULL_ARTIFACT_SCHEMA_VERSION =
  "canonical-english-full-artifact-v1";
export const CANONICAL_ENGLISH_FULL_MANIFEST_SCHEMA_VERSION =
  "canonical-english-full-manifest-v1";

const canonicalAttemptSchema = z.object({
  attempt: z.number().int().nonnegative(),
  stage: z.enum(["initial", "repair"]),
  status: z.enum(["accepted", "rejected", "blocked"]),
  issues: z.array(z.string().min(1)),
  model: z.string().min(1),
  promptFingerprint: z.string().min(1),
  responseSchemaFingerprint: z.string().min(1),
  generatedAt: z.string().min(1),
});

const canonicalPreflightSchema = z
  .object({
    policyVersion: z.string().min(1),
    requestFingerprint: z.string().min(1),
    status: z.enum(["allowed", "blocked"]),
    failureCodes: z.array(z.string().min(1)).optional(),
    reason: z.string().min(1).optional(),
    requestedOutputTokens: z.number().int().nonnegative(),
    contextWindowTokens: z.number().int().positive(),
    maxModelOutputTokens: z.number().int().positive(),
    safetyMarginTokens: z.number().int().positive(),
  })
  .strict();

const canonicalLineageSchema = z
  .object({
    sourceHash: z.string().min(64),
    cleanedSourceHash: z.string().min(64),
    storyIrHash: z.string().min(64),
    contractHash: z.string().min(64),
    contractBuildFingerprint: z.string().min(64),
  })
  .strict();

const canonicalPromptSchema = z
  .object({
    compilerVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    promptFingerprint: z.string().min(1),
    selectedModules: z.array(
      z.object({
        id: z.string().min(1),
        version: z.string().min(1),
      })
    ),
  })
  .strict();

const canonicalModelSchema = z
  .object({
    name: z.string().min(1),
    reasoningEffort: z.string().min(1),
    maxOutputTokens: z.number().int().positive(),
  })
  .strict();

const canonicalSchemaSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    fingerprint: z.string().min(1),
  })
  .strict();

const canonicalValidationSchema = z
  .object({
    status: z.enum(["passed", "failed", "blocked-preflight"]),
    issues: z.array(z.string().min(1)),
    semanticIssues: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const canonicalEnglishFullArtifactSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_ENGLISH_FULL_ARTIFACT_SCHEMA_VERSION),
    episodeNumber: z.string().min(1),
    episodeSlug: z.string().min(1),
    language: z.literal("en"),
    locale: z.string().min(1),
    variant: z.literal("full"),
    sourceFile: z.string().min(1),
    lineage: canonicalLineageSchema,
    prompt: canonicalPromptSchema,
    model: canonicalModelSchema,
    responseSchema: canonicalSchemaSchema,
    preflight: canonicalPreflightSchema,
    response: narrationOnlyFullRewriteResponseSchema,
    validation: canonicalValidationSchema,
    provenance: z.enum(["generated", "source-fallback"]).optional(),
    fallback: z
      .object({
        accepted: z.boolean(),
        originalFailureCategory: z.string().min(1),
        originalFailureMessage: z.string().min(1),
        qualityStatus: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    repairHistory: z.array(canonicalAttemptSchema),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .strict(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
    status: z.enum(["completed", "failed", "blocked-preflight"]),
    generatedAt: z.string().min(1),
  })
  .strict();

export type CanonicalEnglishFullArtifact = z.infer<
  typeof canonicalEnglishFullArtifactSchema
>;

const attemptSummarySchema = z
  .object({
    attemptCount: z.number().int().nonnegative(),
    latestAttemptStatus: z.enum(["accepted", "rejected", "blocked"]),
    latestAttemptIssues: z.array(z.string().min(1)),
    latestAttemptAt: z.string().min(1),
  })
  .strict();

export const canonicalEnglishFullManifestSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_ENGLISH_FULL_MANIFEST_SCHEMA_VERSION),
    episodeNumber: z.string().min(1),
    episodeSlug: z.string().min(1),
    language: z.literal("en"),
    locale: z.string().min(1),
    variant: z.literal("full"),
    canonicalFingerprint: z.string().min(1),
    status: z.enum(["completed", "failed", "blocked-preflight"]),
    currentArtifactPath: z.string().min(1),
    currentArtifactHash: z.string().min(1),
    canonicalMarkdownPath: z.string().min(1),
    canonicalMarkdownHash: z.string().min(1),
    compatibilityMarkdownPath: z.string().min(1),
    compatibilityMarkdownHash: z.string().min(1),
    rootCompatibilityMarkdownPath: z.string().min(1),
    rootCompatibilityMarkdownHash: z.string().min(1),
    lineage: canonicalLineageSchema,
    prompt: canonicalPromptSchema,
    model: canonicalModelSchema,
    responseSchema: canonicalSchemaSchema,
    preflight: canonicalPreflightSchema,
    validation: canonicalValidationSchema,
    latestSuccessfulAttempt: attemptSummarySchema.optional(),
    lastFailedAttempt: attemptSummarySchema.optional(),
    downstreamInvalidationFingerprint: z.string().min(1),
    generatedAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type CanonicalEnglishFullManifest = z.infer<
  typeof canonicalEnglishFullManifestSchema
>;

export interface CanonicalEnglishFullPaths {
  readonly episodeDir: string;
  readonly canonicalDir: string;
  readonly canonicalArtifactPath: string;
  readonly canonicalMarkdownPath: string;
  readonly compatibilityMarkdownPath: string;
  readonly rootCompatibilityMarkdownPath: string;
}

export function resolveCanonicalEnglishFullPaths(
  outputDirectory: string,
  episodeSlug: string
): CanonicalEnglishFullPaths {
  const episodeDir = path.join(outputDirectory, episodeSlug);
  const canonicalDir = path.join(episodeDir, "en", "full");
  return {
    episodeDir,
    canonicalDir,
    canonicalArtifactPath: path.join(canonicalDir, "canonical-full.json"),
    canonicalMarkdownPath: path.join(canonicalDir, "script.md"),
    compatibilityMarkdownPath: path.join(episodeDir, "script.md"),
    rootCompatibilityMarkdownPath: path.join(episodeDir, "script.md"),
  };
}

function buildCanonicalNarrationMarkdown(args: {
  readonly sourceStory: ParsedSourceStory;
  readonly response: NarrationOnlyFullRewriteResponse;
}): string {
  return renderNarrationOnlyStoryMarkdown({
    episodeNumber: args.sourceStory.episodeNumber,
    title: args.sourceStory.title,
    narrationParagraphs: args.response.full.narrationParagraphs,
    sourceSha256: args.sourceStory.sourceHash,
  });
}

function buildCompatibilityResponseMarkdown(args: {
  readonly sourceStory: ParsedSourceStory;
  readonly response: NarrationOnlyFullRewriteResponse;
}): string {
  const rendererPackage = adaptNarrationOnlyFullToLegacyRendererPackage({
    sourceStory: args.sourceStory,
    response: args.response,
  });
  return renderCanonicalEnglishFullStory(
    args.sourceStory.episodeNumber,
    rendererPackage,
    args.sourceStory.sourceHash
  );
}

export function computeCanonicalEnglishFullFingerprint(args: {
  readonly lineage: CanonicalEnglishFullArtifact["lineage"];
  readonly prompt: CanonicalEnglishFullArtifact["prompt"];
  readonly model: CanonicalEnglishFullArtifact["model"];
  readonly responseSchema: CanonicalEnglishFullArtifact["responseSchema"];
  readonly preflightRequestFingerprint: string;
  readonly status: CanonicalEnglishFullArtifact["status"];
}): string {
  return hashText(
    stableSerialize({
      lineage: args.lineage,
      prompt: args.prompt,
      model: args.model,
      responseSchema: args.responseSchema,
      preflightRequestFingerprint: args.preflightRequestFingerprint,
      status: args.status,
      schemaVersion: CANONICAL_ENGLISH_FULL_ARTIFACT_SCHEMA_VERSION,
    })
  );
}

export function buildCanonicalEnglishFullArtifact(args: {
  readonly sourceStory: ParsedSourceStory;
  readonly sourceHash: string;
  readonly cleanedSourceHash: string;
  readonly storyIrHash: string;
  readonly contractHash: string;
  readonly contractBuildFingerprint: string;
  readonly prompt: CanonicalEnglishFullArtifact["prompt"];
  readonly model: CanonicalEnglishFullArtifact["model"];
  readonly responseSchema: CanonicalEnglishFullArtifact["responseSchema"];
  readonly preflight: StoryPreflightResult;
  readonly response: NarrationOnlyFullRewriteResponse;
  readonly validationIssues: readonly string[];
  readonly semanticValidationIssues?: readonly string[];
  readonly repairHistory: CanonicalEnglishFullArtifact["repairHistory"];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly status: CanonicalEnglishFullArtifact["status"];
  readonly generatedAt?: string;
}): CanonicalEnglishFullArtifact {
  const artifact: CanonicalEnglishFullArtifact = {
    schemaVersion: CANONICAL_ENGLISH_FULL_ARTIFACT_SCHEMA_VERSION,
    episodeNumber: args.sourceStory.episodeNumber,
    episodeSlug: args.sourceStory.slug,
    language: "en",
    locale: getLanguageProfile("en").locale,
    variant: "full",
    sourceFile: args.sourceStory.sourceFile,
    lineage: {
      sourceHash: args.sourceHash,
      cleanedSourceHash: args.cleanedSourceHash,
      storyIrHash: args.storyIrHash,
      contractHash: args.contractHash,
      contractBuildFingerprint: args.contractBuildFingerprint,
    },
    prompt: args.prompt,
    model: args.model,
    responseSchema: args.responseSchema,
    preflight: canonicalPreflightSchema.parse({
      policyVersion: args.preflight.status === "blocked"
        ? args.preflight.diagnostics.policyVersion
        : args.preflight.diagnostics.policyVersion,
      requestFingerprint: args.preflight.requestFingerprint,
      status: args.preflight.status,
      ...(args.preflight.status === "blocked"
        ? {
            failureCodes: args.preflight.failureCodes,
            reason: args.preflight.reason,
          }
        : {}),
      requestedOutputTokens: args.preflight.diagnostics.requestedOutputTokens,
      contextWindowTokens: args.preflight.diagnostics.contextWindowTokens,
      maxModelOutputTokens: args.preflight.diagnostics.maxModelOutputTokens,
      safetyMarginTokens: args.preflight.diagnostics.safetyMarginTokens,
    }),
    response: args.response,
    validation: {
      status:
        args.status === "blocked-preflight"
          ? "blocked-preflight"
          : args.validationIssues.length > 0
            ? "failed"
            : "passed",
      issues: [...args.validationIssues],
      ...(args.semanticValidationIssues
        ? { semanticIssues: [...args.semanticValidationIssues] }
        : {}),
    },
    provenance: "generated",
    repairHistory: args.repairHistory,
    usage: {
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    },
    estimatedCostUsd: args.estimatedCostUsd,
    status: args.status,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
  };
  canonicalEnglishFullArtifactSchema.parse(artifact);
  return artifact;
}

export function buildCanonicalEnglishFullManifest(args: {
  readonly artifact: CanonicalEnglishFullArtifact;
  readonly canonicalPaths: CanonicalEnglishFullPaths;
  readonly canonicalMarkdown: string;
  readonly canonicalMarkdownHash: string;
  readonly rootCompatibilityMarkdownHash: string;
}): CanonicalEnglishFullManifest {
  const canonicalArtifactHash = hashText(stableSerialize(args.artifact));
  const canonicalFingerprint = computeCanonicalEnglishFullFingerprint({
    lineage: args.artifact.lineage,
    prompt: args.artifact.prompt,
    model: args.artifact.model,
    responseSchema: args.artifact.responseSchema,
    preflightRequestFingerprint: args.artifact.preflight.requestFingerprint,
    status: args.artifact.status,
  });
  const manifest: CanonicalEnglishFullManifest = {
    schemaVersion: CANONICAL_ENGLISH_FULL_MANIFEST_SCHEMA_VERSION,
    episodeNumber: args.artifact.episodeNumber,
    episodeSlug: args.artifact.episodeSlug,
    language: "en",
    locale: args.artifact.locale,
    variant: "full",
    canonicalFingerprint,
    status: args.artifact.status,
    currentArtifactPath: args.canonicalPaths.canonicalArtifactPath,
    currentArtifactHash: canonicalArtifactHash,
    canonicalMarkdownPath: args.canonicalPaths.canonicalMarkdownPath,
    canonicalMarkdownHash: args.canonicalMarkdownHash,
    compatibilityMarkdownPath: args.canonicalPaths.compatibilityMarkdownPath,
    compatibilityMarkdownHash: args.rootCompatibilityMarkdownHash,
    rootCompatibilityMarkdownPath:
      args.canonicalPaths.rootCompatibilityMarkdownPath,
    rootCompatibilityMarkdownHash: args.rootCompatibilityMarkdownHash,
    lineage: args.artifact.lineage,
    prompt: args.artifact.prompt,
    model: args.artifact.model,
    responseSchema: args.artifact.responseSchema,
    preflight: args.artifact.preflight,
    validation: args.artifact.validation,
    latestSuccessfulAttempt:
      args.artifact.status === "completed"
        ? {
            attemptCount: args.artifact.repairHistory.length,
            latestAttemptStatus: "accepted",
            latestAttemptIssues: [],
            latestAttemptAt: args.artifact.generatedAt,
          }
        : undefined,
    lastFailedAttempt:
      args.artifact.status !== "completed"
        ? {
            attemptCount: args.artifact.repairHistory.length,
            latestAttemptStatus:
              args.artifact.status === "blocked-preflight"
                ? "blocked"
                : "rejected",
            latestAttemptIssues: [...args.artifact.validation.issues],
            latestAttemptAt: args.artifact.generatedAt,
          }
        : undefined,
    downstreamInvalidationFingerprint: canonicalFingerprint,
    generatedAt: args.artifact.generatedAt,
    updatedAt: args.artifact.generatedAt,
  };
  canonicalEnglishFullManifestSchema.parse(manifest);
  return manifest;
}

export async function persistCanonicalEnglishFullStory(args: {
  readonly artifact: CanonicalEnglishFullArtifact;
  readonly sourceStory: ParsedSourceStory;
  readonly canonicalPaths: CanonicalEnglishFullPaths;
}): Promise<{
  readonly artifactHash: string;
  readonly canonicalMarkdownHash: string;
  readonly rootCompatibilityMarkdownHash: string;
  readonly manifest: CanonicalEnglishFullManifest;
}> {
  await ensureDir(args.canonicalPaths.canonicalDir);
  const canonicalMarkdown = buildCanonicalNarrationMarkdown({
    sourceStory: args.sourceStory,
    response: args.artifact.response,
  });
  const compatibilityMarkdown = buildCompatibilityResponseMarkdown({
    sourceStory: args.sourceStory,
    response: args.artifact.response,
  });
  const canonicalMarkdownHash = hashText(canonicalMarkdown);
  const rootCompatibilityMarkdownHash = hashText(compatibilityMarkdown);
  const manifest = buildCanonicalEnglishFullManifest({
    artifact: args.artifact,
    canonicalPaths: args.canonicalPaths,
    canonicalMarkdown,
    canonicalMarkdownHash,
    rootCompatibilityMarkdownHash,
  });
  const artifactHash = hashText(stableSerialize(args.artifact));
  await writeJsonAtomic(args.canonicalPaths.canonicalArtifactPath, args.artifact);
  await writeTextAtomicIfChanged(
    args.canonicalPaths.canonicalMarkdownPath,
    canonicalMarkdown,
    true
  );
  await writeTextAtomicIfChanged(
    args.canonicalPaths.compatibilityMarkdownPath,
    compatibilityMarkdown,
    true
  );
  await writeJsonAtomic(
    path.join(args.canonicalPaths.canonicalDir, "generation-manifest.json"),
    manifest
  );
  return {
    artifactHash,
    canonicalMarkdownHash,
    rootCompatibilityMarkdownHash,
    manifest,
  };
}

export async function readCanonicalEnglishFullManifest(
  canonicalPaths: CanonicalEnglishFullPaths
): Promise<CanonicalEnglishFullManifest | null> {
  return readJsonIfExists(
    path.join(canonicalPaths.canonicalDir, "generation-manifest.json"),
    (value) => canonicalEnglishFullManifestSchema.parse(value)
  );
}

export async function readCanonicalEnglishFullArtifact(
  canonicalPaths: CanonicalEnglishFullPaths
): Promise<CanonicalEnglishFullArtifact | null> {
  return readJsonIfExists(canonicalPaths.canonicalArtifactPath, (value) =>
    canonicalEnglishFullArtifactSchema.parse(value)
  );
}

export async function resolveCanonicalEnglishFullResume(args: {
  readonly canonicalPaths: CanonicalEnglishFullPaths;
  readonly expectedCanonicalFingerprint: string;
}): Promise<
  | { readonly eligible: false }
  | {
      readonly eligible: true;
      readonly artifact: CanonicalEnglishFullArtifact;
      readonly manifest: CanonicalEnglishFullManifest;
    }
> {
  const manifest = await readCanonicalEnglishFullManifest(args.canonicalPaths);
  if (
    !manifest ||
    manifest.status !== "completed" ||
    manifest.canonicalFingerprint !== args.expectedCanonicalFingerprint
  ) {
    return { eligible: false };
  }
  const artifact = await readCanonicalEnglishFullArtifact(args.canonicalPaths);
  if (!artifact) {
    return { eligible: false };
  }
  if (
    artifact.status !== "completed" ||
    computeCanonicalEnglishFullFingerprint({
      lineage: artifact.lineage,
      prompt: artifact.prompt,
      model: artifact.model,
      responseSchema: artifact.responseSchema,
      preflightRequestFingerprint: artifact.preflight.requestFingerprint,
      status: artifact.status,
    }) !== args.expectedCanonicalFingerprint
  ) {
    return { eligible: false };
  }
  return {
    eligible: true,
    artifact,
    manifest,
  };
}
