import type { HistoryClaimV34, HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";
import { finalizeDiagramSemanticStateV35 } from "./history-diagram-semantic-v35.js";

export const ROMAN_IMPERIAL_RESOURCE_CYCLE_MASTER =
  "diagram-master-roman-imperial-resource-cycle" as const;
export const BLACK_DEATH_LABOUR_CONSEQUENCES_MASTER =
  "diagram-master-black-death-labour-consequences" as const;
export const BLACK_DEATH_TRANSMISSION_MASTER =
  "diagram-master-black-death-transmission" as const;

const BLACK_DEATH_TRANSMISSION_LABELS: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
}> = [
  { label: "Black Sea trade contact", pattern: /\bBlack Sea\b/iu },
  { label: "port arrival at Messina", pattern: /\bMessina\b/iu },
  { label: "trade-route spread", pattern: /\btrade routes?\b/iu },
  { label: "flea and rat transmission", pattern: /\b(?:fleas?|rats?)\b/iu },
];

type DiagramCompilation = {
  readonly master: HistoryVisualPlanV35["diagramMasters"][number];
  readonly state: HistoryDiagramStateV34;
};

function claimText(
  claims: readonly Pick<HistoryClaimV34, "id" | "normalizedProposition">[],
  claimIds: readonly string[]
): string {
  return claims
    .filter((claim) => claimIds.includes(claim.id))
    .map((claim) => claim.normalizedProposition)
    .join("\n");
}

function romanEdgeSupported(
  evidenceText: string,
  fromLabel: string,
  toLabel: string
): boolean {
  if (fromLabel === "tax revenue" && toLabel === "armies and administration") {
    return /\bpaid taxes\b/iu.test(evidenceText) && /\bfunded armies\b/iu.test(evidenceText);
  }
  if (fromLabel === "armies and administration" && toLabel === "provincial control") {
    return /\bdefended provinces\b/iu.test(evidenceText);
  }
  if (fromLabel === "provincial control" && toLabel === "continued revenue") {
    return /\breproduce\b/iu.test(evidenceText) || /\bhelped the system\b/iu.test(evidenceText);
  }
  return false;
}

export function compileRomanImperialResourceCycleV35(input: {
  readonly beatNumber: string;
  readonly evidenceBeatIds: readonly string[];
  readonly evidenceClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
}): DiagramCompilation | null {
  const evidenceText = claimText(input.claims, input.evidenceClaimIds);
  if (
    !/\b(?:tax revenue|paid taxes|taxes funded|armies and administration|provincial control|continued revenue)\b/iu.test(
      evidenceText
    )
  )
    return null;

  const nodeDefs = [
    "tax revenue",
    "armies and administration",
    "provincial control",
    "continued revenue",
  ] as const;
  const visibleLabels = nodeDefs.filter((label, index) => {
    if (index === 0) return /\bpaid taxes\b/iu.test(evidenceText);
    if (index === 1) return /\bfunded armies\b/iu.test(evidenceText);
    if (index === 2) return /\bdefended provinces\b/iu.test(evidenceText);
    return /\breproduce\b/iu.test(evidenceText) || /\bhelped the system\b/iu.test(evidenceText);
  });
  if (visibleLabels.length < 2) return null;

  const masterId = ROMAN_IMPERIAL_RESOURCE_CYCLE_MASTER;
  const nodes = visibleLabels.map((label, index) => ({
    id: `node-${masterId}-${index + 1}`,
    label,
    linkedClaimIds: input.evidenceClaimIds,
    entityMentionIds: [] as string[],
  }));
  const edges: Array<HistoryDiagramStateV34["edges"][number]> = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index]!;
    const to = nodes[index + 1]!;
    if (!romanEdgeSupported(evidenceText, from.label, to.label)) continue;
    edges.push({
      id: `edge-${input.beatNumber}-${edges.length + 1}`,
      fromNodeId: from.id,
      toNodeId: to.id,
      relationship: "depends-on",
      linkedClaimIds: input.evidenceClaimIds,
    });
  }

  const baseState: HistoryDiagramStateV34 = {
    id: `diagram-state-${input.beatNumber}`,
    masterId,
    diagramType: "process",
    exactQuestion: "How did the Roman imperial resource cycle work and break down?",
    nodes,
    edges,
    semanticStatus: "valid",
    blockerCodes: [],
    fallbackDecision: null,
    evidenceBeatIds: input.evidenceBeatIds,
    evidenceClaimIds: input.evidenceClaimIds,
  };

  return {
    master: {
      id: masterId,
      diagramType: "process",
      exactQuestion: "How did the Roman imperial resource cycle work and break down?",
      supportedRatios: ["16:9", "9:16"],
    },
    state: finalizeDiagramSemanticStateV35({
      state: baseState,
      evidenceClaimText: evidenceText,
      claims: input.claims,
    }),
  };
}

