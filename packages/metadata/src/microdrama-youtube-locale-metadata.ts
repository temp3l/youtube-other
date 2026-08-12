import { createHash } from "node:crypto";

import { z } from "zod";

import {
  editableLocaleMetadataSchema,
  type EditableLocaleMetadata,
} from "./delivery-bundle.js";

export const MICRODRAMA_YOUTUBE_LOCALE_METADATA_SCHEMA_VERSION =
  "microdrama-youtube-locale-metadata.v1" as const;

export const MICRODRAMA_YOUTUBE_SERIES_PROJECTION_SCHEMA_VERSION =
  "microdrama-youtube-series-projection.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const youtubeHashtagSchema = z.string().regex(/^#[A-Za-z0-9_]+$/u);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

const youtubeLocaleCopySchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1)).max(500),
  hashtags: z.array(youtubeHashtagSchema).max(3),
});

export const microdramaYoutubeLocaleMetadataRevisionSchema = z.strictObject({
  schemaVersion: z.literal(MICRODRAMA_YOUTUBE_LOCALE_METADATA_SCHEMA_VERSION),
  metadataRevisionId: z.string().regex(/^youtube-metadata-[a-f0-9]{16}$/u),
  seriesId: identifierSchema,
  locale: identifierSchema,
  episodeId: identifierSchema,
  episodeRevisionId: identifierSchema,
  copy: youtubeLocaleCopySchema,
  fingerprint: sha256Schema,
  createdAt: isoDateTimeSchema,
});
export type MicrodramaYoutubeLocaleMetadataRevision = z.infer<
  typeof microdramaYoutubeLocaleMetadataRevisionSchema
>;

export const microdramaYoutubeSeriesProjectionSchema = z.strictObject({
  schemaVersion: z.literal(MICRODRAMA_YOUTUBE_SERIES_PROJECTION_SCHEMA_VERSION),
  seriesId: identifierSchema,
  locale: identifierSchema,
  seriesPlaylistId: identifierSchema,
  episodePlaylistIds: z.array(identifierSchema).min(1),
  fingerprint: sha256Schema,
});
export type MicrodramaYoutubeSeriesProjection = z.infer<
  typeof microdramaYoutubeSeriesProjectionSchema
>;

function deriveYoutubeHashtags(tags: readonly string[]): string[] {
  const hashtags: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().replace(/^#/u, "");
    if (!normalized) continue;
    const candidate = `#${normalized.replace(/[^A-Za-z0-9_]/gu, "")}`;
    if (candidate.length <= 1 || seen.has(candidate.toLowerCase())) continue;
    seen.add(candidate.toLowerCase());
    hashtags.push(candidate);
    if (hashtags.length >= 3) break;
  }
  return hashtags;
}

function assertYoutubeLocaleMetadataOnly(metadata: EditableLocaleMetadata): void {
  const record = metadata as EditableLocaleMetadata & Record<string, unknown>;
  if ("caption" in record || "coverText" in record || "tiktokCaption" in record) {
    throw new Error("MICRODRAMA_YOUTUBE_METADATA_TIKTOK_REUSE_REJECTED");
  }
}

export interface PlanMicrodramaYoutubeLocaleMetadataRevisionInput {
  readonly seriesId: string;
  readonly locale: string;
  readonly episodeId: string;
  readonly episodeRevisionId: string;
  readonly metadata: EditableLocaleMetadata;
  readonly createdAt: string;
  readonly previousRevision?: MicrodramaYoutubeLocaleMetadataRevision;
}

/** Produces a provider-specific YouTube locale metadata revision; never reuses TikTok fields. */
export function planMicrodramaYoutubeLocaleMetadataRevision(
  input: PlanMicrodramaYoutubeLocaleMetadataRevisionInput,
): {
  readonly revision: MicrodramaYoutubeLocaleMetadataRevision;
  readonly reused: boolean;
} {
  const metadata = editableLocaleMetadataSchema.parse(input.metadata);
  assertYoutubeLocaleMetadataOnly(metadata);
  const copy = youtubeLocaleCopySchema.parse({
    title: metadata.title,
    description: metadata.description,
    tags: [...metadata.tags],
    hashtags: deriveYoutubeHashtags(metadata.tags),
  });
  const material = {
    schemaVersion: MICRODRAMA_YOUTUBE_LOCALE_METADATA_SCHEMA_VERSION,
    seriesId: input.seriesId,
    locale: input.locale,
    episodeId: input.episodeId,
    episodeRevisionId: input.episodeRevisionId,
    copy,
    createdAt: input.createdAt,
  };
  const artifactFingerprint = fingerprint(material);
  const reused = input.previousRevision?.fingerprint === artifactFingerprint;
  return {
    revision: microdramaYoutubeLocaleMetadataRevisionSchema.parse({
      ...material,
      metadataRevisionId: `youtube-metadata-${artifactFingerprint.slice(0, 16)}`,
      fingerprint: artifactFingerprint,
    }),
    reused,
  };
}

export interface ProjectMicrodramaYoutubeSeriesPlaylistsInput {
  readonly seriesId: string;
  readonly locale: string;
  readonly seriesPlaylistId: string;
  readonly episodePlaylistIds: readonly string[];
}

/** Maps a microdrama series/locale identity to canonical YouTube playlist targets. */
export function projectMicrodramaYoutubeSeriesPlaylists(
  input: ProjectMicrodramaYoutubeSeriesPlaylistsInput,
): MicrodramaYoutubeSeriesProjection {
  const episodePlaylistIds = [...new Set(input.episodePlaylistIds.map((id) => id.trim()))].sort();
  if (episodePlaylistIds.length === 0) {
    throw new Error("MICRODRAMA_YOUTUBE_PLAYLIST_REQUIRED");
  }
  const material = {
    schemaVersion: MICRODRAMA_YOUTUBE_SERIES_PROJECTION_SCHEMA_VERSION,
    seriesId: input.seriesId,
    locale: input.locale,
    seriesPlaylistId: input.seriesPlaylistId.trim(),
    episodePlaylistIds,
  };
  return microdramaYoutubeSeriesProjectionSchema.parse({
    ...material,
    fingerprint: fingerprint(material),
  });
}
