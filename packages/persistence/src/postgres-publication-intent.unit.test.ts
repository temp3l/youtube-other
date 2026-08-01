import { describe, expect, it, vi } from "vitest";

import {
  PostgresPublicationIntentRepository,
  PostgresWorkflowRepository,
  WorkspaceTransactionRepository,
  type AdmitPublicationIntentInput,
  type PostgresPool,
  type PostgresQueryResult,
} from "./postgres-workflow-repository.js";
import { POSTGRES_WORKFLOW_STATE_MIGRATION } from "./relational-workflow-state.js";

const intent: AdmitPublicationIntentInput = {
  workspaceId: "workspace-1",
  publicationId: "publication-1",
  projectId: "project-1",
  runId: "run-1",
  approvalId: "approval-1",
  approvalRevision: 4,
  approvalArtifactHash: "c".repeat(64),
  actorPrincipalId: "publisher-principal-1",
  actorPrincipalRevision: 2,
  credentialVersion: "credential-v2",
  assetHash: "a".repeat(64),
  artifactBindings: [
    { assetId: "asset-video-1", role: "video", contentHash: "a".repeat(64) },
    {
      assetId: "asset-thumbnail-1",
      role: "thumbnail",
      contentHash: "d".repeat(64),
    },
  ],
  channelId: "channel-1",
  visibility: "private",
  scheduledAt: null,
  playlistIds: ["playlist-b", "playlist-a"],
  recoveryIdentity: "recovery-publication-1",
  effectId: "effect-publication-1-upload",
  eventId: "event-publication-1-recorded",
  outboxId: "outbox-publication-1-recorded",
  commandId: "command-publication-1",
  idempotencyKey: "publication-key-1",
  requestFingerprint: "b".repeat(64),
  now: "2026-08-01T12:00:00.000Z",
};

