import fs from "node:fs/promises";
import path from "node:path";
import {
  copyAtomic,
  fileExists,
  hashText,
  readJsonIfExists,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import {
  applyPronunciationTransforms,
  type PronunciationChunkTransform,
} from "./pronunciation.js";
import {
  assembleNarration,
  type NarrationAssemblyResult,
} from "./narration-assembly.js";
import {
  buildOpenAiTtsChunkRequest,
  type OpenAiSpeechOutputFormat,
} from "./openai-tts-request.js";
import {
  buildPerformanceDirections,
} from "./performance-direction.js";
import {
  computeNarrationChunkFingerprintFromRequest,
  generateNarrationChunkWithCache,
  narrationChunkCacheRecordPath,
  narrationChunkCacheRecordSchema,
  type NarrationChunkCacheDecision,
  type NarrationChunkCacheRecord,
} from "./narration-cache.js";
import {
  createNarrationArtifactPaths,
  type NarrationArtifactPathSet,
  type NarrationVariant,
} from "./narration-paths.js";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  narrationAssemblyManifestSchema,
  narrationChunkManifestSchema,
  narrationChunkValidationReportSchema,
  narrationDirectionSetSchema,
  narrationGenerationMetadataSchema,
  narrationMasteringMetadataSchema,
  narrationQualityGateReportSchema,
  spokenNarrationArtifactSchema,
  type NarrationAssemblyManifest,
  type NarrationChunk,
  type NarrationChunkManifest,
  type NarrationChunkValidationReport,
  type NarrationDirection,
  type NarrationDirectionSet,
  type NarrationGenerationMetadata,
  type NarrationMasteringMetadata,
  type NarrationQualityGateReport,
} from "./narration-schemas.js";
import {
  masterNarration,
  type NarrationMasteringProfile,
} from "./mastering.js";
import {
  prepareSpokenNarration,
} from "./spoken-narration.js";
import {
  segmentNarration,
} from "./narration-segmentation.js";
import {
  validateChunkAudio,
  type ProbeAudioMetadata,
} from "./audio-validation.js";
import {
  runNarrationQualityGate,
} from "./narration-quality-gate.js";
import { recordNarrationTelemetry } from "./narration-telemetry.js";

export const narrationPipelineModeSchema = z.enum(["legacy", "shadow", "new"]);
export type NarrationPipelineMode = z.infer<typeof narrationPipelineModeSchema>;

export const narrationPipelineStageSchema = z.enum([
  "prepare",
  "plan",
  "generate",
  "assemble",
  "validate",
  "status",
  "inspect",
  "all",
]);
export type NarrationPipelineStage = z.infer<typeof narrationPipelineStageSchema>;

/**
 * Machine-readable narration pipeline exit codes used by CLI adapters.
 *
 * 0 means all requested targets are ready or planned; 1 is reserved for
 * caller/config validation; 2 means generation failed; 3 means validation or
 * assembly blocked output; 4 is reserved for strict warning handling.
 */
export const narrationPipelineExitCode = {
  ok: 0,
  userError: 1,
  generationFailed: 2,
  validationBlocked: 3,
  partialWarning: 4,
} as const;

export interface NarrationChunkSynthesisRequest {
  readonly chunkId: string;
  readonly text: string;
  readonly instructions: string;
  readonly outputPath: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly targetDurationSeconds?: number;
}

export interface NarrationPipelineRequest {
  readonly episodeDir: string;
  readonly episodeId?: string;
  readonly language: string;
  readonly locale?: string;
  readonly variant?: NarrationVariant;
  readonly stage: NarrationPipelineStage;
  readonly rolloutMode?: NarrationPipelineMode;
  readonly resume?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly validationOnly?: boolean;
  readonly concurrency?: number;
  readonly model?: string;
  readonly voice?: string;
  readonly speed?: number;
  readonly outputFormat?: OpenAiSpeechOutputFormat;
  readonly baseVoiceInstructions?: string;
  readonly masteringProfile?: NarrationMasteringProfile;
  readonly runFfmpeg?: (args: readonly string[]) => Promise<void>;
  readonly probeAudio?: (filePath: string) => Promise<ProbeAudioMetadata>;
  readonly synthesizeChunk?: (request: NarrationChunkSynthesisRequest) => Promise<void>;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
    error?(value: Record<string, unknown>, message?: string): void;
  };
}

