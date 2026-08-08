import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  HISTORY_DEFAULT_ELEVENLABS_VOICE_ID,
  assertElevenLabsApiKeyConfigured,
  describeElevenLabsApiKeyConfiguration,
  resolveElevenLabsVoiceId,
  resolveEpisodeGenre,
  resolveTtsConfig,
} from "./genre-tts-config.js";

describe("resolveTtsConfig", () => {
  it("keeps openai-compatible selection when only ElevenLabs credentials exist", () => {
    const resolved = resolveTtsConfig({
      genre: "history",
      provider: "openai-compatible",
      openAi: { model: "gpt-4o-mini-tts", voice: "onyx" },
      environment: {
        historyChannelVoiceId: HISTORY_DEFAULT_ELEVENLABS_VOICE_ID,
      },
    });
    expect(resolved).toEqual({
      provider: "openai-compatible",
      model: "gpt-4o-mini-tts",
      voice: "onyx",
    });
  });

  it("selects ElevenLabs only when explicitly configured", () => {
    const resolved = resolveTtsConfig({
      genre: "history",
      provider: "elevenlabs",
      environment: {
        historyChannelVoiceId: "env-history-voice",
      },
    });
    expect(resolved).toEqual({
      provider: "elevenlabs",
      voiceId: "env-history-voice",
      modelId: DEFAULT_ELEVENLABS_MODEL_ID,
    });
  });

  it("resolves history voice precedence: override > env > default", () => {
    expect(
      resolveElevenLabsVoiceId({
        genre: "history",
        overrides: { voiceId: "explicit-voice" },
        environment: { historyChannelVoiceId: "env-voice" },
      })
    ).toBe("explicit-voice");
    expect(
      resolveElevenLabsVoiceId({
        genre: "history",
        environment: { historyChannelVoiceId: "env-voice" },
      })
    ).toBe("env-voice");
    expect(
      resolveElevenLabsVoiceId({
        genre: "history",
      })
    ).toBe(HISTORY_DEFAULT_ELEVENLABS_VOICE_ID);
  });

  it("treats blank and whitespace env voice IDs as absent", () => {
    expect(
      resolveElevenLabsVoiceId({
        genre: "history",
        environment: { historyChannelVoiceId: "   " },
      })
    ).toBe(HISTORY_DEFAULT_ELEVENLABS_VOICE_ID);
    expect(
      resolveElevenLabsVoiceId({
        genre: "history",
        environment: { historyChannelVoiceId: "" },
      })
    ).toBe(HISTORY_DEFAULT_ELEVENLABS_VOICE_ID);
  });

  it("does not leak the history default voice into other genres", () => {
    expect(
      resolveElevenLabsVoiceId({
        genre: "horror",
        environment: { historyChannelVoiceId: "env-history-voice" },
      })
    ).toBeUndefined();
    expect(
      resolveTtsConfig({
        genre: "horror",
        provider: "elevenlabs",
        overrides: { voiceId: "horror-voice" },
      })
    ).toEqual({
      provider: "elevenlabs",
      voiceId: "horror-voice",
      modelId: DEFAULT_ELEVENLABS_MODEL_ID,
    });
  });

  it("fails clearly when ElevenLabs is selected without an API key", () => {
    expect(() =>
      assertElevenLabsApiKeyConfigured({
        genre: "history",
        apiKey: undefined,
      })
    ).toThrow(
      'ElevenLabs TTS was selected for genre "history", but ELEVENLABS_API_KEY is not configured.'
    );
    expect(() =>
      assertElevenLabsApiKeyConfigured({
        genre: "history",
        apiKey: "   ",
      })
    ).toThrow(/ELEVENLABS_API_KEY is not configured/u);
  });

  it("never exposes the API key in diagnostics", () => {
    expect(
      describeElevenLabsApiKeyConfiguration("super-secret-key")
    ).toEqual({ configured: true });
    expect(describeElevenLabsApiKeyConfiguration(undefined)).toEqual({
      configured: false,
    });
    expect(JSON.stringify(describeElevenLabsApiKeyConfiguration("secret"))).not
      .toContain("secret");
  });

  it("reads episode genre from manifest metadata", () => {
    expect(resolveEpisodeGenre({ genre: "history" })).toBe("history");
    expect(resolveEpisodeGenre({ genre: "  " })).toBeUndefined();
    expect(resolveEpisodeGenre(null)).toBeUndefined();
  });
});
