import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "@mediaforge/process-runner";
import { makeWavHeader } from "../wav-analysis.js";
import { parseNarrationLoudnessMeasurement } from "../mastering.js";
import { FileSystemSpeechArtifactService } from "./filesystem-artifacts.js";

const roots: string[] = [];

function tone(frequency: number, durationSeconds = 2): Buffer {
  const sampleRate = 24_000;
  const frames = Math.round(sampleRate * durationSeconds);
  const pcm = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1)
    pcm.writeInt16LE(
      Math.round(
        Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * 12_000
      ),
      index * 2
    );
  return Buffer.concat([makeWavHeader(sampleRate, 1, 16, pcm.byteLength), pcm]);
}

function frequency(raw: Buffer, sampleRate = 48_000): number {
  let crossings = 0;
  let previous = raw.readInt16LE(0);
  for (let offset = 2; offset + 1 < raw.length; offset += 2) {
    const current = raw.readInt16LE(offset);
    if ((previous < 0 && current >= 0) || (previous >= 0 && current < 0))
      crossings += 1;
    previous = current;
  }
  return crossings / 2 / (raw.length / 2 / sampleRate);
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe("filesystem speech artifacts with repository FFmpeg process abstraction", () => {
  it("concatenates in order and emits a measured 48 kHz mono signed-16 FLAC master", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "speech-artifacts-real-")
    );
    roots.push(root);
    const service = new FileSystemSpeechArtifactService({
      rootDirectory: root,
    });
    const first = await service.persistRaw({
      generationId: "generation-real",
      chunkIndex: 0,
      contentType: "audio/wav",
      audio: Readable.from([tone(440)]),
    });
    const second = await service.persistRaw({
      generationId: "generation-real",
      chunkIndex: 1,
      contentType: "audio/wav",
      audio: Readable.from([tone(880)]),
    });
    const master = await service.createCanonicalMaster({
      generationId: "generation-real",
      rawArtifacts: [first, second],
    });
    const masterPath = path.join(root, master.artifactId);
    const probe = JSON.parse(
      (
        await runCommand(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,sample_rate,channels,sample_fmt",
            "-of",
            "json",
            masterPath,
          ],
          { timeoutMs: 30_000 }
        )
      ).stdout
    ) as {
      streams: Array<{
        codec_name: string;
        sample_rate: string;
        channels: number;
        sample_fmt: string;
      }>;
    };
    expect(probe.streams[0]).toMatchObject({
      codec_name: "flac",
      sample_rate: "48000",
      channels: 1,
      sample_fmt: "s16",
    });

    const firstPcm = path.join(root, "first.pcm");
    const secondPcm = path.join(root, "second.pcm");
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        "0.5",
        "-t",
        "0.25",
        "-i",
        masterPath,
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        firstPcm,
      ],
      { timeoutMs: 30_000 }
    );
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        "2.5",
        "-t",
        "0.25",
        "-i",
        masterPath,
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        secondPcm,
      ],
      { timeoutMs: 30_000 }
    );
    expect(frequency(await fs.readFile(firstPcm))).toBeCloseTo(440, -1);
    expect(frequency(await fs.readFile(secondPcm))).toBeCloseTo(880, -1);

    const loudness = await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        masterPath,
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
      ],
      { timeoutMs: 30_000 }
    );
    const measured = parseNarrationLoudnessMeasurement(loudness.stderr);
    expect(measured.inputI).toBeGreaterThanOrEqual(-16.5);
    expect(measured.inputI).toBeLessThanOrEqual(-15.5);
    expect(measured.inputTp).toBeLessThanOrEqual(-1.5);
  });

  it("rejects invalid audio, bounds diagnostics, and removes mastering temporary directories", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "speech-artifacts-invalid-")
    );
    roots.push(root);
    const service = new FileSystemSpeechArtifactService({
      rootDirectory: root,
    });
    const invalid = await service.persistRaw({
      generationId: "generation-invalid",
      chunkIndex: 0,
      contentType: "audio/mpeg",
      audio: Readable.from([Buffer.from("not audio")]),
    });
    const rejected = service.createCanonicalMaster({
      generationId: "generation-invalid",
      rawArtifacts: [invalid],
    });
    await expect(rejected).rejects.toMatchObject({
      code: "SPEECH_AUDIO_PROCESSING_FAILED",
    });
    const after = (await fs.readdir(root)).filter((name) =>
      name.startsWith(".tmp-speech-master-")
    );
    expect(after).toEqual([]);
    await expect(
      rejected.catch((error: unknown) =>
        error instanceof Error ? error.message.length : 0
      )
    ).resolves.toBeLessThanOrEqual(1_000);
  });
});
