import { createHash } from "node:crypto";

import type { AtomicAssertionStatusV36 } from "./atomic-claim-grounding-v36.js";
import type {
  ConceptRefV36,
  EventSubjectRefV36,
  ExplanatoryRelationV36,
  PlaceRefV36,
  RelationKindV36,
} from "./explanatory-relation-v36.js";

export const HISTORY_COMPILER_SHADOW_SCHEMA_V36 =
  "history-compiler-shadow-intent.v1" as const;
export const HISTORY_COMPILER_SHADOW_VERSION_V36 =
  "history-compiler-shadow.v3.6.0" as const;

export type CompilerDispositionV36 =
  | "MAP"
  | "DIAGRAM"
  | "NO_SAFE_COMPILATION";

export type CompilerRuleV36 =
  | "map-movement.v1"
  | "map-spatial-comparison.v1"
  | "map-spatial-area.v1"
  | "map-event-location.v1"
  | "diagram-causal.v1"
  | "diagram-dependency.v1"
  | "diagram-process.v1"
  | "diagram-temporal-sequence.v1"
  | "diagram-policy-response.v1"
  | "diagram-evidence-set.v1";

export interface CompilerProofPremiseLineageV36 {
  readonly claimId: string;
  readonly structuredPropositionId: string;
  readonly atomicGroundingId: string;
  readonly assertionStatus: AtomicAssertionStatusV36;
}

export interface CompilerProofLineageV36 {
  readonly proofEvidenceId: string;
  readonly proofId: string;
  readonly proofEvidenceFingerprint: string;
  readonly premises: readonly CompilerProofPremiseLineageV36[];
}

/**
 * Compiler provenance is supplied by the accepted validator/candidate lane.
 * Compilers must not reconstruct it by reading claims or narration.
 */
export interface CompilerProvenanceV36 {
  readonly relationId: string;
  readonly evidenceFingerprint: string;
  readonly supportClaimIds: readonly string[];
  readonly structuredPropositionIds: readonly string[];
  readonly atomicGroundingIds: readonly string[];
  readonly proof?: CompilerProofLineageV36;
}

export interface CompilerSourceProvenanceV36 {
  readonly structuredPropositionIds?: readonly string[];
  readonly atomicGroundingIds?: readonly string[];
  readonly proof?: CompilerProofLineageV36;
}

interface CompilerIntentBaseV36 {
  readonly schemaVersion: typeof HISTORY_COMPILER_SHADOW_SCHEMA_V36;
  readonly compilerVersion: typeof HISTORY_COMPILER_SHADOW_VERSION_V36;
  readonly compilerIntentId: string;
  readonly compilerRule: CompilerRuleV36;
  readonly episodeId: string;
  readonly relationId: string;
  readonly relationKind: RelationKindV36;
  readonly provenance: CompilerProvenanceV36;
  readonly shadowOnly: true;
}

export interface MovementMapIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "MAP";
  readonly relationKind: "movement";
  readonly compilerRule: "map-movement.v1";
  readonly mapSemanticType: "movement";
  readonly from: PlaceRefV36;
  readonly to: PlaceRefV36;
  readonly via: readonly PlaceRefV36[];
}

export interface SpatialComparisonMapIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "MAP";
  readonly relationKind: "spatial-comparison";
  readonly compilerRule: "map-spatial-comparison.v1";
  readonly mapSemanticType: "comparison";
  readonly places: readonly PlaceRefV36[];
  readonly unorderedSemanticSet: true;
}

export interface SpatialAreaMapIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "MAP";
  readonly relationKind: "spatial-area";
  readonly compilerRule: "map-spatial-area.v1";
  readonly mapSemanticType: "area";
  readonly place: PlaceRefV36;
}

export interface EventLocationMapIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "MAP";
  readonly relationKind: "event-location";
  readonly compilerRule: "map-event-location.v1";
  readonly mapSemanticType: "event-location";
  readonly event: EventSubjectRefV36;
  readonly location: PlaceRefV36;
  readonly assertionStatus: AtomicAssertionStatusV36;
}

export type MapIntentV36 =
  | MovementMapIntentV36
  | SpatialComparisonMapIntentV36
  | SpatialAreaMapIntentV36
  | EventLocationMapIntentV36;

