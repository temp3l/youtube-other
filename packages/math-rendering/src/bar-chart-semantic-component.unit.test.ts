import { describe, expect, it } from "vitest";
import { renderSemanticComponent } from "./components/math-components.js";

const integer = (value: string) => ({ kind: "integer" as const, value });
const chart = () => ({
  kind: "bar-chart" as const,
  datasetHash: "a".repeat(64),
  verifierCheckId: "check-example-main",
  orientation: "column" as const,
  axis: {
    origin: { factId: "axis-origin", expression: integer("0") },
    maximum: { factId: "axis-maximum", expression: integer("8") },
    tickInterval: { factId: "axis-tick", expression: integer("2") },
    unitLabel: "Kinder",
  },
  bars: [
    { category: "Rot", categoryFactId: "category-rot", value: { factId: "bar-rot", expression: integer("4") }, pattern: "solid" as const },
    { category: "Blau", categoryFactId: "category-blau", value: { factId: "bar-blau", expression: integer("7") }, pattern: "diagonal" as const },
    { category: "Gruen", categoryFactId: "category-gruen", value: { factId: "bar-gruen", expression: integer("5") }, pattern: "dots" as const },
  ],
  accessibleEncoding: { colorIndependentCue: "Muster und sichtbare Werte", visibleValueLabels: true as const },
});

describe("dataset-bound bar-chart component", () => {
  it("renders deterministic visible labels, patterns, values, and fact bindings", () => {
    const first = renderSemanticComponent(chart());
    const second = renderSemanticComponent(chart());
    expect(second.svgHash).toBe(first.svgHash);
    expect(first.minimumGlyphPx).toBe(72);
    expect(first.factIds).toEqual(expect.arrayContaining(["axis-origin", "category-blau", "bar-blau"]));
    expect(first.svg).toContain("Muster und sichtbare Werte");
    expect(first.svg).toContain("url(#diagonal)");
    expect(first.svg).toContain(">Blau</text>");
    expect(first.svg).toContain(">7</text>");
  });

  it("rejects disconnected, misleading, malformed, and color-only charts", () => {
    expect(() => renderSemanticComponent({ ...chart(), datasetHash: undefined })).toThrow();
    const truncated = chart();
    truncated.axis.origin.expression = integer("2");
    expect(() => renderSemanticComponent(truncated)).toThrow(/start at zero/u);
    const duplicate = chart();
    duplicate.bars[1]!.category = "Rot";
    expect(() => renderSemanticComponent(duplicate)).toThrow(/unique/u);
    const negative = chart();
    negative.bars[0]!.value.expression = integer("-1");
    expect(() => renderSemanticComponent(negative)).toThrow(/non-negative/u);
    expect(() => renderSemanticComponent({ ...chart(), accessibleEncoding: { colorIndependentCue: "", visibleValueLabels: true } })).toThrow();
  });
});
