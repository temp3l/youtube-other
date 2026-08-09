import {
  HISTORY_STRUCTURED_CLAIM_GENERATOR_V36,
  HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  createStructuredClaimEnvelopeV36,
  createStructuredPropositionV36,
  type StructuredClaimDiagnosticCodeV36,
  type StructuredClaimDiagnosticV36,
  type StructuredClaimEnvelopeV36,
  type StructuredParticipantV36,
  type StructuredPropositionV36,
  type StructuredSemanticRoleV36,
} from "./structured-claim-v36.js";
import type {
  AtomicClaimGroundingRecordV36,
  AtomicGroundingDiagnosticCodeV36,
  AtomicPropositionV36,
} from "./atomic-claim-grounding-v36.js";
import type {
  AtomicGroundingResultV36,
  AtomicGroundingSourceV36,
} from "./atomic-claim-grounder-v36.js";
import { claimIdV36, episodeIdV36 } from "./explanatory-relation-v36.js";

export interface StructuredClaimEnrichmentMetricsV36 {
  readonly canonicalClaims: number;
  readonly claimsWithStructuredPropositions: number;
  readonly structuredPropositions: number;
  readonly nativeStructuredPropositions: number;
  readonly backfillStructuredPropositions: number;
  readonly diagnosticsByCode: Readonly<Record<string, number>>;
}

export interface StructuredClaimEnrichmentResultV36 {
  readonly schemaVersion: typeof HISTORY_STRUCTURED_CLAIM_SCHEMA_V36;
  readonly episodeId: string;
  readonly envelopes: readonly StructuredClaimEnvelopeV36[];
  readonly diagnostics: readonly StructuredClaimDiagnosticV36[];
  readonly metrics: StructuredClaimEnrichmentMetricsV36;
}

export interface NativeStructuredClaimInputV36 {
  readonly episodeId: string;
  readonly claimId: string;
  readonly canonicalClaimSchemaVersion: string;
  readonly propositions: readonly StructuredPropositionV36[];
}

function participant(ref: AtomicPropositionV36["subject"]): StructuredParticipantV36 {
  return {
    id: ref.id,
    label: ref.label,
    kind: ref.kind,
    binding: {
      kind: ref.kind === "concept" ? "claim-concept" : "canonical-entity",
      referenceId: ref.id,
    },
  };
}

function rolesFor(proposition: AtomicPropositionV36): readonly StructuredSemanticRoleV36[] {
  const subject = participant(proposition.subject);
  const object = proposition.object ? participant(proposition.object) : undefined;
  switch (proposition.predicate) {
    case "causes":
    case "contributes-to":
      return object ? [{ role: "cause", participant: subject }, { role: "effect", participant: object }] : [{ role: "cause", participant: subject }];
    case "depends-on":
      return object ? [{ role: "dependent", participant: subject }, { role: "dependency", participant: object }] : [{ role: "dependent", participant: subject }];
    case "compares-with":
      return object ? [{ role: "compared-place", participant: subject }, { role: "compared-place", participant: object }] : [{ role: "compared-place", participant: subject }];
    case "contains-evidence-of":
      return object ? [{ role: "evidence-target", participant: subject }, { role: "evidence-item", participant: object }] : [{ role: "evidence-target", participant: subject }];
    case "moves-from":
      return object ? [{ role: "actor", participant: subject }, { role: "origin", participant: object }] : [{ role: "actor", participant: subject }];
    case "moves-through":
      return object ? [{ role: "actor", participant: subject }, { role: "via", participant: object }] : [{ role: "actor", participant: subject }];
    case "search-object":
      return object ? [{ role: "actor", participant: subject }, { role: "objective", participant: object }] : [{ role: "actor", participant: subject }];
    case "located-in":
      return object ? [{ role: "subject", participant: subject }, { role: "location", participant: object }] : [{ role: "subject", participant: subject }];
    case "restricts":
      return object ? [{ role: "action", participant: subject }, { role: "target", participant: object }] : [{ role: "action", participant: subject }];
    case "demands":
      return object ? [{ role: "actor", participant: subject }, { role: "target", participant: object }] : [{ role: "actor", participant: subject }];
    case "transforms":
      return object ? [{ role: "subject", participant: subject }, { role: "object", participant: object }] : [{ role: "subject", participant: subject }];
  }
}

