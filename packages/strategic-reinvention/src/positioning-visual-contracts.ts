import type {
  VeronicaChapterVisualPlan,
  VeronicaNarrativeFunction,
  VeronicaVisualFamily,
  VeronicaVisualStoryBible,
} from "./veronica-visual-language.js";
import type {
  SourceGroundedVisualQaResult,
  SemanticFaultBoundary,
} from "./source-grounded-visual-qa.js";

export const POSITIONING_PLANNER_VERSION =
  "veronicabenini-positioning-visual-planner.v2.5-m1" as const;
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
export type VeronicaActionOwnerRole = "expert" | "buyer" | "business-operator" | "shared" | "none";
export type VeronicaNarrativeActorRole =
  | "expert"
  | "business-operator"
  | "observer"
  | "existing-follower"
  | "prospective-buyer";
export interface VeronicaActorAssignment {
  readonly actorId: string;
  readonly role: VeronicaNarrativeActorRole;
  readonly actionOwnership: "primary" | "supporting" | "context";
  readonly identityAuthority: "canonical-protagonist" | "distinct-scene-actor";
  readonly visibleAction: string;
}
export type VeronicaSemanticConfidence = "HIGH" | "MEDIUM" | "LOW";
export type VeronicaSemanticPolarity = "POSITIVE_STATE" | "NEGATIVE_STATE" | "CONTRAST" | "TRANSITION_NEGATIVE_TO_POSITIVE" | "TRANSITION_POSITIVE_TO_NEGATIVE" | "NEUTRAL";
export type VeronicaSemanticStateRelation = "STABLE" | "CAUSAL_BEFORE_AFTER" | "CONTRAST" | "CONDITIONAL_ALTERNATIVES" | "SEQUENTIAL_PROGRESSION";
export const VERONICA_RESOLVED_VISUAL_MECHANISMS = [
  "website-first-impression",
  "market-problem-solution-chain",
  "problem-first-sequence",
  "identity-bridge",
  "relevant-context-participation",
  "recognition-accumulation",
  "claim-to-proof",
  "promise-value-translation",
  "description-to-outcome-framing",
  "expectation-delivery-check",
  "promise-calibration",
  "promise-experience-alignment",
  "reality-bounded-clarity",
  "value-adding-follow-up",
  "pressure-without-value",
  "channel-capacity-boundary",
  "respectful-stop-condition",
  "useful-follow-up-evidence",
  "relevance-response-reason",
  "platform-attention-tax",
  "response-capacity-readiness",
  "neglected-account-without-distribution",
  "customer-signal-channel-decision",
  "work-expertise-separation",
  "signal-coherence",
  "audience-fit-signal",
  "customer-context-interpretation",
  "peer-referral",
  "quantity-comparison",
  "input-output-flow",
  "retained-remainder",
  "workload-accumulation",
  "scaling-relation",
] as const;
export type VeronicaResolvedVisualMechanism =
  (typeof VERONICA_RESOLVED_VISUAL_MECHANISMS)[number];
export type VeronicaVisualMechanism =
  | VeronicaResolvedVisualMechanism
  | "UNRESOLVED";
export const VERONICA_VISUAL_MECHANISM_ACTION_OWNER = {
  "website-first-impression": "buyer",
  "market-problem-solution-chain": "buyer",
  "problem-first-sequence": "expert",
  "identity-bridge": "expert",
  "relevant-context-participation": "expert",
  "recognition-accumulation": "buyer",
  "claim-to-proof": "buyer",
  "promise-value-translation": "expert",
  "description-to-outcome-framing": "expert",
  "expectation-delivery-check": "expert",
  "promise-calibration": "expert",
  "promise-experience-alignment": "expert",
  "reality-bounded-clarity": "expert",
  "value-adding-follow-up": "expert",
  "pressure-without-value": "expert",
  "channel-capacity-boundary": "expert",
  "respectful-stop-condition": "expert",
  "useful-follow-up-evidence": "expert",
  "relevance-response-reason": "expert",
  "platform-attention-tax": "business-operator",
  "response-capacity-readiness": "expert",
  "neglected-account-without-distribution": "business-operator",
  "customer-signal-channel-decision": "business-operator",
  "work-expertise-separation": "expert",
  "signal-coherence": "buyer",
  "audience-fit-signal": "buyer",
  "customer-context-interpretation": "expert",
  "peer-referral": "buyer",
  "quantity-comparison": "expert",
  "input-output-flow": "business-operator",
  "retained-remainder": "business-operator",
  "workload-accumulation": "business-operator",
  "scaling-relation": "business-operator",
} as const satisfies Readonly<
  Record<VeronicaResolvedVisualMechanism, Extract<VeronicaActionOwnerRole, "expert" | "buyer" | "business-operator">>
