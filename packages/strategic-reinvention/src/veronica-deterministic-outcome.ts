export const VERONICA_DETERMINISTIC_OUTCOME_MODEL_VERSION =
  "veronica-deterministic-outcome.v1" as const;

export type VeronicaCanonicalPreparationStatus = "PASS" | "BLOCK" | "REVIEW" | "ERROR";
export type VeronicaExpectedDeterministicOutcome = Exclude<VeronicaCanonicalPreparationStatus, "PASS" | "ERROR">;

export interface VeronicaDeterministicFinding {
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly contentId?: string;
  readonly sceneId?: string;
  readonly beatId?: string | null;
  readonly beatIds?: readonly string[];
  readonly evidencePaths?: readonly string[];
  readonly rootCause: string;
  readonly retryable: boolean;
  readonly paidStageEligible: false;
  readonly sourceSemanticReference?: string;
  readonly affectedCandidateId?: string;
}

export interface VeronicaPreparationOutcomeClassification {
  readonly modelVersion: typeof VERONICA_DETERMINISTIC_OUTCOME_MODEL_VERSION;
  readonly status: Exclude<VeronicaCanonicalPreparationStatus, "PASS">;
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly findings: readonly VeronicaDeterministicFinding[];
  readonly retryable: boolean;
  readonly paidStageEligible: false;
  readonly source: "typed-deterministic-outcome" | "unexpected-exception";
}

export interface VeronicaNormalizedDeterministicRootCause {
  readonly stage: string;
  readonly rootCause: string;
  readonly contentId: string;
  readonly sceneId: string | null;
  readonly beatId: string | null;
  readonly code: string;
  readonly reason: string;
  readonly evidencePath: string | null;
  readonly dedupKey: string;
}

interface NestedFindingInput {
  readonly code: string;
  readonly reason: string;
  readonly sceneId: string | null;
  readonly beatId: string | null;
  readonly evidencePath: string | null;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function findingsFromArray(value: unknown, defaultReasonField: string): readonly NestedFindingInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): NestedFindingInput[] => {
    const candidate = record(item);
    const code = stringValue(candidate?.["code"]);
    if (!candidate || !code) return [];
    return [{
      code,
      reason: stringValue(candidate[defaultReasonField])
        ?? stringValue(candidate["message"])
        ?? stringValue(candidate["reason"])
        ?? code,
      sceneId: stringValue(candidate["sceneId"]),
      beatId: stringValue(candidate["beatId"]),
      evidencePath: Array.isArray(candidate["evidencePaths"])
        ? stringValue(candidate["evidencePaths"][0])
        : stringValue(candidate["evidencePath"]),
    }];
  });
}

/**
 * Canonical M3 measurement boundary. Stage labels describe where orchestration
 * stopped; nested semantic/readiness findings describe why it stopped.
 */
