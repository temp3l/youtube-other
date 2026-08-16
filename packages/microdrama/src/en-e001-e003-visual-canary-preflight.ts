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
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  evaluateBoundedPaidProviderCanaryPreflight,
  evaluateMicrodramaBudgetPreflight,
  evaluateTrustGate,
  licensedAudioLayerTracksSchema,
  selectedAudioTimingDependencySchema,
} from "@mediaforge/domain";

import {
  buildAudioTtsReadinessEvidenceRecords,
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
  computeRegistryFingerprint,
  evaluateVisualRenderReadiness,
  evaluateVisualRenderBudgetPreflight,
  buildVisualRenderBudgetWorkItem,
} from "./visual-render-readiness.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { compileV5EpisodeProduction } from "./v5-episode-production-compiler.js";
import { compileV5SceneShotPlans } from "./v5-scene-shot-compiler.js";
import { grantStoryApprovedEvidence } from "./v5-story-approval.js";
import { validateV5StoryEpisodeDeterministicQa } from "./v5-story-qa.js";
import { buildMicrodramaVisualGenerationPlan } from "./v5-visual-generation.js";
import {
  MICRO_034_CANARY_COST_LIMIT_MINOR,
  MICRO_034_CANARY_EPISODE_IDS,
  MICRO_034_ESTIMATED_COST_MINOR_PER_IMAGE,
  MICRO_034_VISUAL_PROFILE_REVISION,
  resolveMicro034CanaryEpisodeCostMinorAllocations,
} from "./micro-034-canary-bindings.js";
import {
  extractMicro033AudioRevisionIds,
  loadMicro033CanaryExecutionEvidence,
  mapMicro033EpisodeToSelectedAudioFixture,
  type Micro033CanaryExecutionEvidence,
} from "./micro-034-canary-micro-033-evidence.js";
import { compileLocaleTtsSegmentation } from "./locale-tts-segmentation.js";
import { MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION } from "./micro-033-canary-bindings.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

export const MICRO_034_TASK_ID = "MICRO-034";
export const EN_E001_E003_VISUAL_CANARY_EPISODES = MICRO_034_CANARY_EPISODE_IDS;

const EMPTY_LICENSED_AUDIO_TRACKS = licensedAudioLayerTracksSchema.parse({
  ambience: [],
  sfx: [],
  music: [],
});

export type EnE001E003VisualCanaryPreflightInput = {
  readonly packRoot: string;
  readonly admittedAt: string;
  readonly evaluatedAt: string;
  readonly profiles: readonly MicrodramaBudgetProfile[];
  readonly micro033Evidence?: Micro033CanaryExecutionEvidence | null;
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly assetGenerationApproval?: MicrodramaAssetGenerationApproval;
};

export type EnE001E003VisualCanaryPreflightResult = {
  readonly preflight: MicrodramaCanaryPreflightResult;
  readonly bindingProbe: BoundedPaidProviderBindingProbe;
  readonly audioRevisionIds: readonly string[];
};

function buildVisualImageBudgetWorkItem(input: {
  readonly episodeId: string;
  readonly sceneShotPlanRevisionId: string;
  readonly estimatedPlateCount: number;
}): MicrodramaPreflightWorkItem {
  return {
    taskId: "task.locale-render",
    episodeId: input.episodeId.toLowerCase(),
    provider: "openai",
    assetType: "image",
    assetCostScope: "shared_visual",
    revisionId: input.sceneShotPlanRevisionId,
    estimatedCostMinor:
      input.estimatedPlateCount * MICRO_034_ESTIMATED_COST_MINOR_PER_IMAGE,
  };
}

