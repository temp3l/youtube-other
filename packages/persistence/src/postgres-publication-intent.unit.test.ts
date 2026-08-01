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
  approvalRevision: 4,
  credentialVersion: "credential-v2",
  assetHash: "a".repeat(64),
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
    expect(publication?.values?.[8]).toMatch(/^[a-f0-9]{64}$/u);
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

  it("starts only with matching approval and credential bindings and a positive channel fence", async () => {
    const queries: string[] = [];
    const transaction = new WorkspaceTransactionRepository({
      query: async <T>(sql: string): Promise<PostgresQueryResult<T>> => {
        queries.push(sql);
        return { rows: [], rowCount: 1 };
      },
    });
    await expect(
      transaction.beginPublicationExecution({
        workspaceId: intent.workspaceId,
        publicationId: intent.publicationId,
        approvalRevision: intent.approvalRevision,
        credentialVersion: intent.credentialVersion,
        channelLeaseFence: 7,
        now: intent.now,
      })
    ).resolves.toBe(true);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("approval_revision = $5");
    expect(queries[0]).toContain("credential_version = $6");
    expect(queries[1]).toContain("state = 'in_flight'");
    await expect(
      transaction.beginPublicationExecution({
        workspaceId: intent.workspaceId,
        publicationId: intent.publicationId,
        approvalRevision: intent.approvalRevision,
        credentialVersion: intent.credentialVersion,
        channelLeaseFence: 0,
        now: intent.now,
      })
    ).rejects.toThrow(/positive channel lease fence/u);
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
                approval_revision: intent.approvalRevision,
                credential_version: intent.credentialVersion,
                asset_hash: intent.assetHash,
                recovery_identity: intent.recoveryIdentity,
                execution_fence: 7,
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
