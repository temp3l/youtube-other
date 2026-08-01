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
CREATE TABLE IF NOT EXISTS projects (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile TEXT NOT NULL CHECK (profile IN ('dark_truth', 'mathematics_education')),
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, project_id)
);
CREATE TABLE IF NOT EXISTS episodes (
  workspace_id TEXT NOT NULL,
  project_id TEXT NULL,
  episode_id TEXT NOT NULL,
  content JSONB NULL,
  authority TEXT NOT NULL DEFAULT 'database-v1' CHECK (authority IN ('filesystem-legacy', 'database-v1')),
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, episode_id)
);
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS project_id TEXT NULL;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS content JSONB NULL;
CREATE UNIQUE INDEX IF NOT EXISTS episodes_project_identity
  ON episodes (workspace_id, project_id, episode_id) WHERE project_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS episode_revisions (
  workspace_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  specification JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, episode_id, revision_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id)
);
ALTER TABLE episode_revisions ADD COLUMN IF NOT EXISTS project_id TEXT NULL;
ALTER TABLE episode_revisions ADD COLUMN IF NOT EXISTS episode_revision BIGINT NULL;
ALTER TABLE episode_revisions ADD COLUMN IF NOT EXISTS previous_revision BIGINT NULL;
ALTER TABLE episode_revisions ADD COLUMN IF NOT EXISTS content JSONB NULL;
ALTER TABLE episode_revisions ADD COLUMN IF NOT EXISTS evidence JSONB NULL;
CREATE UNIQUE INDEX IF NOT EXISTS episode_revisions_number_unique
  ON episode_revisions (workspace_id, project_id, episode_id, episode_revision)
  WHERE project_id IS NOT NULL AND episode_revision IS NOT NULL;
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
CREATE TABLE IF NOT EXISTS workflow_run_bindings (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, run_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id)
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
  job_type TEXT NOT NULL DEFAULT 'workflow',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at TIMESTAMPTZ NULL,
  cancellation_requested BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT NULL,
  last_heartbeat_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, job_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'workflow';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
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
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS subject_revision BIGINT NULL;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS decision_reason TEXT NULL;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS revoked_by_principal_id TEXT NULL;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS revocation_reason TEXT NULL;
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_state_check;
ALTER TABLE approvals ADD CONSTRAINT approvals_state_check
  CHECK (state IN ('active', 'rejected', 'revoked'));
