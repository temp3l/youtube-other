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
  STORY_PRODUCTION_ANALYSIS_V2_SCHEMA_VERSION,
  SCRIPT_PRODUCTION_MIN_SCORE,
  buildStoryProductionAnalysisAffectReferenceIndex,
  computeStoryProductionAnalysisFingerprint,
  computeStoryProductionAnalysisV2Fingerprint,
  storyProductionAnalysisArtifactSchema,
  type StoryProductionAnalysisArtifact,
  type StoryProductionAnalysisInput,
  type StoryProductionAnalysisFormat,
  type StoryProductionAnalysisVersion,
} from "./story-production-analysis.js";
import { stableSerialize } from "./stable-json.js";
import {
  localizedAffectNarrationResponseSchema,
  narrationOnlyFullRewriteResponseSchema,
} from "./story-prompt-response-schemas.js";
import {
  inspectHorrorAffectPlanArtifact,
  resolveHorrorAffectPlanArtifactPaths,
} from "./horror-affect-plan.persistence.js";
import {
  buildStoryAnalysisDeterministicContractResult,
  type StoryAnalysisDeterministicCheckId,
  type StoryAnalysisDeterministicContractResult,
} from "./story-quality-gate.js";

const localizedFullArtifactSchema = z
  .object({
    schemaVersion: z.string().min(1),
    sourceFormat: z.enum(["narration-only", "legacy-mixed"]).optional(),
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
    result: z.union([
      narrationOnlyFullRewriteResponseSchema,
      localizedAffectNarrationResponseSchema,
    ]),
  })
  .passthrough();

const localizationFidelityArtifactSchema = z
  .object({
    status: z.enum([
      "READY",
      "READY_WITH_MINOR_EDITS",
      "REVISION_REQUIRED",
      "REWRITE_REQUIRED",
    ]),
    durationRatio: z.number().nonnegative(),
    missingCharacters: z.array(z.string()),
    finalConsequencePreserved: z.boolean(),
    affectCausalityPreserved: z.boolean().optional(),
    issues: z.array(
      z
        .object({
          code: z.string().min(1),
          message: z.string().min(1),
        })
        .passthrough()
    ),
  })
  .passthrough();

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
  readonly localizationFidelityPath?: string | undefined;
  readonly canonicalArtifactPath?: string | undefined;
  readonly affectPlanArtifactPath?: string | undefined;
}

export interface StoryProductionAnalysisSourceDescriptor {
  readonly episode: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly locale: string;
  readonly format: StoryProductionAnalysisFormat;
  readonly sourceArtifactPath: string;
  readonly storyText: string;
  readonly sourceContentFingerprint: string;
  readonly sourceLineageFingerprint: string;
  readonly source: StoryProductionAnalysisInput;
  readonly analysisPaths: StoryProductionAnalysisPaths;
  readonly lineagePresent: boolean;
  readonly lineageCurrent: boolean;
  readonly deterministicContractResult: StoryAnalysisDeterministicContractResult;
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
  readonly analysisVersion?: StoryProductionAnalysisVersion;
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
  readonly format?: StoryProductionAnalysisFormat;
}): StoryProductionAnalysisPaths {
  const format = args.format ?? "full";
  const episodeDir = ensureWorkspacePath(
    args.outputRoot,
    path.join(args.outputRoot, args.episodeSlug)
  );
  const storyDir = ensureWorkspacePath(
    args.outputRoot,
    path.join(episodeDir, args.language, format)
  );
  const storyProductionDirectory = resolveEpisodeStoryProductionDirectory(
    resolveEpisodeCacheDirectory(args.outputRoot, args.episodeSlug),
    {
      episodeNumber:
        /^(\d{3})[-_]/u.exec(args.episodeSlug)?.[1] ?? args.episodeSlug,
      slug: args.episodeSlug,
    }
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
            storyProductionDirectory,
            `${args.language}-full-narration-result.json`
          ),
          localizationFidelityPath: path.join(
            storyProductionDirectory,
            `${args.language}-localization-fidelity.json`
          ),
        }),
    canonicalArtifactPath: resolveCanonicalEnglishFullPaths(
      args.outputRoot,
      args.episodeSlug
    ).canonicalArtifactPath,
    affectPlanArtifactPath: resolveHorrorAffectPlanArtifactPaths({
      outputDirectory: args.outputRoot,
      episodeSlug: args.episodeSlug,
    }).artifactPath,
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

