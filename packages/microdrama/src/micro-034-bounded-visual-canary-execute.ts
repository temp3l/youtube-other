import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  attributeMicrodramaCost,
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  licensedAudioLayerTracksSchema,
  selectedAudioTimingDependencySchema,
  type MicrodramaCostAttribution,
} from "@mediaforge/domain";
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
  MicrodramaBudgetRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";
import { computePayloadHash } from "@mediaforge/narrative-core";

import {
  buildVisualRenderBudgetWorkItem,
  compileVisualRenderReadinessArtifacts,
  computeRegistryFingerprint,
  visualRenderTargetRevisionHash,
} from "./visual-render-readiness.js";
import {
  defaultEnVisualCanaryBudgetProfiles,
  defaultV5PackRoot,
  evaluateEnE001E003VisualCanaryPreflight,
  MICRO_034_TASK_ID,
} from "./en-e001-e003-visual-canary-preflight.js";
import {
  loadMicro034AssetGenerationApproval,
  loadMicro034CostBudgetApproval,
  loadMicro034OperatorAuthorization,
} from "./micro-034-canary-authorization-persistence.js";
import {
  computeMicro034ProviderConfigRevision,
  MICRO_034_CANARY_COST_LIMIT_MINOR,
  MICRO_034_CANARY_EPISODE_IDS,
  MICRO_034_ESTIMATED_COST_MINOR_PER_IMAGE,
  MICRO_034_VISUAL_PROFILE_REVISION,
} from "./micro-034-canary-bindings.js";
import {
  loadMicro033CanaryExecutionEvidence,
  mapMicro033EpisodeToSelectedAudioFixture,
} from "./micro-034-canary-micro-033-evidence.js";
import {
  buildMicro034ExplicitExecuteAuthorizationRecord,
  computeMicro034PreparationFingerprint,
  loadMicro034ExplicitExecuteAuthorization,
  persistMicro034ExplicitExecuteAuthorization,
  summarizeMicro034PreparationForFingerprint,
} from "./micro-034-explicit-execute-authorization.js";
import { compileLocaleTtsSegmentation } from "./locale-tts-segmentation.js";
import { MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION } from "./micro-033-canary-bindings.js";
import { readAdmittedLocalizedScriptText } from "./audio-tts-readiness.js";
import {
  attachPlanRegistryToVisualProductionPort,
  type Micro034VisualProductionPort,
} from "./micro-034-visual-production-ports.js";
import { buildNarrationMomentsByPlateId } from "./microdrama-narration-visual-alignment.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { compileV5EpisodeProduction } from "./v5-episode-production-compiler.js";
import { compileV5SceneShotPlans } from "./v5-scene-shot-compiler.js";
import { buildMicrodramaVisualGenerationPlan } from "./v5-visual-generation.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

export const MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.canary-execution-evidence.MICRO-034";

const EMPTY_LICENSED_AUDIO_TRACKS = licensedAudioLayerTracksSchema.parse({
  ambience: [],
  sfx: [],
  music: [],
});

export type Micro034BoundedVisualCanaryExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly executedAt: string;
  readonly outputRoot: string;
  readonly operatorId?: string;
  readonly visualProductionPort: Micro034VisualProductionPort;
  readonly episodeIds?: readonly (typeof MICRO_034_CANARY_EPISODE_IDS)[number][];
  readonly micro033EvidenceJsonPath?: string;
  readonly ffmpegRunner?: (args: readonly string[]) => void;
};

export type Micro034EpisodeVisualCanaryEvidence = {
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

export type Micro034BoundedVisualCanaryExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly costLimitMinor: number;
  readonly sharedVisualCacheHits: number;
  readonly episodes: readonly Micro034EpisodeVisualCanaryEvidence[];
  readonly outputRoot: string;
  readonly evidenceProjectionKey: string;
};

export type Micro034AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly micro033EvidenceJsonPath?: string;
};

