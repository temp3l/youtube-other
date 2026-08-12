import type { DatabaseSync } from "node:sqlite";

import {
  attributeMicrodramaCost,
  evaluateMicrodramaBudgetPreflight,
  type MicrodramaBudgetCommitment,
  validateMicrodramaBudgetProfile,
  validateMicrodramaCostAttribution,
  type MicrodramaBudgetPreflight,
  type MicrodramaBudgetProfile,
  type MicrodramaBudgetReservation,
  microdramaBudgetProfileSchema,
  microdramaBudgetReservationSchema,
  microdramaCostAttributionSchema,
} from "@mediaforge/domain";

import {
  MICRODRAMA_BUDGET_SQLITE_MIGRATION,
  MICRODRAMA_BUDGET_SQLITE_MIGRATION_ID,
} from "./microdrama-budget-schema.js";
import {
  MicrodramaBudgetDuplicateAttributionError,
  type MicrodramaBudgetPort,
  type RecordMicrodramaCostAttributionInput,
  type UpsertMicrodramaBudgetProfileInput,
} from "./microdrama-budget-port.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

type ProfileRow = {
  profile_json: string;
};

type ReservationRow = {
  reservation_id: string;
  profile_id: string;
  revision_id: string;
  episode_id: string;
  locale: string | null;
  provider: string | null;
  task_id: string | null;
  reserved_minor: number;
  settled_minor: number | null;
  state: string;
  correlation_id: string;
  created_at: string;
  updated_at: string;
};

type AttributionRow = {
  attribution_id: string;
  episode_id: string;
  locale: string | null;
  provider: string;
  asset_type: string;
  asset_cost_scope: string;
  revision_id: string;
  reservation_id: string;
  cost_minor: number;
  cache_status: string;
  retry_count: number;
  correlation_id: string;
  request_id: string;
  evidence_json: string;
  recorded_at: string;
};

function parseProfile(row: ProfileRow): MicrodramaBudgetProfile {
  return microdramaBudgetProfileSchema.parse(JSON.parse(row.profile_json));
}

