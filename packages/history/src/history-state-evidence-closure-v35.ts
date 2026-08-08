import type { HistoryDiagramStateV34, HistoryMapStateV34, HistoryShotV34 } from "./history-v34-contracts.js";

export function collectStructuredStateEvidenceClaimIdsV35(
  state:
    | Pick<HistoryDiagramStateV34, "evidenceClaimIds" | "nodes">
    | Pick<HistoryMapStateV34, "labels" | "compilerResolution">
): readonly string[] {
  if ("evidenceClaimIds" in state && state.evidenceClaimIds?.length) {
    return state.evidenceClaimIds;
  }
  if ("nodes" in state) {
    return [...new Set(state.nodes.flatMap((node) => node.linkedClaimIds))];
  }
  if ("labels" in state) {
    const claimIds = new Set<string>();
    for (const label of state.labels) {
      for (const claimId of label.linkedClaimIds) claimIds.add(claimId);
    }
    for (const claimId of state.compilerResolution?.scopeClaimIds ?? []) {
      claimIds.add(claimId);
    }
    return [...claimIds];
  }
  return [];
}

export function extractFactualClaimIdsFromShotV35(
  shot: Pick<HistoryShotV34, "factualLabels">
): readonly string[] {
  return shot.factualLabels.filter((label) => label.startsWith("claim-"));
}

export function validateStateBoundShotEvidenceClosureV35(input: {
  readonly shot: Pick<HistoryShotV34, "id" | "beatId" | "factualLabels" | "modalityStateReference">;
  readonly state:
    | Pick<HistoryDiagramStateV34, "id" | "evidenceClaimIds" | "nodes">
    | Pick<HistoryMapStateV34, "id" | "labels" | "compilerResolution">
    | null
    | undefined;
}): readonly {
  readonly code: "STATE_BOUND_SHOT_UNSUPPORTED_CLAIM";
  readonly shotId: string;
  readonly stateId: string;
  readonly unsupportedClaimIds: readonly string[];
}[] {
  if (!input.state) return [];
  const supported = new Set(collectStructuredStateEvidenceClaimIdsV35(input.state));
  const unsupportedClaimIds = extractFactualClaimIdsFromShotV35(input.shot).filter(
    (claimId) => !supported.has(claimId)
  );
  if (!unsupportedClaimIds.length) return [];
  return [
    {
      code: "STATE_BOUND_SHOT_UNSUPPORTED_CLAIM",
      shotId: input.shot.id,
      stateId: input.state.id,
      unsupportedClaimIds,
    },
  ];
}

export function validatePlanStateEvidenceClosureV35(input: {
  readonly shots: readonly Pick<
    HistoryShotV34,
    "id" | "beatId" | "factualLabels" | "modalityStateReference"
  >[];
  readonly diagramStates: readonly Pick<
    HistoryDiagramStateV34,
    "id" | "evidenceClaimIds" | "nodes"
  >[];
  readonly mapStates: readonly Pick<
    HistoryMapStateV34,
    "id" | "labels" | "compilerResolution"
  >[];
}): readonly ReturnType<typeof validateStateBoundShotEvidenceClosureV35>[number][] {
  const diagramById = new Map(input.diagramStates.map((state) => [state.id, state] as const));
  const mapById = new Map(input.mapStates.map((state) => [state.id, state] as const));
  const failures: Array<ReturnType<typeof validateStateBoundShotEvidenceClosureV35>[number]> = [];
  for (const shot of input.shots) {
    const ref = shot.modalityStateReference;
    if (!ref) continue;
    const diagramState = diagramById.get(ref);
    const mapState = mapById.get(ref);
    if (!diagramState && !mapState) continue;
    failures.push(
      ...validateStateBoundShotEvidenceClosureV35({
        shot,
        state: diagramState ?? mapState,
      })
    );
  }
  return failures;
}
