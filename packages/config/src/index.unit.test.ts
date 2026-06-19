import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEpisodeConfig, loadRuntimeConfig } from "./index.js";

describe("runtime config", () => {
  it("lets CLI overrides beat episode config", async () => {
    const config = await loadRuntimeConfig(
      {
        ttsProvider: "mock",
        openAiCompatibleApiKey: "cli-key"
      },
      {
        ttsProvider: "openai-compatible",
        openAiCompatibleApiKey: "episode-key"
      }
    );
    expect(config.ttsProvider).toBe("mock");
    expect(config.openAiCompatibleApiKey).toBe("cli-key");
  });

  it("parses episode config JSON", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-config-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "episode.config.json"),
      JSON.stringify(
        {
          ttsProvider: "openai-compatible",
          openAiCompatibleApiKey: "episode-key",
          openAiSpeechModel: "gpt-4o-mini-tts",
          openAiSpeechVoice: "onyx",
          speechVoicePreset: "fast",
          scriptLanguage: "es"
        },
        null,
        2
      )
    );
    const episodeConfig = await loadEpisodeConfig(episodeDir);
    expect(episodeConfig?.ttsProvider).toBe("openai-compatible");
    expect(episodeConfig?.openAiSpeechVoice).toBe("onyx");
    expect(episodeConfig?.speechVoicePreset).toBe("fast");
    expect(episodeConfig?.scriptLanguage).toBe("es");
  });

  it("defaults whisper concurrency to all available cpu cores", async () => {
    const config = await loadRuntimeConfig({
      transcriptionProvider: "whisper.cpp",
      whisperModel: "models/ggml-base.en.bin"
    });
    const cpuCount = Math.max(1, os.cpus().length);
    expect(config.whisperThreads).toBe(cpuCount);
    expect(config.whisperProcessors).toBe(1);
    expect(config.scriptLanguage).toBe("en");
    expect(config.speechTrailingSilenceFactor).toBeCloseTo(1 / 3);
  });
});
