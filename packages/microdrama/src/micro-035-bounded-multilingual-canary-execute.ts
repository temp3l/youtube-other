import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildLocaleTtsSelectedAudioAlignment } from "@mediaforge/alignment/locale-tts-alignment.js";
import {
  attributeMicrodramaCost,
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  licensedAudioLayerTracksSchema,
  selectedAudioTimingDependencySchema,
  type MicrodramaCostAttribution,
} from "@mediaforge/domain";
import type { LocaleTtsModelConfiguration } from "@mediaforge/speech/locale-tts-segmentation.js";
import {
  MicrodramaBudgetRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";
import { computePayloadHash } from "@mediaforge/narrative-core";

import {
  compileLocaleSubtitleArtifact,
  compileLocaleSubtitleProjection,
} from "../../rendering/src/locale-subtitle-artifact.js";
import {
  compileMicrodramaRenderManifest,
  compileMicrodramaRenderManifestToFfmpegArgs,
  validateCompiledMicrodramaFfmpegSafety,
} from "../../rendering/src/microdrama-render-manifest.js";
import {
  buildVisualRenderBudgetWorkItem,
  compileVisualRenderReadinessArtifacts,
  visualRenderTargetRevisionHash,
} from "./visual-render-readiness.js";
import {
  defaultMultilingualCanaryBudgetProfiles,
  defaultV5PackRoot,
  evaluateDeEsPtE001E003MultilingualCanaryPreflight,
  MICRO_035_TASK_ID,
} from "./de-es-pt-e001-e003-multilingual-canary-preflight.js";
import {
  loadMicro035AssetGenerationApproval,
  loadMicro035CostBudgetApproval,
  loadMicro035OperatorAuthorization,
} from "./micro-035-canary-authorization-persistence.js";
import {
  computeMicro035ProviderConfigRevision,
  localeOutputSegment,
  MICRO_035_CANARY_COST_LIMIT_MINOR,
  MICRO_035_CANARY_EPISODE_IDS,
  MICRO_035_CANARY_LOCALES,
  MICRO_035_VISUAL_PROFILE_REVISION,
  resolveMicro035CanaryEpisodeCostMinorAllocations,
  type Micro035CanaryLocale,
} from "./micro-035-canary-bindings.js";
import { loadMicro034CanaryExecutionEvidence } from "./micro-035-canary-micro-034-evidence.js";
import {
  buildMicro035ExplicitExecuteAuthorizationRecord,
  computeMicro035PreparationFingerprint,
  loadMicro035ExplicitExecuteAuthorization,
  persistMicro035ExplicitExecuteAuthorization,
  summarizeMicro035PreparationForFingerprint,
} from "./micro-035-explicit-execute-authorization.js";
import { compileLocaleTtsSegmentation } from "./locale-tts-segmentation.js";
import type { FakeSelectedAudioFixture } from "./locale-tts-segmentation.js";
import { readAdmittedLocalizedScriptText } from "./audio-tts-readiness.js";
import {
  buildAudioTtsBudgetWorkItem,
  compileAudioTtsReadinessArtifacts,
} from "./audio-tts-readiness.js";
import { estimateMicrodramaOpenAiTtsCostMinor } from "./microdrama-openai-tts-pricing-catalog.js";
import type {
  Micro035SegmentSynthesisPort,
  Micro035SharedVisualReusePort,
} from "./micro-035-multilingual-production-ports.js";
import { resolveMicro035OpenAiTtsModelConfigurationForLocale } from "./micro-035-openai-tts-env.js";
import { buildMicrodramaVisualGenerationPlan } from "./v5-visual-generation.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { compileV5EpisodeProduction } from "./v5-episode-production-compiler.js";
import { compileV5SceneShotPlans } from "./v5-scene-shot-compiler.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

export const MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.canary-execution-evidence.MICRO-035";

const EMPTY_LICENSED_AUDIO_TRACKS = licensedAudioLayerTracksSchema.parse({
  ambience: [],
  sfx: [],
  music: [],
});

export type Micro035BoundedMultilingualCanaryExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly executedAt: string;
  readonly outputRoot: string;
  readonly operatorId?: string;
  readonly segmentSynthesisPorts: Record<Micro035CanaryLocale, Micro035SegmentSynthesisPort>;
  readonly sharedVisualReusePort: Micro035SharedVisualReusePort;
  readonly modelConfigurations?: Partial<Record<Micro035CanaryLocale, LocaleTtsModelConfiguration>>;
  readonly measureAudioDurationMs?: (audioPath: string) => number;
  readonly micro034EvidenceJsonPath?: string;
  readonly micro034OutputRoot?: string;
  readonly locales?: readonly Micro035CanaryLocale[];
  readonly ffmpegRunner?: (args: readonly string[]) => void;
};

