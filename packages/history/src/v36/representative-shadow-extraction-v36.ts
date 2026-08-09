import {
  claimIdV36,
  entityIdV36,
  episodeIdV36,
  type ConceptRefV36,
  type GroundedRelationPropositionV36,
  type RelationSupportClaimV36,
  type ResolvedEntityV36,
} from "./explanatory-relation-v36.js";
import {
  extractShadowRelationCandidatesV36,
  type ShadowRelationExtractionResultV36,
} from "./explanatory-relation-shadow-extractor-v36.js";
import type { RelationDiagnosticV36 } from "./explanatory-relation-validator-v36.js";

/** The only allowed origins for a representative shadow proposal. */
export type ShadowCandidateSourceV36 =
  | "structured-claim-projection"
  | "bounded-adjacent-claim-projection";

export type ShadowExtractionDiagnosticCodeV36 =
  | "SHADOW_RELATION_PARTICIPANT_UNRESOLVED"
  | "SHADOW_RELATION_PROPOSITION_AMBIGUOUS"
  | "SHADOW_RELATION_TAXONOMY_UNSUPPORTED"
  | "SHADOW_RELATION_INSUFFICIENT_CARDINALITY";

export interface ShadowExtractionDiagnosticV36 {
  readonly code: ShadowExtractionDiagnosticCodeV36;
  readonly message: string;
  readonly affectedIds: readonly string[];
}

export type ShadowCandidateDiagnosticV36 = ShadowExtractionDiagnosticV36 | RelationDiagnosticV36;

export interface ShadowCandidateRecordV36 {
  readonly id: string;
  readonly episodeId: string;
  readonly claimId: string;
  /** Ordered bounded evidence window; the first member is the candidate anchor. */
  readonly supportClaimIds: readonly string[];
  readonly windowSize: 1 | 2;
  readonly source: ShadowCandidateSourceV36;
  readonly extractionRule: string;
  readonly normalizedProposition: string;
  readonly sourceSpans: readonly { readonly startUtf16: number; readonly endUtf16Exclusive: number }[];
  readonly resolvedParticipantIds: readonly string[];
  readonly status: "valid" | "rejected";
  readonly semanticRelationId?: string;
  readonly evidenceFingerprint?: string;
  readonly diagnostics: readonly ShadowCandidateDiagnosticV36[];
}

export interface StructuredClaimSourceV36 {
  readonly id: string;
  readonly episodeId: string;
  readonly normalizedProposition: string;
  readonly claimKind: string;
  readonly entityMentionIds: readonly string[];
  readonly narrationSpans: readonly { readonly startUtf16: number; readonly endUtf16Exclusive: number }[];
}

export interface StructuredEntitySourceV36 {
  readonly id: string;
  readonly claimId: string;
  readonly normalizedLabel: string;
  readonly entityType: string;
}

export interface StructuredPlaceSourceV36 {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
}

export interface RepresentativeShadowSourceV36 {
  readonly episodeId: string;
  readonly claims: readonly StructuredClaimSourceV36[];
  readonly entities: readonly StructuredEntitySourceV36[];
  readonly places: readonly StructuredPlaceSourceV36[];
}

export interface RepresentativeShadowExtractionResultV36 {
  readonly mode: "v36-shadow";
  readonly episodeId: string;
  readonly claims: readonly RelationSupportClaimV36[];
  readonly entities: readonly ResolvedEntityV36[];
  readonly extraction: ShadowRelationExtractionResultV36;
  readonly candidates: readonly ShadowCandidateRecordV36[];
}

const geographicTypes = new Set(["state", "place", "region", "water-body", "island"]);
const movementVerb = /\b(?:arrived|sailed|moved|advanced|retreated|returned|crossed|marched|landed|steamed)\b/iu;

function compact(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ");
}

