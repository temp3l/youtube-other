import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MicrodramaBudgetRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "./index.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";

function profile(
  scopeKind: "task" | "provider" | "episode" | "locale",
  scopeId: string,
  limitMinor: number
) {
  const normalizedScopeId = scopeId.replaceAll(/[^a-z0-9._-]/gu, "-").toLowerCase();
  return {
    schemaVersion: "mediaforge.microdrama-budget.v1" as const,
    profileId: `profile.${scopeKind}.${normalizedScopeId}`,
    scopeKind,
    scopeId: normalizedScopeId,
    limitMinor,
    enforcement: "hard" as const,
    registeredAt: evaluatedAt,
  };
}

function createBudgetRepository(): MicrodramaBudgetRepository {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-microdrama-budget-"));
  const dbPath = path.join(dir, "microdrama.sqlite");
  const sqlite = createPersistence(dbPath);
  sqlite.migrate();
  const narrative = new MicrodramaSQLiteRepository(sqlite);
  narrative.migrate();
  const budgets = new MicrodramaBudgetRepository(sqlite);
  budgets.migrateBudgets();
  return budgets;
}

describe("microdrama budget repository", () => {
  it("migrates budget, reservation and attribution tables", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-microdrama-budget-"));
    const dbPath = path.join(dir, "microdrama.sqlite");
    const sqlite = createPersistence(dbPath);
    sqlite.migrate();
    new MicrodramaSQLiteRepository(sqlite).migrate();
    const budgets = new MicrodramaBudgetRepository(sqlite);
    budgets.migrateBudgets();

    const tables = sqlite.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    expect(names).toContain("microdrama_budget_profiles");
    expect(names).toContain("microdrama_budget_reservations");
    expect(names).toContain("microdrama_cost_attributions");
  });

  it("persists reservations from an allowed preflight", () => {
    const repository = createBudgetRepository();
    repository.upsertBudgetProfile({
      profile: profile("task", "task.tts", 1000),
    });
    repository.upsertBudgetProfile({
      profile: profile("provider", "elevenlabs", 1000),
    });
    repository.upsertBudgetProfile({
      profile: profile("episode", "episode-001", 1000),
    });
    repository.upsertBudgetProfile({
      profile: profile("locale", "en-us", 1000),
    });

    const preflight = repository.runBudgetPreflight({
      correlationId: "corr.repo.allowed",
      workItems: [
        {
          taskId: "task.tts",
          episodeId: "episode-001",
          locale: "en-US",
          provider: "elevenlabs",
          assetType: "tts",
          assetCostScope: "locale_tts",
          revisionId: "rev.episode-001.en",
          estimatedCostMinor: 120,
        },
      ],
      evaluatedAt,
    });
    expect(preflight.allowed).toBe(true);
    const stored = repository.recordPreflightReservations(preflight);
    expect(stored).toHaveLength(1);
    expect(repository.listBudgetCommitments()[0]?.reservedMinor).toBe(120);
  });

  it("records shared visual attribution once and keeps locale render separate", () => {
    const repository = createBudgetRepository();
    const reservation = {
      schemaVersion: "mediaforge.microdrama-budget.v1" as const,
      reservationId: "reservation.shared.1",
      profileId: "profile.episode.episode-001",
      revisionId: "rev.episode-001.visual",
      episodeId: "episode-001",
      provider: "openai",
      taskId: "task.image",
      reservedMinor: 300,
      state: "reserved" as const,
      correlationId: "corr.shared.repo",
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
    };
    repository.upsertBudgetProfile({
      profile: profile("episode", "episode-001", 5000),
    });
    repository.recordPreflightReservations({
      schemaVersion: "mediaforge.microdrama-budget.v1",
      correlationId: "corr.shared.repo",
      allowed: true,
      reservations: [reservation],
      evaluatedAt,
    });

    const shared = {
      schemaVersion: "mediaforge.microdrama-budget.v1" as const,
      attributionId: "attr.shared.1",
      episodeId: "episode-001",
      provider: "openai",
      assetType: "image" as const,
      assetCostScope: "shared_visual" as const,
      revisionId: "rev.episode-001.visual",
      reservationId: reservation.reservationId,
      costMinor: 300,
      cacheStatus: "miss" as const,
      retryCount: 0,
      correlationId: "corr.shared.repo",
      requestId: "req.shared.1",
      recordedAt: evaluatedAt,
    };
    expect(
      repository.recordCostAttribution({
        attribution: shared,
        evidence: { cacheKey: "visual:episode-001", retryCount: 0 },
      })
    ).not.toBeNull();
    expect(
      repository.recordCostAttribution({
        attribution: { ...shared, attributionId: "attr.shared.2", requestId: "req.shared.2" },
        evidence: { cacheKey: "visual:episode-001", retryCount: 0 },
      })
    ).toBeNull();

    repository.recordPreflightReservations({
      schemaVersion: "mediaforge.microdrama-budget.v1",
      correlationId: "corr.render.de",
      allowed: true,
      reservations: [
        {
          schemaVersion: "mediaforge.microdrama-budget.v1",
          reservationId: "reservation.render.de",
          profileId: "profile.episode.episode-001",
          revisionId: "rev.episode-001.de",
          episodeId: "episode-001",
          locale: "de-DE",
          provider: "ffmpeg",
          taskId: "task.render",
          reservedMinor: 50,
          state: "reserved",
          correlationId: "corr.render.de",
          createdAt: evaluatedAt,
          updatedAt: evaluatedAt,
        },
      ],
      evaluatedAt,
    });

    const localeRender = {
      schemaVersion: "mediaforge.microdrama-budget.v1" as const,
      attributionId: "attr.render.de",
      episodeId: "episode-001",
      locale: "de-DE",
      provider: "ffmpeg",
      assetType: "render" as const,
      assetCostScope: "locale_render" as const,
      revisionId: "rev.episode-001.de",
      reservationId: "reservation.render.de",
      costMinor: 50,
      cacheStatus: "hit" as const,
      retryCount: 1,
      correlationId: "corr.render.de",
      requestId: "req.render.de",
      recordedAt: evaluatedAt,
    };
    expect(
      repository.recordCostAttribution({
        attribution: localeRender,
        evidence: { cacheKey: "render:de-DE", retryCount: 1 },
      })?.locale
    ).toBe("de-DE");
  });
});
