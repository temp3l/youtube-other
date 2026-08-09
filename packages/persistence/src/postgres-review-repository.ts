import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_REVIEW_MIGRATION = `
CREATE TABLE IF NOT EXISTS approval_challenge_metadata (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  submitted_by_principal_id TEXT NOT NULL,
  claimed_by_principal_id TEXT NULL,
  claimed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, challenge_id),
  FOREIGN KEY (workspace_id, challenge_id)
    REFERENCES approval_challenges (workspace_id, challenge_id)
);
CREATE INDEX IF NOT EXISTS approval_challenge_metadata_project_idx
  ON approval_challenge_metadata (workspace_id, project_id, challenge_id);
`;

export class ReviewPersistenceError extends Error {
  public override readonly name = "ReviewPersistenceError";
}

function row<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new ReviewPersistenceError(message);
  return value;
}

export interface ReviewChallengeRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly challenge_id: string;
  readonly subject_id: string;
  readonly subject_revision: string | number;
  readonly artifact_hash: string;
  readonly expires_at: string | Date;
  readonly consumed_at: string | Date | null;
  readonly created_at: string | Date;
  readonly episode_id: string;
  readonly submitted_by_principal_id: string | null;
  readonly claimed_by_principal_id: string | null;
}

export interface ApprovalHistoryRow {
  readonly approval_id: string;
  readonly run_id: string;
  readonly episode_id: string | null;
  readonly decision: string;
  readonly state: string;
  readonly artifact_hash: string;
  readonly subject_revision: string | number;
  readonly decision_reason: string | null;
  readonly revoked_at: string | Date | null;
  readonly created_at: string | Date;
  readonly high_risk: boolean;
  readonly approval_gate: string | null;
  readonly current_run_revision: string | number | null;
  readonly current_artifact_hash: string | null;
}

