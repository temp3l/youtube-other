import fs from "node:fs";
import path from "node:path";

import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  evaluateMicrodramaBudgetPreflight,
  type MicrodramaBudgetPreflight,
  type MicrodramaBudgetProfile,
  type MicrodramaPreflightWorkItem,
} from "@mediaforge/domain";
import type { TrustGateDecision } from "@mediaforge/domain";
import {
  hashLocaleTtsModelConfiguration,
  type LocaleTtsModelConfiguration,
} from "@mediaforge/speech/locale-tts-segmentation.js";

import {
  compileLocaleTtsSegmentation,
  type LocaleTtsSegmentationBundle,
} from "./locale-tts-segmentation.js";
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
  evaluateStoryScriptReadiness,
  type StoryScriptReadinessBinding,
} from "./story-script-readiness.js";
import type { AdmittedLocalizedScript } from "./v5-canon-admission-contracts.js";
import type { V5Bcp47Locale } from "./v5-production-profile-contracts.js";

export const AUDIO_TTS_READINESS_SCHEMA_VERSION =
  "mediaforge.microdrama.audio-tts-readiness.v1" as const;

export const AUDIO_TTS_READINESS_CHECKS = [
  { checkId: "audio.story", requiredEvidenceDomain: "story_script" },
  { checkId: "audio.voice" },
  { checkId: "audio.segmentation" },
  { checkId: "audio.provider_config" },
  { checkId: "audio.budget" },
  { checkId: "audio.trust" },
] as const satisfies readonly ReadinessCheckDefinition[];

export type AudioTtsReadinessBinding = {
  readonly episodeId: string;
  readonly locale: V5Bcp47Locale;
  readonly scriptRevisionId: string;
  readonly scriptContentHash: string;
  readonly voiceProfileVersionId: string;
  readonly modelConfigurationHash: string;
  readonly segmentationCacheKey: string;
};

export type AudioTtsReadinessInput = {
  readonly binding: AudioTtsReadinessBinding;
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly projectedAt: string;
};

export type AudioTtsReadinessFacet =
  | "story"
  | "voice"
  | "segmentation"
  | "provider_config"
  | "budget"
  | "trust";

const INVALIDATION_BY_FACET: Readonly<Record<AudioTtsReadinessFacet, readonly string[]>> =
  {
    story: ["audio.story"],
    voice: ["audio.voice", "audio.segmentation", "audio.provider_config"],
    segmentation: ["audio.segmentation"],
    provider_config: ["audio.provider_config", "audio.segmentation"],
    budget: ["audio.budget"],
    trust: ["audio.trust"],
  };

export function audioTtsTargetRevisionId(
  binding: AudioTtsReadinessBinding
): string {
  return `rev.audio-tts.${binding.scriptRevisionId}.${binding.locale.toLowerCase()}`;
}

export function audioTtsTargetRevisionHash(
  binding: AudioTtsReadinessBinding
): string {
  return computePayloadHash({
    schemaVersion: AUDIO_TTS_READINESS_SCHEMA_VERSION,
    scriptRevisionId: binding.scriptRevisionId,
    scriptContentHash: binding.scriptContentHash,
    locale: binding.locale,
    voiceProfileVersionId: binding.voiceProfileVersionId,
    modelConfigurationHash: binding.modelConfigurationHash,
    segmentationCacheKey: binding.segmentationCacheKey,
  });
}

