import { describe, expect, it } from "vitest";

import type { MicrodramaBudgetProfile } from "@mediaforge/domain";
import {
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  evaluateTrustGate,
  licensedAudioLayerTracksSchema,
  projectTikTokMetadataRevision,
  selectedAudioTimingDependencySchema,
} from "@mediaforge/domain";

import { compileLocaleSubtitleProjection } from "../../rendering/src/locale-subtitle-artifact.js";
import {
  buildAudioTtsReadinessEvidenceRecords,
  evaluateAudioTtsBudgetPreflight,
  resolveAudioTtsReadinessBinding,
} from "./audio-tts-readiness.js";
import { compileLocaleTtsSegmentation } from "./locale-tts-segmentation.js";
import {
  buildPublicationReadinessEvidenceRecords,
  evaluatePublicationBudgetPreflight,
  evaluatePublicationReadiness,
  publicationChecksInvalidatedByChange,
  publicationTargetRevisionHash,
  resolvePublicationReadinessBinding,
  validatePublicationBinding,
} from "./publication-readiness.js";
import { projectionBlocksOnlyDomain } from "./readiness-evidence-evaluator.js";
import type { ReadinessEvidenceRecord } from "./readiness-evidence-contracts.js";
import { READINESS_EVIDENCE_SCHEMA_VERSION } from "./readiness-evidence-contracts.js";
import { buildMinimalSceneShotPlanFixture } from "./scene-shot-plan-fixture.js";
import {
  buildVisualRenderReadinessEvidenceRecords,
  compileVisualRenderReadinessArtifacts,
  evaluateVisualRenderBudgetPreflight,
  visualRenderTargetRevisionHash,
} from "./visual-render-readiness.js";

const PROJECTED_AT = "2026-08-12T06:00:00.000Z";
const VOICE_PROFILE_VERSION_ID = "voice-version.narrator.en-us.v1";
const MODEL_CONFIGURATION = {
  provider: "openai" as const,
  model: "tts-1-hd",
  voice: "alloy",
  instructions: "Measured pacing for microdrama.",
  speed: 1,
};
const EMPTY_LICENSED_AUDIO_TRACKS = licensedAudioLayerTracksSchema.parse({
  ambience: [],
  sfx: [],
  music: [],
});

const EPISODE_SCRIPTS = {
  E001: [
    "Maya watches her boyfriend die on her phone in real time.",
    'MAYA: "Seven minutes. That is all we get."',
    "Ethan reaches for her hand, but the screen already shows the next message.",
    'ETHAN: "Then we move now."',
  ].join("\n\n"),
  E002: [
    "The elevator stops between floors as the countdown resets.",
    'MAYA: "We are out of time again."',
    "Ethan studies the cracked screen for any hidden signal.",
    'ETHAN: "Then we find another door."',
  ].join("\n\n"),
  E003: [
    "Rain hammers the rooftop while the city below keeps scrolling.",
    'MAYA: "They are still watching us."',
    "Ethan pulls her toward the stairwell before the feed updates again.",
    'ETHAN: "Then we disappear first."',
  ].join("\n\n"),
} as const;

const EPISODE_SELECTED_AUDIO = {
  E001: {
    kind: "fake-measured-audio" as const,
    totalDurationMs: 61_250,
    segmentDurationsMs: [18_400, 9_850, 17_500, 15_500],
  },
  E002: {
    kind: "fake-measured-audio" as const,
    totalDurationMs: 58_900,
    segmentDurationsMs: [17_100, 10_200, 16_800, 14_800],
  },
  E003: {
    kind: "fake-measured-audio" as const,
    totalDurationMs: 63_400,
    segmentDurationsMs: [19_000, 11_400, 17_900, 15_100],
  },
} as const;

function evidenceMap(records: readonly ReadinessEvidenceRecord[]) {
  return new Map(records.map((record) => [record.evidenceId, record]));
}

