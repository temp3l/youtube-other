import type { HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import type { HistoryClaimV34 } from "./history-v34-contracts.js";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";
import {
  applyDiagramTopologyValidationV35,
  buildDiagramEdgesV35,
  buildDiagramNodesV35,
  inferDiagramTopologyV35,
  type HistoryDiagramTopologyV35,
} from "./history-diagram-topology-v35.js";
import { scoreDiagramOpportunityV35 } from "./history-visual-opportunity-v35.js";

const THEMATIC_CAUSAL_LABELS: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
}> = [
  { label: "drought pressure", pattern: /\bdrought\b/iu },
  { label: "harvest stress", pattern: /\bharvest\b/iu },
  { label: "migration pressure", pattern: /\bmigration\b/iu },
  { label: "armed conflict", pattern: /\b(?:conflict|warfare|invasion)\b/iu },
  { label: "trade disruption", pattern: /\b(?:trade disruption|trade routes?|trade network)\b/iu },
  { label: "political instability", pattern: /\b(?:political instability|instability|fragmentation)\b/iu },
  { label: "palace administrative failure", pattern: /\b(?:palace|administrat)/iu },
  { label: "systems collapse", pattern: /\b(?:systems? collapse|collapse more likely|make collapse)\b/iu },
  { label: "Bronze Age collapse", pattern: /\bBronze Age(?:\s+Collapse)?\b/iu },
  { label: "regional interdependence", pattern: /\b(?:interdependence|interconnected)\b/iu },
  { label: "writing loss", pattern: /\b(?:writing|script).*(?:lost|loss|disappear)|loss of writing\b/iu },
  { label: "iron versus bronze", pattern: /\biron\b.*\bbronze\b|\bbronze\b.*\biron\b/iu },
  { label: "earthquake disruption", pattern: /\b(?:earthquake|seismic|quake)\b/iu },
  { label: "military fragmentation", pattern: /\b(?:army|armies|military)\b/iu },
  { label: "fragmented evidence", pattern: /\b(?:fragmented evidence|evidence is fragmented)\b/iu },
  { label: "metanarrative caution", pattern: /\bwarns? us against\b/iu },
  { label: "single-cause warning", pattern: /\bsingle (?:dramatic )?explanation\b/iu },
  { label: "supply-chain failure", pattern: /\b(?:supply|logistics|supplies)\b/iu },
  { label: "disease and hunger", pattern: /\b(?:disease|hunger|famine|starv)\b/iu },
  { label: "population loss", pattern: /\b(?:population loss|mortality|depopulation)\b/iu },
  { label: "labour scarcity", pattern: /\b(?:labou?r scarcity|worker shortage)\b/iu },
  { label: "tax and revenue strain", pattern: /\b(?:tax(?:es)?|revenue)\b/iu },
  { label: "imperial resource cycle", pattern: /\b(?:provincial|administration|empire|resources)\b/iu },
  { label: "copper from Cyprus", pattern: /\bcopper\b.*\bCyprus\b|\bCyprus\b.*\bcopper\b/iu },
  { label: "tin from distant regions", pattern: /\btin\b/iu },
  { label: "bronze production", pattern: /\bbronze\b/iu },
  { label: "palace trade networks", pattern: /\b(?:palace|trade network)\b/iu },
];

function wordSafeSlice(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const boundary = slice.lastIndexOf(" ");
  return (boundary > 20 ? slice.slice(0, boundary) : slice).trim();
}

export function compileTopologyDiagramV35(input: {
  readonly beatNumber: string;
  readonly masterId: string;
  readonly diagramType: HistoryDiagramStateV34["diagramType"];
  readonly exactQuestion: string;
  readonly labels: readonly string[];
  readonly claimIds: readonly string[];
  readonly text: string;
  readonly topology?: HistoryDiagramTopologyV35;
  readonly visibleCount?: number;
}): {
  readonly master: HistoryVisualPlanV35["diagramMasters"][number];
  readonly state: HistoryDiagramStateV34;
} {
  const visibleLabels = input.labels.slice(
    0,
    Math.max(2, input.visibleCount ?? input.labels.length)
  );
  const topology = input.topology ?? inferDiagramTopologyV35({ labels: visibleLabels, text: input.text });
  const nodes = buildDiagramNodesV35({
    beatNumber: input.beatNumber,
    masterId: input.masterId,
    labels: visibleLabels,
    claimIds: input.claimIds,
  });
  const edges = buildDiagramEdgesV35({
    beatNumber: input.beatNumber,
    claimIds: input.claimIds,
    text: input.text,
    nodes,
    topology,
  });
  const baseState: HistoryDiagramStateV34 = {
    id: `diagram-state-${input.beatNumber}`,
    masterId: input.masterId,
    diagramType: input.diagramType,
    exactQuestion: input.exactQuestion,
    nodes,
    edges,
    semanticStatus: "valid",
    blockerCodes: [],
    fallbackDecision: null,
  };
  return {
    master: {
      id: input.masterId,
      diagramType: input.diagramType,
      exactQuestion: input.exactQuestion,
      supportedRatios: ["16:9", "9:16"],
    },
    state: applyDiagramTopologyValidationV35({
      state: baseState,
      linkedClaimText: input.text,
      topology,
    }),
  };
}