describe("PostgreSQL publication intent persistence", () => {
  it("defines immutable bindings and deterministic active/recovery uniqueness", () => {
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS publications_active_intent_unique"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS publications_recovery_identity_unique"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "publication intent bindings are immutable"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "publication execution fence is immutable after execution starts"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS publication_credential_versions"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS publication_intent_leases"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "approval decision evidence is immutable"
    );
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(
      "publication intent lease fence must advance exactly once"
    );
  });

  it("atomically records intent, prepared effect, audit event, and notification without a mutation job", async () => {
    const calls: Array<{
      readonly sql: string;
      readonly values?: readonly unknown[];
    }> = [];
    const transaction = new WorkspaceTransactionRepository({
      query: async <T>(
        sql: string,
        values?: readonly unknown[]
      ): Promise<PostgresQueryResult<T>> => {
        calls.push({ sql, values });
        if (sql.includes("INSERT INTO command_admissions"))
          return {
            rows: [
              {
                command_id: intent.commandId,
                response: {
                  publicationId: intent.publicationId,
                  revision: 0,
                  status: "pending",
                },
              } as T,
            ],
            rowCount: 1,
          };
        return { rows: [], rowCount: 1 };
      },
    });

    await expect(transaction.admitPublicationIntent(intent)).resolves.toEqual({
      kind: "admitted",
      commandId: "command-publication-1",
      response: {
        publicationId: "publication-1",
        revision: 0,
        status: "pending",
      },
    });

    expect(
      calls.some(({ sql }) => sql.includes("INSERT INTO publications"))
    ).toBe(true);
    expect(
      calls.some(
        ({ sql }) =>
          sql.includes("INSERT INTO effect_records") &&
          sql.includes("'youtube.video_upload', 'prepared'")
      )
    ).toBe(true);
    const event = calls.find(({ sql }) =>
      sql.includes("INSERT INTO workflow_events")
    );
    expect(event?.sql).toContain("'publication.started'");
    expect(event?.values).toEqual(
      expect.arrayContaining(["publication", "publication-1"])
    );
    const notification = calls.find(({ sql }) =>
      sql.includes("INSERT INTO workflow_outbox")
    );
    expect(notification?.sql).toContain("'publication.intent_recorded'");
    expect(
      calls.filter(({ sql }) => sql.includes("publication.intent_recorded"))
    ).toHaveLength(1);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO jobs"))).toBe(
      false
    );
    const publication = calls.find(({ sql }) =>
      sql.includes("INSERT INTO publications")
    );
    expect(publication?.values?.[17]).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("canonicalizes artifact and playlist permutations into one active publication key", async () => {
    const keys: unknown[] = [];
    const admit = async (candidate: AdmitPublicationIntentInput) => {
      const transaction = new WorkspaceTransactionRepository({
        query: async <T>(
          sql: string,
          values?: readonly unknown[]
        ): Promise<PostgresQueryResult<T>> => {
          if (sql.includes("INSERT INTO command_admissions"))
            return {
              rows: [
                {
                  command_id: candidate.commandId,
                  response: { publicationId: candidate.publicationId },
                } as T,
              ],
              rowCount: 1,
            };
          if (sql.includes("INSERT INTO publications")) {
            keys.push(values?.[17]);
            expect(values?.[11]).toBe(
              JSON.stringify(
                [...candidate.artifactBindings].sort((left, right) =>
                  left.role.localeCompare(right.role)
                )
              )
            );
            expect(values?.[15]).toBe(
              JSON.stringify([...candidate.playlistIds].sort())
            );
          }
          return { rows: [], rowCount: 1 };
        },
      });
      await transaction.admitPublicationIntent(candidate);
    };
    await admit(intent);
    await admit({
      ...intent,
      publicationId: "publication-2",
      commandId: "command-publication-2",
      eventId: "event-publication-2",
      effectId: "effect-publication-2",
      outboxId: "outbox-publication-2",
      idempotencyKey: "publication-key-2",
      artifactBindings: [...intent.artifactBindings].reverse(),
      playlistIds: [...intent.playlistIds].reverse(),
    });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("replays the canonical intent response without creating another effect or event", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            command_id: "command-original",
            request_fingerprint: intent.requestFingerprint,
            response: {
              publicationId: "publication-original",
              revision: 0,
              status: "pending",
            },
          },
        ],
        rowCount: 1,
      });
    const transaction = new WorkspaceTransactionRepository({ query });

    await expect(transaction.admitPublicationIntent(intent)).resolves.toEqual({
      kind: "replayed",
      commandId: "command-original",
      response: {
        publicationId: "publication-original",
        revision: 0,
        status: "pending",
      },
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("loads an intent through its workspace and project boundary", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const transaction = new WorkspaceTransactionRepository({ query });
    await expect(
      transaction.getPublicationIntent(
        "workspace-1",
        "project-1",
        "publication-1"
      )
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "workspace_id = $1 AND project_id = $2 AND publication_id = $3"
      ),
      ["workspace-1", "project-1", "publication-1"]
    );
  });

  it("rolls back the complete admission when prepared-effect persistence fails", async () => {
    const statements: string[] = [];
    const release = vi.fn();
    const pool: PostgresPool = {
      query: async <T>(): Promise<PostgresQueryResult<T>> => ({ rows: [] }),
      connect: async () => ({
        query: async <T>(sql: string): Promise<PostgresQueryResult<T>> => {
          statements.push(sql);
          if (sql.includes("INSERT INTO command_admissions"))
            return {
              rows: [
                {
                  command_id: intent.commandId,
                  response: {
                    publicationId: intent.publicationId,
                    revision: 0,
                    status: "pending",
                  },
                } as T,
              ],
              rowCount: 1,
            };
          if (sql.includes("INSERT INTO publications"))
            return { rows: [], rowCount: 1 };
          if (sql.includes("INSERT INTO effect_records"))
            throw new Error("injected effect persistence failure");
          return { rows: [], rowCount: 0 };
        },
        release,
      }),
      end: async () => undefined,
    };
    const publications = new PostgresPublicationIntentRepository(
      new PostgresWorkflowRepository(pool)
    );

    await expect(publications.admit(intent)).rejects.toThrow(
      "injected effect persistence failure"
    );
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(
      statements.some((sql) => sql.includes("INSERT INTO workflow_events"))
    ).toBe(false);
    expect(
      statements.some((sql) => sql.includes("INSERT INTO workflow_outbox"))
    ).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("locks and rechecks every current authority fact before crossing the irreversible boundary", async () => {
    const queries: string[] = [];
    const transaction = new WorkspaceTransactionRepository({
      query: async <T>(sql: string): Promise<PostgresQueryResult<T>> => {
        queries.push(sql);
        return { rows: [], rowCount: 1 };
      },
    });
    await expect(
      transaction.beginPublicationExecution({
        ...intent,
        workerId: "publisher-worker-1",
        intentLeaseFence: 3,
        channelLeaseFence: 7,
      })
    ).resolves.toBe(true);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("FOR UPDATE OF approval");
    expect(queries[0]).toContain("approval.state = 'active'");
    expect(queries[0]).toContain(
      "approval.subject_revision = intent.approval_revision"
    );
    expect(queries[0]).toContain(
      "approval.artifact_hash = intent.approval_artifact_hash"
    );
    expect(queries[0]).toContain(
      "principal.permissions ? 'publication.execute'"
    );
    expect(queries[0]).toContain("credential.state = 'active'");
    expect(queries[0]).toContain("asset.status = 'ready'");
    expect(queries[0]).toContain("locked_intent_lease");
    expect(queries[0]).toContain("locked_channel_lease");
    expect(queries[0]).toContain("intent.scheduled_at <= $21::timestamptz");
    expect(queries[1]).toContain("state = 'in_flight'");
    await expect(
      transaction.beginPublicationExecution({
        ...intent,
        workerId: "publisher-worker-1",
        intentLeaseFence: 3,
        channelLeaseFence: 0,
      })
    ).rejects.toThrow(/positive intent and channel lease fences/u);
  });

  it("claims a fenced intent lease only while the publication remains queued", async () => {
    const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
    const transaction = new WorkspaceTransactionRepository({
      query: async <T>(
        sql: string,
        values?: readonly unknown[]
      ): Promise<PostgresQueryResult<T>> => {
        queries.push({ sql, values });
        return {
          rows: [
            {
              publication_id: intent.publicationId,
              lease_owner: "publisher-worker-1",
              lease_fence: 3,
              lease_expires_at: "2026-08-01T12:01:00.000Z",
            } as T,
          ],
          rowCount: 1,
        };
      },
    });
    await expect(
      transaction.claimPublicationIntentLease({
        workspaceId: intent.workspaceId,
        publicationId: intent.publicationId,
        workerId: "publisher-worker-1",
        leaseSeconds: 60,
        now: intent.now,
      })
    ).resolves.toMatchObject({ leaseFence: 3 });
    expect(queries[0]?.sql).toContain("status = 'pending'");
    expect(queries[0]?.sql).toContain(
      "lease_fence = publication_intent_leases.lease_fence + 1"
    );
    expect(queries[0]?.sql).toContain("lease_expires_at <= $4::timestamptz");
  });

  it("supports fenced approval revocation and fails closed when revocation wins the cutoff race", async () => {
    const revocationQueries: string[] = [];
    const revocation = new WorkspaceTransactionRepository({
      query: async <T>(sql: string): Promise<PostgresQueryResult<T>> => {
        revocationQueries.push(sql);
        if (sql.includes("INSERT INTO command_admissions"))
          return {
            rows: [
              {
                command_id: "command-approval-revoked-1",
                response: {
                  id: intent.approvalId,
                  revision: 1,
                  state: "revoked",
                  revokedAt: intent.now,
                },
              } as T,
            ],
            rowCount: 1,
          };
        if (sql.startsWith("UPDATE approvals"))
          return {
            rows: [{ run_id: intent.runId, revision: 1 } as T],
            rowCount: 1,
          };
        return { rows: [], rowCount: 1 };
      },
    });
    await expect(
      revocation.revokeApproval({
        workspaceId: intent.workspaceId,
        projectId: intent.projectId,
        approvalId: intent.approvalId,
        expectedRevision: 0,
        actorPrincipalId: "reviewer-1",
        reason: "Artifact was superseded.",
        eventId: "event-approval-revoked-1",
        commandId: "command-approval-revoked-1",
        idempotencyKey: "approval-revoke-key-1",
        requestFingerprint: "e".repeat(64),
        now: intent.now,
      })
    ).resolves.toEqual({
      kind: "admitted",
      commandId: "command-approval-revoked-1",
      response: {
        id: intent.approvalId,
        revision: 1,
        state: "revoked",
        revokedAt: intent.now,
      },
    });
    expect(revocationQueries[1]).toContain("revision = $6");
    expect(revocationQueries[1]).toContain("state = 'active'");
    expect(revocationQueries[1]).toContain(
      "binding.project_id = $7 AND binding.run_id = approval.run_id"
    );
    expect(revocationQueries[1]).not.toContain("decision = 'revoked'");
    expect(revocationQueries[2]).toContain("'approval.revoked'");

    const cutoff = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      new WorkspaceTransactionRepository({
        query: cutoff,
      }).beginPublicationExecution({
        ...intent,
        workerId: "publisher-worker-1",
        intentLeaseFence: 3,
        channelLeaseFence: 7,
      })
    ).resolves.toBe(false);
    expect(cutoff).toHaveBeenCalledOnce();
    expect(cutoff.mock.calls[0]?.[0]).toContain("FOR UPDATE OF approval");
  });

  it("replays equal approval revocation keys and rejects conflicting fingerprints before CAS", async () => {
    const response = {
      id: intent.approvalId,
      revision: 1,
      state: "revoked",
      revokedAt: intent.now,
    };
    const input = {
      workspaceId: intent.workspaceId,
      projectId: intent.projectId,
      approvalId: intent.approvalId,
      expectedRevision: 0,
      actorPrincipalId: "reviewer-1",
      reason: "Artifact was superseded.",
      eventId: "event-approval-revoked-1",
      commandId: "command-retry",
      idempotencyKey: "approval-revoke-key-1",
      requestFingerprint: "e".repeat(64),
      now: intent.now,
    };
    const replayQueries: string[] = [];
    const replay = new WorkspaceTransactionRepository({
      query: async <T>(sql: string): Promise<PostgresQueryResult<T>> => {
        replayQueries.push(sql);
        if (sql.includes("INSERT INTO command_admissions"))
          return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              command_id: "command-original",
              request_fingerprint: input.requestFingerprint,
              response,
            } as T,
          ],
          rowCount: 1,
        };
      },
    });
    await expect(replay.revokeApproval(input)).resolves.toEqual({
      kind: "replayed",
      commandId: "command-original",
      response,
    });
    expect(replayQueries).toHaveLength(2);
    expect(replayQueries.some((sql) => sql.startsWith("UPDATE approvals"))).toBe(
      false
    );

    const conflict = new WorkspaceTransactionRepository({
      query: async <T>(sql: string): Promise<PostgresQueryResult<T>> =>
        sql.includes("INSERT INTO command_admissions")
          ? { rows: [], rowCount: 0 }
          : {
              rows: [
                {
                  command_id: "command-original",
                  request_fingerprint: "f".repeat(64),
                  response,
                } as T,
              ],
              rowCount: 1,
            },
    });
    await expect(conflict.revokeApproval(input)).rejects.toThrow(
      /different request/u
    );
  });

  it("does not touch the prepared effect when an authority fact is lost or a lease fence is late", async () => {
    const lost = vi.fn(async () => {
      throw new Error(
        'relation "publication_credential_versions" does not exist'
      );
    });
    await expect(
      new WorkspaceTransactionRepository({
        query: lost,
      }).beginPublicationExecution({
        ...intent,
        workerId: "publisher-worker-1",
        intentLeaseFence: 3,
        channelLeaseFence: 7,
      })
    ).rejects.toThrow(/publication_credential_versions/u);
    expect(lost).toHaveBeenCalledOnce();

    const staleFence = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      new WorkspaceTransactionRepository({
        query: staleFence,
      }).beginPublicationExecution({
        ...intent,
        workerId: "publisher-worker-1",
        intentLeaseFence: 2,
        channelLeaseFence: 6,
      })
    ).resolves.toBe(false);
    expect(staleFence).toHaveBeenCalledOnce();
  });

  it("records exact uncertain evidence and rejects a late publication fence before touching its effect", async () => {
    const uncertainQueries: Array<{
      readonly sql: string;
      readonly values?: readonly unknown[];
    }> = [];
    const uncertain = new WorkspaceTransactionRepository({
      query: async <T>(
        sql: string,
        values?: readonly unknown[]
      ): Promise<PostgresQueryResult<T>> => {
        uncertainQueries.push({ sql, values });
        if (sql.includes("UPDATE publications"))
          return {
            rows: [
              {
                workspace_id: intent.workspaceId,
                publication_id: intent.publicationId,
                project_id: intent.projectId,
                run_id: intent.runId,
                status: "reconciliation_required",
                revision: 2,
                approval_id: intent.approvalId,
                approval_revision: intent.approvalRevision,
                approval_artifact_hash: intent.approvalArtifactHash,
                actor_principal_id: intent.actorPrincipalId,
                actor_principal_revision: intent.actorPrincipalRevision,
                credential_version: intent.credentialVersion,
                asset_hash: intent.assetHash,
                artifact_bindings: intent.artifactBindings,
                channel_id: intent.channelId,
                visibility: intent.visibility,
                scheduled_at: intent.scheduledAt,
                playlist_ids: intent.playlistIds,
                recovery_identity: intent.recoveryIdentity,
                execution_fence: 7,
                intent_lease_fence: 3,
                channel_lease_fence: 7,
                provider_receipt: null,
                terminal_evidence: evidence,
                created_at: intent.now,
                updated_at: intent.now,
              } as T,
            ],
            rowCount: 1,
          };
        return { rows: [], rowCount: 1 };
      },
    });
    const evidence = { requestId: "request-1", outcome: "unknown" };
    await expect(
      uncertain.markPublicationReconciliationRequired({
        workspaceId: intent.workspaceId,
        publicationId: intent.publicationId,
        channelLeaseFence: 7,
        evidence,
        eventId: "event-reconciliation-required-1",
        outboxId: "outbox-reconciliation-required-1",
        now: intent.now,
      })
    ).resolves.toBe(true);
    expect(uncertainQueries[0]?.values).toContain(JSON.stringify(evidence));
    expect(uncertainQueries[1]?.values?.[0]).toBe("outcome_uncertain");
    expect(uncertainQueries[2]?.sql).toContain(
      "publication.reconciliation_required"
    );
    expect(uncertainQueries[3]?.sql).toContain(
      "publication.reconciliation_required"
    );
    expect(uncertainQueries[3]?.values?.[2]).toBe(
      JSON.stringify({
        id: intent.publicationId,
        projectId: intent.projectId,
        approvalRevision: intent.approvalRevision,
        credentialVersion: intent.credentialVersion,
        assetHash: intent.assetHash,
        recoveryIdentity: intent.recoveryIdentity,
        state: "reconciliation_required",
      })
    );

    const lateQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const late = new WorkspaceTransactionRepository({ query: lateQuery });
    await expect(
      late.markPublicationPublished({
        workspaceId: intent.workspaceId,
        publicationId: intent.publicationId,
        channelLeaseFence: 6,
        receipt: { providerObjectId: "video-1" },
        now: intent.now,
      })
    ).resolves.toBe(false);
    expect(lateQuery).toHaveBeenCalledOnce();
  });

  it("rejects a reconciliation receipt whose identity is not persisted", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const transaction = new WorkspaceTransactionRepository({ query });
    await expect(
      transaction.resolvePublicationReconciliation({
        workspaceId: intent.workspaceId,
        publicationId: intent.publicationId,
        receipt: {
          providerObjectId: "video-foreign",
          recoveryIdentity: "recovery-foreign",
          evidence: {},
        },
      })
    ).rejects.toThrow(/missing or is not awaiting reconciliation/u);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "recovery_identity IS NULL OR recovery_identity = $4"
      ),
      expect.arrayContaining(["recovery-foreign"])
    );
  });
});
