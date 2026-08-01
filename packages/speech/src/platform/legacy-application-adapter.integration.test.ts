import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sceneIdSchema } from "@mediaforge/domain";
import { makeWavHeader } from "../wav-analysis.js";
import { probeAudioWithFfprobe } from "../audio-validation.js";
import { createProviderNeutralLegacyOpenAiSpeechProvider } from "./legacy-application-adapter.js";

const roots: string[] = [];

function wav(): Buffer {
  const sampleRate = 24_000;
  const frames = sampleRate * 2;
  const pcm = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1)
    pcm.writeInt16LE(
      Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 8_000),
      index * 2
    );
  return Buffer.concat([makeWavHeader(sampleRate, 1, 16, pcm.byteLength), pcm]);
}

afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  )
);

describe("provider-neutral legacy file facade", () => {
  it("preserves the pinned OpenAI request and output path through SpeechGenerationService", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "speech-legacy-facade-")
    );
    roots.push(root);
    const create = vi.fn(
      async () =>
        new Response(wav(), {
          status: 200,
          headers: { "content-type": "audio/wav" },
        })
    );
    const provider = createProviderNeutralLegacyOpenAiSpeechProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      instructions: "Default direction",
      speed: 1,
      responseFormat: "wav",
      fallbackModels: ["must-not-be-used"],
      client: { audio: { speech: { create } } },
    });
    const outputPath = path.join(root, "requested-output.wav");
    const result = await provider.synthesize(
      {
        contentProfileId: "dark-truth",
        sceneId: sceneIdSchema.parse("scene-001"),
        text: "Exact regression narration.",
        voiceProfile: {
          id: "regression",
          label: "Regression",
          gender: "neutral",
          style: "narration",
          paceWpm: 160,
          providerVoiceId: "coral",
        },
        outputPath,
        instructions: "Exact direction",
        speed: 1.1,
        dispatchContext: { kind: "legacy-noncreator" },
      },
      new AbortController().signal
    );

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      input: "Exact regression narration.",
      model: "gpt-4o-mini-tts",
      voice: "coral",
      instructions: "Exact direction",
      response_format: "wav",
      speed: 1.1,
    });
    expect(result.filePath).toBe(outputPath);
    await expect(fs.access(outputPath)).resolves.toBeUndefined();
    await expect(probeAudioWithFfprobe(outputPath)).resolves.toMatchObject({
      sampleRate: 48_000,
      channels: 1,
    });
  });
});
