import crypto from "node:crypto";

import {
  POSTGRES_DURABLE_DISPATCH_MIGRATION,
  POSTGRES_WORKFLOW_AUTHORITY_MIGRATION,
  POSTGRES_WORKFLOW_STATE_MIGRATION,
  isWorkflowRunTransition,
  type JobLease,
  type RelationalWorkflowRun,
  type WorkflowExecutionSpecification,
  type WorkflowAuthority,
  type WorkflowRunStatus,
  WorkflowStateTransitionError,
} from "./relational-workflow-state.js";

export interface CommandAdmissionResult {
  readonly kind: "admitted" | "replayed";
  readonly commandId: string;
  readonly response: unknown;
}

/** Structural subset of the application execution context used by this adapter. */
export interface WorkflowAdmissionExecution {
  readonly workspace: { readonly id: string };
  readonly idempotency?: {
    readonly key: string;
    readonly fingerprint: string;
  } | undefined;
}

export interface PostgresWorkflowAdmissionPortOptions {
  readonly repository: PostgresWorkflowRepository;
  readonly now?: () => Date;
  readonly createId?: (prefix: "workflow" | "job" | "outbox" | "command") => string;
  readonly executionDefaults?: Partial<Omit<WorkflowExecutionSpecification, "input">>;
}

export interface PostgresQueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount?: number | null;
}

export interface PostgresClient {
  query<T>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<T>>;
  release(): void;
}

/** A minimal node-postgres-compatible pool; infrastructure owns its lifecycle. */
export interface PostgresPool {
  query<T>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<T>>;
  connect(): Promise<PostgresClient>;
  end(): Promise<void>;
}

