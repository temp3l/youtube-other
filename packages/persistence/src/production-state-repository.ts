import crypto from "node:crypto";

import {
  artifactComparisonMetadataSchema,
  productionUnitAddressKey,
  productionUnitSnapshotSchema,
  type ArtifactComparisonMetadata,
  type ProductionUnitSnapshot,
  type EpisodeProductionState,
  episodeProductionStateSchema,
  type ProductionRevision,
  productionRevisionSchema,
  PRODUCTION_STATE_SCHEMA_VERSION,
  projectEpisodeProductionState,
  type ResolvedConfigFingerprint,
  resolvedConfigFingerprintSchema,
} from "@mediaforge/domain";

import { WorkflowStateTransitionError } from "./relational-workflow-state.js";
import type { Queryable } from "./postgres-workflow-repository.js";

export interface ProductionRevisionRecord extends ProductionRevision {
  readonly workspaceId: string;
}

export interface EpisodeProductionStateRecord {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly projectionRevision: number;
  readonly state: EpisodeProductionState;
  readonly updatedAt: string;
}

export interface ProductionUnitSnapshotRecord {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly snapshotId: string;
  readonly workerId: string;
  readonly snapshot: ProductionUnitSnapshot;
  readonly createdAt: string;
}

export interface CreateProductionRevisionInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly productionRevisionId: string;
  readonly episodeRevision: number;
  readonly episodeRevisionId?: string;
  readonly resolvedConfigFingerprint: string;
  readonly locale: ProductionRevision["locale"];
  readonly variant: ProductionRevision["variant"];
  readonly workflowRunId?: string;
  readonly supersedesProductionRevisionId?: string;
  readonly createdAt: string;
}

export interface ReplaceEpisodeProductionStateInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly expectedProjectionRevision?: number;
  readonly state: EpisodeProductionState;
  readonly updatedAt: string;
}

function parseRevision(row: {
  readonly specification: unknown;
  readonly workspace_id: string;
}): ProductionRevisionRecord {
  const revision = productionRevisionSchema.parse(row.specification);
  return { ...revision, workspaceId: row.workspace_id };
}

export async function insertProductionRevision(
  connection: Queryable,
  input: CreateProductionRevisionInput
): Promise<ProductionRevisionRecord> {
  if (
    !Number.isSafeInteger(input.episodeRevision) ||
    input.episodeRevision < 0
  ) {
    throw new WorkflowStateTransitionError(
      "Episode revision must be a non-negative integer."
    );
  }
  const fingerprint = resolvedConfigFingerprintSchema.parse(
    input.resolvedConfigFingerprint
  );
  const specification = productionRevisionSchema.parse({
    schemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
    id: input.productionRevisionId,
    projectId: input.projectId,
    episodeId: input.episodeId,
    episodeRevision: input.episodeRevision,
    episodeRevisionId: input.episodeRevisionId,
    resolvedConfigFingerprint: fingerprint,
    locale: input.locale,
    variant: input.variant,
    workflowRunId: input.workflowRunId,
    supersedesProductionRevisionId: input.supersedesProductionRevisionId,
    createdAt: input.createdAt,
  });
  try {
    await connection.query(
      `INSERT INTO production_revisions (
         workspace_id, project_id, episode_id, production_revision_id,
         episode_revision, episode_revision_id, resolved_config_fingerprint,
         locale, variant, workflow_run_id, supersedes_production_revision_id,
         specification, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::timestamptz)`,
      [
        input.workspaceId,
        input.projectId,
        input.episodeId,
        input.productionRevisionId,
        input.episodeRevision,
        input.episodeRevisionId ?? null,
        fingerprint,
        input.locale,
        input.variant,
        input.workflowRunId ?? null,
        input.supersedesProductionRevisionId ?? null,
        JSON.stringify(specification),
        input.createdAt,
      ]
    );
    return { ...specification, workspaceId: input.workspaceId };
  } catch (error) {
    if (
      error instanceof Error &&
      /production revisions are append-only/u.test(error.message)
    ) {
      throw error;
    }
    if (
      error instanceof Error &&
      /duplicate key/u.test(error.message)
    ) {
      throw new WorkflowStateTransitionError(
        "Production revision already exists in this workspace."
      );
    }
    throw error;
  }
}

