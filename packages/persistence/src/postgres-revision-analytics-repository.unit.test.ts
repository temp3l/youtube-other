import { describe, expect, it, vi } from "vitest";
import { compareRevisionAnalytics } from "@mediaforge/domain";

import {
  POSTGRES_REVISION_ANALYTICS_MIGRATION,
  PostgresRevisionAnalyticsRepository,
} from "./postgres-revision-analytics-repository.js";

const observation = {
  schemaVersion: "revision-analytics-observation.v1",
  observationId: "obs-1",
  contentProfileId: "strategic-reinvention",
  episodeId: "episode-1",
  editionRevisionId: "edition-1",
  publicationId: "publication-1",
  publicationRevision: 2,
  locale: "it",
  observedAt: "2026-08-09T00:00:00.000Z",
  configurationRevision: "config-1",
  dependencyIdentity: { delivery: "a".repeat(64) },
  provenanceSha256: "b".repeat(64),
  metrics: { views: 1 },
  providerDispatchEnabled: false,
  regenerationRationale: "new-observation",
} as const;

describe("Postgres revision analytics repository", () => {
  it("defines an append-only, tenant-isolated comparison artifact store", () => {
    expect(POSTGRES_REVISION_ANALYTICS_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS revision_analytics_comparisons",
    );
    expect(POSTGRES_REVISION_ANALYTICS_MIGRATION).toContain(
      "revision_analytics_comparisons_immutable",
    );
    expect(POSTGRES_REVISION_ANALYTICS_MIGRATION).toContain(
      "FORCE ROW LEVEL SECURITY",
    );
  });

  it("appends once, replays identical concurrent admissions, and rejects key reuse", async () => {
    expect(POSTGRES_REVISION_ANALYTICS_MIGRATION).toContain(
      "revision_analytics_immutable",
    );
    expect(POSTGRES_REVISION_ANALYTICS_MIGRATION).toContain(
      "FORCE ROW LEVEL SECURITY",
    );
    let inserts = 0;
    let storedFingerprint = "";
    const storedRow = () => ({
      schema_version: observation.schemaVersion,
      observation_id: observation.observationId,
      content_profile_id: "veronicabenini",
      episode_id: observation.episodeId,
      edition_revision_id: observation.editionRevisionId,
      publication_id: observation.publicationId,
      publication_revision: observation.publicationRevision,
      locale: observation.locale,
      observed_at: observation.observedAt,
      configuration_revision: observation.configurationRevision,
      dependency_identity: observation.dependencyIdentity,
      provenance_sha256: observation.provenanceSha256,
      metrics: observation.metrics,
      provider_dispatch_enabled: false,
      regeneration_rationale: "new-observation",
      request_fingerprint: storedFingerprint,
    });
    const query = vi.fn(async (sql: string, parameters?: readonly unknown[]) => {
      if (sql.includes("INSERT INTO revision_analytics_observations")) {
        inserts += 1;
        if (inserts === 1) {
          storedFingerprint = String(parameters?.[15]);
          return { rows: [storedRow()] };
        }
        return { rows: [] };
      }
      if (sql.includes("FROM revision_analytics_observations"))
        return { rows: [storedRow()] };
      return { rows: [] };
    });
    const repository = new PostgresRevisionAnalyticsRepository({
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
    } as never);

    await expect(repository.append({
      workspaceId: "workspace-1",
      idempotencyKey: "key-1",
      observation,
    })).resolves.toMatchObject({ replayed: false });
    await expect(repository.append({
      workspaceId: "workspace-1",
      idempotencyKey: "key-1",
      observation: {
        ...observation,
        dependencyIdentity: { delivery: "a".repeat(64) },
      },
    })).resolves.toMatchObject({ replayed: true });
    await expect(repository.append({
      workspaceId: "workspace-1",
      idempotencyKey: "key-1",
      observation: { ...observation, metrics: { views: 2 } },
    })).rejects.toThrow("conflicts with another request");
    expect(query).toHaveBeenCalledWith(
      "SELECT set_config('app.workspace_id', $1, true)",
      ["workspace-1"],
    );
  });

  it("replays comparison keys and reuses the immutable comparison identity", async () => {
    const comparison = compareRevisionAnalytics({
      contentProfileId: "strategic-reinvention",
      episodeId: "episode-1",
      metric: "views",
      comparisonDimensions: ["locale", "format"],
      cohorts: [
        { observation: { ...observation, observationId: "obs-it", contentProfileId: "veronicabenini" }, format: "full" },
        { observation: { ...observation, observationId: "obs-en", contentProfileId: "veronicabenini", locale: "en", publicationId: "publication-2", editionRevisionId: "edition-2", metrics: { views: 2 } }, format: "short" },
      ],
      effectiveConfigurationHash: "c".repeat(64),
      dependencyIdentity: { analytics: "d".repeat(64) },
    }).comparison;
    let stored: { comparison: unknown; request_fingerprint: string; idempotency_key: string } | undefined;
    const query = vi.fn(async (sql: string, parameters?: readonly unknown[]) => {
      if (sql.includes("INSERT INTO revision_analytics_comparisons")) {
        const candidate = {
          comparison: JSON.parse(String(parameters?.[5])) as unknown,
          request_fingerprint: String(parameters?.[6]),
          idempotency_key: String(parameters?.[7]),
        };
        if (!stored) {
          stored = candidate;
          return { rows: [{ comparison: candidate.comparison }] };
        }
        return { rows: [] };
      }
      if (sql.includes("idempotency_key = $2"))
        return { rows: stored?.idempotency_key === parameters?.[1] ? [stored] : [] };
      if (sql.includes("comparison_id = $2")) return { rows: stored ? [stored] : [] };
      return { rows: [] };
    });
    const repository = new PostgresRevisionAnalyticsRepository({
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
    } as never);

    await expect(repository.appendComparison({ workspaceId: "workspace-1", idempotencyKey: "key-1", comparison }))
      .resolves.toMatchObject({ replayed: false, reused: false });
    await expect(repository.appendComparison({ workspaceId: "workspace-1", idempotencyKey: "key-1", comparison }))
      .resolves.toMatchObject({ replayed: true, reused: true });
    await expect(repository.appendComparison({ workspaceId: "workspace-1", idempotencyKey: "key-2", comparison }))
      .resolves.toMatchObject({ replayed: false, reused: true });
    await expect(repository.appendComparison({
      workspaceId: "workspace-1",
      idempotencyKey: "key-1",
      comparison: { ...comparison, comparisonId: "analytics-comparison-fedcba9876543210", fingerprint: "e".repeat(64) },
    })).rejects.toThrow("idempotency key conflicts");
  });
});
