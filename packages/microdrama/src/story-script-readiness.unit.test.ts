import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildStoryScriptReadinessEvidenceRecords,
  evaluateStoryScriptReadiness,
  resolveStoryScriptReadinessBinding,
  storyScriptTargetRevisionHash,
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

async function buildReadyEpisode(
  episodeId: string,
  locale = "en-US"
): Promise<{
  binding: NonNullable<ReturnType<typeof resolveStoryScriptReadinessBinding>>;
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

  const binding = resolveStoryScriptReadinessBinding({
    canonBundle: admission,
    productionRecord: record,
    locale,
  });
  if (!binding) {
    throw new Error(`Unable to resolve readiness binding for ${episodeId} ${locale}`);
  }

  expect(validateStoryScriptBinding({
    binding,
    canonBundle: admission,
    productionBundle: production,
  })).toEqual([]);

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

  const records = buildStoryScriptReadinessEvidenceRecords({
    binding,
    storyApproved: approved.evidence,
    qa,
    recordedAt: PROJECTED_AT,
  });

  return { binding, evidenceById: evidenceMap(records) };
}

describe("story and localized-script readiness", () => {
  it("evaluates STORY_SCRIPT_READY for imported V5 revisions E001 through E003", async () => {
    for (const episodeId of ["E001", "E002", "E003"] as const) {
      const { binding, evidenceById } = await buildReadyEpisode(episodeId);
      const result = evaluateStoryScriptReadiness({
        binding,
        evidenceById,
        projectedAt: PROJECTED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(
          `${episodeId}: ${result.blockingReasons.map((reason) => reason.message).join("\n")}`
        );
      }
      expect(result.projection.domain).toBe("story_script");
      expect(result.projection.targetRevisionId).toBe(binding.scriptRevisionId);
      expect(result.projection.targetRevisionHash).toBe(
        storyScriptTargetRevisionHash(binding)
      );
      expect(result.projection.evaluations).toHaveLength(4);
      expect(projectionBlocksOnlyDomain(result, "story_script")).toBe(true);
    }
  });

  it("blocks story/script readiness when STORY_APPROVED evidence is missing", async () => {
    const { binding, evidenceById } = await buildReadyEpisode("E001");
    const withoutApproval = evidenceMap(
      [...evidenceById.values()].filter((record) => record.checkId !== "story.approved")
    );

    const result = evaluateStoryScriptReadiness({
      binding,
      evidenceById: withoutApproval,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing approval block");
    }
    expect(result.blockingReasons.some((reason) => reason.failureClass === "missing")).toBe(
      true
    );
    expect(projectionBlocksOnlyDomain(result, "story_script")).toBe(true);
  });

  it("blocks story/script readiness when locale parity evidence is stale", async () => {
    const { binding, evidenceById } = await buildReadyEpisode("E002");
    const parityEvidence = [...evidenceById.values()].find(
      (record) => record.checkId === "story.locale_parity"
    );
    expect(parityEvidence).toBeTruthy();

    const staleParity: ReadinessEvidenceRecord = {
      ...parityEvidence!,
      status: "STALE",
    };
    const staleEvidence = evidenceMap(
      [...evidenceById.values()].map((record) =>
        record.checkId === "story.locale_parity" ? staleParity : record
      )
    );

    const storyResult = evaluateStoryScriptReadiness({
      binding,
      evidenceById: staleEvidence,
      projectedAt: PROJECTED_AT,
    });
    expect(storyResult.ok).toBe(false);
    if (storyResult.ok) {
      throw new Error("expected stale parity block");
    }
    expect(storyResult.blockingReasons[0]?.failureClass).toBe("stale");

    const audioResult = evaluateReadinessProjection({
      domain: "audio_tts",
      targetRevisionId: binding.scriptRevisionId,
      targetRevisionHash: storyScriptTargetRevisionHash(binding),
      projectedAt: PROJECTED_AT,
      checks: [{ checkId: "audio.budget" }],
      evidenceById: new Map(),
      evaluateCheck: (check, record) =>
        defaultEvidenceBackedCheck(
          check,
          record,
          binding.scriptRevisionId,
          storyScriptTargetRevisionHash(binding)
        ),
    });
    expect(audioResult.ok).toBe(false);
    expect(projectionBlocksOnlyDomain(storyResult, "story_script")).toBe(true);
    expect(projectionBlocksOnlyDomain(audioResult, "audio_tts")).toBe(true);
    expect(projectionBlocksOnlyDomain(storyResult, "audio_tts")).toBe(false);
  });

  it("fails closed on mismatched revision hashes", async () => {
    const { binding, evidenceById } = await buildReadyEpisode("E003");
    const mismatched = evidenceMap(
      [...evidenceById.values()].map((record) => ({
        ...record,
        boundRevisionHash: "b".repeat(64),
      }))
    );

    const result = evaluateStoryScriptReadiness({
      binding,
      evidenceById: mismatched,
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected mismatched revision block");
    }
    expect(
      result.blockingReasons.every((reason) => reason.failureClass === "mismatched_revision")
    ).toBe(true);
  });

  it("does not require rolling planning or media evidence", async () => {
    const { binding, evidenceById } = await buildReadyEpisode("E001");
    const mediaEvidence: ReadinessEvidenceRecord = {
      schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
      evidenceId: "evidence.visual.render",
      domain: "visual_render",
      checkId: "visual.render",
      boundRevisionId: binding.scriptRevisionId,
      boundRevisionHash: storyScriptTargetRevisionHash(binding),
      status: "ACTIVE",
      recordedAt: PROJECTED_AT,
    };

    const result = evaluateStoryScriptReadiness({
      binding,
      evidenceById: new Map([...evidenceById, [mediaEvidence.evidenceId, mediaEvidence]]),
      projectedAt: PROJECTED_AT,
    });

    expect(result.ok).toBe(true);
    expect(result.projection.evaluations.every((entry) => entry.result === "PASS")).toBe(
      true
    );
  });
});
