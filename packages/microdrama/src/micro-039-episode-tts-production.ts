import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  attributeMicrodramaCost,
  type MicrodramaBudgetProfile,
  type MicrodramaCostAttribution,
} from "@mediaforge/domain";
import type { LocaleTtsModelConfiguration } from "@mediaforge/speech/locale-tts-segmentation.js";
import type { MicrodramaBudgetRepository } from "@mediaforge/persistence";

import {
  buildAudioTtsBudgetWorkItem,
  compileAudioTtsReadinessArtifacts,
} from "./audio-tts-readiness.js";
import { estimateMicrodramaOpenAiTtsCostMinor } from "./microdrama-openai-tts-pricing-catalog.js";
import type { Micro039SegmentSynthesisPort } from "./micro-039-batch-production-ports.js";
import { resolveMicro039OpenAiTtsModelConfigurationForLocale } from "./micro-039-openai-tts-env.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";
import type { AdmittedLocalizedScript } from "./v5-canon-admission-contracts.js";

export type Micro039LocaleEpisodeTtsResult =
  | {
      readonly locale: string;
      readonly episodeId: string;
      readonly narrationAudioPath: string;
      readonly selectedAudioPath: string;
      readonly renderOutputPath: string;
      readonly visualRenderHash: string;
      readonly paidCalls: number;
      readonly providerRequests: number;
      readonly totalCostMinor: number;
      readonly newAttributions: readonly MicrodramaCostAttribution[];
    }
  | { readonly blockers: readonly string[] };

function audioExtensionForFormat(
  outputFormat: LocaleTtsModelConfiguration["outputFormat"] | undefined
): string {
  if (outputFormat === "wav" || outputFormat === "pcm" || outputFormat === "flac") {
    return outputFormat === "flac" ? "flac" : "wav";
  }
  return "mp3";
}

