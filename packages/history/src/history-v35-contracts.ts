import type { CanonicalNarrationV3_3, DurationPolicyV3_3, TimingResultV3_3 } from "./history-narration-v33.js";
import type { HistorySourceAuthorityMode } from "./history-trusted-script-v33.js";
import type {
  AspectRatioPlanV34,
  HistoryApprovalV34,
  HistoryBeatV34,
  HistoryClaimV34,
  HistoryDateCardStateV34,
  HistoryDiagnosticV34,
  HistoryDiagramStateV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapStateV34,
  HistoryPlaceV34,
  HistoryQuantitativeQualifierV34,
  HistoryRejectedEntityV34,
  HistoryShotV34,
  HistoryTemporalQualifierV34,
  HistoryVisualPurposeV34,
  HistoryMapPurposeV34,
  HistoryReconstructionPolicyV34,
} from "./history-v34-contracts.js";

export const HISTORY_CLAIM_SCHEMA_V35 = "history-claim.v3.5" as const;
export const HISTORY_VISUAL_SCHEMA_V35 = "history-visual-plan.v3.5" as const;
export const HISTORY_VISUAL_PLANNER_V35 = "history-visual-planner.v3.5.0" as const;
export const HISTORY_APPROVAL_PACK_V35 = "history-approval-pack.v3.5" as const;
export const HISTORY_REPETITION_POLICY_V35 = "history-repetition-policy.v3.5.0" as const;

export type HistoryVisualModalityV35 =
  | "archival image"
  | "historical artwork"
  | "map"
  | "timeline"
  | "date-card"
  | "diagram"
  | "document"
  | "quotation"
  | "narration-emphasis"
  | "comparison card"
  | "restrained atmospheric reconstruction"
  | "text-only transition"
  | "no generated visual";

export type HistoryTextualVisualKindV35 =
  | "quotation-card"
  | "document-card"
  | "narration-emphasis-card"
  | "summary-card";

export type HistoryTemporalPrecisionV35 =
  | "exact-date"
  | "month-year"
  | "year"
  | "year-range"
  | "approximate-period"
  | "relative"
  | "unresolved";

export interface HistoryTemporalBoundsV35 {
  readonly precision: HistoryTemporalPrecisionV35;
  readonly earliestYear: number | null;
  readonly latestYear: number | null;
  readonly sortKey: readonly [number, number, number];
  readonly label: string;
  readonly unresolved: boolean;
}

export interface HistoryVisualConceptV35 {
  readonly id: string;
  readonly beatId: string;
  readonly modality: HistoryVisualModalityV35;
  readonly historicalSubject: string;
  readonly approximatePeriod: string | null;
  readonly settingGeography: string | null;
  readonly evidenceSourceClass: string;
  readonly intendedComposition: string;
  readonly protectedFactualRelation: string;
  readonly uncertaintyLimits: readonly string[];
  readonly forbiddenAnachronisms: readonly string[];
  readonly fingerprint: string;
}

export type HistoryVisualChangeKindV35 =
  | "asset-change"
  | "crop-reframe"
  | "camera-motion"
  | "animated-reveal"
  | "map-state-change"
  | "diagram-state-change"
  | "text-state-change"
  | "transition";

export interface HistoryShotVisualChangeV35 {
  readonly shotId: string;
  readonly beatId: string;
  readonly durationMs: number;
  readonly changeKinds: readonly HistoryVisualChangeKindV35[];
  readonly resetsVisualClock: boolean;
}

export interface HistoryEffectiveChangeMetricsV35 {
  readonly longStaticRuntimeShare: number;
  readonly strongLongStaticRuntimeShare: number;
  readonly longestUnchangedVisualIntervalMs: number;
  readonly effectiveChangeCadenceMs: number;
  readonly shotVisualChanges: readonly HistoryShotVisualChangeV35[];
}

export type HistoryHistoricalApprovalStateV35 =
  | "trusted_input"
  | "explicit_human_attestation"
  | "independently_verified"
  | "unattested";

