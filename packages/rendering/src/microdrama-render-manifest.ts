import { createHash } from "node:crypto";
import { z } from "zod";

import {
  episodeTimelineRevisionSchema,
  hashCanonicalDependency,
  type EpisodeTimelineRevision,
} from "@mediaforge/domain";

export const MICRODRAMA_RENDER_MANIFEST_SCHEMA_VERSION =
  "mediaforge.microdrama-render-manifest.v1" as const;

export const MICRODRAMA_RENDER_CACHE_IDENTITY_SCHEMA_VERSION =
  "mediaforge.microdrama-render-cache.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const microdramaRenderProfileSchema = z
  .object({
    width: z.literal(1080),
    height: z.literal(1920),
    frameRate: z.literal(30),
    videoCodec: z.literal("libx264"),
    audioCodec: z.literal("aac"),
    pixelFormat: z.literal("yuv420p"),
  })
  .strict();
export type MicrodramaRenderProfile = z.infer<typeof microdramaRenderProfileSchema>;

export const MICRODRAMA_DEFAULT_VERTICAL_PROFILE: MicrodramaRenderProfile = {
  width: 1080,
  height: 1920,
  frameRate: 30,
  videoCodec: "libx264",
  audioCodec: "aac",
  pixelFormat: "yuv420p",
};

export const microdramaRenderClipOperationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("cover"),
      assetPath: z.string().min(1),
      x: z.literal(0),
      y: z.literal(0),
      width: z.literal(1080),
      height: z.literal(1920),
    })
    .strict(),
  z
    .object({
      kind: z.literal("subtitle-burn"),
      subtitlePath: z.string().min(1),
    })
    .strict(),
]);
export type MicrodramaRenderClipOperation = z.infer<
  typeof microdramaRenderClipOperationSchema
>;

export const microdramaRenderClipSchema = z
  .object({
    clipId: z.string().min(1),
    shotSemanticId: z.string().min(1),
    sourcePlateSemanticId: z.string().min(1),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    operations: z.array(microdramaRenderClipOperationSchema).min(1),
  })
  .strict();
export type MicrodramaRenderClip = z.infer<typeof microdramaRenderClipSchema>;

export const microdramaRenderManifestSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_RENDER_MANIFEST_SCHEMA_VERSION),
    aspectRatio: z.literal("9:16"),
    profile: microdramaRenderProfileSchema,
    timelineRevisionId: z.string().min(1),
    locale: z.string().min(1),
    clips: z.array(microdramaRenderClipSchema).min(1),
    narrationAudioPath: z.string().min(1),
    subtitlePath: z.string().min(1).optional(),
    outputPath: z.string().min(1),
    contentHash: sha256Schema,
  })
  .strict();
export type MicrodramaRenderManifest = z.infer<typeof microdramaRenderManifestSchema>;

export const microdramaRenderCacheIdentitySchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_RENDER_CACHE_IDENTITY_SCHEMA_VERSION),
    cacheKey: sha256Schema,
    canonicalInput: z.string().min(1),
    dependencyIdentity: z.record(z.string().min(1), sha256Schema),
  })
  .strict();
export type MicrodramaRenderCacheIdentity = z.infer<
  typeof microdramaRenderCacheIdentitySchema
>;

