import { createHash } from "node:crypto";

import { z } from "zod";

import type {
  ClaimIdV36,
  EntityIdV36,
  EpisodeIdV36,
} from "./explanatory-relation-v36.js";

export const HISTORY_ATOMIC_GROUNDING_SCHEMA_V36 =
  "history-atomic-claim-grounding.v1" as const;

declare const atomicGroundingIdBrand: unique symbol;
declare const atomicConceptIdBrand: unique symbol;

export type AtomicGroundingIdV36 = string & {
  readonly [atomicGroundingIdBrand]: "AtomicGroundingIdV36";
};
export type AtomicConceptIdV36 = string & {
  readonly [atomicConceptIdBrand]: "AtomicConceptIdV36";
};

export const atomicPredicateValuesV36 = [
  "causes",
  "contributes-to",
  "depends-on",
  "compares-with",
  "contains-evidence-of",
  "moves-from",
  "moves-through",
  "search-object",
  "located-in",
  "transforms",
  "demands",
  "restricts",
] as const;
export type AtomicPredicateV36 = (typeof atomicPredicateValuesV36)[number];

export const atomicAssertionStatusValuesV36 = [
  "asserted",
  "intended",
  "attempted",
  "uncertain",
  "counterfactual",
  "reported",
] as const;
export type AtomicAssertionStatusV36 =
  (typeof atomicAssertionStatusValuesV36)[number];

export const atomicGroundingRuleIdValuesV36 = [
  "explicit-structured-proposition-v1",
  "bounded-causal-clause-v1",
  "bounded-dependency-clause-v1",
  "bounded-comparison-clause-v1",
  "bounded-evidence-enumeration-v1",
  "bounded-movement-clause-v1",
  "bounded-policy-action-v1",
  "bounded-claim-state-v1",
] as const;
export type AtomicGroundingRuleIdV36 =
  (typeof atomicGroundingRuleIdValuesV36)[number];

export type AtomicGroundingDiagnosticCodeV36 =
  | "GROUNDING_PARTICIPANT_UNRESOLVED"
  | "GROUNDING_PREDICATE_AMBIGUOUS"
  | "GROUNDING_SOURCE_SPAN_INVALID"
  | "GROUNDING_PROPER_NAME_FRAGMENTATION"
  | "GROUNDING_PURPOSE_NOT_DESTINATION"
  | "GROUNDING_COMPOUND_ARGUMENT_AMBIGUOUS"
  | "GROUNDING_UNSUPPORTED_STRUCTURE";

export type AtomicGroundingCoverageCategoryV36 =
  | "existing-grounding"
  | "new-deterministic-grounding"
  | "insufficient-structure"
  | "unresolved-participant"
  | "not-explanatory"
  | "ambiguous";

export interface AtomicConceptRefV36 {
  readonly id: AtomicConceptIdV36 | EntityIdV36;
  readonly label: string;
  readonly kind: "concept" | "entity" | "place";
}

export interface AtomicQualifierV36 {
  readonly kind: "grouped-concept" | "nested-entity" | "location-context";
  readonly value: string;
  readonly participantIds?: readonly (AtomicConceptIdV36 | EntityIdV36)[];
}

export interface AtomicSourceSpanV36 {
  readonly startUtf16: number;
  readonly endUtf16Exclusive: number;
  readonly text: string;
  readonly textHash: string;
}

export interface AtomicGroundingProvenanceV36 {
  readonly sourceKind:
    | "existing-structured-proposition"
    | "resolved-participants"
    | "bounded-deterministic-normalization";
  readonly groundingRuleId: AtomicGroundingRuleIdV36;
  readonly groundingSchemaVersion: typeof HISTORY_ATOMIC_GROUNDING_SCHEMA_V36;
  readonly resolvedParticipantIds: readonly (AtomicConceptIdV36 | EntityIdV36)[];
}

export interface AtomicPropositionV36 {
  readonly groundingId: AtomicGroundingIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly claimId: ClaimIdV36;
  readonly subject: AtomicConceptRefV36;
  readonly predicate: AtomicPredicateV36;
  readonly object?: AtomicConceptRefV36;
  readonly qualifiers?: readonly AtomicQualifierV36[];
  readonly assertionStatus: AtomicAssertionStatusV36;
  readonly sourceSpan: AtomicSourceSpanV36;
  readonly provenance: AtomicGroundingProvenanceV36;
}

