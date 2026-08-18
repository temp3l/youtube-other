import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  GeneratedVisualAsset,
  PositioningVisualPlanV2,
} from "./positioning-visual-contracts.js";
import {
  analyzeAssetReuse,
  calculateOpeningDiversityDiagnostics,
  calculateDiversityMetrics,
  classifyLongFormSimilarity,
  generatePositioningVisualPlanCalibration,
  createViewerVisibleHookFingerprint,
  generatePositioningVisualPlans,
  selectDiagramTopology,
  validateDiagramTopology,
  visualGrammarSimilarity,
  viewerVisibleHookSignature,
} from "./positioning-visual-planner.js";

const fixtureDir = path.resolve("content-packs/veronica-content-pack-1");
const temporaryDirectories: string[] = [];
let outputDir: string;
let plans: readonly PositioningVisualPlanV2[];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function readPlan(directory: string, contentId: string): Promise<PositioningVisualPlanV2> {
  return JSON.parse(
    await fs.readFile(path.join(directory, "plans", `${contentId.toLowerCase()}.visual-plan.json`), "utf8"),
  ) as PositioningVisualPlanV2;
}

async function copyPlanningFixture(): Promise<string> {
  const directory = await temporaryDirectory("positioning-source-");
  await fs.mkdir(path.join(directory, "long"), { recursive: true });
  await fs.mkdir(path.join(directory, "shorts"), { recursive: true });
  await Promise.all([
    fs.cp(path.join(fixtureDir, "meta"), path.join(directory, "meta"), { recursive: true }),
    fs.cp(path.join(fixtureDir, "long", "en"), path.join(directory, "long", "en"), { recursive: true }),
    fs.cp(path.join(fixtureDir, "shorts", "en"), path.join(directory, "shorts", "en"), { recursive: true }),
  ]);
  return directory;
}

