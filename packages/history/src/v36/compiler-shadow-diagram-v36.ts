import {
  HISTORY_COMPILER_SHADOW_SCHEMA_V36,
  HISTORY_COMPILER_SHADOW_VERSION_V36,
  compilerIntentIdV36,
  compilerProvenanceV36,
  type CompilerSourceProvenanceV36,
  type DiagramIntentV36,
  type NoSafeCompilationV36,
} from "./compiler-shadow-contract-v36.js";
import {
  causalAssertionSemanticsV36,
  conceptRefKeyV36,
  explanatoryRelationSchemaV36,
  policyResponseAssertionSemanticsV36,
  type ConceptRefV36,
  type ExplanatoryRelationV36,
  type PolicyResponseRelationV36,
} from "./explanatory-relation-v36.js";

export type DiagramCompilerResultV36 = DiagramIntentV36 | NoSafeCompilationV36;

function common<TRule extends DiagramIntentV36["compilerRule"]>(
  relation: ExplanatoryRelationV36,
  source: CompilerSourceProvenanceV36,
  compilerRule: TRule,
  semanticIntent: unknown
) {
  return {
    schemaVersion: HISTORY_COMPILER_SHADOW_SCHEMA_V36,
    compilerVersion: HISTORY_COMPILER_SHADOW_VERSION_V36,
    compilerIntentId: compilerIntentIdV36({
      target: "DIAGRAM",
      relationId: relation.id,
      semanticIntent,
    }),
    compilerRule,
    episodeId: relation.episodeId,
    relationId: relation.id,
    provenance: compilerProvenanceV36(relation, source),
    shadowOnly: true as const,
    disposition: "DIAGRAM" as const,
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

function canonicalConcepts(
  concepts: readonly ConceptRefV36[]
): readonly ConceptRefV36[] {
  return [...concepts].sort((left, right) =>
    conceptRefKeyV36(left).localeCompare(conceptRefKeyV36(right))
  );
}

function validateProofLineage(
  relation: PolicyResponseRelationV36,
  source: CompilerSourceProvenanceV36
): string | undefined {
  if (!source.proof) return undefined;
  const condition = source.proof.premises.find(
    (premise) => premise.premiseId === "condition"
  );
  const response = source.proof.premises.find(
    (premise) => premise.premiseId === "response"
  );
  const assertion = policyResponseAssertionSemanticsV36(relation);
  if (!condition || !response) return "COMPILER_PROOF_PREMISES_INCOMPLETE";
  if (
    condition.assertionStatus !== assertion.conditionAssertionStatus ||
    response.assertionStatus !== assertion.responseAssertionStatus
  )
    return "COMPILER_PROOF_MODALITY_MISMATCH";
  const proofClaims = [condition.claimId, response.claimId].sort();
  if (
    JSON.stringify(proofClaims) !==
    JSON.stringify([...relation.supportClaimIds].sort())
  )
    return "COMPILER_PROOF_SUPPORT_MISMATCH";
  return undefined;
}

/** Compiles only relation/proof fields already accepted upstream. */
export function compileDiagramRelationV36(
  relation: ExplanatoryRelationV36,
  source: CompilerSourceProvenanceV36 = {}
): DiagramCompilerResultV36 {
  if (!explanatoryRelationSchemaV36.safeParse(relation).success) {
    return noSafe(
      relation,
      source,
      "RELATION_SCHEMA_INVALID",
      "The relation did not pass the accepted ExplanatoryRelationV36 schema."
    );
  }

  switch (relation.kind) {
    case "causal": {
      const semanticIntent = {
        diagramSemanticType: "causal-chain" as const,
        cause: relation.cause,
        effect: relation.effect,
        causalAssertionStatus:
          causalAssertionSemanticsV36(relation).causalAssertionStatus,
      };
      return {
        ...common(relation, source, "diagram-causal.v1", semanticIntent),
        relationKind: "causal",
        ...semanticIntent,
      };
    }
    case "dependency": {
      const semanticIntent = {
        diagramSemanticType: "dependency" as const,
        dependency: relation.dependency,
        dependent: relation.dependent,
      };
      return {
        ...common(relation, source, "diagram-dependency.v1", semanticIntent),
        relationKind: "dependency",
        ...semanticIntent,
      };
    }
    case "process": {
      const semanticIntent = {
        diagramSemanticType: "process" as const,
        steps: relation.steps,
        orderSemantics: "process-order-not-causality" as const,
      };
      return {
        ...common(relation, source, "diagram-process.v1", semanticIntent),
        relationKind: "process",
        ...semanticIntent,
      };
    }
    case "temporal-sequence": {
      const semanticIntent = {
        diagramSemanticType: "temporal-sequence" as const,
        steps: relation.steps,
        orderSemantics: "chronology-not-causality" as const,
      };
      return {
        ...common(
          relation,
          source,
          "diagram-temporal-sequence.v1",
          semanticIntent
        ),
        relationKind: "temporal-sequence",
        ...semanticIntent,
      };
    }
    case "policy-response": {
      const proofDiagnostic = validateProofLineage(relation, source);
      if (proofDiagnostic) {
        return noSafe(
          relation,
          source,
          proofDiagnostic,
          "Proof-aware policy-response lineage does not match the accepted relation."
        );
      }
      const assertion = policyResponseAssertionSemanticsV36(relation);
      const semanticIntent = {
        diagramSemanticType: "policy-response" as const,
        condition: relation.condition,
        conditionAssertionStatus: assertion.conditionAssertionStatus,
        response: relation.response,
        responseAssertionStatus: assertion.responseAssertionStatus,
      };
      return {
        ...common(
          relation,
          source,
          "diagram-policy-response.v1",
          semanticIntent
        ),
        relationKind: "policy-response",
        ...semanticIntent,
      };
    }
    case "evidence-set": {
      const semanticIntent = {
        diagramSemanticType: "evidence-set" as const,
        ...(relation.subject ? { subject: relation.subject } : {}),
        evidence: canonicalConcepts(relation.evidence),
        unorderedSemanticSet: true as const,
        semanticEdges: [] as const,
      };
      return {
        ...common(
          relation,
          source,
          "diagram-evidence-set.v1",
          semanticIntent
        ),
        relationKind: "evidence-set",
        ...semanticIntent,
      };
    }
    default:
      return noSafe(
        relation,
        source,
        "RELATION_KIND_NOT_DIAGRAM_COMPILABLE",
        `Relation kind ${relation.kind} is not a diagram semantic family.`
      );
  }
}
