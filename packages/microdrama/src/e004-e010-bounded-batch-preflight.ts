import path from "node:path";

import type {
  BoundedPaidProviderBindingProbe,
  MicrodramaAssetGenerationApproval,
  MicrodramaBudgetProfile,
  MicrodramaCanaryPreflightResult,
  MicrodramaOperatorAuthorizationRecord,
  MicrodramaPreflightWorkItem,
} from "@mediaforge/domain";
import {
  evaluateBoundedPaidProviderCanaryPreflight,
  evaluateMicrodramaBudgetPreflight,
  evaluateTrustGate,
  licensedAudioLayerTracksSchema,
  selectedAudioTimingDependencySchema,
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
} from "@mediaforge/domain";
import { buildLocaleTtsSelectedAudioAlignment } from "@mediaforge/alignment/locale-tts-alignment.js";
import type { LocaleTtsModelConfiguration } from "@mediaforge/speech";

import {
  buildAudioTtsBudgetWorkItem,
  buildAudioTtsReadinessEvidenceRecords,
  compileAudioTtsReadinessArtifacts,
  evaluateAudioTtsReadiness,
  evaluateStoryScriptGateForAudio,
  readAdmittedLocalizedScriptText,
  resolveAudioTtsReadinessBinding,
  validateAudioTtsBinding,
} from "./audio-tts-readiness.js";
import {
  buildStoryScriptReadinessEvidenceRecords,
  resolveStoryScriptReadinessBinding,
  validateStoryScriptBinding,
} from "./story-script-readiness.js";
import { compileLocaleSubtitleProjection } from "../../rendering/src/locale-subtitle-artifact.js";
import {
  buildVisualRenderReadinessEvidenceRecords,
  compileVisualRenderReadinessArtifacts,
  evaluateVisualRenderReadiness,
  evaluateVisualRenderBudgetPreflight,
  buildVisualRenderBudgetWorkItem,
} from "./visual-render-readiness.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { compileV5EpisodeProduction } from "./v5-episode-production-compiler.js";
import { compileV5SceneShotPlans } from "./v5-scene-shot-compiler.js";
import { grantStoryApprovedEvidence } from "./v5-story-approval.js";
import { validateV5StoryEpisodeDeterministicQa } from "./v5-story-qa.js";
import { compileLocaleTtsSegmentation } from "./locale-tts-segmentation.js";
import {
  MICRO_036_BATCH_COST_LIMIT_MINOR,
  MICRO_036_BATCH_EPISODE_IDS,
  MICRO_036_BATCH_LOCALES,
  MICRO_036_ESTIMATED_COST_MINOR_PER_IMAGE,
  MICRO_036_VISUAL_PROFILE_REVISION,
  isMicro036OutOfScopeEpisodeId,
  resolveMicro036BatchEpisodeCostMinorAllocations,
  type Micro036BatchEpisodeId,
  type Micro036BatchLocale,
} from "./micro-036-batch-bindings.js";
import {
  loadMicro035CanaryExecutionEvidence,
  type Micro035CanaryExecutionEvidence,
} from "./micro-036-batch-micro-035-evidence.js";
import { resolveMicro036OpenAiTtsModelConfigurationForLocale } from "./micro-036-openai-tts-env.js";
import { buildMicrodramaVisualGenerationPlan } from "./v5-visual-generation.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

export const MICRO_036_TASK_ID = "MICRO-036";
export const E004_E010_BOUNDED_BATCH_EPISODES = MICRO_036_BATCH_EPISODE_IDS;

const EMPTY_LICENSED_AUDIO_TRACKS = licensedAudioLayerTracksSchema.parse({
  ambience: [],
  sfx: [],
  music: [],
});

export type E004E010BoundedBatchPreflightInput = {
  readonly packRoot: string;
  readonly admittedAt: string;
  readonly evaluatedAt: string;
  readonly profiles: readonly MicrodramaBudgetProfile[];
  readonly micro035Evidence?: Micro035CanaryExecutionEvidence | null;
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly assetGenerationApproval?: MicrodramaAssetGenerationApproval;
  readonly requestedEpisodeIds?: readonly string[];
};