beforeAll(async () => {
  outputDir = await temporaryDirectory("positioning-v2-");
  await generatePositioningVisualPlans({ packDir: fixtureDir, outputDir });
  plans = await Promise.all(
    ["L01", "L02", "L03", "L04", "L05", "L06", ...Array.from({ length: 6 }, (_, parent) =>
      Array.from({ length: 3 }, (_, short) => `L0${parent + 1}-S0${short + 1}`),
    ).flat()].map((contentId) => readPlan(outputDir, contentId)),
  );
});

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("Veronica positioning visual planner V2", () => {
  it("writes only a selected parent-long and Short calibration with provider-free prompt previews", async () => {
    const calibrationOutput = await temporaryDirectory("positioning-calibration-");
    const result = await generatePositioningVisualPlanCalibration({
      packDir: fixtureDir,
      outputDir: calibrationOutput,
      contentIds: ["L01", "L01-S03"],
    });
    expect(result).toMatchObject({ contentIds: ["L01", "L01-S03"], providerCalls: 0 });
    await expect(fs.access(path.join(calibrationOutput, "plans", "l01.visual-plan.json"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(calibrationOutput, "plans", "l01-s03.visual-plan.json"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(calibrationOutput, "plans", "l02.visual-plan.json"))).rejects.toThrow();
    const preview = JSON.parse(await fs.readFile(result.previewPath, "utf8")) as { providerCalls: number; plans: Array<{ contentId: string; beats: Array<{ visibleThesis: string; promptPreview: string }> }> };
    expect(preview.providerCalls).toBe(0);
    expect(preview.plans.map((plan) => plan.contentId)).toEqual(["L01", "L01-S03"]);
    expect(preview.plans.flatMap((plan) => plan.beats).every((beat) => beat.visibleThesis.length > 20 && beat.promptPreview.length > 20)).toBe(true);
  });

  it("regenerates all 24 plans with deterministic semantic hashes and millisecond timestamps", async () => {
    const repeatedOutput = await temporaryDirectory("positioning-v2-repeat-");
    const first = await generatePositioningVisualPlans({ packDir: fixtureDir, outputDir });
    const repeated = await generatePositioningVisualPlans({ packDir: fixtureDir, outputDir: repeatedOutput });

    expect(first).toMatchObject({ longPlanCount: 6, shortPlanCount: 18 });
    expect(first.contentIds).toHaveLength(24);
    expect(first.canonicalAssetCount).toBeGreaterThan(100);
    expect(first.visualEventCount).toBeGreaterThan(first.canonicalAssetCount * 2);
    expect(first.reusableAssetOpportunityCount).toBeGreaterThan(0);
    expect(plans.flatMap((plan) => plan.scenes).every((scene) =>
      Number.isSafeInteger(scene.startMs) && Number.isSafeInteger(scene.durationMs),
    )).toBe(true);
    expect(repeated.reviewPackHash).toBe(first.reviewPackHash);
    expect(Number.isSafeInteger(first.generatedAtMs)).toBe(true);
    expect(Number.isSafeInteger(repeated.generatedAtMs)).toBe(true);
    expect(path.basename(first.reviewPackPath)).toBe(
      `bulk-visual-review-${first.generatedAtMs}.json`,
    );
    expect(path.basename(repeated.reviewPackPath)).toBe(
      `bulk-visual-review-${repeated.generatedAtMs}.json`,
    );
    await expect(fs.readFile(first.latestReviewPackPath, "utf8")).resolves.toBe(
      await fs.readFile(first.reviewPackPath, "utf8"),
    );
    const firstReview = JSON.parse(await fs.readFile(first.reviewPackPath, "utf8")) as {
      generatedAtMs: number;
      reviewPackHash: string;
    };
    const repeatedReview = JSON.parse(await fs.readFile(repeated.reviewPackPath, "utf8")) as {
      generatedAtMs: number;
      reviewPackHash: string;
    };
    expect(firstReview.generatedAtMs).toBe(first.generatedAtMs);
    expect(repeatedReview.generatedAtMs).toBe(repeated.generatedAtMs);
    expect(repeatedReview.reviewPackHash).toBe(firstReview.reviewPackHash);
    await expect(
      fs.readFile(path.join(repeatedOutput, "plans", "l01.visual-plan.json"), "utf8"),
    ).resolves.toBe(await fs.readFile(path.join(outputDir, "plans", "l01.visual-plan.json"), "utf8"));
  });

  it("keeps canonical imagery stable for localization changes but invalidates title QA", async () => {
    const changedFixture = await copyPlanningFixture();
    const manifestPath = path.join(changedFixture, "meta", "visual-reuse-manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      contents: Array<{ contentId: string; titles: { de: string } }>;
    };
    const content = manifest.contents.find((candidate) => candidate.contentId === "L01");
    if (!content) throw new Error("L01 fixture missing");
    content.titles.de = "Warum selbst bessere Experten den Auftrag verlieren";
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const changedOutput = await temporaryDirectory("positioning-localization-");
    await generatePositioningVisualPlans({ packDir: changedFixture, outputDir: changedOutput });

    const baseline = plans.find((plan) => plan.contentId === "L01");
    const changed = await readPlan(changedOutput, "L01");
    expect(changed.canonicalImagePlanHash).toBe(baseline?.canonicalImagePlanHash);
    expect(changed.semanticPlanCacheKey).toBe(baseline?.semanticPlanCacheKey);
    expect(changed.localizedTitleArtifact.artifactHash).not.toBe(
      baseline?.localizedTitleArtifact.artifactHash,
    );
  });

  it("invalidates semantic planning and canonical image planning for a narrative meaning change", async () => {
    const changedFixture = await copyPlanningFixture();
    const narrationPath = path.join(
      changedFixture,
      "long/en/01-why-being-good-at-your-job-isnt-enough.md",
    );
    await fs.appendFile(narrationPath, "\nA new decision signal changes the proposition.\n", "utf8");
    const changedOutput = await temporaryDirectory("positioning-semantic-");
    await generatePositioningVisualPlans({ packDir: changedFixture, outputDir: changedOutput });

    const baseline = plans.find((plan) => plan.contentId === "L01");
    const changed = await readPlan(changedOutput, "L01");
    expect(changed.semanticPlanCacheKey).not.toBe(baseline?.semanticPlanCacheKey);
    expect(changed.canonicalImagePlanHash).not.toBe(baseline?.canonicalImagePlanHash);
  });

  it("builds proposition-specific diagrams and rejects malformed topologies", () => {
    const diagrams = plans.flatMap((plan) => plan.diagrams);
    expect(new Set(diagrams.map((diagram) => diagram.type)).size).toBeGreaterThanOrEqual(7);
    expect(diagrams.every((diagram) => validateDiagramTopology(diagram).length === 0)).toBe(true);
    expect(
      validateDiagramTopology({
        diagramId: "bad-hub",
        type: "hub-spoke",
        hub: { id: "hub" },
        spokes: [{ id: "only-one" }],
        edges: [],
        overlayLabelKeys: [],
      }),
    ).toContain("bad-hub:hub-spoke-needs-three-spokes");
    expect(
      validateDiagramTopology({
        diagramId: "bad-sequence",
        type: "sequence",
        orderedNodes: [{ id: "a" }, { id: "b" }],
        edges: [{ from: "a", to: "b" }],
        overlayLabelKeys: [],
      }),
    ).toContain("bad-sequence:sequence-needs-three-nodes");
    const validSequence = diagrams.find((diagram) => diagram.type === "sequence");
    if (!validSequence || validSequence.type !== "sequence") throw new Error("sequence fixture missing");
    expect(
      validateDiagramTopology({
        ...validSequence,
        edges: validSequence.edges.map((edge, index) =>
          index === 0 ? { ...edge, to: "disconnected-node" } : edge,
        ),
      }),
    ).toContain(`${validSequence.diagramId}:sequence-edge-chain-invalid`);
    for (const type of ["hierarchy", "hub-spoke", "cause-effect"] as const) {
      const topology = diagrams.find((diagram) => diagram.type === type);
      if (!topology || !("edges" in topology)) throw new Error(`${type} fixture missing`);
      expect(validateDiagramTopology({ ...topology, edges: topology.edges.map(() => ({})) })).toContain(
        `${topology.diagramId}:${type}-edge-invalid`,
      );
    }
  });

  it("detects semantically different scenes with identical visual grammar and consecutive repetition", () => {
    const source = plans[0]?.scenes[1]?.treatment.grammar;
    if (!source) throw new Error("grammar fixture missing");
    const repeated = [
      { ...source, semanticTokens: ["expertise"] },
      { ...source, semanticTokens: ["audience"] },
      { ...source, semanticTokens: ["publishing"] },
    ];
    const metrics = calculateDiversityMetrics({
      sceneIds: ["a", "b", "c"],
      features: repeated,
      stages: ["PROOF", "EXPLANATION", "PAYOFF"],
      continuity: {
        mode: "ensemble-independent",
        variationDimensions: ["age", "gender-presentation", "profession", "environment", "framing"],
        scenesShareIdentity: false,
      },
    });
    expect(metrics.visualGrammarDuplicateRate).toBeGreaterThan(0);
    expect(metrics.consecutiveSceneSimilarity.violatingPairs).not.toHaveLength(0);
    expect(metrics.status).toBe("fail");
  });

  it("collides semantic-only opening variants but separates materially different treatments", () => {
    const shared = {
      strategyFamily: "symbolic-metaphor" as const,
      subjectArchetype: "single illuminated object",
      environmentArchetype: "dark tactile stage",
      compositionArchetype: "single paradox with deep negative space",
      cameraArchetype: "85mm macro low three-quarter",
      lightingArchetype: "isolated object glow",
      actionArchetype: "opaque screen hides the object",
      motionArchetype: "slow reveal",
    };
    const semanticA = createViewerVisibleHookFingerprint({ ...shared, props: ["evidence card A"] });
    const semanticB = createViewerVisibleHookFingerprint({ ...shared, props: ["evidence card B"] });
    const materiallyDifferent = createViewerVisibleHookFingerprint({
      strategyFamily: "client-decision",
      subjectArchetype: "client choosing between two professionals",
      environmentArchetype: "consultation table",
      compositionArchetype: "over-shoulder decision triangle",
      cameraArchetype: "50mm client eye-line",
      lightingArchetype: "neutral daylight",
      actionArchetype: "client selects visible evidence",
      props: ["two portfolios"],
      motionArchetype: "choice reveal",
    });
    expect(viewerVisibleHookSignature(semanticA)).toBe(viewerVisibleHookSignature(semanticB));
    expect(viewerVisibleHookSignature(materiallyDifferent)).not.toBe(
      viewerVisibleHookSignature(semanticA),
    );
  });

  it("fails a cluster opening duplicate and classifies long-form warning/blocker thresholds", () => {
    const fingerprint = plans[0]?.scenes[0]?.treatment.viewerVisibleFingerprint;
    const distinct = plans[1]?.scenes[0]?.treatment.viewerVisibleFingerprint;
    if (!fingerprint || !distinct) throw new Error("opening fingerprint fixture missing");
    const duplicateSignature = viewerVisibleHookSignature(fingerprint);
    const diagnostics = calculateOpeningDiversityDiagnostics([
      { contentId: "L01", parentLongFormId: "L01", fingerprint, signature: duplicateSignature },
      { contentId: "L01-S01", parentLongFormId: "L01", fingerprint, signature: duplicateSignature },
      {
        contentId: "L01-S02",
        parentLongFormId: "L01",
        fingerprint: distinct,
        signature: viewerVisibleHookSignature(distinct),
      },
      {
        contentId: "L01-S03",
        parentLongFormId: "L01",
        fingerprint: { ...distinct, cameraArchetype: "alternate-camera" },
        signature: viewerVisibleHookSignature({ ...distinct, cameraArchetype: "alternate-camera" }),
      },
    ]);
    expect(diagnostics.clusters[0]?.status).toBe("fail");
    expect(diagnostics.clusters[0]?.failures).toContain("exact-opening-signature-duplicate");
    expect(classifyLongFormSimilarity(0.89)).toBe("blocker");
    expect(classifyLongFormSimilarity(0.85)).toBe("warning");
    expect(classifyLongFormSimilarity(0.82)).toBe("pass");
  });

  it("prefers a less-used semantically valid diagram topology deterministically", () => {
    expect(
      selectDiagramTopology(["funnel", "hierarchy", "sequence"], {
        usedTopologies: ["funnel"],
        previousTopology: "funnel",
      }),
    ).toBe("hierarchy");
    expect(
      selectDiagramTopology(["funnel", "hierarchy", "sequence"], {
        usedTopologies: ["funnel"],
        previousTopology: "funnel",
      }),
    ).toBe("hierarchy");
  });

  it("treats valid protagonist continuity explicitly and varies ensemble subjects", () => {
    const protagonist = plans.find((plan) => plan.contentId === "L06");
    const ensemble = plans.find((plan) => plan.contentId === "L02");
    expect(protagonist?.continuity.mode).toBe("persistent-protagonist");
    expect(protagonist?.diversityMetrics.subjectArchetypeDuplicateRate).toBe(0);
    expect(protagonist?.validation.status).toBe("pass");
    expect(ensemble?.continuity.mode).toBe("ensemble-independent");
    expect(new Set(ensemble?.scenes.map((scene) => scene.treatment.grammar.subjectArchetype)).size).toBe(
      ensemble?.scenes.length,
    );
  });

  it("creates a distinct multi-event cold open and progressive Short hooks", () => {
    for (const longPlan of plans.filter((plan) => plan.format === "long")) {
      const coldOpen = longPlan.coldOpen;
      const firstNormal = longPlan.scenes[1];
      expect(coldOpen?.progressionStage).toBe("COLD_OPEN");
      expect(coldOpen?.eventIds.length).toBeGreaterThan(1);
      if (!coldOpen || !firstNormal) throw new Error("cold-open fixture missing");
      expect(visualGrammarSimilarity(coldOpen.treatment.grammar, firstNormal.treatment.grammar)).toBeLessThanOrEqual(0.72);
    }
    for (const short of plans.filter((plan) => plan.format === "short")) {
      expect(short.progression[0]).toBe("HOOK");
      expect(short.progression.at(-1)).toBe("PAYOFF");
      expect(short.diversityMetrics.hookVsScene1Similarity).toBeLessThanOrEqual(0.65);
    }
  });

  it("separates base assets from deterministic render events and reports healthy cadence", () => {
    for (const plan of plans) {
      expect(plan.visualEvents.length).toBeGreaterThan(plan.assets.length);
      expect(plan.cadenceMetrics.eventsPerBaseAsset).toBeGreaterThan(1);
      expect(plan.cadenceMetrics.meanSecondsPerEvent).toBeGreaterThanOrEqual(3);
      expect(plan.cadenceMetrics.meanSecondsPerEvent).toBeLessThanOrEqual(7);
      expect(plan.cadenceMetrics.targetComplianceRate).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("finds safe long-to-Short reuse and rejects unsafe vertical crops", () => {
    expect(
      plans.flatMap((plan) => plan.assetReuseDecisions).some((decision) => decision.eligible),
    ).toBe(true);
    const wideAsset = plans
      .flatMap((plan) => plan.assets)
      .find((asset) => asset.ratioAdaptations.some((adaptation) => adaptation.aspectRatio === "9:16" && !adaptation.supported));
    if (!wideAsset) throw new Error("unsafe crop fixture missing");
    const decision = analyzeAssetReuse({
      source: wideAsset,
      targetContentId: "SHORT",
      targetSceneId: "SHORT-V01",
      targetAspectRatio: "9:16",
      targetSemanticPurpose: wideAsset.semanticPurpose,
      targetStrategy: wideAsset.strategy,
      continuityCompatible: true,
    });
    expect(decision).toMatchObject({ eligible: false, reason: "unsafe-aspect-ratio-adaptation" });
  });

  it("exposes series/cluster similarity, localization safety, cache boundaries, and review completeness", async () => {
    const review = JSON.parse(await fs.readFile(path.join(outputDir, "bulk-visual-review.json"), "utf8")) as {
      aggregateSeriesMetrics: {
        openingDiversity: {
          exactDuplicateRate: number;
          maxExactSignatureFrequency: number;
          exactDuplicateGroups: unknown[];
          clusters: Array<{ status: string }>;
        };
        crossEpisodeVisualSimilarity: {
          mean: number;
          maximum: number;
          blockerCount: number;
          pairs: unknown[];
          hotspots: Array<{ pair: string; before: number; after: number }>;
        };
        clusterMetrics: unknown[];
        diagramDiversity: { semanticJustificationFailures: unknown[] };
        localizationOverlayFit: { beforeRiskCount: number; afterRiskCount: number };
      };
      plans: Array<{ titleQa: unknown; productionCoverage: { musicSfx: string } }>;
      validation: { highBlockingFindings: number; textInGeneratedImage: boolean };
    };
    expect(review.aggregateSeriesMetrics.crossEpisodeVisualSimilarity.pairs).toHaveLength(15);
    expect(review.aggregateSeriesMetrics.openingDiversity).toMatchObject({
      exactDuplicateRate: 0,
      maxExactSignatureFrequency: 1,
      exactDuplicateGroups: [],
    });
    expect(
      review.aggregateSeriesMetrics.openingDiversity.clusters.every(
        (cluster) => cluster.status === "pass",
      ),
    ).toBe(true);
    expect(review.aggregateSeriesMetrics.crossEpisodeVisualSimilarity.blockerCount).toBe(0);
    expect(review.aggregateSeriesMetrics.crossEpisodeVisualSimilarity.maximum).toBeLessThanOrEqual(0.88);
    expect(review.aggregateSeriesMetrics.crossEpisodeVisualSimilarity.hotspots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pair: "L01<->L03", before: 0.9 }),
        expect.objectContaining({ pair: "L01<->L05", before: 0.825 }),
        expect.objectContaining({ pair: "L03<->L05", before: 0.825 }),
      ]),
    );
    expect(review.aggregateSeriesMetrics.diagramDiversity.semanticJustificationFailures).toEqual([]);
    expect(review.aggregateSeriesMetrics.localizationOverlayFit).toMatchObject({
      beforeRiskCount: 26,
      afterRiskCount: 0,
    });
    expect(review.aggregateSeriesMetrics.clusterMetrics).toHaveLength(6);
    expect(review.plans).toHaveLength(24);
    expect(review.plans.every((plan) => plan.titleQa && plan.productionCoverage.musicSfx === "unsupported-not-planned")).toBe(true);
    expect(review.validation).toMatchObject({ highBlockingFindings: 0, textInGeneratedImage: false });
    expect(plans.every((plan) => plan.localizationCompatibility.translationInvalidatesCanonicalImagery === false)).toBe(true);
    expect(plans.every((plan) => plan.migration.legacyV1Plan === "inspect-only-replan-required")).toBe(true);
    const l03 = plans.find((plan) => plan.contentId === "L03");
    expect(l03?.localizedTitleArtifact.locales.fr).toMatchObject({
      metadataTitle: "Comment devenir reconnue comme experte quand personne ne vous connaît encore",
      displayTitle: "Devenir experte reconnue quand personne ne vous connaît",
      displayLines: ["Devenir experte reconnue", "quand personne ne vous connaît"],
      overlayOverflowRisk: "low",
      minimumFontScale: 1,
    });
    expect(l03?.localizedTitleArtifact.locales.pt).toMatchObject({
      displayLines: ["Ser reconhecida como especialista", "sem ninguém conhecer você"],
      overlayOverflowRisk: "low",
      minimumFontScale: 1,
    });
  });

  it("isolates provider and renderer invalidation from the semantic plan", async () => {
    const alternateOutput = await temporaryDirectory("positioning-provider-");
    await generatePositioningVisualPlans({
      packDir: fixtureDir,
      outputDir: alternateOutput,
      configuration: { imageProviderModel: "provider-b:model-2", rendererVersion: "ffmpeg-event-compiler.v2" },
    });
    const baseline = plans.find((plan) => plan.contentId === "L01");
    const alternate = await readPlan(alternateOutput, "L01");
    expect(alternate.semanticPlanCacheKey).toBe(baseline?.semanticPlanCacheKey);
    expect(alternate.canonicalImagePlanHash).not.toBe(baseline?.canonicalImagePlanHash);
    expect(alternate.assets.map((asset: GeneratedVisualAsset) => asset.generatedAssetCacheKey)).not.toEqual(
      baseline?.assets.map((asset) => asset.generatedAssetCacheKey),
    );
    expect(alternate.renderEventPlanHash).not.toBe(baseline?.renderEventPlanHash);
  });

  it("rejects non-Veronica packs and manifest paths that escape the pack root", async () => {
    const changedFixture = await copyPlanningFixture();
    const manifestPath = path.join(changedFixture, "meta", "visual-reuse-manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      seriesId: string;
      contents: Array<{ contentId: string; narrationFiles: { en: string } }>;
    };
    manifest.seriesId = "another-creator-series";
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await expect(
      generatePositioningVisualPlans({
        packDir: changedFixture,
        outputDir: await temporaryDirectory("positioning-wrong-genre-"),
      }),
    ).rejects.toThrow("only accepts Veronica series");

    manifest.seriesId = "positioning-series-v2-optimized";
    const l01 = manifest.contents.find((content) => content.contentId === "L01");
    if (!l01) throw new Error("L01 fixture missing");
    l01.narrationFiles.en = "../../outside-pack.md";
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await expect(
      generatePositioningVisualPlans({
        packDir: changedFixture,
        outputDir: await temporaryDirectory("positioning-path-traversal-"),
      }),
    ).rejects.toThrow("path escapes pack root");

    const symlinkFixture = await copyPlanningFixture();
    const outsideDirectory = await temporaryDirectory("positioning-outside-");
    const outsideFile = path.join(outsideDirectory, "outside.md");
    await fs.writeFile(outsideFile, "outside pack", "utf8");
    const linkedNarration = path.join(
      symlinkFixture,
      "long/en/01-why-being-good-at-your-job-isnt-enough.md",
    );
    await fs.rm(linkedNarration);
    await fs.symlink(outsideFile, linkedNarration);
    await expect(
      generatePositioningVisualPlans({
        packDir: symlinkFixture,
        outputDir: await temporaryDirectory("positioning-symlink-escape-"),
      }),
    ).rejects.toThrow("resolves outside pack root");
  });
});
