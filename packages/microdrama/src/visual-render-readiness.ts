import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  evaluateMicrodramaBudgetPreflight,
  evaluateLicensedAudioProductionReadiness,
  fingerprintLicensedAudioLayerTracks,
  type LicensedAudioAssetRecord,
  type LicensedAudioLayerTracks,
  type LicensedAudioProductionReadiness,
  type MicrodramaBudgetPreflight,
  type MicrodramaBudgetProfile,
  type MicrodramaPreflightWorkItem,
  type EpisodeTimelineRevision,
  type LocaleSubtitleProjection,
  type LocalizedSignalUiProjection,
  type VerticalPublicationTarget,
} from "@mediaforge/domain";
import type { TrustGateDecision } from "@mediaforge/domain";
import { buildMicrodramaSharedVisualCacheKey } from "@mediaforge/image-generation/microdrama-visual-generation";
import { fixtureSafeZoneLayout, type SafeZoneLayoutValidationResult } from "@mediaforge/visual-planning";

import {
  compileLocaleEpisodeTimeline,
  type CompileLocaleEpisodeTimelineInput,
} from "./locale-composition.js";
import {
  READINESS_EVIDENCE_SCHEMA_VERSION,
  type ReadinessEvidenceRecord,
  type ReadinessProjectionResult,
} from "./readiness-evidence-contracts.js";
import {
  defaultEvidenceBackedCheck,
  evaluateReadinessProjection,
  type ReadinessCheckDefinition,
} from "./readiness-evidence-evaluator.js";
import {
  evaluateAudioTtsReadiness,
  type AudioTtsReadinessBinding,
} from "./audio-tts-readiness.js";
import type { LocaleTtsSegmentationBundle } from "./locale-tts-segmentation.js";
import type { V5Bcp47Locale } from "./v5-production-profile-contracts.js";
import type { V5SceneShotPlanRecord } from "./v5-scene-shot-compiler-contracts.js";

export const VISUAL_RENDER_READINESS_SCHEMA_VERSION =
  "mediaforge.microdrama.visual-render-readiness.v1" as const;

export const DEFAULT_RENDER_PROFILE_REVISION =
  "render-profile.microdrama.vertical.v1" as const;

export const DEFAULT_VIDEO_PROVIDER_PORT_REVISION =
  "rev.video-port.mock.v1" as const;

export const DEFAULT_SHARED_VISUAL_PROMPT_VERSION =
  "microdrama.source-plate.v1" as const;

export const VISUAL_RENDER_READINESS_CHECKS = [
  { checkId: "visual.registry" },
  { checkId: "visual.scene_shot" },
  { checkId: "visual.shared_visual" },
  { checkId: "visual.selected_audio", requiredEvidenceDomain: "audio_tts" },
  { checkId: "visual.subtitle" },
  { checkId: "visual.timeline" },
  { checkId: "visual.signal_ui" },
  { checkId: "visual.provider_port" },
  { checkId: "visual.rights" },
  { checkId: "visual.safe_zone" },
  { checkId: "visual.trust" },
  { checkId: "visual.budget" },
] as const satisfies readonly ReadinessCheckDefinition[];

export type VisualRenderReadinessBinding = {
  readonly episodeId: string;
  readonly locale: V5Bcp47Locale;
  readonly sceneShotPlanRevisionId: string;
  readonly sceneShotPlanContentHash: string;
  readonly timelineRevisionId: string;
  readonly timelineFingerprint: string;
  readonly sharedVisualCacheFingerprint: string;
  readonly selectedAudioCacheKey: string;
  readonly subtitleFingerprint: string;
  readonly signalUiFingerprint?: string;
  readonly registryFingerprint: string;
  readonly licensedAudioTracksFingerprint: string;
  readonly renderProfileRevision: string;
  readonly providerPortRevisionId: string;
  readonly safeZoneTarget: VerticalPublicationTarget;
  readonly safeZoneLayoutFingerprint: string;
};