export function isBlackDeathTransmissionTextV35(text: string): boolean {
  return (
    /\b(?:plague|Black Death|Yersinia pestis)\b/iu.test(text) &&
    BLACK_DEATH_TRANSMISSION_LABELS.some((item) => item.pattern.test(text))
  );
}

export function extractBlackDeathTransmissionLabelsV35(text: string): string[] {
  return BLACK_DEATH_TRANSMISSION_LABELS.filter((item) => item.pattern.test(text)).map(
    (item) => item.label
  );
}

export function compileBlackDeathTransmissionDiagramV35(input: {
  readonly beatNumber: string;
  readonly evidenceBeatIds: readonly string[];
  readonly evidenceClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
}): DiagramCompilation | null {
  const evidenceText = claimText(input.claims, input.evidenceClaimIds);
  if (!isBlackDeathTransmissionTextV35(evidenceText)) return null;

  const visibleLabels = extractBlackDeathTransmissionLabelsV35(evidenceText);
  if (visibleLabels.length < 2) return null;

  const masterId = BLACK_DEATH_TRANSMISSION_MASTER;
  const nodes = visibleLabels.map((label, index) => ({
    id: `node-${masterId}-${index + 1}`,
    label,
    linkedClaimIds: input.evidenceClaimIds,
    entityMentionIds: [] as string[],
  }));

  const baseState: HistoryDiagramStateV34 = {
    id: `diagram-state-${input.beatNumber}`,
    masterId,
    diagramType: "evidence-set",
    exactQuestion: "What transmission pathways does the narration support?",
    nodes,
    edges: [],
    semanticStatus: "valid",
    blockerCodes: [],
    fallbackDecision: null,
    evidenceBeatIds: input.evidenceBeatIds,
    evidenceClaimIds: input.evidenceClaimIds,
  };

  return {
    master: {
      id: masterId,
      diagramType: "evidence-set",
      exactQuestion: "What transmission pathways does the narration support?",
      supportedRatios: ["16:9", "9:16"],
    },
    state: finalizeDiagramSemanticStateV35({
      state: baseState,
      evidenceClaimText: evidenceText,
      claims: input.claims,
    }),
  };
}

function labourEdgeSupported(
  evidenceText: string,
  fromLabel: string,
  toLabel: string
): boolean {
  if (fromLabel === "population loss" && toLabel === "labour scarcity") {
    return (
      /\bdemographic shock\b/iu.test(evidenceText) ||
      /\bpopulation loss\b/iu.test(evidenceText) ||
      /\blacked workers\b/iu.test(evidenceText) ||
      /\blost apprentices\b/iu.test(evidenceText) ||
      /\bstruggled to harvest\b/iu.test(evidenceText)
    );
  }
  if (fromLabel === "labour scarcity" && toLabel === "wage pressure") {
    return /\bhigher wages\b/iu.test(evidenceText) || /\bdemand higher wages\b/iu.test(evidenceText);
  }
  if (fromLabel === "wage pressure" && toLabel === "labour policy response") {
    return /\b(?:Ordinance|Statute of Labourers)\b/iu.test(evidenceText);
  }
  if (fromLabel === "labour policy response" && toLabel === "wage restriction attempt") {
    return /\brestrict wages\b/iu.test(evidenceText) || /\bcompel work\b/iu.test(evidenceText);
  }
  return false;
}

