import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildNarrationMasteringFilters,
  buildNarrationMasteringFfmpegArgs,
  defaultNarrationMasteringProfiles,
  makeWavHeader,
  masterNarration,
} from "./index.js";

const createdAt = "2026-01-02T03:04:05.000Z";

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "narration-mastering-"));
  const narrationRoot = path.join(root, "009-mary-gloria-the-christmas-doll", "locales", "en", "full", "audio", "narration");
  await fs.mkdir(narrationRoot, { recursive: true });
  return narrationRoot;
}

async function writeToneWav(filePath: string, durationSeconds: number): Promise<void> {
  const sampleRate = 24_000;
  const frames = Math.floor(durationSeconds * sampleRate);
  const pcm = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    pcm.writeInt16LE(Math.round(Math.sin(index * 0.04) * 5_000), index * 2);
  }
  await fs.writeFile(filePath, Buffer.concat([makeWavHeader(sampleRate, 1, 16, pcm.byteLength), pcm]));
}

describe("narration mastering", () => {
  it("builds conservative filters for render-ready narration", () => {
    const profile = defaultNarrationMasteringProfiles().find((candidate) => candidate.id === "render-ready");
    expect(profile).toBeDefined();
    if (!profile) {
      throw new Error("missing profile");
    }

    const filters = buildNarrationMasteringFilters(profile);
    const args = buildNarrationMasteringFfmpegArgs({
      inputPath: "clean.wav",
      outputPath: "mastered.wav",
      profile,
    });

    expect(filters).toContain("highpass=f=70");
    expect(filters).toContain("acompressor=");
    expect(filters).toContain("loudnorm=I=-16:TP=-1.5");
    expect(filters).toContain("alimiter=");
    expect(args).toEqual(expect.arrayContaining(["-af", filters, "-c:a", "pcm_s16le"]));
  });

  it("keeps clean narration and writes failed metadata when ffmpeg fails", async () => {
    const narrationRoot = await createRoot();
    const inputPath = path.join(narrationRoot, "clean-narration.wav");
    const outputPath = path.join(narrationRoot, "mastered-narration.wav");
    const metadataPath = path.join(narrationRoot, "mastered-narration.metadata.json");
    await writeToneWav(inputPath, 1);
    const profile = defaultNarrationMasteringProfiles().find((candidate) => candidate.id === "shorts");
    if (!profile) {
      throw new Error("missing profile");
    }

    const result = await masterNarration({
      inputPath,
      outputPath,
      metadataPath,
      narrationRoot,
      profile,
      createdAt,
      async probeAudio() {
        return { durationSeconds: 1, sampleRate: 24_000, channels: 1 };
      },
      async runFfmpeg() {
        throw new Error("ffmpeg unavailable");
      },
    });

    expect(result.status).toBe("failed");
    expect(result.cleanNarrationPreserved).toBe(true);
    await expect(fs.access(inputPath)).resolves.toBeUndefined();
    await expect(fs.access(outputPath)).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(metadataPath, "utf8"))).toMatchObject({
      status: "failed",
      masteringProfileName: "shorts",
      warnings: [expect.objectContaining({ code: "MASTERING_FAILED" })],
    });
  });
});
