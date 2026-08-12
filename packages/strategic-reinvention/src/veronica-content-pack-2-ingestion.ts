import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { episodeIdSchema, episodeManifestSchema, supportedLanguageCodeSchema } from "@mediaforge/domain";
import { ensurePortableRelativePath, fileExists, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { z } from "zod";

export const VERONICA_CONTENT_PACK_2_ADAPTER_VERSION =
  "veronica-content-pack-2-adapter.v1" as const;
export const CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION =
  "veronica-canonical-source-episode.v1" as const;
export const CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION =
  "veronica-canonical-source-planner-input.v1" as const;
export const CANONICAL_VISUAL_PLANNING_CONFIGURATION_VERSION =
  "veronica-canonical-visual-planning-configuration.v1" as const;

const packManifestSchema = z
  .object({
    packId: z.literal("veronica-content-pack-2"),
    languages: z.array(supportedLanguageCodeSchema).min(1),
  })
  .passthrough();

const canonicalSourceDocumentSchema = z
  .object({
    locale: supportedLanguageCodeSchema,
    sourcePath: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    narration: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, "Narration must contain text."),
  })
  .strict();

export const canonicalSourceEpisodeSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION),
    ingestionAdapterVersion: z.string().min(1),
    sourcePackId: z.string().min(1),
    episodeId: episodeIdSchema,
    authoredEpisodeKey: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    canonicalSlug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    title: z.string().min(1).optional(),
    contentProfileId: z.literal("veronicabenini"),
    format: z.enum(["short", "long"]),
    localeSources: z.array(canonicalSourceDocumentSchema).min(1),
    sourceRevisionHash: z.string().regex(/^[a-f0-9]{64}$/u),
    declaredReusableAssets: z.array(z.never()),
    sourceGrounding: z
      .object({
        storyId: z.string().min(1),
        sourceIds: z.array(z.string().min(1)).min(1),
        sourceQualities: z.record(z.string(), z.enum(["clean", "noisy", "review"])),
        timingPass: z.boolean(),
        originalityPass: z.boolean(),
        plainNarrationOnly: z.boolean(),
        qaPass: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const locales = new Set<string>();
    for (const [index, source] of value.localeSources.entries()) {
      if (locales.has(source.locale)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["localeSources", index, "locale"],
          message: `Duplicate locale source: ${source.locale}`,
        });
      }
      locales.add(source.locale);
    }
  });

export type CanonicalSourceEpisode = z.infer<
  typeof canonicalSourceEpisodeSchema
>;

export const canonicalSourcePlannerInputSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION),
    sourceEpisode: canonicalSourceEpisodeSchema,
    locale: supportedLanguageCodeSchema,
    narration: canonicalSourceDocumentSchema,
    planningConfiguration: z
      .object({
        schemaVersion: z.literal(CANONICAL_VISUAL_PLANNING_CONFIGURATION_VERSION),
        targetWordsPerMinute: z.number().finite().positive(),
        imageProviderModel: z.string().min(1),
        rendererVersion: z.string().min(1),
      })
      .strict(),
    declaredReusableAssets: z.array(z.never()),
    visualPlanOverride: z.null(),
  })
  .strict();

export type CanonicalSourcePlannerInput = z.infer<
  typeof canonicalSourcePlannerInputSchema
>;

const DEFAULT_CANONICAL_VISUAL_PLANNING_CONFIGURATION = {
  schemaVersion: CANONICAL_VISUAL_PLANNING_CONFIGURATION_VERSION,
  targetWordsPerMinute: 155,
  imageProviderModel: "provider-unbound:text-free-canonical-v1",
  rendererVersion: "ffmpeg-event-compiler.v1",
} as const;

export interface PrepareCanonicalSourceEpisodeWorkspaceInput {
  readonly workspaceRoot: string;
  readonly sourceEpisode: CanonicalSourceEpisode;
  readonly locale: z.infer<typeof supportedLanguageCodeSchema>;
}