export async function evaluateEnE001E003VisualCanaryPreflight(
  input: EnE001E003VisualCanaryPreflightInput
): Promise<EnE001E003VisualCanaryPreflightResult> {
  const modelConfiguration = MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION;
  const episodeCostAllocations = resolveMicro034CanaryEpisodeCostMinorAllocations();
  const micro033Evidence =
    input.micro033Evidence ??
    loadMicro033CanaryExecutionEvidence({
      jsonFilePath: path.resolve(
        import.meta.dirname,
        "../../../docs/reports/codex-runs/2026-08-12-micro-033-canary-execution-evidence.json"
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
  const workItems: MicrodramaPreflightWorkItem[] = [];
  let locale = "en-US";
  let totalEstimatedCostMinor = 0;

  const selectedAudioApproved =
    micro033Evidence?.status === "DONE" &&
    micro033Evidence.episodes.length === EN_E001_E003_VISUAL_CANARY_EPISODES.length &&
    EN_E001_E003_VISUAL_CANARY_EPISODES.every((episodeId) =>
      micro033Evidence.episodes.some((episode) => episode.episodeId === episodeId)
    );
  readinessGates.push({
    gate: "SELECTED_AUDIO_APPROVED",
    ok: selectedAudioApproved,
    ...(selectedAudioApproved
      ? {}
      : { message: "MICRO-033 canary execution evidence is missing or incomplete." }),
  });

  for (const episodeId of EN_E001_E003_VISUAL_CANARY_EPISODES) {
    const record = production.bundle.records.find(
      (entry) => entry.episodeId === episodeId
    );
    const script = admission.bundle.admittedScripts.find(
      (entry) => entry.episodeId === episodeId && entry.locale === "en-US"
    );
    const plan = sceneShotPlans.bundle.records.find(
      (entry) => entry.episodeId === episodeId
    );
    const micro033Episode = micro033Evidence?.episodes.find(
      (entry) => entry.episodeId === episodeId
    );

    if (!record || !script || !plan) {
      throw new Error(`Missing V5 fixture for ${episodeId} en-US`);
    }

    locale = script.locale;
    scriptRevisionIds.push(script.scriptRevisionId);

    const storyScriptBinding = resolveStoryScriptReadinessBinding({
      canonBundle: admission.bundle,
      productionRecord: record,
      locale: script.locale,
    });
    if (!storyScriptBinding) {
      readinessGates.push({
        gate: "STORY_SCRIPT_READY",
        ok: false,
        message: `Missing story binding for ${episodeId}`,
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

    if (!micro033Episode) {
      readinessGates.push({
        gate: "AUDIO_TTS_READY",
        ok: false,
        message: `Missing MICRO-033 timing evidence for ${episodeId}.`,
      });
      readinessGates.push({
        gate: "VISUAL_RENDER_READY",
        ok: false,
        message: `Missing selected-audio inputs for ${episodeId}.`,
      });
      continue;
    }

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
      selectedAudio: mapMicro033EpisodeToSelectedAudioFixture(micro033Episode),
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
        gate: "AUDIO_TTS_READY",
        ok: false,
        message: audioBindingIssues.join("; "),
      });
      continue;
    }

    const audioBudgetPreflight = evaluateMicrodramaBudgetPreflight({
      correlationId: `corr.canary.micro-034.audio.${episodeId.toLowerCase()}`,
      workItems: [
        {
          taskId: "task.locale-tts",
          episodeId: episodeId.toLowerCase(),
          locale: script.locale,
          provider: modelConfiguration.provider,
          assetType: "tts",
          assetCostScope: "locale_tts",
          revisionId: audioTtsBinding.scriptRevisionId,
          estimatedCostMinor: episodeCostAllocations[episodeId],
        },
      ],
      profiles: input.profiles,
      commitments: [],
      evaluatedAt: input.evaluatedAt,
    });
    const trustDecision = evaluateTrustGate({
      correlationId: `corr.canary.micro-034.trust.${episodeId.toLowerCase()}`,
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
      gate: "AUDIO_TTS_READY",
      ok: audioTtsResult.ok,
      ...(audioTtsResult.ok
        ? {}
        : {
            message:
              audioTtsResult.blockingReasons
                .map((reason) => reason.message)
                .join("; ") || "Audio TTS readiness blocked.",
          }),
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
      evaluatedAt: input.evaluatedAt,
      territory: "WW",
      renderProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    });
    const visualPlan = buildMicrodramaVisualGenerationPlan({
      seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
      plan,
      registryRevisionFingerprints: [computeRegistryFingerprint(plan)],
    });
    const imageWorkItem = buildVisualImageBudgetWorkItem({
      episodeId,
      sceneShotPlanRevisionId: plan.shotPlanRevisionId,
      estimatedPlateCount: visualPlan.length,
    });
    const renderWorkItem = buildVisualRenderBudgetWorkItem({
      binding: compiledVisual.binding,
      estimatedCostMinor: 150,
    });
    workItems.push(imageWorkItem, renderWorkItem);
    totalEstimatedCostMinor +=
      imageWorkItem.estimatedCostMinor + renderWorkItem.estimatedCostMinor;

    const visualBudgetPreflight = evaluateVisualRenderBudgetPreflight({
      binding: compiledVisual.binding,
      profiles: input.profiles,
      correlationId: `corr.canary.micro-034.visual.${episodeId.toLowerCase()}`,
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
      ok: visualResult.ok,
      ...(visualResult.ok
        ? {}
        : {
            message:
              visualResult.blockingReasons
                .map((reason) => reason.message)
                .join("; ") || "Visual render readiness blocked.",
          }),
    });
  }

  const aggregateBudgetPreflight = evaluateMicrodramaBudgetPreflight({
    correlationId: "corr.canary.micro-034",
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

  const audioRevisionIds = micro033Evidence
    ? extractMicro033AudioRevisionIds(micro033Evidence)
    : [];

  const bindingProbe: BoundedPaidProviderBindingProbe = {
    episodeIds: [...EN_E001_E003_VISUAL_CANARY_EPISODES],
    locale,
    scriptRevisionIds,
    voiceRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    provider: "openai",
    estimatedCostMinor: Math.min(
      totalEstimatedCostMinor,
      MICRO_034_CANARY_COST_LIMIT_MINOR
    ),
  };

  const preflight = evaluateBoundedPaidProviderCanaryPreflight({
    taskId: MICRO_034_TASK_ID,
    operatorAuthorization: input.operatorAuthorization,
    assetGenerationApproval: input.assetGenerationApproval,
    readinessGates,
    budgetPreflight: aggregateBudgetPreflight,
    bindingProbe,
    requiredAssetKinds: ["image", "video", "render"],
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

  return { preflight, bindingProbe, audioRevisionIds };
}

export function defaultEnVisualCanaryBudgetProfiles(
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
    profile("provider", "mock-image"),
    profile("provider", "ffmpeg"),
    profile("provider", "openai"),
    profile("episode", "e001"),
    profile("episode", "e002"),
    profile("episode", "e003"),
    profile("locale", "en-us"),
  ];
}

export const defaultV5PackRoot = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
