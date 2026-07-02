import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import {
  buildOpenAiTtsChunkRequest,
  type NarrationChunk,
  type NarrationDirection,
} from "./index.js";

const chunk: NarrationChunk = {
  chunkId: "narr-chunk-001",
  sequence: 0,
  text: "Mary opened the radio and heard her own voice answer.",
  textHash: hashText("Mary opened the radio and heard her own voice answer."),
  role: "hook",
  estimatedWordCount: 10,
  estimatedDurationMs: 4_000,
  estimatedDurationSeconds: 4,
  previousContextExcerpt: "This previous sentence must never be spoken.",
  nextContextExcerpt: "This next sentence must also remain context only.",
  flowIntent: "leads_next",
};

const direction: NarrationDirection = {
  chunkId: "narr-chunk-001",
  role: "hook",
  mood: "intimate",
  pace: "measured",
  intensity: 0.42,
  restraint: 0.82,
  pauseBeforeMs: 0,
  pauseAfterMs: 240,
  emphasisTargets: ["Mary"],
  deliveryNote: "Begin quietly, then let the final clause land.",
  negativeConstraints: ["Do not add movie-trailer suspense."],
  continuityGuidance: "Lead into the next chunk without speaking its words.",
  flowIntent: "leads_next",
};

function baseConfig() {
  return {
    model: "gpt-4o-mini-tts",
    voice: "onyx",
    speed: 1.05,
    outputFormat: "wav" as const,
    language: "en",
    locale: "en",
    variant: "full" as const,
    baseVoiceInstructions: "Use a calm documentary narrator voice.",
    providerBaseUrlIdentity: "api.openai.com",
  };
}

describe("OpenAI TTS request builder", () => {
  it("puts only the current chunk text in input and context only in instructions", () => {
    const result = buildOpenAiTtsChunkRequest({
      chunk,
      direction,
      config: baseConfig(),
      pronunciationHints: ["Mary as MARE-ee"],
    });

    expect(result.request.input).toBe(chunk.text);
    expect(result.request.input).not.toContain(chunk.previousContextExcerpt);
    expect(result.request.input).not.toContain(chunk.nextContextExcerpt);
    expect(result.request.instructions).toContain(chunk.previousContextExcerpt);
    expect(result.request.instructions).toContain(chunk.nextContextExcerpt);
    expect(result.request.instructions).toContain("must not be spoken");
  });

  it("uses transformed pronunciation text as the only synthesized input", () => {
    const result = buildOpenAiTtsChunkRequest({
      chunk,
      direction,
      config: baseConfig(),
      transformedText: "MARE-ee opened the radio and heard her own voice answer.",
    });

    expect(result.request.input).toBe("MARE-ee opened the radio and heard her own voice answer.");
    expect(result.request.instructions).toContain("Role hook.");
  });

  it("enforces input and instruction budgets deterministically", () => {
    const result = buildOpenAiTtsChunkRequest({
      chunk: {
        ...chunk,
        previousContextExcerpt: "previous ".repeat(50),
        nextContextExcerpt: "next ".repeat(50),
      },
      direction: {
        ...direction,
        deliveryNote: "delivery ".repeat(100),
      },
      config: {
        ...baseConfig(),
        budgets: {
          maxInputChars: 200,
          maxInstructionsChars: 500,
          maxContextChars: 40,
          maxDeliveryNoteChars: 60,
        },
      },
    });

    expect(result.request.instructions.length).toBeLessThanOrEqual(500);
    expect(result.promptLogMetadata.previousContextChars).toBeLessThanOrEqual(40);
    expect(result.promptLogMetadata.nextContextChars).toBeLessThanOrEqual(40);
  });

  it("hashes material request inputs", () => {
    const first = buildOpenAiTtsChunkRequest({
      chunk,
      direction,
      config: baseConfig(),
    });
    const second = buildOpenAiTtsChunkRequest({
      chunk,
      direction: { ...direction, pace: "brisk" },
      config: baseConfig(),
    });

    expect(first.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.requestFingerprint).not.toBe(first.requestFingerprint);
    expect(first.promptLogMetadata).not.toHaveProperty("input");
    expect(first.promptLogMetadata).not.toHaveProperty("instructions");
  });

  it("rejects empty input and unsupported formats before provider calls", () => {
    expect(() =>
      buildOpenAiTtsChunkRequest({
        chunk: { ...chunk, text: " ", textHash: hashText(" ") },
        direction,
        config: baseConfig(),
      })
    ).toThrow(/input is empty/u);

    expect(() =>
      buildOpenAiTtsChunkRequest({
        chunk,
        direction,
        config: { ...baseConfig(), outputFormat: "ogg" as "wav" },
      })
    ).toThrow(/Unsupported/u);
  });
});
