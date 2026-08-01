import { describe, expect, it, vi } from "vitest";

import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";
import {
  POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION,
  PostgresUsageAuditRepository,
  WorkspaceQuotaExceededError,
  WorkspaceQuotaPolicyMissingError,
} from "./postgres-usage-audit-repository.js";

type Query = { readonly sql: string; readonly values?: readonly unknown[] };

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "workspace-1",
    reservation_id: "reservation-1",
    idempotency_key: "admit-1",
    amount_minor: "30",
    state: "reserved",
    revision: 0,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function dimensionReservation(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "workspace-1",
    reservation_id: "provider-reservation-1",
    dimension: "provider_budget_minor",
    attribution_key: "provider-attempt-1",
    subject_id: "run-1",
    attempt_id: "attempt-1",
    reserved_units: "30",
    settled_units: null,
    state: "reserved",
    revision: 0,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function fakePool(
  handler: (
    sql: string,
    values?: readonly unknown[]
  ) => PostgresQueryResult<unknown> = () => ({ rows: [] })
) {
  const queries: Query[] = [];
  const client: PostgresClient = {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, ...(values ? { values } : {}) });
      return handler(sql, values) as PostgresQueryResult<T>;
    },
    release: vi.fn(),
  };
  const pool: PostgresPool = {
    connect: async () => client,
    query: async <T>() => ({ rows: [] as T[] }),
    end: async () => undefined,
  };
  return { pool, client, queries };
}