export type Micro034AuthorizeExplicitExecuteResult = {
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

export async function authorizeMicro034BoundedCanaryExplicitExecute(
  input: Micro034AuthorizeExplicitExecuteInput
): Promise<Micro034AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro034OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro034AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro034CostBudgetApproval(microdramaRepository);
  const micro033Evidence = loadMicro033CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro033EvidenceJsonPath
      ? { jsonFilePath: input.micro033EvidenceJsonPath }
      : {}),
  });

  if (!operatorAuthorization) blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  if (!assetGenerationApproval) blockers.push("ASSET_GENERATION_APPROVAL_MISSING");
  if (!costBudgetApproval) blockers.push("COST_BUDGET_APPROVAL_MISSING");
  if (!micro033Evidence || micro033Evidence.status !== "DONE") {
    blockers.push("MICRO_033_EVIDENCE_MISSING");
  }

  const preflight = await evaluateEnE001E003VisualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.authorizedAt,
    profiles: defaultEnVisualCanaryBudgetProfiles(input.authorizedAt),
    micro033Evidence,
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

  const preparationSummary = summarizeMicro034PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro034PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.bindingProbe.scriptRevisionIds,
    visualProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    providerConfigRevision: computeMicro034ProviderConfigRevision(),
    audioRevisionIds: preflight.audioRevisionIds,
  });

  const record = buildMicro034ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    scriptRevisionIds: preflight.bindingProbe.scriptRevisionIds,
    audioRevisionIds: preflight.audioRevisionIds,
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro034ExplicitExecuteAuthorization({
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

export async function executeMicro034BoundedVisualCanary(
  input: Micro034BoundedVisualCanaryExecuteInput
): Promise<Micro034BoundedVisualCanaryExecuteResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const modelConfiguration = MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();

  const operatorAuthorization = loadMicro034OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro034AssetGenerationApproval(microdramaRepository);
  const executeAuthorization = loadMicro034ExplicitExecuteAuthorization(microdramaRepository);
  const micro033Evidence = loadMicro033CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro033EvidenceJsonPath
      ? { jsonFilePath: input.micro033EvidenceJsonPath }
      : {}),
  });

  if (!executeAuthorization) blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  if (!micro033Evidence || micro033Evidence.status !== "DONE") {
    blockers.push("MICRO_033_EVIDENCE_MISSING");
  }

  const preflight = await evaluateEnE001E003VisualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.executedAt,
    profiles: defaultEnVisualCanaryBudgetProfiles(input.executedAt),
    micro033Evidence,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
  });

  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  const preparationSummary = summarizeMicro034PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro034PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.bindingProbe.scriptRevisionIds,
    visualProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    providerConfigRevision: computeMicro034ProviderConfigRevision(),
    audioRevisionIds: preflight.audioRevisionIds,
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
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
      sharedVisualCacheHits: 0,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      providerRequests: 0,
      totalCostMinor: 0,
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
      sharedVisualCacheHits: 0,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const production = compileV5EpisodeProduction(admission.bundle, input.admittedAt);
  if (!production.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PRODUCTION_COMPILE_FAILED"],
      providerRequests: 0,
      totalCostMinor: 0,
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
      sharedVisualCacheHits: 0,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const sceneShotPlans = compileV5SceneShotPlans(production.bundle, input.executedAt);
  if (!sceneShotPlans.ok) {
    return {
      status: "BLOCKED",
      blockers: ["SCENE_SHOT_PLAN_COMPILE_FAILED"],
      providerRequests: 0,
      totalCostMinor: 0,
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
      sharedVisualCacheHits: 0,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  mkdirSync(input.outputRoot, { recursive: true });

  for (const profile of defaultEnVisualCanaryBudgetProfiles(input.executedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  let providerRequests = 0;
  let totalCostMinor = 0;
  let sharedVisualCacheHits = 0;
  const episodes: Micro034EpisodeVisualCanaryEvidence[] = [];
  const existingAttributions: MicrodramaCostAttribution[] = [];

  const executeCorrelationNonce = createHash("sha256")
    .update(input.executedAt)
    .digest("hex")
    .slice(0, 12);

  const ffmpegRunner = input.ffmpegRunner ?? runFfmpeg;
  const sharedPort = input.visualProductionPort;
  const episodeIds = input.episodeIds ?? MICRO_034_CANARY_EPISODE_IDS;

  for (const episodeId of episodeIds) {
    const script = admission.bundle.admittedScripts.find(
      (entry) => entry.episodeId === episodeId && entry.locale === "en-US"
    );
    const plan = sceneShotPlans.bundle.records.find(
      (entry) => entry.episodeId === episodeId
    );
    const micro033Episode = micro033Evidence!.episodes.find(
      (entry) => entry.episodeId === episodeId
    );

    if (!script || !plan || !micro033Episode) {
      return {
        status: "BLOCKED",
        blockers: [`EPISODE_INPUTS_MISSING_${episodeId}`],
        providerRequests,
        totalCostMinor,
        costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
        sharedVisualCacheHits,
        episodes,
        outputRoot: input.outputRoot,
        evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
      };
    }

    const episodeOutputDir = path.join(
      input.outputRoot,
      "en-us",
      episodeId.toLowerCase()
    );
    mkdirSync(episodeOutputDir, { recursive: true });

    const scriptText = readAdmittedLocalizedScriptText({ packRoot, script });
    const segmentationBundle = compileLocaleTtsSegmentation({
      scriptText,
      scriptRevisionId: script.scriptRevisionId,
      locale: script.locale,
      voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      modelConfiguration,
      selectedAudio: mapMicro033EpisodeToSelectedAudioFixture(micro033Episode),
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
      renderProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    });

    const renderWorkItem = buildVisualRenderBudgetWorkItem({
      binding: compiledVisual.binding,
      estimatedCostMinor: 150,
    });
    const episodeCorrelationId = `corr.micro034.${episodeId.toLowerCase()}.${executeCorrelationNonce}`;
    const episodePreflight = budgetRepository.runBudgetPreflight({
      correlationId: episodeCorrelationId,
      workItems: [renderWorkItem],
      evaluatedAt: input.executedAt,
    });
    if (!episodePreflight.allowed) {
      return {
        status: "BLOCKED",
        blockers: [`BUDGET_PREFLIGHT_BLOCKED_${episodeId}`],
        providerRequests,
        totalCostMinor,
        costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
        sharedVisualCacheHits,
        episodes,
        outputRoot: input.outputRoot,
        evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
      };
    }
    const reservations = budgetRepository.recordPreflightReservations(episodePreflight);
    const reservationId =
      reservations[0]?.reservationId ??
      `reservation.micro034.${episodeId.toLowerCase()}.${executeCorrelationNonce}`;

    const episodePort = attachPlanRegistryToVisualProductionPort({
      port: sharedPort,
      plan,
      createdAt: input.executedAt,
    });
    const visualPlan = buildMicrodramaVisualGenerationPlan({
      seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
      plan,
      registryRevisionFingerprints: [computeRegistryFingerprint(plan)],
    });
    const narrationMomentsByPlateId = buildNarrationMomentsByPlateId({
      totalDurationMs: timingDependency.totalDurationMs,
      cues: subtitleProjection.captionPlan.segments.map((segment) => ({
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.lines.join(" "),
      })),
      plates: visualPlan.map((item) => {
        const shot =
          plan.shots.find((entry) => entry.shotSemanticId === item.request.shotSemanticId) ??
          plan.shots.find(
            (entry) =>
              entry.sourcePlateSemanticId === item.request.sourcePlateSemanticId
          );
        return {
          sourcePlateSemanticId: item.request.sourcePlateSemanticId,
          timing: shot?.timing ?? { startRatio: 0, endRatio: 1 },
        };
      }),
    });
    const visualsDir = path.join(episodeOutputDir, "visuals");
    mkdirSync(visualsDir, { recursive: true });
    const clipAssetPaths: Record<string, string> = {};
    let episodeSharedVisualCacheHits = 0;
    let episodeSharedVisualRequests = 0;

    for (const item of visualPlan) {
      if (providerRequests >= executeAuthorization!.binds.maximumProviderRequests) {
        return {
          status: "BLOCKED",
          blockers: ["MAXIMUM_PROVIDER_REQUESTS_EXCEEDED"],
          providerRequests,
          totalCostMinor,
          costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
          sharedVisualCacheHits,
          episodes,
          outputRoot: input.outputRoot,
          evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
        };
      }

      const outputPath = path.join(
        visualsDir,
        `${item.request.sourcePlateSemanticId}.png`
      );
      const effect = await episodePort.generateSharedVisual({
        request: item.request,
        outputPath,
        narrationMoment: narrationMomentsByPlateId.get(
          item.request.sourcePlateSemanticId
        ),
      });
      providerRequests += 1;
      episodeSharedVisualRequests += 1;
      if (effect.cacheHit) {
        sharedVisualCacheHits += 1;
        episodeSharedVisualCacheHits += 1;
      }

      const segmentCostMinor = effect.cacheHit ? 0 : MICRO_034_ESTIMATED_COST_MINOR_PER_IMAGE;
      totalCostMinor += segmentCostMinor;
      if (totalCostMinor > MICRO_034_CANARY_COST_LIMIT_MINOR) {
        return {
          status: "BLOCKED",
          blockers: ["COST_LIMIT_EXCEEDED"],
          providerRequests,
          totalCostMinor,
          costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
          sharedVisualCacheHits,
          episodes,
          outputRoot: input.outputRoot,
          evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
        };
      }

      for (const shot of plan.shots) {
        if (shot.sourcePlateSemanticId === item.request.sourcePlateSemanticId) {
          clipAssetPaths[shot.shotSemanticId] = outputPath;
        }
      }

      const attribution: MicrodramaCostAttribution = {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: `attrib.micro-034.${executeCorrelationNonce}.${item.request.requestId}`,
        episodeId: episodeId.toLowerCase(),
        provider: episodePort.providerId,
        assetType: "image",
        assetCostScope: "shared_visual",
        revisionId: plan.shotPlanRevisionId,
        reservationId,
        costMinor: segmentCostMinor,
        cacheStatus: effect.cacheHit ? "hit" : "miss",
        retryCount: 0,
        correlationId: `${episodeCorrelationId}.${item.request.requestId}`,
        requestId: `req.micro-034.${executeCorrelationNonce}.${item.request.requestId}`,
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
            taskId: MICRO_034_TASK_ID,
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
      narrationAudioPath: micro033Episode.narrationAudioPath,
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
      const concatLines = manifest.clips
        .map(
          (clip) =>
            `file '${renderOutputPath.replace(/\.mp4$/u, `-${clip.clipId}.mp4`).replaceAll("'", "'\\''")}'`
        )
        .join("\n");
      writeFileSync(concatPath, `${concatLines}\n`, "utf8");
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
    if (totalCostMinor > MICRO_034_CANARY_COST_LIMIT_MINOR) {
      return {
        status: "BLOCKED",
        blockers: ["COST_LIMIT_EXCEEDED"],
        providerRequests,
        totalCostMinor,
        costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
        sharedVisualCacheHits,
        episodes,
        outputRoot: input.outputRoot,
        evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
      };
    }
    const renderAttribution: MicrodramaCostAttribution = {
      schemaVersion: "mediaforge.microdrama-budget.v1",
      attributionId: `attrib.micro-034.${executeCorrelationNonce}.${episodeId.toLowerCase()}.render`,
      episodeId: episodeId.toLowerCase(),
      locale: script.locale,
      provider: "ffmpeg",
      assetType: "render",
      assetCostScope: "locale_render",
      revisionId: compiledVisual.binding.sceneShotPlanRevisionId,
      reservationId,
      costMinor: renderCostMinor,
      cacheStatus: "miss",
      retryCount: 0,
      correlationId: `${episodeCorrelationId}.render`,
      requestId: `req.micro-034.${executeCorrelationNonce}.${episodeId.toLowerCase()}.render`,
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
          taskId: MICRO_034_TASK_ID,
          renderOutputPath,
          manifestHash: manifest.contentHash,
        },
      });
      existingAttributions.push(renderAttributed.record);
    }

    episodes.push({
      episodeId,
      scriptRevisionId: script.scriptRevisionId,
      alignmentRevisionId: micro033Episode.alignmentRevisionId,
      narrationAudioPath: micro033Episode.narrationAudioPath,
      renderOutputPath,
      visualRenderHash: visualRenderTargetRevisionHash(compiledVisual.binding),
      safeZonePass: compiledVisual.safeZoneValidation.issues.length === 0,
      sharedVisualCacheHits: episodeSharedVisualCacheHits,
      sharedVisualRequests: episodeSharedVisualRequests,
      subtitlePath,
    });
  }

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-034-canary-execution-evidence.v1",
    taskId: MICRO_034_TASK_ID,
    executedAt: input.executedAt,
    admittedAt: input.admittedAt,
    preparationFingerprint,
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
    sharedVisualCacheHits,
    outputRoot: input.outputRoot,
    episodes,
    publicationCalls: 0,
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
    sharedVisualCacheHits,
    episodes,
    outputRoot: input.outputRoot,
    evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

export {
  createMicro034MockVisualProductionPort,
  createMicro034MockVisualProductionPortFromEnv,
  createMicro034LiveVisualProductionPort,
  createMicro034LiveVisualProductionPortFromEnv,
} from "./micro-034-visual-production-ports.js";