export interface HistoryTrustApprovalSummaryV35 {
  readonly sourceAuthorityMode: HistorySourceAuthorityMode;
  readonly historicalApprovalState: HistoryHistoricalApprovalStateV35;
  readonly attestationBound: boolean;
  readonly attestationActor: string | null;
  readonly attestationTimestamp: string | null;
  readonly independentlyVerifiedClaimCount: number;
  readonly productionHistoricalApprovalEligible: boolean;
}

export interface HistoryTimelineEventV35 {
  readonly id: string;
  readonly claimIds: readonly string[];
  readonly label: string;
  readonly temporalQualifierIds: readonly string[];
  readonly temporalBounds: HistoryTemporalBoundsV35;
  readonly uncertainty: readonly string[];
}

export interface HistoryTimelineStateV35 {
  readonly id: string;
  readonly masterId: string;
  readonly eventIds: readonly string[];
  readonly orderingStatus: "valid" | "ambiguous" | "invalid";
  readonly renderRole: "beat-referenced" | "auxiliary-metadata";
}

export interface HistoryDocumentStateV35 {
  readonly id: string;
  readonly masterId: string;
  readonly kind: HistoryTextualVisualKindV35;
  readonly title: string;
  readonly displayText: string | null;
  readonly quotationText: string | null;
  readonly sourceDocumentId: string | null;
  readonly sourceProvenance: string | null;
  readonly linkedClaimIds: readonly string[];
  readonly uncertainty: readonly string[];
}

export interface HistoryQualityThresholdsV35 {
  readonly maxExactPurposeDuplicateRate: number;
  readonly maxSemanticPurposeDuplicateRate: number;
  readonly maxVisualConceptTemplateDuplicateRate: number;
  readonly maxDominantCameraRate: number;
  readonly maxTwoInstructionAlternationRate: number;
  readonly maxShotStructureDuplicateRate: number;
  readonly maxAssetTreatmentDuplicateRate: number;
  readonly maxGenericFieldReuseRate: number;
  readonly maxOneShotPerLongBeatRate: number;
  readonly maxLongStaticRuntimeShare: number;
  readonly maxStrongLongStaticRuntimeShare: number;
}

export interface HistoryQualityMetricsV35 {
  readonly policyVersion: typeof HISTORY_REPETITION_POLICY_V35;
  readonly exactPurposeDuplicateRate: number;
  readonly semanticPurposeDuplicateRate: number;
  readonly visualConceptTemplateDuplicateRate: number;
  readonly dominantCameraRate: number;
  readonly twoInstructionAlternationRate: number;
  readonly shotStructureDuplicateRate: number;
  readonly assetTreatmentDuplicateRate: number;
  readonly genericFieldReuseRate: number;
  readonly oneShotPerLongBeatRate: number;
  readonly effectiveChange: HistoryEffectiveChangeMetricsV35;
  readonly thresholds: HistoryQualityThresholdsV35;
  readonly duplicateClusters: readonly {
    readonly kind: string;
    readonly signature: string;
    readonly beatIds: readonly string[];
    readonly shotIds: readonly string[];
  }[];
  readonly passes: boolean;
  readonly explicitOverride: boolean;
}

export interface HistoryBeatV35 extends Omit<HistoryBeatV34, "modality"> {
  readonly modality: HistoryVisualModalityV35;
}

export interface HistoryVisualPurposeV35 extends Omit<HistoryVisualPurposeV34, "recommendedModality" | "fallbackDecision"> {
  readonly recommendedModality: HistoryVisualModalityV35;
  readonly visualConceptId: string | null;
  readonly fallbackDecision: {
    readonly rejectedModality: HistoryVisualModalityV35;
    readonly reasonForRejection: string;
    readonly selectedFallback: HistoryVisualModalityV35;
    readonly semanticJustification: string;
    readonly internalDiagnosticCode?: string;
  } | null;
}

export type AspectRatioPlanV35 = Omit<AspectRatioPlanV34, "modality"> & {
  readonly modality: HistoryVisualModalityV35;
};

