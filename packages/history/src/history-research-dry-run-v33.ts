import type { HistoryResearchCostConfigV33 } from "./history-research-cost-config-v33.js";
import type { CanonicalNarrationV3_3 } from "./history-narration-v33.js";
import type { ClaimV3_3 } from "./history-research-v33.js";
import { clusterClaimsForResearchV33 } from "./history-research-clusters-v33.js";

export interface HistoryResearchDryRunEstimateV3_3 {
  readonly mode: "dry-run";
  readonly paidCalls: false;
  readonly effectiveModels: {
    readonly claimExtractionModel: string;
    readonly evidenceAssessmentModel: string;
    readonly researchQueryModel: string;
    readonly visualSemanticModel: string;
    readonly escalationModel: string;
  };
  readonly batchApi: {
    readonly requested: boolean;
    readonly availability: "unknown-until-live" | "fixture" | "disabled";
  };
  readonly expectedExtractionBatches: number;
  readonly expectedClusterCount: number;
  readonly webSearchSoftLimit: number;
  readonly webSearchHardCeiling: number;
  readonly maxSearchesPerCluster: number;
  readonly maxAlternateSourceAttempts: number;
  readonly evidenceFragmentCap: number;
  readonly maxAssessmentPairs: number;
  readonly softCostBudgetUsd: number;
  readonly hardCostBudgetUsd: number;
  readonly cache: {
    readonly resumeCompletedBatches: boolean;
    readonly reuseRetrievedSources: boolean;
    readonly enablePromptCaching: boolean;
  };
  readonly promptCacheKeys: {
    readonly claimExtraction: string;
    readonly evidenceAssessment: string;
    readonly visualSemantics: string;
  };
}

export function estimateHistoryResearchDryRunV33(input: {
  readonly config: HistoryResearchCostConfigV33;
  readonly narration: CanonicalNarrationV3_3;
  readonly claims?: readonly ClaimV3_3[];
}): HistoryResearchDryRunEstimateV3_3 {
  const unitCount = input.narration.units.length;
  const batchSize = input.config.claimExtractionBatchSize;
  const expectedExtractionBatches = Math.max(1, Math.ceil(unitCount / batchSize));
  const claims = input.claims ?? [];
  const expectedClusterCount =
    claims.length > 0
      ? clusterClaimsForResearchV33(claims).length
      : Math.max(1, Math.min(20, Math.ceil(unitCount / 4)));
  const maxAssessmentPairs =
    Math.max(claims.length, Math.ceil(unitCount * 1.5)) *
    input.config.maxEvidenceFragmentsPerClaim;
  return {
    mode: "dry-run",
    paidCalls: false,
    effectiveModels: {
      claimExtractionModel: input.config.claimExtractionModel,
      evidenceAssessmentModel: input.config.evidenceAssessmentModel,
      researchQueryModel: input.config.researchQueryModel,
      visualSemanticModel: input.config.visualSemanticModel,
      escalationModel: input.config.escalationModel,
    },
    batchApi: {
      requested: input.config.useBatchApi,
      availability: input.config.useBatchApi
        ? "unknown-until-live"
        : "disabled",
    },
    expectedExtractionBatches,
    expectedClusterCount,
    webSearchSoftLimit: input.config.maxWebSearchCallsPerEpisode,
    webSearchHardCeiling: input.config.hardMaxWebSearchCallsPerEpisode,
    maxSearchesPerCluster: input.config.maxSearchesPerResearchCluster,
    maxAlternateSourceAttempts: input.config.maxAlternateSourceAttempts,
    evidenceFragmentCap: input.config.maxEvidenceFragmentsPerClaim,
    maxAssessmentPairs,
    softCostBudgetUsd: input.config.softCostBudgetUsdPerEpisode,
    hardCostBudgetUsd: input.config.hardCostBudgetUsdPerEpisode,
    cache: {
      resumeCompletedBatches: input.config.resumeCompletedBatches,
      reuseRetrievedSources: input.config.reuseRetrievedSources,
      enablePromptCaching: input.config.enablePromptCaching,
    },
    promptCacheKeys: {
      claimExtraction:
        "history-v33-claim-extraction-history-claim-extraction-prompt.v3.3.1-history-claim.v3.3",
      evidenceAssessment:
        "history-v33-evidence-assessment-history-evidence-assessment-prompt.v3.3.1-history-claim-evidence-assessment.v3.3",
      visualSemantics:
        "history-v33-visual-semantics-history-visual-purpose-prompt.v3.3.1-history-visual-purpose-proposal.v3.3",
    },
  };
}
