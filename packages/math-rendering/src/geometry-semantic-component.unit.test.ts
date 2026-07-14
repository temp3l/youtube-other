import { describe, expect, it } from "vitest";
import { renderSemanticComponent } from "./components/math-components.js";

const integer = (value: string) => ({ kind: "integer" as const, value });
const semanticGeometry = () => ({
  kind: "geometry" as const,
  shape: "rectangle" as const,
  measurements: [
    { factId: "width-fact", expression: integer("8") },
    { factId: "height-fact", expression: integer("5") },
  ],
  semanticLines: [
    { factId: "line-a", from: { x: integer("0"), y: integer("0") }, to: { x: integer("4"), y: integer("0") } },
    { factId: "line-b", from: { x: integer("0"), y: integer("2") }, to: { x: integer("4"), y: integer("2") } },
  ],
  relationClaims: [
    { factId: "parallel-fact", kind: "parallel" as const, lineFactIds: ["line-a", "line-b"] as const, colorIndependentCue: "gleiche Pfeilmarken" },
  ],
  scaleMode: "not-to-scale" as const,
  visibleScaleLabel: "nicht maßstabsgetreu" as const,
  accessibleDescription: "Rechteck mit zwei parallelen, durch Pfeilmarken gekennzeichneten Geraden.",
});

describe("semantic geometry component", () => {
  it("renders deterministic accessible relation cues and a visible non-scale label", () => {
    const first = renderSemanticComponent(semanticGeometry());
    const second = renderSemanticComponent(semanticGeometry());
    expect(second.svgHash).toBe(first.svgHash);
    expect(first.factIds).toEqual(expect.arrayContaining(["line-a", "line-b", "parallel-fact"]));
    expect(first.svg).toContain("<title>Rechteck mit zwei parallelen");
    expect(first.svg).toContain("parallel: gleiche Pfeilmarken");
    expect(first.svg).toContain("nicht maßstabsgetreu");
  });

  it("rejects missing non-scale disclosure and contradictory relation coordinates", () => {
    expect(() => renderSemanticComponent({ ...semanticGeometry(), visibleScaleLabel: undefined })).toThrow(/visible label/u);
    const falseClaim = semanticGeometry();
    falseClaim.semanticLines[1]!.to.y = integer("3");
    expect(() => renderSemanticComponent(falseClaim)).toThrow(/contradicts parallel/u);
  });
});