export interface NarrationPipelineStageResult {
  readonly stage: Exclude<NarrationPipelineStage, "all">;
  readonly status: "planned" | "skipped" | "completed" | "blocked" | "failed";
  readonly outputPaths: readonly string[];
  readonly message?: string;
}

export interface NarrationPipelineResult {
  readonly episodeId: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly rolloutMode: NarrationPipelineMode;
  readonly dryRun: boolean;
  readonly stages: readonly NarrationPipelineStageResult[];
  readonly paths: NarrationArtifactPathSet;
  readonly exitCode: number;
  readonly status: "ready" | "planned" | "blocked" | "failed";
}

const generatedStages = [
  "prepare",
  "plan",
  "generate",
  "assemble",
  "validate",
] as const satisfies readonly Exclude<NarrationPipelineStage, "all" | "status" | "inspect">[];

function localeForLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error("Narration language is required.");
  }
  return normalized.split("-", 1)[0] ?? normalized;
}

function normalizeStage(stage: NarrationPipelineStage): readonly Exclude<NarrationPipelineStage, "all">[] {
  if (stage === "all") {
    return generatedStages;
  }
  if (stage === "status" || stage === "inspect") {
    return [stage];
  }
  const index = generatedStages.indexOf(stage);
  return generatedStages.slice(0, index + 1);
}

function stageResult(input: NarrationPipelineStageResult): NarrationPipelineStageResult {
  return input;
}

