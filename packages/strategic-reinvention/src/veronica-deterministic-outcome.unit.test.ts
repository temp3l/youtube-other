import { describe, expect, it } from "vitest";
import {
  classifyVeronicaPreparationError,
  flattenVeronicaCurrentAuthorityRootCauses,
  VeronicaExpectedDeterministicOutcomeError,
} from "./veronica-deterministic-outcome.js";

const finding = {
  code: "KNOWN_QUALITY_FAILURE",
  stage: "beat-quality",
  message: "The deterministic quality gate rejected the plan.",
  rootCause: "KNOWN_QUALITY_FAILURE",
  retryable: false,
  paidStageEligible: false,
} as const;

describe("Veronica deterministic preparation outcomes", () => {
  it.each(["BLOCK", "REVIEW"] as const)("preserves typed %s findings and prevents paid eligibility", (outcome) => {
    const error = new VeronicaExpectedDeterministicOutcomeError(
      outcome,
      "KNOWN_QUALITY_FAILURE",
      "beat-quality",
      [finding],
      "KNOWN_QUALITY_FAILURE:fixture",
    );
    expect(classifyVeronicaPreparationError(error)).toMatchObject({
      status: outcome,
      code: "KNOWN_QUALITY_FAILURE",
      findings: [finding],
      paidStageEligible: false,
      source: "typed-deterministic-outcome",
    });
  });

  it("retains an unknown exception as ERROR", () => {
    expect(classifyVeronicaPreparationError(new Error("filesystem exploded"))).toMatchObject({
      status: "ERROR",
      code: "UNEXPECTED_PREPARATION_ERROR",
      findings: [],
      source: "unexpected-exception",
    });
  });

  it("accepts existing typed mandatory-budget blockers through the same boundary", () => {
    const legacyTypedBlock = Object.assign(new Error("PROMPT_MANDATORY_CONTENT_OVER_BUDGET:scene-1"), {
      outcome: "BLOCK" as const,
      code: "PROMPT_MANDATORY_CONTENT_OVER_BUDGET" as const,
    });
    expect(classifyVeronicaPreparationError(legacyTypedBlock)).toMatchObject({
      status: "BLOCK",
      code: "PROMPT_MANDATORY_CONTENT_OVER_BUDGET",
      paidStageEligible: false,
    });
  });

  it("keeps DETERMINISTIC_PREPARATION as stage and flattens specific nested findings", () => {
    const terminal = classifyVeronicaPreparationError(Object.assign(
      new Error("DETERMINISTIC_PREPARATION"),
      { outcome: "BLOCK" as const, code: "DETERMINISTIC_PREPARATION", stage: "DETERMINISTIC_PREPARATION" },
    ));
    const flattened = flattenVeronicaCurrentAuthorityRootCauses({
      contentId: "fixture",
      terminalOutcome: terminal,
      semanticPlan: {
        semanticQuality: { findingCodes: ["SEMANTIC_REMEDIATION_LOW_CONFIDENCE"] },
        providerReadiness: {
          issues: [{ sceneId: "S01", code: "CROSS_EPISODE_MOTIF_LEAKAGE", reason: "unsupported doorway" }],
        },
        visualBeatPlan: {
          quality: { findings: [{ sceneId: "S01", beatId: "B01", code: "NO_SAFE_BEAT_CANDIDATE", message: "none safe" }] },
          candidateSelection: {
            noSafeReasons: [{
              sceneId: "S01",
              beatId: "B01",
              primaryReason: { kind: "UNRESOLVED_REQUIRED_MECHANISM", semanticRelation: "STABLE" },
            }],
          },
        },
      },
      semanticReviews: {
        reviews: [{ findings: [{ code: "TREATMENT_PROPOSITION_COMPATIBILITY", message: "unsupported environment" }] }],
      },
      evidencePaths: { semanticPlan: "source/plan.json", semanticReviews: "shared/reviews.json" },
    });
    expect(new Set(flattened.map((cause) => cause.rootCause))).toEqual(new Set([
      "CROSS_EPISODE_MOTIF_LEAKAGE",
      "NO_SAFE_BEAT_CANDIDATE",
      "SEMANTIC_REMEDIATION_LOW_CONFIDENCE",
      "TREATMENT_PROPOSITION_COMPATIBILITY",
      "UNRESOLVED_REQUIRED_MECHANISM",
    ]));
    expect(flattened.every((cause) => cause.stage === "DETERMINISTIC_PREPARATION")).toBe(true);
    expect(flattened.some((cause) => cause.rootCause === "DETERMINISTIC_PREPARATION")).toBe(false);
  });
});
