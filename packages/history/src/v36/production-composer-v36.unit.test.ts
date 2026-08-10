import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { HistoryVisualPlanV35 } from "../history-v35-contracts.js";
import { compileHistoryRenderDerivativeV35 } from "../history-render-adapter-v35.js";
import { buildHistoryVisualPlanV35 } from "../visual-planner-v35.js";
import {
  HISTORY_PRODUCTION_PLAN_PATH_V36,
  HistoryProductionComposerErrorV36,
  composeHistoryProductionArtifactsV36,
  syncHistoryProductionArtifactsRoutedV36,
} from "./production-composer-v36.js";

const repository = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../.."
);
const blackDeath = "history-youtube-history-10-video-story-pack-04-black-death";
const dDay =
  "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion";
const nonCanary =
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";
const episodeIds = [blackDeath, dDay, nonCanary] as const;
const canaryAllowlist = `${blackDeath},${dDay}`;
const measuredAudioHash = "a".repeat(64);

async function loadPlan(episodeId: string): Promise<HistoryVisualPlanV35> {
  return JSON.parse(
    await fs.readFile(
      path.join(
        repository,
        "episodes",
        episodeId,
        "source/history-v3.5/plan.json"
      ),
      "utf8"
    )
  ) as HistoryVisualPlanV35;
}

function withMeasuredTiming(plan: HistoryVisualPlanV35): HistoryVisualPlanV35 {
  return buildHistoryVisualPlanV35({
    episodeId: plan.episodeId,
    title: plan.title,
    narration: plan.narration,
    authorityMode: plan.sourceAuthorityMode,
    trustSnapshotHash: plan.trustSnapshotHash,
    structuredClaims: {
      claims: plan.claims,
      entities: plan.entities,
      rejectedEntities: plan.rejectedEntities,
      temporalQualifiers: plan.temporalQualifiers,
      geographicQualifiers: plan.geographicQualifiers,
      quantitativeQualifiers: plan.quantitativeQualifiers,
    },
    measuredTiming: {
      source: "measured-tts",
      durationMs: 600_000,
      audioSha256: measuredAudioHash,
    },
  });
}

describe("History V3.6 production composer routing", () => {
  const measuredPlans = new Map<string, HistoryVisualPlanV35>();
  let provisionalNonCanary: HistoryVisualPlanV35;
  let temporaryRoot: string;

  beforeAll(async () => {
    const plans = await Promise.all(episodeIds.map(loadPlan));
    provisionalNonCanary = plans[2]!;
    for (const plan of plans) measuredPlans.set(plan.episodeId, withMeasuredTiming(plan));
    temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "history-v36-production-composer-")
    );
  });

  afterAll(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  it("keeps OFF on V3.5 and preserves the exact V3.5 derivative", () => {
    for (const episodeId of episodeIds) {
      const plan = measuredPlans.get(episodeId)!;
      const expected = compileHistoryRenderDerivativeV35(plan);
      const result = composeHistoryProductionArtifactsV36({
        basePlan: plan,
        activationFlagValue: "off",
        canaryEpisodesValue: canaryAllowlist,
      });
      expect(result.route).toBe("V3_5_PRODUCTION");
      if (result.route === "V3_5_PRODUCTION")
        expect(result.derivative).toEqual(expected);
      expect(plan.planHash).toBe(expected.planHash);
    }
  });

  it("preserves CANARY routing for Black Death and D-Day only", () => {
    for (const episodeId of [blackDeath, dDay] as const) {
      const result = composeHistoryProductionArtifactsV36({
        basePlan: measuredPlans.get(episodeId)!,
        activationFlagValue: "canary",
        canaryEpisodesValue: canaryAllowlist,
      });
      expect(result.route).toBe("V3_6_PRODUCTION");
      if (result.route === "V3_6_PRODUCTION") {
        expect(result.plan.timing.source).toBe("measured-tts");
        expect(result.plan.visualPlan.renderSpecs.length).toBeGreaterThan(0);
        expect(result.plan.visualPlan.safePlacementAbstentions).toHaveLength(0);
      }
    }
    expect(
      composeHistoryProductionArtifactsV36({
        basePlan: measuredPlans.get(nonCanary)!,
        activationFlagValue: "canary",
        canaryEpisodesValue: canaryAllowlist,
      }).route
    ).toBe("V3_5_PRODUCTION");
  });

  it("routes both canaries and a non-canary measured episode through GLOBAL", () => {
    for (const episodeId of episodeIds) {
      const result = composeHistoryProductionArtifactsV36({
        basePlan: measuredPlans.get(episodeId)!,
        activationFlagValue: "global",
        canaryEpisodesValue: canaryAllowlist,
      });
      expect(result.route).toBe("V3_6_PRODUCTION");
      if (result.route === "V3_6_PRODUCTION") {
        expect(result.plan.routing.mode).toBe("global");
        expect(result.plan.inputHashes.measuredAudioHash).toBe(measuredAudioHash);
        expect(result.plan.invariants).toEqual({
          semanticFallbacks: 0,
          baseVisualReplacements: 0,
          duplicatePlacements: 0,
          orphanRenderSpecs: 0,
        });
      }
    }
  });

  it("fails GLOBAL closed when measured timing is absent", () => {
    expect(() =>
      composeHistoryProductionArtifactsV36({
        basePlan: provisionalNonCanary,
        activationFlagValue: "global",
      })
    ).toThrowError(
      expect.objectContaining<Partial<HistoryProductionComposerErrorV36>>({
        code: "TIMING_MEASUREMENT_REQUIRED",
      })
    );
  });

  it("rolls GLOBAL back to OFF without consuming V3.6 manifest state", async () => {
    const plan = measuredPlans.get(nonCanary)!;
    const root = path.join(temporaryRoot, nonCanary);
    const global = await syncHistoryProductionArtifactsRoutedV36({
      root,
      plan,
      activationFlagValue: "global",
    });
    expect(global.route).toBe("V3_6_PRODUCTION");
    await expect(
      fs.access(path.join(root, HISTORY_PRODUCTION_PLAN_PATH_V36))
    ).resolves.toBeUndefined();

    const off = await syncHistoryProductionArtifactsRoutedV36({
      root,
      plan,
      activationFlagValue: "off",
    });
    expect(off.route).toBe("V3_5_PRODUCTION");
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, "manifest.json"), "utf8")
    ) as Record<string, unknown>;
    expect(manifest).not.toHaveProperty("historyProductionRouteV36");
    expect(manifest).not.toHaveProperty("historyProductionComposerV36");
    if (off.route === "V3_5_PRODUCTION")
      expect(off.derivative).toEqual(compileHistoryRenderDerivativeV35(plan));
  });
});
