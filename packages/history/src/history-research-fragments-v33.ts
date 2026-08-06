import type { HistoryResearchCostConfigV33 } from "./history-research-cost-config-v33.js";
import type {
  ClaimV3_3,
  EvidenceFragmentV3_3,
  SourceReferenceV3_3,
} from "./history-research-v33.js";

export interface CandidateFragmentSelectionV3_3 {
  readonly claimId: string;
  readonly selectedFragmentIds: readonly string[];
  readonly rejectedFragmentIds: readonly string[];
  readonly ranking: readonly {
    readonly fragmentId: string;
    readonly score: number;
    readonly qualityTier: number;
  }[];
}

const tokenize = (value: string): string[] =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 2);

/**
 * Local candidate evidence selection. Caps fragments per claim and never
 * requires sending full source documents to the model.
 */
export function selectCandidateEvidenceFragmentsV33(input: {
  readonly claims: readonly ClaimV3_3[];
  readonly evidenceFragments: readonly EvidenceFragmentV3_3[];
  readonly sourceReferences: readonly SourceReferenceV3_3[];
  readonly config: Pick<
    HistoryResearchCostConfigV33,
    "maxEvidenceFragmentsPerClaim"
  >;
}): {
  readonly selections: readonly CandidateFragmentSelectionV3_3[];
  readonly fragmentsByClaim: Readonly<
    Record<string, readonly EvidenceFragmentV3_3[]>
  >;
} {
  const sourcesById = new Map(
    input.sourceReferences.map((source) => [source.id, source])
  );
  const max = Math.min(3, input.config.maxEvidenceFragmentsPerClaim);
  const selections: CandidateFragmentSelectionV3_3[] = [];
  const fragmentsByClaim: Record<string, EvidenceFragmentV3_3[]> = {};

  for (const claim of [...input.claims].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const claimTokens = new Set(
      tokenize(
        [
          claim.normalizedProposition,
          ...claim.entities.map((entity) => entity.text),
          ...claim.temporalQualifiers,
          ...claim.geographicQualifiers,
          ...claim.quantitativeQualifiers,
        ].join(" ")
      )
    );
    const ranked = input.evidenceFragments
      .map((fragment) => {
        const source = sourcesById.get(fragment.sourceReferenceId);
        const qualityTier = source?.qualityTier ?? 5;
        const excerptTokens = tokenize(fragment.excerpt);
        const overlap = excerptTokens.reduce(
          (sum, token) => sum + (claimTokens.has(token) ? 1 : 0),
          0
        );
        const diversityBonus = 0;
        const score =
          overlap * 3 + (6 - qualityTier) * 2 + (fragment.independentlyReproducible ? 1 : 0) + diversityBonus;
        return { fragment, score, qualityTier };
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (left.qualityTier !== right.qualityTier)
          return left.qualityTier - right.qualityTier;
        return left.fragment.id.localeCompare(right.fragment.id);
      });

    const selected: EvidenceFragmentV3_3[] = [];
    const usedSources = new Set<string>();
    for (const item of ranked) {
      if (selected.length >= max) break;
      if (item.score <= 0 && selected.length > 0) continue;
      // Prefer source diversity when filling the remaining slots.
      if (
        selected.length > 0 &&
        usedSources.has(item.fragment.sourceReferenceId) &&
        ranked.some(
          (candidate) =>
            !usedSources.has(candidate.fragment.sourceReferenceId) &&
            candidate.score > 0 &&
            !selected.includes(candidate.fragment)
        )
      )
        continue;
      selected.push(item.fragment);
      usedSources.add(item.fragment.sourceReferenceId);
    }

    // If diversity preference skipped everything, fill by score alone.
    if (selected.length === 0)
      selected.push(...ranked.slice(0, max).map((item) => item.fragment));

    const selectedIds = new Set(selected.map((fragment) => fragment.id));
    selections.push({
      claimId: claim.id,
      selectedFragmentIds: selected.map((fragment) => fragment.id),
      rejectedFragmentIds: ranked
        .map((item) => item.fragment.id)
        .filter((id) => !selectedIds.has(id)),
      ranking: ranked.map((item) => ({
        fragmentId: item.fragment.id,
        score: item.score,
        qualityTier: item.qualityTier,
      })),
    });
    fragmentsByClaim[claim.id] = selected;
  }

  return { selections, fragmentsByClaim };
}

/** Build assessment payloads that never include full documents. */
export function buildCompactAssessmentPayloadV33(input: {
  readonly claim: ClaimV3_3;
  readonly fragments: readonly EvidenceFragmentV3_3[];
  readonly sources: readonly SourceReferenceV3_3[];
}): {
  readonly claim: {
    readonly id: string;
    readonly proposition: string;
    readonly kind: ClaimV3_3["claimKind"];
    readonly material: boolean;
    readonly temporalQualifiers: readonly string[];
    readonly geographicQualifiers: readonly string[];
    readonly entities: ClaimV3_3["entities"];
  };
  readonly fragments: readonly {
    readonly id: string;
    readonly excerpt: string;
    readonly sourceReferenceId: string;
    readonly locator: EvidenceFragmentV3_3["locator"];
  }[];
  readonly sourceQuality: readonly {
    readonly id: string;
    readonly qualityTier: number;
    readonly sourceType: string;
  }[];
} {
  const sourceIds = new Set(
    input.fragments.map((fragment) => fragment.sourceReferenceId)
  );
  return {
    claim: {
      id: input.claim.id,
      proposition: input.claim.normalizedProposition,
      kind: input.claim.claimKind,
      material: input.claim.material,
      temporalQualifiers: input.claim.temporalQualifiers,
      geographicQualifiers: input.claim.geographicQualifiers,
      entities: input.claim.entities,
    },
    fragments: input.fragments.map((fragment) => ({
      id: fragment.id,
      excerpt: fragment.excerpt,
      sourceReferenceId: fragment.sourceReferenceId,
      locator: fragment.locator,
    })),
    sourceQuality: input.sources
      .filter((source) => sourceIds.has(source.id))
      .map(({ id, qualityTier, sourceType }) => ({
        id,
        qualityTier,
        sourceType,
      })),
  };
}