async function readRequiredText(filePath: string, label: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

async function readRequiredJson<T>(
  filePath: string,
  parser: (value: unknown) => T,
  label: string
): Promise<T> {
  const parsed = await readJsonIfExists(filePath, parser);
  if (!parsed) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
  return parsed;
}

async function existingStatus(paths: NarrationArtifactPathSet): Promise<NarrationPipelineStageResult[]> {
  const checks = [
    ["prepare", paths.spokenTextJson],
    ["plan", paths.chunkManifest],
    ["plan", paths.performanceDirections],
    ["plan", paths.pronunciationTransforms],
    ["generate", path.join(paths.chunkAudioDir, "narr-chunk-001.cache.json")],
    ["assemble", paths.assemblyManifest],
  ] as const;
  const grouped = new Map<Exclude<NarrationPipelineStage, "all">, string[]>();
  for (const [stage, filePath] of checks) {
    if (await fileExists(filePath)) {
      grouped.set(stage, [...(grouped.get(stage) ?? []), filePath]);
    }
  }
  const results = [...grouped.entries()].map(([stage, outputPaths]) =>
    stageResult({
      stage,
      status: "completed",
      outputPaths,
    })
  );
  const qualityGate = await readJsonIfExists(
    paths.qualityGateJson,
    (value) => narrationQualityGateReportSchema.parse(value)
  );
  if (qualityGate) {
    results.push(
      stageResult({
        stage: "validate",
        status: qualityGate.outcome === "BLOCKED" ? "blocked" : "completed",
        outputPaths: [paths.qualityGateJson],
        message: qualityGate.outcome,
      })
    );
  }
  return results;
}

function completed(result: NarrationPipelineStageResult | undefined): boolean {
  return result?.status === "completed" || result?.status === "skipped";
}

function resultExitCode(stages: readonly NarrationPipelineStageResult[]): number {
  if (stages.some((stage) => stage.status === "failed")) {
    return narrationPipelineExitCode.generationFailed;
  }
  if (stages.some((stage) => stage.status === "blocked")) {
    return narrationPipelineExitCode.validationBlocked;
  }
  return narrationPipelineExitCode.ok;
}

function buildGenerationMetadata(input: {
  readonly request: RequiredCoreRequest;
  readonly paths: NarrationArtifactPathSet;
  readonly chunkManifest: NarrationChunkManifest;
  readonly records: readonly NarrationChunkCacheRecord[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly stageResults: readonly NarrationPipelineStageResult[];
}): NarrationGenerationMetadata {
  const model = input.request.model ?? "gpt-4o-mini-tts";
  const voice = input.request.voice ?? "onyx";
  return narrationGenerationMetadataSchema.parse({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: input.request.episodeId,
    locale: input.request.locale,
    variant: input.request.variant,
    pipelineMode: input.request.rolloutMode,
    sourceHashes: {
      storyHash: input.chunkManifest.sourceSpokenTextHash,
      spokenTextHash: input.chunkManifest.sourceSpokenTextHash,
    },
    artifactFingerprints: [
      {
        owner: "audio",
        artifactType: "chunk-manifest",
        fingerprint: input.chunkManifest.manifestFingerprint,
      },
      ...input.records.map((record) => ({
        owner: "audio" as const,
        artifactType: "tts-chunk",
        fingerprint: record.chunkFingerprint,
      })),
    ],
    stageStatuses: input.stageResults
      .filter((stage) => stage.stage !== "status" && stage.stage !== "inspect")
      .map((stage) => ({
        stage:
          stage.stage === "prepare"
            ? "spoken_narration"
            : stage.stage === "plan"
              ? "segmentation"
              : stage.stage === "generate"
                ? "generation"
                : stage.stage === "assemble"
                  ? "assembly"
                  : "quality_gate",
        status:
          stage.status === "completed" || stage.status === "skipped"
            ? "completed"
            : stage.status === "planned"
              ? "pending"
              : "failed",
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      })),
    openAi: { model, voice },
    usageCounters: {
      chunksRequested: input.chunkManifest.chunks.length,
      chunksGenerated: input.records.length,
      chunksFailed: Math.max(0, input.chunkManifest.chunks.length - input.records.length),
      retries: 0,
      cacheHits: 0,
      cacheMisses: input.records.length,
    },
    fallbackUsage: { used: false, count: 0, reasons: [] },
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    finalOutputs: {
      cleanNarrationPath: path.relative(input.paths.narrationRoot, input.paths.cleanNarration),
      masteredNarrationPath: path.relative(input.paths.narrationRoot, input.paths.masteredNarration),
      compatibilityNarrationPath: path.relative(input.paths.narrationRoot, input.paths.compatibilityNarration),
      rootCompatibilityNarrationPath: path.relative(input.paths.narrationRoot, input.paths.rootCompatibilityNarration),
    },
  });
}

type RequiredCoreRequest = NarrationPipelineRequest & {
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly rolloutMode: NarrationPipelineMode;
};

function requireCore(request: NarrationPipelineRequest): RequiredCoreRequest {
  const episodeDir = path.resolve(request.episodeDir);
  const episodeId = request.episodeId ?? path.basename(episodeDir);
  const locale = request.locale ?? localeForLanguage(request.language);
  const variant = request.variant ?? "full";
  const rolloutMode = narrationPipelineModeSchema.parse(request.rolloutMode ?? "legacy");
  return { ...request, episodeDir, episodeId, locale, variant, rolloutMode };
}

export class NarrationPipeline {
  public async run(requestInput: NarrationPipelineRequest): Promise<NarrationPipelineResult> {
    const request = requireCore(requestInput);
    const stage = narrationPipelineStageSchema.parse(request.stage);
    const paths = createNarrationArtifactPaths({
      episodeId: request.episodeId,
      locale: request.locale,
      variant: request.variant,
      episodeRoot: request.episodeDir,
    });
    const selectedStages = normalizeStage(stage);
    if (request.dryRun) {
      const stages = selectedStages.map((selectedStage) =>
        stageResult({
          stage: selectedStage,
          status: "planned",
          outputPaths: outputsForStage(selectedStage, paths),
        })
      );
      return this.result(request, paths, stages, "planned");
    }
    if (stage === "status" || stage === "inspect") {
      const status = await existingStatus(paths);
      return this.result(
        request,
        paths,
        [
          stageResult({
          stage,
          status: "completed",
          outputPaths: stage === "inspect" ? outputsForStage("inspect", paths) : [],
          ...(status.length === 0 ? { message: "No staged narration artifacts found." } : {}),
        }),
          ...status,
        ],
        status.some((item) => item.stage === "validate") ? "ready" : "blocked"
      );
    }
    if (request.rolloutMode === "legacy") {
      return this.result(
        request,
        paths,
        [
          stageResult({
            stage: selectedStages[selectedStages.length - 1] ?? "status",
            status: "blocked",
            outputPaths: [],
            message: "Staged narration requires narrationPipelineMode=new or shadow.",
          }),
        ],
        "blocked"
      );
    }

    const startedAt = new Date().toISOString();
    const results: NarrationPipelineStageResult[] = [];
    for (const selectedStage of selectedStages) {
      if (selectedStage === "status" || selectedStage === "inspect") {
        continue;
      }
      try {
        if (selectedStage === "prepare") {
          results.push(await this.prepare(request, paths));
        } else if (selectedStage === "plan") {
          if (!completed(results.find((item) => item.stage === "prepare"))) {
            break;
          }
          results.push(await this.plan(request, paths));
        } else if (selectedStage === "generate") {
          if (!completed(results.find((item) => item.stage === "plan"))) {
            break;
          }
          results.push(await this.generate(request, paths));
        } else if (selectedStage === "assemble") {
          if (!completed(results.find((item) => item.stage === "generate"))) {
            break;
          }
          results.push(await this.assemble(request, paths));
        } else if (selectedStage === "validate") {
          results.push(await this.validate(request, paths));
        }
      } catch (error) {
        results.push(
          stageResult({
            stage: selectedStage,
            status: "failed",
            outputPaths: outputsForStage(selectedStage, paths),
            message: error instanceof Error ? error.message : String(error),
          })
        );
        break;
      }
    }
    const completedAt = new Date().toISOString();
    await this.maybeWriteMetadata(request, paths, results, startedAt, completedAt);
    return this.result(request, paths, results, undefined);
  }

  private result(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet,
    stages: readonly NarrationPipelineStageResult[],
    statusOverride: NarrationPipelineResult["status"] | undefined
  ): NarrationPipelineResult {
    const exitCode = resultExitCode(stages);
    return {
      episodeId: request.episodeId,
      language: request.language,
      locale: request.locale,
      variant: request.variant,
      rolloutMode: request.rolloutMode,
      dryRun: Boolean(request.dryRun),
      stages,
      paths,
      exitCode,
      status:
        statusOverride ??
        (exitCode === 0 && stages.some((stage) => stage.stage === "validate" && stage.status === "completed")
          ? "ready"
          : exitCode === 0
            ? "planned"
            : "blocked"),
    };
  }

  private async prepare(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet
  ): Promise<NarrationPipelineStageResult> {
    if (!request.force && await fileExists(paths.spokenTextJson)) {
      return stageResult({ stage: "prepare", status: "skipped", outputPaths: [paths.spokenTextJson, paths.spokenTextMarkdown] });
    }
    const result = await prepareSpokenNarration({
      episodeDir: request.episodeDir,
      episodeId: request.episodeId,
      language: request.language,
      locale: request.locale,
      variant: request.variant,
      ...(request.logger ? { logger: request.logger } : {}),
    });
    return stageResult({
      stage: "prepare",
      status: result.success ? "completed" : "failed",
      outputPaths: [paths.spokenTextJson, ...(result.spokenText ? [paths.spokenTextMarkdown] : [])],
      ...(result.success ? {} : { message: result.warnings.map((warning) => warning.message).join("; ") }),
    });
  }

  private async plan(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet
  ): Promise<NarrationPipelineStageResult> {
    if (
      !request.force &&
      await fileExists(paths.chunkManifest) &&
      await fileExists(paths.performanceDirections) &&
      await fileExists(paths.pronunciationTransforms)
    ) {
      return stageResult({
        stage: "plan",
        status: "skipped",
        outputPaths: [paths.chunkManifest, paths.performanceDirections, paths.pronunciationTransforms],
      });
    }
    const spokenArtifact = await readRequiredJson(paths.spokenTextJson, (value) => spokenNarrationArtifactSchema.parse(value), "Spoken narration artifact");
    if (spokenArtifact.status !== "completed") {
      return stageResult({ stage: "plan", status: "blocked", outputPaths: [paths.spokenTextJson], message: spokenArtifact.failureMessage ?? "Spoken narration is not completed." });
    }
    const spokenText = await readRequiredText(paths.spokenTextMarkdown, "Spoken narration text");
    const segmented = await segmentNarration({
      episodeDir: request.episodeDir,
      episodeId: request.episodeId,
      language: request.language,
      locale: request.locale,
      variant: request.variant,
      spokenText,
      spokenTextHash: spokenArtifact.spokenTextHash,
      ...(request.logger ? { logger: request.logger } : {}),
    });
    const directions = await buildPerformanceDirections({
      episodeDir: request.episodeDir,
      manifest: segmented.manifest,
      language: request.language,
      locale: request.locale,
      variant: request.variant,
      ...(request.logger ? { logger: request.logger } : {}),
    });
    await applyPronunciationTransforms({
      episodeDir: request.episodeDir,
      episodeId: request.episodeId,
      language: request.language,
      locale: request.locale,
      variant: request.variant,
      manifest: segmented.manifest,
      dictionaries: [],
      ...(request.logger ? { logger: request.logger } : {}),
    });
    return stageResult({
      stage: "plan",
      status: "completed",
      outputPaths: [paths.chunkManifest, paths.performanceDirections, paths.pronunciationTransforms],
      message: `Planned ${directions.directionSet.directions.length} narration chunks.`,
    });
  }

  private async generate(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet
  ): Promise<NarrationPipelineStageResult> {
    if (request.validationOnly) {
      return stageResult({ stage: "generate", status: "skipped", outputPaths: [], message: "Validation-only mode skipped generation." });
    }
    const manifest = await readRequiredJson(paths.chunkManifest, (value) => narrationChunkManifestSchema.parse(value), "Chunk manifest");
    const directions = await readRequiredJson(paths.performanceDirections, (value) => narrationDirectionSetSchema.parse(value), "Performance directions");
    const transforms = await readPronunciationTransforms(paths, manifest);
    const model = request.model ?? "gpt-4o-mini-tts";
    const voice = request.voice ?? "onyx";
    const speed = request.speed ?? 1;
    const outputFormat = request.outputFormat ?? "wav";
    const outputPaths: string[] = [];
    const failures: string[] = [];
    const concurrency = Math.min(Math.max(1, request.concurrency ?? 1), Math.max(1, manifest.chunks.length));
    let nextIndex = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (nextIndex < manifest.chunks.length) {
        const current = nextIndex;
        nextIndex += 1;
        const chunk = manifest.chunks[current];
        if (!chunk) {
          continue;
        }
        const direction = directions.directions.find((entry) => entry.chunkId === chunk.chunkId);
        if (!direction) {
          failures.push(`Missing direction for ${chunk.chunkId}.`);
          continue;
        }
        const transformed = transforms.get(chunk.chunkId);
        const decision = await this.generateChunk({
          request,
          paths,
          chunk,
          direction,
          ...(transformed?.text ? { transformedText: transformed.text } : {}),
          model,
          voice,
          speed,
          outputFormat,
        });
        if (decision.outputPath) {
          outputPaths.push(decision.outputPath);
        }
        if (!decision.reusable && decision.reason === "provider_failure") {
          failures.push(decision.message ?? `Generation failed for ${chunk.chunkId}.`);
        }
      }
    });
    await Promise.all(workers);
    if (failures.length > 0) {
      return stageResult({ stage: "generate", status: "failed", outputPaths, message: failures.join("; ") });
    }
    return stageResult({ stage: "generate", status: "completed", outputPaths });
  }

  private async generateChunk(input: {
    readonly request: RequiredCoreRequest;
    readonly paths: NarrationArtifactPathSet;
    readonly chunk: NarrationChunk;
    readonly direction: NarrationDirection;
    readonly transformedText?: string;
    readonly model: string;
    readonly voice: string;
    readonly speed: number;
    readonly outputFormat: OpenAiSpeechOutputFormat;
  }): Promise<NarrationChunkCacheDecision> {
    if (!input.request.synthesizeChunk) {
      return {
        reason: "provider_failure",
        reusable: false,
        chunkId: input.chunk.chunkId,
        chunkFingerprint: hashText(input.chunk.chunkId),
        message: "No narration chunk synthesizer was provided.",
      };
    }
    const requestBuild = buildOpenAiTtsChunkRequest({
      chunk: input.chunk,
      direction: input.direction,
      ...(input.transformedText ? { transformedText: input.transformedText } : {}),
      config: {
        model: input.model,
        voice: input.voice,
        speed: input.speed,
        outputFormat: input.outputFormat,
        language: input.request.language,
        locale: input.request.locale,
        variant: input.request.variant,
        baseVoiceInstructions: input.request.baseVoiceInstructions ?? "Natural, restrained narration.",
      },
    });
    const chunkFingerprint = computeNarrationChunkFingerprintFromRequest({
      chunk: input.chunk,
      direction: input.direction,
      requestBuildResult: requestBuild,
      pronunciationHints: [],
    });
    const outputPath = path.join(input.paths.chunkAudioDir, `${input.chunk.chunkId}.${input.outputFormat}`);
    const startedAt = Date.now();
    const decision = await generateNarrationChunkWithCache({
      narrationRoot: input.paths.narrationRoot,
      chunkId: input.chunk.chunkId,
      chunkFingerprint,
      requestFingerprint: requestBuild.requestFingerprint,
      inputTextHash: requestBuild.promptLogMetadata.inputTextHash,
      instructionHash: requestBuild.promptLogMetadata.instructionHash,
      model: input.model,
      voice: input.voice,
      speed: input.speed,
      outputFormat: input.outputFormat,
      language: input.request.language,
      outputPath,
      synthesizeToTempFile: async (tempPath) => {
        await input.request.synthesizeChunk?.({
          chunkId: input.chunk.chunkId,
          text: requestBuild.request.input,
          instructions: requestBuild.request.instructions,
          outputPath: tempPath,
          model: input.model,
          voice: input.voice,
          speed: input.speed,
          ...(input.chunk.estimatedDurationSeconds !== undefined
            ? { targetDurationSeconds: input.chunk.estimatedDurationSeconds }
            : {}),
        });
        const validationReport = await validateChunkAudio({
          chunkId: input.chunk.chunkId,
          audioPath: tempPath,
          narrationRoot: input.paths.narrationRoot,
          expectedText: requestBuild.request.input,
          language: input.request.language,
          variant: input.request.variant,
          expectedDurationMs: input.chunk.estimatedDurationMs,
          requestFingerprint: requestBuild.requestFingerprint,
          generationFingerprint: chunkFingerprint,
          ...(input.request.probeAudio ? { probeAudio: input.request.probeAudio } : {}),
          ...(input.request.logger ? { logger: input.request.logger } : {}),
        });
        return { validationReport };
      },
    });
    let outputBytes = 0;
    if (decision.outputPath) {
      outputBytes = (await fs.stat(decision.outputPath).catch(() => ({ size: 0 }))).size;
    }
    recordNarrationTelemetry({
      episodeId: input.request.episodeId,
      language: input.request.language,
      variant: input.request.variant,
      chunkId: input.chunk.chunkId,
      stage: "generate",
      model: input.model,
      voice: input.voice,
      attempt: 1,
      latencyMs: Math.max(0, Date.now() - startedAt),
      inputCharacters: requestBuild.request.input.length,
      outputBytes,
      ...(decision.record?.durationMs !== undefined ? { generatedSeconds: decision.record.durationMs / 1000 } : {}),
      cacheDecision: decision.reason,
      validationResult:
        decision.reason === "provider_failure"
          ? "failed"
          : decision.record?.validationStatus ?? (decision.reason === "hit" ? "passed" : "skipped"),
      failureClass: decision.reason === "provider_failure" ? "provider_failure" : undefined,
      regeneration: decision.reason !== "hit" && decision.reason !== "miss",
      fallbackUsed: false,
      details: {
        requestFingerprint: requestBuild.requestFingerprint,
        instructionHash: requestBuild.promptLogMetadata.instructionHash,
      },
    });
    return decision;
  }

  private async assemble(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet
  ): Promise<NarrationPipelineStageResult> {
    if (request.validationOnly) {
      return stageResult({ stage: "assemble", status: "skipped", outputPaths: [], message: "Validation-only mode skipped assembly." });
    }
    if (!request.force && await fileExists(paths.assemblyManifest) && await fileExists(paths.cleanNarration)) {
      return stageResult({ stage: "assemble", status: "skipped", outputPaths: [paths.assemblyManifest, paths.cleanNarration] });
    }
    const manifest = await readRequiredJson(paths.chunkManifest, (value) => narrationChunkManifestSchema.parse(value), "Chunk manifest");
    const directions = await readRequiredJson(paths.performanceDirections, (value) => narrationDirectionSetSchema.parse(value), "Performance directions");
    const records = await readCacheRecords(paths, manifest);
    const validations = await readValidationReports(paths, manifest);
    const assembly = await assembleNarration({
      narrationRoot: paths.narrationRoot,
      chunkManifest: manifest,
      directionSet: directions,
      cacheRecords: records,
      validationReports: validations,
      outputPath: paths.cleanNarration,
      manifestPath: paths.assemblyManifest,
      ...(request.runFfmpeg ? { runFfmpeg: request.runFfmpeg } : {}),
      ...(request.probeAudio ? { probeAudio: request.probeAudio } : {}),
      ...(request.logger ? { logger: request.logger } : {}),
    });
    if (assembly.status === "blocked") {
      return stageResult({ stage: "assemble", status: "blocked", outputPaths: [], message: assembly.errors.join("; ") });
    }
    await this.masterAndPromote(request, paths, assembly);
    return stageResult({ stage: "assemble", status: "completed", outputPaths: [paths.assemblyManifest, paths.cleanNarration, paths.masteredNarration, paths.compatibilityNarration] });
  }

  private async masterAndPromote(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet,
    assembly: Extract<NarrationAssemblyResult, { readonly status: "completed" }>
  ): Promise<void> {
    if (request.masteringProfile) {
      await masterNarration({
        inputPath: assembly.outputPath,
        outputPath: paths.masteredNarration,
        metadataPath: path.join(paths.narrationRoot, "mastering-metadata.json"),
        narrationRoot: paths.narrationRoot,
        profile: request.masteringProfile,
        ...(request.runFfmpeg ? { runFfmpeg: request.runFfmpeg } : {}),
        ...(request.probeAudio ? { probeAudio: request.probeAudio } : {}),
        ...(request.logger ? { logger: request.logger } : {}),
      });
    } else {
      await copyAtomic(assembly.outputPath, paths.masteredNarration);
    }
    if (request.rolloutMode === "new") {
      await copyAtomic(paths.masteredNarration, paths.compatibilityNarration);
      await copyAtomic(paths.masteredNarration, paths.rootCompatibilityNarration);
    }
  }

  private async validate(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet
  ): Promise<NarrationPipelineStageResult> {
    const manifest = await readRequiredJson(paths.chunkManifest, (value) => narrationChunkManifestSchema.parse(value), "Chunk manifest");
    const validations = await readValidationReports(paths, manifest);
    const assembly = await readJsonIfExists(paths.assemblyManifest, (value) => narrationAssemblyManifestSchema.parse(value));
    const mastering = await readJsonIfExists(path.join(paths.narrationRoot, "mastering-metadata.json"), (value) => narrationMasteringMetadataSchema.parse(value));
    const generation = await readJsonIfExists(paths.generationMetadata, (value) => narrationGenerationMetadataSchema.parse(value));
    const report = await runQualityGate({
      request,
      paths,
      manifest,
      validations,
      assembly,
      mastering,
      generation,
    });
    const blocked = report.outcome === "BLOCKED";
    return stageResult({
      stage: "validate",
      status: blocked ? "blocked" : "completed",
      outputPaths: [paths.qualityGateJson, paths.qualityGateMarkdown],
      message: report.outcome,
    });
  }

  private async maybeWriteMetadata(
    request: RequiredCoreRequest,
    paths: NarrationArtifactPathSet,
    results: readonly NarrationPipelineStageResult[],
    startedAt: string,
    completedAt: string
  ): Promise<void> {
    if (!results.some((result) => result.stage === "generate" || result.stage === "assemble" || result.stage === "validate")) {
      return;
    }
    const manifest = await readJsonIfExists(paths.chunkManifest, (value) => narrationChunkManifestSchema.parse(value));
    if (!manifest) {
      return;
    }
    const records = await readCacheRecords(paths, manifest).catch(() => []);
    const metadata = buildGenerationMetadata({
      request,
      paths,
      chunkManifest: manifest,
      records,
      startedAt,
      completedAt,
      stageResults: results,
    });
    await writeJsonAtomic(paths.generationMetadata, metadata);
  }
}