describe("Postgres usage, audit, and quota repository", () => {
  it("defines bigint tenant authority with immutable ledgers and idempotency", async () => {
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "amount_minor BIGINT NOT NULL CHECK (amount_minor > 0)"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "UNIQUE (workspace_id, idempotency_key)"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "usage_ledger_immutable"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "audit_facts_immutable"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "FORCE ROW LEVEL SECURITY"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "workspace_quota_dimensions"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain("active_workflows");
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "provider_budget_minor"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).toContain(
      "quota_provider_attempt_attribution_unique"
    );
    expect(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION).not.toMatch(
      /DOUBLE PRECISION|\bREAL\b/u
    );

    const fake = fakePool();
    await new PostgresUsageAuditRepository(fake.pool).migrate();
    expect(fake.queries.map(({ sql }) => sql)).toEqual([
      "BEGIN",
      POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION,
      "COMMIT",
    ]);
    expect(fake.client.release).toHaveBeenCalledOnce();
  });

  it("fails closed without a dimension policy and serializes configured reservations", async () => {
    const missing = fakePool((sql) =>
      sql.includes("FROM workspace_quota_dimensions")
        ? { rows: [] }
        : { rows: [] }
    );
    await expect(
      new PostgresUsageAuditRepository(missing.pool).reserveQuotaDimension({
        workspaceId: "workspace-1",
        reservationId: "workflow:run-1",
        dimension: "active_workflows",
        attributionKey: "workflow-admission:key-1",
        subjectId: "run-1",
        units: 1n,
        now: "2026-08-01T12:00:00.000Z",
      })
    ).rejects.toBeInstanceOf(WorkspaceQuotaPolicyMissingError);
    expect(missing.queries.at(-1)?.sql).toBe("ROLLBACK");

    const configured = fakePool((sql) => {
      if (sql.includes("FROM workspace_quota_dimensions"))
        return { rows: [{ limit_units: "2", revision: 0 }] };
      if (
        sql.includes("FROM quota_dimension_reservations") &&
        sql.includes("attribution_key")
      )
        return { rows: [] };
      if (sql.includes("AS committed_units"))
        return { rows: [{ committed_units: "1" }] };
      if (sql.includes("INSERT INTO quota_dimension_reservations"))
        return {
          rows: [
            dimensionReservation({
              reservation_id: "workflow:run-2",
              dimension: "active_workflows",
              attribution_key: "workflow-admission:key-2",
              subject_id: "run-2",
              attempt_id: null,
              reserved_units: "1",
            }),
          ],
        };
      return { rows: [] };
    });
    await expect(
      new PostgresUsageAuditRepository(configured.pool).reserveQuotaDimension({
        workspaceId: "workspace-1",
        reservationId: "workflow:run-2",
        dimension: "active_workflows",
        attributionKey: "workflow-admission:key-2",
        subjectId: "run-2",
        units: 1n,
        now: "2026-08-01T12:00:00.000Z",
      })
    ).resolves.toMatchObject({
      replayed: false,
      reservation: { dimension: "active_workflows", reservedUnits: 1n },
    });
    const policyLock = configured.queries.find(({ sql }) =>
      sql.includes("FROM workspace_quota_dimensions")
    )!;
    expect(policyLock.sql).toContain("FOR UPDATE");
  });

  it("attributes provider reservations idempotently per attempt and enforces the cap", async () => {
    const replay = fakePool((sql) => {
      if (sql.includes("FROM workspace_quota_dimensions"))
        return { rows: [{ limit_units: "100", revision: 0 }] };
      if (sql.includes("attribution_key = $3"))
        return { rows: [dimensionReservation()] };
      return { rows: [] };
    });
    await expect(
      new PostgresUsageAuditRepository(replay.pool).reserveQuotaDimension({
        workspaceId: "workspace-1",
        reservationId: "provider-reservation-1",
        dimension: "provider_budget_minor",
        attributionKey: "provider-attempt-1",
        subjectId: "run-1",
        attemptId: "attempt-1",
        units: 30n,
        now: "2026-08-01T12:01:00.000Z",
      })
    ).resolves.toMatchObject({ replayed: true });
    expect(
      replay.queries.some(({ sql }) => sql.includes("AS committed_units"))
    ).toBe(false);

    const exceeded = fakePool((sql) => {
      if (sql.includes("FROM workspace_quota_dimensions"))
        return { rows: [{ limit_units: "100", revision: 0 }] };
      if (sql.includes("attribution_key = $3")) return { rows: [] };
      if (sql.includes("AS committed_units"))
        return { rows: [{ committed_units: "80" }] };
      return { rows: [] };
    });
    await expect(
      new PostgresUsageAuditRepository(exceeded.pool).reserveQuotaDimension({
        workspaceId: "workspace-1",
        reservationId: "provider-reservation-2",
        dimension: "provider_budget_minor",
        attributionKey: "provider-attempt-2",
        subjectId: "run-1",
        attemptId: "attempt-2",
        units: 30n,
        now: "2026-08-01T12:01:00.000Z",
      })
    ).rejects.toBeInstanceOf(WorkspaceQuotaExceededError);
    expect(
      exceeded.queries.some(({ sql }) =>
        sql.includes("INSERT INTO quota_dimension_reservations")
      )
    ).toBe(false);
  });

  it("settles provider attempts once and releases active-workflow capacity", async () => {
    const settlement = fakePool((sql) => {
      if (sql.includes("FROM workspace_quota_dimensions"))
        return { rows: [{ limit_units: "100", revision: 0 }] };
      if (sql.includes("WHERE workspace_id = $1 AND reservation_id = $2"))
        return { rows: [dimensionReservation()] };
      if (sql.includes("AS committed_units"))
        return { rows: [{ committed_units: "20" }] };
      if (sql.startsWith("UPDATE quota_dimension_reservations"))
        return {
          rows: [
            dimensionReservation({
              state: "settled",
              settled_units: "25",
              revision: 1,
            }),
          ],
          rowCount: 1,
        };
      return { rows: [] };
    });
    await expect(
      new PostgresUsageAuditRepository(settlement.pool).settleQuotaDimension({
        workspaceId: "workspace-1",
        reservationId: "provider-reservation-1",
        attemptId: "attempt-1",
        settledUnits: 25n,
        now: "2026-08-01T12:02:00.000Z",
      })
    ).resolves.toMatchObject({
      replayed: false,
      reservation: { state: "settled", settledUnits: 25n },
    });

    const release = fakePool((sql) => {
      if (sql.startsWith("SELECT * FROM quota_dimension_reservations"))
        return {
          rows: [
            dimensionReservation({
              reservation_id: "workflow:run-1",
              dimension: "active_workflows",
              attribution_key: "workflow-admission:key-1",
              attempt_id: null,
              reserved_units: "1",
            }),
          ],
        };
      if (sql.startsWith("UPDATE quota_dimension_reservations"))
        return {
          rows: [
            dimensionReservation({
              reservation_id: "workflow:run-1",
              dimension: "active_workflows",
              attribution_key: "workflow-admission:key-1",
              attempt_id: null,
              reserved_units: "1",
              state: "released",
              revision: 1,
            }),
          ],
          rowCount: 1,
        };
      return { rows: [] };
    });
    await expect(
      new PostgresUsageAuditRepository(release.pool).releaseQuotaDimension({
        workspaceId: "workspace-1",
        reservationId: "workflow:run-1",
        expectedRevision: 0,
        now: "2026-08-01T12:03:00.000Z",
      })
    ).resolves.toMatchObject({
      replayed: false,
      reservation: { dimension: "active_workflows", state: "released" },
    });
  });

  it("locks the workspace policy before admitting an in-cap reservation", async () => {
    const fake = fakePool((sql) => {
      if (sql.includes("SELECT budget_limit_minor"))
        return { rows: [{ budget_limit_minor: "100" }] };
      if (sql.includes("idempotency_key = $2 FOR UPDATE")) return { rows: [] };
      if (sql.includes("SUM(amount_minor)"))
        return { rows: [{ committed_minor: "60" }] };
      if (sql.includes("INSERT INTO budget_reservations"))
        return { rows: [reservation()] };
      return { rows: [] };
    });
    const result = await new PostgresUsageAuditRepository(fake.pool).reserve({
      workspaceId: "workspace-1",
      reservationId: "reservation-1",
      idempotencyKey: "admit-1",
      amountMinor: 30n,
      now: "2026-08-01T12:00:00.000Z",
    });
    expect(result).toMatchObject({
      replayed: false,
      reservation: { amountMinor: 30n },
    });
    const policyLock = fake.queries.findIndex(({ sql }) =>
      sql.includes("SELECT budget_limit_minor")
    );
    const total = fake.queries.findIndex(({ sql }) =>
      sql.includes("SUM(amount_minor)")
    );
    expect(fake.queries[policyLock]!.sql).toContain("FOR UPDATE");
    expect(policyLock).toBeLessThan(total);
  });

  it("replays an equal reservation without consuming quota twice", async () => {
    const fake = fakePool((sql) => {
      if (sql.includes("SELECT budget_limit_minor"))
        return { rows: [{ budget_limit_minor: "100" }] };
      if (sql.includes("idempotency_key = $2 FOR UPDATE"))
        return { rows: [reservation()] };
      return { rows: [] };
    });
    const result = await new PostgresUsageAuditRepository(fake.pool).reserve({
      workspaceId: "workspace-1",
      reservationId: "reservation-1",
      idempotencyKey: "admit-1",
      amountMinor: 30n,
      now: "2026-08-01T12:01:00.000Z",
    });
    expect(result.replayed).toBe(true);
    expect(
      fake.queries.some(({ sql }) => sql.includes("SUM(amount_minor)"))
    ).toBe(false);
    expect(
      fake.queries.some(({ sql }) =>
        sql.includes("INSERT INTO budget_reservations")
      )
    ).toBe(false);
  });

  it("rejects conflicting replay and over-cap reservations with rollback", async () => {
    const conflict = fakePool((sql) => {
      if (sql.includes("SELECT budget_limit_minor"))
        return { rows: [{ budget_limit_minor: "100" }] };
      if (sql.includes("idempotency_key = $2 FOR UPDATE"))
        return { rows: [reservation()] };
      return { rows: [] };
    });
    await expect(
      new PostgresUsageAuditRepository(conflict.pool).reserve({
        workspaceId: "workspace-1",
        reservationId: "reservation-1",
        idempotencyKey: "admit-1",
        amountMinor: 31n,
        now: "2026-08-01T12:00:00.000Z",
      })
    ).rejects.toThrow(/conflicts/u);
    expect(conflict.queries.at(-1)?.sql).toBe("ROLLBACK");

    const exceeded = fakePool((sql) => {
      if (sql.includes("SELECT budget_limit_minor"))
        return { rows: [{ budget_limit_minor: "100" }] };
      if (sql.includes("idempotency_key = $2 FOR UPDATE")) return { rows: [] };
      if (sql.includes("SUM(amount_minor)"))
        return { rows: [{ committed_minor: "80" }] };
      return { rows: [] };
    });
    await expect(
      new PostgresUsageAuditRepository(exceeded.pool).reserve({
        workspaceId: "workspace-1",
        reservationId: "reservation-2",
        idempotencyKey: "admit-2",
        amountMinor: 30n,
        now: "2026-08-01T12:00:00.000Z",
      })
    ).rejects.toThrow(/exceeded/u);
    expect(
      exceeded.queries.some(({ sql }) =>
        sql.includes("INSERT INTO budget_reservations")
      )
    ).toBe(false);
  });

  it("guards settlement and release by reserved state and revision", async () => {
    const fake = fakePool((sql) =>
      sql.includes("UPDATE budget_reservations")
        ? { rows: [reservation({ state: "settled", revision: 1 })] }
        : { rows: [] }
    );
    const result = await new PostgresUsageAuditRepository(
      fake.pool
    ).settleOrRelease({
      workspaceId: "workspace-1",
      reservationId: "reservation-1",
      expectedRevision: 0,
      state: "settled",
      now: "2026-08-01T12:02:00.000Z",
    });
    expect(result).toMatchObject({ state: "settled", revision: 1 });
    const update = fake.queries.find(({ sql }) =>
      sql.includes("UPDATE budget_reservations")
    )!;
    expect(update.sql).toContain("revision = $5 AND state = 'reserved'");
  });

  it("appends idempotent audit, usage, and correction facts without floating point", async () => {
    const fake = fakePool((sql) => {
      if (sql.includes("INSERT INTO audit_facts"))
        return { rows: [{ audit_id: "audit-1" }] };
      if (sql.includes("INSERT INTO usage_ledger"))
        return { rows: [{ usage_id: "usage-1" }] };
      return { rows: [] };
    });
    const repository = new PostgresUsageAuditRepository(fake.pool);
    await expect(
      repository.appendAuditFact({
        workspaceId: "workspace-1",
        auditId: "audit-1",
        idempotencyKey: "audit-command-1",
        action: "workflow.admitted",
        subjectId: "run-1",
        actorId: "user-1",
        correlationId: "correlation-1",
        data: {},
        occurredAt: "2026-08-01T12:00:00.000Z",
      })
    ).resolves.toBe(true);
    await expect(
      repository.appendUsage({
        workspaceId: "workspace-1",
        usageId: "usage-1",
        idempotencyKey: "provider-attempt-1",
        kind: "usage",
        subjectId: "run-1",
        operation: "provider.tokens",
        unit: "token",
        quantityUnits: 1200n,
        costMinor: 3n,
        attemptId: "attempt-1",
        data: {},
        occurredAt: "2026-08-01T12:00:01.000Z",
      })
    ).resolves.toBe(true);
    await expect(
      repository.appendUsage({
        workspaceId: "workspace-1",
        usageId: "correction-1",
        idempotencyKey: "correction-command-1",
        kind: "correction",
        subjectId: "run-1",
        operation: "provider.tokens",
        unit: "token",
        quantityUnits: -100n,
        costMinor: -1n,
        correctionOfUsageId: "usage-1",
        data: {},
        occurredAt: "2026-08-01T12:01:00.000Z",
      })
    ).resolves.toBe(true);
    const usageValues = fake.queries
      .filter(({ sql }) => sql.includes("INSERT INTO usage_ledger"))
      .map(({ values }) => values);
    expect(usageValues[0]?.[7]).toBe(1200n);
    expect(usageValues[1]?.[7]).toBe(-100n);
    expect(
      fake.queries.filter(({ sql }) =>
        sql.includes("ON CONFLICT (workspace_id, idempotency_key)")
      )
    ).toHaveLength(3);
  });

  it("reads quota status and cursor-paginates immutable audit and usage facts", async () => {
    const fake = fakePool((sql) => {
      if (sql.includes("FROM workspace_quota_policies AS policy"))
        return {
          rows: [
            {
              budget_limit_minor: "100",
              revision: 2,
              reserved_minor: "30",
              settled_minor: "50",
            },
          ],
        };
      if (sql.includes("FROM audit_facts"))
        return {
          rows: [
            {
              audit_id: "audit-1",
              action: "workflow.admitted",
              subject_id: "run-1",
              actor_id: "user-1",
              correlation_id: "request-1",
              causation_id: null,
              data: {},
              occurred_at: "2026-08-01T12:00:00.000Z",
            },
          ],
        };
      if (sql.includes("FROM usage_ledger"))
        return {
          rows: [
            {
              usage_id: "usage-1",
              kind: "usage",
              subject_id: "run-1",
              operation: "provider.tokens",
              unit: "token",
              quantity_units: "1200",
              cost_minor: "3",
              correction_of_usage_id: null,
              attempt_id: "attempt-1",
              data: {},
              occurred_at: "2026-08-01T12:01:00.000Z",
            },
          ],
        };
      return { rows: [] };
    });
    const repository = new PostgresUsageAuditRepository(fake.pool);

    await expect(
      repository.getQuotaStatus("workspace-1")
    ).resolves.toMatchObject({
      budgetLimitMinor: 100n,
      reservedMinor: 30n,
      settledMinor: 50n,
      availableMinor: 20n,
    });
    await expect(
      repository.listAuditFacts({ workspaceId: "workspace-1", size: 25 })
    ).resolves.toMatchObject([{ auditId: "audit-1" }]);
    await expect(
      repository.listUsage({ workspaceId: "workspace-1", size: 25 })
    ).resolves.toMatchObject([{ usageId: "usage-1", quantityUnits: 1200n }]);
    expect(
      fake.queries.some(({ sql }) =>
        sql.includes("ORDER BY occurred_at, audit_id")
      )
    ).toBe(true);
    expect(
      fake.queries.some(({ sql }) =>
        sql.includes("ORDER BY occurred_at, usage_id")
      )
    ).toBe(true);
  });
});
