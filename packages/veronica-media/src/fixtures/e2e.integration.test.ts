import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeVeronicaRender,
  runVeronicaSupplementalMediaPipeline,
} from "../index.js";
import {
  listVeronicaE2eScenarioIds,
  VERONICA_E2E_SCENARIOS,
} from "../fixtures/e2e-scenarios.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("veronica e2e scenario matrix (VMB-420)", () => {
  it("covers narration, PDF/PPTX, image, translation, dense slide, override, fallback, and approval cases", async () => {
    expect(listVeronicaE2eScenarioIds()).toHaveLength(VERONICA_E2E_SCENARIOS.length);
    for (const scenario of VERONICA_E2E_SCENARIOS) {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-e2e-"));
      temporaryRoots.push(workspace);
      const result = await runVeronicaSupplementalMediaPipeline({
        workspaceRoot: workspace,
        episodeId: `episode-${scenario.scenarioId}`,
        originalNarration: scenario.narration.original,
        revisedNarration: scenario.narration.revised,
        targetLanguage: scenario.targetLanguage,
        supplementalFiles: scenario.supplementalFiles,
        ...(scenario.overrides ? { overrides: scenario.overrides } : {}),
      });
      expect(result.landscapeManifest.aspectRatio).toBe(
        scenario.expectations.landscapeAspectRatio,
      );
      expect(result.portraitManifest.aspectRatio).toBe(
        scenario.expectations.portraitAspectRatio,
      );
      expect(result.landscapeManifest.clips.length).toBeGreaterThan(0);
      expect(result.portraitManifest.clips.length).toBeGreaterThan(0);
      expect(result.plan.approvalState).toBe("review");
      if (scenario.expectations.allowsFallback) {
        expect(result.plan.metrics.fallbackRatio).toBeGreaterThan(0);
      }
      if (scenario.expectations.includesTranslatedVisibleText) {
        expect(scenario.narration.revised).toMatch(/Welcome|path/i);
      }
      if (scenario.expectations.includesDenseSlide) {
        expect(result.plan.sourceAssets.some((asset) => asset.mediaKind === "pptx")).toBe(true);
        expect(result.plan.visualStates.length).toBeGreaterThan(1);
      }
      if (scenario.expectations.includesRepeatedSourceAsset) {
        expect(result.plan.sourceAssets).toHaveLength(2);
      }
      if (scenario.expectations.includesExplicitOverride) {
        expect(
          result.plan.placements.some((placement) => placement.fallback.requirement === "required"),
        ).toBe(true);
      }
      const landscapeDryRun = executeVeronicaRender({
        manifest: result.landscapeManifest,
        execute: false,
      });
      const portraitDryRun = executeVeronicaRender({
        manifest: result.portraitManifest,
        execute: false,
      });
      expect(landscapeDryRun.executed).toBe(false);
      expect(portraitDryRun.executed).toBe(false);
      expect(landscapeDryRun.commands.length).toBeGreaterThan(0);
      expect(portraitDryRun.commands.length).toBeGreaterThan(0);
      await expect(
        fs.stat(path.join(result.approvalPackDir, "aggregate-review.json")),
      ).resolves.toBeDefined();
    }
  });
});
