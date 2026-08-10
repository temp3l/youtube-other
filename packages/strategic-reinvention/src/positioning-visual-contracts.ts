import type {
  VeronicaChapterVisualPlan,
  VeronicaNarrativeFunction,
  VeronicaVisualFamily,
  VeronicaVisualStoryBible,
} from "./veronica-visual-language.js";

export const POSITIONING_PLANNER_VERSION =
  "veronicabenini-positioning-visual-planner.v2.2" as const;
export const POSITIONING_PLAN_VERSION =
  "veronicabenini-positioning-visual-plan.v2" as const;
export const POSITIONING_REVIEW_VERSION =
  "veronicabenini-positioning-bulk-visual-review.v2" as const;
export const POSITIONING_VOCABULARY_VERSION =
  "veronicabenini-positioning-visual-vocabulary.v1" as const;
export const POSITIONING_TITLE_QA_VERSION =
  "veronicabenini-title-transcreation-qa.v2" as const;

export const POSITIONING_LOCALES = ["en", "de", "it", "fr", "pt"] as const;
export type PositioningLocale = (typeof POSITIONING_LOCALES)[number];
export type PositioningFormat = "long" | "short";
export type AspectRatio = "16:9" | "9:16";

export type CommunicationIntent =
  | "create-tension"
  | "show-consequence"
  | "compare-alternatives"
  | "make-proof-visible"
  | "explain-causality"
  | "explain-process"
  | "define-category"
  | "show-transformation"
  | "prompt-decision"
  | "deliver-payoff";

export type VisualStrategy =
  | "human-scenario"
  | "symbolic-metaphor"
  | "environmental-storytelling"
  | "product-object-still-life"
  | "comparison-composition"
  | "transformation"
  | "before-after"
  | "process-visualization"
  | "social-interaction"
  | "client-decision"
  | "audience-segmentation"
  | "publishing-media-authority"
  | "content-ecosystem"
  | "identity-perception"
  | "evidence-proof"
  | "market-crowd"
  | "abstract-conceptual"
  | "semantic-diagram";

/** The semantic owner of the scene's primary visible action. */
export type VeronicaActionOwnerRole = "expert" | "buyer" | "shared" | "none";

export type ProgressionStage =
  | "COLD_OPEN"
  | "HOOK"
  | "PROOF"
  | "MANIFESTATION"
  | "REVERSAL"
  | "EXPLANATION"
  | "METHOD"
  | "PAYOFF";

export interface DiagramNode {
  readonly id: string;
  readonly semanticRole: string;
  readonly labelKey: string;
}

export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly semanticRole: string;
}

interface DiagramBase {
  readonly diagramId: string;
  readonly proposition: string;
  readonly textFreeBackground: true;
  readonly overlayLabelKeys: readonly string[];
}

export type DiagramTopology =
  | (DiagramBase & {
      readonly type: "comparison";
      readonly entities: readonly [DiagramNode, DiagramNode, ...DiagramNode[]];
      readonly relation: "versus" | "trade-off" | "contrast";
    })
  | (DiagramBase & {
      readonly type: "sequence";
      readonly orderedNodes: readonly [DiagramNode, DiagramNode, DiagramNode, ...DiagramNode[]];
      readonly edges: readonly DiagramEdge[];
    })
  | (DiagramBase & {
      readonly type: "hierarchy";
      readonly root: DiagramNode;
      readonly children: readonly [DiagramNode, DiagramNode, ...DiagramNode[]];
      readonly edges: readonly DiagramEdge[];
    })
  | (DiagramBase & {
      readonly type: "hub-spoke";
      readonly hub: DiagramNode;
      readonly spokes: readonly [DiagramNode, DiagramNode, DiagramNode, ...DiagramNode[]];
      readonly edges: readonly DiagramEdge[];
    })
  | (DiagramBase & {
      readonly type: "intersection";
      readonly sets: readonly [DiagramNode, DiagramNode, ...DiagramNode[]];
      readonly intersectionMeaning: string;
    })
  | (DiagramBase & {
      readonly type: "funnel";
      readonly stages: readonly [DiagramNode, DiagramNode, DiagramNode, ...DiagramNode[]];
      readonly direction: "broad-to-narrow";
    })
  | (DiagramBase & {
      readonly type: "matrix";
      readonly xAxis: { readonly low: string; readonly high: string };
      readonly yAxis: { readonly low: string; readonly high: string };
      readonly cells: readonly [DiagramNode, DiagramNode, DiagramNode, DiagramNode, ...DiagramNode[]];
    })
  | (DiagramBase & {
      readonly type: "before-after";
      readonly before: DiagramNode;
      readonly transformation: DiagramNode;
      readonly after: DiagramNode;
      readonly edges: readonly [DiagramEdge, DiagramEdge, ...DiagramEdge[]];
    })
  | (DiagramBase & {
      readonly type: "cause-effect";
      readonly causes: readonly [DiagramNode, DiagramNode, ...DiagramNode[]];
      readonly effect: DiagramNode;
      readonly edges: readonly DiagramEdge[];
    });

