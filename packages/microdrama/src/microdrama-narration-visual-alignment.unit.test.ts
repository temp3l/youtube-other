import { describe, expect, it } from "vitest";

import {
  buildNarrationMomentsByPlateId,
  resolveNarrationMomentForTimeWindow,
  shotTimeWindowMs,
  toImageSafeVisualMoment,
} from "./microdrama-narration-visual-alignment.js";

describe("microdrama narration visual alignment", () => {
  const cues = [
    { startMs: 0, endMs: 2_829, text: "Maya watches her boyfriend die on her" },
    { startMs: 2_829, endMs: 4_850, text: "phone—seven minutes before it happens." },
    { startMs: 13_292, endMs: 14_900, text: "A van hits him." },
    { startMs: 37_873, endMs: 40_350, text: "through the exact spot from the video." },
  ];

  it("maps a shot window to overlapping narration cues", () => {
    const moment = resolveNarrationMomentForTimeWindow({
      startMs: 0,
      endMs: 5_000,
      cues,
    });
    expect(moment.toLowerCase()).toContain("boyfriend");
    expect(moment.toLowerCase()).toContain("phone");
    expect(moment.toLowerCase()).not.toContain(" die ");
  });

  it("softens violent phrasing for image safety", () => {
    expect(toImageSafeVisualMoment("A van hits him.").toLowerCase()).toContain(
      "rushes toward"
    );
    expect(toImageSafeVisualMoment("hands covered in blood").toLowerCase()).toContain(
      "dark red stain"
    );
    expect(
      toImageSafeVisualMoment("Ethan will be covered in a stranger's blood.").toLowerCase()
    ).not.toMatch(/\bblood\b/u);
    expect(
      toImageSafeVisualMoment("A dying stranger knows Maya's secret.").toLowerCase()
    ).toContain("injured stranger");
    expect(
      toImageSafeVisualMoment("The clip made Ethan look like a killer.").toLowerCase()
    ).not.toContain("killer");
    expect(
      toImageSafeVisualMoment("Ethan catches her before she hits the").toLowerCase()
    ).not.toMatch(/\bhits\b/u);
  });

  it("builds per-plate narration moments from shot ratios", () => {
    const moments = buildNarrationMomentsByPlateId({
      totalDurationMs: 60_600,
      cues,
      plates: [
        {
          sourcePlateSemanticId: "plate.sem.e001.001",
          timing: { startRatio: 0, endRatio: 0.08 },
        },
        {
          sourcePlateSemanticId: "plate.sem.e001.002",
          timing: { startRatio: 0.22, endRatio: 0.26 },
        },
      ],
    });
    expect(moments.get("plate.sem.e001.001")?.toLowerCase()).toContain("boyfriend");
    expect(moments.get("plate.sem.e001.002")?.toLowerCase()).toContain("van");
  });

  it("converts shot ratios into millisecond windows", () => {
    expect(shotTimeWindowMs({ startRatio: 0.5, endRatio: 0.6 }, 60_000)).toEqual({
      startMs: 30_000,
      endMs: 36_000,
    });
  });
});