export type Micro035EpisodeMultilingualCanaryEvidence = {
  readonly locale: Micro035CanaryLocale;
  readonly episodeId: string;
  readonly scriptRevisionId: string;
  readonly alignmentRevisionId: string;
  readonly narrationAudioPath: string;
  readonly renderOutputPath: string;
  readonly visualRenderHash: string;
  readonly safeZonePass: boolean;
  readonly sharedVisualCacheHits: number;
  readonly sharedVisualRequests: number;
  readonly subtitlePath: string;
};

export type Micro035BoundedMultilingualCanaryExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly costLimitMinor: number;
  readonly sharedVisualCacheHits: number;
  readonly episodes: readonly Micro035EpisodeMultilingualCanaryEvidence[];
  readonly outputRoot: string;
  readonly evidenceProjectionKey: string;
};

export type Micro035AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly micro034EvidenceJsonPath?: string;
};

export type Micro035AuthorizeExplicitExecuteResult = {
  readonly status: "AUTHORIZED" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly authorizationId: string | null;
  readonly preparationFingerprint: string | null;
};

function runFfmpeg(args: readonly string[]): void {
  const result = spawnSync("ffmpeg", [...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr ?? result.stdout}`);
  }
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function defaultMeasureAudioDurationMs(audioPath: string): number {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `ffprobe failed for ${audioPath}: ${result.stderr ?? result.stdout}`
    );
  }
  const seconds = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Invalid audio duration for ${audioPath}`);
  }
  return Math.round(seconds * 1_000);
}

function audioExtensionForFormat(
  outputFormat: LocaleTtsModelConfiguration["outputFormat"] | undefined
): string {
  if (outputFormat === "wav" || outputFormat === "pcm" || outputFormat === "flac") {
    return outputFormat === "flac" ? "flac" : "wav";
  }
  return "mp3";
}

export function normalizeSelectedAudioSegmentDurations(input: {
  readonly segmentDurationsMs: readonly number[];
  readonly totalDurationMs: number;
}): number[] {
  if (input.segmentDurationsMs.length === 0) {
    return [];
  }
  const measuredSum = input.segmentDurationsMs.reduce(
    (total, durationMs) => total + durationMs,
    0
  );
  if (measuredSum <= 0) {
    const perSegment = Math.floor(
      input.totalDurationMs / input.segmentDurationsMs.length
    );
    return input.segmentDurationsMs.map((_, index) =>
      index === input.segmentDurationsMs.length - 1
        ? input.totalDurationMs - perSegment * (input.segmentDurationsMs.length - 1)
        : perSegment
    );
  }
  const scale = input.totalDurationMs / measuredSum;
  const normalized = input.segmentDurationsMs.map((durationMs) =>
    Math.max(1, Math.round(durationMs * scale))
  );
  const normalizedSum = normalized.reduce((total, durationMs) => total + durationMs, 0);
  const delta = input.totalDurationMs - normalizedSum;
  if (delta !== 0) {
    normalized[normalized.length - 1] = Math.max(
      1,
      (normalized.at(-1) ?? 0) + delta
    );
  }
  return normalized;
}

function buildSelectedAudioFixture(input: {
  readonly segmentDurationsMs: readonly number[];
  readonly totalDurationMs: number;
}): FakeSelectedAudioFixture {
  const normalized = normalizeSelectedAudioSegmentDurations(input);
  return {
    kind: "fake-measured-audio",
    totalDurationMs: input.totalDurationMs,
    segmentDurationsMs: normalized,
  };
}

async function synthesizeSegmentToFile(input: {
  readonly segmentSynthesisPort: Micro035SegmentSynthesisPort;
  readonly segmentId: string;
  readonly text: string;
  readonly outputPath: string;
}): Promise<number> {
  const result = await input.segmentSynthesisPort.synthesizeSegment({
    segmentId: input.segmentId,
    text: input.text,
    outputPath: input.outputPath,
  });
  return result.billableCharacters;
}