export type E004E010BoundedBatchPreflightResult = {
  readonly preflight: MicrodramaCanaryPreflightResult;
  readonly bindingProbe: BoundedPaidProviderBindingProbe;
  readonly revisionSet: readonly string[];
  readonly scriptRevisionIds: readonly string[];
  readonly scopeBlockers: readonly string[];
};

function resolveModelConfigurationForLocale(
  locale: Micro036BatchLocale
): LocaleTtsModelConfiguration {
  return resolveMicro036OpenAiTtsModelConfigurationForLocale(locale);
}

function collectScopeBlockers(input: {
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly requestedEpisodeIds?: readonly string[];
}): string[] {
  const blockers: string[] = [];
  const episodeIds = [
    ...(input.operatorAuthorization?.bindings.episodeIds ?? []),
    ...(input.requestedEpisodeIds ?? []),
  ];
  for (const episodeId of episodeIds) {
    const normalized = episodeId.toUpperCase();
    if (isMicro036OutOfScopeEpisodeId(normalized)) {
      blockers.push(`OUT_OF_SCOPE_EPISODE_${normalized}`);
    }
    if (/^E\d{3}$/u.test(normalized) && !E004_E010_BOUNDED_BATCH_EPISODES.includes(normalized as Micro036BatchEpisodeId)) {
      if (Number.parseInt(normalized.slice(1), 10) >= 11) {
        blockers.push(`EPISODE_RANGE_BLOCKED_${normalized}`);
      }
    }
  }
  return [...new Set(blockers)];
}

function buildVisualImageBudgetWorkItem(input: {
  readonly episodeId: string;
  readonly locale: string;
  readonly sceneShotPlanRevisionId: string;
  readonly estimatedPlateCount: number;
}): MicrodramaPreflightWorkItem {
  return {
    taskId: "task.locale-render",
    episodeId: input.episodeId.toLowerCase(),
    locale: input.locale,
    provider: "mock-image",
    assetType: "image",
    assetCostScope: "shared_visual",
    revisionId: input.sceneShotPlanRevisionId,
    estimatedCostMinor:
      input.estimatedPlateCount * MICRO_036_ESTIMATED_COST_MINOR_PER_IMAGE,
  };
}