function backfillProposition(proposition: AtomicPropositionV36): StructuredPropositionV36 {
  const subject = participant(proposition.subject);
  const object = proposition.object ? participant(proposition.object) : undefined;
  return createStructuredPropositionV36({
    subject,
    predicate: proposition.predicate,
    ...(object ? { object } : {}),
    roles: rolesFor(proposition),
    assertionStatus: proposition.assertionStatus,
    ...(proposition.qualifiers ? { qualifiers: proposition.qualifiers } : {}),
    sourceSpan: proposition.sourceSpan,
    provenance: {
      structuredSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
      generationMethod: "deterministic-shadow-enrichment",
      generatorVersion: `${HISTORY_STRUCTURED_CLAIM_GENERATOR_V36}:${proposition.provenance.groundingRuleId}`,
      participantBindingReferences: proposition.provenance.resolvedParticipantIds,
    },
  });
}

const diagnosticCodeMap: Readonly<Record<AtomicGroundingDiagnosticCodeV36, StructuredClaimDiagnosticCodeV36>> = {
  GROUNDING_PARTICIPANT_UNRESOLVED: "STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED",
  GROUNDING_PREDICATE_AMBIGUOUS: "STRUCTURED_CLAIM_PREDICATE_AMBIGUOUS",
  GROUNDING_SOURCE_SPAN_INVALID: "STRUCTURED_CLAIM_SOURCE_SPAN_INVALID",
  GROUNDING_PROPER_NAME_FRAGMENTATION: "STRUCTURED_CLAIM_UNSUPPORTED_SEMANTICS",
  GROUNDING_PURPOSE_NOT_DESTINATION: "STRUCTURED_CLAIM_PURPOSE_NOT_DESTINATION",
  GROUNDING_COMPOUND_ARGUMENT_AMBIGUOUS: "STRUCTURED_CLAIM_GROUPING_AMBIGUOUS",
  GROUNDING_UNSUPPORTED_STRUCTURE: "STRUCTURED_CLAIM_UNSUPPORTED_SEMANTICS",
};

function diagnosticsFor(record: AtomicClaimGroundingRecordV36): readonly StructuredClaimDiagnosticV36[] {
  const converted = record.diagnostics.map((item) => ({
    code: diagnosticCodeMap[item.code],
    claimId: item.claimId,
    message: item.message,
    affectedIds: item.affectedIds,
  }));
  if (!record.propositions.length && record.coverage === "insufficient-structure") {
    converted.push({
      code: "STRUCTURED_CLAIM_BACKFILL_INSUFFICIENT",
      claimId: record.claimId,
      message: "The historical compatibility backfill found no bounded proposition; native claim-boundary structure is unavailable.",
      affectedIds: [],
    });
  }
  return converted;
}

function countValues(values: readonly string[]): Readonly<Record<string, number>> {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
}

/**
 * Native V3.6 path: a canonical claim generator supplies already-structured,
 * claim-local semantics. This adapter validates and versions the separate shadow
 * envelope without mutating HistoryClaimV34 or its persisted V3.5 serialization.
 */
export function createNativeStructuredClaimEnvelopeV36(
  input: NativeStructuredClaimInputV36
): StructuredClaimEnvelopeV36 {
  return createStructuredClaimEnvelopeV36({
    schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    episodeId: episodeIdV36(input.episodeId),
    claimId: claimIdV36(input.claimId),
    source: {
      kind: "existing-structured-claim",
      canonicalClaimSchemaVersion: input.canonicalClaimSchemaVersion,
    },
    propositions: input.propositions,
  });
}

/**
 * Historical-only compatibility path. It wraps the frozen deterministic atomic
 * result with explicit backfill provenance; it is not native structured claim generation.
 */