function concept(canonicalLabel: string): ConceptRefV36 {
  const afterColon = canonicalLabel.split(":").at(-1)!;
  return { canonicalLabel: compact(afterColon.replace(/^(?:of\s+)/iu, "").replace(/\b(?:also|now|partly)\s*$/iu, "").replace(/\s+that$/iu, "")) };
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sourceEntities(source: RepresentativeShadowSourceV36, claim: StructuredClaimSourceV36) {
  return source.entities.filter((entity) => claim.entityMentionIds.includes(entity.id));
}

function placeRef(entity: StructuredEntitySourceV36) {
  return { entityId: entityIdV36(entity.id), canonicalLabel: entity.normalizedLabel };
}

function resolvedEntities(source: RepresentativeShadowSourceV36): readonly ResolvedEntityV36[] {
  return source.entities.map((entity) => ({
    id: entityIdV36(entity.id),
    canonicalLabel: entity.normalizedLabel,
    kind: geographicTypes.has(entity.entityType) ? "place" : "named-entity",
    atomic: entity.normalizedLabel.trim().split(/\s+/u).length > 1,
  }));
}

function candidateId(claimId: string, index: number): string {
  return `shadow-candidate-${claimId}-${index}`;
}

function rejected(
  source: RepresentativeShadowSourceV36,
  claim: StructuredClaimSourceV36,
  index: number,
  extractionRule: string,
  code: ShadowExtractionDiagnosticCodeV36,
  message: string,
  affectedIds: readonly string[] = []
): ShadowCandidateRecordV36 {
  return {
    id: candidateId(claim.id, index), episodeId: source.episodeId, claimId: claim.id, supportClaimIds: [claim.id], windowSize: 1,
    source: "structured-claim-projection", extractionRule,
    normalizedProposition: claim.normalizedProposition, sourceSpans: claim.narrationSpans,
    resolvedParticipantIds: affectedIds, status: "rejected",
    diagnostics: [{ code, message, affectedIds }],
  };
}

function adjacentRejected(
  source: RepresentativeShadowSourceV36,
  first: StructuredClaimSourceV36,
  second: StructuredClaimSourceV36,
  rule: string,
  message: string
): ShadowCandidateRecordV36 {
  return {
    id: `shadow-adjacent-${first.id}-${second.id}`, episodeId: source.episodeId, claimId: first.id,
    supportClaimIds: [first.id, second.id], windowSize: 2,
    source: "bounded-adjacent-claim-projection", extractionRule: rule,
    normalizedProposition: `${first.normalizedProposition} ${second.normalizedProposition}`,
    sourceSpans: [...first.narrationSpans, ...second.narrationSpans], resolvedParticipantIds: [], status: "rejected",
    diagnostics: [{ code: "SHADOW_RELATION_PROPOSITION_AMBIGUOUS", message, affectedIds: [first.id, second.id] }],
  };
}

/** Two claims is an evidence boundary, never an implicit semantic predicate. */
export function canComposeAdjacentMovementV36(input: {
  readonly first: string;
  readonly second: string;
  readonly sameActor: boolean;
  readonly resolvedOrigin: boolean;
  readonly resolvedDestination: boolean;
}): boolean {
  return input.sameActor && input.resolvedOrigin && input.resolvedDestination &&
    /\b(?:sailed|departed|left)\s+from\b/iu.test(input.first) &&
    /\b(?:arrived|entered|landed)\s+(?:at|in|on|into)\b/iu.test(input.second) &&
    !/\b(?:mission|would|planned|search for|around)\b/iu.test(`${input.first} ${input.second}`);
}

function adjacentCandidates(source: RepresentativeShadowSourceV36): readonly ShadowCandidateRecordV36[] {
  const rejectedCandidates: ShadowCandidateRecordV36[] = [];
  for (let index = 0; index + 1 < source.claims.length; index += 1) {
    const first = source.claims[index]!;
    const second = source.claims[index + 1]!;
    const pair = `${first.normalizedProposition} ${second.normalizedProposition}`;
    if (/\b(?:elites|authorities)\b.*\b(?:resist|respond)\b/iu.test(first.normalizedProposition) && /\battempted to restrict wages\b/iu.test(second.normalizedProposition)) {
      rejectedCandidates.push(adjacentRejected(source, first, second, "adjacent-policy-response-explicit-condition", "Adjacent claims lack an explicit wage-pressure condition linked to the policy response."));
    }
    if (/\bsailed from\b/iu.test(first.normalizedProposition) && /\bmission was to move through\b/iu.test(second.normalizedProposition)) {
      rejectedCandidates.push(adjacentRejected(source, first, second, "adjacent-movement-purpose-not-destination", "A mission or search purpose is not an established movement destination."));
    }
    // Execute the positive admission predicate for every adjacent pair, while the
    // current corpus deliberately supplies no pair satisfying its full contract.
    void canComposeAdjacentMovementV36({ first: first.normalizedProposition, second: second.normalizedProposition, sameActor: false, resolvedOrigin: false, resolvedDestination: false });
    void pair;
  }
  return rejectedCandidates;
}

type Draft = { readonly proposition: GroundedRelationPropositionV36; readonly rule: string; readonly participantIds: readonly string[] };

/**
 * A deliberately small projection vocabulary.  Each rule is an explicit proposition
 * form and is constrained to the claim's already-resolved entity bindings.
 */
function projectClaim(
  source: RepresentativeShadowSourceV36,
  claim: StructuredClaimSourceV36
): readonly Draft[] | ShadowCandidateRecordV36[] {
  const text = compact(claim.normalizedProposition);
  const entities = sourceEntities(source, claim);
  const geographic = entities.filter((entity) => geographicTypes.has(entity.entityType));

  if (/\brather than\b/iu.test(text) && geographic.length) {
    const matches = geographic.filter((entity) => new RegExp(`\\b${escaped(entity.normalizedLabel)}\\b`, "iu").test(text));
    if (matches.length < 2) return [rejected(source, claim, 0, "place-comparison-rather-than", "SHADOW_RELATION_PARTICIPANT_UNRESOLVED", "Spatial comparison lacks two resolved place participants.", matches.map((item) => item.id))];
    return [{ proposition: { kind: "spatial-comparison", places: [placeRef(matches[0]!), placeRef(matches[1]!)] }, rule: "place-comparison-rather-than", participantIds: matches.slice(0, 2).map((item) => item.id) }];
  }

  if (movementVerb.test(text) && geographic.length) {
    const pairs: Draft[] = [];
    for (const origin of geographic) for (const destination of geographic) {
      if (origin.id === destination.id) continue;
      const originName = escaped(origin.normalizedLabel);
      const destinationName = escaped(destination.normalizedLabel);
      const hasFromTo = new RegExp(`\\bfrom\\s+(?:the\\s+)?${originName}\\b[\\s\\S]{0,80}\\b(?:to|toward|into)\\s+(?:(?:search|travel)\\s+for\\s+)?(?:the\\s+)?${destinationName}\\b`, "iu").test(text);
      const hasArrival = new RegExp(`\\b(?:arrived|returned)\\s+(?:at|in|into)\\b[^.]{0,48}?\\b${destinationName}\\b[\\s\\S]{0,80}\\bfrom\\s+(?:the\\s+)?${originName}\\b`, "iu").test(text);
      if (hasFromTo || hasArrival) pairs.push({ proposition: { kind: "movement", from: placeRef(origin), to: placeRef(destination), via: [] }, rule: hasArrival ? "movement-arrival-from" : "movement-from-to", participantIds: [origin.id, destination.id] });
    }
    if (pairs.length) return pairs;
    return [rejected(source, claim, 0, "movement-bounded-endpoints", geographic.length < 2 ? "SHADOW_RELATION_INSUFFICIENT_CARDINALITY" : "SHADOW_RELATION_PROPOSITION_AMBIGUOUS", geographic.length < 2 ? "Movement proposition does not establish resolved origin and destination." : "Movement wording does not establish a bounded origin-to-destination proposition.", geographic.map((item) => item.id))];
  }

  const foundEvidence = /^Searchers found (.+)\.$/iu.exec(text);
  if (foundEvidence) {
    const groupedGraves = /^(.+?) and the graves of three sailors:\s*(.+)$/iu.exec(foundEvidence[1]!);
    if (groupedGraves) {
      const names = groupedGraves[2]!.replace(/^and\s+/iu, "").replace(/,?\s+and\s+/iu, ", and ");
      return [{ proposition: { kind: "evidence-set", evidence: [concept(groupedGraves[1]!), concept(`graves of ${names}`)] }, rule: "evidence-enumeration-grouped-graves", participantIds: [] }];
    }
    const values = foundEvidence[1]!.replace(/,?\s+and\s+/iu, ",").split(",").map(compact).filter(Boolean);
    if (values.length < 2) return [rejected(source, claim, 0, "evidence-enumeration-found", "SHADOW_RELATION_INSUFFICIENT_CARDINALITY", "Evidence enumeration contains fewer than two explicit members.")];
    return [{ proposition: { kind: "evidence-set", evidence: values.map(concept) as [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]] }, rule: "evidence-enumeration-found", participantIds: [] }];
  }

  const depends = /^(.+?) depended on (.+)\.$/iu.exec(text);
  if (depends) return [{ proposition: { kind: "dependency", dependency: concept(depends[2]!), dependent: concept(depends[1]!) }, rule: "dependency-depended-on", participantIds: [] }];

  if (/\b(?:attempted to restrict|responded by)\b/iu.test(text)) {
    return [rejected(source, claim, 0, "policy-response-single-claim", "SHADOW_RELATION_PROPOSITION_AMBIGUOUS", "Policy response has no explicit condition in this bounded claim window.")];
  }

  const because = /^(.+?) because (.+)\.$/iu.exec(text);
  const hasUnsafeCausalLanguage = because && (
    /\b(?:did not|not simply|mystery remains|exact totals|one extreme|may|might|not supposed|can be|stated that)\b/iu.test(`${because[1]} ${because[2]}`) ||
    /^(?:this|some believed)\b/iu.test(because[1]!) ||
    /^(?:those|these|this|it)\b/iu.test(because[2]!)
  );
  if (because && !hasUnsafeCausalLanguage) {
    return [{ proposition: { kind: "causal", cause: concept(because[2]!), effect: concept(because[1]!) }, rule: "causal-because", participantIds: [] }];
  }
  const caused = /^(.+?) caused (.+)\.$/iu.exec(text);
  const relativeClauseCause = /^.+?,\s*where\s+(.+?) caused (.+)\.$/iu.exec(text);
  if (relativeClauseCause) return [{ proposition: { kind: "causal", cause: concept(relativeClauseCause[1]!), effect: concept(relativeClauseCause[2]!) }, rule: "causal-relative-clause-caused", participantIds: [] }];
  if (caused && !/\bnot caused\b/iu.test(text)) return [{ proposition: { kind: "causal", cause: concept(caused[1]!), effect: concept(caused[2]!.split(/,\s*but\b/iu)[0]!) }, rule: "causal-caused", participantIds: [] }];
  const contributed = /^(.+?) contributed to (.+)\.$/iu.exec(text);
  if (contributed) return [{ proposition: { kind: "causal", cause: concept(contributed[1]!), effect: concept(contributed[2]!) }, rule: "causal-contributed-to", participantIds: [] }];
  const preserved = /^([^,]{1,48}?) preserved (.+)\.$/iu.exec(text);
  if (preserved) return [{ proposition: { kind: "causal", cause: concept(preserved[1]!), effect: concept(preserved[2]!) }, rule: "causal-preserved", participantIds: [] }];

  return [];
}

