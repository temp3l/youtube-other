import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeWavHeader } from "./wav-analysis.js";
import { validateChunkAudio } from "./audio-validation.js";

async function createNarrationRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-audio-validation-"));
  const narrationRoot = path.join(root, "009-mary-gloria-the-christmas-doll", "en", "full", "audio", "narration");
  await fs.mkdir(path.join(narrationRoot, "chunks"), { recursive: true });
  return narrationRoot;
}

async function writeToneWav(filePath: string, durationSeconds: number, sampleRate = 24_000): Promise<void> {
  const frames = Math.floor(durationSeconds * sampleRate);
  const pcm = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.round(Math.sin(index * 0.05) * 8_000);
    pcm.writeInt16LE(sample, index * 2);
  }
  await fs.writeFile(filePath, Buffer.concat([makeWavHeader(sampleRate, 1, 16, pcm.byteLength), pcm]));
}

describe("chunk audio validation", () => {
  it("persists a warning report for minor duration drift without rejecting usable WAV audio", async () => {
    const narrationRoot = await createNarrationRoot();
    const audioPath = path.join(narrationRoot, "chunks", "narr-chunk-001.wav");
    await writeToneWav(audioPath, 2);

    const report = await validateChunkAudio({
      chunkId: "narr-chunk-001",
      audioPath,
      narrationRoot,
      expectedText: "Mary Gloria heard the attic door click.",
      language: "en",
      variant: "full",
      expectedDurationMs: 2_700,
      createdAt: "2026-01-02T03:04:05.000Z",
      async probeAudio() {
        return { durationSeconds: 2, sampleRate: 24_000, channels: 1, codecName: "pcm_s16le" };
      },
    });

    expect(report.validationStatus).toBe("warning");
    expect(report.metrics).toMatchObject({
      decodable: true,
      durationMs: 2_000,
      sampleRate: 24_000,
      channels: 1,
    });
    expect(report.findings.some((finding) => finding.code === "AUDIO_DURATION_OUTSIDE_HARD_RANGE")).toBe(false);
    expect(report.findings.map((finding) => finding.severity)).toContain("warning");
    expect(JSON.parse(await fs.readFile(path.join(narrationRoot, "chunks", "narr-chunk-001.validation.json"), "utf8"))).toEqual(report);
  });

  it("fails safely when a probed path escapes the narration artifact root", async () => {
    const narrationRoot = await createNarrationRoot();
    const outsidePath = path.join(path.dirname(narrationRoot), "outside.wav");
    let probed = false;

    const report = await validateChunkAudio({
      chunkId: "narr-chunk-001",
      audioPath: outsidePath,
      narrationRoot,
      createdAt: "2026-01-02T03:04:05.000Z",
      async probeAudio() {
        probed = true;
        return { durationSeconds: 1 };
      },
    });

    expect(probed).toBe(false);
    expect(report.validationStatus).toBe("failed");
    expect(report.findings[0]?.code).toBe("AUDIO_PATH_OUTSIDE_ARTIFACT_ROOT");
  });
});