>;

export interface VeronicaNarrationEvidenceSpan {
  readonly sentenceId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly text: string;
  readonly spanHash: string;
}

export type VeronicaSemanticStateModel =
  | {
      readonly kind: "SINGLE_STATE";
      readonly relation: "STABLE";
      readonly state: string;
    }
  | {
      readonly kind: "DECISIVE_TRANSITION";
      readonly relation: "CAUSAL_BEFORE_AFTER" | "CONTRAST";
      readonly initialState: string;
      readonly resultingState: string;
    }
  | {
      readonly kind: "MULTI_STATE_SEQUENCE";
      readonly relation: "CONDITIONAL_ALTERNATIVES" | "SEQUENTIAL_PROGRESSION";
      readonly states: readonly [string, string, ...string[]];
    };

export interface VeronicaVisualAuthorizationEntry {
  readonly concept: string;
  readonly authority: "SOURCE_SPAN" | "SEMANTIC_ROLE" | "ENCODING_MECHANISM";
  readonly evidenceSpanHashes: readonly string[];
  readonly semanticRole?: Exclude<VeronicaActionOwnerRole, "none">;
}

export interface VeronicaVisualAuthorization {
  readonly entities: readonly VeronicaVisualAuthorizationEntry[];
  readonly environments: readonly VeronicaVisualAuthorizationEntry[];
  readonly motifs: readonly VeronicaVisualAuthorizationEntry[];
  readonly allowedEncodingMechanisms: readonly VeronicaResolvedVisualMechanism[];
}

export interface VeronicaVisualEncodingConstraints {
  readonly textFree: true;
  readonly neutralObserver: "FORBIDDEN" | "AUTHORIZED";
  readonly stateEncoding: "SINGLE_FRAME" | "DECISIVE_TRANSITION" | "SEQUENCE_REQUIRED";
}

