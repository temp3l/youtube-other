import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildAudioInstructionArtifact,
  computeSpeechModelConfigFingerprint,
  computeSpeechVoiceConfigFingerprint,
  computeTtsDependencyFingerprint,
  OpenAiCompatibleSpeechProvider,
  loadSpeechVoiceSettings,
} from "./index.js";
import { sceneIdSchema } from "@mediaforge/domain";

function makeChunk(id: string, payload: Buffer): Buffer {
  const paddedLength = payload.byteLength + (payload.byteLength % 2);
  const buffer = Buffer.alloc(8 + paddedLength);
  buffer.write(id, 0);
  buffer.writeUInt32LE(payload.byteLength, 4);
  payload.copy(buffer, 8);
  return buffer;
}

function buildWavBytes(
  durationSeconds: number,
  sampleRate = 24000,
  options: { readonly amplitude?: number; readonly includeInfoChunk?: boolean } = {}
): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const frames = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const dataSize = frames * channels * (bitsPerSample / 8);
  const amplitude = Math.max(1, Math.floor((options.amplitude ?? 0.02) * 32767));
  const frequencyHz = 220;
  const pcm = Buffer.alloc(dataSize);
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * frequencyHz) * amplitude);
    pcm.writeInt16LE(sample, index * 2);
  }
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 8);
  fmt.writeUInt16LE(channels * (bitsPerSample / 8), 12);
  fmt.writeUInt16LE(bitsPerSample, 14);
  const chunks = [makeChunk("fmt ", fmt)];
  if (options.includeInfoChunk) {
    chunks.push(makeChunk("LIST", Buffer.from("INFOISFTLavf59.27.100\0", "ascii")));
  }
  chunks.push(makeChunk("data", pcm));
  const payloadSize = 4 + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = Buffer.alloc(8 + payloadSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(payloadSize, 4);
  buffer.write("WAVE", 8);
  let offset = 12;
  for (const chunk of chunks) {
    chunk.copy(buffer, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

describe("speech voice settings", () => {
  it("loads the documented narration settings", () => {
    const settings = loadSpeechVoiceSettings();
    expect(settings.profile.gender).toBe("male");
    expect(settings.profile.paceWpm).toBe(180);
    expect(settings.instructions).toContain("Calhoun");
    expect(settings.instructions).toContain("180 words per minute");
  });
});

describe("OpenAiCompatibleSpeechProvider", () => {
  it("computes audio instruction and tts fingerprints from narration and speech config only", () => {
    const speechSettings = loadSpeechVoiceSettings();
    const audioInstruction = buildAudioInstructionArtifact({
      narration: {
        episodeNumber: "001",
        episodeSlug: "episode-001",
        language: "en",
        locale: "en-US",
        variant: "full",
        narrationText: "Validated narration only.",
        narrationFingerprint: "a".repeat(64),
      },
      speechConfig: {
        model: "gpt-4o-mini-tts",
        voice: "onyx",
        baseInstructions: speechSettings.instructions,
        speed: speechSettings.speed,
      },
    });
    const voiceConfigFingerprint = computeSpeechVoiceConfigFingerprint({
      voice: "onyx",
      speed: speechSettings.speed,
    });
    const modelConfigFingerprint = computeSpeechModelConfigFingerprint({
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      baseInstructions: speechSettings.instructions,
      speed: speechSettings.speed,
    });
    const first = computeTtsDependencyFingerprint({
      narrationFingerprint: "a".repeat(64),
      voiceConfigFingerprint,
      speechModelConfigFingerprint: modelConfigFingerprint,
      audioInstructionFingerprint: audioInstruction.instructionFingerprint,
    });
    const second = computeTtsDependencyFingerprint({
      narrationFingerprint: "a".repeat(64),
      voiceConfigFingerprint: computeSpeechVoiceConfigFingerprint({
        voice: "alloy",
        speed: speechSettings.speed,
      }),
      speechModelConfigFingerprint: modelConfigFingerprint,
      audioInstructionFingerprint: audioInstruction.instructionFingerprint,
    });
    expect(first).not.toBe(second);
  });

  it("writes the audio returned by the OpenAI speech client", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-speech-"));
    const outputPath = path.join(tempDir, "scene-001.wav");
    const provider = new OpenAiCompatibleSpeechProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      client: {
        audio: {
          speech: {
            async create() {
              return new Response(buildWavBytes(2, 24000, { includeInfoChunk: true }));
            }
          }
        }
      }
    });
    const result = await provider.synthesize(
      {
        sceneId: sceneIdSchema.parse("scene-001"),
        text: "Hello from the narrator.",
        voiceProfile: loadSpeechVoiceSettings().profile,
        outputPath,
        instructions: "Narration-only TTS instructions."
      },
      new AbortController().signal
    );
    expect(result.sceneId).toBe("scene-001");
    expect(result.sampleRate).toBe(24000);
    expect(result.channels).toBe(1);
    expect(result.durationSeconds).toBeGreaterThan(1.9);
    expect((await fs.stat(outputPath)).size).toBeGreaterThan(44);
  });

  it("rejects near-silent audio and retries the next model", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-speech-quality-"));
    const outputPath = path.join(tempDir, "scene-001.wav");
    const calls: string[] = [];
    const provider = new OpenAiCompatibleSpeechProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini-tts",
      fallbackModels: ["gpt-4.1-mini-tts"],
      voice: "onyx",
      client: {
        audio: {
          speech: {
            async create(body) {
              calls.push(body.model);
              if (body.model === "gpt-4o-mini-tts") {
                return new Response(buildWavBytes(2, 24000, { amplitude: 0.0005, includeInfoChunk: true }));
              }
              return new Response(buildWavBytes(2, 24000, { includeInfoChunk: true }));
            }
          }
        }
      }
    });
    const result = await provider.synthesize(
      {
        sceneId: sceneIdSchema.parse("scene-001"),
        text: "Hello from the narrator.",
        voiceProfile: loadSpeechVoiceSettings().profile,
        outputPath
      },
      new AbortController().signal
    );
    expect(calls).toEqual(["gpt-4o-mini-tts", "gpt-4.1-mini-tts"]);
    expect(result.durationSeconds).toBeGreaterThan(1.9);
    expect((await fs.stat(outputPath)).size).toBeGreaterThan(44);
  });

  it("falls back to the next configured model when the elected model is at capacity", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-speech-fallback-"));
    const outputPath = path.join(tempDir, "scene-001.wav");
    const calls: string[] = [];
    const provider = new OpenAiCompatibleSpeechProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini-tts",
      fallbackModels: ["gpt-4.1-mini-tts"],
      voice: "onyx",
      client: {
        audio: {
          speech: {
            async create(body) {
              calls.push(body.model);
              if (body.model === "gpt-4o-mini-tts") {
                throw new Error("elected model is at capacity. Please try a different model.");
              }
              return new Response(buildWavBytes(1));
            }
          }
        }
      }
    });
    const result = await provider.synthesize(
      {
        sceneId: sceneIdSchema.parse("scene-001"),
        text: "Hello from the narrator.",
        voiceProfile: loadSpeechVoiceSettings().profile,
        outputPath
      },
      new AbortController().signal
    );
    expect(calls).toEqual(["gpt-4o-mini-tts", "gpt-4.1-mini-tts"]);
    expect(result.durationSeconds).toBeGreaterThan(0.9);
    expect((await fs.stat(outputPath)).size).toBeGreaterThan(44);
  });
});