function parseReservation(row: ReservationRow): MicrodramaBudgetReservation {
  return microdramaBudgetReservationSchema.parse({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    reservationId: row.reservation_id,
    profileId: row.profile_id,
    revisionId: row.revision_id,
    episodeId: row.episode_id,
    locale: row.locale ?? undefined,
    provider: row.provider ?? undefined,
    taskId: row.task_id ?? undefined,
    reservedMinor: row.reserved_minor,
    settledMinor: row.settled_minor ?? undefined,
    state: row.state,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseAttribution(row: AttributionRow): MicrodramaCostAttribution {
  return microdramaCostAttributionSchema.parse({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    attributionId: row.attribution_id,
    episodeId: row.episode_id,
    locale: row.locale ?? undefined,
    provider: row.provider,
    assetType: row.asset_type,
    assetCostScope: row.asset_cost_scope,
    revisionId: row.revision_id,
    reservationId: row.reservation_id,
    costMinor: row.cost_minor,
    cacheStatus: row.cache_status,
    retryCount: row.retry_count,
    correlationId: row.correlation_id,
    requestId: row.request_id,
    recordedAt: row.recorded_at,
  });
}

export class MicrodramaBudgetRepository implements MicrodramaBudgetPort {
  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migrateBudgets(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_BUDGET_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_BUDGET_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(MICRODRAMA_BUDGET_SQLITE_MIGRATION_ID, new Date().toISOString());
    }
  }

  public upsertBudgetProfile(
    input: UpsertMicrodramaBudgetProfileInput
  ): MicrodramaBudgetProfile {
    const profile = validateMicrodramaBudgetProfile(input.profile);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_budget_profiles (
          profile_id, scope_kind, scope_id, limit_minor, enforcement, profile_json, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope_kind, scope_id) DO UPDATE SET
          profile_id = excluded.profile_id,
          limit_minor = excluded.limit_minor,
          enforcement = excluded.enforcement,
          profile_json = excluded.profile_json,
          registered_at = excluded.registered_at`
      )
      .run(
        profile.profileId,
        profile.scopeKind,
        profile.scopeId,
        profile.limitMinor,
        profile.enforcement,
        JSON.stringify(profile),
        profile.registeredAt
      );
    return profile;
  }

  public listBudgetProfiles(): readonly MicrodramaBudgetProfile[] {
    const rows = this.sqlite.database
      .prepare(
        "SELECT profile_json FROM microdrama_budget_profiles ORDER BY scope_kind, scope_id"
      )
      .all() as ProfileRow[];
    return rows.map(parseProfile);
  }

  public listBudgetCommitments(): readonly MicrodramaBudgetCommitment[] {
    const rows = this.sqlite.database
      .prepare(
        `SELECT profile_id,
                SUM(CASE WHEN state = 'reserved' THEN reserved_minor ELSE 0 END) AS reserved_minor,
                SUM(CASE WHEN state = 'settled' THEN COALESCE(settled_minor, reserved_minor) ELSE 0 END) AS settled_minor
         FROM microdrama_budget_reservations
         GROUP BY profile_id`
      )
      .all() as Array<{
      profile_id: string;
      reserved_minor: number | null;
      settled_minor: number | null;
    }>;
    return rows.map((row) => ({
      profileId: row.profile_id,
      reservedMinor: row.reserved_minor ?? 0,
      settledMinor: row.settled_minor ?? 0,
    }));
  }

  public recordPreflightReservations(
    preflight: MicrodramaBudgetPreflight
  ): readonly MicrodramaBudgetReservation[] {
    const database = this.sqlite.database;
    database.exec("BEGIN IMMEDIATE");
    try {
      const stored: MicrodramaBudgetReservation[] = [];
      for (const reservation of preflight.reservations) {
        database
          .prepare(
            `INSERT INTO microdrama_budget_reservations (
              reservation_id, profile_id, revision_id, episode_id, locale, provider, task_id,
              reserved_minor, settled_minor, state, correlation_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            reservation.reservationId,
            reservation.profileId,
            reservation.revisionId,
            reservation.episodeId,
            reservation.locale ?? null,
            reservation.provider ?? null,
            reservation.taskId ?? null,
            reservation.reservedMinor,
            reservation.settledMinor ?? null,
            reservation.state,
            reservation.correlationId,
            reservation.createdAt,
            reservation.updatedAt
          );
        stored.push(reservation);
      }
      database.exec("COMMIT");
      return stored;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  public recordCostAttribution(
    input: RecordMicrodramaCostAttributionInput
  ): MicrodramaCostAttribution | null {
    const attribution = validateMicrodramaCostAttribution(input.attribution);
    const existing = this.listCostAttributionsByRevision(attribution.revisionId);
    const decision = attributeMicrodramaCost({
      attribution,
      existingAttributions: existing,
    });
    if (!decision.record) {
      return null;
    }

    try {
      this.sqlite.database
        .prepare(
          `INSERT INTO microdrama_cost_attributions (
            attribution_id, episode_id, locale, provider, asset_type, asset_cost_scope,
            revision_id, reservation_id, cost_minor, cache_status, retry_count,
            correlation_id, request_id, evidence_json, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          decision.record.attributionId,
          decision.record.episodeId,
          decision.record.locale ?? null,
          decision.record.provider,
          decision.record.assetType,
          decision.record.assetCostScope,
          decision.record.revisionId,
          decision.record.reservationId,
          decision.record.costMinor,
          decision.record.cacheStatus,
          decision.record.retryCount,
          decision.record.correlationId,
          decision.record.requestId,
          JSON.stringify(input.evidence),
          decision.record.recordedAt
        );
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/u.test(error.message)
      ) {
        throw new MicrodramaBudgetDuplicateAttributionError(
          `Shared visual cost already recorded for ${decision.record.episodeId}`
        );
      }
      throw error;
    }
    return decision.record;
  }

  public listCostAttributionsByRevision(
    revisionId: string
  ): readonly MicrodramaCostAttribution[] {
    const rows = this.sqlite.database
      .prepare(
        `SELECT attribution_id, episode_id, locale, provider, asset_type, asset_cost_scope,
                revision_id, reservation_id, cost_minor, cache_status, retry_count,
                correlation_id, request_id, evidence_json, recorded_at
         FROM microdrama_cost_attributions
         WHERE revision_id = ?
         ORDER BY recorded_at ASC`
      )
      .all(revisionId) as AttributionRow[];
    return rows.map(parseAttribution);
  }

  public runBudgetPreflight(input: {
    readonly correlationId: string;
    readonly workItems: Parameters<
      typeof evaluateMicrodramaBudgetPreflight
    >[0]["workItems"];
    readonly evaluatedAt: string;
  }): MicrodramaBudgetPreflight {
    return evaluateMicrodramaBudgetPreflight({
      correlationId: input.correlationId,
      workItems: input.workItems,
      profiles: this.listBudgetProfiles(),
      commitments: this.listBudgetCommitments(),
      evaluatedAt: input.evaluatedAt,
    });
  }
}