export async function evaluateE004E010BoundedBatchPreflight(
  input: E004E010BoundedBatchPreflightInput
): Promise<E004E010BoundedBatchPreflightResult> {
  const scopeBlockers = collectScopeBlockers(input);
  const episodeCostAllocations = resolveMicro036BatchEpisodeCostMinorAllocations();
  const micro035Evidence =
    input.micro035Evidence ??
    loadMicro035CanaryExecutionEvidence({
      jsonFilePath: path.resolve(
        import.meta.dirname,
        "../../../docs/reports/codex-runs/2026-08-12-micro-035-canary-execution-evidence.json"
      ),
    });

  const admission = compileV5CanonAdmission(input.packRoot, input.admittedAt);
  if (!admission.ok) {
    throw new Error(admission.issues.map((issue) => issue.message).join("\n"));
  }
  const production = compileV5EpisodeProduction(
    admission.bundle,
    input.admittedAt
  );
  if (!production.ok) {
    throw new Error(production.issues.map((issue) => issue.message).join("\n"));
  }
  const sceneShotPlans = compileV5SceneShotPlans(production.bundle, input.evaluatedAt);
  if (!sceneShotPlans.ok) {
    throw new Error(sceneShotPlans.issues.map((issue) => issue.message).join("\n"));
  }

  const readinessGates: Array<{ gate: string; ok: boolean; message?: string }> =
    [];
  const scriptRevisionIds: string[] = [];
  const revisionSet: string[] = [];
  const workItems: MicrodramaPreflightWorkItem[] = [];
  let totalEstimatedCostMinor = 0;
  const primaryLocale: Micro036BatchLocale = "en-US";

  if (scopeBlockers.length > 0) {
    readinessGates.push({
      gate: "EPISODE_SCOPE",
      ok: false,
      message: scopeBlockers.join("; "),
    });
  }

  const grammarProven = micro035Evidence?.status === "DONE";
  readinessGates.push({
    gate: "MICRO_035_GRAMMAR_PROVEN",
    ok: grammarProven,
    ...(grammarProven
      ? {}
      : { message: "MICRO-035 canary execution evidence is missing or incomplete." }),
  });

  for (const locale of MICRO_036_BATCH_LOCALES) {
    const modelConfiguration = resolveModelConfigurationForLocale(locale);

    for (const episodeId of E004_E010_BOUNDED_BATCH_EPISODES) {
      const record = production.bundle.records.find(
        (entry) => entry.episodeId === episodeId
      );
      const script = admission.bundle.admittedScripts.find(
        (entry) => entry.episodeId === episodeId && entry.locale === locale
      );
      const plan = sceneShotPlans.bundle.records.find(
        (entry) => entry.episodeId === episodeId
      );

      if (!record || !script || !plan) {
        throw new Error(`Missing V5 fixture for ${episodeId} ${locale}`);
      }

      scriptRevisionIds.push(script.scriptRevisionId);
      revisionSet.push(script.scriptRevisionId);

      const storyScriptBinding = resolveStoryScriptReadinessBinding({
        canonBundle: admission.bundle,
        productionRecord: record,
        locale: script.locale,
      });
      if (!storyScriptBinding) {
        readinessGates.push({
          gate: "STORY_SCRIPT_READY",
          ok: false,
          message: `Missing story binding for ${episodeId} ${locale}`,
        });
        continue;
      }

      const storyBindingIssues = validateStoryScriptBinding({
        binding: storyScriptBinding,
        canonBundle: admission.bundle,
        productionBundle: production.bundle,
      });
      if (storyBindingIssues.length > 0) {
        readinessGates.push({
          gate: "STORY_SCRIPT_READY",
          ok: false,
          message: storyBindingIssues.join("; "),
        });
        continue;
      }

      const qa = validateV5StoryEpisodeDeterministicQa(
        { canonBundle: admission.bundle, productionBundle: production.bundle },
        episodeId
      );
      const approved = await grantStoryApprovedEvidence(
        {
          canonBundle: admission.bundle,
          productionRecord: record,
          locale: script.locale,
          scriptRevisionId: script.scriptRevisionId,
          approvedAt: input.admittedAt,
        },
        { deterministicQa: qa }
      );
      if (!approved.ok) {
        readinessGates.push({
          gate: "STORY_SCRIPT_READY",
          ok: false,
          message: approved.issues.map((issue) => issue.message).join("; "),
        });
        continue;
      }

      const storyEvidence = buildStoryScriptReadinessEvidenceRecords({
        binding: storyScriptBinding,
        storyApproved: approved.evidence,
        qa,
        recordedAt: input.evaluatedAt,
      });
      const storyScriptResult = evaluateStoryScriptGateForAudio({
        storyScriptBinding,
        evidenceById: new Map(
          storyEvidence.map((entry) => [entry.evidenceId, entry])
        ),
        projectedAt: input.evaluatedAt,
      });
      readinessGates.push({
        gate: "STORY_SCRIPT_READY",
        ok: storyScriptResult.ok,
        ...(storyScriptResult.ok
          ? {}
          : {
              message:
                storyScriptResult.projection.evaluations
                  .filter((evaluation) => evaluation.result !== "PASS")
                  .map((evaluation) => evaluation.reason ?? evaluation.checkId)
                  .join("; ") || "Story script readiness blocked.",
            }),
      });

      const scriptText = readAdmittedLocalizedScriptText({
        packRoot: input.packRoot,
        script,
      });
      const segmentationBundle = compileLocaleTtsSegmentation({
        scriptText,
        scriptRevisionId: script.scriptRevisionId,
        locale: script.locale,
        voiceProfileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
        modelConfiguration,
      });
      const audioTtsBinding = resolveAudioTtsReadinessBinding({
        script,
        segmentationBundle,
      });
      const audioBindingIssues = validateAudioTtsBinding({
        binding: audioTtsBinding,
        script,
        segmentationBundle,
      });
      if (audioBindingIssues.length > 0) {
        readinessGates.push({
          gate: "SELECTED_AUDIO_APPROVED",
          ok: false,
          message: audioBindingIssues.join("; "),
        });
        continue;
      }

      const allocationKey = `${locale}:${episodeId}` as const;
      const audioBudgetPreflight = evaluateMicrodramaBudgetPreflight({
        correlationId: `corr.batch.micro-036.audio.${locale.toLowerCase()}.${episodeId.toLowerCase()}`,
        workItems: [
          {
            taskId: "task.locale-tts",
            episodeId: episodeId.toLowerCase(),
            locale: script.locale,
            provider: modelConfiguration.provider,
            assetType: "tts",
            assetCostScope: "locale_tts",
            revisionId: audioTtsBinding.scriptRevisionId,
            estimatedCostMinor: episodeCostAllocations[allocationKey],
          },
        ],
        profiles: input.profiles,
        commitments: [],
        evaluatedAt: input.evaluatedAt,
      });
      const trustDecision = evaluateTrustGate({
        correlationId: `corr.batch.micro-036.trust.${locale.toLowerCase()}.${episodeId.toLowerCase()}`,
        evaluatedAt: input.evaluatedAt,
        untrustedPayload: {
          episodeId,
          locale: script.locale,
          scriptRevisionId: script.scriptRevisionId,
        },
      });
      const audioEvidence = buildAudioTtsReadinessEvidenceRecords({
        binding: audioTtsBinding,
        storyScriptBinding,
        storyScriptResult,
        segmentationBundle,
        budgetPreflight: audioBudgetPreflight,
        trustDecision,
        recordedAt: input.evaluatedAt,
      });
      const audioTtsResult = evaluateAudioTtsReadiness({
        binding: audioTtsBinding,
        storyScriptBinding,
        evidenceById: new Map(
          [...storyEvidence, ...audioEvidence].map((entry) => [entry.evidenceId, entry])
        ),
        projectedAt: input.evaluatedAt,
      });
      readinessGates.push({
        gate: "SELECTED_AUDIO_APPROVED",
        ok: audioTtsResult.ok,
        ...(audioTtsResult.ok
          ? {}
          : {
              message:
                audioTtsResult.blockingReasons.map((reason) => reason.message).join("; ") ||
                `Lexical selected-audio readiness blocked for ${locale} ${episodeId}.`,
            }),
      });

      const perSegmentMs = Math.max(
        1,
        Math.floor(
          segmentationBundle.timingContract.totalDurationMs /
            segmentationBundle.segmentRequests.length
        )
      );
      const lexicalAlignment = buildLocaleTtsSelectedAudioAlignment({
        alignmentRevisionId: segmentationBundle.timingContract.alignmentRevisionId,
        segments: segmentationBundle.segmentRequests.map((segment) => ({
          segmentId: segment.segmentId,
          text: segment.text,
          durationMs: perSegmentMs,
        })),
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
        alignment: lexicalAlignment,
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
        evaluatedAt: input.evaluatedAt,
        territory: "WW",
        renderProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
      });
      const renderWorkItem = buildVisualRenderBudgetWorkItem({
        binding: compiledVisual.binding,
        estimatedCostMinor: 150,
      });
      workItems.push(
        buildAudioTtsBudgetWorkItem({
          binding: audioTtsBinding,
          modelConfiguration,
          estimatedCostMinor: episodeCostAllocations[allocationKey],
        }),
        renderWorkItem
      );
      totalEstimatedCostMinor +=
        episodeCostAllocations[allocationKey] + renderWorkItem.estimatedCostMinor;

      if (locale === "en-US") {
        const visualPlan = buildMicrodramaVisualGenerationPlan({
          seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
          plan,
          registryRevisionFingerprints: [],
        });
        workItems.push(
          buildVisualImageBudgetWorkItem({
            episodeId,
            locale: script.locale,
            sceneShotPlanRevisionId: plan.shotPlanRevisionId,
            estimatedPlateCount: visualPlan.length,
          })
        );
        totalEstimatedCostMinor +=
          visualPlan.length * MICRO_036_ESTIMATED_COST_MINOR_PER_IMAGE;
      }

      const visualBudgetPreflight = evaluateVisualRenderBudgetPreflight({
        binding: compiledVisual.binding,
        profiles: input.profiles,
        correlationId: `corr.batch.micro-036.visual.${locale.toLowerCase()}.${episodeId.toLowerCase()}`,
        evaluatedAt: input.evaluatedAt,
        estimatedCostMinor: renderWorkItem.estimatedCostMinor,
      });
      const visualEvidence = buildVisualRenderReadinessEvidenceRecords({
        binding: compiledVisual.binding,
        licensedAudioReadiness: compiledVisual.licensedAudioReadiness,
        safeZoneValidation: compiledVisual.safeZoneValidation,
        budgetPreflight: visualBudgetPreflight,
        trustDecision,
        recordedAt: input.evaluatedAt,
      });
      const visualResult = evaluateVisualRenderReadiness({
        binding: compiledVisual.binding,
        evidenceById: new Map([
          ...storyEvidence.map((entry) => [entry.evidenceId, entry] as const),
          ...audioEvidence.map((entry) => [entry.evidenceId, entry] as const),
          ...visualEvidence.map((entry) => [entry.evidenceId, entry] as const),
        ]),
        projectedAt: input.evaluatedAt,
        audioTtsBinding,
      });
      readinessGates.push({
        gate: "VISUAL_RENDER_READY",
        ok: visualResult.ok && audioTtsResult.ok,
        ...(visualResult.ok && audioTtsResult.ok
          ? {}
          : {
              message:
                [
                  ...visualResult.blockingReasons.map((reason) => reason.message),
                  ...audioTtsResult.blockingReasons.map((reason) => reason.message),
                ].join("; ") || "Visual render readiness blocked.",
            }),
      });
    }
  }

  const aggregateBudgetPreflight = evaluateMicrodramaBudgetPreflight({
    correlationId: "corr.batch.micro-036",
    workItems,
    profiles: input.profiles,
    commitments: [],
    evaluatedAt: input.evaluatedAt,
  });

  readinessGates.push({
    gate: "COST_BUDGET_APPROVED",
    ok: aggregateBudgetPreflight.allowed,
    ...(aggregateBudgetPreflight.allowed
      ? {}
      : { message: aggregateBudgetPreflight.message }),
  });

  const assetApprovalOk =
    input.assetGenerationApproval != null &&
    input.assetGenerationApproval.state === "active";
  readinessGates.push({
    gate: "ASSET_GENERATION_APPROVED",
    ok: assetApprovalOk,
    ...(assetApprovalOk
      ? {}
      : { message: "Asset generation approval is missing or inactive." }),
  });

  const bindingProbe: BoundedPaidProviderBindingProbe = {
    episodeIds: [...E004_E010_BOUNDED_BATCH_EPISODES],
    locale: primaryLocale,
    scriptRevisionIds,
    voiceRevision: MICRO_036_VISUAL_PROFILE_REVISION,
    provider: "openai",
    estimatedCostMinor: Math.min(
      totalEstimatedCostMinor,
      MICRO_036_BATCH_COST_LIMIT_MINOR
    ),
  };

  const preflight = evaluateBoundedPaidProviderCanaryPreflight({
    taskId: MICRO_036_TASK_ID,
    operatorAuthorization: input.operatorAuthorization,
    assetGenerationApproval: input.assetGenerationApproval,
    readinessGates,
    budgetPreflight: aggregateBudgetPreflight,
    bindingProbe,
    requiredAssetKinds: ["tts", "alignment", "render", "image"],
    permittedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: true,
      publicationCallsAllowed: false,
    },
    requestedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: true,
      publicationCallsAllowed: false,
    },
    evaluatedAt: input.evaluatedAt,
  });

  return {
    preflight,
    bindingProbe,
    revisionSet: [...new Set(revisionSet)].sort(),
    scriptRevisionIds,
    scopeBlockers,
  };
}

export function defaultBoundedBatchBudgetProfiles(
  evaluatedAt: string
): MicrodramaBudgetProfile[] {
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
    registeredAt: evaluatedAt,
  });
  return [
    profile("task", "task.locale-render"),
    profile("task", "task.locale-tts"),
    profile("provider", "openai"),
    profile("provider", "mock-image"),
    profile("provider", "ffmpeg"),
    ...E004_E010_BOUNDED_BATCH_EPISODES.map((episodeId) =>
      profile("episode", episodeId.toLowerCase())
    ),
    profile("locale", "en-us"),
    profile("locale", "de-de"),
    profile("locale", "es-es"),
    profile("locale", "pt-br"),
  ];
}

export const defaultV5PackRoot = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
