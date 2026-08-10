import { createHash } from "node:crypto";

import type {
  CompilerProvenanceV36,
  DiagramIntentV36,
  MapIntentV36,
} from "./compiler-shadow-contract-v36.js";
import type { RelationKindV36 } from "./explanatory-relation-v36.js";

export const HISTORY_RENDERER_SHADOW_SCHEMA_V36 =
  "history-renderer-shadow-spec.v1" as const;
export const HISTORY_RENDERER_SHADOW_VERSION_V36 =
  "history-renderer-shadow.v3.6.0" as const;

export type RendererDiagnosticCodeV36 =
  | "UNSUPPORTED_RENDERER_CONTRACT"
  | "SEMANTIC_MODALITY_NOT_REPRESENTABLE"
  | "UNRESOLVED_GEOGRAPHY"
  | "INVALID_RENDER_SPEC"
  | "RENDERER_REQUIRES_SEMANTIC_INFERENCE"
  | "PROOF_SUPPORT_NOT_REPRESENTABLE";

export type RendererRuleV36 =
  | "map-movement-svg.v1"
  | "map-spatial-comparison-svg.v1"
  | "map-spatial-area-svg.v1"
  | "map-event-location-svg.v1"
  | "diagram-causal-svg.v1"
  | "diagram-dependency-svg.v1"
  | "diagram-process-svg.v1"
  | "diagram-temporal-sequence-svg.v1"
  | "diagram-policy-response-svg.v1"
  | "diagram-evidence-set-svg.v1";

export interface ResolvedGeographyV36 {
  readonly entityId: string;
  readonly canonicalLabel: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly geometrySource: string;
  readonly placeKind?: "point" | "area";
  readonly renderAnchorPresentationOnly?: boolean;
}

export interface RenderPointV36 {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly role: string;
  readonly status?: string;
  readonly placeKind?: "point" | "area";
  readonly renderAnchorPresentationOnly?: boolean;
}

export interface RenderEdgeV36 {
  readonly from: string;
  readonly to: string;
  readonly semanticType: string;
  readonly directed: boolean;
  readonly label?: string;
}

interface RenderSpecBaseV36 {
  readonly schemaVersion: typeof HISTORY_RENDERER_SHADOW_SCHEMA_V36;
  readonly rendererVersion: typeof HISTORY_RENDERER_SHADOW_VERSION_V36;
  readonly renderSpecId: string;
  readonly compilerIntentId: string;
  readonly relationId: string;
  readonly relationKind: RelationKindV36;
  readonly episodeId: string;
  readonly rendererRule: RendererRuleV36;
  readonly shadowOnly: true;
  readonly provenance: CompilerProvenanceV36;
  readonly width: 1200;
  readonly height: 675;
}

export interface MapRenderSpecV36 extends RenderSpecBaseV36 {
  readonly disposition: "RENDER_SPEC";
  readonly renderTarget: "MAP_SVG";
  /** Accepted semantic input is preserved verbatim; layout never replaces it. */
  readonly semanticPayload: MapIntentV36;
  readonly points: readonly RenderPointV36[];
  readonly edges: readonly RenderEdgeV36[];
  readonly viewport: {
    readonly minLatitude: number;
    readonly maxLatitude: number;
    readonly minLongitude: number;
    readonly maxLongitude: number;
    readonly paddingRatio: 0.12;
  };
}

export interface DiagramRenderSpecV36 extends RenderSpecBaseV36 {
  readonly disposition: "RENDER_SPEC";
  readonly renderTarget: "DIAGRAM_SVG";
  /** Accepted semantic input is preserved verbatim; layout never replaces it. */
  readonly semanticPayload: DiagramIntentV36;
  readonly points: readonly RenderPointV36[];
  readonly edges: readonly RenderEdgeV36[];
  readonly legend: readonly string[];
}

export type RenderSpecV36 = MapRenderSpecV36 | DiagramRenderSpecV36;

export interface NoSafeRenderingV36 {
  readonly schemaVersion: typeof HISTORY_RENDERER_SHADOW_SCHEMA_V36;
  readonly rendererVersion: typeof HISTORY_RENDERER_SHADOW_VERSION_V36;
  readonly disposition: "NO_SAFE_RENDERING";
  readonly compilerIntentId: string;
  readonly relationId: string;
  readonly relationKind: RelationKindV36;
  readonly episodeId: string;
  readonly shadowOnly: true;
  readonly provenance: CompilerProvenanceV36;
  readonly diagnosticCode: RendererDiagnosticCodeV36;
  readonly reason: string;
}

export type RendererShadowResultV36 = RenderSpecV36 | NoSafeRenderingV36;

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

/** Identity excludes time, paths, and layout. Layout is deterministic but non-semantic. */
export function renderSpecIdV36(input: {
  readonly compilerIntentId: string;
  readonly semanticPayload: unknown;
}): string {
  const digest = createHash("sha256")
    .update(
      stable({
        renderSpecContractVersion: HISTORY_RENDERER_SHADOW_SCHEMA_V36,
        compilerIntentId: input.compilerIntentId,
        semanticPayload: input.semanticPayload,
      })
    )
    .digest("hex")
    .slice(0, 24);
  return `history-render-spec-${digest}`;
}
