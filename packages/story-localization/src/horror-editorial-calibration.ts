import { hashText } from "@mediaforge/shared";
import { z } from "zod";
import { stableSerialize } from "./stable-json.js";

export const HORROR_CALIBRATION_CORPUS_SCHEMA_VERSION =
  "horror-calibration-corpus-v1";
export const HORROR_EDITORIAL_RUBRIC_VERSION = "horror-editorial-rubric-v1";
export const HORROR_BLIND_REVIEW_PACKET_SCHEMA_VERSION =
  "horror-blind-review-packet-v1";
export const HORROR_CALIBRATION_BASELINE_SCHEMA_VERSION =
  "horror-calibration-baseline-v1";

export const horrorStructuralFindingCodes = [
  "no-central-uncertainty",
  "arbitrary-twist",
  "passive-protagonist",
  "repetitive-maximum-intensity",
  "rule-without-setup-payoff",
  "strong-question-response-cost-payoff",
  "horror-shaping-distorts-source",
] as const;
export const horrorStructuralFindingCodeSchema = z.enum(
  horrorStructuralFindingCodes
);
export type HorrorStructuralFindingCode = z.infer<
  typeof horrorStructuralFindingCodeSchema
>;

export const horrorEditorialDimensions = [
  "comprehension",
  "suspense",
  "curiosity",
  "earnedSurprise",
  "presence",
  "emotionalCost",
  "payoff",
] as const;
export type HorrorEditorialDimension =
  (typeof horrorEditorialDimensions)[number];

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/u);
const nonEmptyTextSchema = z.string().trim().min(1);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const horrorCalibrationPolicyMetadataSchema = z
  .object({
    storyPolicyId: identifierSchema,
    fictionality: z.enum(["fiction", "evidence-led"]),
    genre: z.enum([
      "fictional-supernatural",
      "fictional-psychological",
      "folklore",
      "evidence-led",
    ]),
    evidencePolicy: z.enum([
      "fictional-source-bounded",
      "folklore-source-bounded",
      "strict-evidence-only",
    ]),
    intensityPolicy: z.enum(["restrained", "moderate"]),
  })
  .strict();

export const horrorCalibrationProvenanceSchema = z
  .object({
    kind: z.literal("synthetic-editorial-fixture"),
    authoringMethod: z.literal("manually-authored"),
    providerGenerated: z.literal(false),
    productionEpisodeSource: z.literal(false),
    sourceNote: nonEmptyTextSchema.max(500),
    permission: z
      .object({
        status: z.literal("approved"),
        approvedBy: z.literal("repository-owner-via-task-03"),
        permittedUses: z
          .array(
            z.enum([
              "offline-editorial-calibration",
              "automated-schema-tests",
              "documentation-examples",
            ])
          )
          .min(2),
        productionUse: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const horrorCalibrationStructuralFindingSchema = z
  .object({
    code: horrorStructuralFindingCodeSchema,
    present: z.boolean(),
    evidence: nonEmptyTextSchema.max(500),
  })
  .strict();

export const horrorEditorialStrataSchema = z
  .object({
    format: z.enum(["full", "short"]),
    locale: z.string().trim().min(2).max(40),
    durationBand: z.enum(["under-60s", "60-180s", "over-180s"]),
    targetDurationSeconds: z.number().int().positive().max(3_600),
    policy: horrorCalibrationPolicyMetadataSchema,
  })
  .strict();
export type HorrorEditorialStrata = z.infer<
  typeof horrorEditorialStrataSchema
>;

export const horrorCalibrationCorpusCaseSchema = z
  .object({
    id: identifierSchema,
    title: nonEmptyTextSchema.max(160),
    provenance: horrorCalibrationProvenanceSchema,
    sourcePackage: z
      .object({
        sourceText: nonEmptyTextSchema,
        immutableFacts: z.array(nonEmptyTextSchema.max(400)).min(1),
        acceptedFinalLine: nonEmptyTextSchema.max(400),
      })
      .strict(),
    strata: horrorEditorialStrataSchema,
    expectedEligibility: z
      .object({
        eligible: z.boolean(),
        reason: nonEmptyTextSchema.max(500),
      })
      .strict(),
    expectedStructuralFindings: z
      .array(horrorCalibrationStructuralFindingSchema)
      .min(1),
    candidates: z
      .object({
        baseline: nonEmptyTextSchema,
        strategy: nonEmptyTextSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const finalLine = value.sourcePackage.acceptedFinalLine.trim();
    const texts = [
      ["sourcePackage.sourceText", value.sourcePackage.sourceText],
      ["candidates.baseline", value.candidates.baseline],
      ["candidates.strategy", value.candidates.strategy],
    ] as const;
    for (const [path, text] of texts) {
      if (!text.trim().endsWith(finalLine)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: path.split("."),
          message: "Calibration text must preserve the accepted final line.",
        });
      }
    }
    const codes = value.expectedStructuralFindings.map(
      (finding) => finding.code
    );
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedStructuralFindings"],
        message: "Expected structural finding codes must be unique per case.",
      });
    }
  });
export type HorrorCalibrationCorpusCase = z.infer<
  typeof horrorCalibrationCorpusCaseSchema
>;

export const horrorCalibrationCorpusSchema = z
  .object({
    schemaVersion: z.literal(HORROR_CALIBRATION_CORPUS_SCHEMA_VERSION),
    corpusVersion: identifierSchema,
    approvalScope: z.literal(
      "synthetic-fixtures-only-no-production-episode-permission"
    ),
    cases: z.array(horrorCalibrationCorpusCaseSchema).min(7),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.cases.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cases"],
        message: "Calibration case IDs must be unique.",
      });
    }
    const coveredCodes = new Set(
      value.cases.flatMap((entry) =>
        entry.expectedStructuralFindings
          .filter((finding) => finding.present)
          .map((finding) => finding.code)
      )
    );
    for (const code of horrorStructuralFindingCodes) {
      if (!coveredCodes.has(code)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cases"],
          message: `Calibration corpus must include finding "${code}".`,
        });
      }
    }
  });