export function flattenVeronicaCurrentAuthorityRootCauses(input: {
  readonly contentId: string;
  readonly terminalOutcome?: VeronicaPreparationOutcomeClassification;
  readonly semanticPlan?: unknown;
  readonly semanticReviews?: unknown;
  readonly nestedDeterministicBlockers?: readonly unknown[];
  readonly evidencePaths?: {
    readonly semanticPlan?: string;
    readonly semanticReviews?: string;
  };
}): readonly VeronicaNormalizedDeterministicRootCause[] {
  const plan = record(input.semanticPlan);
  const reviews = record(input.semanticReviews);
  const providerReadiness = record(plan?.["providerReadiness"]);
  const semanticQuality = record(plan?.["semanticQuality"]);
  const visualBeatPlan = record(plan?.["visualBeatPlan"]);
  const beatQuality = record(visualBeatPlan?.["quality"]);
  const candidateSelection = record(visualBeatPlan?.["candidateSelection"]);
  const stage = input.terminalOutcome?.stage ?? "DETERMINISTIC_PREPARATION";
  const nested: NestedFindingInput[] = [
    ...findingsFromArray(input.terminalOutcome?.findings, "message"),
    ...findingsFromArray(reviews?.["reviews"], "message").flatMap((reviewFinding) => [reviewFinding]),
    ...[...((Array.isArray(reviews?.["reviews"]) ? reviews["reviews"] : []) as readonly unknown[])]
      .flatMap((review) => findingsFromArray(record(review)?.["findings"], "message"))
      .map((finding) => ({ ...finding, evidencePath: input.evidencePaths?.semanticReviews ?? finding.evidencePath })),
    ...findingsFromArray(providerReadiness?.["issues"], "reason")
      .map((finding) => ({ ...finding, evidencePath: input.evidencePaths?.semanticPlan ?? finding.evidencePath })),
    ...findingsFromArray(beatQuality?.["findings"], "message")
      .map((finding) => ({ ...finding, evidencePath: input.evidencePaths?.semanticPlan ?? finding.evidencePath })),
    ...findingsFromArray(input.nestedDeterministicBlockers, "reason"),
  ];
  if (Array.isArray(semanticQuality?.["findingCodes"])) {
    for (const value of semanticQuality["findingCodes"]) {
      const code = stringValue(value);
      if (code) nested.push({ code, reason: code, sceneId: null, beatId: null, evidencePath: input.evidencePaths?.semanticPlan ?? null });
    }
  }
  if (Array.isArray(candidateSelection?.["noSafeReasons"])) {
    for (const value of candidateSelection["noSafeReasons"]) {
      const diagnostic = record(value);
      const primary = record(diagnostic?.["primaryReason"]);
      const code = stringValue(primary?.["kind"]);
      if (!diagnostic || !code) continue;
      nested.push({
        code,
        reason: JSON.stringify(primary),
        sceneId: stringValue(diagnostic["sceneId"]),
        beatId: stringValue(diagnostic["beatId"]),
        evidencePath: input.evidencePaths?.semanticPlan ?? null,
      });
    }
  }
  const specific = nested.filter((finding) => finding.code !== "DETERMINISTIC_PREPARATION");
  if (specific.length === 0 && input.terminalOutcome) {
    specific.push({
      code: input.terminalOutcome.code,
      reason: input.terminalOutcome.message,
      sceneId: null,
      beatId: null,
      evidencePath: null,
    });
  }
  const byKey = new Map<string, VeronicaNormalizedDeterministicRootCause>();
  for (const finding of specific) {
    const dedupKey = [input.contentId, finding.sceneId ?? "", finding.beatId ?? "", finding.code, finding.reason].join("|");
    byKey.set(dedupKey, {
      stage,
      rootCause: finding.code,
      contentId: input.contentId,
      sceneId: finding.sceneId,
      beatId: finding.beatId,
      code: finding.code,
      reason: finding.reason,
      evidencePath: finding.evidencePath,
      dedupKey,
    });
  }
  return [...byKey.values()].sort((left, right) => left.dedupKey.localeCompare(right.dedupKey));
}

export class VeronicaExpectedDeterministicOutcomeError extends Error {
  readonly retryable: boolean;
  readonly paidStageEligible = false as const;

  constructor(
    readonly outcome: VeronicaExpectedDeterministicOutcome,
    readonly code: string,
    readonly stage: string,
    readonly findings: readonly VeronicaDeterministicFinding[],
    message: string,
    options?: ErrorOptions & { readonly retryable?: boolean },
  ) {
    super(message, options);
    this.name = "VeronicaExpectedDeterministicOutcomeError";
    this.retryable = options?.retryable ?? false;
  }
}

function stringField(value: object, key: string): string | undefined {
  if (!(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function findingArray(value: object): readonly VeronicaDeterministicFinding[] {
  if (!("findings" in value) || !Array.isArray(value.findings)) return [];
  return value.findings.filter((finding): finding is VeronicaDeterministicFinding =>
    Boolean(finding)
    && typeof finding === "object"
    && typeof (finding as { code?: unknown }).code === "string"
    && typeof (finding as { stage?: unknown }).stage === "string"
    && typeof (finding as { message?: unknown }).message === "string"
    && (finding as { paidStageEligible?: unknown }).paidStageEligible === false,
  );
}

/** The sole conversion boundary from thrown preparation failures to canonical status. */
export function classifyVeronicaPreparationError(error: unknown): VeronicaPreparationOutcomeClassification {
  const value = error && typeof error === "object" ? error : null;
  const message = error instanceof Error ? error.message : String(error);
  if (value && "outcome" in value && (value.outcome === "BLOCK" || value.outcome === "REVIEW")) {
    const code = stringField(value, "code") ?? message.match(/^[A-Z][A-Z0-9_]+/u)?.[0] ?? "DETERMINISTIC_PREPARATION_INELIGIBLE";
    const stage = stringField(value, "stage") ?? "preparation";
    const findings = findingArray(value);
    return {
      modelVersion: VERONICA_DETERMINISTIC_OUTCOME_MODEL_VERSION,
      status: value.outcome,
      code,
      stage,
      message,
      findings,
      retryable: "retryable" in value && value.retryable === true,
      paidStageEligible: false,
      source: "typed-deterministic-outcome",
    };
  }
  return {
    modelVersion: VERONICA_DETERMINISTIC_OUTCOME_MODEL_VERSION,
    status: "ERROR",
    code: value ? stringField(value, "code") ?? "UNEXPECTED_PREPARATION_ERROR" : "UNEXPECTED_PREPARATION_ERROR",
    stage: value ? stringField(value, "stage") ?? "preparation" : "preparation",
    message,
    findings: [],
    retryable: false,
    paidStageEligible: false,
    source: "unexpected-exception",
  };
}
