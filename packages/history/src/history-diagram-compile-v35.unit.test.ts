import { describe, expect, it } from "vitest";
import {
  compileAbstractCausalDiagramV35,
  extractThematicCausalLabelsV35,
} from "./history-diagram-compile-v35.js";

const claim = (id: string, text: string) => ({
  id,
  claimKind: "causal" as const,
  materiality: "material" as const,
  normalizedProposition: text,
  narrationUnitIds: ["unit-1"],
  authorityMode: "trusted-script" as const,
  provenanceStatus: "trusted_input" as const,
  independentlyVerified: false,
  temporalQualifierIds: [],
  geographicQualifierIds: [],
  quantitativeQualifierIds: [],
  entityMentionIds: [],
  sourceSpanIds: [],
  uncertainty: [],
  rhetoricalRole: "assertion" as const,
});

describe("History V3.5 abstract causal diagram compile", () => {
  it("compiles zero-entity systems collapse narration into a causal diagram", () => {
    const text =
      "Drought, migration, trade disruption, and political instability combined to make collapse more likely.";
    const labels = extractThematicCausalLabelsV35(text);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    const compiled = compileAbstractCausalDiagramV35({
      beatNumber: "0030",
      text,
      claimIds: ["claim-1"],
      claims: [claim("claim-1", text)],
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.state.nodes.length).toBeGreaterThanOrEqual(2);
    expect(compiled!.state.nodes.every((node) => node.entityMentionIds.length === 0)).toBe(true);
  });

  it("compiles metanarrative causal beats without requiring entity labels", () => {
    const text =
      "The story warns us against a single dramatic explanation because the evidence is fragmented.";
    const compiled = compileAbstractCausalDiagramV35({
      beatNumber: "0017",
      text,
      claimIds: ["claim-2"],
      claims: [claim("claim-2", text)],
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.state.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(["fragmented evidence", "metanarrative caution"])
    );
  });

  it("rejects narration without enough thematic causal labels", () => {
    const compiled = compileAbstractCausalDiagramV35({
      beatNumber: "0001",
      text: "This is a short neutral sentence.",
      claimIds: ["claim-3"],
      claims: [claim("claim-3", "This is a short neutral sentence.")],
    });
    expect(compiled).toBeNull();
  });
});