export async function authorizeMicro035BoundedCanaryExplicitExecute(
  input: Micro035AuthorizeExplicitExecuteInput
): Promise<Micro035AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro035OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro035AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro035CostBudgetApproval(microdramaRepository);
  const micro034Evidence = loadMicro034CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro034EvidenceJsonPath
      ? { jsonFilePath: input.micro034EvidenceJsonPath }
      : {}),
  });

  if (!operatorAuthorization) blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  if (!assetGenerationApproval) blockers.push("ASSET_GENERATION_APPROVAL_MISSING");
  if (!costBudgetApproval) blockers.push("COST_BUDGET_APPROVAL_MISSING");
  if (!micro034Evidence || micro034Evidence.status !== "DONE") {
    blockers.push("MICRO_034_EVIDENCE_MISSING");
  }

  const preflight = await evaluateDeEsPtE001E003MultilingualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.authorizedAt,
    profiles: defaultMultilingualCanaryBudgetProfiles(input.authorizedAt),
    micro034Evidence,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
  });

  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  if (blockers.length > 0) {
    return {
      status: "BLOCKED",
      blockers,
      authorizationId: null,
      preparationFingerprint: null,
    };
  }

  const preparationSummary = summarizeMicro035PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro035PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.scriptRevisionIds,
    sharedVisualRevisionIds: preflight.sharedVisualRevisionIds,
    visualProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
    providerConfigRevision: computeMicro035ProviderConfigRevision(),
  });

  const record = buildMicro035ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    scriptRevisionIds: preflight.scriptRevisionIds,
    sharedVisualRevisionIds: preflight.sharedVisualRevisionIds,
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro035ExplicitExecuteAuthorization({
    repository: microdramaRepository,
    record,
  });

  return {
    status: "AUTHORIZED",
    blockers: [],
    authorizationId: record.authorizationId,
    preparationFingerprint,
  };
}

