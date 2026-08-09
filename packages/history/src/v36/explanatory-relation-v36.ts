import { createHash } from "node:crypto";

import { z } from "zod";

import {
  atomicAssertionStatusValuesV36,
  type AtomicAssertionStatusV36,
} from "./atomic-claim-grounding-v36.js";

/** V2 separated stable relation semantics from its supporting evidence. */
export const HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36 =
  "history-explanatory-relations.v2" as const;
/** V3 adds optional, semantic policy-response premise modality. */
export const HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36 =
  "history-explanatory-relations.v3" as const;
export const HISTORY_EXPLANATORY_RELATIONS_PLANNER_V36 =
  "history-explanatory-relations.v3.6.0" as const;

declare const episodeIdBrand: unique symbol;
declare const claimIdBrand: unique symbol;
declare const entityIdBrand: unique symbol;
declare const sourceSpanIdBrand: unique symbol;
declare const semanticRelationIdBrand: unique symbol;
declare const evidenceFingerprintBrand: unique symbol;

export type EpisodeIdV36 = string & { readonly [episodeIdBrand]: "EpisodeIdV36" };
export type ClaimIdV36 = string & { readonly [claimIdBrand]: "ClaimIdV36" };
export type EntityIdV36 = string & { readonly [entityIdBrand]: "EntityIdV36" };
export type SourceSpanIdV36 = string & { readonly [sourceSpanIdBrand]: "SourceSpanIdV36" };
export type SemanticRelationIdV36 = string & {
  readonly [semanticRelationIdBrand]: "SemanticRelationIdV36";
};
/** @deprecated Use SemanticRelationIdV36; `id` is the semantic relation ID. */
export type ExplanatoryRelationIdV36 = SemanticRelationIdV36;
export type RelationEvidenceFingerprintV36 = string & {
  readonly [evidenceFingerprintBrand]: "RelationEvidenceFingerprintV36";
};

const identifierSchema = z.string().trim().min(1).max(256);
const labelSchema = z.string().trim().min(1).max(512);

function brandedIdentifier<T extends string>(value: string, schema: z.ZodType<string>): T {
  return schema.parse(value) as T;
}

export function episodeIdV36(value: string): EpisodeIdV36 {
  return brandedIdentifier<EpisodeIdV36>(value, identifierSchema);
}

export function claimIdV36(value: string): ClaimIdV36 {
  return brandedIdentifier<ClaimIdV36>(value, identifierSchema);
}

export function entityIdV36(value: string): EntityIdV36 {
  return brandedIdentifier<EntityIdV36>(value, identifierSchema);
}

export function sourceSpanIdV36(value: string): SourceSpanIdV36 {
  return brandedIdentifier<SourceSpanIdV36>(value, identifierSchema);
}

export interface PlaceRefV36 {
  readonly entityId: EntityIdV36;
  readonly canonicalLabel: string;
}

export interface ConceptRefV36 {
  readonly canonicalLabel: string;
  readonly entityId?: EntityIdV36;
  readonly sourceSpanIds?: readonly SourceSpanIdV36[];
}

export interface ResolvedEntityV36 {
  readonly id: EntityIdV36;
  readonly canonicalLabel: string;
  readonly kind: "place" | "concept" | "named-entity";
  /** Multi-token proper names are indivisible unless separately resolved. */
  readonly atomic: boolean;
}

export type RelationKindV36 =
  | "movement"
  | "spatial-comparison"
  | "spatial-area"
  | "causal"
  | "dependency"
  | "process"
  | "temporal-sequence"
  | "policy-response"
  | "evidence-set";

interface CommonRelationV36 {
  readonly id: SemanticRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  /** Canonical, deduplicated provenance support. It never contributes to `id`. */
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
  /** Deterministic provenance fingerprint of `supportClaimIds`, not semantic identity. */
  readonly evidenceFingerprint: RelationEvidenceFingerprintV36;
}

export interface MovementRelationV36 extends CommonRelationV36 {
  readonly kind: "movement";
  readonly from: PlaceRefV36;
  readonly to: PlaceRefV36;
  /** Ordered intermediate route places. */
  readonly via: readonly PlaceRefV36[];
}

export interface SpatialComparisonRelationV36 extends CommonRelationV36 {
  readonly kind: "spatial-comparison";
  /** Unordered distinct set of compared places. */
  readonly places: readonly [PlaceRefV36, PlaceRefV36, ...PlaceRefV36[]];
}

