import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HORROR_EDITORIAL_RUBRIC_VERSION,
  aggregateBlindHorrorEditorialRatings,
  buildHorrorCalibrationBaselineManifest,
  horrorCalibrationBaselineManifestSchema,
  horrorCalibrationCorpusSchema,
  horrorEditorialDimensions,
  horrorEditorialRatingSchema,
  horrorStructuralFindingCodes,
  prepareBlindHorrorEditorialReview,
  type HorrorBlindReviewPacket,
  type HorrorEditorialRating,
} from "./horror-editorial-calibration.js";

const fixtureDirectory = path.resolve(
  import.meta.dirname,
  "__fixtures__/horror-calibration"
);

async function loadJsonFixture(fileName: string): Promise<unknown> {
  return JSON.parse(
    await fs.readFile(path.join(fixtureDirectory, fileName), "utf8")
  ) as unknown;
}

function dimensionRecord<T>(
  value: T
): Record<(typeof horrorEditorialDimensions)[number], T> {
  return {
    comprehension: value,
    suspense: value,
    curiosity: value,
    earnedSurprise: value,
    presence: value,
    emotionalCost: value,
    payoff: value,
  };
}

function rating(args: {
  readonly packet: HorrorBlindReviewPacket;
  readonly reviewItemId: string;
  readonly reviewerId: string;
  readonly A: number;
  readonly B: number;
  readonly confidence: number;
  readonly forcedPreference: "A" | "B";
}): unknown {
  return {
    rubricVersion: HORROR_EDITORIAL_RUBRIC_VERSION,
    packetId: args.packet.packetId,
    reviewItemId: args.reviewItemId,
    reviewerId: args.reviewerId,
    candidateAssessments: {
      A: {
        ratings: dimensionRecord(args.A),
        evidenceNotes: dimensionRecord("Specific paragraph evidence for A."),
      },
      B: {
        ratings: dimensionRecord(args.B),
        evidenceNotes: dimensionRecord("Specific paragraph evidence for B."),
      },
    },
    confidence: args.confidence,
    forcedPreference: args.forcedPreference,
    preferenceEvidence: "The preferred version has the clearer causal payoff.",
  };
}

