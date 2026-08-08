import { describe, expect, it } from "vitest";
import {
  compileAbstractCausalDiagramV35,
  compileBronzeSystemsCollapseDiagramV35,
  compileBronzeTradeDiagramV35,
  extractThematicCausalLabelsV35,
  isClaimGroundedDiagramLabelV35,
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
      expect.arrayContaining(["fragmented evidence", "warns against dramatic explanation"])
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

  it("compiles an explicit because-while convergence without entity inference", () => {
    const text =
      "The position became a trap because commanders focused on the ground ahead while opposing forces attacked the supporting flanks.";
    const compiled = compileAbstractCausalDiagramV35({
      beatNumber: "0046",
      text,
      claimIds: ["claim-convergence"],
      claims: [claim("claim-convergence", text)],
    });
    expect(compiled?.state.semanticStatus).toBe("valid");
    expect(compiled?.state.nodes.map((node) => node.label)).toEqual([
      "commanders focused on the ground ahead",
      "opposing forces attacked the supporting flanks",
      "The position became a trap",
    ]);
    expect(compiled?.state.edges.every((edge) => edge.relationship === "contributes-to"))
      .toBe(true);
  });

  it("does not treat a concessive even-while clause as a second contributor", () => {
    const text =
      "Monument production can stop because a dynasty falls even while farmers, artisans, and families remain.";
    expect(
      compileAbstractCausalDiagramV35({
        beatNumber: "0027",
        text,
        claimIds: ["claim-concessive"],
        claims: [claim("claim-concessive", text)],
      })
    ).toBeNull();
  });

  it("does not emit cross-episode thematic labels without claim grounding", () => {
    const mayaText =
      "Maya palace administration weakened as regional resources shifted and local elites fragmented.";
    const labels = extractThematicCausalLabelsV35(mayaText);
    expect(labels).not.toContain("imperial resource cycle");
    expect(labels).not.toContain("intelligence and discipline");
    expect(isClaimGroundedDiagramLabelV35("imperial resource cycle", mayaText)).toBe(false);
  });

  it("extracts listed causal factors from claim text instead of generic templates", () => {
    const mongolText =
      "Its strength came from combining organization, mobility, intelligence, discipline, engineering, logistics, diplomacy, and terror into a coherent method of conquest.";
    const labels = extractThematicCausalLabelsV35(mongolText);
    expect(labels).toEqual(
      expect.arrayContaining(["organization", "mobility", "intelligence", "discipline"])
    );
    expect(labels).not.toContain("intelligence and discipline");
    expect(labels).not.toContain("command coordination");
  });

  it("builds contributor edges for combining-list Mongol logistics text", () => {
    const mongolText =
      "Its strength came from combining organization, mobility, intelligence, discipline, engineering, logistics, diplomacy, and terror into a coherent method of conquest.";
    const compiled = compileAbstractCausalDiagramV35({
      beatNumber: "0006",
      text: mongolText,
      claimIds: ["claim-1"],
      claims: [claim("claim-1", mongolText)],
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.state.edges.length).toBeGreaterThanOrEqual(1);
    expect(compiled!.state.nodes.at(-1)?.label).toBe("coherent method of conquest");
  });

  it("keeps thematic label extraction isolated across sequential calls", () => {
    const mayaLabels = extractThematicCausalLabelsV35(
      "Maya palace administration weakened as regional resources shifted."
    );
    const cleopatraLabels = extractThematicCausalLabelsV35(
      "Cleopatra negotiated with Rome while Antony assembled ships for Actium."
    );
    expect(mayaLabels).not.toContain("Black Sea trade contact");
    expect(cleopatraLabels).not.toContain("imperial resource cycle");
    expect(cleopatraLabels).not.toContain("Black Sea trade contact");
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
