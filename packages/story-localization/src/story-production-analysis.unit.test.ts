import { describe, expect, it } from "vitest";
import {
  STORY_PRODUCTION_ANALYSIS_GATE_VERSION,
  STORY_PRODUCTION_ANALYSIS_PROMPT_VERSION,
  STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION,
  STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION,
  STORY_PRODUCTION_ANALYSIS_V2_RESPONSE_SCHEMA_VERSION,
  buildStoryProductionAnalysisV2EvidenceSummary,
  computeDeterministicOverallScore,
  computeStoryProductionAnalysisFingerprint,
  computeStoryProductionAnalysisV2QualitativeScore,
  computeStoryProductionAnalysisV2StructuredResponseFingerprint,
  deriveStoryProductionAnalysisV2AdvisoryVerdict,
  deriveStoryProductionVerdict,
  deriveStoryProductionV2Verdict,
  parseStoryProductionAnalysisV2Response,
  storyProductionAnalysisArtifactSchema,
  storyProductionAnalysisResponseSchema,
  storyProductionAnalysisV2ResponseSchema,
  type StoryProductionAnalysisModelResponse,
  type StoryProductionAnalysisV2EvidenceItem,
  type StoryProductionAnalysisV2ModelResponse,
} from "./story-production-analysis.js";
import { buildStoryAnalysisDeterministicContractResult } from "./story-quality-gate.js";
import { STORY_AFFECT_ISSUE_CODES } from "./story-generation-contracts.js";

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

const affectReferenceIndex = {
  planHash: "a".repeat(64),
  questionIds: ["primary-question"],
  beatIds: ["beat-001", "beat-002", "beat-003"],
  evidenceIds: ["canonical-contract:central-threat"],
  responseIds: ["response-001"],
} as const;

const v2Source = {
  storyText: "One.\n\nTwo.\n\nThree.",
  paragraphCount: 3,
  language: "en",
  locale: "en-US",
  format: "full",
  affectReferenceIndex,
} as const;

function v2Evidence(
  overrides: Partial<StoryProductionAnalysisV2EvidenceItem> = {}
): StoryProductionAnalysisV2EvidenceItem {
  return {
    id: "gap-1",
    assessment: "weakness",
    paragraphSpans: [{ start: 1, end: 2 }],
    affectRefs: {
      questionIds: ["primary-question"],
      beatIds: ["beat-001"],
      evidenceIds: ["canonical-contract:central-threat"],
      responseIds: [],
    },
    summary: "The central question becomes vague.",
    severity: "major",
    evidenceNote: "The first two paragraphs do not narrow the question.",
    ...overrides,
  };
}

