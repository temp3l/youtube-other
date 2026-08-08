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

const SPATIAL_EXPLANATION_PATTERN_V35 =
  /\b(?:route|routes?|trade|across|from .+ to |network|territor|island|sea|empire|collapse spread|landed|landing|invaded|invasion|invading|disembark|amphibious|beach|armada|crusade|expedition|campaign|migration|encircle|encircled|siege|fleet|marched|march|retreat|retreated|advanced|advancing|crossed|crossing|sailed|inland|normandy|channel|landing zone|front line|chokepoint|territorial|conquest|expansion|bridgehead|causeway|fleet|naval)\b/iu;

const MOVEMENT_SPATIAL_PATTERN_V35 =
  /\b(?:marched|march|crossed|crossing|sailed|landed|landing|invaded|invasion|retreat|retreated|advanced|advancing|from .+ to |route|routes?|expedition|armada|fleet|disembark|amphibious|encircle|siege|migration|inland|naval)\b/iu;

const INCIDENTAL_BIOGRAPHY_GEOGRAPHY_PATTERN_V35 =
  /\b(?:born in|birthplace|grew up in|raised in|native of)\b/iu;

const INCIDENTAL_REGION_ONLY_PATTERN_V35 =
  /\b(?:changed|across|throughout|forever|entire|whole)\b[\s\S]{0,80}\b(?:Europe|world|empire|region|continent)\b/iu;

export type MapExplanatoryTierV35 = "explanatory" | "locator" | "none";

export interface MapOpportunityAssessmentV35 {
  readonly eligible: boolean;
  readonly tier: MapExplanatoryTierV35;
  readonly score: number;
  readonly reason: string;
  readonly claimIds: readonly string[];
  readonly selectionThreshold: number;
}

function distinctGeographicLabelsV35(input: {
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly claimIds: readonly string[];
}): string[] {
  return [
    ...new Set(
      input.entities
        .filter(
          (entity) =>
            input.claimIds.includes(entity.claimId) &&
            ["place", "region", "water-body", "state"].includes(entity.entityType)
        )
        .map((entity) => entity.normalizedLabel)
    ),
  ];
}

function isLocatorMapIntentV35(intent: HistoryMapIntentProposalV34 | null): boolean {
  if (!intent) return false;
  const origin = intent.originPlaceMentionIds[0];
  const destination = intent.destinationPlaceMentionIds[0];
  if (!origin || !destination) return true;
  if (origin === destination) return true;
  return ["location", "area", "discovery-location"].includes(intent.mapPurpose);
}

function isRouteMapIntentV35(intent: HistoryMapIntentProposalV34 | null): boolean {
  if (!intent) return false;
  const origin = intent.originPlaceMentionIds[0];
  const destination = intent.destinationPlaceMentionIds[0];
  return Boolean(origin && destination && origin !== destination);
}

export function assessMapOpportunityV35(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly mapIntents: readonly HistoryMapIntentProposalV34[];
}): MapOpportunityAssessmentV35 {
  const geoLabels = distinctGeographicLabelsV35({
    entities: input.entities,
    claimIds: input.claimIds,
  });
  const intent =
    input.mapIntents.find((item) => item.claimIds.some((id) => input.claimIds.includes(id))) ??
    null;
  const geoCount = input.geographicQualifiers.filter((item) =>
    input.claimIds.includes(item.claimId)
  ).length;
  const hasMovementLanguage = MOVEMENT_SPATIAL_PATTERN_V35.test(input.clusterText);
  const hasRouteLanguage = SPATIAL_EXPLANATION_PATTERN_V35.test(input.clusterText);
  const incidentalBiography =
    INCIDENTAL_BIOGRAPHY_GEOGRAPHY_PATTERN_V35.test(input.clusterText) &&
    !hasMovementLanguage;
  const incidentalRegionOnly =
    geoLabels.length <= 1 &&
    INCIDENTAL_REGION_ONLY_PATTERN_V35.test(input.clusterText) &&
    !hasMovementLanguage &&
    !isRouteMapIntentV35(intent);
  if (incidentalBiography || incidentalRegionOnly) {
    return {
      eligible: false,
      tier: "none",
      score: 0,
      reason: incidentalBiography
        ? "incidental-biography-geography"
        : "incidental-region-reference",
      claimIds: input.claimIds,
      selectionThreshold: 99,
    };
  }

  const explanatory =
    geoLabels.length >= 2 && (hasRouteLanguage || hasMovementLanguage) ||
    isRouteMapIntentV35(intent) ||
    (hasMovementLanguage && geoLabels.length >= 1 && /\bfrom\b.+\bto\b/iu.test(input.clusterText));
  const locator =
    !explanatory &&
    (geoLabels.length >= 1 || geoCount >= 1) &&
    (isLocatorMapIntentV35(intent) || (!hasMovementLanguage && geoLabels.length === 1));

  if (explanatory) {
    let score = 4;
    if (isRouteMapIntentV35(intent)) score += 2;
    if (geoLabels.length >= 2) score += 2;
    if (hasMovementLanguage) score += 1;
    if (
      /\b(?:landed|landing|invasion|armada|crusade|expedition|fleet|siege|encircle|bridgehead|causeway)\b/iu.test(
        input.clusterText
      )
    )
      score += 1;
    return {
      eligible: true,
      tier: "explanatory",
      score,
      reason: isRouteMapIntentV35(intent)
        ? "explanatory-route-or-movement"
        : "explanatory-multi-anchor-spatial-relationship",
      claimIds: input.claimIds,
      selectionThreshold: 5,
    };
  }

  if (locator) {
    return {
      eligible: true,
      tier: "locator",
      score: 2,
      reason: "locator-only-geography",
      claimIds: input.claimIds,
      selectionThreshold: 99,
    };
  }

  return {
    eligible: false,
    tier: "none",
    score: 0,
    reason: "insufficient-explanatory-spatial-evidence",
    claimIds: input.claimIds,
    selectionThreshold: 99,
  };
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
  const assessment = assessMapOpportunityV35(input);
  const intent =
    input.mapIntents.find((item) => item.claimIds.some((id) => input.claimIds.includes(id))) ??
    null;
  const geoEntities = input.entities.filter(
    (entity) =>
      input.claimIds.includes(entity.claimId) &&
      ["place", "region", "water-body", "state"].includes(entity.entityType)
  );
  return {
    eligible: assessment.eligible,
    reason: assessment.reason,
    claimIds: assessment.claimIds,
    entityIds: assessment.eligible ? geoEntities.map((entity) => entity.id) : [],
    intent,
  };
}