export interface HistoryVisualPlanV35 {
  readonly schemaVersion: typeof HISTORY_VISUAL_SCHEMA_V35;
  readonly plannerVersion: typeof HISTORY_VISUAL_PLANNER_V35;
  readonly episodeId: string;
  readonly title: string;
  readonly sourceAuthorityMode: HistorySourceAuthorityMode;
  readonly trustSnapshotHash: string;
  readonly trustApproval: HistoryTrustApprovalSummaryV35;
  readonly narration: CanonicalNarrationV3_3;
  readonly durationPolicy: DurationPolicyV3_3;
  readonly timing: TimingResultV3_3;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly rejectedEntities: readonly HistoryRejectedEntityV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly quantitativeQualifiers: readonly HistoryQuantitativeQualifierV34[];
  readonly places: readonly HistoryPlaceV34[];
  readonly visualConcepts: readonly HistoryVisualConceptV35[];
  readonly visualPurposes: readonly HistoryVisualPurposeV35[];
  readonly beats: readonly HistoryBeatV35[];
  readonly shots: readonly HistoryShotV34[];
  readonly assetIntents: readonly {
    readonly id: string;
    readonly beatId: string;
    readonly modality: HistoryVisualModalityV35;
    readonly factual: boolean;
    readonly linkedClaimIds: readonly string[];
  }[];
  readonly mediaDecisions: readonly {
    readonly id: string;
    readonly beatId: string;
    readonly selectedModality: HistoryVisualModalityV35;
    readonly rejectedModalities: readonly HistoryVisualModalityV35[];
    readonly justification: string;
    readonly internalDiagnosticCode?: string;
  }[];
  readonly mapMasters: readonly {
    readonly id: string;
    readonly purpose: string;
    readonly mapPurpose: HistoryMapPurposeV34;
    readonly supportedRatios: readonly ["16:9", "9:16"];
  }[];
  readonly mapStates: readonly HistoryMapStateV34[];
  readonly diagramMasters: readonly {
    readonly id: string;
    readonly diagramType: HistoryDiagramStateV34["diagramType"];
    readonly exactQuestion: string;
    readonly supportedRatios: readonly ["16:9", "9:16"];
  }[];
  readonly diagramStates: readonly HistoryDiagramStateV34[];
  readonly timelineMasters: readonly {
    readonly id: string;
    readonly purpose: string;
    readonly supportedRatios: readonly ["16:9", "9:16"];
  }[];
  readonly timelineStates: readonly HistoryTimelineStateV35[];
  readonly timelineEvents: readonly HistoryTimelineEventV35[];
  readonly dateCardStates: readonly HistoryDateCardStateV34[];
  readonly documentStates: readonly HistoryDocumentStateV35[];
  readonly aspectRatioPlans: readonly AspectRatioPlanV35[];
  readonly qualityMetrics: HistoryQualityMetricsV35;
  readonly diagnostics: readonly HistoryDiagnosticV34[];
  readonly approval: HistoryApprovalV34;
  readonly planHash: string;
}

export const DEFAULT_HISTORY_QUALITY_THRESHOLDS_V35: HistoryQualityThresholdsV35 = {
  maxExactPurposeDuplicateRate: 0,
  maxSemanticPurposeDuplicateRate: 0.2,
  maxVisualConceptTemplateDuplicateRate: 0.15,
  maxDominantCameraRate: 0.45,
  maxTwoInstructionAlternationRate: 0.75,
  maxShotStructureDuplicateRate: 0.3,
  maxAssetTreatmentDuplicateRate: 0.35,
  maxGenericFieldReuseRate: 0.25,
  maxOneShotPerLongBeatRate: 0.35,
  maxLongStaticRuntimeShare: 0.45,
  maxStrongLongStaticRuntimeShare: 0.2,
};

export const PORTRAIT_REFRAME_LABEL_V35 =
  "portrait-safe crop and vertical reflow (aspect-ratio adaptation only)" as const;

export type HistoryReconstructionPolicyV35 = HistoryReconstructionPolicyV34;
