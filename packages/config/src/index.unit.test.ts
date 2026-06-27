import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEpisodeConfig, loadRuntimeConfig, resolveYoutubeChannelIdForLanguage } from "./index.js";

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
          speechVoicePreset: "very-fast",
          scriptLanguage: "es"
        },
        null,
        2
      )
    );
    const episodeConfig = await loadEpisodeConfig(episodeDir);
    expect(episodeConfig?.ttsProvider).toBe("openai-compatible");
    expect(episodeConfig?.openAiSpeechVoice).toBe("onyx");
    expect(episodeConfig?.speechVoicePreset).toBe("very-fast");
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
    expect(config.visualSceneTargetPer10Minutes).toBe(100);
    expect(config.visualSceneMinSeconds).toBe(5);
    expect(config.visualSceneMaxSeconds).toBe(6);
    expect(config.trailingSilenceRatio).toBe(0.8);
    expect(config.trailingSilenceBufferSeconds).toBe(0);
  });

  it("lets .env override inherited process env values for OpenAI credentials", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-dotenv-"));
    const previousCwd = process.cwd();
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await fs.writeFile(
      path.join(dir, ".env"),
      [
        "OPENAI_API_KEY=test-key",
        "MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1",
        "MEDIAFORGE_OPENAI_STORY_MODEL=gpt-5.5",
        "MEDIAFORGE_OPENAI_STORY_TEMPERATURE=0.5",
        "MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT=high",
        "MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS=25000",
        "MEDIAFORGE_OPENAI_STORY_RETRY_MAX_OUTPUT_TOKENS=25000",
        "MEDIAFORGE_OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS=16000",
        "MEDIAFORGE_OPENAI_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS=25000",
        "MEDIAFORGE_OPENAI_METADATA_MODEL=gpt-5.4-mini",
        "MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT=low",
        "MEDIAFORGE_OPENAI_SPEECH_MODEL=gpt-4o-mini-tts",
        "MEDIAFORGE_OPENAI_SPEECH_VOICE=onyx"
      ].join("\n")
    );
    process.chdir(dir);
    try {
      const config = await loadRuntimeConfig();
      expect(config.openAiCompatibleApiKey).toBe("test-key");
      expect(config.ttsProvider).toBe("openai-compatible");
      expect(config.openAiStoryModel).toBe("gpt-5.5");
      expect(config.openAiStoryTemperature).toBe(0.5);
      expect(config.openAiStoryReasoningEffort).toBe("high");
      expect(config.openAiStoryMaxOutputTokens).toBe(25000);
      expect(config.openAiStoryRetryMaxOutputTokens).toBe(25000);
      expect(config.openAiShortRewriteMaxOutputTokens).toBe(16000);
      expect(config.openAiShortRewriteRetryMaxOutputTokens).toBe(25000);
      expect(config.openAiMetadataModel).toBe("gpt-5.4-mini");
      expect(config.openAiMetadataReasoningEffort).toBe("low");
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

  it("allows trailing silence to be preserved when explicitly configured", async () => {
    const config = await loadRuntimeConfig({
      trailingSilenceRatio: 0.25
    });

    expect(config.trailingSilenceRatio).toBe(0.25);
  });

  it("allows the silence buffer to be configured independently", async () => {
    const config = await loadRuntimeConfig({
      trailingSilenceBufferSeconds: 0.75
    });

    expect(config.trailingSilenceBufferSeconds).toBe(0.75);
  });

  it("defaults remote rendering to disabled with safe connection settings", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-remote-render-"));
    const previousCwd = process.cwd();
    const previousRemoteRenderEnabled = process.env.REMOTE_RENDER_ENABLED;
    delete process.env.REMOTE_RENDER_ENABLED;
    process.chdir(dir);
    try {
      const config = await loadRuntimeConfig();
      expect(config.remoteRenderEnabled).toBe(false);
      expect(config.remoteRenderHost).toBe("2.24.81.148");
      expect(config.remoteRenderUser).toBe("box");
      expect(config.remoteRenderPort).toBe(22);
      expect(config.remoteRenderBaseDir).toBe("/home/box/youtube-render-worker");
      expect(config.remoteRenderConcurrency).toBe(1);
      expect(config.remoteRenderFallbackToLocal).toBe(true);
      expect(config.remoteRenderVerifyHostKey).toBe(true);
      expect(config.remoteRenderUploadMethod).toBe("rsync");
      expect(config.remoteRenderCleanupMaxAgeHours).toBe(24);
    } finally {
      process.chdir(previousCwd);
      if (previousRemoteRenderEnabled !== undefined) {
        process.env.REMOTE_RENDER_ENABLED = previousRemoteRenderEnabled;
      } else {
        delete process.env.REMOTE_RENDER_ENABLED;
      }
    }
  });

  it("resolves language-specific YouTube channels with fallback", async () => {
    const config = await loadRuntimeConfig({
      youtubeChannelId: "global-channel",
      youtubeChannelIdGerman: "german-channel",
      youtubeChannelIdSpanish: "spanish-channel",
      youtubeChannelIdFrench: "french-channel"
    });

    expect(resolveYoutubeChannelIdForLanguage(config, "de")).toBe("german-channel");
    expect(resolveYoutubeChannelIdForLanguage(config, "de-AT")).toBe("german-channel");
    expect(resolveYoutubeChannelIdForLanguage(config, "es")).toBe("spanish-channel");
    expect(resolveYoutubeChannelIdForLanguage(config, "fr-CA")).toBe("french-channel");
    expect(resolveYoutubeChannelIdForLanguage(config, "it")).toBe("global-channel");
    expect(resolveYoutubeChannelIdForLanguage(config, undefined)).toBe("global-channel");
  });
});
