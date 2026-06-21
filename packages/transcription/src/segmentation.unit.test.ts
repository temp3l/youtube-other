import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildSentenceSegments,
  buildVisualScenesFromSubtitleSegments,
  DEFAULT_SEGMENTATION_OPTIONS,
  normalizeTranscriptFromWords,
  validateNormalizedTranscript,
  writeNormalizedTranscriptArtifacts
} from "./segmentation.js";

function word(text: string, startSeconds: number, endSeconds: number, probability = 0.9) {
  return { text, startSeconds, endSeconds, probability };
}

describe("sentence segmentation", () => {
  it("uses sentence punctuation as the preferred boundary", () => {
    const segments = buildSentenceSegments(
      [word("Hola", 0, 0.4), word(",", 0.4, 0.41), word("mundo", 0.5, 0.9), word(".", 0.9, 0.91)],
      { ...DEFAULT_SEGMENTATION_OPTIONS, minDurationSeconds: 0.1 }
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe("Hola, mundo.");
    expect(segments[0]?.boundaryReason).toBe("sentence");
  });

  it("does not close on commas, colons, or semicolons", () => {
    const segments = buildSentenceSegments(
      [
        word("Uno", 0, 0.4),
        word(",", 0.4, 0.41),
        word("dos", 0.5, 0.9),
        word(":", 0.9, 0.91),
        word("tres", 1.0, 1.4),
        word(";", 1.4, 1.41),
        word("cuatro", 1.5, 1.9),
        word(".", 1.9, 1.91)
      ],
      { ...DEFAULT_SEGMENTATION_OPTIONS, minDurationSeconds: 0.1 }
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe("Uno, dos: tres; cuatro.");
  });

  it("preserves Spanish opening punctuation and quotation marks", () => {
    const segments = buildSentenceSegments(
      [word("¿", 0, 0.01), word("Qué", 0.01, 0.2), word("dijo", 0.2, 0.5), word("?", 0.5, 0.51)],
      { ...DEFAULT_SEGMENTATION_OPTIONS, minDurationSeconds: 0.1 }
    );
    expect(segments[0]?.text).toBe("¿Qué dijo?");
  });

  it("closes after quotes and trailing punctuation", () => {
    const segments = buildSentenceSegments(
      [word("Dijo", 0, 0.2), word('"', 0.2, 0.21), word("hola", 0.21, 0.5), word("!", 0.5, 0.51), word('"', 0.51, 0.52)],
      { ...DEFAULT_SEGMENTATION_OPTIONS, minDurationSeconds: 0.1 }
    );
    expect(segments[0]?.text).toBe('Dijo "hola!"');
  });

  it("falls back to silence when punctuation is absent", () => {
    const segments = buildSentenceSegments(
      [word("Primero", 0, 0.4), word("luego", 0.5, 0.9), word("después", 2.5, 2.9), word("fin", 2.9, 3.2)],
      { ...DEFAULT_SEGMENTATION_OPTIONS, minDurationSeconds: 0.5, maxSilenceSeconds: 1 }
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]?.boundaryReason).toBe("silence");
  });

  it("falls back to max duration when speech keeps going", () => {
    const segments = buildSentenceSegments(
      [word("Uno", 0, 1), word("dos", 1, 2), word("tres", 2, 3), word("cuatro", 3, 4), word("cinco", 4, 5)],
      { ...DEFAULT_SEGMENTATION_OPTIONS, minDurationSeconds: 0.1, maxDurationSeconds: 2.5, boundaryLookbackWords: 3 }
    );
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.some((segment) => segment.boundaryReason === "max-duration")).toBe(true);
  });

  it("does not create tiny segments before the minimum duration is reached", () => {
    const segments = buildSentenceSegments(
      [word("A", 0, 0.2), word(".", 0.2, 0.21), word("B", 0.25, 0.45), word(".", 0.45, 0.46)],
      { ...DEFAULT_SEGMENTATION_OPTIONS, minDurationSeconds: 1.0 }
    );
    expect(segments).toHaveLength(1);
  });

  it("flushes final words at the end of the transcript", () => {
    const segments = buildSentenceSegments([word("Final", 0, 0.3), word("word", 0.3, 0.6)], {
      ...DEFAULT_SEGMENTATION_OPTIONS,
      minDurationSeconds: 0.1
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.boundaryReason).toBe("end-of-transcript");
  });

  it("rounds floating-point timestamps consistently and preserves each word exactly once", () => {
    const transcript = normalizeTranscriptFromWords({
      sourceId: "episode-fixture",
      language: "es",
      words: [
        word("Hola", 0, 0.3333333),
        word("mundo", 0.3333333, 0.9999999),
        word(".", 0.9999999, 1.0000001)
      ],
      provider: "whisper.cpp",
      model: "ggml-small.bin",
      generatedAt: new Date().toISOString()
    });
    expect(transcript.words).toHaveLength(3);
    expect(transcript.words.map((entry) => entry.text)).toEqual(["Hola", "mundo", "."]);
    expect(transcript.words[1]?.startSeconds).toBeCloseTo(0.333, 3);
    validateNormalizedTranscript(transcript);
  });

  it("excludes non-speech markers from subtitle segments", () => {
    const transcript = normalizeTranscriptFromWords({
      sourceId: "episode-fixture",
      language: "en",
      words: [word("[Music]", 0, 0.5), word("Hello", 0.5, 1.2), word(".", 1.2, 1.21)],
      provider: "whisper.cpp",
      model: "ggml-small.bin",
      generatedAt: new Date().toISOString()
    });
    expect(transcript.segments).toHaveLength(1);
    expect(transcript.segments[0]?.text).toBe("Hello.");
  });

  it("rejects invalid ranges and pathological single-word timings", () => {
    expect(() =>
      normalizeTranscriptFromWords({
        sourceId: "episode-fixture",
        language: "en",
        words: [word("bad", 5, 4)],
        provider: "whisper.cpp",
        model: "ggml-small.bin",
        generatedAt: new Date().toISOString()
      })
    ).toThrow();
    expect(() =>
      normalizeTranscriptFromWords({
        sourceId: "episode-fixture",
        language: "en",
        words: [word("slow", 0, 30)],
        provider: "whisper.cpp",
        model: "ggml-small.bin",
        generatedAt: new Date().toISOString()
      })
    ).toThrow();
  });

  it("writes raw and normalized artifacts atomically", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-transcript-"));
    const rawPath = path.join(dir, "transcript.raw.json");
    const normalizedPath = path.join(dir, "transcript.json");
    const normalized = normalizeTranscriptFromWords({
      sourceId: "episode-fixture",
      language: "en",
      words: [word("Hello", 0, 0.5), word(".", 0.5, 0.51)],
      provider: "whisper.cpp",
      model: "ggml-small.bin",
      generatedAt: new Date().toISOString()
    });
    await writeNormalizedTranscriptArtifacts(
      dir,
      rawPath,
      normalizedPath,
      {
        schemaVersion: 1,
        sourceId: "episode-fixture",
        language: "en",
        backend: "whisper.cpp",
        model: "ggml-small.bin",
        generatedAt: new Date().toISOString(),
        wordTimestamps: true,
        chunks: [],
        rawSegments: normalized.segments,
        words: normalized.words,
        text: normalized.text
      },
      normalized
    );
    expect(await fs.stat(rawPath)).toBeTruthy();
    expect(await fs.stat(normalizedPath)).toBeTruthy();
  });
});

describe("visual scene grouping", () => {
  it("groups multiple subtitle segments into fewer visual scenes", () => {
    const subtitleSegments = [
      { id: "segment-001", startSeconds: 0, endSeconds: 2, text: "One.", words: [], boundaryReason: "sentence" as const },
      { id: "segment-002", startSeconds: 2, endSeconds: 4, text: "Two.", words: [], boundaryReason: "sentence" as const },
      { id: "segment-003", startSeconds: 4, endSeconds: 6, text: "Three.", words: [], boundaryReason: "sentence" as const }
    ];
    const scenes = buildVisualScenesFromSubtitleSegments(subtitleSegments, { minDurationSeconds: 4, maxDurationSeconds: 18 });
    expect(scenes.length).toBeLessThan(subtitleSegments.length);
    expect(scenes[0]?.sourceSegmentIds).toEqual(["segment-001", "segment-002"]);
  });
});
