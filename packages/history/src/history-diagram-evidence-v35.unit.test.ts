import { describe, expect, it } from "vitest";
import {
  compileBlackDeathLabourConsequenceDiagramV35,
  compileBlackDeathLabourPolicyDiagramV35,
  compileBlackDeathTransmissionDiagramV35,
  compileRomanImperialResourceCycleV35,
  extractBlackDeathTransmissionLabelsV35,
  isBlackDeathTransmissionTextV35,
  resolveDiagramEvidenceWindowV35,
  ROMAN_IMPERIAL_RESOURCE_CYCLE_MASTER,
} from "./history-diagram-evidence-v35.js";
import {
  finalizeDiagramSemanticStateV35,
  validateDiagramSemanticBlockersV35,
} from "./history-diagram-semantic-v35.js";
import {
  assessPlanningAcceptanceV35,
  listUnexpectedPlanningProductionBlockersV35,
} from "./history-planning-acceptance-v35.js";

const claim = (id: string, text: string) => ({
  id,
  normalizedProposition: text,
});

describe("History V3.5 diagram evidence windows", () => {
  it("builds a Roman fiscal stage without unsupported cycle edges", () => {
    const claims = [
      claim("c1", "Provinces paid taxes."),
      claim("c2", "Taxes funded armies and administration."),
    ];
    const compiled = compileRomanImperialResourceCycleV35({
      beatNumber: "0009",
      evidenceBeatIds: ["beat-0009"],
      evidenceClaimIds: ["c1", "c2"],
      claims,
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.state.nodes.map((node) => node.label)).toEqual([
      "tax revenue",
      "armies and administration",
    ]);
    expect(compiled!.state.edges).toHaveLength(1);
    expect(compiled!.state.semanticStatus, compiled!.state.blockerCodes.join(", ")).toBe("valid");
    expect(
      validateDiagramSemanticBlockersV35({
        state: compiled!.state,
        evidenceClaimText: claims.map((item) => item.normalizedProposition).join("\n"),
      })
    ).toEqual([]);
  });

  it("extends Roman cycle only when adjacent beats are explicitly bound", () => {
    const claims = [
      claim("c1", "Provinces paid taxes."),
      claim("c2", "Taxes funded armies and administration."),
      claim("c3", "Armies defended provinces and supported emperors."),
      claim("c4", "Trade, law, roads, cities, and local elites helped the system reproduce itself."),
    ];
    const window = resolveDiagramEvidenceWindowV35({
      beatId: "beat-0010",
      claimIds: ["c3", "c4"],
      text: claims[2]!.normalizedProposition,
      priorBeat: {
        id: "beat-0009",
        claimIds: ["c1", "c2"],
        diagramMasterId: ROMAN_IMPERIAL_RESOURCE_CYCLE_MASTER,
      },
    });
    const compiled = compileRomanImperialResourceCycleV35({
      beatNumber: "0010",
      evidenceBeatIds: window!.beatIds,
      evidenceClaimIds: window!.claimIds,
      claims,
    });
    expect(compiled!.state.nodes.map((node) => node.label)).toEqual([
      "tax revenue",
      "armies and administration",
      "provincial control",
      "continued revenue",
    ]);
    expect(compiled!.state.semanticStatus).toBe("valid");
    expect(compiled!.state.blockerCodes).not.toContain("DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE");
  });

  it("does not let future Roman evidence retroactively validate an earlier stage", () => {
    const early = compileRomanImperialResourceCycleV35({
      beatNumber: "0009",
      evidenceBeatIds: ["beat-0009"],
      evidenceClaimIds: ["c1", "c2"],
      claims: [
        claim("c1", "Provinces paid taxes."),
        claim("c2", "Taxes funded armies and administration."),
        claim("c3", "Armies defended provinces and supported emperors."),
      ],
    });
    expect(early!.state.edges).toHaveLength(1);
    expect(early!.state.nodes).toHaveLength(2);
  });

  it("binds Black Death labour consequences to supporting narration", () => {
    const claims = [
      claim("c1", "When the first great wave receded, the demographic shock transformed labor."),
      claim("c2", "Workshops lost apprentices."),
      claim("c3", "Survivors could demand higher wages or better terms."),
    ];
    const compiled = compileBlackDeathLabourConsequenceDiagramV35({
      beatNumber: "0031",
      evidenceBeatIds: ["beat-0030", "beat-0031"],
      evidenceClaimIds: ["c1", "c2", "c3"],
      claims,
    });
    expect(compiled!.state.semanticStatus).toBe("valid");
    expect(compiled!.state.edges.length).toBeGreaterThanOrEqual(2);
  });

  it("introduces labour policy response only on statute narration", () => {
    const compiled = compileBlackDeathLabourPolicyDiagramV35({
      beatNumber: "0033",
      evidenceBeatIds: ["beat-0031", "beat-0033"],
      evidenceClaimIds: ["c-wage", "c-policy"],
      claims: [
        claim("c-wage", "Survivors could demand higher wages or better terms."),
        claim(
          "c-policy",
          "In England, the Ordinance and Statute of Labourers attempted to restrict wages and compel work at pre-plague rates."
        ),
      ],
    });
    expect(compiled!.state.nodes.map((node) => node.label)).toEqual([
      "wage pressure",
      "labour policy response",
      "wage restriction attempt",
    ]);
    expect(compiled!.state.semanticStatus).toBe("valid");
  });

  it("propagates semantic blockers into diagram state", () => {
    const finalized = finalizeDiagramSemanticStateV35({
      state: {
        id: "diagram-state-test",
        masterId: "diagram-master-test",
        diagramType: "process",
        exactQuestion: "test",
        nodes: [
          {
            id: "n1",
            label: "tax revenue",
            linkedClaimIds: ["c1"],
            entityMentionIds: [],
          },
          {
            id: "n2",
            label: "armies and administration",
            linkedClaimIds: ["c1"],
            entityMentionIds: [],
          },
          {
            id: "n3",
            label: "provincial control",
            linkedClaimIds: ["c1"],
            entityMentionIds: [],
          },
        ],
        edges: [
          {
            id: "e1",
            fromNodeId: "n1",
            toNodeId: "n2",
            relationship: "sequence",
            linkedClaimIds: ["c1"],
          },
          {
            id: "e2",
            fromNodeId: "n2",
            toNodeId: "n3",
            relationship: "sequence",
            linkedClaimIds: ["c1"],
          },
        ],
        semanticStatus: "valid",
        blockerCodes: [],
        fallbackDecision: null,
        evidenceClaimIds: ["c1"],
      },
      evidenceClaimText: "Provinces paid taxes.",
    });
    expect(finalized.semanticStatus).toBe("blocked");
    expect(finalized.blockerCodes).toContain("DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE");
  });

  it("does not compile Black Death transmission labels for Cleopatra naval claims", () => {
    const actiumText =
      "Antony and Cleopatra assembled a large fleet of ships while disease spread through the camp before the battle at Actium.";
    expect(isBlackDeathTransmissionTextV35(actiumText)).toBe(false);
    expect(extractBlackDeathTransmissionLabelsV35(actiumText)).toEqual([]);
    const compiled = compileBlackDeathTransmissionDiagramV35({
      beatNumber: "0012",
      evidenceBeatIds: ["beat-0012"],
      evidenceClaimIds: ["c-actium"],
      claims: [claim("c-actium", actiumText)],
    });
    expect(compiled).toBeNull();
  });

  it("requires plague-specific evidence for Black Death transmission nodes", () => {
    const plagueText =
      "In October 1347 ships arrived at Messina in Sicily from the Black Sea, and plague spread along trade routes.";
    expect(isBlackDeathTransmissionTextV35(plagueText)).toBe(true);
    const compiled = compileBlackDeathTransmissionDiagramV35({
      beatNumber: "0008",
      evidenceBeatIds: ["beat-0008"],
      evidenceClaimIds: ["c-plague"],
      claims: [claim("c-plague", plagueText)],
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.state.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining([
        "Black Sea trade contact",
        "port arrival at Messina",
        "trade-route spread",
      ])
    );
    expect(compiled!.state.nodes.map((node) => node.label)).not.toContain("flea and rat transmission");
  });

  it("does not infer imperial resource cycle labels for Maya administration claims", () => {
    const mayaText =
      "Maya palace administration weakened as regional resources shifted and local elites fragmented.";
    const compiled = compileRomanImperialResourceCycleV35({
      beatNumber: "0015",
      evidenceBeatIds: ["beat-0015"],
      evidenceClaimIds: ["c-maya"],
      claims: [claim("c-maya", mayaText)],
    });
    expect(compiled).toBeNull();
  });
});

describe("History V3.5 planning acceptance", () => {
  it("allows timing-only planning blockers", () => {
    expect(listUnexpectedPlanningProductionBlockersV35(["TIMING_MEASUREMENT_REQUIRED"])).toEqual(
      []
    );
  });

  it("fails planning acceptance when diagram blockers remain", () => {
    expect(
      listUnexpectedPlanningProductionBlockersV35([
        "TIMING_MEASUREMENT_REQUIRED",
        "DIAGRAM_UNSUPPORTED_EDGE",
      ])
    ).toEqual(["DIAGRAM_UNSUPPORTED_EDGE"]);
  });

  it("scopes expected blockers to planning stage only", () => {
    const assessment = assessPlanningAcceptanceV35({
      timing: { timingSource: "provisional-text-estimate" },
      approval: {
        production: { blockerCodes: ["TIMING_MEASUREMENT_REQUIRED"] },
      },
    } as never);
    expect(assessment.passes).toBe(true);
    expect(assessment.unexpectedProductionBlockers).toEqual([]);
  });
});
