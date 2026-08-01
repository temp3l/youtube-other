import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DYNAMIC_GENRE_ANALYSIS_PROMPT_VERSION,
  DYNAMIC_GENRE_POLICY_VERSION,
  DynamicGenreArtifactStore,
  StructuredDynamicGenreAnalyzer,
  buildDynamicScenePrompt,
  createNeutralDynamicGenreFallback,
  normalizeGenreAnalysisInput,
  resolveDynamicGenre,
} from "./index.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((value) => fs.rm(value, { recursive: true, force: true }))
  );
});

describe("dynamic genre offline production smoke", () => {
  it("runs input through analysis, resolution, downstream preparation, and workflow persistence", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "dynamic-pipeline-")
    );
    directories.push(directory);
    const input = normalizeGenreAnalysisInput({
      contentType: "structured-outline",
      contentId: "outline-1",
      revision: "rev-1",
      locale: "en",
      title: "Archive mystery",
      sections: [
        {
          id: "opening",
          body: "A historian finds a changing date in a sealed archive.",
        },
      ],
    });
    const fixture = createNeutralDynamicGenreFallback(input);
    const analyzer = new StructuredDynamicGenreAnalyzer({
      analyze: async () => ({
        value: {
          creativeBrief: fixture.creativeBrief,
          profile: fixture.profile,
        },
        providerMetadata: { provider: "fixture", model: "fixture-v1" },
      }),
      repair: async () => ({
        value: {},
        providerMetadata: { provider: "fixture", model: "fixture-v1" },
      }),
    });
    const analysis = await analyzer.analyze(input, {
      budgetTier: "economy",
      policyVersion: DYNAMIC_GENRE_POLICY_VERSION,
    });
    const resolved = resolveDynamicGenre({
      creativeBrief: analysis.creativeBrief,
      dynamicProfile: analysis.profile,
      contentHash: input.contentHash,
      revision: input.revision,
      locale: input.locale,
      budgetTier: "economy",
      promptVersion: DYNAMIC_GENRE_ANALYSIS_PROMPT_VERSION,
      analyzerImplementationVersion: "integration-fixture-v1",
      policyVersion: DYNAMIC_GENRE_POLICY_VERSION,
      providerMetadata: analysis.providerMetadata,
      validationAttempts: analysis.validationAttempts,
      fallbackApplied: analysis.fallbackApplied,
      analysisWarnings: analysis.warnings,
      analysisTimestamp: "2026-08-01T10:00:00.000Z",
    });
    const scenePrompt = buildDynamicScenePrompt({
      brief: resolved.creativeBrief,
      config: resolved.productionConfig,
      sceneFacts: ["A historian examines an archive."],
      platform: "long-form",
    });
    expect(resolved.productionConfig.visual.negativePromptPolicyId).toBe(
      "system-safe-negative-v1"
    );
    expect(scenePrompt.negative).toContain("provider identifiers");
    const store = new DynamicGenreArtifactStore(directory);
    await store.persist({
      creativeBrief: resolved.creativeBrief,
      dynamicProfile: resolved.dynamicProfile,
      resolvedProductionConfig: resolved.productionConfig,
      provenance: resolved.provenance,
    });
    const reloaded = await store.read();
    expect(reloaded?.provenance.cacheKey).toBe(resolved.provenance.cacheKey);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(directory, "dynamic-genre-workflow.v1.json"),
          "utf8"
        )
      )
    ).toMatchObject({ status: "resolved" });
  });
});
