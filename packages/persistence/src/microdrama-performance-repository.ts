import type { DatabaseSync } from "node:sqlite";

import {
  microdramaPerformanceObservationSchema,
  type MicrodramaPerformanceObservation,
} from "@mediaforge/domain";

import { FakeMicrodramaPerformanceRepository } from "./microdrama-performance-fake-repository.js";
import {
  type AppendPerformanceObservationInput,
  type AppendPerformanceObservationResult,
  type MicrodramaPerformancePort,
} from "./microdrama-performance-port.js";
import {
  MICRODRAMA_PERFORMANCE_SQLITE_MIGRATION,
  MICRODRAMA_PERFORMANCE_SQLITE_MIGRATION_ID,
} from "./microdrama-performance-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

function parseObservation(row: { observation_json: string }): MicrodramaPerformanceObservation {
  return microdramaPerformanceObservationSchema.parse(
    JSON.parse(row.observation_json)
  );
}

export class MicrodramaPerformanceRepository implements MicrodramaPerformancePort {
  private readonly fake = new FakeMicrodramaPerformanceRepository();

  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migratePerformance(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_PERFORMANCE_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_PERFORMANCE_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(MICRODRAMA_PERFORMANCE_SQLITE_MIGRATION_ID, new Date().toISOString());
    }
    this.fake.migratePerformance();
  }

  public appendObservation(
    input: AppendPerformanceObservationInput
  ): AppendPerformanceObservationResult {
    const result = this.fake.appendObservation(input);
    const observation = result.observation;
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_performance_observations (
          observation_id, series_id, episode_id, locale, provider,
          provider_account_id, publication_id, publication_revision,
          window_start, window_end, observed_at, idempotency_key,
          fingerprint, observation_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(idempotency_key) DO NOTHING`
      )
      .run(
        observation.observationId,
        observation.identity.seriesId,
        observation.identity.episodeId,
        observation.identity.locale,
        observation.identity.provider,
        observation.identity.providerAccountId,
        observation.identity.publicationId,
        observation.identity.publicationRevision,
        observation.identity.observationWindow.windowStart,
        observation.identity.observationWindow.windowEnd,
        observation.observedAt,
        observation.idempotencyKey,
        observation.fingerprint,
        JSON.stringify(observation)
      );
    return result;
  }

  public getObservationById(
    observationId: string
  ): MicrodramaPerformanceObservation | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT observation_json FROM microdrama_performance_observations WHERE observation_id = ?"
      )
      .get(observationId) as { observation_json: string } | undefined;
    return row ? parseObservation(row) : this.fake.getObservationById(observationId);
  }

  public getObservationByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaPerformanceObservation | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT observation_json FROM microdrama_performance_observations WHERE idempotency_key = ?"
      )
      .get(idempotencyKey) as { observation_json: string } | undefined;
    return row
      ? parseObservation(row)
      : this.fake.getObservationByIdempotencyKey(idempotencyKey);
  }

  public listObservationsByEpisode(input: {
    readonly seriesId: string;
    readonly episodeId: string;
    readonly locale?: string;
  }): readonly MicrodramaPerformanceObservation[] {
    return this.fake.listObservationsByEpisode(input);
  }
}
