import { describe, expect, it } from "vitest";
import { OneToOneScenePlanner } from "./index.js";
import { transcriptSchema, rewrittenScriptSchema } from "@mediaforge/domain";

describe("scene planning", () => {
  it("defaults to 5-6 second visual scenes", () => {
    const transcript = transcriptSchema.parse({
      sourceId: "episode-fixture",
      language: "en",
      text: "Sentence one. Sentence two. Sentence three.",
      segments: [
        { id: "segment-001", startSeconds: 0, endSeconds: 5, text: "Sentence one.", words: [], boundaryReason: "sentence" },
        { id: "segment-002", startSeconds: 5, endSeconds: 10, text: "Sentence two.", words: [], boundaryReason: "sentence" },
        { id: "segment-003", startSeconds: 10, endSeconds: 15, text: "Sentence three.", words: [], boundaryReason: "sentence" }
      ],
      words: Array.from({ length: 15 }, (_, index) => ({
        text: `word${index + 1}`,
        startSeconds: index,
        endSeconds: index + 1
      }))
    });
    const script = rewrittenScriptSchema.parse({
      sourceId: "episode-fixture",
      audience: "broad audience",
      text: "Sentence one. Sentence two. Sentence three.",
      sections: [
        { sectionId: "section-001", transcriptSegmentIds: ["segment-001"], text: "Sentence one.", claims: ["Sentence one."] },
        { sectionId: "section-002", transcriptSegmentIds: ["segment-002"], text: "Sentence two.", claims: ["Sentence two."] },
        { sectionId: "section-003", transcriptSegmentIds: ["segment-003"], text: "Sentence three.", claims: ["Sentence three."] }
      ],
      claims: []
    });
    const plan = new OneToOneScenePlanner().plan(transcript, script, ["16:9"]);
    expect(plan.scenes).toHaveLength(3);
    expect(plan.scenes.every((scene) => scene.estimatedDurationSeconds >= 5 && scene.estimatedDurationSeconds <= 6)).toBe(true);
    expect(plan.scenes.map((scene) => scene.timing)).toEqual([
      { startSeconds: 0, endSeconds: 6 },
      { startSeconds: 6, endSeconds: 12 },
      { startSeconds: 12, endSeconds: 17 },
    ]);
    expect(plan.scenes.map((scene) => scene.expectedImageFilenames[0])).toEqual([
      "scene-001__000000-000006__16x9.png",
      "scene-002__000006-000012__16x9.png",
      "scene-003__000012-000017__16x9.png",
    ]);
    expect(plan.scenes[0]?.sourceSegmentIds).toContain("segment-001");
    expect(plan.scenes[1]?.sourceSegmentIds).toContain("segment-002");
    expect(plan.scenes[2]?.sourceSegmentIds).toContain("segment-003");
    expect(plan.scenes[0]?.textRequirement).toEqual({ required: false });
  });

  it("splits long narration into smaller beats before balancing scenes", () => {
    const transcript = transcriptSchema.parse({
      sourceId: "episode-fixture",
      language: "en",
      text: "The mice ate the food. Then they crowded around the water bottle. Finally the colony shifted into a tense pattern.",
      segments: [
        { id: "segment-001", startSeconds: 0, endSeconds: 5, text: "The mice ate the food.", words: [], boundaryReason: "sentence" },
        { id: "segment-002", startSeconds: 5, endSeconds: 10, text: "Then they crowded around the water bottle.", words: [], boundaryReason: "sentence" },
        { id: "segment-003", startSeconds: 10, endSeconds: 15, text: "Finally the colony shifted into a tense pattern.", words: [], boundaryReason: "sentence" }
      ],
      words: Array.from({ length: 15 }, (_, index) => ({
        text: `word${index + 1}`,
        startSeconds: index,
        endSeconds: index + 1
      }))
    });
    const script = rewrittenScriptSchema.parse({
      sourceId: "episode-fixture",
      audience: "broad audience",
      text: "The mice ate the food, then crowded around the water bottle, finally the colony shifted into a tense pattern.",
      sections: [
        {
          sectionId: "section-001",
          transcriptSegmentIds: ["segment-001"],
          text: "The mice ate the food, then crowded around the water bottle, finally the colony shifted into a tense pattern.",
          claims: [
            "The mice ate the food, then crowded around the water bottle, finally the colony shifted into a tense pattern."
          ]
        }
      ],
      claims: []
    });
    const plan = new OneToOneScenePlanner().plan(transcript, script, ["16:9"]);
    expect(plan.scenes).toHaveLength(3);
    expect(plan.scenes[0]?.canonicalNarration).toContain("The mice ate the food");
    expect(plan.scenes[1]?.canonicalNarration).toContain("then crowded around the water bottle");
    expect(plan.scenes[2]?.canonicalNarration).toContain("finally the colony shifted into a tense pattern");
  });

  it("uses the density target when one is provided", () => {
    const transcript = transcriptSchema.parse({
      sourceId: "episode-fixture",
      language: "en",
      text: "One long section followed by another long section and another.",
      segments: [
        { id: "segment-001", startSeconds: 0, endSeconds: 30, text: "One long section.", words: [], boundaryReason: "sentence" },
        { id: "segment-002", startSeconds: 30, endSeconds: 60, text: "Followed by another long section.", words: [], boundaryReason: "sentence" },
        { id: "segment-003", startSeconds: 60, endSeconds: 90, text: "And another.", words: [], boundaryReason: "sentence" }
      ],
      words: Array.from({ length: 90 }, (_, index) => ({
        text: `word${index + 1}`,
        startSeconds: index,
        endSeconds: index + 1
      }))
    });
    const script = rewrittenScriptSchema.parse({
      sourceId: "episode-fixture",
      audience: "broad audience",
      text: "One long section followed by another long section and another.",
      sections: [
        { sectionId: "section-001", transcriptSegmentIds: ["segment-001"], text: "One long section.", claims: ["One long section."] },
        { sectionId: "section-002", transcriptSegmentIds: ["segment-002"], text: "Followed by another long section.", claims: ["Followed by another long section."] },
        { sectionId: "section-003", transcriptSegmentIds: ["segment-003"], text: "And another.", claims: ["And another."] }
      ],
      claims: []
    });
    const plan = new OneToOneScenePlanner().plan(transcript, script, ["16:9"], {
      visualSceneTargetPer10Minutes: 20
    });
    expect(plan.scenes).toHaveLength(3);
    expect(plan.scenes.every((scene) => scene.estimatedDurationSeconds >= 25 && scene.estimatedDurationSeconds <= 35)).toBe(true);
  });

  it("groups subtitle segments into longer visual scenes", () => {
    const transcript = transcriptSchema.parse({
      sourceId: "episode-fixture",
      language: "en",
      text: "One. Two.",
      segments: [
        { id: "segment-001", startSeconds: 0, endSeconds: 4, text: "One.", words: [], boundaryReason: "sentence" },
        { id: "segment-002", startSeconds: 4, endSeconds: 8, text: "Two.", words: [], boundaryReason: "sentence" }
      ],
      words: []
    });
    const script = rewrittenScriptSchema.parse({
      sourceId: "episode-fixture",
      audience: "broad audience",
      text: "One. Two.",
      sections: [
        { sectionId: "section-001", transcriptSegmentIds: ["scene-001"], text: "One.", claims: ["One."] },
        { sectionId: "section-002", transcriptSegmentIds: ["scene-002"], text: "Two.", claims: ["Two."] }
      ],
      claims: []
    });
    const plan = new OneToOneScenePlanner().plan(transcript, script, ["16:9"], {
      visualSceneMinSeconds: 8,
      visualSceneMaxSeconds: 8
    });
    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0]?.sourceSegmentIds).toEqual(["segment-001", "segment-002"]);
    expect(plan.scenes[0]?.expectedImageFilenames[0]).toBe("scene-001__000000-000008__16x9.png");
  });

  it("uses rewritten script text as the source for scene narration and prompts", () => {
    const transcript = transcriptSchema.parse({
      sourceId: "episode-fixture",
      language: "en",
      text: "Old transcript wording about trains and stations.",
      segments: [
        { id: "segment-001", startSeconds: 0, endSeconds: 4, text: "Old transcript wording about trains and stations.", words: [], boundaryReason: "sentence" },
        { id: "segment-002", startSeconds: 4, endSeconds: 8, text: "More old transcript wording.", words: [], boundaryReason: "sentence" }
      ],
      words: []
    });
    const script = rewrittenScriptSchema.parse({
      sourceId: "episode-fixture",
      audience: "broad audience",
      text: "A baby in a crib learns that kicking moves the mobile. Scientists watch the experiment closely.",
      sections: [
        {
          sectionId: "section-001",
          transcriptSegmentIds: ["segment-001"],
          text: "A baby in a crib learns that kicking moves the mobile.",
          claims: ["A baby in a crib learns that kicking moves the mobile."]
        },
        {
          sectionId: "section-002",
          transcriptSegmentIds: ["segment-002"],
          text: "Scientists watch the experiment closely.",
          claims: ["Scientists watch the experiment closely."]
        }
      ],
      claims: []
    });
    const plan = new OneToOneScenePlanner().plan(transcript, script, ["16:9"]);
    expect(plan.scenes[0]?.canonicalNarration).toContain("baby in a crib");
    expect(plan.scenes[0]?.imagePrompt).toContain("baby in a crib");
    expect(plan.scenes[0]?.imagePrompt).not.toContain("Old transcript wording");
    expect(plan.scenes[0]?.canonicalNarration).toContain("baby in a crib");
  });
});
