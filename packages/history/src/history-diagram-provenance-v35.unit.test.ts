import { describe, expect, it } from "vitest";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import {
  compileBronzeSystemsCollapseDiagramV35,
  compileBronzeTradeDiagramV35,
} from "./history-diagram-compile-v35.js";
import {
  assessDiagramProvenanceForPlanV35,
  validateDiagramEpisodeGroundingV35,
} from "./history-diagram-provenance-v35.js";
import { createDiagramCompilationRegistryV35 } from "./history-diagram-topology-v35.js";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  buildHistoryVisualPlanV35,
  buildSegmentationClustersV35,
  computeCanonicalBeatSegmentationSignatureV35,
} from "./visual-planner-v35.js";

const EPISODE_A = "history-youtube-history-10-video-story-pack-01-bronze-age-collapse";
const EPISODE_B =
  "history-youtube-history-30-video-story-pack-21-fall-of-constantinople";

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

describe("History V3.5 diagram provenance", () => {
  it("rejects bronze trade diagrams for Constantinople siege narration", () => {
    const text =
      "Mehmed's siege used ships moved over land into the Golden Horn while Byzantine defenses held the walls.";
    const claims = [claim("claim-constantinople", text)];
    const compiled = compileBronzeTradeDiagramV35({
      beatNumber: "0004",
      text,
      claimIds: ["claim-constantinople"],
      claims,
    });
    expect(compiled).toBeNull();
  });

  it("rejects unsupported systems-collapse nodes for Angkor-style narration", () => {
    const text =
      "Angkor's reservoirs failed and rival powers pressed the Khmer court, but the narration does not claim earthquake disruption.";
    const claims = [claim("claim-angkor", text)];
    const compiled = compileBronzeSystemsCollapseDiagramV35({
      beatNumber: "0008",
      text,
      claimIds: ["claim-angkor"],
      claims,
    });
    expect(compiled).toBeNull();
  });

  it("marks unsupported nodes as non-valid when forced into a diagram state", () => {
    const text = "Mehmed's fleet entered the Golden Horn.";
    const claims = [claim("claim-b", text)];
    const blockers = validateDiagramEpisodeGroundingV35({
      state: {
        id: "diagram-state-test",
        masterId: "diagram-master-test",
        diagramType: "process",
        exactQuestion: "How did Bronze Age trade networks interconnect the eastern Mediterranean?",
        nodes: [
          {
            id: "node-1",
            label: "copper from Cyprus",
            linkedClaimIds: ["claim-b"],
            entityMentionIds: [],
          },
        ],
        edges: [],
        semanticStatus: "valid",
        blockerCodes: [],
        fallbackDecision: null,
        evidenceClaimIds: ["claim-b"],
      },
      evidenceClaimText: text,
      claims,
    });
    expect(blockers).toContain("DIAGRAM_UNGROUNDED_NODE");
    expect(blockers).toContain("DIAGRAM_UNGROUNDED_QUESTION");
    expect(blockers).toContain("DIAGRAM_TEMPLATE_SEMANTIC_MISMATCH");
  });

  it("isolates diagram registry reuse across different claim windows", () => {
    const diagramMasters: Array<{ id: string }> = [];
    const diagramStates: Array<{
      id: string;
      masterId: string;
      diagramType: "process";
      exactQuestion: string;
      nodes: Array<{
        id: string;
        label: string;
        linkedClaimIds: string[];
        entityMentionIds: string[];
      }>;
      edges: [];
      semanticStatus: "valid";
      blockerCodes: [];
      fallbackDecision: null;
      evidenceClaimIds: string[];
    }> = [];
    const registry = createDiagramCompilationRegistryV35({ diagramMasters, diagramStates });
    const shared = {
      master: { id: "diagram-master-shared" },
      state: {
        id: "diagram-state-a",
        masterId: "diagram-master-shared",
        diagramType: "process" as const,
        exactQuestion: "What changed?",
        nodes: [
          {
            id: "node-a",
            label: "Cyprus trade",
            linkedClaimIds: ["claim-a"],
            entityMentionIds: [],
          },
        ],
        edges: [] as [],
        semanticStatus: "valid" as const,
        blockerCodes: [] as [],
        fallbackDecision: null,
        evidenceClaimIds: ["claim-a"],
      },
    };
    registry.register(shared);
    const second = registry.register({
      master: { id: "diagram-master-shared" },
      state: {
        ...shared.state,
        id: "diagram-state-b",
        evidenceClaimIds: ["claim-b"],
        nodes: [
          {
            id: "node-b",
            label: "Cyprus trade",
            linkedClaimIds: ["claim-b"],
            entityMentionIds: [],
          },
        ],
      },
    });
    expect(second.reused).toBe(false);
    expect(diagramStates).toHaveLength(2);
  });

  it("keeps episode B free of episode A bronze semantics after sequential planning", () => {
    const narrationA = normalizeHistoryNarrationV33({
      episodeId: EPISODE_A,
      rawScript:
        "Copper from Cyprus and tin from distant regions were combined to make bronze for palace trade networks.",
    });
    const structuredA = structureTrustedScriptClaimsV34({
      episodeId: EPISODE_A,
      narration: narrationA,
      authorityMode: "trusted-script",
    });
    buildHistoryVisualPlanV35({
      episodeId: EPISODE_A,
      title: "Bronze Age",
      narration: narrationA,
      authorityMode: "trusted-script",
      structuredClaims: structuredA,
    });

    const narrationB = normalizeHistoryNarrationV33({
      episodeId: EPISODE_B,
      rawScript:
        "Ottoman forces dragged ships overland toward the Golden Horn while Byzantine defenders held the walls of Constantinople.",
    });
    const structuredB = structureTrustedScriptClaimsV34({
      episodeId: EPISODE_B,
      narration: narrationB,
      authorityMode: "trusted-script",
    });
    const planB = buildHistoryVisualPlanV35({
      episodeId: EPISODE_B,
      title: "Constantinople",
      narration: narrationB,
      authorityMode: "trusted-script",
      structuredClaims: structuredB,
    });
    const labels = planB.diagramStates.flatMap((state) => state.nodes.map((node) => node.label));
    expect(labels.join(" ")).not.toMatch(/copper from Cyprus|tin from distant|bronze production/i);
    const audit = assessDiagramProvenanceForPlanV35(planB);
    expect(audit.crossEpisodeClaimReferences).toBe(0);
    expect(audit.ungroundedValidNodes).toBe(0);
    expect(audit.ungroundedValidQuestions).toBe(0);
  });
});

describe("History V3.5 canonical beat segmentation ownership", () => {
  it("preserves canonical segmentation signature through visual planning", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: EPISODE_A,
      rawScript:
        "Armies marched across Anatolia while fleets sailed toward Cyprus. The invasion campaign crossed trade routes from Mycenae to the Levant.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: EPISODE_A,
      narration,
      authorityMode: "trusted-script",
    });
    const before = computeCanonicalBeatSegmentationSignatureV35(
      buildSegmentationClustersV35({ narration, structured })
    );
    const plan = buildHistoryVisualPlanV35({
      episodeId: EPISODE_A,
      title: "Bronze Age",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    const after = computeCanonicalBeatSegmentationSignatureV35(
      buildSegmentationClustersV35({ narration, structured })
    );
    expect(after).toBe(before);
    expect(plan.beats.length).toBe(before.split("|").length);
  });
});
