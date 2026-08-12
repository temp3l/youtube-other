import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import path from "node:path";

import { buildLocaleTtsSelectedAudioAlignment } from "@mediaforge/alignment/locale-tts-alignment.js";
import {
  attributeMicrodramaCost,
  type MicrodramaCostAttribution,
} from "@mediaforge/domain";
import type { LocaleTtsModelConfiguration } from "@mediaforge/speech/locale-tts-segmentation.js";
import {
  CharacterVoiceSQLiteRepository,
  MicrodramaBudgetRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";
import { computePayloadHash } from "@mediaforge/narrative-core";

import {
  buildAudioTtsBudgetWorkItem,
  compileAudioTtsReadinessArtifacts,
} from "./audio-tts-readiness.js";
import {
  defaultEnTtsCanaryBudgetProfiles,
  defaultEnTtsCanaryModelConfiguration,
  defaultV5PackRoot,
  evaluateEnE001E003TtsCanaryPreflight,
  MICRO_033_TASK_ID,
} from "./en-e001-e003-tts-canary-preflight.js";
import {
  loadMicro033AssetGenerationApproval,
  loadMicro033CostBudgetApproval,
  loadMicro033OperatorAuthorization,
  loadMicro033SpeechCredential,
} from "./micro-033-canary-authorization-persistence.js";
import {
  computeMicro033ProviderConfigRevision,
  MICRO_033_CANARY_COST_LIMIT_MINOR,
  MICRO_033_CANARY_EPISODE_IDS,
  MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION,
} from "./micro-033-canary-bindings.js";
import {
  buildMicro033ExplicitExecuteAuthorizationRecord,
  computeMicro033PreparationFingerprint,
  loadMicro033ExplicitExecuteAuthorization,
  persistMicro033ExplicitExecuteAuthorization,
  summarizeMicro033PreparationForFingerprint,
} from "./micro-033-explicit-execute-authorization.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { resolveLocaleProductionProfile } from "./v5-production-profile.js";
import { buildSevenMinutesAheadProductionProfile } from "./v5-production-profile.js";
import { estimateMicrodramaOpenAiTtsCostMinor } from "./microdrama-openai-tts-pricing-catalog.js";
import type { Micro033SegmentSynthesisPort } from "./micro-033-segment-synthesis.js";
import {
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

export type { Micro033SegmentSynthesisPort } from "./micro-033-segment-synthesis.js";
export {
  createMicro033MockSegmentSynthesisPort,
  createMicro033OpenAiSegmentSynthesisPortFromEnv,
  createMicro033OpenAiSpeechProviderFromEnv,
} from "./micro-033-segment-synthesis.js";

export const MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.canary-execution-evidence.MICRO-033";

export type Micro033BoundedTtsCanaryExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly executedAt: string;
  readonly outputRoot: string;
  readonly operatorId?: string;
  readonly segmentSynthesisPort: Micro033SegmentSynthesisPort;
  readonly modelConfiguration?: LocaleTtsModelConfiguration;
  readonly measureAudioDurationMs?: (audioPath: string) => number;
};

export type Micro033EpisodeCanaryTimingEvidence = {
  readonly episodeId: string;
  readonly scriptRevisionId: string;
  readonly measuredDurationMs: number;
  readonly segmentDurationsMs: readonly number[];
  readonly alignmentRevisionId: string;
  readonly narrationAudioPath: string;
  readonly narrationAudioSha256: string;
  readonly calibratedAudioGateGuidance: {
    readonly calibrationStatus: "CALIBRATED_FROM_CANARY";
    readonly measuredDurationSeconds: number;
    readonly softDurationSeconds: number;
    readonly hardDurationSeconds: number;
    readonly lexicalDurationSecondsMin: number;
    readonly lexicalDurationSecondsMax: number;
  };
};

export type Micro033BoundedTtsCanaryExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly costLimitMinor: number;
  readonly episodes: readonly Micro033EpisodeCanaryTimingEvidence[];
  readonly outputRoot: string;
  readonly evidenceProjectionKey: string;
};

export type Micro033AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
};

export type Micro033AuthorizeExplicitExecuteResult = {
  readonly status: "AUTHORIZED" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly authorizationId: string | null;
  readonly preparationFingerprint: string | null;
};

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