interface WorkflowRunRow {
  readonly workspace_id: string;
  readonly run_id: string;
  readonly revision: string | number;
  readonly status: WorkflowRunStatus;
  readonly authority: WorkflowAuthority;
  readonly execution_spec: WorkflowExecutionSpecification;
  readonly supersedes_run_id: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface JobLeaseRow {
  readonly workspace_id: string;
  readonly job_id: string;
  readonly revision: string | number;
  readonly lease_fence: string | number;
  readonly lease_owner: string;
  readonly lease_expires_at: Date | string;
}

interface OutboxRow {
  readonly workspace_id: string;
  readonly outbox_id: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly lease_fence: string | number;
  readonly lease_owner: string;
  readonly lease_expires_at: Date | string;
  readonly attempt_count: string | number;
}

export interface OutboxLease {
  readonly workspaceId: string;
  readonly outboxId: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly leaseFence: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: string;
  readonly attemptCount: number;
}

interface Queryable {
  query<T>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<T>>;
}

function mapRow(row: WorkflowRunRow): RelationalWorkflowRun {
  return {
    workspaceId: row.workspace_id,
    runId: row.run_id,
    revision: Number(row.revision),
    status: row.status,
    authority: row.authority,
    execution: row.execution_spec,
    supersedesRunId: row.supersedes_run_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapLease(row: JobLeaseRow): JobLease {
  return {
    workspaceId: row.workspace_id,
    jobId: row.job_id,
    revision: Number(row.revision),
    leaseFence: Number(row.lease_fence),
    leaseOwner: row.lease_owner,
    leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
  };
}

function mapOutboxLease(row: OutboxRow): OutboxLease {
  return {
    workspaceId: row.workspace_id,
    outboxId: row.outbox_id,
    topic: row.topic,
    payload: row.payload,
    leaseFence: Number(row.lease_fence),
    leaseOwner: row.lease_owner,
    leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
    attemptCount: Number(row.attempt_count),
  };
}

function translate(error: unknown): never {
  if ((error as { code?: string }).code === "23505")
    throw new WorkflowStateTransitionError(
      "Workflow record already exists in this workspace."
    );
  if ((error as { code?: string }).code === "P0001")
    throw new WorkflowStateTransitionError((error as Error).message);
  throw error;
}

export class WorkspaceTransactionRepository {
  public constructor(private readonly connection: Queryable) {}

  public async create(
    input: Omit<RelationalWorkflowRun, "revision" | "updatedAt" | "authority"> & {
      readonly authority?: WorkflowAuthority;
    }
  ): Promise<RelationalWorkflowRun> {
    try {
      const result = await this.connection.query<WorkflowRunRow>(
        `INSERT INTO workflow_runs (
          workspace_id, run_id, status, authority, execution_spec, supersedes_run_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $7::timestamptz)
        RETURNING *`,
        [input.workspaceId, input.runId, input.status, input.authority ?? "database-v1", JSON.stringify(input.execution), input.supersedesRunId, input.createdAt]
      );
      return mapRow(result.rows[0]!);
    } catch (error) {
      return translate(error);
    }
  }

  public async get(workspaceId: string, runId: string): Promise<RelationalWorkflowRun | null> {
    const result = await this.connection.query<WorkflowRunRow>(
      `SELECT * FROM workflow_runs WHERE workspace_id = $1 AND run_id = $2`,
      [workspaceId, runId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  public async transition(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly expectedRevision: number;
    readonly authority: WorkflowAuthority;
    readonly from: WorkflowRunStatus;
    readonly status: WorkflowRunStatus;
    readonly now: string;
  }): Promise<RelationalWorkflowRun> {
    if (!isWorkflowRunTransition(input.from, input.status))
      throw new WorkflowStateTransitionError(
        `Workflow run cannot transition from ${input.from} to ${input.status}.`
      );
    try {
      const result = await this.connection.query<WorkflowRunRow>(
        `UPDATE workflow_runs
         SET status = $1, revision = revision + 1, updated_at = $2::timestamptz
         WHERE workspace_id = $3 AND run_id = $4 AND revision = $5 AND status = $6 AND authority = $7
           AND status NOT IN ('succeeded', 'failed', 'cancelled')
        RETURNING *`,
        [input.status, input.now, input.workspaceId, input.runId, input.expectedRevision, input.from, input.authority]
      );
      if (!result.rows[0])
        throw new WorkflowStateTransitionError(
          "Workflow run was missing, stale, terminal, or in an unexpected state."
        );
      return mapRow(result.rows[0]);
    } catch (error) {
      return translate(error);
    }
  }

  public async createJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly runId: string;
  }): Promise<void> {
    try {
      await this.connection.query(
        `INSERT INTO jobs (workspace_id, job_id, run_id, status)
         VALUES ($1, $2, $3, 'queued')`,
        [input.workspaceId, input.jobId, input.runId]
      );
    } catch (error) {
      return translate(error);
    }
  }

  /**
   * Inserts command admission, job state, and durable dispatch intent in one
   * transaction. Equal keys replay the canonical stored result; a differing
   * fingerprint never reaches the workflow.
   */
  public async admitCommand(input: {
    readonly workspaceId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly commandId: string;
    readonly response: unknown;
    readonly job: { readonly jobId: string; readonly runId: string };
    readonly outbox: {
      readonly outboxId: string;
      readonly topic: string;
      readonly payload: unknown;
      readonly availableAt: string;
    };
    readonly now: string;
  }): Promise<CommandAdmissionResult> {
    try {
      const inserted = await this.connection.query<{
        readonly command_id: string;
        readonly response: unknown;
      }>(
        `INSERT INTO command_admissions (
          workspace_id, idempotency_key, request_fingerprint, command_id, response, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
        ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
        RETURNING command_id, response`,
        [input.workspaceId, input.idempotencyKey, input.requestFingerprint, input.commandId, JSON.stringify(input.response), input.now]
      );
      if (!inserted.rows[0]) {
        const existing = await this.connection.query<{
          readonly command_id: string;
          readonly request_fingerprint: string;
          readonly response: unknown;
        }>(
          `SELECT command_id, request_fingerprint, response FROM command_admissions
           WHERE workspace_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [input.workspaceId, input.idempotencyKey]
        );
        const record = existing.rows[0];
        if (!record) throw new Error("Idempotency record disappeared during admission.");
        if (record.request_fingerprint !== input.requestFingerprint)
          throw new WorkflowStateTransitionError(
            "Idempotency key is already associated with a different request."
          );
        return { kind: "replayed", commandId: record.command_id, response: record.response };
      }
      await this.createJob({
        workspaceId: input.workspaceId,
        jobId: input.job.jobId,
        runId: input.job.runId,
      });
      await this.connection.query(
        `INSERT INTO workflow_outbox (workspace_id, outbox_id, topic, payload, available_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
        [input.workspaceId, input.outbox.outboxId, input.outbox.topic, JSON.stringify(input.outbox.payload), input.outbox.availableAt]
      );
      return { kind: "admitted", commandId: inserted.rows[0].command_id, response: inserted.rows[0].response };
    } catch (error) {
      return translate(error);
    }
  }

  /**
   * The complete admission is deliberately one transaction: an idempotency
   * record is inserted before its dependent run, job, and outbox rows.  On a
   * replay no new workflow ID is made durable.
   */
  public async admitWorkflow(input: {
    readonly run: Omit<RelationalWorkflowRun, "revision" | "updatedAt" | "authority"> & {
      readonly authority?: WorkflowAuthority;
    };
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly commandId: string;
    readonly response: unknown;
    readonly job: { readonly jobId: string; readonly runId: string };
    readonly outbox: {
      readonly outboxId: string;
      readonly topic: string;
      readonly payload: unknown;
      readonly availableAt: string;
    };
    readonly now: string;
  }): Promise<CommandAdmissionResult> {
    try {
      const inserted = await this.connection.query<{
        readonly command_id: string;
        readonly response: unknown;
      }>(
        `INSERT INTO command_admissions (
          workspace_id, idempotency_key, request_fingerprint, command_id, response, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
        ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
        RETURNING command_id, response`,
        [input.run.workspaceId, input.idempotencyKey, input.requestFingerprint, input.commandId, JSON.stringify(input.response), input.now]
      );
      if (!inserted.rows[0]) {
        const existing = await this.connection.query<{
          readonly command_id: string;
          readonly request_fingerprint: string;
          readonly response: unknown;
        }>(
          `SELECT command_id, request_fingerprint, response FROM command_admissions
           WHERE workspace_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [input.run.workspaceId, input.idempotencyKey]
        );
        const record = existing.rows[0];
        if (!record) throw new Error("Idempotency record disappeared during admission.");
        if (record.request_fingerprint !== input.requestFingerprint)
          throw new WorkflowStateTransitionError(
            "Idempotency key is already associated with a different request."
          );
        return { kind: "replayed", commandId: record.command_id, response: record.response };
      }
      await this.create(input.run);
      await this.createJob({
        workspaceId: input.run.workspaceId,
        jobId: input.job.jobId,
        runId: input.job.runId,
      });
      await this.connection.query(
        `INSERT INTO workflow_outbox (workspace_id, outbox_id, topic, payload, available_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
        [input.run.workspaceId, input.outbox.outboxId, input.outbox.topic, JSON.stringify(input.outbox.payload), input.outbox.availableAt]
      );
      return { kind: "admitted", commandId: inserted.rows[0].command_id, response: inserted.rows[0].response };
    } catch (error) {
      return translate(error);
    }
  }

  public async heartbeatJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<JobLease | null> {
    try {
      const result = await this.connection.query<JobLeaseRow>(
        `UPDATE jobs
         SET revision = revision + 1, last_heartbeat_at = $1::timestamptz,
             lease_expires_at = $1::timestamptz + ($2::text || ' seconds')::interval
         WHERE workspace_id = $3 AND job_id = $4 AND status = 'running'
           AND lease_owner = $5 AND lease_fence = $6 AND lease_expires_at > $1::timestamptz
         RETURNING workspace_id, job_id, revision, lease_fence, lease_owner, lease_expires_at`,
        [input.now, input.leaseSeconds, input.workspaceId, input.jobId, input.workerId, input.leaseFence]
      );
      return result.rows[0] ? mapLease(result.rows[0]) : null;
    } catch (error) {
      return translate(error);
    }
  }

  /** Claims one due event using a fenced lease; consumers deduplicate by outbox ID. */
  public async claimNextOutbox(input: {
    readonly workspaceId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
    readonly topic?: string;
  }): Promise<OutboxLease | null> {
    try {
      const result = await this.connection.query<OutboxRow>(
        `WITH candidate AS (
           SELECT workspace_id, outbox_id FROM workflow_outbox
           WHERE workspace_id = $1 AND state = 'pending' AND available_at <= $2::timestamptz
             AND ($5::text IS NULL OR topic = $5)
             AND (lease_expires_at IS NULL OR lease_expires_at <= $2::timestamptz)
           ORDER BY available_at, outbox_id FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE workflow_outbox AS outbox
         SET lease_owner = $3, lease_fence = outbox.lease_fence + 1,
             lease_expires_at = $2::timestamptz + ($4::text || ' seconds')::interval,
             attempt_count = outbox.attempt_count + 1, last_error = NULL
         FROM candidate
         WHERE outbox.workspace_id = candidate.workspace_id AND outbox.outbox_id = candidate.outbox_id
         RETURNING outbox.workspace_id, outbox.outbox_id, outbox.topic, outbox.payload,
                   outbox.lease_fence, outbox.lease_owner, outbox.lease_expires_at, outbox.attempt_count`,
        [input.workspaceId, input.now, input.workerId, input.leaseSeconds, input.topic ?? null]
      );
      return result.rows[0] ? mapOutboxLease(result.rows[0]) : null;
    } catch (error) {
      return translate(error);
    }
  }

  /** A late dispatcher cannot acknowledge delivery after its lease is reclaimed. */
  public async markOutboxDelivered(input: {
    readonly workspaceId: string;
    readonly outboxId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
  }): Promise<boolean> {
    const result = await this.connection.query(
      `UPDATE workflow_outbox SET state = 'delivered', delivered_at = $1::timestamptz,
         lease_owner = NULL, lease_expires_at = NULL
       WHERE workspace_id = $2 AND outbox_id = $3 AND state = 'pending'
         AND lease_owner = $4 AND lease_fence = $5 AND lease_expires_at > $1::timestamptz`,
      [input.now, input.workspaceId, input.outboxId, input.workerId, input.leaseFence]
    );
    return result.rowCount === 1;
  }

  /** Retry is explicit and bounded; exhausted events are retained as dead letters. */
  public async rescheduleOutbox(input: {
    readonly workspaceId: string;
    readonly outboxId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
    readonly nextAttemptAt: string;
    readonly error: string;
    readonly maxAttempts: number;
  }): Promise<"rescheduled" | "dead_letter" | "lost_lease"> {
    const result = await this.connection.query<{ readonly state: "pending" | "dead_letter" }>(
      `UPDATE workflow_outbox
       SET state = CASE WHEN attempt_count >= $1 THEN 'dead_letter' ELSE 'pending' END,
           available_at = CASE WHEN attempt_count >= $1 THEN available_at ELSE $2::timestamptz END,
           delivered_at = CASE WHEN attempt_count >= $1 THEN $3::timestamptz ELSE NULL END,
           lease_owner = NULL, lease_expires_at = NULL, last_error = $4
       WHERE workspace_id = $5 AND outbox_id = $6 AND state = 'pending'
         AND lease_owner = $7 AND lease_fence = $8 AND lease_expires_at > $3::timestamptz
       RETURNING state`,
      [input.maxAttempts, input.nextAttemptAt, input.now, input.error.slice(0, 2_000), input.workspaceId, input.outboxId, input.workerId, input.leaseFence]
    );
    if (!result.rows[0]) return "lost_lease";
    return result.rows[0].state === "dead_letter" ? "dead_letter" : "rescheduled";
  }

  public async prepareEffect(input: {
    readonly workspaceId: string;
    readonly effectId: string;
    readonly subjectId: string;
    readonly kind: string;
    readonly now: string;
  }): Promise<void> {
    await this.connection.query(
      `INSERT INTO effect_records (workspace_id, effect_id, subject_id, kind, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'prepared', $5::timestamptz, $5::timestamptz)`,
      [input.workspaceId, input.effectId, input.subjectId, input.kind, input.now]
    );
  }

  /** An uncertain external effect is reconciliation-only and cannot restart. */
  public async beginEffect(input: {
    readonly workspaceId: string;
    readonly effectId: string;
    readonly now: string;
  }): Promise<boolean> {
    const result = await this.connection.query(
      `UPDATE effect_records SET state = 'in_flight', revision = revision + 1, updated_at = $1::timestamptz
       WHERE workspace_id = $2 AND effect_id = $3 AND state = 'prepared'`,
      [input.now, input.workspaceId, input.effectId]
    );
    return result.rowCount === 1;
  }

  public async markEffectUncertain(input: {
    readonly workspaceId: string;
    readonly effectId: string;
    readonly now: string;
    readonly evidence: unknown;
  }): Promise<void> {
    await this.connection.query(
      `UPDATE effect_records
       SET state = 'outcome_uncertain', revision = revision + 1, evidence = $1::jsonb, updated_at = $2::timestamptz
       WHERE workspace_id = $3 AND effect_id = $4 AND state = 'in_flight'`,
      [JSON.stringify(input.evidence), input.now, input.workspaceId, input.effectId]
    );
  }

  /** Records an exact provider receipt and advances only an uncertain publication. */
  public async resolvePublicationReconciliation(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly receipt: unknown;
  }): Promise<void> {
    const result = await this.connection.query(
      `UPDATE publications
       SET status = 'published', revision = revision + 1, provider_receipt = $1::jsonb
       WHERE workspace_id = $2 AND publication_id = $3 AND status = 'reconciliation_required'
       RETURNING revision`,
      [JSON.stringify(input.receipt), input.workspaceId, input.publicationId]
    );
    if (result.rowCount !== 1)
      throw new WorkflowStateTransitionError(
        "Publication was missing or is not awaiting reconciliation."
      );
  }

  /** Inconclusive evidence is append-only and never reopens provider mutation. */
  public async recordPublicationReconciliationAttempt(input: {
    readonly workspaceId: string;
    readonly attemptId: string;
    readonly publicationId: string;
    readonly reason: "no_match" | "multiple_matches" | "provider_unavailable";
    readonly evidence?: unknown;
    readonly now: string;
  }): Promise<void> {
    await this.connection.query(
      `INSERT INTO publication_reconciliation_attempts (
        workspace_id, attempt_id, publication_id, reason, evidence, created_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)`,
      [input.workspaceId, input.attemptId, input.publicationId, input.reason, input.evidence === undefined ? null : JSON.stringify(input.evidence), input.now]
    );
  }

  /** Claims only queued or expired work and advances the durable fencing token. */
  public async claimJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<JobLease | null> {
    try {
      const result = await this.connection.query<JobLeaseRow>(
        `UPDATE jobs
         SET status = 'running', revision = revision + 1, lease_fence = lease_fence + 1,
             lease_owner = $1, lease_expires_at = $2::timestamptz + ($3::text || ' seconds')::interval
         WHERE workspace_id = $4 AND job_id = $5
           AND (status = 'queued' OR (status = 'running' AND lease_expires_at <= $2::timestamptz))
         RETURNING workspace_id, job_id, revision, lease_fence, lease_owner, lease_expires_at`,
        [input.workerId, input.now, input.leaseSeconds, input.workspaceId, input.jobId]
      );
      return result.rows[0] ? mapLease(result.rows[0]) : null;
    } catch (error) {
      return translate(error);
    }
  }
}

export class PostgresWorkflowRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_WORKFLOW_STATE_MIGRATION);
      await client.query(POSTGRES_WORKFLOW_AUTHORITY_MIGRATION);
      await client.query(POSTGRES_DURABLE_DISPATCH_MIGRATION);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Runs all tenant work on one connection and removes the RLS setting at commit.
   * Repositories do not permit a pooled connection to carry tenant state forward.
   */
  public async withWorkspaceTransaction<T>(
    workspaceId: string,
    work: (repository: WorkspaceTransactionRepository) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await work(new WorkspaceTransactionRepository(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

function responseFromAdmission(value: unknown): { readonly workflowRunId: string; readonly jobId: string; readonly revision: number } {
  if (
    value !== null && typeof value === "object" &&
    typeof Reflect.get(value, "workflowRunId") === "string" &&
    typeof Reflect.get(value, "jobId") === "string" &&
    typeof Reflect.get(value, "revision") === "number"
  ) {
    return value as { readonly workflowRunId: string; readonly jobId: string; readonly revision: number };
  }
  throw new WorkflowStateTransitionError("Stored workflow admission response is invalid.");
}

/** Concrete durable adapter for the application's workflow-admission port. */
export class PostgresWorkflowAdmissionPort {
  private readonly now: () => Date;
  private readonly createId: NonNullable<PostgresWorkflowAdmissionPortOptions["createId"]>;
  private readonly executionDefaults: Omit<WorkflowExecutionSpecification, "input">;

  public constructor(private readonly options: PostgresWorkflowAdmissionPortOptions) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`);
    this.executionDefaults = {
      configurationVersion: "workflow-admission.v1",
      promptVersion: "unversioned",
      providerSelection: "deferred",
      rendererVersion: "deferred",
      presetVersion: "deferred",
      buildVersion: null,
      assetHashes: [],
      taskGraphVersion: "workflow-admission.v1",
      ...options.executionDefaults,
    };
  }

  public async admit(input: {
    readonly execution: WorkflowAdmissionExecution;
    readonly command: string;
    readonly input: unknown;
  }): Promise<{ readonly workflowRunId: string; readonly jobId: string; readonly revision: number }> {
    const idempotency = input.execution.idempotency;
    if (!idempotency) throw new WorkflowStateTransitionError("Workflow admission requires an idempotency key.");
    const now = this.now().toISOString();
    const workflowRunId = this.createId("workflow");
    const jobId = this.createId("job");
    const response = { workflowRunId, jobId, revision: 0 };
    const result = await this.options.repository.withWorkspaceTransaction(input.execution.workspace.id, (transaction) =>
      transaction.admitWorkflow({
        run: {
          workspaceId: input.execution.workspace.id,
          runId: workflowRunId,
          status: "queued",
          execution: { ...this.executionDefaults, input: { command: input.command, input: input.input } },
          supersedesRunId: null,
          createdAt: now,
        },
        idempotencyKey: idempotency.key,
        requestFingerprint: idempotency.fingerprint,
        commandId: this.createId("command"),
        response,
        job: { jobId, runId: workflowRunId },
        outbox: {
          outboxId: this.createId("outbox"),
          topic: "workflow.queued",
          payload: { workflowRunId, jobId, command: input.command },
          availableAt: now,
        },
        now,
      })
    );
    return responseFromAdmission(result.response);
  }
}

export interface PostgresPublicationReconciliationStoreOptions {
  readonly repository: PostgresWorkflowRepository;
  readonly workspaceId: string;
  readonly now?: () => Date;
  readonly createAttemptId?: () => string;
}

/** Tenant-bound persistence adapter for the read-only reconciliation worker. */
export class PostgresPublicationReconciliationStore {
  private readonly now: () => Date;
  private readonly createAttemptId: () => string;

  public constructor(private readonly options: PostgresPublicationReconciliationStoreOptions) {
    this.now = options.now ?? (() => new Date());
    this.createAttemptId = options.createAttemptId ?? (() => `reconciliation-${crypto.randomUUID()}`);
  }

  public async recordResolved(input: {
    readonly publicationId: string;
    readonly receipt: { readonly providerObjectId: string; readonly recoveryIdentity: string; readonly evidence: unknown };
  }): Promise<void> {
    await this.options.repository.withWorkspaceTransaction(this.options.workspaceId, (transaction) =>
      transaction.resolvePublicationReconciliation({
        workspaceId: this.options.workspaceId,
        publicationId: input.publicationId,
        receipt: input.receipt,
      })
    );
  }

  public async recordInconclusive(input: {
    readonly publicationId: string;
    readonly reason: "no_match" | "multiple_matches" | "provider_unavailable";
  }): Promise<void> {
    await this.options.repository.withWorkspaceTransaction(this.options.workspaceId, (transaction) =>
      transaction.recordPublicationReconciliationAttempt({
        workspaceId: this.options.workspaceId,
        attemptId: this.createAttemptId(),
        publicationId: input.publicationId,
        reason: input.reason,
        evidence: { reason: input.reason },
        now: this.now().toISOString(),
      })
    );
  }
}

export function createPostgresWorkflowRepository(pool: PostgresPool): PostgresWorkflowRepository {
  return new PostgresWorkflowRepository(pool);
}