export function extractThematicCausalLabelsV35(text: string): string[] {
  const labels: string[] = [];
  for (const item of THEMATIC_CAUSAL_LABELS) {
    if (item.pattern.test(text) && !labels.includes(item.label)) labels.push(item.label);
  }
  return labels;
}

export function compileAbstractCausalDiagramV35(input: {
  readonly beatNumber: string;
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
}): {
  readonly master: HistoryVisualPlanV35["diagramMasters"][number];
  readonly state: HistoryDiagramStateV34;
} | null {
  const scored = scoreDiagramOpportunityV35({
    claimIds: input.claimIds,
    clusterText: input.text,
    claims: input.claims,
    entityLabels: [],
  });
  if (!scored.eligible || scored.score < 3) return null;
  const labels = extractThematicCausalLabelsV35(input.text);
  if (labels.length < 2) return null;
  const hasCausalLanguage =
    /\b(?:because|led to|resulted|therefore|collapse|combined|interconnected|dependencies?|mechanism|warns? us against|systems?)\b/iu.test(
      input.text
    );
  if (!hasCausalLanguage) return null;
  const masterId = `diagram-master-causal-${input.beatNumber}`;
  const topology = inferDiagramTopologyV35({ labels, text: input.text });
  const diagramType =
    topology === "comparison"
      ? "evidence-set"
      : labels.length >= 3
        ? "process"
        : "causal-chain";
  const compiled = compileTopologyDiagramV35({
    beatNumber: input.beatNumber,
    masterId,
    diagramType,
    exactQuestion: wordSafeSlice(
      `What causal or systemic relationships does the narration support? ${input.text}`,
      160
    ),
    labels: labels.slice(0, 5),
    claimIds: input.claimIds,
    text: input.text,
    topology,
  });
  return compiled.state.semanticStatus === "blocked" ? null : compiled;
}

export function compileBronzeTradeDiagramV35(input: {
  readonly beatNumber: string;
  readonly text: string;
  readonly claimIds: readonly string[];
}): ReturnType<typeof compileTopologyDiagramV35> | null {
  const labels = [
    "copper from Cyprus",
    "tin from distant regions",
    "bronze production",
    "palace trade networks",
  ].filter(
    (label) =>
      new RegExp(label.split(" ")[0]!, "iu").test(input.text) ||
      /trade|bronze|copper|tin|palace|interdependence/iu.test(input.text)
  );
  if (labels.length < 3) return null;
  return compileTopologyDiagramV35({
    beatNumber: input.beatNumber,
    masterId: "diagram-master-bronze-age-trade-network",
    diagramType: "process",
    exactQuestion: "How did Bronze Age trade networks interconnect the eastern Mediterranean?",
    labels,
    claimIds: input.claimIds,
    text: input.text,
    topology: "parallel-contributors",
    visibleCount: Math.min(labels.length, 4),
  });
}

export function compileBronzeSystemsCollapseDiagramV35(input: {
  readonly beatNumber: string;
  readonly text: string;
  readonly claimIds: readonly string[];
}): ReturnType<typeof compileTopologyDiagramV35> | null {
  const labels = [
    "drought pressure",
    "trade network disruption",
    "earthquake disruption",
    "military fragmentation",
    "palace administrative failure",
    "systems collapse",
  ].filter(
    (label) =>
      new RegExp(label.split(" ")[0]!, "iu").test(input.text) ||
      /collapse|interdependence|disruption|palace|drought|earthquake|military/iu.test(input.text)
  );
  if (labels.length < 3) return null;
  const contributors = labels.filter((label) => !/systems collapse/i.test(label));
  const outcomes = labels.filter((label) => /systems collapse/i.test(label));
  const visibleCount = Math.min(labels.length, 5);
  const maxContributors = Math.max(2, visibleCount - outcomes.length);
  const visibleLabels = [
    ...contributors.slice(0, maxContributors),
    ...outcomes,
  ].slice(0, visibleCount);
  return compileTopologyDiagramV35({
    beatNumber: input.beatNumber,
    masterId: "diagram-master-bronze-age-systems-collapse",
    diagramType: "process",
    exactQuestion: "What systemic dependencies does the narration link to collapse?",
    labels: visibleLabels,
    claimIds: input.claimIds,
    text: input.text,
    topology: "convergence",
    visibleCount: visibleLabels.length,
  });
}