export interface VeronicaSemanticProposition {
  readonly schemaVersion: "veronica-semantic-proposition.v4";
  readonly narrationClaim: string;
  readonly evidenceSpans: readonly [VeronicaNarrationEvidenceSpan, ...VeronicaNarrationEvidenceSpan[]];
  readonly semanticSubject: {
    readonly description: string;
    readonly evidenceSpanHashes: readonly string[];
  };
  readonly polarity: VeronicaSemanticPolarity;
  /** Derived compatibility view of stateModel.relation. */
  readonly stateRelation: VeronicaSemanticStateRelation;
  readonly cause?: string;
  readonly causalRelationship: {
    readonly relation: VeronicaSemanticStateRelation;
    readonly cause: string;
    readonly consequence: string;
  };
  readonly stateModel: VeronicaSemanticStateModel;
  /** Canonical action-owner role. Buyer perspective never replaces it. */
  readonly actorRole: VeronicaActionOwnerRole;
  readonly actorAction: string;
  readonly affectedParty?: {
    readonly role: Exclude<VeronicaActionOwnerRole, "none">;
    readonly evidenceSpanHashes: readonly string[];
  };
  /** Derived compatibility text; buyerPerspective is the structured view. */
  readonly buyerInterpretation?: string;
  readonly buyerPerspective?: {
    readonly role: "buyer";
    readonly interpretation: string;
    readonly consequenceFamily: VeronicaSemanticProposition["buyerConsequenceFamily"];
    readonly evidenceSpanHashes: readonly string[];
  };
  readonly consequence: string;
  readonly requiredVisibleConsequence: string;
  readonly contrast?: { readonly relation: Exclude<VeronicaSemanticStateRelation, "STABLE">; readonly initialState?: string; readonly desiredState?: string; readonly failureState?: string; readonly consequence?: string };
  readonly narrationNativeMetaphor?: string;
  readonly visualMechanism: VeronicaVisualMechanism;
  readonly evidenceAnchors: readonly string[];
  readonly buyerConsequenceFamily: "REMEMBERS" | "CATEGORIZES" | "CHOOSES" | "HESITATES" | "TRUSTS" | "IGNORES" | "NOTICES" | "REFERS" | "RECOGNIZES" | "UNDERSTANDS" | "CONNECTS" | "FAILS_TO_ACCUMULATE" | "REJECTS" | "NONE";
  readonly confidence: { readonly proposition: VeronicaSemanticConfidence; readonly actorOwnership: VeronicaSemanticConfidence; readonly consequence: VeronicaSemanticConfidence; readonly visualMechanism: VeronicaSemanticConfidence };
  readonly visualAuthorization: VeronicaVisualAuthorization;
  readonly visualEncodingConstraints: VeronicaVisualEncodingConstraints;
  readonly semanticRevisionHash: string;
  /** Derived legacy identity alias of semanticRevisionHash. */
  readonly propositionHash: string;
}

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
  /** Concrete scene cast. Broad buyer/expert mechanism families never own identity. */
  readonly actors?: readonly VeronicaActorAssignment[];
  readonly actionOwnerActorId?: string;
  readonly props: readonly string[];
  readonly motionOpportunities: readonly VisualEventKind[];
  readonly diagram: DiagramTopology | null;
  readonly grammar: VisualGrammarFeatures;
  readonly viewerVisibleFingerprint: ViewerVisibleHookFingerprint;
  readonly treatmentHash: string;
  readonly sourcePropositionHash?: string;
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
  /** Present for the explicit visual-density layer; absent means the legacy implicit scene beat. */
  readonly visualBeatId?: string;
  readonly visualBeatHash?: string;
  readonly visualBeatAssetDecision?: VisualBeatAssetDecision;
  readonly semanticPurpose: string;
  readonly strategy: VisualStrategy;
  readonly prompt: string;
  readonly textFree: true;
  readonly textInGeneratedImage: false;
  readonly nativeAspectRatio: AspectRatio;
  readonly ratioAdaptations: readonly RatioAdaptation[];
  readonly subjectIdentityId: string | null;
  /** Canonical identity authority; never replaced by a generated scene image. */
  readonly canonicalReferenceAssetId?: string | null;
  /** Optional generated continuity evidence in addition to the canonical authority. */
  readonly continuityReferenceAssetIds?: readonly string[];
  readonly referenceAssetId: string | null;
  readonly semanticFingerprint: string;
  readonly generatedAssetCacheKey: string;
  readonly projectionProvenance?: {
    readonly sourceTreatmentHash: string;
    readonly sourcePropositionHash: string | null;
    readonly materializationRevisionId: string;
    readonly projectionRevisionId: string;
    readonly stateProjectionPolicyVersion: string;
    readonly motifId: string | null;
    readonly projectionStrategy: "SINGLE_STATE" | "DECISIVE_TRANSITION" | "MULTI_STATE_SEQUENCE";
    readonly providerPromptHash: string;
    readonly projectedPolarity: VeronicaSemanticPolarity;
    readonly projectedStateRelation: VeronicaSemanticStateRelation;
    readonly projectedActorRole: VeronicaActionOwnerRole | "unresolved";
    readonly projectedConsequencePolarity: VeronicaSemanticPolarity;
    readonly promptCompilerVersion?: string;
    readonly promptCompilationInputHash?: string;
    readonly promptCompilationResultHash?: string;
    readonly promptCompilerModel?: string;
    readonly promptCompilerReasoningEffort?: string;
    readonly visualBeatId?: string;
    readonly visualBeatHash?: string;
    readonly visualBeatNewInformationHash?: string;
    readonly visualBeatAssetDecision?: VisualAssetDecision;
    /** Describes how the beat boundary was resolved; concrete timestamps are intentionally not an image dependency. */
    readonly timingProvenanceHash?: string;
  };
  readonly promptCompilation?: {
    readonly input: import("./veronica-image-prompt-compiler.js").VeronicaImagePromptCompilationInput;
    readonly result: import("./veronica-image-prompt-compiler.js").VeronicaImagePromptCompilationResult;
    readonly inputHash: string;
    readonly resultHash: string;
    readonly semanticQa?: VeronicaProviderPromptSemanticQa;
  };
}

export interface VeronicaProviderPromptSemanticBlocker {
  readonly code:
    | "NARRATION_PROPOSITION_INVERSION"
    | "VISUAL_PURPOSE_INVERSION"
    | "ACTOR_OWNERSHIP_INVERSION"
    | "REQUIRED_STATE_INVERSION"
    | "COMPOSITION_HIERARCHY_INVERSION"
    | "ESSENTIAL_RELATIONSHIP_INVERSION"
    | "NEGATIVE_CONSTRAINT_VIOLATION"
    | "CONTINUITY_REFERENCE_VIOLATION";
  readonly canonicalField: string;
  readonly expected: string;
  readonly actual: string;
  readonly message: string;
}

