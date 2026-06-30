import { describe, expect, it } from "vitest";
import {
  computeDeterministicOverallScore,
  computeStoryProductionAnalysisFingerprint,
  deriveStoryProductionVerdict,
  storyProductionAnalysisResponseSchema,
  type StoryProductionAnalysisModelResponse,
} from "./story-production-analysis.js";

function makeResponse(
  overrides: Partial<StoryProductionAnalysisModelResponse> = {}
): StoryProductionAnalysisModelResponse {
  return storyProductionAnalysisResponseSchema.parse({
    scores: {
      hookStrength: 8,
      retentionAndPacing: 8,
      narrativeClarity: 8,
      tensionAndEscalation: 8,
      emotionalImpact: 8,
      narrationQuality: 8,
      visualSuitability: 8,
      sceneAlignment: 8,
      originality: 8,
      characterCredibility: 8,
      climaxAndEnding: 8,
      localizationQuality: 8,
      monetizationSafety: 8,
      thumbnailPotential: 8,
    },
    overallScore: 80,
    findings: {
      unresolvedNarrativeContradiction: false,
      unresolvedTimelineOrCausalInconsistency: false,
      monetizationOrPublishingBlocker: false,
      copyrightOrProvenanceBlocker: false,
      localizedPlotCriticalChange: false,
      structuralFailureSeverity: "none",
      visualProductionSuitability: "usable",
    },
    strengths: [],
    weaknesses: [],
    blockingIssues: [],
    retentionRisks: [],
    requiredChanges: [],
    optionalImprovements: [],
    productionAssessment: {
      estimatedNarrationMinutes: 11.5,
      estimatedSceneCount: 18,
      visuallyDistinctSceneCount: 14,
      repeatedVisualRisk: "low",
      characterContinuityRisk: "low",
      thumbnailConcept: "A shadow behind a doorway.",
      thumbnailHook: "DON'T OPEN IT",
      narrationAssessment: "Clear narration cadence.",
      visualProductionAssessment: "Distinct scenes across the story.",
    },
    verdictRecommendation: "READY",
    verdictReason: "Solid story shape.",
    ...overrides,
  });
}

describe("story production analysis", () => {
  it("validates the full score schema", () => {
    expect(() =>
      storyProductionAnalysisResponseSchema.parse({
        ...makeResponse(),
        scores: {
          ...makeResponse().scores,
          hookStrength: 11,
        },
      })
    ).toThrow();
  });

  it("computes deterministic weighted overall score", () => {
    expect(computeDeterministicOverallScore(makeResponse().scores)).toBe(80);
  });

  it("fails the gate at threshold boundaries", () => {
    const verdict = deriveStoryProductionVerdict({
      modelResponse: makeResponse({
        scores: {
          ...makeResponse().scores,
          hookStrength: 6,
        },
      }),
      source: {
        storyText: "Story",
        paragraphCount: 1,
        language: "en",
        locale: "en-US",
        format: "full",
      },
      missingLineage: false,
      staleLineage: false,
      analysisFingerprintMismatch: false,
      invalidStructuredAnalysis: false,
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.verdict).toBe("REVISION_REQUIRED");
  });

  it("derives blocked verdicts from blocking checks", () => {
    const verdict = deriveStoryProductionVerdict({
      modelResponse: makeResponse({
        findings: {
          ...makeResponse().findings,
          copyrightOrProvenanceBlocker: true,
        },
        blockingIssues: [
          {
            id: "blocker-1",
            paragraphRefs: ["p3"],
            sectionRefs: [],
            summary: "Provenance issue.",
            severity: "blocking",
            evidenceNote: "Needs source confirmation.",
          },
        ],
      }),
      source: {
        storyText: "Story",
        paragraphCount: 1,
        language: "en",
        locale: "en-US",
        format: "full",
      },
      missingLineage: false,
      staleLineage: false,
      analysisFingerprintMismatch: false,
      invalidStructuredAnalysis: false,
    });
    expect(verdict.verdict).toBe("BLOCKED");
    expect(verdict.pass).toBe(false);
  });

  it("keeps fingerprints stable and invalidates on model changes", () => {
    const left = computeStoryProductionAnalysisFingerprint({
      sourceContentFingerprint: "a".repeat(64),
      sourceLineageFingerprint: "b".repeat(64),
      language: "en",
      locale: "en-US",
      format: "full",
      sourceArtifactPath: "/tmp/story.json",
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
    });
    const right = computeStoryProductionAnalysisFingerprint({
      sourceContentFingerprint: "a".repeat(64),
      sourceLineageFingerprint: "b".repeat(64),
      language: "en",
      locale: "en-US",
      format: "full",
      sourceArtifactPath: "/tmp/story.json",
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
    });
    const changed = computeStoryProductionAnalysisFingerprint({
      sourceContentFingerprint: "a".repeat(64),
      sourceLineageFingerprint: "b".repeat(64),
      language: "en",
      locale: "en-US",
      format: "full",
      sourceArtifactPath: "/tmp/story.json",
      model: "gpt-5.5",
      reasoningEffort: "medium",
    });
    expect(left).toBe(right);
    expect(changed).not.toBe(left);
  });
});
