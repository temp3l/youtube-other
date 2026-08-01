import crypto from "node:crypto";

import {
  approvalGateSchema,
  approvalScopeSchema,
  type ApprovalGate,
  type ContentLocale,
  type ContentVariant,
} from "@mediaforge/domain";

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
import {
  POSTGRES_QUOTA_DIMENSION_MIGRATION,
  reserveQuotaDimensionInTransaction,
} from "./postgres-usage-audit-repository.js";
import {
  persistedWebhookSubjectType,
  type PersistedWebhookEventType,
} from "./webhook-event-catalog.js";

export interface CommandAdmissionResult {
  readonly kind: "admitted" | "replayed";
  readonly commandId: string;
  readonly response: unknown;
}

/** Structural subset of the application execution context used by this adapter. */
export interface WorkflowAdmissionExecution {
  readonly workspace: { readonly id: string };
  readonly idempotency?:
    | {
        readonly key: string;
        readonly fingerprint: string;
      }
    | undefined;
}

export interface PostgresWorkflowAdmissionPortOptions {
  readonly repository: PostgresWorkflowRepository;
  readonly now?: () => Date;
  readonly createId?: (
    prefix: "workflow" | "job" | "outbox" | "command"
  ) => string;
  readonly executionDefaults?: Partial<
    Omit<WorkflowExecutionSpecification, "input">
  >;
}

export interface PostgresQueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount?: number | null;
}

