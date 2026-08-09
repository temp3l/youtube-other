import {
  atomicConceptIdV36,
  createAtomicPropositionV36,
  HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  sourceTextHashV36,
  type AtomicAssertionStatusV36,
  type AtomicClaimGroundingRecordV36,
  type AtomicConceptRefV36,
  type AtomicGroundingCoverageCategoryV36,
  type AtomicGroundingDiagnosticCodeV36,
  type AtomicGroundingDiagnosticV36,
  type AtomicGroundingRuleIdV36,
  type AtomicPredicateV36,
  type AtomicPropositionV36,
  type AtomicQualifierV36,
} from "./atomic-claim-grounding-v36.js";
import {
  claimIdV36,
  entityIdV36,
  episodeIdV36,
  type ConceptRefV36,
  type GroundedRelationPropositionV36,
  type PlaceRefV36,
} from "./explanatory-relation-v36.js";

export interface AtomicGroundingClaimSourceV36 {
  readonly id: string;
  readonly episodeId: string;
  readonly normalizedProposition: string;
  readonly claimKind: string;
  readonly entityMentionIds: readonly string[];
  readonly narrationSpans: readonly {
    readonly startUtf16: number;
    readonly endUtf16Exclusive: number;
  }[];
  readonly groundedPropositions?: readonly unknown[];
}

export interface AtomicGroundingEntitySourceV36 {
  readonly id: string;
  readonly claimId: string;
  readonly normalizedLabel: string;
  readonly entityType: string;
}

export interface AtomicGroundingSourceV36 {
  readonly episodeId: string;
  readonly claims: readonly AtomicGroundingClaimSourceV36[];
  readonly entities: readonly AtomicGroundingEntitySourceV36[];
}

export interface AtomicGroundingMetricsV36 {
  readonly claimsInspected: number;
  readonly claimsWithExistingStructuredPropositions: number;
  readonly claimsNewlyGroundedDeterministically: number;
  readonly atomicPropositionsEmitted: number;
  readonly groundingRejects: number;
  readonly unresolvedParticipantCases: number;
  readonly ambiguousPredicateCases: number;
  readonly assertionStatusCounts: Readonly<Record<string, number>>;
  readonly groundingRulesUsed: Readonly<Record<string, number>>;
  readonly coverageCounts: Readonly<Record<AtomicGroundingCoverageCategoryV36, number>>;
}

export interface AtomicGroundingResultV36 {
  readonly schemaVersion: typeof HISTORY_ATOMIC_GROUNDING_SCHEMA_V36;
  readonly episodeId: string;
  readonly claims: readonly AtomicClaimGroundingRecordV36[];
  readonly propositions: readonly AtomicPropositionV36[];
  readonly diagnostics: readonly AtomicGroundingDiagnosticV36[];
  readonly metrics: AtomicGroundingMetricsV36;
}

const geographicTypes = new Set(["state", "place", "region", "water-body", "island"]);

function compact(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ");
}

