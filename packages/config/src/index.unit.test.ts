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
    expect(config.trailingSilenceRatio).toBe(1);
    expect(config.trailingSilenceBufferSeconds).toBe(0);
    expect(Object.keys(config.visualRetention.pacingProfiles)).toEqual([
      "atmospheric",
      "balanced",
      "high-retention",
      "shorts-aggressive",
    ]);
    expect(config.visualRetention.defaults.short).toHaveLength(2);
    expect(config.visualRetention.defaults.full).toHaveLength(1);
  });

  it("loads visual retention production defaults when no config overrides are present", async () => {
    const config = await loadRuntimeConfig();

    expect(config.visualRetention.pacingProfiles["shorts-aggressive"]).toMatchObject({
      id: "shorts-aggressive",
      staticShotDurationMs: { maxMs: 3000 },
      movingShotDurationMs: { maxMs: 6000 },
      openingCadenceMs: { minMs: 1500, maxMs: 3500 },
      climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
    });
    expect(config.visualRetention.pacingProfiles["high-retention"]).toMatchObject({
      id: "high-retention",
      staticShotDurationMs: { maxMs: 4000 },
      movingShotDurationMs: { maxMs: 8000 },
    });
    expect(config.visualRetention.pacingProfiles.balanced).toMatchObject({
      id: "balanced",
      staticShotDurationMs: { maxMs: 5000 },
      movingShotDurationMs: { maxMs: 10000 },
      openingCadenceMs: { minMs: 3000, maxMs: 6000 },
    });
    expect(config.visualRetention.pacingProfiles.atmospheric).toMatchObject({
      id: "atmospheric",
      staticShotDurationMs: { maxMs: 5000 },
      movingShotDurationMs: { maxMs: 12000 },
    });

    expect(config.visualRetention.defaults.short).toEqual([
      expect.objectContaining({
        id: "short-45-60",
        pacingProfileId: "shorts-aggressive",
        narrationDurationMs: { minMs: 45000, maxMs: 60000 },
        budget: expect.objectContaining({
          sourceImageCount: { min: 5, max: 9 },
          shotCount: { min: 15, max: 28 },
          shotsPerImage: { min: 2, max: 4 },
          maxConsecutiveSourceImageUses: 3,
          maxTotalSourceImageUses: 5,
          cropLimits: expect.objectContaining({
            minCropArea: 0.35,
            minFaceMargin: 0.08,
            maxCropZoom: 2,
            minOutputHeightPx: 1080,
            maxAdjacentSameImageCropIou: 0.82,
          }),
          motionLimits: expect.objectContaining({
            minShotDurationMs: 1000,
            pushInScaleRange: { min: 1.03, max: 1.14 },
            fastPushInScaleRange: { min: 1.08, max: 1.22 },
            panTravelFractionOfImage: { min: 0.03, max: 0.12 },
            rotationDegreesRange: { min: -1, max: 1 },
            dissolveDurationMs: { minMs: 120, maxMs: 250 },
            dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
          }),
          effectCaps: [
            { effect: "blurred-fill", maxShare: 0.2, scope: "video" },
            {
              effect: "surveillance-glitch-static-combined",
              maxShare: 0.15,
              scope: "video",
            },
            { effect: "parallax", maxCount: 1, scope: "video" },
            { effect: "exposure-flash", maxCount: 3, scope: "video" },
            { effect: "blackout", maxCount: 2, scope: "video" },
            { effect: "fast-zoom", maxCount: 3, scope: "video" },
          ],
        }),
      }),
      expect.objectContaining({
        id: "short-60-75",
        narrationDurationMs: { minMs: 60000, maxMs: 75000 },
        budget: expect.objectContaining({
          sourceImageCount: { min: 7, max: 12 },
          shotCount: { min: 20, max: 35 },
        }),
      }),
    ]);

    expect(config.visualRetention.defaults.full).toEqual([
      expect.objectContaining({
        id: "full-4-6m",
        pacingProfileId: "balanced",
        narrationDurationMs: { minMs: 240000, maxMs: 360000 },
        budget: expect.objectContaining({
          sourceImageCount: { min: 18, max: 35 },
          shotCount: { min: 45, max: 85 },
          shotsPerImage: { min: 2, max: 3 },
          maxConsecutiveSourceImageUses: 3,
          maxTotalSourceImageUses: 6,
          cropLimits: expect.objectContaining({
            maxCropZoom: 1.7,
          }),
          motionLimits: expect.objectContaining({
            minShotDurationMs: 2000,
            pushInScaleRange: { min: 1.02, max: 1.1 },
            fastPushInScaleRange: { min: 1.06, max: 1.16 },
            panTravelFractionOfImage: { min: 0.02, max: 0.08 },
            rotationDegreesRange: { min: -0.5, max: 0.5 },
            dissolveDurationMs: { minMs: 200, maxMs: 500 },
            dipToBlackDurationMs: { minMs: 200, maxMs: 800 },
          }),
          effectCaps: [
            { effect: "blurred-fill", maxShare: 0.15, scope: "video" },
            {
              effect: "surveillance-glitch-static-combined",
              maxShare: 0.1,
              scope: "video",
            },
            { effect: "parallax", maxCount: 3, scope: "video" },
            {
              effect: "exposure-flash",
              maxCount: 1,
              scope: "rolling-duration",
              scopeDurationMs: 60000,
            },
            { effect: "blackout", maxCount: 1, scope: "intense-sequence" },
            {
              effect: "fast-zoom",
              maxCount: 1,
              scope: "rolling-duration",
              scopeDurationMs: 60000,
            },
          ],
        }),
      }),
    ]);
  });

  it("deep-merges partial visual retention overrides without breaking existing config loading", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-visual-retention-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "episode.config.json"),
      JSON.stringify(
        {
          visualRetention: {
            pacingProfiles: {
              balanced: {
                movingShotDurationMs: { minMs: 2500, maxMs: 9000 },
              },
            },
          },
        },
        null,
        2
      )
    );

    const episodeConfig = await loadEpisodeConfig(episodeDir);
    expect(episodeConfig?.visualRetention?.pacingProfiles?.balanced).toEqual({
      movingShotDurationMs: { minMs: 2500, maxMs: 9000 },
    });

    const config = await loadRuntimeConfig(
      {
        ttsProvider: "mock",
        visualRetention: {
          defaults: {
            short: [
              {
                id: "short-45-60",
                budget: {
                  sourceImageCount: { min: 6, max: 10 },
                  shotCount: { min: 16, max: 28 },
                  shotsPerImage: { min: 2, max: 4 },
                  maxConsecutiveSourceImageUses: 3,
                  maxTotalSourceImageUses: 5,
                  cropLimits: {
                    minCropArea: 0.35,
                    minFaceMargin: 0.08,
                    maxCropZoom: 2,
                    minOutputHeightPx: 1080,
                    maxAdjacentSameImageCropIou: 0.82,
                  },
                  motionLimits: {
                    minShotDurationMs: 1000,
                    pushInScaleRange: { min: 1.03, max: 1.14 },
                    fastPushInScaleRange: { min: 1.08, max: 1.22 },
                    panTravelFractionOfImage: { min: 0.03, max: 0.12 },
                    rotationDegreesRange: { min: -1, max: 1 },
                    dissolveDurationMs: { minMs: 120, maxMs: 250 },
                    dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
                  },
                  effectCaps: [{ effect: "blurred-fill", maxShare: 0.2 }],
                },
                pacingProfileId: "shorts-aggressive",
                narrationDurationMs: { minMs: 45000, maxMs: 60000 },
              },
            ],
          },
        },
      },
      episodeConfig ?? {}
    );

    expect(config.visualRetention.pacingProfiles.balanced.movingShotDurationMs).toEqual({
      minMs: 2500,
      maxMs: 9000,
    });
    expect(config.visualRetention.pacingProfiles.balanced.staticShotDurationMs).toEqual({
      minMs: 2000,
      maxMs: 5000,
    });
    expect(config.visualRetention.defaults.short).toEqual([
      expect.objectContaining({
        id: "short-45-60",
        budget: expect.objectContaining({
          sourceImageCount: { min: 6, max: 10 },
        }),
      }),
    ]);
    expect(config.visualRetention.defaults.full).toHaveLength(1);
  });

  it("rejects malformed visual retention configuration files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-invalid-visual-retention-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });

    for (const visualRetention of [
      {
        pacingProfiles: {
          unknown: {
            id: "unknown",
            shotDurationMs: { minMs: 1000, maxMs: 2000 },
            staticShotDurationMs: { minMs: 1000, maxMs: 2000 },
            movingShotDurationMs: { minMs: 1000, maxMs: 2000 },
            openingCadenceMs: { minMs: 1000, maxMs: 2000 },
            climaxCadenceMs: { minMs: 1000, maxMs: 2000 },
          },
        },
      },
      {
        pacingProfiles: {
          balanced: {
            movingShotDurationMs: { minMs: 9000, maxMs: 2500 },
          },
        },
      },
      {
        defaults: {
          short: [
            {
              id: "short-45-60",
              pacingProfileId: "shorts-aggressive",
              narrationDurationMs: { minMs: 45000, maxMs: 60000 },
              budget: {
                sourceImageCount: { min: 5.2, max: 9 },
                shotCount: { min: 15, max: 28 },
                shotsPerImage: { min: 2, max: 4 },
                maxConsecutiveSourceImageUses: 3,
                maxTotalSourceImageUses: 5,
                cropLimits: {
                  minCropArea: 0.35,
                  minFaceMargin: 0.08,
                  maxCropZoom: 2,
                  minOutputHeightPx: 1080,
                  maxAdjacentSameImageCropIou: 0.82,
                },
                motionLimits: {
                  minShotDurationMs: 1000,
                  pushInScaleRange: { min: 1.03, max: 1.14 },
                  fastPushInScaleRange: { min: 1.08, max: 1.22 },
                  panTravelFractionOfImage: { min: 0.03, max: 0.12 },
                  rotationDegreesRange: { min: -1, max: 1 },
                  dissolveDurationMs: { minMs: 120, maxMs: 250 },
                  dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
                },
                effectCaps: [{ effect: "blurred-fill", maxShare: -0.2 }],
              },
            },
          ],
        },
      },
    ]) {
      await fs.writeFile(
        path.join(episodeDir, "episode.config.json"),
        JSON.stringify({ visualRetention }, null, 2)
      );

      await expect(loadEpisodeConfig(episodeDir)).rejects.toThrow();
    }
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
        "MEDIAFORGE_OPENAI_LOCALIZATION_MODEL=gpt-5.4",
        "MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT=low",
        "MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS=10000",
        "MEDIAFORGE_OPENAI_SHORT_MODEL=gpt-5.4-mini",
        "MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT=low",
        "MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS=4000",
        "MEDIAFORGE_OPENAI_VALIDATOR_MODEL=gpt-5.4-mini",
        "MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT=low",
        "MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS=2000",
        "MEDIAFORGE_OPENAI_METADATA_MODEL=gpt-5.4-mini",
        "MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT=low",
        "MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS=3000",
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
      expect(config.openAiLocalizationModel).toBe("gpt-5.4");
      expect(config.openAiLocalizationReasoningEffort).toBe("low");
      expect(config.openAiLocalizationMaxOutputTokens).toBe(10000);
      expect(config.openAiShortModel).toBe("gpt-5.4-mini");
      expect(config.openAiShortReasoningEffort).toBe("low");
      expect(config.openAiShortMaxOutputTokens).toBe(4000);
      expect(config.openAiValidatorModel).toBe("gpt-5.4-mini");
      expect(config.openAiValidatorReasoningEffort).toBe("low");
      expect(config.openAiValidatorMaxOutputTokens).toBe(2000);
      expect(config.openAiMetadataModel).toBe("gpt-5.4-mini");
      expect(config.openAiMetadataReasoningEffort).toBe("low");
      expect(config.openAiMetadataMaxOutputTokens).toBe(3000);
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
