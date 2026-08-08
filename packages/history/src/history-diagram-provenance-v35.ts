import type { HistoryClaimV34, HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";
import { validateDiagramEntailmentV35 } from "./history-diagram-entailment-v35.js";
import { isClaimGroundedDiagramLabelV35 } from "./history-diagram-compile-v35.js";
import { collectDiagramEvidenceClaimTextV35 } from "./history-diagram-semantic-v35.js";

export const DIAGRAM_PROVENANCE_BLOCKERS_V35 = [
  "DIAGRAM_CROSS_EPISODE_CLAIM_REFERENCE",
  "DIAGRAM_UNGROUNDED_NODE",
  "DIAGRAM_UNGROUNDED_QUESTION",
  "DIAGRAM_TEMPLATE_SEMANTIC_MISMATCH",
] as const;

export type DiagramProvenanceBlockerV35 =
  (typeof DIAGRAM_PROVENANCE_BLOCKERS_V35)[number];

const BRONZE_TRADE_MASTER = "diagram-master-bronze-age-trade-network";
const BRONZE_COLLAPSE_MASTER = "diagram-master-bronze-age-systems-collapse";

const BRONZE_TRADE_QUESTION =
  "How did Bronze Age trade networks interconnect the eastern Mediterranean?";
const BRONZE_COLLAPSE_QUESTION =
  "What systemic dependencies does the narration link to collapse?";

function episodeClaimIds(claims: readonly HistoryClaimV34[]): ReadonlySet<string> {
  return new Set(claims.map((claim) => claim.id));
}

function resolveEvidenceClaimIds(
  state: Pick<HistoryDiagramStateV34, "evidenceClaimIds" | "nodes">
): readonly string[] {
  return state.evidenceClaimIds?.length
    ? state.evidenceClaimIds
    : [...new Set(state.nodes.flatMap((node) => node.linkedClaimIds))];
}

export function validateDiagramClaimProvenanceV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "evidenceClaimIds" | "nodes" | "edges">;
  readonly claims: readonly HistoryClaimV34[];
}): readonly DiagramProvenanceBlockerV35[] {
  const allowed = episodeClaimIds(input.claims);
  const blockers = new Set<DiagramProvenanceBlockerV35>();
  for (const claimId of resolveEvidenceClaimIds(input.state)) {
    if (!allowed.has(claimId)) blockers.add("DIAGRAM_CROSS_EPISODE_CLAIM_REFERENCE");
  }
  for (const node of input.state.nodes) {
    for (const claimId of node.linkedClaimIds) {
      if (!allowed.has(claimId)) blockers.add("DIAGRAM_CROSS_EPISODE_CLAIM_REFERENCE");
    }
  }
  for (const edge of input.state.edges) {
    for (const claimId of edge.linkedClaimIds) {
      if (!allowed.has(claimId)) blockers.add("DIAGRAM_CROSS_EPISODE_CLAIM_REFERENCE");
    }
  }
  return [...blockers];
}

const GUARDED_TEMPLATE_LABELS = new Set([
  "drought pressure",
  "harvest stress",
  "migration pressure",
  "armed conflict",
  "trade disruption",
  "political instability",
  "palace administrative failure",
  "systems collapse",
  "Bronze Age collapse",
  "regional interdependence",
  "writing loss",
  "iron versus bronze",
  "earthquake disruption",
  "military fragmentation",
  "copper from Cyprus",
  "tin from distant regions",
  "bronze production",
  "palace trade networks",
  "imperial resource cycle",
  "intelligence and discipline",
  "command coordination",
]);

export function isGuardedDiagramTemplateLabelV35(label: string): boolean {
  return GUARDED_TEMPLATE_LABELS.has(label);
}

export function validateDiagramNodeGroundingV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "masterId" | "nodes" | "exactQuestion">;
  readonly evidenceClaimText: string;
}): readonly DiagramProvenanceBlockerV35[] {
  const blockers: DiagramProvenanceBlockerV35[] = [];
  const strictMaster =
    input.state.masterId.includes("bronze-age") ||
    /bronze age trade networks|systemic dependencies does the narration link to collapse/iu.test(
      input.state.exactQuestion
    );
  for (const node of input.state.nodes) {
    if (!strictMaster && !isGuardedDiagramTemplateLabelV35(node.label)) continue;
    if (!isClaimGroundedDiagramLabelV35(node.label, input.evidenceClaimText)) {
      blockers.push("DIAGRAM_UNGROUNDED_NODE");
    }
  }
  return blockers;
}