export interface VeronicaProviderPromptSemanticQa {
  readonly schemaVersion: "veronica-provider-prompt-semantic-qa.v1";
  readonly status: "PASS" | "BLOCKED";
  readonly sceneId: string;
  readonly assetId: string;
  readonly canonicalContractHash: string;
  readonly providerPromptHash: string;
  readonly blockers: readonly VeronicaProviderPromptSemanticBlocker[];
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
  readonly visualBeatId?: string;
  readonly beatBoundaryKind?: VisualBeatBoundaryKind;
  readonly timingProvenanceHash?: string;
  readonly kind: VisualEventKind;
  readonly startMs: number;
  readonly durationMs: number;
  readonly aspectRatio: AspectRatio;
  readonly safeRegionIds: readonly SafeRegion["id"][];
  /** The distinct information revealed by this crop/reframe. */
  readonly semanticFocus?: string;
  readonly deterministicParameters: {
    readonly startScale: number;
    readonly endScale: number;
    readonly anchor: "center" | "left" | "right" | "subject" | "prop";
  };
  readonly renderCacheKey: string;
}

export type VisualBeatRole =
  | "establish"
  | "primary"
  | "progression"
  | "contrast"
  | "reaction"
  | "payoff"
  | "cutaway";

export type VisualAssetDecision =
  | "new-image"
  | "reuse-with-motion"
  | "reuse-with-crop"
  | "reuse-existing-asset";

/** Backward-compatible name used by the initial visual-beat implementation. */
export type VisualBeatAssetDecision = VisualAssetDecision;

export type VisualBeatBoundaryKind =
  | "narration-aligned"
  | "semantic-subspan-aligned"
  | "editorially-allocated";

export interface VisualBeatNarrationRef {
  readonly semanticSceneId: string;
  readonly sentenceIds: readonly string[];
  readonly startOffset: number;
  readonly endOffset: number;
  readonly spanHash: string;
}

export interface VisualBeatComposition {
  readonly description: string;
  readonly camera: string;
  readonly lighting: string;
  readonly subtitleSafeAreaRequired: true;
}

export interface VisualBeatReferenceRequirement {
  readonly kind: "canonical-identity" | "episode-anchor" | "scene-reference";
  readonly assetId: string;
  readonly required: boolean;
}

/**
 * Typed multi-actor causality for a child beat. The causal owner performs the
 * intervention; the outcome actor supplies visible evidence of its consequence.
 */
export interface VisualBeatActorRelation {
  readonly causalActionOwnerRole: Exclude<VeronicaActionOwnerRole, "none">;
  readonly outcomeActorRole: Exclude<VeronicaActionOwnerRole, "none">;
  readonly relationship: "ELICITS" | "ENABLES";
  readonly causalAction: string;
  readonly outcomeAction: string;
}

export interface VisualBeatTreatmentV1 {
  readonly version: 1;
  readonly beatId: string;
  readonly sceneId: string;
  readonly role: VisualBeatRole;
  readonly narrationRef: VisualBeatNarrationRef;
  readonly parentTreatmentHash: string;
  readonly parentSemanticRevisionHash: string;
  readonly coreMeaning: string;
  /** The material visual information this beat adds beyond its preceding beat. */
  readonly newInformation: string;
  readonly viewerShouldUnderstand: string;
  readonly visualThesis: string;
  readonly subject: string;
  readonly action: string;
  readonly actorRelation?: VisualBeatActorRelation | undefined;
  readonly state: string;
  readonly environment: string;
  readonly composition: VisualBeatComposition;
  readonly continuationOfPreviousBeat: boolean;
  readonly referenceRequirements: readonly VisualBeatReferenceRequirement[];
  readonly assetDecision: VisualBeatAssetDecision;
  readonly reuseSourceBeatId: string | null;
  /** Relative allocation only; selected audio supplies the actual scene duration. */
  readonly timingWeight: number;
  readonly boundaryKind: VisualBeatBoundaryKind;
  readonly beatHash: string;
}

export interface VeronicaVisualBeatQuality {
  readonly status: "PASS" | "WARN" | "FAIL";
  readonly findings: readonly {
    readonly code: "REDUNDANT_SIBLING_BEAT" | "REDUNDANT_PAID_IMAGE_CANDIDATE" | "EVENT_ONLY_DENSITY_INCREASE" | "OPENING_STATIC_HOLD" | "INSUFFICIENT_SEMANTIC_ASSET_DENSITY" | "LONG_STATIC_OPENING_ASSET_HOLD" | "BEAT_OUTSIDE_PARENT_MEANING" | "INVALID_REUSE_SOURCE" | "CAUSE_CONSEQUENCE_EVIDENCE_INCOMPLETE" | "ACTION_OWNER_INVERSION" | "STATE_ROLE_INVERSION" | "SEMANTIC_DRIFT" | "SOURCE_DOMAIN_LOST" | "NO_SAFE_BEAT_CANDIDATE";
    readonly severity: "warning" | "blocker";
    readonly sceneId: string;
    readonly beatId: string | null;
    readonly message: string;
  }[];
  readonly beatsInFirst5Seconds: number;
  readonly beatsInFirst10Seconds: number;
  readonly beatsInFirst15Seconds: number;
  readonly density: VeronicaVisualDensityMetrics;
  readonly sequenceDiversity: VeronicaSequenceDiversityResult;
}