function publicationBudgetProfiles(episodeId: string): MicrodramaBudgetProfile[] {
  const profile = (
    scopeKind: MicrodramaBudgetProfile["scopeKind"],
    scopeId: string,
    limitMinor: number
  ): MicrodramaBudgetProfile => ({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    profileId: `profile.${scopeKind}.${scopeId}`,
    scopeKind,
    scopeId,
    limitMinor,
    enforcement: "hard",
    registeredAt: PROJECTED_AT,
  });
  return [
    profile("task", "task.locale-publish", 10_000),
    profile("provider", "tiktok", 10_000),
    profile("episode", episodeId.toLowerCase(), 10_000),
    profile("locale", "en-us", 10_000),
  ];
}

function audioBudgetProfiles(episodeId: string): MicrodramaBudgetProfile[] {
  const profile = (
    scopeKind: MicrodramaBudgetProfile["scopeKind"],
    scopeId: string,
    limitMinor: number
  ): MicrodramaBudgetProfile => ({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    profileId: `profile.${scopeKind}.${scopeId}`,
    scopeKind,
    scopeId,
    limitMinor,
    enforcement: "hard",
    registeredAt: PROJECTED_AT,
  });
  return [
    profile("task", "task.locale-tts", 10_000),
    profile("provider", "openai", 10_000),
    profile("episode", episodeId.toLowerCase(), 10_000),
    profile("locale", "en-us", 10_000),
  ];
}

function visualBudgetProfiles(episodeId: string): MicrodramaBudgetProfile[] {
  const profile = (
    scopeKind: MicrodramaBudgetProfile["scopeKind"],
    scopeId: string,
    limitMinor: number
  ): MicrodramaBudgetProfile => ({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    profileId: `profile.${scopeKind}.${scopeId}`,
    scopeKind,
    scopeId,
    limitMinor,
    enforcement: "hard",
    registeredAt: PROJECTED_AT,
  });
  return [
    profile("task", "task.locale-render", 10_000),
    profile("provider", "ffmpeg", 10_000),
    profile("episode", episodeId.toLowerCase(), 10_000),
    profile("locale", "en-us", 10_000),
  ];
}

