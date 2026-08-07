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
  schemaVersion: "veronica-render-manifest.v1",
  aspectRatio: "16:9",
  outputPath,
  width: 1920,
  height: 1080,
  frameRate: 30,
  narrationAudioPath: "/tmp/narration.wav",
  clips: [
    {
      clipId: "clip-1",
      preparedAssetPath: "/tmp/asset.png",
      startSeconds: 0,
      durationSeconds: 2,
      operation: "contain",
    },
  ],
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