export function compileBlackDeathLabourConsequenceDiagramV35(input: {
  readonly beatNumber: string;
  readonly evidenceBeatIds: readonly string[];
  readonly evidenceClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
}): DiagramCompilation | null {
  const evidenceText = claimText(input.claims, input.evidenceClaimIds);
  if (!/\b(?:demographic|labou?r|wages?|workers?|apprentices?)\b/iu.test(evidenceText)) return null;

  const labels = ["population loss", "labour scarcity", "wage pressure"] as const;
  const visibleLabels = labels.filter((label) => {
    if (label === "population loss") {
      return /\bdemographic shock\b/iu.test(evidenceText) || /\bpopulation loss\b/iu.test(evidenceText);
    }
    if (label === "labour scarcity") {
      return (
        /\blabou?r\b/iu.test(evidenceText) &&
        /\b(?:lacked workers|lost apprentices|struggled to harvest)\b/iu.test(evidenceText)
      );
    }
    return /\bhigher wages\b/iu.test(evidenceText) || /\bdemand higher wages\b/iu.test(evidenceText);
  });
  if (visibleLabels.length < 2) return null;

  const masterId = BLACK_DEATH_LABOUR_CONSEQUENCES_MASTER;
  const nodes = visibleLabels.map((label, index) => ({
    id: `node-${masterId}-${index + 1}`,
    label,
    linkedClaimIds: input.evidenceClaimIds,
    entityMentionIds: [] as string[],
  }));
  const edges: Array<HistoryDiagramStateV34["edges"][number]> = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index]!;
    const to = nodes[index + 1]!;
    if (!labourEdgeSupported(evidenceText, from.label, to.label)) continue;
    edges.push({
      id: `edge-${input.beatNumber}-${edges.length + 1}`,
      fromNodeId: from.id,
      toNodeId: to.id,
      relationship: "depends-on",
      linkedClaimIds: input.evidenceClaimIds,
    });
  }

  const baseState: HistoryDiagramStateV34 = {
    id: `diagram-state-${input.beatNumber}`,
    masterId,
    diagramType: "process",
    exactQuestion: "What labour-market consequences does the narration support?",
    nodes,
    edges,
    semanticStatus: "valid",
    blockerCodes: [],
    fallbackDecision: null,
    evidenceBeatIds: input.evidenceBeatIds,
    evidenceClaimIds: input.evidenceClaimIds,
  };

  return {
    master: {
      id: masterId,
      diagramType: "process",
      exactQuestion: "What labour-market consequences does the narration support?",
      supportedRatios: ["16:9", "9:16"],
    },
    state: finalizeDiagramSemanticStateV35({
      state: baseState,
      evidenceClaimText: evidenceText,
      claims: input.claims,
    }),
  };
}

export function compileBlackDeathLabourPolicyDiagramV35(input: {
  readonly beatNumber: string;
  readonly evidenceBeatIds: readonly string[];
  readonly evidenceClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
}): DiagramCompilation | null {
  const evidenceText = claimText(input.claims, input.evidenceClaimIds);
  if (!/\b(?:Ordinance|Statute of Labourers|restrict wages|compel work)\b/iu.test(evidenceText))
    return null;

  const labels = ["wage pressure", "labour policy response", "wage restriction attempt"] as const;
  const masterId = BLACK_DEATH_LABOUR_CONSEQUENCES_MASTER;
  const nodes = labels.map((label, index) => ({
    id: `node-${masterId}-policy-${index + 1}`,
    label,
    linkedClaimIds: input.evidenceClaimIds,
    entityMentionIds: [] as string[],
  }));
  const edges: Array<HistoryDiagramStateV34["edges"][number]> = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index]!;
    const to = nodes[index + 1]!;
    if (!labourEdgeSupported(evidenceText, from.label, to.label)) continue;
    edges.push({
      id: `edge-${input.beatNumber}-${edges.length + 1}`,
      fromNodeId: from.id,
      toNodeId: to.id,
      relationship: "depends-on",
      linkedClaimIds: input.evidenceClaimIds,
    });
  }
  if (!edges.length) return null;

  const baseState: HistoryDiagramStateV34 = {
    id: `diagram-state-${input.beatNumber}`,
    masterId,
    diagramType: "process",
    exactQuestion: "How did elites respond to post-plague labour conditions?",
    nodes,
    edges,
    semanticStatus: "valid",
    blockerCodes: [],
    fallbackDecision: null,
    evidenceBeatIds: input.evidenceBeatIds,
    evidenceClaimIds: input.evidenceClaimIds,
  };

  return {
    master: {
      id: masterId,
      diagramType: "process",
      exactQuestion: "How did elites respond to post-plague labour conditions?",
      supportedRatios: ["16:9", "9:16"],
    },
    state: finalizeDiagramSemanticStateV35({
      state: baseState,
      evidenceClaimText: evidenceText,
      claims: input.claims,
    }),
  };
}

