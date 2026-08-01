import { describe, expect, it, vi } from "vitest";

import {
  WorkspaceTransactionRepository,
  type PostgresQueryResult,
} from "./postgres-workflow-repository.js";
import { POSTGRES_WORKFLOW_STATE_MIGRATION } from "./relational-workflow-state.js";

const now = "2026-08-01T12:00:00.000Z";

describe("episode revision and approval challenge persistence", () => {
  it("makes episode revisions append-only and approval challenge bindings immutable", () => {
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS episode_revisions_number_unique"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "episode revisions are append-only"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "approval challenge bindings are immutable"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "approval_challenge_mutation_guard"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "approval_gate TEXT NULL"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "input_artifact_hashes JSONB NULL"
    );
  });

  it("replaces episode content with project-scoped CAS and appends its evidence", async () => {
    const query = vi.fn(
      async <T>(
        _sql: string,
        _values?: readonly unknown[]
      ): Promise<PostgresQueryResult<T>> => ({
        rows: [
          {
            workspace_id: "workspace-1",
            project_id: "project-1",
            episode_id: "episode-1",
            content: { title: "replacement" },
            revision: "3",
            created_at: "2026-07-31T12:00:00.000Z",
            updated_at: now,
            revision_id: "episode-revision-3",
            previous_revision: "2",
            evidence: { requestId: "request-1" },
          } as T,
        ],
        rowCount: 1,
      })
    );
    const repository = new WorkspaceTransactionRepository({ query });

    await expect(
      repository.replaceEpisodeContent({
        workspaceId: "workspace-1",
        projectId: "project-1",
        episodeId: "episode-1",
        expectedRevision: 2,
        revisionId: "episode-revision-3",
        content: { title: "replacement" },
        evidence: { requestId: "request-1" },
        now,
      })
    ).resolves.toEqual({
      episode: {
        workspaceId: "workspace-1",
        projectId: "project-1",
        episodeId: "episode-1",
        content: { title: "replacement" },
        revision: 3,
        createdAt: "2026-07-31T12:00:00.000Z",
        updatedAt: now,
      },
      revisionEvidence: {
        revisionId: "episode-revision-3",
        episodeRevision: 3,
        previousRevision: 2,
        evidence: { requestId: "request-1" },
      },
    });

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain(
      "workspace_id = $1 AND project_id = $2 AND episode_id = $3"
    );
    expect(sql).toContain("AND revision = $4");
    expect(sql).toContain("INSERT INTO episode_revisions");
    expect(sql).toContain("evidence, created_at");
    expect(values?.slice(0, 5)).toEqual([
      "workspace-1",
      "project-1",
      "episode-1",
      2,
      "episode-revision-3",
    ]);
  });

  it("rejects a missing or stale episode without synthesizing revision evidence", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = new WorkspaceTransactionRepository({ query });

    await expect(
      repository.replaceEpisodeContent({
        workspaceId: "workspace-1",
        projectId: "project-1",
        episodeId: "episode-1",
        expectedRevision: 9,
        revisionId: "episode-revision-10",
        content: {},
        evidence: {},
        now,
      })
    ).rejects.toThrow(/missing.*project.*stale/u);
    expect(query).toHaveBeenCalledOnce();
  });

  it("creates a challenge only from a current project run and owned artifact hash", async () => {
    const query = vi.fn(
      async <T>(
        _sql: string,
        _values?: readonly unknown[]
      ): Promise<PostgresQueryResult<T>> => ({
        rows: [
          {
            workspace_id: "workspace-1",
            project_id: "project-1",
            challenge_id: "challenge-1",
            subject_id: "run-1",
            subject_revision: "4",
            artifact_hash: "a".repeat(64),
            expires_at: "2026-08-01T12:10:00.000Z",
            consumed_at: null,
            created_at: now,
          } as T,
        ],
        rowCount: 1,
      })
    );
    const repository = new WorkspaceTransactionRepository({ query });

    await expect(
      repository.createApprovalChallenge({
        workspaceId: "workspace-1",
        projectId: "project-1",
        challengeId: "challenge-1",
        runId: "run-1",
        expectedRevision: 4,
        artifactHash: "a".repeat(64),
        expiresAt: "2026-08-01T12:10:00.000Z",
        now,
      })
    ).resolves.toMatchObject({
      challengeId: "challenge-1",
      subjectId: "run-1",
      subjectRevision: 4,
      artifactHash: "a".repeat(64),
      consumedAt: null,
    });

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("FROM workflow_run_bindings AS binding");
    expect(sql).toContain(
      "binding.workspace_id = $1 AND binding.project_id = $2"
    );
    expect(sql).toContain("binding.run_id = $4 AND run.revision = $5");
    expect(sql).toContain("FROM assets AS asset");
    expect(sql).toContain("asset.content_hash = $6");
    expect(values).toEqual([
      "workspace-1",
      "project-1",
      "challenge-1",
      "run-1",
      4,
      "a".repeat(64),
      "2026-08-01T12:10:00.000Z",
      now,
    ]);
  });

  it("rejects invalid challenge inputs and stale bindings", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = new WorkspaceTransactionRepository({ query });
    const valid = {
      workspaceId: "workspace-1",
      projectId: "project-1",
      challengeId: "challenge-1",
      runId: "run-1",
      expectedRevision: 4,
      artifactHash: "a".repeat(64),
      expiresAt: "2026-08-01T12:10:00.000Z",
      now,
    } as const;

    await expect(
      repository.createApprovalChallenge({
        ...valid,
        artifactHash: "not-a-hash",
      })
    ).rejects.toThrow(/SHA-256/u);
    await expect(
      repository.createApprovalChallenge({ ...valid, expiresAt: now })
    ).rejects.toThrow(/expiry/u);
    expect(query).not.toHaveBeenCalled();

    await expect(repository.createApprovalChallenge(valid)).rejects.toThrow(
      /missing.*stale.*project.*artifact/u
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it("persists scoped approval bindings and maps attributable event evidence", async () => {
    const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
    const query = vi.fn(async <T>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<T>> => {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO command_admissions")) {
        return { rows: [{ command_id: "command-1", response: { id: "approval-1", jobId: "job-1", revision: 0 } } as T], rowCount: 1 };
      }
      if (sql.includes("UPDATE approval_challenges")) {
        return { rows: [{ artifact_hash: "a".repeat(64) } as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const repository = new WorkspaceTransactionRepository({ query });
    await repository.recordApproval({
      workspaceId: "workspace-1",
      projectId: "project-1",
      challengeId: "challenge-1",
      subjectId: "run-1",
      expectedRevision: 4,
      decision: "approved",
      reason: "Reviewed exact package.",
      approvalId: "approval-1",
      jobId: "job-1",
      commandId: "command-1",
      outboxId: "outbox-1",
      idempotencyKey: "approval-key-1",
      requestFingerprint: "f".repeat(64),
      now,
      gate: "publish",
      locale: "it",
      variant: "full",
      inputArtifactHashes: ["b".repeat(64)],
      outputArtifactHashes: ["a".repeat(64)],
      actor: "reviewer-1",
      reviewerRole: "publisher-reviewer",
      expiresAt: "2026-08-02T12:00:00.000Z",
      supersedesApprovalId: "approval-previous",
      highRisk: true,
      requiredDistinctActors: 1,
    });
    const insert = calls.find((call) => call.sql.includes("INSERT INTO approvals"));
    expect(insert?.sql).toContain("approval_gate, scope_locale, scope_variant");
    expect(insert?.values?.slice(8)).toEqual([
      "publish", "it", "full", JSON.stringify(["b".repeat(64)]),
      JSON.stringify(["a".repeat(64)]), "reviewer-1", "publisher-reviewer",
      "2026-08-02T12:00:00.000Z", "approval-previous", true, 2,
    ]);
    const event = calls.find((call) => call.sql.includes("INSERT INTO workflow_events"));
    expect(JSON.parse(String(event?.values?.[7]))).toMatchObject({
      approvalId: "approval-1",
      gate: "publish",
      actor: "reviewer-1",
    });
  });

  it("fails closed on invalid scoped records and rechecks scoped authority at publication", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = new WorkspaceTransactionRepository({ query });
    const invalid = {
      workspaceId: "workspace-1", projectId: "project-1", challengeId: "challenge-1",
      subjectId: "run-1", expectedRevision: 4, decision: "approved" as const,
      reason: "Review.", approvalId: "approval-1", jobId: "job-1",
      commandId: "command-1", outboxId: "outbox-1", idempotencyKey: "key-1",
      requestFingerprint: "f".repeat(64), now, gate: "publish" as const,
      locale: "it" as const, variant: "full" as const,
      inputArtifactHashes: ["b".repeat(64)], outputArtifactHashes: ["a".repeat(64)],
      actor: "reviewer-1",
    };
    await expect(repository.recordApproval({ ...invalid, expiresAt: now })).rejects.toThrow(/future/u);
    await expect(repository.recordApproval({ ...invalid, gate: "wrong" as never })).rejects.toThrow();
    const legacy = {
      workspaceId: "workspace-1", projectId: "project-1", challengeId: "challenge-1",
      subjectId: "run-1", expectedRevision: 4, decision: "approved" as const,
      reason: "Review.", approvalId: "approval-legacy", jobId: "job-legacy",
      commandId: "command-legacy", outboxId: "outbox-legacy",
      idempotencyKey: "legacy-key", requestFingerprint: "e".repeat(64), now,
    };
    await expect(repository.recordApproval({ ...legacy, highRisk: true })).rejects.toThrow(/scoped approvals require/iu);
    await expect(repository.recordApproval({ ...legacy, requiredDistinctActors: 2 })).rejects.toThrow(/scoped approvals require/iu);
    expect(query).not.toHaveBeenCalled();

    await expect(repository.beginPublicationExecution({
      workspaceId: "workspace-1", publicationId: "publication-1", projectId: "project-1",
      runId: "run-1", approvalId: "approval-1", approvalRevision: 4,
      approvalPolicy: "scoped-v1",
      approvalArtifactHash: "a".repeat(64), actorPrincipalId: "publisher-1",
      actorPrincipalRevision: 1, credentialVersion: "credential-1",
      assetHash: "a".repeat(64), artifactBindings: [
        { assetId: "asset-1", role: "video", contentHash: "a".repeat(64) },
      ], channelId: "channel-1", visibility: "private", scheduledAt: null,
      playlistIds: [], recoveryIdentity: "recovery-1", workerId: "worker-1",
      intentLeaseFence: 1, channelLeaseFence: 1, now,
    })).resolves.toBe(false);
    const authoritySql = String(query.mock.calls.at(-1)?.[0]);
    expect(authoritySql).toContain("approval.approval_gate = 'publish'");
    expect(authoritySql).toContain("approval.high_risk = FALSE");
    expect(authoritySql).toContain("approval.required_distinct_actors = 1");
    expect(authoritySql).toContain("approval.scope_locale IN");
    expect(authoritySql).toContain("approval.scope_variant IN");
    expect(authoritySql).toContain("approval.expires_at > $21::timestamptz");
    expect(authoritySql).toContain("COUNT(DISTINCT peer.reviewer_actor)");
    expect(authoritySql).toContain("approval.output_artifact_hashes @> jsonb_build_array(intent.approval_artifact_hash)");
    expect(query.mock.calls.at(-1)?.[1]?.[20]).toBe(now);
  });
});
