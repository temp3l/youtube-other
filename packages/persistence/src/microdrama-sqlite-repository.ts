import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { NarrativeAggregateKind } from "@mediaforge/narrative-core";
import {
  narrativeAggregateKindSchema,
  narrativeRevisionEnvelopeSchema,
  narrativeRevisionIdSchema,
  validateRevisionEnvelope,
} from "@mediaforge/narrative-core";

import type {
  AppendMicrodramaEventInput,
  AppendNarrativeRevisionInput,
  ArtifactReference,
  MicrodramaBackupManifest,
  MicrodramaEvent,
  MicrodramaPersistencePort,
  MicrodramaProjection,
  RegisterArtifactReferenceInput,
  ReplaceProjectionInput,
} from "./microdrama-persistence-port.js";
import {
  MicrodramaConcurrencyError,
  MicrodramaDuplicateRevisionError,
} from "./microdrama-persistence-port.js";
import type { MicrodramaSQLiteRepositoryOptions } from "./microdrama-persistence-port.js";
import {
  MICRODRAMA_SQLITE_MIGRATION,
  MICRODRAMA_SQLITE_MIGRATION_ID,
} from "./microdrama-sqlite-schema.js";
import { validateArtifactReferenceForRegistration } from "./microdrama-artifact-trust.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
  readonly config: { readonly dbPath: string };
};

type RevisionRow = {
  envelope_json: string;
};

type EventRow = {
  event_id: string;
  sequence: number;
  event_kind: string;
  payload_json: string;
  content_hash: string;
  recorded_at: string;
};

type ArtifactRow = {
  artifact_hash: string;
  mime_type: string;
  byte_size: number;
  storage_uri: string;
  provenance_json: string;
  recorded_at: string;
};

type ProjectionRow = {
  projection_key: string;
  projection_revision: number;
  projection_json: string;
  content_hash: string;
  updated_at: string;
};

function parseEnvelope(json: string) {
  const envelope = validateRevisionEnvelope(JSON.parse(json) as unknown);
  if (!envelope.ok || !envelope.envelope) {
    throw new Error(
      envelope.ok
        ? "Envelope validation missing envelope payload."
        : envelope.issues[0]?.message ?? "Invalid narrative revision envelope."
    );
  }
  return envelope.envelope;
}

function parseEvent(row: EventRow): MicrodramaEvent {
  return {
    eventId: row.event_id,
    sequence: row.sequence,
    eventKind: row.event_kind as MicrodramaEvent["eventKind"],
    payload: JSON.parse(row.payload_json) as unknown,
    contentHash: row.content_hash,
    recordedAt: row.recorded_at,
  };
}

function parseArtifact(row: ArtifactRow): ArtifactReference {
  return {
    artifactHash: row.artifact_hash,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    storageUri: row.storage_uri,
    provenance: JSON.parse(row.provenance_json) as unknown,
    recordedAt: row.recorded_at,
  };
}

function parseProjection(row: ProjectionRow): MicrodramaProjection {
  return {
    projectionKey: row.projection_key,
    projectionRevision: row.projection_revision,
    projection: JSON.parse(row.projection_json) as unknown,
    contentHash: row.content_hash,
    updatedAt: row.updated_at,
  };
}

export class MicrodramaSQLiteRepository implements MicrodramaPersistencePort {
  public constructor(
    private readonly sqlite: SQLitePersistenceHost,
    private readonly options: MicrodramaSQLiteRepositoryOptions = {}
  ) {}

  private artifactRoot(): string {
    return (
      this.options.artifactRoot ??
      path.join(path.dirname(this.sqlite.config.dbPath), "artifacts")
    );
  }

