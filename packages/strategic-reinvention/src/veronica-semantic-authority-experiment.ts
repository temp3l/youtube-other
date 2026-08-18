import { z } from "zod";
import {
  VERONICA_SEMANTIC_ACTION_OWNER_TYPES,
  VERONICA_SEMANTIC_INTENTS,
  veronicaSemanticBeatPlanSchema,
  type VeronicaSemanticResolution,
} from "./veronica-model-semantic-authority.js";

export const VERONICA_SEMANTIC_DIAGNOSTIC_CASE_VERSION =
  "veronica-semantic-diagnostic-case.v1" as const;
export const VERONICA_SEMANTIC_EXPERIMENT_RESULTS_VERSION =
  "veronica-semantic-experiment-results.v1" as const;

const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/u);

export const veronicaSemanticDiagnosticCaseSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_SEMANTIC_DIAGNOSTIC_CASE_VERSION),
    caseId: identifier,
    category: z.enum([
      "retained-value",
      "input-output-flow",
      "causal-mechanism",
      "ownership-transfer",
      "actor-sensitive",
      "environment-sensitive",
      "known-good",
      "accepted-human-control",
      "abstention-control",
      "no-safe-candidate",
      "cache-replay",
    ]),
    source: z.string().trim().min(1).max(2_000),
    contextBefore: z.string().trim().max(1_000),
    contextAfter: z.string().trim().max(1_000),
    allowedOwnerTypes: z
      .array(z.enum(VERONICA_SEMANTIC_ACTION_OWNER_TYPES))
      .min(1)
      .refine((values) => new Set(values).size === values.length),
    existingDeterministicResult: z
      .object({
        status: z.enum(["PASS", "BLOCK", "REVIEW", "NO_SAFE_VISUAL_CANDIDATE"]),
        semanticIntent: z.enum(VERONICA_SEMANTIC_INTENTS).nullable(),
        actionOwnerType: z.enum(VERONICA_SEMANTIC_ACTION_OWNER_TYPES).nullable(),
        candidateFamilies: z.array(z.string().min(1)).max(12),
        classification: z.string().min(1),
      })
      .strict(),
    gold: z
      .object({
        basis: z.enum([
          "existing-unit-test",
          "accepted-human-authority",
          "m3-no-safe-census",
          "literal-source-contract",
        ]),
        expectedIntents: z.array(z.enum(VERONICA_SEMANTIC_INTENTS)).min(1),
        expectedOwnerTypes: z
          .array(z.enum(VERONICA_SEMANTIC_ACTION_OWNER_TYPES))
          .min(1),
        expectedOutcome: z.enum(["PASS", "ABSTAIN"]),
        knownGood: z.boolean(),
        blockedCase: z.boolean(),
        acceptedHumanPlan: veronicaSemanticBeatPlanSchema.nullable(),
      })
      .strict(),
  })
  .strict();

export type VeronicaSemanticDiagnosticCase = z.infer<
  typeof veronicaSemanticDiagnosticCaseSchema
>;

export const veronicaSemanticDiagnosticCorpusSchema = z
  .object({
    schemaVersion: z.literal("veronica-semantic-diagnostic-corpus.v1"),
    cases: z
      .array(veronicaSemanticDiagnosticCaseSchema)
      .min(1)
      .max(20)
      .refine(
        (cases) => new Set(cases.map((entry) => entry.caseId)).size === cases.length,
        "Diagnostic case IDs must be unique.",
      ),
  })
  .strict();

export type VeronicaSemanticDiagnosticCorpus = z.infer<
  typeof veronicaSemanticDiagnosticCorpusSchema
>;