export async function getAuthoritativeProductionRevision(
  connection: Queryable,
  input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }
): Promise<ProductionRevisionRecord | null> {
  const result = await connection.query<{
    readonly specification: unknown;
    readonly workspace_id: string;
  }>(
    `SELECT workspace_id, specification
     FROM production_revisions
     WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3
     ORDER BY episode_revision DESC, created_at DESC, production_revision_id DESC
     LIMIT 1`,
    [input.workspaceId, input.projectId, input.episodeId]
  );
  const row = result.rows[0];
  return row ? parseRevision(row) : null;
}

export async function replaceEpisodeProductionState(
  connection: Queryable,
  input: ReplaceEpisodeProductionStateInput
): Promise<EpisodeProductionStateRecord> {
  const state = episodeProductionStateSchema.parse(input.state);
  if (
    state.projectId !== input.projectId ||
    state.episodeId !== input.episodeId
  ) {
    throw new WorkflowStateTransitionError(
      "Episode production state project/episode identity mismatch."
    );
  }
  const expectedRevision = input.expectedProjectionRevision;
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
  ) {
    throw new WorkflowStateTransitionError(
      "Projection revision must be a non-negative integer."
    );
  }
  const result = await connection.query<{
    readonly projection_revision: string | number;
    readonly updated_at: Date | string;
  }>(
  expectedRevision === undefined
    ? `INSERT INTO episode_production_state (
         workspace_id, project_id, episode_id, projection_revision,
         current_production_revision_id, projection, projection_input_fingerprint,
         updated_at
       ) VALUES ($1, $2, $3, 0, $4, $5::jsonb, $6, $7::timestamptz)
       ON CONFLICT (workspace_id, project_id, episode_id) DO UPDATE SET
         projection_revision = episode_production_state.projection_revision + 1,
         current_production_revision_id = EXCLUDED.current_production_revision_id,
         projection = EXCLUDED.projection,
         projection_input_fingerprint = EXCLUDED.projection_input_fingerprint,
         updated_at = EXCLUDED.updated_at
       RETURNING projection_revision, updated_at`
    : `UPDATE episode_production_state SET
         projection_revision = projection_revision + 1,
         current_production_revision_id = $4,
         projection = $5::jsonb,
         projection_input_fingerprint = $6,
         updated_at = $7::timestamptz
       WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3
         AND projection_revision = $8
       RETURNING projection_revision, updated_at`,
    expectedRevision === undefined
      ? [
          input.workspaceId,
          input.projectId,
          input.episodeId,
          state.currentProductionRevision.id,
          JSON.stringify(state),
          state.projectionInputFingerprint,
          input.updatedAt,
        ]
      : [
          input.workspaceId,
          input.projectId,
          input.episodeId,
          state.currentProductionRevision.id,
          JSON.stringify(state),
          state.projectionInputFingerprint,
          input.updatedAt,
          expectedRevision,
        ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new WorkflowStateTransitionError(
      "Episode production state projection revision is stale."
    );
  }
  return {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    episodeId: input.episodeId,
    projectionRevision: Number(row.projection_revision),
    state,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function getEpisodeProductionStateRecord(
  connection: Queryable,
  input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }
): Promise<EpisodeProductionStateRecord | null> {
  const result = await connection.query<{
    readonly projection_revision: string | number;
    readonly projection: unknown;
    readonly updated_at: Date | string;
  }>(
    `SELECT projection_revision, projection, updated_at
     FROM episode_production_state
     WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3`,
    [input.workspaceId, input.projectId, input.episodeId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const state = episodeProductionStateSchema.parse(row.projection);
  return {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    episodeId: input.episodeId,
    projectionRevision: Number(row.projection_revision),
    state,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapProductionUnitSnapshot(row: {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly episode_id: string;
  readonly snapshot_id: string;
  readonly worker_id: string;
  readonly snapshot: unknown;
  readonly created_at: Date | string;
}): ProductionUnitSnapshotRecord {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    episodeId: row.episode_id,
    snapshotId: row.snapshot_id,
    workerId: row.worker_id,
    snapshot: productionUnitSnapshotSchema.parse(row.snapshot),
    createdAt: asIso(row.created_at),
  };
}

/** Append-only worker write. API request handlers have no route to this store. */
export async function appendProductionUnitSnapshots(
  connection: Queryable,
  input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly workerId: string;
    readonly snapshots: readonly {
      readonly snapshotId: string;
      readonly snapshot: ProductionUnitSnapshot;
      readonly createdAt: string;
    }[];
  }
): Promise<readonly ProductionUnitSnapshotRecord[]> {
  if (input.workerId.trim().length === 0) {
    throw new WorkflowStateTransitionError("Production-unit snapshots require a worker identity.");
  }
  const records: ProductionUnitSnapshotRecord[] = [];
  for (const entry of input.snapshots) {
    const snapshot = productionUnitSnapshotSchema.parse(entry.snapshot);
    const result = await connection.query<{
      readonly workspace_id: string;
      readonly project_id: string;
      readonly episode_id: string;
      readonly snapshot_id: string;
      readonly worker_id: string;
      readonly snapshot: unknown;
      readonly created_at: Date | string;
    }>(
      `INSERT INTO episode_production_unit_snapshots (
         workspace_id, project_id, episode_id, snapshot_id, unit_kind, unit_key,
         input_fingerprint, content_hash, status, artifact_record_id, worker_id,
         snapshot, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::timestamptz)
       RETURNING workspace_id, project_id, episode_id, snapshot_id, worker_id, snapshot, created_at`,
      [
        input.workspaceId, input.projectId, input.episodeId, entry.snapshotId,
        snapshot.address.kind, snapshot.address.unitKey ?? null,
        snapshot.inputFingerprint, snapshot.contentHash ?? null, snapshot.status,
        snapshot.artifactRecordId ?? null, input.workerId, JSON.stringify(snapshot), entry.createdAt,
      ]
    );
    const row = result.rows[0];
    if (!row) throw new WorkflowStateTransitionError("Production-unit snapshot was not persisted.");
    records.push(mapProductionUnitSnapshot(row));
  }
  return records;
}

export async function listCurrentProductionUnitSnapshots(
  connection: Queryable,
  input: { readonly workspaceId: string; readonly projectId: string; readonly episodeId: string }
): Promise<readonly ProductionUnitSnapshotRecord[]> {
  const result = await connection.query<{
    readonly workspace_id: string;
    readonly project_id: string;
    readonly episode_id: string;
    readonly snapshot_id: string;
    readonly worker_id: string;
    readonly snapshot: unknown;
    readonly created_at: Date | string;
  }>(
    `SELECT DISTINCT ON (unit_kind, COALESCE(unit_key, ''))
       workspace_id, project_id, episode_id, snapshot_id, worker_id, snapshot, created_at
     FROM episode_production_unit_snapshots
     WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3
     ORDER BY unit_kind, COALESCE(unit_key, ''), created_at DESC, snapshot_id DESC`,
    [input.workspaceId, input.projectId, input.episodeId]
  );
  return result.rows.map(mapProductionUnitSnapshot);
}

export async function compareCurrentProductionUnitSnapshots(
  connection: Queryable,
  input: { readonly workspaceId: string; readonly projectId: string; readonly episodeId: string }
): Promise<readonly {
  readonly current: ProductionUnitSnapshotRecord;
  readonly previous?: ProductionUnitSnapshotRecord;
  readonly comparison?: ArtifactComparisonMetadata;
}[]> {
  const result = await connection.query<{
    readonly workspace_id: string;
    readonly project_id: string;
    readonly episode_id: string;
    readonly snapshot_id: string;
    readonly worker_id: string;
    readonly snapshot: unknown;
    readonly created_at: Date | string;
    readonly snapshot_rank: string | number;
  }>(
    `SELECT workspace_id, project_id, episode_id, snapshot_id, worker_id, snapshot, created_at,
       row_number() OVER (
         PARTITION BY unit_kind, COALESCE(unit_key, '')
         ORDER BY created_at DESC, snapshot_id DESC
       ) AS snapshot_rank
     FROM episode_production_unit_snapshots
     WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3`,
    [input.workspaceId, input.projectId, input.episodeId]
  );
  const grouped = new Map<string, ProductionUnitSnapshotRecord[]>();
  for (const row of result.rows) {
    if (Number(row.snapshot_rank) > 2) continue;
    const record = mapProductionUnitSnapshot(row);
    const key = productionUnitAddressKey(record.snapshot.address);
    const group = grouped.get(key) ?? [];
    group.push(record);
    grouped.set(key, group);
  }
  return [...grouped.values()].map(([current, previous]) => ({
    current: current!,
    ...(previous ? { previous } : {}),
    ...(previous?.snapshot.contentHash
      ? {
          comparison: artifactComparisonMetadataSchema.parse({
            baselineKind: "previous",
            baselineContentHash: previous.snapshot.contentHash,
            currentContentHash: current!.snapshot.contentHash,
            textDiffAvailable: false,
            visualDiffAvailable: false,
            timestampAwareMediaDiffAvailable: false,
          }),
        }
      : {}),
  }));
}

export interface FragmentedProductionSources {
  readonly productionRevision: ProductionRevisionRecord;
  readonly projectedAt: string;
  readonly workflow: {
    readonly activeRunId?: string;
    readonly runStatus?:
      | "queued"
      | "running"
      | "awaiting_approval"
      | "succeeded"
      | "failed"
      | "cancelled"
      | "none";
    readonly runRevision?: number;
    readonly jobId?: string;
    readonly jobStatus?: string;
    readonly jobRevision?: number;
    readonly sanitizedFailureCode?: string;
  };
  readonly validations: ReadonlyArray<{
    readonly validationId: string;
    readonly status: "passed" | "failed" | "pending" | "unknown";
    readonly resultFingerprint?: string;
  }>;
  readonly approvals: ReadonlyArray<{
    readonly approvalId: string;
    readonly gate?: ProductionRevision extends never ? never : string;
    readonly decision: "approved" | "rejected" | "revoked";
    readonly state: "active" | "rejected" | "revoked";
    readonly boundFingerprint?: string;
    readonly stale?: boolean;
  }>;
  readonly requiredReviewGates: readonly string[];
  readonly render: {
    readonly status: "none" | "pending" | "succeeded" | "failed";
    readonly renderArtifactHashes: readonly string[];
  };
  readonly localizationVariants: ReadonlyArray<{
    readonly locale: ProductionRevision["locale"];
    readonly variant: ProductionRevision["variant"];
    readonly productionRevisionId?: string;
    readonly status: "none" | "in_progress" | "ready" | "blocked";
  }>;
  readonly publication: {
    readonly readiness: "not_ready" | "ready" | "disabled";
    readonly activePublicationId?: string;
    readonly publicationStatus?:
      | "none"
      | "pending"
      | "executing"
      | "published"
      | "failed"
      | "cancelled"
      | "reconciliation_required";
    readonly publishReady: boolean;
  };
}

export function buildEpisodeProductionStateFromSources(
  sources: FragmentedProductionSources
): EpisodeProductionState {
  const { workspaceId: _workspaceId, ...revision } = sources.productionRevision;
  const productionRevision = productionRevisionSchema.parse(revision);
  return projectEpisodeProductionState({
    productionRevision,
    projectedAt: sources.projectedAt,
    workflow: sources.workflow,
    validations: sources.validations,
    approvals: sources.approvals as Parameters<
      typeof projectEpisodeProductionState
    >[0]["approvals"],
    requiredReviewGates: sources.requiredReviewGates as Parameters<
      typeof projectEpisodeProductionState
    >[0]["requiredReviewGates"],
    render: sources.render,
    localizationVariants: sources.localizationVariants,
    publication: sources.publication,
  });
}

export function computeResolvedConfigFingerprint(input: {
  readonly episodeRevision: number;
  readonly locale: string;
  readonly variant: string;
  readonly configurationVersion: string;
}): ResolvedConfigFingerprint {
  return resolvedConfigFingerprintSchema.parse(
    crypto
      .createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex")
  );
}

/** Deterministic in-memory conformance store for production revision identity. */
export class InMemoryProductionStateRepository {
  private readonly revisions = new Map<string, ProductionRevisionRecord>();
  private readonly projections = new Map<string, EpisodeProductionStateRecord>();

  private revisionKey(workspaceId: string, revisionId: string): string {
    return `${workspaceId}:${revisionId}`;
  }

  private projectionKey(
    workspaceId: string,
    projectId: string,
    episodeId: string
  ): string {
    return `${workspaceId}:${projectId}:${episodeId}`;
  }

  public createRevision(input: CreateProductionRevisionInput): ProductionRevisionRecord {
    const key = this.revisionKey(
      input.workspaceId,
      input.productionRevisionId
    );
    if (this.revisions.has(key)) {
      throw new WorkflowStateTransitionError(
        "Production revision already exists in this workspace."
      );
    }
    const fingerprint = resolvedConfigFingerprintSchema.parse(
      input.resolvedConfigFingerprint
    );
    const record = productionRevisionSchema.parse({
      schemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
      id: input.productionRevisionId,
      projectId: input.projectId,
      episodeId: input.episodeId,
      episodeRevision: input.episodeRevision,
      episodeRevisionId: input.episodeRevisionId,
      resolvedConfigFingerprint: fingerprint,
      locale: input.locale,
      variant: input.variant,
      workflowRunId: input.workflowRunId,
      supersedesProductionRevisionId: input.supersedesProductionRevisionId,
      createdAt: input.createdAt,
    });
    const stored: ProductionRevisionRecord = {
      ...record,
      workspaceId: input.workspaceId,
    };
    this.revisions.set(key, structuredClone(stored));
    return structuredClone(stored);
  }

  public getAuthoritativeRevision(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }): ProductionRevisionRecord | null {
    const matches = [...this.revisions.values()].filter(
      (revision) =>
        revision.workspaceId === input.workspaceId &&
        revision.projectId === input.projectId &&
        revision.episodeId === input.episodeId
    );
    if (matches.length === 0) return null;
    matches.sort((left, right) => {
      if (left.episodeRevision !== right.episodeRevision) {
        return right.episodeRevision - left.episodeRevision;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
    return structuredClone(matches[0]!);
  }

  public replaceProjection(
    input: ReplaceEpisodeProductionStateInput
  ): EpisodeProductionStateRecord {
    const key = this.projectionKey(
      input.workspaceId,
      input.projectId,
      input.episodeId
    );
    const current = this.projections.get(key);
    if (
      input.expectedProjectionRevision !== undefined &&
      (current === undefined ||
        current.projectionRevision !== input.expectedProjectionRevision)
    ) {
      throw new WorkflowStateTransitionError(
        "Episode production state projection revision is stale."
      );
    }
    const state = episodeProductionStateSchema.parse(input.state);
    const record: EpisodeProductionStateRecord = {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      episodeId: input.episodeId,
      projectionRevision: current ? current.projectionRevision + 1 : 0,
      state,
      updatedAt: input.updatedAt,
    };
    this.projections.set(key, structuredClone(record));
    return structuredClone(record);
  }

  public getProjection(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }): EpisodeProductionStateRecord | null {
    const record = this.projections.get(
      this.projectionKey(input.workspaceId, input.projectId, input.episodeId)
    );
    return record ? structuredClone(record) : null;
  }
}
