import { describe, expect, it } from "vitest";
import { Formula, NumberLine } from "./components/math-components.js";
import { createMathComposition } from "./composition/composition.js";
import {
  grades57Profile,
  grades810Profile,
  validateMathLayout,
} from "./profiles/profiles.js";
import { validateTeacherAssets } from "./assets/teacher.js";

describe("math rendering contracts", () => {
  it("renders controlled formula SVG and rejects unbound diagrams", () => {
    const formula = Formula({
      factId: "example-value",
      expression: { kind: "rational", numerator: "1", denominator: "2" },
    });
    expect(formula.svg).toContain('data-fact-id="example-value"');
    expect(formula.svg).toContain("<svg");
    expect(() => NumberLine([])).toThrow(/factId/u);
  });

  it("enforces grade profile readability limits", () => {
    expect(() => validateMathLayout(grades57Profile, 4, 72, 0.2)).toThrow(
      /at most 3/u
    );
    expect(() => validateMathLayout(grades810Profile, 5, 58, 0.26)).toThrow(
      /25 percent/u
    );
  });

  it("validates all seven deterministic teacher placeholders", async () => {
    await expect(
      validateTeacherAssets("assets/math-teacher/alex/v1/manifest.json")
    ).resolves.toBeUndefined();
  });

  it("creates a 1920 by 1080 composition contract", () => {
    const scenes = Array.from({ length: 9 }, (_, index) => ({
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      startFrame: index * 800,
      endFrame: (index + 1) * 800,
      segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
      cueFrames: [],
    }));
    const composition = createMathComposition("pilot", {
      artifactVersion: "math-timing.v1",
      fps: 30,
      durationSeconds: 240,
      scenes,
    });
    expect([
      composition.width,
      composition.height,
      composition.durationInFrames,
    ]).toEqual([1920, 1080, 7200]);
  });
});