export function validateDiagramQuestionGroundingV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "exactQuestion" | "masterId">;
  readonly evidenceClaimText: string;
}): readonly DiagramProvenanceBlockerV35[] {
  const blockers: DiagramProvenanceBlockerV35[] = [];
  const question = input.state.exactQuestion.trim();
  if (!question) return blockers;
  if (
    (input.state.masterId === BRONZE_TRADE_MASTER ||
      question === BRONZE_TRADE_QUESTION) &&
    !/\b(?:bronze|copper|tin|cyprus)\b/iu.test(input.evidenceClaimText)
  ) {
    blockers.push("DIAGRAM_TEMPLATE_SEMANTIC_MISMATCH");
    blockers.push("DIAGRAM_UNGROUNDED_QUESTION");
    return blockers;
  }
  if (
    (input.state.masterId === BRONZE_COLLAPSE_MASTER ||
      question === BRONZE_COLLAPSE_QUESTION) &&
    !/\b(?:bronze age|systems? collapse|collapse more likely)\b/iu.test(
      input.evidenceClaimText
    )
  ) {
    blockers.push("DIAGRAM_TEMPLATE_SEMANTIC_MISMATCH");
    blockers.push("DIAGRAM_UNGROUNDED_QUESTION");
    return blockers;
  }
  const thematicTail = question.replace(
    /^What causal or systemic relationships does the narration support\?\s*/iu,
    ""
  );
  const probe = thematicTail.length > 20 ? thematicTail : question;
  if (
    /\b(?:bronze age|copper from cyprus|tin from distant|palace trade networks)\b/iu.test(
      probe
    ) &&
    !/\b(?:bronze|copper|tin|cyprus|palace trade)\b/iu.test(input.evidenceClaimText)
  ) {
    blockers.push("DIAGRAM_TEMPLATE_SEMANTIC_MISMATCH");
    blockers.push("DIAGRAM_UNGROUNDED_QUESTION");
  }
  return blockers;
}

export function validateDiagramEpisodeGroundingV35(input: {
  readonly state: HistoryDiagramStateV34;
  readonly evidenceClaimText: string;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities?: HistoryVisualPlanV35["entities"];
}): readonly string[] {
  return [
    ...new Set([
      ...validateDiagramClaimProvenanceV35({
        state: input.state,
        claims: input.claims,
      }),
      ...validateDiagramNodeGroundingV35({
        state: input.state,
        evidenceClaimText: input.evidenceClaimText,
      }),
      ...validateDiagramQuestionGroundingV35({
        state: input.state,
        evidenceClaimText: input.evidenceClaimText,
      }),
      ...validateDiagramEntailmentV35({
        state: input.state,
        evidenceClaimText: input.evidenceClaimText,
        claims: input.claims,
        ...(input.entities ? { entities: input.entities } : {}),
      }),
    ]),
  ];
}

export function assessDiagramProvenanceForPlanV35(plan: HistoryVisualPlanV35): {
  readonly violations: readonly {
    readonly diagramStateId: string;
    readonly blockers: readonly string[];
  }[];
  readonly validDiagramCount: number;
  readonly crossEpisodeClaimReferences: number;
  readonly ungroundedValidNodes: number;
  readonly ungroundedValidRelationships: number;
  readonly ungroundedValidQuestions: number;
  readonly properNameFragmentationViolations: number;
} {
  const violations: Array<{ diagramStateId: string; blockers: readonly string[] }> = [];
  let crossEpisodeClaimReferences = 0;
  let ungroundedValidNodes = 0;
  let ungroundedValidRelationships = 0;
  let ungroundedValidQuestions = 0;
  let properNameFragmentationViolations = 0;
  let validDiagramCount = 0;

  for (const state of plan.diagramStates) {
    const evidenceClaimText = collectDiagramEvidenceClaimTextV35({
      state,
      claims: plan.claims,
    });
    const provenanceBlockers = validateDiagramEpisodeGroundingV35({
      state,
      evidenceClaimText,
      claims: plan.claims,
      entities: plan.entities,
    });
    const semanticBlockers = state.blockerCodes.filter((code) =>
      [
        "DIAGRAM_UNSUPPORTED_EDGE",
        "DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE",
        "DIAGRAM_INSUFFICIENT_RELATIONSHIP_EVIDENCE",
      ].includes(code)
    );
    if (state.semanticStatus === "valid") {
      validDiagramCount += 1;
      if (provenanceBlockers.length) {
        violations.push({ diagramStateId: state.id, blockers: provenanceBlockers });
      }
      if (provenanceBlockers.includes("DIAGRAM_CROSS_EPISODE_CLAIM_REFERENCE"))
        crossEpisodeClaimReferences += 1;
      if (provenanceBlockers.includes("DIAGRAM_UNGROUNDED_NODE")) ungroundedValidNodes += 1;
      if (provenanceBlockers.includes("DIAGRAM_UNGROUNDED_QUESTION"))
        ungroundedValidQuestions += 1;
      if (provenanceBlockers.includes("DIAGRAM_PROPER_NAME_FRAGMENTATION"))
        properNameFragmentationViolations += 1;
      if (semanticBlockers.length) ungroundedValidRelationships += semanticBlockers.length;
      if (
        provenanceBlockers.some((code) =>
          ["DIAGRAM_UNSUPPORTED_EDGE", "DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE"].includes(code)
        )
      ) {
        ungroundedValidRelationships += 1;
      }
    }
  }

  return {
    violations,
    validDiagramCount,
    crossEpisodeClaimReferences,
    ungroundedValidNodes,
    ungroundedValidRelationships,
    ungroundedValidQuestions,
    properNameFragmentationViolations,
  };
}
