import { createHash } from "node:crypto";

import { z } from "zod";

import type { ClaimIdV36, EntityIdV36, EpisodeIdV36 } from "./explanatory-relation-v36.js";

export const HISTORY_STRUCTURED_CLAIM_SCHEMA_V36 = "history-structured-claim.v1" as const;
export const HISTORY_STRUCTURED_CLAIM_GENERATOR_V36 = "history-structured-claim-enricher.v1" as const;

declare const structuredPropositionIdBrand: unique symbol;
export type StructuredPropositionIdV36 = string & {
  readonly [structuredPropositionIdBrand]: "StructuredPropositionIdV36";
};

export const structuredClaimSourceValuesV36 = [
  "existing-structured-claim",
  "deterministic-shadow-enrichment",
] as const;
export type StructuredClaimSourceKindV36 = (typeof structuredClaimSourceValuesV36)[number];

export const structuredGenerationMethodValuesV36 = [
  "native-structured-claim-generation",
  "deterministic-shadow-enrichment",
] as const;
export type StructuredGenerationMethodV36 = (typeof structuredGenerationMethodValuesV36)[number];

export const structuredPredicateValuesV36 = [
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
export type StructuredPredicateV36 = (typeof structuredPredicateValuesV36)[number];

export const structuredSemanticRoleValuesV36 = [
  "subject",
  "object",
  "actor",
  "origin",
  "destination",
  "via",
  "objective",
  "location",
  "cause",
  "effect",
  "dependency",
  "dependent",
  "compared-place",
  "evidence-target",
  "evidence-item",
  "action",
  "target",
] as const;
export type StructuredSemanticRoleNameV36 = (typeof structuredSemanticRoleValuesV36)[number];

export const structuredAssertionStatusValuesV36 = [
  "asserted",
  "uncertain",
  "intended",
  "attempted",
  "counterfactual",
  "reported",
] as const;
export type StructuredAssertionStatusV36 = (typeof structuredAssertionStatusValuesV36)[number];

export const structuredDiagnosticCodeValuesV36 = [
  "STRUCTURED_CLAIM_UNSUPPORTED_SEMANTICS",
  "STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED",
  "STRUCTURED_CLAIM_PREDICATE_AMBIGUOUS",
  "STRUCTURED_CLAIM_ASSERTION_SCOPE_AMBIGUOUS",
  "STRUCTURED_CLAIM_SOURCE_SPAN_INVALID",
  "STRUCTURED_CLAIM_PURPOSE_NOT_DESTINATION",
  "STRUCTURED_CLAIM_GROUPING_AMBIGUOUS",
  "STRUCTURED_CLAIM_BACKFILL_INSUFFICIENT",
] as const;
export type StructuredClaimDiagnosticCodeV36 = (typeof structuredDiagnosticCodeValuesV36)[number];

export interface StructuredParticipantBindingV36 {
  readonly kind: "canonical-entity" | "claim-concept" | "unresolved";
  readonly referenceId?: EntityIdV36 | string;
}

export interface StructuredParticipantV36 {
  readonly id: EntityIdV36 | string;
  readonly label: string;
  readonly kind: "concept" | "entity" | "place";
  readonly binding: StructuredParticipantBindingV36;
}

export interface StructuredSemanticRoleV36 {
  readonly role: StructuredSemanticRoleNameV36;
  readonly participant: StructuredParticipantV36;
}

export interface StructuredQualifierV36 {
  readonly kind: "grouped-concept" | "nested-entity" | "location-context" | "time-anchor" | "step-order";
  readonly value: string;
  readonly participantIds?: readonly string[];
  readonly stepIndex?: number;
}

export interface StructuredSourceSpanV36 {
  readonly startUtf16: number;
  readonly endUtf16Exclusive: number;
  readonly text: string;
  readonly textHash: string;
}

export interface StructuredPropositionProvenanceV36 {
  readonly structuredSchemaVersion: typeof HISTORY_STRUCTURED_CLAIM_SCHEMA_V36;
  readonly generationMethod: StructuredGenerationMethodV36;
  readonly generatorVersion: string;
  readonly participantBindingReferences: readonly string[];
}

export interface StructuredPropositionV36 {
  readonly propositionId: StructuredPropositionIdV36;
  readonly subject: StructuredParticipantV36;
  readonly predicate: StructuredPredicateV36;
  readonly object?: StructuredParticipantV36;
  readonly roles: readonly StructuredSemanticRoleV36[];
  readonly assertionStatus: StructuredAssertionStatusV36;
  readonly qualifiers?: readonly StructuredQualifierV36[];
  readonly sourceSpan: StructuredSourceSpanV36;
  readonly provenance: StructuredPropositionProvenanceV36;
}

export interface StructuredClaimEnvelopeV36 {
  readonly schemaVersion: typeof HISTORY_STRUCTURED_CLAIM_SCHEMA_V36;
  readonly episodeId: EpisodeIdV36;
  readonly claimId: ClaimIdV36;
  readonly source: {
    readonly kind: StructuredClaimSourceKindV36;
    readonly canonicalClaimSchemaVersion: string;
  };
  readonly propositions: readonly StructuredPropositionV36[];
}

export interface StructuredClaimDiagnosticV36 {
  readonly code: StructuredClaimDiagnosticCodeV36;
  readonly claimId: ClaimIdV36;
  readonly message: string;
  readonly affectedIds: readonly string[];
}

const identifierSchema = z.string().trim().min(1).max(256);
const labelSchema = z.string().trim().min(1).max(2048);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const propositionIdSchema = z.string().regex(/^structured-proposition-[a-f0-9]{24}$/u);

export const structuredParticipantBindingSchemaV36 = z.object({
  kind: z.enum(["canonical-entity", "claim-concept", "unresolved"]),
  referenceId: identifierSchema.optional(),
}).strict().superRefine((binding, context) => {
  if (binding.kind !== "unresolved" && !binding.referenceId) {
    context.addIssue({ code: "custom", message: "Resolved participant bindings require a reference ID." });
  }
  if (binding.kind === "unresolved" && binding.referenceId) {
    context.addIssue({ code: "custom", message: "Unresolved participant bindings cannot claim a resolved reference ID." });
  }
});

export const structuredParticipantSchemaV36 = z.object({
  id: identifierSchema,
  label: labelSchema,
  kind: z.enum(["concept", "entity", "place"]),
  binding: structuredParticipantBindingSchemaV36,
}).strict();

export const structuredSemanticRoleSchemaV36 = z.object({
  role: z.enum(structuredSemanticRoleValuesV36),
  participant: structuredParticipantSchemaV36,
}).strict();

export const structuredQualifierSchemaV36 = z.object({
  kind: z.enum(["grouped-concept", "nested-entity", "location-context", "time-anchor", "step-order"]),
  value: labelSchema,
  participantIds: z.array(identifierSchema).min(1).optional(),
  stepIndex: z.number().int().nonnegative().optional(),
}).strict().superRefine((qualifier, context) => {
  if (qualifier.kind === "step-order" && qualifier.stepIndex === undefined) {
    context.addIssue({ code: "custom", message: "Ordered steps require a zero-based step index." });
  }
  if (qualifier.kind !== "step-order" && qualifier.stepIndex !== undefined) {
    context.addIssue({ code: "custom", message: "Only ordered steps may carry a step index." });
  }
});

export function structuredSourceTextHashV36(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export const structuredSourceSpanSchemaV36 = z.object({
  startUtf16: z.number().int().nonnegative(),
  endUtf16Exclusive: z.number().int().positive(),
  text: z.string().min(1),
  textHash: hashSchema,
}).strict().superRefine((span, context) => {
  if (span.endUtf16Exclusive <= span.startUtf16) {
    context.addIssue({ code: "custom", message: "Source span end must be after its start." });
  }
  if (span.endUtf16Exclusive - span.startUtf16 !== span.text.length) {
    context.addIssue({ code: "custom", message: "Source span coordinates must match exact source text length." });
  }
  if (structuredSourceTextHashV36(span.text) !== span.textHash) {
    context.addIssue({ code: "custom", message: "Source span hash must match its exact text." });
  }
});

export const structuredPropositionProvenanceSchemaV36 = z.object({
  structuredSchemaVersion: z.literal(HISTORY_STRUCTURED_CLAIM_SCHEMA_V36),
  generationMethod: z.enum(structuredGenerationMethodValuesV36),
  generatorVersion: identifierSchema,
  participantBindingReferences: z.array(identifierSchema),
}).strict();

function roleCount(roles: readonly { readonly role: StructuredSemanticRoleNameV36 }[], role: StructuredSemanticRoleNameV36): number {
  return roles.filter((item) => item.role === role).length;
}

export const structuredPropositionSchemaV36 = z.object({
  propositionId: propositionIdSchema,
  subject: structuredParticipantSchemaV36,
  predicate: z.enum(structuredPredicateValuesV36),
  object: structuredParticipantSchemaV36.optional(),
  roles: z.array(structuredSemanticRoleSchemaV36).min(1),
  assertionStatus: z.enum(structuredAssertionStatusValuesV36),
  qualifiers: z.array(structuredQualifierSchemaV36).min(1).optional(),
  sourceSpan: structuredSourceSpanSchemaV36,
  provenance: structuredPropositionProvenanceSchemaV36,
}).strict().superRefine((proposition, context) => {
  const destinationCount = roleCount(proposition.roles, "destination");
  const objectiveCount = roleCount(proposition.roles, "objective");
  if (proposition.predicate === "moves-from" && (roleCount(proposition.roles, "origin") !== 1 || destinationCount || objectiveCount)) {
    context.addIssue({ code: "custom", message: "moves-from requires one origin and cannot encode destination or objective." });
  }
  if (proposition.predicate === "moves-through" && (roleCount(proposition.roles, "via") !== 1 || destinationCount || objectiveCount)) {
    context.addIssue({ code: "custom", message: "moves-through requires one via role and cannot encode destination or objective." });
  }
  if (proposition.predicate === "search-object" && (objectiveCount !== 1 || destinationCount)) {
    context.addIssue({ code: "custom", message: "search-object requires one objective and cannot encode a destination." });
  }
  if (proposition.predicate === "compares-with" && roleCount(proposition.roles, "compared-place") < 2) {
    context.addIssue({ code: "custom", message: "compares-with requires two compared-place roles." });
  }
  if (proposition.predicate === "contains-evidence-of" && roleCount(proposition.roles, "evidence-item") !== 1) {
    context.addIssue({ code: "custom", message: "contains-evidence-of requires exactly one evidence-item role." });
  }
});

export const structuredClaimEnvelopeSchemaV36 = z.object({
  schemaVersion: z.literal(HISTORY_STRUCTURED_CLAIM_SCHEMA_V36),
  episodeId: identifierSchema,
  claimId: identifierSchema,
  source: z.object({
    kind: z.enum(structuredClaimSourceValuesV36),
    canonicalClaimSchemaVersion: identifierSchema,
  }).strict(),
  propositions: z.array(structuredPropositionSchemaV36),
}).strict();

export const structuredClaimDiagnosticSchemaV36 = z.object({
  code: z.enum(structuredDiagnosticCodeValuesV36),
  claimId: identifierSchema,
  message: labelSchema,
  affectedIds: z.array(identifierSchema),
}).strict();

export const structuredClaimArtifactSchemaV36 = z.object({
  schemaVersion: z.literal(HISTORY_STRUCTURED_CLAIM_SCHEMA_V36),
  episodeId: identifierSchema,
  envelopes: z.array(structuredClaimEnvelopeSchemaV36),
  diagnostics: z.array(structuredClaimDiagnosticSchemaV36),
}).strict();

export const structuredClaimJsonSchemaV36 = {
  ...z.toJSONSchema(structuredClaimArtifactSchemaV36),
  $id: "https://mediaforge.local/schemas/history/v3.6/structured-claim-schema.json",
  title: "History V3.6 structured claim envelope artifact",
};

function normalized(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase();
}

function canonicalParticipant(participant: StructuredParticipantV36): Readonly<Record<string, unknown>> {
  return {
    id: participant.id,
    label: normalized(participant.label),
    kind: participant.kind,
    binding: participant.binding,
  };
}

export function structuredPropositionIdentityPayloadV36(
  proposition: Omit<StructuredPropositionV36, "propositionId">
): string {
  return JSON.stringify({
    schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    subject: canonicalParticipant(proposition.subject),
    predicate: proposition.predicate,
    ...(proposition.object ? { object: canonicalParticipant(proposition.object) } : {}),
    roles: proposition.roles.map((role) => ({ role: role.role, participant: canonicalParticipant(role.participant) })),
    qualifiers: [...(proposition.qualifiers ?? [])]
      .map((qualifier) => ({
        kind: qualifier.kind,
        value: normalized(qualifier.value),
        ...(qualifier.participantIds ? { participantIds: [...qualifier.participantIds].sort() } : {}),
        ...(qualifier.stepIndex !== undefined ? { stepIndex: qualifier.stepIndex } : {}),
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    assertionStatus: proposition.assertionStatus,
    sourceSpan: {
      startUtf16: proposition.sourceSpan.startUtf16,
      endUtf16Exclusive: proposition.sourceSpan.endUtf16Exclusive,
      textHash: proposition.sourceSpan.textHash,
    },
    generationMethod: proposition.provenance.generationMethod,
    generatorVersion: proposition.provenance.generatorVersion,
  });
}

export function structuredPropositionIdV36(
  proposition: Omit<StructuredPropositionV36, "propositionId">
): StructuredPropositionIdV36 {
  const digest = createHash("sha256")
    .update(structuredPropositionIdentityPayloadV36(proposition))
    .digest("hex")
    .slice(0, 24);
  return `structured-proposition-${digest}` as StructuredPropositionIdV36;
}

export function createStructuredPropositionV36(
  draft: Omit<StructuredPropositionV36, "propositionId">
): StructuredPropositionV36 {
  return structuredPropositionSchemaV36.parse({
    ...draft,
    propositionId: structuredPropositionIdV36(draft),
  }) as unknown as StructuredPropositionV36;
}

export function createStructuredClaimEnvelopeV36(
  draft: StructuredClaimEnvelopeV36
): StructuredClaimEnvelopeV36 {
  return structuredClaimEnvelopeSchemaV36.parse(draft) as unknown as StructuredClaimEnvelopeV36;
}

export const structuredClaimContractDocumentV36 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "History V3.6 structured claim contract",
  schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  generatedFrom: "packages/history/src/v36/structured-claim-v36.ts#structuredClaimContractDocumentV36",
  sources: structuredClaimSourceValuesV36,
  generationMethods: structuredGenerationMethodValuesV36,
  predicates: structuredPredicateValuesV36,
  semanticRoles: structuredSemanticRoleValuesV36,
  assertionStatuses: structuredAssertionStatusValuesV36,
  diagnostics: structuredDiagnosticCodeValuesV36,
  identity: {
    algorithm: "structured-proposition-{first 24 hex chars of sha256(canonical semantics, roles, qualifiers, assertion, exact source authority, generator, schema)}",
    excludes: ["timestamps", "Git SHA", "provider request IDs", "cache paths", "random UUIDs"],
  },
  nativeBoundary: "Native envelopes are supplied adjacent to canonical claim generation and are schema-validated before atomic grounding.",
  compatibilityBoundary: "Historical V3.5 claims use an explicitly labeled deterministic shadow backfill; it is not equivalent to native generation.",
  relationBoundary: "Structured propositions state claim-local semantics only and never create or approve ExplanatoryRelationV36.",
} as const;