export interface AtomicGroundingDiagnosticV36 {
  readonly code: AtomicGroundingDiagnosticCodeV36;
  readonly claimId: ClaimIdV36;
  readonly message: string;
  readonly affectedIds: readonly string[];
}

export interface AtomicClaimGroundingRecordV36 {
  readonly claimId: ClaimIdV36;
  readonly coverage: AtomicGroundingCoverageCategoryV36;
  readonly propositions: readonly AtomicPropositionV36[];
  readonly diagnostics: readonly AtomicGroundingDiagnosticV36[];
}

const identifierSchema = z.string().trim().min(1).max(256);
const labelSchema = z.string().trim().min(1).max(1024);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const atomicGroundingIdSchema = z.string().regex(/^grounding-[a-f0-9]{24}$/u);

export const atomicConceptRefSchemaV36 = z.object({
  id: identifierSchema,
  label: labelSchema,
  kind: z.enum(["concept", "entity", "place"]),
}).strict();

export const atomicQualifierSchemaV36 = z.object({
  kind: z.enum(["grouped-concept", "nested-entity", "location-context"]),
  value: labelSchema,
  participantIds: z.array(identifierSchema).min(1).optional(),
}).strict();

export const atomicSourceSpanSchemaV36 = z.object({
  startUtf16: z.number().int().nonnegative(),
  endUtf16Exclusive: z.number().int().positive(),
  text: z.string().min(1),
  textHash: hashSchema,
}).strict().superRefine((span, context) => {
  if (span.endUtf16Exclusive <= span.startUtf16) {
    context.addIssue({ code: "custom", message: "Source span end must be after start." });
  }
  if (span.endUtf16Exclusive - span.startUtf16 !== span.text.length) {
    context.addIssue({ code: "custom", message: "Source span coordinates must match source text length." });
  }
  if (sourceTextHashV36(span.text) !== span.textHash) {
    context.addIssue({ code: "custom", message: "Source text hash must match the exact source text." });
  }
});

export const atomicGroundingProvenanceSchemaV36 = z.object({
  sourceKind: z.enum([
    "existing-structured-proposition",
    "resolved-participants",
    "bounded-deterministic-normalization",
  ]),
  groundingRuleId: z.enum(atomicGroundingRuleIdValuesV36),
  groundingSchemaVersion: z.literal(HISTORY_ATOMIC_GROUNDING_SCHEMA_V36),
  resolvedParticipantIds: z.array(identifierSchema).min(1),
}).strict();

export const atomicPropositionSchemaV36 = z.object({
  groundingId: atomicGroundingIdSchema,
  episodeId: identifierSchema,
  claimId: identifierSchema,
  subject: atomicConceptRefSchemaV36,
  predicate: z.enum(atomicPredicateValuesV36),
  object: atomicConceptRefSchemaV36.optional(),
  qualifiers: z.array(atomicQualifierSchemaV36).min(1).optional(),
  assertionStatus: z.enum(atomicAssertionStatusValuesV36),
  sourceSpan: atomicSourceSpanSchemaV36,
  provenance: atomicGroundingProvenanceSchemaV36,
}).strict();

export const atomicGroundingArtifactSchemaV36 = z.object({
  schemaVersion: z.literal(HISTORY_ATOMIC_GROUNDING_SCHEMA_V36),
  episodeId: identifierSchema,
  claims: z.array(z.object({
    claimId: identifierSchema,
    coverage: z.enum([
      "existing-grounding",
      "new-deterministic-grounding",
      "insufficient-structure",
      "unresolved-participant",
      "not-explanatory",
      "ambiguous",
    ]),
    propositions: z.array(atomicPropositionSchemaV36),
    diagnostics: z.array(z.object({
      code: z.enum([
        "GROUNDING_PARTICIPANT_UNRESOLVED",
        "GROUNDING_PREDICATE_AMBIGUOUS",
        "GROUNDING_SOURCE_SPAN_INVALID",
        "GROUNDING_PROPER_NAME_FRAGMENTATION",
        "GROUNDING_PURPOSE_NOT_DESTINATION",
        "GROUNDING_COMPOUND_ARGUMENT_AMBIGUOUS",
        "GROUNDING_UNSUPPORTED_STRUCTURE",
      ]),
      claimId: identifierSchema,
      message: labelSchema,
      affectedIds: z.array(identifierSchema),
    }).strict()),
  }).strict()),
}).strict();