export interface SpatialAreaRelationV36 extends CommonRelationV36 {
  readonly kind: "spatial-area";
  readonly place: PlaceRefV36;
}

export interface CausalRelationV36 extends CommonRelationV36 {
  readonly kind: "causal";
  /** Direction is cause -> effect. */
  readonly cause: ConceptRefV36;
  readonly effect: ConceptRefV36;
  /** Missing is the legacy asserted causal-link semantics. */
  readonly causalAssertionStatus?: AtomicAssertionStatusV36;
}

/** Direction is dependency -> dependent: the dependent requires the dependency. */
export interface DependencyRelationV36 extends CommonRelationV36 {
  readonly kind: "dependency";
  readonly dependency: ConceptRefV36;
  readonly dependent: ConceptRefV36;
}

export interface ProcessRelationV36 extends CommonRelationV36 {
  readonly kind: "process";
  /** Ordered process steps. */
  readonly steps: readonly [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]];
}

export interface TemporalSequenceRelationV36 extends CommonRelationV36 {
  readonly kind: "temporal-sequence";
  /** Ordered chronology. */
  readonly steps: readonly [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]];
}

export interface PolicyResponseRelationV36 extends CommonRelationV36 {
  readonly kind: "policy-response";
  /** Direction is condition -> response. */
  readonly condition: ConceptRefV36;
  /** Missing is the legacy asserted condition semantics. */
  readonly conditionAssertionStatus?: AtomicAssertionStatusV36;
  readonly response: ConceptRefV36;
  /** Missing is the legacy asserted response semantics. */
  readonly responseAssertionStatus?: AtomicAssertionStatusV36;
}

export interface EvidenceSetRelationV36 extends CommonRelationV36 {
  readonly kind: "evidence-set";
  readonly subject?: ConceptRefV36;
  /** Unordered distinct semantic set, not a presentation order. */
  readonly evidence: readonly [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]];
}

export type ExplanatoryRelationV36 =
  | MovementRelationV36
  | SpatialComparisonRelationV36
  | SpatialAreaRelationV36
  | CausalRelationV36
  | DependencyRelationV36
  | ProcessRelationV36
  | TemporalSequenceRelationV36
  | PolicyResponseRelationV36
  | EvidenceSetRelationV36;

type WithoutRelationFields<T, TFields extends PropertyKey> = T extends unknown
  ? Omit<T, TFields>
  : never;

export type ExplanatoryRelationDraftV36 = WithoutRelationFields<
  ExplanatoryRelationV36,
  "id" | "evidenceFingerprint"
>;

export type GroundedRelationPropositionV36 = WithoutRelationFields<
  ExplanatoryRelationV36,
  "id" | "episodeId" | "supportClaimIds" | "evidenceFingerprint"
>;

export interface RelationEvidenceV36 {
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
  readonly evidenceFingerprint: RelationEvidenceFingerprintV36;
}

export interface RelationSupportClaimV36 {
  readonly id: ClaimIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly normalizedProposition: string;
  readonly claimKind: string;
  /** Exact, deterministic proposition assertions; claimKind alone is never evidence. */
  readonly groundedPropositions: readonly GroundedRelationPropositionV36[];
}

export interface ExplanatoryRelationArtifactV36 {
  readonly schemaVersion:
    | typeof HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36
    | typeof HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36;
  readonly plannerVersion: string;
  readonly episodeId: EpisodeIdV36;
  readonly relations: readonly ExplanatoryRelationV36[];
}

function normalizedLabel(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase();
}

/** Stable IDs take precedence over labels; labels remain a fallback for unresolved concepts. */
export function placeRefKeyV36(ref: PlaceRefV36): string {
  return `place:${ref.entityId}`;
}

export function conceptRefKeyV36(ref: ConceptRefV36): string {
  return ref.entityId
    ? `concept:${ref.entityId}`
    : `concept:label:${normalizedLabel(ref.canonicalLabel)}`;
}

export interface PolicyResponseAssertionSemanticsV36 {
  readonly conditionAssertionStatus: AtomicAssertionStatusV36;
  readonly responseAssertionStatus: AtomicAssertionStatusV36;
  readonly representation: "legacy-implicit-asserted" | "explicit";
}