describe("horror editorial calibration", () => {
  it("validates the approved synthetic corpus and its required coverage", async () => {
    const corpus = horrorCalibrationCorpusSchema.parse(
      await loadJsonFixture("corpus.json")
    );

    expect(corpus.cases).toHaveLength(7);
    expect(
      new Set(
        corpus.cases.flatMap((entry) =>
          entry.expectedStructuralFindings
            .filter((finding) => finding.present)
            .map((finding) => finding.code)
        )
      )
    ).toEqual(new Set(horrorStructuralFindingCodes));
    expect(
      corpus.cases.every(
        (entry) =>
          entry.provenance.providerGenerated === false &&
          entry.provenance.productionEpisodeSource === false &&
          entry.provenance.permission.status === "approved" &&
          entry.sourcePackage.immutableFacts.length > 0 &&
          entry.candidates.baseline.endsWith(
            entry.sourcePackage.acceptedFinalLine
          ) &&
          entry.candidates.strategy.endsWith(
            entry.sourcePackage.acceptedFinalLine
          )
      )
    ).toBe(true);
    expect(
      corpus.cases.find(
        (entry) => entry.id === "horror-shaping-distorts-source"
      )?.expectedEligibility.eligible
    ).toBe(false);
  });

  it("rejects corpus entries that change the accepted final line", async () => {
    const corpus = horrorCalibrationCorpusSchema.parse(
      await loadJsonFixture("corpus.json")
    );
    const invalid = structuredClone(corpus);
    const first = invalid.cases[0];
    if (!first) {
      throw new Error("Expected at least one calibration case.");
    }
    first.candidates.strategy = `${first.candidates.strategy} Added aftermath.`;

    expect(horrorCalibrationCorpusSchema.safeParse(invalid).success).toBe(
      false
    );
  });

  it("anonymizes labels and reproduces seeded side and item randomization", async () => {
    const corpus = await loadJsonFixture("corpus.json");
    const first = prepareBlindHorrorEditorialReview({
      corpus,
      seed: "editorial-round-2026-07-24",
    });
    const repeated = prepareBlindHorrorEditorialReview({
      corpus,
      seed: "editorial-round-2026-07-24",
    });
    const differentSeed = prepareBlindHorrorEditorialReview({
      corpus,
      seed: "editorial-round-2026-07-25",
    });

    expect(repeated).toEqual(first);
    expect(differentSeed.reviewPacket).not.toEqual(first.reviewPacket);
    expect(
      first.answerKey.assignments.some((entry) => entry.A === "baseline")
    ).toBe(true);
    expect(
      first.answerKey.assignments.some((entry) => entry.A === "strategy")
    ).toBe(true);

    const exportedPacket = JSON.stringify(first.reviewPacket);
    expect(exportedPacket).not.toContain('"baseline"');
    expect(exportedPacket).not.toContain('"strategy"');
    for (const entry of horrorCalibrationCorpusSchema.parse(corpus).cases) {
      expect(exportedPacket).not.toContain(entry.id);
    }
    expect(
      first.reviewPacket.items.every(
        (item) =>
          Object.keys(item).sort().join(",") ===
          "candidates,reviewItemId,strata"
      )
    ).toBe(true);
  });

  it("rejects malformed, incomplete, and non-forced ratings", async () => {
    const prepared = prepareBlindHorrorEditorialReview({
      corpus: await loadJsonFixture("corpus.json"),
      seed: "rating-validation",
    });
    const item = prepared.reviewPacket.items[0];
    if (!item) {
      throw new Error("Expected at least one blind review item.");
    }
    const valid = rating({
      packet: prepared.reviewPacket,
      reviewItemId: item.reviewItemId,
      reviewerId: "reviewer-a",
      A: 4,
      B: 3,
      confidence: 4,
      forcedPreference: "A",
    });
    expect(horrorEditorialRatingSchema.safeParse(valid).success).toBe(true);

    const missingDimension = structuredClone(valid) as {
      candidateAssessments: {
        A: { ratings: Record<string, unknown> };
      };
    };
    delete missingDimension.candidateAssessments.A.ratings.payoff;
    expect(
      horrorEditorialRatingSchema.safeParse(missingDimension).success
    ).toBe(false);

    expect(
      horrorEditorialRatingSchema.safeParse({
        ...(valid as Record<string, unknown>),
        confidence: 6,
      }).success
    ).toBe(false);
    expect(
      horrorEditorialRatingSchema.safeParse({
        ...(valid as Record<string, unknown>),
        forcedPreference: "tie",
      }).success
    ).toBe(false);
  });

  it("aggregates ordinal ratings without imputing missing reviews", async () => {
    const prepared = prepareBlindHorrorEditorialReview({
      corpus: await loadJsonFixture("corpus.json"),
      seed: "aggregation-round",
    });
    const item = prepared.reviewPacket.items[0];
    if (!item) {
      throw new Error("Expected at least one blind review item.");
    }
    const ratings: readonly HorrorEditorialRating[] = [
      horrorEditorialRatingSchema.parse(
        rating({
          packet: prepared.reviewPacket,
          reviewItemId: item.reviewItemId,
          reviewerId: "reviewer-a",
          A: 5,
          B: 2,
          confidence: 4,
          forcedPreference: "A",
        })
      ),
      horrorEditorialRatingSchema.parse(
        rating({
          packet: prepared.reviewPacket,
          reviewItemId: item.reviewItemId,
          reviewerId: "reviewer-b",
          A: 3,
          B: 4,
          confidence: 2,
          forcedPreference: "B",
        })
      ),
    ];

    const aggregate = aggregateBlindHorrorEditorialRatings({
      reviewPacket: prepared.reviewPacket,
      ratings,
      expectedReviewerIds: ["reviewer-a", "reviewer-b", "reviewer-c"],
    });
    const itemAggregate = aggregate.find(
      (entry) => entry.reviewItemId === item.reviewItemId
    );

    expect(itemAggregate).toMatchObject({
      ratingCount: 2,
      missingReviewerIds: ["reviewer-c"],
      confidence: { mean: 3, median: 3 },
      preference: { A: 1, B: 1, winner: "tie" },
    });
    expect(itemAggregate?.candidateRatings.A.comprehension).toEqual({
      mean: 4,
      median: 4,
    });
    expect(itemAggregate?.candidateRatings.B.comprehension).toEqual({
      mean: 3,
      median: 3,
    });
    expect(
      aggregate.find((entry) => entry.ratingCount === 0)?.confidence
    ).toEqual({ mean: null, median: null });
  });

  it("matches the frozen pre-evaluation baseline manifest and hash", async () => {
    const corpus = await loadJsonFixture("corpus.json");
    const fixture = horrorCalibrationBaselineManifestSchema.parse(
      await loadJsonFixture("baseline-manifest.json")
    );

    expect(
      buildHorrorCalibrationBaselineManifest({
        corpus,
        recordedAt: fixture.recordedAt,
      })
    ).toEqual(fixture);
    expect(fixture.evaluationBoundary).toEqual({
      providerCalls: 0,
      estimatedProviderCostUsd: 0,
      modelAnalysisIncluded: false,
      deterministicProductionGateIncluded: false,
      productionPromptFingerprint:
        "not-applicable-manually-authored-offline-candidates",
      generatedAssetsModified: false,
    });
  });
});
