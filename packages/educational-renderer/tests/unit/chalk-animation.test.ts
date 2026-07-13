import { describe, expect, it } from "vitest";
import { normalizeProfile } from "../../src/domain/profiles.js";
import { createSceneCacheKey } from "../../src/domain/cache-key.js";
import { renderChalkAnimationFrames } from "../../src/renderers/chalk-animation.js";

const animatedScene = { id: "equation", type: "equation" as const, durationMs: 1_500, localeSensitivity: "language-neutral" as const, equation: "3x+6=15", animation: { mode: "chalk-write" as const } };

describe("chalk animation", () => {
  it("renders deterministic partial frames with a visible tip and an incomplete first frame", () => {
    const frames = renderChalkAnimationFrames(animatedScene, normalizeProfile("preview"), "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
    expect(frames.length).toBeGreaterThan(5);
    expect(frames[0]?.svg).toContain("<circle cx=\"34\"");
    expect(frames[0]?.svg).not.toContain(">1</text>");
    expect(frames.at(-1)?.svg).toContain(">5</text>");
    expect(frames).toEqual(renderChalkAnimationFrames(animatedScene, normalizeProfile("preview"), "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"));
    expect(frames.reduce((sum, frame) => sum + frame.durationMs, 0)).toBe(animatedScene.durationMs);
  });
  it("separates animated and static cache identities", () => {
    const profile = normalizeProfile("preview");
    const base = { profile, locale: "de", fontHash: "a".repeat(64), toolchainIdentity: "ffmpeg-test" };
    expect(createSceneCacheKey({ ...base, scene: animatedScene })).not.toBe(createSceneCacheKey({ ...base, scene: { ...animatedScene, animation: undefined } }));
  });
});