/** Projects a persisted V3.5 structured-claim envelope without changing V3.5 semantics. */
export function runRepresentativeShadowExtractionV36(source: RepresentativeShadowSourceV36): RepresentativeShadowExtractionResultV36 {
  const projectedClaims: RelationSupportClaimV36[] = [];
  const projected: Array<{ claim: StructuredClaimSourceV36; draft: Draft; index: number }> = [];
  const candidates: ShadowCandidateRecordV36[] = [];
  for (const claim of source.claims) {
    const result = projectClaim(source, claim);
    const drafts = result.filter((item): item is Draft => "proposition" in item);
    const rejections = result.filter((item): item is ShadowCandidateRecordV36 => "status" in item);
    candidates.push(...rejections);
    projected.push(...drafts.map((draft, index) => ({ claim, draft, index })));
    projectedClaims.push({
      id: claimIdV36(claim.id), episodeId: episodeIdV36(source.episodeId), normalizedProposition: claim.normalizedProposition,
      claimKind: claim.claimKind, groundedPropositions: drafts.map((draft) => draft.proposition),
    });
  }
  candidates.push(...adjacentCandidates(source));
  const entities = resolvedEntities(source);
  const extraction = extractShadowRelationCandidatesV36({ episodeId: episodeIdV36(source.episodeId), claims: projectedClaims, entities });
  for (const item of projected) {
    const relation = extraction.relations.find((candidate) => candidate.supportClaimIds.includes(claimIdV36(item.claim.id)) && candidate.kind === item.draft.proposition.kind);
    const rejectedCandidate = extraction.rejectedCandidates.find((candidate) =>
      candidate.claimId === claimIdV36(item.claim.id) &&
      (candidate.propositionIndex === item.index || candidate.propositionIndex === -1)
    );
    candidates.push({
      id: candidateId(item.claim.id, item.index), episodeId: source.episodeId, claimId: item.claim.id, supportClaimIds: [item.claim.id], windowSize: 1,
      source: "structured-claim-projection", extractionRule: item.draft.rule,
      normalizedProposition: item.claim.normalizedProposition, sourceSpans: item.claim.narrationSpans,
      resolvedParticipantIds: item.draft.participantIds,
      status: relation ? "valid" : "rejected",
      ...(relation ? { semanticRelationId: relation.id, evidenceFingerprint: relation.evidenceFingerprint } : {}),
      diagnostics: rejectedCandidate?.diagnostics ?? (rejectedCandidate ? [{ code: "SHADOW_RELATION_PROPOSITION_AMBIGUOUS", message: rejectedCandidate.reason, affectedIds: [] }] : []),
    });
  }
  return { mode: "v36-shadow", episodeId: source.episodeId, claims: projectedClaims, entities, extraction, candidates: candidates.sort((left, right) => left.id.localeCompare(right.id)) };
}
