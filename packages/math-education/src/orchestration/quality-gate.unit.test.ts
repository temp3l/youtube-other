import { describe, expect, it } from "vitest";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  MATH_QUALITY_GATES,
  assertPublishAllowed,
  assertRenderAllowed,
  deriveMathQuality,
  evaluateMinorEditApproval,
  mathQualityInputSchema,
  mathQualityReportSchema,
  qualityCheck,
  qualityExitCode,
  type MathQualityCheck,
  type MathQualityCheckId,
} from "./quality-gate.js";

const hash = (value: string) => canonicalHash(value);
function checks(failed?: MathQualityCheckId, state: MathQualityCheck["evidenceState"] = "failed") {
  return MATH_QUALITY_GATES.map((gate) => ({
    checkId: gate.checkId,
    status: gate.failureStatus,
    passed: gate.checkId !== failed,
    evidenceState: gate.checkId === failed ? state : "ready",
    evidenceHash: gate.checkId === failed ? null : hash(gate.checkId),
    message: `${gate.checkId} evidence`,
    ...(gate.checkId === "localization" ? { assessedLocales: ["de" as const] } : {}),
  }));
}
function report(failed?: MathQualityCheckId, state?: MathQualityCheck["evidenceState"]) {
  return deriveMathQuality({ contractVersion: "math-quality-contract.v2", lessonId: "M5-ZO-001-standard", selectedLocales: ["de"], checks: checks(failed, state) });
}
function approvalFor(value: ReturnType<typeof report>, overrides: Record<string, unknown> = {}) {
  return {
    artifactVersion: "math-minor-approval.v1",
    qualityArtifact: { lessonId: value.lessonId, relativePath: "canonical/quality.json", contentHash: hash("quality-file"), qualityInputHash: value.qualityInputHash },
    decision: "approve-minor-edits",
    requestedByReviewerId: "author-reviewer",
    reviewedByReviewerId: "second-reviewer",
    requestedAt: "2026-07-13T10:00:00.000Z",
    reviewedAt: "2026-07-13T11:00:00.000Z",
    ...overrides,
  };
}

