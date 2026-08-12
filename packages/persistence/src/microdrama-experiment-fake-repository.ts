import {
  computeExperimentAssignmentFingerprint,
  computeExperimentResultFingerprint,
  computeExperimentRevisionFingerprint,
  validateMicrodramaExperimentAssignment,
  validateMicrodramaExperimentResult,
  validateMicrodramaExperimentRevision,
  type MicrodramaExperimentAssignment,
  type MicrodramaExperimentResult,
  type MicrodramaExperimentRevision,
} from "@mediaforge/domain";

import {
  type MicrodramaExperimentPort,
  type RecordExperimentAssignmentInput,
  type RecordExperimentResultInput,
  type RecordExperimentRevisionInput,
  MicrodramaExperimentConflictError,
} from "./microdrama-experiment-port.js";

function revisionFingerprint(
  revision: MicrodramaExperimentRevision
): string {
  return computeExperimentRevisionFingerprint({
    experimentId: revision.experimentId,
    revisionNumber: revision.revisionNumber,
    seriesId: revision.seriesId,
    hypothesis: revision.hypothesis,
    controlledVariable: revision.controlledVariable,
    control: revision.control,
    candidates: revision.candidates,
    eligibility: revision.eligibility,
    observationWindow: revision.observationWindow,
    stoppingRule: revision.stoppingRule,
    recordedAt: revision.recordedAt,
  });
}

function assignmentFingerprint(
  assignment: MicrodramaExperimentAssignment
): string {
  return computeExperimentAssignmentFingerprint({
    experimentId: assignment.experimentId,
    experimentRevisionId: assignment.experimentRevisionId,
    candidateId: assignment.candidateId,
    binding: assignment.binding,
    assignedAt: assignment.assignedAt,
    idempotencyKey: assignment.idempotencyKey,
  });
}

function resultFingerprint(result: MicrodramaExperimentResult): string {
  return computeExperimentResultFingerprint({
    experimentId: result.experimentId,
    provenance: result.provenance,
    metricDefinitions: result.metricDefinitions,
    limitations: result.limitations,
    causalConfidence: result.causalConfidence,
    comparisonSummary: result.comparisonSummary,
    recordedAt: result.recordedAt,
    idempotencyKey: result.idempotencyKey,
  });
}

export class FakeMicrodramaExperimentRepository implements MicrodramaExperimentPort {
  private readonly revisionsById = new Map<string, MicrodramaExperimentRevision>();
  private readonly revisionsByExperiment = new Map<
    string,
    MicrodramaExperimentRevision[]
  >();
  private readonly assignmentsById = new Map<
    string,
    MicrodramaExperimentAssignment
  >();
  private readonly assignmentsByIdempotencyKey = new Map<
    string,
    MicrodramaExperimentAssignment
  >();
  private readonly resultsById = new Map<string, MicrodramaExperimentResult>();
  private readonly resultsByIdempotencyKey = new Map<
    string,
    MicrodramaExperimentResult
  >();
  private migrated = false;

  public migrateExperiments(): void {
    this.migrated = true;
  }

  public recordExperimentRevision(
    input: RecordExperimentRevisionInput
  ): MicrodramaExperimentRevision {
    this.requireMigrated();
    const revision = validateMicrodramaExperimentRevision(input.revision);
    const fingerprint = revisionFingerprint(revision);
    if (fingerprint !== revision.fingerprint) {
      throw new Error("Experiment revision fingerprint mismatch.");
    }

    const existing = this.revisionsById.get(revision.experimentRevisionId);
    if (existing) {
      if (revisionFingerprint(existing) !== fingerprint) {
        throw new MicrodramaExperimentConflictError(
          "Experiment revision id conflicts with another revision payload."
        );
      }
      return existing;
    }

    const siblings = this.revisionsByExperiment.get(revision.experimentId) ?? [];
    const duplicateNumber = siblings.find(
      (candidate) => candidate.revisionNumber === revision.revisionNumber
    );
    if (duplicateNumber && revisionFingerprint(duplicateNumber) !== fingerprint) {
      throw new MicrodramaExperimentConflictError(
        "Experiment revision number conflicts with another revision payload."
      );
    }

    this.revisionsById.set(revision.experimentRevisionId, revision);
    this.revisionsByExperiment.set(revision.experimentId, [
      ...siblings.filter(
        (candidate) =>
          candidate.experimentRevisionId !== revision.experimentRevisionId
      ),
      revision,
    ].sort((left, right) => left.revisionNumber - right.revisionNumber));
    return revision;
  }

