import type {
  MicrodramaExperimentAssignment,
  MicrodramaExperimentResult,
  MicrodramaExperimentRevision,
} from "@mediaforge/domain";

export type RecordExperimentRevisionInput = {
  readonly revision: MicrodramaExperimentRevision;
};

export type RecordExperimentAssignmentInput = {
  readonly assignment: MicrodramaExperimentAssignment;
};

export type RecordExperimentResultInput = {
  readonly result: MicrodramaExperimentResult;
};

export interface MicrodramaExperimentPort {
  migrateExperiments(): void;
  recordExperimentRevision(
    input: RecordExperimentRevisionInput
  ): MicrodramaExperimentRevision;
  getExperimentRevision(
    experimentRevisionId: string
  ): MicrodramaExperimentRevision | null;
  listExperimentRevisions(
    experimentId: string
  ): readonly MicrodramaExperimentRevision[];
  recordExperimentAssignment(
    input: RecordExperimentAssignmentInput
  ): MicrodramaExperimentAssignment;
  getExperimentAssignment(
    assignmentId: string
  ): MicrodramaExperimentAssignment | null;
  getExperimentAssignmentByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaExperimentAssignment | null;
  listExperimentAssignments(input: {
    readonly experimentRevisionId: string;
  }): readonly MicrodramaExperimentAssignment[];
  recordExperimentResult(
    input: RecordExperimentResultInput
  ): MicrodramaExperimentResult;
  getExperimentResult(resultId: string): MicrodramaExperimentResult | null;
  getExperimentResultByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaExperimentResult | null;
  listExperimentResults(input: {
    readonly experimentRevisionId: string;
  }): readonly MicrodramaExperimentResult[];
}

export class MicrodramaExperimentConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MicrodramaExperimentConflictError";
  }
}
