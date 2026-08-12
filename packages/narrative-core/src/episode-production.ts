import { z } from "zod";

import {
  identifierSchema,
  NARRATIVE_SCHEMA_VERSION,
  nonEmptyStringSchema,
  provenanceSchema,
} from "./common.js";
import {
  beatIdSchema,
  narrativeEpisodeIdSchema,
  narrativeRevisionIdSchema,
  narrativeSecretIdSchema,
  narrativePromiseIdSchema,
  seriesIdSchema,
  storyArcIdSchema,
} from "./ids.js";
import { createRevisionEnvelopeSchema } from "./revision.js";

export const EPISODE_PRODUCTION_SCHEMA_VERSION =
  "mediaforge.narrative.episode-production.v1" as const;

export const BEAT_CATEGORIES = [
  "HOOK",
  "ORIENTATION",
  "CONFLICT",
  "ESCALATION",
  "DISCOVERY",
  "REVERSAL",
  "DECISION",
  "CONSEQUENCE",
  "CLIFFHANGER",
] as const;
export const beatCategorySchema = z.enum(BEAT_CATEGORIES);
export type BeatCategory = z.infer<typeof beatCategorySchema>;

export const CLIFFHANGER_TAXONOMY = [
  "IDENTITY_REVEAL",
  "BETRAYAL",
  "INTERRUPTION",
  "DISCOVERY",
  "DECISION",
  "ARRIVAL",
  "THREAT",
  "REVERSAL",
  "SECRET_EXPOSED",
  "FALSE_ASSUMPTION",
  "PHYSICAL_DANGER",
  "RELATIONSHIP_SHIFT",
] as const;
export const cliffhangerTaxonomySchema = z.enum(CLIFFHANGER_TAXONOMY);
export type CliffhangerTaxonomy = z.infer<typeof cliffhangerTaxonomySchema>;

export const durationTargetSchema = z
  .object({
    minSeconds: z.number().nonnegative(),
    maxSeconds: z.number().nonnegative(),
    targetSeconds: z.number().nonnegative(),
  })
  .strict()
  .refine((value) => value.minSeconds <= value.targetSeconds, {
    message: "minSeconds must be <= targetSeconds",
  })
  .refine((value) => value.targetSeconds <= value.maxSeconds, {
    message: "targetSeconds must be <= maxSeconds",
  });
export type DurationTarget = z.infer<typeof durationTargetSchema>;

export const promiseMovementSchema = z
  .object({
    promiseId: narrativePromiseIdSchema,
    progression: nonEmptyStringSchema,
  })
  .strict();
export type EpisodeSpecPromiseMovement = z.infer<typeof promiseMovementSchema>;

export const revealPermissionSchema = z
  .object({
    secretId: narrativeSecretIdSchema,
    allowed: z.boolean(),
    rationale: nonEmptyStringSchema,
  })
  .strict();
export type EpisodeSpecRevealPermission = z.infer<typeof revealPermissionSchema>;

export const hookProjectionSchema = z
  .object({
    semanticId: identifierSchema,
    canonicalIntent: nonEmptyStringSchema,
  })
  .strict();
export type HookProjection = z.infer<typeof hookProjectionSchema>;

export const cliffhangerProjectionSchema = z
  .object({
    semanticId: identifierSchema,
    canonicalIntent: nonEmptyStringSchema,
    taxonomy: cliffhangerTaxonomySchema,
  })
  .strict();
export type CliffhangerProjection = z.infer<typeof cliffhangerProjectionSchema>;

export const episodeSpecPayloadSchema = z
  .object({
    schemaVersion: z.literal(EPISODE_PRODUCTION_SCHEMA_VERSION),
    seriesId: seriesIdSchema,
    episodeId: narrativeEpisodeIdSchema,
    canonicalEpisodeId: z.string().regex(/^E\d{3}$/u),
    episodeNumber: z.number().int().min(1).max(100),
    storyArcId: storyArcIdSchema,
    arcRevisionId: narrativeRevisionIdSchema,
    boundaryRevisionId: narrativeRevisionIdSchema,
    enScriptRevisionId: narrativeRevisionIdSchema,
    objective: nonEmptyStringSchema,
    audienceQuestion: nonEmptyStringSchema,
    parentSnapshotRevisionId: narrativeRevisionIdSchema.optional(),
    startingConditions: z
      .object({
        location: nonEmptyStringSchema,
        cast: z.array(nonEmptyStringSchema).min(1),
      })
      .strict(),
    requiredEvents: z.array(nonEmptyStringSchema).min(1),
    forbiddenEvents: z.array(nonEmptyStringSchema),
    promiseMovements: z.array(promiseMovementSchema),
    revealPermissions: z.array(revealPermissionSchema),
    endingState: z
      .object({
        newInformation: nonEmptyStringSchema,
        openLoop: nonEmptyStringSchema,
        cliffhangerRequired: z.literal(true),
      })
      .strict(),
    hook: hookProjectionSchema,
    cliffhanger: cliffhangerProjectionSchema,
    durationRangeSeconds: durationTargetSchema,
    provenance: provenanceSchema,
  })
  .strict();