export type VisualRenderReadinessInput = {
  readonly binding: VisualRenderReadinessBinding;
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly projectedAt: string;
};

export type VisualRenderReadinessFacet =
  | "registry"
  | "scene_shot"
  | "shared_visual"
  | "selected_audio"
  | "subtitle"
  | "signal_ui"
  | "timeline"
  | "provider_port"
  | "rights"
  | "safe_zone"
  | "trust"
  | "budget";

const INVALIDATION_BY_FACET: Readonly<
  Record<VisualRenderReadinessFacet, readonly string[]>
> = {
  registry: ["visual.registry", "visual.scene_shot", "visual.shared_visual"],
  scene_shot: [
    "visual.scene_shot",
    "visual.shared_visual",
    "visual.timeline",
  ],
  shared_visual: ["visual.shared_visual", "visual.timeline"],
  selected_audio: [
    "visual.selected_audio",
    "visual.subtitle",
    "visual.timeline",
  ],
  subtitle: ["visual.subtitle", "visual.timeline"],
  signal_ui: ["visual.signal_ui", "visual.timeline", "visual.safe_zone"],
  timeline: ["visual.timeline"],
  provider_port: ["visual.provider_port"],
  rights: ["visual.rights", "visual.timeline"],
  safe_zone: ["visual.safe_zone", "visual.timeline"],
  trust: ["visual.trust"],
  budget: ["visual.budget"],
};

export function visualRenderTargetRevisionId(
  binding: VisualRenderReadinessBinding
): string {
  return `rev.visual-render.${binding.episodeId.toLowerCase()}.${binding.locale.toLowerCase()}.${binding.sceneShotPlanRevisionId}`;
}

export function visualRenderTargetRevisionHash(
  binding: VisualRenderReadinessBinding
): string {
  return computePayloadHash({
    schemaVersion: VISUAL_RENDER_READINESS_SCHEMA_VERSION,
    episodeId: binding.episodeId,
    locale: binding.locale,
    sceneShotPlanRevisionId: binding.sceneShotPlanRevisionId,
    sceneShotPlanContentHash: binding.sceneShotPlanContentHash,
    timelineRevisionId: binding.timelineRevisionId,
    timelineFingerprint: binding.timelineFingerprint,
    sharedVisualCacheFingerprint: binding.sharedVisualCacheFingerprint,
    selectedAudioCacheKey: binding.selectedAudioCacheKey,
    subtitleFingerprint: binding.subtitleFingerprint,
    signalUiFingerprint: binding.signalUiFingerprint ?? null,
    registryFingerprint: binding.registryFingerprint,
    licensedAudioTracksFingerprint: binding.licensedAudioTracksFingerprint,
    renderProfileRevision: binding.renderProfileRevision,
    providerPortRevisionId: binding.providerPortRevisionId,
    safeZoneTarget: binding.safeZoneTarget,
    safeZoneLayoutFingerprint: binding.safeZoneLayoutFingerprint,
  });
}

export function computeSceneShotPlanContentHash(
  plan: V5SceneShotPlanRecord
): string {
  return computePayloadHash({
    scenePlanRevisionId: plan.scenePlanRevisionId,
    shotPlanRevisionId: plan.shotPlanRevisionId,
    shotSemanticIds: plan.shots.map((shot) => shot.shotSemanticId),
  });
}

export function computeRegistryFingerprint(plan: V5SceneShotPlanRecord): string {
  const revisionIds = new Set<string>();
  for (const scene of plan.scenes) {
    for (const reference of scene.registryReferences) {
      revisionIds.add(reference.revisionId);
    }
  }
  return computePayloadHash([...revisionIds].sort());
}

