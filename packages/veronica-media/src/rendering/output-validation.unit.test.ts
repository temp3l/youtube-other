import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VeronicaRenderManifest } from "../contracts/media-plan.v1.js";
import { validateVeronicaRenderOutputSync } from "./output-validation.js";

const temporaryFiles: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryFiles.splice(0).map((file) => fs.rm(file, { force: true })));
});

const manifest = (outputPath: string): VeronicaRenderManifest => ({
  schemaVersion: "veronica-render-manifest.v2",
  canonicalContentIdentity: {
    contentPackId: "veronica-unified-content-pack-v2",
    storyId: "episode-001",
    episodeId: "veronica-episode-01",
    locale: "it",
    variant: "long",
    contentHash: "b".repeat(64),
  },
  aspectRatio: "16:9",
  profile: {
    aspectRatio: "16:9",
    width: 1920,
    height: 1080,
    fps: 30,
    safeAreas: {
      subtitle: { top: 0, right: 0, bottom: 0, left: 0 },
      title: { top: 0, right: 0, bottom: 0, left: 0 },
      lowerThird: { top: 0, right: 0, bottom: 0, left: 0 },
      platformUi: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  },
  outputPath,
  narrationAudioPath: "/tmp/narration.wav",
  clips: [
    {
      clipId: "clip-1",
      placementId: "place-1",
      startSeconds: 0,
      endSeconds: 2,
      operations: [{
        kind: "contain",
        assetPath: "/tmp/asset.png",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      }],
    },
  ],
  contentHash: "c".repeat(64),
});

describe("validateVeronicaRenderOutputSync", () => {
  it("accepts dry-run manifests and validates executed outputs", async () => {
    const dryRun = validateVeronicaRenderOutputSync({
      executed: false,
      manifest: manifest("/tmp/unrendered.mp4"),
    });
    expect(dryRun.valid).toBe(true);

    const outputPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "render-out-")),
      "landscape.mp4",
    );
    temporaryFiles.push(outputPath);
    await fs.writeFile(outputPath, Buffer.alloc(128, 1));
    const executed = validateVeronicaRenderOutputSync({
      executed: true,
      manifest: manifest(outputPath),
    });
    expect(executed.valid).toBe(true);
    expect(executed.outputBytes).toBe(128);
  });
});
