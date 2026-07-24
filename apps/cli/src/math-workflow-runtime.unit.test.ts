import { describe, expect, it } from "vitest";

import {
  CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX,
  CANONICAL_SPEECH_WORST_CASE_MULTIPLIER,
  estimateCanonicalPaidSpeechCostMicros,
  selectCanonicalSemanticComponent,
} from "./math-workflow-runtime.js";

describe("canonical math workflow runtime", () => {
  it("meets the grades 5-7 minimum glyph size", () => {
    expect(CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX).toBeGreaterThanOrEqual(
      72
    );
  });

  it("budgets all three bounded speech attempts before provider execution", () => {
    expect(CANONICAL_SPEECH_WORST_CASE_MULTIPLIER).toBe(3);
    expect(
      estimateCanonicalPaidSpeechCostMicros({
        estimatedAudioSeconds: 240,
        inputCharacters: 5_000,
        providerRequests: 9,
      })
    ).toBe(225_000);
  });

  it("keeps a long single verified place-value expression out of table layout", () => {
    const component = selectCanonicalSemanticComponent(
      "place-value-chart",
      [
        {
          factId: "example-main-source",
          semantic: {
            kind: "scalar",
            expression: {
              kind: "sum",
              operands: [
                { kind: "integer", value: "700000" },
                { kind: "integer", value: "30000" },
                { kind: "integer", value: "400" },
                { kind: "integer", value: "5" },
              ],
            },
          },
          displayLatex: "700000+30000+400+5",
          checkIds: ["check-example-main"],
          lineage: {
            contentContractVersion: "lesson-content-contract.v1",
            sourceContentHash: "1".repeat(64),
            sourceTaskId: "example-main",
          },
        },
      ]
    );
    expect(component).toMatchObject({
      kind: "formula",
      value: { factId: "example-main-source" },
    });
  });

  it("does not forge a two-measurement rectangle from one tuple fact", () => {
    const component = selectCanonicalSemanticComponent("geometry", [
      {
        factId: "example-main-source",
        semantic: {
          kind: "scalar",
          expression: {
            kind: "tuple",
            items: [
              { kind: "integer", value: "8" },
              { kind: "integer", value: "5" },
            ],
          },
        },
        displayLatex: "8\\,\\mathrm{cm}\\times5\\,\\mathrm{cm}",
        checkIds: ["check-example-main"],
        lineage: {
          contentContractVersion: "lesson-content-contract.v1",
          sourceContentHash: "1".repeat(64),
          sourceTaskId: "example-main",
        },
      },
    ]);

    expect(component).toMatchObject({
      kind: "formula",
      value: {
        factId: "example-main-source",
        expression: { kind: "tuple" },
      },
    });
  });
});