export type HorrorCalibrationCorpus = z.infer<
  typeof horrorCalibrationCorpusSchema
>;

const blindCandidateSchema = z
  .object({
    label: z.enum(["A", "B"]),
    text: nonEmptyTextSchema,
  })
  .strict();

export const horrorBlindReviewItemSchema = z
  .object({
    reviewItemId: z.string().regex(/^review-[a-f0-9]{16}$/u),
    strata: horrorEditorialStrataSchema,
    candidates: z.tuple([blindCandidateSchema, blindCandidateSchema]),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.candidates[0].label !== "A" ||
      value.candidates[1].label !== "B"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates"],
        message: "Blind candidates must be presented in A/B order.",
      });
    }
  });
export type HorrorBlindReviewItem = z.infer<typeof horrorBlindReviewItemSchema>;

export const horrorBlindReviewPacketSchema = z
  .object({
    schemaVersion: z.literal(HORROR_BLIND_REVIEW_PACKET_SCHEMA_VERSION),
    rubricVersion: z.literal(HORROR_EDITORIAL_RUBRIC_VERSION),
    corpusVersion: identifierSchema,
    packetId: z.string().regex(/^packet-[a-f0-9]{16}$/u),
    items: z.array(horrorBlindReviewItemSchema).min(1),
    packetHash: sha256Schema,
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.items.map((item) => item.reviewItemId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Blind review item IDs must be unique.",
      });
    }
    const { packetHash: _packetHash, ...hashInput } = value;
    if (hashText(stableSerialize(hashInput)) !== value.packetHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packetHash"],
        message: "Blind review packet hash does not match its contents.",
      });
    }
  });
export type HorrorBlindReviewPacket = z.infer<
  typeof horrorBlindReviewPacketSchema
>;

export const horrorBlindReviewAnswerKeySchema = z
  .object({
    packetId: z.string().regex(/^packet-[a-f0-9]{16}$/u),
    seed: z.string().trim().min(1).max(200),
    assignments: z.array(
      z
        .object({
          reviewItemId: z.string().regex(/^review-[a-f0-9]{16}$/u),
          corpusCaseId: identifierSchema,
          A: z.enum(["baseline", "strategy"]),
          B: z.enum(["baseline", "strategy"]),
        })
        .strict()
    ),
  })
  .strict();
export type HorrorBlindReviewAnswerKey = z.infer<
  typeof horrorBlindReviewAnswerKeySchema
>;

function seededDigest(seed: string, purpose: string, id: string): string {
  return hashText(
    stableSerialize({
      seed,
      purpose,
      id,
      version: HORROR_BLIND_REVIEW_PACKET_SCHEMA_VERSION,
    })
  );
}

const horrorBlindEditorialCandidateCaseSchema = z
  .object({
    id: identifierSchema,
    strata: horrorEditorialStrataSchema,
    candidates: z
      .object({
        baseline: nonEmptyTextSchema,
        strategy: nonEmptyTextSchema,
      })
      .strict(),
  })
  .strict();
