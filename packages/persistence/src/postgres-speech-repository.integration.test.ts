import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PostgresSpeechApplicationRepository,
  PostgresSpeechRepository,
  SpeechFencingError,
  SpeechIdempotencyConflictError,
  SpeechQuotaLimitError,
} from "./index.js";

const host = process.env.POSTGRES_INTEGRATION_HOST;
const port = Number(process.env.POSTGRES_INTEGRATION_PORT ?? "55432");
const database =
  process.env.POSTGRES_INTEGRATION_DATABASE ?? "mediaforge_task04";
const adminConnectionString = process.env.POSTGRES_INTEGRATION_ADMIN_URL;
const applicationConnectionString =
  process.env.POSTGRES_INTEGRATION_APPLICATION_URL;
const applicationRole =
  process.env.POSTGRES_INTEGRATION_APPLICATION_ROLE ?? "mediaforge_task04_app";
const describePostgres =
  host || adminConnectionString ? describe : describe.skip;
const now = "2026-08-01T12:00:00.000Z";

describePostgres("PostgreSQL provider-neutral speech authority", () => {
  const adminPool = new Pool(
    adminConnectionString
      ? { connectionString: adminConnectionString, max: 4 }
      : { host, port, database, max: 4 }
  );
  const applicationPool = new Pool(
    applicationConnectionString
      ? { connectionString: applicationConnectionString, max: 8 }
      : { host, port, database, user: applicationRole, max: 8 }
  );
  const migration = new PostgresSpeechRepository(adminPool);
  const foundation = new PostgresSpeechRepository(applicationPool);
  const repository = new PostgresSpeechApplicationRepository(applicationPool);

  beforeAll(async () => {
    await migration.migrate();
    await migration.migrate();
    if (!applicationConnectionString)
      await adminPool.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${applicationRole}') THEN CREATE ROLE ${applicationRole} LOGIN NOSUPERUSER; END IF; END $$`
      );
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${applicationRole}`);
    await adminPool.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${applicationRole}`
    );
    await adminPool.query(
      `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${applicationRole}`
    );
  });

  beforeEach(async () => {
    await adminPool.query(`TRUNCATE speech_dispatch_controls,speech_listening_test_approvals,speech_audit_records,
      speech_generation_chunk_attempts,speech_artifacts,speech_quota_reservation_scopes,speech_quota_policies,
      speech_quota_reservations,speech_usage_ledger,speech_pricing_versions,speech_generation_chunks,
      speech_generation_transitions,speech_cache_entries,speech_generations,video_speech_overrides,genre_speech_policies,
      voice_profile_versions,voice_profiles,voice_consent_records CASCADE`);
  });

  afterAll(async () => {
    await applicationPool.end();
    await adminPool.end();
  });

  const seed = async (workspaceId: string) => {
    await foundation.backfillOpenAiDefault({
      workspaceId,
      profileId: "system-openai",
      profileVersionId: "system-openai-v1",
      profileKey: "system-openai",
      configuration: {
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voice: "onyx",
        speed: 1,
        outputFormat: "wav",
      },
      now,
    });
  };
  const claim = (
    generationId: string,
    overrides: Partial<
      Parameters<PostgresSpeechApplicationRepository["claimGeneration"]>[0]
    > = {}
  ) =>
    repository.claimGeneration({
      workspaceId: "workspace-a",
      generationId,
      profileVersionId: "system-openai-v1",
      cacheKey: "cache-a",
      cacheInputVersion: "speech-cache-key-v1",
      requestFingerprint: "fingerprint-a",
      textSha256: "a".repeat(64),
      channel: "youtube",
      language: "en",
      workerId: `worker-${generationId}`,
      leaseSeconds: 30,
      forceRegeneration: false,
      now,
      ...overrides,
    });
  const succeed = async (generationId: string, suffix = generationId) => {
    await repository.completeGeneration({
      workspaceId: "workspace-a",
      generationId,
      artifacts: [
        {
          artifactId: `speech/raw/${suffix}/0.wav`,
          sha256: "b".repeat(64),
          contentType: "audio/wav",
          chunkIndex: 0,
        },
      ],
      master: {
        artifactId: `speech/master/${suffix}.flac`,
        sha256: "c".repeat(64),
        contentType: "audio/flac",
      },
      estimateCharacters: 10,
      actualCharacters: 10,
      now,
    });
    await repository.transition({
      workspaceId: "workspace-a",
      generationId,
      from: "queued",
      to: "preflight",
      now,
    });
    await repository.transition({
      workspaceId: "workspace-a",
      generationId,
      from: "preflight",
      to: "generating",
      now,
    });
    await repository.transition({
      workspaceId: "workspace-a",
      generationId,
      from: "generating",
      to: "post_processing",
      now,
    });
    await repository.transition({
      workspaceId: "workspace-a",
      generationId,
      from: "post_processing",
      to: "succeeded",
      now,
    });
  };

  it("deduplicates concurrent requests, lets waiters reuse the master, and isolates tenants", async () => {
    await seed("workspace-a");
    await seed("workspace-b");
    const claims = await Promise.all([
      claim("generation-1"),
      claim("generation-2"),
    ]);
    expect(claims.filter((value) => value.kind === "owner")).toHaveLength(1);
    expect(claims.filter((value) => value.kind === "wait")).toHaveLength(1);
    const owner = claims[0]?.kind === "owner" ? "generation-1" : "generation-2";
    const waiter = owner === "generation-1" ? "generation-2" : "generation-1";
    await succeed(owner);
    await repository.recordCacheHit({
      workspaceId: "workspace-a",
      generationId: waiter,
      sourceGenerationId: owner,
      now,
    });
    const reused = await repository.getGeneration("workspace-a", waiter);
    expect(reused).toMatchObject({
      cacheHit: true,
      masterArtifact: { artifactId: `speech/master/${owner}.flac` },
    });
    await expect(
      repository.getGeneration("workspace-b", owner)
    ).resolves.toBeNull();
  });

  it("reclaims expired owners, rejects stale fences, and keeps forced lineage from replacing cache authority", async () => {
    await seed("workspace-a");
    await claim("expired-owner", {
      leaseSeconds: 1,
      now: "2026-08-01T12:00:00.000Z",
    });
    await expect(
      claim("reclaimed-owner", { now: "2026-08-01T12:00:02.000Z" })
    ).resolves.toMatchObject({ kind: "owner" });
    await expect(succeed("expired-owner", "stale")).rejects.toBeInstanceOf(
      SpeechFencingError
    );
    await succeed("reclaimed-owner", "authority");
    await expect(
      claim("forced", {
        forceRegeneration: true,
        now: "2026-08-01T12:00:03.000Z",
        supersedesGenerationId: "reclaimed-owner",
      })
    ).resolves.toMatchObject({ kind: "owner" });
    await succeed("forced", "forced");
    await expect(
      repository.cacheStatus({
        workspaceId: "workspace-a",
        cacheKey: "cache-a",
      })
    ).resolves.toMatchObject({ authoritativeGenerationId: "reclaimed-owner" });
  });

  it("enforces idempotency conflicts and race-safe provider/genre quota reservations with reconciliation", async () => {
    await seed("workspace-a");
    await expect(
      claim("idempotent", { idempotencyKey: "key-a" })
    ).resolves.toMatchObject({ kind: "owner" });
    await expect(claim("replay", { idempotencyKey: "key-a" })).resolves.toEqual(
      { kind: "replay", generationId: "idempotent" }
    );
    await expect(
      claim("conflict", {
        idempotencyKey: "key-a",
        requestFingerprint: "different",
      })
    ).rejects.toBeInstanceOf(SpeechIdempotencyConflictError);
    await claim("quota-1", { forceRegeneration: true, cacheKey: "quota-1" });
    await claim("quota-2", { forceRegeneration: true, cacheKey: "quota-2" });
    await adminPool.query(
      `INSERT INTO speech_quota_policies (workspace_id,scope_type,scope_id,monthly_hard_limit_characters,created_at,updated_at)
      VALUES ('workspace-a','provider','openai',100,$1::timestamptz,$1::timestamptz),('workspace-a','genre','documentary',100,$1::timestamptz,$1::timestamptz)`,
      [now]
    );
    const reservations = await Promise.allSettled([
      repository.reserveQuota({
        workspaceId: "workspace-a",
        reservationId: "reservation-1",
        generationId: "quota-1",
        provider: "openai",
        genreId: "documentary",
        characters: 60,
        now,
      }),
      repository.reserveQuota({
        workspaceId: "workspace-a",
        reservationId: "reservation-2",
        generationId: "quota-2",
        provider: "openai",
        genreId: "documentary",
        characters: 60,
        now,
      }),
    ]);
    expect(
      reservations.filter((value) => value.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      reservations.filter((value) => value.status === "rejected")[0]
    ).toMatchObject({ reason: expect.any(SpeechQuotaLimitError) });
    const accepted =
      reservations[0]?.status === "fulfilled"
        ? "reservation-1"
        : "reservation-2";
    await repository.settleQuota({
      workspaceId: "workspace-a",
      reservationId: accepted,
      actualCharacters: 90,
      now,
    });
    await claim("quota-3", { forceRegeneration: true, cacheKey: "quota-3" });
    await expect(
      repository.reserveQuota({
        workspaceId: "workspace-a",
        reservationId: "reservation-3",
        generationId: "quota-3",
        provider: "openai",
        genreId: "documentary",
        characters: 11,
        now,
      })
    ).rejects.toBeInstanceOf(SpeechQuotaLimitError);
  });

  it("keeps profile versions immutable, repeats backfill, and rollback disables dispatch without deleting evidence", async () => {
    await seed("workspace-a");
    await seed("workspace-a");
    await expect(
      adminPool.query(
        `UPDATE voice_profile_versions SET configuration_json='{}'::jsonb WHERE workspace_id='workspace-a' AND voice_profile_version_id='system-openai-v1'`
      )
    ).rejects.toThrow(/immutable/u);
    await expect(
      adminPool.query(
        `DELETE FROM voice_profile_versions WHERE workspace_id='workspace-a' AND voice_profile_version_id='system-openai-v1'`
      )
    ).rejects.toThrow(/cannot be deleted/u);
    await claim("rollback-generation");
    await succeed("rollback-generation");
    await repository.auditAction({
      workspaceId: "workspace-a",
      action: "generation.replacement",
      subjectId: "rollback-generation",
      actorId: "operator",
      requestId: "request",
      now,
    });
    await repository.setDispatchEnabled({
      workspaceId: "workspace-a",
      enabled: false,
      actorId: "operator",
      requestId: "rollback",
      now,
    });
    await expect(repository.dispatchEnabled("workspace-a")).resolves.toBe(
      false
    );
    const evidence = await adminPool.query(`SELECT
      (SELECT COUNT(*) FROM speech_artifacts WHERE workspace_id='workspace-a') AS artifacts,
      (SELECT COUNT(*) FROM speech_audit_records WHERE workspace_id='workspace-a') AS audits`);
    expect(Number(evidence.rows[0]?.artifacts)).toBeGreaterThan(0);
    expect(Number(evidence.rows[0]?.audits)).toBeGreaterThanOrEqual(2);
  });
});
