import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION = `
CREATE TABLE IF NOT EXISTS workspace_quota_policies (
  workspace_id TEXT PRIMARY KEY,
  budget_limit_minor BIGINT NOT NULL CHECK (budget_limit_minor >= 0),
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_reservations (
  workspace_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released')),
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, reservation_id),
  UNIQUE (workspace_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS audit_facts (
  workspace_id TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT NULL,
  data JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, audit_id),
  UNIQUE (workspace_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS usage_ledger (
  workspace_id TEXT NOT NULL,
  usage_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('usage', 'correction')),
  subject_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity_units BIGINT NOT NULL CHECK (quantity_units <> 0),
  cost_minor BIGINT NOT NULL,
  correction_of_usage_id TEXT NULL,
  attempt_id TEXT NULL,
  data JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, usage_id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, correction_of_usage_id) REFERENCES usage_ledger (workspace_id, usage_id),
  CHECK ((kind = 'usage' AND correction_of_usage_id IS NULL AND quantity_units > 0 AND cost_minor >= 0)
    OR (kind = 'correction' AND correction_of_usage_id IS NOT NULL))
);
CREATE OR REPLACE FUNCTION reject_usage_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% records are append-only', TG_ARGV[0] USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_facts_immutable ON audit_facts;
CREATE TRIGGER audit_facts_immutable BEFORE UPDATE OR DELETE ON audit_facts
  FOR EACH ROW EXECUTE FUNCTION reject_usage_audit_mutation('audit');
DROP TRIGGER IF EXISTS usage_ledger_immutable ON usage_ledger;
CREATE TRIGGER usage_ledger_immutable BEFORE UPDATE OR DELETE ON usage_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_usage_audit_mutation('usage');
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workspace_quota_policies', 'budget_reservations', 'audit_facts', 'usage_ledger']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))',
      table_name
    );
  END LOOP;
END;
$$;
`;