function deterministicFailuresFromIssues(
  issues: readonly string[]
): Partial<Record<StoryAnalysisDeterministicCheckId, string>> {
  const failures: Partial<Record<StoryAnalysisDeterministicCheckId, string>> =
    {};
  const matches = (pattern: RegExp): string | undefined =>
    issues.find((issue) => pattern.test(issue));
  const sourceIssue = matches(/source|fidel|immutable|plot|fact/iu);
  const finalIssue = matches(/final|ending|consequence|sting/iu);
  const renameIssue = matches(/rename|alias|character.*name/iu);
  const durationIssue = matches(/duration|word.*range|length/iu);
  const narrationIssue = matches(/narration|metadata|instruction|format/iu);
  const affectIssue = matches(/affect|question|payoff|response|surprise/iu);
  if (sourceIssue) failures["source-fidelity"] = sourceIssue;
  if (finalIssue) failures["accepted-final-line"] = finalIssue;
  if (renameIssue) failures["rename-map"] = renameIssue;
  if (durationIssue) failures.duration = durationIssue;
  if (narrationIssue) failures["narration-only"] = narrationIssue;
  if (affectIssue) failures["affect-projection"] = affectIssue;
  return failures;
}

async function resolveAffectPlanContext(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
}): Promise<{
  readonly affectReferenceIndex?: StoryProductionAnalysisInput["affectReferenceIndex"];
  readonly affectFailure?: string;
}> {
  const inspected = await inspectHorrorAffectPlanArtifact({
    paths: resolveHorrorAffectPlanArtifactPaths({
      outputDirectory: args.outputRoot,
      episodeSlug: args.episodeSlug,
    }),
  });
  if (inspected.status.state === "missing") {
    return {};
  }
  if (
    inspected.status.state !== "current" ||
    !inspected.artifact?.plan ||
    !inspected.artifact.plan.validation.valid
  ) {
    return {
      affectFailure:
        inspected.status.reasons[0]?.message ??
        inspected.artifact?.validationIssues[0]?.message ??
        "The persisted horror affect plan is invalid.",
    };
  }
  return {
    affectReferenceIndex: buildStoryProductionAnalysisAffectReferenceIndex(
      inspected.artifact.plan
    ),
  };
}

