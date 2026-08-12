import type { DatabaseSync } from "node:sqlite";
import {
  validateVisualRegistryRevisionEnvelope,
  visualRegistryEntryKindSchema,
  visualRegistryRevisionEnvelopeSchema,
  visualRegistryRevisionStatusSchema,
  type VisualRegistryEntryKind,
  type VisualRegistryRevisionEnvelope,
} from "@mediaforge/domain";

import type {
  AcceptVisualRegistryRevisionInput,
  AppendVisualRegistryRevisionInput,
  UpdateVisualRegistryRevisionStatusInput,
  VisualAssetRegistryPort,
} from "./visual-asset-registry-port.js";
import {
  VisualRegistryDuplicateRevisionError,
  VisualRegistryRevisionMismatchError,
  VisualRegistryRevisionNotApprovedError,
  VisualRegistryRevisionNotFoundError,
} from "./visual-asset-registry-port.js";
import {
  MICRODRAMA_VISUAL_REGISTRY_MIGRATION,
  MICRODRAMA_VISUAL_REGISTRY_MIGRATION_ID,
} from "./visual-asset-registry-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

type RevisionRow = {
  envelope_json: string;
};

type AcceptedRow = {
  accepted_revision_id: string;
};

function parseEnvelope(json: string): VisualRegistryRevisionEnvelope {
  return validateVisualRegistryRevisionEnvelope(JSON.parse(json) as unknown);
}

export class VisualAssetRegistryRepository implements VisualAssetRegistryPort {
  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migrate(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_VISUAL_REGISTRY_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_VISUAL_REGISTRY_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(MICRODRAMA_VISUAL_REGISTRY_MIGRATION_ID, new Date().toISOString());
    }
  }

  public appendRevision(
    input: AppendVisualRegistryRevisionInput
  ): VisualRegistryRevisionEnvelope {
    const envelope = visualRegistryRevisionEnvelopeSchema.parse(input.envelope);
    const database = this.sqlite.database;
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database
        .prepare(
          "SELECT revision_id FROM microdrama_visual_registry_revisions WHERE revision_id = ?"
        )
        .get(envelope.revisionId) as { revision_id: string } | undefined;
      if (existing) {
        throw new VisualRegistryDuplicateRevisionError(
          `Revision already exists: ${envelope.revisionId}`
        );
      }

      database
        .prepare(
          `INSERT INTO microdrama_visual_registry_revisions (
            revision_id, series_id, entry_id, entry_kind, revision_number,
            status, envelope_json, content_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          envelope.revisionId,
          envelope.seriesId,
          envelope.entryId,
          envelope.entryKind,
          envelope.revisionNumber,
          envelope.status,
          JSON.stringify(envelope),
          envelope.contentHash,
          envelope.createdAt
        );

      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return envelope;
  }

  public getRevision(revisionId: string): VisualRegistryRevisionEnvelope | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT envelope_json FROM microdrama_visual_registry_revisions WHERE revision_id = ?"
      )
      .get(revisionId) as RevisionRow | undefined;
    return row ? parseEnvelope(row.envelope_json) : null;
  }

  public listRevisionsByEntry(
    seriesId: string,
    entryId: string,
    entryKind: VisualRegistryEntryKind
  ): readonly VisualRegistryRevisionEnvelope[] {
    const kind = visualRegistryEntryKindSchema.parse(entryKind);
    const rows = this.sqlite.database
      .prepare(
        `SELECT envelope_json FROM microdrama_visual_registry_revisions
         WHERE series_id = ? AND entry_id = ? AND entry_kind = ?
         ORDER BY revision_number ASC`
      )
      .all(seriesId, entryId, kind) as RevisionRow[];
    return rows.map((row) => parseEnvelope(row.envelope_json));
  }

  public updateRevisionStatus(
    input: UpdateVisualRegistryRevisionStatusInput
  ): VisualRegistryRevisionEnvelope {
    const status = visualRegistryRevisionStatusSchema.parse(input.status);
    const current = this.getRevision(input.revisionId);
    if (!current) {
      throw new VisualRegistryRevisionNotFoundError(
        `Revision not found: ${input.revisionId}`
      );
    }

    const updated = visualRegistryRevisionEnvelopeSchema.parse({
      ...current,
      status,
      createdAt: current.createdAt,
    });

    this.sqlite.database
      .prepare(
        `UPDATE microdrama_visual_registry_revisions
         SET status = ?, envelope_json = ?
         WHERE revision_id = ?`
      )
      .run(status, JSON.stringify(updated), input.revisionId);

    return updated;
  }

  public acceptRevision(
    input: AcceptVisualRegistryRevisionInput
  ): VisualRegistryRevisionEnvelope {
    const kind = visualRegistryEntryKindSchema.parse(input.entryKind);
    const revision = this.getRevision(input.revisionId);
    if (!revision) {
      throw new VisualRegistryRevisionNotFoundError(
        `Revision not found: ${input.revisionId}`
      );
    }
    if (
      revision.seriesId !== input.seriesId ||
      revision.entryId !== input.entryId ||
      revision.entryKind !== kind
    ) {
      throw new VisualRegistryRevisionMismatchError(
        `Revision ${input.revisionId} does not match ${input.entryKind}:${input.entryId}`
      );
    }
    if (revision.status === "REJECTED" || revision.status === "SUPERSEDED") {
      throw new VisualRegistryRevisionNotApprovedError(
        `Revision ${input.revisionId} is not approvable from status ${revision.status}`
      );
    }

    const accepted = this.updateRevisionStatus({
      revisionId: input.revisionId,
      status: "ACCEPTED",
      updatedAt: input.acceptedAt,
    });

    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_visual_registry_accepted (
          series_id, entry_id, entry_kind, accepted_revision_id, accepted_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(series_id, entry_id, entry_kind) DO UPDATE SET
          accepted_revision_id = excluded.accepted_revision_id,
          accepted_at = excluded.accepted_at`
      )
      .run(
        input.seriesId,
        input.entryId,
        kind,
        accepted.revisionId,
        input.acceptedAt
      );

    return accepted;
  }

  public getAcceptedRevision(
    seriesId: string,
    entryId: string,
    entryKind: VisualRegistryEntryKind
  ): VisualRegistryRevisionEnvelope | null {
    const kind = visualRegistryEntryKindSchema.parse(entryKind);
    const row = this.sqlite.database
      .prepare(
        `SELECT accepted_revision_id FROM microdrama_visual_registry_accepted
         WHERE series_id = ? AND entry_id = ? AND entry_kind = ?`
      )
      .get(seriesId, entryId, kind) as AcceptedRow | undefined;
    if (!row) {
      return null;
    }
    return this.getRevision(row.accepted_revision_id);
  }
}
