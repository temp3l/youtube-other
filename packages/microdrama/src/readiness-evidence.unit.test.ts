import { describe, expect, it } from "vitest";

import {
  READINESS_EVIDENCE_SCHEMA_VERSION,
  type ReadinessEvidenceRecord,
} from "./readiness-evidence-contracts.js";
import {
  conjunctionEvaluatesToPass,
  defaultEvidenceBackedCheck,
  evaluateReadinessProjection,
  evidenceMatchesRevision,
  projectionBlocksOnlyDomain,
  unavailableCheckNeverPasses,
} from "./readiness-evidence-evaluator.js";

const TARGET_REVISION_ID = "rev.script.en-us.e001";
const TARGET_REVISION_HASH = "a".repeat(64);
const PROJECTED_AT = "2026-08-12T03:40:00.000Z";

function evidence(
  overrides: Partial<ReadinessEvidenceRecord> = {}
): ReadinessEvidenceRecord {
  return {
    schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
    evidenceId: "evidence.story.approved",
    domain: "story_script",
    checkId: "story.approved",
    boundRevisionId: TARGET_REVISION_ID,
    boundRevisionHash: TARGET_REVISION_HASH,
    status: "ACTIVE",
    recordedAt: PROJECTED_AT,
    ...overrides,
  };
}

describe("readiness evidence evaluator", () => {
  it("passes only when every conjunction check is PASS", () => {
    const active = evidence();
    const result = evaluateReadinessProjection({
      domain: "story_script",
      targetRevisionId: TARGET_REVISION_ID,
      targetRevisionHash: TARGET_REVISION_HASH,
      projectedAt: PROJECTED_AT,
      checks: [
        { checkId: "story.approved" },
        { checkId: "story.boundary" },
      ],
      evidenceById: new Map([
        [active.evidenceId, active],
        [
          "evidence.story.boundary",
          evidence({
            evidenceId: "evidence.story.boundary",
            checkId: "story.boundary",
          }),
        ],
      ]),
      evaluateCheck: (check, record) =>
        defaultEvidenceBackedCheck(
          check,
          record,
          TARGET_REVISION_ID,
          TARGET_REVISION_HASH
        ),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected pass");
    }
    expect(conjunctionEvaluatesToPass(result.projection.evaluations)).toBe(true);
    expect(projectionBlocksOnlyDomain(result, "story_script")).toBe(true);
  });

  it("blocks only the applicable domain when evidence is stale or mismatched", () => {
    const stale = evidence({ status: "STALE" });
    const storyResult = evaluateReadinessProjection({
      domain: "story_script",
      targetRevisionId: TARGET_REVISION_ID,
      targetRevisionHash: TARGET_REVISION_HASH,
      projectedAt: PROJECTED_AT,
      checks: [{ checkId: "story.approved" }],
      evidenceById: new Map([[stale.evidenceId, stale]]),
      evaluateCheck: (check, record) =>
        defaultEvidenceBackedCheck(
          check,
          record,
          TARGET_REVISION_ID,
          TARGET_REVISION_HASH
        ),
    });
    expect(storyResult.ok).toBe(false);
    if (storyResult.ok) {
      throw new Error("expected stale block");
    }
    expect(storyResult.blockingReasons[0]?.failureClass).toBe("stale");

    const audioResult = evaluateReadinessProjection({
      domain: "audio_tts",
      targetRevisionId: TARGET_REVISION_ID,
      targetRevisionHash: TARGET_REVISION_HASH,
      projectedAt: PROJECTED_AT,
      checks: [{ checkId: "audio.budget" }],
      evidenceById: new Map(),
      evaluateCheck: (check, record) =>
        defaultEvidenceBackedCheck(
          check,
          record,
          TARGET_REVISION_ID,
          TARGET_REVISION_HASH
        ),
    });
    expect(audioResult.ok).toBe(false);
    expect(projectionBlocksOnlyDomain(storyResult, "story_script")).toBe(true);
    expect(projectionBlocksOnlyDomain(audioResult, "audio_tts")).toBe(true);
    expect(projectionBlocksOnlyDomain(storyResult, "audio_tts")).toBe(false);
  });

  it("never turns UNAVAILABLE checks into PASS", () => {
    const evaluations = [
      {
        checkId: "visual.semantic",
        result: "UNAVAILABLE" as const,
        failureClass: "unavailable_check" as const,
        reason: "Semantic visual QA unavailable.",
      },
      {
        checkId: "visual.technical",
        result: "PASS" as const,
        evidenceId: "evidence.visual.technical",
      },
    ];
    expect(conjunctionEvaluatesToPass(evaluations)).toBe(false);
    expect(unavailableCheckNeverPasses(evaluations)).toBe(true);
    expect(
      evidenceMatchesRevision(
        evidence(),
        TARGET_REVISION_ID,
        TARGET_REVISION_HASH
      )
    ).toBe(true);
    expect(
      evidenceMatchesRevision(evidence(), "rev.other", TARGET_REVISION_HASH)
    ).toBe(false);
  });
});
