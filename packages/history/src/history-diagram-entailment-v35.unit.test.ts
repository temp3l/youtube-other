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
import {
  assessDiagramPropositionEdgeV35,
  diagramRelationshipCompatibilityV35,
} from "./history-diagram-proposition-v35.js";
import type { HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import { finalizeDiagramSemanticStateV35 } from "./history-diagram-semantic-v35.js";

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
    expect(blockers).toContain("DIAGRAM_RELATIONSHIP_TYPE_MISMATCH");
  });

  it("rejects an arbitrary A -> B pairing from a causal claim about different concepts", () => {
    const causalClaim = {
      ...claim(
        "c-arbitrary",
        "A was located in B while crop failure caused families to leave the region."
      ),
      claimKind: "causal" as const,
    };
    const result = assessDiagramPropositionEdgeV35({
      fromLabel: "A",
      toLabel: "B",
      relationship: "leads-to",
      linkedClaimIds: [causalClaim.id],
      claims: [causalClaim],
    });
    expect(result.entailed).toBe(false);
    expect(result.propositionRelations).toContain("located-in");
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
    expect(blockers).toContain("DIAGRAM_RELATIONSHIP_TYPE_MISMATCH");
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

  it("rejects unsupported Tutankhamun -> Egypt leads-to co-occurrence edges", () => {
    const text =
      "Tutankhamun is famous because his burial survived, not because he was the greatest Egyptian ruler.";
    const state = {
      id: "diagram-state-tut",
      masterId: "diagram-master-tut",
      diagramType: "causal-chain" as const,
      exactQuestion: "What caused Tutankhamun?",
      nodes: [
        {
          id: "n1",
          label: "Tutankhamun",
          linkedClaimIds: ["claim-tut"],
          entityMentionIds: [],
        },
        {
          id: "n2",
          label: "Egypt",
          linkedClaimIds: ["claim-tut"],
          entityMentionIds: [],
        },
      ],
      edges: [
        {
          id: "e1",
          fromNodeId: "n1",
          toNodeId: "n2",
          relationship: "leads-to" as const,
          linkedClaimIds: ["claim-tut"],
        },
      ],
      semanticStatus: "valid" as const,
      blockerCodes: [],
      fallbackDecision: null,
      evidenceClaimIds: ["claim-tut"],
    };
    const blockers = validateDiagramEntailmentV35({
      state,
      evidenceClaimText: text,
      claims: [claim("claim-tut", text)],
    });
    expect(blockers).toEqual(
      expect.arrayContaining(["DIAGRAM_UNGROUNDED_NODE", "DIAGRAM_UNSUPPORTED_EDGE"])
    );
  });

  it("allows normalized labour scarcity -> wage pressure mechanism edges", () => {
    const text =
      "After the demographic shock, survivors lacked workers and began to demand higher wages.";
    const blockers = validateDiagramEdgeEntailmentV35({
      state: {
        diagramType: "process",
        nodes: [
          { id: "n1", label: "labour scarcity", linkedClaimIds: ["claim-bd"], entityMentionIds: [] },
          { id: "n2", label: "wage pressure", linkedClaimIds: ["claim-bd"], entityMentionIds: [] },
        ],
        edges: [
          {
            id: "e1",
            fromNodeId: "n1",
            toNodeId: "n2",
            relationship: "depends-on",
            linkedClaimIds: ["claim-bd"],
          },
        ],
      },
      evidenceClaimText: text,
    });
    expect(blockers).toEqual([]);
  });

  it("grounds a normalized evidence node only through explicit source-component provenance", () => {
    const text =
      "Searchers found graves, abandoned equipment, human remains, and one written message.";
    const state: HistoryDiagramStateV34 = {
      id: "diagram-state-franklin-evidence",
      masterId: "diagram-master-franklin-evidence",
      diagramType: "evidence-set",
      exactQuestion: "What evidence categories does the narration support?",
      nodes: [
        {
          id: "n1",
          label: "graves/remains",
          linkedClaimIds: ["claim-franklin"],
          entityMentionIds: [],
          normalizedSupport: {
            normalizedLabel: "graves/remains",
            sourceConcepts: ["graves", "human remains"],
            supportClaimIds: ["claim-franklin"],
          },
        },
        {
          id: "n2",
          label: "abandoned equipment",
          linkedClaimIds: ["claim-franklin"],
          entityMentionIds: [],
        },
        {
          id: "n3",
          label: "written message",
          linkedClaimIds: ["claim-franklin"],
          entityMentionIds: [],
        },
      ],
      edges: [],
      semanticStatus: "valid",
      blockerCodes: [],
      fallbackDecision: null,
      evidenceClaimIds: ["claim-franklin"],
    };
    const finalized = finalizeDiagramSemanticStateV35({
      state,
      evidenceClaimText: text,
      claims: [claim("claim-franklin", text)],
    });
    expect(finalized.semanticStatus).toBe("valid");
    expect(finalized.blockerCodes).toEqual([]);
  });

  it("rejects normalized evidence nodes when any declared source component is absent", () => {
    const text = "Searchers found graves, abandoned equipment, and one written message.";
    const supported = isDiagramNodeSemanticallyEntailedV35({
      label: "graves/remains",
      evidenceClaimText: text,
      entitySpans: [],
      linkedClaimIds: ["claim-incomplete"],
      claims: [claim("claim-incomplete", text)],
      normalizedSupport: {
        normalizedLabel: "graves/remains",
        sourceConcepts: ["graves", "human remains"],
        supportClaimIds: ["claim-incomplete"],
      },
    });
    expect(supported).toBe(false);
  });

  it("supports reverse explanatory propositions where B varies because of exact A factors", () => {
    const text =
      "Exact totals vary because the force included reinforcements and units returning by different routes.";
    for (const factor of ["reinforcements", "different return routes"]) {
      const result = assessDiagramPropositionEdgeV35({
        fromLabel: factor,
        toLabel: "variation in army-size estimates",
        relationship: "contributes-to",
        evidenceClaimText: text,
      });
      expect(result.entailed, `${factor}: ${result.propositionRelations.join(",")}`).toBe(true);
      expect(result.propositionRelations).toContain("causal");
    }
  });

  it("keeps unsupported named-entity causal edges blocked", () => {
    const cases = [
      ["Pearl Harbor", "United States", "Pearl Harbor was a naval base of the United States."],
      ["Cleopatra", "Mark Antony", "Cleopatra and Mark Antony appear in the same account."],
    ] as const;
    for (const [fromLabel, toLabel, text] of cases) {
      const result = assessDiagramPropositionEdgeV35({
        fromLabel,
        toLabel,
        relationship: "leads-to",
        evidenceClaimText: text,
      });
      expect(result.entailed).toBe(false);
    }
  });

  it("blocks an evidence-set factor whose substantive components are incomplete", () => {
    const text = "Distance and supply-chain failure weakened the army.";
    const state: HistoryDiagramStateV34 = {
      id: "diagram-state-incomplete-supply",
      masterId: "diagram-master-incomplete-supply",
      diagramType: "evidence-set",
      exactQuestion: "Why did the campaign destroy the army?",
      nodes: [
        {
          id: "n1",
          label: "distance and supply-chain failure",
          linkedClaimIds: ["claim-supply"],
          entityMentionIds: [],
        },
        {
          id: "n2",
          label: "disease and hunger",
          linkedClaimIds: ["claim-supply"],
          entityMentionIds: [],
        },
      ],
      edges: [],
      semanticStatus: "valid",
      blockerCodes: [],
      fallbackDecision: null,
      evidenceClaimIds: ["claim-supply"],
    };
    const finalized = finalizeDiagramSemanticStateV35({
      state,
      evidenceClaimText: text,
      claims: [claim("claim-supply", text)],
    });
    expect(finalized.semanticStatus).toBe("blocked");
    expect(finalized.blockerCodes).toContain("DIAGRAM_UNGROUNDED_NODE");
  });

  it.each([
    ["A was located in B.", "located-in"],
    ["A happened before B.", "temporal-before"],
    ["A and B were both discussed.", "mentions-together"],
  ] as const)("does not convert %s evidence into a causal edge", (text, expectedRelation) => {
    const result = assessDiagramPropositionEdgeV35({
      fromLabel: "A",
      toLabel: "B",
      relationship: "causes",
      evidenceClaimText: text,
    });
    expect(result.entailed).toBe(false);
    expect(result.propositionRelations).toContain(expectedRelation);
  });

  it("uses an explicit exhaustive relationship compatibility table", () => {
    expect(diagramRelationshipCompatibilityV35("sequence")).toEqual(["temporal-before"]);
    expect(diagramRelationshipCompatibilityV35("causes")).toEqual(["causal"]);
    expect(diagramRelationshipCompatibilityV35("associated-with")).toEqual(["association"]);
  });
});
