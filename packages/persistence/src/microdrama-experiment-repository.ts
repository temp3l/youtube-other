import type { DatabaseSync } from "node:sqlite";

import {
  microdramaExperimentAssignmentSchema,
  microdramaExperimentResultSchema,
  microdramaExperimentRevisionSchema,
  type MicrodramaExperimentAssignment,
  type MicrodramaExperimentResult,
  type MicrodramaExperimentRevision,
} from "@mediaforge/domain";

import { FakeMicrodramaExperimentRepository } from "./microdrama-experiment-fake-repository.js";
import {
  type MicrodramaExperimentPort,
  type RecordExperimentAssignmentInput,
  type RecordExperimentResultInput,
  type RecordExperimentRevisionInput,
} from "./microdrama-experiment-port.js";
import {
  MICRODRAMA_EXPERIMENT_SQLITE_MIGRATION,
  MICRODRAMA_EXPERIMENT_SQLITE_MIGRATION_ID,
} from "./microdrama-experiment-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

function parseRevision(row: { revision_json: string }): MicrodramaExperimentRevision {
  return microdramaExperimentRevisionSchema.parse(JSON.parse(row.revision_json));
}

function parseAssignment(row: {
  assignment_json: string;
}): MicrodramaExperimentAssignment {
  return microdramaExperimentAssignmentSchema.parse(
    JSON.parse(row.assignment_json)
  );
}

function parseResult(row: { result_json: string }): MicrodramaExperimentResult {
  return microdramaExperimentResultSchema.parse(JSON.parse(row.result_json));
}

export class MicrodramaExperimentRepository implements MicrodramaExperimentPort {
  private readonly fake = new FakeMicrodramaExperimentRepository();

  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migrateExperiments(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_EXPERIMENT_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_EXPERIMENT_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(MICRODRAMA_EXPERIMENT_SQLITE_MIGRATION_ID, new Date().toISOString());
    }
    this.fake.migrateExperiments();
  }

  public recordExperimentRevision(
    input: RecordExperimentRevisionInput
  ): MicrodramaExperimentRevision {
    const revision = this.fake.recordExperimentRevision(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_experiment_revisions (
          experiment_revision_id, experiment_id, series_id, revision_number,
          recorded_at, fingerprint, revision_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(experiment_revision_id) DO NOTHING`
      )
      .run(
        revision.experimentRevisionId,
        revision.experimentId,
        revision.seriesId,
        revision.revisionNumber,
        revision.recordedAt,
        revision.fingerprint,
        JSON.stringify(revision)
      );
    return revision;
  }

  public getExperimentRevision(
    experimentRevisionId: string
  ): MicrodramaExperimentRevision | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT revision_json FROM microdrama_experiment_revisions WHERE experiment_revision_id = ?"
      )
      .get(experimentRevisionId) as { revision_json: string } | undefined;
    return row
      ? parseRevision(row)
      : this.fake.getExperimentRevision(experimentRevisionId);
  }

  public listExperimentRevisions(
    experimentId: string
  ): readonly MicrodramaExperimentRevision[] {
    return this.fake.listExperimentRevisions(experimentId);
  }

  public recordExperimentAssignment(
    input: RecordExperimentAssignmentInput
  ): MicrodramaExperimentAssignment {
    const assignment = this.fake.recordExperimentAssignment(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_experiment_assignments (
          assignment_id, experiment_id, experiment_revision_id, publication_id,
          publication_revision, locale, provider, assigned_at, idempotency_key,
          fingerprint, assignment_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(idempotency_key) DO NOTHING`
      )
      .run(
        assignment.assignmentId,
        assignment.experimentId,
        assignment.experimentRevisionId,
        assignment.binding.publicationId,
        assignment.binding.publicationRevision,
        assignment.binding.locale,
        assignment.binding.provider,
        assignment.assignedAt,
        assignment.idempotencyKey,
        assignment.fingerprint,
        JSON.stringify(assignment)
      );
    return assignment;
  }

  public getExperimentAssignment(
    assignmentId: string
  ): MicrodramaExperimentAssignment | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT assignment_json FROM microdrama_experiment_assignments WHERE assignment_id = ?"
      )
      .get(assignmentId) as { assignment_json: string } | undefined;
    return row
      ? parseAssignment(row)
      : this.fake.getExperimentAssignment(assignmentId);
  }

  public getExperimentAssignmentByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaExperimentAssignment | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT assignment_json FROM microdrama_experiment_assignments WHERE idempotency_key = ?"
      )
      .get(idempotencyKey) as { assignment_json: string } | undefined;
    return row
      ? parseAssignment(row)
      : this.fake.getExperimentAssignmentByIdempotencyKey(idempotencyKey);
  }

  public listExperimentAssignments(input: {
    readonly experimentRevisionId: string;
  }): readonly MicrodramaExperimentAssignment[] {
    return this.fake.listExperimentAssignments(input);
  }

  public recordExperimentResult(
    input: RecordExperimentResultInput
  ): MicrodramaExperimentResult {
    const result = this.fake.recordExperimentResult(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_experiment_results (
          result_id, experiment_id, experiment_revision_id, recorded_at,
          idempotency_key, fingerprint, causal_kind, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(idempotency_key) DO NOTHING`
      )
      .run(
        result.resultId,
        result.experimentId,
        result.provenance.experimentRevisionId,
        result.recordedAt,
        result.idempotencyKey,
        result.fingerprint,
        result.causalConfidence.kind,
        JSON.stringify(result)
      );
    return result;
  }

  public getExperimentResult(resultId: string): MicrodramaExperimentResult | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT result_json FROM microdrama_experiment_results WHERE result_id = ?"
      )
      .get(resultId) as { result_json: string } | undefined;
    return row ? parseResult(row) : this.fake.getExperimentResult(resultId);
  }

  public getExperimentResultByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaExperimentResult | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT result_json FROM microdrama_experiment_results WHERE idempotency_key = ?"
      )
      .get(idempotencyKey) as { result_json: string } | undefined;
    return row
      ? parseResult(row)
      : this.fake.getExperimentResultByIdempotencyKey(idempotencyKey);
  }

  public listExperimentResults(input: {
    readonly experimentRevisionId: string;
  }): readonly MicrodramaExperimentResult[] {
    return this.fake.listExperimentResults(input);
  }
}
