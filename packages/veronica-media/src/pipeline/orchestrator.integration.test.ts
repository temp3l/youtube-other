import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVeronicaSupplementalMediaPipeline } from "../index.js";
import { createVeronicaPilotFixtures } from "../fixtures/pilot.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("veronica supplemental media pipeline", () => {
  it("runs ingest → plan → manifests → approval pack end-to-end", async () => {
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
    });
    expect(result.plan.schemaVersion).toBe("veronica-media-plan.v1");
    expect(result.landscapeManifest.aspectRatio).toBe("16:9");
    expect(result.portraitManifest.aspectRatio).toBe("9:16");
    expect(result.landscapeManifest.clips.length).toBeGreaterThan(0);
    expect(result.ffmpegCommands.length).toBeGreaterThan(0);
    expect(result.cacheKeys).toHaveLength(2);
    await expect(fs.stat(path.join(result.approvalPackDir, "checksums.json"))).resolves.toBeDefined();
    await expect(
      fs.stat(path.join(result.approvalPackDir, "aggregate-review.json")),
    ).resolves.toBeDefined();
    expect(result.plan.narrationRevision.originalScript).toContain("Benvenuti");
    expect(result.plan.metrics.suppliedAssetUtilizationRatio).toBeGreaterThan(0);
  });

  it("resumes from cached pipeline state when inputs are unchanged", async () => {
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
    };
    const first = await runVeronicaSupplementalMediaPipeline(input);
    const second = await runVeronicaSupplementalMediaPipeline(input);
    expect(first.resumed).toBe(false);
    expect(second.resumed).toBe(true);
    expect(second.plan.contentHash).toBe(first.plan.contentHash);
  });
});
