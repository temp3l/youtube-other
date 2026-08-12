import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { MicrodramaBudgetProfile } from "@mediaforge/domain";
import { evaluateTrustGate } from "@mediaforge/domain";

import {
  audioTtsChecksInvalidatedByChange,
  audioTtsTargetRevisionHash,
  buildAudioTtsReadinessEvidenceRecords,
  compileAudioTtsReadinessArtifacts,
  evaluateAudioTtsBudgetPreflight,
  evaluateAudioTtsReadiness,
  evaluateStoryScriptGateForAudio,
  extractLocalizedMasterStory,
  validateAudioTtsBinding,
} from "./audio-tts-readiness.js";
import {
  buildStoryScriptReadinessEvidenceRecords,
  resolveStoryScriptReadinessBinding,
  validateStoryScriptBinding,
} from "./story-script-readiness.js";
import {
  compileV5CanonAdmission,
  compileV5EpisodeProduction,
  grantStoryApprovedEvidence,
  validateV5StoryEpisodeDeterministicQa,
} from "./index.js";
import {
  defaultEvidenceBackedCheck,
  evaluateReadinessProjection,
  projectionBlocksOnlyDomain,
} from "./readiness-evidence-evaluator.js";
import type { ReadinessEvidenceRecord } from "./readiness-evidence-contracts.js";
import { READINESS_EVIDENCE_SCHEMA_VERSION } from "./readiness-evidence-contracts.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const PROJECTED_AT = "2026-08-12T05:00:00.000Z";
const VOICE_PROFILE_VERSION_ID = "voice-version.narrator.en-us.v1";
const MODEL_CONFIGURATION = {
  provider: "openai" as const,
  model: "tts-1-hd",
  voice: "alloy",
  instructions: "Measured pacing for microdrama.",
  speed: 1,
};

function loadAdmissionAndProduction() {
  const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
  if (!admission.ok) {
    throw new Error(admission.issues.map((issue) => issue.message).join("\n"));
  }
  const production = compileV5EpisodeProduction(admission.bundle, ADMITTED_AT);
  if (!production.ok) {
    throw new Error(production.issues.map((issue) => issue.message).join("\n"));
  }
  return { admission: admission.bundle, production: production.bundle };
}

function evidenceMap(records: readonly ReadinessEvidenceRecord[]) {
  return new Map(records.map((record) => [record.evidenceId, record]));
}

function budgetProfiles(episodeId: string): MicrodramaBudgetProfile[] {
  const evaluatedAt = PROJECTED_AT;
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
    registeredAt: evaluatedAt,
  });
  return [
    profile("task", "task.locale-tts", 10_000),
    profile("provider", "openai", 10_000),
    profile("episode", episodeId.toLowerCase(), 10_000),
    profile("locale", "en-us", 10_000),
  ];
}