CREATE TABLE IF NOT EXISTS assets (
  workspace_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, asset_id)
);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS project_id TEXT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS mime_type TEXT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS byte_count BIGINT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS lifecycle TEXT NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS provenance TEXT NULL;
CREATE TABLE IF NOT EXISTS validation_results (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  validation_id TEXT NOT NULL,
  episode_id TEXT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, validation_id)
);
CREATE TABLE IF NOT EXISTS approval_challenges (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_revision BIGINT NOT NULL,
  artifact_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, challenge_id)
);
ALTER TABLE approval_challenges
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS publications (
  workspace_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  project_id TEXT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  approval_id TEXT NULL,
  approval_revision BIGINT NULL,
  approval_artifact_hash TEXT NULL,
  actor_principal_id TEXT NULL,
  actor_principal_revision BIGINT NULL,
  credential_version TEXT NULL,
  asset_hash TEXT NULL,
  artifact_bindings JSONB NULL,
  channel_id TEXT NULL,
  visibility TEXT NULL,
  scheduled_at TIMESTAMPTZ NULL,
  playlist_ids JSONB NULL,
  recovery_identity TEXT NULL,
  active_key TEXT NULL,
  execution_fence BIGINT NOT NULL DEFAULT 0,
  intent_lease_fence BIGINT NOT NULL DEFAULT 0,
  channel_lease_fence BIGINT NOT NULL DEFAULT 0,
  provider_receipt JSONB NULL,
  terminal_evidence JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, publication_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
ALTER TABLE publications ADD COLUMN IF NOT EXISTS project_id TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS approval_id TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS approval_revision BIGINT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS approval_artifact_hash TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS actor_principal_id TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS actor_principal_revision BIGINT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS credential_version TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS asset_hash TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS artifact_bindings JSONB NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS channel_id TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS visibility TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS playlist_ids JSONB NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS recovery_identity TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS active_key TEXT NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS execution_fence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS intent_lease_fence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS channel_lease_fence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS provider_receipt JSONB NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS terminal_evidence JSONB NULL;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE publications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS publications_recovery_identity_unique
  ON publications (workspace_id, recovery_identity)
  WHERE recovery_identity IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS publications_active_intent_unique
  ON publications (workspace_id, active_key)
  WHERE active_key IS NOT NULL AND status IN ('pending', 'executing', 'reconciliation_required');
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_visibility_check;
ALTER TABLE publications ADD CONSTRAINT publications_visibility_check
  CHECK (visibility IS NULL OR visibility IN ('private', 'unlisted', 'public'));
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_artifact_bindings_check;
ALTER TABLE publications ADD CONSTRAINT publications_artifact_bindings_check
  CHECK (artifact_bindings IS NULL OR (jsonb_typeof(artifact_bindings) = 'array' AND jsonb_array_length(artifact_bindings) > 0));
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_playlist_ids_check;
ALTER TABLE publications ADD CONSTRAINT publications_playlist_ids_check
  CHECK (playlist_ids IS NULL OR jsonb_typeof(playlist_ids) = 'array');
CREATE TABLE IF NOT EXISTS publication_credential_versions (
  workspace_id TEXT NOT NULL,
  credential_version TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'disabled', 'revoked')),
  revision BIGINT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, credential_version),
  CHECK ((state = 'active' AND revoked_at IS NULL) OR state IN ('disabled', 'revoked'))
);
CREATE TABLE IF NOT EXISTS publication_intent_leases (
  workspace_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  lease_owner TEXT NOT NULL,
  lease_fence BIGINT NOT NULL CHECK (lease_fence > 0),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, publication_id),
  FOREIGN KEY (workspace_id, publication_id) REFERENCES publications (workspace_id, publication_id)
);
CREATE TABLE IF NOT EXISTS workflow_events (
  workspace_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  run_id TEXT NULL,
  subject_revision BIGINT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_version BIGINT NOT NULL CHECK (subject_version > 0),
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, event_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES workflow_runs (workspace_id, run_id)
);
ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS subject_type TEXT NULL;
ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS subject_id TEXT NULL;
ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS subject_version BIGINT NULL;
ALTER TABLE workflow_events ALTER COLUMN run_id DROP NOT NULL;
ALTER TABLE workflow_events ALTER COLUMN subject_revision DROP NOT NULL;
-- A previous release made event rows immutable before these explicit subject
-- columns existed. Drop only that guard inside this transactional migration,
-- backfill deterministically, then recreate it below.
DROP TRIGGER IF EXISTS workflow_events_immutable ON workflow_events;
UPDATE workflow_events
SET subject_type = CASE
      WHEN type = 'approval.recorded' THEN 'approval'
      WHEN type IN ('publication.intent_recorded', 'publication.reconciliation_required') THEN 'publication'
      ELSE 'workflow_run'
    END,
    subject_id = CASE
      WHEN type = 'approval.recorded' THEN COALESCE(data ->> 'approvalId', run_id)
      WHEN type IN ('publication.intent_recorded', 'publication.reconciliation_required')
        THEN COALESCE(data ->> 'publicationId', data ->> 'id', run_id)
      ELSE run_id
    END,
    subject_version = CASE
      WHEN type IN ('approval.recorded', 'publication.intent_recorded') THEN 1
      ELSE GREATEST(subject_revision, 1)
    END
WHERE subject_type IS NULL OR subject_id IS NULL OR subject_version IS NULL;
UPDATE workflow_events SET type = CASE
  WHEN type = 'approval.recorded' AND data ->> 'decision' = 'rejected' THEN 'approval.rejected'
  WHEN type = 'approval.recorded' THEN 'approval.created'
  WHEN type = 'publication.intent_recorded' THEN 'publication.started'
  ELSE type
END
WHERE type IN ('approval.recorded', 'publication.intent_recorded');
ALTER TABLE workflow_events ALTER COLUMN subject_type SET NOT NULL;
ALTER TABLE workflow_events ALTER COLUMN subject_id SET NOT NULL;
ALTER TABLE workflow_events ALTER COLUMN subject_version SET NOT NULL;
ALTER TABLE workflow_events DROP CONSTRAINT IF EXISTS workflow_events_subject_type_check;
ALTER TABLE workflow_events ADD CONSTRAINT workflow_events_subject_type_check
  CHECK (subject_type IN ('workflow_run', 'job', 'asset', 'validation', 'approval', 'publication', 'webhook_endpoint'));