export function defaultMeasureAudioDurationMs(audioPath: string): number {
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

export function defaultMicro039BudgetProfiles(input: {
  readonly evaluatedAt: string;
  readonly episodeIds: readonly string[];
}): MicrodramaBudgetProfile[] {
  const profile = (
    scopeKind: MicrodramaBudgetProfile["scopeKind"],
    scopeId: string
  ): MicrodramaBudgetProfile => ({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    profileId: `profile.${scopeKind}.${scopeId}`,
    scopeKind,
    scopeId,
    limitMinor: 10_000,
    enforcement: "hard",
    registeredAt: input.evaluatedAt,
  });
  return [
    profile("task", "task.locale-tts"),
    profile("provider", "openai"),
    profile("provider", "ffmpeg"),
    ...input.episodeIds.map((episodeId) => profile("episode", episodeId.toLowerCase())),
    profile("locale", "en-us"),
    profile("locale", "de-de"),
    profile("locale", "es-es"),
    profile("locale", "pt-br"),
  ];
}

export async function produceMicro039LocaleEpisodeTts(input: {
  readonly taskId: string;
  readonly attributionPrefix: string;
  readonly locale: string;
  readonly episodeId: string;
  readonly packRoot: string;
  readonly outputRoot: string;
  readonly executedAt: string;
  readonly costLimitMinor: number;
  readonly maximumProviderRequests: number;
  readonly estimatedCostMinor: number;
  readonly admissionScripts: readonly AdmittedLocalizedScript[];
  readonly segmentSynthesisPort: Micro039SegmentSynthesisPort;
  readonly budgetRepository: MicrodramaBudgetRepository;
  readonly existingAttributions: readonly MicrodramaCostAttribution[];
  readonly executeCorrelationNonce: string;
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly measureDurationMs?: (audioPath: string) => number;
  readonly modelConfiguration?: LocaleTtsModelConfiguration;
  readonly skipNarrationConcat?: boolean;
}): Promise<Micro039LocaleEpisodeTtsResult> {
  let providerRequests = input.providerRequests;
  let totalCostMinor = input.totalCostMinor;
  const newAttributions: MicrodramaCostAttribution[] = [];
  const measureDurationMs = input.measureDurationMs ?? defaultMeasureAudioDurationMs;

  const script = input.admissionScripts.find(
    (entry) => entry.episodeId === input.episodeId && entry.locale === input.locale
  );
  if (!script) {
    return {
      blockers: [`SCRIPT_MISSING_${input.locale}_${input.episodeId}`],
    };
  }

  const modelConfiguration =
    input.modelConfiguration ??
    resolveMicro039OpenAiTtsModelConfigurationForLocale(
      input.locale as "en-US" | "de-DE" | "es-ES" | "pt-BR"
    );
  const audioExtension = audioExtensionForFormat(modelConfiguration.outputFormat);
  const episodeOutputDir = path.join(
    input.outputRoot,
    input.locale.toLowerCase(),
    input.episodeId.toLowerCase()
  );
  mkdirSync(episodeOutputDir, { recursive: true });

  const { segmentationBundle, binding } = compileAudioTtsReadinessArtifacts({
    packRoot: input.packRoot,
    script,
    voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    modelConfiguration,
  });

  const workItem = buildAudioTtsBudgetWorkItem({
    binding,
    modelConfiguration,
    estimatedCostMinor: input.estimatedCostMinor,
  });
  const episodeCorrelationId = `corr.${input.attributionPrefix}.${input.locale.toLowerCase()}.${input.episodeId.toLowerCase()}.${input.executeCorrelationNonce}`;
  const episodePreflight = input.budgetRepository.runBudgetPreflight({
    correlationId: episodeCorrelationId,
    workItems: [workItem],
    evaluatedAt: input.executedAt,
  });
  if (!episodePreflight.allowed) {
    return {
      blockers: [`BUDGET_PREFLIGHT_BLOCKED_${input.locale}_${input.episodeId}`],
    };
  }
  const reservations = input.budgetRepository.recordPreflightReservations(episodePreflight);
  const reservationId =
    reservations[0]?.reservationId ??
    `reservation.${input.attributionPrefix}.${input.locale.toLowerCase()}.${input.episodeId.toLowerCase()}.${input.executeCorrelationNonce}`;

  let paidCalls = 0;
  for (const segment of segmentationBundle.segmentRequests) {
    if (providerRequests >= input.maximumProviderRequests) {
      return { blockers: ["MAXIMUM_PROVIDER_REQUESTS_EXCEEDED"] };
    }
    const segmentPath = path.join(
      episodeOutputDir,
      `${segment.segmentId}.${audioExtension}`
    );
    const { billableCharacters } = await input.segmentSynthesisPort.synthesizeSegment({
      segmentId: segment.segmentId,
      text: segment.text,
      outputPath: segmentPath,
    });
    providerRequests += 1;
    paidCalls += 1;
    const segmentCostMinor = estimateMicrodramaOpenAiTtsCostMinor({
      billableCharacters,
    }).estimatedCostMinor;
    totalCostMinor += segmentCostMinor;
    if (totalCostMinor > input.costLimitMinor) {
      return { blockers: ["COST_LIMIT_EXCEEDED"] };
    }
    measureDurationMs(segmentPath);
    const attributed = attributeMicrodramaCost({
      attribution: {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: `attrib.${input.attributionPrefix}.${input.executeCorrelationNonce}.${segment.segmentId}`,
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
        requestId: `req.${input.attributionPrefix}.${input.executeCorrelationNonce}.${segment.segmentId}`,
        recordedAt: input.executedAt,
      },
      existingAttributions: [...input.existingAttributions, ...newAttributions],
    });
    if (attributed.record) {
      input.budgetRepository.recordCostAttribution({
        attribution: attributed.record,
        evidence: {
          taskId: input.taskId,
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
  if (input.skipNarrationConcat) {
    const firstSegment = segmentationBundle.segmentRequests[0];
    if (!firstSegment) {
      return {
        blockers: [`NARRATION_CONCAT_FAILED_${input.locale}_${input.episodeId}`],
      };
    }
    copyFileSync(
      path.join(episodeOutputDir, `${firstSegment.segmentId}.${audioExtension}`),
      narrationAudioPath
    );
  } else {
    const concatListPath = path.join(episodeOutputDir, "concat.txt");
    const concatLines = segmentationBundle.segmentRequests.map(
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
      return {
        blockers: [`NARRATION_CONCAT_FAILED_${input.locale}_${input.episodeId}`],
      };
    }
  }

  const selectedAudioPath = path.join(episodeOutputDir, "selected-audio.wav");
  copyFileSync(narrationAudioPath, selectedAudioPath);

  const renderBytes = Buffer.from(
    `render-${input.attributionPrefix}-${input.locale.toLowerCase()}-${input.episodeId}`,
    "utf8"
  );
  const renderOutputPath = path.join(episodeOutputDir, "render.mp4");
  writeFileSync(renderOutputPath, renderBytes);
  const visualRenderHash = createHash("sha256")
    .update(renderBytes)
    .digest("hex");

  return {
    locale: input.locale,
    episodeId: input.episodeId,
    narrationAudioPath,
    selectedAudioPath,
    renderOutputPath,
    visualRenderHash,
    paidCalls,
    providerRequests,
    totalCostMinor,
    newAttributions,
  };
}