export interface VeronicaSemanticExperimentCaseResult {
  readonly caseId: string;
  readonly category: VeronicaSemanticDiagnosticCase["category"];
  readonly source: string;
  readonly contextualWindow: {
    readonly before: string;
    readonly after: string;
  };
  readonly existingDeterministicResult: VeronicaSemanticDiagnosticCase["existingDeterministicResult"];
  readonly gold: Omit<VeronicaSemanticDiagnosticCase["gold"], "acceptedHumanPlan"> & {
    readonly acceptedHumanControl: boolean;
  };
  readonly semanticFingerprint: string | null;
  readonly cacheState: VeronicaSemanticResolution["cacheState"];
  readonly authoritySource: VeronicaSemanticResolution["authoritySource"];
  readonly modelResult: VeronicaSemanticResolution["plan"];
  readonly deterministicValidation: VeronicaSemanticResolution["validation"];
  readonly providerAttempts: number;
  readonly intentAgreement: boolean;
  readonly actorOwnerCorrect: boolean;
  readonly abstentionCorrect: boolean;
  readonly finalExperimentalClassification:
    | "AGREEMENT"
    | "SAFE_ABSTENTION"
    | "DISAGREEMENT"
    | "REJECTED";
  readonly disagreementReason: string | null;
}

export function evaluateVeronicaSemanticExperimentCase(input: {
  readonly diagnosticCase: VeronicaSemanticDiagnosticCase;
  readonly resolution: VeronicaSemanticResolution;
}): VeronicaSemanticExperimentCaseResult {
  const diagnosticCase = veronicaSemanticDiagnosticCaseSchema.parse(
    input.diagnosticCase,
  );
  const { resolution } = input;
  const intentAgreement = resolution.plan
    ? diagnosticCase.gold.expectedIntents.includes(
        resolution.plan.semanticIntent,
      )
    : false;
  const actorOwnerCorrect = resolution.plan
    ? diagnosticCase.gold.expectedOwnerTypes.includes(
        resolution.plan.actionOwner.type,
      )
    : false;
  const abstentionCorrect =
    (diagnosticCase.gold.expectedOutcome === "ABSTAIN") ===
    (resolution.validation.outcome === "ABSTAIN");
  const validationMatches =
    resolution.validation.outcome === diagnosticCase.gold.expectedOutcome;
  const agreement =
    validationMatches && intentAgreement && actorOwnerCorrect && abstentionCorrect;
  const finalExperimentalClassification =
    resolution.validation.outcome === "REJECT"
      ? "REJECTED"
      : agreement && resolution.validation.outcome === "ABSTAIN"
        ? "SAFE_ABSTENTION"
        : agreement
          ? "AGREEMENT"
          : "DISAGREEMENT";
  const disagreement = [
    ...(validationMatches
      ? []
      : [
          `expected outcome ${diagnosticCase.gold.expectedOutcome}, received ${resolution.validation.outcome}`,
        ]),
    ...(intentAgreement
      ? []
      : [
          `expected intent ${diagnosticCase.gold.expectedIntents.join("|")}, received ${resolution.plan?.semanticIntent ?? "none"}`,
        ]),
    ...(actorOwnerCorrect
      ? []
      : [
          `expected owner ${diagnosticCase.gold.expectedOwnerTypes.join("|")}, received ${resolution.plan?.actionOwner.type ?? "none"}`,
        ]),
    ...resolution.validation.reasons,
  ];
  return {
    caseId: diagnosticCase.caseId,
    category: diagnosticCase.category,
    source: diagnosticCase.source,
    contextualWindow: {
      before: diagnosticCase.contextBefore,
      after: diagnosticCase.contextAfter,
    },
    existingDeterministicResult: diagnosticCase.existingDeterministicResult,
    gold: {
      basis: diagnosticCase.gold.basis,
      expectedIntents: diagnosticCase.gold.expectedIntents,
      expectedOwnerTypes: diagnosticCase.gold.expectedOwnerTypes,
      expectedOutcome: diagnosticCase.gold.expectedOutcome,
      knownGood: diagnosticCase.gold.knownGood,
      blockedCase: diagnosticCase.gold.blockedCase,
      acceptedHumanControl: diagnosticCase.gold.acceptedHumanPlan !== null,
    },
    semanticFingerprint: resolution.semanticFingerprint,
    cacheState: resolution.cacheState,
    authoritySource: resolution.authoritySource,
    modelResult: resolution.plan,
    deterministicValidation: resolution.validation,
    providerAttempts: resolution.attempts,
    intentAgreement,
    actorOwnerCorrect,
    abstentionCorrect,
    finalExperimentalClassification,
    disagreementReason:
      finalExperimentalClassification === "AGREEMENT" ||
      finalExperimentalClassification === "SAFE_ABSTENTION"
        ? null
        : [...new Set(disagreement)].join("; "),
  };
}

