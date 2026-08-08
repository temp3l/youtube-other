import { createHash } from "node:crypto";

import { z } from "zod";

export const HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36 =
  "history-explanatory-relations.v1" as const;
export const HISTORY_EXPLANATORY_RELATIONS_PLANNER_V36 =
  "history-explanatory-relations.v3.6.0" as const;

declare const episodeIdBrand: unique symbol;
declare const claimIdBrand: unique symbol;
declare const entityIdBrand: unique symbol;
declare const sourceSpanIdBrand: unique symbol;
declare const relationIdBrand: unique symbol;

export type EpisodeIdV36 = string & { readonly [episodeIdBrand]: "EpisodeIdV36" };
export type ClaimIdV36 = string & { readonly [claimIdBrand]: "ClaimIdV36" };
export type EntityIdV36 = string & { readonly [entityIdBrand]: "EntityIdV36" };
export type SourceSpanIdV36 = string & { readonly [sourceSpanIdBrand]: "SourceSpanIdV36" };
export type ExplanatoryRelationIdV36 = string & {
  readonly [relationIdBrand]: "ExplanatoryRelationIdV36";
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

export interface MovementRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "movement";
  readonly from: PlaceRefV36;
  readonly to: PlaceRefV36;
  readonly via: readonly PlaceRefV36[];
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

export interface SpatialComparisonRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "spatial-comparison";
  readonly places: readonly [PlaceRefV36, PlaceRefV36, ...PlaceRefV36[]];
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

export interface SpatialAreaRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "spatial-area";
  readonly place: PlaceRefV36;
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

export interface CausalRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "causal";
  readonly cause: ConceptRefV36;
  readonly effect: ConceptRefV36;
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

/** Direction is dependency -> dependent: the latter requires the former. */
export interface DependencyRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "dependency";
  readonly dependency: ConceptRefV36;
  readonly dependent: ConceptRefV36;
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

export interface ProcessRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "process";
  readonly steps: readonly [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]];
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

export interface TemporalSequenceRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "temporal-sequence";
  readonly steps: readonly [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]];
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

export interface PolicyResponseRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "policy-response";
  readonly condition: ConceptRefV36;
  readonly response: ConceptRefV36;
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
}

export interface EvidenceSetRelationV36 {
  readonly id: ExplanatoryRelationIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly kind: "evidence-set";
  readonly subject?: ConceptRefV36;
  readonly evidence: readonly [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]];
  readonly supportClaimIds: readonly [ClaimIdV36, ...ClaimIdV36[]];
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

export type ExplanatoryRelationDraftV36 = WithoutRelationFields<ExplanatoryRelationV36, "id">;

export type GroundedRelationPropositionV36 = WithoutRelationFields<
  ExplanatoryRelationV36,
  "id" | "episodeId" | "supportClaimIds"
>;

export interface RelationSupportClaimV36 {
  readonly id: ClaimIdV36;
  readonly episodeId: EpisodeIdV36;
  readonly normalizedProposition: string;
  readonly claimKind: string;
  /** Exact, deterministic proposition assertions; claimKind alone is never evidence. */
  readonly groundedPropositions: readonly GroundedRelationPropositionV36[];
}

export interface ExplanatoryRelationArtifactV36 {
  readonly schemaVersion: typeof HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36;
  readonly plannerVersion: string;
  readonly episodeId: EpisodeIdV36;
  readonly relations: readonly ExplanatoryRelationV36[];
}

function normalizedLabel(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase();
}

export function placeRefKeyV36(ref: PlaceRefV36): string {
  return `place:${ref.entityId}:${normalizedLabel(ref.canonicalLabel)}`;
}

export function conceptRefKeyV36(ref: ConceptRefV36): string {
  return `concept:${ref.entityId ?? ""}:${normalizedLabel(ref.canonicalLabel)}`;
}

