export const workflowRunStatuses = [
  "queued",
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export const workflowAuthorities = [
  "filesystem-legacy",
  "database-v1",
] as const;
export type WorkflowAuthority = (typeof workflowAuthorities)[number];

const terminal = new Set<WorkflowRunStatus>([
  "succeeded",
  "failed",
  "cancelled",
]);
const transitions: Readonly<
  Record<WorkflowRunStatus, readonly WorkflowRunStatus[]>
> = {
  queued: ["running", "cancelled"],
  running: ["awaiting_approval", "succeeded", "failed", "cancelled"],
  awaiting_approval: ["queued", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function isWorkflowRunTransition(
  from: WorkflowRunStatus,
  to: WorkflowRunStatus
): boolean {
  return transitions[from].includes(to);
}

export interface WorkflowExecutionSpecification {
  readonly input: unknown;
  readonly configurationVersion: string;
  readonly promptVersion: string;
  readonly providerSelection: string;
  readonly rendererVersion: string;
  readonly presetVersion: string;
  readonly buildVersion: string | null;
  readonly assetHashes: readonly string[];
  readonly taskGraphVersion: string;
}

export interface RelationalWorkflowRun {
  readonly workspaceId: string;
  readonly runId: string;
  readonly revision: number;
  readonly status: WorkflowRunStatus;
  readonly authority: WorkflowAuthority;
  readonly execution: WorkflowExecutionSpecification;
  readonly supersedesRunId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobLease {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly revision: number;
  readonly leaseFence: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: string;
}

export class WorkflowStateTransitionError extends Error {
  public override readonly name = "WorkflowStateTransitionError";
}

function cloneRun(run: RelationalWorkflowRun): RelationalWorkflowRun {
  return structuredClone(run);
}

/** Deterministic conformance implementation for the PostgreSQL repository. */
export class InMemoryRelationalWorkflowRepository {
  private readonly runs = new Map<string, RelationalWorkflowRun>();

  private key(workspaceId: string, runId: string): string {
    return `${workspaceId}:${runId}`;
  }

  public create(
    run: Omit<RelationalWorkflowRun, "revision" | "updatedAt" | "authority"> & {
      readonly authority?: WorkflowAuthority;
    }
  ): RelationalWorkflowRun {
    const key = this.key(run.workspaceId, run.runId);
    if (this.runs.has(key))
      throw new WorkflowStateTransitionError(
        "Workflow run already exists in this workspace."
      );
    const record: RelationalWorkflowRun = {
      ...cloneRun({
        ...run,
        authority: run.authority ?? "database-v1",
        revision: 0,
        updatedAt: run.createdAt,
      }),
      revision: 0,
      updatedAt: run.createdAt,
    };
    this.runs.set(key, record);
    return cloneRun(record);
  }

  public get(workspaceId: string, runId: string): RelationalWorkflowRun | null {
    const record = this.runs.get(this.key(workspaceId, runId));
    return record ? cloneRun(record) : null;
  }

  public transition(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly expectedRevision: number;
    readonly authority: WorkflowAuthority;
    readonly status: WorkflowRunStatus;
    readonly now: string;
  }): RelationalWorkflowRun {
    const key = this.key(input.workspaceId, input.runId);
    const current = this.runs.get(key);
    if (!current)
      throw new WorkflowStateTransitionError("Workflow run was not found.");
    if (current.revision !== input.expectedRevision)
      throw new WorkflowStateTransitionError("Workflow run revision is stale.");
    if (current.authority !== input.authority)
      throw new WorkflowStateTransitionError(
        "Workflow run authority does not permit this writer."
      );
    if (terminal.has(current.status))
      throw new WorkflowStateTransitionError(
        "Terminal workflow runs are immutable."
      );
    if (!transitions[current.status].includes(input.status))
      throw new WorkflowStateTransitionError(
        `Workflow run cannot transition from ${current.status} to ${input.status}.`
      );
    const next: RelationalWorkflowRun = {
      ...current,
      status: input.status,
      revision: current.revision + 1,
      updatedAt: input.now,
    };
    this.runs.set(key, next);
    return cloneRun(next);
  }
}

/**
 * Idempotent PostgreSQL migration for API-owned relational workflow state.
 * Tenant access is always transaction-local through `app.workspace_id`.
 */
export const POSTGRES_WORKFLOW_STATE_MIGRATION = `
CREATE TABLE IF NOT EXISTS episodes (
  workspace_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  authority TEXT NOT NULL DEFAULT 'database-v1' CHECK (authority IN ('filesystem-legacy', 'database-v1')),
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, episode_id)
);
CREATE TABLE IF NOT EXISTS episode_revisions (
  workspace_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  specification JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, episode_id, revision_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id)
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  authority TEXT NOT NULL DEFAULT 'database-v1' CHECK (authority IN ('filesystem-legacy', 'database-v1')),
  revision BIGINT NOT NULL DEFAULT 0,
  execution_spec JSONB NOT NULL,
  supersedes_run_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, run_id),
  FOREIGN KEY (workspace_id, supersedes_run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
CREATE TABLE IF NOT EXISTS workflow_steps (
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, run_id, step_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
CREATE TABLE IF NOT EXISTS workflow_attempts (
  workspace_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  lease_fence BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, attempt_id),
  FOREIGN KEY (workspace_id, run_id, step_id) REFERENCES workflow_steps (workspace_id, run_id, step_id)
);
CREATE TABLE IF NOT EXISTS workflow_batches (
  workspace_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, batch_id)
);
CREATE TABLE IF NOT EXISTS jobs (
  workspace_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  lease_fence BIGINT NOT NULL DEFAULT 0,
  lease_owner TEXT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  PRIMARY KEY (workspace_id, job_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
CREATE TABLE IF NOT EXISTS approvals (
  workspace_id TEXT NOT NULL,
  approval_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  revision BIGINT NOT NULL,
  artifact_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, approval_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
CREATE TABLE IF NOT EXISTS assets (
  workspace_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, asset_id)
);
CREATE TABLE IF NOT EXISTS publications (
  workspace_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, publication_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
CREATE TABLE IF NOT EXISTS workflow_events (
  workspace_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  subject_revision BIGINT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, event_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
CREATE TABLE IF NOT EXISTS workflow_transition_rules (
  subject_type TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  PRIMARY KEY (subject_type, from_status, to_status)
);
INSERT INTO workflow_transition_rules (subject_type, from_status, to_status) VALUES
  ('run', 'queued', 'running'), ('run', 'queued', 'cancelled'),
  ('run', 'running', 'awaiting_approval'), ('run', 'running', 'succeeded'), ('run', 'running', 'failed'), ('run', 'running', 'cancelled'),
  ('run', 'awaiting_approval', 'queued'), ('run', 'awaiting_approval', 'cancelled'),
  ('job', 'queued', 'running'), ('job', 'queued', 'cancelled'), ('job', 'running', 'running'), ('job', 'running', 'succeeded'), ('job', 'running', 'failed'), ('job', 'running', 'cancelled'),
  ('step', 'queued', 'running'), ('step', 'queued', 'cancelled'), ('step', 'running', 'succeeded'), ('step', 'running', 'failed'), ('step', 'running', 'cancelled'),
  ('attempt', 'queued', 'running'), ('attempt', 'queued', 'cancelled'), ('attempt', 'running', 'succeeded'), ('attempt', 'running', 'failed'), ('attempt', 'running', 'cancelled'),
  ('batch', 'queued', 'running'), ('batch', 'queued', 'cancelled'), ('batch', 'running', 'succeeded'), ('batch', 'running', 'failed'), ('batch', 'running', 'cancelled'),
  ('publication', 'pending', 'executing'), ('publication', 'pending', 'cancelled'), ('publication', 'executing', 'published'), ('publication', 'executing', 'failed'), ('publication', 'executing', 'reconciliation_required'), ('publication', 'reconciliation_required', 'published')
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION enforce_workflow_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('succeeded', 'failed', 'cancelled', 'published') THEN
    RAISE EXCEPTION 'terminal % records are immutable', TG_ARGV[0] USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION '% revision must advance exactly once', TG_ARGV[0] USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM workflow_transition_rules
    WHERE subject_type = TG_ARGV[0] AND from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'invalid % transition from % to %', TG_ARGV[0], OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION enforce_workflow_run_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.execution_spec IS DISTINCT FROM OLD.execution_spec
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.supersedes_run_id IS DISTINCT FROM OLD.supersedes_run_id THEN
    RAISE EXCEPTION 'workflow execution specifications and lineage are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status IN ('succeeded', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'terminal run records are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'run revision must advance exactly once' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM workflow_transition_rules
    WHERE subject_type = 'run' AND from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'invalid run transition from % to %', OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION reject_workflow_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'workflow events are append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS workflow_run_transition_guard ON workflow_runs;
CREATE TRIGGER workflow_run_transition_guard BEFORE UPDATE ON workflow_runs FOR EACH ROW EXECUTE FUNCTION enforce_workflow_run_transition();
DROP TRIGGER IF EXISTS workflow_step_transition_guard ON workflow_steps;
CREATE TRIGGER workflow_step_transition_guard BEFORE UPDATE ON workflow_steps FOR EACH ROW EXECUTE FUNCTION enforce_workflow_transition('step');
DROP TRIGGER IF EXISTS workflow_attempt_transition_guard ON workflow_attempts;
CREATE TRIGGER workflow_attempt_transition_guard BEFORE UPDATE ON workflow_attempts FOR EACH ROW EXECUTE FUNCTION enforce_workflow_transition('attempt');
DROP TRIGGER IF EXISTS workflow_batch_transition_guard ON workflow_batches;
CREATE TRIGGER workflow_batch_transition_guard BEFORE UPDATE ON workflow_batches FOR EACH ROW EXECUTE FUNCTION enforce_workflow_transition('batch');
DROP TRIGGER IF EXISTS job_transition_guard ON jobs;
CREATE TRIGGER job_transition_guard BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION enforce_workflow_transition('job');
DROP TRIGGER IF EXISTS publication_transition_guard ON publications;
CREATE TRIGGER publication_transition_guard BEFORE UPDATE ON publications FOR EACH ROW EXECUTE FUNCTION enforce_workflow_transition('publication');
DROP TRIGGER IF EXISTS workflow_events_immutable ON workflow_events;
CREATE TRIGGER workflow_events_immutable BEFORE UPDATE OR DELETE ON workflow_events FOR EACH ROW EXECUTE FUNCTION reject_workflow_event_mutation();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['episodes', 'episode_revisions', 'workflow_runs', 'workflow_steps', 'workflow_attempts', 'workflow_batches', 'jobs', 'approvals', 'assets', 'publications', 'workflow_events']
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

/** Task 08 migration: one active writer for every database workflow run. */
export const POSTGRES_WORKFLOW_AUTHORITY_MIGRATION = `
ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS authority TEXT NOT NULL DEFAULT 'database-v1'
  CHECK (authority IN ('filesystem-legacy', 'database-v1'));
`;

/** Task 05 migration: durable dispatch, idempotency, outbox, and effects. */
export const POSTGRES_DURABLE_DISPATCH_MIGRATION = `
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS active_key TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_active_key_unique
  ON workflow_runs (workspace_id, active_key)
  WHERE active_key IS NOT NULL AND status NOT IN ('succeeded', 'failed', 'cancelled');
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ NULL;
CREATE TABLE IF NOT EXISTS command_admissions (
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  command_id TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS workflow_outbox (
  workspace_id TEXT NOT NULL,
  outbox_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'delivered', 'dead_letter')),
  available_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ NULL,
  lease_fence BIGINT NOT NULL DEFAULT 0,
  lease_owner TEXT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  PRIMARY KEY (workspace_id, outbox_id)
);
ALTER TABLE workflow_outbox ADD COLUMN IF NOT EXISTS lease_fence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE workflow_outbox ADD COLUMN IF NOT EXISTS lease_owner TEXT NULL;
ALTER TABLE workflow_outbox ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL;
ALTER TABLE workflow_outbox ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_outbox ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
CREATE INDEX IF NOT EXISTS workflow_outbox_due_idx
  ON workflow_outbox (workspace_id, available_at, outbox_id)
  WHERE state = 'pending';
CREATE TABLE IF NOT EXISTS job_dead_letters (
  workspace_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, job_id),
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs (workspace_id, job_id)
);
CREATE TABLE IF NOT EXISTS effect_records (
  workspace_id TEXT NOT NULL,
  effect_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('prepared', 'in_flight', 'outcome_uncertain', 'reconciled')),
  revision BIGINT NOT NULL DEFAULT 0,
  evidence JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, effect_id)
);
ALTER TABLE publications ADD COLUMN IF NOT EXISTS provider_receipt JSONB NULL;
CREATE TABLE IF NOT EXISTS publication_reconciliation_attempts (
  workspace_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('no_match', 'multiple_matches', 'provider_unavailable')),
  evidence JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, attempt_id),
  FOREIGN KEY (workspace_id, publication_id) REFERENCES publications (workspace_id, publication_id)
);
INSERT INTO workflow_transition_rules (subject_type, from_status, to_status) VALUES
  ('job', 'running', 'queued')
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION enforce_effect_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'effect revision must advance exactly once' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.state = 'reconciled' THEN
    RAISE EXCEPTION 'reconciled effects are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NOT ((OLD.state = 'prepared' AND NEW.state = 'in_flight')
    OR (OLD.state = 'in_flight' AND NEW.state IN ('outcome_uncertain', 'reconciled'))
    OR (OLD.state = 'outcome_uncertain' AND NEW.state = 'reconciled')) THEN
    RAISE EXCEPTION 'invalid effect transition from % to %', OLD.state, NEW.state USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS effect_transition_guard ON effect_records;
CREATE TRIGGER effect_transition_guard BEFORE UPDATE ON effect_records FOR EACH ROW EXECUTE FUNCTION enforce_effect_transition();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['command_admissions', 'workflow_outbox', 'job_dead_letters', 'effect_records', 'publication_reconciliation_attempts']
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
