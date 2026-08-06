import type { CanonicalNarrationV3_3, DurationPolicyV3_3, TimingResultV3_3 } from "./history-narration-v33.js";
import type { HistorySourceAuthorityMode } from "./history-trusted-script-v33.js";

export const HISTORY_CLAIM_SCHEMA_V34 = "history-claim.v3.4" as const;
export const HISTORY_VISUAL_SCHEMA_V34 = "history-visual-plan.v3.4" as const;
export const HISTORY_VISUAL_PLANNER_V34 = "history-visual-planner.v3.4.0" as const;
export const HISTORY_APPROVAL_PACK_V34 = "history-approval-pack.v3.4" as const;
export const HISTORY_REPETITION_POLICY_V34 = "history-repetition-policy.v3.4.0" as const;

export type TextSpanV34 = {
  readonly startUtf16: number;
  readonly endUtf16Exclusive: number;
};

export type HistoryClaimKindV34 =
  | "date"
  | "quantity"
  | "person"
  | "place"
  | "event"
  | "institution"
  | "causal"
  | "comparative"
  | "quotation"
  | "interpretation"
  | "uncertainty"
  | "compound"
  | "other";

export type HistoryEntityTypeV34 =
  | "person"
  | "organization"
  | "state"
  | "place"
  | "region"
  | "water-body"
  | "ship"
  | "military-unit"
  | "ethnic-or-cultural-group"
  | "event"
  | "document"
  | "object"
  | "disease"
  | "other";

export type HistoryEntitySemanticRoleV34 =
  | "actor"
  | "leader"
  | "origin"
  | "destination"
  | "location"
  | "institution"
  | "vehicle"
  | "subject"
  | "object"
  | "observer"
  | "other";

export type HistoryProvenanceStatusV34 =
  | "trusted_input"
  | "supported"
  | "partially_supported"
  | "contested"
  | "contradicted"
  | "unresolved"
  | "not_required";

export interface HistoryClaimV34 {
  readonly id: string;
  readonly episodeId: string;
  readonly narrationUnitIds: readonly string[];
  readonly narrationSpans: readonly TextSpanV34[];
  readonly verbatimTexts: readonly string[];
  readonly normalizedProposition: string;
  readonly claimKind: HistoryClaimKindV34;
  readonly materiality: "material" | "non_material";
  readonly entityMentionIds: readonly string[];
  readonly temporalQualifierIds: readonly string[];
  readonly geographicQualifierIds: readonly string[];
  readonly quantitativeQualifierIds: readonly string[];
  readonly uncertaintyMarkers: readonly string[];
  readonly authorityMode: HistorySourceAuthorityMode;
  readonly provenanceStatus: HistoryProvenanceStatusV34;
  readonly trustAttestationId: string | null;
  readonly independentlyVerified: boolean;
  readonly schemaVersion: typeof HISTORY_CLAIM_SCHEMA_V34;
}

export interface HistoryEntityMentionV34 {
  readonly id: string;
  readonly claimId: string;
  readonly text: string;
  readonly normalizedLabel: string;
  readonly entityType: HistoryEntityTypeV34;
  readonly semanticRole: HistoryEntitySemanticRoleV34;
  readonly narrationSpan: TextSpanV34;
  readonly confidenceSource: "deterministic" | "model-proposed" | "metadata" | "editorial";
}

export interface HistoryRejectedEntityV34 {
  readonly text: string;
  readonly reason: string;
  readonly claimId: string | null;
  readonly narrationUnitId: string | null;
}

export interface HistoryTemporalQualifierV34 {
  readonly id: string;
  readonly claimId: string;
  readonly kind: "year" | "month-year" | "date" | "period" | "relative-time" | "duration";
  readonly normalizedValue: string;
  readonly verbatimText: string;
  readonly span: TextSpanV34;
}

export interface HistoryGeographicQualifierV34 {
  readonly id: string;
  readonly claimId: string;
  readonly entityMentionId: string;
  readonly role: "origin" | "destination" | "location" | "region" | "route-waypoint" | "affected-area";
}

export interface HistoryQuantitativeQualifierV34 {
  readonly id: string;
  readonly claimId: string;
  readonly kind: "count" | "percentage" | "distance" | "duration" | "mass" | "range" | "estimate";
  readonly normalizedValue: string;
  readonly unit: string | null;
  readonly verbatimText: string;
  readonly span: TextSpanV34;
}

export interface HistoryPlaceV34 {
  readonly id: string;
  readonly label: string;
  readonly placeType:
    | "country"
    | "city"
    | "region"
    | "island"
    | "water-body"
    | "river"
    | "strait"
    | "cape"
    | "site"
    | "other";
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | null;
  readonly geometrySource: "curated" | "gazetteer" | "editorial" | "unresolved";
  readonly aliases: readonly string[];
}