export interface BudgetReservationRecord {
  readonly workspaceId: string;
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly amountMinor: bigint;
  readonly state: "reserved" | "settled" | "released";
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkspaceQuotaStatusRecord {
  readonly workspaceId: string;
  readonly budgetLimitMinor: bigint;
  readonly reservedMinor: bigint;
  readonly settledMinor: bigint;
  readonly availableMinor: bigint;
  readonly revision: number;
}

export interface AuditFactRecord {
  readonly auditId: string;
  readonly action: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly data: unknown;
  readonly occurredAt: string;
}

export interface UsageLedgerRecord {
  readonly usageId: string;
  readonly kind: "usage" | "correction";
  readonly subjectId: string;
  readonly operation: string;
  readonly unit: string;
  readonly quantityUnits: bigint;
  readonly costMinor: bigint;
  readonly correctionOfUsageId: string | null;
  readonly attemptId: string | null;
  readonly data: unknown;
  readonly occurredAt: string;
}

interface ReservationRow {
  readonly workspace_id: string;
  readonly reservation_id: string;
  readonly idempotency_key: string;
  readonly amount_minor: bigint | string;
  readonly state: "reserved" | "settled" | "released";
  readonly revision: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface PolicyRow {
  readonly budget_limit_minor: bigint | string;
}

interface TotalRow {
  readonly committed_minor: bigint | string;
}

export class UsageAuditQuotaPersistenceError extends Error {}
export class WorkspaceQuotaExceededError extends UsageAuditQuotaPersistenceError {}

function timestamp(value: Date | string): string {
  return new Date(value).toISOString();
}

function mapReservation(row: ReservationRow): BudgetReservationRecord {
  return {
    workspaceId: row.workspace_id,
    reservationId: row.reservation_id,
    idempotencyKey: row.idempotency_key,
    amountMinor: BigInt(row.amount_minor),
    state: row.state,
    revision: Number(row.revision),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function first<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new UsageAuditQuotaPersistenceError(message);
  return value;
}

function positive(value: bigint, name: string): void {
  if (value <= 0n) throw new UsageAuditQuotaPersistenceError(`${name} must use positive integer minor units.`);
}

export class PostgresUsageAuditRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_USAGE_AUDIT_QUOTA_MIGRATION);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async transaction<T>(workspaceId: string, work: (client: PostgresClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async setQuotaPolicy(input: {
    readonly workspaceId: string;
    readonly budgetLimitMinor: bigint;
    readonly expectedRevision?: number;
    readonly now: string;
  }): Promise<{ readonly budgetLimitMinor: bigint; readonly revision: number }> {
    if (input.budgetLimitMinor < 0n)
      throw new UsageAuditQuotaPersistenceError("Budget limit cannot be negative.");
    return this.transaction(input.workspaceId, async (client) => {
      const result = input.expectedRevision === undefined
        ? await client.query<{ readonly budget_limit_minor: bigint | string; readonly revision: number | string }>(
          `INSERT INTO workspace_quota_policies (workspace_id, budget_limit_minor, updated_at)
           VALUES ($1, $2, $3::timestamptz)
           ON CONFLICT (workspace_id) DO NOTHING
           RETURNING budget_limit_minor, revision`,
          [input.workspaceId, input.budgetLimitMinor, input.now]
        )
        : await client.query<{ readonly budget_limit_minor: bigint | string; readonly revision: number | string }>(
          `UPDATE workspace_quota_policies
           SET budget_limit_minor = $1, revision = revision + 1, updated_at = $2::timestamptz
           WHERE workspace_id = $3 AND revision = $4
           RETURNING budget_limit_minor, revision`,
          [input.budgetLimitMinor, input.now, input.workspaceId, input.expectedRevision]
        );
      const policy = first(result, "Quota policy already exists or its revision is stale.");
      return { budgetLimitMinor: BigInt(policy.budget_limit_minor), revision: Number(policy.revision) };
    });
  }

  public async getQuotaStatus(
    workspaceId: string
  ): Promise<WorkspaceQuotaStatusRecord | null> {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query<{
        readonly budget_limit_minor: bigint | string;
        readonly revision: number | string;
        readonly reserved_minor: bigint | string;
        readonly settled_minor: bigint | string;
      }>(
        `SELECT policy.budget_limit_minor, policy.revision,
                COALESCE(SUM(reservation.amount_minor) FILTER (WHERE reservation.state = 'reserved'), 0)::bigint AS reserved_minor,
                COALESCE(SUM(reservation.amount_minor) FILTER (WHERE reservation.state = 'settled'), 0)::bigint AS settled_minor
         FROM workspace_quota_policies AS policy
         LEFT JOIN budget_reservations AS reservation
           ON reservation.workspace_id = policy.workspace_id
         WHERE policy.workspace_id = $1
         GROUP BY policy.workspace_id, policy.budget_limit_minor, policy.revision`,
        [workspaceId]
      );
      const record = result.rows[0];
      if (!record) return null;
      const budgetLimitMinor = BigInt(record.budget_limit_minor);
      const reservedMinor = BigInt(record.reserved_minor);
      const settledMinor = BigInt(record.settled_minor);
      return {
        workspaceId,
        budgetLimitMinor,
        reservedMinor,
        settledMinor,
        availableMinor:
          budgetLimitMinor > reservedMinor + settledMinor
            ? budgetLimitMinor - reservedMinor - settledMinor
            : 0n,
        revision: Number(record.revision),
      };
    });
  }