export function computeSharedVisualCacheFingerprint(input: {
  readonly plan: V5SceneShotPlanRecord;
  readonly registryFingerprint: string;
  readonly promptVersion?: string;
}): string {
  const registryRevisionFingerprints = [...new Set(
    input.plan.scenes.flatMap((scene) =>
      scene.registryReferences.map((reference) => reference.revisionId)
    )
  )].sort();
  const cacheKeys = input.plan.shots.map((shot) =>
    buildMicrodramaSharedVisualCacheKey({
      assetKind: "source_plate",
      shotSemanticId: shot.shotSemanticId,
      sourcePlateSemanticId: shot.sourcePlateSemanticId,
      sceneShotPlanRevisionId: input.plan.shotPlanRevisionId,
      registryRevisionFingerprints,
      promptVersion: input.promptVersion ?? DEFAULT_SHARED_VISUAL_PROMPT_VERSION,
    }).cacheKey
  );
  return computePayloadHash({
    registryFingerprint: input.registryFingerprint,
    cacheKeys: [...cacheKeys].sort(),
  });
}

export function computeSafeZoneLayoutFingerprint(input: {
  readonly target: VerticalPublicationTarget;
  readonly validation: SafeZoneLayoutValidationResult;
}): string {
  return computePayloadHash({
    target: input.target,
    issueCount: input.validation.issues.length,
    issueCodes: input.validation.issues.map((issue) => issue.code).sort(),
  });
}

export function resolveVisualRenderReadinessBinding(input: {
  readonly plan: V5SceneShotPlanRecord;
  readonly timeline: EpisodeTimelineRevision;
  readonly ttsBundle: LocaleTtsSegmentationBundle;
  readonly subtitleProjection: LocaleSubtitleProjection;
  readonly licensedAudioTracks: LicensedAudioLayerTracks;
  readonly safeZoneValidation: SafeZoneLayoutValidationResult;
  readonly locale: V5Bcp47Locale;
  readonly sharedVisualCacheFingerprint: string;
  readonly signalUiProjection?: LocalizedSignalUiProjection;
  readonly renderProfileRevision?: string;
  readonly providerPortRevisionId?: string;
}): VisualRenderReadinessBinding {
  if (input.plan.episodeId !== input.timeline.episodeId) {
    throw new Error("Scene/shot plan episode does not match timeline episode.");
  }
  if (input.locale !== input.timeline.locale) {
    throw new Error("Timeline locale does not match visual readiness locale.");
  }
  if (input.ttsBundle.locale !== input.locale) {
    throw new Error("TTS bundle locale does not match visual readiness locale.");
  }
  if (input.subtitleProjection.locale !== input.locale) {
    throw new Error("Subtitle projection locale does not match visual readiness locale.");
  }

  const registryFingerprint = computeRegistryFingerprint(input.plan);
  const sceneShotPlanContentHash = computeSceneShotPlanContentHash(input.plan);

  return {
    episodeId: input.plan.episodeId,
    locale: input.locale,
    sceneShotPlanRevisionId: input.plan.shotPlanRevisionId,
    sceneShotPlanContentHash,
    timelineRevisionId: input.timeline.timelineRevisionId,
    timelineFingerprint: input.timeline.fingerprint,
    sharedVisualCacheFingerprint: input.sharedVisualCacheFingerprint,
    selectedAudioCacheKey: input.ttsBundle.timingContract.cacheKey,
    subtitleFingerprint: input.subtitleProjection.fingerprint,
    ...(input.signalUiProjection
      ? { signalUiFingerprint: input.signalUiProjection.fingerprint }
      : {}),
    registryFingerprint,
    licensedAudioTracksFingerprint: fingerprintLicensedAudioLayerTracks(
      input.licensedAudioTracks
    ),
    renderProfileRevision:
      input.renderProfileRevision ?? DEFAULT_RENDER_PROFILE_REVISION,
    providerPortRevisionId:
      input.providerPortRevisionId ?? DEFAULT_VIDEO_PROVIDER_PORT_REVISION,
    safeZoneTarget: input.safeZoneValidation.target,
    safeZoneLayoutFingerprint: computeSafeZoneLayoutFingerprint({
      target: input.safeZoneValidation.target,
      validation: input.safeZoneValidation,
    }),
  };
}

