import {
  READINESS_EVIDENCE_SCHEMA_VERSION,
  readinessProjectionSchema,
  type ReadinessCheckEvaluation,
  type ReadinessDomain,
  type ReadinessEvidenceRecord,
  type ReadinessFailureClass,
  type ReadinessInvalidationReason,
  type ReadinessProjection,
  type ReadinessProjectionResult,
} from "./readiness-evidence-contracts.js";

export type ReadinessCheckDefinition = {
  readonly checkId: string;
  readonly requiredEvidenceDomain?: ReadinessDomain;
};

export type ReadinessEvaluationInput = {
  readonly domain: ReadinessDomain;
  readonly targetRevisionId: string;
  readonly targetRevisionHash: string;
  readonly checks: readonly ReadinessCheckDefinition[];
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly projectedAt: string;
  readonly evaluateCheck: (
    check: ReadinessCheckDefinition,
    evidence: ReadinessEvidenceRecord | undefined
  ) => ReadinessCheckEvaluation;
};

function classifyFailure(
  evaluation: ReadinessCheckEvaluation,
  evidence: ReadinessEvidenceRecord | undefined
): ReadinessFailureClass {
  if (evaluation.failureClass) {
    return evaluation.failureClass;
  }
  if (!evidence) {
    return "missing";
  }
  if (evidence.status === "REVOKED") {
    return "revoked";
  }
  if (evidence.status === "STALE") {
    return "stale";
  }
  if (evaluation.result === "UNAVAILABLE") {
    return "unavailable_check";
  }
  return "domain_blocked";
}

function toInvalidationReason(
  evaluation: ReadinessCheckEvaluation,
  domain: ReadinessDomain,
  evidence: ReadinessEvidenceRecord | undefined,
  projectedAt: string
): ReadinessInvalidationReason {
  return {
    schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
    evidenceId: evaluation.evidenceId ?? evidence?.evidenceId ?? `missing.${evaluation.checkId}`,
    domain,
    failureClass: classifyFailure(evaluation, evidence),
    message:
      evaluation.reason ??
      `Readiness check ${evaluation.checkId} returned ${evaluation.result}.`,
    invalidatedAt: projectedAt,
  };
}

export function conjunctionEvaluatesToPass(
  evaluations: readonly ReadinessCheckEvaluation[]
): boolean {
  if (evaluations.length === 0) {
    return false;
  }
  return evaluations.every((evaluation) => evaluation.result === "PASS");
}

export function evaluateReadinessProjection(
  input: ReadinessEvaluationInput
): ReadinessProjectionResult {
  const evaluations = input.checks.map((check) => {
    const evidence = [...input.evidenceById.values()].find(
      (record) =>
        record.domain === input.domain && record.checkId === check.checkId
    );
    return input.evaluateCheck(check, evidence);
  });

  const projection = readinessProjectionSchema.parse({
    schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
    domain: input.domain,
    targetRevisionId: input.targetRevisionId,
    targetRevisionHash: input.targetRevisionHash,
    evaluations,
    projectedAt: input.projectedAt,
  });

  if (conjunctionEvaluatesToPass(evaluations)) {
    return { ok: true, projection };
  }

  const blockingReasons = evaluations
    .filter((evaluation) => evaluation.result !== "PASS")
    .map((evaluation) => {
      const evidence = [...input.evidenceById.values()].find(
        (record) =>
          record.domain === input.domain && record.checkId === evaluation.checkId
      );
      return toInvalidationReason(
        evaluation,
        input.domain,
        evidence,
        input.projectedAt
      );
    });

  return { ok: false, projection, blockingReasons };
}

export function evidenceMatchesRevision(
  evidence: ReadinessEvidenceRecord,
  targetRevisionId: string,
  targetRevisionHash: string
): boolean {
  return (
    evidence.boundRevisionId === targetRevisionId &&
    evidence.boundRevisionHash === targetRevisionHash &&
    evidence.status === "ACTIVE"
  );
}

export function defaultEvidenceBackedCheck(
  check: ReadinessCheckDefinition,
  evidence: ReadinessEvidenceRecord | undefined,
  targetRevisionId: string,
  targetRevisionHash: string
): ReadinessCheckEvaluation {
  if (!evidence) {
    return {
      checkId: check.checkId,
      result: "FAIL",
      failureClass: "missing",
      reason: `Missing evidence for ${check.checkId}.`,
    };
  }
  if (evidence.status === "REVOKED") {
    return {
      checkId: check.checkId,
      result: "FAIL",
      failureClass: "revoked",
      evidenceId: evidence.evidenceId,
      reason: `Evidence ${evidence.evidenceId} is revoked.`,
    };
  }
  if (evidence.status === "STALE") {
    return {
      checkId: check.checkId,
      result: "FAIL",
      failureClass: "stale",
      evidenceId: evidence.evidenceId,
      reason: `Evidence ${evidence.evidenceId} is stale.`,
    };
  }
  if (!evidenceMatchesRevision(evidence, targetRevisionId, targetRevisionHash)) {
    return {
      checkId: check.checkId,
      result: "FAIL",
      failureClass: "mismatched_revision",
      evidenceId: evidence.evidenceId,
      reason: `Evidence ${evidence.evidenceId} does not match target revision.`,
    };
  }
  return {
    checkId: check.checkId,
    result: "PASS",
    evidenceId: evidence.evidenceId,
  };
}

export function unavailableCheckNeverPasses(
  evaluations: readonly ReadinessCheckEvaluation[]
): boolean {
  const hasUnavailable = evaluations.some(
    (evaluation) => evaluation.result === "UNAVAILABLE"
  );
  if (!hasUnavailable) {
    return true;
  }
  return !conjunctionEvaluatesToPass(evaluations);
}

export function projectionBlocksOnlyDomain(
  result: ReadinessProjectionResult,
  domain: ReadinessDomain
): boolean {
  if (result.ok) {
    return result.projection.domain === domain;
  }
  return result.projection.domain === domain;
}