function proposeCalibratedAudioGateGuidance(input: {
  readonly measuredDurationMs: number;
  readonly lexicalDurationSecondsMin: number;
  readonly lexicalDurationSecondsMax: number;
}): Micro033EpisodeCanaryTimingEvidence["calibratedAudioGateGuidance"] {
  const measuredDurationSeconds = Number((input.measuredDurationMs / 1_000).toFixed(3));
  const softDurationSeconds = Number(
    Math.max(
      input.lexicalDurationSecondsMin,
      Math.min(measuredDurationSeconds * 0.95, input.lexicalDurationSecondsMax)
    ).toFixed(3)
  );
  const hardDurationSeconds = Number(
    Math.min(
      input.lexicalDurationSecondsMax,
      Math.max(measuredDurationSeconds * 1.05, input.lexicalDurationSecondsMin)
    ).toFixed(3)
  );
  return {
    calibrationStatus: "CALIBRATED_FROM_CANARY",
    measuredDurationSeconds,
    softDurationSeconds,
    hardDurationSeconds,
    lexicalDurationSecondsMin: input.lexicalDurationSecondsMin,
    lexicalDurationSecondsMax: input.lexicalDurationSecondsMax,
  };
}

function audioExtensionForFormat(
  outputFormat: LocaleTtsModelConfiguration["outputFormat"] | undefined
): string {
  if (outputFormat === "wav" || outputFormat === "pcm" || outputFormat === "flac") {
    return outputFormat === "flac" ? "flac" : "wav";
  }
  return "mp3";
}