export interface CausalAssertionSemanticsV36 {
  readonly causalAssertionStatus: AtomicAssertionStatusV36;
  readonly representation: "legacy-implicit-asserted" | "explicit";
}

/**
 * V2 causal relations could only be emitted from asserted evidence.
 * Missing V3 fields therefore have one deterministic legacy meaning.
 */
export function causalAssertionSemanticsV36(
  relation: Pick<CausalRelationV36, "causalAssertionStatus">
): CausalAssertionSemanticsV36 {
  return {
    causalAssertionStatus: relation.causalAssertionStatus ?? "asserted",
    representation: relation.causalAssertionStatus === undefined
      ? "legacy-implicit-asserted"
      : "explicit",
  };
}

/**
 * V2 policy-response relations could only be emitted from asserted evidence.
 * Missing V3 fields therefore have one deterministic legacy meaning.
 */
export function policyResponseAssertionSemanticsV36(
  relation: Pick<
    PolicyResponseRelationV36,
    "conditionAssertionStatus" | "responseAssertionStatus"
  >
): PolicyResponseAssertionSemanticsV36 {
  return {
    conditionAssertionStatus: relation.conditionAssertionStatus ?? "asserted",
    responseAssertionStatus: relation.responseAssertionStatus ?? "asserted",
    representation:
      relation.conditionAssertionStatus === undefined &&
      relation.responseAssertionStatus === undefined
        ? "legacy-implicit-asserted"
        : "explicit",
  };
}