export function extractLocalizedMasterStory(markdown: string): string {
  const markers = [
    "## Localized master story",
    "## Lokalisierte Master-Story",
    "## Historia maestra localizada",
    "## História-mestre localizada",
  ];
  for (const marker of markers) {
    const start = markdown.indexOf(marker);
    if (start === -1) {
      continue;
    }
    const remainder = markdown.slice(start + marker.length);
    const nextSection = remainder.search(/\n## /u);
    const body =
      nextSection === -1 ? remainder : remainder.slice(0, nextSection);
    const text = body.trim();
    if (text.length === 0) {
      throw new Error("Localized master story section is empty");
    }
    return text;
  }
  throw new Error("Missing Localized master story section");
}

export function readAdmittedLocalizedScriptText(input: {
  readonly packRoot: string;
  readonly script: AdmittedLocalizedScript;
}): string {
  const scriptPath = path.join(input.packRoot, input.script.scriptRelativePath);
  const markdown = fs.readFileSync(scriptPath, "utf8");
  return extractLocalizedMasterStory(markdown);
}

export function resolveAudioTtsReadinessBinding(input: {
  readonly script: AdmittedLocalizedScript;
  readonly segmentationBundle: LocaleTtsSegmentationBundle;
}): AudioTtsReadinessBinding {
  if (input.script.scriptRevisionId !== input.segmentationBundle.scriptRevisionId) {
    throw new Error("Segmentation bundle script revision does not match admitted script");
  }
  if (input.script.locale !== input.segmentationBundle.locale) {
    throw new Error("Segmentation bundle locale does not match admitted script");
  }

  const modelConfigurationHash =
    input.segmentationBundle.segmentRequests[0]?.modelConfigurationHash;
  if (!modelConfigurationHash) {
    throw new Error("Segmentation bundle is missing model configuration hash");
  }

  return {
    episodeId: input.script.episodeId,
    locale: input.script.locale,
    scriptRevisionId: input.script.scriptRevisionId,
    scriptContentHash: input.segmentationBundle.scriptContentHash,
    voiceProfileVersionId: input.segmentationBundle.voiceProfileVersionId,
    modelConfigurationHash,
    segmentationCacheKey: input.segmentationBundle.cacheIdentity.cacheKey,
  };
}

export function validateAudioTtsBinding(input: {
  readonly binding: AudioTtsReadinessBinding;
  readonly script: AdmittedLocalizedScript;
  readonly segmentationBundle: LocaleTtsSegmentationBundle;
}): string[] {
  const errors: string[] = [];
  if (input.script.episodeId !== input.binding.episodeId) {
    errors.push("episodeId does not match admitted script");
  }
  if (input.script.locale !== input.binding.locale) {
    errors.push("locale does not match admitted script");
  }
  if (input.script.scriptRevisionId !== input.binding.scriptRevisionId) {
    errors.push("scriptRevisionId does not match admitted script");
  }
  if (
    input.segmentationBundle.scriptContentHash !== input.binding.scriptContentHash
  ) {
    errors.push("scriptContentHash does not match spoken segmentation input");
  }
  if (
    input.segmentationBundle.voiceProfileVersionId !==
    input.binding.voiceProfileVersionId
  ) {
    errors.push("voiceProfileVersionId does not match segmentation bundle");
  }
  if (
    input.segmentationBundle.cacheIdentity.cacheKey !==
    input.binding.segmentationCacheKey
  ) {
    errors.push("segmentationCacheKey does not match segmentation bundle");
  }
  const bundleModelHash =
    input.segmentationBundle.segmentRequests[0]?.modelConfigurationHash;
  if (bundleModelHash !== input.binding.modelConfigurationHash) {
    errors.push("modelConfigurationHash does not match segmentation bundle");
  }
  return errors;
}

export function buildAudioTtsBudgetWorkItem(input: {
  readonly binding: AudioTtsReadinessBinding;
  readonly modelConfiguration: LocaleTtsModelConfiguration;
  readonly estimatedCostMinor?: number;
}): MicrodramaPreflightWorkItem {
  return {
    taskId: "task.locale-tts",
    episodeId: input.binding.episodeId.toLowerCase(),
    locale: input.binding.locale,
    provider: input.modelConfiguration.provider,
    assetType: "tts",
    assetCostScope: "locale_tts",
    revisionId: audioTtsTargetRevisionId(input.binding),
    estimatedCostMinor: input.estimatedCostMinor ?? 120,
  };
}

export function evaluateAudioTtsBudgetPreflight(input: {
  readonly binding: AudioTtsReadinessBinding;
  readonly modelConfiguration: LocaleTtsModelConfiguration;
  readonly profiles: readonly MicrodramaBudgetProfile[];
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly estimatedCostMinor?: number;
}): MicrodramaBudgetPreflight {
  return evaluateMicrodramaBudgetPreflight({
    correlationId: input.correlationId,
    workItems: [
      buildAudioTtsBudgetWorkItem({
        binding: input.binding,
        modelConfiguration: input.modelConfiguration,
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

export function audioTtsChecksInvalidatedByChange(
  facet: AudioTtsReadinessFacet
): readonly string[] {
  return INVALIDATION_BY_FACET[facet];
}

function storyEvidenceActive(
  storyScriptResult: ReadinessProjectionResult
): boolean {
  return storyScriptResult.ok;
}

export function buildAudioTtsReadinessEvidenceRecords(input: {
  readonly binding: AudioTtsReadinessBinding;
  readonly storyScriptBinding: StoryScriptReadinessBinding;
  readonly storyScriptResult: ReadinessProjectionResult;
  readonly segmentationBundle: LocaleTtsSegmentationBundle;
  readonly budgetPreflight: MicrodramaBudgetPreflight;
  readonly trustDecision: TrustGateDecision;
  readonly recordedAt: string;
}): ReadinessEvidenceRecord[] {
  const targetRevisionId = audioTtsTargetRevisionId(input.binding);
  const targetRevisionHash = audioTtsTargetRevisionHash(input.binding);
  const episodeKey = input.binding.episodeId.toLowerCase();
  const localeKey = input.binding.locale.toLowerCase();

  if (
    input.segmentationBundle.scriptRevisionId !== input.binding.scriptRevisionId
  ) {
    throw new Error("Segmentation bundle does not match audio readiness binding");
  }
  if (
    input.storyScriptBinding.scriptRevisionId !== input.binding.scriptRevisionId
  ) {
    throw new Error("Story script binding does not match audio readiness binding");
  }

  const base = {
    schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
    domain: "audio_tts" as const,
    boundRevisionId: targetRevisionId,
    boundRevisionHash: targetRevisionHash,
    recordedAt: input.recordedAt,
  };

  return [
    {
      ...base,
      evidenceId: `evidence.audio.story.${episodeKey}.${localeKey}`,
      checkId: "audio.story",
      status: storyEvidenceActive(input.storyScriptResult) ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.audio.voice.${episodeKey}.${localeKey}`,
      checkId: "audio.voice",
      status:
        input.segmentationBundle.voiceProfileVersionId ===
        input.binding.voiceProfileVersionId
          ? "ACTIVE"
          : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.audio.segmentation.${episodeKey}.${localeKey}`,
      checkId: "audio.segmentation",
      status:
        input.segmentationBundle.cacheIdentity.cacheKey ===
        input.binding.segmentationCacheKey
          ? "ACTIVE"
          : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.audio.provider_config.${episodeKey}.${localeKey}`,
      checkId: "audio.provider_config",
      status:
        input.segmentationBundle.segmentRequests[0]?.modelConfigurationHash ===
        input.binding.modelConfigurationHash
          ? "ACTIVE"
          : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.audio.budget.${episodeKey}.${localeKey}`,
      checkId: "audio.budget",
      status: input.budgetPreflight.allowed ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.audio.trust.${episodeKey}.${localeKey}`,
      checkId: "audio.trust",
      status: input.trustDecision.allowed ? "ACTIVE" : "STALE",
    },
  ];
}

function findStoryScriptEvidence(
  evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>,
  checkId: string,
  storyScriptBinding: StoryScriptReadinessBinding
): ReadinessEvidenceRecord | undefined {
  return [...evidenceById.values()].find(
    (record) =>
      record.domain === "story_script" &&
      record.checkId === checkId &&
      record.boundRevisionId === storyScriptBinding.scriptRevisionId
  );
}

export function evaluateAudioTtsReadiness(input: AudioTtsReadinessInput & {
  readonly storyScriptBinding?: StoryScriptReadinessBinding;
}): ReadinessProjectionResult {
  const targetRevisionId = audioTtsTargetRevisionId(input.binding);
  const targetRevisionHash = audioTtsTargetRevisionHash(input.binding);

  return evaluateReadinessProjection({
    domain: "audio_tts",
    targetRevisionId,
    targetRevisionHash,
    projectedAt: input.projectedAt,
    checks: [...AUDIO_TTS_READINESS_CHECKS],
    evidenceById: input.evidenceById,
    evaluateCheck: (check, evidence) => {
      if (check.checkId === "audio.story") {
        if (!input.storyScriptBinding) {
          return defaultEvidenceBackedCheck(
            check,
            evidence,
            targetRevisionId,
            targetRevisionHash
          );
        }
        const storyApproved = findStoryScriptEvidence(
          input.evidenceById,
          "story.approved",
          input.storyScriptBinding
        );
        if (!storyApproved || storyApproved.status !== "ACTIVE") {
          return {
            checkId: check.checkId,
            result: "FAIL",
            failureClass: storyApproved ? "stale" : "missing",
            ...(storyApproved ? { evidenceId: storyApproved.evidenceId } : {}),
            reason: storyApproved
              ? "Story approval evidence is stale."
              : "Missing story approval evidence for audio canary.",
          };
        }
        const storyQa = findStoryScriptEvidence(
          input.evidenceById,
          "story.deterministic_qa",
          input.storyScriptBinding
        );
        if (!storyQa || storyQa.status !== "ACTIVE") {
          return {
            checkId: check.checkId,
            result: "FAIL",
            failureClass: storyQa ? "stale" : "missing",
            ...(storyQa ? { evidenceId: storyQa.evidenceId } : {}),
            reason: storyQa
              ? "Story deterministic QA evidence is stale."
              : "Missing story deterministic QA evidence for audio canary.",
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

export function compileAudioTtsReadinessArtifacts(input: {
  readonly packRoot: string;
  readonly script: AdmittedLocalizedScript;
  readonly voiceProfileVersionId: string;
  readonly modelConfiguration: LocaleTtsModelConfiguration;
}): {
  readonly scriptText: string;
  readonly segmentationBundle: LocaleTtsSegmentationBundle;
  readonly binding: AudioTtsReadinessBinding;
} {
  const scriptText = readAdmittedLocalizedScriptText({
    packRoot: input.packRoot,
    script: input.script,
  });
  const segmentationBundle = compileLocaleTtsSegmentation({
    scriptText,
    scriptRevisionId: input.script.scriptRevisionId,
    locale: input.script.locale,
    voiceProfileVersionId: input.voiceProfileVersionId,
    modelConfiguration: input.modelConfiguration,
  });
  const binding = resolveAudioTtsReadinessBinding({
    script: input.script,
    segmentationBundle,
  });
  const modelHash = hashLocaleTtsModelConfiguration(input.modelConfiguration);
  if (binding.modelConfigurationHash !== modelHash) {
    throw new Error("Model configuration hash mismatch after segmentation compile");
  }
  return { scriptText, segmentationBundle, binding };
}

export function evaluateStoryScriptGateForAudio(input: {
  readonly storyScriptBinding: StoryScriptReadinessBinding;
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly projectedAt: string;
}): ReadinessProjectionResult {
  return evaluateStoryScriptReadiness({
    binding: input.storyScriptBinding,
    evidenceById: input.evidenceById,
    projectedAt: input.projectedAt,
  });
}
