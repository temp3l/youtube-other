import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVeronicaSupplementalMediaPipeline } from "../index.js";
import { createVeronicaPilotFixtures } from "../fixtures/pilot.js";
import { validateRenderManifestAspectIntegrity } from "../rendering/manifest-integrity.js";
import { verifyPreparedAssetBytes } from "../preparation/prepared-asset-integrity.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("veronica supplemental media pipeline", () => {
  it(
    "runs ingest → plan → manifests → approval pack end-to-end",
    async () => {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-pipeline-"));
      temporaryRoots.push(workspace);
      const fixtures = createVeronicaPilotFixtures();
      const result = await runVeronicaSupplementalMediaPipeline({
        workspaceRoot: workspace,
        episodeId: "episode-pilot",
        originalNarration: fixtures.narration.original,
        revisedNarration: fixtures.narration.revised,
        targetLanguage: "it",
        sourceLanguage: "it",
        supplementalFiles: fixtures.files,
        alignedSegments: fixtures.alignedSegments,
        resume: false,
      });
      expect(result.plan.schemaVersion).toBe("veronica-media-plan.v1");
      expect(result.landscapeManifest.aspectRatio).toBe("16:9");
      expect(result.portraitManifest.aspectRatio).toBe("9:16");
      expect(result.landscapeManifest.clips.length).toBeGreaterThan(0);
      expect(result.ffmpegCommands.length).toBeGreaterThan(0);
      expect(result.cacheKeys).toHaveLength(2);
      await expect(fs.stat(path.join(result.approvalPackDir, "checksums.json"))).resolves.toBeDefined();
      expect(result.plan.narrationRevision.originalScript).toContain("Benvenuti");
      expect(result.plan.metrics.suppliedAssetUtilizationRatio).toBeGreaterThan(0);
      const preparedAssetPaths = Object.fromEntries(
        result.plan.preparedAssets.map((prepared) => [
          prepared.preparedAssetId,
          path.join(workspace, "episode-pilot", "state", "veronica-media", prepared.relativePath),
        ]),
      );
      expect(
        validateRenderManifestAspectIntegrity({
          manifest: result.portraitManifest,
          plan: result.plan,
          preparedAssetPaths,
        }).valid,
      ).toBe(true);
      for (const prepared of result.plan.preparedAssets) {
        const bytes = await fs.readFile(preparedAssetPaths[prepared.preparedAssetId]!);
        expect(verifyPreparedAssetBytes(prepared, bytes).valid).toBe(true);
      }
    },
    120_000,
  );

  it(
    "resumes from cached pipeline state when inputs are unchanged",
    async () => {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-resume-"));
      temporaryRoots.push(workspace);
      const fixtures = createVeronicaPilotFixtures();
      const input = {
        workspaceRoot: workspace,
        episodeId: "episode-resume",
        originalNarration: fixtures.narration.original,
        revisedNarration: fixtures.narration.revised,
        targetLanguage: "it",
        sourceLanguage: "it",
        supplementalFiles: fixtures.files,
        alignedSegments: fixtures.alignedSegments,
        resume: false,
      };
      const first = await runVeronicaSupplementalMediaPipeline({ ...input, resume: false });
      const second = await runVeronicaSupplementalMediaPipeline({ ...input, resume: true });
      expect(first.resumed).toBe(false);
      expect(second.resumed).toBe(true);
      expect(second.plan.contentHash).toBe(first.plan.contentHash);
    },
    120_000,
  );
});
