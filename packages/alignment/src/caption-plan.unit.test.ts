import { describe, expect, it } from "vitest";
import {
  episodeIdSchema,
  scenePlanSchema,
  transcriptSchema,
  type ScenePlan,
  type Transcript,
} from "@mediaforge/domain";
import { buildCaptionPack, planPhraseCaptions } from "./index.js";

function scenePlan(text = "Mara Vale found room 237. Then the clock stopped at 03:17."): ScenePlan {
  return scenePlanSchema.parse({
    sourceId: episodeIdSchema.parse("episode-fixture"),
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: text,
        sourceSegmentIds: ["segment-001"],
        estimatedDurationSeconds: 6,
        timing: { startSeconds: 0, endSeconds: 6 },
        visualPurpose: "setup",
        textRequirement: { required: false },
        subject: "Mara",
        action: "finds the room",
        setting: "hallway",
        composition: "centered",
        cameraFraming: "medium",
        mood: "tense",
        aspectRatios: ["9:16"],
        imagePrompt: "hallway",
        expectedImageFilenames: ["scene-001.png"],
        qualityStatus: "approved",
      },
    ],
  });
}

function transcript(overrides: Partial<Transcript> = {}): Transcript {
  return transcriptSchema.parse({
    sourceId: episodeIdSchema.parse("episode-fixture"),
    language: "en",
    text: "Mara Vale found room 237. Then the clock stopped at 03:17.",
    segments: [
      {
        id: "segment-001",
        startSeconds: 0,
        endSeconds: 6,
        text: "Mara Vale found room 237. Then the clock stopped at 03:17.",
        words: [],
      },
    ],
    words: [],
    ...overrides,
  });
}

describe("phrase caption planning", () => {
  it("uses word-aligned localized captions with deterministic timing and two lines", () => {
    const words = [
      "Mara",
      "Vale",
      "found",
      "room",
      "237.",
      "Then",
      "the",
      "clock",
      "stopped",
      "at",
      "03:17.",
    ].map((word, index) => ({
      text: word,
      startSeconds: index * 0.45,
      endSeconds: index * 0.45 + 0.4,
    }));
    const plan = planPhraseCaptions({
      transcript: transcript({ words }),
      scenePlan: scenePlan(),
      locale: "en-US",
    });

    expect(plan.segments[0]).toMatchObject({
      source: { kind: "word-alignment", wordStartIndex: 0 },
      maxLineCount: 2,
      anchor: "lower-middle",
    });
    expect(plan.segments.every((segment) => segment.lines.length <= 2)).toBe(true);
    expect(plan.segments.map((segment) => segment.text).join(" ")).toBe(
      "Mara Vale found room 237. Then the clock stopped at 03:17.",
    );
    expect(plan).toEqual(
      planPhraseCaptions({
        transcript: transcript({ words }),
        scenePlan: scenePlan(),
        locale: "en-US",
      }),
    );
  });

  it("falls back to transcript segments and preserves longer German word order", () => {
    const plan = planPhraseCaptions({
      transcript: transcript({
        language: "de",
        text: "Die Kellertuer blieb um Mitternacht verschlossen.",
        segments: [
          {
            id: "segment-001",
            startSeconds: 2,
            endSeconds: 7,
            text: "Die Kellertuer blieb um Mitternacht verschlossen.",
            words: [],
          },
        ],
      }),
      scenePlan: scenePlan("Die Kellertuer blieb um Mitternacht verschlossen."),
      locale: "de-DE",
    });

    expect(plan.segments[0]?.source.kind).toBe("transcript-segment");
    expect(plan.segments.map((segment) => segment.text).join(" ")).toBe(
      "Die Kellertuer blieb um Mitternacht verschlossen.",
    );
    expect(plan.segments.every((segment) => segment.lines.length <= 2)).toBe(true);
  });

  it("falls back to scene timing, preserves punctuation, and keeps sidecars compatible", () => {
    const sourceTranscript = transcript({ segments: [], words: [] });
    const plan = planPhraseCaptions({
      transcript: sourceTranscript,
      scenePlan: scenePlan("Lucia whispered, \"No entres\"; the door opened anyway."),
      locale: "es-ES",
    });
    const pack = buildCaptionPack(transcript(), scenePlan());

    expect(plan.segments[0]?.source).toMatchObject({
      kind: "scene",
      sceneId: "scene-001",
    });
    expect(plan.segments.map((segment) => segment.text).join(" ")).toBe(
      "Lucia whispered, \"No entres\"; the door opened anyway.",
    );
    expect(pack.srt).toContain("1\n00:00:00,000 --> 00:00:06,000");
    expect(pack.vtt).toContain("WEBVTT");
    expect(pack.ass).toContain("[Events]");
  });
});
