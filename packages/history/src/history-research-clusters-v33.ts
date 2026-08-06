import type { ClaimV3_3 } from "./history-research-v33.js";
import { hashCanonicalV33 } from "./history-research-v33.js";

export interface ResearchClusterV3_3 {
  readonly id: string;
  readonly claimIds: readonly string[];
  readonly normalizedTopic: string;
  readonly keyPeople: readonly string[];
  readonly datesOrPeriods: readonly string[];
  readonly places: readonly string[];
  readonly quantities: readonly string[];
  readonly searchQueryCandidates: readonly string[];
  readonly sourceQualityRequirements: readonly string[];
  readonly materialityScore: number;
  readonly visualDependencyScore: number;
  readonly factualRiskScore: number;
  readonly priorityScore: number;
}

const normalizeToken = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values.map(normalizeToken).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

const claimKindRisk = (kind: ClaimV3_3["claimKind"]): number => {
  switch (kind) {
    case "causal":
    case "quantity":
    case "date":
    case "quotation":
      return 3;
    case "comparative":
    case "uncertainty":
    case "event":
      return 2;
    default:
      return 1;
  }
};

const visualHintScore = (claim: ClaimV3_3): number => {
  const text = `${claim.normalizedProposition} ${claim.researchHints.join(" ")}`.toLowerCase();
  let score = 0;
  if (/\b(map|route|border|invasion|campaign|advance|retreat)\b/u.test(text))
    score += 3;
  if (/\b(diagram|timeline|chart|label|quote|quotation)\b/u.test(text))
    score += 2;
  if (claim.geographicQualifiers.length) score += 1;
  if (claim.quantitativeQualifiers.length) score += 1;
  return score;
};

const clusterKeyForClaim = (claim: ClaimV3_3): string => {
  const people = claim.entities
    .filter((entity) => /person|leader|commander|ruler/iu.test(entity.role))
    .map((entity) => normalizeToken(entity.text));
  const places = uniqueSorted([
    ...claim.geographicQualifiers,
    ...claim.entities
      .filter((entity) => /place|location|city|region/iu.test(entity.role))
      .map((entity) => entity.text),
  ]);
  const dates = uniqueSorted(claim.temporalQualifiers);
  const topicTokens = normalizeToken(claim.normalizedProposition)
    .split(" ")
    .filter((token) => token.length > 3)
    .slice(0, 6);
  const primary =
    people[0] ??
    places[0] ??
    dates[0] ??
    topicTokens.slice(0, 3).join("-") ??
    claim.claimKind;
  return [
    claim.claimKind === "causal" ? "causal" : "factual",
    primary,
    places[0] ?? "",
    dates[0] ?? "",
  ].join("|");
};

/**
 * Deterministically cluster related claims before web search.
 * Target band is roughly 8–20 clusters for a ten-minute episode; the count
 * varies with content and never forces one cluster per claim.
 */