export interface VeronicaSemanticExperimentMetrics {
  readonly selectedCases: number;
  readonly schemaFailures: number;
  readonly semanticFailures: number;
  readonly abstentions: number;
  readonly abstentionCorrect: number;
  readonly blockedCases: number;
  readonly blockedCasesImproved: number;
  readonly knownGoodCases: number;
  readonly knownGoodRegressions: number;
  readonly acceptedHumanControls: number;
  readonly acceptedHumanPreserved: number;
  readonly deterministicHardGateViolations: number;
  readonly criticalUnsupportedInventionsAccepted: number;
  readonly cacheReplayCases: number;
  readonly cacheReplayCorrect: number;
  readonly sourceGroundedCases: number;
  readonly semanticIntentAgreement: number;
  readonly actorOwnerCorrect: number;
  readonly unsupportedActionStrategies: number;
}

export function summarizeVeronicaSemanticExperiment(
  results: readonly VeronicaSemanticExperimentCaseResult[],
): VeronicaSemanticExperimentMetrics {
  const accepted = (result: VeronicaSemanticExperimentCaseResult): boolean =>
    result.finalExperimentalClassification === "AGREEMENT" ||
    result.finalExperimentalClassification === "SAFE_ABSTENTION";
  return {
    selectedCases: results.length,
    schemaFailures: results.filter((result) =>
      result.deterministicValidation.reasons.includes("SCHEMA_NONCOMPLIANCE"),
    ).length,
    semanticFailures: results.filter((result) => !accepted(result)).length,
    abstentions: results.filter(
      (result) => result.deterministicValidation.outcome === "ABSTAIN",
    ).length,
    abstentionCorrect: results.filter(
      (result) =>
        result.deterministicValidation.outcome === "ABSTAIN" &&
        result.abstentionCorrect,
    ).length,
    blockedCases: results.filter((result) => result.gold.blockedCase).length,
    blockedCasesImproved: results.filter(
      (result) => result.gold.blockedCase && accepted(result),
    ).length,
    knownGoodCases: results.filter((result) => result.gold.knownGood).length,
    knownGoodRegressions: results.filter(
      (result) => result.gold.knownGood && !accepted(result),
    ).length,
    acceptedHumanControls: results.filter(
      (result) => result.gold.acceptedHumanControl,
    ).length,
    acceptedHumanPreserved: results.filter(
      (result) =>
        result.gold.acceptedHumanControl &&
        result.authoritySource === "ACCEPTED_HUMAN_AUTHORITY",
    ).length,
    deterministicHardGateViolations: results.filter(
      (result) =>
        result.authoritySource === "CURRENT_MODEL_DERIVED_AUTHORITY" &&
        result.deterministicValidation.outcome !== "PASS",
    ).length,
    criticalUnsupportedInventionsAccepted: results.filter(
      (result) =>
        result.authoritySource === "CURRENT_MODEL_DERIVED_AUTHORITY" &&
        result.deterministicValidation.reasons.some((reason) =>
          [
            "UNGROUNDED_SEMANTIC_CLAIM",
            "UNGROUNDED_ACTION_OWNER",
            "ACTION_OWNER_NOT_AUTHORIZED",
            "UNSUPPORTED_ACTION_PRESENTED_AS_MEANING_PRESERVING",
          ].includes(reason),
        ),
    ).length,
    cacheReplayCases: results.filter(
      (result) => result.category === "cache-replay",
    ).length,
    cacheReplayCorrect: results.filter(
      (result) =>
        result.category === "cache-replay" && result.cacheState === "HIT",
    ).length,
    sourceGroundedCases: results.filter(
      (result) =>
        !result.deterministicValidation.reasons.includes(
          "UNGROUNDED_SEMANTIC_CLAIM",
        ) &&
        !result.deterministicValidation.reasons.includes(
          "UNGROUNDED_ACTION_OWNER",
        ),
    ).length,
    semanticIntentAgreement: results.filter((result) => result.intentAgreement)
      .length,
    actorOwnerCorrect: results.filter((result) => result.actorOwnerCorrect)
      .length,
    unsupportedActionStrategies: results.reduce(
      (total, result) =>
        total + result.deterministicValidation.unsupportedStrategyCount,
      0,
    ),
  };
}
