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
  computeRegistryFingerprint,
  visualRenderTargetRevisionHash,
} from "./visual-render-readiness.js";
import {
  defaultBoundedBatchBudgetProfiles,
  defaultV5PackRoot,
  evaluateE004E010BoundedBatchPreflight,
  MICRO_036_TASK_ID,
} from "./e004-e010-bounded-batch-preflight.js";
import {
  loadMicro036AssetGenerationApproval,
  loadMicro036CostBudgetApproval,
  loadMicro036OperatorAuthorization,
} from "./micro-036-batch-authorization-persistence.js";
import {
  computeMicro036ProviderConfigRevision,
  localeOutputSegment,
  MICRO_036_BATCH_COST_LIMIT_MINOR,
  MICRO_036_BATCH_EPISODE_IDS,
  MICRO_036_BATCH_LOCALES,
  MICRO_036_ESTIMATED_COST_MINOR_PER_IMAGE,
  MICRO_036_NON_EN_LOCALES,
  MICRO_036_VISUAL_PROFILE_REVISION,
  isMicro036OutOfScopeEpisodeId,
  resolveMicro036BatchEpisodeCostMinorAllocations,
  type Micro036BatchEpisodeId,
  type Micro036BatchLocale,
} from "./micro-036-batch-bindings.js";
import { loadMicro035CanaryExecutionEvidence } from "./micro-036-batch-micro-035-evidence.js";
import {
  assertMicro036EpisodeScopeAllowed,
  buildMicro036ExplicitExecuteAuthorizationRecord,
  computeMicro036PreparationFingerprint,
  loadMicro036ExplicitExecuteAuthorization,
  persistMicro036ExplicitExecuteAuthorization,
  summarizeMicro036PreparationForFingerprint,
} from "./micro-036-explicit-execute-authorization.js";
import { compileLocaleTtsSegmentation } from "./locale-tts-segmentation.js";
import type { FakeSelectedAudioFixture } from "./locale-tts-segmentation.js";
import { readAdmittedLocalizedScriptText } from "./audio-tts-readiness.js";
import {
  buildAudioTtsBudgetWorkItem,
  compileAudioTtsReadinessArtifacts,
} from "./audio-tts-readiness.js";
import { estimateMicrodramaOpenAiTtsCostMinor } from "./microdrama-openai-tts-pricing-catalog.js";
import {
  attachPlanRegistryToVisualProductionPort,
  type Micro036EnVisualProductionPort,
  type Micro036SegmentSynthesisPort,
  type Micro036SharedVisualReusePort,
} from "./micro-036-batch-production-ports.js";
import { normalizeSelectedAudioSegmentDurations } from "./micro-035-bounded-multilingual-canary-execute.js";
import { resolveMicro036OpenAiTtsModelConfigurationForLocale } from "./micro-036-openai-tts-env.js";
import { buildMicrodramaVisualGenerationPlan } from "./v5-visual-generation.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { compileV5EpisodeProduction } from "./v5-episode-production-compiler.js";
import { compileV5SceneShotPlans } from "./v5-scene-shot-compiler.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

export const MICRO_036_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.batch-execution-evidence.MICRO-036";

const EMPTY_LICENSED_AUDIO_TRACKS = licensedAudioLayerTracksSchema.parse({
  ambience: [],
  sfx: [],
  music: [],
});

export type Micro036BoundedBatchExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly executedAt: string;
  readonly outputRoot: string;
  readonly operatorId?: string;
  readonly segmentSynthesisPorts: Record<Micro036BatchLocale, Micro036SegmentSynthesisPort>;
  readonly enVisualProductionPort: Micro036EnVisualProductionPort;
  readonly sharedVisualReusePort: Micro036SharedVisualReusePort;
  readonly modelConfigurations?: Partial<Record<Micro036BatchLocale, LocaleTtsModelConfiguration>>;
  readonly measureAudioDurationMs?: (audioPath: string) => number;
  readonly micro035EvidenceJsonPath?: string;
  readonly ffmpegRunner?: (args: readonly string[]) => void;
  readonly requestedEpisodeIds?: readonly string[];
};

