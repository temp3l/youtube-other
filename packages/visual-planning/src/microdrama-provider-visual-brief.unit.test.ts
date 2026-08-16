import { describe, expect, it } from "vitest";

import {
  MICRODRAMA_PROVIDER_VISUAL_BRIEF_VERSION,
  REVIEW_EDITORIAL_CUT_TARGET,
  REVIEW_FRONT_LOAD_UNTIL_RATIO,
  REVIEW_SOURCE_PLATE_TARGET,
  UNIQUE_IMAGE_CADENCE_SECONDS,
  buildMicrodramaProviderVisualBrief,
  deriveCharacterVisualNotes,
  distributeEditorialCutsAcrossScenes,
  resolveFrontLoadUniqueCutsForDuration,
  resolveMicrodramaAssetDensityPolicy,
  resolveUniqueImageCountForDuration,
  rewriteProviderBriefForViolenceRetry,
} from "./index.js";

describe("microdrama provider visual brief", () => {
  it("builds a cinematic provider brief with cast location and no-text policy", () => {
    const brief = buildMicrodramaProviderVisualBrief({
      seriesTitle: "7 Minutes Ahead",
      genres: ["mystery", "thriller"],
      episodeId: "E001",
      episodeTitle: "Seven Minutes",
      locationLabel: "apartment/street",
      cast: [
        {
          name: "Maya Vale",
          visualNotes: deriveCharacterVisualNotes(
            "28, systems analyst; observant, stubborn, protective"
          ),
        },
        {
          name: "Ethan Cole",
          visualNotes: deriveCharacterVisualNotes(
            "30, investigative audio producer; Maya’s partner"
          ),
        },
      ],
      blockingKind: "establishing",
      plateSemanticId: "plate.sem.e001.001",
      sceneSemanticId: "scene.sem.e001.001",
      visualMoment:
        "Maya watches her boyfriend die on her phone—seven minutes before it happens.",
      beatCategory: "HOOK",
      episodeHook:
        "Maya watches her boyfriend die on her phone—seven minutes before it happens.",
    });

    expect(brief).toContain("Maya Vale");
    expect(brief).toContain("PRIMARY ACTION TO DEPICT");
    expect(brief).toContain("No readable text");
    expect(brief).toContain(MICRODRAMA_PROVIDER_VISUAL_BRIEF_VERSION);
  });

  it("rewrites primary action after an image-safety violence refusal", () => {
    const brief = buildMicrodramaProviderVisualBrief({
      seriesTitle: "7 Minutes Ahead",
      genres: ["mystery", "thriller"],
      episodeId: "E002",
      locationLabel: "parking garage",
      cast: [{ name: "Ethan Cole", visualNotes: "about 30, naturalistic contemporary look" }],
      blockingKind: "reaction",
      plateSemanticId: "plate.sem.e002.010",
      sceneSemanticId: "scene.sem.e002.006",
      narrationMoment:
        "A woman slips down the concrete ramp, dazed after a fall. Ethan catches her before she reaches the",
    });
    const rewritten = rewriteProviderBriefForViolenceRetry(brief);
    expect(rewritten).toContain("No accident, no injury");
    expect(rewritten.toLowerCase()).not.toContain("slips down");
    expect(rewritten).toContain("Ethan Cole");
    expect(rewritten).toContain("parking garage");
  });

  it("resolves review density from ~4s unique-image cadence (~15 per 60s)", () => {
    const unique = resolveUniqueImageCountForDuration(60);
    expect(unique).toBeGreaterThanOrEqual(Math.ceil(60 / UNIQUE_IMAGE_CADENCE_SECONDS.max));
    expect(unique).toBeLessThanOrEqual(Math.floor(60 / UNIQUE_IMAGE_CADENCE_SECONDS.min));
    expect(unique).toBe(15);

    const policy = resolveMicrodramaAssetDensityPolicy(1, {
      profile: "review",
      durationSeconds: 60,
    });
    expect(policy.scope).toBe("review");
    expect(policy.sourcePlateTarget).toBe(unique);
    expect(policy.editorialCutTarget).toBe(unique);
    expect(policy.sourcePlateTarget).toBe(policy.editorialCutTarget);
  });

  it("allows sparse editorial cuts below scene count for review density", () => {
    const counts = distributeEditorialCutsAcrossScenes({
      sceneCount: 9,
      editorialCutTarget: 7,
      sceneWeights: [1.2, 1, 1.1, 1.4, 1.2, 1.3, 1, 1, 1.5],
    });
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(7);
    expect(counts.filter((count) => count > 0)).toHaveLength(7);
  });

  it("front-loads unique cuts into the opening window from cadence", () => {
    const frontLoad = resolveFrontLoadUniqueCutsForDuration(60);
    expect(frontLoad).toBeGreaterThanOrEqual(3);
    expect(frontLoad).toBeLessThanOrEqual(5);

    const counts = distributeEditorialCutsAcrossScenes({
      sceneCount: 9,
      editorialCutTarget: REVIEW_EDITORIAL_CUT_TARGET,
      sceneWeights: [1.2, 1, 1.1, 1.4, 1.2, 1.3, 1, 1, 1.5],
      sceneStartRatios: [0, 0.05, 0.2, 0.35, 0.58, 0.65, 0.83, 0.88, 0.92],
      sceneEndRatios: [0.05, 0.2, 0.35, 0.58, 0.65, 0.83, 0.88, 0.92, 1],
      frontLoadUntilRatio: REVIEW_FRONT_LOAD_UNTIL_RATIO,
      frontLoadUniqueCuts: frontLoad,
    });
    const earlyCuts = counts[0]! + counts[1]! + counts[2]!;
    expect(earlyCuts).toBeGreaterThanOrEqual(frontLoad);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(REVIEW_SOURCE_PLATE_TARGET);
  });
});
