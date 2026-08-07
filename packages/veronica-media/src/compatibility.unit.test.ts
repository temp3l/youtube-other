import { describe, expect, it } from "vitest";
import {
  compileRenderManifestToFfmpegArgs,
  validateCompiledFfmpegSafety,
  veronicaRenderManifestSchema,
  VERONICA_DEFAULT_LANDSCAPE_PROFILE,
} from "./index.js";

describe("veronica genre compatibility", () => {
  it("compiles typed ffmpeg manifests without shell interpolation", () => {
    const manifest = veronicaRenderManifestSchema.parse({
      schemaVersion: "veronica-render-manifest.v1",
      aspectRatio: "16:9",
      profile: VERONICA_DEFAULT_LANDSCAPE_PROFILE,
      clips: [
        {
          clipId: "clip-001",
          placementId: "place-001",
          startSeconds: 0,
          endSeconds: 4,
          operations: [
            {
              kind: "contain",
              assetPath: "/tmp/safe.png",
              x: 0,
              y: 0,
              width: 1920,
              height: 1080,
            },
          ],
        },
      ],
      narrationAudioPath: "/tmp/narration.wav",
      outputPath: "/tmp/output.mp4",
      contentHash: "a".repeat(64),
    });
    const commands = compileRenderManifestToFfmpegArgs(manifest);
    validateCompiledFfmpegSafety(commands);
    expect(commands[0]?.join(" ")).not.toMatch(/[;&|`$]/u);
  });
});