export type Micro036BatchEpisodeEvidence = {
  readonly locale: Micro036BatchLocale;
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

export type Micro036BoundedBatchExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly costLimitMinor: number;
  readonly sharedVisualCacheHits: number;
  readonly episodes: readonly Micro036BatchEpisodeEvidence[];
  readonly outputRoot: string;
  readonly evidenceProjectionKey: string;
};

export type Micro036AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly micro035EvidenceJsonPath?: string;
  readonly requestedEpisodeIds?: readonly string[];
};

export type Micro036AuthorizeExplicitExecuteResult = {
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

function collectScopeBlockers(requestedEpisodeIds?: readonly string[]): string[] {
  if (!requestedEpisodeIds) {
    return [];
  }
  const blockers: string[] = [];
  for (const episodeId of requestedEpisodeIds) {
    const normalized = episodeId.toUpperCase();
    if (isMicro036OutOfScopeEpisodeId(normalized)) {
      blockers.push(`EPISODE_RANGE_BLOCKED_${normalized}`);
    }
    try {
      assertMicro036EpisodeScopeAllowed(normalized);
    } catch {
      if (!blockers.includes(`EPISODE_RANGE_BLOCKED_${normalized}`)) {
        blockers.push(`EPISODE_OUT_OF_SCOPE_${normalized}`);
      }
    }
  }
  return blockers;
}

function blockedResult(
  input: Micro036BoundedBatchExecuteInput,
  blockers: readonly string[],
  providerRequests: number,
  totalCostMinor: number,
  sharedVisualCacheHits: number,
  episodes: readonly Micro036BatchEpisodeEvidence[]
): Micro036BoundedBatchExecuteResult {
  return {
    status: "BLOCKED",
    blockers,
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
    sharedVisualCacheHits,
    episodes,
    outputRoot: input.outputRoot,
    evidenceProjectionKey: MICRO_036_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

export async function authorizeMicro036BoundedBatchExplicitExecute(
  input: Micro036AuthorizeExplicitExecuteInput
): Promise<Micro036AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [...collectScopeBlockers(input.requestedEpisodeIds)];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro036OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro036AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro036CostBudgetApproval(microdramaRepository);
  const micro035Evidence = loadMicro035CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro035EvidenceJsonPath
      ? { jsonFilePath: input.micro035EvidenceJsonPath }
      : {}),
  });

  if (!operatorAuthorization) blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  if (!assetGenerationApproval) blockers.push("ASSET_GENERATION_APPROVAL_MISSING");
  if (!costBudgetApproval) blockers.push("COST_BUDGET_APPROVAL_MISSING");
  if (!micro035Evidence || micro035Evidence.status !== "DONE") {
    blockers.push("MICRO_035_EVIDENCE_MISSING");
  }

  const preflight = await evaluateE004E010BoundedBatchPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.authorizedAt,
    profiles: defaultBoundedBatchBudgetProfiles(input.authorizedAt),
    micro035Evidence,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    requestedEpisodeIds: input.requestedEpisodeIds,
  });

  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }
  blockers.push(...preflight.scopeBlockers);

  if (blockers.length > 0) {
    return {
      status: "BLOCKED",
      blockers,
      authorizationId: null,
      preparationFingerprint: null,
    };
  }

  const preparationSummary = summarizeMicro036PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro036PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.scriptRevisionIds,
    revisionSet: preflight.revisionSet,
    visualProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
    providerConfigRevision: computeMicro036ProviderConfigRevision(),
  });

  const record = buildMicro036ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    scriptRevisionIds: preflight.scriptRevisionIds,
    revisionSet: preflight.revisionSet,
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro036ExplicitExecuteAuthorization({
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

export async function executeMicro036BoundedBatch(
  input: Micro036BoundedBatchExecuteInput
): Promise<Micro036BoundedBatchExecuteResult> {
  const scopeBlockers = collectScopeBlockers(input.requestedEpisodeIds);
  if (scopeBlockers.length > 0) {
    return blockedResult(input, scopeBlockers, 0, 0, 0, []);
  }

  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const measureDurationMs = input.measureAudioDurationMs ?? defaultMeasureAudioDurationMs;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();

  const operatorAuthorization = loadMicro036OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro036AssetGenerationApproval(microdramaRepository);
  const executeAuthorization = loadMicro036ExplicitExecuteAuthorization(microdramaRepository);
  const micro035Evidence = loadMicro035CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro035EvidenceJsonPath
      ? { jsonFilePath: input.micro035EvidenceJsonPath }
      : {}),
  });

  if (!executeAuthorization) blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  if (!micro035Evidence || micro035Evidence.status !== "DONE") {
    blockers.push("MICRO_035_EVIDENCE_MISSING");
  }

  const preflight = await evaluateE004E010BoundedBatchPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.executedAt,
    profiles: defaultBoundedBatchBudgetProfiles(input.executedAt),
    micro035Evidence,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    requestedEpisodeIds: input.requestedEpisodeIds,
  });

  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }
  blockers.push(...preflight.scopeBlockers);

  const preparationSummary = summarizeMicro036PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro036PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.scriptRevisionIds,
    revisionSet: preflight.revisionSet,
    visualProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
    providerConfigRevision: computeMicro036ProviderConfigRevision(),
  });

  if (
    executeAuthorization &&
    executeAuthorization.preparationFingerprint !== preparationFingerprint
  ) {
    blockers.push("EXPLICIT_EXECUTE_PREPARATION_STALE");
  }

  if (blockers.length > 0) {
    return blockedResult(input, blockers, 0, 0, 0, []);
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

  for (const profile of defaultBoundedBatchBudgetProfiles(input.executedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  let providerRequests = 0;
  let totalCostMinor = 0;
  let sharedVisualCacheHits = 0;
  const episodes: Micro036BatchEpisodeEvidence[] = [];
  const existingAttributions: MicrodramaCostAttribution[] = [];
  const episodeCostAllocations = resolveMicro036BatchEpisodeCostMinorAllocations();
  const executeCorrelationNonce = createHash("sha256")
    .update(input.executedAt)
    .digest("hex")
    .slice(0, 12);
  const ffmpegRunner = input.ffmpegRunner ?? runFfmpeg;

  for (const episodeId of MICRO_036_BATCH_EPISODE_IDS) {
    const plan = sceneShotPlans.bundle.records.find(
      (entry) => entry.episodeId === episodeId
    );
    if (!plan) {
      return blockedResult(
        input,
        [`EPISODE_INPUTS_MISSING_${episodeId}`],
        providerRequests,
        totalCostMinor,
        sharedVisualCacheHits,
        episodes
      );
    }

    const enEvidence = await produceBatchLocaleEpisode({
      locale: "en-US",
      episodeId,
      plan,
      admissionScripts: admission.bundle.admittedScripts,
      packRoot,
      input,
      budgetRepository,
      executeAuthorization: executeAuthorization!,
      executeCorrelationNonce,
      episodeCostAllocations,
      existingAttributions,
      measureDurationMs,
      ffmpegRunner,
      enVisualProductionPort: input.enVisualProductionPort,
      sharedVisualReusePort: input.sharedVisualReusePort,
      getCounters: () => ({ providerRequests, totalCostMinor, sharedVisualCacheHits }),
      setCounters: (next) => {
        providerRequests = next.providerRequests;
        totalCostMinor = next.totalCostMinor;
        sharedVisualCacheHits = next.sharedVisualCacheHits;
      },
    });
    if ("blockers" in enEvidence) {
      return blockedResult(
        input,
        enEvidence.blockers,
        providerRequests,
        totalCostMinor,
        sharedVisualCacheHits,
        episodes
      );
    }
    episodes.push(enEvidence);
    existingAttributions.push(...enEvidence.newAttributions);

    for (const locale of MICRO_036_NON_EN_LOCALES) {
      const localeEvidence = await produceBatchLocaleEpisode({
        locale,
        episodeId,
        plan,
        admissionScripts: admission.bundle.admittedScripts,
        packRoot,
        input,
        budgetRepository,
        executeAuthorization: executeAuthorization!,
        executeCorrelationNonce,
        episodeCostAllocations,
        existingAttributions,
        measureDurationMs,
        ffmpegRunner,
        enVisualProductionPort: input.enVisualProductionPort,
        sharedVisualReusePort: input.sharedVisualReusePort,
        getCounters: () => ({ providerRequests, totalCostMinor, sharedVisualCacheHits }),
        setCounters: (next) => {
          providerRequests = next.providerRequests;
          totalCostMinor = next.totalCostMinor;
          sharedVisualCacheHits = next.sharedVisualCacheHits;
        },
      });
      if ("blockers" in localeEvidence) {
        return blockedResult(
          input,
          localeEvidence.blockers,
          providerRequests,
          totalCostMinor,
          sharedVisualCacheHits,
          episodes
        );
      }
      episodes.push(localeEvidence);
      existingAttributions.push(...localeEvidence.newAttributions);
    }
  }

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-036-batch-execution-evidence.v1",
    taskId: MICRO_036_TASK_ID,
    executedAt: input.executedAt,
    admittedAt: input.admittedAt,
    preparationFingerprint,
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
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
    projectionKey: MICRO_036_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
    sharedVisualCacheHits,
    episodes,
    outputRoot: input.outputRoot,
    evidenceProjectionKey: MICRO_036_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

type ProduceCounters = {
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly sharedVisualCacheHits: number;
};

type ProduceBatchLocaleEpisodeResult =
  | (Micro036BatchEpisodeEvidence & { readonly newAttributions: MicrodramaCostAttribution[] })
  | { readonly blockers: readonly string[] };

async function produceBatchLocaleEpisode(input: {
  readonly locale: Micro036BatchLocale;
  readonly episodeId: Micro036BatchEpisodeId;
  readonly plan: NonNullable<
    ReturnType<typeof compileV5SceneShotPlans> extends { ok: true; bundle: infer B }
      ? B extends { records: infer R }
        ? R extends readonly (infer P)[]
          ? P
          : never
        : never
      : never
  >;
  readonly admissionScripts: ReturnType<
    typeof compileV5CanonAdmission
  > extends { ok: true; bundle: infer B }
    ? B extends { admittedScripts: infer S }
      ? S
      : never
    : never;
  readonly packRoot: string;
  readonly input: Micro036BoundedBatchExecuteInput;
  readonly budgetRepository: MicrodramaBudgetRepository;
  readonly executeAuthorization: NonNullable<
    ReturnType<typeof loadMicro036ExplicitExecuteAuthorization>
  >;
  readonly executeCorrelationNonce: string;
  readonly episodeCostAllocations: ReturnType<
    typeof resolveMicro036BatchEpisodeCostMinorAllocations
  >;
  readonly existingAttributions: readonly MicrodramaCostAttribution[];
  readonly measureDurationMs: (audioPath: string) => number;
  readonly ffmpegRunner: (args: readonly string[]) => void;
  readonly enVisualProductionPort: Micro036EnVisualProductionPort;
  readonly sharedVisualReusePort: Micro036SharedVisualReusePort;
  readonly getCounters: () => ProduceCounters;
  readonly setCounters: (next: ProduceCounters) => void;
}): Promise<ProduceBatchLocaleEpisodeResult> {
  let { providerRequests, totalCostMinor, sharedVisualCacheHits } = input.getCounters();
  const newAttributions: MicrodramaCostAttribution[] = [];
  const block = (blockers: readonly string[]) => {
    input.setCounters({ providerRequests, totalCostMinor, sharedVisualCacheHits });
    return { blockers };
  };

  const script = input.admissionScripts.find(
    (entry) => entry.episodeId === input.episodeId && entry.locale === input.locale
  );
  if (!script) {
    return block([`EPISODE_INPUTS_MISSING_${input.locale}_${input.episodeId}`]);
  }

  const segmentSynthesisPort = input.input.segmentSynthesisPorts[input.locale];
  const modelConfiguration =
    input.input.modelConfigurations?.[input.locale] ??
    resolveMicro036OpenAiTtsModelConfigurationForLocale(input.locale);
  const audioExtension = audioExtensionForFormat(modelConfiguration.outputFormat);
  const episodeOutputDir = path.join(
    input.input.outputRoot,
    localeOutputSegment(input.locale),
    input.episodeId.toLowerCase()
  );
  mkdirSync(episodeOutputDir, { recursive: true });

  const { segmentationBundle: lexicalBundle, binding } = compileAudioTtsReadinessArtifacts({
    packRoot: input.packRoot,
    script,
    voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    modelConfiguration,
  });
  const workItem = buildAudioTtsBudgetWorkItem({
    binding,
    modelConfiguration,
    estimatedCostMinor:
      input.episodeCostAllocations[`${input.locale}:${input.episodeId}` as const],
  });
  const episodeCorrelationId = `corr.micro036.${input.locale.toLowerCase()}.${input.episodeId.toLowerCase()}.${input.executeCorrelationNonce}`;
  const episodePreflight = input.budgetRepository.runBudgetPreflight({
    correlationId: episodeCorrelationId,
    workItems: [workItem],
    evaluatedAt: input.input.executedAt,
  });
  if (!episodePreflight.allowed) {
    return block([`BUDGET_PREFLIGHT_BLOCKED_${input.locale}_${input.episodeId}`]);
  }
  const reservations = input.budgetRepository.recordPreflightReservations(episodePreflight);
  const reservationId =
    reservations[0]?.reservationId ??
    `reservation.micro036.${input.locale.toLowerCase()}.${input.episodeId.toLowerCase()}.${input.executeCorrelationNonce}`;

  const segmentDurationsMs: number[] = [];
  for (const segment of lexicalBundle.segmentRequests) {
    if (providerRequests >= input.executeAuthorization.binds.maximumProviderRequests) {
      return block(["MAXIMUM_PROVIDER_REQUESTS_EXCEEDED"]);
    }
    const segmentPath = path.join(
      episodeOutputDir,
      `${segment.segmentId}.${audioExtension}`
    );
    const billableCharacters = (
      await segmentSynthesisPort.synthesizeSegment({
        segmentId: segment.segmentId,
        text: segment.text,
        outputPath: segmentPath,
      })
    ).billableCharacters;
    providerRequests += 1;
    const segmentCostMinor = estimateMicrodramaOpenAiTtsCostMinor({
      billableCharacters,
    }).estimatedCostMinor;
    totalCostMinor += segmentCostMinor;
    if (totalCostMinor > MICRO_036_BATCH_COST_LIMIT_MINOR) {
      return block(["COST_LIMIT_EXCEEDED"]);
    }
    segmentDurationsMs.push(input.measureDurationMs(segmentPath));
    const attributed = attributeMicrodramaCost({
      attribution: {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: `attrib.micro-036.${input.executeCorrelationNonce}.${segment.segmentId}`,
        episodeId: input.episodeId.toLowerCase(),
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
        requestId: `req.micro-036.${input.executeCorrelationNonce}.${segment.segmentId}`,
        recordedAt: input.input.executedAt,
      },
      existingAttributions: [...input.existingAttributions, ...newAttributions],
    });
    if (attributed.record) {
      input.budgetRepository.recordCostAttribution({
        attribution: attributed.record,
        evidence: {
          taskId: MICRO_036_TASK_ID,
          segmentId: segment.segmentId,
          billableCharacters,
        },
      });
      newAttributions.push(attributed.record);
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
    ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", narrationAudioPath],
    { encoding: "utf8" }
  );
  if (concatResult.status !== 0) {
    return block([`NARRATION_CONCAT_FAILED_${input.locale}_${input.episodeId}`]);
  }

  const measuredDurationMs = input.measureDurationMs(narrationAudioPath);
  const selectedAudio = buildSelectedAudioFixture({
    segmentDurationsMs,
    totalDurationMs: measuredDurationMs,
  });
  const scriptText = readAdmittedLocalizedScriptText({ packRoot: input.packRoot, script });
  const segmentationBundle = compileLocaleTtsSegmentation({
    scriptText,
    scriptRevisionId: script.scriptRevisionId,
    locale: script.locale,
    voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    modelConfiguration,
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
    plan: input.plan,
    timelineInput: {
      plan: input.plan,
      ttsBundle: segmentationBundle,
      timingDependency,
      subtitleProjection,
    },
    licensedAudioTracks: EMPTY_LICENSED_AUDIO_TRACKS,
    licensedAudioAssets: [],
    evaluatedAt: input.input.executedAt,
    territory: "WW",
    renderProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
  });

  const renderWorkItem = buildVisualRenderBudgetWorkItem({
    binding: compiledVisual.binding,
    estimatedCostMinor: 150,
  });
  const renderPreflight = input.budgetRepository.runBudgetPreflight({
    correlationId: `${episodeCorrelationId}.render`,
    workItems: [renderWorkItem],
    evaluatedAt: input.input.executedAt,
  });
  if (!renderPreflight.allowed) {
    return block([`RENDER_BUDGET_PREFLIGHT_BLOCKED_${input.locale}_${input.episodeId}`]);
  }
  const renderReservations = input.budgetRepository.recordPreflightReservations(renderPreflight);
  const renderReservationId =
    renderReservations[0]?.reservationId ??
    `reservation.micro036.${input.locale.toLowerCase()}.${input.episodeId.toLowerCase()}.render.${input.executeCorrelationNonce}`;

  const clipAssetPaths: Record<string, string> = {};
  let episodeSharedVisualCacheHits = 0;
  let episodeSharedVisualRequests = 0;
  const visualPlan = buildMicrodramaVisualGenerationPlan({
    seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
    plan: input.plan,
    registryRevisionFingerprints:
      input.locale === "en-US" ? [computeRegistryFingerprint(input.plan)] : [],
  });
  const visualsDir = path.join(episodeOutputDir, "visuals");
  mkdirSync(visualsDir, { recursive: true });

  const visualPort =
    input.locale === "en-US"
      ? attachPlanRegistryToVisualProductionPort({
          port: input.enVisualProductionPort,
          plan: input.plan,
          createdAt: input.input.executedAt,
        })
      : null;

  for (const item of visualPlan) {
    if (providerRequests >= input.executeAuthorization.binds.maximumProviderRequests) {
      return block(["MAXIMUM_PROVIDER_REQUESTS_EXCEEDED"]);
    }
    const outputPath = path.join(visualsDir, `${item.request.sourcePlateSemanticId}.png`);
    const effect =
      input.locale === "en-US"
        ? await visualPort!.generateSharedVisual({
            request: item.request,
            outputPath,
          })
        : await input.sharedVisualReusePort.generateSharedVisual({
            request: item.request,
            outputPath,
          });
    providerRequests += 1;
    episodeSharedVisualRequests += 1;
    if (effect.cacheHit) {
      sharedVisualCacheHits += 1;
      episodeSharedVisualCacheHits += 1;
    }
    for (const shot of input.plan.shots) {
      if (shot.sourcePlateSemanticId === item.request.sourcePlateSemanticId) {
        clipAssetPaths[shot.shotSemanticId] = outputPath;
      }
    }
    const imageCostMinor =
      input.locale === "en-US" && !effect.cacheHit
        ? MICRO_036_ESTIMATED_COST_MINOR_PER_IMAGE
        : 0;
    totalCostMinor += imageCostMinor;
    if (totalCostMinor > MICRO_036_BATCH_COST_LIMIT_MINOR) {
      return block(["COST_LIMIT_EXCEEDED"]);
    }
    const attributed = attributeMicrodramaCost({
      attribution: {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: `attrib.micro-036.${input.executeCorrelationNonce}.${item.request.requestId}`,
        episodeId: input.episodeId.toLowerCase(),
        provider: "mock-image",
        assetType: "image",
        assetCostScope: "shared_visual",
        revisionId: input.plan.shotPlanRevisionId,
        reservationId: renderReservationId,
        costMinor: imageCostMinor,
        cacheStatus: effect.cacheHit ? "hit" : "miss",
        retryCount: 0,
        correlationId: `${episodeCorrelationId}.${item.request.requestId}`,
        requestId: `req.micro-036.${input.executeCorrelationNonce}.${item.request.requestId}`,
        recordedAt: input.input.executedAt,
      },
      existingAttributions: [...input.existingAttributions, ...newAttributions],
    });
    if (attributed.record) {
      input.budgetRepository.recordCostAttribution({
        attribution: attributed.record,
        evidence: {
          taskId: MICRO_036_TASK_ID,
          requestId: item.request.requestId,
          cacheHit: effect.cacheHit,
        },
      });
      newAttributions.push(attributed.record);
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
    input.ffmpegRunner(command);
    providerRequests += 1;
  }
  const concatCommand = ffmpegCommands.at(-2);
  if (concatCommand) {
    input.ffmpegRunner(concatCommand);
    providerRequests += 1;
  }
  const subtitleBurnCommand = ffmpegCommands.at(-1);
  if (subtitleBurnCommand) {
    input.ffmpegRunner(subtitleBurnCommand);
    providerRequests += 1;
  }
  if (input.input.ffmpegRunner) {
    writeFileSync(renderOutputPath, Buffer.from("mock-render"), "utf8");
  }

  const renderCostMinor = 150;
  totalCostMinor += renderCostMinor;
  if (totalCostMinor > MICRO_036_BATCH_COST_LIMIT_MINOR) {
    return block(["COST_LIMIT_EXCEEDED"]);
  }
  const renderAttributed = attributeMicrodramaCost({
    attribution: {
      schemaVersion: "mediaforge.microdrama-budget.v1",
      attributionId: `attrib.micro-036.${input.executeCorrelationNonce}.${input.locale.toLowerCase()}.${input.episodeId.toLowerCase()}.render`,
      episodeId: input.episodeId.toLowerCase(),
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
      requestId: `req.micro-036.${input.executeCorrelationNonce}.${input.locale.toLowerCase()}.${input.episodeId.toLowerCase()}.render`,
      recordedAt: input.input.executedAt,
    },
    existingAttributions: [...input.existingAttributions, ...newAttributions],
  });
  if (renderAttributed.record) {
    input.budgetRepository.recordCostAttribution({
      attribution: renderAttributed.record,
      evidence: {
        taskId: MICRO_036_TASK_ID,
        renderOutputPath,
        manifestHash: manifest.contentHash,
      },
    });
    newAttributions.push(renderAttributed.record);
  }

  const alignment = buildLocaleTtsSelectedAudioAlignment({
    alignmentRevisionId: segmentationBundle.timingContract.alignmentRevisionId,
    segments: segmentationBundle.segmentRequests.map((segment, index) => ({
      segmentId: segment.segmentId,
      text: segment.text,
      durationMs: selectedAudio.segmentDurationsMs[index] ?? 0,
    })),
  });

  input.setCounters({ providerRequests, totalCostMinor, sharedVisualCacheHits });
  return {
    locale: input.locale,
    episodeId: input.episodeId,
    scriptRevisionId: script.scriptRevisionId,
    alignmentRevisionId: alignment.alignmentRevisionId,
    narrationAudioPath,
    renderOutputPath,
    visualRenderHash: visualRenderTargetRevisionHash(compiledVisual.binding),
    safeZonePass: compiledVisual.safeZoneValidation.issues.length === 0,
    sharedVisualCacheHits: episodeSharedVisualCacheHits,
    sharedVisualRequests: episodeSharedVisualRequests,
    subtitlePath,
    newAttributions,
  };
}

export {
  createMicro036MockEnVisualProductionPort,
  createMicro036MockSegmentSynthesisPort,
  createMicro036MockSegmentSynthesisPorts,
  createMicro036MockSharedVisualReusePort,
  createMicro036SharedVisualReusePort,
} from "./micro-036-batch-production-ports.js";