export type HistoryVisualModalityV34 =
  | "archival image"
  | "historical artwork"
  | "map"
  | "timeline"
  | "date-card"
  | "diagram"
  | "document-or-quotation"
  | "comparison card"
  | "restrained atmospheric reconstruction"
  | "text-only transition"
  | "no generated visual";

export type HistoryTextualVisualKindV34 =
  | "quotation-card"
  | "document-card"
  | "narration-emphasis-card"
  | "summary-card";

export type HistoryMapPurposeV34 =
  | "journey"
  | "expedition-route"
  | "campaign"
  | "migration"
  | "trade"
  | "territorial-change"
  | "orientation"
  | "search-area"
  | "discovery-location"
  | "comparison";

export type HistoryRouteTypeV34 =
  | "maritime"
  | "overland"
  | "river"
  | "mixed"
  | "conceptual"
  | "none";

export interface HistoryMapIntentProposalV34 {
  readonly claimIds: readonly string[];
  readonly mapPurpose: HistoryMapPurposeV34;
  readonly movingActorEntityMentionIds: readonly string[];
  readonly originPlaceMentionIds: readonly string[];
  readonly destinationPlaceMentionIds: readonly string[];
  readonly waypointPlaceMentionIds: readonly string[];
  readonly temporalQualifierIds: readonly string[];
  readonly routeType: HistoryRouteTypeV34;
  readonly uncertainty: readonly string[];
  readonly leaderEntityMentionIds?: readonly string[];
}

export interface HistoryMapRouteV34 {
  readonly id: string;
  readonly routeType: HistoryRouteTypeV34;
  readonly originPlaceId: string;
  readonly destinationPlaceId: string;
  readonly origin: {
    readonly label: string;
    readonly coordinates: readonly [number, number] | null;
  };
  readonly destination: {
    readonly label: string;
    readonly coordinates: readonly [number, number] | null;
  };
  readonly movingActor: string;
  readonly movingActorEntityMentionId: string | null;
  readonly leaders: readonly string[];
  readonly carrierOrVehicle: string | null;
  readonly dateOrPeriod: string;
  readonly label: string;
  readonly uncertainty: string;
  readonly linkedClaimIds: readonly string[];
}

export interface HistoryMapStateV34 {
  readonly id: string;
  readonly masterId: string;
  readonly purpose: string;
  readonly mapPurpose: HistoryMapPurposeV34;
  readonly baseGeography: string;
  readonly timePeriod: string;
  readonly affectedArea: string;
  readonly labels: readonly {
    readonly text: string;
    readonly placeId: string | null;
    readonly linkedClaimIds: readonly string[];
  }[];
  readonly routes: readonly HistoryMapRouteV34[];
  readonly uncertainty: string;
  readonly semanticStatus: "valid" | "blocked";
  readonly blockerCodes: readonly string[];
}

export interface HistoryDiagramProposalV34 {
  readonly claimIds: readonly string[];
  readonly diagramType:
    | "causal-chain"
    | "process"
    | "institutional"
    | "comparison"
    | "hierarchy"
    | "decision-tree"
    | "network"
    | "resource-flow"
    | "uncertainty-range";
  readonly questionAnswered: string;
  readonly nodes: readonly {
    readonly proposalId: string;
    readonly label: string;
    readonly claimIds: readonly string[];
    readonly entityMentionIds: readonly string[];
  }[];
  readonly edges: readonly {
    readonly fromProposalId: string;
    readonly toProposalId: string;
    readonly relationship:
      | "causes"
      | "contributes-to"
      | "leads-to"
      | "contains"
      | "commands"
      | "contrasts-with"
      | "depends-on"
      | "associated-with"
      | "sequence";
    readonly claimIds: readonly string[];
  }[];
}

export interface HistoryDiagramStateV34 {
  readonly id: string;
  readonly masterId: string;
  readonly diagramType: HistoryDiagramProposalV34["diagramType"];
  readonly exactQuestion: string;
  readonly nodes: readonly {
    readonly id: string;
    readonly label: string;
    readonly linkedClaimIds: readonly string[];
    readonly entityMentionIds: readonly string[];
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly relationship: HistoryDiagramProposalV34["edges"][number]["relationship"];
    readonly linkedClaimIds: readonly string[];
  }[];
  readonly semanticStatus: "valid" | "blocked";
  readonly blockerCodes: readonly string[];
  readonly fallbackDecision: string | null;
}

export interface HistoryTimelineEventV34 {
  readonly id: string;
  readonly claimIds: readonly string[];
  readonly label: string;
  readonly temporalQualifierIds: readonly string[];
  readonly dateSortKey: string | null;
  readonly uncertainty: readonly string[];
}

export interface HistoryTimelineStateV34 {
  readonly id: string;
  readonly masterId: string;
  readonly eventIds: readonly string[];
  readonly orderingStatus: "valid" | "ambiguous" | "invalid";
}

