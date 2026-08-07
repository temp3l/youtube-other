import { describe, expect, it } from "vitest";
import {
  compileAbstractCausalDiagramV35,
  compileBronzeSystemsCollapseDiagramV35,
  compileBronzeTradeDiagramV35,
  extractThematicCausalLabelsV35,
} from "./history-diagram-compile-v35.js";
import { validateDiagramTopologyV35 } from "./history-diagram-topology-v35.js";

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

  it("compiles bronze trade as parallel contributors without copper -> tin", () => {
    const text =
      "Copper from Cyprus and tin from distant regions were combined to make bronze for palace trade networks.";
    const compiled = compileBronzeTradeDiagramV35({
      beatNumber: "0012",
      text,
      claimIds: ["claim-bronze"],
    });
    expect(compiled).not.toBeNull();
    const labels = new Map(compiled!.state.nodes.map((node) => [node.id, node.label]));
    const hasCopperToTin = compiled!.state.edges.some((edge) => {
      const from = labels.get(edge.fromNodeId) ?? "";
      const to = labels.get(edge.toNodeId) ?? "";
      return /copper/iu.test(from) && /tin/iu.test(to);
    });
    expect(hasCopperToTin).toBe(false);
    expect(compiled!.state.semanticStatus).toBe("valid");
  });

  it("compiles systems collapse with convergence and valid semantics", () => {
    const text =
      "Drought pressure, trade network disruption, earthquake disruption, military fragmentation, and palace administrative failure combined before systems collapse.";
    const compiled = compileBronzeSystemsCollapseDiagramV35({
      beatNumber: "0030",
      text,
      claimIds: ["claim-collapse"],
    });
    expect(compiled).not.toBeNull();
    const labels = new Map(compiled!.state.nodes.map((node) => [node.id, node.label]));
    const collapseBeforeCause = compiled!.state.edges.some((edge) => {
      const from = labels.get(edge.fromNodeId) ?? "";
      const to = labels.get(edge.toNodeId) ?? "";
      return /systems collapse/iu.test(from) && /drought|trade|earthquake|military|palace/iu.test(to);
    });
    expect(collapseBeforeCause).toBe(false);
    expect(
      validateDiagramTopologyV35({
        state: compiled!.state,
        linkedClaimText: text,
      })
    ).toEqual([]);
    expect(compiled!.state.semanticStatus).toBe("valid");
  });
});
