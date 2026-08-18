import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  SUPPORTED_LANGUAGE_CODES,
  VERONICA_CANONICAL_CONTENT_PACK_ID,
  VERONICA_CANONICAL_CONTENT_ROOT,
  VERONICA_CANONICAL_LOCALE,
  VERONICA_CANONICAL_MANIFEST,
  VERONICA_CANONICAL_SERIES_PLAN,
  VERONICA_PLANNING_TIMING_POLICY,
  supportedLanguageCodeSchema,
  type SupportedLanguageCode,
  type VeronicaContentKind,
  type VeronicaContentReadiness,
} from "@mediaforge/domain";
import {
  assertContainedRegularFile,
  ensurePortableRelativePath,
} from "@mediaforge/shared";
import { z } from "zod";
import {
  CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION,
  canonicalSourceEpisodeSchema,
  type CanonicalSourceEpisode,
} from "./veronica-content-pack-2-ingestion.js";

export const VERONICA_UNIFIED_CONTENT_ADAPTER_VERSION =
  "veronica-unified-content-pack-adapter.v1" as const;

export const VERONICA_CONTENT_SOURCE_CONFIG = Object.freeze({
  canonicalPackId: VERONICA_CANONICAL_CONTENT_PACK_ID,
  rootDir: VERONICA_CANONICAL_CONTENT_ROOT,
  manifestPath: VERONICA_CANONICAL_MANIFEST,
  seriesPlanPath: VERONICA_CANONICAL_SERIES_PLAN,
  allowLegacyFallback: false,
} as const);

export type VeronicaContentSourceErrorCode =
  | "VERONICA_CANONICAL_PACK_NOT_FOUND"
  | "VERONICA_CANONICAL_MANIFEST_INVALID"
  | "VERONICA_LEGACY_PACK_FORBIDDEN"
  | "VERONICA_LOCALE_UNAVAILABLE";

