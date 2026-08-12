import { z } from "zod";

import {
  isoDateTimeSchema,
  NARRATIVE_SCHEMA_VERSION,
  provenanceSchema,
  sha256Schema,
} from "./common.js";
import { narrativeRevisionIdSchema } from "./ids.js";

export const NARRATIVE_REVISION_STATUSES = [
  "DRAFT",
  "VALIDATED",
  "QA_APPROVED",
  "ACCEPTED",
  "SUPERSEDED",
  "REJECTED",
] as const;
export const narrativeRevisionStatusSchema = z.enum(NARRATIVE_REVISION_STATUSES);
export type NarrativeRevisionStatus = z.infer<typeof narrativeRevisionStatusSchema>;

export const NARRATIVE_AGGREGATE_KINDS = [
  "series_bible",
  "character",
  "character_state",
  "relationship_state",
  "narrative_secret",
  "knowledge_claim",
  "narrative_promise",
  "narrative_snapshot",
] as const;
export const narrativeAggregateKindSchema = z.enum(NARRATIVE_AGGREGATE_KINDS);
export type NarrativeAggregateKind = z.infer<typeof narrativeAggregateKindSchema>;

export const narrativeRevisionEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    revisionId: narrativeRevisionIdSchema,
    aggregateId: z.string().min(1).max(160),
    aggregateKind: narrativeAggregateKindSchema,
    revisionNumber: z.number().int().positive(),
    payload: z.unknown(),
    contentHash: sha256Schema,
    parentRevisionIds: z.array(narrativeRevisionIdSchema),
    status: narrativeRevisionStatusSchema,
    provenance: provenanceSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type NarrativeRevisionEnvelope = z.infer<
  typeof narrativeRevisionEnvelopeSchema
>;

export function createRevisionEnvelopeSchema<TPayload extends z.ZodType>(
  payloadSchema: TPayload
) {
  return narrativeRevisionEnvelopeSchema.extend({
    payload: payloadSchema,
  });
}
