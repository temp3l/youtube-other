import { describe, expect, it } from "vitest";
import {
  assertNarrationTtsConfigured,
  NARRATION_TTS_ERROR,
  narrationStageRequiresTts,
} from "./narration-tts-guard.js";

describe("narration TTS guard", () => {
  it("requires real TTS for generation stages", () => {
    expect(narrationStageRequiresTts("generate")).toBe(true);
    expect(narrationStageRequiresTts("all")).toBe(true);
    expect(narrationStageRequiresTts("prepare")).toBe(false);
    expect(narrationStageRequiresTts("assemble")).toBe(false);
    expect(narrationStageRequiresTts("validate")).toBe(false);
    expect(narrationStageRequiresTts("status")).toBe(false);
    expect(narrationStageRequiresTts("inspect")).toBe(false);
  });

  it("rejects mock narration providers", () => {
    expect(() =>
      assertNarrationTtsConfigured({
        ttsProvider: "mock",
        openAiCompatibleApiKey: undefined,
      })
    ).toThrow(NARRATION_TTS_ERROR);
  });

  it("rejects openai-compatible narration without an API key", () => {
    expect(() =>
      assertNarrationTtsConfigured({
        ttsProvider: "openai-compatible",
        openAiCompatibleApiKey: "",
      })
    ).toThrow(NARRATION_TTS_ERROR);
  });

  it("accepts openai-compatible narration with an API key", () => {
    expect(() =>
      assertNarrationTtsConfigured({
        ttsProvider: "openai-compatible",
        openAiCompatibleApiKey: "sk-test",
      })
    ).not.toThrow();
  });

  it("accepts elevenlabs narration with an API key", () => {
    expect(() =>
      assertNarrationTtsConfigured({
        ttsProvider: "elevenlabs",
        openAiCompatibleApiKey: undefined,
        elevenLabsApiKey: "xi-test",
      })
    ).not.toThrow();
  });

  it("rejects elevenlabs narration without an API key", () => {
    expect(() =>
      assertNarrationTtsConfigured({
        ttsProvider: "elevenlabs",
        openAiCompatibleApiKey: undefined,
        elevenLabsApiKey: "",
      })
    ).toThrow(/ELEVENLABS_API_KEY is not configured/u);
  });
});
