import {
  immutablePlanHash,
  normalizeRevisionAnalyticsObservation,
  type RevisionAnalyticsObservation,
} from "@mediaforge/domain";

import type { PostgresPool } from "./postgres-workflow-repository.js";

export const POSTGRES_REVISION_ANALYTICS_MIGRATION = `
CREATE TABLE IF NOT EXISTS revision_analytics_observations (
  workspace_id TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'revision-analytics-observation.v1'),
  content_profile_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  edition_revision_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  publication_revision BIGINT NOT NULL CHECK (publication_revision >= 0),
  locale TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  configuration_revision TEXT NOT NULL,
  dependency_identity JSONB NOT NULL,
  provenance_sha256 TEXT NOT NULL,
  metrics JSONB NOT NULL,
  provider_dispatch_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (provider_dispatch_enabled = FALSE),
  regeneration_rationale TEXT NOT NULL CHECK (regeneration_rationale = 'new-observation'),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  PRIMARY KEY (workspace_id, observation_id),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, content_profile_id, publication_id, publication_revision, observed_at)
);
CREATE OR REPLACE FUNCTION reject_revision_analytics_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'revision analytics observations are append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS revision_analytics_immutable ON revision_analytics_observations;
CREATE TRIGGER revision_analytics_immutable
  BEFORE UPDATE OR DELETE ON revision_analytics_observations
  FOR EACH ROW EXECUTE FUNCTION reject_revision_analytics_mutation();
ALTER TABLE revision_analytics_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_analytics_observations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_isolation ON revision_analytics_observations;
CREATE POLICY workspace_isolation ON revision_analytics_observations
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));`;

type AnalyticsRow = Record<string, unknown>;

function fingerprint(observation: RevisionAnalyticsObservation): string {
  const { regenerationRationale: _ignored, ...identity } = observation;
  return immutablePlanHash(identity);
}

function mapObservation(row: AnalyticsRow): RevisionAnalyticsObservation {
  return normalizeRevisionAnalyticsObservation({
    schemaVersion: row.schema_version,
    contentProfileId: row.content_profile_id,
    observationId: row.observation_id,
    episodeId: row.episode_id,
    editionRevisionId: row.edition_revision_id,
    publicationId: row.publication_id,
    publicationRevision: Number(row.publication_revision),
    locale: row.locale,
    observedAt: new Date(String(row.observed_at)).toISOString(),
    configurationRevision: row.configuration_revision,
    dependencyIdentity: row.dependency_identity,
    provenanceSha256: row.provenance_sha256,
    metrics: row.metrics,
    providerDispatchEnabled: row.provider_dispatch_enabled,
    regenerationRationale: row.regeneration_rationale,
  });
}

const returnedColumns = `
  schema_version, observation_id, content_profile_id, episode_id,
  edition_revision_id, publication_id, publication_revision, locale, observed_at,
  configuration_revision, dependency_identity, provenance_sha256, metrics,
  provider_dispatch_enabled, regeneration_rationale, request_fingerprint`;

export class RevisionAnalyticsConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RevisionAnalyticsConflictError";
  }
}

export class PostgresRevisionAnalyticsRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    await this.pool.query(POSTGRES_REVISION_ANALYTICS_MIGRATION);
  }

  public async append(input: {
    readonly workspaceId: string;
    readonly idempotencyKey: string;
    readonly observation: unknown;
  }): Promise<{
    readonly observation: RevisionAnalyticsObservation;
    readonly replayed: boolean;
  }> {
    const workspaceId = input.workspaceId.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (workspaceId.length < 3 || workspaceId.length > 160)
      throw new Error("Revision analytics requires a bounded workspace ID.");
    if (idempotencyKey.length < 3 || idempotencyKey.length > 255)
      throw new Error("Revision analytics requires a bounded idempotency key.");

    const supplied = normalizeRevisionAnalyticsObservation(input.observation);
    const observation = {
      ...supplied,
      regenerationRationale: "new-observation" as const,
    };
    const requestFingerprint = fingerprint(observation);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
      const inserted = await client.query<AnalyticsRow>(
        `INSERT INTO revision_analytics_observations (
           workspace_id, observation_id, schema_version, content_profile_id,
           episode_id, edition_revision_id, publication_id, publication_revision,
           locale, observed_at, configuration_revision, dependency_identity,
           provenance_sha256, metrics, provider_dispatch_enabled,
           regeneration_rationale, idempotency_key, request_fingerprint
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11,
           $12::jsonb, $13, $14::jsonb, FALSE, 'new-observation', $15, $16
         ) ON CONFLICT DO NOTHING
         RETURNING ${returnedColumns}`,
        [
          workspaceId,
          observation.observationId,
          observation.schemaVersion,
          observation.contentProfileId,
          observation.episodeId,
          observation.editionRevisionId,
          observation.publicationId,
          observation.publicationRevision,
          observation.locale,
          observation.observedAt,
          observation.configurationRevision,
          JSON.stringify(observation.dependencyIdentity),
          observation.provenanceSha256,
          JSON.stringify(observation.metrics),
          idempotencyKey,
          requestFingerprint,
        ],
      );
      const insertedRow = inserted.rows[0];
      if (insertedRow) {
        await client.query("COMMIT");
        return { observation: mapObservation(insertedRow), replayed: false };
      }

      const existing = await client.query<AnalyticsRow>(
        `SELECT ${returnedColumns}
         FROM revision_analytics_observations
         WHERE workspace_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [workspaceId, idempotencyKey],
      );
      const storedRow = existing.rows[0];
      if (!storedRow)
        throw new RevisionAnalyticsConflictError(
          "Revision analytics observation identity already exists.",
        );
      if (String(storedRow.request_fingerprint) !== requestFingerprint)
        throw new RevisionAnalyticsConflictError(
          "Revision analytics idempotency key conflicts with another request.",
        );
      await client.query("COMMIT");
      return { observation: mapObservation(storedRow), replayed: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
