import { describe, expect, it } from "vitest";

import {
  attributeMicrodramaCost,
  buildSharedVisualDedupKey,
  evaluateMicrodramaBudgetPreflight,
} from "./microdrama-budget-preflight.js";
import type {
  MicrodramaBudgetProfile,
  MicrodramaCostAttribution,
  MicrodramaPreflightWorkItem,
} from "./microdrama-budget-contracts.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";

function profile(
  scopeKind: MicrodramaBudgetProfile["scopeKind"],
  scopeId: string,
  limitMinor: number
): MicrodramaBudgetProfile {
  return {
    schemaVersion: "mediaforge.microdrama-budget.v1",
    profileId: `profile.${scopeKind}.${scopeId.replaceAll(/[^a-z0-9._-]/gu, "-").toLowerCase()}`,
    scopeKind,
    scopeId,
    limitMinor,
    enforcement: "hard",
    registeredAt: evaluatedAt,
  };
}

function workItem(
  overrides: Partial<MicrodramaPreflightWorkItem> = {}
): MicrodramaPreflightWorkItem {
  return {
    taskId: "task.tts",
    episodeId: "episode-001",
    locale: "en-US",
    provider: "elevenlabs",
    assetType: "tts",
    assetCostScope: "locale_tts",
    revisionId: "rev.episode-001.en",
    estimatedCostMinor: 120,
    ...overrides,
  };
}

describe("microdrama budget preflight", () => {
  it("fails closed when required budget profiles are absent", () => {
    const result = evaluateMicrodramaBudgetPreflight({
      correlationId: "corr.missing-budget",
      workItems: [workItem()],
      profiles: [],
      commitments: [],
      evaluatedAt,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toBe("budget_profile_missing");
    expect(result.reservations).toEqual([]);
  });

  it("fails closed when a scoped budget is exceeded", () => {
    const result = evaluateMicrodramaBudgetPreflight({
      correlationId: "corr.exceeded",
      workItems: [workItem({ estimatedCostMinor: 500 })],
      profiles: [
        profile("task", "task.tts", 1000),
        profile("provider", "elevenlabs", 1000),
        profile("episode", "episode-001", 100),
        profile("locale", "en-us", 1000),
      ],
      commitments: [],
      evaluatedAt,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toBe("budget_exceeded");
  });

  it("reserves capacity when budgets are present and within limits", () => {
    const result = evaluateMicrodramaBudgetPreflight({
      correlationId: "corr.allowed",
      workItems: [workItem()],
      profiles: [
        profile("task", "task.tts", 1000),
        profile("provider", "elevenlabs", 1000),
        profile("episode", "episode-001", 1000),
        profile("locale", "en-us", 1000),
      ],
      commitments: [],
      evaluatedAt,
    });
    expect(result.allowed).toBe(true);
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]?.state).toBe("reserved");
  });

  it("records shared visual costs once across locales while locale TTS stays separate", () => {
    const sharedVisual = workItem({
      taskId: "task.image",
      provider: "openai",
      assetType: "image",
      assetCostScope: "shared_visual",
      locale: undefined,
      revisionId: "rev.episode-001.visual",
      estimatedCostMinor: 300,
    });
    const localeTts = workItem({
      locale: "de-DE",
      revisionId: "rev.episode-001.de",
      estimatedCostMinor: 150,
    });

    const profiles = [
      profile("task", "task.image", 5000),
      profile("task", "task.tts", 5000),
      profile("provider", "openai", 5000),
      profile("provider", "elevenlabs", 5000),
      profile("episode", "episode-001", 5000),
      profile("locale", "en-us", 5000),
      profile("locale", "de-de", 5000),
    ];

    const firstPass = evaluateMicrodramaBudgetPreflight({
      correlationId: "corr.shared-once",
      workItems: [sharedVisual, localeTts, workItem({ locale: "de-DE", revisionId: "rev.episode-001.de" })],
      profiles,
      commitments: [],
      evaluatedAt,
    });
    expect(firstPass.allowed).toBe(true);
    expect(firstPass.reservations.filter((entry) => entry.taskId === "task.image")).toHaveLength(1);
    expect(firstPass.reservations.filter((entry) => entry.taskId === "task.tts")).toHaveLength(2);

    const existingAttribution: MicrodramaCostAttribution = {
      schemaVersion: "mediaforge.microdrama-budget.v1",
      attributionId: "attr.shared.1",
      episodeId: "episode-001",
      provider: "openai",
      assetType: "image",
      assetCostScope: "shared_visual",
      revisionId: "rev.episode-001.visual",
      reservationId: "reservation.shared.1",
      costMinor: 300,
      cacheStatus: "miss",
      retryCount: 0,
      correlationId: "corr.shared-once",
      requestId: "req.shared.1",
      recordedAt: evaluatedAt,
    };
    const deduped = attributeMicrodramaCost({
      attribution: {
        ...existingAttribution,
        attributionId: "attr.shared.2",
        requestId: "req.shared.2",
      },
      existingAttributions: [existingAttribution],
    });
    expect(deduped.deduplicated).toBe(true);
    expect(deduped.record).toBeNull();

    const localeRender = attributeMicrodramaCost({
      attribution: {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: "attr.render.de",
        episodeId: "episode-001",
        locale: "de-DE",
        provider: "ffmpeg",
        assetType: "render",
        assetCostScope: "locale_render",
        revisionId: "rev.episode-001.de",
        reservationId: "reservation.render.de",
        costMinor: 50,
        cacheStatus: "miss",
        retryCount: 1,
        correlationId: "corr.render.de",
        requestId: "req.render.de",
        recordedAt: evaluatedAt,
      },
      existingAttributions: [existingAttribution],
    });
    expect(localeRender.deduplicated).toBe(false);
    expect(localeRender.record?.locale).toBe("de-DE");
  });

  it("builds stable shared-visual dedup keys", () => {
    expect(
      buildSharedVisualDedupKey({
        episodeId: "episode-001",
        assetType: "image",
        revisionId: "rev.episode-001.visual",
        assetCostScope: "shared_visual",
      })
    ).toBe("episode-001:image:rev.episode-001.visual:shared_visual");
  });
});
