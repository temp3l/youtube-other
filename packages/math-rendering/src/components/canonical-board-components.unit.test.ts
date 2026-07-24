import { describe, expect, it } from "vitest";

import { extractSemanticChalkSteps } from "../composition/semantic-chalk.js";
import { renderSemanticComponent } from "./math-components.js";

const integer = (value: string) => ({ kind: "integer" as const, value });

describe("canonical chalkboard components", () => {
  it("renders place-value digits, including internal zeroes, as sequenced chalk beats", () => {
    const rendered = renderSemanticComponent({
      kind: "place-value-chart",
      source: {
        factId: "example-main-source",
        expression: {
          kind: "sum",
          operands: [
            integer("700000"),
            integer("30000"),
            integer("400"),
            integer("5"),
          ],
        },
      },
    });

    expect(rendered.component).toBe("place-value-chart");
    expect(rendered.svg).toContain("= 730405</text>");
    expect(rendered.svg).toContain('data-chalk-step="place-digit-6"');
    expect(extractSemanticChalkSteps(rendered.svg).length).toBeGreaterThan(8);
  });

  it("renders the place-value quest with meaningful choices and a hidden challenge answer", () => {
    const source = {
      factId: "transfer-main-source",
      expression: {
        kind: "sum" as const,
        operands: [integer("600000"), integer("4000"), integer("70")],
      },
    };
    const practice = renderSemanticComponent({
      kind: "place-value-activity",
      mode: "practice",
      title: "Trainiere das Stellenraster",
      prompt: "Setze erst die Ziffern ein und sichere dann die Lücken.",
      values: [source],
    });
    const challenge = renderSemanticComponent({
      kind: "place-value-activity",
      mode: "challenge",
      title: "Jetzt bist du dran",
      prompt: "Fülle jedes Fach und prüfe deine Zahl.",
      values: [source],
    });

    expect(practice.factIds).toEqual(["transfer-main-source"]);
    expect(practice.svg).not.toContain(">604.070</text>");
    expect(practice.svg).toContain('data-chalk-step="quest-practice-digit-5"');
    expect(practice.svg).not.toContain(
      'data-chalk-step="quest-practice-digit-6"'
    );
    expect(challenge.svg).toContain(
      'data-chalk-step="quest-challenge-digit-5"'
    );
    expect(challenge.svg).not.toContain(">604.070</text>");
  });

  it("derives and labels the missing-zero misconception without treating it as a verified fact", () => {
    const rendered = renderSemanticComponent({
      kind: "place-value-activity",
      mode: "mistake",
      title: "Die Null bleibt am Platz",
      prompt: "Ohne Platzhalter rutschen die Ziffern zusammen.",
      values: [
        {
          factId: "example-main-answer",
          expression: integer("730405"),
        },
      ],
    });

    expect(rendered.factIds).toEqual(["example-main-answer"]);
    expect(rendered.svg).toContain('data-math-status="incorrect-derived"');
    expect(rendered.svg).toContain(">7.345</text>");
    expect(rendered.svg).toContain(">730.405</text>");
    expect(rendered.svg.indexOf('data-chalk-step="quest-mistake-wrong"')).toBeLessThan(
      rendered.svg.indexOf('data-chalk-step="quest-mistake-strike"')
    );
    expect(rendered.svg).not.toContain('rx="30"');
  });

  it("keeps the final retrieval board fact-free and leaves the answer open", () => {
    const rendered = renderSemanticComponent({
      kind: "place-value-activity",
      mode: "recap",
      title: "Abruffrage",
      prompt: "Erkläre das Verfahren ohne zurückzuschauen.",
      values: [],
    });

    expect(rendered.factIds).toEqual([]);
    expect(rendered.svg).toContain("Deine Erklärung:");
    expect(rendered.svg).toContain('data-chalk-step="quest-retrieval-line-3"');
    expect(rendered.svg).not.toContain("Erkläre das Verfahren ohne zurückzuschauen.");
    expect(rendered.svg).not.toContain("Stellen anlegen.");
    expect(rendered.svg).not.toContain("730.405");
    expect(extractSemanticChalkSteps(rendered.svg).length).toBeGreaterThan(6);
  });

  it("draws a tuple-bound rectangle edge by edge", () => {
    const rendered = renderSemanticComponent({
      kind: "geometry",
      shape: "rectangle",
      measurements: [
        {
          factId: "example-main-source",
          expression: {
            kind: "tuple",
            items: [integer("8"), integer("5")],
          },
        },
      ],
      scaleMode: "not-to-scale",
      visibleScaleLabel: "nicht maßstabsgetreu",
      accessibleDescription: "Rechteck mit Breite acht und Höhe fünf.",
    });

    expect(rendered.factIds).toEqual(["example-main-source"]);
    expect(rendered.svg).toContain('data-chalk-step="geometry-edge-top"');
    expect(rendered.svg).toContain(
      'data-chalk-step="geometry-perimeter-trace"'
    );
  });

  it("keeps multi-step fact cards below the heading with readable operators", () => {
    const rendered = renderSemanticComponent({
      kind: "fact-stack",
      title: "Beispiel",
      facts: [
        {
          kind: "scalar",
          factId: "source",
          expression: integer("730405"),
          display: "700000+30000+400+5",
        },
        {
          kind: "scalar",
          factId: "result",
          expression: integer("730405"),
          display: "730405",
        },
      ],
    });

    expect(rendered.svg).toContain(
      'data-chalk-box="270,240,1380,160"'
    );
    expect(rendered.svg).toContain("700000 + 30000 + 400 + 5");
  });

  it("uses five widely spaced ticks for large focused numbers", () => {
    const rendered = renderSemanticComponent({
      kind: "number-line-focus",
      focus: {
        factId: "focus",
        expression: {
          kind: "sum",
          operands: [integer("600000"), integer("4000"), integer("70")],
        },
      },
    });

    expect(
      rendered.svg.match(/data-chalk-step="number-tick-/gu)
    ).toHaveLength(5);
    expect(rendered.svg).toContain('x1="300" y1="505" x2="1620"');
  });

  it("rejects tally rows that differ from the verifier-bound dataset", () => {
    expect(() =>
      renderSemanticComponent({
        kind: "tally-table",
        dataset: {
          factId: "example-main-source",
          expression: {
            kind: "tuple",
            items: [integer("4"), integer("3"), integer("5")],
          },
        },
        rows: [
          {
            category: "Apfel",
            count: {
              factId: "example-category-apfel",
              expression: integer("4"),
            },
          },
          {
            category: "Birne",
            count: {
              factId: "example-category-birne",
              expression: integer("2"),
            },
          },
          {
            category: "Banane",
            count: {
              factId: "example-category-banane",
              expression: integer("5"),
            },
          },
        ],
      })
    ).toThrow(/differs from its verifier-bound dataset tuple/u);
  });
});