export type VeronicaSequenceDiversityFindingCode =
  | "ADJACENT_VISUAL_DUPLICATION"
  | "TREATMENT_FAMILY_REPETITION"
  | "ENVIRONMENT_MONOTONY"
  | "ACTION_MONOTONY"
  | "COMPOSITION_MONOTONY"
  | "MECHANISM_REPETITION"
  | "PRESENTATION_MECHANISM_REPETITION"
  | "LOW_INFORMATION_GAIN"
  | "OPENING_NOVELTY_LOW"
  | "OPENING_ACTION_NOVELTY_LOW";

export const VERONICA_DEPICTED_ACTION_FAMILIES = [
  "comparison",
  "decomposition",
  "selection",
  "inspection",
  "transfer",
  "application",
  "flow",
  "accumulation",
  "scaling",
  "workload-growth",
  "retained-value-reveal",
  "evidence-reveal",
  "incremental-contribution",
  "sorting",
  "allocation",
  "conversion",
  "bottleneck",
  "queue-growth",
  "state-transition",
  "contrast-reveal",
  "other",
] as const;
export type VeronicaDepictedActionFamily = (typeof VERONICA_DEPICTED_ACTION_FAMILIES)[number];

export const VERONICA_PRESENTATION_MECHANISMS = [
  "unmodified",
  "foreground-evidence",
  "isolated-diagnostic",
  "modular-system",
  "process-path",
  "depth-staging",
  "intake-threshold",
  "handoff-chain",
  "comparison-layout",
  "decision-fork",
  "workload-bottleneck",
  "rule-setting",
  "calculation-path",
  "other-presentation",
] as const;
export type VeronicaPresentationMechanism = (typeof VERONICA_PRESENTATION_MECHANISMS)[number];

export interface VeronicaVisualTreatmentSignature {
  readonly beatId: string;
  readonly treatmentFamily: string;
  readonly visualMechanism: string;
  readonly presentationMechanism: VeronicaPresentationMechanism;
  readonly depictedActionFamily: VeronicaDepictedActionFamily;
  readonly environmentFamily: string;
  /** Compatibility diagnostic; action policy uses depictedActionFamily. */
  readonly primaryAction: string;
  readonly compositionFamily: string;
  readonly cameraFamily: string;
  readonly informationRole: string;
  readonly semanticState: string;
  readonly actorPerspective: string;
  readonly sourcePropositionHash: string;
  readonly signatureHash: string;
}

export interface VeronicaSequenceDiversityFinding {
  readonly code: VeronicaSequenceDiversityFindingCode;
  readonly severity: "warning" | "review-required" | "blocker";
  readonly beatIds: readonly string[];
  readonly window: "adjacent" | "three-beat" | "five-beat" | "opening-5s" | "opening-10s" | "opening-15s" | "whole-episode";
  readonly repeatedDimensions: readonly string[];
  readonly observed: number;
  readonly threshold: number;
  readonly evidence: string;
  readonly remediationEligible: boolean;
}

export interface VeronicaSequenceDiversityResult {
  readonly schemaVersion: "veronica-sequence-diversity.v2";
  readonly policyVersion: string;
  readonly status: "PASS" | "WARN" | "REVIEW_REQUIRED" | "BLOCK";
  readonly signatures: readonly VeronicaVisualTreatmentSignature[];
  readonly findings: readonly VeronicaSequenceDiversityFinding[];
  readonly metrics: {
    readonly adjacentDuplicateCount: number;
    readonly treatmentFamilyDominantShare: number;
    readonly environmentDominantShare: number;
    readonly actionDominantShare: number;
    readonly depictedActionDominantShare: number;
    readonly presentationMechanismDominantShare: number;
    readonly compositionDominantShare: number;
    readonly mechanismDominantShare: number;
    readonly lowInformationGainCount: number;
    readonly opening: Readonly<Record<"5" | "10" | "15", {
      readonly beatCount: number;
      readonly uniqueSourcePropositions: number;
      readonly uniqueTreatmentMechanisms: number;
      readonly uniquePresentationMechanisms: number;
      readonly uniqueDepictedActionFamilies: number;
      readonly uniqueCompositionFamilies: number;
      readonly uniqueActionFamilies: number;
    }>>;
  };
  readonly remediation: {
    readonly passes: number;
    readonly changedBeatIds: readonly string[];
    readonly exhausted: boolean;
  };
  readonly resultHash: string;
}