export function scoreMapOpportunityV35(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly mapIntents: readonly HistoryMapIntentProposalV34[];
}): {
  readonly score: number;
  readonly eligible: boolean;
  readonly reason: string;
  readonly claimIds: readonly string[];
  readonly tier: MapExplanatoryTierV35;
  readonly selectionThreshold: number;
} {
  const assessment = assessMapOpportunityV35(input);
  return {
    score: assessment.score,
    eligible: assessment.eligible && assessment.tier === "explanatory",
    reason: assessment.reason,
    claimIds: assessment.claimIds,
    tier: assessment.tier,
    selectionThreshold: assessment.selectionThreshold,
  };
}

export function scoreDiagramWindowOpportunityV35(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly windowText: string;
  readonly claims: readonly HistoryClaimV34[];
  readonly entityLabels?: readonly string[];
}): {
  readonly score: number;
  readonly eligible: boolean;
  readonly reason: string;
  readonly claimIds: readonly string[];
} {
  const local = scoreDiagramOpportunityV35({
    claimIds: input.claimIds,
    clusterText: input.clusterText,
    claims: input.claims,
    ...(input.entityLabels ? { entityLabels: input.entityLabels } : {}),
  });
  const window = scoreDiagramOpportunityV35({
    claimIds: input.claimIds,
    clusterText: input.windowText,
    claims: input.claims,
    ...(input.entityLabels ? { entityLabels: input.entityLabels } : {}),
  });
  return window.score >= local.score ? window : local;
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
  if (
    /\b(?:organization|mobility|logistics|discipline|engineering|diplomacy|command|coordination)\b/iu.test(
      input.clusterText
    ) &&
    /\b(?:method|combined|coherent|army|conquest|campaign|war machine)\b/iu.test(input.clusterText)
  )
    return {
      eligible: true,
      reason: "supported-command-logistics-structure",
      claimIds: input.claimIds,
    };
  if (
    /\b(?:escalation|quarantine|blockade|missile|nuclear|ExComm|crisis)\b/iu.test(
      input.clusterText
    ) &&
    /\b(?:decision|option|response|threat|naval|Cuba|Soviet)\b/iu.test(input.clusterText)
  )
    return {
      eligible: true,
      reason: "supported-escalation-decision-structure",
      claimIds: input.claimIds,
    };
  if (
    /\b(?:collision|flooding|evacuation|compartment|lifeboat|watertight|iceberg)\b/iu.test(
      input.clusterText
    )
  )
    return {
      eligible: true,
      reason: "supported-maritime-disaster-process",
      claimIds: input.claimIds,
    };
  if (
    /\b(?:manor|harvest|serf|obligation|feudal|peasant|lord)\b/iu.test(input.clusterText) &&
    /\b(?:seasonal|work|field|tax|rent|crop)\b/iu.test(input.clusterText)
  )
    return {
      eligible: true,
      reason: "supported-agricultural-social-structure",
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