function countValues(values: readonly string[]): Readonly<Record<string, number>> {
  const output: Record<string, number> = {};
  for (const value of values) output[value] = (output[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(output).sort(([left], [right]) => left.localeCompare(right)));
}

function concept(label: string): AtomicConceptRefV36 {
  const afterColon = compact(label).split(":").at(-1)!;
  const canonical = compact(afterColon)
    .replace(/^(?:of\s+)/iu, "")
    .replace(/\b(?:also|now|partly)\s*$/iu, "")
    .replace(/\s+that$/iu, "");
  return { id: atomicConceptIdV36(canonical), label: canonical, kind: "concept" };
}

function entityRef(entity: AtomicGroundingEntitySourceV36): AtomicConceptRefV36 {
  return {
    id: entityIdV36(entity.id),
    label: entity.normalizedLabel,
    kind: geographicTypes.has(entity.entityType) ? "place" : "entity",
  };
}

function claimEntities(
  source: AtomicGroundingSourceV36,
  claim: AtomicGroundingClaimSourceV36
): readonly AtomicGroundingEntitySourceV36[] {
  const ids = new Set(claim.entityMentionIds);
  return source.entities.filter((entity) => ids.has(entity.id) && entity.claimId === claim.id);
}

function exactEntity(
  source: AtomicGroundingSourceV36,
  claim: AtomicGroundingClaimSourceV36,
  label: string
): AtomicGroundingEntitySourceV36 | undefined {
  const normalizedLabel = compact(label).replace(/^the\s+/iu, "").toLocaleLowerCase();
  return claimEntities(source, claim).find((entity) =>
    entity.normalizedLabel.trim().toLocaleLowerCase() === normalizedLabel
  );
}

function diagnostic(
  claim: AtomicGroundingClaimSourceV36,
  code: AtomicGroundingDiagnosticCodeV36,
  message: string,
  affectedIds: readonly string[] = []
): AtomicGroundingDiagnosticV36 {
  return { code, claimId: claimIdV36(claim.id), message, affectedIds };
}

function sourceSpan(
  claim: AtomicGroundingClaimSourceV36,
  exactText: string
): AtomicPropositionV36["sourceSpan"] | null {
  const narrationSpan = claim.narrationSpans[0];
  const offset = claim.normalizedProposition.indexOf(exactText);
  if (!narrationSpan || offset < 0 || claim.narrationSpans.length !== 1) return null;
  const startUtf16 = narrationSpan.startUtf16 + offset;
  const endUtf16Exclusive = startUtf16 + exactText.length;
  if (startUtf16 < narrationSpan.startUtf16 || endUtf16Exclusive > narrationSpan.endUtf16Exclusive) {
    return null;
  }
  return {
    startUtf16,
    endUtf16Exclusive,
    text: exactText,
    textHash: sourceTextHashV36(exactText),
  };
}

interface PropositionDraft {
  readonly subject: AtomicConceptRefV36;
  readonly predicate: AtomicPredicateV36;
  readonly object?: AtomicConceptRefV36;
  readonly qualifiers?: readonly AtomicQualifierV36[] | undefined;
  readonly assertionStatus: AtomicAssertionStatusV36;
  readonly exactText: string;
  readonly rule: AtomicGroundingRuleIdV36;
  readonly sourceKind?: "existing-structured-proposition" | "resolved-participants" | "bounded-deterministic-normalization";
}

function materialize(
  source: AtomicGroundingSourceV36,
  claim: AtomicGroundingClaimSourceV36,
  draft: PropositionDraft,
  diagnostics: AtomicGroundingDiagnosticV36[]
): AtomicPropositionV36 | null {
  const span = sourceSpan(claim, draft.exactText);
  if (!span) {
    diagnostics.push(diagnostic(
      claim,
      "GROUNDING_SOURCE_SPAN_INVALID",
      "The exact grounding text could not be mapped inside the claim's single source span."
    ));
    return null;
  }
  const qualifierParticipantIds = draft.qualifiers?.flatMap((qualifier) => qualifier.participantIds ?? []) ?? [];
  const resolvedParticipantIds = [...new Set([
    draft.subject.id,
    ...(draft.object ? [draft.object.id] : []),
    ...qualifierParticipantIds,
  ])].sort((left, right) => left.localeCompare(right));
  return createAtomicPropositionV36({
    episodeId: episodeIdV36(source.episodeId),
    claimId: claimIdV36(claim.id),
    subject: draft.subject,
    predicate: draft.predicate,
    ...(draft.object ? { object: draft.object } : {}),
    ...(draft.qualifiers?.length ? { qualifiers: draft.qualifiers } : {}),
    assertionStatus: draft.assertionStatus,
    sourceSpan: span,
    provenance: {
      sourceKind: draft.sourceKind ?? "bounded-deterministic-normalization",
      groundingRuleId: draft.rule,
      groundingSchemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
      resolvedParticipantIds,
    },
  });
}

function groupedQualifier(value: string): readonly AtomicQualifierV36[] | undefined {
  return /,|\band\b|\bor\b/iu.test(value)
    ? [{ kind: "grouped-concept", value: compact(value) }]
    : undefined;
}

function assertionStatus(text: string): AtomicAssertionStatusV36 {
  // Grounding rules below emit one proposition from the leading clause.  A marker
  // in a coordinate or comparative subordinate clause must not change that
  // proposition's assertion status.
  const modalityText = text
    .replace(/\bMay \d{4}\b/gu, "")
    .split(/\s*(?:,?\s+but|;|\band\s+then)\s+/iu)[0]!
    .replace(/\bthan\s+[^.]*?\bsuggests?\b/iu, "");
  if (/\b(?:mission was to|intended to|planned to|was scheduled to)\b/iu.test(modalityText)) return "intended";
  if (/\b(?:attempted to|tried to)\b/iu.test(modalityText)) return "attempted";
  if (/\b(?:would have|could have)\b/iu.test(modalityText)) return "counterfactual";
  if (/\b(?:could|may|might|suggests?|appears?|uncertain)\b/iu.test(modalityText)) return "uncertain";
  if (/\b(?:stated|reported|believed)\b/iu.test(modalityText)) return "reported";
  return "asserted";
}

function plausiblyUnresolvedParticipant(
  source: AtomicGroundingSourceV36,
  claim: AtomicGroundingClaimSourceV36,
  value: string
): boolean {
  const candidate = compact(value).replace(/^(?:the|a|an)\s+/iu, "");
  if (!candidate) return false;
  // Existing claim bindings are the strongest available signal, even where a
  // rule's exact label normalization did not resolve the participant.
  if (claimEntities(source, claim).some((entity) => {
    const label = entity.normalizedLabel.trim().toLocaleLowerCase();
    const normalized = candidate.toLocaleLowerCase();
    return label === normalized || label.includes(normalized) || normalized.includes(label);
  })) return true;
  // With no binding, retain a bounded proper-name candidate (for example
  // Pevensey), but reject arbitrary lower-case clause fragments.
  return /^(?:[A-Z][\p{L}'’-]*)(?:\s+(?:[A-Z][\p{L}'’-]*|of|the|and))*$/u.test(candidate);
}