export async function executeMicro035BoundedMultilingualCanary(
  input: Micro035BoundedMultilingualCanaryExecuteInput
): Promise<Micro035BoundedMultilingualCanaryExecuteResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const measureDurationMs = input.measureAudioDurationMs ?? defaultMeasureAudioDurationMs;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();

  const operatorAuthorization = loadMicro035OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro035AssetGenerationApproval(microdramaRepository);
  const executeAuthorization = loadMicro035ExplicitExecuteAuthorization(microdramaRepository);
  const micro034Evidence = loadMicro034CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro034EvidenceJsonPath
      ? { jsonFilePath: input.micro034EvidenceJsonPath }
      : {}),
  });

  if (!executeAuthorization) blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  if (!micro034Evidence || micro034Evidence.status !== "DONE") {
    blockers.push("MICRO_034_EVIDENCE_MISSING");
  }

  const preflight = await evaluateDeEsPtE001E003MultilingualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.executedAt,
    profiles: defaultMultilingualCanaryBudgetProfiles(input.executedAt),
    micro034Evidence,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
  });

  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  const preparationSummary = summarizeMicro035PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro035PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.scriptRevisionIds,
    sharedVisualRevisionIds: preflight.sharedVisualRevisionIds,
    visualProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
    providerConfigRevision: computeMicro035ProviderConfigRevision(),
  });

  if (
    executeAuthorization &&
    executeAuthorization.preparationFingerprint !== preparationFingerprint
  ) {
    blockers.push("EXPLICIT_EXECUTE_PREPARATION_STALE");
  }

  if (blockers.length > 0) {
    return {
      status: "BLOCKED",
      blockers,
      providerRequests: 0,
      totalCostMinor: 0,
      costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
      sharedVisualCacheHits: 0,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return blockedResult(input, ["PACK_ADMISSION_FAILED"], 0, 0, 0, []);
  }

  const production = compileV5EpisodeProduction(admission.bundle, input.admittedAt);
  if (!production.ok) {
    return blockedResult(input, ["PRODUCTION_COMPILE_FAILED"], 0, 0, 0, []);
  }

  const sceneShotPlans = compileV5SceneShotPlans(production.bundle, input.executedAt);
  if (!sceneShotPlans.ok) {
    return blockedResult(input, ["SCENE_SHOT_PLAN_COMPILE_FAILED"], 0, 0, 0, []);
  }

  mkdirSync(input.outputRoot, { recursive: true });

  for (const profile of defaultMultilingualCanaryBudgetProfiles(input.executedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  let providerRequests = 0;
  let totalCostMinor = 0;
  let sharedVisualCacheHits = 0;
  const episodes: Micro035EpisodeMultilingualCanaryEvidence[] = [];
  const existingAttributions: MicrodramaCostAttribution[] = [];
  const episodeCostAllocations = resolveMicro035CanaryEpisodeCostMinorAllocations();

  const executeCorrelationNonce = createHash("sha256")
    .update(input.executedAt)
    .digest("hex")
    .slice(0, 12);

  const ffmpegRunner = input.ffmpegRunner ?? runFfmpeg;
  const locales = input.locales ?? MICRO_035_CANARY_LOCALES;

  for (const locale of locales) {
    const segmentSynthesisPort = input.segmentSynthesisPorts[locale];
    const modelConfiguration =
      input.modelConfigurations?.[locale] ??
      resolveMicro035OpenAiTtsModelConfigurationForLocale(locale);
    const audioExtension = audioExtensionForFormat(modelConfiguration.outputFormat);

    for (const episodeId of MICRO_035_CANARY_EPISODE_IDS) {
      const script = admission.bundle.admittedScripts.find(
        (entry) => entry.episodeId === episodeId && entry.locale === locale
      );
      const plan = sceneShotPlans.bundle.records.find(
        (entry) => entry.episodeId === episodeId
      );

      if (!script || !plan) {
        return blockedResult(
          input,
          [`EPISODE_INPUTS_MISSING_${locale}_${episodeId}`],
          providerRequests,
          totalCostMinor,
          sharedVisualCacheHits,
          episodes
        );
      }

      const episodeOutputDir = path.join(
        input.outputRoot,
        localeOutputSegment(locale),
        episodeId.toLowerCase()
      );
      mkdirSync(episodeOutputDir, { recursive: true });

      const resolvedModelConfiguration = modelConfiguration;

      const { segmentationBundle: lexicalBundle, binding } =
        compileAudioTtsReadinessArtifacts({
          packRoot,
          script,
          voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
          modelConfiguration: resolvedModelConfiguration,
        });

      const workItem = buildAudioTtsBudgetWorkItem({
        binding,
        modelConfiguration: resolvedModelConfiguration,
        estimatedCostMinor:
          episodeCostAllocations[`${locale}:${episodeId}` as const],
      });

      const episodeCorrelationId = `corr.micro035.${locale.toLowerCase()}.${episodeId.toLowerCase()}.${executeCorrelationNonce}`;
      const episodePreflight = budgetRepository.runBudgetPreflight({
        correlationId: episodeCorrelationId,
        workItems: [workItem],
        evaluatedAt: input.executedAt,
      });
      if (!episodePreflight.allowed) {
        return blockedResult(
          input,
          [`BUDGET_PREFLIGHT_BLOCKED_${locale}_${episodeId}`],
          providerRequests,
          totalCostMinor,
          sharedVisualCacheHits,
          episodes
        );
      }
      const reservations = budgetRepository.recordPreflightReservations(episodePreflight);
      const reservationId =
        reservations[0]?.reservationId ??
        `reservation.micro035.${locale.toLowerCase()}.${episodeId.toLowerCase()}.${executeCorrelationNonce}`;

      const segmentDurationsMs: number[] = [];
      for (const segment of lexicalBundle.segmentRequests) {
        if (providerRequests >= executeAuthorization!.binds.maximumProviderRequests) {
          return blockedResult(
            input,
            ["MAXIMUM_PROVIDER_REQUESTS_EXCEEDED"],
            providerRequests,
            totalCostMinor,
            sharedVisualCacheHits,
            episodes
          );
        }

        const segmentPath = path.join(
          episodeOutputDir,
          `${segment.segmentId}.${audioExtension}`
        );
        const billableCharacters = await synthesizeSegmentToFile({
          segmentSynthesisPort,
          segmentId: segment.segmentId,
          text: segment.text,
          outputPath: segmentPath,
        });
        providerRequests += 1;

        const segmentCostMinor = estimateMicrodramaOpenAiTtsCostMinor({
          billableCharacters,
        }).estimatedCostMinor;
        totalCostMinor += segmentCostMinor;
        if (totalCostMinor > MICRO_035_CANARY_COST_LIMIT_MINOR) {
          return blockedResult(
            input,
            ["COST_LIMIT_EXCEEDED"],
            providerRequests,
            totalCostMinor,
            sharedVisualCacheHits,
            episodes
          );
        }

        segmentDurationsMs.push(measureDurationMs(segmentPath));

        const attribution: MicrodramaCostAttribution = {
          schemaVersion: "mediaforge.microdrama-budget.v1",
          attributionId: `attrib.micro-035.${executeCorrelationNonce}.${segment.segmentId}`,
          episodeId: episodeId.toLowerCase(),
          locale: script.locale,
          provider: "openai",
          assetType: "tts",
          assetCostScope: "locale_tts",
          revisionId: workItem.revisionId,
          reservationId,
          costMinor: segmentCostMinor,
          cacheStatus: "miss",
          retryCount: 0,
          correlationId: `${episodeCorrelationId}.${segment.segmentId}`,
          requestId: `req.micro-035.${executeCorrelationNonce}.${segment.segmentId}`,
          recordedAt: input.executedAt,
        };
        const attributed = attributeMicrodramaCost({
          attribution,
          existingAttributions,
        });
        if (attributed.record) {
          budgetRepository.recordCostAttribution({
            attribution: attributed.record,
            evidence: {
              taskId: MICRO_035_TASK_ID,
              segmentId: segment.segmentId,
              billableCharacters,
            },
          });
          existingAttributions.push(attributed.record);
        }
      }

      const narrationAudioPath = path.join(
        episodeOutputDir,
        `narration.${script.scriptRevisionId}.${audioExtension}`
      );
      const concatListPath = path.join(episodeOutputDir, "concat.txt");
      const concatLines = lexicalBundle.segmentRequests.map(
        (segment) =>
          `file '${path
            .join(episodeOutputDir, `${segment.segmentId}.${audioExtension}`)
            .replaceAll("'", "'\\''")}'`
      );
      writeFileSync(concatListPath, `${concatLines.join("\n")}\n`, "utf8");
      const concatResult = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          concatListPath,
          "-c",
          "copy",
          narrationAudioPath,
        ],
        { encoding: "utf8" }
      );
      if (concatResult.status !== 0) {
        return blockedResult(
          input,
          [`NARRATION_CONCAT_FAILED_${locale}_${episodeId}`],
          providerRequests,
          totalCostMinor,
          sharedVisualCacheHits,
          episodes
        );
      }

      const measuredDurationMs = measureDurationMs(narrationAudioPath);
      const selectedAudio = buildSelectedAudioFixture({
        segmentDurationsMs,
        totalDurationMs: measuredDurationMs,
      });

      const scriptText = readAdmittedLocalizedScriptText({ packRoot, script });
      const segmentationBundle = compileLocaleTtsSegmentation({
        scriptText,
        scriptRevisionId: script.scriptRevisionId,
        locale: script.locale,
        voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
        modelConfiguration: resolvedModelConfiguration,
        selectedAudio,
      });

      const timingDependency = selectedAudioTimingDependencySchema.parse({
        schemaVersion: SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
        locale: script.locale,
        alignmentRevisionId: segmentationBundle.timingContract.alignmentRevisionId,
        cacheKey: segmentationBundle.timingContract.cacheKey,
        authoritySource: segmentationBundle.timingContract.authoritySource,
        totalDurationMs: segmentationBundle.timingContract.totalDurationMs,
      });
      const subtitleProjection = compileLocaleSubtitleProjection({
        locale: script.locale,
        alignment: segmentationBundle.selectedAudioAlignment!,
        timingDependency,
      });
      const compiledVisual = compileVisualRenderReadinessArtifacts({
        plan,
        timelineInput: {
          plan,
          ttsBundle: segmentationBundle,
          timingDependency,
          subtitleProjection,
        },
        licensedAudioTracks: EMPTY_LICENSED_AUDIO_TRACKS,
        licensedAudioAssets: [],
        evaluatedAt: input.executedAt,
        territory: "WW",
        renderProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
      });

      const renderWorkItem = buildVisualRenderBudgetWorkItem({
        binding: compiledVisual.binding,
        estimatedCostMinor: 150,
      });
      const renderPreflight = budgetRepository.runBudgetPreflight({
        correlationId: `${episodeCorrelationId}.render`,
        workItems: [renderWorkItem],
        evaluatedAt: input.executedAt,
      });
      if (!renderPreflight.allowed) {
        return blockedResult(
          input,
          [`RENDER_BUDGET_PREFLIGHT_BLOCKED_${locale}_${episodeId}`],
          providerRequests,
          totalCostMinor,
          sharedVisualCacheHits,
          episodes
        );
      }
      const renderReservations = budgetRepository.recordPreflightReservations(renderPreflight);
      const renderReservationId =
        renderReservations[0]?.reservationId ??
        `reservation.micro035.${locale.toLowerCase()}.${episodeId.toLowerCase()}.render.${executeCorrelationNonce}`;

      const visualPlan = buildMicrodramaVisualGenerationPlan({
        seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
        plan,
        registryRevisionFingerprints: [],
      });
      const visualsDir = path.join(episodeOutputDir, "visuals");
      mkdirSync(visualsDir, { recursive: true });
      const clipAssetPaths: Record<string, string> = {};
      let episodeSharedVisualCacheHits = 0;
      let episodeSharedVisualRequests = 0;

      for (const item of visualPlan) {
        const outputPath = path.join(
          visualsDir,
          `${item.request.sourcePlateSemanticId}.png`
        );
        const effect = await input.sharedVisualReusePort.generateSharedVisual({
          request: item.request,
          outputPath,
        });
        providerRequests += 1;
        episodeSharedVisualRequests += 1;
        if (effect.cacheHit) {
          sharedVisualCacheHits += 1;
          episodeSharedVisualCacheHits += 1;
        }

        for (const shot of plan.shots) {
          if (shot.sourcePlateSemanticId === item.request.sourcePlateSemanticId) {
            clipAssetPaths[shot.shotSemanticId] = outputPath;
          }
        }

        const attribution: MicrodramaCostAttribution = {
          schemaVersion: "mediaforge.microdrama-budget.v1",
          attributionId: `attrib.micro-035.${executeCorrelationNonce}.${item.request.requestId}`,
          episodeId: episodeId.toLowerCase(),
          provider: "mock-image",
          assetType: "image",
          assetCostScope: "shared_visual",
          revisionId: plan.shotPlanRevisionId,
          reservationId: renderReservationId,
          costMinor: 0,
          cacheStatus: effect.cacheHit ? "hit" : "miss",
          retryCount: 0,
          correlationId: `${episodeCorrelationId}.${item.request.requestId}`,
          requestId: `req.micro-035.${executeCorrelationNonce}.${item.request.requestId}`,
          recordedAt: input.executedAt,
        };
        const attributed = attributeMicrodramaCost({
          attribution,
          existingAttributions,
        });
        if (attributed.record) {
          budgetRepository.recordCostAttribution({
            attribution: attributed.record,
            evidence: {
              taskId: MICRO_035_TASK_ID,
              requestId: item.request.requestId,
              cacheHit: effect.cacheHit,
            },
          });
          existingAttributions.push(attributed.record);
        }
      }

      const subtitleArtifact = compileLocaleSubtitleArtifact(subtitleProjection);
      const subtitlePath = path.join(episodeOutputDir, "subtitles.srt");
      writeFileSync(subtitlePath, subtitleArtifact.srt, "utf8");

      const renderOutputPath = path.join(
        episodeOutputDir,
        `render.${compiledVisual.timeline.timelineRevisionId}.mp4`
      );
      const manifest = compileMicrodramaRenderManifest({
        timeline: compiledVisual.timeline,
        narrationAudioPath,
        subtitlePath,
        outputPath: renderOutputPath,
        clipAssetPaths,
      });
      const ffmpegCommands = compileMicrodramaRenderManifestToFfmpegArgs(manifest);
      validateCompiledMicrodramaFfmpegSafety(ffmpegCommands);

      for (const command of ffmpegCommands.slice(0, -2)) {
        ffmpegRunner(command);
        providerRequests += 1;
      }
      const concatCommand = ffmpegCommands.at(-2);
      if (concatCommand) {
        const concatPath = renderOutputPath.replace(/\.mp4$/u, ".concat.txt");
        const concatLinesForRender = manifest.clips
          .map(
            (clip) =>
              `file '${renderOutputPath.replace(/\.mp4$/u, `-${clip.clipId}.mp4`).replaceAll("'", "'\\''")}'`
          )
          .join("\n");
        writeFileSync(concatPath, `${concatLinesForRender}\n`, "utf8");
        ffmpegRunner(concatCommand);
        providerRequests += 1;
      }
      const subtitleBurnCommand = ffmpegCommands.at(-1);
      if (subtitleBurnCommand) {
        ffmpegRunner(subtitleBurnCommand);
        providerRequests += 1;
      }
      if (input.ffmpegRunner) {
        writeFileSync(renderOutputPath, Buffer.from("mock-render"), "utf8");
      }

      const renderCostMinor = 150;
      totalCostMinor += renderCostMinor;
      if (totalCostMinor > MICRO_035_CANARY_COST_LIMIT_MINOR) {
        return blockedResult(
          input,
          ["COST_LIMIT_EXCEEDED"],
          providerRequests,
          totalCostMinor,
          sharedVisualCacheHits,
          episodes
        );
      }
      const renderAttribution: MicrodramaCostAttribution = {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: `attrib.micro-035.${executeCorrelationNonce}.${locale.toLowerCase()}.${episodeId.toLowerCase()}.render`,
        episodeId: episodeId.toLowerCase(),
        locale: script.locale,
        provider: "ffmpeg",
        assetType: "render",
        assetCostScope: "locale_render",
        revisionId: compiledVisual.binding.sceneShotPlanRevisionId,
        reservationId: renderReservationId,
        costMinor: renderCostMinor,
        cacheStatus: "miss",
        retryCount: 0,
        correlationId: `${episodeCorrelationId}.render`,
        requestId: `req.micro-035.${executeCorrelationNonce}.${locale.toLowerCase()}.${episodeId.toLowerCase()}.render`,
        recordedAt: input.executedAt,
      };
      const renderAttributed = attributeMicrodramaCost({
        attribution: renderAttribution,
        existingAttributions,
      });
      if (renderAttributed.record) {
        budgetRepository.recordCostAttribution({
          attribution: renderAttributed.record,
          evidence: {
            taskId: MICRO_035_TASK_ID,
            renderOutputPath,
            manifestHash: manifest.contentHash,
          },
        });
        existingAttributions.push(renderAttributed.record);
      }

      const alignment = buildLocaleTtsSelectedAudioAlignment({
        alignmentRevisionId: segmentationBundle.timingContract.alignmentRevisionId,
        segments: segmentationBundle.segmentRequests.map((segment, index) => ({
          segmentId: segment.segmentId,
          text: segment.text,
          durationMs: selectedAudio.segmentDurationsMs[index] ?? 0,
        })),
      });

      episodes.push({
        locale,
        episodeId,
        scriptRevisionId: script.scriptRevisionId,
        alignmentRevisionId: alignment.alignmentRevisionId,
        narrationAudioPath,
        renderOutputPath,
        visualRenderHash: visualRenderTargetRevisionHash(compiledVisual.binding),
        safeZonePass: compiledVisual.safeZoneValidation.issues.length === 0,
        sharedVisualCacheHits: episodeSharedVisualCacheHits,
        sharedVisualRequests: episodeSharedVisualRequests,
        subtitlePath,
      });
    }
  }

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-035-canary-execution-evidence.v1",
    taskId: MICRO_035_TASK_ID,
    executedAt: input.executedAt,
    admittedAt: input.admittedAt,
    preparationFingerprint,
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
    sharedVisualCacheHits,
    outputRoot: input.outputRoot,
    episodes,
    publicationCalls: 0,
    narrationAudioSha256ByEpisode: Object.fromEntries(
      episodes.map((episode) => [
        `${episode.locale}:${episode.episodeId}`,
        sha256File(episode.narrationAudioPath),
      ])
    ),
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
    sharedVisualCacheHits,
    episodes,
    outputRoot: input.outputRoot,
    evidenceProjectionKey: MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

function blockedResult(
  input: Micro035BoundedMultilingualCanaryExecuteInput,
  blockers: readonly string[],
  providerRequests: number,
  totalCostMinor: number,
  sharedVisualCacheHits: number,
  episodes: readonly Micro035EpisodeMultilingualCanaryEvidence[]
): Micro035BoundedMultilingualCanaryExecuteResult {
  return {
    status: "BLOCKED",
    blockers,
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
    sharedVisualCacheHits,
    episodes,
    outputRoot: input.outputRoot,
    evidenceProjectionKey: MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

export {
  createMicro035MockSegmentSynthesisPort,
  createMicro035OpenAiSegmentSynthesisPortForLocale,
  createMicro035SharedVisualReusePort,
  createMicro035MockSharedVisualReusePort,
} from "./micro-035-multilingual-production-ports.js";