export interface CausalDiagramIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "DIAGRAM";
  readonly relationKind: "causal";
  readonly compilerRule: "diagram-causal.v1";
  readonly diagramSemanticType: "causal-chain";
  readonly cause: ConceptRefV36;
  readonly effect: ConceptRefV36;
  readonly causalAssertionStatus: AtomicAssertionStatusV36;
}

export interface DependencyDiagramIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "DIAGRAM";
  readonly relationKind: "dependency";
  readonly compilerRule: "diagram-dependency.v1";
  readonly diagramSemanticType: "dependency";
  /** Direction remains dependency -> dependent. */
  readonly dependency: ConceptRefV36;
  readonly dependent: ConceptRefV36;
}

export interface ProcessDiagramIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "DIAGRAM";
  readonly relationKind: "process";
  readonly compilerRule: "diagram-process.v1";
  readonly diagramSemanticType: "process";
  readonly steps: readonly ConceptRefV36[];
  readonly orderSemantics: "process-order-not-causality";
}

export interface TemporalSequenceDiagramIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "DIAGRAM";
  readonly relationKind: "temporal-sequence";
  readonly compilerRule: "diagram-temporal-sequence.v1";
  readonly diagramSemanticType: "temporal-sequence";
  readonly steps: readonly ConceptRefV36[];
  readonly orderSemantics: "chronology-not-causality";
}

export interface PolicyResponseDiagramIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "DIAGRAM";
  readonly relationKind: "policy-response";
  readonly compilerRule: "diagram-policy-response.v1";
  readonly diagramSemanticType: "policy-response";
  readonly condition: ConceptRefV36;
  readonly conditionAssertionStatus: AtomicAssertionStatusV36;
  readonly response: ConceptRefV36;
  readonly responseAssertionStatus: AtomicAssertionStatusV36;
}

export interface EvidenceSetDiagramIntentV36 extends CompilerIntentBaseV36 {
  readonly disposition: "DIAGRAM";
  readonly relationKind: "evidence-set";
  readonly compilerRule: "diagram-evidence-set.v1";
  readonly diagramSemanticType: "evidence-set";
  readonly subject?: ConceptRefV36;
  readonly evidence: readonly ConceptRefV36[];
  readonly unorderedSemanticSet: true;
  readonly semanticEdges: readonly [];
}

export type DiagramIntentV36 =
  | CausalDiagramIntentV36
  | DependencyDiagramIntentV36
  | ProcessDiagramIntentV36
  | TemporalSequenceDiagramIntentV36
  | PolicyResponseDiagramIntentV36
  | EvidenceSetDiagramIntentV36;

export interface NoSafeCompilationV36 extends CompilerIntentBaseV36 {
  readonly disposition: "NO_SAFE_COMPILATION";
  readonly diagnosticCode: string;
  readonly reason: string;
}

export type CompilerIntentV36 =
  | MapIntentV36
  | DiagramIntentV36
  | NoSafeCompilationV36;

export interface CompilerShadowArtifactV36 {
  readonly schemaVersion: typeof HISTORY_COMPILER_SHADOW_SCHEMA_V36;
  readonly compilerVersion: typeof HISTORY_COMPILER_SHADOW_VERSION_V36;
  readonly episodeId: string;
  readonly shadowOnly: true;
  readonly intents: readonly CompilerIntentV36[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function compilerIntentIdV36(input: {
  readonly target: CompilerDispositionV36;
  readonly relationId: string;
  readonly semanticIntent: unknown;
}): string {
  const digest = createHash("sha256")
    .update(
      stable({
        compilerContractVersion: HISTORY_COMPILER_SHADOW_SCHEMA_V36,
        target: input.target,
        relationId: input.relationId,
        semanticIntent: input.semanticIntent,
      })
    )
    .digest("hex")
    .slice(0, 24);
  return `history-compiler-intent-${digest}`;
}

function canonical(values: readonly string[] | undefined): readonly string[] {
  return [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right));
}

export function compilerProvenanceV36(
  relation: ExplanatoryRelationV36,
  source: CompilerSourceProvenanceV36 = {}
): CompilerProvenanceV36 {
  return {
    relationId: relation.id,
    evidenceFingerprint: relation.evidenceFingerprint,
    supportClaimIds: [...relation.supportClaimIds],
    structuredPropositionIds: canonical(source.structuredPropositionIds),
    atomicGroundingIds: canonical(source.atomicGroundingIds),
    ...(source.proof ? { proof: source.proof } : {}),
  };
}