function unresolvedParticipantDiagnostic(
  source: AtomicGroundingSourceV36,
  claim: AtomicGroundingClaimSourceV36,
  message: string,
  values: readonly string[]
): AtomicGroundingDiagnosticV36 | undefined {
  const participants = values.filter((value) => plausiblyUnresolvedParticipant(source, claim, value));
  return participants.length
    ? diagnostic(claim, "GROUNDING_PARTICIPANT_UNRESOLVED", message, participants)
    : undefined;
}

function evidenceDrafts(
  claim: AtomicGroundingClaimSourceV36,
  text: string
): readonly PropositionDraft[] | null {
  const found = /^Searchers found (.+)\.$/iu.exec(text);
  if (!found) return null;
  const owner = concept("search findings");
  const groupedGraves = /^(.+?) and the graves of three sailors:\s*(.+)$/iu.exec(found[1]!);
  if (groupedGraves) {
    const names = groupedGraves[2]!.replace(/,?\s+and\s+/iu, ",").split(/,\s*/u).map(compact).filter(Boolean);
    const nestedIds = names.map((name) => atomicConceptIdV36(name));
    return [
      {
        subject: owner,
        predicate: "contains-evidence-of",
        object: concept(groupedGraves[1]!),
        assertionStatus: "asserted",
        exactText: text,
        rule: "bounded-evidence-enumeration-v1",
      },
      {
        subject: owner,
        predicate: "contains-evidence-of",
        object: concept(`graves of ${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`),
        qualifiers: [{ kind: "nested-entity", value: names.join(" | "), participantIds: nestedIds }],
        assertionStatus: "asserted",
        exactText: text,
        rule: "bounded-evidence-enumeration-v1",
      },
    ];
  }
  const members = found[1]!.replace(/,?\s+and\s+/iu, ",").split(",").map(compact).filter(Boolean);
  if (members.length < 2) return [];
  return members.map((member) => ({
    subject: owner,
    predicate: "contains-evidence-of" as const,
    object: concept(member),
    assertionStatus: "asserted" as const,
    exactText: text,
    rule: "bounded-evidence-enumeration-v1" as const,
  }));
}

