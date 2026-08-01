import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_WEBHOOK_MIGRATION = `
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  workspace_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_version BIGINT NOT NULL CHECK (secret_version > 0),
  secret_handle TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  event_filters JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(event_filters) = 'array'),
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, endpoint_id)
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  workspace_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'delivered', 'dead_letter')),
  revision BIGINT NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ NULL,
  dead_lettered_at TIMESTAMPTZ NULL,
  last_status INTEGER NULL CHECK (last_status BETWEEN 100 AND 599),
  last_error TEXT NULL,
  replay_of_delivery_id TEXT NULL,
  lease_owner TEXT NULL,
  lease_fence BIGINT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, delivery_id),
  FOREIGN KEY (workspace_id, endpoint_id) REFERENCES webhook_endpoints (workspace_id, endpoint_id),
  FOREIGN KEY (workspace_id, replay_of_delivery_id) REFERENCES webhook_deliveries (workspace_id, delivery_id)
);
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS event_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS lease_owner TEXT NULL;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS lease_fence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL;
CREATE UNIQUE INDEX IF NOT EXISTS webhook_initial_delivery_event_unique
  ON webhook_deliveries (workspace_id, endpoint_id, event_id)
  WHERE replay_of_delivery_id IS NULL;
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx
  ON webhook_deliveries (workspace_id, next_attempt_at, delivery_id)
  WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS webhook_deliveries_claim_due_idx
  ON webhook_deliveries (workspace_id, next_attempt_at, lease_expires_at, delivery_id)
  WHERE state = 'pending';
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  workspace_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('delivered', 'retry', 'dead_letter')),
  response_status INTEGER NULL CHECK (response_status BETWEEN 100 AND 599),
  error TEXT NULL,
  attempted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, delivery_id, attempt_number),
  FOREIGN KEY (workspace_id, delivery_id) REFERENCES webhook_deliveries (workspace_id, delivery_id)
);
CREATE OR REPLACE FUNCTION reject_webhook_attempt_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'webhook delivery attempts are append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS webhook_delivery_attempts_immutable ON webhook_delivery_attempts;
CREATE TRIGGER webhook_delivery_attempts_immutable
  BEFORE UPDATE OR DELETE ON webhook_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_webhook_attempt_mutation();
CREATE OR REPLACE FUNCTION enqueue_webhook_deliveries_from_workflow_event() RETURNS trigger AS $$
BEGIN
  INSERT INTO webhook_deliveries (
    workspace_id, delivery_id, endpoint_id, event_id, event_payload,
    next_attempt_at, created_at, updated_at
  )
  SELECT NEW.workspace_id,
         'whd_' || md5(NEW.workspace_id || ':' || endpoint.endpoint_id || ':' || NEW.event_id),
         endpoint.endpoint_id,
         NEW.event_id,
         jsonb_strip_nulls(jsonb_build_object(
           'id', NEW.event_id,
           'type', NEW.type,
           'version', '1',
           'occurred_at', NEW.occurred_at,
           'workspace_id', NEW.workspace_id,
           'subject', jsonb_build_object('type', NEW.subject_type, 'id', NEW.subject_id),
           'subject_version', NEW.subject_version,
           'correlation_id', COALESCE(
             NEW.data ->> 'correlation_id',
             NEW.data ->> 'correlationId',
             NEW.event_id
           ),
           'causation_id', COALESCE(
             NEW.data ->> 'causation_id',
             NEW.data ->> 'causationId'
           ),
           'data', NEW.data
         )),
         NEW.occurred_at,
         NEW.occurred_at,
         NEW.occurred_at
  FROM webhook_endpoints AS endpoint
  WHERE endpoint.workspace_id = NEW.workspace_id
    AND endpoint.enabled = TRUE
    AND (endpoint.event_filters = '[]'::jsonb OR endpoint.event_filters ? NEW.type)
  ON CONFLICT (workspace_id, endpoint_id, event_id)
    WHERE replay_of_delivery_id IS NULL DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS workflow_event_webhook_fanout ON workflow_events;
CREATE TRIGGER workflow_event_webhook_fanout
  AFTER INSERT ON workflow_events
  FOR EACH ROW EXECUTE FUNCTION enqueue_webhook_deliveries_from_workflow_event();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['webhook_endpoints', 'webhook_deliveries', 'webhook_delivery_attempts']
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

export interface WebhookEndpointRecord {
  readonly workspaceId: string;
  readonly endpointId: string;
  readonly url: string;
  readonly secretVersion: number;
  readonly secretHandle: string;
  readonly enabled: boolean;
  readonly eventFilters: readonly string[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WebhookDeliveryRecord {
  readonly workspaceId: string;
  readonly deliveryId: string;
  readonly endpointId: string;
  readonly eventId: string;
  readonly eventPayload: unknown;
  readonly state: "pending" | "delivered" | "dead_letter";
  readonly revision: number;
  readonly attemptCount: number;
  readonly nextAttemptAt: string;
  readonly deliveredAt: string | null;
  readonly deadLetteredAt: string | null;
  readonly lastStatus: number | null;
  readonly lastError: string | null;
  readonly replayOfDeliveryId: string | null;
  readonly leaseOwner: string | null;
  readonly leaseFence: number;
  readonly leaseExpiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface EndpointRow {
  readonly workspace_id: string;
  readonly endpoint_id: string;
  readonly url: string;
  readonly secret_version: number | string;
  readonly secret_handle: string;
  readonly enabled: boolean;
  readonly event_filters: readonly string[];
  readonly revision: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface DeliveryRow {
  readonly workspace_id: string;
  readonly delivery_id: string;
  readonly endpoint_id: string;
  readonly event_id: string;
  readonly event_payload: unknown;
  readonly state: "pending" | "delivered" | "dead_letter";
  readonly revision: number | string;
  readonly attempt_count: number | string;
  readonly next_attempt_at: Date | string;
  readonly delivered_at: Date | string | null;
  readonly dead_lettered_at: Date | string | null;
  readonly last_status: number | string | null;
  readonly last_error: string | null;
  readonly replay_of_delivery_id: string | null;
  readonly lease_owner: string | null;
  readonly lease_fence: number | string;
  readonly lease_expires_at: Date | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export class WebhookPersistenceError extends Error {}

function timestamp(value: Date | string): string {
  return new Date(value).toISOString();
}

function optionalTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}

function mapEndpoint(row: EndpointRow): WebhookEndpointRecord {
  return {
    workspaceId: row.workspace_id,
    endpointId: row.endpoint_id,
    url: row.url,
    secretVersion: Number(row.secret_version),
    secretHandle: row.secret_handle,
    enabled: row.enabled,
    eventFilters: [...row.event_filters],
    revision: Number(row.revision),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapDelivery(row: DeliveryRow): WebhookDeliveryRecord {
  return {
    workspaceId: row.workspace_id,
    deliveryId: row.delivery_id,
    endpointId: row.endpoint_id,
    eventId: row.event_id,
    eventPayload: row.event_payload,
    state: row.state,
    revision: Number(row.revision),
    attemptCount: Number(row.attempt_count),
    nextAttemptAt: timestamp(row.next_attempt_at),
    deliveredAt: optionalTimestamp(row.delivered_at),
    deadLetteredAt: optionalTimestamp(row.dead_lettered_at),
    lastStatus: row.last_status === null ? null : Number(row.last_status),
    lastError: row.last_error,
    replayOfDeliveryId: row.replay_of_delivery_id,
    leaseOwner: row.lease_owner,
    leaseFence: Number(row.lease_fence),
    leaseExpiresAt: optionalTimestamp(row.lease_expires_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function row<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new WebhookPersistenceError(message);
  return value;
}

function assertHttps(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebhookPersistenceError("Webhook endpoint URL is invalid.");
  }
  if (
    value.length > 2_048 ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new WebhookPersistenceError("Webhook endpoint must be an HTTPS URL without credentials or a fragment.");
}

function normalizeFilters(values: readonly string[]): readonly string[] {
  const normalized = [...new Set(values)].sort();
  if (
    normalized.length > 100 ||
    normalized.some(
      (value) =>
        value.length < 1 ||
        value.length > 160 ||
        !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(value)
    )
  )
    throw new WebhookPersistenceError("Webhook event filters are invalid or exceed the configured limit.");
  return normalized;
}

export class PostgresWebhookRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_WEBHOOK_MIGRATION);
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

  public async createEndpoint(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly url: string;
    readonly secretVersion: number;
    readonly secretHandle: string;
    readonly eventFilters: readonly string[];
    readonly now: string;
  }): Promise<WebhookEndpointRecord> {
    assertHttps(input.url);
    if (
      !Number.isSafeInteger(input.secretVersion) ||
      input.secretVersion < 1 ||
      input.secretHandle.length < 1 ||
      input.secretHandle.length > 512
    )
      throw new WebhookPersistenceError("Webhook secret version and handle are required.");
    const eventFilters = normalizeFilters(input.eventFilters);
    return this.transaction(input.workspaceId, async (client) => mapEndpoint(row(await client.query<EndpointRow>(
      `INSERT INTO webhook_endpoints (
         workspace_id, endpoint_id, url, secret_version, secret_handle, event_filters, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
       RETURNING *`,
      [input.workspaceId, input.endpointId, input.url, input.secretVersion, input.secretHandle, JSON.stringify(eventFilters), input.now]
    ), "Webhook endpoint could not be created.")));
  }

  public async getEndpoint(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
  }): Promise<WebhookEndpointRecord | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<EndpointRow>(
        `SELECT * FROM webhook_endpoints
         WHERE workspace_id = $1 AND endpoint_id = $2`,
        [input.workspaceId, input.endpointId]
      );
      return result.rows[0] ? mapEndpoint(result.rows[0]) : null;
    });
  }

  public async listEndpoints(input: {
    readonly workspaceId: string;
    readonly includeDisabled?: boolean;
  }): Promise<readonly WebhookEndpointRecord[]> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<EndpointRow>(
        `SELECT * FROM webhook_endpoints
         WHERE workspace_id = $1 AND ($2::boolean OR enabled = TRUE)
         ORDER BY created_at, endpoint_id`,
        [input.workspaceId, input.includeDisabled ?? false]
      );
      return result.rows.map(mapEndpoint);
    });
  }

  public async updateEndpoint(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly expectedRevision: number;
    readonly url: string;
    readonly eventFilters: readonly string[];
    readonly enabled: boolean;
    readonly now: string;
  }): Promise<WebhookEndpointRecord | null> {
    assertHttps(input.url);
    const eventFilters = normalizeFilters(input.eventFilters);
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<EndpointRow>(
        `UPDATE webhook_endpoints
         SET url = $1, event_filters = $2::jsonb, enabled = $3,
             revision = revision + 1, updated_at = $4::timestamptz
         WHERE workspace_id = $5 AND endpoint_id = $6 AND revision = $7
         RETURNING *`,
        [
          input.url,
          JSON.stringify(eventFilters),
          input.enabled,
          input.now,
          input.workspaceId,
          input.endpointId,
          input.expectedRevision,
        ]
      );
      return result.rows[0] ? mapEndpoint(result.rows[0]) : null;
    });
  }

  /** Rotates only an opaque external secret handle and requires a monotonic version. */
  public async rotateEndpointSecret(input: {
    readonly workspaceId: string;
    readonly endpointId: string;
    readonly expectedRevision: number;
    readonly secretVersion: number;
    readonly secretHandle: string;
    readonly now: string;
  }): Promise<WebhookEndpointRecord | null> {
    if (
      !Number.isSafeInteger(input.secretVersion) ||
      input.secretVersion < 1 ||
      input.secretHandle.length < 1 ||
      input.secretHandle.length > 512
    )
      throw new WebhookPersistenceError("Webhook secret version and handle are required.");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<EndpointRow>(
        `UPDATE webhook_endpoints
         SET secret_handle = $1, secret_version = $2,
             revision = revision + 1, updated_at = $3::timestamptz
         WHERE workspace_id = $4 AND endpoint_id = $5 AND revision = $6
           AND secret_version < $2
         RETURNING *`,
        [
          input.secretHandle,
          input.secretVersion,
          input.now,
          input.workspaceId,
          input.endpointId,
          input.expectedRevision,
        ]
      );
      return result.rows[0] ? mapEndpoint(result.rows[0]) : null;
    });
  }

  public async listDeliveries(input: {
    readonly workspaceId: string;
    readonly endpointId?: string;
    readonly after?: { readonly createdAt: string; readonly deliveryId: string };
    readonly size: number;
  }): Promise<readonly WebhookDeliveryRecord[]> {
    if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > 100)
      throw new WebhookPersistenceError("Webhook delivery page size must be between 1 and 100.");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<DeliveryRow>(
        `SELECT * FROM webhook_deliveries
         WHERE workspace_id = $1
           AND ($2::text IS NULL OR endpoint_id = $2)
           AND ($3::timestamptz IS NULL OR (created_at, delivery_id) > ($3::timestamptz, $4::text))
         ORDER BY created_at, delivery_id LIMIT $5`,
        [
          input.workspaceId,
          input.endpointId ?? null,
          input.after?.createdAt ?? null,
          input.after?.deliveryId ?? "",
          input.size,
        ]
      );
      return result.rows.map(mapDelivery);
    });
  }

  /** Equal endpoint/event pairs return the original delivery instead of duplicating it. */
  public async enqueueDelivery(input: {
    readonly workspaceId: string;
    readonly deliveryId: string;
    readonly endpointId: string;
    readonly eventId: string;
    readonly eventPayload: unknown;
    readonly now: string;
  }): Promise<{ readonly created: boolean; readonly delivery: WebhookDeliveryRecord }> {
    return this.transaction(input.workspaceId, async (client) => {
      const inserted = await client.query<DeliveryRow>(
        `INSERT INTO webhook_deliveries (
           workspace_id, delivery_id, endpoint_id, event_id, event_payload, next_attempt_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $6::timestamptz, $6::timestamptz)
         ON CONFLICT (workspace_id, endpoint_id, event_id) WHERE replay_of_delivery_id IS NULL DO NOTHING
         RETURNING *`,
        [input.workspaceId, input.deliveryId, input.endpointId, input.eventId, JSON.stringify(input.eventPayload), input.now]
      );
      if (inserted.rows[0]) return { created: true, delivery: mapDelivery(inserted.rows[0]) };
      const existing = await client.query<DeliveryRow>(
        `SELECT * FROM webhook_deliveries
         WHERE workspace_id = $1 AND endpoint_id = $2 AND event_id = $3
           AND replay_of_delivery_id IS NULL`,
        [input.workspaceId, input.endpointId, input.eventId]
      );
      return { created: false, delivery: mapDelivery(row(existing, "Original webhook delivery disappeared.")) };
    });
  }

  public async claimNextDue(input: {
    readonly workspaceId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<(WebhookDeliveryRecord & {
    readonly endpointUrl: string;
    readonly secretHandle: string;
    readonly secretVersion: number;
  }) | null> {
    if (!Number.isSafeInteger(input.leaseSeconds) || input.leaseSeconds < 1)
      throw new WebhookPersistenceError("Webhook lease duration must be a positive integer.");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<DeliveryRow & {
        readonly endpoint_url: string;
        readonly secret_handle: string;
        readonly secret_version: number | string;
      }>(
        `WITH candidate AS (
           SELECT delivery.workspace_id, delivery.delivery_id
           FROM webhook_deliveries AS delivery
           JOIN webhook_endpoints AS endpoint
             ON endpoint.workspace_id = delivery.workspace_id AND endpoint.endpoint_id = delivery.endpoint_id
           WHERE delivery.workspace_id = $1 AND delivery.state = 'pending'
             AND delivery.next_attempt_at <= $2::timestamptz
             AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at <= $2::timestamptz)
             AND endpoint.enabled = TRUE
           ORDER BY delivery.next_attempt_at, delivery.delivery_id
           FOR UPDATE OF delivery SKIP LOCKED LIMIT 1
         ), claimed AS (
           UPDATE webhook_deliveries AS delivery
           SET lease_owner = $3, lease_fence = delivery.lease_fence + 1,
               lease_expires_at = $2::timestamptz + ($4::text || ' seconds')::interval,
               updated_at = $2::timestamptz
           FROM candidate
           WHERE delivery.workspace_id = candidate.workspace_id AND delivery.delivery_id = candidate.delivery_id
           RETURNING delivery.*
         )
         SELECT claimed.*, endpoint.url AS endpoint_url, endpoint.secret_handle, endpoint.secret_version
         FROM claimed
         JOIN webhook_endpoints AS endpoint
           ON endpoint.workspace_id = claimed.workspace_id AND endpoint.endpoint_id = claimed.endpoint_id`,
        [input.workspaceId, input.now, input.workerId, input.leaseSeconds]
      );
      const claimed = result.rows[0];
      return claimed
        ? {
          ...mapDelivery(claimed),
          endpointUrl: claimed.endpoint_url,
          secretHandle: claimed.secret_handle,
          secretVersion: Number(claimed.secret_version),
        }
        : null;
    });
  }

  public async recordAttempt(input: {
    readonly workspaceId: string;
    readonly deliveryId: string;
    readonly expectedRevision: number;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly outcome: "delivered" | "retry" | "dead_letter";
    readonly now: string;
    readonly nextAttemptAt?: string;
    readonly responseStatus?: number;
    readonly error?: string;
  }): Promise<WebhookDeliveryRecord | null> {
    if (input.outcome === "retry" && !input.nextAttemptAt)
      throw new WebhookPersistenceError("A retry must have a next-attempt time.");
    return this.transaction(input.workspaceId, async (client) => {
      const updated = await client.query<DeliveryRow>(
        `UPDATE webhook_deliveries
         SET state = $1,
             revision = revision + 1,
             attempt_count = attempt_count + 1,
             next_attempt_at = COALESCE($2::timestamptz, next_attempt_at),
             delivered_at = CASE WHEN $1 = 'delivered' THEN $3::timestamptz ELSE NULL END,
             dead_lettered_at = CASE WHEN $1 = 'dead_letter' THEN $3::timestamptz ELSE NULL END,
             last_status = $4,
             last_error = $5,
             lease_owner = NULL,
             lease_expires_at = NULL,
             updated_at = $3::timestamptz
         WHERE workspace_id = $6 AND delivery_id = $7 AND revision = $8 AND state = 'pending'
           AND lease_owner = $9 AND lease_fence = $10 AND lease_expires_at > $3::timestamptz
         RETURNING *`,
        [input.outcome === "retry" ? "pending" : input.outcome, input.nextAttemptAt ?? null, input.now, input.responseStatus ?? null, input.error?.slice(0, 2_000) ?? null, input.workspaceId, input.deliveryId, input.expectedRevision, input.workerId, input.leaseFence]
      );
      if (!updated.rows[0]) return null;
      const delivery = mapDelivery(updated.rows[0]);
      await client.query(
        `INSERT INTO webhook_delivery_attempts (
           workspace_id, delivery_id, attempt_number, outcome, response_status, error, attempted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
        [input.workspaceId, input.deliveryId, delivery.attemptCount, input.outcome, input.responseStatus ?? null, input.error?.slice(0, 2_000) ?? null, input.now]
      );
      return delivery;
    });
  }

  /** Replay is allowed only from a terminal delivery at the expected revision and through an enabled endpoint. */
  public async replay(input: {
    readonly workspaceId: string;
    readonly sourceDeliveryId: string;
    readonly expectedRevision: number;
    readonly newDeliveryId: string;
    readonly now: string;
  }): Promise<WebhookDeliveryRecord> {
    return this.transaction(input.workspaceId, async (client) => mapDelivery(row(await client.query<DeliveryRow>(
      `INSERT INTO webhook_deliveries (
         workspace_id, delivery_id, endpoint_id, event_id, event_payload, next_attempt_at,
         replay_of_delivery_id, created_at, updated_at
       )
       SELECT source.workspace_id, $1, source.endpoint_id, source.event_id, source.event_payload, $2::timestamptz,
              source.delivery_id, $2::timestamptz, $2::timestamptz
       FROM webhook_deliveries AS source
       JOIN webhook_endpoints AS endpoint
         ON endpoint.workspace_id = source.workspace_id AND endpoint.endpoint_id = source.endpoint_id
       WHERE source.workspace_id = $3 AND source.delivery_id = $4 AND source.revision = $5
         AND source.state IN ('delivered', 'dead_letter') AND endpoint.enabled = TRUE
       RETURNING webhook_deliveries.*`,
      [input.newDeliveryId, input.now, input.workspaceId, input.sourceDeliveryId, input.expectedRevision]
    ), "Webhook replay requires an enabled endpoint and a terminal delivery at the expected revision.")));
  }
}