function buildReadyPublicationEpisode(episodeId: keyof typeof EPISODE_SCRIPTS) {
  const locale = "en-US" as const;
  const plan = buildMinimalSceneShotPlanFixture(episodeId);
  const scriptRevisionId = `rev.script.${episodeId.toLowerCase()}.publication.v5`;
  const segmentationBundle = compileLocaleTtsSegmentation({
    scriptText: EPISODE_SCRIPTS[episodeId],
    scriptRevisionId,
    locale,
    voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
    modelConfiguration: MODEL_CONFIGURATION,
    selectedAudio: EPISODE_SELECTED_AUDIO[episodeId],
  });
  const audioTtsBinding = resolveAudioTtsReadinessBinding({
    script: {
      episodeId,
      locale,
      scriptRevisionId,
      contentHash: segmentationBundle.scriptContentHash,
      scriptRelativePath: `languages/en/episodes/${episodeId.toLowerCase()}.md`,
      importedStatus: "admitted",
    },
    segmentationBundle,
  });
  const timingDependency = selectedAudioTimingDependencySchema.parse({
    schemaVersion: SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
    locale,
    alignmentRevisionId: segmentationBundle.timingContract.alignmentRevisionId,
    cacheKey: segmentationBundle.timingContract.cacheKey,
    authoritySource: segmentationBundle.timingContract.authoritySource,
    totalDurationMs: segmentationBundle.timingContract.totalDurationMs,
  });
  const subtitleProjection = compileLocaleSubtitleProjection({
    locale,
    alignment: segmentationBundle.selectedAudioAlignment!,
    timingDependency,
  });
  const compiled = compileVisualRenderReadinessArtifacts({
    plan,
    timelineInput: {
      plan,
      ttsBundle: segmentationBundle,
      timingDependency,
      subtitleProjection,
    },
    licensedAudioTracks: EMPTY_LICENSED_AUDIO_TRACKS,
    licensedAudioAssets: [],
    evaluatedAt: PROJECTED_AT,
    territory: "WW",
  });

  const renderHash = visualRenderTargetRevisionHash(compiled.binding);
  const manifestHash = "b".repeat(64);
  const capabilityHash = "d".repeat(64);
  const episodeRevisionId = `rev.episode.${episodeId.toLowerCase()}.v5`;

  const targetProfile = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    profileId: `profile.series001.${episodeId.toLowerCase()}.tiktok`,
    seriesId: "series.001",
    locale,
    provider: "tiktok" as const,
    providerAccountId: `tiktok.account.${episodeId.toLowerCase()}`,
    credentialVersion: "cred.v1",
    metadataProfileId: "meta.profile.en-us",
    scheduleProfileId: "schedule.profile.en-us",
    enabled: true,
    registeredAt: PROJECTED_AT,
  };

  const metadataRevision = projectTikTokMetadataRevision({
    metadataRevisionId: `meta.rev.${episodeId.toLowerCase()}.001`,
    revision: 1,
    episodeId: episodeId.toLowerCase(),
    episodeRevisionId: episodeRevisionId.toLowerCase(),
    locale,
    metadataProfileId: targetProfile.metadataProfileId,
    metadataProfileVersion: 1,
    editorial: {
      caption: `Episode ${episodeId} publication caption`,
      hashtags: ["#Microdrama", "#TikTok"],
      ctaLabel: "Watch next",
    },
    providerPolicy: {
      privacy: "private",
      interactionSettings: {
        allowComments: false,
        allowDuet: false,
        allowStitch: false,
      },
    },
    mediaProvenance: {
      syntheticVoiceUsed: true,
      syntheticVisualsUsed: true,
      sponsoredContent: false,
      paidPartnership: false,
    },
    createdAt: PROJECTED_AT,
  });

  const consent = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    consentRevisionId: `consent.rev.${episodeId.toLowerCase()}`,
    subjectId: "creator.001",
    rightsholderId: "rightsholder.001",
    evidenceHash: "c".repeat(64),
    evidenceSource: "operator-attestation",
    permittedMedia: ["video"],
    permittedUse: ["publish"],
    permittedLocale: locale,
    permittedProvider: "tiktok" as const,
    permittedTerritory: "US",
    effectiveAt: "2026-08-12T00:00:00.000Z",
    state: "active" as const,
    recordedAt: PROJECTED_AT,
  };

  const exportApproval = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    exportApprovalRevisionId: `export.approval.${episodeId.toLowerCase()}`,
    consentRevisionId: consent.consentRevisionId,
    creatorCapabilityEvidenceHash: capabilityHash,
    providerAccountId: targetProfile.providerAccountId,
    renderHash,
    artifactManifestHash: manifestHash,
    metadataRevisionId: metadataRevision.metadataRevisionId,
    privacy: "private" as const,
    interactionSettings: {
      allowComments: false,
      allowDuet: false,
      allowStitch: false,
    },
    aiContentDeclared: true,
    commercialContentDeclared: false,
    operatorId: "operator.001",
    approvedAt: PROJECTED_AT,
    state: "active" as const,
  };

  const binding = resolvePublicationReadinessBinding({
    targetProfile,
    metadataRevision,
    episodeRevisionId,
    visualRenderBinding: compiled.binding,
    consentRevisionId: consent.consentRevisionId,
    exportApprovalRevisionId: exportApproval.exportApprovalRevisionId,
    renderHash,
    artifactManifestHash: manifestHash,
    dispatchMode: "manual",
    publicationCapabilityState: "private_canary",
    creatorCapabilityState: "available",
    creatorCapabilityEvidenceHash: capabilityHash,
    privacy: "private",
    interactionSettings: exportApproval.interactionSettings,
    aiContentDeclared: true,
    commercialContentDeclared: false,
  });

  expect(
    validatePublicationBinding({
      binding,
      targetProfile,
      metadataRevision,
      visualRenderBinding: compiled.binding,
    })
  ).toEqual([]);

  const audioBudgetPreflight = evaluateAudioTtsBudgetPreflight({
    binding: audioTtsBinding,
    modelConfiguration: MODEL_CONFIGURATION,
    profiles: audioBudgetProfiles(episodeId),
    correlationId: `corr.audio.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
  });
  const visualBudgetPreflight = evaluateVisualRenderBudgetPreflight({
    binding: compiled.binding,
    profiles: visualBudgetProfiles(episodeId),
    correlationId: `corr.visual.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
  });
  const publicationBudgetPreflight = evaluatePublicationBudgetPreflight({
    binding,
    profiles: publicationBudgetProfiles(episodeId),
    correlationId: `corr.publication.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
  });
  const trustDecision = evaluateTrustGate({
    correlationId: `corr.trust.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
    untrustedPayload: {
      metadataRevisionId: metadataRevision.metadataRevisionId,
      locale,
    },
  });

  const audioEvidence = buildAudioTtsReadinessEvidenceRecords({
    binding: audioTtsBinding,
    storyScriptBinding: {
      episodeId,
      locale,
      scriptRevisionId,
      episodeSpecRevisionId: plan.episodeSpecRevisionId,
      beatPlanRevisionId: plan.beatPlanRevisionId,
      boundaryRevisionId: `rev.boundary.${episodeId.toLowerCase()}`,
      scriptContentHash: segmentationBundle.scriptContentHash,
      episodeSpecContentHash: "a".repeat(64),
      beatPlanContentHash: "b".repeat(64),
    },
    storyScriptResult: {
      ok: true,
      projection: {
        schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
        domain: "story_script",
        targetRevisionId: scriptRevisionId,
        targetRevisionHash: "c".repeat(64),
        projectedAt: PROJECTED_AT,
        evaluations: [
          {
            checkId: "story.approved",
            result: "PASS",
            evidenceId: "evidence.story.approved",
          },
        ],
      },
    },
    segmentationBundle,
    budgetPreflight: audioBudgetPreflight,
    trustDecision,
    recordedAt: PROJECTED_AT,
  });

  const visualEvidence = buildVisualRenderReadinessEvidenceRecords({
    binding: compiled.binding,
    licensedAudioReadiness: compiled.licensedAudioReadiness,
    safeZoneValidation: compiled.safeZoneValidation,
    budgetPreflight: visualBudgetPreflight,
    trustDecision,
    recordedAt: PROJECTED_AT,
  });

  const publicationEvidence = buildPublicationReadinessEvidenceRecords({
    binding,
    targetProfile,
    consent,
    exportApproval,
    visualRenderReady: true,
    budgetPreflight: publicationBudgetPreflight,
    trustDecision,
    recordedAt: PROJECTED_AT,
  });

  return {
    binding,
    audioTtsBinding,
    visualRenderBinding: compiled.binding,
    evidenceById: evidenceMap([
      ...audioEvidence,
      ...visualEvidence,
      ...publicationEvidence,
    ]),
  };
}

