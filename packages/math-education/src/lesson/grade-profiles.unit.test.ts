import { describe, expect, it } from "vitest";
import { educationalGradeProfile } from "./grade-profiles.js";

describe("educational grade profiles", () => {
  it.each([
    [5, "grades-5-6", 14, 8],
    [6, "grades-5-6", 14, 8],
    [7, "grades-7-8", 18, 10],
    [8, "grades-7-8", 18, 10],
    [9, "grades-9-10", 22, 12],
    [10, "grades-9-10", 22, 12],
  ])("selects the expected profile for grade %i", (grade, band, maximumSentenceWords, pause) => {
    expect(educationalGradeProfile(grade)).toMatchObject({
      band,
      maximumSentenceWords,
      defaultThinkingPauseSeconds: pause,
    });
  });

  it("rejects unsupported grades", () => {
    expect(() => educationalGradeProfile(4)).toThrow(/No educational grade profile/u);
  });
});
