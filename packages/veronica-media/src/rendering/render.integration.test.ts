import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeVeronicaRender,
  rasterizeVeronicaPreparedAssetSynthetic,
  validateVeronicaRenderOutputSync,
  veronicaRenderManifestSchema,
  VERONICA_DEFAULT_LANDSCAPE_PROFILE,
  VERONICA_DEFAULT_PORTRAIT_PROFILE,
} from "../index.js";

const ffmpegEnabled = process.env["VERONICA_FFMPEG_RENDER"] === "1";
const ffmpegAvailable =
  spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function buildManifest(input: {
  readonly workDir: string;
  readonly aspectRatio: "16:9" | "9:16";
  readonly outputName: string;
  readonly assetPath: string;
}) {
  const profile =
    input.aspectRatio === "16:9"
      ? VERONICA_DEFAULT_LANDSCAPE_PROFILE
      : VERONICA_DEFAULT_PORTRAIT_PROFILE;
  return veronicaRenderManifestSchema.parse({
    schemaVersion: "veronica-render-manifest.v1",
    aspectRatio: input.aspectRatio,
    profile,
    clips: [
      {
        clipId: "clip-001",
        placementId: "place-001",
        startSeconds: 0,
        endSeconds: 2,
        operations: [
          {
            kind: "contain",
            assetPath: input.assetPath,
            x: 0,
            y: 0,
            width: profile.width,
            height: profile.height,
          },
        ],
      },
    ],
    narrationAudioPath: path.join(input.workDir, "narration.wav"),
    outputPath: path.join(input.workDir, input.outputName),
    contentHash: "a".repeat(64),
  });
}

describe("veronica ffmpeg render gate", () => {
  it.skipIf(!ffmpegEnabled || !ffmpegAvailable)(
    "executes landscape and portrait renders with output validation",
    async () => {
      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-render-gate-"));
      temporaryRoots.push(workDir);
      const landscapeAsset = path.join(workDir, "landscape.png");
      const portraitAsset = path.join(workDir, "portrait.png");
      const asset = {
        assetId: "frame",
        originalFilename: "frame.png",
        mimeType: "image/png",
        mediaKind: "png" as const,
        checksum: "a".repeat(64),
        byteLength: 0,
        bytes: new Uint8Array(),
        extractedCandidates: [],
      };
      await fs.writeFile(
        landscapeAsset,
        rasterizeVeronicaPreparedAssetSynthetic({
          asset,
          candidateId: "frame-landscape",
          label: "landscape",
          width: VERONICA_DEFAULT_LANDSCAPE_PROFILE.width,
          height: VERONICA_DEFAULT_LANDSCAPE_PROFILE.height,
        }),
      );
      await fs.writeFile(
        portraitAsset,
        rasterizeVeronicaPreparedAssetSynthetic({
          asset,
          candidateId: "frame-portrait",
          label: "portrait",
          width: VERONICA_DEFAULT_PORTRAIT_PROFILE.width,
          height: VERONICA_DEFAULT_PORTRAIT_PROFILE.height,
        }),
      );
      const narrationPath = path.join(workDir, "narration.wav");
      const narration = spawnSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=mono:sample_rate=16000",
          "-t",
          "2",
          narrationPath,
        ],
        { encoding: "utf8" },
      );
      expect(narration.status).toBe(0);
      const landscapeManifest = buildManifest({
        workDir,
        aspectRatio: "16:9",
        outputName: "landscape.mp4",
        assetPath: landscapeAsset,
      });
      const portraitManifest = buildManifest({
        workDir,
        aspectRatio: "9:16",
        outputName: "portrait.mp4",
        assetPath: portraitAsset,
      });
      const landscape = executeVeronicaRender({
        manifest: landscapeManifest,
        execute: true,
      });
      const portrait = executeVeronicaRender({
        manifest: portraitManifest,
        execute: true,
      });
      expect(landscape.executed).toBe(true);
      expect(portrait.executed).toBe(true);
      expect(
        validateVeronicaRenderOutputSync({
          manifest: landscapeManifest,
          executed: true,
        }).valid,
      ).toBe(true);
      expect(
        validateVeronicaRenderOutputSync({
          manifest: portraitManifest,
          executed: true,
        }).valid,
      ).toBe(true);
    },
    120_000,
  );

  it("documents the feature flag when ffmpeg render is disabled", () => {
    if (ffmpegEnabled && ffmpegAvailable) {
      expect(process.env["VERONICA_FFMPEG_RENDER"]).toBe("1");
      return;
    }
    expect(process.env["VERONICA_FFMPEG_RENDER"]).not.toBe("1");
  });
});
