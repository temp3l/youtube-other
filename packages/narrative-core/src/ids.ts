import type { z } from "zod";

import { brandedIdentifier } from "./common.js";

export const seriesIdSchema = brandedIdentifier("SeriesId");
export type SeriesId = z.infer<typeof seriesIdSchema>;

export const seasonIdSchema = brandedIdentifier("SeasonId");
export type SeasonId = z.infer<typeof seasonIdSchema>;

export const storyArcIdSchema = brandedIdentifier("StoryArcId");
export type StoryArcId = z.infer<typeof storyArcIdSchema>;

export const narrativeEpisodeIdSchema = brandedIdentifier("NarrativeEpisodeId");
export type NarrativeEpisodeId = z.infer<typeof narrativeEpisodeIdSchema>;

export const characterIdSchema = brandedIdentifier("CharacterId");
export type CharacterId = z.infer<typeof characterIdSchema>;

export const locationIdSchema = brandedIdentifier("LocationId");
export type LocationId = z.infer<typeof locationIdSchema>;

export const propIdSchema = brandedIdentifier("PropId");
export type PropId = z.infer<typeof propIdSchema>;

export const narrativeSecretIdSchema = brandedIdentifier("NarrativeSecretId");
export type NarrativeSecretId = z.infer<typeof narrativeSecretIdSchema>;

export const knowledgeClaimIdSchema = brandedIdentifier("KnowledgeClaimId");
export type KnowledgeClaimId = z.infer<typeof knowledgeClaimIdSchema>;

export const narrativePromiseIdSchema = brandedIdentifier("NarrativePromiseId");
export type NarrativePromiseId = z.infer<typeof narrativePromiseIdSchema>;

export const beatIdSchema = brandedIdentifier("BeatId");
export type BeatId = z.infer<typeof beatIdSchema>;

export const narrativeSnapshotIdSchema = brandedIdentifier("NarrativeSnapshotId");
export type NarrativeSnapshotId = z.infer<typeof narrativeSnapshotIdSchema>;

export const narrativeRevisionIdSchema = brandedIdentifier("NarrativeRevisionId");
export type NarrativeRevisionId = z.infer<typeof narrativeRevisionIdSchema>;