function outputsForStage(stage: Exclude<NarrationPipelineStage, "all">, paths: NarrationArtifactPathSet): readonly string[] {
  if (stage === "prepare") {
    return [paths.spokenTextMarkdown, paths.spokenTextJson];
  }
  if (stage === "plan") {
    return [paths.chunkManifest, paths.performanceDirections, paths.pronunciationTransforms];
  }
  if (stage === "generate") {
    return [paths.chunkAudioDir];
  }
  if (stage === "assemble") {
    return [paths.assemblyManifest, paths.cleanNarration, paths.masteredNarration, paths.compatibilityNarration];
  }
  if (stage === "validate") {
    return [paths.qualityGateJson, paths.qualityGateMarkdown];
  }
  if (stage === "inspect") {
    return [
      paths.spokenTextJson,
      paths.chunkManifest,
      paths.performanceDirections,
      paths.pronunciationTransforms,
      paths.assemblyManifest,
      paths.qualityGateJson,
      paths.generationMetadata,
    ];
  }
  return [];
}

async function readPronunciationTransforms(
  paths: NarrationArtifactPathSet,
  manifest: NarrationChunkManifest
): Promise<ReadonlyMap<string, PronunciationChunkTransform>> {
  if (!(await fileExists(paths.pronunciationTransforms))) {
    return new Map();
  }
  await readRequiredJson(paths.pronunciationTransforms, (value) => value, "Pronunciation transform report");
  return new Map(manifest.chunks.map((chunk) => [chunk.chunkId, { chunkId: chunk.chunkId, text: chunk.text, textHash: chunk.textHash, appliedEntryIds: [] }]));
}

