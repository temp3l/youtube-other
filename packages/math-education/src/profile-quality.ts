import {
  QUALITY_SCHEMA_VERSION,
  qualityAssessmentSchema,
  type ArtifactRef,
  type HardFailure,
  type QualityAssessment,
  type QualityStatus,
} from "@mediaforge/domain";

export const MATH_PROFILE_QUALITY_POLICY_VERSION =
  "math.profile-quality.v1" as const;

export const MATH_PROFILE_QUALITY_DIMENSIONS = [
  ["curriculum-alignment", 7],
  ["correctness", 12],
  ["prerequisite-fit", 5],
  ["objective-clarity", 5],
  ["explanation-clarity", 7],
  ["cognitive-load", 5],
  ["pacing", 4],
  ["worked-examples", 7],
  ["misconception-handling", 5],
  ["visual-semantic-accuracy", 8],
  ["exercises", 5],
  ["solutions", 7],
  ["age-language-fit", 4],
  ["accessibility", 6],
  ["retention", 3],
  ["transfer", 4],
  ["assessment-validity", 3],
  ["metadata-relevance", 3],
] as const;

export type MathProfileQualityDimension =
  (typeof MATH_PROFILE_QUALITY_DIMENSIONS)[number][0];

export interface MathHardFailureEvidence {
  readonly statementCorrect: boolean;
  readonly workedSolutionsValid: boolean;
  readonly symbolicResultsVerified: boolean;
  readonly curriculumAligned: boolean;
  readonly prerequisitesPresent: boolean;
  readonly visualSemanticsAccurate: boolean;
  readonly essentialInformationAccessible: boolean;
  readonly exercisesTeachableFromLesson: boolean;
  readonly answerKeyMatches: boolean;
  readonly learningClaimsSupported: boolean;
  readonly evidence: readonly string[];
}

const hardFailureRules = [
  [
    "statementCorrect",
    "MATH_STATEMENT_INCORRECT",
    "rewrite",
    "A mathematical statement is incorrect.",
  ],
  [
    "workedSolutionsValid",
    "MATH_WORKED_SOLUTION_INVALID",
    "rewrite",
    "A worked solution contains an invalid step or result.",
  ],
  [
    "symbolicResultsVerified",
    "MATH_SYMBOLIC_RESULT_UNVERIFIED",
    "blocked",
    "A claimed symbolic result lacks supported deterministic verification.",
  ],
  [
    "curriculumAligned",
    "MATH_CURRICULUM_MISMATCH",
    "blocked",
    "The lesson does not match its bound curriculum release.",
  ],
  [
    "prerequisitesPresent",
    "MATH_PREREQUISITE_MISSING",
    "blocked",
    "A required prerequisite is absent or unestablished.",
  ],
  [
    "visualSemanticsAccurate",
    "MATH_VISUAL_SEMANTICS_MISLEADING",
    "blocked",
    "A visual representation changes or obscures mathematical meaning.",
  ],
  [
    "essentialInformationAccessible",
    "MATH_ESSENTIAL_INFORMATION_INACCESSIBLE",
    "blocked",
    "Essential meaning relies only on color, sound, or transient animation.",
  ],
  [
    "exercisesTeachableFromLesson",
    "MATH_EXERCISE_UNTEACHABLE_FROM_LESSON",
    "rewrite",
    "An exercise cannot be solved from the taught lesson material.",
  ],
  [
    "answerKeyMatches",
    "MATH_ANSWER_KEY_MISMATCH",
    "rewrite",
    "An answer key conflicts with deterministic solution evidence.",
  ],
  [
    "learningClaimsSupported",
    "MATH_LEARNING_CLAIM_UNSUPPORTED",
    "revision",
    "A learning or assessment claim lacks evidence.",
  ],
] as const satisfies readonly (readonly [
  Exclude<keyof MathHardFailureEvidence, "evidence">,
  HardFailure["code"],
  HardFailure["action"],
  string,
])[];

export function mathHardFailures(
  input: MathHardFailureEvidence
): readonly HardFailure[] {
  const evidence = input.evidence.length
    ? [...input.evidence]
    : ["No passing evidence supplied."];
  return hardFailureRules
    .filter(([key]) => !input[key])
    .map(([, code, action, message]) => ({
      code,
      action,
      message,
      overridable: false,
      evidence,
    }));
}