  /** The locked policy row serializes every reservation decision in one workspace. */
  public async reserve(input: {
    readonly workspaceId: string;
    readonly reservationId: string;
    readonly idempotencyKey: string;
    readonly amountMinor: bigint;
    readonly now: string;
  }): Promise<{ readonly replayed: boolean; readonly reservation: BudgetReservationRecord }> {
    positive(input.amountMinor, "Reservation amount");
    return this.transaction(input.workspaceId, async (client) => {
      const policy = first(await client.query<PolicyRow>(
        `SELECT budget_limit_minor FROM workspace_quota_policies
         WHERE workspace_id = $1 FOR UPDATE`,
        [input.workspaceId]
      ), "Workspace quota policy is not configured.");
      const existing = await client.query<ReservationRow>(
        `SELECT * FROM budget_reservations
         WHERE workspace_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [input.workspaceId, input.idempotencyKey]
      );
      if (existing.rows[0]) {
        const reservation = mapReservation(existing.rows[0]);
        if (reservation.reservationId !== input.reservationId || reservation.amountMinor !== input.amountMinor)
          throw new UsageAuditQuotaPersistenceError("Idempotency key conflicts with another budget reservation.");
        return { replayed: true, reservation };
      }
      const totals = first(await client.query<TotalRow>(
        `SELECT COALESCE(SUM(amount_minor), 0)::bigint AS committed_minor
         FROM budget_reservations
         WHERE workspace_id = $1 AND state IN ('reserved', 'settled')`,
        [input.workspaceId]
      ), "Workspace budget total could not be read.");
      if (BigInt(totals.committed_minor) + input.amountMinor > BigInt(policy.budget_limit_minor))
        throw new WorkspaceQuotaExceededError("Workspace budget quota is exceeded.");
      const inserted = await client.query<ReservationRow>(
        `INSERT INTO budget_reservations (
           workspace_id, reservation_id, idempotency_key, amount_minor, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)
         RETURNING *`,
        [input.workspaceId, input.reservationId, input.idempotencyKey, input.amountMinor, input.now]
      );
      return { replayed: false, reservation: mapReservation(first(inserted, "Budget reservation could not be created.")) };
    });
  }

  public async settleOrRelease(input: {
    readonly workspaceId: string;
    readonly reservationId: string;
    readonly expectedRevision: number;
    readonly state: "settled" | "released";
    readonly now: string;
  }): Promise<BudgetReservationRecord> {
    return this.transaction(input.workspaceId, async (client) => mapReservation(first(await client.query<ReservationRow>(
      `UPDATE budget_reservations
       SET state = $1, revision = revision + 1, updated_at = $2::timestamptz
       WHERE workspace_id = $3 AND reservation_id = $4 AND revision = $5 AND state = 'reserved'
       RETURNING *`,
      [input.state, input.now, input.workspaceId, input.reservationId, input.expectedRevision]
    ), "Budget reservation was missing, stale, or no longer reserved.")));
  }

  public async appendAuditFact(input: {
    readonly workspaceId: string;
    readonly auditId: string;
    readonly idempotencyKey: string;
    readonly action: string;
    readonly subjectId: string;
    readonly actorId: string;
    readonly correlationId: string;
    readonly causationId?: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly occurredAt: string;
  }): Promise<boolean> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{ readonly audit_id: string }>(
        `INSERT INTO audit_facts (
           workspace_id, audit_id, idempotency_key, action, subject_id, actor_id,
           correlation_id, causation_id, data, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
         RETURNING audit_id`,
        [input.workspaceId, input.auditId, input.idempotencyKey, input.action, input.subjectId, input.actorId, input.correlationId, input.causationId ?? null, JSON.stringify(input.data), input.occurredAt]
      );
      return result.rows[0] !== undefined;
    });
  }

  public async appendUsage(input: {
    readonly workspaceId: string;
    readonly usageId: string;
    readonly idempotencyKey: string;
    readonly kind: "usage" | "correction";
    readonly subjectId: string;
    readonly operation: string;
    readonly unit: string;
    readonly quantityUnits: bigint;
    readonly costMinor: bigint;
    readonly correctionOfUsageId?: string;
    readonly attemptId?: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly occurredAt: string;
  }): Promise<boolean> {
    if (input.quantityUnits === 0n || (input.kind === "usage" && (input.quantityUnits < 0n || input.costMinor < 0n)) ||
      (input.kind === "correction") !== (input.correctionOfUsageId !== undefined))
      throw new UsageAuditQuotaPersistenceError("Usage and correction quantities are invalid.");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{ readonly usage_id: string }>(
        `INSERT INTO usage_ledger (
           workspace_id, usage_id, idempotency_key, kind, subject_id, operation, unit,
           quantity_units, cost_minor, correction_of_usage_id, attempt_id, data, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::timestamptz)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
         RETURNING usage_id`,
        [input.workspaceId, input.usageId, input.idempotencyKey, input.kind, input.subjectId, input.operation, input.unit, input.quantityUnits, input.costMinor, input.correctionOfUsageId ?? null, input.attemptId ?? null, JSON.stringify(input.data), input.occurredAt]
      );
      return result.rows[0] !== undefined;
    });
  }

  public async listAuditFacts(input: {
    readonly workspaceId: string;
    readonly after?: { readonly occurredAt: string; readonly auditId: string };
    readonly size: number;
  }): Promise<readonly AuditFactRecord[]> {
    this.assertPageSize(input.size);
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{
        readonly audit_id: string;
        readonly action: string;
        readonly subject_id: string;
        readonly actor_id: string;
        readonly correlation_id: string;
        readonly causation_id: string | null;
        readonly data: unknown;
        readonly occurred_at: Date | string;
      }>(
        `SELECT audit_id, action, subject_id, actor_id, correlation_id,
                causation_id, data, occurred_at
         FROM audit_facts
         WHERE workspace_id = $1
           AND ($2::timestamptz IS NULL OR (occurred_at, audit_id) > ($2::timestamptz, $3::text))
         ORDER BY occurred_at, audit_id LIMIT $4`,
        [
          input.workspaceId,
          input.after?.occurredAt ?? null,
          input.after?.auditId ?? "",
          input.size,
        ]
      );
      return result.rows.map((record) => ({
        auditId: record.audit_id,
        action: record.action,
        subjectId: record.subject_id,
        actorId: record.actor_id,
        correlationId: record.correlation_id,
        causationId: record.causation_id,
        data: record.data,
        occurredAt: timestamp(record.occurred_at),
      }));
    });
  }

  public async listUsage(input: {
    readonly workspaceId: string;
    readonly after?: { readonly occurredAt: string; readonly usageId: string };
    readonly size: number;
  }): Promise<readonly UsageLedgerRecord[]> {
    this.assertPageSize(input.size);
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{
        readonly usage_id: string;
        readonly kind: "usage" | "correction";
        readonly subject_id: string;
        readonly operation: string;
        readonly unit: string;
        readonly quantity_units: bigint | string;
        readonly cost_minor: bigint | string;
        readonly correction_of_usage_id: string | null;
        readonly attempt_id: string | null;
        readonly data: unknown;
        readonly occurred_at: Date | string;
      }>(
        `SELECT usage_id, kind, subject_id, operation, unit, quantity_units,
                cost_minor, correction_of_usage_id, attempt_id, data, occurred_at
         FROM usage_ledger
         WHERE workspace_id = $1
           AND ($2::timestamptz IS NULL OR (occurred_at, usage_id) > ($2::timestamptz, $3::text))
         ORDER BY occurred_at, usage_id LIMIT $4`,
        [
          input.workspaceId,
          input.after?.occurredAt ?? null,
          input.after?.usageId ?? "",
          input.size,
        ]
      );
      return result.rows.map((record) => ({
        usageId: record.usage_id,
        kind: record.kind,
        subjectId: record.subject_id,
        operation: record.operation,
        unit: record.unit,
        quantityUnits: BigInt(record.quantity_units),
        costMinor: BigInt(record.cost_minor),
        correctionOfUsageId: record.correction_of_usage_id,
        attemptId: record.attempt_id,
        data: record.data,
        occurredAt: timestamp(record.occurred_at),
      }));
    });
  }

  private assertPageSize(size: number): void {
    if (!Number.isSafeInteger(size) || size < 1 || size > 100)
      throw new UsageAuditQuotaPersistenceError(
        "Usage and audit page size must be between 1 and 100."
      );
  }
}
