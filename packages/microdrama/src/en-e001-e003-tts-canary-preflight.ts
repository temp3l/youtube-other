import path from "node:path";

import type {
  BoundedPaidProviderBindingProbe,
  MicrodramaAssetGenerationApproval,
  MicrodramaBudgetProfile,
  MicrodramaCanaryPreflightResult,
  MicrodramaOperatorAuthorizationRecord,
  MicrodramaSpeechCredentialRecord,
} from "@mediaforge/domain";
import {
  evaluateBoundedPaidProviderCanaryPreflight,
  evaluateMicrodramaBudgetPreflight,
  evaluateMicrodramaSpeechCredentialAdmission,
  evaluateTrustGate,
} from "@mediaforge/domain";
import type { CharacterVoiceRegistryPersistencePort } from "@mediaforge/persistence";

import {
  buildAudioTtsBudgetWorkItem,
  buildAudioTtsReadinessEvidenceRecords,
  compileAudioTtsReadinessArtifacts,
  evaluateAudioTtsReadiness,
  evaluateStoryScriptGateForAudio,
  validateAudioTtsBinding,
} from "./audio-tts-readiness.js";
import {
  buildStoryScriptReadinessEvidenceRecords,
  resolveStoryScriptReadinessBinding,
  validateStoryScriptBinding,
} from "./story-script-readiness.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { compileV5EpisodeProduction } from "./v5-episode-production-compiler.js";
import { grantStoryApprovedEvidence } from "./v5-story-approval.js";
import { validateV5StoryEpisodeDeterministicQa } from "./v5-story-qa.js";
import type { LocaleTtsModelConfiguration } from "@mediaforge/speech";
import {
  MICRO_033_CANARY_EPISODE_IDS,
  resolveMicro033CanaryCostProposal,
  resolveMicro033CanaryEpisodeCostMinorAllocations,
} from "./micro-033-canary-bindings.js";
import {
  SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
} from "./seven-minutes-ahead-narrator-voice-registry.js";
import { resolveMicro033OpenAiTtsModelConfigurationFromEnv } from "./micro-033-openai-tts-env.js";

export const MICRO_033_TASK_ID = "MICRO-033";
export const EN_E001_E003_TTS_CANARY_EPISODES = MICRO_033_CANARY_EPISODE_IDS;

const VOICE_PROFILE_VERSION_ID = "voice-version.narrator.en-us.v1";

export type EnE001E003TtsCanaryPreflightInput = {
  readonly packRoot: string;
  readonly admittedAt: string;
  readonly evaluatedAt: string;
  readonly voiceProfileVersionId?: string;
  readonly modelConfiguration?: LocaleTtsModelConfiguration;
  readonly profiles: readonly MicrodramaBudgetProfile[];
  readonly estimatedCostMinorPerEpisode?: number;
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly assetGenerationApproval?: MicrodramaAssetGenerationApproval;
  readonly voiceRegistryPort?: CharacterVoiceRegistryPersistencePort;
  readonly speechCredential?: MicrodramaSpeechCredentialRecord;
};

export type EnE001E003TtsCanaryPreflightResult = {
  readonly preflight: MicrodramaCanaryPreflightResult;
  readonly bindingProbe: BoundedPaidProviderBindingProbe;
};

export function defaultEnTtsCanaryModelConfiguration(): LocaleTtsModelConfiguration {
  return resolveMicro033OpenAiTtsModelConfigurationFromEnv();
}