export class VeronicaContentSourceError extends Error {
  constructor(
    readonly code: VeronicaContentSourceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${code}:${message}`, options);
    this.name = "VeronicaContentSourceError";
  }
}

const storyIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);
const safeRelativePathSchema = z.string().min(1).superRefine((value, context) => {
  try {
    ensurePortableRelativePath(value);
  } catch {
    context.addIssue({ code: "custom", message: "Path must be a contained portable relative path." });
  }
});
const uniqueLocalesSchema = z.array(supportedLanguageCodeSchema).min(1).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", message: "Locale list contains duplicates." });
  }
});
const localeNumberMapSchema = z.object({
  en: z.number().positive(), de: z.number().positive(), es: z.number().positive(),
  fr: z.number().positive(), it: z.number().positive(), pt: z.number().positive(),
}).strict();
const wordBandSchema = z.tuple([z.number().int().nonnegative(), z.number().int().positive()]);
const localeWordBandsSchema = z.object({
  en: wordBandSchema, de: wordBandSchema, es: wordBandSchema,
  fr: wordBandSchema, it: wordBandSchema, pt: wordBandSchema,
}).strict();
const englishShortWordPolicySchema = z.object({
  preferred: wordBandSchema,
  actionableWarning: wordBandSchema,
  hardMinimum: z.number().int().nonnegative(),
  hardMaximum: z.number().int().positive(),
}).strict();

export const veronicaUnifiedPackManifestSchema = z.object({
  packId: z.literal(VERONICA_CANONICAL_CONTENT_PACK_ID),
  generatedAt: z.string().min(1),
  canonicalLocale: z.literal(VERONICA_CANONICAL_LOCALE),
  timingPolicy: z.object({
    shortTargetSeconds: z.number().positive(),
    longTargetSeconds: z.number().positive(),
    shortWpm: localeNumberMapSchema,
    longWpm: localeNumberMapSchema,
    shortPlanningWordBands: localeWordBandsSchema,
    englishShortWordPolicy: englishShortWordPolicySchema,
    longPublicSeconds: z.tuple([z.number().positive(), z.number().positive()]),
    selectedAudioBecomesCanonicalAfterTTS: z.boolean(),
  }).strict(),
  counts: z.object({
    logicalLongs: z.literal(18), logicalShorts: z.literal(36), logicalTotal: z.literal(54),
    narrationFiles: z.number().int().positive(),
    locales: uniqueLocalesSchema,
  }).strict(),
  allPreTtsTimingPass: z.boolean(),
  stories: z.array(z.object({
    id: storyIdSchema,
    format: z.enum(["long", "short"]),
    series: z.string().min(1),
    locales: uniqueLocalesSchema,
    paths: z.partialRecord(supportedLanguageCodeSchema, safeRelativePathSchema),
    timingPass: z.boolean(),
    canonicalTimingPass: z.boolean(),
    timingFailureLocales: z.array(supportedLanguageCodeSchema),
  }).strict()).length(54),
  canonicalEnglishPreTtsTimingPass: z.literal(true),
  timingValidation: z.object({
    narrationFilesChecked: z.number().int().positive(), failures: z.number().int().nonnegative(),
    failureLocales: z.array(supportedLanguageCodeSchema), report: safeRelativePathSchema,
  }).strict(),
  publicationReadiness: z.object({
    canonicalEnglishStoriesAbove9_5: z.literal(54), canonicalEnglishStoriesTotal: z.literal(54),
    seriesEpisodes: z.literal(18), shortsPerEpisode: z.literal(2),
    canonicalEnglishEditorialReady: z.literal(true), multilingualSynchronized: z.literal(false),
  }).strict(),
  seriesArchitecture: z.object({
    episodes: z.literal(18), assetsPerEpisode: z.literal(3), longsPerEpisode: z.literal(1),
    shortsPerEpisode: z.literal(2), plan: safeRelativePathSchema,
    releaseOrderAuthoritative: z.literal(true),
  }).strict(),
}).strict();

export const veronicaSeriesEpisodeSchema = z.object({
  episode: z.number().int().min(1).max(18), phase: z.string().min(1),
  long_id: storyIdSchema, long_title: z.string().min(1), long_score: z.string().min(1),
  short_a_id: storyIdSchema, short_a_title: z.string().min(1), short_a_score: z.string().min(1),
  short_b_id: storyIdSchema, short_b_title: z.string().min(1), short_b_score: z.string().min(1),
  editorial_rationale: z.string().min(1),
}).strict();
export const veronicaSeriesPlanSchema = z.array(veronicaSeriesEpisodeSchema).length(18);

type ParsedManifest = z.infer<typeof veronicaUnifiedPackManifestSchema>;
type ParsedSeriesPlan = z.infer<typeof veronicaSeriesPlanSchema>;

export interface VeronicaParsedPackDocuments {
  readonly manifest: ParsedManifest;
  readonly seriesPlan: ParsedSeriesPlan;
}

function equalJson(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([leftKey], [rightKey]) =>
        leftKey.localeCompare(rightKey),
      ).map(([key, entry]) => [key, normalize(entry)]));
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function parseVeronicaCanonicalPackDocuments(input: {
  readonly manifest: unknown;
  readonly seriesPlan: unknown;
}): VeronicaParsedPackDocuments {
  const manifest = veronicaUnifiedPackManifestSchema.parse(input.manifest);
  const seriesPlan = veronicaSeriesPlanSchema.parse(input.seriesPlan);
  const expected = VERONICA_PLANNING_TIMING_POLICY;
  if (
    manifest.timingPolicy.shortTargetSeconds !== expected.short.nominalSeconds ||
    manifest.timingPolicy.longTargetSeconds !== expected.long.nominalSeconds ||
    !equalJson(manifest.timingPolicy.shortWpm, expected.short.wpm) ||
    !equalJson(manifest.timingPolicy.longWpm, expected.long.wpm) ||
    !equalJson(manifest.timingPolicy.shortPlanningWordBands, expected.short.planningWords) ||
    !equalJson(manifest.timingPolicy.englishShortWordPolicy, expected.short.englishWordPolicy) ||
    !equalJson(manifest.timingPolicy.longPublicSeconds, expected.long.planningSeconds)
  ) {
    throw new VeronicaContentSourceError(
      "VERONICA_CANONICAL_MANIFEST_INVALID",
      "timing policy does not match the typed Veronica policy",
    );
  }
  const storyIds = manifest.stories.map((story) => story.id);
  if (new Set(storyIds).size !== storyIds.length) {
    throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", "duplicate story ID");
  }
  const assigned = seriesPlan.flatMap((episode) => [episode.long_id, episode.short_a_id, episode.short_b_id]);
  if (new Set(assigned).size !== assigned.length) {
    throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", "duplicate episode assignment");
  }
  if (seriesPlan.some((episode, index) => episode.episode !== index + 1)) {
    throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", "episode order must be 1 through 18");
  }
  const storyById = new Map(manifest.stories.map((story) => [story.id, story]));
  for (const episode of seriesPlan) {
    if (storyById.get(episode.long_id)?.format !== "long") {
      throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `episode ${episode.episode} long slot is invalid`);
    }
    for (const shortId of [episode.short_a_id, episode.short_b_id]) {
      if (storyById.get(shortId)?.format !== "short") {
        throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `episode ${episode.episode} short slot is invalid`);
      }
    }
  }
  const orphanIds = storyIds.filter((storyId) => !assigned.includes(storyId));
  if (orphanIds.length > 0 || assigned.some((storyId) => !storyById.has(storyId))) {
    throw new VeronicaContentSourceError(
      "VERONICA_CANONICAL_MANIFEST_INVALID",
      `episode coverage mismatch; orphans=${orphanIds.join(",") || "none"}`,
    );
  }
  for (const story of manifest.stories) {
    if (!story.locales.includes("en") || !story.paths.en) {
      throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `${story.id} has no canonical English narration`);
    }
    if (
      story.locales.some((locale) => story.paths[locale] === undefined) ||
      Object.keys(story.paths).some((locale) => !story.locales.includes(locale as SupportedLanguageCode))
    ) {
      throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `${story.id} locale/path declarations differ`);
    }
  }
  return { manifest, seriesPlan };
}

export function normalizeVeronicaNarration(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/gu, ""))
    .join("\n")
    .trim()
    .concat("\n");
}

export function hashVeronicaNarration(value: string): string {
  return createHash("sha256").update(normalizeVeronicaNarration(value), "utf8").digest("hex");
}

export function countVeronicaSpokenWords(value: string): number {
  const normalized = normalizeVeronicaNarration(value).trim();
  return normalized.length === 0 ? 0 : normalized.split(/\s+/u).length;
}

export function estimateVeronicaPlanningDurationSeconds(input: {
  readonly narration: string;
  readonly kind: VeronicaContentKind;
  readonly locale: SupportedLanguageCode;
}): number {
  const wpm = VERONICA_PLANNING_TIMING_POLICY[input.kind].wpm[input.locale];
  return (countVeronicaSpokenWords(input.narration) / wpm) * 60;
}

export interface VeronicaLocaleVariant {
  readonly locale: SupportedLanguageCode;
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly sourceSha256: string;
  readonly contentHash: string;
  readonly wordCount: number;
  readonly estimatedDurationSeconds: number;
  readonly timingPass: boolean;
  readonly timingStatus: VeronicaShortTimingStatus;
  readonly readiness: VeronicaContentReadiness;
  readonly narration: string;
}

export interface VeronicaCanonicalStoryRecord {
  readonly storyId: string;
  readonly seriesEpisodeId: string;
  readonly seriesEpisodeOrder: number;
  readonly seriesSlot: "long" | "short-a" | "short-b";
  readonly kind: VeronicaContentKind;
  readonly canonicalLocale: "en";
  readonly title: string;
  readonly canonicalNarrationPath: string;
  readonly contentHash: string;
  readonly localeVariants: ReadonlyMap<SupportedLanguageCode, VeronicaLocaleVariant>;
  readonly readiness: VeronicaContentReadiness;
  readonly relatedStoryIds: readonly [string, string];
  readonly provenance: {
    readonly contentPackId: typeof VERONICA_CANONICAL_CONTENT_PACK_ID;
    readonly manifestPath: string;
    readonly seriesPlanPath: string;
    readonly sourceSeries: string;
  };
}

export interface VeronicaCanonicalEpisodeRecord {
  readonly episodeId: string;
  readonly order: number;
  readonly phase: string;
  readonly long: VeronicaCanonicalStoryRecord;
  readonly shorts: readonly [VeronicaCanonicalStoryRecord, VeronicaCanonicalStoryRecord];
}

export interface VeronicaContentRegistry {
  readonly contentPackId: typeof VERONICA_CANONICAL_CONTENT_PACK_ID;
  readonly packRoot: string;
  readonly manifestPath: string;
  readonly seriesPlanPath: string;
  readonly stories: readonly VeronicaCanonicalStoryRecord[];
  readonly episodes: readonly VeronicaCanonicalEpisodeRecord[];
  readonly storyById: ReadonlyMap<string, VeronicaCanonicalStoryRecord>;
  readonly episodeByOrder: ReadonlyMap<number, VeronicaCanonicalEpisodeRecord>;
}

export interface VeronicaContentSource {
  readonly config: typeof VERONICA_CONTENT_SOURCE_CONFIG;
  readonly repositoryRoot: string;
  readonly packRoot: string;
  readonly manifestPath: string;
  readonly seriesPlanPath: string;
  readonly registry: VeronicaContentRegistry;
}

async function repositoryRootFrom(start: string): Promise<string> {
  let current = path.resolve(start);
  while (true) {
    try {
      const [packageStat, workspaceStat] = await Promise.all([
        fs.stat(path.join(current, "package.json")),
        fs.stat(path.join(current, "pnpm-workspace.yaml")),
      ]);
      if (packageStat.isFile() && workspaceStat.isFile()) return current;
    } catch {
      // Continue upward; no broad filesystem discovery is used.
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new VeronicaContentSourceError("VERONICA_CANONICAL_PACK_NOT_FOUND", `repository root not found from ${start}`);
    }
    current = parent;
  }
}

export type VeronicaShortTimingStatus = "preferred" | "warning" | "blocked";

export function assessVeronicaShortTiming(input: {
  readonly locale: SupportedLanguageCode;
  readonly wordCount: number;
}): VeronicaShortTimingStatus {
  const [preferredMinimum, preferredMaximum] =
    VERONICA_PLANNING_TIMING_POLICY.short.englishWordPolicy.preferred;
  const [warningMinimum, warningMaximum] =
    VERONICA_PLANNING_TIMING_POLICY.short.englishWordPolicy.actionableWarning;
  if (input.locale !== "en") {
    const [minimum, maximum] = VERONICA_PLANNING_TIMING_POLICY.short.planningWords[input.locale];
    return input.wordCount >= minimum && input.wordCount <= maximum ? "preferred" : "blocked";
  }
  if (input.wordCount >= preferredMinimum && input.wordCount <= preferredMaximum) return "preferred";
  if (input.wordCount >= warningMinimum && input.wordCount <= warningMaximum) return "warning";
  return "blocked";
}

function timingPass(kind: VeronicaContentKind, locale: SupportedLanguageCode, wordCount: number): boolean {
  if (kind === "short") {
    return assessVeronicaShortTiming({ locale, wordCount }) !== "blocked";
  }
  const seconds = (wordCount / VERONICA_PLANNING_TIMING_POLICY.long.wpm[locale]) * 60;
  const [minimum, maximum] = VERONICA_PLANNING_TIMING_POLICY.long.planningSeconds;
  return seconds >= minimum && seconds <= maximum;
}

function localizedReadiness(input: {
  readonly locale: SupportedLanguageCode;
  readonly timingPass: boolean;
}): VeronicaContentReadiness {
  if (input.locale === "en") return "CANONICAL_READY";
  if (!input.timingPass) return "TIMING_REVIEW_REQUIRED";
  return "LOCALIZATION_REVIEW_REQUIRED";
}

async function buildRegistry(input: {
  readonly packRoot: string;
  readonly manifestPath: string;
  readonly seriesPlanPath: string;
  readonly documents: VeronicaParsedPackDocuments;
}): Promise<VeronicaContentRegistry> {
  const slotByStory = new Map<string, { episode: ParsedSeriesPlan[number]; slot: "long" | "short-a" | "short-b"; title: string }>();
  for (const episode of input.documents.seriesPlan) {
    slotByStory.set(episode.long_id, { episode, slot: "long", title: episode.long_title });
    slotByStory.set(episode.short_a_id, { episode, slot: "short-a", title: episode.short_a_title });
    slotByStory.set(episode.short_b_id, { episode, slot: "short-b", title: episode.short_b_title });
  }
  const canonicalPaths = new Set<string>();
  const stories: VeronicaCanonicalStoryRecord[] = [];
  for (const story of input.documents.manifest.stories) {
    const assignment = slotByStory.get(story.id);
    if (!assignment) throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `${story.id} is orphaned`);
    const localeVariants = new Map<SupportedLanguageCode, VeronicaLocaleVariant>();
    for (const locale of [...story.locales].sort()) {
      const relativePath = story.paths[locale];
      if (!relativePath) throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `${story.id}/${locale} path is missing`);
      const absolutePath = path.resolve(input.packRoot, relativePath);
      await assertContainedRegularFile(input.packRoot, absolutePath);
      const bytes = await fs.readFile(absolutePath);
      const narration = bytes.toString("utf8");
      const wordCount = countVeronicaSpokenWords(narration);
      const passes = timingPass(story.format, locale, wordCount);
      if (passes === story.timingFailureLocales.includes(locale)) {
        throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `${story.id}/${locale} timing declaration does not match narration`);
      }
      localeVariants.set(locale, {
        locale,
        relativePath,
        absolutePath,
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        contentHash: hashVeronicaNarration(narration),
        wordCount,
        estimatedDurationSeconds: estimateVeronicaPlanningDurationSeconds({ narration, kind: story.format, locale }),
        timingPass: passes,
        timingStatus: story.format === "short"
          ? assessVeronicaShortTiming({ locale, wordCount })
          : passes ? "preferred" : "blocked",
        readiness: localizedReadiness({ locale, timingPass: passes }),
        narration,
      });
    }
    const canonical = localeVariants.get("en");
    if (!canonical) throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `${story.id} canonical narration is missing`);
    if (canonicalPaths.has(canonical.absolutePath)) {
      throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `duplicate canonical file ${canonical.relativePath}`);
    }
    canonicalPaths.add(canonical.absolutePath);
    const allIds = [assignment.episode.long_id, assignment.episode.short_a_id, assignment.episode.short_b_id];
    const relatedStoryIds = allIds.filter((id) => id !== story.id) as [string, string];
    stories.push({
      storyId: story.id,
      seriesEpisodeId: `veronica-episode-${String(assignment.episode.episode).padStart(2, "0")}`,
      seriesEpisodeOrder: assignment.episode.episode,
      seriesSlot: assignment.slot,
      kind: story.format,
      canonicalLocale: "en",
      title: assignment.title,
      canonicalNarrationPath: canonical.absolutePath,
      contentHash: canonical.contentHash,
      localeVariants,
      readiness: "CANONICAL_READY",
      relatedStoryIds,
      provenance: {
        contentPackId: VERONICA_CANONICAL_CONTENT_PACK_ID,
        manifestPath: input.manifestPath,
        seriesPlanPath: input.seriesPlanPath,
        sourceSeries: story.series,
      },
    });
  }
  stories.sort((left, right) => left.seriesEpisodeOrder - right.seriesEpisodeOrder || left.seriesSlot.localeCompare(right.seriesSlot));
  const storyById = new Map(stories.map((story) => [story.storyId, story]));
  const episodes = input.documents.seriesPlan.map((plan) => {
    const long = storyById.get(plan.long_id);
    const shortA = storyById.get(plan.short_a_id);
    const shortB = storyById.get(plan.short_b_id);
    if (!long || !shortA || !shortB) throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `episode ${plan.episode} cannot resolve its stories`);
    return {
      episodeId: `veronica-episode-${String(plan.episode).padStart(2, "0")}`,
      order: plan.episode,
      phase: plan.phase,
      long,
      shorts: [shortA, shortB] as const,
    };
  });
  return {
    contentPackId: VERONICA_CANONICAL_CONTENT_PACK_ID,
    packRoot: input.packRoot,
    manifestPath: input.manifestPath,
    seriesPlanPath: input.seriesPlanPath,
    stories,
    episodes,
    storyById,
    episodeByOrder: new Map(episodes.map((episode) => [episode.order, episode])),
  };
}

const sourceCache = new Map<string, Promise<VeronicaContentSource>>();

export async function resolveVeronicaContentSource(input: {
  readonly repositoryRoot?: string;
  readonly useCache?: boolean;
} = {}): Promise<VeronicaContentSource> {
  const repositoryRoot = await repositoryRootFrom(input.repositoryRoot ?? process.cwd());
  const cached = sourceCache.get(repositoryRoot);
  if (cached && input.useCache !== false) return cached;
  const loading = (async () => {
    const packRoot = path.resolve(repositoryRoot, VERONICA_CONTENT_SOURCE_CONFIG.rootDir);
    const manifestPath = path.join(packRoot, VERONICA_CONTENT_SOURCE_CONFIG.manifestPath);
    const seriesPlanPath = path.join(packRoot, VERONICA_CONTENT_SOURCE_CONFIG.seriesPlanPath);
    try {
      const rootStat = await fs.lstat(packRoot);
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("pack root must be a real directory");
      await Promise.all([
        assertContainedRegularFile(packRoot, manifestPath),
        assertContainedRegularFile(packRoot, seriesPlanPath),
      ]);
    } catch (error) {
      throw new VeronicaContentSourceError(
        "VERONICA_CANONICAL_PACK_NOT_FOUND",
        packRoot,
        { cause: error },
      );
    }
    try {
      const [manifestRaw, seriesPlanRaw] = await Promise.all([
        fs.readFile(manifestPath, "utf8"),
        fs.readFile(seriesPlanPath, "utf8"),
      ]);
      const documents = parseVeronicaCanonicalPackDocuments({
        manifest: JSON.parse(manifestRaw) as unknown,
        seriesPlan: JSON.parse(seriesPlanRaw) as unknown,
      });
      const registry = await buildRegistry({ packRoot, manifestPath, seriesPlanPath, documents });
      return { config: VERONICA_CONTENT_SOURCE_CONFIG, repositoryRoot, packRoot, manifestPath, seriesPlanPath, registry };
    } catch (error) {
      if (error instanceof VeronicaContentSourceError) throw error;
      throw new VeronicaContentSourceError(
        "VERONICA_CANONICAL_MANIFEST_INVALID",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  })();
  if (input.useCache !== false) sourceCache.set(repositoryRoot, loading);
  try {
    return await loading;
  } catch (error) {
    sourceCache.delete(repositoryRoot);
    throw error;
  }
}

export function resolveVeronicaLocalizedNarration(input: {
  readonly registry: VeronicaContentRegistry;
  readonly storyId: string;
  readonly locale: SupportedLanguageCode;
}): VeronicaLocaleVariant {
  const story = input.registry.storyById.get(input.storyId);
  if (!story) {
    throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `unknown story ${input.storyId}`);
  }
  const localized = story.localeVariants.get(input.locale);
  if (!localized) {
    throw new VeronicaContentSourceError(
      "VERONICA_LOCALE_UNAVAILABLE",
      `${input.storyId}/${input.locale}; available=${[...story.localeVariants.keys()].sort().join(",")}`,
    );
  }
  return localized;
}

export function canonicalSourceEpisodeFromRegistry(input: {
  readonly story: VeronicaCanonicalStoryRecord;
}): CanonicalSourceEpisode {
  const localeSources = [...input.story.localeVariants.values()]
    .sort((left, right) => left.locale.localeCompare(right.locale))
    .map((source) => ({
      locale: source.locale,
      sourcePath: ensurePortableRelativePath(source.relativePath),
      sourceSha256: source.sourceSha256,
      narration: source.narration,
    }));
  const sourceRevisionHash = createHash("sha256").update(JSON.stringify({
    authoredEpisodeKey: input.story.storyId,
    sources: localeSources.map(({ locale, sourcePath, sourceSha256 }) => ({ locale, sourcePath, sourceSha256 })),
  })).digest("hex");
  return canonicalSourceEpisodeSchema.parse({
    schemaVersion: CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION,
    ingestionAdapterVersion: VERONICA_UNIFIED_CONTENT_ADAPTER_VERSION,
    sourcePackId: VERONICA_CANONICAL_CONTENT_PACK_ID,
    episodeId: input.story.storyId,
    authoredEpisodeKey: input.story.storyId,
    canonicalSlug: input.story.storyId,
    title: input.story.title,
    contentProfileId: "veronicabenini",
    format: input.story.kind,
    canonicalLocale: input.story.canonicalLocale,
    contentHash: input.story.contentHash,
    seriesEpisodeId: input.story.seriesEpisodeId,
    seriesEpisodeOrder: input.story.seriesEpisodeOrder,
    seriesSlot: input.story.seriesSlot,
    relatedStoryIds: input.story.relatedStoryIds,
    readiness: input.story.readiness,
    localeSources,
    sourceRevisionHash,
    declaredReusableAssets: [],
  });
}

export interface VeronicaContentValidationResult {
  readonly canonicalPackId: typeof VERONICA_CANONICAL_CONTENT_PACK_ID;
  readonly packRoot: string;
  readonly manifestPath: string;
  readonly episodes: 18;
  readonly longs: 18;
  readonly shorts: 36;
  readonly canonicalEnglishAssets: 54;
  readonly locales: readonly SupportedLanguageCode[];
  readonly missingTranslations: readonly { readonly storyId: string; readonly locales: readonly SupportedLanguageCode[] }[];
  readonly timingViolations: readonly { readonly storyId: string; readonly locale: SupportedLanguageCode; readonly estimatedSeconds: number }[];
  readonly legacyReferences: readonly { readonly path: string; readonly classification: "explicit-diagnostic" }[];
  readonly productionLegacyReferences: readonly string[];
  readonly legacyFallback: false;
  readonly paidProviderCalls: 0;
}

async function sourceFilesUnder(root: string): Promise<readonly string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(resolved);
    if (entry.isFile() && /\.(?:mjs|ts)$/u.test(entry.name) && !/\.(?:unit|integration|e2e)\.test\.ts$/u.test(entry.name)) return [resolved];
    return [];
  }));
  return nested.flat();
}

async function inspectLegacySourceReferences(repositoryRoot: string): Promise<{
  readonly diagnostics: readonly { readonly path: string; readonly classification: "explicit-diagnostic" }[];
  readonly production: readonly string[];
}> {
  const legacyPattern = new RegExp([
    "content-packs/", "(?:vero/)?", "veronica-content-pack-", "[12]",
    "|content-packs/vero/veronica-stories-editorial-master",
    "|content-packs/full-transcripted-pack",
  ].join(""), "u");
  const [productionFiles, scriptFiles] = await Promise.all([
    Promise.all([
      sourceFilesUnder(path.join(repositoryRoot, "apps", "cli", "src")),
      sourceFilesUnder(path.join(repositoryRoot, "packages", "strategic-reinvention", "src")),
    ]).then((groups) => groups.flat()),
    sourceFilesUnder(path.join(repositoryRoot, "scripts")),
  ]);
  const matching = async (files: readonly string[]) => (await Promise.all(files.map(async (file) =>
    legacyPattern.test(await fs.readFile(file, "utf8")) ? path.relative(repositoryRoot, file).replaceAll("\\", "/") : null,
  ))).filter((file): file is string => file !== null).sort();
  const scannerPath = path.join(
    repositoryRoot,
    "packages",
    "strategic-reinvention",
    "src",
    "veronica-content-source.ts",
  );
  const [production, diagnostics] = await Promise.all([
    matching(productionFiles.filter((file) => path.resolve(file) !== scannerPath)),
    matching(scriptFiles),
  ]);
  return {
    diagnostics: diagnostics.map((referencePath) => ({ path: referencePath, classification: "explicit-diagnostic" as const })),
    production,
  };
}

export async function validateVeronicaContentSource(input: {
  readonly repositoryRoot?: string;
  readonly strictLocales?: boolean;
} = {}): Promise<VeronicaContentValidationResult> {
  const source = await resolveVeronicaContentSource({
    ...(input.repositoryRoot ? { repositoryRoot: input.repositoryRoot } : {}),
    useCache: false,
  });
  const missingTranslations = source.registry.stories.flatMap((story) => {
    const missing = SUPPORTED_LANGUAGE_CODES.filter((locale) => !story.localeVariants.has(locale)).sort();
    return missing.length > 0 ? [{ storyId: story.storyId, locales: missing }] : [];
  });
  const timingViolations = source.registry.stories.flatMap((story) =>
    [...story.localeVariants.values()]
      .filter((variant) => !variant.timingPass)
      .map((variant) => ({ storyId: story.storyId, locale: variant.locale, estimatedSeconds: variant.estimatedDurationSeconds })),
  );
  const englishFailures = timingViolations.filter((failure) => failure.locale === "en");
  if (englishFailures.length > 0) {
    throw new VeronicaContentSourceError("VERONICA_CANONICAL_MANIFEST_INVALID", `English timing failures: ${englishFailures.map((item) => item.storyId).join(",")}`);
  }
  if (input.strictLocales && (missingTranslations.length > 0 || timingViolations.length > 0)) {
    throw new VeronicaContentSourceError(
      "VERONICA_CANONICAL_MANIFEST_INVALID",
      `strict locale validation failed: missing=${missingTranslations.length}, timing=${timingViolations.length}`,
    );
  }
  const legacyReferences = await inspectLegacySourceReferences(source.repositoryRoot);
  if (legacyReferences.production.length > 0) {
    throw new VeronicaContentSourceError(
      "VERONICA_LEGACY_PACK_FORBIDDEN",
      `production legacy content paths: ${legacyReferences.production.join(",")}`,
    );
  }
  return {
    canonicalPackId: VERONICA_CANONICAL_CONTENT_PACK_ID,
    packRoot: source.packRoot,
    manifestPath: source.manifestPath,
    episodes: 18,
    longs: 18,
    shorts: 36,
    canonicalEnglishAssets: 54,
    locales: [...SUPPORTED_LANGUAGE_CODES].sort(),
    missingTranslations,
    timingViolations,
    legacyReferences: legacyReferences.diagnostics,
    productionLegacyReferences: legacyReferences.production,
    legacyFallback: false,
    paidProviderCalls: 0,
  };
}
