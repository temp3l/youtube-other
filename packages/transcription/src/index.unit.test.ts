import { describe, expect, it } from "vitest";
import { episodeIdSchema, transcriptSchema } from "@mediaforge/domain";
import { chunkRanges, mergeChunkSegments } from "./index.js";

describe("chunked whisper transcription", () => {
  it("splits audio into predictable chunk windows", () => {
    expect(chunkRanges(125, 60)).toEqual([
      { startSeconds: 0, durationSeconds: 60 },
      { startSeconds: 60, durationSeconds: 60 },
      { startSeconds: 120, durationSeconds: 5 }
    ]);
  });

  it("merges chunk transcripts with time offsets", () => {
    const sourceId = episodeIdSchema.parse("001-calhoun-experiment");
    const chunked = [
      {
        startSeconds: 0,
        transcript: transcriptSchema.parse({
          sourceId,
          language: "en",
          text: "Hello world.",
          segments: [
            {
              id: "segment-001",
              startSeconds: 0,
              endSeconds: 2,
              text: "Hello world.",
              words: [
                { text: "Hello", startSeconds: 0, endSeconds: 1, confidence: 0.9 },
                { text: "world", startSeconds: 1, endSeconds: 2, confidence: 0.9 }
              ]
            }
          ],
          words: []
        })
      },
      {
        startSeconds: 60,
        transcript: transcriptSchema.parse({
          sourceId,
          language: "en",
          text: "Second chunk.",
          segments: [
            {
              id: "segment-001",
              startSeconds: 0,
              endSeconds: 3,
              text: "Second chunk.",
              words: [{ text: "Second", startSeconds: 0, endSeconds: 1, confidence: 0.8 }]
            }
          ],
          words: []
        })
      }
    ] as const;

    const merged = mergeChunkSegments(chunked, sourceId, "en");
    expect(merged.segments).toHaveLength(2);
    expect(merged.segments[1]?.startSeconds).toBe(60);
    expect(merged.segments[1]?.words[0]?.startSeconds).toBe(60);
    expect(merged.text).toContain("Second chunk.");
  });
});
