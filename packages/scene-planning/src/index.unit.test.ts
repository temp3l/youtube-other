import { describe, expect, it } from "vitest";
import { OneToOneScenePlanner } from "./index.js";
import { transcriptSchema, rewrittenScriptSchema } from "@mediaforge/domain";

describe("scene planning", () => {
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
});