export interface HistoryDocumentStateV34 {
  readonly id: string;
  readonly masterId: string;
  readonly kind: HistoryTextualVisualKindV34;
  readonly title: string;
  readonly displayText: string | null;
  /** @deprecated use displayText; retained for pack compatibility */
  readonly quotationText: string | null;
  readonly linkedClaimIds: readonly string[];
  readonly uncertainty: readonly string[];
}

export interface HistoryDateCardStateV34 {
  readonly id: string;
  readonly masterId: string;
  readonly label: string;
  readonly temporalQualifierIds: readonly string[];
  readonly dateSortKey: string | null;
  readonly linkedClaimIds: readonly string[];
}

export interface HistoryVisualPurposeV34 {
  readonly id: string;
  readonly beatId: string;
  readonly narrationSpan: TextSpanV34;
  readonly linkedClaimIds: readonly string[];
  readonly protectedFactualMeaning: string;
  readonly recommendedModality: HistoryVisualModalityV34;
  readonly visualPurpose: string;
  readonly semanticJustification: string;
  readonly disallowedMisleadingTreatments: readonly string[];
  readonly requiredEntityMentionIds: readonly string[];
  readonly requiredTemporalQualifierIds: readonly string[];
  readonly requiredGeographicQualifierIds: readonly string[];
  readonly requiredQuantitativeQualifierIds: readonly string[];
  readonly uncertainty: readonly string[];
  readonly fallbackDecision: {
    readonly rejectedModality: HistoryVisualModalityV34;
    readonly reasonForRejection: string;
    readonly selectedFallback: HistoryVisualModalityV34;
    readonly semanticJustification: string;
  } | null;
}

export interface HistoryBeatV34 {
  readonly id: string;
  readonly narrationUnitIds: readonly string[];
  readonly narrationSpan: TextSpanV34;
  readonly startMs: number;
  readonly endMs: number;
  readonly linkedClaimIds: readonly string[];
  readonly visualPurposeId: string;
  readonly modality: HistoryVisualModalityV34;
  readonly assetIntentId: string;
  readonly mapMasterId: string | null;
  readonly mapStateId: string | null;
  readonly diagramMasterId: string | null;
  readonly diagramStateId: string | null;
  readonly timelineMasterId: string | null;
  readonly timelineStateId: string | null;
  readonly dateCardStateId: string | null;
  readonly documentStateId: string | null;
  readonly shotIds: readonly string[];
  readonly transition: string;
  readonly continuityNotes: string;
  readonly uncertaintyTreatment: string;
  readonly aspectRatioPlanIds: readonly string[];
}

export interface HistoryShotV34 {
  readonly id: string;
  readonly beatId: string;
  readonly purpose: string;
  readonly durationMs: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly framing: string;
  readonly cameraMovement: string;
  readonly subject: string;
  readonly action: string;
  readonly foreground: string;
  readonly midground: string;
  readonly background: string;
  readonly factualLabels: readonly string[];
  readonly permittedMotion: readonly string[];
  readonly prohibitedAdditions: readonly string[];
  readonly transition: string;
  readonly linkedClaimIds: readonly string[];
  readonly modalityStateReference: string | null;
  readonly adaptation16x9: string;
  readonly adaptation9x16: string;
  readonly reconstructionPolicy: "not-applicable" | "illustrative-not-evidence";
}

export interface AspectRatioPlanV34 {
  readonly id: string;
  readonly beatId: string;
  readonly visualPurposeId: string;
  readonly ratio: "16:9" | "9:16";
  readonly modality: HistoryVisualModalityV34;
  readonly protectedSubject: string;
  readonly retainedRouteIds: readonly string[];
  readonly retainedLabels: readonly string[];
  readonly removedLabels: readonly string[];
  readonly labelPriority: readonly string[];
  readonly cropBounds: string;
  readonly orientation: "landscape" | "portrait";
  readonly routeSimplification: string;
  readonly waypointSimplification: string;
  readonly legendPlacement: string;
  readonly retainedNodes: readonly string[];
  readonly removedOrMergedNodes: readonly string[];
  readonly retainedEdges: readonly string[];
  readonly verticalOrdering: readonly string[];
  readonly retainedEvents: readonly string[];
  readonly eventGrouping: readonly string[];
  readonly layout: "horizontal" | "vertical" | "not-applicable";
  readonly minimumTextSizePx: number;
  readonly textDensityResult: "pass" | "warning" | "block";
  readonly conflictDiagnostics: readonly string[];
  readonly evaluated: true;
  readonly independentPortraitRenderingMandatory: boolean;
}

