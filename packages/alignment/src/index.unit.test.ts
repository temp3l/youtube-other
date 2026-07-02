import { describe, expect, it } from "vitest";
import {
  episodeIdSchema,
  scenePlanSchema,
  transcriptSchema,
} from "@mediaforge/domain";
import { buildCaptionPack } from "./index.js";

describe("alignment caption sidecars", () => {
  it("keeps existing SRT, VTT, and ASS output available without shot plans", () => {
    const transcript = transcriptSchema.parse({
      sourceId: episodeIdSchema.parse("episode-fixture"),
      language: "en",
      text: "A quiet room waited.",
      segments: [
        {
          id: "segment-001",
          startSeconds: 0,
          endSeconds: 2,
          text: "A quiet room waited.",
          words: [],
        },
      ],
      words: [],
    });
    const scenePlan = scenePlanSchema.parse({
      sourceId: episodeIdSchema.parse("episode-fixture"),
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "A quiet room waited.",
          sourceSegmentIds: ["segment-001"],
          estimatedDurationSeconds: 2,
          timing: { startSeconds: 0, endSeconds: 2 },
          visualPurpose: "setup",
          textRequirement: { required: false },
          subject: "room",
          action: "waits",
          setting: "house",
          composition: "centered",
          cameraFraming: "medium",
          mood: "quiet",
          aspectRatios: ["16:9"],
          imagePrompt: "quiet room",
          expectedImageFilenames: ["scene-001.png"],
          qualityStatus: "approved",
        },
      ],
    });

    const pack = buildCaptionPack(transcript, scenePlan);

    expect(pack.srt).toContain("A quiet room waited.");
    expect(pack.vtt).toContain("WEBVTT");
    expect(pack.ass).toContain("Dialogue:");
  });
});
