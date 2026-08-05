import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@mediaforge/math-education",
  async () => import("../../../packages/math-education/src/index.js")
);
vi.mock(
  "@mediaforge/math-rendering",
  async () => import("../../../packages/math-rendering/src/index.js")
);

import { selectCanonicalSemanticComponent } from "./math-workflow-runtime.js";

const comparisonFact = {
  factId: "example-main-source",
  semantic: {
    kind: "scalar" as const,
    expression: {
      kind: "relation" as const,
      operator: "lt" as const,
      left: { kind: "integer" as const, value: "478920" },
      right: { kind: "integer" as const, value: "479002" },
    },
  },
  displayLatex: "478920<479002",
  checkIds: ["check-example-main"],
  lineage: {
    contentContractVersion: "lesson-content-contract.v1" as const,
    sourceContentHash: "1".repeat(64),
    sourceTaskId: "example-main",
  },
};

describe("canonical math visual selection", () => {
  it.each(["number-line", "place-value-chart"] as const)(
    "keeps a comparison exact when %s cannot render a relation expression",
    (plannedComponent) => {
      const component = selectCanonicalSemanticComponent(
        plannedComponent,
        [comparisonFact],
        {
          title: "Modell",
          body: "Natürliche Zahlen vergleichen und ordnen",
          prompt: "Vergleiche Stelle für Stelle.",
          skillId: "M5-ZO-002",
          sceneFunction: "model",
        }
      );

      expect(component).toEqual({
        kind: "fact-stack",
        title: "Modell",
        facts: [
          {
            kind: "scalar",
            factId: "example-main-source",
            expression: comparisonFact.semantic.expression,
            display: "478920<479002",
          },
        ],
      });
    }
  );
});