function stableSet(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function canonicalSupportClaimIdsV36(
  supportClaimIds: readonly ClaimIdV36[]
): readonly [ClaimIdV36, ...ClaimIdV36[]] {
  const canonical = stableSet(supportClaimIds) as ClaimIdV36[];
  if (!canonical.length) throw new TypeError("A relation requires at least one support claim.");
  return canonical as [ClaimIdV36, ...ClaimIdV36[]];
}

/**
 * The relation-specific semantic fields. Evidence is intentionally absent.
 * Invalid cardinality is rejected here, before any final semantic ID is hashed.
 */
export function semanticIdentityInputsV36(
  relation: ExplanatoryRelationDraftV36
): Readonly<Record<string, unknown>> {
  const common = { episodeId: relation.episodeId, kind: relation.kind };
  switch (relation.kind) {
    case "movement": {
      const from = placeRefKeyV36(relation.from);
      const to = placeRefKeyV36(relation.to);
      if (from === to) throw new TypeError("Movement requires distinct from and to places.");
      return { ...common, from, via: relation.via.map(placeRefKeyV36), to };
    }
    case "spatial-comparison": {
      const places = stableSet(relation.places.map(placeRefKeyV36));
      if (places.length < 2) throw new TypeError("Spatial comparison requires two distinct places.");
      return { ...common, places };
    }
    case "spatial-area":
      return { ...common, place: placeRefKeyV36(relation.place) };
    case "causal": {
      const cause = conceptRefKeyV36(relation.cause);
      const effect = conceptRefKeyV36(relation.effect);
      if (cause === effect) throw new TypeError("Causal relation requires distinct cause and effect.");
      const assertion = causalAssertionSemanticsV36(relation);
      return {
        ...common,
        cause,
        effect,
        // Preserve exact V2 IDs for the semantically unchanged asserted case.
        ...(assertion.causalAssertionStatus === "asserted"
          ? {}
          : { causalAssertionStatus: assertion.causalAssertionStatus }),
      };
    }
    case "dependency": {
      const dependency = conceptRefKeyV36(relation.dependency);
      const dependent = conceptRefKeyV36(relation.dependent);
      if (dependency === dependent) throw new TypeError("Dependency relation requires distinct participants.");
      return { ...common, dependency, dependent };
    }
    case "process":
    case "temporal-sequence": {
      const steps = relation.steps.map(conceptRefKeyV36);
      if (steps.length < 2 || steps.some((step, index) => index > 0 && step === steps[index - 1])) {
        throw new TypeError(`${relation.kind} requires two ordered, non-repeated adjacent steps.`);
      }
      return { ...common, steps };
    }
    case "policy-response": {
      const condition = conceptRefKeyV36(relation.condition);
      const response = conceptRefKeyV36(relation.response);
      if (condition === response) throw new TypeError("Policy response requires distinct condition and response.");
      const assertion = policyResponseAssertionSemanticsV36(relation);
      return {
        ...common,
        condition,
        response,
        // Preserve exact V2 IDs for the semantically unchanged asserted/asserted case.
        ...(assertion.conditionAssertionStatus === "asserted" &&
        assertion.responseAssertionStatus === "asserted"
          ? {}
          : {
              conditionAssertionStatus: assertion.conditionAssertionStatus,
              responseAssertionStatus: assertion.responseAssertionStatus,
            }),
      };
    }
    case "evidence-set": {
      const evidence = stableSet(relation.evidence.map(conceptRefKeyV36));
      if (evidence.length < 2) throw new TypeError("Evidence set requires two distinct evidence members.");
      return {
        ...common,
        ...(relation.subject ? { subject: conceptRefKeyV36(relation.subject) } : {}),
        evidence,
      };
    }
  }
}

export function semanticIdentityPayloadV36(relation: ExplanatoryRelationDraftV36): string {
  return JSON.stringify(semanticIdentityInputsV36(relation));
}

export function explanatoryRelationIdV36(
  relation: ExplanatoryRelationDraftV36
): SemanticRelationIdV36 {
  const digest = createHash("sha256")
    .update(semanticIdentityPayloadV36(relation))
    .digest("hex")
    .slice(0, 24);
  return brandedIdentifier<SemanticRelationIdV36>(
    `relation-${relation.kind}-${digest}`,
    identifierSchema
  );
}

export function relationEvidenceFingerprintV36(
  supportClaimIds: readonly ClaimIdV36[]
): RelationEvidenceFingerprintV36 {
  const digest = createHash("sha256")
    .update(JSON.stringify({ supportClaimIds: canonicalSupportClaimIdsV36(supportClaimIds) }))
    .digest("hex")
    .slice(0, 24);
  return brandedIdentifier<RelationEvidenceFingerprintV36>(
    `evidence-${digest}`,
    identifierSchema
  );
}

export function relationEvidenceV36(
  supportClaimIds: readonly ClaimIdV36[]
): RelationEvidenceV36 {
  const canonicalSupportClaimIds = canonicalSupportClaimIdsV36(supportClaimIds);
  return {
    supportClaimIds: canonicalSupportClaimIds,
    evidenceFingerprint: relationEvidenceFingerprintV36(canonicalSupportClaimIds),
  };
}

/** Creates a relation with a semantic ID and a separate canonical evidence record. */
export function createExplanatoryRelationV36(
  draft: ExplanatoryRelationDraftV36
): ExplanatoryRelationV36 {
  const id = explanatoryRelationIdV36(draft);
  const evidence = relationEvidenceV36(draft.supportClaimIds);
  switch (draft.kind) {
    case "movement": return { ...draft, ...evidence, id };
    case "spatial-comparison": return { ...draft, ...evidence, id };
    case "spatial-area": return { ...draft, ...evidence, id };
    case "causal": return { ...draft, ...evidence, id };
    case "dependency": return { ...draft, ...evidence, id };
    case "process": return { ...draft, ...evidence, id };
    case "temporal-sequence": return { ...draft, ...evidence, id };
    case "policy-response": return { ...draft, ...evidence, id };
    case "evidence-set": return { ...draft, ...evidence, id };
  }
}

const placeRefSchema = z.object({ entityId: identifierSchema, canonicalLabel: labelSchema }).strict();
const conceptRefSchema = z.object({
  canonicalLabel: labelSchema,
  entityId: identifierSchema.optional(),
  sourceSpanIds: z.array(identifierSchema).min(1).optional(),
}).strict();
const supportClaimIdsSchema = z.array(identifierSchema).min(1);
const semanticRelationIdSchema = z.string().regex(/^relation-[a-z-]+-[a-f0-9]{24}$/u);
const evidenceFingerprintSchema = z.string().regex(/^evidence-[a-f0-9]{24}$/u);

const commonRelationSchema = {
  id: semanticRelationIdSchema,
  episodeId: identifierSchema,
  supportClaimIds: supportClaimIdsSchema,
  evidenceFingerprint: evidenceFingerprintSchema,
};

export const explanatoryRelationSchemaV36 = z.discriminatedUnion("kind", [
  z.object({ ...commonRelationSchema, kind: z.literal("movement"), from: placeRefSchema, to: placeRefSchema, via: z.array(placeRefSchema) }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("spatial-comparison"), places: z.array(placeRefSchema).min(2) }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("spatial-area"), place: placeRefSchema }).strict(),
  z.object({
    ...commonRelationSchema,
    kind: z.literal("causal"),
    cause: conceptRefSchema,
    effect: conceptRefSchema,
    causalAssertionStatus: z.enum(atomicAssertionStatusValuesV36).optional(),
  }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("dependency"), dependency: conceptRefSchema, dependent: conceptRefSchema }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("process"), steps: z.array(conceptRefSchema).min(2) }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("temporal-sequence"), steps: z.array(conceptRefSchema).min(2) }).strict(),
  z.object({
    ...commonRelationSchema,
    kind: z.literal("policy-response"),
    condition: conceptRefSchema,
    conditionAssertionStatus: z.enum(atomicAssertionStatusValuesV36).optional(),
    response: conceptRefSchema,
    responseAssertionStatus: z.enum(atomicAssertionStatusValuesV36).optional(),
  }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("evidence-set"), subject: conceptRefSchema.optional(), evidence: z.array(conceptRefSchema).min(2) }).strict(),
]);

