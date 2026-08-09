import {
  HISTORY_COMPILER_SHADOW_SCHEMA_V36,
  HISTORY_COMPILER_SHADOW_VERSION_V36,
  compilerIntentIdV36,
  compilerProvenanceV36,
  type CompilerSourceProvenanceV36,
  type MapIntentV36,
  type NoSafeCompilationV36,
} from "./compiler-shadow-contract-v36.js";
import {
  explanatoryRelationSchemaV36,
  type ExplanatoryRelationV36,
  type PlaceRefV36,
} from "./explanatory-relation-v36.js";

export type MapCompilerResultV36 = MapIntentV36 | NoSafeCompilationV36;

function common<TRule extends MapIntentV36["compilerRule"]>(
  relation: ExplanatoryRelationV36,
  source: CompilerSourceProvenanceV36,
  compilerRule: TRule,
  semanticIntent: unknown
) {
  return {
    schemaVersion: HISTORY_COMPILER_SHADOW_SCHEMA_V36,
    compilerVersion: HISTORY_COMPILER_SHADOW_VERSION_V36,
    compilerIntentId: compilerIntentIdV36({
      target: "MAP",
      relationId: relation.id,
      semanticIntent,
    }),
    compilerRule,
    episodeId: relation.episodeId,
    relationId: relation.id,
    provenance: compilerProvenanceV36(relation, source),
    shadowOnly: true as const,
    disposition: "MAP" as const,
  };
}

function noSafe(
  relation: ExplanatoryRelationV36,
  source: CompilerSourceProvenanceV36,
  diagnosticCode: string,
  reason: string
): NoSafeCompilationV36 {
  const semanticIntent = { diagnosticCode, reason, relationKind: relation.kind };
  return {
    schemaVersion: HISTORY_COMPILER_SHADOW_SCHEMA_V36,
    compilerVersion: HISTORY_COMPILER_SHADOW_VERSION_V36,
    compilerIntentId: compilerIntentIdV36({
      target: "NO_SAFE_COMPILATION",
      relationId: relation.id,
      semanticIntent,
    }),
    compilerRule: "no-safe-compilation.v1",
    episodeId: relation.episodeId,
    relationId: relation.id,
    relationKind: relation.kind,
    provenance: compilerProvenanceV36(relation, source),
    shadowOnly: true,
    disposition: "NO_SAFE_COMPILATION",
    diagnosticCode,
    reason,
  };
}

function canonicalPlaces(places: readonly PlaceRefV36[]): readonly PlaceRefV36[] {
  return [...places].sort((left, right) =>
    left.entityId.localeCompare(right.entityId)
  );
}

/**
 * Compiles only already-validated typed relation fields. It never accepts
 * narration, claims, adjacent context, or untyped geographic strings.
 */
export function compileMapRelationV36(
  relation: ExplanatoryRelationV36,
  source: CompilerSourceProvenanceV36 = {}
): MapCompilerResultV36 {
  if (!explanatoryRelationSchemaV36.safeParse(relation).success) {
    return noSafe(
      relation,
      source,
      "RELATION_SCHEMA_INVALID",
      "The relation did not pass the accepted ExplanatoryRelationV36 schema."
    );
  }

  switch (relation.kind) {
    case "movement": {
      const semanticIntent = {
        mapSemanticType: "movement" as const,
        from: relation.from,
        to: relation.to,
        via: relation.via,
      };
      return {
        ...common(relation, source, "map-movement.v1", semanticIntent),
        relationKind: "movement",
        ...semanticIntent,
      };
    }
    case "spatial-comparison": {
      const semanticIntent = {
        mapSemanticType: "comparison" as const,
        places: canonicalPlaces(relation.places),
        unorderedSemanticSet: true as const,
      };
      return {
        ...common(
          relation,
          source,
          "map-spatial-comparison.v1",
          semanticIntent
        ),
        relationKind: "spatial-comparison",
        ...semanticIntent,
      };
    }
    case "spatial-area": {
      const semanticIntent = {
        mapSemanticType: "area" as const,
        place: relation.place,
      };
      return {
        ...common(relation, source, "map-spatial-area.v1", semanticIntent),
        relationKind: "spatial-area",
        ...semanticIntent,
      };
    }
    case "event-location": {
      const semanticIntent = {
        mapSemanticType: "event-location" as const,
        event: relation.event,
        location: relation.location,
        assertionStatus: relation.assertionStatus,
      };
      return {
        ...common(relation, source, "map-event-location.v1", semanticIntent),
        relationKind: "event-location",
        ...semanticIntent,
      };
    }
    default:
      return noSafe(
        relation,
        source,
        "RELATION_KIND_NOT_MAP_COMPILABLE",
        `Relation kind ${relation.kind} is not a map semantic family.`
      );
  }
}