export async function resolveStoryProductionAnalysisSource(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly format?: StoryProductionAnalysisFormat;
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
    throw new Error(
      `Missing persisted rewritten story at ${paths.scriptPath}.`
    );
  }
  const format = args.format ?? "full";
  const affectContext = await resolveAffectPlanContext({
    outputRoot: args.outputRoot,
    episodeSlug,
  });
  if (format === "short") {
    const parent = await resolveStoryProductionAnalysisSource({
      outputRoot: args.outputRoot,
      episodeSlug,
      language,
      format: "full",
    });
    return {
      episode: parent.episode,
      episodeSlug,
      language,
      locale: profile.locale,
      format,
      sourceArtifactPath: parent.sourceArtifactPath,
      storyText,
      sourceContentFingerprint: hashNormalizedText(storyText),
      sourceLineageFingerprint: hashText(
        stableSerialize({
          parentSourceContentFingerprint: parent.sourceContentFingerprint,
          parentSourceLineageFingerprint: parent.sourceLineageFingerprint,
          format,
        })
      ),
      source: {
        storyText,
        paragraphCount: storyText.split(/\n{2,}/u).filter(Boolean).length,
        language,
        locale: profile.locale,
        format,
        canonicalEnglishText:
          parent.source.canonicalEnglishText ?? parent.storyText,
        ...(parent.source.affectReferenceIndex
          ? { affectReferenceIndex: parent.source.affectReferenceIndex }
          : {}),
      },
      analysisPaths: paths,
      lineagePresent: parent.lineagePresent,
      lineageCurrent: parent.lineageCurrent,
      deterministicContractResult: parent.deterministicContractResult,
    };
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
    const failures = deterministicFailuresFromIssues(
      canonicalArtifact.validation.issues
    );
    if (
      canonicalArtifact.status !== "completed" ||
      canonicalArtifact.validation.status !== "passed"
    ) {
      failures["source-fidelity"] =
        canonicalArtifact.validation.issues[0] ??
        `Canonical validation status is ${canonicalArtifact.validation.status}.`;
    }
    if (
      canonicalArtifact.characterRenameMap.hash !==
      canonicalArtifact.lineage.characterRenameMapHash
    ) {
      failures["rename-map"] =
        "The canonical rename-map hash does not match lineage.";
    }
    if (
      canonicalArtifact.snapshot &&
      canonicalArtifact.snapshot.canonicalContentHash !==
        hashText(
          canonicalArtifact.response.full.narrationParagraphs.join("\n\n")
        )
    ) {
      failures["canonical-identity"] =
        "The accepted canonical content hash does not match the narration.";
    }
    if (affectContext.affectFailure) {
      failures["affect-projection"] = affectContext.affectFailure;
    }
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
        ...(affectContext.affectReferenceIndex
          ? { affectReferenceIndex: affectContext.affectReferenceIndex }
          : {}),
      },
      analysisPaths: paths,
      lineagePresent: true,
      lineageCurrent: true,
      deterministicContractResult:
        buildStoryAnalysisDeterministicContractResult({ failures }),
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
    const failures = {
      "source-lineage": "Localized narration lineage is missing or invalid.",
      "source-fidelity":
        localizedArtifact?.validationIssues[0] ??
        "Localized narration validation could not be proven.",
      ...(affectContext.affectFailure
        ? { "affect-projection": affectContext.affectFailure }
        : {}),
    };
    return {
      episode: /^(\d{3})[-_]/u.exec(args.episodeSlug)?.[1] ?? args.episodeSlug,
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
        ...(affectContext.affectReferenceIndex
          ? { affectReferenceIndex: affectContext.affectReferenceIndex }
          : {}),
      },
      analysisPaths: paths,
      lineagePresent: false,
      lineageCurrent: false,
      deterministicContractResult:
        buildStoryAnalysisDeterministicContractResult({ failures }),
    };
  }
  const fidelityArtifact = paths.localizationFidelityPath
    ? await readJsonIfExists(paths.localizationFidelityPath, (value) =>
        localizationFidelityArtifactSchema.parse(value)
      )
    : null;
  const lineageCurrent =
    Boolean(canonicalArtifact) &&
    Boolean(canonicalManifest) &&
    canonicalArtifact?.status === "completed" &&
    canonicalArtifact?.validation.status === "passed" &&
    localizedArtifact.lineage.fingerprint ===
      canonicalManifest?.canonicalFingerprint;
  const failures = deterministicFailuresFromIssues([
    ...localizedArtifact.validationIssues,
    ...(fidelityArtifact?.issues.map((issue) => issue.message) ?? []),
  ]);
  if (!lineageCurrent) {
    failures["source-lineage"] =
      "Localized lineage does not match the accepted canonical fingerprint.";
    failures["canonical-identity"] =
      "Localized canonical identity is stale or missing.";
  }
  if (localizedArtifact.sourceFormat === "legacy-mixed") {
    failures["narration-only"] =
      "Localized output uses the legacy mixed payload instead of narration-only output.";
  }
  if (
    fidelityArtifact &&
    !["READY", "READY_WITH_MINOR_EDITS"].includes(fidelityArtifact.status)
  ) {
    failures["source-fidelity"] =
      `Localization fidelity status is ${fidelityArtifact.status}.`;
  }
  if (fidelityArtifact && !fidelityArtifact.finalConsequencePreserved) {
    failures["accepted-final-line"] =
      "The localized narration does not preserve the accepted final consequence.";
  }
  if (fidelityArtifact && fidelityArtifact.missingCharacters.length > 0) {
    failures["rename-map"] =
      `Localized narration omits accepted renamed characters: ${fidelityArtifact.missingCharacters.join(", ")}.`;
  }
  if (
    fidelityArtifact?.issues.some((issue) =>
      /DURATION|ABRIDGEMENT/iu.test(issue.code)
    )
  ) {
    failures.duration =
      fidelityArtifact.issues.find((issue) =>
        /DURATION|ABRIDGEMENT/iu.test(issue.code)
      )?.message ?? "Localized duration is outside the accepted contract.";
  }
  if (fidelityArtifact?.affectCausalityPreserved === false) {
    failures["affect-projection"] =
      "Localized affect causality does not match the accepted projection.";
  } else if (affectContext.affectFailure) {
    failures["affect-projection"] = affectContext.affectFailure;
  }
  return {
    episode: /^(\d{3})[-_]/u.exec(args.episodeSlug)?.[1] ?? args.episodeSlug,
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
      ...((
        lineageCurrent && canonicalArtifact
          ? await readTextIfExists(
              resolveCanonicalEnglishFullPaths(args.outputRoot, episodeSlug)
                .canonicalMarkdownPath
            )
          : null
      )
        ? {
            canonicalEnglishText:
              (await readTextIfExists(
                resolveCanonicalEnglishFullPaths(args.outputRoot, episodeSlug)
                  .canonicalMarkdownPath
              )) ?? "",
          }
        : {}),
      ...(affectContext.affectReferenceIndex
        ? { affectReferenceIndex: affectContext.affectReferenceIndex }
        : {}),
    },
    analysisPaths: paths,
    lineagePresent: true,
    lineageCurrent,
    deterministicContractResult: buildStoryAnalysisDeterministicContractResult({
      failures,
    }),
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
    storyProductionAnalysisArtifactSchema.parse(args.artifact)
  );
}

