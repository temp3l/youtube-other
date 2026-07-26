import { describe, expect, it } from "vitest";

import {
  createChalkGlyphs,
  injectStableChalkMaterial,
  renderNaturalChalkText,
  segmentChalkGraphemes,
} from "./natural-chalk.js";
import { centerlineGlyphDefinition } from "./centerline-chalk-font.js";

describe("natural chalk text", () => {
  it("segments supported locale diacritics and Greek symbols by grapheme", () => {
    const text = "Ärger, français, español, português: α + β = 90°";
    const graphemes = segmentChalkGraphemes(text, "de");

    expect(graphemes).toContain("Ä");
    expect(graphemes).toContain("ç");
    expect(graphemes).toContain("ñ");
    expect(graphemes).toContain("ê");
    expect(graphemes).toContain("α");
    expect(graphemes).toContain("°");
  });

  it("selects reproducible bounded variants for repeated glyphs", () => {
    const first = createChalkGlyphs("0000 += 0000", "lesson-a");
    const second = createChalkGlyphs("0000 += 0000", "lesson-a");
    const changed = createChalkGlyphs("0000 += 0000", "lesson-b");

    expect(first).toEqual(second);
    expect(
      new Set(
        first
          .filter((glyph) => glyph.grapheme === "0")
          .map((glyph) => glyph.variant)
      ).size
    ).toBeGreaterThan(1);
    expect(changed).not.toEqual(first);
    expect(
      first
        .flatMap((glyph) => glyph.strokes)
        .every((stroke) => stroke.length > 0)
    ).toBe(true);
  });

  it("writes exactly one visible active glyph and fully hides pending glyphs", () => {
    const rendered = renderNaturalChalkText({
      openingTag: '<text x="100" y="200" fill="#f4efd8">',
      innerMarkup: "12 + 3 = 15",
      progress: 0.45,
      seed: "fixture",
    });

    expect(rendered).toContain('data-natural-chalk-text="true"');
    expect(rendered).toContain('data-centerline-chalk="true"');
    expect(rendered).toContain("stroke-dashoffset");
    expect(rendered).toContain("data-chalk-variant");
    expect(rendered.match(/data-chalk-state="active"/gu)).toHaveLength(1);
    expect(rendered).toMatch(
      /data-chalk-state="pending"[^>]*visibility="hidden"><\/g>/u
    );
    expect(rendered).toContain('data-chalk-grapheme=" "');
    expect(rendered).toContain('data-chalk-pass="body"');
    expect(rendered).toContain('data-chalk-pass="dust"');
    expect(rendered).not.toContain("<tspan");
    expect(rendered).not.toContain("paint-order");
    expect(rendered).not.toContain('stroke-dasharray="11 7"');
    expect(rendered).not.toContain("clip-path");
    expect(rendered).not.toContain("<rect");
  });

  it("provides centerline strokes for German text and lesson math symbols", () => {
    const required = segmentChalkGraphemes(
      "Wo gehören die Nullen hin? Straße ÄÖÜ 700.000 + 30.000 + 400 + 5 → √x × ÷ = %"
    ).filter((grapheme) => grapheme.trim() !== "");

    for (const grapheme of required) {
      const definition = centerlineGlyphDefinition(grapheme);
      expect(definition.paths.length, grapheme).toBeGreaterThan(0);
      expect(
        definition.paths.every((path) => path.length >= 2),
        grapheme
      ).toBe(true);
    }
  });

  it("uses one stable texture seed across deterministic rerenders", () => {
    const svg = "<svg><text>5</text></svg>";
    const first = injectStableChalkMaterial(svg, "fixture");
    const second = injectStableChalkMaterial(svg, "fixture");

    expect(first).toBe(second);
    expect(first.match(/feTurbulence/gu)).toHaveLength(1);
    expect(first).toContain('scale="0.8"');
    expect(first).not.toContain("chalk-dropout-mask");
    expect(first).toContain("[data-chalk-step] > path");
    expect(injectStableChalkMaterial(first, "fixture")).toBe(first);
  });
});
