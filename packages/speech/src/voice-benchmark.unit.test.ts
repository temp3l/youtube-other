import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SpeechProvider, SpeechSynthesisRequest, SpeechSynthesisResult } from "./index.js";
import { describe, expect, it } from "vitest";
import { makeWavHeader } from "./wav-analysis.js";
import { runVoiceBenchmark, verifyVoiceBenchmarkArtifact } from "./voice-benchmark.js";

class BenchmarkMockProvider implements SpeechProvider {
  public calls: SpeechSynthesisRequest[] = [];

  public constructor(private readonly failingVoice?: string) {}

  public async synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    this.calls.push(request);
    if (request.voiceProfile.providerVoiceId === this.failingVoice) {
      throw new Error(`voice failed: ${this.failingVoice}`);
    }
    const sampleRate = 24_000;
    const frames = sampleRate;
    const pcm = Buffer.alloc(frames * 2);
    for (let index = 0; index < frames; index += 1) {
      pcm.writeInt16LE(Math.round(Math.sin(index / 8) * 1_000), index * 2);
    }
    await fs.mkdir(path.dirname(request.outputPath), { recursive: true });
    await fs.writeFile(request.outputPath, Buffer.concat([makeWavHeader(sampleRate, 1, 16, pcm.byteLength), pcm]));
    return {
      sceneId: request.sceneId,
      filePath: request.outputPath,
      durationSeconds: 1,
      sampleRate,
      channels: 1,
    };
  }
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "voice-benchmark-"));
}

describe("voice benchmarking", () => {
  it("generates anonymous reversible samples with identical request settings", async () => {
    const provider = new BenchmarkMockProvider();
    const outputDir = await tempRoot();

    const run = await runVoiceBenchmark({
      outputDir,
      provider,
      voices: ["onyx", "nova", "ash"],
      maxSamples: 2,
      model: "gpt-4o-mini-tts",
      instructions: "Keep every sample restrained.",
      speed: 1.1,
      language: "en",
      createdAt: "2026-07-02T10:00:00.000Z",
    });

    expect(run.labelMode).toBe("anonymous");
    expect(run.samples).toHaveLength(2);
    expect(run.samples.every((sample) => sample.label.startsWith("sample-"))).toBe(true);
    expect(new Set(run.samples.map((sample) => sample.voice)).size).toBe(2);
    expect(provider.calls.map((call) => call.text)).toEqual([run.passage, run.passage]);
    expect(provider.calls.map((call) => call.instructions)).toEqual([
      "Keep every sample restrained.",
      "Keep every sample restrained.",
    ]);
    expect(provider.calls.map((call) => call.voiceProfile.providerVoiceId)).toEqual(
      run.samples.map((sample) => sample.voice)
    );
    expect(run.samples[0]?.audioDurationSeconds).toBe(1);
    await expect(fs.access(path.join(outputDir, "voice-benchmark.json"))).resolves.toBeUndefined();
    await expect(verifyVoiceBenchmarkArtifact(outputDir, run)).resolves.toEqual([]);
  });

  it("reuses cached audio by material inputs", async () => {
    const provider = new BenchmarkMockProvider();
    const outputDir = await tempRoot();
    const request = {
      outputDir,
      provider,
      voices: ["onyx"],
      maxSamples: 1,
      model: "gpt-4o-mini-tts",
      instructions: "Same instructions.",
      createdAt: "2026-07-02T10:00:00.000Z",
    } as const;

    const first = await runVoiceBenchmark(request);
    const second = await runVoiceBenchmark(request);

    expect(provider.calls).toHaveLength(1);
    expect(first.samples[0]?.cacheDecision).toBe("miss");
    expect(second.samples[0]?.cacheDecision).toBe("hit");
  });

  it("records one failed voice without blocking other samples", async () => {
    const provider = new BenchmarkMockProvider("nova");
    const run = await runVoiceBenchmark({
      outputDir: await tempRoot(),
      provider,
      voices: ["onyx", "nova"],
      maxSamples: 2,
      labelMode: "voice",
      createdAt: "2026-07-02T10:00:00.000Z",
    });

    expect(run.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ voice: "nova", status: "failed", errorClass: "Error" }),
        expect.objectContaining({ voice: "onyx", status: "completed" }),
      ])
    );
    expect(provider.calls).toHaveLength(2);
  });
});