const legacyExplanatoryRelationArtifactSchemaV36 = z.object({
  schemaVersion: z.literal(HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36),
  plannerVersion: labelSchema,
  episodeId: identifierSchema,
  relations: z.array(explanatoryRelationSchemaV36),
}).strict().superRefine((artifact, context) => {
  artifact.relations.forEach((relation, index) => {
    if ((relation.kind === "policy-response" &&
      (relation.conditionAssertionStatus !== undefined || relation.responseAssertionStatus !== undefined)) ||
      (relation.kind === "causal" && relation.causalAssertionStatus !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "V2 relation artifacts cannot contain explicit modality fields.",
        path: ["relations", index],
      });
    }
  });
});

const currentExplanatoryRelationArtifactSchemaV36 = z.object({
  schemaVersion: z.literal(HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36),
  plannerVersion: labelSchema,
  episodeId: identifierSchema,
  relations: z.array(explanatoryRelationSchemaV36),
}).strict();

export const explanatoryRelationArtifactSchemaV36 = z.union([
  legacyExplanatoryRelationArtifactSchemaV36,
  currentExplanatoryRelationArtifactSchemaV36,
]);

/**
 * Machine-enforcing Draft 2020-12 JSON Schema generated by Zod from the
 * authoritative `explanatoryRelationSchemaV36` runtime validator.
 */
export const explanatoryRelationJsonSchemaV36 = {
  ...z.toJSONSchema(explanatoryRelationSchemaV36),
  $id: "https://mediaforge.local/schemas/history/v3.6/relation-schema.json",
  title: "History V3.6 explanatory relation",
};