export type HorrorBlindEditorialCandidateCase = z.infer<
  typeof horrorBlindEditorialCandidateCaseSchema
>;

export function prepareBlindHorrorEditorialCandidates(input: {
  readonly corpusVersion: string;
  readonly corpusHash: string;
  readonly cases: readonly HorrorBlindEditorialCandidateCase[];
  readonly seed: string;
}): {
  readonly reviewPacket: HorrorBlindReviewPacket;
  readonly answerKey: HorrorBlindReviewAnswerKey;
} {
  const corpusVersion = identifierSchema.parse(input.corpusVersion);
  const corpusHash = sha256Schema.parse(input.corpusHash);
  const cases = z
    .array(horrorBlindEditorialCandidateCaseSchema)
    .min(1)
    .superRefine((entries, context) => {
      const ids = entries.map((entry) => entry.id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Blind editorial candidate case IDs must be unique.",
        });
      }
    })
    .parse(input.cases);
  const seed = z.string().trim().min(1).max(200).parse(input.seed);
  const assignments = cases
    .map((entry) => {
      const reviewItemId = `review-${seededDigest(seed, "item", entry.id).slice(
        0,
        16
      )}`;
      const strategyFirst =
        Number.parseInt(seededDigest(seed, "side", entry.id).slice(0, 2), 16) %
          2 ===
        0;
      return {
        reviewItemId,
        corpusCaseId: entry.id,
        orderKey: seededDigest(seed, "order", entry.id),
        A: strategyFirst ? ("strategy" as const) : ("baseline" as const),
        B: strategyFirst ? ("baseline" as const) : ("strategy" as const),
        entry,
      };
    })
    .sort(
      (left, right) =>
        left.orderKey.localeCompare(right.orderKey) ||
        left.reviewItemId.localeCompare(right.reviewItemId)
    );
  const packetId = `packet-${hashText(
    stableSerialize({
      corpusHash,
      rubricVersion: HORROR_EDITORIAL_RUBRIC_VERSION,
      seed,
    })
  ).slice(0, 16)}`;
  const packetWithoutHash = {
    schemaVersion: HORROR_BLIND_REVIEW_PACKET_SCHEMA_VERSION,
    rubricVersion: HORROR_EDITORIAL_RUBRIC_VERSION,
    corpusVersion,
    packetId,
    items: assignments.map((assignment) => ({
      reviewItemId: assignment.reviewItemId,
      strata: assignment.entry.strata,
      candidates: [
        {
          label: "A" as const,
          text: assignment.entry.candidates[assignment.A],
        },
        {
          label: "B" as const,
          text: assignment.entry.candidates[assignment.B],
        },
      ] as const,
    })),
  };
  const reviewPacket = horrorBlindReviewPacketSchema.parse({
    ...packetWithoutHash,
    packetHash: hashText(stableSerialize(packetWithoutHash)),
  });
  const answerKey = horrorBlindReviewAnswerKeySchema.parse({
    packetId,
    seed,
    assignments: assignments.map((assignment) => ({
      reviewItemId: assignment.reviewItemId,
      corpusCaseId: assignment.corpusCaseId,
      A: assignment.A,
      B: assignment.B,
    })),
  });
  return { reviewPacket, answerKey };
}

export function prepareBlindHorrorEditorialReview(input: {
  readonly corpus: unknown;
  readonly seed: string;
}): {
  readonly reviewPacket: HorrorBlindReviewPacket;
  readonly answerKey: HorrorBlindReviewAnswerKey;
} {
  const corpus = horrorCalibrationCorpusSchema.parse(input.corpus);
  return prepareBlindHorrorEditorialCandidates({
    corpusVersion: corpus.corpusVersion,
    corpusHash: hashText(stableSerialize(corpus)),
    cases: corpus.cases.map((entry) => ({
      id: entry.id,
      strata: entry.strata,
      candidates: entry.candidates,
    })),
    seed: input.seed,
  });
}

const ordinalRatingSchema = z.number().int().min(1).max(5);
const dimensionRatingsSchema = z
  .object({
    comprehension: ordinalRatingSchema,
    suspense: ordinalRatingSchema,
    curiosity: ordinalRatingSchema,
    earnedSurprise: ordinalRatingSchema,
    presence: ordinalRatingSchema,
    emotionalCost: ordinalRatingSchema,
    payoff: ordinalRatingSchema,
  })
  .strict();