async function readCacheRecords(
  paths: NarrationArtifactPathSet,
  manifest: NarrationChunkManifest
): Promise<NarrationChunkCacheRecord[]> {
  const records: NarrationChunkCacheRecord[] = [];
  for (const chunk of manifest.chunks) {
    records.push(
      await readRequiredJson(
        narrationChunkCacheRecordPath(paths.narrationRoot, chunk.chunkId),
        (value) => narrationChunkCacheRecordSchema.parse(value),
        `Cache record for ${chunk.chunkId}`
      )
    );
  }
  return records;
}

async function readValidationReports(
  paths: NarrationArtifactPathSet,
  manifest: NarrationChunkManifest
): Promise<NarrationChunkValidationReport[]> {
  const reports: NarrationChunkValidationReport[] = [];
  for (const chunk of manifest.chunks) {
    reports.push(
      await readRequiredJson(
        path.join(paths.chunkValidationDir, `${chunk.chunkId}.validation.json`),
        (value) => narrationChunkValidationReportSchema.parse(value),
        `Validation report for ${chunk.chunkId}`
      )
    );
  }
  return reports;
}

async function runQualityGate(input: {
  readonly request: RequiredCoreRequest;
  readonly paths: NarrationArtifactPathSet;
  readonly manifest: NarrationChunkManifest;
  readonly validations: readonly NarrationChunkValidationReport[];
  readonly assembly: NarrationAssemblyManifest | null;
  readonly mastering: NarrationMasteringMetadata | null;
  readonly generation: NarrationGenerationMetadata | null;
}): Promise<NarrationQualityGateReport> {
  return runNarrationQualityGate({
    chunkManifest: input.manifest,
    validationReports: input.validations,
    assemblyManifest: input.assembly ?? undefined,
    masteringMetadata: input.mastering ?? undefined,
    generationMetadata: input.generation ?? undefined,
    cleanNarrationPath: input.paths.cleanNarration,
    masteredNarrationPath: input.paths.masteredNarration,
    reportJsonPath: input.paths.qualityGateJson,
    reportMarkdownPath: input.paths.qualityGateMarkdown,
    narrationRoot: input.paths.narrationRoot,
    compatibilityOutputStatus:
      input.request.rolloutMode === "shadow"
        ? "skipped"
        : await fileExists(input.paths.compatibilityNarration)
          ? "written"
          : "not_written",
    ...(input.request.logger ? { logger: input.request.logger } : {}),
  });
}
