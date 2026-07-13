import { describe, expect, it } from "vitest";
import { visualPlanSchema } from "../../src/contracts.js";
import { createSceneCacheKey } from "../../src/domain/cache-key.js";
import { normalizeProfile } from "../../src/domain/profiles.js";
import { resolveContained } from "../../src/infrastructure/files.js";
import { buildStaticSceneArgs } from "../../src/composition/ffmpeg.js";
import { normalizeFormula, validateFormula } from "../../src/renderers/svg.js";

const scene = { id: "equation", type: "equation", durationMs: 1_000, localeSensitivity: "language-neutral", equation: "3x+6=15" } as const;
describe("public contracts", () => {
  it("rejects duplicate scene IDs and non-finite graph coordinates", () => {
    expect(visualPlanSchema.safeParse({ version: "1", lessonId: "lesson", locale: "de", title: "Lesson", scenes: [scene, scene] }).success).toBe(false);
    expect(visualPlanSchema.safeParse({ version: "1", lessonId: "lesson", locale: "de", title: "Lesson", scenes: [{ id: "graph", type: "coordinate-graph", durationMs: 1_000, localeSensitivity: "language-neutral", xRange: [0, Number.POSITIVE_INFINITY], yRange: [0, 1], functions: [{ expression: "x", domain: [0, 1] }], points: [] }] }).success).toBe(false);
  });
  it.each(["preview", "draft", "youtube-full", "youtube-short"] as const)("normalizes %s", (name) => { const profile = normalizeProfile(name); expect(profile.width).toBeGreaterThan(0); expect(profile.frameRate).toBeGreaterThanOrEqual(15); });
  it("keeps cache keys stable and ignores locale for neutral scenes", () => {
    const input = { scene, profile: normalizeProfile("preview"), fontHash: "a".repeat(64), toolchainIdentity: "ffmpeg-test" };
    expect(createSceneCacheKey({ ...input, locale: "de" })).toBe(createSceneCacheKey({ ...input, locale: "en" }));
    expect(createSceneCacheKey({ ...input, locale: "de" })).not.toBe(createSceneCacheKey({ ...input, scene: { ...scene, durationMs: 2_000 }, locale: "de" }));
  });
  it("does not invalidate visual bytes for narration-only changes", () => { const input = { scene, profile: normalizeProfile("preview"), fontHash: "a".repeat(64), locale: "de", toolchainIdentity: "ffmpeg-test" }; expect(createSceneCacheKey(input)).toBe(createSceneCacheKey({ ...input, scene: { ...scene, narrationCue: { startMs: 0, endMs: 500 } } })); });
  it.each(["child/file", "nested/a/b", "."])("contains safe path %s", (candidate) => expect(resolveContained("/tmp/root", candidate)).toMatch(/^\/tmp\/root/u));
  it.each(["../escape", "/etc/passwd"])("rejects escaping path %s", (candidate) => expect(() => resolveContained("/tmp/root", candidate)).toThrow(/escapes/u));
  it("validates formulas conservatively", () => { expect(normalizeFormula("  x = 3  ")).toBe("x = 3"); expect(() => validateFormula("\\notacommand{")).toThrow(/unsupported or invalid/u); });
  it("builds FFmpeg arguments without a shell", () => { const args = buildStaticSceneArgs("input.svg", "output.mp4", 1_000, normalizeProfile("preview")); expect(args).toContain("libx264"); expect(args.at(-1)).toBe("output.mp4"); expect(args.join(" ")).not.toContain(";"); });
});