const dimensionEvidenceSchema = z
  .object({
    comprehension: nonEmptyTextSchema.max(600),
    suspense: nonEmptyTextSchema.max(600),
    curiosity: nonEmptyTextSchema.max(600),
    earnedSurprise: nonEmptyTextSchema.max(600),
    presence: nonEmptyTextSchema.max(600),
    emotionalCost: nonEmptyTextSchema.max(600),
    payoff: nonEmptyTextSchema.max(600),
  })
  .strict();
const candidateEditorialAssessmentSchema = z
  .object({
    ratings: dimensionRatingsSchema,
    evidenceNotes: dimensionEvidenceSchema,
  })
  .strict();

export const horrorEditorialRatingSchema = z
  .object({
    rubricVersion: z.literal(HORROR_EDITORIAL_RUBRIC_VERSION),
    packetId: z.string().regex(/^packet-[a-f0-9]{16}$/u),
    reviewItemId: z.string().regex(/^review-[a-f0-9]{16}$/u),
    reviewerId: identifierSchema,
    candidateAssessments: z
      .object({
        A: candidateEditorialAssessmentSchema,
        B: candidateEditorialAssessmentSchema,
      })
      .strict(),
    confidence: ordinalRatingSchema,
    forcedPreference: z.enum(["A", "B"]),
    preferenceEvidence: nonEmptyTextSchema.max(1_000),
  })
  .strict();
export type HorrorEditorialRating = z.infer<typeof horrorEditorialRatingSchema>;

interface OrdinalSummary {
  readonly mean: number | null;
  readonly median: number | null;
}

export interface HorrorEditorialItemAggregate {
  readonly reviewItemId: string;
  readonly strata: HorrorBlindReviewItem["strata"];
  readonly ratingCount: number;
  readonly missingReviewerIds: readonly string[];
  readonly candidateRatings: Readonly<
    Record<
      "A" | "B",
      Readonly<Record<HorrorEditorialDimension, OrdinalSummary>>
    >
  >;
  readonly confidence: OrdinalSummary;
  readonly preference: {
    readonly A: number;
    readonly B: number;
    readonly winner: "A" | "B" | "tie";
  };
}

function summarizeOrdinal(values: readonly number[]): OrdinalSummary {
  if (values.length === 0) {
    return { mean: null, median: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return {
    mean:
      Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 100
      ) / 100,
    median,
  };
}

export function aggregateBlindHorrorEditorialRatings(input: {
  readonly reviewPacket: unknown;
  readonly ratings: readonly unknown[];
  readonly expectedReviewerIds?: readonly string[];
}): readonly HorrorEditorialItemAggregate[] {
  const reviewPacket = horrorBlindReviewPacketSchema.parse(input.reviewPacket);
  const ratings = input.ratings.map((rating) =>
    horrorEditorialRatingSchema.parse(rating)
  );
  const expectedReviewerIds = z
    .array(identifierSchema)
    .parse(input.expectedReviewerIds ?? []);
  if (new Set(expectedReviewerIds).size !== expectedReviewerIds.length) {
    throw new Error("Expected reviewer IDs must be unique.");
  }
  const knownItemIds = new Set(
    reviewPacket.items.map((item) => item.reviewItemId)
  );
  const ratingKeys = new Set<string>();
  for (const rating of ratings) {
    if (rating.packetId !== reviewPacket.packetId) {
      throw new Error(
        `Rating packet "${rating.packetId}" does not match the review packet.`
      );
    }
    if (!knownItemIds.has(rating.reviewItemId)) {
      throw new Error(
        `Unknown review item "${rating.reviewItemId}" in editorial rating.`
      );
    }
    const key = `${rating.reviewItemId}\u0000${rating.reviewerId}`;
    if (ratingKeys.has(key)) {
      throw new Error(
        `Duplicate rating for "${rating.reviewItemId}" by "${rating.reviewerId}".`
      );
    }
    ratingKeys.add(key);
  }

  return reviewPacket.items.map((item) => {
    const itemRatings = ratings.filter(
      (rating) => rating.reviewItemId === item.reviewItemId
    );
    const candidateRatings = Object.fromEntries(
      (["A", "B"] as const).map((candidate) => [
        candidate,
        Object.fromEntries(
          horrorEditorialDimensions.map((dimension) => [
            dimension,
            summarizeOrdinal(
              itemRatings.map(
                (rating) =>
                  rating.candidateAssessments[candidate].ratings[dimension]
              )
            ),
          ])
        ),
      ])
    ) as HorrorEditorialItemAggregate["candidateRatings"];
    const preferenceA = itemRatings.filter(
      (rating) => rating.forcedPreference === "A"
    ).length;
    const preferenceB = itemRatings.length - preferenceA;
    return {
      reviewItemId: item.reviewItemId,
      strata: item.strata,
      ratingCount: itemRatings.length,
      missingReviewerIds: expectedReviewerIds.filter(
        (reviewerId) =>
          !itemRatings.some((rating) => rating.reviewerId === reviewerId)
      ),
      candidateRatings,
      confidence: summarizeOrdinal(
        itemRatings.map((rating) => rating.confidence)
      ),
      preference: {
        A: preferenceA,
        B: preferenceB,
        winner:
          preferenceA === preferenceB
            ? "tie"
            : preferenceA > preferenceB
              ? "A"
              : "B",
      },
    };
  });
}

export const horrorCalibrationBaselineManifestSchema = z
  .object({
    schemaVersion: z.literal(HORROR_CALIBRATION_BASELINE_SCHEMA_VERSION),
    corpusVersion: identifierSchema,
    rubricVersion: z.literal(HORROR_EDITORIAL_RUBRIC_VERSION),
    recordedAt: z.string().datetime({ offset: true }),
    corpusHash: sha256Schema,
    cases: z.array(
      z
        .object({
          caseId: identifierSchema,
          sourceHash: sha256Schema,
          baselineCandidateHash: sha256Schema,
          strategyCandidateHash: sha256Schema,
          baselineWordCount: z.number().int().nonnegative(),
          strategyWordCount: z.number().int().nonnegative(),
          expectedEligibility: z.boolean(),
          expectedStructuralFindings: z.array(
            horrorStructuralFindingCodeSchema
          ),
          strata: horrorBlindReviewItemSchema.shape.strata,
        })
        .strict()
    ),
    evaluationBoundary: z
      .object({
        providerCalls: z.literal(0),
        estimatedProviderCostUsd: z.literal(0),
        modelAnalysisIncluded: z.literal(false),
        deterministicProductionGateIncluded: z.literal(false),
        productionPromptFingerprint: z.literal(
          "not-applicable-manually-authored-offline-candidates"
        ),
        generatedAssetsModified: z.literal(false),
      })
      .strict(),
    manifestHash: sha256Schema,
  })
  .strict()
  .superRefine((value, context) => {
    const { manifestHash: _manifestHash, ...hashInput } = value;
    if (hashText(stableSerialize(hashInput)) !== value.manifestHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manifestHash"],
        message:
          "Calibration baseline manifest hash does not match its contents.",
      });
    }
  });