function relationParticipantsV36(relation: ExplanatoryRelationDraftV36): readonly string[] {
  switch (relation.kind) {
    case "movement":
      return [placeRefKeyV36(relation.from), placeRefKeyV36(relation.to), ...relation.via.map(placeRefKeyV36)];
    case "spatial-comparison":
      return relation.places.map(placeRefKeyV36);
    case "spatial-area":
      return [placeRefKeyV36(relation.place)];
    case "causal":
      return [conceptRefKeyV36(relation.cause), conceptRefKeyV36(relation.effect)];
    case "dependency":
      return [conceptRefKeyV36(relation.dependency), conceptRefKeyV36(relation.dependent)];
    case "process":
    case "temporal-sequence":
      return relation.steps.map(conceptRefKeyV36);
    case "policy-response":
      return [conceptRefKeyV36(relation.condition), conceptRefKeyV36(relation.response)];
    case "evidence-set":
      return [
        ...(relation.subject ? [conceptRefKeyV36(relation.subject)] : []),
        ...relation.evidence.map(conceptRefKeyV36),
      ];
  }
}

export function semanticIdentityPayloadV36(
  relation: ExplanatoryRelationDraftV36
): string {
  return JSON.stringify({
    episodeId: relation.episodeId,
    kind: relation.kind,
    participants: relationParticipantsV36(relation),
    supportClaimIds: [...relation.supportClaimIds].sort(),
  });
}

export function explanatoryRelationIdV36(
  relation: ExplanatoryRelationDraftV36
): ExplanatoryRelationIdV36 {
  const digest = createHash("sha256")
    .update(semanticIdentityPayloadV36(relation))
    .digest("hex")
    .slice(0, 24);
  return brandedIdentifier<ExplanatoryRelationIdV36>(
    `relation-${relation.kind}-${digest}`,
    identifierSchema
  );
}

export function createExplanatoryRelationV36(
  draft: ExplanatoryRelationDraftV36
): ExplanatoryRelationV36 {
  const id = explanatoryRelationIdV36(draft);
  switch (draft.kind) {
    case "movement": return { ...draft, id };
    case "spatial-comparison": return { ...draft, id };
    case "spatial-area": return { ...draft, id };
    case "causal": return { ...draft, id };
    case "dependency": return { ...draft, id };
    case "process": return { ...draft, id };
    case "temporal-sequence": return { ...draft, id };
    case "policy-response": return { ...draft, id };
    case "evidence-set": return { ...draft, id };
  }
}

const placeRefSchema = z.object({ entityId: identifierSchema, canonicalLabel: labelSchema }).strict();
const conceptRefSchema = z.object({
  canonicalLabel: labelSchema,
  entityId: identifierSchema.optional(),
  sourceSpanIds: z.array(identifierSchema).min(1).optional(),
}).strict();
const supportClaimIdsSchema = z.array(identifierSchema).min(1);

const commonRelationSchema = {
  id: identifierSchema,
  episodeId: identifierSchema,
  supportClaimIds: supportClaimIdsSchema,
};

export const explanatoryRelationSchemaV36 = z.discriminatedUnion("kind", [
  z.object({ ...commonRelationSchema, kind: z.literal("movement"), from: placeRefSchema, to: placeRefSchema, via: z.array(placeRefSchema) }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("spatial-comparison"), places: z.array(placeRefSchema).min(2) }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("spatial-area"), place: placeRefSchema }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("causal"), cause: conceptRefSchema, effect: conceptRefSchema }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("dependency"), dependency: conceptRefSchema, dependent: conceptRefSchema }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("process"), steps: z.array(conceptRefSchema).min(2) }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("temporal-sequence"), steps: z.array(conceptRefSchema).min(2) }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("policy-response"), condition: conceptRefSchema, response: conceptRefSchema }).strict(),
  z.object({ ...commonRelationSchema, kind: z.literal("evidence-set"), subject: conceptRefSchema.optional(), evidence: z.array(conceptRefSchema).min(2) }).strict(),
]);

export const explanatoryRelationArtifactSchemaV36 = z.object({
  schemaVersion: z.literal(HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36),
  plannerVersion: labelSchema,
  episodeId: identifierSchema,
  relations: z.array(explanatoryRelationSchemaV36),
}).strict();

export function parseExplanatoryRelationArtifactV36(input: unknown): ExplanatoryRelationArtifactV36 {
  return explanatoryRelationArtifactSchemaV36.parse(input) as unknown as ExplanatoryRelationArtifactV36;
}