/** Source-of-truth contract exported for review-schema generation. */
export const relationContractDocumentV36 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "History V3.6 explanatory relation IR",
  schemaVersion: HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36,
  generatedFrom: "packages/history/src/v36/explanatory-relation-v36.ts#relationContractDocumentV36",
  identity: {
    semanticRelationId: {
      field: "id",
      algorithm: "relation-{kind}-{first 24 hex chars of sha256(JSON.stringify(relation-specific canonical semantic inputs))}",
      excludes: ["supportClaimIds", "evidenceFingerprint", "sourceSpanIds", "context-window IDs", "timestamps", "candidate IDs", "render IDs", "random UUIDs"],
    },
    evidenceFingerprint: {
      field: "evidenceFingerprint",
      algorithm: "evidence-{first 24 hex chars of sha256(JSON.stringify({supportClaimIds: sorted unique IDs}))}",
      ordering: "supportClaimIds is an unordered provenance set and is canonicalized sorted and unique.",
    },
  },
  commonRequiredFields: ["id", "episodeId", "kind", "supportClaimIds", "evidenceFingerprint"],
  commonFields: {
    id: "SemanticRelationIdV36; semantic identity only",
    episodeId: "EpisodeIdV36; semantic identity input",
    supportClaimIds: "ClaimIdV36[1..n]; canonical provenance support, excluded from semantic identity",
    evidenceFingerprint: "RelationEvidenceFingerprintV36; deterministic fingerprint of supportClaimIds",
  },
  relationKinds: {
    movement: { required: ["from", "via", "to"], participantTypes: { from: "PlaceRefV36", via: "PlaceRefV36[]", to: "PlaceRefV36" }, cardinality: "from and to must differ; via is ordered", direction: "from -> via[] -> to", semanticIdentityInputs: ["episodeId", "kind", "from", "ordered via[]", "to"] },
    "spatial-comparison": { required: ["places"], participantTypes: { places: "PlaceRefV36[]" }, cardinality: "at least two distinct places", ordering: "unordered set", direction: "none", semanticIdentityInputs: ["episodeId", "kind", "canonical unordered places set"] },
    "spatial-area": { required: ["place"], participantTypes: { place: "PlaceRefV36" }, cardinality: "exactly one place", direction: "none", semanticIdentityInputs: ["episodeId", "kind", "place"] },
    causal: {
      required: ["cause", "effect"],
      optional: ["causalAssertionStatus"],
      participantTypes: { cause: "ConceptRefV36", effect: "ConceptRefV36" },
      modalityTypes: { causalAssertionStatus: "AtomicAssertionStatusV36" },
      legacyMissingModality: "asserted causal link; proven by V2 asserted-only projection guards",
      cardinality: "two distinct concepts",
      direction: "cause -> effect",
      semanticIdentityInputs: ["episodeId", "kind", "cause", "effect", "non-default causalAssertionStatus"],
    },
    dependency: { required: ["dependency", "dependent"], participantTypes: { dependency: "ConceptRefV36", dependent: "ConceptRefV36" }, cardinality: "two distinct concepts", direction: "dependency -> dependent; dependent depends on dependency", semanticIdentityInputs: ["episodeId", "kind", "dependency", "dependent"] },
    process: { required: ["steps"], participantTypes: { steps: "ConceptRefV36[]" }, cardinality: "at least two steps; adjacent steps must differ", ordering: "ordered", direction: "first step -> later steps", semanticIdentityInputs: ["episodeId", "kind", "ordered steps[]"] },
    "temporal-sequence": { required: ["steps"], participantTypes: { steps: "ConceptRefV36[]" }, cardinality: "at least two steps; adjacent steps must differ", ordering: "ordered", direction: "earlier step -> later step", semanticIdentityInputs: ["episodeId", "kind", "ordered steps[]"] },
    "policy-response": {
      required: ["condition", "response"],
      optional: ["conditionAssertionStatus", "responseAssertionStatus"],
      participantTypes: { condition: "ConceptRefV36", response: "ConceptRefV36" },
      modalityTypes: { conditionAssertionStatus: "AtomicAssertionStatusV36", responseAssertionStatus: "AtomicAssertionStatusV36" },
      legacyMissingModality: "asserted condition and asserted response; proven by V2 asserted-only projection guards",
      cardinality: "two distinct concepts",
      direction: "condition -> response; each assertion status is attached to its named side",
      semanticIdentityInputs: ["episodeId", "kind", "condition", "response", "non-default conditionAssertionStatus", "non-default responseAssertionStatus"],
    },
    "evidence-set": { required: ["evidence"], optional: ["subject"], participantTypes: { subject: "ConceptRefV36", evidence: "ConceptRefV36[]" }, cardinality: "at least two distinct evidence members", ordering: "evidence is an unordered semantic set, not a presentation list", direction: "subject <- evidence set when subject is present", semanticIdentityInputs: ["episodeId", "kind", "optional subject", "canonical unordered evidence set"] },
  },
  runtimeValidationInvariants: ["episode-local support", "canonical entity resolution", "proper-name atomicity", "exact grounded proposition", "direction support", "kind-specific cardinality", "semantic ID match", "evidence fingerprint match", "semantic duplicate detection"],
  backwardCompatibility: {
    acceptedArtifactVersions: [HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36, HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36],
    legacyPolicyResponseInterpretation: "Missing policy-response modality always means asserted/asserted in every code path.",
    legacyCausalInterpretation: "Missing causal modality always means asserted in every code path.",
    legacySemanticIds: "Unchanged; explicit asserted/asserted canonicalizes to the V2 identity payload.",
    evidenceFingerprints: "Unchanged; premise modality never enters provenance fingerprint inputs.",
  },
} as const;

export function parseExplanatoryRelationArtifactV36(input: unknown): ExplanatoryRelationArtifactV36 {
  return explanatoryRelationArtifactSchemaV36.parse(input) as unknown as ExplanatoryRelationArtifactV36;
}
