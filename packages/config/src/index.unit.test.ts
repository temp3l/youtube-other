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
    expect(config.whisperWordTimestamps).toBe(true);
    expect(config.transcriptMinSegmentSeconds).toBe(2);
    expect(config.transcriptMaxSegmentSeconds).toBe(15);
    expect(config.transcriptMaxSilenceSeconds).toBe(1.25);
    expect(config.transcriptTimestampPrecision).toBe(3);
    expect(config.visualSceneMinSeconds).toBe(6);
    expect(config.visualSceneMaxSeconds).toBe(9);
  });

  it("lets .env override inherited process env values for OpenAI credentials", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-dotenv-"));
    const previousCwd = process.cwd();
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    await fs.writeFile(
      path.join(dir, ".env"),
      [
        "OPENAI_API_KEY=test-key",
        "MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1",
        "MEDIAFORGE_OPENAI_SPEECH_MODEL=gpt-4o-mini-tts",
        "MEDIAFORGE_OPENAI_SPEECH_VOICE=onyx"
      ].join("\n")
    );
    process.chdir(dir);
    try {
      const config = await loadRuntimeConfig();
      expect(config.openAiCompatibleApiKey).toBe("test-key");
      expect(config.ttsProvider).toBe("openai-compatible");
      expect(config.openAiSpeechModel).toBe("gpt-4o-mini-tts");
      expect(config.openAiSpeechVoice).toBe("onyx");
    } finally {
      process.chdir(previousCwd);
      if (previousOpenAiKey !== undefined) {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });
});
