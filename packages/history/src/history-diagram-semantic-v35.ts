import type { HistoryClaimV34, HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import {
  EVIDENCE_BOUND_EDGE_BLOCKERS,
  usesEvidenceBoundDiagramValidationV35,
  validateDiagramEvidenceBoundEdgesV35,
} from "./history-diagram-evidence-v35.js";
import { validateDiagramTopologyV35 } from "./history-diagram-topology-v35.js";
import { validateDiagramSemanticsV34 } from "./history-visual-semantics-v34.js";

export function collectDiagramEvidenceClaimTextV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "evidenceClaimIds" | "nodes">;
  readonly claims: readonly Pick<HistoryClaimV34, "id" | "normalizedProposition">[];
}): string {
  const claimIds = input.state.evidenceClaimIds?.length
    ? input.state.evidenceClaimIds
    : [...new Set(input.state.nodes.flatMap((node) => node.linkedClaimIds))];
  return input.claims
    .filter((claim) => claimIds.includes(claim.id))
    .map((claim) => claim.normalizedProposition)
    .join("\n");
}

export function validateDiagramSemanticBlockersV35(input: {
  readonly state: Pick<
    HistoryDiagramStateV34,
    "masterId" | "nodes" | "edges" | "diagramType" | "evidenceClaimIds"
  >;
  readonly evidenceClaimText: string;
}): readonly string[] {
  const genericBlockers = [
    ...new Set([
      ...validateDiagramSemanticsV34({
        state: input.state as HistoryDiagramStateV34,
        linkedClaimText: input.evidenceClaimText,
      }),
      ...validateDiagramTopologyV35({
        state: input.state,
        linkedClaimText: input.evidenceClaimText,
      }),
    ]),
  ];

  if (!usesEvidenceBoundDiagramValidationV35(input.state)) {
    return genericBlockers;
  }

  const evidenceBoundBlockers = validateDiagramEvidenceBoundEdgesV35({
    state: input.state,
    evidenceClaimText: input.evidenceClaimText,
  });
  const filteredGenericBlockers = genericBlockers.filter(
    (blocker) => !EVIDENCE_BOUND_EDGE_BLOCKERS.has(blocker)
  );
  return [...new Set([...filteredGenericBlockers, ...evidenceBoundBlockers])];
}

export function finalizeDiagramSemanticStateV35(input: {
  readonly state: HistoryDiagramStateV34;
  readonly evidenceClaimText: string;
}): HistoryDiagramStateV34 {
  const blockerCodes = validateDiagramSemanticBlockersV35({
    state: input.state,
    evidenceClaimText: input.evidenceClaimText,
  });
  if (!blockerCodes.length) {
    return {
      ...input.state,
      semanticStatus: "valid",
      blockerCodes: [],
      fallbackDecision: null,
    };
  }
  return {
    ...input.state,
    semanticStatus: "blocked",
    blockerCodes,
    fallbackDecision: blockerCodes.includes("DIAGRAM_INSUFFICIENT_RELATIONSHIP_EVIDENCE")
      ? "insufficient-relationship-evidence"
      : input.state.fallbackDecision,
  };
}
