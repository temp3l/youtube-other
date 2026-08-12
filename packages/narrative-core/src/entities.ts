import { z } from "zod";

import {
  boundedScoreSchema,
  identifierSchema,
  NARRATIVE_SCHEMA_VERSION,
  nonEmptyStringSchema,
  provenanceSchema,
} from "./common.js";
import {
  characterIdSchema,
  knowledgeClaimIdSchema,
  locationIdSchema,
  narrativeEpisodeIdSchema,
  narrativePromiseIdSchema,
  narrativeRevisionIdSchema,
  narrativeSecretIdSchema,
  narrativeSnapshotIdSchema,
  seriesIdSchema,
} from "./ids.js";
import { createRevisionEnvelopeSchema } from "./revision.js";

export const AUDIENCE_KNOWLEDGE_LEVELS = [
  "unknown",
  "suspected",
  "partial",
  "known",
] as const;
export const audienceKnowledgeLevelSchema = z.enum(AUDIENCE_KNOWLEDGE_LEVELS);
export type AudienceKnowledgeLevel = z.infer<typeof audienceKnowledgeLevelSchema>;

export const REVEAL_STATUSES = [
  "hidden",
  "foreshadowed",
  "partially_revealed",
  "revealed",
] as const;
export const revealStatusSchema = z.enum(REVEAL_STATUSES);
export type RevealStatus = z.infer<typeof revealStatusSchema>;

export const PROMISE_STATUSES = [
  "open",
  "progressing",
  "resolved",
  "abandoned",
] as const;
export const promiseStatusSchema = z.enum(PROMISE_STATUSES);
export type PromiseStatus = z.infer<typeof promiseStatusSchema>;

export const seriesBiblePayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    seriesId: seriesIdSchema,
    premise: nonEmptyStringSchema,
    genre: nonEmptyStringSchema,
    subgenre: nonEmptyStringSchema.optional(),
    audience: nonEmptyStringSchema,
    emotionalPromise: nonEmptyStringSchema,
    centralConflict: nonEmptyStringSchema,
    centralMystery: nonEmptyStringSchema,
    tone: nonEmptyStringSchema,
    themes: z.array(nonEmptyStringSchema).min(1),
    storytellingRules: z.array(nonEmptyStringSchema),
    prohibitedPatterns: z.array(nonEmptyStringSchema),
  })
  .strict();
export type SeriesBiblePayload = z.infer<typeof seriesBiblePayloadSchema>;

export const characterPayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    characterId: characterIdSchema,
    displayName: nonEmptyStringSchema,
    narrativeRole: nonEmptyStringSchema,
    wants: z.array(nonEmptyStringSchema),
    needs: z.array(nonEmptyStringSchema),
    fears: z.array(nonEmptyStringSchema),
    flaws: z.array(nonEmptyStringSchema),
    contradictions: z.array(nonEmptyStringSchema),
    speechProfile: nonEmptyStringSchema,
  })
  .strict();
export type CharacterPayload = z.infer<typeof characterPayloadSchema>;

export const characterStatePayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    characterId: characterIdSchema,
    goal: nonEmptyStringSchema,
    belief: nonEmptyStringSchema,
    emotionalState: nonEmptyStringSchema,
    locationId: locationIdSchema.optional(),
    wardrobeId: identifierSchema.optional(),
    injuriesAndStatus: z.array(nonEmptyStringSchema),
    provenanceRevisionIds: z.array(narrativeRevisionIdSchema),
  })
  .strict();
export type CharacterStatePayload = z.infer<typeof characterStatePayloadSchema>;

export const relationshipStatePayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    fromCharacterId: characterIdSchema,
    toCharacterId: characterIdSchema,
    affinity: boundedScoreSchema,
    trust: boundedScoreSchema,
    attraction: boundedScoreSchema,
    resentment: boundedScoreSchema,
    fear: boundedScoreSchema,
    dependency: boundedScoreSchema,
    evidenceRevisionIds: z.array(narrativeRevisionIdSchema),
  })
  .strict()
  .refine(
    (value) => value.fromCharacterId !== value.toCharacterId,
    "RelationshipState must be directional between distinct characters."
  );
export type RelationshipStatePayload = z.infer<
  typeof relationshipStatePayloadSchema
>;

