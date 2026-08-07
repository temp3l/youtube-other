import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  multilingualPackageIdentitySchema,
  STRATEGIC_REINVENTION_SCHEMA_VERSION,
  type ContentLocale,
} from "@mediaforge/domain";
import {
  createEpisodePathResolver,
  hashFile,
  normalizeEpisodeId,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import {
  assessMultilingualAudioCapability,
  type MultilingualAudioCapabilityReport,
} from "@mediaforge/youtube-upload/multilingual-audio-capability";

const artifactBindingSchema = z
  .object({
    kind: z.string().min(1),
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    revision: z.string().min(1),
  })
  .strict();

export const strategicMultilingualPackageSchema = z
  .object({
    schemaVersion: z.literal("strategic-reinvention.multilingual-package.v1"),
    identity: multilingualPackageIdentitySchema,
    masterVideo: artifactBindingSchema,
    canonicalAudio: artifactBindingSchema,
    localizedAudio: z.array(
      z
        .object({
          locale: z.string().min(2),
          path: z.string().min(1),
          sha256: z.string().regex(/^[a-f0-9]{64}$/u),
          revision: z.string().min(1),
        })
        .strict(),
    ),
    subtitles: z.array(artifactBindingSchema),
    metadata: artifactBindingSchema,
    thumbnailText: z
      .object({
        path: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
    cta: z
      .object({
        campaignId: z.string().min(1),
        destination: z.string().min(1),
        localizedDestinations: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
    audioTrackManifest: artifactBindingSchema,
    capabilityReport: z.custom<MultilingualAudioCapabilityReport>(),
    autoPublish: z.literal(false),
    notifySubscribers: z.literal(false),
    packageHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export type StrategicMultilingualPackage = z.infer<
  typeof strategicMultilingualPackageSchema
>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return JSON.stringify(Number.isFinite(value) ? value : null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported package value.");
}

async function bindArtifact(
  kind: string,
  filePath: string,
  revision: string,
): Promise<z.infer<typeof artifactBindingSchema>> {
  return artifactBindingSchema.parse({
    kind,
    path: filePath,
    sha256: await hashFile(filePath),
    revision,
  });
}

export interface BuildStrategicMultilingualPackageInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly locale: ContentLocale;
  readonly variant: "full" | "short";
  readonly canonicalLocale?: ContentLocale;
  readonly localizedLocales?: readonly ContentLocale[];
  readonly cta: {
    readonly campaignId: string;
    readonly destination: string;
    readonly localizedDestinations?: Readonly<Record<string, string>>;
  };
}

export async function buildStrategicMultilingualPackage(
  input: BuildStrategicMultilingualPackageInput,
): Promise<StrategicMultilingualPackage> {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const canonicalLocale = input.canonicalLocale ?? "it";
  const resolver = createEpisodePathResolver(input.workspaceRoot);
  const context = {
    episodeId,
    locale: input.locale,
    variant: input.variant,
  };
  const renderDir =
    input.variant === "short"
      ? resolver.renderDir(context, "vertical")
      : resolver.renderDir(context, "youtube");
  const masterVideoPath = path.join(
    renderDir,
    input.variant === "short" ? "youtube-9x16-clean-it.mp4" : "youtube-16x9-clean-it.mp4",
  );
  const canonicalAudioPath = path.join(resolver.audioDir(context), "narration.wav");
  const metadataPath = path.join(resolver.metadataDir(context), "youtube.json");
  const subtitlePath = resolver.captionsFile(context, "srt");
  const thumbnailTextPath = path.join(resolver.metadataDir(context), "thumbnail-text.json");
  const audioTrackManifestPath = resolver.audioTrackManifest(context);

  await fs.mkdir(path.dirname(masterVideoPath), { recursive: true });
  await fs.mkdir(path.dirname(canonicalAudioPath), { recursive: true });
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.mkdir(path.dirname(subtitlePath), { recursive: true });
  await fs.mkdir(path.dirname(thumbnailTextPath), { recursive: true });
  await fs.mkdir(path.dirname(audioTrackManifestPath), { recursive: true });

  const placeholder = (label: string) =>
    Buffer.from(`strategic-fixture:${label}:${episodeId}`, "utf8");
  await Promise.all([
    fs.writeFile(masterVideoPath, placeholder("video")),
    fs.writeFile(canonicalAudioPath, placeholder("audio")),
    fs.writeFile(
      metadataPath,
      `${JSON.stringify({ title: "Fixture", description: "Dry-run metadata" }, null, 2)}\n`,
    ),
    fs.writeFile(subtitlePath, "1\n00:00:00,000 --> 00:00:02,000\nFixture caption\n"),
    fs.writeFile(
      thumbnailTextPath,
      `${JSON.stringify({ recommendedText: "Fixture thumbnail" }, null, 2)}\n`,
    ),
    fs.writeFile(
      audioTrackManifestPath,
      `${JSON.stringify({ tracks: [{ locale: canonicalLocale, role: "primary" }] }, null, 2)}\n`,
    ),
  ]);

  const localizedLocales = input.localizedLocales ?? ["en", "es"];
  const localizedAudio = await Promise.all(
    localizedLocales.map(async (locale) => {
      const localizedContext = { ...context, locale };
      const localizedPath = path.join(resolver.audioDir(localizedContext), "narration.wav");
      await fs.mkdir(path.dirname(localizedPath), { recursive: true });
      await fs.writeFile(localizedPath, placeholder(`audio-${locale}`));
      return {
        locale,
        path: localizedPath,
        sha256: await hashFile(localizedPath),
        revision: `audio-${locale}-r1`,
      };
    }),
  );

  const capabilityReport = assessMultilingualAudioCapability({
    preferredModel: "single-video-with-reviewed-audio-tracks",
  });
  const identity = multilingualPackageIdentitySchema.parse({
    schemaVersion: STRATEGIC_REINVENTION_SCHEMA_VERSION,
    episodeId,
    canonicalLocale,
    locale: input.locale,
    variant: input.variant,
    packageHash: "0".repeat(64),
  });
  const withoutHash = {
    schemaVersion: "strategic-reinvention.multilingual-package.v1" as const,
    identity,
    masterVideo: await bindArtifact("render", masterVideoPath, "render-r1"),
    canonicalAudio: await bindArtifact("audio", canonicalAudioPath, "audio-it-r1"),
    localizedAudio,
    subtitles: [await bindArtifact("subtitles", subtitlePath, "captions-r1")],
    metadata: await bindArtifact("metadata", metadataPath, "metadata-r1"),
    thumbnailText: {
      path: thumbnailTextPath,
      sha256: await hashFile(thumbnailTextPath),
    },
    cta: input.cta,
    audioTrackManifest: await bindArtifact(
      "audio-track-manifest",
      audioTrackManifestPath,
      "audio-track-manifest-r1",
    ),
    capabilityReport,
    autoPublish: false as const,
    notifySubscribers: false as const,
    packageHash: "0".repeat(64),
  };
  const packageHash = createHash("sha256")
    .update(canonicalJson(withoutHash))
    .digest("hex");
  const value = strategicMultilingualPackageSchema.parse({
    ...withoutHash,
    identity: { ...identity, packageHash },
    packageHash,
  });
  const packagePath = resolver.multilingualPackage(context);
  await fs.mkdir(path.dirname(packagePath), { recursive: true });
  await writeJsonAtomic(packagePath, value);
  return value;
}