export function resolveDiagramEvidenceWindowV35(input: {
  readonly beatId: string;
  readonly claimIds: readonly string[];
  readonly text: string;
  readonly claims?: readonly Pick<HistoryClaimV34, "id" | "normalizedProposition">[];
  readonly priorBeats?: readonly {
    readonly id: string;
    readonly claimIds: readonly string[];
    readonly diagramMasterId: string | null;
  }[];
  readonly priorBeat?: {
    readonly id: string;
    readonly claimIds: readonly string[];
    readonly diagramMasterId: string | null;
  };
}): { readonly beatIds: readonly string[]; readonly claimIds: readonly string[] } | undefined {
  const priorBeats = input.priorBeats?.length
    ? input.priorBeats.slice(-2)
    : input.priorBeat
      ? [input.priorBeat]
      : [];
  const priorBeat = priorBeats.at(-1);
  if (isBlackDeathLabourConsequenceTextV35(input.text) && priorBeat) {
    return {
      beatIds: [priorBeat.id, input.beatId],
      claimIds: [...new Set([...priorBeat.claimIds, ...input.claimIds])],
    };
  }
  if (isBlackDeathLabourPolicyTextV35(input.text)) {
    const claims = input.claims ?? [];
    const claimTextFor = (claimIds: readonly string[]) =>
      claims
        .filter((claim) => claimIds.includes(claim.id))
        .map((claim) => claim.normalizedProposition)
        .join("\n");
    const currentText = claimTextFor(input.claimIds) || input.text;
    const hasPolicyRestriction =
      /\b(?:Ordinance|Statute|law|decree|policy)\b/iu.test(currentText) &&
      /\b(?:restrict|compel|limit|freeze|require)\b/iu.test(currentText);
    if (hasPolicyRestriction) {
      for (let width = 1; width <= priorBeats.length; width += 1) {
        const adjacent = priorBeats.slice(-width);
        const precedingTexts = adjacent.map((beat) => claimTextFor(beat.claimIds));
        const hasPriorCondition = precedingTexts.some((text) =>
          /\b(?:demand(?:ed)? higher wages|higher wages|better terms|wage pressure|worker shortage|labou?r scarcity)\b/iu.test(
            text
          )
        );
        const hasResponse = [...precedingTexts, currentText].some((text) =>
          /\b(?:tried to resist|respond(?:ed|ing)?|resist(?:ed|ing)?|oppos(?:ed|ing)|attempted to restrict|sought to limit)\b/iu.test(
            text
          )
        );
        if (hasPriorCondition && hasResponse) {
          return {
            beatIds: [...adjacent.map((beat) => beat.id), input.beatId],
            claimIds: [
              ...new Set([...adjacent.flatMap((beat) => beat.claimIds), ...input.claimIds]),
            ],
          };
        }
      }
    }
    return {
      beatIds: [input.beatId],
      claimIds: [...input.claimIds],
    };
  }
  if (
    isRomanResourceCycleContinuationTextV35(input.text) &&
    priorBeat?.diagramMasterId === ROMAN_IMPERIAL_RESOURCE_CYCLE_MASTER
  ) {
    return {
      beatIds: [priorBeat.id, input.beatId],
      claimIds: [...new Set([...priorBeat.claimIds, ...input.claimIds])],
    };
  }
  if (isRomanResourceCycleTextV35(input.text)) {
    return { beatIds: [input.beatId], claimIds: [...input.claimIds] };
  }
  return undefined;
}

