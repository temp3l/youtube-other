import { describe, expect, it } from "vitest";

import type { MicrodramaBudgetProfile } from "@mediaforge/domain";
import {
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  evaluateTrustGate,
  licensedAudioLayerTracksSchema,
  selectedAudioTimingDependencySchema,
} from "@mediaforge/domain";

import { compileLocaleSubtitleProjection } from "../../rendering/src/locale-subtitle-artifact.js";
import {
  buildVisualRenderReadinessEvidenceRecords,
  compileVisualRenderReadinessArtifacts,
  evaluateVisualRenderBudgetPreflight,
  evaluateVisualRenderReadiness,
  validateVisualRenderBinding,
  visualRenderChecksInvalidatedByChange,
  visualRenderTargetRevisionHash,
} from "./visual-render-readiness.js";
import {
  buildAudioTtsReadinessEvidenceRecords,
  evaluateAudioTtsBudgetPreflight,
  resolveAudioTtsReadinessBinding,
} from "./audio-tts-readiness.js";
import { compileLocaleTtsSegmentation } from "./locale-tts-segmentation.js";
import { buildMinimalSceneShotPlanFixture } from "./scene-shot-plan-fixture.js";
import { projectionBlocksOnlyDomain } from "./readiness-evidence-evaluator.js";
import type { ReadinessEvidenceRecord } from "./readiness-evidence-contracts.js";
import { READINESS_EVIDENCE_SCHEMA_VERSION } from "./readiness-evidence-contracts.js";

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