function statusFor(
  weightedScore: number,
  requiredScores: readonly number[],
  hardFailures: readonly HardFailure[],
  boundedEdits: readonly string[]
): QualityStatus {
  if (hardFailures.some((failure) => failure.action === "blocked")) {
    return "BLOCKED";
  }
  if (hardFailures.some((failure) => failure.action === "rewrite")) {
    return "REWRITE_REQUIRED";
  }
  if (hardFailures.length > 0) return "REVISION_REQUIRED";
  if (
    weightedScore >= 85 &&
    requiredScores.every((score) => score >= 70) &&
    boundedEdits.length === 0
  ) {
    return "READY";
  }
  if (weightedScore >= 75 && boundedEdits.length > 0) {
    return "READY_WITH_MINOR_EDITS";
  }
  return weightedScore < 55 ? "REWRITE_REQUIRED" : "REVISION_REQUIRED";
}

export function buildMathProfileQualityAssessment(input: {
  readonly artifact: ArtifactRef;
  readonly scores: Readonly<Record<MathProfileQualityDimension, number>>;
  readonly evidence: MathHardFailureEvidence;
  readonly boundedEdits?: readonly string[];
  readonly warnings?: readonly string[];
  readonly assessedAt?: string;
}): QualityAssessment {
  const required = new Set<MathProfileQualityDimension>([
    "curriculum-alignment",
    "correctness",
    "prerequisite-fit",
    "visual-semantic-accuracy",
    "solutions",
    "accessibility",
    "assessment-validity",
  ]);
  const dimensions = MATH_PROFILE_QUALITY_DIMENSIONS.map(([name, weight]) => ({
    dimension: `math.${name}` as const,
    score: input.scores[name],
    weight,
    required: required.has(name),
    evidence: input.evidence.evidence.length
      ? [...input.evidence.evidence]
      : [`${name} scored deterministically.`],
  }));
  const weightedScore = dimensions.reduce(
    (total, dimension) => total + (dimension.score * dimension.weight) / 100,
    0
  );
  const failures = mathHardFailures(input.evidence);
  const boundedEdits = [...(input.boundedEdits ?? [])];
  return qualityAssessmentSchema.parse({
    schemaVersion: QUALITY_SCHEMA_VERSION,
    profileId: "mathematics-education",
    artifact: input.artifact,
    status: statusFor(
      weightedScore,
      dimensions
        .filter((dimension) => dimension.required)
        .map((dimension) => dimension.score),
      failures,
      boundedEdits
    ),
    dimensions,
    weightedScore,
    hardFailures: failures,
    boundedEdits,
    warnings: [...(input.warnings ?? [])],
    assessedAt: input.assessedAt ?? new Date().toISOString(),
  });
}

export interface MathProductionGateEvidence {
  readonly mathematicalVerificationPassed: boolean;
  readonly pedagogyPassed: boolean;
  readonly visualSemanticsPassed: boolean;
  readonly accessibilityPassed: boolean;
  readonly narrationTimingPassed: boolean;
  readonly captionsPassed: boolean;
  readonly audiovisualPassed: boolean;
  readonly metadataPassed: boolean;
  readonly publishDryRunPassed: boolean;
  readonly publishApprovalCurrent: boolean;
}

export function evaluateMathProductionGates(
  evidence: MathProductionGateEvidence
): {
  readonly renderReady: boolean;
  readonly publishDryRunReady: boolean;
  readonly publishReady: boolean;
  readonly reasons: readonly string[];
} {
  const checks = [
    [
      "mathematicalVerificationPassed",
      "Mathematical verification has not passed.",
    ],
    ["pedagogyPassed", "Pedagogical review has not passed."],
    ["visualSemanticsPassed", "Visual-semantic validation has not passed."],
    ["accessibilityPassed", "Accessibility validation has not passed."],
    ["narrationTimingPassed", "Narration timing has not passed."],
    ["captionsPassed", "Caption validation has not passed."],
    ["audiovisualPassed", "Audiovisual validation has not passed."],
    ["metadataPassed", "Metadata validation has not passed."],
    ["publishDryRunPassed", "Publish dry-run evidence has not passed."],
    [
      "publishApprovalCurrent",
      "The exact publish approval is missing or stale.",
    ],
  ] as const satisfies readonly (readonly [
    keyof MathProductionGateEvidence,
    string,
  ])[];
  const reasons = checks
    .filter(([key]) => !evidence[key])
    .map(([, reason]) => reason);
  const renderReady = checks.slice(0, 6).every(([key]) => evidence[key]);
  const publishDryRunReady =
    renderReady && evidence.audiovisualPassed && evidence.metadataPassed;
  const publishReady =
    publishDryRunReady &&
    evidence.publishDryRunPassed &&
    evidence.publishApprovalCurrent;
  return { renderReady, publishDryRunReady, publishReady, reasons };
}