export interface VeronicaDerivedBeatCandidate {
  readonly candidateId: string;
  readonly operatorId: string;
  readonly beat: VisualBeatTreatmentV1;
  readonly sourceReference: VisualBeatNarrationRef;
  readonly actionFamily: VeronicaDepictedActionFamily;
  readonly mechanism: string;
  readonly environmentFamily: string;
  readonly compositionFamily: string;
  readonly evidenceCategory: string;
  readonly actorRoles: readonly string[];
  readonly stateRelation: string;
  readonly visibleInformationDelta: {
    readonly score: number;
    readonly categories: readonly ("source-span" | "proposition" | "state" | "causal-relation" | "visible-evidence")[];
  };
  readonly causalCompleteness: boolean;
  readonly openingSuitability: number;
  readonly hardGate: {
    readonly eligible: boolean;
    readonly findingCodes: readonly ("SOURCE_GROUNDING_FAILED" | "SEMANTIC_PARENT_MISMATCH" | "ACTOR_AUTHORIZATION_FAILED" | "STATE_FIDELITY_FAILED" | "ENVIRONMENT_AUTHORIZATION_FAILED" | "CAUSAL_EVIDENCE_INCOMPLETE" | "UNRESOLVED_REQUIRED_MECHANISM")[];
  };
  readonly treatmentReference: string;
  readonly semanticParentIdentity: string;
}

export interface VeronicaCandidateSelectionDiagnostics {
  readonly schemaVersion: "veronica-beat-candidate-selection.v1";
  readonly policyVersion: string;
  readonly maximumCandidatesPerBeat: 6;
  readonly beamWidth: 4;
  readonly rollingWindowBeats: 5;
  readonly candidateCount: number;
  readonly hardValidCandidateCount: number;
  readonly noSafeCandidateBeatIds: readonly string[];
  readonly noSafeReasons: readonly VeronicaNoSafeCandidateDiagnostic[];
  readonly selectedCandidateIds: readonly string[];
  readonly candidates: readonly {
    readonly beatId: string;
    readonly candidateId: string;
    readonly hardGateEligible: boolean;
    readonly hardGateFindingCodes: readonly string[];
    readonly visibleInformationDelta: number;
    readonly actionDiversityContribution: number;
    readonly mechanismDiversityContribution: number;
    readonly openingNoveltyContribution: number;
    readonly compositionContribution: number;
    readonly causalCompleteness: boolean;
    readonly scoreTuple: readonly number[];
    readonly selected: boolean;
    readonly reason: "SELECTED" | "HARD_GATE_REJECTED" | "LOWER_SEQUENCE_SCORE" | "STABLE_TIE_BREAK" | "NO_SAFE_CANDIDATE_FALLBACK";
    readonly tieBreakKey: string;
  }[];
  readonly selectionHash: string;
}

export type VeronicaNoSafeReason =
  | { readonly kind: "UNRESOLVED_REQUIRED_MECHANISM"; readonly semanticRelation: VeronicaSemanticStateRelation }
  | { readonly kind: "ACTOR_AUTHORIZATION_FAILURE"; readonly actorRole: VeronicaActionOwnerRole }
  | { readonly kind: "NO_AUTHORIZED_MECHANISM"; readonly mechanism: string }
  | { readonly kind: "CAUSAL_EVIDENCE_INCOMPLETE"; readonly semanticRelation: VeronicaSemanticStateRelation }
  | { readonly kind: "STATE_RELATION_UNENCODABLE"; readonly semanticRelation: VeronicaSemanticStateRelation }
  | { readonly kind: "SOURCE_EVIDENCE_INSUFFICIENT"; readonly evidenceSpanCount: number }
  | { readonly kind: "OPERATOR_APPLICABILITY_MISMATCH"; readonly candidateFamilies: readonly string[] }
  | { readonly kind: "ALL_CANDIDATES_SEMANTICALLY_INVALID"; readonly rejectionCodes: readonly string[] };

export interface VeronicaNoSafeCandidateDiagnostic {
  readonly beatId: string;
  readonly sceneId: string;
  readonly applicableCandidateFamilies: readonly string[];
  readonly generatedCandidateIds: readonly string[];
  readonly hardGateRejectionCodes: readonly string[];
  readonly primaryReason: VeronicaNoSafeReason;
  readonly secondaryReasons: readonly VeronicaNoSafeReason[];
  readonly semanticRelation: VeronicaSemanticStateRelation;
  readonly actorAuthorization: "AUTHORIZED" | "FAILED" | "UNRESOLVED";
  readonly environmentAuthorization: "AUTHORIZED" | "FAILED" | "UNRESOLVED";
  readonly mechanismStatus: "RESOLVED" | "UNRESOLVED" | "UNAUTHORIZED";
  readonly causalStatus: "NOT_APPLICABLE" | "COMPLETE" | "INCOMPLETE";
}