ALTER TABLE workflow_events DROP CONSTRAINT IF EXISTS workflow_events_subject_version_check;
ALTER TABLE workflow_events ADD CONSTRAINT workflow_events_subject_version_check
  CHECK (subject_version > 0);
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
  ('job', 'queued', 'running'), ('job', 'queued', 'cancelled'),
  ('job', 'retry_scheduled', 'running'), ('job', 'retry_scheduled', 'cancelled'),
  ('job', 'running', 'running'), ('job', 'running', 'succeeded'), ('job', 'running', 'failed'), ('job', 'running', 'cancelled'), ('job', 'running', 'retry_scheduled'), ('job', 'running', 'dead_lettered'),
  ('step', 'queued', 'running'), ('step', 'queued', 'cancelled'), ('step', 'running', 'succeeded'), ('step', 'running', 'failed'), ('step', 'running', 'cancelled'),
  ('attempt', 'queued', 'running'), ('attempt', 'queued', 'cancelled'), ('attempt', 'running', 'succeeded'), ('attempt', 'running', 'failed'), ('attempt', 'running', 'cancelled'),
  ('batch', 'queued', 'running'), ('batch', 'queued', 'cancelled'), ('batch', 'running', 'succeeded'), ('batch', 'running', 'failed'), ('batch', 'running', 'cancelled'),
  ('publication', 'pending', 'executing'), ('publication', 'pending', 'cancelled'), ('publication', 'executing', 'published'), ('publication', 'executing', 'failed'), ('publication', 'executing', 'reconciliation_required'), ('publication', 'reconciliation_required', 'published')
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION enforce_workflow_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('succeeded', 'failed', 'cancelled', 'dead_lettered', 'published') THEN
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
    OR NEW.supersedes_run_id IS DISTINCT FROM OLD.supersedes_run_id
    OR NEW.active_key IS DISTINCT FROM OLD.active_key THEN
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
CREATE OR REPLACE FUNCTION reject_episode_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'episode revisions are append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION enforce_approval_challenge_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approval challenges cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id
    OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
    OR NEW.subject_revision IS DISTINCT FROM OLD.subject_revision
    OR NEW.artifact_hash IS DISTINCT FROM OLD.artifact_hash
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.consumed_at IS NOT NULL
    OR NEW.consumed_at IS NULL THEN
    RAISE EXCEPTION 'approval challenge bindings are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION enforce_approval_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approval records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.decision IS DISTINCT FROM OLD.decision
    OR NEW.artifact_hash IS DISTINCT FROM OLD.artifact_hash
    OR NEW.subject_revision IS DISTINCT FROM OLD.subject_revision
    OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'approval decision evidence is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1
    OR OLD.decision <> 'approved' OR OLD.state <> 'active'
    OR NEW.state <> 'revoked' OR NEW.revoked_at IS NULL
    OR NEW.revoked_by_principal_id IS NULL OR NEW.revocation_reason IS NULL THEN
    RAISE EXCEPTION 'invalid approval revocation' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION enforce_publication_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
    OR NEW.approval_revision IS DISTINCT FROM OLD.approval_revision
    OR NEW.approval_artifact_hash IS DISTINCT FROM OLD.approval_artifact_hash
    OR NEW.actor_principal_id IS DISTINCT FROM OLD.actor_principal_id
    OR NEW.actor_principal_revision IS DISTINCT FROM OLD.actor_principal_revision
    OR NEW.credential_version IS DISTINCT FROM OLD.credential_version
    OR NEW.asset_hash IS DISTINCT FROM OLD.asset_hash
    OR NEW.artifact_bindings IS DISTINCT FROM OLD.artifact_bindings
    OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
    OR NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
    OR NEW.playlist_ids IS DISTINCT FROM OLD.playlist_ids
    OR NEW.recovery_identity IS DISTINCT FROM OLD.recovery_identity
    OR NEW.active_key IS DISTINCT FROM OLD.active_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'publication intent bindings are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status IN ('published', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'terminal publication records are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'publication revision must advance exactly once' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM workflow_transition_rules
    WHERE subject_type = 'publication' AND from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'invalid publication transition from % to %', OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.execution_fence IS DISTINCT FROM OLD.execution_fence
      OR NEW.intent_lease_fence IS DISTINCT FROM OLD.intent_lease_fence
      OR NEW.channel_lease_fence IS DISTINCT FROM OLD.channel_lease_fence)
    AND NOT (OLD.status = 'pending' AND NEW.status = 'executing'
      AND OLD.execution_fence = 0 AND NEW.execution_fence > 0
      AND OLD.intent_lease_fence = 0 AND NEW.intent_lease_fence > 0
      AND OLD.channel_lease_fence = 0 AND NEW.channel_lease_fence > 0) THEN
    RAISE EXCEPTION 'publication execution fence is immutable after execution starts' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.provider_receipt IS DISTINCT FROM OLD.provider_receipt AND NEW.status <> 'published' THEN
    RAISE EXCEPTION 'publication receipt may only be recorded with publication success' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'published' AND NEW.provider_receipt IS NULL THEN
    RAISE EXCEPTION 'published publication requires an exact provider receipt' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.terminal_evidence IS DISTINCT FROM OLD.terminal_evidence
    AND NEW.status NOT IN ('failed', 'reconciliation_required') THEN
    RAISE EXCEPTION 'publication terminal evidence has an invalid state' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IN ('failed', 'reconciliation_required') AND NEW.terminal_evidence IS NULL THEN
    RAISE EXCEPTION 'publication terminal transition requires evidence' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION enforce_publication_authority_fact_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publication authority facts cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.credential_version IS DISTINCT FROM OLD.credential_version
    OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'publication credential identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'publication credential revision must advance exactly once' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.state <> 'active' OR NEW.state = 'active' THEN
    RAISE EXCEPTION 'publication credential cannot be reactivated' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION enforce_publication_intent_lease_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publication intent lease rows cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'publication intent lease identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1 OR NEW.lease_fence <> OLD.lease_fence + 1 THEN
    RAISE EXCEPTION 'publication intent lease fence must advance exactly once' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
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
CREATE TRIGGER publication_transition_guard BEFORE UPDATE ON publications FOR EACH ROW EXECUTE FUNCTION enforce_publication_transition();
DROP TRIGGER IF EXISTS publication_credential_guard ON publication_credential_versions;
CREATE TRIGGER publication_credential_guard BEFORE UPDATE OR DELETE ON publication_credential_versions FOR EACH ROW EXECUTE FUNCTION enforce_publication_authority_fact_mutation();
DROP TRIGGER IF EXISTS publication_intent_lease_guard ON publication_intent_leases;
CREATE TRIGGER publication_intent_lease_guard BEFORE UPDATE OR DELETE ON publication_intent_leases FOR EACH ROW EXECUTE FUNCTION enforce_publication_intent_lease_mutation();
DROP TRIGGER IF EXISTS workflow_events_immutable ON workflow_events;
CREATE TRIGGER workflow_events_immutable BEFORE UPDATE OR DELETE ON workflow_events FOR EACH ROW EXECUTE FUNCTION reject_workflow_event_mutation();
DROP TRIGGER IF EXISTS episode_revisions_immutable ON episode_revisions;
CREATE TRIGGER episode_revisions_immutable BEFORE UPDATE OR DELETE ON episode_revisions FOR EACH ROW EXECUTE FUNCTION reject_episode_revision_mutation();
DROP TRIGGER IF EXISTS approval_challenge_mutation_guard ON approval_challenges;
CREATE TRIGGER approval_challenge_mutation_guard BEFORE UPDATE OR DELETE ON approval_challenges FOR EACH ROW EXECUTE FUNCTION enforce_approval_challenge_mutation();
DROP TRIGGER IF EXISTS approval_mutation_guard ON approvals;
CREATE TRIGGER approval_mutation_guard BEFORE UPDATE OR DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION enforce_approval_mutation();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['projects', 'episodes', 'episode_revisions', 'workflow_runs', 'workflow_run_bindings', 'workflow_steps', 'workflow_attempts', 'workflow_batches', 'jobs', 'approvals', 'approval_challenges', 'assets', 'validation_results', 'publications', 'publication_credential_versions', 'publication_intent_leases', 'workflow_events']
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
CREATE UNIQUE INDEX IF NOT EXISTS effect_records_subject_kind_unique
  ON effect_records (workspace_id, subject_id, kind);
CREATE TABLE IF NOT EXISTS publication_reconciliation_attempts (
  workspace_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('no_match', 'multiple_matches', 'provider_unavailable', 'recovery_identity_mismatch')),
  evidence JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, attempt_id),
  FOREIGN KEY (workspace_id, publication_id) REFERENCES publications (workspace_id, publication_id)
);
ALTER TABLE publication_reconciliation_attempts
  DROP CONSTRAINT IF EXISTS publication_reconciliation_attempts_reason_check;
ALTER TABLE publication_reconciliation_attempts
  ADD CONSTRAINT publication_reconciliation_attempts_reason_check
  CHECK (reason IN ('no_match', 'multiple_matches', 'provider_unavailable', 'recovery_identity_mismatch'));
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