  public migrate(): void {
    const database = this.sqlite.database;
    database.exec("PRAGMA journal_mode = WAL;");
    database.exec(MICRODRAMA_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_SQLITE_MIGRATION_ID) as { migration_id: string } | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(MICRODRAMA_SQLITE_MIGRATION_ID, new Date().toISOString());
    }
  }

  public appendNarrativeRevision(
    input: AppendNarrativeRevisionInput
  ): ReturnType<MicrodramaPersistencePort["appendNarrativeRevision"]> {
    const envelope = narrativeRevisionEnvelopeSchema.parse(input.envelope);
    const hashResult = validateRevisionEnvelope(envelope);
    if (!hashResult.ok) {
      throw new Error(hashResult.issues[0]?.message ?? "Invalid revision envelope.");
    }

    const database = this.sqlite.database;
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database
        .prepare("SELECT revision_id FROM microdrama_narrative_revisions WHERE revision_id = ?")
        .get(envelope.revisionId) as { revision_id: string } | undefined;
      if (existing) {
        throw new MicrodramaDuplicateRevisionError(
          `Revision already exists: ${envelope.revisionId}`
        );
      }

      database
        .prepare(
          `INSERT INTO microdrama_narrative_revisions (
            revision_id, aggregate_id, aggregate_kind, revision_number,
            envelope_json, content_hash, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          envelope.revisionId,
          envelope.aggregateId,
          envelope.aggregateKind,
          envelope.revisionNumber,
          JSON.stringify(envelope),
          envelope.contentHash,
          envelope.status,
          envelope.createdAt
        );

      this.appendEvent({
        eventId: `event.revision.${envelope.revisionId}`,
        eventKind: "revision_appended",
        payload: {
          revisionId: envelope.revisionId,
          aggregateId: envelope.aggregateId,
          aggregateKind: envelope.aggregateKind,
          revisionNumber: envelope.revisionNumber,
          status: envelope.status,
        },
        contentHash: envelope.contentHash,
        recordedAt: envelope.createdAt,
      });

      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return envelope;
  }

  public getNarrativeRevision(revisionId: string) {
    const parsedId = narrativeRevisionIdSchema.parse(revisionId);
    const row = this.sqlite.database
      .prepare(
        "SELECT envelope_json FROM microdrama_narrative_revisions WHERE revision_id = ?"
      )
      .get(parsedId) as RevisionRow | undefined;
    if (!row) {
      return null;
    }
    return parseEnvelope(row.envelope_json);
  }

  public listNarrativeRevisionsByAggregate(
    aggregateId: string,
    aggregateKind: NarrativeAggregateKind
  ): readonly ReturnType<typeof parseEnvelope>[] {
    const kind = narrativeAggregateKindSchema.parse(aggregateKind);
    const rows = this.sqlite.database
      .prepare(
        `SELECT envelope_json FROM microdrama_narrative_revisions
         WHERE aggregate_id = ? AND aggregate_kind = ?
         ORDER BY revision_number ASC`
      )
      .all(aggregateId, kind) as RevisionRow[];
    return rows.map((row) => parseEnvelope(row.envelope_json));
  }

  public appendEvent(input: AppendMicrodramaEventInput): MicrodramaEvent {
    const nextSequence =
      (
        this.sqlite.database
          .prepare("SELECT MAX(sequence) AS max_sequence FROM microdrama_events")
          .get() as { max_sequence: number | null }
      ).max_sequence ?? 0;

    const sequence = nextSequence + 1;
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_events (
          event_id, sequence, event_kind, payload_json, content_hash, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.eventId,
        sequence,
        input.eventKind,
        JSON.stringify(input.payload),
        input.contentHash,
        input.recordedAt
      );

    return {
      eventId: input.eventId,
      sequence,
      eventKind: input.eventKind,
      payload: input.payload,
      contentHash: input.contentHash,
      recordedAt: input.recordedAt,
    };
  }

  public replayEvents(): readonly MicrodramaEvent[] {
    const rows = this.sqlite.database
      .prepare(
        "SELECT event_id, sequence, event_kind, payload_json, content_hash, recorded_at FROM microdrama_events ORDER BY sequence ASC"
      )
      .all() as EventRow[];
    return rows.map(parseEvent);
  }

  public registerArtifactReference(
    input: RegisterArtifactReferenceInput
  ): ArtifactReference {
    validateArtifactReferenceForRegistration({
      correlationId:
        input.correlationId ??
        `artifact.${input.artifactHash.slice(0, 16)}`,
      evaluatedAt: input.recordedAt,
      artifactRoot: this.artifactRoot(),
      artifactHash: input.artifactHash,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      storageUri: input.storageUri,
      ...(input.observedContentHash !== undefined
        ? { observedContentHash: input.observedContentHash }
        : {}),
      untrustedProvenance: input.provenance,
    });

    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_artifact_references (
          artifact_hash, mime_type, byte_size, storage_uri, provenance_json, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(artifact_hash) DO UPDATE SET
          mime_type = excluded.mime_type,
          byte_size = excluded.byte_size,
          storage_uri = excluded.storage_uri,
          provenance_json = excluded.provenance_json,
          recorded_at = excluded.recorded_at`
      )
      .run(
        input.artifactHash,
        input.mimeType,
        input.byteSize,
        input.storageUri,
        JSON.stringify(input.provenance),
        input.recordedAt
      );

    return {
      artifactHash: input.artifactHash,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      storageUri: input.storageUri,
      provenance: input.provenance,
      recordedAt: input.recordedAt,
    };
  }

  public getArtifactReference(artifactHash: string): ArtifactReference | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT artifact_hash, mime_type, byte_size, storage_uri, provenance_json, recorded_at FROM microdrama_artifact_references WHERE artifact_hash = ?"
      )
      .get(artifactHash) as ArtifactRow | undefined;
    return row ? parseArtifact(row) : null;
  }

  public replaceProjection(input: ReplaceProjectionInput): MicrodramaProjection {
    const current = this.getProjection(input.projectionKey);
    const nextRevision = current ? current.projectionRevision + 1 : 1;
    if (
      input.expectedProjectionRevision !== undefined &&
      (current?.projectionRevision ?? 0) !== input.expectedProjectionRevision
    ) {
      throw new MicrodramaConcurrencyError(
        `Projection revision mismatch for ${input.projectionKey}`
      );
    }

    const projection: MicrodramaProjection = {
      projectionKey: input.projectionKey,
      projectionRevision: nextRevision,
      projection: input.projection,
      contentHash: input.contentHash,
      updatedAt: input.updatedAt,
    };

    if (current) {
      const result = this.sqlite.database
        .prepare(
          `UPDATE microdrama_projections
           SET projection_revision = ?, projection_json = ?, content_hash = ?, updated_at = ?
           WHERE projection_key = ? AND projection_revision = ?`
        )
        .run(
          projection.projectionRevision,
          JSON.stringify(projection.projection),
          projection.contentHash,
          projection.updatedAt,
          projection.projectionKey,
          current.projectionRevision
        );
      if (result.changes !== 1) {
        throw new MicrodramaConcurrencyError(
          `Projection CAS update failed for ${input.projectionKey}`
        );
      }
    } else {
      this.sqlite.database
        .prepare(
          `INSERT INTO microdrama_projections (
            projection_key, projection_revision, projection_json, content_hash, updated_at
          ) VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          projection.projectionKey,
          projection.projectionRevision,
          JSON.stringify(projection.projection),
          projection.contentHash,
          projection.updatedAt
        );
    }

    this.appendEvent({
      eventId: `event.projection.${projection.projectionKey}.${projection.projectionRevision}`,
      eventKind: "projection_updated",
      payload: {
        projectionKey: projection.projectionKey,
        projectionRevision: projection.projectionRevision,
      },
      contentHash: projection.contentHash,
      recordedAt: projection.updatedAt,
    });

    return projection;
  }

  public getProjection(projectionKey: string): MicrodramaProjection | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT projection_key, projection_revision, projection_json, content_hash, updated_at FROM microdrama_projections WHERE projection_key = ?"
      )
      .get(projectionKey) as ProjectionRow | undefined;
    return row ? parseProjection(row) : null;
  }

  public exportBackupManifest(): MicrodramaBackupManifest {
    const artifactRows = this.sqlite.database
      .prepare(
        "SELECT artifact_hash, storage_uri FROM microdrama_artifact_references ORDER BY artifact_hash ASC"
      )
      .all() as Array<{ artifact_hash: string; storage_uri: string }>;

    return {
      schemaVersion: "mediaforge.microdrama-backup.v1",
      databaseFileName: path.basename(this.sqlite.config.dbPath),
      artifactReferences: artifactRows.map((row) => ({
        artifactHash: row.artifact_hash,
        storageUri: row.storage_uri,
      })),
      exportedAt: new Date().toISOString(),
    };
  }
}

export async function copyMicrodramaDatabaseBackup(
  source: SQLitePersistenceHost,
  targetDbPath: string
): Promise<void> {
  await fs.mkdir(path.dirname(targetDbPath), { recursive: true });
  await fs.rm(targetDbPath, { force: true });
  const escapedPath = targetDbPath.replace(/'/gu, "''");
  source.database.exec(`VACUUM INTO '${escapedPath}'`);
}

export async function writeMicrodramaBackupManifest(
  manifest: MicrodramaBackupManifest,
  targetPath: string
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(manifest, null, 2), "utf8");
}