export interface VeronicaVisualDensityMetrics {
  readonly semanticSceneCount: number;
  readonly visualBeatCount: number;
  readonly visualEventCount: number;
  readonly uniqueCanonicalAssetCount: number;
  readonly newImageBeatCount: number;
  readonly reuseWithMotionBeatCount: number;
  readonly reuseWithCropBeatCount: number;
  readonly reuseExistingAssetBeatCount: number;
  readonly sameAssetEventCount: number;
  readonly firstNewAssetChangeMs: number | null;
  readonly uniqueAssetsInFirst5Seconds: number;
  readonly uniqueAssetsInFirst10Seconds: number;
  readonly uniqueAssetsInFirst15Seconds: number;
  readonly longestContinuousSameAssetHoldMs: number;
  readonly longestSemanticBeatHoldMs?: number;
  readonly averageCanonicalAssetHoldMs: number;
  readonly redundantPaidImageCandidateBeatIds: readonly string[];
  readonly informationGain: readonly {
    readonly beatId: string;
    readonly newInformationHash: string;
    readonly addsMaterialInformation: boolean;
  }[];
  readonly higherImageDensityThanOnePerScene: boolean;
}

export interface VeronicaVisualBeatPlanV1 {
  readonly schemaVersion: "veronica-visual-beat-plan.v1";
  readonly policyVersion: string;
  readonly contentId: string;
  readonly semanticSceneCount: number;
  readonly beats: readonly VisualBeatTreatmentV1[];
  readonly quality: VeronicaVisualBeatQuality;
  /** Present for M2-derived plans; legacy persisted plans remain readable. */
  readonly candidateSelection?: VeronicaCandidateSelectionDiagnostics | undefined;
  readonly beatPlanHash: string;
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
  /** Narration-grounded meaning used by remediation and provider readiness. */
  readonly semanticProposition?: VeronicaSemanticProposition;
  readonly semanticCoherence?: {
    readonly claimIntegrity: "PASS" | "FAIL";
    readonly polarityCoherence: "PASS" | "FAIL";
    readonly propositionInternalCoherence: "PASS" | "FAIL";
    readonly treatmentPropositionCompatibility: "PASS" | "FAIL";
  };
  /** A BLOCK is an abstention, never a provider-visible generic fallback. */
  readonly visualEncodingEligibility?:
    | { readonly status: "ELIGIBLE"; readonly operator: string }
    | {
        readonly status: "BLOCK";
        readonly reason: "UNRESOLVED_REQUIRED_MECHANISM" | "LOW_SEMANTIC_CONFIDENCE" | "UNAUTHORIZED_TREATMENT";
        readonly rejectionReasons: readonly string[];
      };
  /** Canonical-pipeline application provenance for an advisor directive. */
  readonly sourceGroundedRemediation?: {
    readonly directiveHash: string;
    readonly repairBoundary: Exclude<SemanticFaultBoundary, "UNKNOWN">;
    readonly regenerationRound: number;
  };
  /** Explicit, reviewed per-episode treatment correction; preserves beat IDs and timing ownership. */
  readonly editorialTreatmentOverride?: {
    readonly overrideHash: string;
    readonly appliedAt: string;
  };
  /** One revision identity shared by final wrapper fields and provider projections. */
  readonly materializationRevision?: {
    readonly revisionId: string;
    readonly treatmentHash: string;
    readonly propositionHash: string | null;
    readonly projectionPolicyVersion: string;
  };
}

export interface VeronicaSemanticQualityMetrics {
  readonly schemaVersion: "veronica-semantic-quality.v1";
  readonly remediationTemplateReuseRate: number;
  readonly genericFallbackSceneRate: number;
  readonly repeatedActionFamilyRate: number;
  readonly repeatedEnvironmentFamilyRate: number;
  readonly intentionalMotifReuseRate: number;
  readonly accidentalRepetitionRate: number;
  readonly status: "PASS" | "FAIL";
  readonly findingCodes: readonly ("REMEDIATION_TEMPLATE_COLLAPSE" | "SEMANTIC_REMEDIATION_LOW_CONFIDENCE")[];
}