export interface VisualVocabulary {
  readonly schemaVersion: typeof POSITIONING_VOCABULARY_VERSION;
  readonly episodeId: string;
  readonly semanticDomains: readonly string[];
  readonly recurringMotifs: readonly string[];
  readonly environments: readonly string[];
  readonly materialPalette: readonly string[];
  readonly excludedCliches: readonly string[];
  readonly sourceSemanticHash: string;
  readonly cacheKey: string;
  readonly vocabularyHash: string;
}

export interface PersistentProtagonistContinuity {
  readonly mode: "persistent-protagonist";
  readonly identityId: string;
  readonly identityFingerprint: string;
  readonly appearance: {
    readonly ageBand: string;
    readonly genderPresentation: string;
    readonly hair: string;
    readonly wardrobeAnchor: string;
  };
  readonly referencePolicy: "reuse-only-for-linked-scenes";
  readonly linkedSceneIds: readonly string[];
}

export interface EnsembleContinuity {
  readonly mode: "ensemble-independent";
  readonly variationDimensions: readonly [
    "age",
    "gender-presentation",
    "profession",
    "environment",
    "framing",
  ];
  readonly scenesShareIdentity: false;
}

export type ContinuityPlan =
  | PersistentProtagonistContinuity
  | EnsembleContinuity;

export interface VisualGrammarFeatures {
  readonly strategy: VisualStrategy;
  readonly subjectArchetype: string;
  readonly environment: string;
  readonly composition: string;
  readonly camera: string;
  readonly props: readonly string[];
  readonly topology: DiagramTopology["type"] | "none";
  readonly semanticTokens: readonly string[];
  readonly continuityIdentityId: string | null;
}

export interface ViewerVisibleHookFingerprint {
  readonly strategyFamily: VisualStrategy;
  readonly subjectArchetype: string;
  readonly environmentArchetype: string;
  readonly compositionArchetype: string;
  readonly cameraArchetype: string;
  readonly lightingArchetype: string;
  readonly actionArchetype: string;
  readonly dominantObjectArchetype: string;
  readonly motionArchetype: string;
}

export interface OpeningFingerprintEntry {
  readonly contentId: string;
  readonly parentLongFormId: string;
  readonly fingerprint: ViewerVisibleHookFingerprint;
  readonly signature: string;
}

export interface OpeningDiversityDiagnostics {
  readonly entries: readonly OpeningFingerprintEntry[];
  readonly exactDuplicateGroups: readonly {
    readonly signature: string;
    readonly contentIds: readonly string[];
  }[];
  readonly exactDuplicateRate: number;
  readonly maxExactSignatureFrequency: number;
  readonly primaryStrategyDistribution: Readonly<Partial<Record<VisualStrategy, number>>>;
  readonly cameraCompositionDistribution: readonly {
    readonly cameraComposition: string;
    readonly count: number;
  }[];
  readonly clusters: readonly {
    readonly parentLongFormId: string;
    readonly contentIds: readonly string[];
    readonly exactDuplicateCount: number;
    readonly materiallyDifferentGrammarCount: number;
    readonly strategyConcentration: number;
    readonly maxCameraCompositionFrequency: number;
    readonly status: "pass" | "fail";
    readonly failures: readonly string[];
  }[];
  readonly status: "pass" | "fail";
  readonly failures: readonly string[];
}

