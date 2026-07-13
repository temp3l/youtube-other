import { describe, expect, it } from "vitest";
import { normalizeProfile } from "../../src/domain/profiles.js";
import { createSceneCacheKey } from "../../src/domain/cache-key.js";
import { renderFormulaSvg, validateFormula } from "../../src/renderers/formula-svg.js";

describe("native SVG formula renderer", () => {
  it("lays out fractions, roots, powers, subscripts, and German-school operators deterministically", () => {
    const formula = "\\frac{x_1^2+3\\cdot x}{\\sqrt{4}}\\leq 9";
    const first = renderFormulaSvg(formula, 480, 270, 64, 700);
    expect(first).toBe(renderFormulaSvg(formula, 480, 270, 64, 700));
    expect(first).toContain("<path");
    expect(first).toContain("≤");
    expect(first).not.toContain("foreignObject");
  });
  it("supports escaped text and rejects unsupported or untrusted markup with a stable error", () => {
    expect(() => validateFormula("\\text{Lösung}\\neq x" )).not.toThrow();
    for (const formula of ["\\href{https://example.test}{x}", "<script>"]) {
      try { validateFormula(formula); throw new Error("Expected formula rejection."); }
      catch (error) { expect(error).toMatchObject({ data: { code: "INVALID_FORMULA" } }); }
    }
  });
  it("changes only formula scene identity when its formula changes", () => {
    const profile = normalizeProfile("preview");
    const base = { id: "equation", type: "equation" as const, durationMs: 1000, localeSensitivity: "language-neutral" as const, equation: "x=3" };
    const key = (scene = base) => createSceneCacheKey({ scene, profile, locale: "de", fontHash: "a".repeat(64), toolchainIdentity: "ffmpeg test" });
    expect(key()).not.toBe(key({ ...base, equation: "x=4" }));
    expect(key()).toBe(key());
  });
});
