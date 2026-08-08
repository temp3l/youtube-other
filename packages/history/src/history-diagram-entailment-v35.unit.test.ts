import { describe, expect, it } from "vitest";
import { compileTopologyDiagramV35 } from "./history-diagram-compile-v35.js";
import { compileRomanImperialResourceCycleV35 } from "./history-diagram-evidence-v35.js";
import {
  filterAtomicDiagramEntityLabelsV35,
  isDiagramNodeSemanticallyEntailedV35,
  isProperNameFragmentNodeV35,
  validateDiagramEntailmentV35,
  validateDiagramEdgeEntailmentV35,
} from "./history-diagram-entailment-v35.js";
import type { HistoryDiagramStateV34 } from "./history-v34-contracts.js";

function claim(id: string, text: string) {
  return {
    id,
    claimKind: "other" as const,
    materiality: "material" as const,
    normalizedProposition: text,
    narrationUnitIds: [id],
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
  };
}

describe("History V3.5 diagram entailment", () => {
  it("blocks proper-name fragmentation for Pearl Harbor, Great Heathen Army, and Great Fire of London", () => {
    const cases = [
      {
        span: "Pearl Harbor",
        fragment: "Pearl",
        text: "The attack on Pearl Harbor shocked the United States.",
      },
      {
        span: "Great Heathen Army",
        fragment: "Heathen",
        text: "The Great Heathen Army landed in England.",
      },
      {
        span: "Great Fire of London",
        fragment: "London",
        text: "The Great Fire of London destroyed much of the city.",
      },
    ];
    for (const item of cases) {
      expect(
        isProperNameFragmentNodeV35({
          label: item.fragment,
          entitySpans: [item.span],
          evidenceClaimText: item.text,
        })
      ).toBe(true);
      expect(
        isDiagramNodeSemanticallyEntailedV35({
          label: item.fragment,
          evidenceClaimText: item.text,
          entitySpans: [item.span],
        })
      ).toBe(false);
    }
  });

  it("rejects unsupported military fragmentation abstractions", () => {
    const text =
      "Military estimates, diplomacy, uncertainty, institutional momentum, and assumptions about lives shaped the decision.";
    expect(
      isDiagramNodeSemanticallyEntailedV35({
        label: "military fragmentation",
        evidenceClaimText: text,
        entitySpans: [],
      })
    ).toBe(false);
  });

  it("rejects unsupported edges when A and B are present without relational evidence", () => {
    const text = "Europe, England, and King Edward appear in the succession crisis.";
    const blockers = validateDiagramEdgeEntailmentV35({
      state: {
        diagramType: "causal-chain",
        nodes: [
          { id: "n1", label: "Europe", linkedClaimIds: ["c1"], entityMentionIds: [] },
          { id: "n2", label: "England", linkedClaimIds: ["c1"], entityMentionIds: [] },
        ],
        edges: [
          {
            id: "e1",
            fromNodeId: "n1",
            toNodeId: "n2",
            relationship: "leads-to",
            linkedClaimIds: ["c1"],
          },
        ],
      },
      evidenceClaimText: text,
      entitySpans: ["Europe", "England", "King Edward"],
    });
    expect(blockers).toContain("DIAGRAM_UNSUPPORTED_EDGE");
  });

  it("does not treat chronology as causality for sequence edges", () => {
    const text = "Edward died first. Harold was crowned next. William invaded afterward.";
    const blockers = validateDiagramEdgeEntailmentV35({
      state: {
        diagramType: "process",
        nodes: [
          { id: "n1", label: "Edward", linkedClaimIds: ["c1"], entityMentionIds: [] },
          { id: "n2", label: "Harold", linkedClaimIds: ["c1"], entityMentionIds: [] },
        ],
        edges: [
          {
            id: "e1",
            fromNodeId: "n1",
            toNodeId: "n2",
            relationship: "causes",
            linkedClaimIds: ["c1"],
          },
        ],
      },
      evidenceClaimText: text,
    });
    expect(blockers).toContain("DIAGRAM_UNSUPPORTED_EDGE");
  });

  it("keeps valid causal process diagrams when claims explicitly support A -> B -> C", () => {
    const text =
      "Tax revenue funded armies and administration, which defended provinces and therefore helped continued revenue.";
    const compiled = compileRomanImperialResourceCycleV35({
      beatNumber: "0001",
      evidenceBeatIds: ["beat-0001"],
      evidenceClaimIds: ["claim-roman"],
      claims: [claim("claim-roman", text)],
    });
    expect(compiled?.state.semanticStatus).toBe("valid");
    expect(compiled?.state.blockerCodes).toEqual([]);
  });

  it("keeps valid convergence diagrams with explicit combined evidence", () => {
    const text =
      "Drought pressure, trade disruption, and political instability combined to make systems collapse more likely.";
    const compiled = compileTopologyDiagramV35({
      beatNumber: "0002",
      masterId: "diagram-master-bronze",
      diagramType: "causal-web",
      exactQuestion: "What systemic dependencies does the narration link to collapse?",
      labels: ["drought pressure", "trade disruption", "political instability", "systems collapse"],
      claimIds: ["claim-bronze"],
      text,
      claims: [claim("claim-bronze", text)],
      topology: "convergence",
    });
    expect(compiled.state.semanticStatus).toBe("valid");
    expect(compiled.state.blockerCodes).toEqual([]);
  });

  it("filters atomic entity labels during diagram concept extraction", () => {
    const text = "Forces attacked Pearl Harbor without warning.";
    const labels = filterAtomicDiagramEntityLabelsV35({
      labels: ["Pearl Harbor", "Pearl", "Harbor", "United States"],
      entitySpans: ["Pearl Harbor", "United States"],
      evidenceClaimText: text,
    });
    expect(labels).toContain("Pearl Harbor");
    expect(labels).toContain("United States");
    expect(labels).not.toContain("Pearl");
    expect(labels).not.toContain("Harbor");
  });

  it("marks invalid entity-soup diagrams as blocked after entailment validation", () => {
    const text =
      "Caesar illegally retained military command while leaving his province, which compounded the political crisis.";
    const state: HistoryDiagramStateV34 = {
      id: "diagram-state-caesar",
      masterId: "diagram-master-caesar",
      diagramType: "causal-chain",
      exactQuestion: text,
      nodes: [
        {
          id: "n1",
          label: "military fragmentation",
          linkedClaimIds: ["claim-caesar"],
          entityMentionIds: [],
        },
        {
          id: "n2",
          label: "command coordination",
          linkedClaimIds: ["claim-caesar"],
          entityMentionIds: [],
        },
      ],
      edges: [
        {
          id: "e1",
          fromNodeId: "n1",
          toNodeId: "n2",
          relationship: "leads-to",
          linkedClaimIds: ["claim-caesar"],
        },
      ],
      semanticStatus: "valid",
      blockerCodes: [],
      fallbackDecision: null,
      evidenceClaimIds: ["claim-caesar"],
    };
    const blockers = validateDiagramEntailmentV35({
      state,
      evidenceClaimText: text,
      claims: [claim("claim-caesar", text)],
    });
    expect(blockers).toContain("DIAGRAM_UNGROUNDED_NODE");
    expect(blockers).toContain("DIAGRAM_UNSUPPORTED_EDGE");
  });
});
