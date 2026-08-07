import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashCanonical } from "../canonical-json.js";
import { veronicaMediaPlanSchema } from "../contracts/media-plan.v1.js";
import { buildSemanticMediaPlan } from "../planning/semantic-planner.js";
import { createVeronicaPilotFixtures, ingestSupplementalMediaAsset } from "../index.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("veronica media plan contracts", () => {
  it("serializes deterministic hashes for equivalent plans", () => {
    const fixtures = createVeronicaPilotFixtures();
    const assets = fixtures.files.map((file) => ingestSupplementalMediaAsset(file));
    const first = buildSemanticMediaPlan({
      episodeId: "episode-pilot",
      originalNarration: fixtures.narration.original,
      revisedNarration: fixtures.narration.revised,
      assets,
      targetLanguage: "it",
      sourceLanguage: "it",
    });
    const second = buildSemanticMediaPlan({
      episodeId: "episode-pilot",
      originalNarration: fixtures.narration.original,
      revisedNarration: fixtures.narration.revised,
      assets,
      targetLanguage: "it",
      sourceLanguage: "it",
    });
    expect(hashCanonical(first)).toBe(hashCanonical(second));
    expect(first.schemaVersion).toBe("veronica-media-plan.v1");
    expect(first.landscapePlacements.length).toBeGreaterThan(0);
    expect(first.portraitPlacements.length).toBe(first.landscapePlacements.length);
  });

  it("rejects render eligibility when blocking issues exist", () => {
    const fixtures = createVeronicaPilotFixtures();
    const assets = fixtures.files.map((file) => ingestSupplementalMediaAsset(file));
    const plan = buildSemanticMediaPlan({
      episodeId: "episode-pilot",
      originalNarration: fixtures.narration.original,
      assets,
      targetLanguage: "it",
      sourceLanguage: "en",
    });
    const parsed = veronicaMediaPlanSchema.safeParse({
      ...plan,
      approvalEligibility: {
        ...plan.approvalEligibility,
        renderEligible: true,
        issues: [
          {
            code: "FORCED_BLOCK",
            severity: "blocking-error",
            message: "forced",
          },
        ],
      },
    });
    expect(parsed.success).toBe(false);
  });
});