describe("publication readiness admission", () => {
  it("evaluates PUBLICATION_READY for locale publication fixtures E001 through E003", () => {
    for (const episodeId of ["E001", "E002", "E003"] as const) {
      const { binding, visualRenderBinding, evidenceById } =
        buildReadyPublicationEpisode(episodeId);
      const result = evaluatePublicationReadiness({
        binding,
        visualRenderBinding,
        evidenceById,
        projectedAt: PROJECTED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(
          `${episodeId}: ${result.blockingReasons.map((reason) => reason.message).join("\n")}`
        );
      }
      expect(result.projection.domain).toBe("publication");
      expect(result.projection.targetRevisionHash).toBe(
        publicationTargetRevisionHash(binding)
      );
      expect(result.projection.evaluations).toHaveLength(9);
      expect(projectionBlocksOnlyDomain(result, "publication")).toBe(true);
    }
  });

  it("blocks publication readiness when visual render evidence is stale", () => {
    const { binding, visualRenderBinding, evidenceById } =
      buildReadyPublicationEpisode("E001");
    const staleTimeline = [...evidenceById.values()].find(
      (record) => record.checkId === "visual.timeline"
    );
    expect(staleTimeline).toBeTruthy();

    const staleEvidence = evidenceMap(
      [...evidenceById.values()].map((record) =>
        record.evidenceId === staleTimeline!.evidenceId
          ? { ...record, status: "STALE" as const }
          : record
      )
    );

    const result = evaluatePublicationReadiness({
      binding,
      visualRenderBinding,
      evidenceById: staleEvidence,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected stale visual render block");
    }
    expect(
      result.projection.evaluations.find(
        (entry) => entry.checkId === "publication.render"
      )?.result
    ).toBe("FAIL");
    expect(projectionBlocksOnlyDomain(result, "publication")).toBe(true);
  });

  it("blocks publication readiness when creator capability evidence is stale", () => {
    const { binding, visualRenderBinding, evidenceById } =
      buildReadyPublicationEpisode("E002");
    const staleCapability = evidenceMap(
      [...evidenceById.values()].map((record) =>
        record.checkId === "publication.capability"
          ? { ...record, status: "STALE" as const }
          : record
      )
    );

    const result = evaluatePublicationReadiness({
      binding: {
        ...binding,
        creatorCapabilityState: "unavailable",
      },
      visualRenderBinding,
      evidenceById: staleCapability,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected stale creator capability block");
    }
    expect(
      result.projection.evaluations.find(
        (entry) => entry.checkId === "publication.capability"
      )?.result
    ).toBe("FAIL");
    expect(
      result.projection.evaluations.find(
        (entry) => entry.checkId === "publication.capability"
      )?.reason
    ).toContain("TikTok creator posting capability is unavailable");
  });

  it("blocks publication readiness when consent evidence is revoked", () => {
    const { binding, visualRenderBinding, evidenceById } =
      buildReadyPublicationEpisode("E003");
    const revokedConsent = evidenceMap(
      [...evidenceById.values()].map((record) =>
        record.checkId === "publication.consent"
          ? { ...record, status: "REVOKED" as const }
          : record
      )
    );

    const result = evaluatePublicationReadiness({
      binding,
      visualRenderBinding,
      evidenceById: revokedConsent,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected revoked consent block");
    }
    expect(
      result.projection.evaluations.find(
        (entry) => entry.checkId === "publication.consent"
      )?.failureClass
    ).toBe("revoked");
  });

  it("fails closed on mismatched revision hashes", () => {
    const { binding, visualRenderBinding, evidenceById } =
      buildReadyPublicationEpisode("E001");
    const mismatched = evidenceMap(
      [...evidenceById.values()].map((record) =>
        record.domain === "publication"
          ? { ...record, boundRevisionHash: "f".repeat(64) }
          : record
      )
    );

    const result = evaluatePublicationReadiness({
      binding,
      visualRenderBinding,
      evidenceById: mismatched,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected mismatched revision block");
    }
    expect(
      result.blockingReasons.every(
        (reason) => reason.failureClass === "mismatched_revision"
      )
    ).toBe(true);
  });

  it("does not authorize provider dispatch from a ready projection", () => {
    const { binding, visualRenderBinding, evidenceById } =
      buildReadyPublicationEpisode("E001");
    const result = evaluatePublicationReadiness({
      binding,
      visualRenderBinding,
      evidenceById,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(true);
    expect(result.projection.evaluations.every((entry) => entry.result === "PASS")).toBe(
      true
    );
    expect(result.projection.domain).toBe("publication");
    expect("dispatchAdmission" in result).toBe(false);
  });

  it("invalidates render and export checks when metadata changes", () => {
    expect(publicationChecksInvalidatedByChange("metadata")).toEqual([
      "publication.metadata",
      "publication.export",
    ]);
    expect(publicationChecksInvalidatedByChange("render")).toEqual([
      "publication.render",
    ]);
    expect(publicationChecksInvalidatedByChange("capability")).toEqual([
      "publication.capability",
    ]);
  });
});
