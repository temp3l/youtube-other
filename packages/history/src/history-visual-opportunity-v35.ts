import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapIntentProposalV34,
} from "./history-v34-contracts.js";
import type { HistoryVisualModalityV35 } from "./history-v35-contracts.js";

export interface HistoryVisualOpportunityV35 {
  readonly id: string;
  readonly type: "map" | "diagram";
  readonly claimIds: readonly string[];
  readonly entityIds: readonly string[];
  readonly narrationSpanIds: readonly string[];
  readonly eligibilityReason: string;
  readonly selected: boolean;
  readonly selectionReason?: string;
  readonly rejectionReason?: string;
}

export interface HistoryVisualOpportunitySummaryV35 {
  readonly eligibleMapOpportunities: number;
  readonly selectedMapOpportunities: number;
  readonly eligibleDiagramOpportunities: number;
  readonly selectedDiagramOpportunities: number;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function detectMapOpportunityV35(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly mapIntents: readonly HistoryMapIntentProposalV34[];
}): {
  readonly eligible: boolean;
  readonly reason: string;
  readonly claimIds: readonly string[];
  readonly entityIds: readonly string[];
  readonly intent: HistoryMapIntentProposalV34 | null;
} {
  const geoEntities = input.entities.filter(
    (entity) =>
      input.claimIds.includes(entity.claimId) &&
      ["place", "region", "water-body", "state"].includes(entity.entityType)
  );
  const intent =
    input.mapIntents.find((item) => item.claimIds.some((id) => input.claimIds.includes(id))) ??
    null;
  const geoCount = input.geographicQualifiers.filter((item) =>
    input.claimIds.includes(item.claimId)
  ).length;
  const hasRouteLanguage =
    /\b(?:route|trade|across|from .+ to |network|region|territor|island|sea|empire|collapse spread)\b/iu.test(
      input.clusterText
    );
  if (intent && geoEntities.length > 0)
    return {
      eligible: true,
      reason: "supported-map-intent-with-geographic-entities",
      claimIds: intent.claimIds,
      entityIds: geoEntities.map((entity) => entity.id),
      intent,
    };
  if (geoCount >= 2 && hasRouteLanguage)
    return {
      eligible: true,
      reason: "multi-place-geographic-relationship",
      claimIds: input.claimIds,
      entityIds: geoEntities.map((entity) => entity.id),
      intent,
    };
  if (geoEntities.length >= 1 && hasRouteLanguage)
    return {
      eligible: true,
      reason: "regional-context-with-geographic-evidence",
      claimIds: input.claimIds,
      entityIds: geoEntities.map((entity) => entity.id),
      intent,
    };
  return {
    eligible: false,
    reason: "insufficient-geographic-evidence",
    claimIds: input.claimIds,
    entityIds: [],
    intent,
  };
}

export function detectDiagramOpportunityV35(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly claims: readonly HistoryClaimV34[];
}): {
  readonly eligible: boolean;
  readonly reason: string;
  readonly claimIds: readonly string[];
} {
  const materialClaims = input.claims.filter(
    (claim) => input.claimIds.includes(claim.id) && claim.materiality === "material"
  );
  const causal =
    materialClaims.some((claim) => claim.claimKind === "causal") ||
    /\b(?:because|led to|resulted|compounded|mechanism|therefore|collapse|trade network|combined to make|dependencies?)\b/iu.test(
      input.clusterText
    );
  const structured =
    materialClaims.some((claim) =>
      ["comparative", "quantity", "compound"].includes(claim.claimKind)
    ) || /\b(?:system|network|process|hierarchy|cycle|spread|transmission)\b/iu.test(input.clusterText);
  if (causal && structured)
    return {
      eligible: true,
      reason: "supported-causal-or-system-structure",
      claimIds: input.claimIds,
    };
  if (causal)
    return {
      eligible: true,
      reason: "supported-causal-relationship",
      claimIds: input.claimIds,
    };
  if (
    /\b(?:trade routes?|interdependence|interconnected|linked|network|collapse|political boundaries)\b/iu.test(
      input.clusterText
    ) &&
    (/\b(?:Mediterranean|Aegean|Anatolia|Cyprus|Egypt|Hittite|Mycenae|Pylos|Levant)\b/iu.test(
      input.clusterText
    ) ||
      materialClaims.some((claim) => claim.claimKind === "place"))
  )
    return {
      eligible: true,
      reason: "supported-trade-network-structure",
      claimIds: input.claimIds,
    };
  return {
    eligible: false,
    reason: "no-supported-structured-relationship",
    claimIds: input.claimIds,
  };
}

export function scoreDiagramOpportunityV35(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly claims: readonly HistoryClaimV34[];
  readonly entityLabels?: readonly string[];
}): {
  readonly score: number;
  readonly eligible: boolean;
  readonly reason: string;
  readonly claimIds: readonly string[];
} {
  const detected = detectDiagramOpportunityV35(input);
  if (!detected.eligible)
    return { score: 0, eligible: false, reason: detected.reason, claimIds: detected.claimIds };
  let score = 2;
  const materialClaims = input.claims.filter(
    (claim) => input.claimIds.includes(claim.id) && claim.materiality === "material"
  );
  if (materialClaims.some((claim) => claim.claimKind === "causal")) score += 2;
  if (
    /\b(?:because|led to|resulted|compounded|therefore|collapse|interdependence|dependencies?)\b/iu.test(
      input.clusterText
    )
  )
    score += 2;
  if (
    /\b(?:trade routes?|bronze|copper|tin|palace|system|network|process|hierarchy|feedback)\b/iu.test(
      input.clusterText
    )
  )
    score += 1;
  if ((input.entityLabels?.length ?? 0) >= 2) score += 1;
  if (detected.reason === "supported-causal-or-system-structure") score += 1;
  return {
    score,
    eligible: true,
    reason: detected.reason,
    claimIds: detected.claimIds,
  };
}