async function synthesizeSegmentToFile(input: {
  readonly segmentSynthesisPort: Micro033SegmentSynthesisPort;
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

export async function authorizeMicro033BoundedCanaryExplicitExecute(
  input: Micro033AuthorizeExplicitExecuteInput
): Promise<Micro033AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const voiceRepository = new CharacterVoiceSQLiteRepository(sqlite);
  voiceRepository.migrate();

  const operatorAuthorization = loadMicro033OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro033AssetGenerationApproval(microdramaRepository);
  const speechCredential = loadMicro033SpeechCredential(microdramaRepository);
  const costBudgetApproval = loadMicro033CostBudgetApproval(microdramaRepository);

  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }
  if (!assetGenerationApproval) {
    blockers.push("ASSET_GENERATION_APPROVAL_MISSING");
  }
  if (!costBudgetApproval) {
    blockers.push("COST_BUDGET_APPROVAL_MISSING");
  }
  if (!speechCredential) {
    blockers.push("SPEECH_CREDENTIAL_MISSING");
  }

  const preflight = await evaluateEnE001E003TtsCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.authorizedAt,
    profiles: defaultEnTtsCanaryBudgetProfiles(input.authorizedAt),
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    voiceRegistryPort: voiceRepository,
    speechCredential: speechCredential ?? undefined,
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

  const preparationSummary = summarizeMicro033PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro033PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.bindingProbe.scriptRevisionIds,
    voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    providerConfigRevision: computeMicro033ProviderConfigRevision(
      MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION
    ),
  });

  const record = buildMicro033ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    scriptRevisionIds: preflight.bindingProbe.scriptRevisionIds,
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro033ExplicitExecuteAuthorization({
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

export async function executeMicro033BoundedTtsCanary(
  input: Micro033BoundedTtsCanaryExecuteInput
): Promise<Micro033BoundedTtsCanaryExecuteResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const modelConfiguration =
    input.modelConfiguration ?? defaultEnTtsCanaryModelConfiguration();
  const audioExtension = audioExtensionForFormat(modelConfiguration.outputFormat);
  const measureDurationMs = input.measureAudioDurationMs ?? defaultMeasureAudioDurationMs;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const voiceRepository = new CharacterVoiceSQLiteRepository(sqlite);
  voiceRepository.migrate();
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();

  const operatorAuthorization = loadMicro033OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval = loadMicro033AssetGenerationApproval(microdramaRepository);
  const speechCredential = loadMicro033SpeechCredential(microdramaRepository);
  const executeAuthorization = loadMicro033ExplicitExecuteAuthorization(microdramaRepository);

  if (!executeAuthorization) {
    blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  }

  const preflight = await evaluateEnE001E003TtsCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.executedAt,
    profiles: defaultEnTtsCanaryBudgetProfiles(input.executedAt),
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    voiceRegistryPort: voiceRepository,
    speechCredential: speechCredential ?? undefined,
  });

  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  const preparationSummary = summarizeMicro033PreparationForFingerprint(
    microdramaRepository
  );
  const preparationFingerprint = computeMicro033PreparationFingerprint({
    ...preparationSummary,
    scriptRevisionIds: preflight.bindingProbe.scriptRevisionIds,
    voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    providerConfigRevision: computeMicro033ProviderConfigRevision(
      MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION
    ),
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
      costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      providerRequests: 0,
      totalCostMinor: 0,
      costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const productionProfile = buildSevenMinutesAheadProductionProfile(input.executedAt);
  const localeProfile = resolveLocaleProductionProfile(productionProfile, "en-US");
  if (!localeProfile) {
    return {
      status: "BLOCKED",
      blockers: ["LOCALE_PROFILE_MISSING"],
      providerRequests: 0,
      totalCostMinor: 0,
      costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
      episodes: [],
      outputRoot: input.outputRoot,
      evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  mkdirSync(input.outputRoot, { recursive: true });

  for (const profile of defaultEnTtsCanaryBudgetProfiles(input.executedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  let providerRequests = 0;
  let totalCostMinor = 0;
  const episodes: Micro033EpisodeCanaryTimingEvidence[] = [];
  const existingAttributions: MicrodramaCostAttribution[] = [];

  const executeCorrelationNonce = createHash("sha256")
    .update(input.executedAt)
    .digest("hex")
    .slice(0, 12);

  for (const episodeId of MICRO_033_CANARY_EPISODE_IDS) {
    const script = admission.bundle.admittedScripts.find(
      (entry) => entry.episodeId === episodeId && entry.locale === "en-US"
    );
    if (!script) {
      return {
        status: "BLOCKED",
        blockers: [`SCRIPT_MISSING_${episodeId}`],
        providerRequests,
        totalCostMinor,
        costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
        episodes,
        outputRoot: input.outputRoot,
        evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
      };
    }

    const { segmentationBundle, binding } = compileAudioTtsReadinessArtifacts({
      packRoot,
      script,
      voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      modelConfiguration,
    });

    const episodeOutputDir = path.join(
      input.outputRoot,
      "en-us",
      episodeId.toLowerCase()
    );
    mkdirSync(episodeOutputDir, { recursive: true });

    const workItem = buildAudioTtsBudgetWorkItem({
      binding,
      modelConfiguration,
      estimatedCostMinor: estimateMicrodramaOpenAiTtsCostMinor({
        billableCharacters: segmentationBundle.segmentRequests.reduce(
          (total, segment) => total + [...segment.text].length,
          0
        ),
      }).estimatedCostMinor,
    });

    const episodeCorrelationId = `corr.micro033.${episodeId.toLowerCase()}.${executeCorrelationNonce}`;
    const episodePreflight = budgetRepository.runBudgetPreflight({
      correlationId: episodeCorrelationId,
      workItems: [workItem],
      evaluatedAt: input.executedAt,
    });
    if (!episodePreflight.allowed) {
      return {
        status: "BLOCKED",
        blockers: [`BUDGET_PREFLIGHT_BLOCKED_${episodeId}`],
        providerRequests,
        totalCostMinor,
        costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
        episodes,
        outputRoot: input.outputRoot,
        evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
      };
    }
    const reservations = budgetRepository.recordPreflightReservations(episodePreflight);
    const reservationId =
      reservations[0]?.reservationId ??
      `reservation.micro033.${episodeId.toLowerCase()}.${executeCorrelationNonce}`;

    const segmentDurationsMs: number[] = [];
    let episodeBillableCharacters = 0;

    for (const segment of segmentationBundle.segmentRequests) {
      if (providerRequests >= executeAuthorization!.binds.maximumProviderRequests) {
        return {
          status: "BLOCKED",
          blockers: ["MAXIMUM_PROVIDER_REQUESTS_EXCEEDED"],
          providerRequests,
          totalCostMinor,
          costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
          episodes,
          outputRoot: input.outputRoot,
          evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
        };
      }

      const segmentPath = path.join(
        episodeOutputDir,
        `${segment.segmentId}.${audioExtension}`
      );
      const billableCharacters = await synthesizeSegmentToFile({
        segmentSynthesisPort: input.segmentSynthesisPort,
        segmentId: segment.segmentId,
        text: segment.text,
        outputPath: segmentPath,
      });
      providerRequests += 1;
      episodeBillableCharacters += billableCharacters;

      const segmentCostMinor = estimateMicrodramaOpenAiTtsCostMinor({
        billableCharacters,
      }).estimatedCostMinor;
      totalCostMinor += segmentCostMinor;

      if (totalCostMinor > MICRO_033_CANARY_COST_LIMIT_MINOR) {
        return {
          status: "BLOCKED",
          blockers: ["COST_LIMIT_EXCEEDED"],
          providerRequests,
          totalCostMinor,
          costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
          episodes,
          outputRoot: input.outputRoot,
          evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
        };
      }

      segmentDurationsMs.push(measureDurationMs(segmentPath));

      const attribution: MicrodramaCostAttribution = {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: `attrib.micro-033.${segment.segmentId}`,
        episodeId: episodeId.toLowerCase(),
        locale: script.locale,
        provider: modelConfiguration.provider,
        assetType: "tts",
        assetCostScope: "locale_tts",
        revisionId: workItem.revisionId,
        reservationId,
        costMinor: segmentCostMinor,
        cacheStatus: "miss",
        retryCount: 0,
        correlationId: `${episodeCorrelationId}.${segment.segmentId}`,
        requestId: `req.micro-033.${segment.segmentId}`,
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
            taskId: MICRO_033_TASK_ID,
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
    const concatLines = segmentationBundle.segmentRequests.map(
      (segment) =>
        `file '${path.join(
          episodeOutputDir,
          `${segment.segmentId}.${audioExtension}`
        ).replaceAll("'", "'\\''")}'`
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
      return {
        status: "BLOCKED",
        blockers: [`NARRATION_CONCAT_FAILED_${episodeId}`],
        providerRequests,
        totalCostMinor,
        costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
        episodes,
        outputRoot: input.outputRoot,
        evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
      };
    }

    const measuredDurationMs = measureDurationMs(narrationAudioPath);
    const alignment = buildLocaleTtsSelectedAudioAlignment({
      alignmentRevisionId: segmentationBundle.timingContract.alignmentRevisionId,
      segments: segmentationBundle.segmentRequests.map((segment, index) => ({
        segmentId: segment.segmentId,
        text: segment.text,
        durationMs: segmentDurationsMs[index] ?? 0,
      })),
    });

    episodes.push({
      episodeId,
      scriptRevisionId: script.scriptRevisionId,
      measuredDurationMs,
      segmentDurationsMs,
      alignmentRevisionId: alignment.alignmentRevisionId,
      narrationAudioPath,
      narrationAudioSha256: sha256File(narrationAudioPath),
      calibratedAudioGateGuidance: proposeCalibratedAudioGateGuidance({
        measuredDurationMs,
        lexicalDurationSecondsMin: localeProfile.lexicalGate.durationSecondsMin,
        lexicalDurationSecondsMax: localeProfile.lexicalGate.durationSecondsMax,
      }),
    });
  }

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-033-canary-execution-evidence.v1",
    taskId: MICRO_033_TASK_ID,
    executedAt: input.executedAt,
    admittedAt: input.admittedAt,
    preparationFingerprint,
    providerRequests,
    totalCostMinor,
    totalBillableCharacters: episodes.reduce(
      (total, episode) =>
        total +
        episode.segmentDurationsMs.length,
      0
    ),
    costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
    outputRoot: input.outputRoot,
    episodes,
    alignment: episodes.map((episode) => ({
      episodeId: episode.episodeId,
      alignmentRevisionId: episode.alignmentRevisionId,
      measuredDurationMs: episode.measuredDurationMs,
    })),
    publicationCalls: 0,
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
    episodes,
    outputRoot: input.outputRoot,
    evidenceProjectionKey: MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}