function makeV2Response(
  overrides: Partial<StoryProductionAnalysisV2ModelResponse> = {}
): StoryProductionAnalysisV2ModelResponse {
  const v1 = makeResponse();
  const dimension = { score: 8, findings: [] };
  return storyProductionAnalysisV2ResponseSchema.parse({
    schemaVersion: STORY_PRODUCTION_ANALYSIS_V2_RESPONSE_SCHEMA_VERSION,
    ...v1,
    qualitativeDimensions: {
      informationGapManagement: {
        score: 6,
        findings: [v2Evidence()],
      },
      credibleResponseNarrowing: dimension,
      earnedSurprise: dimension,
      causalGoalContinuity: dimension,
      threatCoping: dimension,
      tensionModulation: dimension,
      presence: dimension,
    },
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

  it("blocks deterministic score 79 and passes score 80", () => {
    const verdict79 = deriveStoryProductionVerdict({
      modelResponse: makeResponse({
        scores: { ...makeResponse().scores, hookStrength: 7 },
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
    const verdict80 = deriveStoryProductionVerdict({
      modelResponse: makeResponse(),
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
    expect(verdict79.overallScore).toBe(79);
    expect(verdict79.pass).toBe(false);
    expect(verdict80.overallScore).toBe(80);
    expect(verdict80.pass).toBe(true);
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

  it("validates V2 paragraph spans and existing affect-plan semantic IDs", () => {
    const parsed = parseStoryProductionAnalysisV2Response(
      makeV2Response(),
      v2Source
    );
    expect(
      parsed.qualitativeDimensions.informationGapManagement.findings[0]
        ?.paragraphSpans
    ).toEqual([{ start: 1, end: 2 }]);
    expect(
      buildStoryProductionAnalysisV2EvidenceSummary(parsed).citedAffectIds
    ).toContain("primary-question");
  });

  it("rejects out-of-range paragraph evidence and invented affect IDs", () => {
    const outOfRange = makeV2Response({
      qualitativeDimensions: {
        ...makeV2Response().qualitativeDimensions,
        informationGapManagement: {
          score: 6,
          findings: [v2Evidence({ paragraphSpans: [{ start: 2, end: 4 }] })],
        },
      },
    });
    const invented = makeV2Response({
      qualitativeDimensions: {
        ...makeV2Response().qualitativeDimensions,
        earnedSurprise: {
          score: 4,
          findings: [
            v2Evidence({
              id: "surprise-1",
              affectRefs: {
                questionIds: [],
                beatIds: ["beat-invented"],
                evidenceIds: [],
                responseIds: [],
              },
            }),
          ],
        },
      },
    });
    expect(() =>
      parseStoryProductionAnalysisV2Response(outOfRange, v2Source)
    ).toThrow(/story has 3 paragraphs/u);
    expect(() =>
      parseStoryProductionAnalysisV2Response(invented, v2Source)
    ).toThrow(/invented beatIds ID beat-invented/u);
  });

  it("Task 07 accepts repair metadata only with cited modifiable beats and protected facts", () => {
    const eligible = makeV2Response({
      qualitativeDimensions: {
        ...makeV2Response().qualitativeDimensions,
        threatCoping: {
          score: 5,
          findings: [
            v2Evidence({
              id: "response-step-1",
              issueCode: STORY_AFFECT_ISSUE_CODES.LOCAL_RESPONSE_STEP_MISSING,
              repairScope: "beat",
              modifiableBeatIds: ["beat-001"],
              protectedFacts: [
                {
                  id: "fact-ending",
                  statement: "The last bell still rings.",
                },
              ],
            }),
          ],
        },
      },
    });
    expect(
      parseStoryProductionAnalysisV2Response(eligible, v2Source)
        .qualitativeDimensions.threatCoping.findings[0]?.repairScope
    ).toBe("beat");

    expect(() =>
      storyProductionAnalysisV2ResponseSchema.parse({
        ...eligible,
        qualitativeDimensions: {
          ...eligible.qualitativeDimensions,
          threatCoping: {
            score: 5,
            findings: [
              {
                ...eligible.qualitativeDimensions.threatCoping.findings[0],
                protectedFacts: undefined,
              },
            ],
          },
        },
      })
    ).toThrow(/protectedFacts/u);
  });

  it("gives deterministic contract failures precedence over subjective findings", () => {
    const response = makeV2Response({
      scores: Object.fromEntries(
        Object.keys(makeResponse().scores).map((key) => [key, 10])
      ) as StoryProductionAnalysisModelResponse["scores"],
      overallScore: 100,
    });
    const verdict = deriveStoryProductionV2Verdict({
      modelResponse: response,
      source: v2Source,
      deterministicContractResult:
        buildStoryAnalysisDeterministicContractResult({
          failures: {
            "accepted-final-line": "Accepted final line changed.",
            "affect-projection": "Affect payoff ID was contradicted.",
          },
        }),
      missingLineage: false,
      staleLineage: false,
      analysisFingerprintMismatch: false,
      invalidStructuredAnalysis: false,
    });
    expect(verdict.verdict).toBe("BLOCKED");
    expect(verdict.reason).toContain("accepted-final-line");
  });

  it("derives stable advisory scores, verdicts, summaries, and fingerprints", () => {
    const response = parseStoryProductionAnalysisV2Response(
      makeV2Response(),
      v2Source
    );
    const deterministicContractResult =
      buildStoryAnalysisDeterministicContractResult();
    const scoreLeft = computeStoryProductionAnalysisV2QualitativeScore(
      response.qualitativeDimensions
    );
    const scoreRight = computeStoryProductionAnalysisV2QualitativeScore(
      response.qualitativeDimensions
    );
    const fingerprintInput = {
      response,
      deterministicContractResult,
      paragraphCount: v2Source.paragraphCount,
      affectPlanHash: affectReferenceIndex.planHash,
    };
    expect(scoreLeft).toBe(scoreRight);
    expect(deriveStoryProductionAnalysisV2AdvisoryVerdict(scoreLeft)).toBe(
      deriveStoryProductionAnalysisV2AdvisoryVerdict(scoreRight)
    );
    expect(
      computeStoryProductionAnalysisV2StructuredResponseFingerprint(
        fingerprintInput
      )
    ).toBe(
      computeStoryProductionAnalysisV2StructuredResponseFingerprint(
        fingerprintInput
      )
    );
  });

  it("keeps accepted V1 artifacts readable without V2 reclassification", () => {
    const response = makeResponse();
    const verdict = deriveStoryProductionVerdict({
      modelResponse: response,
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
    const parsed = storyProductionAnalysisArtifactSchema.parse({
      schemaVersion: STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION,
      episode: "014",
      episodeSlug: "014-demo",
      language: "en",
      locale: "en-US",
      format: "full",
      sourceArtifactPath: "/tmp/canonical-full.json",
      sourceContentFingerprint: "a".repeat(64),
      sourceLineageFingerprint: "b".repeat(64),
      analysisFingerprint: "c".repeat(64),
      analysisPromptVersion: STORY_PRODUCTION_ANALYSIS_PROMPT_VERSION,
      analysisSchemaVersion: STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION,
      analysisSchemaFingerprint: "d".repeat(64),
      productionGateVersion: STORY_PRODUCTION_ANALYSIS_GATE_VERSION,
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
      requestDurationMs: 1,
      retryCount: 0,
      cacheStatus: "hit",
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
      estimatedCost: null,
      modelScores: response.scores,
      scores: response.scores,
      modelOverallScore: response.overallScore,
      overallScore: verdict.overallScore,
      gateResults: verdict.gateResults,
      pass: true,
      verdict: "READY",
      verdictReason: verdict.reason,
      modelVerdictRecommendation: response.verdictRecommendation,
      strengths: [],
      weaknesses: [],
      blockingIssues: [],
      retentionRisks: [],
      requiredChanges: [],
      optionalImprovements: [],
      productionAssessment: response.productionAssessment,
    });
    expect(parsed.schemaVersion).toBe(STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION);
    expect(parsed.pass).toBe(true);
    expect("qualitativeDimensions" in parsed).toBe(false);
  });
});