describe("fail-closed math quality", () => {
  it("derives every status and the complete documented priority matrix", () => {
    const expected = Object.fromEntries(MATH_QUALITY_GATES.map((gate) => [gate.checkId, gate.failureStatus]));
    for (const gate of MATH_QUALITY_GATES) expect(report(gate.checkId).status).toBe(expected[gate.checkId]);
    expect(report().status).toBe("READY");
    for (let lower = 1; lower < MATH_QUALITY_GATES.length; lower++) {
      const input = checks(MATH_QUALITY_GATES[lower]!.checkId);
      const higher = MATH_QUALITY_GATES[0]!;
      input.find((check) => check.checkId === higher.checkId)!.passed = false;
      input.find((check) => check.checkId === higher.checkId)!.evidenceState = "failed";
      input.find((check) => check.checkId === higher.checkId)!.evidenceHash = null;
      expect(deriveMathQuality({ contractVersion: "math-quality-contract.v2", lessonId: "lesson", selectedLocales: ["de"], checks: input }).status).toBe("MATHEMATICAL_ERROR");
    }
  });

  it("rejects empty, missing, duplicate, unknown, malformed, and contradictory checks but permits reordering", () => {
    const base = { contractVersion: "math-quality-contract.v2", lessonId: "lesson", selectedLocales: ["de"], checks: checks() };
    expect(() => mathQualityInputSchema.parse({ ...base, checks: [] })).toThrow();
    expect(() => mathQualityInputSchema.parse({ ...base, checks: checks().slice(1) })).toThrow();
    expect(() => mathQualityInputSchema.parse({ ...base, checks: [...checks().slice(1), checks()[1]] })).toThrow();
    expect(() => mathQualityInputSchema.parse({ ...base, checks: checks().map((check, index) => index ? check : { ...check, checkId: "invented" }) })).toThrow();
    expect(() => mathQualityInputSchema.parse({ ...base, checks: checks().map((check, index) => index ? check : { ...check, surprise: true }) })).toThrow();
    expect(() => mathQualityInputSchema.parse({ ...base, checks: checks().map((check, index) => index ? check : { ...check, passed: false }) })).toThrow();
    expect(deriveMathQuality({ ...base, checks: [...checks()].reverse() }).status).toBe("READY");
  });

  it.each(["skipped", "missing", "corrupt", "hash-invalid", "failed"] as const)("maps %s audio/render/final-media evidence to RENDER_BLOCKED", (state) => {
    for (const gate of ["audio", "render", "media-qa-packet", "final-media"] as const) expect(report(gate, state).status).toBe("RENDER_BLOCKED");
  });

  it("assesses exactly the selected locale scope", () => {
    expect(report().status).toBe("READY");
    const missing = checks("localization");
    missing.find((check) => check.checkId === "localization")!.assessedLocales = ["de"];
    expect(deriveMathQuality({ contractVersion: "math-quality-contract.v2", lessonId: "lesson", selectedLocales: ["de", "en"], checks: missing }).status).toBe("LOCALIZATION_ERROR");
  });

  it("blocks render for every upstream failure while separating final-media readiness", () => {
    for (const gate of ["mathematics", "curriculum", "localization", "timing"] as const) expect(() => assertRenderAllowed(report(gate))).toThrow();
    const mediaPending = report("audio", "skipped");
    expect(mediaPending.renderPreflightAllowed).toBe(true);
    expect(mediaPending.finalMediaReady).toBe(false);
    expect(() => assertRenderAllowed(mediaPending)).not.toThrow();
  });

  it("allows only READY or a valid, bound, second-reviewer minor approval to publish", () => {
    const ready = report();
    expect(() => assertPublishAllowed({ report: ready, qualityRelativePath: "canonical/quality.json", qualityContentHash: hash("quality-file"), publishingEnabled: true, explicitPublish: true })).not.toThrow();
    for (const gate of MATH_QUALITY_GATES.filter((gate) => gate.checkId !== "minor-edit-review"))
      expect(() => assertPublishAllowed({ report: report(gate.checkId), qualityRelativePath: "canonical/quality.json", qualityContentHash: hash("quality-file"), publishingEnabled: true, explicitPublish: true })).toThrow();
    const minor = report("minor-edit-review");
    const valid = approvalFor(minor);
    expect(evaluateMinorEditApproval({ report: minor, qualityRelativePath: "canonical/quality.json", qualityContentHash: hash("quality-file"), approval: valid }).approved).toBe(true);
    const attacks = [
      approvalFor(minor, { reviewedByReviewerId: "author-reviewer" }),
      approvalFor(minor, { qualityArtifact: { ...valid.qualityArtifact, contentHash: hash("stale") } }),
      approvalFor(minor, { qualityArtifact: { ...valid.qualityArtifact, lessonId: "wrong" } }),
      { ...valid, artifactVersion: "math-minor-approval.v0" },
      { ...valid, decision: "approve-anything" },
      { ...valid, reviewedAt: "not-a-date" },
    ];
    for (const attack of attacks) expect(evaluateMinorEditApproval({ report: minor, qualityRelativePath: "canonical/quality.json", qualityContentHash: hash("quality-file"), approval: attack }).approved).toBe(false);
    expect(evaluateMinorEditApproval({ report: report("mathematics"), qualityRelativePath: "canonical/quality.json", qualityContentHash: hash("quality-file"), approval: valid }).approved).toBe(false);
  });

  it("rejects injected derived status, permissions, and inline approval fields", () => {
    const valid = report();
    expect(() => mathQualityReportSchema.parse({ ...valid, status: "MATHEMATICAL_ERROR" })).toThrow();
    expect(() => mathQualityReportSchema.parse({ ...valid, publishableWithoutApproval: false })).toThrow();
    expect(() => mathQualityReportSchema.parse({ ...valid, approvedMinorEdits: true })).toThrow();
    expect(() => mathQualityReportSchema.parse({ ...valid, inlineEvidence: {} })).toThrow();
  });

  it("maps ready, mixed, and all-blocked selections to exit 0/2/3", () => {
    expect(qualityExitCode(["READY"])).toBe(0);
    expect(qualityExitCode(["READY", "RENDER_BLOCKED"])).toBe(2);
    expect(qualityExitCode(["RENDER_BLOCKED"])).toBe(3);
    expect(qualityExitCode(["MATHEMATICAL_ERROR", "PUBLISH_BLOCKED"])).toBe(3);
  });
});