export function validateVisualRenderBinding(input: {
  readonly binding: VisualRenderReadinessBinding;
  readonly plan: V5SceneShotPlanRecord;
  readonly timeline: EpisodeTimelineRevision;
  readonly ttsBundle: LocaleTtsSegmentationBundle;
  readonly subtitleProjection: LocaleSubtitleProjection;
  readonly licensedAudioTracks: LicensedAudioLayerTracks;
  readonly sharedVisualCacheFingerprint: string;
  readonly signalUiProjection?: LocalizedSignalUiProjection;
}): string[] {
  const errors: string[] = [];
  if (input.plan.episodeId !== input.binding.episodeId) {
    errors.push("episodeId does not match scene/shot plan");
  }
  if (input.plan.shotPlanRevisionId !== input.binding.sceneShotPlanRevisionId) {
    errors.push("sceneShotPlanRevisionId does not match scene/shot plan");
  }
  if (
    computeSceneShotPlanContentHash(input.plan) !==
    input.binding.sceneShotPlanContentHash
  ) {
    errors.push("sceneShotPlanContentHash does not match scene/shot plan");
  }
  if (input.timeline.timelineRevisionId !== input.binding.timelineRevisionId) {
    errors.push("timelineRevisionId does not match composed timeline");
  }
  if (input.timeline.fingerprint !== input.binding.timelineFingerprint) {
    errors.push("timelineFingerprint does not match composed timeline");
  }
  if (
    input.sharedVisualCacheFingerprint !== input.binding.sharedVisualCacheFingerprint
  ) {
    errors.push("sharedVisualCacheFingerprint does not match shared visual inputs");
  }
  if (
    input.ttsBundle.timingContract.cacheKey !== input.binding.selectedAudioCacheKey
  ) {
    errors.push("selectedAudioCacheKey does not match TTS timing contract");
  }
  if (
    input.subtitleProjection.fingerprint !== input.binding.subtitleFingerprint
  ) {
    errors.push("subtitleFingerprint does not match subtitle projection");
  }
  if (
    input.signalUiProjection &&
    input.signalUiProjection.fingerprint !== input.binding.signalUiFingerprint
  ) {
    errors.push("signalUiFingerprint does not match Signal UI projection");
  }
  if (
    computeRegistryFingerprint(input.plan) !== input.binding.registryFingerprint
  ) {
    errors.push("registryFingerprint does not match scene/shot plan");
  }
  if (
    fingerprintLicensedAudioLayerTracks(input.licensedAudioTracks) !==
    input.binding.licensedAudioTracksFingerprint
  ) {
    errors.push("licensedAudioTracksFingerprint does not match licensed audio tracks");
  }
  return errors;
}

export function buildVisualRenderBudgetWorkItem(input: {
  readonly binding: VisualRenderReadinessBinding;
  readonly estimatedCostMinor?: number;
}): MicrodramaPreflightWorkItem {
  return {
    taskId: "task.locale-render",
    episodeId: input.binding.episodeId.toLowerCase(),
    locale: input.binding.locale,
    provider: "ffmpeg",
    assetType: "render",
    assetCostScope: "locale_render",
    revisionId: visualRenderTargetRevisionId(input.binding),
    estimatedCostMinor: input.estimatedCostMinor ?? 250,
  };
}

export function evaluateVisualRenderBudgetPreflight(input: {
  readonly binding: VisualRenderReadinessBinding;
  readonly profiles: readonly MicrodramaBudgetProfile[];
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly estimatedCostMinor?: number;
}): MicrodramaBudgetPreflight {
  return evaluateMicrodramaBudgetPreflight({
    correlationId: input.correlationId,
    workItems: [
      buildVisualRenderBudgetWorkItem({
        binding: input.binding,
        ...(input.estimatedCostMinor !== undefined
          ? { estimatedCostMinor: input.estimatedCostMinor }
          : {}),
      }),
    ],
    profiles: input.profiles,
    commitments: [],
    evaluatedAt: input.evaluatedAt,
  });
}