export type HorrorCalibrationBaselineManifest = z.infer<
  typeof horrorCalibrationBaselineManifestSchema
>;

function countCalibrationWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function buildHorrorCalibrationBaselineManifest(input: {
  readonly corpus: unknown;
  readonly recordedAt: string;
}): HorrorCalibrationBaselineManifest {
  const corpus = horrorCalibrationCorpusSchema.parse(input.corpus);
  const manifestWithoutHash = {
    schemaVersion: HORROR_CALIBRATION_BASELINE_SCHEMA_VERSION,
    corpusVersion: corpus.corpusVersion,
    rubricVersion: HORROR_EDITORIAL_RUBRIC_VERSION,
    recordedAt: z.string().datetime({ offset: true }).parse(input.recordedAt),
    corpusHash: hashText(stableSerialize(corpus)),
    cases: corpus.cases.map((entry) => ({
      caseId: entry.id,
      sourceHash: hashText(entry.sourcePackage.sourceText),
      baselineCandidateHash: hashText(entry.candidates.baseline),
      strategyCandidateHash: hashText(entry.candidates.strategy),
      baselineWordCount: countCalibrationWords(entry.candidates.baseline),
      strategyWordCount: countCalibrationWords(entry.candidates.strategy),
      expectedEligibility: entry.expectedEligibility.eligible,
      expectedStructuralFindings: entry.expectedStructuralFindings
        .filter((finding) => finding.present)
        .map((finding) => finding.code),
      strata: entry.strata,
    })),
    evaluationBoundary: {
      providerCalls: 0 as const,
      estimatedProviderCostUsd: 0 as const,
      modelAnalysisIncluded: false as const,
      deterministicProductionGateIncluded: false as const,
      productionPromptFingerprint:
        "not-applicable-manually-authored-offline-candidates" as const,
      generatedAssetsModified: false as const,
    },
  };
  return horrorCalibrationBaselineManifestSchema.parse({
    ...manifestWithoutHash,
    manifestHash: hashText(stableSerialize(manifestWithoutHash)),
  });
}
