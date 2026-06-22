import { describe, expect, it } from "vitest";
import { OneToOneScenePlanner } from "./index.js";
import { transcriptSchema, rewrittenScriptSchema } from "@mediaforge/domain";

describe("scene planning", () => {
  it("defaults to 6-9 second visual scenes", () => {
    const transcript = transcriptSchema.parse({
      sourceId: "episode-fixture",
      language: "en",
      text: "Sentence one. Sentence two. Sentence three.",
      segments: [
        { id: "segment-001", startSeconds: 0, endSeconds: 8, text: "Sentence one.", words: [], boundaryReason: "sentence" },
        { id: "segment-002", startSeconds: 8, endSeconds: 16, text: "Sentence two.", words: [], boundaryReason: "sentence" },
        { id: "segment-003", startSeconds: 16, endSeconds: 24, text: "Sentence three.", words: [], boundaryReason: "sentence" }
      ],
      words: Array.from({ length: 24 }, (_, index) => ({
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
    expect(plan.scenes.every((scene) => scene.estimatedDurationSeconds >= 6 && scene.estimatedDurationSeconds <= 9)).toBe(true);
    expect(plan.scenes.map((scene) => scene.sourceSegmentIds)).toEqual([
      ["segment-001"],
      ["segment-002"],
      ["segment-003"]
    ]);
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
    const plan = new OneToOneScenePlanner().plan(transcript, script, ["16:9"]);
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