export async function evaluateEnE001E003TtsCanaryPreflight(
  input: EnE001E003TtsCanaryPreflightInput
): Promise<EnE001E003TtsCanaryPreflightResult> {
  const voiceProfileVersionId =
    input.voiceProfileVersionId ?? VOICE_PROFILE_VERSION_ID;
  const modelConfiguration =
    input.modelConfiguration ?? defaultEnTtsCanaryModelConfiguration();
  const costProposal = resolveMicro033CanaryCostProposal();
  const episodeCostAllocations = resolveMicro033CanaryEpisodeCostMinorAllocations();
  const defaultEstimatedCostMinorPerEpisode = input.estimatedCostMinorPerEpisode;

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

  const readinessGates: Array<{ gate: string; ok: boolean; message?: string }> =
    [];
  const scriptRevisionIds: string[] = [];
  const workItems = [];
  let locale = "en-US";
  let totalEstimatedCostMinor = 0;

  for (const episodeId of EN_E001_E003_TTS_CANARY_EPISODES) {
    const record = production.bundle.records.find(
      (entry) => entry.episodeId === episodeId
    );
    const script = admission.bundle.admittedScripts.find(
      (entry) => entry.episodeId === episodeId && entry.locale === "en-US"
    );
    if (!record || !script) {
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

    const { binding, segmentationBundle } = compileAudioTtsReadinessArtifacts({
      packRoot: input.packRoot,
      script,
      voiceProfileVersionId,
      modelConfiguration,
    });

    const storyBindingIssues = validateStoryScriptBinding({
      binding: storyScriptBinding,
      canonBundle: admission.bundle,
      productionBundle: production.bundle,
    });
    const audioBindingIssues = validateAudioTtsBinding({
      binding,
      script,
      segmentationBundle,
    });
    if (storyBindingIssues.length > 0 || audioBindingIssues.length > 0) {
      readinessGates.push({
        gate: "STORY_SCRIPT_READY",
        ok: false,
        message: [...storyBindingIssues, ...audioBindingIssues].join("; "),
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
        storyEvidence.map((record) => [record.evidenceId, record])
      ),
      projectedAt: input.evaluatedAt,
    });

    const estimatedCostMinor =
      defaultEstimatedCostMinorPerEpisode ?? episodeCostAllocations[episodeId];

    const budgetPreflight = evaluateMicrodramaBudgetPreflight({
      correlationId: `corr.audio.${episodeId.toLowerCase()}`,
      workItems: [
        buildAudioTtsBudgetWorkItem({
          binding,
          modelConfiguration,
          estimatedCostMinor,
        }),
      ],
      profiles: input.profiles,
      commitments: [],
      evaluatedAt: input.evaluatedAt,
    });

    const trustDecision = evaluateTrustGate({
      correlationId: `corr.trust.${episodeId.toLowerCase()}`,
      evaluatedAt: input.evaluatedAt,
      untrustedPayload: {
        scriptRevisionId: script.scriptRevisionId,
        locale: script.locale,
      },
    });

    const audioEvidence = buildAudioTtsReadinessEvidenceRecords({
      binding,
      storyScriptBinding,
      storyScriptResult,
      segmentationBundle,
      budgetPreflight,
      trustDecision,
      recordedAt: input.evaluatedAt,
    });

    const audioResult = evaluateAudioTtsReadiness({
      binding,
      storyScriptBinding,
      evidenceById: new Map(
        [...storyEvidence, ...audioEvidence].map((record) => [
          record.evidenceId,
          record,
        ])
      ),
      projectedAt: input.evaluatedAt,
    });

    readinessGates.push({
      gate: "STORY_SCRIPT_READY",
      ok: storyScriptResult.ok,
      ...(storyScriptResult.ok
        ? {}
        : {
            message: storyScriptResult.blockingReasons
              .map((reason) => reason.message)
              .join("; "),
          }),
    });
    readinessGates.push({
      gate: "AUDIO_TTS_READY",
      ok: audioResult.ok,
      ...(audioResult.ok
        ? {}
        : {
            message: audioResult.blockingReasons
              .map((reason) => reason.message)
              .join("; "),
          }),
    });

    workItems.push(
      buildAudioTtsBudgetWorkItem({
        binding,
        modelConfiguration,
        estimatedCostMinor,
      })
    );
    totalEstimatedCostMinor += estimatedCostMinor;
  }

  if (input.voiceRegistryPort !== undefined) {
    const resolvedVoice = await input.voiceRegistryPort.resolveActiveProfile(
      SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
      locale
    );
    const voicePersisted =
      resolvedVoice?.activeVersion?.profileVersionId === voiceProfileVersionId &&
      resolvedVoice.activeVersion.status === "ACTIVE";
    readinessGates.push({
      gate: "CHARACTER_VOICE_PROFILE_PERSISTED",
      ok: voicePersisted,
      ...(voicePersisted
        ? {}
        : {
            message:
              "Active narrator voice profile revision is missing from persistence.",
          }),
    });
  }

  if (input.speechCredential !== undefined) {
    const credentialAdmission = evaluateMicrodramaSpeechCredentialAdmission({
      credential: input.speechCredential,
      provider: modelConfiguration.provider,
      now: input.evaluatedAt,
    });
    readinessGates.push({
      gate: "SPEECH_CREDENTIAL_ADMITTED",
      ok: credentialAdmission.allowed,
      ...(credentialAdmission.allowed
        ? {}
        : { message: credentialAdmission.reason }),
    });
  }

  const aggregateBudgetPreflight = evaluateMicrodramaBudgetPreflight({
    correlationId: "corr.canary.micro-033",
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
    episodeIds: [...EN_E001_E003_TTS_CANARY_EPISODES],
    locale,
    scriptRevisionIds,
    voiceRevision: voiceProfileVersionId,
    provider: modelConfiguration.provider,
    estimatedCostMinor:
      defaultEstimatedCostMinorPerEpisode !== undefined
        ? totalEstimatedCostMinor
        : costProposal.proposedMaximumCostMinor,
  };

  const preflight = evaluateBoundedPaidProviderCanaryPreflight({
    taskId: MICRO_033_TASK_ID,
    operatorAuthorization: input.operatorAuthorization,
    assetGenerationApproval: input.assetGenerationApproval,
    readinessGates,
    budgetPreflight: aggregateBudgetPreflight,
    bindingProbe,
    requiredAssetKinds: ["tts"],
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

  return { preflight, bindingProbe };
}

export function defaultEnTtsCanaryBudgetProfiles(
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
    profile("task", "task.locale-tts"),
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