export async function resolveStoryProductionAnalysisStatus(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly format?: StoryProductionAnalysisFormat;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly analysisVersion?: StoryProductionAnalysisVersion;
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
      ? (args.analysisVersion ??
          (artifact.schemaVersion ===
          STORY_PRODUCTION_ANALYSIS_V2_SCHEMA_VERSION
            ? "v2"
            : "v1")) === "v2"
        ? computeStoryProductionAnalysisV2Fingerprint({
            sourceContentFingerprint: source.sourceContentFingerprint,
            sourceLineageFingerprint: source.sourceLineageFingerprint,
            language: source.language,
            locale: source.locale,
            format: source.format,
            sourceArtifactPath: source.sourceArtifactPath,
            model: args.model,
            reasoningEffort: args.reasoningEffort,
            affectPlanHash:
              source.source.affectReferenceIndex?.planHash ?? null,
          })
        : computeStoryProductionAnalysisFingerprint({
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
    analysisVersion:
      artifact.schemaVersion === STORY_PRODUCTION_ANALYSIS_V2_SCHEMA_VERSION
        ? "v2"
        : "v1",
    ...(artifact ? { artifact } : {}),
  };
}

export function buildStoryProductionInspectPayload(args: {
  readonly source: StoryProductionAnalysisSourceDescriptor;
  readonly status: StoryProductionAnalysisStatus;
}): Record<string, unknown> {
  const artifact = args.status.artifact;
  const advisory =
    artifact?.schemaVersion === STORY_PRODUCTION_ANALYSIS_V2_SCHEMA_VERSION
      ? {
          mode: artifact.analysisMode,
          overallScore: artifact.qualitativeOverallScore,
          verdict: artifact.qualitativeVerdict,
          evidenceSummary: artifact.evidenceSummary,
        }
      : undefined;
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
    minimumScore: SCRIPT_PRODUCTION_MIN_SCORE,
    failedProductionGates: args.status.failedProductionGates,
    blockingIssueCount: args.status.blockingIssueCount,
    requiredChangeCount: args.status.requiredChangeCount,
    model: args.status.model,
    reasoningEffort: args.status.reasoningEffort,
    analyzedAt: args.status.analyzedAt,
    estimatedCost: args.status.estimatedCost,
    analysisVersion: args.status.analysisVersion,
    ...(advisory ? { advisory } : {}),
    lineagePresent: args.source.lineagePresent,
    lineageCurrent: args.source.lineageCurrent,
    deterministicContractResults: args.source.deterministicContractResult,
  };
}

export async function assertScriptScoreGate(args: {
  readonly outputRoot: string;
  readonly episode: string;
  readonly locale: string;
  readonly format: StoryProductionAnalysisFormat;
}): Promise<StoryProductionAnalysisStatus> {
  let status: StoryProductionAnalysisStatus;
  try {
    status = await resolveStoryProductionAnalysisStatus({
      outputRoot: args.outputRoot,
      episodeSlug: args.episode,
      language: args.locale,
      format: args.format,
    });
  } catch (error) {
    throw new Error(
      `Script analysis is missing or stale for ${args.episode} ${args.locale}/${args.format}. Run stories analyze --episode ${args.episode} --language ${args.locale} --format ${args.format}.`,
      { cause: error }
    );
  }
  if (!status.analysisCurrent) {
    throw new Error(
      `Script analysis is ${status.analysisState.toLowerCase()} for ${args.episode} ${args.locale}/${args.format}. Run stories analyze --episode ${args.episode} --language ${args.locale} --format ${args.format}.`
    );
  }
  if ((status.overallScore ?? 0) < SCRIPT_PRODUCTION_MIN_SCORE) {
    throw new Error(
      `Script score ${status.overallScore ?? 0}/100 is below required minimum ${SCRIPT_PRODUCTION_MIN_SCORE}.`
    );
  }
  if (!status.pass) {
    throw new Error(
      `Script production analysis failed gates: ${status.failedProductionGates.join(", ") || "unknown"}.`
    );
  }
  return status;
}
