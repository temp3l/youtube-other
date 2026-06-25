import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { OpenAiCompatibleSpeechProvider, loadSpeechVoiceSettings } from "./index.js";
import { sceneIdSchema } from "@mediaforge/domain";

function buildWavBytes(durationSeconds: number, sampleRate = 24000): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const frames = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const dataSize = frames * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  const amplitude = Math.max(1, Math.floor(0.02 * 32767));
  const frequencyHz = 220;
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * frequencyHz) * amplitude);
    buffer.writeInt16LE(sample, 44 + index * 2);
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
              return new Response(buildWavBytes(2));
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
    expect(result.sceneId).toBe("scene-001");
    expect(result.sampleRate).toBe(24000);
    expect(result.channels).toBe(1);
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
