import {
  HISTORY_COMPILER_SHADOW_SCHEMA_V36,
  HISTORY_COMPILER_SHADOW_VERSION_V36,
  compilerIntentIdV36,
  compilerProvenanceV36,
  type CompilerIntentV36,
  type CompilerShadowArtifactV36,
  type CompilerSourceProvenanceV36,
  type NoSafeCompilationV36,
} from "./compiler-shadow-contract-v36.js";
import { compileDiagramRelationV36 } from "./compiler-shadow-diagram-v36.js";
import { compileMapRelationV36 } from "./compiler-shadow-map-v36.js";
import type { ExplanatoryRelationV36 } from "./explanatory-relation-v36.js";

export interface ValidatedCompilerInputV36 {
  readonly relation: ExplanatoryRelationV36;
  readonly provenance?: CompilerSourceProvenanceV36;
}

function crossEpisode(
  relation: ExplanatoryRelationV36,
  source: CompilerSourceProvenanceV36,
  expectedEpisodeId: string
): NoSafeCompilationV36 {
  const diagnosticCode = "CROSS_EPISODE_COMPILER_SUPPORT";
  const reason = `Relation episode ${relation.episodeId} does not match compiler episode ${expectedEpisodeId}.`;
  return {
    schemaVersion: HISTORY_COMPILER_SHADOW_SCHEMA_V36,
    compilerVersion: HISTORY_COMPILER_SHADOW_VERSION_V36,
    compilerIntentId: compilerIntentIdV36({
      target: "NO_SAFE_COMPILATION",
      relationId: relation.id,
      semanticIntent: { diagnosticCode, reason, relationKind: relation.kind },
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

/** Strict relation-kind dispatch with exactly one result per validated relation. */
export function compileRelationShadowV36(
  relation: ExplanatoryRelationV36,
  provenance: CompilerSourceProvenanceV36 = {}
): CompilerIntentV36 {
  switch (relation.kind) {
    case "movement":
    case "spatial-comparison":
    case "spatial-area":
    case "event-location":
      return compileMapRelationV36(relation, provenance);
    case "causal":
    case "dependency":
    case "process":
    case "temporal-sequence":
    case "policy-response":
    case "evidence-set":
      return compileDiagramRelationV36(relation, provenance);
  }
}

export function compileHistoryShadowArtifactV36(input: {
  readonly episodeId: string;
  readonly relations: readonly ValidatedCompilerInputV36[];
}): CompilerShadowArtifactV36 {
  const relationIds = input.relations.map(({ relation }) => relation.id);
  if (new Set(relationIds).size !== relationIds.length)
    throw new TypeError("Compiler input relation IDs must be unique.");
  const intents = [...input.relations]
    .sort((left, right) => left.relation.id.localeCompare(right.relation.id))
    .map(({ relation, provenance = {} }) =>
      relation.episodeId === input.episodeId
        ? compileRelationShadowV36(relation, provenance)
        : crossEpisode(relation, provenance, input.episodeId)
    );
  return {
    schemaVersion: HISTORY_COMPILER_SHADOW_SCHEMA_V36,
    compilerVersion: HISTORY_COMPILER_SHADOW_VERSION_V36,
    episodeId: input.episodeId,
    shadowOnly: true,
    intents,
  };
}