export interface PositioningVisualTreatment {
  readonly treatmentId: string;
  readonly sceneId: string;
  readonly progressionStage: ProgressionStage;
  readonly narrativeBeat: string;
  readonly communicationIntent: CommunicationIntent;
  readonly strategy: VisualStrategy;
  readonly subjectRequirement: string;
  readonly environment: string;
  readonly composition: string;
  readonly camera: string;
  readonly lighting: string;
  readonly action: string;
  /** Explicit when remediation knows who performs the action; never inferred from buyer perspective. */
  readonly actionOwnerRole?: VeronicaActionOwnerRole;
  readonly props: readonly string[];
  readonly motionOpportunities: readonly VisualEventKind[];
  readonly diagram: DiagramTopology | null;
  readonly grammar: VisualGrammarFeatures;
  readonly viewerVisibleFingerprint: ViewerVisibleHookFingerprint;
  readonly treatmentHash: string;
}

export interface SafeRegion {
  readonly id: "subtitle" | "overlay" | "subject";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RatioAdaptation {
  readonly aspectRatio: AspectRatio;
  readonly supported: boolean;
  readonly cropMode: "native" | "center-crop" | "subject-aware-crop" | "not-safe";
  readonly safeRegions: readonly SafeRegion[];
  readonly reason: string;
}

export interface GeneratedVisualAsset {
  readonly assetId: string;
  readonly contentId: string;
  readonly sceneId: string;
  readonly semanticPurpose: string;
  readonly strategy: VisualStrategy;
  readonly prompt: string;
  readonly textFree: true;
  readonly textInGeneratedImage: false;
  readonly nativeAspectRatio: AspectRatio;
  readonly ratioAdaptations: readonly RatioAdaptation[];
  readonly subjectIdentityId: string | null;
  readonly referenceAssetId: string | null;
  readonly semanticFingerprint: string;
  readonly generatedAssetCacheKey: string;
}

export type VisualEventKind =
  | "establishing-crop"
  | "slow-push"
  | "alternate-crop"
  | "subject-detail"
  | "prop-detail"
  | "pan"
  | "reveal"
  | "masked-overlay"
  | "diagram-build"
  | "highlighted-region"
  | "split-composition"
  | "punch-in"
  | "transition-state";

export interface VisualEvent {
  readonly eventId: string;
  readonly sceneId: string;
  readonly assetId: string;
  readonly kind: VisualEventKind;
  readonly startMs: number;
  readonly durationMs: number;
  readonly aspectRatio: AspectRatio;
  readonly safeRegionIds: readonly SafeRegion["id"][];
  readonly deterministicParameters: {
    readonly startScale: number;
    readonly endScale: number;
    readonly anchor: "center" | "left" | "right" | "subject" | "prop";
  };
  readonly renderCacheKey: string;
}

export interface PlannedScene {
  readonly sceneId: string;
  readonly progressionStage: ProgressionStage;
  readonly narrationAnchor: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly treatment: PositioningVisualTreatment;
  readonly assetId: string;
  readonly eventIds: readonly string[];
  readonly overlayKey: string;
  /** What remains intelligible if narration is muted. */
  readonly visibleThesis: string;
  /** Information this scene contributes beyond its predecessor. */
  readonly newInformation: string;
  readonly narrativeFunction: VeronicaNarrativeFunction;
  readonly visualFamily: VeronicaVisualFamily;
  readonly continuityGroup?: string;
  readonly callbackToBeatId?: string;
  readonly callbackPurpose?: string;
  /** A still must show one readable state or one decisive visible transition. */
  readonly stateComplexity?: "SINGLE_STATE" | "DECISIVE_TRANSITION_MOMENT" | "MULTI_STATE_REQUIRED";
}

export interface DiversityMetrics {
  readonly visualGrammarDuplicateRate: number;
  readonly subjectArchetypeDuplicateRate: number;
  readonly environmentDuplicateRate: number;
  readonly compositionDuplicateRate: number;
  readonly cameraDuplicateRate: number;
  readonly propDuplicateRate: number;
  readonly diagramTopologyDuplicateRate: number;
  readonly consecutiveSceneSimilarity: {
    readonly mean: number;
    readonly maximum: number;
    readonly violatingPairs: readonly string[];
  };
  readonly hookVsScene1Similarity: number | null;
  readonly status: "pass" | "fail";
  readonly failures: readonly string[];
  /** Final-treatment viewer-visible diagnostics; optional only for legacy V2 plans. */
  readonly intentionalMotifReuseRate?: number;
  readonly accidentalVisualRepetitionRate?: number;
  readonly consecutiveViewerVisibleSimilarity?: { readonly mean: number; readonly maximum: number; readonly violatingPairs: readonly string[] };
  readonly environmentFamilyReuseRate?: number;
  readonly cameraFamilyReuseRate?: number;
  readonly interactionFamilyReuseRate?: number;
  readonly motifContinuityCoverage?: number;
  /** Adjacent transition reuse rates use normalized final viewer-visible families. */
  readonly continuityIdentityReuseRate?: number;
  readonly harmfulRepetitionPairs?: readonly string[];
  readonly viewerVisibleFamilies?: readonly {
    readonly sceneId: string;
    readonly strategyFamily: string;
    readonly environmentFamily: string;
    readonly compositionFamily: string;
    readonly cameraFamily: string;
    readonly interactionFamily: string;
    readonly dominantObjectFamily: string;
    readonly motionFamily: string;
    readonly diagramFamily: string;
    readonly motifFamily: string;
    readonly continuityIdentityFamily: string;
  }[];
}

export interface SelectedRecurringMotif {
  readonly schemaVersion: "veronica-selected-recurring-motif.v1";
  readonly family: string;
  readonly concept: string;
  readonly source: "narration-native" | "visual-vocabulary";
  readonly sceneIds: readonly string[];
}

export interface CadenceMetrics {
  readonly durationMs: number;
  readonly baseAssetCount: number;
  readonly visualEventCount: number;
  readonly eventsPerBaseAsset: number;
  readonly meanSecondsPerEvent: number;
  readonly shortestEventSeconds: number;
  readonly longestEventSeconds: number;
  readonly targetRangeSeconds: readonly [3, 7];
  readonly targetComplianceRate: number;
  readonly hookMeanSecondsPerEvent: number | null;
}

export interface TitleTranscreationQa {
  readonly schemaVersion: typeof POSITIONING_TITLE_QA_VERSION;
  readonly contentId: string;
  readonly locales: Readonly<
    Record<
      PositioningLocale,
      {
        readonly metadataTitle: string;
        readonly displayTitle: string;
        readonly displayLines: readonly [string] | readonly [string, string];
        readonly displayTitleDistinctFromMetadata: boolean;
        readonly minimumFontScale: 1;
        readonly naturalness: "reviewed-source" | "warning";
        readonly semanticPreservation: "pass" | "warning";
        readonly excessiveLength: boolean;
        readonly sourceOverlayOverflowRisk: "low" | "medium" | "high";
        readonly overlayOverflowRisk: "low" | "medium" | "high";
        readonly awkwardLiteralTranslation: boolean;
        readonly warnings: readonly string[];
      }
    >
  >;
  readonly sourceTitlesHash: string;
  readonly cacheKey: string;
  readonly artifactHash: string;
}

export interface AssetReuseDecision {
  readonly sourceAssetId: string;
  readonly sourceContentId: string;
  readonly targetContentId: string;
  readonly targetSceneId: string;
  readonly eligible: boolean;
  readonly reuseMode: "vertical-derivative" | "graphical-derivative" | "not-reusable";
  readonly cropAdaptation: "subject-aware-crop" | "center-crop" | "none";
  readonly semanticCompatibility: number;
  /** Veronica does not turn loose similarity into an automatic provider reuse. */
  readonly decision?: "AUTO_REUSE_APPROVED" | "REUSE_REQUIRES_SEMANTIC_REVIEW" | "REUSE_REJECTED";
  readonly reason: string;
}

export interface PositioningVisualPlanV2 {
  readonly schemaVersion: typeof POSITIONING_PLAN_VERSION;
  readonly plannerVersion: typeof POSITIONING_PLANNER_VERSION;
  readonly contentId: string;
  readonly parentLongFormId: string;
  readonly format: PositioningFormat;
  readonly aspectRatio: AspectRatio;
  readonly canonicalNarrationSource: string;
  readonly canonicalSourceHash: string;
  readonly sourceNarrationSemanticHash: string;
  readonly semanticBeatStructureHash: string;
  readonly sceneCountRationale: string;
  readonly semanticPlanCacheKey: string;
  readonly canonicalImagePlanHash: string;
  readonly renderEventPlanHash: string;
  readonly localizedTitleArtifact: TitleTranscreationQa;
  readonly visualVocabulary: VisualVocabulary;
  /** Persisted final motif selection, consumed by finalization and review. */
  readonly selectedRecurringMotif?: SelectedRecurringMotif;
  /** Canonical short/long shared semantic visual language projection. */
  readonly visualStoryBible: VeronicaVisualStoryBible;
  /** Present only for 16:9 plans; short plans remain beat-driven. */
  readonly chapters: readonly VeronicaChapterVisualPlan[];
  readonly coldOpen: PlannedScene | null;
  readonly progression: readonly ProgressionStage[];
  readonly continuity: ContinuityPlan;
  readonly scenes: readonly PlannedScene[];
  readonly assets: readonly GeneratedVisualAsset[];
  readonly visualEvents: readonly VisualEvent[];
  readonly diagrams: readonly DiagramTopology[];
  readonly assetReuseDecisions: readonly AssetReuseDecision[];
  readonly diversityMetrics: DiversityMetrics;
  readonly cadenceMetrics: CadenceMetrics;
  readonly localizationCompatibility: {
    readonly locales: typeof POSITIONING_LOCALES;
    readonly canonicalImageryLocale: "en";
    readonly textInGeneratedImage: false;
    readonly translationInvalidatesCanonicalImagery: false;
    readonly overlaysRenderedSeparately: true;
  };
  readonly productionCoverage: {
    readonly ctaEndScreenPlacement: "planned";
    readonly motionTreatment: "planned";
    readonly overlayStrategy: "planned";
    readonly musicSfx: "unsupported-not-planned";
    readonly thumbnail: {
      readonly concept: string;
      readonly titleRelationship: string;
      readonly localeStrategy: "text-free-image-localized-overlay";
    };
  };
  readonly cacheInvalidation: {
    readonly semanticPlanInvalidatesOn: readonly string[];
    readonly canonicalImageInvalidatesOn: readonly string[];
    readonly titleQaInvalidatesOn: readonly string[];
    readonly renderEventsInvalidateOn: readonly string[];
  };
  readonly migration: {
    readonly legacyV1Plan: "inspect-only-replan-required";
    readonly legacyAssetReuse: "eligible-only-after-semantic-fingerprint-match";
  };
  readonly validation: {
    readonly status: "pass" | "fail";
    readonly failures: readonly string[];
  };
  readonly planHash: string;
}

export interface PositioningPlannerConfiguration {
  readonly imageProviderModel: string;
  readonly rendererVersion: string;
}

export interface PositioningVisualPlanningResult {
  readonly outputDir: string;
  readonly reviewPackPath: string;
  readonly latestReviewPackPath: string;
  readonly comparisonPath: string;
  readonly generatedAtMs: number;
  readonly contentIds: readonly string[];
  readonly longPlanCount: number;
  readonly shortPlanCount: number;
  readonly canonicalAssetCount: number;
  readonly visualEventCount: number;
  readonly diagramCount: number;
  readonly reusableAssetOpportunityCount: number;
  readonly reviewPackHash: string;
}

export interface PositioningVisualCalibrationResult {
  readonly outputDir: string;
  readonly contentIds: readonly string[];
  readonly planPaths: readonly string[];
  readonly previewPath: string;
  readonly providerCalls: 0;
}