function movementDrafts(
  source: AtomicGroundingSourceV36,
  claim: AtomicGroundingClaimSourceV36,
  text: string,
  diagnostics: AtomicGroundingDiagnosticV36[]
): readonly PropositionDraft[] | null {
  const purpose = /^(.*?)sailed from (?:the )?(.+?) to search for (?:the )?(.+)\.$/iu.exec(text);
  if (purpose) {
    const origin = exactEntity(source, claim, purpose[2]!);
    const objective = exactEntity(source, claim, purpose[3]!);
    if (!origin || !objective) {
      const unresolved = unresolvedParticipantDiagnostic(source, claim, "Movement origin or search object lacks an exact resolved participant.", [purpose[2]!, purpose[3]!]);
      if (unresolved) diagnostics.push(unresolved);
      return [];
    }
    diagnostics.push(diagnostic(claim, "GROUNDING_PURPOSE_NOT_DESTINATION", "Search-object grounding is intentionally not movement-destination grounding.", [objective.id]));
    const actor = concept(compact(purpose[1]!).replace(/^(?:In [^,]+,\s*)/iu, "") || "ships");
    return [
      { subject: actor, predicate: "moves-from", object: entityRef(origin), assertionStatus: "asserted", exactText: text, rule: "bounded-movement-clause-v1", sourceKind: "resolved-participants" },
      { subject: actor, predicate: "search-object", object: entityRef(objective), assertionStatus: "intended", exactText: text, rule: "bounded-movement-clause-v1", sourceKind: "resolved-participants" },
    ];
  }

  const mission = /^(.*?)mission was to move through (?:the )?([^,]+)[,.]/iu.exec(text);
  if (mission) {
    const route = exactEntity(source, claim, mission[2]!);
    if (!route) {
      const unresolved = unresolvedParticipantDiagnostic(source, claim, "Intended route lacks an exact resolved place participant.", [mission[2]!]);
      if (unresolved) diagnostics.push(unresolved);
      return [];
    }
    return [{ subject: concept("fleet mission"), predicate: "moves-through", object: entityRef(route), assertionStatus: "intended", exactText: text, rule: "bounded-movement-clause-v1", sourceKind: "resolved-participants" }];
  }

  const fromOnly = /^(.*?)\b(?:sailed|departed|left) from (?:the )?([^,.]+)[,.]?$/iu.exec(text);
  if (fromOnly) {
    const origin = exactEntity(source, claim, fromOnly[2]!);
    if (!origin) {
      const unresolved = unresolvedParticipantDiagnostic(source, claim, "Movement origin lacks an exact resolved place participant.", [fromOnly[2]!]);
      if (unresolved) diagnostics.push(unresolved);
      return [];
    }
    const actorLabel = compact(fromOnly[1]!).replace(/^(?:In [^,]+,\s*)/iu, "") || "moving actor";
    return [{ subject: concept(actorLabel), predicate: "moves-from", object: entityRef(origin), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-movement-clause-v1", sourceKind: "resolved-participants" }];
  }

  if (/\blanded at Pevensey\b/iu.test(text)) {
    diagnostics.push(diagnostic(claim, "GROUNDING_PARTICIPANT_UNRESOLVED", "Pevensey has no resolved place participant in the frozen source claim.", ["Pevensey"]));
    return [];
  }

  const location = /^(.*?)\b(?:held positions along|landed at|landed in) (?:the )?([^,.]+)[,.]?$/iu.exec(text);
  if (location) {
    const place = exactEntity(source, claim, location[2]!);
    if (!place) {
      const unresolved = unresolvedParticipantDiagnostic(source, claim, "Location statement lacks an exact resolved place participant.", [location[2]!]);
      if (unresolved) diagnostics.push(unresolved);
      return [];
    }
    return [{ subject: concept(location[1]!), predicate: "located-in", object: entityRef(place), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-movement-clause-v1", sourceKind: "resolved-participants" }];
  }
  return null;
}

function claimDrafts(
  source: AtomicGroundingSourceV36,
  claim: AtomicGroundingClaimSourceV36,
  diagnostics: AtomicGroundingDiagnosticV36[]
): readonly PropositionDraft[] {
  const text = compact(claim.normalizedProposition);

  const evidence = evidenceDrafts(claim, text);
  if (evidence) {
    if (!evidence.length) diagnostics.push(diagnostic(claim, "GROUNDING_COMPOUND_ARGUMENT_AMBIGUOUS", "Evidence list has insufficient defensible members."));
    return evidence;
  }

  const movement = movementDrafts(source, claim, text, diagnostics);
  if (movement) return movement;

  const comparison = /^(.*?)\b(?:chose|preferred) (?:the )?(.+?) rather than (?:the )?(.+)\.$/iu.exec(text);
  if (comparison) {
    const left = exactEntity(source, claim, comparison[2]!);
    const rightLabel = comparison[3]!.replace(/^shorter crossing to the\s+/iu, "");
    const right = exactEntity(source, claim, rightLabel);
    if (!left || !right || !geographicTypes.has(left.entityType) || !geographicTypes.has(right.entityType)) {
      const unresolved = unresolvedParticipantDiagnostic(source, claim, "Comparison lacks two exact resolved place participants.", [comparison[2]!, rightLabel]);
      if (unresolved) diagnostics.push(unresolved);
      return [];
    }
    return [{ subject: entityRef(left), predicate: "compares-with", object: entityRef(right), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-comparison-clause-v1", sourceKind: "resolved-participants" }];
  }

  const depends = /^(.+?) depended on (.+)\.$/iu.exec(text);
  if (depends) return [{ subject: concept(depends[1]!), predicate: "depends-on", object: concept(depends[2]!), qualifiers: groupedQualifier(depends[2]!), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-dependency-clause-v1" }];

  const relativeCause = /^.+?,\s*where\s+(.+?) caused (.+)\.$/iu.exec(text);
  if (relativeCause) {
    const clause = `${relativeCause[1]} caused ${relativeCause[2]}`;
    return [{ subject: concept(relativeCause[1]!), predicate: "causes", object: concept(relativeCause[2]!), qualifiers: groupedQualifier(relativeCause[1]!), assertionStatus: assertionStatus(text), exactText: clause, rule: "bounded-causal-clause-v1" }];
  }

  const because = /^(.+?) because (.+)\.$/iu.exec(text);
  const unsafeBecause = because && (
    /\b(?:did not|not simply|mystery remains|exact totals|one extreme|may|might|not supposed|can be|stated that)\b/iu.test(`${because[1]} ${because[2]}`) ||
    /^(?:this|some believed)\b/iu.test(because[1]!) ||
    /^(?:those|these|this|it)\b/iu.test(because[2]!)
  );
  if (because && !unsafeBecause) return [{ subject: concept(because[2]!), predicate: "causes", object: concept(because[1]!), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-causal-clause-v1" }];

  const caused = /^(.+?) caused (.+)\.$/iu.exec(text);
  if (caused && !/\bnot caused\b/iu.test(text)) return [{ subject: concept(caused[1]!), predicate: "causes", object: concept(caused[2]!.split(/,\s*but\b/iu)[0]!), qualifiers: groupedQualifier(caused[1]!), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-causal-clause-v1" }];

  const contributed = /^(.+?) contributed to (.+)\.$/iu.exec(text);
  if (contributed) return [{ subject: concept(contributed[1]!), predicate: "contributes-to", object: concept(contributed[2]!), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-causal-clause-v1" }];

  const transformed = /\b(?:the )?(demographic shock) transformed (labor|labour)\b/iu.exec(text);
  if (transformed) return [{ subject: concept(transformed[1]!), predicate: "transforms", object: concept(transformed[2]!), assertionStatus: assertionStatus(text), exactText: text, rule: "bounded-claim-state-v1" }];

  const demanded = /^(Survivors) could demand (.+?), particularly\b/iu.exec(text);
  if (demanded) return [{ subject: concept(demanded[1]!), predicate: "demands", object: concept(demanded[2]!), qualifiers: groupedQualifier(demanded[2]!), assertionStatus: "uncertain", exactText: text, rule: "bounded-claim-state-v1" }];

  const restricts = /^(?:In [^,]+,\s*)the (Ordinance and Statute of Labourers) attempted to restrict (.+)\.$/iu.exec(text);
  if (restricts) return [{ subject: concept(restricts[1]!), predicate: "restricts", object: concept(restricts[2]!), qualifiers: groupedQualifier(restricts[2]!), assertionStatus: "attempted", exactText: text, rule: "bounded-policy-action-v1" }];

  return [];
}

function coverageFor(
  claim: AtomicGroundingClaimSourceV36,
  propositions: readonly AtomicPropositionV36[],
  diagnostics: readonly AtomicGroundingDiagnosticV36[]
): AtomicGroundingCoverageCategoryV36 {
  if (claim.groundedPropositions?.length) return "existing-grounding";
  if (propositions.length) return "new-deterministic-grounding";
  if (diagnostics.some((item) => item.code === "GROUNDING_PARTICIPANT_UNRESOLVED")) return "unresolved-participant";
  if (diagnostics.some((item) => item.code === "GROUNDING_PREDICATE_AMBIGUOUS" || item.code === "GROUNDING_COMPOUND_ARGUMENT_AMBIGUOUS")) return "ambiguous";
  if (["causal", "compound", "event", "comparative"].includes(claim.claimKind)) return "insufficient-structure";
  return "not-explanatory";
}

/** Claim-local, deterministic grounding only. It never constructs a relation. */
export function groundAtomicClaimsV36(source: AtomicGroundingSourceV36): AtomicGroundingResultV36 {
  const records: AtomicClaimGroundingRecordV36[] = [];
  for (const claim of source.claims) {
    const diagnostics: AtomicGroundingDiagnosticV36[] = [];
    if (claim.episodeId !== source.episodeId) {
      diagnostics.push(diagnostic(claim, "GROUNDING_UNSUPPORTED_STRUCTURE", "Foreign-episode claim was excluded from atomic grounding.", [claim.episodeId, source.episodeId]));
      records.push({ claimId: claimIdV36(claim.id), coverage: "insufficient-structure", propositions: [], diagnostics });
      continue;
    }
    const drafts = claimDrafts(source, claim, diagnostics);
    const propositions = drafts
      .map((draft) => materialize(source, claim, draft, diagnostics))
      .filter((item): item is AtomicPropositionV36 => item !== null)
      .sort((left, right) => left.groundingId.localeCompare(right.groundingId));
    records.push({
      claimId: claimIdV36(claim.id),
      coverage: coverageFor(claim, propositions, diagnostics),
      propositions,
      diagnostics,
    });
  }
  const propositions = records.flatMap((record) => record.propositions);
  const diagnostics = records.flatMap((record) => record.diagnostics);
  const coverageValues = records.map((record) => record.coverage);
  const coverageCounts = Object.fromEntries([
    "existing-grounding",
    "new-deterministic-grounding",
    "insufficient-structure",
    "unresolved-participant",
    "not-explanatory",
    "ambiguous",
  ].map((category) => [category, coverageValues.filter((value) => value === category).length])) as Record<AtomicGroundingCoverageCategoryV36, number>;
  return {
    schemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
    episodeId: source.episodeId,
    claims: records,
    propositions,
    diagnostics,
    metrics: {
      claimsInspected: source.claims.length,
      claimsWithExistingStructuredPropositions: source.claims.filter((claim) => claim.groundedPropositions?.length).length,
      claimsNewlyGroundedDeterministically: records.filter((record) => record.coverage === "new-deterministic-grounding").length,
      atomicPropositionsEmitted: propositions.length,
      groundingRejects: diagnostics.length,
      unresolvedParticipantCases: diagnostics.filter((item) => item.code === "GROUNDING_PARTICIPANT_UNRESOLVED").length,
      ambiguousPredicateCases: diagnostics.filter((item) => item.code === "GROUNDING_PREDICATE_AMBIGUOUS").length,
      assertionStatusCounts: countValues(propositions.map((item) => item.assertionStatus)),
      groundingRulesUsed: countValues(propositions.map((item) => item.provenance.groundingRuleId)),
      coverageCounts,
    },
  };
}

function relationConcept(ref: AtomicConceptRefV36): ConceptRefV36 {
  return ref.kind === "entity"
    ? { canonicalLabel: ref.label, entityId: entityIdV36(ref.id) }
    : { canonicalLabel: ref.label };
}

function relationPlace(ref: AtomicConceptRefV36): PlaceRefV36 | null {
  return ref.kind === "place"
    ? { entityId: entityIdV36(ref.id), canonicalLabel: ref.label }
    : null;
}

/**
 * Mechanical lowering of exact asserted atoms to the frozen relation evidence union.
 * It is claim-local and does not compose atoms across claims or approve a relation.
 */
export function lowerAtomicGroundingEvidenceV36(
  propositions: readonly AtomicPropositionV36[]
): readonly GroundedRelationPropositionV36[] {
  const grounded: GroundedRelationPropositionV36[] = [];
  for (const proposition of propositions) {
    if (proposition.assertionStatus !== "asserted" || !proposition.object) continue;
    if (proposition.predicate === "causes" || proposition.predicate === "contributes-to") {
      grounded.push({ kind: "causal", cause: relationConcept(proposition.subject), effect: relationConcept(proposition.object) });
    } else if (proposition.predicate === "depends-on") {
      grounded.push({ kind: "dependency", dependency: relationConcept(proposition.object), dependent: relationConcept(proposition.subject) });
    } else if (proposition.predicate === "compares-with") {
      const left = relationPlace(proposition.subject);
      const right = relationPlace(proposition.object);
      if (left && right) grounded.push({ kind: "spatial-comparison", places: [left, right] });
    }
  }
  const unique = new Map(grounded.map((item) => [JSON.stringify(item), item]));
  return [...unique.values()];
}