export function reserveDiagramBeatIndexesV35(input: {
  readonly clusters: readonly { readonly claimIds: readonly string[]; readonly text: string }[];
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly maxDiagrams?: number;
}): ReadonlyMap<number, string> {
  const maxDiagrams = input.maxDiagrams ?? 3;
  const scored = input.clusters
    .map((cluster, index) => {
      const entityLabels = input.entities
        .filter((entity) => cluster.claimIds.includes(entity.claimId))
        .map((entity) => entity.normalizedLabel);
      const scoredOpportunity = scoreDiagramOpportunityV35({
        claimIds: cluster.claimIds,
        clusterText: cluster.text,
        claims: input.claims,
        entityLabels,
      });
      return { index, ...scoredOpportunity };
    })
    .filter((item) => item.eligible && item.score >= 4)
    .sort((left, right) => right.score - left.score);
  const reserved = new Map<number, string>();
  for (const item of scored) {
    if (reserved.size >= maxDiagrams) break;
    if ([...reserved.keys()].some((index) => Math.abs(index - item.index) <= 1)) continue;
    reserved.set(item.index, item.reason);
  }
  return reserved;
}

export function buildVisualOpportunitiesV35(input: {
  readonly beatId: string;
  readonly clusterText: string;
  readonly claimIds: readonly string[];
  readonly narrationUnitIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly mapIntents: readonly HistoryMapIntentProposalV34[];
  readonly selectedModality: HistoryVisualModalityV35;
  readonly mapCompiled: boolean;
  readonly diagramCompiled: boolean;
  readonly mapRejectionReason?: string;
  readonly diagramRejectionReason?: string;
  readonly diagramSelectionReason?: string;
}): {
  readonly opportunities: readonly HistoryVisualOpportunityV35[];
  readonly summary: HistoryVisualOpportunitySummaryV35;
} {
  const map = detectMapOpportunityV35({
    claimIds: input.claimIds,
    clusterText: input.clusterText,
    claims: input.claims,
    entities: input.entities,
    geographicQualifiers: input.geographicQualifiers,
    mapIntents: input.mapIntents,
  });
  const diagram = detectDiagramOpportunityV35({
    claimIds: input.claimIds,
    clusterText: input.clusterText,
    claims: input.claims,
  });

  const opportunities: HistoryVisualOpportunityV35[] = [
    {
      id: `${input.beatId}-map-opportunity`,
      type: "map",
      claimIds: map.claimIds,
      entityIds: map.entityIds,
      narrationSpanIds: input.narrationUnitIds,
      eligibilityReason: map.reason,
      selected: input.selectedModality === "map" && input.mapCompiled,
      ...(input.selectedModality === "map" && input.mapCompiled
        ? { selectionReason: "compiled-map-state-available" }
        : map.eligible
          ? { rejectionReason: input.mapRejectionReason ?? "map-not-selected-or-compile-failed" }
          : { rejectionReason: map.reason }),
    },
    {
      id: `${input.beatId}-diagram-opportunity`,
      type: "diagram",
      claimIds: diagram.claimIds,
      entityIds: unique(
        input.entities
          .filter((entity) => input.claimIds.includes(entity.claimId))
          .map((entity) => entity.id)
      ),
      narrationSpanIds: input.narrationUnitIds,
      eligibilityReason: diagram.reason,
      selected: input.selectedModality === "diagram" && input.diagramCompiled,
      ...(input.selectedModality === "diagram" && input.diagramCompiled
        ? {
            selectionReason:
              input.diagramSelectionReason ?? "compiled-diagram-state-available",
          }
        : diagram.eligible
          ? {
              rejectionReason:
                input.diagramRejectionReason ?? "not-selected-score-below-threshold",
            }
          : { rejectionReason: diagram.reason }),
    },
  ];

  return {
    opportunities,
    summary: {
      eligibleMapOpportunities: map.eligible ? 1 : 0,
      selectedMapOpportunities:
        input.selectedModality === "map" && input.mapCompiled ? 1 : 0,
      eligibleDiagramOpportunities: diagram.eligible ? 1 : 0,
      selectedDiagramOpportunities:
        input.selectedModality === "diagram" && input.diagramCompiled ? 1 : 0,
    },
  };
}

export function summarizeVisualOpportunityTotalsV35(
  summaries: readonly HistoryVisualOpportunitySummaryV35[]
): HistoryVisualOpportunitySummaryV35 {
  return summaries.reduce(
    (totals, item) => ({
      eligibleMapOpportunities:
        totals.eligibleMapOpportunities + item.eligibleMapOpportunities,
      selectedMapOpportunities:
        totals.selectedMapOpportunities + item.selectedMapOpportunities,
      eligibleDiagramOpportunities:
        totals.eligibleDiagramOpportunities + item.eligibleDiagramOpportunities,
      selectedDiagramOpportunities:
        totals.selectedDiagramOpportunities + item.selectedDiagramOpportunities,
    }),
    {
      eligibleMapOpportunities: 0,
      selectedMapOpportunities: 0,
      eligibleDiagramOpportunities: 0,
      selectedDiagramOpportunities: 0,
    }
  );
}