export interface PrepareCanonicalSourceEpisodeWorkspaceResult {
  readonly episodeId: string;
  readonly episodeDir: string;
  readonly sourceDescriptorPath: string;
  readonly plannerInputPath: string;
  readonly scriptPath: string;
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function sourceRevisionHash(
  authoredEpisodeKey: string,
  sources: readonly z.infer<typeof canonicalSourceDocumentSchema>[],
): string {
  return sha256(
    JSON.stringify({
      authoredEpisodeKey,
      sources: sources.map((source) => ({
        locale: source.locale,
        sourcePath: source.sourcePath,
        sourceSha256: source.sourceSha256,
      })),
    }),
  );
}

function parseAuthoredEpisodeKey(fileName: string): string {
  if (!fileName.endsWith(".md")) {
    throw new Error(`Unsupported Veronica Pack 2 source file: ${fileName}`);
  }
  return episodeIdSchema.parse(fileName.slice(0, -3));
}

async function directoryEntries(directory: string): Promise<readonly Dirent[]> {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Veronica Pack 2 source layout is missing ${directory}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Discovers Pack 2 authored Shorts without importing legacy positioning-plan
 * metadata. The return value deliberately contains no authored visual plan or
 * declared reusable assets because that pack does not provide either.
 */
export async function discoverVeronicaContentPack2Shorts(input: {
  readonly packDir: string;
}): Promise<readonly CanonicalSourceEpisode[]> {
  const packDir = path.resolve(input.packDir);
  const manifestPath = path.join(packDir, "content-pack.json");
  const manifest = packManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
  );
  const shortsRoot = path.join(packDir, "shorts");
  const localeDirectories = (await directoryEntries(shortsRoot))
    .filter((entry) => entry.isDirectory())
    .map((entry) => supportedLanguageCodeSchema.parse(entry.name))
    .sort();
  const declaredLocales = new Set(manifest.languages);
  for (const locale of localeDirectories) {
    if (!declaredLocales.has(locale)) {
      throw new Error(`Veronica Pack 2 Shorts locale is not declared by content-pack.json: ${locale}`);
    }
  }
  const grouped = new Map<string, z.infer<typeof canonicalSourceDocumentSchema>[]>();
  for (const locale of localeDirectories) {
    const localeRoot = path.join(shortsRoot, locale);
    const files = (await directoryEntries(localeRoot))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    for (const fileName of files) {
      const authoredEpisodeKey = parseAuthoredEpisodeKey(fileName);
      const absolutePath = path.join(localeRoot, fileName);
      const bytes = await fs.readFile(absolutePath);
      const narration = bytes.toString("utf8");
      const sourcePath = ensurePortableRelativePath(
        path.posix.join("shorts", locale, fileName),
      );
      const source = canonicalSourceDocumentSchema.parse({
        locale,
        sourcePath,
        sourceSha256: sha256(bytes),
        narration,
      });
      const current = grouped.get(authoredEpisodeKey) ?? [];
      current.push(source);
      grouped.set(authoredEpisodeKey, current);
    }
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([authoredEpisodeKey, localeSources]) => {
      const orderedSources = [...localeSources].sort((left, right) =>
        left.locale.localeCompare(right.locale),
      );
      return canonicalSourceEpisodeSchema.parse({
        schemaVersion: CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION,
        ingestionAdapterVersion: VERONICA_CONTENT_PACK_2_ADAPTER_VERSION,
        sourcePackId: manifest.packId,
        episodeId: authoredEpisodeKey,
        authoredEpisodeKey,
        canonicalSlug: authoredEpisodeKey,
        contentProfileId: "veronicabenini",
        format: "short",
        localeSources: orderedSources,
        sourceRevisionHash: sourceRevisionHash(authoredEpisodeKey, orderedSources),
        declaredReusableAssets: [],
      });
    });
}

export function canonicalSourceEpisodePlannerInput(input: {
  readonly sourceEpisode: CanonicalSourceEpisode;
  readonly locale: z.infer<typeof supportedLanguageCodeSchema>;
}): CanonicalSourcePlannerInput {
  const narration = input.sourceEpisode.localeSources.find(
    (source) => source.locale === input.locale,
  );
  if (!narration) {
    throw new Error(
      `Canonical source episode ${input.sourceEpisode.episodeId} has no ${input.locale} narration.`,
    );
  }
  return canonicalSourcePlannerInputSchema.parse({
    schemaVersion: CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION,
    sourceEpisode: input.sourceEpisode,
    locale: input.locale,
    narration,
    planningConfiguration: DEFAULT_CANONICAL_VISUAL_PLANNING_CONFIGURATION,
    declaredReusableAssets: [],
    visualPlanOverride: null,
  });
}

/**
 * Materializes the current pipeline's canonical script location from the
 * authoritative external source and records the external provenance beside it.
 * This is preparation only: it never enters speech, planning, QA, or media.
 */
export async function prepareCanonicalSourceEpisodeWorkspace(
  input: PrepareCanonicalSourceEpisodeWorkspaceInput,
): Promise<PrepareCanonicalSourceEpisodeWorkspaceResult> {
  const sourceEpisode = canonicalSourceEpisodeSchema.parse(input.sourceEpisode);
  const plannerInput = canonicalSourceEpisodePlannerInput({
    sourceEpisode,
    locale: input.locale,
  });
  const episodeDir = path.join(path.resolve(input.workspaceRoot), sourceEpisode.episodeId);
  const sourceDescriptorPath = path.join(
    episodeDir,
    "source",
    "canonical-source-episode.v1.json",
  );
  const plannerInputPath = path.join(
    episodeDir,
    "source",
    "visual-planner-input.v1.json",
  );
  const scriptPath = path.join(
    episodeDir,
    ...(sourceEpisode.format === "short" ? ["languages", "short"] : ["languages"]),
    `script-${input.locale}.md`,
  );
  const now = new Date().toISOString();
  const manifestPath = path.join(episodeDir, "manifest.json");
  const existing = (await fileExists(manifestPath))
    ? episodeManifestSchema.parse(
        JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
      )
    : null;
  const manifest = episodeManifestSchema.parse({
    ...(existing ?? {
      episodeId: sourceEpisode.episodeId,
      slug: sourceEpisode.canonicalSlug,
      source: { platform: "local-file", filePath: scriptPath },
      images: [],
      artifacts: [],
      pipelineRuns: [],
      createdAt: now,
    }),
    sourceMetadata: {
      ...(existing?.sourceMetadata && typeof existing.sourceMetadata === "object"
        ? existing.sourceMetadata
        : {}),
      genre: "veronicabenini",
      creatorProfileId: "veronica-benini",
      sourcePackId: sourceEpisode.sourcePackId,
      authoredEpisodeKey: sourceEpisode.authoredEpisodeKey,
      contentId: sourceEpisode.episodeId,
      locale: input.locale,
      variant: sourceEpisode.format,
      canonicalSourceDescriptorPath: "source/canonical-source-episode.v1.json",
      canonicalSourceRevisionHash: sourceEpisode.sourceRevisionHash,
      ...(sourceEpisode.sourceGrounding
        ? { sourceGrounding: sourceEpisode.sourceGrounding }
        : {}),
      authoritativeSource: {
        path: plannerInput.narration.sourcePath,
        sha256: plannerInput.narration.sourceSha256,
        locale: plannerInput.narration.locale,
        adapterVersion: sourceEpisode.ingestionAdapterVersion,
      },
    },
    updatedAt: now,
  });
  await Promise.all([
    writeJsonAtomic(sourceDescriptorPath, sourceEpisode),
    writeJsonAtomic(plannerInputPath, plannerInput),
    writeTextAtomic(scriptPath, plannerInput.narration.narration),
    writeJsonAtomic(manifestPath, manifest),
  ]);
  return {
    episodeId: sourceEpisode.episodeId,
    episodeDir,
    sourceDescriptorPath,
    plannerInputPath,
    scriptPath,
  };
}
