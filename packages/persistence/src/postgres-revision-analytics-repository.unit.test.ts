import { describe, expect, it, vi } from "vitest";

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
});