export class PostgresReviewRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(POSTGRES_REVIEW_MIGRATION);
    } finally {
      client.release();
    }
  }

  public async insertChallengeMetadata(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly challengeId: string;
    readonly submittedByPrincipalId: string;
    readonly now: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO approval_challenge_metadata (
         workspace_id, project_id, challenge_id,
         submitted_by_principal_id, created_at
       ) VALUES ($1, $2, $3, $4, $5::timestamptz)`,
      [
        input.workspaceId,
        input.projectId,
        input.challengeId,
        input.submittedByPrincipalId,
        input.now,
      ]
    );
  }

  public async listReviewQueue(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly now: string;
  }): Promise<readonly ReviewChallengeRow[]> {
    const result = await this.pool.query<ReviewChallengeRow>(
      `SELECT challenge.workspace_id, challenge.project_id, challenge.challenge_id,
              challenge.subject_id, challenge.subject_revision, challenge.artifact_hash,
              challenge.expires_at, challenge.consumed_at, challenge.created_at,
              binding.episode_id,
              metadata.submitted_by_principal_id, metadata.claimed_by_principal_id
       FROM approval_challenges AS challenge
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = challenge.workspace_id
        AND binding.project_id = challenge.project_id
        AND binding.run_id = challenge.subject_id
       LEFT JOIN approval_challenge_metadata AS metadata
         ON metadata.workspace_id = challenge.workspace_id
        AND metadata.challenge_id = challenge.challenge_id
       WHERE challenge.workspace_id = $1
         AND challenge.project_id = $2
         AND challenge.consumed_at IS NULL
         AND challenge.expires_at > $3::timestamptz
       ORDER BY challenge.created_at, challenge.challenge_id`,
      [input.workspaceId, input.projectId, input.now]
    );
    return result.rows;
  }

  public async claimChallenge(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly challengeId: string;
    readonly principalId: string;
    readonly now: string;
  }): Promise<ReviewChallengeRow | null> {
    const result = await this.pool.query<ReviewChallengeRow>(
      `UPDATE approval_challenge_metadata AS metadata
       SET claimed_by_principal_id = $4,
           claimed_at = $5::timestamptz
       FROM approval_challenges AS challenge
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = challenge.workspace_id
        AND binding.project_id = challenge.project_id
        AND binding.run_id = challenge.subject_id
       WHERE metadata.workspace_id = $1
         AND metadata.project_id = $2
         AND metadata.challenge_id = $3
         AND challenge.workspace_id = metadata.workspace_id
         AND challenge.challenge_id = metadata.challenge_id
         AND challenge.consumed_at IS NULL
         AND challenge.expires_at > $5::timestamptz
         AND (
           metadata.claimed_by_principal_id IS NULL
           OR metadata.claimed_by_principal_id = $4
         )
       RETURNING challenge.workspace_id, challenge.project_id, challenge.challenge_id,
                 challenge.subject_id, challenge.subject_revision, challenge.artifact_hash,
                 challenge.expires_at, challenge.consumed_at, challenge.created_at,
                 binding.episode_id, metadata.submitted_by_principal_id,
                 metadata.claimed_by_principal_id`,
      [
        input.workspaceId,
        input.projectId,
        input.challengeId,
        input.principalId,
        input.now,
      ]
    );
    return result.rows[0] ?? null;
  }

  public async getChallengeMetadata(input: {
    readonly workspaceId: string;
    readonly challengeId: string;
  }): Promise<{
    readonly submittedByPrincipalId: string;
    readonly claimedByPrincipalId: string | null;
  } | null> {
    const result = await this.pool.query<{
      readonly submitted_by_principal_id: string;
      readonly claimed_by_principal_id: string | null;
    }>(
      `SELECT submitted_by_principal_id, claimed_by_principal_id
       FROM approval_challenge_metadata
       WHERE workspace_id = $1 AND challenge_id = $2`,
      [input.workspaceId, input.challengeId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      submittedByPrincipalId: row.submitted_by_principal_id,
      claimedByPrincipalId: row.claimed_by_principal_id,
    };
  }

  public async listApprovalHistory(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly runId?: string;
  }): Promise<readonly ApprovalHistoryRow[]> {
    const result = await this.pool.query<ApprovalHistoryRow>(
      `SELECT approval.approval_id, approval.run_id, binding.episode_id,
              approval.decision, approval.state, approval.artifact_hash,
              approval.subject_revision, approval.decision_reason,
              approval.revoked_at, approval.created_at, approval.high_risk,
              approval.approval_gate, run.revision AS current_run_revision,
              asset.content_hash AS current_artifact_hash
       FROM approvals AS approval
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = approval.workspace_id
        AND binding.run_id = approval.run_id
       INNER JOIN workflow_runs AS run
         ON run.workspace_id = approval.workspace_id
        AND run.run_id = approval.run_id
       LEFT JOIN assets AS asset
         ON asset.workspace_id = approval.workspace_id
        AND asset.project_id = binding.project_id
        AND asset.content_hash = approval.artifact_hash
       WHERE approval.workspace_id = $1
         AND binding.project_id = $2
         AND ($3::text IS NULL OR approval.run_id = $3::text)
       ORDER BY approval.created_at, approval.approval_id`,
      [input.workspaceId, input.projectId, input.runId ?? null]
    );
    return result.rows;
  }

  public async getApprovalValidityContext(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly approvalId: string;
  }): Promise<ApprovalHistoryRow | null> {
    const result = await this.pool.query<ApprovalHistoryRow>(
      `SELECT approval.approval_id, approval.run_id, binding.episode_id,
              approval.decision, approval.state, approval.artifact_hash,
              approval.subject_revision, approval.decision_reason,
              approval.revoked_at, approval.created_at, approval.high_risk,
              approval.approval_gate,
              run.revision AS current_run_revision,
              (
                SELECT asset.content_hash
                FROM assets AS asset
                WHERE asset.workspace_id = approval.workspace_id
                  AND asset.project_id = binding.project_id
                  AND asset.content_hash = approval.artifact_hash
                LIMIT 1
              ) AS current_artifact_hash
       FROM approvals AS approval
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = approval.workspace_id
        AND binding.run_id = approval.run_id
       INNER JOIN workflow_runs AS run
         ON run.workspace_id = approval.workspace_id
        AND run.run_id = approval.run_id
       WHERE approval.workspace_id = $1
         AND binding.project_id = $2
         AND approval.approval_id = $3`,
      [input.workspaceId, input.projectId, input.approvalId]
    );
    return result.rows[0] ?? null;
  }

  public async getProjectApprovalMode(input: {
    readonly workspaceId: string;
    readonly projectId: string;
  }): Promise<"required" | "automatic"> {
    const result = await this.pool.query<{ readonly profile: unknown }>(
      `SELECT profile FROM projects
       WHERE workspace_id = $1 AND project_id = $2`,
      [input.workspaceId, input.projectId]
    );
    const profile = result.rows[0]?.profile;
    if (
      profile &&
      typeof profile === "object" &&
      "approvalMode" in profile &&
      profile.approvalMode === "automatic"
    )
      return "automatic";
    return "required";
  }

  public withTransaction<T>(
    workspaceId: string,
    handler: (client: PostgresClient) => Promise<T>
  ): Promise<T> {
    return this.pool.connect().then(async (client) => {
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1::text))",
          [workspaceId]
        );
        const result = await handler(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }
}