export type EpisodeSpecPayload = z.infer<typeof episodeSpecPayloadSchema>;

export const beatEntrySchema = z
  .object({
    beatId: beatIdSchema,
    order: z.number().int().nonnegative(),
    category: beatCategorySchema,
    purpose: nonEmptyStringSchema,
    event: nonEmptyStringSchema,
    participants: z.array(nonEmptyStringSchema),
    informationGain: nonEmptyStringSchema,
    knowledgeTransition: nonEmptyStringSchema.optional(),
    emotionTransition: nonEmptyStringSchema.optional(),
    promiseProgression: nonEmptyStringSchema.optional(),
    durationTargetSeconds: durationTargetSchema,
    requiredReactions: z.array(nonEmptyStringSchema),
    boundaryObligation: z
      .enum(["hook", "cliffhanger", "next_opening", "new_information", "open_loop"])
      .optional(),
  })
  .strict();
export type BeatEntry = z.infer<typeof beatEntrySchema>;

export const beatPlanPayloadSchema = z
  .object({
    schemaVersion: z.literal(EPISODE_PRODUCTION_SCHEMA_VERSION),
    seriesId: seriesIdSchema,
    episodeId: narrativeEpisodeIdSchema,
    canonicalEpisodeId: z.string().regex(/^E\d{3}$/u),
    episodeSpecRevisionId: narrativeRevisionIdSchema,
    beats: z.array(beatEntrySchema).length(BEAT_CATEGORIES.length),
    boundaryObligations: z
      .object({
        hookSemanticId: identifierSchema,
        cliffhangerSemanticId: identifierSchema,
        nextOpeningObligation: nonEmptyStringSchema.optional(),
        priorOpeningObligation: nonEmptyStringSchema.optional(),
      })
      .strict(),
    provenance: provenanceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.beats.some((beat, index) => beat.order !== index)) {
      context.addIssue({
        code: "custom",
        message: "Beat order must be contiguous from zero.",
      });
    }
    const categories = value.beats.map((beat) => beat.category);
    if (categories.join(",") !== BEAT_CATEGORIES.join(",")) {
      context.addIssue({
        code: "custom",
        message: "Beat categories must follow the canonical production order.",
      });
    }
  });
export type BeatPlanPayload = z.infer<typeof beatPlanPayloadSchema>;

export const episodeSpecRevisionSchema = createRevisionEnvelopeSchema(
  episodeSpecPayloadSchema
);
export type EpisodeSpecRevision = z.infer<typeof episodeSpecRevisionSchema>;

export const beatPlanRevisionSchema = createRevisionEnvelopeSchema(
  beatPlanPayloadSchema
);
export type BeatPlanRevision = z.infer<typeof beatPlanRevisionSchema>;

export function parseEpisodeSpecPayload(payload: unknown): EpisodeSpecPayload {
  return episodeSpecPayloadSchema.parse(payload);
}

export function parseBeatPlanPayload(payload: unknown): BeatPlanPayload {
  return beatPlanPayloadSchema.parse(payload);
}

export function validateEpisodeSpecPayload(payload: EpisodeSpecPayload): boolean {
  return episodeSpecPayloadSchema.safeParse(payload).success;
}

export function validateBeatPlanPayload(payload: BeatPlanPayload): boolean {
  return beatPlanPayloadSchema.safeParse(payload).success;
}

export const beatPlanPacingRatios: Readonly<
  Record<BeatCategory, { start: number; end: number }>
> = {
  HOOK: { start: 0, end: 0.05 },
  ORIENTATION: { start: 0.05, end: 0.2 },
  CONFLICT: { start: 0.2, end: 0.35 },
  ESCALATION: { start: 0.35, end: 0.58 },
  DISCOVERY: { start: 0.58, end: 0.65 },
  REVERSAL: { start: 0.65, end: 0.83 },
  DECISION: { start: 0.83, end: 0.88 },
  CONSEQUENCE: { start: 0.88, end: 0.92 },
  CLIFFHANGER: { start: 0.92, end: 1 },
};

export function durationTargetFromRatio(
  totalSeconds: number,
  startRatio: number,
  endRatio: number
): DurationTarget {
  const minSeconds = Number((totalSeconds * startRatio).toFixed(2));
  const maxSeconds = Number((totalSeconds * endRatio).toFixed(2));
  const targetSeconds = Number(((minSeconds + maxSeconds) / 2).toFixed(2));
  return { minSeconds, maxSeconds, targetSeconds };
}