export function clusterClaimsForResearchV33(
  claims: readonly ClaimV3_3[]
): ResearchClusterV3_3[] {
  const groups = new Map<string, ClaimV3_3[]>();
  for (const claim of claims) {
    const key = clusterKeyForClaim(claim);
    const existing = groups.get(key) ?? [];
    existing.push(claim);
    groups.set(key, existing);
  }

  // Merge tiny singleton groups that share a person/place/date when the
  // episode would otherwise explode toward one-cluster-per-claim.
  const entries = [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const merged = new Map<string, ClaimV3_3[]>();
  for (const [key, group] of entries) {
    if (group.length > 1) {
      merged.set(key, group);
      continue;
    }
    const alone = group[0]!;
    const people = alone.entities.map((entity) => normalizeToken(entity.text));
    const places = uniqueSorted(alone.geographicQualifiers);
    const dates = uniqueSorted(alone.temporalQualifiers);
    let hostKey: string | null = null;
    for (const [candidateKey, candidateGroup] of merged) {
      const candidatePeople = candidateGroup.flatMap((claim) =>
        claim.entities.map((entity) => normalizeToken(entity.text))
      );
      const candidatePlaces = uniqueSorted(
        candidateGroup.flatMap((claim) => claim.geographicQualifiers)
      );
      const candidateDates = uniqueSorted(
        candidateGroup.flatMap((claim) => claim.temporalQualifiers)
      );
      const shares =
        people.some((person) => candidatePeople.includes(person)) ||
        places.some((place) => candidatePlaces.includes(place)) ||
        dates.some((date) => candidateDates.includes(date));
      if (shares) {
        hostKey = candidateKey;
        break;
      }
    }
    if (hostKey) merged.get(hostKey)!.push(alone);
    else merged.set(key, group);
  }

  const clusters = [...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group], index) => {
      const sortedClaims = [...group].sort((left, right) =>
        left.id.localeCompare(right.id)
      );
      const keyPeople = uniqueSorted(
        sortedClaims.flatMap((claim) =>
          claim.entities.map((entity) => entity.text)
        )
      );
      const datesOrPeriods = uniqueSorted(
        sortedClaims.flatMap((claim) => claim.temporalQualifiers)
      );
      const places = uniqueSorted(
        sortedClaims.flatMap((claim) => claim.geographicQualifiers)
      );
      const quantities = uniqueSorted(
        sortedClaims.flatMap((claim) => claim.quantitativeQualifiers)
      );
      const topicSeed =
        sortedClaims[0]?.normalizedProposition.slice(0, 80) ?? key;
      const searchQueryCandidates = uniqueSorted([
        [keyPeople[0], places[0], datesOrPeriods[0]].filter(Boolean).join(" "),
        ...sortedClaims.flatMap((claim) => claim.researchHints).slice(0, 4),
        topicSeed,
      ]).slice(0, 4);
      const materialityScore = sortedClaims.reduce(
        (sum, claim) => sum + (claim.material ? 2 : 0),
        0
      );
      const visualDependencyScore = sortedClaims.reduce(
        (sum, claim) => sum + visualHintScore(claim),
        0
      );
      const factualRiskScore = sortedClaims.reduce(
        (sum, claim) =>
          sum +
          claimKindRisk(claim.claimKind) +
          (claim.requiresMultipleSources ? 2 : 0) +
          (claim.uncertaintyMarkers.length ? 1 : 0),
        0
      );
      const priorityScore =
        materialityScore * 4 +
        visualDependencyScore * 3 +
        factualRiskScore * 2 +
        sortedClaims.length;
      const sourceQualityRequirements = [
        ...(factualRiskScore >= 6 ? ["prefer-tier-1-or-2"] : ["prefer-tier-1-to-3"]),
        ...(sortedClaims.some((claim) => claim.requiresMultipleSources)
          ? ["require-independent-corroboration"]
          : []),
      ];
      const idSeed = {
        key,
        claimIds: sortedClaims.map((claim) => claim.id),
      };
      return {
        id: `cluster-${String(index + 1).padStart(3, "0")}-${hashCanonicalV33(idSeed).slice(0, 12)}`,
        claimIds: sortedClaims.map((claim) => claim.id),
        normalizedTopic: normalizeToken(topicSeed).slice(0, 120),
        keyPeople,
        datesOrPeriods,
        places,
        quantities,
        searchQueryCandidates,
        sourceQualityRequirements,
        materialityScore,
        visualDependencyScore,
        factualRiskScore,
        priorityScore,
      } satisfies ResearchClusterV3_3;
    });

  return clusters.sort((left, right) => {
    if (right.priorityScore !== left.priorityScore)
      return right.priorityScore - left.priorityScore;
    return left.id.localeCompare(right.id);
  });
}

export function prioritizeResearchClustersV33(
  clusters: readonly ResearchClusterV3_3[]
): ResearchClusterV3_3[] {
  return [...clusters].sort((left, right) => {
    if (right.priorityScore !== left.priorityScore)
      return right.priorityScore - left.priorityScore;
    if (right.materialityScore !== left.materialityScore)
      return right.materialityScore - left.materialityScore;
    if (right.visualDependencyScore !== left.visualDependencyScore)
      return right.visualDependencyScore - left.visualDependencyScore;
    if (right.factualRiskScore !== left.factualRiskScore)
      return right.factualRiskScore - left.factualRiskScore;
    if (right.claimIds.length !== left.claimIds.length)
      return right.claimIds.length - left.claimIds.length;
    return left.id.localeCompare(right.id);
  });
}