export interface PostgresClient {
  query<T>(
    sql: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<T>>;
  release(): void;
}

/** A minimal node-postgres-compatible pool; infrastructure owns its lifecycle. */
export interface PostgresPool {
  query<T>(
    sql: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<T>>;
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

interface ProjectRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly name: string;
  readonly profile: "dark_truth" | "mathematics_education" | "dynamic_generic";
  readonly revision: string | number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface EpisodeRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly episode_id: string;
  readonly content: unknown;
  readonly revision: string | number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface EpisodeReplacementRow extends EpisodeRow {
  readonly revision_id: string;
  readonly previous_revision: string | number;
  readonly evidence: unknown;
}

interface ApprovalChallengeRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly challenge_id: string;
  readonly subject_id: string;
  readonly subject_revision: string | number;
  readonly artifact_hash: string;
  readonly expires_at: Date | string;
  readonly consumed_at: Date | string | null;
  readonly created_at: Date | string;
}

export interface ApiProjectRecord {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly name: string;
  readonly profile: "dark_truth" | "mathematics_education" | "dynamic_generic";
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiEpisodeRecord {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly content: unknown;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EpisodeRevisionEvidenceRecord {
  readonly revisionId: string;
  readonly episodeRevision: number;
  readonly previousRevision: number;
  readonly evidence: unknown;
}

export interface EpisodeContentReplacementRecord {
  readonly episode: ApiEpisodeRecord;
  readonly revisionEvidence: EpisodeRevisionEvidenceRecord;
}

export interface ReplaceEpisodeContentInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly expectedRevision: number;
  readonly revisionId: string;
  readonly content: unknown;
  readonly evidence: unknown;
  readonly now: string;
}

export interface ApprovalChallengeRecord {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly challengeId: string;
  readonly subjectId: string;
  readonly subjectRevision: number;
  readonly artifactHash: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
  readonly createdAt: string;
}

export interface CreateApprovalChallengeInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly challengeId: string;
  readonly runId: string;
  readonly expectedRevision: number;
  readonly artifactHash: string;
  readonly expiresAt: string;
  readonly now: string;
}

export interface ApiAssetDescriptorRecord {
  readonly assetId: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly lifecycle: string;
  readonly provenance: string;
}

export interface ApiValidationRecord {
  readonly validationId: string;
  readonly result: unknown;
  readonly createdAt: string;
}

export interface ApiJobRecord {
  readonly jobId: string;
  readonly revision: number;
  readonly status: string;
  readonly attemptCount: number;
  readonly cancellationRequested: boolean;
  readonly lastError: string | null;
}

export interface ApiWorkflowStepRecord {
  readonly stepId: string;
  readonly revision: number;
  readonly status: string;
}

export interface PublicationIntentBinding {
  readonly projectId: string;
  readonly runId: string;
  readonly approvalId: string;
  readonly approvalRevision: number;
  readonly approvalArtifactHash: string;
  readonly approvalPolicy: "legacy-v1" | "scoped-v1";
  readonly actorPrincipalId: string;
  readonly actorPrincipalRevision: number;
  readonly credentialVersion: string;
  readonly assetHash: string;
  readonly artifactBindings: readonly PublicationArtifactBinding[];
  readonly channelId: string;
  readonly visibility: "private" | "unlisted" | "public";
  readonly scheduledAt: string | null;
  readonly playlistIds: readonly string[];
  readonly recoveryIdentity: string;
}

export interface PublicationArtifactBinding {
  readonly assetId: string;
  readonly role: string;
  readonly contentHash: string;
}

export interface PublicationIntentLease {
  readonly publicationId: string;
  readonly workerId: string;
  readonly leaseFence: number;
  readonly leaseExpiresAt: string;
}

export interface PublicationIntentRecord extends PublicationIntentBinding {
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly status:
    | "pending"
    | "executing"
    | "published"
    | "failed"
    | "reconciliation_required"
    | "cancelled";
  readonly revision: number;
  readonly executionFence: number;
  readonly intentLeaseFence: number;
  readonly channelLeaseFence: number;
  readonly providerReceipt: unknown | null;
  readonly terminalEvidence: unknown | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PublicationIntentRow {
  readonly workspace_id: string;
  readonly publication_id: string;
  readonly project_id: string;
  readonly run_id: string;
  readonly status: PublicationIntentRecord["status"];
  readonly revision: string | number;
  readonly approval_revision: string | number;
  readonly approval_id: string;
  readonly approval_artifact_hash: string;
  readonly approval_policy: PublicationIntentBinding["approvalPolicy"];
  readonly actor_principal_id: string;
  readonly actor_principal_revision: string | number;
  readonly credential_version: string;
  readonly asset_hash: string;
  readonly artifact_bindings: readonly PublicationArtifactBinding[];
  readonly channel_id: string;
  readonly visibility: PublicationIntentBinding["visibility"];
  readonly scheduled_at: Date | string | null;
  readonly playlist_ids: readonly string[];
  readonly recovery_identity: string;
  readonly execution_fence: string | number;
  readonly intent_lease_fence: string | number;
  readonly channel_lease_fence: string | number;
  readonly provider_receipt: unknown | null;
  readonly terminal_evidence: unknown | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export interface AdmitPublicationIntentInput extends PublicationIntentBinding {
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly effectId: string;
  readonly eventId: string;
  readonly outboxId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly now: string;
}

interface JobLeaseRow {
  readonly workspace_id: string;
  readonly job_id: string;
  readonly revision: string | number;
  readonly lease_fence: string | number;
  readonly lease_owner: string;
  readonly lease_expires_at: Date | string;
}

interface DurableJobLeaseRow {
  readonly workspace_id: string;
  readonly job_id: string;
  readonly job_type: string;
  readonly payload: unknown;
  readonly lease_fence: string | number;
  readonly lease_owner: string;
  readonly attempt_count: string | number;
  readonly deadline_at: Date | string | null;
  readonly cancellation_requested: boolean;
}

export interface DurableJobLeaseRecord {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly payload: unknown;
  readonly leaseFence: number;
  readonly leaseOwner: string;
  readonly attemptCount: number;
  readonly deadlineAt: string | null;
  readonly cancellationRequested: boolean;
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
  query<T>(
    sql: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<T>>;
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

function mapProject(row: ProjectRow): ApiProjectRecord {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    name: row.name,
    profile: row.profile,
    revision: Number(row.revision),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapEpisode(row: EpisodeRow): ApiEpisodeRecord {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    episodeId: row.episode_id,
    content: row.content,
    revision: Number(row.revision),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapApprovalChallenge(
  row: ApprovalChallengeRow
): ApprovalChallengeRecord {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    challengeId: row.challenge_id,
    subjectId: row.subject_id,
    subjectRevision: Number(row.subject_revision),
    artifactHash: row.artifact_hash,
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt:
      row.consumed_at === null ? null : new Date(row.consumed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapPublicationIntent(
  row: PublicationIntentRow
): PublicationIntentRecord {
  return {
    workspaceId: row.workspace_id,
    publicationId: row.publication_id,
    projectId: row.project_id,
    runId: row.run_id,
    status: row.status,
    revision: Number(row.revision),
    approvalId: row.approval_id,
    approvalRevision: Number(row.approval_revision),
    approvalArtifactHash: row.approval_artifact_hash,
    approvalPolicy: row.approval_policy,
    actorPrincipalId: row.actor_principal_id,
    actorPrincipalRevision: Number(row.actor_principal_revision),
    credentialVersion: row.credential_version,
    assetHash: row.asset_hash,
    artifactBindings: row.artifact_bindings,
    channelId: row.channel_id,
    visibility: row.visibility,
    scheduledAt:
      row.scheduled_at === null
        ? null
        : new Date(row.scheduled_at).toISOString(),
    playlistIds: row.playlist_ids,
    recoveryIdentity: row.recovery_identity,
    executionFence: Number(row.execution_fence),
    intentLeaseFence: Number(row.intent_lease_fence),
    channelLeaseFence: Number(row.channel_lease_fence),
    providerReceipt: row.provider_receipt,
    terminalEvidence: row.terminal_evidence,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function publicationActiveKey(binding: PublicationIntentBinding): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        binding.projectId,
        binding.runId,
        binding.approvalId,
        binding.approvalRevision,
        binding.approvalArtifactHash,
        binding.approvalPolicy,
        binding.actorPrincipalId,
        binding.actorPrincipalRevision,
        binding.credentialVersion,
        binding.assetHash,
        binding.artifactBindings,
        binding.channelId,
        binding.visibility,
        binding.scheduledAt,
        binding.playlistIds,
      ])
    )
    .digest("hex");
}

function normalizedPublicationBinding(
  binding: PublicationIntentBinding
): PublicationIntentBinding {
  if (
    binding.approvalPolicy !== "legacy-v1" &&
    binding.approvalPolicy !== "scoped-v1"
  ) {
    throw new WorkflowStateTransitionError(
      "Publication approval policy must be legacy-v1 or scoped-v1."
    );
  }
  if (
    !Number.isSafeInteger(binding.approvalRevision) ||
    binding.approvalRevision < 0 ||
    !Number.isSafeInteger(binding.actorPrincipalRevision) ||
    binding.actorPrincipalRevision < 0
  )
    throw new WorkflowStateTransitionError(
      "Publication authority revisions must be non-negative integers."
    );
  for (const [name, hash] of [
    ["approval artifact", binding.approvalArtifactHash],
    ["publication asset", binding.assetHash],
  ] as const) {
    if (!/^[a-f0-9]{64}$/u.test(hash))
      throw new WorkflowStateTransitionError(
        `Publication ${name} hash must be a lowercase SHA-256 digest.`
      );
  }
  if (binding.artifactBindings.length === 0)
    throw new WorkflowStateTransitionError(
      "Publication requires at least one artifact binding."
    );
  const artifacts = binding.artifactBindings
    .map((artifact) => {
      if (
        artifact.assetId.trim().length === 0 ||
        artifact.role.trim().length === 0 ||
        !/^[a-f0-9]{64}$/u.test(artifact.contentHash)
      )
        throw new WorkflowStateTransitionError(
          "Publication artifact bindings require an asset, role, and lowercase SHA-256 hash."
        );
      return {
        assetId: artifact.assetId.trim(),
        role: artifact.role.trim(),
        contentHash: artifact.contentHash,
      };
    })
    .sort(
      (left, right) =>
        left.role.localeCompare(right.role) ||
        left.assetId.localeCompare(right.assetId) ||
        left.contentHash.localeCompare(right.contentHash)
    );
  if (
    new Set(artifacts.map(({ assetId, role }) => `${role}\u0000${assetId}`))
      .size !== artifacts.length
  )
    throw new WorkflowStateTransitionError(
      "Publication artifact bindings must be unique by role and asset."
    );
  if (!artifacts.some(({ contentHash }) => contentHash === binding.assetHash))
    throw new WorkflowStateTransitionError(
      "Publication asset hash must be present in its artifact bindings."
    );
  const playlistIds = [
    ...new Set(binding.playlistIds.map((id) => id.trim())),
  ].sort();
  if (playlistIds.some((id) => id.length === 0))
    throw new WorkflowStateTransitionError(
      "Publication playlist identifiers must be non-empty."
    );
  if (
    binding.scheduledAt !== null &&
    !Number.isFinite(Date.parse(binding.scheduledAt))
  )
    throw new WorkflowStateTransitionError(
      "Publication schedule must be a valid timestamp."
    );
  for (const [name, value] of [
    ["approval", binding.approvalId],
    ["actor principal", binding.actorPrincipalId],
    ["credential version", binding.credentialVersion],
    ["channel", binding.channelId],
    ["recovery identity", binding.recoveryIdentity],
  ] as const) {
    if (value.trim().length === 0)
      throw new WorkflowStateTransitionError(
        `Publication ${name} binding is required.`
      );
  }
  return { ...binding, artifactBindings: artifacts, playlistIds };
}

function requiredJson(value: unknown, name: string): string {
  const serialized = value === undefined ? undefined : JSON.stringify(value);
  if (serialized === undefined)
    throw new WorkflowStateTransitionError(`${name} is required.`);
  return serialized;
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

function mapDurableJobLease(row: DurableJobLeaseRow): DurableJobLeaseRecord {
  return {
    workspaceId: row.workspace_id,
    jobId: row.job_id,
    jobType: row.job_type,
    payload: row.payload,
    leaseFence: Number(row.lease_fence),
    leaseOwner: row.lease_owner,
    attemptCount: Number(row.attempt_count),
    deadlineAt:
      row.deadline_at === null ? null : new Date(row.deadline_at).toISOString(),
    cancellationRequested: row.cancellation_requested,
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

function workflowWebhookEventType(
  status: WorkflowRunStatus
): PersistedWebhookEventType {
  const events: Record<WorkflowRunStatus, PersistedWebhookEventType> = {
    queued: "workflow_run.progressed",
    running: "workflow_run.started",
    awaiting_approval: "workflow_run.awaiting_approval",
    succeeded: "workflow_run.succeeded",
    failed: "workflow_run.failed",
    cancelled: "workflow_run.cancelled",
  };
  return events[status];
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
    input: Omit<
      RelationalWorkflowRun,
      "revision" | "updatedAt" | "authority"
    > & {
      readonly authority?: WorkflowAuthority;
      readonly activeKey?: string | null;
    }
  ): Promise<RelationalWorkflowRun> {
    try {
      const result = await this.connection.query<WorkflowRunRow>(
        `INSERT INTO workflow_runs (
          workspace_id, run_id, status, authority, execution_spec, supersedes_run_id, created_at, updated_at, active_key
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $7::timestamptz, $8)
        RETURNING *`,
        [
          input.workspaceId,
          input.runId,
          input.status,
          input.authority ?? "database-v1",
          JSON.stringify(input.execution),
          input.supersedesRunId,
          input.createdAt,
          input.activeKey ?? null,
        ]
      );
      return mapRow(result.rows[0]!);
    } catch (error) {
      return translate(error);
    }
  }

  public async get(
    workspaceId: string,
    runId: string
  ): Promise<RelationalWorkflowRun | null> {
    const result = await this.connection.query<WorkflowRunRow>(
      `SELECT * FROM workflow_runs WHERE workspace_id = $1 AND run_id = $2`,
      [workspaceId, runId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /** Loads a run only through the tenant-local durable job that owns it. */
  public async getForJob(
    workspaceId: string,
    runId: string,
    jobId: string
  ): Promise<RelationalWorkflowRun | null> {
    const result = await this.connection.query<WorkflowRunRow>(
      `SELECT run.*
       FROM workflow_runs AS run
       INNER JOIN jobs AS job
         ON job.workspace_id = run.workspace_id AND job.run_id = run.run_id
       WHERE run.workspace_id = $1 AND run.run_id = $2 AND job.job_id = $3`,
      [workspaceId, runId, jobId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  public async createProject(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly name: string;
    readonly profile: "dark_truth" | "mathematics_education" | "dynamic_generic";
    readonly now: string;
  }): Promise<ApiProjectRecord> {
    try {
      const result = await this.connection.query<ProjectRow>(
        `INSERT INTO projects (workspace_id, project_id, name, profile, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)
         RETURNING *`,
        [
          input.workspaceId,
          input.projectId,
          input.name,
          input.profile,
          input.now,
        ]
      );
      return mapProject(result.rows[0]!);
    } catch (error) {
      return translate(error);
    }
  }

  public async getProject(
    workspaceId: string,
    projectId: string
  ): Promise<ApiProjectRecord | null> {
    const result = await this.connection.query<ProjectRow>(
      `SELECT * FROM projects WHERE workspace_id = $1 AND project_id = $2`,
      [workspaceId, projectId]
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  public async createEpisode(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly content: unknown;
    readonly now: string;
  }): Promise<ApiEpisodeRecord | null> {
    try {
      const result = await this.connection.query<EpisodeRow>(
        `INSERT INTO episodes (
           workspace_id, project_id, episode_id, content, authority, created_at, updated_at
         )
         SELECT $1, $2, $3, $4::jsonb, 'database-v1', $5::timestamptz, $5::timestamptz
         FROM projects WHERE workspace_id = $1 AND project_id = $2
         RETURNING workspace_id, project_id, episode_id, content, revision, created_at, updated_at`,
        [
          input.workspaceId,
          input.projectId,
          input.episodeId,
          JSON.stringify(input.content),
          input.now,
        ]
      );
      return result.rows[0] ? mapEpisode(result.rows[0]) : null;
    } catch (error) {
      return translate(error);
    }
  }

  public async getEpisode(
    workspaceId: string,
    projectId: string,
    episodeId: string
  ): Promise<ApiEpisodeRecord | null> {
    const result = await this.connection.query<EpisodeRow>(
      `SELECT workspace_id, project_id, episode_id, content, revision, created_at, updated_at
       FROM episodes WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3`,
      [workspaceId, projectId, episodeId]
    );
    return result.rows[0] ? mapEpisode(result.rows[0]) : null;
  }

  /**
   * Replaces episode content using compare-and-swap and records the accepted
   * content plus caller-supplied evidence as an append-only revision.
   */
  public async replaceEpisodeContent(
    input: ReplaceEpisodeContentInput
  ): Promise<EpisodeContentReplacementRecord> {
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    )
      throw new WorkflowStateTransitionError(
        "Episode expected revision must be a non-negative integer."
      );
    if (input.revisionId.trim().length === 0)
      throw new WorkflowStateTransitionError(
        "Episode revision ID is required."
      );
    const content = requiredJson(input.content, "Episode content");
    const evidence = requiredJson(input.evidence, "Episode revision evidence");
    const specification = requiredJson(
      {
        schemaVersion: "episode-revision.v1",
        episodeRevision: input.expectedRevision + 1,
        previousRevision: input.expectedRevision,
        content: input.content,
        evidence: input.evidence,
      },
      "Episode revision specification"
    );
    try {
      const result = await this.connection.query<EpisodeReplacementRow>(
        `WITH updated AS (
           UPDATE episodes
           SET content = $6::jsonb, revision = revision + 1,
               updated_at = $9::timestamptz
           WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3
             AND revision = $4
           RETURNING workspace_id, project_id, episode_id, content, revision,
                     created_at, updated_at
         ), revision_evidence AS (
           INSERT INTO episode_revisions (
             workspace_id, project_id, episode_id, revision_id,
             episode_revision, previous_revision, specification, content,
             evidence, created_at
           )
           SELECT workspace_id, project_id, episode_id, $5, revision, $4,
                  $8::jsonb, content, $7::jsonb, $9::timestamptz
           FROM updated
           RETURNING revision_id, previous_revision, evidence
         )
         SELECT updated.*, revision_evidence.revision_id,
                revision_evidence.previous_revision, revision_evidence.evidence
         FROM updated CROSS JOIN revision_evidence`,
        [
          input.workspaceId,
          input.projectId,
          input.episodeId,
          input.expectedRevision,
          input.revisionId,
          content,
          evidence,
          specification,
          input.now,
        ]
      );
      const row = result.rows[0];
      if (!row)
        throw new WorkflowStateTransitionError(
          "Episode was missing from the project or its revision was stale."
        );
      return {
        episode: mapEpisode(row),
        revisionEvidence: {
          revisionId: row.revision_id,
          episodeRevision: Number(row.revision),
          previousRevision: Number(row.previous_revision),
          evidence: row.evidence,
        },
      };
    } catch (error) {
      return translate(error);
    }
  }

  public async getBoundWorkflow(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly runId: string;
  }): Promise<RelationalWorkflowRun | null> {
    const result = await this.connection.query<WorkflowRunRow>(
      `SELECT run.* FROM workflow_runs AS run
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = run.workspace_id AND binding.run_id = run.run_id
       WHERE run.workspace_id = $1 AND binding.project_id = $2 AND run.run_id = $3`,
      [input.workspaceId, input.projectId, input.runId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  public async getBoundJob(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly jobId: string;
  }): Promise<ApiJobRecord | null> {
    const result = await this.connection.query<{
      readonly job_id: string;
      readonly revision: string | number;
      readonly status: string;
      readonly attempt_count: string | number;
      readonly cancellation_requested: boolean;
      readonly last_error: string | null;
    }>(
      `SELECT job.job_id, job.revision, job.status, job.attempt_count,
              job.cancellation_requested, job.last_error
       FROM jobs AS job
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = job.workspace_id AND binding.run_id = job.run_id
       WHERE job.workspace_id = $1 AND binding.project_id = $2 AND job.job_id = $3`,
      [input.workspaceId, input.projectId, input.jobId]
    );
    const row = result.rows[0];
    return row
      ? {
          jobId: row.job_id,
          revision: Number(row.revision),
          status: row.status,
          attemptCount: Number(row.attempt_count),
          cancellationRequested: row.cancellation_requested,
          lastError: row.last_error,
        }
      : null;
  }

  public async listBoundWorkflowSteps(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly runId: string;
  }): Promise<readonly ApiWorkflowStepRecord[] | null> {
    const bound = await this.getBoundWorkflow(input);
    if (!bound) return null;
    const result = await this.connection.query<{
      readonly step_id: string;
      readonly revision: string | number;
      readonly status: string;
    }>(
      `SELECT step_id, revision, status FROM workflow_steps
       WHERE workspace_id = $1 AND run_id = $2 ORDER BY step_id`,
      [input.workspaceId, input.runId]
    );
    return result.rows.map((row) => ({
      stepId: row.step_id,
      revision: Number(row.revision),
      status: row.status,
    }));
  }

  public async cancelBoundWorkflow(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly runId: string;
    readonly expectedRevision: number;
    readonly now: string;
  }): Promise<{
    readonly run: RelationalWorkflowRun;
    readonly jobId: string;
  } | null> {
    const current = await this.getBoundWorkflow(input);
    if (!current) return null;
    const job = await this.connection.query<{ readonly job_id: string }>(
      `SELECT job_id FROM jobs WHERE workspace_id = $1 AND run_id = $2
       ORDER BY created_at DESC, job_id DESC LIMIT 1`,
      [input.workspaceId, input.runId]
    );
    if (!job.rows[0])
      throw new WorkflowStateTransitionError(
        "Workflow has no durable job to cancel."
      );
    const cancelled = await this.transition({
      workspaceId: input.workspaceId,
      runId: input.runId,
      expectedRevision: input.expectedRevision,
      authority: "database-v1",
      from: current.status,
      status: "cancelled",
      now: input.now,
    });
    await this.connection.query(
      `UPDATE jobs SET
         status = CASE WHEN status IN ('queued', 'retry_scheduled') THEN 'cancelled' ELSE status END,
         revision = revision + 1, cancellation_requested = true,
         completed_at = CASE WHEN status IN ('queued', 'retry_scheduled') THEN $1::timestamptz ELSE completed_at END
       WHERE workspace_id = $2 AND run_id = $3
         AND status IN ('queued', 'retry_scheduled', 'running')`,
      [input.now, input.workspaceId, input.runId]
    );
    return { run: cancelled, jobId: job.rows[0].job_id };
  }

  public async resumeBoundWorkflow(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly runId: string;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly commandId: string;
    readonly jobId: string;
    readonly outboxId: string;
    readonly now: string;
  }): Promise<CommandAdmissionResult | null> {
    const current = await this.getBoundWorkflow(input);
    if (!current) return null;
    const response = {
      workflowRunId: input.runId,
      jobId: input.jobId,
      revision: input.expectedRevision + 1,
    };
    const admission = await this.admitCommand({
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      commandId: input.commandId,
      response,
      job: {
        jobId: input.jobId,
        runId: input.runId,
        jobType: "workflow.resume",
        payload: { workflowRunId: input.runId },
      },
      outbox: {
        outboxId: input.outboxId,
        topic: "workflow.queued",
        payload: {
          workflowRunId: input.runId,
          jobId: input.jobId,
          command: "workflow.resume",
        },
        availableAt: input.now,
      },
      now: input.now,
    });
    if (admission.kind === "replayed") return admission;
    await this.transition({
      workspaceId: input.workspaceId,
      runId: input.runId,
      expectedRevision: input.expectedRevision,
      authority: "database-v1",
      from: current.status,
      status: "queued",
      now: input.now,
    });
    return admission;
  }

  public async getAssetDescriptor(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly assetId: string;
  }): Promise<ApiAssetDescriptorRecord | null> {
    const result = await this.connection.query<{
      readonly asset_id: string;
      readonly mime_type: string;
      readonly byte_count: string | number;
      readonly content_hash: string;
      readonly lifecycle: string;
      readonly provenance: string;
    }>(
      `SELECT asset_id, mime_type, byte_count, content_hash, lifecycle, provenance
       FROM assets
       WHERE workspace_id = $1 AND project_id = $2 AND asset_id = $3
         AND mime_type IS NOT NULL AND byte_count IS NOT NULL
         AND lifecycle IS NOT NULL AND provenance IS NOT NULL`,
      [input.workspaceId, input.projectId, input.assetId]
    );
    const row = result.rows[0];
    return row
      ? {
          assetId: row.asset_id,
          mimeType: row.mime_type,
          bytes: Number(row.byte_count),
          sha256: row.content_hash,
          lifecycle: row.lifecycle,
          provenance: row.provenance,
        }
      : null;
  }

  public async listValidations(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly after?: {
      readonly createdAt: string;
      readonly validationId: string;
    };
    readonly size: number;
  }): Promise<readonly ApiValidationRecord[]> {
    const result = await this.connection.query<{
      readonly validation_id: string;
      readonly result: unknown;
      readonly created_at: Date | string;
    }>(
      `SELECT validation_id, result, created_at FROM validation_results
       WHERE workspace_id = $1 AND project_id = $2
         AND ($3::timestamptz IS NULL OR (created_at, validation_id) > ($3::timestamptz, $4::text))
       ORDER BY created_at, validation_id LIMIT $5`,
      [
        input.workspaceId,
        input.projectId,
        input.after?.createdAt ?? null,
        input.after?.validationId ?? "",
        input.size,
      ]
    );
    return result.rows.map((row) => ({
      validationId: row.validation_id,
      result: row.result,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /** Creates a single-use approval challenge from current, project-owned state. */
  public async createApprovalChallenge(
    input: CreateApprovalChallengeInput
  ): Promise<ApprovalChallengeRecord> {
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    )
      throw new WorkflowStateTransitionError(
        "Approval subject revision must be a non-negative integer."
      );
    if (!/^[a-f0-9]{64}$/u.test(input.artifactHash))
      throw new WorkflowStateTransitionError(
        "Approval artifact hash must be a lowercase SHA-256 digest."
      );
    const now = Date.parse(input.now);
    const expiresAt = Date.parse(input.expiresAt);
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now
    )
      throw new WorkflowStateTransitionError(
        "Approval challenge expiry must be later than its creation time."
      );
    try {
      const result = await this.connection.query<ApprovalChallengeRow>(
        `INSERT INTO approval_challenges (
           workspace_id, project_id, challenge_id, subject_id,
           subject_revision, artifact_hash, expires_at, created_at
         )
         SELECT binding.workspace_id, binding.project_id, $3, run.run_id,
                run.revision, $6, $7::timestamptz, $8::timestamptz
         FROM workflow_run_bindings AS binding
         INNER JOIN workflow_runs AS run
           ON run.workspace_id = binding.workspace_id
          AND run.run_id = binding.run_id
         WHERE binding.workspace_id = $1 AND binding.project_id = $2
           AND binding.run_id = $4 AND run.revision = $5
           AND EXISTS (
             SELECT 1 FROM assets AS asset
             WHERE asset.workspace_id = binding.workspace_id
               AND asset.project_id = binding.project_id
               AND asset.content_hash = $6
           )
         RETURNING workspace_id, project_id, challenge_id, subject_id,
                   subject_revision, artifact_hash, expires_at, consumed_at,
                   created_at`,
        [
          input.workspaceId,
          input.projectId,
          input.challengeId,
          input.runId,
          input.expectedRevision,
          input.artifactHash,
          input.expiresAt,
          input.now,
        ]
      );
      const row = result.rows[0];
      if (!row)
        throw new WorkflowStateTransitionError(
          "Approval subject was missing, stale, outside the project, or not bound to the artifact hash."
        );
      return mapApprovalChallenge(row);
    } catch (error) {
      return translate(error);
    }
  }

  public async recordApproval(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly challengeId: string;
    readonly subjectId: string;
    readonly expectedRevision: number;
    readonly decision: "approved" | "rejected";
    readonly reason: string;
    readonly approvalId: string;
    readonly jobId: string;
    readonly commandId: string;
    readonly outboxId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly now: string;
    readonly gate?: ApprovalGate;
    readonly locale?: ContentLocale;
    readonly variant?: ContentVariant;
    readonly inputArtifactHashes?: readonly string[];
    readonly outputArtifactHashes?: readonly string[];
    readonly actor?: string;
    readonly reviewerRole?: string;
    readonly expiresAt?: string;
    readonly supersedesApprovalId?: string;
    readonly highRisk?: boolean;
    readonly requiredDistinctActors?: number;
  }): Promise<CommandAdmissionResult> {
    const requiredScopedValues = [
      input.gate,
      input.locale,
      input.variant,
      input.inputArtifactHashes,
      input.outputArtifactHashes,
      input.actor,
    ];
    const hasScope =
      requiredScopedValues.some((value) => value !== undefined) ||
      input.highRisk !== undefined ||
      input.requiredDistinctActors !== undefined;
    if (hasScope && requiredScopedValues.some((value) => value === undefined)) {
      throw new WorkflowStateTransitionError(
        "Scoped approvals require gate, locale, variant, input/output hashes, and actor."
      );
    }
    if (
      hasScope &&
      ((input.inputArtifactHashes?.length ?? 0) === 0 ||
        (input.outputArtifactHashes?.length ?? 0) === 0 ||
        [...(input.inputArtifactHashes ?? []), ...(input.outputArtifactHashes ?? [])]
          .some((hash) => !/^[a-f0-9]{64}$/u.test(hash)))
    ) {
      throw new WorkflowStateTransitionError(
        "Scoped approval input/output hashes must be non-empty lowercase SHA-256 digests."
      );
    }
    if (hasScope && input.actor?.trim().length === 0) {
      throw new WorkflowStateTransitionError("Scoped approval actor is required.");
    }
    if (hasScope) {
      approvalScopeSchema.parse({
        gate: approvalGateSchema.parse(input.gate),
        locale: input.locale,
        variant: input.variant,
        inputArtifactHashes: input.inputArtifactHashes,
        outputArtifactHashes: input.outputArtifactHashes,
        highRisk: input.highRisk ?? false,
      });
      const requiredDistinctActors = input.requiredDistinctActors ?? 1;
      if (
        !Number.isSafeInteger(requiredDistinctActors) ||
        requiredDistinctActors < 1 ||
        requiredDistinctActors > 10
      ) {
        throw new WorkflowStateTransitionError(
          "Required distinct approval actors must be an integer from 1 to 10."
        );
      }
    }
    if (
      input.expiresAt !== undefined &&
      (!Number.isFinite(Date.parse(input.expiresAt)) ||
        Date.parse(input.expiresAt) <= Date.parse(input.now))
    ) {
      throw new WorkflowStateTransitionError(
        "Approval expiry must be a valid future timestamp."
      );
    }
    const response = { id: input.approvalId, jobId: input.jobId, revision: 0 };
    const admission = await this.admitCommand({
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      commandId: input.commandId,
      response,
      job: { jobId: input.jobId, runId: input.subjectId },
      outbox: {
        outboxId: input.outboxId,
        topic: "approval.recorded",
        payload: {
          approvalId: input.approvalId,
          subjectId: input.subjectId,
          decision: input.decision,
          ...(input.gate ? { gate: input.gate } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.variant ? { variant: input.variant } : {}),
          ...(input.actor ? { actor: input.actor } : {}),
          ...(hasScope
            ? {
                highRisk: input.highRisk ?? false,
                requiredDistinctActors: input.highRisk
                  ? Math.max(2, input.requiredDistinctActors ?? 1)
                  : input.requiredDistinctActors ?? 1,
              }
            : {}),
        },
        availableAt: input.now,
      },
      now: input.now,
    });
    if (admission.kind === "replayed") return admission;
    const challenge = await this.connection.query<{
      readonly artifact_hash: string;
    }>(
      `UPDATE approval_challenges AS challenge
       SET consumed_at = $1::timestamptz
       FROM workflow_run_bindings AS binding, workflow_runs AS run
       WHERE challenge.workspace_id = $2 AND challenge.project_id = $3
         AND challenge.challenge_id = $4 AND challenge.subject_id = $5
         AND challenge.subject_revision = $6 AND challenge.consumed_at IS NULL
         AND challenge.expires_at > $1::timestamptz
         AND binding.workspace_id = challenge.workspace_id
         AND binding.project_id = challenge.project_id
         AND binding.run_id = challenge.subject_id
         AND run.workspace_id = challenge.workspace_id
         AND run.run_id = challenge.subject_id AND run.revision = $6
       RETURNING challenge.artifact_hash`,
      [
        input.now,
        input.workspaceId,
        input.projectId,
        input.challengeId,
        input.subjectId,
        input.expectedRevision,
      ]
    );
    if (!challenge.rows[0])
      throw new WorkflowStateTransitionError(
        "Approval challenge was missing, stale, expired, or already consumed."
      );
    if (
      hasScope &&
      !input.outputArtifactHashes?.includes(challenge.rows[0].artifact_hash)
    ) {
      throw new WorkflowStateTransitionError(
        "Scoped approval output hashes must include the challenged artifact."
      );
    }
    await this.connection.query(
      `INSERT INTO approvals (
         workspace_id, approval_id, run_id, decision, revision, artifact_hash,
         subject_revision, state, decision_reason, created_at,
         approval_gate, scope_locale, scope_variant, input_artifact_hashes,
         output_artifact_hashes, reviewer_actor, reviewer_role, expires_at,
         supersedes_approval_id, high_risk, required_distinct_actors
       ) VALUES ($1, $2, $3, $4, 0, $5, $6,
                 CASE WHEN $4 = 'approved' THEN 'active' ELSE 'rejected' END,
                 $7, $8::timestamptz, $9, $10, $11, $12::jsonb, $13::jsonb,
                 $14, $15, $16::timestamptz, $17, $18, $19)`,
      [
        input.workspaceId,
        input.approvalId,
        input.subjectId,
        input.decision,
        challenge.rows[0].artifact_hash,
        input.expectedRevision,
        input.reason,
        input.now,
        input.gate ?? null,
        input.locale ?? null,
        input.variant ?? null,
        input.inputArtifactHashes
          ? JSON.stringify(input.inputArtifactHashes)
          : null,
        input.outputArtifactHashes
          ? JSON.stringify(input.outputArtifactHashes)
          : null,
        input.actor ?? null,
        input.reviewerRole ?? null,
        input.expiresAt ?? null,
        input.supersedesApprovalId ?? null,
        input.highRisk ?? false,
        input.highRisk
          ? Math.max(2, input.requiredDistinctActors ?? 1)
          : input.requiredDistinctActors ?? 1,
      ]
    );
    const approvalEventType =
      input.decision === "rejected" ? "approval.rejected" : "approval.created";
    await this.connection.query(
      `INSERT INTO workflow_events (
         workspace_id, event_id, run_id, subject_revision,
         subject_type, subject_id, subject_version, type, data, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8::jsonb, $9::timestamptz)`,
      [
        input.workspaceId,
        `event-${input.approvalId}`,
        input.subjectId,
        input.expectedRevision,
        persistedWebhookSubjectType(approvalEventType),
        input.approvalId,
        approvalEventType,
        JSON.stringify({
          approvalId: input.approvalId,
          decision: input.decision,
          reason: input.reason,
          ...(hasScope
            ? {
                gate: input.gate,
                locale: input.locale,
                variant: input.variant,
                inputArtifactHashes: input.inputArtifactHashes,
                outputArtifactHashes: input.outputArtifactHashes,
                actor: input.actor,
                highRisk: input.highRisk ?? false,
                requiredDistinctActors: input.highRisk
                  ? Math.max(2, input.requiredDistinctActors ?? 1)
                  : input.requiredDistinctActors ?? 1,
                ...(input.reviewerRole ? { reviewerRole: input.reviewerRole } : {}),
                ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
                ...(input.supersedesApprovalId
                  ? { supersedesApprovalId: input.supersedesApprovalId }
                  : {}),
              }
            : {}),
        }),
        input.now,
      ]
    );
    return admission;
  }

  /** CAS revocation retains the original decision evidence and appends its event. */
  public async revokeApproval(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly approvalId: string;
    readonly expectedRevision: number;
    readonly actorPrincipalId: string;
    readonly reason: string;
    readonly eventId: string;
    readonly commandId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly now: string;
  }): Promise<CommandAdmissionResult> {
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      input.projectId.trim().length === 0 ||
      input.actorPrincipalId.trim().length === 0 ||
      input.reason.trim().length === 0 ||
      input.reason.length > 2_000
    )
      throw new WorkflowStateTransitionError(
        "Approval revocation requires a current revision, actor, and bounded reason."
      );
    const response = {
      id: input.approvalId,
      revision: input.expectedRevision + 1,
      state: "revoked",
      revokedAt: input.now,
    };
    const admission = await this.connection.query<{
      readonly command_id: string;
      readonly response: unknown;
    }>(
      `INSERT INTO command_admissions (
         workspace_id, idempotency_key, request_fingerprint,
         command_id, response, created_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
       ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
       RETURNING command_id, response`,
      [
        input.workspaceId,
        input.idempotencyKey,
        input.requestFingerprint,
        input.commandId,
        JSON.stringify(response),
        input.now,
      ]
    );
    if (!admission.rows[0]) {
      const existing = await this.connection.query<{
        readonly command_id: string;
        readonly request_fingerprint: string;
        readonly response: unknown;
      }>(
        `SELECT command_id, request_fingerprint, response
         FROM command_admissions
         WHERE workspace_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [input.workspaceId, input.idempotencyKey]
      );
      const replay = existing.rows[0];
      if (!replay)
        throw new Error(
          "Idempotency record disappeared during approval revocation."
        );
      if (replay.request_fingerprint !== input.requestFingerprint)
        throw new WorkflowStateTransitionError(
          "Idempotency key is already associated with a different request."
        );
      return {
        kind: "replayed",
        commandId: replay.command_id,
        response: replay.response,
      };
    }
    const revoked = await this.connection.query<{
      readonly run_id: string;
      readonly revision: string | number;
    }>(
      `UPDATE approvals AS approval
       SET state = 'revoked', revision = approval.revision + 1,
           revoked_at = $1::timestamptz, revoked_by_principal_id = $2,
           revocation_reason = $3
       FROM workflow_run_bindings AS binding
       WHERE approval.workspace_id = $4 AND approval.approval_id = $5
         AND approval.revision = $6 AND approval.decision = 'approved'
         AND approval.state = 'active' AND approval.revoked_at IS NULL
         AND binding.workspace_id = approval.workspace_id
         AND binding.project_id = $7 AND binding.run_id = approval.run_id
       RETURNING approval.run_id, approval.revision`,
      [
        input.now,
        input.actorPrincipalId,
        input.reason,
        input.workspaceId,
        input.approvalId,
        input.expectedRevision,
        input.projectId,
      ]
    );
    const row = revoked.rows[0];
    if (!row)
      throw new WorkflowStateTransitionError(
        "Approval was missing, stale, rejected, or already revoked."
      );
    const revision = Number(row.revision);
    await this.connection.query(
      `INSERT INTO workflow_events (
         workspace_id, event_id, run_id, subject_revision,
         subject_type, subject_id, subject_version, type, data, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $4, 'approval.revoked',
                 $7::jsonb, $8::timestamptz)`,
      [
        input.workspaceId,
        input.eventId,
        row.run_id,
        revision,
        persistedWebhookSubjectType("approval.revoked"),
        input.approvalId,
        JSON.stringify({
          approvalId: input.approvalId,
          actorPrincipalId: input.actorPrincipalId,
          reason: input.reason,
        }),
        input.now,
      ]
    );
    return {
      kind: "admitted",
      commandId: admission.rows[0].command_id,
      response: admission.rows[0].response,
    };
  }

  public async getPublicationIntent(
    workspaceId: string,
    projectId: string,
    publicationId: string
  ): Promise<PublicationIntentRecord | null> {
    const result = await this.connection.query<PublicationIntentRow>(
      `SELECT * FROM publications
       WHERE workspace_id = $1 AND project_id = $2 AND publication_id = $3
         AND project_id IS NOT NULL AND approval_revision IS NOT NULL
         AND approval_id IS NOT NULL AND approval_artifact_hash IS NOT NULL
         AND approval_policy IS NOT NULL
         AND actor_principal_id IS NOT NULL AND actor_principal_revision IS NOT NULL
         AND credential_version IS NOT NULL AND asset_hash IS NOT NULL
         AND artifact_bindings IS NOT NULL AND channel_id IS NOT NULL
         AND visibility IS NOT NULL AND playlist_ids IS NOT NULL
         AND recovery_identity IS NOT NULL`,
      [workspaceId, projectId, publicationId]
    );
    return result.rows[0] ? mapPublicationIntent(result.rows[0]) : null;
  }

  /**
   * Records upload intent without dispatching provider mutation. The command,
   * immutable binding, prepared effect, audit event, and notification outbox
   * are committed by the caller's workspace transaction.
   */
  public async admitPublicationIntent(
    input: AdmitPublicationIntentInput
  ): Promise<CommandAdmissionResult> {
    try {
      const binding = normalizedPublicationBinding(input);
      const response = {
        publicationId: input.publicationId,
        revision: 0,
        status: "pending",
        approvalPolicy: binding.approvalPolicy,
      };
      const inserted = await this.connection.query<{
        readonly command_id: string;
        readonly response: unknown;
      }>(
        `INSERT INTO command_admissions (
           workspace_id, idempotency_key, request_fingerprint, command_id, response, created_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
         RETURNING command_id, response`,
        [
          input.workspaceId,
          input.idempotencyKey,
          input.requestFingerprint,
          input.commandId,
          JSON.stringify(response),
          input.now,
        ]
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
        if (!record)
          throw new Error(
            "Idempotency record disappeared during publication admission."
          );
        if (record.request_fingerprint !== input.requestFingerprint)
          throw new WorkflowStateTransitionError(
            "Idempotency key is already associated with a different request."
          );
        const replayPolicy = (record.response as { approvalPolicy?: unknown })
          .approvalPolicy;
        if (
          replayPolicy !== binding.approvalPolicy &&
          !(replayPolicy === undefined && binding.approvalPolicy === "legacy-v1")
        ) {
          throw new WorkflowStateTransitionError(
            "Publication replay approval policy does not match the immutable intent."
          );
        }
        return {
          kind: "replayed",
          commandId: record.command_id,
          response: record.response,
        };
      }
      const publication = await this.connection.query(
        `INSERT INTO publications (
           workspace_id, publication_id, project_id, run_id, status, revision,
           approval_id, approval_revision, approval_artifact_hash,
           actor_principal_id, actor_principal_revision, credential_version,
           asset_hash, artifact_bindings, channel_id, visibility, scheduled_at,
           playlist_ids, recovery_identity, active_key, execution_fence,
           intent_lease_fence, channel_lease_fence, created_at, updated_at
           , approval_policy
         )
         SELECT $1, $2, $3, $4, 'pending', 0, $5, $6, $7, $8, $9, $10,
                $11, $12::jsonb, $13, $14, $15::timestamptz, $16::jsonb,
                $17, $18, 0, 0, 0, $19::timestamptz, $19::timestamptz, $20
         FROM workflow_run_bindings
         WHERE workspace_id = $1 AND project_id = $3 AND run_id = $4`,
        [
          input.workspaceId,
          input.publicationId,
          binding.projectId,
          binding.runId,
          binding.approvalId,
          binding.approvalRevision,
          binding.approvalArtifactHash,
          binding.actorPrincipalId,
          binding.actorPrincipalRevision,
          binding.credentialVersion,
          binding.assetHash,
          JSON.stringify(binding.artifactBindings),
          binding.channelId,
          binding.visibility,
          binding.scheduledAt,
          JSON.stringify(binding.playlistIds),
          binding.recoveryIdentity,
          publicationActiveKey(binding),
          input.now,
          binding.approvalPolicy,
        ]
      );
      if (publication.rowCount !== 1)
        throw new WorkflowStateTransitionError(
          "Publication run was missing or outside the requested project."
        );
      await this.connection.query(
        `INSERT INTO effect_records (
           workspace_id, effect_id, subject_id, kind, state, created_at, updated_at
         ) VALUES ($1, $2, $3, 'youtube.video_upload', 'prepared', $4::timestamptz, $4::timestamptz)`,
        [input.workspaceId, input.effectId, input.publicationId, input.now]
      );
      await this.connection.query(
        `INSERT INTO workflow_events (
           workspace_id, event_id, run_id, subject_revision,
           subject_type, subject_id, subject_version, type, data, occurred_at
         ) VALUES ($1, $2, $3, 0, $4, $5, 1, 'publication.started',
                   $6::jsonb, $7::timestamptz)`,
        [
          input.workspaceId,
          input.eventId,
          input.runId,
          persistedWebhookSubjectType("publication.started"),
          input.publicationId,
          JSON.stringify({
            publicationId: input.publicationId,
            projectId: input.projectId,
            effectId: input.effectId,
            status: "pending",
          }),
          input.now,
        ]
      );
      await this.connection.query(
        `INSERT INTO workflow_outbox (
           workspace_id, outbox_id, topic, payload, available_at
         ) VALUES ($1, $2, 'publication.intent_recorded', $3::jsonb, $4::timestamptz)`,
        [
          input.workspaceId,
          input.outboxId,
          JSON.stringify({
            publicationId: input.publicationId,
            projectId: input.projectId,
            runId: input.runId,
            effectId: input.effectId,
          }),
          input.now,
        ]
      );
      return {
        kind: "admitted",
        commandId: inserted.rows[0].command_id,
        response: inserted.rows[0].response,
      };
    } catch (error) {
      return translate(error);
    }
  }

  /** Claims the intent independently from the channel-wide serialization lease. */
  public async claimPublicationIntentLease(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<PublicationIntentLease | null> {
    if (!Number.isSafeInteger(input.leaseSeconds) || input.leaseSeconds <= 0)
      throw new WorkflowStateTransitionError(
        "Publication intent lease seconds must be a positive integer."
      );
    const result = await this.connection.query<{
      readonly publication_id: string;
      readonly lease_owner: string;
      readonly lease_fence: string | number;
      readonly lease_expires_at: Date | string;
    }>(
      `INSERT INTO publication_intent_leases (
         workspace_id, publication_id, lease_owner, lease_fence,
         lease_expires_at, created_at, updated_at
       )
       SELECT $1, $2, $3, 1,
              $4::timestamptz + ($5::text || ' seconds')::interval,
              $4::timestamptz, $4::timestamptz
       FROM publications
       WHERE workspace_id = $1 AND publication_id = $2 AND status = 'pending'
       ON CONFLICT (workspace_id, publication_id) DO UPDATE
       SET lease_owner = EXCLUDED.lease_owner,
           lease_fence = publication_intent_leases.lease_fence + 1,
           lease_expires_at = EXCLUDED.lease_expires_at,
           revision = publication_intent_leases.revision + 1,
           updated_at = EXCLUDED.updated_at
       WHERE publication_intent_leases.lease_expires_at <= $4::timestamptz
       RETURNING publication_id, lease_owner, lease_fence, lease_expires_at`,
      [
        input.workspaceId,
        input.publicationId,
        input.workerId,
        input.now,
        input.leaseSeconds,
      ]
    );
    const lease = result.rows[0];
    return lease
      ? {
          publicationId: lease.publication_id,
          workerId: lease.lease_owner,
          leaseFence: Number(lease.lease_fence),
          leaseExpiresAt: new Date(lease.lease_expires_at).toISOString(),
        }
      : null;
  }

  /**
   * Starts the irreversible boundary only after locking and rechecking every
   * current authority fact and both live lease fences in this transaction.
   */
  public async beginPublicationExecution(
    input: PublicationIntentBinding & {
      readonly workspaceId: string;
      readonly publicationId: string;
      readonly workerId: string;
      readonly intentLeaseFence: number;
      readonly channelLeaseFence: number;
      readonly now: string;
    }
  ): Promise<boolean> {
    if (
      !Number.isSafeInteger(input.intentLeaseFence) ||
      input.intentLeaseFence <= 0 ||
      !Number.isSafeInteger(input.channelLeaseFence) ||
      input.channelLeaseFence <= 0
    )
      throw new WorkflowStateTransitionError(
        "Publication execution requires positive intent and channel lease fences."
      );
    const binding = normalizedPublicationBinding(input);
    const publication = await this.connection.query(
      `WITH locked_intent AS MATERIALIZED (
         SELECT publication.* FROM publications AS publication
         WHERE publication.workspace_id = $1 AND publication.publication_id = $2
           AND publication.status = 'pending'
           AND publication.project_id = $3 AND publication.run_id = $4
           AND publication.approval_id = $5 AND publication.approval_revision = $6
           AND publication.approval_artifact_hash = $7
           AND publication.actor_principal_id = $8
           AND publication.actor_principal_revision = $9
           AND publication.credential_version = $10
           AND publication.asset_hash = $11
           AND publication.artifact_bindings = $12::jsonb
           AND publication.channel_id = $13 AND publication.visibility = $14
           AND publication.scheduled_at IS NOT DISTINCT FROM $15::timestamptz
           AND publication.playlist_ids = $16::jsonb
           AND publication.recovery_identity = $17
           AND publication.approval_policy = $22
         FOR UPDATE OF publication
       ), locked_approval AS MATERIALIZED (
         SELECT approval.approval_id
         FROM approvals AS approval
         INNER JOIN locked_intent AS intent
           ON intent.workspace_id = approval.workspace_id
          AND intent.run_id = approval.run_id
          AND intent.approval_id = approval.approval_id
         WHERE approval.decision = 'approved' AND approval.state = 'active'
           AND approval.revoked_at IS NULL
           AND approval.subject_revision = intent.approval_revision
           AND approval.artifact_hash = intent.approval_artifact_hash
           AND (
             (
               intent.approval_policy = 'legacy-v1'
               AND approval.approval_gate IS NULL
               AND approval.scope_locale IS NULL
               AND approval.scope_variant IS NULL
               AND approval.input_artifact_hashes IS NULL
               AND approval.output_artifact_hashes IS NULL
               AND approval.reviewer_actor IS NULL
               AND approval.reviewer_role IS NULL
               AND approval.expires_at IS NULL
               AND approval.supersedes_approval_id IS NULL
               AND approval.high_risk = FALSE
               AND approval.required_distinct_actors = 1
             )
             OR (
           intent.approval_policy = 'scoped-v1'
           AND approval.approval_gate = 'publish'
           AND approval.scope_locale IN ('en', 'de', 'es', 'fr', 'pt', 'it')
           AND approval.scope_variant IN ('full', 'short')
           AND jsonb_typeof(approval.input_artifact_hashes) = 'array'
           AND jsonb_array_length(approval.input_artifact_hashes) > 0
           AND jsonb_typeof(approval.output_artifact_hashes) = 'array'
           AND jsonb_array_length(approval.output_artifact_hashes) > 0
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(approval.input_artifact_hashes) AS hash(value)
             WHERE hash.value !~ '^[a-f0-9]{64}$'
           )
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(approval.output_artifact_hashes) AS hash(value)
             WHERE hash.value !~ '^[a-f0-9]{64}$'
           )
           AND approval.output_artifact_hashes @> jsonb_build_array(intent.approval_artifact_hash)
           AND approval.reviewer_actor IS NOT NULL
           AND (approval.expires_at IS NULL OR approval.expires_at > $21::timestamptz)
           AND NOT EXISTS (
             SELECT 1 FROM approvals AS terminal
             WHERE terminal.workspace_id = approval.workspace_id
               AND terminal.run_id = approval.run_id
               AND terminal.decision = 'rejected'
               AND terminal.created_at >= approval.created_at
               AND terminal.subject_revision = approval.subject_revision
               AND terminal.approval_gate = approval.approval_gate
               AND terminal.scope_locale = approval.scope_locale
               AND terminal.scope_variant = approval.scope_variant
               AND terminal.input_artifact_hashes = approval.input_artifact_hashes
               AND terminal.output_artifact_hashes = approval.output_artifact_hashes
           )
           AND (
             SELECT COUNT(DISTINCT peer.reviewer_actor)
             FROM approvals AS peer
             WHERE peer.workspace_id = approval.workspace_id
               AND peer.run_id = approval.run_id
               AND peer.decision = 'approved' AND peer.state = 'active'
               AND peer.revoked_at IS NULL
               AND peer.subject_revision = approval.subject_revision
               AND peer.approval_gate = approval.approval_gate
               AND peer.scope_locale = approval.scope_locale
               AND peer.scope_variant = approval.scope_variant
               AND peer.input_artifact_hashes = approval.input_artifact_hashes
               AND peer.output_artifact_hashes = approval.output_artifact_hashes
               AND peer.reviewer_actor IS NOT NULL
               AND (peer.expires_at IS NULL OR peer.expires_at > $21::timestamptz)
           ) >= GREATEST(
             approval.required_distinct_actors,
             CASE WHEN approval.high_risk THEN 2 ELSE 1 END
           )
             )
           )
         FOR UPDATE OF approval
       ), locked_actor AS MATERIALIZED (
         SELECT principal.principal_id
         FROM workspace_principals AS principal
         INNER JOIN locked_intent AS intent
           ON intent.workspace_id = principal.workspace_id
          AND intent.actor_principal_id = principal.principal_id
         WHERE principal.active = TRUE AND principal.revoked_at IS NULL
           AND principal.revision = intent.actor_principal_revision
           AND principal.permissions ? 'publication.execute'
         FOR UPDATE OF principal
       ), locked_credential AS MATERIALIZED (
         SELECT credential.credential_version
         FROM publication_credential_versions AS credential
         INNER JOIN locked_intent AS intent
           ON intent.workspace_id = credential.workspace_id
          AND intent.credential_version = credential.credential_version
          AND intent.channel_id = credential.channel_id
         WHERE credential.state = 'active' AND credential.revoked_at IS NULL
         FOR UPDATE OF credential
       ), locked_intent_lease AS MATERIALIZED (
         SELECT lease.publication_id
         FROM publication_intent_leases AS lease
         INNER JOIN locked_intent AS intent
           ON intent.workspace_id = lease.workspace_id
          AND intent.publication_id = lease.publication_id
         WHERE lease.lease_owner = $18 AND lease.lease_fence = $19
           AND lease.lease_expires_at > $21::timestamptz
         FOR UPDATE OF lease
       ), locked_channel_lease AS MATERIALIZED (
         SELECT lease.channel_id
         FROM publication_channel_leases AS lease
         INNER JOIN locked_intent AS intent
           ON intent.workspace_id = lease.workspace_id
          AND intent.channel_id = lease.channel_id
         WHERE lease.lease_owner = $18 AND lease.lease_fence = $20
           AND lease.lease_expires_at > $21::timestamptz
         FOR UPDATE OF lease
       ), locked_artifacts AS MATERIALIZED (
         SELECT asset.asset_id
         FROM locked_intent AS intent
         CROSS JOIN LATERAL jsonb_array_elements(intent.artifact_bindings) AS binding
         INNER JOIN assets AS asset
           ON asset.workspace_id = intent.workspace_id
          AND asset.project_id = intent.project_id
          AND asset.asset_id = binding ->> 'assetId'
          AND asset.content_hash = binding ->> 'contentHash'
         WHERE asset.status = 'ready'
         FOR UPDATE OF asset
       ), authorized AS (
         SELECT intent.publication_id
         FROM locked_intent AS intent
         WHERE (intent.scheduled_at IS NULL OR intent.scheduled_at <= $21::timestamptz)
           AND EXISTS (SELECT 1 FROM locked_approval)
           AND EXISTS (SELECT 1 FROM locked_actor)
           AND EXISTS (SELECT 1 FROM locked_credential)
           AND EXISTS (SELECT 1 FROM locked_intent_lease)
           AND EXISTS (SELECT 1 FROM locked_channel_lease)
           AND (SELECT COUNT(*) FROM locked_artifacts) = jsonb_array_length(intent.artifact_bindings)
       )
       UPDATE publications AS publication
       SET status = 'executing', revision = publication.revision + 1,
           execution_fence = $20, intent_lease_fence = $19,
           channel_lease_fence = $20,
           updated_at = $21::timestamptz
       FROM authorized
       WHERE publication.workspace_id = $1
         AND publication.publication_id = authorized.publication_id
       RETURNING publication.publication_id`,
      [
        input.workspaceId,
        input.publicationId,
        binding.projectId,
        binding.runId,
        binding.approvalId,
        binding.approvalRevision,
        binding.approvalArtifactHash,
        binding.actorPrincipalId,
        binding.actorPrincipalRevision,
        binding.credentialVersion,
        binding.assetHash,
        JSON.stringify(binding.artifactBindings),
        binding.channelId,
        binding.visibility,
        binding.scheduledAt,
        JSON.stringify(binding.playlistIds),
        binding.recoveryIdentity,
        input.workerId,
        input.intentLeaseFence,
        input.channelLeaseFence,
        input.now,
        binding.approvalPolicy,
      ]
    );
    if (publication.rowCount !== 1) return false;
    const effect = await this.connection.query(
      `UPDATE effect_records
       SET state = 'in_flight', revision = revision + 1,
           updated_at = $1::timestamptz
       WHERE workspace_id = $2 AND subject_id = $3
         AND kind = 'youtube.video_upload' AND state = 'prepared'`,
      [input.now, input.workspaceId, input.publicationId]
    );
    if (effect.rowCount !== 1)
      throw new WorkflowStateTransitionError(
        "Publication upload effect was missing or already started."
      );
    return true;
  }

  private async finishPublicationExecution(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly now: string;
    readonly outcome:
      | { readonly status: "published"; readonly receipt: unknown }
      | {
          readonly status: "failed" | "reconciliation_required";
          readonly evidence: unknown;
        };
  }): Promise<PublicationIntentRecord | null> {
    const published = input.outcome.status === "published";
    const evidence = published
      ? requiredJson(input.outcome.receipt, "Publication provider receipt")
      : requiredJson(input.outcome.evidence, "Publication terminal evidence");
    const publication = await this.connection.query<PublicationIntentRow>(
      `UPDATE publications
       SET status = $1, revision = revision + 1,
           provider_receipt = CASE WHEN $1 = 'published' THEN $2::jsonb ELSE provider_receipt END,
           terminal_evidence = CASE WHEN $1 IN ('failed', 'reconciliation_required') THEN $2::jsonb ELSE terminal_evidence END,
           updated_at = $3::timestamptz
       WHERE workspace_id = $4 AND publication_id = $5 AND status = 'executing'
         AND execution_fence = $6
       RETURNING *`,
      [
        input.outcome.status,
        evidence,
        input.now,
        input.workspaceId,
        input.publicationId,
        input.channelLeaseFence,
      ]
    );
    if (publication.rowCount !== 1) return null;
    const effectState =
      input.outcome.status === "reconciliation_required"
        ? "outcome_uncertain"
        : "reconciled";
    const effect = await this.connection.query(
      `UPDATE effect_records
       SET state = $1, revision = revision + 1, evidence = $2::jsonb,
           updated_at = $3::timestamptz
       WHERE workspace_id = $4 AND subject_id = $5
         AND kind = 'youtube.video_upload' AND state = 'in_flight'`,
      [effectState, evidence, input.now, input.workspaceId, input.publicationId]
    );
    if (effect.rowCount !== 1)
      throw new WorkflowStateTransitionError(
        "Publication upload effect was missing or in an unexpected state."
      );
    if (input.outcome.status !== "reconciliation_required") {
      const eventType = published
        ? "publication.succeeded"
        : "publication.failed";
      const current = publication.rows[0]!;
      await this.connection.query(
        `INSERT INTO workflow_events (
           workspace_id, event_id, run_id, subject_revision,
           subject_type, subject_id, subject_version, type, data, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $4, $7, $8::jsonb, $9::timestamptz)`,
        [
          input.workspaceId,
          `event-${input.publicationId}-${current.revision}-${input.outcome.status}`,
          current.run_id,
          Number(current.revision),
          persistedWebhookSubjectType(eventType),
          input.publicationId,
          eventType,
          JSON.stringify({
            publicationId: input.publicationId,
            status: input.outcome.status,
          }),
          input.now,
        ]
      );
    }
    return mapPublicationIntent(publication.rows[0]!);
  }

  public async markPublicationPublished(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly receipt: unknown;
    readonly now: string;
  }): Promise<boolean> {
    return Boolean(
      await this.finishPublicationExecution({
        ...input,
        outcome: { status: "published", receipt: input.receipt },
      })
    );
  }

  public async markPublicationFailed(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly evidence: unknown;
    readonly now: string;
  }): Promise<boolean> {
    return Boolean(
      await this.finishPublicationExecution({
        ...input,
        outcome: { status: "failed", evidence: input.evidence },
      })
    );
  }

  public async markPublicationReconciliationRequired(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly evidence: unknown;
    readonly eventId: string;
    readonly outboxId: string;
    readonly now: string;
  }): Promise<boolean> {
    const publication = await this.finishPublicationExecution({
      ...input,
      outcome: {
        status: "reconciliation_required",
        evidence: input.evidence,
      },
    });
    if (!publication) return false;
    const payload = {
      id: publication.publicationId,
      projectId: publication.projectId,
      approvalRevision: publication.approvalRevision,
      credentialVersion: publication.credentialVersion,
      assetHash: publication.assetHash,
      recoveryIdentity: publication.recoveryIdentity,
      state: "reconciliation_required",
    };
    await this.connection.query(
      `INSERT INTO workflow_events (
         workspace_id, event_id, run_id, subject_revision,
         subject_type, subject_id, subject_version, type, data, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $4,
                 'publication.reconciliation_required', $7::jsonb, $8::timestamptz)`,
      [
        input.workspaceId,
        input.eventId,
        publication.runId,
        publication.revision,
        persistedWebhookSubjectType("publication.reconciliation_required"),
        publication.publicationId,
        JSON.stringify(payload),
        input.now,
      ]
    );
    await this.connection.query(
      `INSERT INTO workflow_outbox (
         workspace_id, outbox_id, topic, payload, available_at
       ) VALUES ($1, $2, 'publication.reconciliation_required', $3::jsonb, $4::timestamptz)`,
      [input.workspaceId, input.outboxId, JSON.stringify(payload), input.now]
    );
    return true;
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
        [
          input.status,
          input.now,
          input.workspaceId,
          input.runId,
          input.expectedRevision,
          input.from,
          input.authority,
        ]
      );
      if (!result.rows[0])
        throw new WorkflowStateTransitionError(
          "Workflow run was missing, stale, terminal, or in an unexpected state."
        );
      if (["succeeded", "failed", "cancelled"].includes(input.status)) {
        await this.connection.query(
          `UPDATE quota_dimension_reservations
           SET state = 'released', revision = revision + 1,
               updated_at = $1::timestamptz
           WHERE workspace_id = $2 AND reservation_id = $3
             AND dimension = 'active_workflows' AND subject_id = $4
             AND state = 'reserved'`,
          [input.now, input.workspaceId, `workflow:${input.runId}`, input.runId]
        );
      }
      const run = mapRow(result.rows[0]);
      const eventType = workflowWebhookEventType(input.status);
      await this.connection.query(
        `INSERT INTO workflow_events (
           workspace_id, event_id, run_id, subject_revision,
           subject_type, subject_id, subject_version, type, data, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $3, $4, $6, $7::jsonb, $8::timestamptz)`,
        [
          input.workspaceId,
          `event-${input.runId}-${run.revision}-${input.status}`,
          input.runId,
          run.revision,
          persistedWebhookSubjectType(eventType),
          eventType,
          JSON.stringify({ status: input.status }),
          input.now,
        ]
      );
      return run;
    } catch (error) {
      return translate(error);
    }
  }

  public async createJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly runId: string;
    readonly jobType?: string;
    readonly payload?: unknown;
    readonly availableAt?: string;
    readonly deadlineAt?: string | null;
  }): Promise<void> {
    try {
      await this.connection.query(
        `INSERT INTO jobs (
           workspace_id, job_id, run_id, status, job_type, payload, available_at, deadline_at, created_at
         ) VALUES ($1, $2, $3, 'queued', $4, $5::jsonb, COALESCE($6::timestamptz, now()), $7::timestamptz, COALESCE($6::timestamptz, now()))`,
        [
          input.workspaceId,
          input.jobId,
          input.runId,
          input.jobType ?? "workflow",
          JSON.stringify(input.payload ?? {}),
          input.availableAt ?? null,
          input.deadlineAt ?? null,
        ]
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
    readonly job: {
      readonly jobId: string;
      readonly runId: string;
      readonly jobType?: string;
      readonly payload?: unknown;
      readonly deadlineAt?: string | null;
    };
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
        [
          input.workspaceId,
          input.idempotencyKey,
          input.requestFingerprint,
          input.commandId,
          JSON.stringify(input.response),
          input.now,
        ]
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
        if (!record)
          throw new Error("Idempotency record disappeared during admission.");
        if (record.request_fingerprint !== input.requestFingerprint)
          throw new WorkflowStateTransitionError(
            "Idempotency key is already associated with a different request."
          );
        return {
          kind: "replayed",
          commandId: record.command_id,
          response: record.response,
        };
      }
      await this.createJob({
        workspaceId: input.workspaceId,
        jobId: input.job.jobId,
        runId: input.job.runId,
        ...(input.job.jobType !== undefined
          ? { jobType: input.job.jobType }
          : {}),
        ...(input.job.payload !== undefined
          ? { payload: input.job.payload }
          : {}),
        ...(input.job.deadlineAt !== undefined
          ? { deadlineAt: input.job.deadlineAt }
          : {}),
        availableAt: input.now,
      });
      await this.connection.query(
        `INSERT INTO workflow_outbox (workspace_id, outbox_id, topic, payload, available_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
        [
          input.workspaceId,
          input.outbox.outboxId,
          input.outbox.topic,
          JSON.stringify(input.outbox.payload),
          input.outbox.availableAt,
        ]
      );
      return {
        kind: "admitted",
        commandId: inserted.rows[0].command_id,
        response: inserted.rows[0].response,
      };
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
    readonly run: Omit<
      RelationalWorkflowRun,
      "revision" | "updatedAt" | "authority"
    > & {
      readonly authority?: WorkflowAuthority;
      readonly activeKey?: string | null;
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
    readonly binding?: {
      readonly projectId: string;
      readonly episodeId: string;
      readonly expectedEpisodeRevision: number;
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
        [
          input.run.workspaceId,
          input.idempotencyKey,
          input.requestFingerprint,
          input.commandId,
          JSON.stringify(input.response),
          input.now,
        ]
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
        if (!record)
          throw new Error("Idempotency record disappeared during admission.");
        if (record.request_fingerprint !== input.requestFingerprint)
          throw new WorkflowStateTransitionError(
            "Idempotency key is already associated with a different request."
          );
        return {
          kind: "replayed",
          commandId: record.command_id,
          response: record.response,
        };
      }
      /*
       * A configured concurrency policy is authoritative and reserved in this
       * same admission transaction. Missing policy preserves the established
       * internal/connected-CLI contract; external pilot admission must
       * provision this policy and is separately gated from public exposure.
       * The command-admission replay returns above, so it cannot reserve twice.
       */
      await reserveQuotaDimensionInTransaction(this.connection, {
        workspaceId: input.run.workspaceId,
        reservationId: `workflow:${input.run.runId}`,
        dimension: "active_workflows",
        attributionKey: `workflow-admission:${input.idempotencyKey}`,
        subjectId: input.run.runId,
        units: 1n,
        now: input.now,
        allowMissingPolicy: true,
      });
      await this.create(input.run);
      if (input.binding) {
        const binding = await this.connection.query(
          `INSERT INTO workflow_run_bindings (
             workspace_id, project_id, episode_id, run_id, created_at
           )
           SELECT $1, $2, $3, $4, $5::timestamptz
           FROM episodes
           WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3 AND revision = $6`,
          [
            input.run.workspaceId,
            input.binding.projectId,
            input.binding.episodeId,
            input.run.runId,
            input.now,
            input.binding.expectedEpisodeRevision,
          ]
        );
        if (binding.rowCount !== 1)
          throw new WorkflowStateTransitionError(
            "Episode was missing, outside the project, or at a different revision."
          );
      }
      await this.createJob({
        workspaceId: input.run.workspaceId,
        jobId: input.job.jobId,
        runId: input.job.runId,
        jobType: "workflow.execute",
        payload: input.outbox.payload,
        availableAt: input.now,
      });
      await this.connection.query(
        `INSERT INTO workflow_outbox (workspace_id, outbox_id, topic, payload, available_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
        [
          input.run.workspaceId,
          input.outbox.outboxId,
          input.outbox.topic,
          JSON.stringify(input.outbox.payload),
          input.outbox.availableAt,
        ]
      );
      return {
        kind: "admitted",
        commandId: inserted.rows[0].command_id,
        response: inserted.rows[0].response,
      };
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
        [
          input.now,
          input.leaseSeconds,
          input.workspaceId,
          input.jobId,
          input.workerId,
          input.leaseFence,
        ]
      );
      return result.rows[0] ? mapLease(result.rows[0]) : null;
    } catch (error) {
      return translate(error);
    }
  }

  /** Claims the next due job in a tenant with a fencing token. */
  public async claimNextJob(input: {
    readonly workspaceId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<DurableJobLeaseRecord | null> {
    const result = await this.connection.query<DurableJobLeaseRow>(
      `WITH candidate AS (
         SELECT workspace_id, job_id FROM jobs
         WHERE workspace_id = $1
           AND cancellation_requested = false
           AND (
             (status IN ('queued', 'retry_scheduled') AND available_at <= $2::timestamptz)
             OR (status = 'running' AND lease_expires_at <= $2::timestamptz)
           )
         ORDER BY available_at, job_id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE jobs AS job
       SET status = 'running', revision = job.revision + 1,
           lease_fence = job.lease_fence + 1, lease_owner = $3,
           lease_expires_at = $2::timestamptz + ($4::text || ' seconds')::interval,
           last_heartbeat_at = $2::timestamptz, attempt_count = job.attempt_count + 1,
           last_error = NULL
       FROM candidate
       WHERE job.workspace_id = candidate.workspace_id AND job.job_id = candidate.job_id
       RETURNING job.workspace_id, job.job_id, job.job_type, job.payload,
                 job.lease_fence, job.lease_owner, job.attempt_count,
                 job.deadline_at, job.cancellation_requested`,
      [input.workspaceId, input.now, input.workerId, input.leaseSeconds]
    );
    return result.rows[0] ? mapDurableJobLease(result.rows[0]) : null;
  }

  public async heartbeatDurableJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<"renewed" | "cancel_requested" | "lost_lease"> {
    const result = await this.connection.query<{
      readonly cancellation_requested: boolean;
    }>(
      `UPDATE jobs SET revision = revision + 1,
         last_heartbeat_at = $1::timestamptz,
         lease_expires_at = $1::timestamptz + ($2::text || ' seconds')::interval
       WHERE workspace_id = $3 AND job_id = $4 AND status = 'running'
         AND lease_owner = $5 AND lease_fence = $6 AND lease_expires_at > $1::timestamptz
       RETURNING cancellation_requested`,
      [
        input.now,
        input.leaseSeconds,
        input.workspaceId,
        input.jobId,
        input.workerId,
        input.leaseFence,
      ]
    );
    const row = result.rows[0];
    return !row
      ? "lost_lease"
      : row.cancellation_requested
        ? "cancel_requested"
        : "renewed";
  }

  private async finishDurableJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
    readonly status: "succeeded" | "failed" | "cancelled";
    readonly error?: string;
  }): Promise<boolean> {
    const result = await this.connection.query(
      `UPDATE jobs SET status = $1, revision = revision + 1,
         completed_at = $2::timestamptz, last_error = $3,
         lease_owner = NULL, lease_expires_at = NULL
       WHERE workspace_id = $4 AND job_id = $5 AND status = 'running'
         AND lease_owner = $6 AND lease_fence = $7 AND lease_expires_at > $2::timestamptz`,
      [
        input.status,
        input.now,
        input.error?.slice(0, 2_000) ?? null,
        input.workspaceId,
        input.jobId,
        input.workerId,
        input.leaseFence,
      ]
    );
    return result.rowCount === 1;
  }

  public completeDurableJob(
    input: Omit<
      Parameters<WorkspaceTransactionRepository["finishDurableJob"]>[0],
      "status" | "error"
    >
  ): Promise<boolean> {
    return this.finishDurableJob({ ...input, status: "succeeded" });
  }

  public failDurableJob(
    input: Omit<
      Parameters<WorkspaceTransactionRepository["finishDurableJob"]>[0],
      "status"
    > & { readonly error: string }
  ): Promise<boolean> {
    return this.finishDurableJob({ ...input, status: "failed" });
  }

  public cancelDurableJob(
    input: Omit<
      Parameters<WorkspaceTransactionRepository["finishDurableJob"]>[0],
      "status" | "error"
    >
  ): Promise<boolean> {
    return this.finishDurableJob({ ...input, status: "cancelled" });
  }

  public async scheduleDurableJobRetry(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
    readonly error: string;
    readonly nextAttemptAt: string;
    readonly maxAttempts: number;
  }): Promise<"retry_scheduled" | "dead_letter" | "lost_lease"> {
    const result = await this.connection.query<{
      readonly status: "retry_scheduled" | "dead_lettered";
      readonly run_id: string;
      readonly revision: string | number;
    }>(
      `UPDATE jobs
       SET status = CASE WHEN attempt_count >= $1 THEN 'dead_lettered' ELSE 'retry_scheduled' END,
           revision = revision + 1,
           available_at = CASE WHEN attempt_count >= $1 THEN available_at ELSE $2::timestamptz END,
           completed_at = CASE WHEN attempt_count >= $1 THEN $3::timestamptz ELSE NULL END,
           last_error = $4, lease_owner = NULL, lease_expires_at = NULL
       WHERE workspace_id = $5 AND job_id = $6 AND status = 'running'
         AND lease_owner = $7 AND lease_fence = $8 AND lease_expires_at > $3::timestamptz
       RETURNING status, run_id, revision`,
      [
        input.maxAttempts,
        input.nextAttemptAt,
        input.now,
        input.error.slice(0, 2_000),
        input.workspaceId,
        input.jobId,
        input.workerId,
        input.leaseFence,
      ]
    );
    const row = result.rows[0];
    if (!row) return "lost_lease";
    const eventType =
      row.status === "dead_lettered"
        ? "job.dead_lettered"
        : "job.retry_scheduled";
    const revision = Number(row.revision);
    await this.connection.query(
      `INSERT INTO workflow_events (
         workspace_id, event_id, run_id, subject_revision,
         subject_type, subject_id, subject_version, type, data, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $4, $7, $8::jsonb, $9::timestamptz)`,
      [
        input.workspaceId,
        `event-${input.jobId}-${revision}-${row.status}`,
        row.run_id,
        revision,
        persistedWebhookSubjectType(eventType),
        input.jobId,
        eventType,
        JSON.stringify({ jobId: input.jobId, status: row.status }),
        input.now,
      ]
    );
    return row.status === "dead_lettered" ? "dead_letter" : "retry_scheduled";
  }

  public async requestJobCancellation(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly now: string;
  }): Promise<"cancelled" | "cancellation_requested" | "not_cancellable"> {
    const result = await this.connection.query<{ readonly status: string }>(
      `UPDATE jobs SET
         status = CASE WHEN status IN ('queued', 'retry_scheduled') THEN 'cancelled' ELSE status END,
         revision = revision + 1, cancellation_requested = true,
         completed_at = CASE WHEN status IN ('queued', 'retry_scheduled') THEN $1::timestamptz ELSE completed_at END
       WHERE workspace_id = $2 AND job_id = $3
         AND status IN ('queued', 'retry_scheduled', 'running')
       RETURNING status`,
      [input.now, input.workspaceId, input.jobId]
    );
    const status = result.rows[0]?.status;
    return !status
      ? "not_cancellable"
      : status === "cancelled"
        ? "cancelled"
        : "cancellation_requested";
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
        [
          input.workspaceId,
          input.now,
          input.workerId,
          input.leaseSeconds,
          input.topic ?? null,
        ]
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
      [
        input.now,
        input.workspaceId,
        input.outboxId,
        input.workerId,
        input.leaseFence,
      ]
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
    const result = await this.connection.query<{
      readonly state: "pending" | "dead_letter";
    }>(
      `UPDATE workflow_outbox
       SET state = CASE WHEN attempt_count >= $1 THEN 'dead_letter' ELSE 'pending' END,
           available_at = CASE WHEN attempt_count >= $1 THEN available_at ELSE $2::timestamptz END,
           delivered_at = CASE WHEN attempt_count >= $1 THEN $3::timestamptz ELSE NULL END,
           lease_owner = NULL, lease_expires_at = NULL, last_error = $4
       WHERE workspace_id = $5 AND outbox_id = $6 AND state = 'pending'
         AND lease_owner = $7 AND lease_fence = $8 AND lease_expires_at > $3::timestamptz
       RETURNING state`,
      [
        input.maxAttempts,
        input.nextAttemptAt,
        input.now,
        input.error.slice(0, 2_000),
        input.workspaceId,
        input.outboxId,
        input.workerId,
        input.leaseFence,
      ]
    );
    if (!result.rows[0]) return "lost_lease";
    return result.rows[0].state === "dead_letter"
      ? "dead_letter"
      : "rescheduled";
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
      [
        input.workspaceId,
        input.effectId,
        input.subjectId,
        input.kind,
        input.now,
      ]
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
      [
        JSON.stringify(input.evidence),
        input.now,
        input.workspaceId,
        input.effectId,
      ]
    );
  }

  /** Records an exact provider receipt and advances only an uncertain publication. */
  public async resolvePublicationReconciliation(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly receipt: {
      readonly providerObjectId: string;
      readonly recoveryIdentity: string;
      readonly evidence: unknown;
    };
  }): Promise<void> {
    const receipt = requiredJson(
      input.receipt,
      "Publication reconciliation receipt"
    );
    const result = await this.connection.query<{
      readonly active_key: string | null;
    }>(
      `UPDATE publications
       SET status = 'published', revision = revision + 1,
           provider_receipt = $1::jsonb, updated_at = now()
       WHERE workspace_id = $2 AND publication_id = $3 AND status = 'reconciliation_required'
         AND (recovery_identity IS NULL OR recovery_identity = $4)
       RETURNING active_key`,
      [
        receipt,
        input.workspaceId,
        input.publicationId,
        input.receipt.recoveryIdentity,
      ]
    );
    if (result.rowCount !== 1)
      throw new WorkflowStateTransitionError(
        "Publication was missing or is not awaiting reconciliation."
      );
    const effect = await this.connection.query(
      `UPDATE effect_records
       SET state = 'reconciled', revision = revision + 1,
           evidence = $1::jsonb, updated_at = now()
       WHERE workspace_id = $2 AND subject_id = $3
         AND kind = 'youtube.video_upload' AND state = 'outcome_uncertain'`,
      [receipt, input.workspaceId, input.publicationId]
    );
    if (result.rows[0]?.active_key !== null && effect.rowCount !== 1)
      throw new WorkflowStateTransitionError(
        "Publication reconciliation effect was missing or in an unexpected state."
      );
  }

  /** Inconclusive evidence is append-only and never reopens provider mutation. */
  public async recordPublicationReconciliationAttempt(input: {
    readonly workspaceId: string;
    readonly attemptId: string;
    readonly publicationId: string;
    readonly reason:
      | "no_match"
      | "multiple_matches"
      | "provider_unavailable"
      | "recovery_identity_mismatch";
    readonly evidence?: unknown;
    readonly now: string;
  }): Promise<void> {
    await this.connection.query(
      `INSERT INTO publication_reconciliation_attempts (
        workspace_id, attempt_id, publication_id, reason, evidence, created_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)`,
      [
        input.workspaceId,
        input.attemptId,
        input.publicationId,
        input.reason,
        input.evidence === undefined ? null : JSON.stringify(input.evidence),
        input.now,
      ]
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
        [
          input.workerId,
          input.now,
          input.leaseSeconds,
          input.workspaceId,
          input.jobId,
        ]
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
      await client.query(POSTGRES_QUOTA_DIMENSION_MIGRATION);
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
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
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

/** Tenant-safe adapter matching the shared durable job worker repository port. */
export class PostgresDurableJobRepository {
  public constructor(private readonly repository: PostgresWorkflowRepository) {}

  public claimNextJob(input: {
    readonly workspaceId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<DurableJobLeaseRecord | null> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.claimNextJob(input)
    );
  }

  public heartbeatJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<"renewed" | "cancel_requested" | "lost_lease"> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.heartbeatDurableJob(input)
    );
  }

  public completeJob(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
  }): Promise<boolean> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.completeDurableJob(input)
    );
  }

  public failJob(
    input: Parameters<WorkspaceTransactionRepository["failDurableJob"]>[0]
  ): Promise<boolean> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.failDurableJob(input)
    );
  }

  public scheduleJobRetry(
    input: Parameters<
      WorkspaceTransactionRepository["scheduleDurableJobRetry"]
    >[0]
  ): Promise<"retry_scheduled" | "dead_letter" | "lost_lease"> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.scheduleDurableJobRetry(input)
    );
  }

  public markJobCancelled(
    input: Parameters<WorkspaceTransactionRepository["cancelDurableJob"]>[0]
  ): Promise<boolean> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.cancelDurableJob(input)
    );
  }
}

/** Transactional, tenant-bound publication intent and fenced execution store. */
export class PostgresPublicationIntentRepository {
  public constructor(private readonly repository: PostgresWorkflowRepository) {}

  public admit(
    input: AdmitPublicationIntentInput
  ): Promise<CommandAdmissionResult> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.admitPublicationIntent(input)
    );
  }

  public get(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly publicationId: string;
  }): Promise<PublicationIntentRecord | null> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) =>
        transaction.getPublicationIntent(
          input.workspaceId,
          input.projectId,
          input.publicationId
        )
    );
  }

  public beginExecution(
    input: Parameters<
      WorkspaceTransactionRepository["beginPublicationExecution"]
    >[0]
  ): Promise<boolean> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.beginPublicationExecution(input)
    );
  }

  public claimIntentLease(
    input: Parameters<
      WorkspaceTransactionRepository["claimPublicationIntentLease"]
    >[0]
  ): Promise<PublicationIntentLease | null> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.claimPublicationIntentLease(input)
    );
  }

  public markPublished(
    input: Parameters<
      WorkspaceTransactionRepository["markPublicationPublished"]
    >[0]
  ): Promise<boolean> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.markPublicationPublished(input)
    );
  }

  public markFailed(
    input: Parameters<
      WorkspaceTransactionRepository["markPublicationFailed"]
    >[0]
  ): Promise<boolean> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.markPublicationFailed(input)
    );
  }

  public markReconciliationRequired(
    input: Parameters<
      WorkspaceTransactionRepository["markPublicationReconciliationRequired"]
    >[0]
  ): Promise<boolean> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      (transaction) => transaction.markPublicationReconciliationRequired(input)
    );
  }
}

function responseFromAdmission(value: unknown): {
  readonly workflowRunId: string;
  readonly jobId: string;
  readonly revision: number;
} {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "workflowRunId") === "string" &&
    typeof Reflect.get(value, "jobId") === "string" &&
    typeof Reflect.get(value, "revision") === "number"
  ) {
    return value as {
      readonly workflowRunId: string;
      readonly jobId: string;
      readonly revision: number;
    };
  }
  throw new WorkflowStateTransitionError(
    "Stored workflow admission response is invalid."
  );
}

/** Concrete durable adapter for the application's workflow-admission port. */
export class PostgresWorkflowAdmissionPort {
  private readonly now: () => Date;
  private readonly createId: NonNullable<
    PostgresWorkflowAdmissionPortOptions["createId"]
  >;
  private readonly executionDefaults: Omit<
    WorkflowExecutionSpecification,
    "input"
  >;

  public constructor(
    private readonly options: PostgresWorkflowAdmissionPortOptions
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`);
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
  }): Promise<{
    readonly workflowRunId: string;
    readonly jobId: string;
    readonly revision: number;
  }> {
    const idempotency = input.execution.idempotency;
    if (!idempotency)
      throw new WorkflowStateTransitionError(
        "Workflow admission requires an idempotency key."
      );
    const now = this.now().toISOString();
    const workflowRunId = this.createId("workflow");
    const jobId = this.createId("job");
    const response = { workflowRunId, jobId, revision: 0 };
    const scopedInput = input.input as {
      readonly projectId?: unknown;
      readonly episodeId?: unknown;
      readonly episodeRevision?: unknown;
    };
    const binding =
      typeof scopedInput.projectId === "string" &&
      typeof scopedInput.episodeId === "string" &&
      typeof scopedInput.episodeRevision === "number"
        ? {
            projectId: scopedInput.projectId,
            episodeId: scopedInput.episodeId,
            expectedEpisodeRevision: scopedInput.episodeRevision,
          }
        : undefined;
    const result = await this.options.repository.withWorkspaceTransaction(
      input.execution.workspace.id,
      (transaction) =>
        transaction.admitWorkflow({
          run: {
            workspaceId: input.execution.workspace.id,
            runId: workflowRunId,
            status: "queued",
            execution: {
              ...this.executionDefaults,
              input: { command: input.command, input: input.input },
            },
            supersedesRunId: null,
            createdAt: now,
            activeKey: binding
              ? crypto
                  .createHash("sha256")
                  .update(
                    JSON.stringify({
                      command: input.command,
                      projectId: binding.projectId,
                      episodeId: binding.episodeId,
                      episodeRevision: binding.expectedEpisodeRevision,
                    })
                  )
                  .digest("hex")
              : null,
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
          ...(binding ? { binding } : {}),
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

  public constructor(
    private readonly options: PostgresPublicationReconciliationStoreOptions
  ) {
    this.now = options.now ?? (() => new Date());
    this.createAttemptId =
      options.createAttemptId ??
      (() => `reconciliation-${crypto.randomUUID()}`);
  }

  public async recordResolved(input: {
    readonly publicationId: string;
    readonly receipt: {
      readonly providerObjectId: string;
      readonly recoveryIdentity: string;
      readonly evidence: unknown;
    };
  }): Promise<void> {
    await this.options.repository.withWorkspaceTransaction(
      this.options.workspaceId,
      (transaction) =>
        transaction.resolvePublicationReconciliation({
          workspaceId: this.options.workspaceId,
          publicationId: input.publicationId,
          receipt: input.receipt,
        })
    );
  }

  public async recordInconclusive(input: {
    readonly publicationId: string;
    readonly reason:
      | "no_match"
      | "multiple_matches"
      | "provider_unavailable"
      | "recovery_identity_mismatch";
  }): Promise<void> {
    await this.options.repository.withWorkspaceTransaction(
      this.options.workspaceId,
      (transaction) =>
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

export function createPostgresWorkflowRepository(
  pool: PostgresPool
): PostgresWorkflowRepository {
  return new PostgresWorkflowRepository(pool);
}