export function backfillStructuredClaimsV36(
  source: AtomicGroundingSourceV36,
  frozenGrounding: AtomicGroundingResultV36
): StructuredClaimEnrichmentResultV36 {
  if (source.episodeId !== frozenGrounding.episodeId) {
    throw new Error("Structured claim backfill requires episode-local frozen grounding.");
  }
  const recordByClaim = new Map(frozenGrounding.claims.map((record) => [record.claimId, record]));
  const envelopes = source.claims.map((claim) => {
    const record = recordByClaim.get(claimIdV36(claim.id));
    if (!record) throw new Error(`Missing frozen grounding record for claim ${claim.id}.`);
    return createStructuredClaimEnvelopeV36({
      schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
      episodeId: episodeIdV36(source.episodeId),
      claimId: claimIdV36(claim.id),
      source: {
        kind: "deterministic-shadow-enrichment",
        canonicalClaimSchemaVersion: "history-claim.v3.4",
      },
      propositions: record.propositions.map(backfillProposition),
    });
  });
  const diagnostics = frozenGrounding.claims.flatMap(diagnosticsFor);
  const propositions = envelopes.flatMap((envelope) => envelope.propositions);
  return {
    schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    episodeId: source.episodeId,
    envelopes,
    diagnostics,
    metrics: {
      canonicalClaims: source.claims.length,
      claimsWithStructuredPropositions: envelopes.filter((envelope) => envelope.propositions.length > 0).length,
      structuredPropositions: propositions.length,
      nativeStructuredPropositions: propositions.filter((proposition) => proposition.provenance.generationMethod === "native-structured-claim-generation").length,
      backfillStructuredPropositions: propositions.filter((proposition) => proposition.provenance.generationMethod === "deterministic-shadow-enrichment").length,
      diagnosticsByCode: countValues(diagnostics.map((item) => item.code)),
    },
  };
}

/**
 * Claim-local shadow merge: native structure wins for its canonical claim while
 * untouched claims retain the explicitly labeled historical compatibility path.
 */
export function mergeNativeStructuredClaimsWithCompatibilityV36(input: {
  readonly source: AtomicGroundingSourceV36;
  readonly frozenGrounding: AtomicGroundingResultV36;
  readonly nativeEnvelopes: readonly StructuredClaimEnvelopeV36[];
  readonly nativeDiagnostics?: readonly StructuredClaimDiagnosticV36[];
}): StructuredClaimEnrichmentResultV36 {
  const compatibility = backfillStructuredClaimsV36(input.source, input.frozenGrounding);
  const nativeByClaim = new Map(
    input.nativeEnvelopes
      .filter((envelope) => envelope.episodeId === input.source.episodeId && envelope.propositions.length > 0)
      .map((envelope) => [envelope.claimId, envelope] as const)
  );
  const envelopes = compatibility.envelopes.map((envelope) =>
    nativeByClaim.get(envelope.claimId) ?? envelope
  );
  const nativeClaimIds = new Set(nativeByClaim.keys());
  const diagnostics = [
    ...compatibility.diagnostics.filter((item) => !nativeClaimIds.has(item.claimId)),
    ...(input.nativeDiagnostics ?? []),
  ];
  const propositions = envelopes.flatMap((envelope) => envelope.propositions);
  return {
    schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    episodeId: input.source.episodeId,
    envelopes,
    diagnostics,
    metrics: {
      canonicalClaims: input.source.claims.length,
      claimsWithStructuredPropositions: envelopes.filter((envelope) => envelope.propositions.length > 0).length,
      structuredPropositions: propositions.length,
      nativeStructuredPropositions: propositions.filter((proposition) => proposition.provenance.generationMethod === "native-structured-claim-generation").length,
      backfillStructuredPropositions: propositions.filter((proposition) => proposition.provenance.generationMethod === "deterministic-shadow-enrichment").length,
      diagnosticsByCode: countValues(diagnostics.map((item) => item.code)),
    },
  };
}