function escapePath(filePath: string): string {
  return filePath.replace(/'/gu, "'\\''");
}

export function buildMicrodramaRenderManifestContentHash(
  manifest: Omit<MicrodramaRenderManifest, "contentHash">,
): string {
  return hashCanonicalDependency(manifest);
}

export function compileMicrodramaRenderManifest(input: {
  readonly timeline: EpisodeTimelineRevision;
  readonly narrationAudioPath: string;
  readonly subtitlePath?: string;
  readonly outputPath: string;
  readonly clipAssetPaths: Readonly<Record<string, string>>;
  readonly profile?: MicrodramaRenderProfile;
}): MicrodramaRenderManifest {
  const timeline = episodeTimelineRevisionSchema.parse(input.timeline);
  const profile = input.profile ?? MICRODRAMA_DEFAULT_VERTICAL_PROFILE;
  const clips = timeline.tracks.videoShots.map((shot) => {
    const assetPath = input.clipAssetPaths[shot.shotSemanticId];
    if (!assetPath) {
      throw new Error(`Missing clip asset path for ${shot.shotSemanticId}`);
    }
    const operations: MicrodramaRenderClipOperation[] = [
      {
        kind: "cover",
        assetPath,
        x: 0,
        y: 0,
        width: profile.width,
        height: profile.height,
      },
    ];
    return microdramaRenderClipSchema.parse({
      clipId: `clip.${shot.shotSemanticId}`,
      shotSemanticId: shot.shotSemanticId,
      sourcePlateSemanticId: shot.sourcePlateSemanticId,
      startSeconds: Number((shot.startMs / 1_000).toFixed(3)),
      endSeconds: Number((shot.endMs / 1_000).toFixed(3)),
      operations,
    });
  });

  const withoutHash = {
    schemaVersion: MICRODRAMA_RENDER_MANIFEST_SCHEMA_VERSION,
    aspectRatio: "9:16" as const,
    profile,
    timelineRevisionId: timeline.timelineRevisionId,
    locale: timeline.locale,
    clips,
    narrationAudioPath: input.narrationAudioPath,
    ...(input.subtitlePath ? { subtitlePath: input.subtitlePath } : {}),
    outputPath: input.outputPath,
  };
  const contentHash = buildMicrodramaRenderManifestContentHash(withoutHash);
  return microdramaRenderManifestSchema.parse({
    ...withoutHash,
    contentHash,
  });
}

export function compileMicrodramaRenderManifestToFfmpegArgs(
  manifest: MicrodramaRenderManifest,
): readonly (readonly string[])[] {
  const parsed = microdramaRenderManifestSchema.parse(manifest);
  const commands: string[][] = [];

  for (const clip of parsed.clips) {
    const cover = clip.operations.find((operation) => operation.kind === "cover");
    if (!cover || cover.kind !== "cover") {
      throw new Error(`Clip ${clip.clipId} is missing a cover operation.`);
    }
    const durationSeconds = Number((clip.endSeconds - clip.startSeconds).toFixed(3));
    const filters = [
      `[0:v]scale=${cover.width}:${cover.height}:force_original_aspect_ratio=increase,crop=${cover.width}:${cover.height},setsar=1,fps=${parsed.profile.frameRate}[vout]`,
    ];
    const args = [
      "-y",
      "-loop",
      "1",
      "-i",
      cover.assetPath,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[vout]",
      "-t",
      String(durationSeconds),
      "-c:v",
      parsed.profile.videoCodec,
      "-pix_fmt",
      parsed.profile.pixelFormat,
      parsed.outputPath.replace(/\.mp4$/u, `-${clip.clipId}.mp4`),
    ];
    commands.push(args);
  }

  const concatList = parsed.clips
    .map(
      (clip) =>
        `file '${escapePath(parsed.outputPath.replace(/\.mp4$/u, `-${clip.clipId}.mp4`))}'`,
    )
    .join("\n");
  const concatPath = parsed.outputPath.replace(/\.mp4$/u, ".concat.txt");
  commands.push([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-i",
    parsed.narrationAudioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    parsed.profile.videoCodec,
    "-c:a",
    parsed.profile.audioCodec,
    "-shortest",
    parsed.outputPath,
  ]);

  if (parsed.subtitlePath) {
    commands.push([
      "-y",
      "-i",
      parsed.outputPath,
      "-vf",
      `subtitles='${escapePath(parsed.subtitlePath)}'`,
      "-c:a",
      "copy",
      parsed.outputPath.replace(/\.mp4$/u, ".subtitled.mp4"),
    ]);
  }

  return commands;
}

export function validateCompiledMicrodramaFfmpegSafety(
  commands: readonly (readonly string[])[],
): void {
  for (const command of commands) {
    const joined = command.join(" ");
    if (/[;&|`$]/u.test(joined)) {
      throw new Error("Unsafe shell interpolation detected in FFmpeg args.");
    }
  }
}

export function buildMicrodramaRenderCacheIdentity(input: {
  readonly timelineFingerprint: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly renderProfileRevision: string;
  readonly locale: string;
}): MicrodramaRenderCacheIdentity {
  const dependencyIdentity = Object.fromEntries(
    Object.entries({
      timeline: input.timelineFingerprint,
      renderProfile: hashCanonicalDependency({
        revisionId: input.renderProfileRevision,
      }),
      ...input.dependencyIdentity,
    }).sort(([left], [right]) => left.localeCompare(right)),
  );
  const material = {
    schemaVersion: MICRODRAMA_RENDER_CACHE_IDENTITY_SCHEMA_VERSION,
    locale: input.locale,
    dependencyIdentity,
  };
  const canonicalInput = JSON.stringify(material);
  return microdramaRenderCacheIdentitySchema.parse({
    schemaVersion: MICRODRAMA_RENDER_CACHE_IDENTITY_SCHEMA_VERSION,
    canonicalInput,
    cacheKey: createHash("sha256").update(canonicalInput, "utf8").digest("hex"),
    dependencyIdentity,
  });
}
