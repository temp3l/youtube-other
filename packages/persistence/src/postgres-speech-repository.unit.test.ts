import { describe, expect, it, vi } from "vitest";
import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";
import {
  POSTGRES_SPEECH_MIGRATION,
  PostgresSpeechRepository,
} from "./postgres-speech-repository.js";

function fakePool(
  handler: (sql: string) => PostgresQueryResult<unknown> = () => ({ rows: [] })
) {
  const queries: string[] = [];
  const client: PostgresClient = {
    query: async <T>(sql: string) => {
      queries.push(sql);
      return handler(sql) as PostgresQueryResult<T>;
    },
    release: vi.fn(),
  };
  const pool: PostgresPool = {
    connect: async () => client,
    query: async <T>() => ({ rows: [] as T[] }),
    end: async () => undefined,
  };
  return { pool, queries, client };
}
describe("Postgres speech persistence", () => {
  it("migrates additive tenant-isolated immutable speech authority", async () => {
    const fake = fakePool();
    await new PostgresSpeechRepository(fake.pool).migrate();
    expect(fake.queries).toEqual([
      "BEGIN",
      POSTGRES_SPEECH_MIGRATION,
      "COMMIT",
    ]);
    expect(POSTGRES_SPEECH_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS speech_cache_entries"
    );
    expect(POSTGRES_SPEECH_MIGRATION).toContain(
      "PRIMARY KEY (workspace_id, cache_key)"
    );
    expect(POSTGRES_SPEECH_MIGRATION).toContain(
      "DROP CONSTRAINT IF EXISTS speech_generations_workspace_id_cache_key_key"
    );
    expect(POSTGRES_SPEECH_MIGRATION).toContain(
      "voice profile versions are immutable"
    );
    expect(POSTGRES_SPEECH_MIGRATION).toContain("FORCE ROW LEVEL SECURITY");
    expect(POSTGRES_SPEECH_MIGRATION).toContain("speech_quota_reservations");
  });
  it("uses video, genre, then system profile precedence in one active-version query", async () => {
    const fake = fakePool((sql) =>
      sql.includes("WITH selected")
        ? {
            rows: [
              {
                voice_profile_version_id: "vpv",
                profile_key: "default",
                provider: "openai",
                configuration_json: { model: "gpt" },
                source: "video",
              },
            ],
          }
        : { rows: [] }
    );
    await expect(
      new PostgresSpeechRepository(fake.pool).resolveProfile({
        workspaceId: "w",
        videoId: "v",
        genreId: "g",
        systemProfileVersionId: "system",
      })
    ).resolves.toMatchObject({ source: "video", profileVersionId: "vpv" });
    expect(fake.queries.find((sql) => sql.includes("WITH selected"))).toContain(
      "WHEN 'video' THEN 1 WHEN 'genre' THEN 2 ELSE 3"
    );
  });
  it("rejects terminal or invalid transitions before querying", () => {
    const fake = fakePool();
    expect(() =>
      new PostgresSpeechRepository(fake.pool).transitionGeneration({
        workspaceId: "w",
        generationId: "g",
        from: "succeeded",
        to: "queued",
        now: "2026-08-01T00:00:00Z",
      })
    ).toThrow("Invalid speech transition");
    expect(fake.queries).toEqual([]);
  });
  it("renews generation and cache leases with the same fencing token", async () => {
    const fake = fakePool((sql) =>
      sql.startsWith("UPDATE speech_")
        ? { rows: [], rowCount: 1 }
        : { rows: [] }
    );
    await expect(
      new PostgresSpeechRepository(fake.pool).renewGenerationLease({
        workspaceId: "w",
        generationId: "g",
        cacheKey: "cache",
        workerId: "worker",
        leaseFence: 7,
        leaseSeconds: 30,
        now: "2026-08-01T00:00:00Z",
      })
    ).resolves.toBe(true);
    expect(
      fake.queries.filter((sql) => sql.startsWith("UPDATE speech_"))
    ).toHaveLength(2);
    expect(fake.queries.join("\n")).toContain("lease_fence=$6");
  });
});