export interface VeronicaProviderReadinessResult {
  readonly schemaVersion: "veronica-provider-readiness.v2";
  readonly qualityVersion: "veronica-provider-prompt-quality.v3";
  readonly status: "PASS" | "FAIL";
  readonly checkedSceneCount: number;
  readonly checkedAssetCount: number;
  readonly missingThesisCount: number;
  readonly malformedThesisCount: number;
  readonly blockedProjectionCount: number;
  readonly internalLanguageIssueCount: number;
  readonly incompleteClaimCount: number;
  readonly polarityMismatchCount: number;
  readonly propositionContradictionCount: number;
  readonly treatmentIncompatibilityCount: number;
  readonly projectionMismatchCount: number;
  readonly lexicalCorruptionCount: number;
  readonly motifLeakageCount: number;
  readonly harmfulRepetitionCount: number;
  readonly issues: readonly { readonly sceneId: string; readonly assetId?: string; readonly code: "VISIBLE_THESIS_REQUIRED" | "MALFORMED_VISIBLE_THESIS" | "SEMANTIC_PROVIDER_PROJECTION_INCONSISTENCY" | "PROVIDER_PROMPT_NOT_READY" | "INCOMPLETE_NARRATION_CLAIM" | "SEMANTIC_POLARITY_MISMATCH" | "SEMANTIC_PROPOSITION_INTERNAL_CONTRADICTION" | "TREATMENT_PROPOSITION_COMPATIBILITY" | "PROVIDER_PROJECTION_SEMANTIC_MISMATCH" | "PROVIDER_PROMPT_SEMANTIC_BLOCKER" | "PROVIDER_PROMPT_LEXICAL_CORRUPTION" | "CROSS_EPISODE_MOTIF_LEAKAGE" | "HARMFUL_REPETITION"; readonly reason: string }[];
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
  readonly motifId?: string;
  readonly episodeContentId?: string;
  readonly semanticMeaning?: string;
  readonly evidenceSpans?: readonly VeronicaNarrationEvidenceSpan[];
  readonly selectionVersion?: string;
}

export interface CadenceMetrics {
  readonly durationMs: number;
  readonly baseAssetCount: number;
  readonly visualEventCount: number;
  readonly eventsPerBaseAsset: number;
  readonly meanSecondsPerEvent: number;
  readonly shortestEventSeconds: number;
  readonly longestEventSeconds: number;
  /** Variant-resolved event-duration guidance; not a global Short cadence. */
  readonly targetRangeSeconds: readonly [number, number];
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
  /** Optional during migration. Absence means one implicit visual beat per semantic scene. */
  readonly visualBeatPlan?: VeronicaVisualBeatPlanV1;
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
  /**
   * Present when the compatibility-path artifact was derived from a canonical
   * source planner input. Legacy authored plans intentionally omit it.
   */
  readonly derivation?: {
    readonly schemaVersion: "veronica-visual-plan-derivation.v1";
    readonly artifactOwnership: "derived-compatibility-artifact";
    readonly visualPlanSource: "derived_from_planner_input";
    readonly plannerInputSchemaVersion: "veronica-canonical-source-planner-input.v1";
    readonly plannerInputHash: string;
    readonly sourceRevisionHash: string;
    readonly sourceNarrationSha256: string;
    readonly plannerVersion: typeof POSITIONING_PLANNER_VERSION;
    readonly configurationHash: string;
    readonly planRevisionHash: string;
  };
  /** Semantic reuse authority. Runtime/cache telemetry is intentionally excluded. */
  readonly semanticAuthority?: import("./veronica-semantic-plan-authority.js").VeronicaSemanticAuthorityEnvelope;
  readonly validation: {
    readonly status: "pass" | "fail";
    readonly failures: readonly string[];
  };
  readonly semanticQuality?: VeronicaSemanticQualityMetrics;
  readonly providerReadiness?: VeronicaProviderReadinessResult;
  readonly imagePromptGenerationStrategy?: "deterministic-v1" | "openai" | "legacy-deterministic";
  readonly imagePromptCompilation?: {
    readonly schemaVersion: "veronica-image-prompt-compilation-telemetry.v1";
    readonly episodeId: string;
    readonly sceneCount: number;
    readonly assetCount: number;
    readonly invalidatedAssetCount: number;
    readonly compilerModel: string;
    readonly reasoningEffort: string;
    readonly requestCount: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cachedInputTokens: number;
    readonly latencyMs: number;
    readonly compilerVersion: string;
    readonly compilationHashes: readonly string[];
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly reasonForRegeneration: string;
    readonly estimatedCostUsd?: number;
    readonly requestId?: string;
  };
  /** Independent narration-to-final-artifact gate; never authored by generation. */
  readonly sourceGroundedVisualQa?: SourceGroundedVisualQaResult;
  readonly hierarchicalReadiness?: {
    readonly schemaVersion: "veronica-hierarchical-readiness.v1";
    readonly sourceFidelityReady: boolean;
    readonly visualReady: boolean;
    readonly technicalReady: boolean;
    readonly providerCandidate: boolean;
    readonly providerRequestsAllowed: false;
    readonly blockers: readonly string[];
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