async function buildReadyAudioEpisode(
  episodeId: string,
  locale: "en-US" = "en-US"
): Promise<{
  binding: ReturnType<typeof compileAudioTtsReadinessArtifacts>["binding"];
  storyScriptBinding: NonNullable<ReturnType<typeof resolveStoryScriptReadinessBinding>>;
  evidenceById: Map<string, ReadinessEvidenceRecord>;
}> {
  const { admission, production } = loadAdmissionAndProduction();
  const record = production.records.find((entry) => entry.episodeId === episodeId);
  const script = admission.admittedScripts.find(
    (entry) => entry.episodeId === episodeId && entry.locale === locale
  );
  if (!record || !script) {
    throw new Error(`Missing fixture data for ${episodeId} ${locale}`);
  }

  const storyScriptBinding = resolveStoryScriptReadinessBinding({
    canonBundle: admission,
    productionRecord: record,
    locale,
  });
  if (!storyScriptBinding) {
    throw new Error(`Unable to resolve story binding for ${episodeId} ${locale}`);
  }

  const { binding, segmentationBundle } = compileAudioTtsReadinessArtifacts({
    packRoot: V5_PACK_ROOT,
    script,
    voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
    modelConfiguration: MODEL_CONFIGURATION,
  });

  expect(validateStoryScriptBinding({
    binding: storyScriptBinding,
    canonBundle: admission,
    productionBundle: production,
  })).toEqual([]);
  expect(validateAudioTtsBinding({ binding, script, segmentationBundle })).toEqual([]);

  const qa = validateV5StoryEpisodeDeterministicQa(
    { canonBundle: admission, productionBundle: production },
    episodeId
  );
  expect(qa.ok).toBe(true);

  const approved = await grantStoryApprovedEvidence(
    {
      canonBundle: admission,
      productionRecord: record,
      locale,
      scriptRevisionId: script.scriptRevisionId,
      approvedAt: ADMITTED_AT,
    },
    { deterministicQa: qa }
  );
  if (!approved.ok) {
    throw new Error(approved.issues.map((issue) => issue.message).join("\n"));
  }

  const storyEvidence = buildStoryScriptReadinessEvidenceRecords({
    binding: storyScriptBinding,
    storyApproved: approved.evidence,
    qa,
    recordedAt: PROJECTED_AT,
  });
  const storyScriptResult = evaluateStoryScriptGateForAudio({
    storyScriptBinding,
    evidenceById: evidenceMap(storyEvidence),
    projectedAt: PROJECTED_AT,
  });
  expect(storyScriptResult.ok).toBe(true);

  const budgetPreflight = evaluateAudioTtsBudgetPreflight({
    binding,
    modelConfiguration: MODEL_CONFIGURATION,
    profiles: budgetProfiles(episodeId),
    correlationId: `corr.audio.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
  });
  expect(budgetPreflight.allowed).toBe(true);

  const trustDecision = evaluateTrustGate({
    correlationId: `corr.trust.${episodeId.toLowerCase()}`,
    evaluatedAt: PROJECTED_AT,
    untrustedPayload: {
      scriptRevisionId: script.scriptRevisionId,
      locale,
    },
  });
  expect(trustDecision.allowed).toBe(true);

  const audioEvidence = buildAudioTtsReadinessEvidenceRecords({
    binding,
    storyScriptBinding,
    storyScriptResult,
    segmentationBundle,
    budgetPreflight,
    trustDecision,
    recordedAt: PROJECTED_AT,
  });

  return {
    binding,
    storyScriptBinding,
    evidenceById: evidenceMap([...storyEvidence, ...audioEvidence]),
  };
}

describe("audio and TTS canary readiness", () => {
  it("extracts localized master story text from imported V5 scripts", () => {
    const markdown = fs.readFileSync(
      path.join(
        V5_PACK_ROOT,
        "languages/en/episodes/e001-seven-minutes.md"
      ),
      "utf8"
    );
    const story = extractLocalizedMasterStory(markdown);
    expect(story).toContain("Maya watches her boyfriend die on her phone");
    expect(story).not.toContain("## Production metadata");
  });

  it("evaluates AUDIO_TTS_READY for imported V5 revisions E001 through E003", async () => {
    for (const episodeId of ["E001", "E002", "E003"] as const) {
      const { binding, storyScriptBinding, evidenceById } =
        await buildReadyAudioEpisode(episodeId);
      const result = evaluateAudioTtsReadiness({
        binding,
        storyScriptBinding,
        evidenceById,
        projectedAt: PROJECTED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(
          `${episodeId}: ${result.blockingReasons.map((reason) => reason.message).join("\n")}`
        );
      }
      expect(result.projection.domain).toBe("audio_tts");
      expect(result.projection.targetRevisionHash).toBe(
        audioTtsTargetRevisionHash(binding)
      );
      expect(result.projection.evaluations).toHaveLength(6);
      expect(projectionBlocksOnlyDomain(result, "audio_tts")).toBe(true);
    }
  });

  it("blocks audio readiness when budget evidence is missing", async () => {
    const { binding, storyScriptBinding, evidenceById } =
      await buildReadyAudioEpisode("E001");
    const withoutBudget = evidenceMap(
      [...evidenceById.values()].filter((record) => record.checkId !== "audio.budget")
    );

    const result = evaluateAudioTtsReadiness({
      binding,
      storyScriptBinding,
      evidenceById: withoutBudget,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing budget block");
    }
    expect(result.blockingReasons.some((reason) => reason.failureClass === "missing")).toBe(
      true
    );
    expect(projectionBlocksOnlyDomain(result, "audio_tts")).toBe(true);
  });

  it("blocks audio readiness when story approval evidence is stale", async () => {
    const { binding, storyScriptBinding, evidenceById } =
      await buildReadyAudioEpisode("E002");
    const staleStoryApproval = [...evidenceById.values()].find(
      (record) =>
        record.domain === "story_script" && record.checkId === "story.approved"
    );
    expect(staleStoryApproval).toBeTruthy();

    const staleEvidence = evidenceMap(
      [...evidenceById.values()].map((record) =>
        record.evidenceId === staleStoryApproval!.evidenceId
          ? { ...record, status: "STALE" as const }
          : record
      )
    );

    const result = evaluateAudioTtsReadiness({
      binding,
      storyScriptBinding,
      evidenceById: staleEvidence,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected stale story block");
    }
    expect(
      result.projection.evaluations.find((entry) => entry.checkId === "audio.story")
        ?.result
    ).toBe("FAIL");
    expect(projectionBlocksOnlyDomain(result, "audio_tts")).toBe(true);
  });

  it("fails closed on mismatched revision hashes", async () => {
    const { binding, storyScriptBinding, evidenceById } =
      await buildReadyAudioEpisode("E003");
    const mismatched = evidenceMap(
      [...evidenceById.values()].map((record) => ({
        ...record,
        boundRevisionHash: "b".repeat(64),
      }))
    );

    const result = evaluateAudioTtsReadiness({
      binding,
      storyScriptBinding,
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

  it("does not require visual, render or publication evidence", async () => {
    const { binding, storyScriptBinding, evidenceById } =
      await buildReadyAudioEpisode("E001");
    const visualEvidence: ReadinessEvidenceRecord = {
      schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
      evidenceId: "evidence.visual.render",
      domain: "visual_render",
      checkId: "visual.render",
      boundRevisionId: binding.scriptRevisionId,
      boundRevisionHash: audioTtsTargetRevisionHash(binding),
      status: "ACTIVE",
      recordedAt: PROJECTED_AT,
    };

    const result = evaluateAudioTtsReadiness({
      binding,
      storyScriptBinding,
      evidenceById: new Map([...evidenceById, [visualEvidence.evidenceId, visualEvidence]]),
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(true);
    expect(result.projection.evaluations.every((entry) => entry.result === "PASS")).toBe(
      true
    );

    const storyResult = evaluateReadinessProjection({
      domain: "story_script",
      targetRevisionId: storyScriptBinding.scriptRevisionId,
      targetRevisionHash: "a".repeat(64),
      projectedAt: PROJECTED_AT,
      checks: [{ checkId: "story.approved" }],
      evidenceById: new Map(),
      evaluateCheck: (check, record) =>
        defaultEvidenceBackedCheck(
          check,
          record,
          storyScriptBinding.scriptRevisionId,
          "a".repeat(64)
        ),
    });
    expect(storyResult.ok).toBe(false);
    expect(projectionBlocksOnlyDomain(result, "audio_tts")).toBe(true);
    expect(projectionBlocksOnlyDomain(storyResult, "story_script")).toBe(true);
    expect(projectionBlocksOnlyDomain(result, "story_script")).toBe(false);
  });

  it("targets invalidation to audio-only checks for facet changes", () => {
    expect(audioTtsChecksInvalidatedByChange("voice")).toEqual([
      "audio.voice",
      "audio.segmentation",
      "audio.provider_config",
    ]);
    expect(audioTtsChecksInvalidatedByChange("budget")).toEqual(["audio.budget"]);
    expect(audioTtsChecksInvalidatedByChange("story")).toEqual(["audio.story"]);
  });
});