export const atomicGroundingJsonSchemaV36 = {
  ...z.toJSONSchema(atomicGroundingArtifactSchemaV36),
  $id: "https://mediaforge.local/schemas/history/v3.6/atomic-grounding-schema.json",
  title: "History V3.6 atomic claim grounding artifact",
};

function normalized(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase();
}

export function atomicConceptIdV36(label: string): AtomicConceptIdV36 {
  const digest = createHash("sha256").update(normalized(label)).digest("hex").slice(0, 24);
  return `concept-${digest}` as AtomicConceptIdV36;
}

export function sourceTextHashV36(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function canonicalQualifier(qualifier: AtomicQualifierV36): Readonly<Record<string, unknown>> {
  return {
    kind: qualifier.kind,
    value: normalized(qualifier.value),
    ...(qualifier.participantIds
      ? { participantIds: [...qualifier.participantIds].sort((left, right) => left.localeCompare(right)) }
      : {}),
  };
}

export function atomicGroundingIdentityPayloadV36(
  proposition: Omit<AtomicPropositionV36, "groundingId">
): string {
  return JSON.stringify({
    episodeId: proposition.episodeId,
    claimId: proposition.claimId,
    subject: { id: proposition.subject.id, label: normalized(proposition.subject.label), kind: proposition.subject.kind },
    predicate: proposition.predicate,
    ...(proposition.object
      ? { object: { id: proposition.object.id, label: normalized(proposition.object.label), kind: proposition.object.kind } }
      : {}),
    qualifiers: [...(proposition.qualifiers ?? [])]
      .map(canonicalQualifier)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    assertionStatus: proposition.assertionStatus,
    sourceSpan: {
      startUtf16: proposition.sourceSpan.startUtf16,
      endUtf16Exclusive: proposition.sourceSpan.endUtf16Exclusive,
      textHash: proposition.sourceSpan.textHash,
    },
    groundingRuleId: proposition.provenance.groundingRuleId,
    groundingSchemaVersion: proposition.provenance.groundingSchemaVersion,
  });
}

export function atomicGroundingIdV36(
  proposition: Omit<AtomicPropositionV36, "groundingId">
): AtomicGroundingIdV36 {
  const digest = createHash("sha256")
    .update(atomicGroundingIdentityPayloadV36(proposition))
    .digest("hex")
    .slice(0, 24);
  return `grounding-${digest}` as AtomicGroundingIdV36;
}

export function createAtomicPropositionV36(
  draft: Omit<AtomicPropositionV36, "groundingId">
): AtomicPropositionV36 {
  const proposition = { ...draft, groundingId: atomicGroundingIdV36(draft) };
  return atomicPropositionSchemaV36.parse(proposition) as unknown as AtomicPropositionV36;
}

export const atomicGroundingContractDocumentV36 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "History V3.6 atomic claim grounding IR",
  schemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  generatedFrom: "packages/history/src/v36/atomic-claim-grounding-v36.ts#atomicGroundingContractDocumentV36",
  predicates: atomicPredicateValuesV36,
  assertionStatuses: atomicAssertionStatusValuesV36,
  groundingRuleIds: atomicGroundingRuleIdValuesV36,
  identity: {
    algorithm: "grounding-{first 24 hex chars of sha256(canonical episode, claim, participants, predicate, qualifiers, assertion status, exact span/hash, rule, schema version)}",
    excludes: ["timestamps", "Git SHA", "render IDs", "random UUIDs"],
  },
  provenance: [
    "episodeId",
    "claimId",
    "exact source span coordinates",
    "exact source text and SHA-256",
    "resolved participant IDs",
    "grounding rule ID",
    "grounding schema version",
  ],
  boundary: "Atomic grounding supplies evidence. It does not create or approve ExplanatoryRelationV36.",
} as const;
