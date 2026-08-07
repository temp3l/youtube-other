import { describe, expect, it } from "vitest";
import {
  buildDiagramEdgesV35,
  buildDiagramNodesV35,
  createDiagramCompilationRegistryV35,
  inferDiagramTopologyV35,
  validateDiagramTopologyV35,
  validateGeneratedStateIdentityV35,
} from "./history-diagram-topology-v35.js";
import type { HistoryDiagramStateV34 } from "./history-v34-contracts.js";

const claimIds = ["claim-1"];

function node(id: string, label: string) {
  return {
    id,
    label,
    linkedClaimIds: claimIds,
    entityMentionIds: [],
    role: "neutral" as const,
  };
}

describe("History V3.5 diagram topology", () => {
  it("rejects duplicate generated diagram-state IDs", () => {
    const failures = validateGeneratedStateIdentityV35({
      diagramStates: [
        { id: "diagram-state-0008" },
        { id: "diagram-state-0008" },
        { id: "diagram-state-0010" },
      ],
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DUPLICATE_GENERATED_STATE_ID",
          stateType: "diagram",
          stateId: "diagram-state-0008",
          occurrenceCount: 2,
        }),
      ])
    );
  });

  it("registry does not append the same state twice on retry", () => {
    const diagramMasters: Array<{ readonly id: string }> = [];
    const diagramStates: HistoryDiagramStateV34[] = [];
    const registry = createDiagramCompilationRegistryV35({ diagramMasters, diagramStates });
    const compiled = {
      master: { id: "diagram-master-test" },
      state: {
        id: "diagram-state-0008",
        masterId: "diagram-master-test",
        diagramType: "process" as const,
        exactQuestion: "test",
        nodes: [],
        edges: [],
        semanticStatus: "valid" as const,
        blockerCodes: [],
        fallbackDecision: null,
      },
    };
    registry.register(compiled);
    registry.register(compiled);
    expect(diagramStates).toHaveLength(1);
    expect(diagramMasters).toHaveLength(1);
  });

  it("infers parallel contributors for bronze inputs", () => {
    const text =
      "Copper from Cyprus and tin from distant regions were combined to make bronze.";
    const labels = ["copper from Cyprus", "tin from distant regions", "bronze production"];
    expect(inferDiagramTopologyV35({ labels, text })).toBe("parallel-contributors");
  });

  it("builds convergence edges instead of copper -> tin sequence", () => {
    const text =
      "Copper from Cyprus and tin from distant regions were combined to make bronze.";
    const labels = ["copper from Cyprus", "tin from distant regions", "bronze production"];
    const nodes = buildDiagramNodesV35({
      beatNumber: "0012",
      masterId: "diagram-master-bronze-age-trade-network",
      labels,
      claimIds,
    });
    const edges = buildDiagramEdgesV35({
      beatNumber: "0012",
      claimIds,
      text,
      nodes,
      topology: "parallel-contributors",
    });
    const byId = new Map(nodes.map((item) => [item.id, item.label]));
    const hasCopperToTin = edges.some((edge) => {
      const from = byId.get(edge.fromNodeId) ?? "";
      const to = byId.get(edge.toNodeId) ?? "";
      return /copper/iu.test(from) && /tin/iu.test(to);
    });
    expect(hasCopperToTin).toBe(false);
    expect(edges.some((edge) => /bronze production/iu.test(byId.get(edge.toNodeId) ?? ""))).toBe(
      true
    );
  });

  it("does not compile multiple pressures as an arbitrary linear chain", () => {
    const text =
      "Drought, trade disruption, earthquake disruption, and military fragmentation combined to weaken recovery capacity before systems collapse.";
    const labels = [
      "drought pressure",
      "trade network disruption",
      "earthquake disruption",
      "military fragmentation",
      "systems collapse",
    ];
    const nodes = buildDiagramNodesV35({
      beatNumber: "0030",
      masterId: "diagram-master-bronze-age-systems-collapse",
      labels,
      claimIds,
    });
    const edges = buildDiagramEdgesV35({
      beatNumber: "0030",
      claimIds,
      text,
      nodes,
      topology: "convergence",
    });
    expect(edges.every((edge) => edge.relationship !== "sequence")).toBe(true);
    expect(edges.length).toBeGreaterThanOrEqual(3);
  });

  it("flags outcome-before-cause direction conflicts", () => {
    const state: Pick<HistoryDiagramStateV34, "nodes" | "edges" | "diagramType"> = {
      diagramType: "process",
      nodes: [node("n1", "systems collapse"), node("n2", "drought pressure")],
      edges: [
        {
          id: "edge-1",
          fromNodeId: "n1",
          toNodeId: "n2",
          relationship: "sequence",
          linkedClaimIds: claimIds,
        },
      ],
    };
    expect(
      validateDiagramTopologyV35({
        state,
        linkedClaimText: state.nodes.map((item) => item.label).join(" "),
      })
    ).toContain("DIAGRAM_CAUSAL_DIRECTION_CONFLICT");
  });

  it("rejects extraction-order-only causal sequences", () => {
    const state: Pick<HistoryDiagramStateV34, "nodes" | "edges" | "diagramType"> = {
      diagramType: "process",
      nodes: [
        node("n1", "factor A"),
        node("n2", "factor B"),
        node("n3", "factor C"),
      ],
      edges: [
        {
          id: "e1",
          fromNodeId: "n1",
          toNodeId: "n2",
          relationship: "sequence",
          linkedClaimIds: claimIds,
        },
        {
          id: "e2",
          fromNodeId: "n2",
          toNodeId: "n3",
          relationship: "sequence",
          linkedClaimIds: claimIds,
        },
      ],
    };
    expect(
      validateDiagramTopologyV35({
        state,
        linkedClaimText: "Several pressures interacted without a strict order.",
      })
    ).toContain("DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE");
  });

  it("reports insufficient relationship evidence when edges are missing", () => {
    const state: Pick<HistoryDiagramStateV34, "nodes" | "edges" | "diagramType"> = {
      diagramType: "process",
      nodes: [node("n1", "factor A"), node("n2", "factor B")],
      edges: [],
    };
    expect(
      validateDiagramTopologyV35({
        state,
        linkedClaimText: "Two pressures are mentioned without a directed link.",
      })
    ).toContain("DIAGRAM_INSUFFICIENT_RELATIONSHIP_EVIDENCE");
  });
});