export const narrativeSecretPayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    secretId: narrativeSecretIdSchema,
    objectiveFact: nonEmptyStringSchema,
    holderCharacterIds: z.array(characterIdSchema).min(1),
    affectedCharacterIds: z.array(characterIdSchema),
    audienceKnowledge: audienceKnowledgeLevelSchema,
    revealConstraints: z.array(nonEmptyStringSchema),
    revealStatus: revealStatusSchema,
    revealProvenanceRevisionIds: z.array(narrativeRevisionIdSchema),
  })
  .strict();
export type NarrativeSecretPayload = z.infer<typeof narrativeSecretPayloadSchema>;

export const knowledgeClaimPayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    claimId: knowledgeClaimIdSchema,
    truthAssertion: nonEmptyStringSchema,
    characterKnowledge: z.array(nonEmptyStringSchema),
    characterBelief: z.array(nonEmptyStringSchema),
    characterSuspicion: z.array(nonEmptyStringSchema),
    audienceKnowledge: audienceKnowledgeLevelSchema,
  })
  .strict();
export type KnowledgeClaimPayload = z.infer<typeof knowledgeClaimPayloadSchema>;

export const narrativePromisePayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    promiseId: narrativePromiseIdSchema,
    description: nonEmptyStringSchema,
    plantedEpisodeId: narrativeEpisodeIdSchema,
    payoffWindowStartEpisodeId: narrativeEpisodeIdSchema,
    payoffWindowEndEpisodeId: narrativeEpisodeIdSchema,
    progression: nonEmptyStringSchema,
    status: promiseStatusSchema,
    resolution: nonEmptyStringSchema.optional(),
  })
  .strict();
export type NarrativePromisePayload = z.infer<typeof narrativePromisePayloadSchema>;

export const narrativeSnapshotPayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    snapshotId: narrativeSnapshotIdSchema,
    seriesId: seriesIdSchema,
    episodeId: narrativeEpisodeIdSchema,
    parentSnapshotRevisionId: narrativeRevisionIdSchema.optional(),
    acceptedSeriesBibleRevisionId: narrativeRevisionIdSchema,
    acceptedStoryArcRevisionId: narrativeRevisionIdSchema.optional(),
    acceptedEpisodeRevisionId: narrativeRevisionIdSchema.optional(),
    characterStates: z.array(characterStatePayloadSchema).min(1),
    relationshipStates: z.array(relationshipStatePayloadSchema),
    secrets: z.array(narrativeSecretPayloadSchema),
    knowledgeClaims: z.array(knowledgeClaimPayloadSchema),
    promises: z.array(narrativePromisePayloadSchema),
    provenance: provenanceSchema,
  })
  .strict();
export type NarrativeSnapshotPayload = z.infer<
  typeof narrativeSnapshotPayloadSchema
>;

export const seriesBibleRevisionSchema = createRevisionEnvelopeSchema(
  seriesBiblePayloadSchema
);
export type SeriesBibleRevision = z.infer<typeof seriesBibleRevisionSchema>;

export const characterRevisionSchema = createRevisionEnvelopeSchema(
  characterPayloadSchema
);
export type CharacterRevision = z.infer<typeof characterRevisionSchema>;

export const characterStateRevisionSchema = createRevisionEnvelopeSchema(
  characterStatePayloadSchema
);
export type CharacterStateRevision = z.infer<typeof characterStateRevisionSchema>;

export const relationshipStateRevisionSchema = createRevisionEnvelopeSchema(
  relationshipStatePayloadSchema
);
export type RelationshipStateRevision = z.infer<
  typeof relationshipStateRevisionSchema
>;

export const narrativeSecretRevisionSchema = createRevisionEnvelopeSchema(
  narrativeSecretPayloadSchema
);
export type NarrativeSecretRevision = z.infer<typeof narrativeSecretRevisionSchema>;

export const knowledgeClaimRevisionSchema = createRevisionEnvelopeSchema(
  knowledgeClaimPayloadSchema
);
export type KnowledgeClaimRevision = z.infer<typeof knowledgeClaimRevisionSchema>;

export const narrativePromiseRevisionSchema = createRevisionEnvelopeSchema(
  narrativePromisePayloadSchema
);
export type NarrativePromiseRevision = z.infer<typeof narrativePromiseRevisionSchema>;

export const narrativeSnapshotRevisionSchema = createRevisionEnvelopeSchema(
  narrativeSnapshotPayloadSchema
);
export type NarrativeSnapshotRevision = z.infer<
  typeof narrativeSnapshotRevisionSchema
>;