export interface HistoryQualityThresholdsV34 {
  readonly maxExactPurposeDuplicateRate: number;
  readonly maxSemanticPurposeDuplicateRate: number;
  readonly maxDominantCameraRate: number;
  readonly maxTwoInstructionAlternationRate: number;
  readonly maxShotStructureDuplicateRate: number;
  readonly maxAssetTreatmentDuplicateRate: number;
  readonly maxGenericFieldReuseRate: number;
  readonly maxOneShotPerLongBeatRate: number;
}

export interface HistoryDuplicateClusterV34 {
  readonly kind: string;
  readonly signature: string;
  readonly beatIds: readonly string[];
  readonly shotIds: readonly string[];
}

export interface HistoryQualityMetricsV34 {
  readonly policyVersion: typeof HISTORY_REPETITION_POLICY_V34;
  readonly exactPurposeDuplicateRate: number;
  readonly semanticPurposeDuplicateRate: number;
  readonly dominantCameraRate: number;
  readonly twoInstructionAlternationRate: number;
  readonly shotStructureDuplicateRate: number;
  readonly assetTreatmentDuplicateRate: number;
  readonly genericFieldReuseRate: number;
  readonly oneShotPerLongBeatRate: number;
  readonly thresholds: HistoryQualityThresholdsV34;
  readonly duplicateClusters: readonly HistoryDuplicateClusterV34[];
  readonly passes: boolean;
  readonly explicitOverride: boolean;
}

export interface HistoryDiagnosticV34 {
  readonly code: string;
  readonly severity: "error" | "warning" | "information";
  readonly gate: "structural" | "editorial" | "content" | "production";
  readonly message: string;
  readonly remediation: string;
  readonly affectedIds: readonly string[];
}

export interface HistoryApprovalV34 {
  readonly structurallyValid: boolean;
  readonly editoriallyReviewable: boolean;
  readonly contentApprovalEligible: boolean;
  readonly productionApprovalEligible: boolean;
  readonly structural: { readonly state: "reviewable" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly editorial: { readonly state: "production_plan_reviewable" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly content: { readonly state: "eligible" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly production: { readonly state: "eligible" | "blocked"; readonly blockerCodes: readonly string[] };
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly overrideStatus: "none" | "valid" | "invalidated";
}

export interface HistoryVisualPlanV34 {
  readonly schemaVersion: typeof HISTORY_VISUAL_SCHEMA_V34;
  readonly plannerVersion: typeof HISTORY_VISUAL_PLANNER_V34;
  readonly episodeId: string;
  readonly title: string;
  readonly sourceAuthorityMode: HistorySourceAuthorityMode;
  readonly trustSnapshotHash: string;
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
  readonly visualPurposes: readonly HistoryVisualPurposeV34[];
  readonly beats: readonly HistoryBeatV34[];
  readonly shots: readonly HistoryShotV34[];
  readonly assetIntents: readonly {
    readonly id: string;
    readonly beatId: string;
    readonly modality: HistoryVisualModalityV34;
    readonly factual: boolean;
    readonly linkedClaimIds: readonly string[];
  }[];
  readonly mediaDecisions: readonly {
    readonly id: string;
    readonly beatId: string;
    readonly selectedModality: HistoryVisualModalityV34;
    readonly rejectedModalities: readonly HistoryVisualModalityV34[];
    readonly justification: string;
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
    readonly diagramType: HistoryDiagramProposalV34["diagramType"];
    readonly exactQuestion: string;
    readonly supportedRatios: readonly ["16:9", "9:16"];
  }[];
  readonly diagramStates: readonly HistoryDiagramStateV34[];
  readonly timelineMasters: readonly {
    readonly id: string;
    readonly purpose: string;
    readonly supportedRatios: readonly ["16:9", "9:16"];
  }[];
  readonly timelineStates: readonly HistoryTimelineStateV34[];
  readonly timelineEvents: readonly HistoryTimelineEventV34[];
  readonly dateCardStates: readonly HistoryDateCardStateV34[];
  readonly documentStates: readonly HistoryDocumentStateV34[];
  readonly aspectRatioPlans: readonly AspectRatioPlanV34[];
  readonly qualityMetrics: HistoryQualityMetricsV34;
  readonly diagnostics: readonly HistoryDiagnosticV34[];
  readonly approval: HistoryApprovalV34;
  readonly planHash: string;
}

export const DEFAULT_HISTORY_QUALITY_THRESHOLDS_V34: HistoryQualityThresholdsV34 = {
  maxExactPurposeDuplicateRate: 0,
  maxSemanticPurposeDuplicateRate: 0.25,
  maxDominantCameraRate: 0.5,
  maxTwoInstructionAlternationRate: 0.8,
  maxShotStructureDuplicateRate: 0.35,
  maxAssetTreatmentDuplicateRate: 0.4,
  maxGenericFieldReuseRate: 0.35,
  maxOneShotPerLongBeatRate: 0.5,
};