export function visualRenderChecksInvalidatedByChange(
  facet: VisualRenderReadinessFacet
): readonly string[] {
  return INVALIDATION_BY_FACET[facet];
}

function findAudioTtsEvidence(
  evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>,
  checkId: string,
  audioTtsBinding: AudioTtsReadinessBinding
): ReadinessEvidenceRecord | undefined {
  return [...evidenceById.values()].find(
    (record) =>
      record.domain === "audio_tts" &&
      record.checkId === checkId &&
      record.boundRevisionId.startsWith("rev.audio-tts.") &&
      record.boundRevisionId.includes(audioTtsBinding.scriptRevisionId)
  );
}

export function buildVisualRenderReadinessEvidenceRecords(input: {
  readonly binding: VisualRenderReadinessBinding;
  readonly licensedAudioReadiness: LicensedAudioProductionReadiness;
  readonly safeZoneValidation: SafeZoneLayoutValidationResult;
  readonly budgetPreflight: MicrodramaBudgetPreflight;
  readonly trustDecision: TrustGateDecision;
  readonly recordedAt: string;
}): ReadinessEvidenceRecord[] {
  const targetRevisionId = visualRenderTargetRevisionId(input.binding);
  const targetRevisionHash = visualRenderTargetRevisionHash(input.binding);
  const episodeKey = input.binding.episodeId.toLowerCase();
  const localeKey = input.binding.locale.toLowerCase();

  const base = {
    schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
    domain: "visual_render" as const,
    boundRevisionId: targetRevisionId,
    boundRevisionHash: targetRevisionHash,
    recordedAt: input.recordedAt,
  };

  const safeZoneActive = input.safeZoneValidation.issues.length === 0;

  return [
    {
      ...base,
      evidenceId: `evidence.visual.registry.${episodeKey}`,
      checkId: "visual.registry",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.scene_shot.${episodeKey}`,
      checkId: "visual.scene_shot",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.shared_visual.${episodeKey}`,
      checkId: "visual.shared_visual",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.selected_audio.${episodeKey}.${localeKey}`,
      checkId: "visual.selected_audio",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.subtitle.${episodeKey}.${localeKey}`,
      checkId: "visual.subtitle",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.timeline.${episodeKey}.${localeKey}`,
      checkId: "visual.timeline",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.signal_ui.${episodeKey}.${localeKey}`,
      checkId: "visual.signal_ui",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.provider_port.${episodeKey}`,
      checkId: "visual.provider_port",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.rights.${episodeKey}.${localeKey}`,
      checkId: "visual.rights",
      status: input.licensedAudioReadiness.ready ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.safe_zone.${episodeKey}.${localeKey}`,
      checkId: "visual.safe_zone",
      status: safeZoneActive ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.trust.${episodeKey}.${localeKey}`,
      checkId: "visual.trust",
      status: input.trustDecision.allowed ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.visual.budget.${episodeKey}.${localeKey}`,
      checkId: "visual.budget",
      status: input.budgetPreflight.allowed ? "ACTIVE" : "STALE",
    },
  ];
}

export function evaluateVisualRenderReadiness(
  input: VisualRenderReadinessInput & {
    readonly audioTtsBinding?: AudioTtsReadinessBinding;
  }
): ReadinessProjectionResult {
  const targetRevisionId = visualRenderTargetRevisionId(input.binding);
  const targetRevisionHash = visualRenderTargetRevisionHash(input.binding);

  return evaluateReadinessProjection({
    domain: "visual_render",
    targetRevisionId,
    targetRevisionHash,
    projectedAt: input.projectedAt,
    checks: [...VISUAL_RENDER_READINESS_CHECKS],
    evidenceById: input.evidenceById,
    evaluateCheck: (check, evidence) => {
      if (check.checkId === "visual.selected_audio") {
        if (!input.audioTtsBinding) {
          return defaultEvidenceBackedCheck(
            check,
            evidence,
            targetRevisionId,
            targetRevisionHash
          );
        }
        const segmentation = findAudioTtsEvidence(
          input.evidenceById,
          "audio.segmentation",
          input.audioTtsBinding
        );
        if (!segmentation || segmentation.status !== "ACTIVE") {
          return {
            checkId: check.checkId,
            result: "FAIL",
            failureClass: segmentation ? "stale" : "missing",
            ...(segmentation ? { evidenceId: segmentation.evidenceId } : {}),
            reason: segmentation
              ? "Audio segmentation evidence is stale for selected-audio render binding."
              : "Missing audio segmentation evidence for selected-audio render binding.",
          };
        }
        return defaultEvidenceBackedCheck(
          check,
          evidence,
          targetRevisionId,
          targetRevisionHash
        );
      }
      return defaultEvidenceBackedCheck(
        check,
        evidence,
        targetRevisionId,
        targetRevisionHash
      );
    },
  });
}

export function compileVisualRenderReadinessArtifacts(input: {
  readonly plan: V5SceneShotPlanRecord;
  readonly timelineInput: CompileLocaleEpisodeTimelineInput;
  readonly licensedAudioTracks: LicensedAudioLayerTracks;
  readonly licensedAudioAssets: readonly LicensedAudioAssetRecord[];
  readonly evaluatedAt: string;
  readonly territory: string;
  readonly safeZoneTarget?: VerticalPublicationTarget;
  readonly renderProfileRevision?: string;
  readonly providerPortRevisionId?: string;
}): {
  readonly binding: VisualRenderReadinessBinding;
  readonly timeline: EpisodeTimelineRevision;
  readonly licensedAudioReadiness: LicensedAudioProductionReadiness;
  readonly safeZoneValidation: SafeZoneLayoutValidationResult;
  readonly sharedVisualCacheFingerprint: string;
} {
  const registryFingerprint = computeRegistryFingerprint(input.plan);
  const sharedVisualCacheFingerprint = computeSharedVisualCacheFingerprint({
    plan: input.plan,
    registryFingerprint,
  });
  const timeline = compileLocaleEpisodeTimeline({
    ...input.timelineInput,
    sharedVisualDependencyHashes: {
      sharedVisualCache: sharedVisualCacheFingerprint,
    },
  });
  const safeZoneValidation = fixtureSafeZoneLayout(
    input.safeZoneTarget ?? "base-9x16"
  );
  const licensedAudioReadiness = evaluateLicensedAudioProductionReadiness({
    tracks: input.licensedAudioTracks,
    assetsById: new Map(
      input.licensedAudioAssets.map((asset) => [asset.assetId, asset])
    ),
    evaluatedAt: input.evaluatedAt,
    territory: input.territory,
  });
  const binding = resolveVisualRenderReadinessBinding({
    plan: input.plan,
    timeline,
    ttsBundle: input.timelineInput.ttsBundle,
    subtitleProjection: input.timelineInput.subtitleProjection,
    licensedAudioTracks: input.licensedAudioTracks,
    safeZoneValidation,
    locale: input.timelineInput.timingDependency.locale as V5Bcp47Locale,
    sharedVisualCacheFingerprint,
    ...(input.timelineInput.signalUiProjection
      ? { signalUiProjection: input.timelineInput.signalUiProjection }
      : {}),
    ...(input.renderProfileRevision
      ? { renderProfileRevision: input.renderProfileRevision }
      : {}),
    ...(input.providerPortRevisionId
      ? { providerPortRevisionId: input.providerPortRevisionId }
      : {}),
  });

  return {
    binding,
    timeline,
    licensedAudioReadiness,
    safeZoneValidation,
    sharedVisualCacheFingerprint,
  };
}

export function evaluateAudioTtsGateForVisual(input: {
  readonly audioTtsBinding: AudioTtsReadinessBinding;
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly projectedAt: string;
}): ReadinessProjectionResult {
  return evaluateAudioTtsReadiness({
    binding: input.audioTtsBinding,
    evidenceById: input.evidenceById,
    projectedAt: input.projectedAt,
  });
}