function buildReadyVisualEpisode(episodeId: keyof typeof EPISODE_SCRIPTS): {
  binding: ReturnType<typeof compileVisualRenderReadinessArtifacts>["binding"];
  audioTtsBinding: ReturnType<typeof resolveAudioTtsReadinessBinding>;
  evidenceById: Map<string, ReadinessEvidenceRecord>;
} {
  const locale = "en-US" as const;
  const plan = buildMinimalSceneShotPlanFixture(episodeId);
  const scriptRevisionId = `rev.script.${episodeId.toLowerCase()}.visual-render.v5`;
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

  expect(
    validateVisualRenderBinding({
      binding: compiled.binding,
      plan,
      timeline: compiled.timeline,
      ttsBundle: segmentationBundle,
      subtitleProjection,
      licensedAudioTracks: EMPTY_LICENSED_AUDIO_TRACKS,
      sharedVisualCacheFingerprint: compiled.sharedVisualCacheFingerprint,
    })
  ).toEqual([]);

  const audioBudgetPreflight = evaluateAudioTtsBudgetPreflight({
    binding: audioTtsBinding,
    modelConfiguration: MODEL_CONFIGURATION,
    profiles: audioBudgetProfiles(episodeId),
    correlationId: `corr.audio.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
  });
  expect(audioBudgetPreflight.allowed).toBe(true);

  const trustDecision = evaluateTrustGate({
    correlationId: `corr.trust.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
    untrustedPayload: {
      timelineRevisionId: compiled.timeline.timelineRevisionId,
      locale,
    },
  });
  expect(trustDecision.allowed).toBe(true);

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

  const visualBudgetPreflight = evaluateVisualRenderBudgetPreflight({
    binding: compiled.binding,
    profiles: visualBudgetProfiles(episodeId),
    correlationId: `corr.visual.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
  });
  expect(visualBudgetPreflight.allowed).toBe(true);

  const visualEvidence = buildVisualRenderReadinessEvidenceRecords({
    binding: compiled.binding,
    licensedAudioReadiness: compiled.licensedAudioReadiness,
    safeZoneValidation: compiled.safeZoneValidation,
    budgetPreflight: visualBudgetPreflight,
    trustDecision,
    recordedAt: PROJECTED_AT,
  });

  return {
    binding: compiled.binding,
    audioTtsBinding,
    evidenceById: evidenceMap([...audioEvidence, ...visualEvidence]),
  };
}

describe("visual and render readiness", () => {
  it("evaluates VISUAL_RENDER_READY for locale render fixtures E001 through E003", () => {
    for (const episodeId of ["E001", "E002", "E003"] as const) {
      const { binding, audioTtsBinding, evidenceById } =
        buildReadyVisualEpisode(episodeId);
      const result = evaluateVisualRenderReadiness({
        binding,
        audioTtsBinding,
        evidenceById,
        projectedAt: PROJECTED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(
          `${episodeId}: ${result.blockingReasons.map((reason) => reason.message).join("\n")}`
        );
      }
      expect(result.projection.domain).toBe("visual_render");
      expect(result.projection.targetRevisionHash).toBe(
        visualRenderTargetRevisionHash(binding)
      );
      expect(result.projection.evaluations).toHaveLength(12);
      expect(projectionBlocksOnlyDomain(result, "visual_render")).toBe(true);
    }
  });

  it("blocks visual readiness when shared visual evidence is stale", () => {
    const { binding, audioTtsBinding, evidenceById } = buildReadyVisualEpisode("E001");
    const staleSharedVisual = [...evidenceById.values()].find(
      (record) => record.checkId === "visual.shared_visual"
    );
    expect(staleSharedVisual).toBeTruthy();

    const staleEvidence = evidenceMap(
      [...evidenceById.values()].map((record) =>
        record.evidenceId === staleSharedVisual!.evidenceId
          ? { ...record, status: "STALE" as const }
          : record
      )
    );

    const result = evaluateVisualRenderReadiness({
      binding,
      audioTtsBinding,
      evidenceById: staleEvidence,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected stale shared visual block");
    }
    expect(
      result.projection.evaluations.find(
        (entry) => entry.checkId === "visual.shared_visual"
      )?.result
    ).toBe("FAIL");
    expect(projectionBlocksOnlyDomain(result, "visual_render")).toBe(true);
  });

  it("blocks visual readiness when selected-audio segmentation evidence is missing", () => {
    const { binding, audioTtsBinding, evidenceById } = buildReadyVisualEpisode("E002");
    const withoutSegmentation = evidenceMap(
      [...evidenceById.values()].filter(
        (record) => record.checkId !== "audio.segmentation"
      )
    );

    const result = evaluateVisualRenderReadiness({
      binding,
      audioTtsBinding,
      evidenceById: withoutSegmentation,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing selected-audio block");
    }
    expect(
      result.projection.evaluations.find(
        (entry) => entry.checkId === "visual.selected_audio"
      )?.result
    ).toBe("FAIL");
    expect(projectionBlocksOnlyDomain(result, "visual_render")).toBe(true);
  });

  it("fails closed on mismatched revision hashes", () => {
    const { binding, audioTtsBinding, evidenceById } = buildReadyVisualEpisode("E003");
    const mismatched = evidenceMap(
      [...evidenceById.values()].map((record) => ({
        ...record,
        boundRevisionHash: "b".repeat(64),
      }))
    );

    const result = evaluateVisualRenderReadiness({
      binding,
      audioTtsBinding,
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

  it("does not require publication or provider account evidence", () => {
    const { binding, audioTtsBinding, evidenceById } = buildReadyVisualEpisode("E001");
    const publicationEvidence: ReadinessEvidenceRecord = {
      schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
      evidenceId: "evidence.publication.ready",
      domain: "publication",
      checkId: "publication.ready",
      boundRevisionId: binding.timelineRevisionId,
      boundRevisionHash: visualRenderTargetRevisionHash(binding),
      status: "ACTIVE",
      recordedAt: PROJECTED_AT,
    };

    const result = evaluateVisualRenderReadiness({
      binding,
      audioTtsBinding,
      evidenceById: new Map([
        ...evidenceById,
        [publicationEvidence.evidenceId, publicationEvidence],
      ]),
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(true);
    expect(result.projection.evaluations.every((entry) => entry.result === "PASS")).toBe(
      true
    );
    expect(projectionBlocksOnlyDomain(result, "visual_render")).toBe(true);
  });

  it("invalidates shared visual and timeline checks when shared visuals change", () => {
    expect(visualRenderChecksInvalidatedByChange("shared_visual")).toEqual([
      "visual.shared_visual",
      "visual.timeline",
    ]);
    expect(visualRenderChecksInvalidatedByChange("selected_audio")).toEqual([
      "visual.selected_audio",
      "visual.subtitle",
      "visual.timeline",
    ]);
    expect(visualRenderChecksInvalidatedByChange("rights")).toEqual([
      "visual.rights",
      "visual.timeline",
    ]);
  });
});
