import { describe, expect, it } from "vitest";
import { visualPlanSchema } from "../../src/contracts.js";
import { normalizeProfile } from "../../src/domain/profiles.js";
import { renderChalkAnimationFrames } from "../../src/renderers/chalk-animation.js";

describe("chalk speech timing", () => {
  it("reserves writing and completed-board inspection windows when explicitly synchronized", () => {
    const scene = visualPlanSchema.parse({
      version: "1",
      lessonId: "timed-lesson",
      locale: "en",
      title: "Equation",
      scenes: [{
        id: "equation",
        type: "equation",
        durationMs: 4_000,
        localeSensitivity: "timing-sensitive",
        equation: "3x+5=20",
        animation: {
          mode: "chalk-write",
          timing: {
            writingStartMs: 500,
            writingEndMs: 2_500,
            narrationStartMs: 300,
            narrationEndMs: 3_000,
            inspectionEndMs: 3_700,
            nextStepStartMs: 4_000,
            writingNarrationOverlap: true,
          },
        },
      }],
    }).scenes[0];
    if (!scene || (scene.type !== "equation" && scene.type !== "equation-transformation")) throw new Error("Expected equation scene.");
    const frames = renderChalkAnimationFrames(
      scene,
      normalizeProfile("preview"),
      "/tmp/font.woff2"
    );
    expect(frames[0]?.durationMs).toBe(500);
    expect(frames.at(-1)?.durationMs).toBe(1_500);
    expect(frames.reduce((sum, frame) => sum + frame.durationMs, 0)).toBeCloseTo(4_000, -2);
  });
});
