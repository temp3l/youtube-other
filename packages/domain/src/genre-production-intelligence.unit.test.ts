import { describe, expect, it } from "vitest";

import {
  GENRE_PRODUCTION_INTELLIGENCE_SCHEMA_VERSION,
  analyzeRetentionStructure,
  cacheIdentityForGenreProduction,
  createImmutablePlan,
  evaluateAnalyticsProposal,
  evaluateOriginality,
  genreProductionProfileSchema,
  isImmutablePlanCurrent,
  planLocalization,
  scoreTopicOpportunity,
  validateAssetLineage,
  validatePackagingHypotheses,
} from "./genre-production-intelligence.js";

const profile = genreProductionProfileSchema.parse({
  schemaVersion: GENRE_PRODUCTION_INTELLIGENCE_SCHEMA_VERSION,
  genreId: "fixture-genre",
  profileVersion: "fixture-v1",
  topicPolicy: { factors: [{ id: "measured-demand", weight: 3, required: true }, { id: "editorial-fit", weight: 1 }], minimumConfidence: 0.5 },
  scriptPolicy: { requiredBeats: ["opening-hook", "promise", "conclusion-payoff"], timingRangesSeconds: { "opening-hook": { min: 0, max: 30 } } },
  packagingPolicy: {},
  audioPolicy: {},
  originalityPolicy: { maximumSimilarity: 0.4, requireReviewAbove: 0.3 },
  analyticsPolicy: { checkpoints: ["h48", "d7", "d28"], minimumSampleSize: 100 },
  localizationPolicy: { minimumEligibilityScore: 70 },
  extensions: {},
});

const evidence = { source: "MEASURED" as const, confidence: 0.9, references: ["fixture"] };

describe("genre production intelligence", () => {
  it("is opt-in and keeps profiles isolated", () => {
    const inactive = genreProductionProfileSchema.parse({ schemaVersion: GENRE_PRODUCTION_INTELLIGENCE_SCHEMA_VERSION, genreId: "dark-truth", profileVersion: "existing-v1", extensions: {} });
    expect(() => scoreTopicOpportunity({ profile: inactive, topicId: "topic", factors: [] })).toThrow(/not enabled/);
    expect(cacheIdentityForGenreProduction(profile, "score", "a".repeat(64))).not.toBe(cacheIdentityForGenreProduction({ ...profile, genreId: "history" }, "score", "a".repeat(64)));
  });

  it("scores only supplied evidence and reports missing required data without inventing metrics", () => {
    const result = scoreTopicOpportunity({ profile, topicId: "topic", factors: [{ factorId: "editorial-fit", normalizedScore: 80, evidence: { ...evidence, source: "EDITORIAL" }, rationale: "Editor assessment." }] });
    expect(result.score).toBe(80);
    expect(result.missingRequiredFactorIds).toEqual(["measured-demand"]);
    expect(result.factors[0]).toMatchObject({ status: "missing" });
  });

  it("uses genre timing and retention requirements without a universal structure", () => {
    const result = analyzeRetentionStructure({ profile, beats: [{ kind: "opening-hook", atSeconds: 45, evidence: { ...evidence, value: "late hook" } }, { kind: "promise", atSeconds: 55, evidence: { ...evidence, value: "promise" } }] });
    expect(result.missingBeats).toEqual(["conclusion-payoff"]);
    expect(result.timingFindings).toHaveLength(1);
  });

  it("requires three distinct, promise-supported packaging hypotheses", () => {
    const result = validatePackagingHypotheses({ profile, hypotheses: { profileVersion: "fixture-v1", titles: ["a", "b", "c"].map((id) => ({ id, meaning: `title ${id}`, promiseClaims: ["claim"], contentSupportClaims: ["claim"] })), thumbnails: ["d", "e", "f"].map((id) => ({ id, meaning: `thumbnail ${id}`, promiseClaims: ["claim"], contentSupportClaims: [] })) } });
    expect(result.approvalRequired).toBe(true);
    expect(result.titleValidation.every((item) => item.supported)).toBe(true);
    expect(result.thumbnailValidation.every((item) => !item.supported)).toBe(true);
  });

  it("binds approval plans to immutable hashes and invalidates edits", () => {
    const plan = createImmutablePlan(profile, { candidates: ["a", "b", "c"] });
    expect(isImmutablePlanCurrent(plan, { candidates: ["a", "b", "c"] })).toBe(true);
    expect(isImmutablePlanCurrent(plan, { candidates: ["a", "b", "changed"] })).toBe(false);
  });

  it("requires complete asset provenance lineage", () => {
    expect(() => validateAssetLineage([{ assetId: "image-1", origin: "licensed", parentAssetIds: [], transformations: [], bindings: [], disclosure: { required: false } }])).toThrow();
    expect(() => validateAssetLineage([{ assetId: "image-1", origin: "generated", parentAssetIds: ["missing"], transformations: [], bindings: [], disclosure: { required: false } }])).toThrow(/unknown parent/);
  });

  it("never mutates a profile from analytics and respects sample thresholds", () => {
    const result = evaluateAnalyticsProposal({ profile, checkpoint: { id: "h48", observedAt: "2026-08-05T00:00:00.000Z", sampleSize: 10, metrics: { ctr: { value: 0.1, ...evidence } } }, proposal: { profileVersion: "fixture-v1", proposalId: "proposal-1", diagnostics: ["Need more data"], evidence: [{ value: 0.1, ...evidence }], proposedChanges: ["Try a new opener"], approvalState: "pending", rollbackPlan: "Revert profile version." } });
    expect(result).toMatchObject({ eligible: false, requiresApproval: true, mayMutateProfile: false });
  });

  it("plans localization with cost approval and preserves evidence classification", () => {
    const result = planLocalization({ profile, plan: { profileVersion: "fixture-v1", sourceLocale: "it", targetLanguages: ["en"], eligibility: { value: 80, source: "DERIVED", confidence: 0.7, references: ["fixture"] }, metadataTranslationRequired: true, dubbingPlan: { required: true, pronunciationQaRequired: false }, estimatedCost: { currency: "USD", amount: 12.5, operations: 2 }, approvalRequired: true } });
    expect(result).toMatchObject({ eligible: true, requiresApproval: true, pronunciationQaRequired: true });
  });

  it("gates originality according to the active profile", () => {
    expect(evaluateOriginality({ profile, check: { profileVersion: "fixture-v1", similarity: 0.35, evidence: { value: 35, ...evidence }, references: ["comparison"] } })).toEqual({ permitted: true, requiresReview: true });
  });
});