export function isRomanResourceCycleTextV35(text: string): boolean {
  return (
    /\b(?:tax revenue|paid taxes|taxes funded|armies and administration|provincial control|continued revenue)\b/iu.test(
      text
    ) && /\b(?:Rome|Roman Empire|empire|bargain|resources|provinces)\b/iu.test(text)
  );
}

export function isRomanResourceCycleContinuationTextV35(text: string): boolean {
  return /\b(?:defended provinces|reproduce itself|helped the system)\b/iu.test(text);
}

export function isBlackDeathLabourConsequenceTextV35(text: string): boolean {
  return (
    /\b(?:demographic shock|lacked workers|lost apprentices|struggled to harvest|higher wages)\b/iu.test(
      text
    ) && /\b(?:plague|Black Death|labou?r|labor)\b/iu.test(text)
  );
}

export function isBlackDeathLabourPolicyTextV35(text: string): boolean {
  return /\b(?:Ordinance|Statute of Labourers)\b/iu.test(text);
}

export const EVIDENCE_BOUND_EDGE_BLOCKERS = new Set([
  "DIAGRAM_UNSUPPORTED_EDGE",
  "DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE",
  "DIAGRAM_INSUFFICIENT_RELATIONSHIP_EVIDENCE",
]);

function evidenceBoundEdgeSupported(input: {
  readonly masterId: string;
  readonly evidenceClaimText: string;
  readonly fromLabel: string;
  readonly toLabel: string;
}): boolean {
  if (input.masterId === ROMAN_IMPERIAL_RESOURCE_CYCLE_MASTER) {
    return romanEdgeSupported(input.evidenceClaimText, input.fromLabel, input.toLabel);
  }
  if (input.masterId === BLACK_DEATH_LABOUR_CONSEQUENCES_MASTER) {
    return labourEdgeSupported(input.evidenceClaimText, input.fromLabel, input.toLabel);
  }
  return false;
}

export function usesEvidenceBoundDiagramValidationV35(
  state: Pick<HistoryDiagramStateV34, "masterId" | "evidenceClaimIds">
): boolean {
  if (!state.evidenceClaimIds?.length) return false;
  return (
    state.masterId === ROMAN_IMPERIAL_RESOURCE_CYCLE_MASTER ||
    state.masterId === BLACK_DEATH_LABOUR_CONSEQUENCES_MASTER
  );
}

export function validateDiagramEvidenceBoundEdgesV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "masterId" | "nodes" | "edges" | "diagramType">;
  readonly evidenceClaimText: string;
}): readonly string[] {
  if (!usesEvidenceBoundDiagramValidationV35(input.state)) return [];

  const nodeById = new Map(input.state.nodes.map((node) => [node.id, node] as const));
  const blockers: string[] = [];

  for (const edge of input.state.edges) {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to) {
      blockers.push("DIAGRAM_UNSUPPORTED_EDGE");
      continue;
    }
    if (
      !evidenceBoundEdgeSupported({
        masterId: input.state.masterId,
        evidenceClaimText: input.evidenceClaimText,
        fromLabel: from.label,
        toLabel: to.label,
      })
    ) {
      blockers.push(
        edge.relationship === "sequence"
          ? "DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE"
          : "DIAGRAM_UNSUPPORTED_EDGE"
      );
    }
  }

  if (
    input.state.diagramType !== "evidence-set" &&
    input.state.nodes.length >= 2 &&
    input.state.edges.length === 0
  ) {
    blockers.push("DIAGRAM_INSUFFICIENT_RELATIONSHIP_EVIDENCE");
  }

  return [...new Set(blockers)];
}