  public getExperimentRevision(
    experimentRevisionId: string
  ): MicrodramaExperimentRevision | null {
    return this.revisionsById.get(experimentRevisionId) ?? null;
  }

  public listExperimentRevisions(
    experimentId: string
  ): readonly MicrodramaExperimentRevision[] {
    return [...(this.revisionsByExperiment.get(experimentId) ?? [])];
  }

  public recordExperimentAssignment(
    input: RecordExperimentAssignmentInput
  ): MicrodramaExperimentAssignment {
    this.requireMigrated();
    const assignment = validateMicrodramaExperimentAssignment(input.assignment);
    const fingerprint = assignmentFingerprint(assignment);
    if (fingerprint !== assignment.fingerprint) {
      throw new Error("Experiment assignment fingerprint mismatch.");
    }

    const existingByKey = this.assignmentsByIdempotencyKey.get(
      assignment.idempotencyKey
    );
    if (existingByKey) {
      if (assignmentFingerprint(existingByKey) !== fingerprint) {
        throw new MicrodramaExperimentConflictError(
          "Experiment assignment idempotency key conflicts with another request."
        );
      }
      return existingByKey;
    }

    this.assignmentsById.set(assignment.assignmentId, assignment);
    this.assignmentsByIdempotencyKey.set(
      assignment.idempotencyKey,
      assignment
    );
    return assignment;
  }

  public getExperimentAssignment(
    assignmentId: string
  ): MicrodramaExperimentAssignment | null {
    return this.assignmentsById.get(assignmentId) ?? null;
  }

  public getExperimentAssignmentByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaExperimentAssignment | null {
    return this.assignmentsByIdempotencyKey.get(idempotencyKey) ?? null;
  }

  public listExperimentAssignments(input: {
    readonly experimentRevisionId: string;
  }): readonly MicrodramaExperimentAssignment[] {
    return [...this.assignmentsById.values()]
      .filter(
        (assignment) =>
          assignment.experimentRevisionId === input.experimentRevisionId
      )
      .sort((left, right) => left.assignedAt.localeCompare(right.assignedAt));
  }

  public recordExperimentResult(
    input: RecordExperimentResultInput
  ): MicrodramaExperimentResult {
    this.requireMigrated();
    const result = validateMicrodramaExperimentResult(input.result);
    const fingerprint = resultFingerprint(result);
    if (fingerprint !== result.fingerprint) {
      throw new Error("Experiment result fingerprint mismatch.");
    }

    const existingByKey = this.resultsByIdempotencyKey.get(result.idempotencyKey);
    if (existingByKey) {
      if (resultFingerprint(existingByKey) !== fingerprint) {
        throw new MicrodramaExperimentConflictError(
          "Experiment result idempotency key conflicts with another request."
        );
      }
      return existingByKey;
    }

    this.resultsById.set(result.resultId, result);
    this.resultsByIdempotencyKey.set(result.idempotencyKey, result);
    return result;
  }

  public getExperimentResult(resultId: string): MicrodramaExperimentResult | null {
    return this.resultsById.get(resultId) ?? null;
  }

  public getExperimentResultByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaExperimentResult | null {
    return this.resultsByIdempotencyKey.get(idempotencyKey) ?? null;
  }

  public listExperimentResults(input: {
    readonly experimentRevisionId: string;
  }): readonly MicrodramaExperimentResult[] {
    return [...this.resultsById.values()]
      .filter(
        (result) =>
          result.provenance.experimentRevisionId === input.experimentRevisionId
      )
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  private requireMigrated(): void {
    if (!this.migrated) {
      throw new Error("Microdrama experiment repository is not migrated.");
    }
  }
}
