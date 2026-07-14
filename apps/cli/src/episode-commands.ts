import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  buildEpisodeLoadResult,
  buildLocalizedScenePlan,
  buildScenePlan,
  createApprovalRecord,
  discoverEpisodeSources,
  generateCanonicalImages,
  generateNarrationAudio,
  inspectAudioDurationSeconds,
  parseEpisodeSourceFile,
  readApprovalRecord,
  renderCleanVideo,
  retimeScenePlan,
  syncEpisodeCharacters,
  type ArtifactType,
  type ApprovalRecord,
  type EpisodeSourceDiscovery,
  type SupportedLanguage,
  sliceSceneAudioFiles,
  writeReviewPackage,
  writeScenePlanArtifacts,
} from "@mediaforge/dark-truth";
import {
  episodeIdSchema,
  scenePlanSchema,
  shotPlanSchema,
  shotPlanValidationIssueSchema,
} from "@mediaforge/domain";
import {
  approveEpisodeCharacter,
  assertGeneratedImageFileMatchesSpec,
  generateEpisodeImageReferences,
  loadEpisodeImageGenerationSettings,
  mergeImageGenerationEnv,
  resolveConfiguredImageGenerationSize,
  resolveConfiguredRenderSize,
  upsertCharacterRegistry,
  type CharacterDefinition,
  type CharacterRegistry,
} from "@mediaforge/image-generation";
import {
  extractCanonicalStoryFacts,
  parseCanonicalSourceStory,
  resolveStoryProductionAnalysisStatus,
  type ParsedSourceStory,
} from "@mediaforge/story-localization";
import {
  auditShortsImageAssets,
  prepareShortsImageAssets,
  type ShortsImageConfig,
} from "@mediaforge/image-generation";
import {
  AuthoredScriptResolverError,
  authoredScriptResolverVersion,
  buildAuthoredScriptCacheIdentity,
  copyAtomic,
  ensureDir,
  ensureWorkspacePath,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  readJsonIfExists,
  resolveAuthoredScript,
  slugify,
  toPortableRelativePath,
  writeJsonAtomic,
  writeTextAtomic,
  type ResolvedAuthoredScript,
} from "@mediaforge/shared";
import {
  validateShotPlanArtifactReferences,
  type VisualMotionPreset,
} from "@mediaforge/visual-planning";
import { z } from "zod";
import { commandImagesResume } from "./images-resume-command.js";
import { registerEpisodeLayoutMigrationCommand } from "./episode-layout-migration-command.js";
import { validateEpisodeCrossManifestIntegrity } from "./episode-cross-manifest-validator.js";

export interface EpisodeCommandOptions {
  readonly episode?: string;
  readonly source?: string;
  readonly language?: SupportedLanguage;
  readonly languages?: string;
  readonly artifact?: ArtifactType;
  readonly subtitleFormat?: "srt" | "vtt" | "both";
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly resume?: boolean;
  readonly continueOnError?: boolean;
  readonly reuseImages?: boolean;
  readonly approve?: boolean;
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly noQa?: boolean;
  readonly withTranscriptionQa?: boolean;
  readonly concurrency?: number;
  readonly outputRoot?: string;
  readonly reviewer?: string;
  readonly reason?: string;
  readonly notes?: string;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly visualRetention?: boolean;
  readonly visualRetentionMode?: "disabled" | "preview" | "enabled";
  readonly visualProfile?: string;
  readonly motionPreset?: string;
  readonly strictShotValidation?: boolean;
}

export interface EpisodeSetupUseCaseInput {
  readonly episode?: string;
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly language: SupportedLanguage;
  readonly variant: ArtifactType;
  readonly dryRun?: boolean;
  readonly validationOnly?: boolean;
  readonly force?: boolean;
  readonly resume?: boolean;
  readonly reuseImages?: boolean;
  readonly visualRetention?: boolean;
  readonly visualRetentionMode?: "disabled" | "preview" | "enabled";
  readonly visualProfile?: string;
  readonly motionPreset?: string;
  readonly strictShotValidation?: boolean;
}

export interface EpisodeSetupUseCaseResult {
  readonly summary: Record<string, unknown>;
}

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/iu);
const validationVariantSchema = z.enum(["full", "short"]);
const validationLanguageSchema = z.enum(["en", "de", "es", "fr"]);
const sourceMetadataSchema = z
  .object({
    episodeId: z.string().min(1),
    language: z.string().min(1),
    variant: validationVariantSchema,
    absolutePath: z.string().min(1),
    canonicalRelativePath: z.string().min(1),
    contentHash: hashSchema,
    resolverVersion: z.string().min(1),
    cacheIdentity: z.string().min(1),
  })
  .strict();
const visualRetentionManifestSchema = z
  .object({
    sourceScenesPath: z.string().min(1),
    focalMetadataPath: z.string().min(1),
    shotPlanPath: z.string().min(1),
    validationPath: z.string().min(1),
  })
  .passthrough();
const generationManifestSchema = z
  .object({
    episodeId: z.string().min(1),
    language: z.string().min(1),
    artifactType: validationVariantSchema,
    sourceSha256: hashSchema,
    source: sourceMetadataSchema.optional(),
    visualRetention: visualRetentionManifestSchema.optional(),
  })
  .passthrough();
const episodeSummaryManifestSchema = z
  .object({
    episodeSlug: z.string().min(1),
    language: z.string().min(1),
    artifactType: validationVariantSchema,
    currentArtifactPath: z.string().min(1),
    source: sourceMetadataSchema.optional(),
  })
  .passthrough();
const shotValidationArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    validationCode: z.literal("VALID").optional(),
    valid: z.boolean(),
    issues: z.array(shotPlanValidationIssueSchema),
    metrics: z.record(z.string(), z.unknown()),
  })
  .passthrough();

type ParsedGenerationManifest = z.infer<typeof generationManifestSchema>;
type ParsedEpisodeSummaryManifest = z.infer<typeof episodeSummaryManifestSchema>;
type ParsedShotValidationArtifact = z.infer<typeof shotValidationArtifactSchema>;
const darkTruthSharedImageManifestSchema = z
  .object({
    assets: z.array(
      z.object({
        relativePath: z.string().min(1),
      })
    ),
  })
  .passthrough();
const shortsSharedImageManifestSchema = z.array(
  z.object({
    outputImagePath: z.string().min(1),
  })
);

export type EpisodeValidationCode =
  | "VALID"
  | "INVALID_REQUEST"
  | "EPISODE_NOT_FOUND"
  | "MISSING_SOURCE"
  | "LEGACY_FALLBACK_ATTEMPT"
  | "SOURCE_RESOLUTION_FAILED"
  | "PATH_ESCAPE"
  | "MISSING_ARTIFACT"
  | "INVALID_SCHEMA"
  | "WRONG_LANGUAGE"
  | "WRONG_VARIANT"
  | "WRONG_EPISODE"
  | "ARTIFACT_MISMATCH"
  | "SOURCE_IDENTITY_MISSING"
  | "STALE_SOURCE_IDENTITY"
  | "BROKEN_REFERENCE"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "MISSING_SCENE"
  | "MISSING_IMAGE_ASSET"
  | "UNKNOWN_NARRATION_SEGMENT"
  | "VISUAL_RETENTION_INVALID";

type EpisodeValidationArtifactType =
  | "authored-source"
  | "cross-manifest"
  | "summary-manifest"
  | "generation-manifest"
  | "scene-plan"
  | "visual-plan"
  | "image-manifest"
  | "image-asset"
  | "narration-manifest"
  | "render-manifest"
  | "metadata"
  | "checkpoint-state"
  | "visual-retention-manifest"
  | "visual-source-scenes"
  | "focal-metadata"
  | "shot-plan"
  | "shot-validation";

export type EpisodeValidationResult =
  | {
      readonly state: "valid";
      readonly validationCode: "VALID";
      readonly artifactType: EpisodeValidationArtifactType;
      readonly message: string;
      readonly relativePath?: string;
      readonly contentHash?: string;
      readonly resolverVersion?: string;
      readonly cacheIdentity?: string;
    }
  | {
      readonly state: "invalid";
      readonly validationCode: Exclude<EpisodeValidationCode, "VALID">;
      readonly artifactType: EpisodeValidationArtifactType;
      readonly message: string;
      readonly relativePath?: string;
      readonly contentHash?: string;
      readonly resolverVersion?: string;
      readonly cacheIdentity?: string;
      readonly expected?: string;
      readonly actual?: string;
    };

export interface EpisodeValidationReport {
  readonly schemaVersion: 1;
  readonly status: "valid" | "invalid";
  readonly valid: boolean;
  readonly episodeSlug: string;
  readonly language: SupportedLanguage;
  readonly variant: ArtifactType;
  readonly outputRoot: string;
  readonly source?: EpisodeSourceMetadata;
  readonly artifacts: {
    readonly summaryManifestPath: string;
    readonly generationManifestPath: string;
    readonly shotPlanPath: string;
    readonly shotValidationPath: string;
  };
  readonly results: readonly EpisodeValidationResult[];
}

function setupInputFromOptions(
  options: EpisodeCommandOptions,
  args: {
    readonly sourceRoot: string;
    readonly outputRoot: string;
    readonly language: SupportedLanguage;
    readonly variant: ArtifactType;
  }
): EpisodeSetupUseCaseInput {
  const episode = resolveEpisodeFilter(options);
  return {
    ...(episode !== undefined ? { episode } : {}),
    sourceRoot: args.sourceRoot,
    outputRoot: args.outputRoot,
    language: args.language,
    variant: args.variant,
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    ...(options.force !== undefined ? { force: options.force } : {}),
    ...(options.resume !== undefined ? { resume: options.resume } : {}),
    ...(options.reuseImages !== undefined ? { reuseImages: options.reuseImages } : {}),
    ...(options.visualRetention !== undefined ? { visualRetention: options.visualRetention } : {}),
    ...(options.visualRetentionMode !== undefined
      ? { visualRetentionMode: options.visualRetentionMode }
      : {}),
    ...(options.visualProfile !== undefined ? { visualProfile: options.visualProfile } : {}),
    ...(options.motionPreset !== undefined ? { motionPreset: options.motionPreset } : {}),
    ...(options.strictShotValidation !== undefined
      ? { strictShotValidation: options.strictShotValidation }
      : {}),
  };
}

function episodeOptionsFromSetupInput(
  input: EpisodeSetupUseCaseInput,
  artifact: ArtifactType
): EpisodeCommandOptions {
  return {
    ...(input.episode !== undefined ? { episode: input.episode } : {}),
    source: input.sourceRoot,
    outputRoot: input.outputRoot,
    language: input.language,
    artifact,
    ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
    ...(input.force !== undefined ? { force: input.force } : {}),
    ...(input.resume !== undefined ? { resume: input.resume } : {}),
    ...(input.reuseImages !== undefined ? { reuseImages: input.reuseImages } : {}),
    ...(input.visualRetention !== undefined ? { visualRetention: input.visualRetention } : {}),
    ...(input.visualRetentionMode !== undefined
      ? { visualRetentionMode: input.visualRetentionMode }
      : {}),
    ...(input.visualProfile !== undefined ? { visualProfile: input.visualProfile } : {}),
    ...(input.motionPreset !== undefined ? { motionPreset: input.motionPreset } : {}),
    ...(input.strictShotValidation !== undefined
      ? { strictShotValidation: input.strictShotValidation }
      : {}),
  };
}

const defaultSourceRoot =
  "content-ideas/content/dark-truth-episodes-multilingual-production-pack";
const defaultOutputRoot = "./episodes";

function nowIso(): string {
  return new Date().toISOString();
}

function resolveShortVisualSceneTargetPer10Minutes(): number {
  return Number(
    process.env["SHORTS_VISUAL_SCENE_TARGET_PER_10_MINUTES"] ?? 150
  );
}

function resolveShortKeySceneCount(sceneCount: number): number {
  const configuredCount = Number(process.env["SHORTS_KEY_SCENE_COUNT"] ?? 8);
  const configuredRatio = Number(process.env["SHORTS_KEY_SCENE_RATIO"] ?? 0.8);
  const ratioCount =
    Number.isFinite(configuredRatio) && configuredRatio > 0
      ? Math.ceil(sceneCount * configuredRatio)
      : 0;
  return Math.max(
    0,
    Math.min(sceneCount, Math.max(configuredCount, ratioCount))
  );
}

function parseLanguageList(value: string | undefined): SupportedLanguage[] {
  if (!value) {
    return [];
  }
  const languages: SupportedLanguage[] = [];
  for (const rawEntry of value.split(",")) {
    const entry = normalizeWhitespace(rawEntry).toLowerCase();
    if (entry.length === 0) {
      continue;
    }
    if (entry !== "en" && entry !== "de" && entry !== "es" && entry !== "fr") {
      throw new Error(`Unsupported language code: ${entry}`);
    }
    languages.push(entry);
  }
  return languages;
}

function assertReuseImagesEnabled(reuseImages: boolean | undefined): void {
  if (reuseImages === false) {
    throw new Error("This pipeline requires --reuse-images to remain enabled.");
  }
}

export function resolveVisualRetentionOptions(options: EpisodeCommandOptions): {
  readonly enabled: boolean;
  readonly mode?: "disabled" | "preview" | "enabled";
  readonly profile?: "atmospheric" | "balanced" | "high-retention" | "shorts-aggressive";
  readonly motionPreset?: VisualMotionPreset;
  readonly strictValidation?: boolean;
} {
  const profile = options.visualProfile;
  const mode = options.visualRetentionMode;
  const motionPreset = options.motionPreset;
  if (
    profile !== undefined &&
    profile !== "atmospheric" &&
    profile !== "balanced" &&
    profile !== "high-retention" &&
    profile !== "shorts-aggressive"
  ) {
    throw new Error(`Unsupported visual-retention profile: ${profile}`);
  }
  if (
    mode !== undefined &&
    mode !== "disabled" &&
    mode !== "preview" &&
    mode !== "enabled"
  ) {
    throw new Error(`Unsupported visual-retention mode: ${mode}`);
  }
  if (
    motionPreset !== undefined &&
    motionPreset !== "subtle" &&
    motionPreset !== "balanced" &&
    motionPreset !== "strong"
  ) {
    throw new Error(`Unsupported motion preset: ${motionPreset}`);
  }
  const enabled = options.visualRetention !== false;
  const effectiveMode = mode ?? (enabled ? "preview" : "disabled");
  return {
    enabled,
    mode: effectiveMode,
    ...(profile ? { profile } : {}),
    ...(motionPreset ? { motionPreset } : {}),
    ...(options.strictShotValidation !== undefined
      ? { strictValidation: options.strictShotValidation }
      : {}),
  };
}

function resolveSourceRoot(options: EpisodeCommandOptions): string {
  return path.resolve(
    options.source ?? process.env["EPISODES_SOURCE_ROOT"] ?? defaultSourceRoot
  );
}

function resolveOutputRoot(options: EpisodeCommandOptions): string {
  return path.resolve(
    options.outputRoot ??
      process.env["EPISODES_OUTPUT_ROOT"] ??
      defaultOutputRoot
  );
}

function resolveEpisodeFilter(
  options: EpisodeCommandOptions
): string | undefined {
  return options.episode ? normalizeWhitespace(options.episode) : undefined;
}

function sanitizeCharacterId(value: string, fallbackIndex: number): string {
  const slug = slugify(value).replace(/^-+|-+$/gu, "");
  return slug.length > 0 ? slug : `character-${String(fallbackIndex + 1).padStart(2, "0")}`;
}

function buildCharacterRegistryFromSource(
  parsed: ParsedSourceStory,
  facts: Awaited<ReturnType<typeof extractCanonicalStoryFacts>>
): CharacterDefinition[] {
  const setting = normalizeWhitespace(facts.setting ?? parsed.metadata.visualDirection ?? parsed.title);
  const threat = normalizeWhitespace(facts.threat);
  const protagonists = facts.characters.length > 0 ? facts.characters : [
    {
      name: parsed.title,
      role: "main protagonist",
    },
  ];
  const registry: CharacterDefinition[] = protagonists.map((character, index) => {
    const id = sanitizeCharacterId(character.name, index);
    const protagonistRole = normalizeWhitespace(character.role);
    const isThreatCharacter =
      /black[- ]eyed children|children|doll|ghost|entity|monster|stranger|attacker/iu.test(
        `${character.name} ${protagonistRole}`
      );
    return {
      id,
      name: character.name,
      role: protagonistRole,
      aliases: [
        character.name,
        protagonistRole,
        ...character.name.split(/\s+/u).filter((part) => part.length >= 4),
      ].filter((alias) => normalizeWhitespace(alias).length > 0),
      collectiveLabels: isThreatCharacter
        ? ["children", "kids", "boys", "girls"]
        : [],
      physicalDescription: isThreatCharacter
        ? `${threat}.`
        : `A believable ${protagonistRole} from ${setting}.`,
      ageRange: isThreatCharacter
        ? "child"
        : index === 0
          ? "20s-30s"
          : "adult",
      genderPresentation: isThreatCharacter ? "child" : "person",
      face: {
        shape: isThreatCharacter ? "small" : "oval",
        skinTone: isThreatCharacter ? "pale" : "light",
        eyeColor: /black[- ]eyed/u.test(threat) ? "black" : "brown",
        eyebrows: isThreatCharacter ? "thin" : "natural",
        nose: isThreatCharacter ? "small" : "straight",
        mouth: isThreatCharacter ? "flat" : "neutral",
        distinguishingFeatures: isThreatCharacter
          ? ["unnatural black eyes"]
          : ["tired late-night expression"],
      },
      hair: {
        color: isThreatCharacter ? "dark brown" : "brown",
        length: isThreatCharacter ? "short" : "medium",
        style: isThreatCharacter ? "messy" : "slightly unkempt",
      },
      build: isThreatCharacter ? "slight" : "average",
      defaultWardrobe: {
        upperBody: isThreatCharacter ? "dark old-fashioned coat" : "practical travel clothes",
        lowerBody: isThreatCharacter ? "dark trousers" : "dark pants",
        footwear: isThreatCharacter ? "black shoes" : "closed-toe shoes",
        accessories: isThreatCharacter ? [] : ["small bag"],
        carriedObjects: isThreatCharacter ? [] : ["phone"],
        colors: isThreatCharacter ? ["dark", "grey"] : ["navy", "grey"],
      },
      continuityTraits: isThreatCharacter
        ? ["black eyes", "quiet, unsettling presence"]
        : [
            `same appearance across ${parsed.episodeNumber}`,
            `consistent with ${setting}`,
          ],
      referenceStatus: "missing",
    };
  });
  if (
    threat.length > 0 &&
    !registry.some((character) => normalizeWhitespace(character.name).toLowerCase() === threat.toLowerCase())
  ) {
    registry.push({
      id: sanitizeCharacterId(threat, registry.length),
      name: threat,
      role: "supernatural antagonist",
      aliases: [threat, "antagonist"].filter(
        (alias) => normalizeWhitespace(alias).length > 0
      ),
      collectiveLabels: /children|kids|boys|girls/iu.test(threat)
        ? ["children", "kids", "boys", "girls"]
        : [],
      physicalDescription: threat,
      ageRange: "unknown",
      genderPresentation: "unknown",
      face: {
        shape: "unknown",
        skinTone: "pale",
        eyeColor: /black[- ]eyed/u.test(threat) ? "black" : "dark",
        eyebrows: "unknown",
        nose: "unknown",
        mouth: "neutral",
        distinguishingFeatures: [threat],
      },
      hair: {
        color: "dark",
        length: "short",
        style: "plain",
      },
      build: "unknown",
      defaultWardrobe: {
        upperBody: "plain dark clothing",
        lowerBody: "dark clothing",
        footwear: "dark shoes",
        accessories: [],
        carriedObjects: [],
        colors: ["dark", "grey"],
      },
      continuityTraits: [threat],
      referenceStatus: "missing",
    });
  }
  return registry;
}

async function resolveSelectedEpisode(
  options: EpisodeCommandOptions
): Promise<{
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly discovery: EpisodeSourceDiscovery;
}> {
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const discovery = discoveries[0];
  if (!discovery) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  return { sourceRoot, outputRoot, discovery };
}

async function resolvePresentSourceFile(
  discovery: EpisodeSourceDiscovery
): Promise<string> {
  const sourceFile = discovery.candidates.find(
    (candidate) => candidate.status === "present"
  )?.filePath;
  if (!sourceFile) {
    throw new Error(`No source file found for ${discovery.slug}.`);
  }
  return sourceFile;
}

async function loadImageGenerationSettings(
  force?: boolean
): Promise<ReturnType<typeof loadEpisodeImageGenerationSettings>> {
  return loadEpisodeImageGenerationSettings({
    ...process.env,
    OPENAI_IMAGE_FORCE: force
      ? "true"
      : process.env["OPENAI_IMAGE_FORCE"],
  }, {
    profile: "full",
  });
}

async function syncSelectedEpisodeCharacters(
  options: EpisodeCommandOptions
): Promise<{
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly discovery: EpisodeSourceDiscovery;
  readonly sourceFile: string;
  readonly result: Awaited<ReturnType<typeof syncEpisodeCharacters>>;
}> {
  const { sourceRoot, outputRoot, discovery } = await resolveSelectedEpisode(
    options
  );
  const sourceFile = await resolvePresentSourceFile(discovery);
  const result = await syncEpisodeCharacters(sourceFile, outputRoot, {
    ...(options.force !== undefined ? { overwrite: options.force } : {}),
    required: true,
  });
  return { sourceRoot, outputRoot, discovery, sourceFile, result };
}

function filterDiscoveries(
  discoveries: ReadonlyArray<EpisodeSourceDiscovery>,
  episodeFilter?: string
): EpisodeSourceDiscovery[] {
  if (!episodeFilter) {
    return [...discoveries];
  }
  return discoveries.filter(
    (discovery) =>
      discovery.episodeNumber === episodeFilter ||
      discovery.slug === episodeFilter
  );
}

export interface ResolvedEpisodeLanguageSource extends ResolvedAuthoredScript {
  readonly sourceFile: string;
  readonly canonicalRelativePath: ResolvedAuthoredScript["relativePath"];
}

function authoredScriptOutputPath(args: {
  readonly outputRoot: string;
  readonly episodeId: string;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
}): string {
  return path.join(
    args.outputRoot,
    args.episodeId,
    "languages",
    ...(args.artifactType === "short" ? ["short"] : []),
    `script-${args.language}.md`
  );
}

interface EpisodeSourceMetadata {
  readonly episodeId: string;
  readonly language: string;
  readonly variant: string;
  readonly absolutePath: string;
  readonly canonicalRelativePath: string;
  readonly contentHash: string;
  readonly resolverVersion: string;
  readonly cacheIdentity: string;
}

async function assertCanonicalVariantImagesMatchSpec(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: SupportedLanguage;
  readonly variant: ArtifactType;
}): Promise<void> {
  const manifestPath =
    args.variant === "short"
      ? path.join(
          args.episodeDir,
          "shared",
          "short",
          "images",
          "shorts-image-manifest.json"
        )
      : path.join(args.episodeDir, "shared", "image-manifest.json");
  if (!(await fileExists(manifestPath))) {
    throw new Error(`Missing ${args.variant} image manifest: ${manifestPath}`);
  }

  const imagePaths =
    args.variant === "short"
      ? (
          await readJsonIfExists(manifestPath, (value) =>
            shortsSharedImageManifestSchema.parse(value)
          )
        )?.map((entry) => entry.outputImagePath) ?? []
      : (
          await readJsonIfExists(manifestPath, (value) =>
            darkTruthSharedImageManifestSchema.parse(value)
          )
        )?.assets.map((asset) => path.resolve(path.dirname(manifestPath), asset.relativePath)) ?? [];

  if (imagePaths.length === 0) {
    throw new Error(`No ${args.variant} image assets were recorded in ${manifestPath}.`);
  }

  for (const imagePath of imagePaths) {
    await assertGeneratedImageFileMatchesSpec({
      episodeId: args.episodeId,
      language: args.language,
      videoKind: args.variant,
      imagePath,
    });
  }
}

export async function resolveEpisodeLanguageSource(
  outputRoot: string,
  discovery: EpisodeSourceDiscovery,
  language: SupportedLanguage,
  artifactType: ArtifactType
): Promise<ResolvedEpisodeLanguageSource> {
  const workspaceRoot = path.dirname(path.resolve(outputRoot));
  try {
    const resolved = await resolveAuthoredScript({
      workspaceRoot,
      episode: discovery.slug,
      language,
      variant: artifactType,
    });
    return {
      ...resolved,
      sourceFile: resolved.absolutePath,
      canonicalRelativePath: resolved.relativePath,
    };
  } catch (error) {
    if (error instanceof AuthoredScriptResolverError) {
      if (error.code !== "MISSING_SCRIPT") {
        throw error;
      }
      const discoveredSource = discovery.candidates.find(
        (candidate) =>
          candidate.status === "present" &&
          candidate.language === language &&
          candidate.artifactType === artifactType
      );
      if (!discoveredSource) {
        throw error;
      }
      const sourceFile = path.resolve(discoveredSource.filePath);
      const contentHash = await hashFile(sourceFile);
      const relativePath =
        sourceFile === workspaceRoot ||
        sourceFile.startsWith(`${workspaceRoot}${path.sep}`)
          ? toPortableRelativePath(workspaceRoot, sourceFile)
          : sourceFile.replace(/\\/gu, "/");
      const identity = {
        resolverVersion: authoredScriptResolverVersion,
        episodeId: discovery.slug as ResolvedAuthoredScript["episodeId"],
        language: language as ResolvedAuthoredScript["language"],
        variant: artifactType as ResolvedAuthoredScript["variant"],
        relativePath: relativePath as ResolvedAuthoredScript["relativePath"],
        contentHash: contentHash as ResolvedAuthoredScript["contentHash"],
      } as const;
      const cacheIdentity = buildAuthoredScriptCacheIdentity(identity);
      return {
        episodeId: identity.episodeId,
        language: identity.language,
        variant: identity.variant,
        absolutePath: sourceFile as ResolvedAuthoredScript["absolutePath"],
        relativePath: relativePath as ResolvedAuthoredScript["relativePath"],
        contentHash: contentHash as ResolvedAuthoredScript["contentHash"],
        identity,
        cacheIdentity,
        resolverVersion: authoredScriptResolverVersion,
        logContext: {
          episodeId: discovery.slug,
          language,
          variant: artifactType,
          relativePath,
          contentHash,
          cacheIdentity,
          scriptPath: sourceFile,
          scriptHash: contentHash,
          resolverVersion: authoredScriptResolverVersion,
        },
        sourceFile,
        canonicalRelativePath: relativePath as ResolvedAuthoredScript["relativePath"],
      };
    }
    throw error;
  }
}

async function materializeCanonicalEpisodeLanguageSource(args: {
  readonly outputRoot: string;
  readonly discovery: EpisodeSourceDiscovery;
  readonly language: SupportedLanguage;
  readonly artifactType: ArtifactType;
  readonly source: ResolvedEpisodeLanguageSource;
}): Promise<ResolvedEpisodeLanguageSource> {
  const canonicalPath = authoredScriptOutputPath({
    outputRoot: args.outputRoot,
    episodeId: args.discovery.slug,
    language: args.language,
    artifactType: args.artifactType,
  });
  if (path.resolve(args.source.sourceFile) !== path.resolve(canonicalPath)) {
    await copyAtomic(args.source.sourceFile, canonicalPath);
  }
  const resolved = await resolveAuthoredScript({
    workspaceRoot: path.dirname(path.resolve(args.outputRoot)),
    episode: args.discovery.slug,
    language: args.language,
    variant: args.artifactType,
  });
  return {
    ...resolved,
    sourceFile: resolved.absolutePath,
    canonicalRelativePath: resolved.relativePath,
  };
}

function sourceMetadata(
  source: ResolvedEpisodeLanguageSource
): EpisodeSourceMetadata {
  return {
    episodeId: source.episodeId,
    language: source.language,
    variant: source.variant,
    absolutePath: source.absolutePath,
    canonicalRelativePath: source.canonicalRelativePath,
    contentHash: source.contentHash,
    resolverVersion: source.resolverVersion,
    cacheIdentity: source.cacheIdentity,
  };
}

async function ensureReviewPackageFiles(
  outputRoot: string,
  episodeSlug: string,
  language: SupportedLanguage,
  artifactType: ArtifactType,
  source: ResolvedEpisodeLanguageSource,
  sourceSha256: string
): Promise<string> {
  const reviewDir = path.join(
    outputRoot,
    episodeSlug,
    "reviews",
    language,
    artifactType
  );
  await ensureDir(reviewDir);
  await writeTextAtomic(
    path.join(reviewDir, "checklist.md"),
    [
      `# ${episodeSlug} ${language} ${artifactType} review checklist`,
      "",
      "- Confirm narration completeness.",
      "- Confirm subtitle sidecars exist separately.",
      "- Confirm no burned-in subtitles.",
      "- Confirm approved visual reuse.",
      "- Confirm timing and ending completeness.",
    ].join("\n")
  );
  await writeJsonAtomic(
    path.join(reviewDir, "regeneration-instructions.json"),
    {
      episodeSlug,
      language,
      artifactType,
      sourceSha256,
      source: sourceMetadata(source),
      generatedAt: nowIso(),
    }
  );
  return reviewDir;
}

async function writeEpisodeSummary(
  outputRoot: string,
  episodeSlug: string,
  language: SupportedLanguage,
  artifactType: ArtifactType,
  currentArtifactPath: string,
  source: ResolvedEpisodeLanguageSource
): Promise<void> {
  const manifestsDir = path.join(outputRoot, episodeSlug, "manifests");
  await ensureDir(manifestsDir);
  await writeJsonAtomic(
    path.join(manifestsDir, `${language}-${artifactType}.json`),
    {
      episodeSlug,
      language,
      artifactType,
      currentArtifactPath,
      source: sourceMetadata(source),
      updatedAt: nowIso(),
    }
  );
}

async function requireApproval(
  outputRoot: string,
  episodeSlug: string,
  language: SupportedLanguage,
  artifactType: ArtifactType
): Promise<ApprovalRecord> {
  const approval = await readApprovalRecord(
    path.join(outputRoot, episodeSlug, "reviews", language, artifactType)
  );
  if (!approval) {
    throw new Error(
      `Missing approval for ${episodeSlug} ${language} ${artifactType}.`
    );
  }
  const currentArtifactPath = path.join(
    outputRoot,
    episodeSlug,
    language,
    artifactType,
    "generation-manifest.json"
  );
  if (!(await fileExists(currentArtifactPath))) {
    throw new Error(
      `Missing current artifact for ${episodeSlug} ${language} ${artifactType}.`
    );
  }
  const currentHash = await hashFile(currentArtifactPath);
  if (currentHash !== approval.artifactSha256) {
    throw new Error(
      `Approval is stale for ${episodeSlug} ${language} ${artifactType}.`
    );
  }
  return { ...approval, stale: false };
}

async function writeCurrentArtifactRecord(
  outputRoot: string,
  episodeSlug: string,
  language: SupportedLanguage,
  artifactType: ArtifactType,
  source: ResolvedEpisodeLanguageSource,
  sourceSha256: string
): Promise<string> {
  const artifactDir = path.join(
    outputRoot,
    episodeSlug,
    language,
    artifactType
  );
  const generationManifest = path.join(artifactDir, "generation-manifest.json");
  if (!(await fileExists(generationManifest))) {
    throw new Error(`Missing generation manifest at ${generationManifest}`);
  }
  const currentArtifactPath = generationManifest;
  await writeJsonAtomic(
    path.join(path.dirname(path.dirname(artifactDir)), "current-artifact.json"),
    {
      episodeSlug,
      language,
      artifactType,
      currentArtifactPath,
      artifactSha256: await hashFile(currentArtifactPath),
      sourceSha256,
      source: sourceMetadata(source),
      recordedAt: nowIso(),
    }
  );
  return currentArtifactPath;
}

async function prepareEpisodeLanguage(
  sourceRoot: string,
  outputRoot: string,
  discovery: EpisodeSourceDiscovery,
  language: SupportedLanguage,
  artifactType: ArtifactType,
  options: EpisodeCommandOptions
): Promise<Record<string, unknown>> {
  let resolvedSource = await resolveEpisodeLanguageSource(
    outputRoot,
    discovery,
    language,
    artifactType
  );
  if (!options.dryRun) {
    resolvedSource = await materializeCanonicalEpisodeLanguageSource({
      outputRoot,
      discovery,
      language,
      artifactType,
      source: resolvedSource,
    });
  }
  const { sourceFile } = resolvedSource;
  const loadResult = await buildEpisodeLoadResult(sourceFile, outputRoot);
  const baseDir = path.join(outputRoot, discovery.slug, language, artifactType);
  await ensureDir(baseDir);
  const canonicalScenePlanPath =
    artifactType === "short"
      ? path.join(outputRoot, discovery.slug, "en", "short", "scenes.json")
      : path.join(outputRoot, discovery.slug, "shared", "scenes.json");
  let scenePlan =
    language !== "en" &&
    (await fileExists(canonicalScenePlanPath))
      ? buildLocalizedScenePlan(
          scenePlanSchema.parse(
            JSON.parse(
              await fs.readFile(canonicalScenePlanPath, "utf8")
            ) as unknown
          ),
          loadResult.source.narration
        )
      : buildScenePlan(
          loadResult.source.narration,
          discovery.slug,
          artifactType,
          artifactType === "short"
            ? {
                visualSceneTargetPer10Minutes:
                  resolveShortVisualSceneTargetPer10Minutes(),
              }
            : undefined
        );
  const scenePlanDir =
    language === "en" && artifactType === "full"
      ? path.join(outputRoot, discovery.slug, "shared")
      : baseDir;
  const reviewDir = await ensureReviewPackageFiles(
    outputRoot,
    discovery.slug,
    language,
    artifactType,
    resolvedSource,
    loadResult.source.sourceSha256
  );
  let reviewVideoPath = path.join(baseDir, "generation-manifest.json");
  const sharedImageDir = path.join(
    outputRoot,
    discovery.slug,
    "shared",
    "images",
    "generated"
  );
  const sharedShortImageDir = path.join(
    outputRoot,
    discovery.slug,
    "shared",
    "short",
    "images",
    "generated"
  );
  const mergedImageEnv = mergeImageGenerationEnv(process.env);
  const shortGenerationSize = resolveConfiguredImageGenerationSize({
    profile: "short",
    env: mergedImageEnv,
  });
  const shortRenderSize = resolveConfiguredRenderSize({
    profile: "short",
    env: mergedImageEnv,
  });
  const shortsImageConfig: ShortsImageConfig = {
    enabled: artifactType === "short",
    keySceneCount: resolveShortKeySceneCount(scenePlan.scenes.length),
    portraitWidth: shortGenerationSize.width,
    portraitHeight: shortGenerationSize.height,
    finalWidth: shortRenderSize.width,
    finalHeight: shortRenderSize.height,
    reuseLandscapeImages: true,
    enablePanAndScan: true,
    enableBlurredFallback: true,
    forceRegenerateAll:
      (options.force ?? false) ||
      (mergedImageEnv["SHORTS_FORCE_REGENERATE_ALL"] ?? "").toLowerCase() ===
        "true",
    selectionMode:
      (mergedImageEnv["SHORTS_SELECTION_MODE"] as
        | "first-n"
        | "importance-based"
        | undefined) ?? "importance-based",
  };
  if (mergedImageEnv["SHORTS_IMPORTANCE_SCENE_IDS"]) {
    shortsImageConfig.importanceSceneIds = mergedImageEnv[
      "SHORTS_IMPORTANCE_SCENE_IDS"
    ]
      .split(",")
      .map((value) => normalizeWhitespace(value))
      .filter((value) => value.length > 0);
  }
  const shortsImageManifestPath = path.join(
    outputRoot,
    discovery.slug,
    "shared",
    "short",
    "images",
    "shorts-image-manifest.json"
  );
  let narrationPath: string | undefined;
  let shortsWarnings: string[] = [];
  let visualRetentionReview:
    | {
        readonly shotPlanPath: string;
        readonly validationPath: string;
        readonly sourceScenesPath: string;
        readonly focalMetadataPath: string;
        readonly validationWarnings: readonly unknown[];
        readonly derivedShotCache?: unknown;
      }
    | undefined;
  if (!options.dryRun) {
    narrationPath = await generateNarrationAudio(
      baseDir,
      loadResult.speechPlan
    );
    const narrationDurationSeconds = await inspectAudioDurationSeconds(
      narrationPath
    );
    scenePlan = retimeScenePlan(scenePlan, narrationDurationSeconds);
  }
  await writeScenePlanArtifacts(
    scenePlanDir,
    scenePlan,
    language,
    artifactType
  );
  if (!options.dryRun) {
    if (language === "en" && artifactType === "full") {
      await generateCanonicalImages(
        path.join(outputRoot, discovery.slug, "shared"),
        scenePlan
      );
    }
    if (artifactType === "short") {
      await prepareShortsImageAssets(
        path.join(outputRoot, discovery.slug),
        discovery.slug,
        scenePlan,
        loadEpisodeImageGenerationSettings({
          ...mergedImageEnv,
          OPENAI_API_KEY: mergedImageEnv["OPENAI_API_KEY"] ?? "dry-run",
          OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
            options.reuseImages === false
              ? "false"
              : mergedImageEnv["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
          OPENAI_IMAGE_FORCE:
            shortsImageConfig.forceRegenerateAll ? "true" : mergedImageEnv["OPENAI_IMAGE_FORCE"],
        }, {
          profile: "short",
        }),
        shortsImageConfig,
        {
          landscapeDir: sharedImageDir,
          outputDir: sharedShortImageDir,
        }
      );
      const shortsAudit = await auditShortsImageAssets(
        scenePlan,
        sharedShortImageDir,
        shortsImageManifestPath
      );
      shortsWarnings = shortsAudit.warnings;
      if (shortsWarnings.length > 0) {
        process.stderr.write(
          [
            `Shorts asset warnings for ${discovery.slug} ${language}:`,
            ...shortsWarnings.map((warning) => `- ${warning}`),
          ].join("\n") + "\n"
        );
      }
    }
    await assertCanonicalVariantImagesMatchSpec({
      episodeDir: path.join(outputRoot, discovery.slug),
      episodeId: discovery.slug,
      language,
      variant: artifactType,
    });
    if (!narrationPath) {
      throw new Error("Narration audio was not generated for scene retiming.");
    }
    await sliceSceneAudioFiles(narrationPath, scenePlan, baseDir);
    const renderResult = await renderCleanVideo(
      baseDir,
      scenePlan,
      artifactType,
      {
        imageDir: artifactType === "short" ? sharedShortImageDir : sharedImageDir,
        imageManifestPath:
          artifactType === "short"
            ? shortsImageManifestPath
            : path.join(outputRoot, discovery.slug, "shared", "image-manifest.json"),
        visualRetention: resolveVisualRetentionOptions(options),
      }
    );
    reviewVideoPath = renderResult.cleanPath;
    const visualRetentionManifest =
      renderResult.visualRetention === undefined
        ? undefined
        : {
            sourceScenesPath: renderResult.visualRetention.sourceScenesPath,
            focalMetadataPath: renderResult.visualRetention.focalMetadataPath,
            shotPlanPath: renderResult.visualRetention.shotPlanPath,
            validationPath: renderResult.visualRetention.validationPath,
            validationWarnings:
              renderResult.visualRetention.validation.issues.filter(
                (issue) => issue.severity === "warning"
              ),
            ...(renderResult.visualRetention.derivedShotCache
              ? { derivedShotCache: renderResult.visualRetention.derivedShotCache }
              : {}),
          };
    visualRetentionReview = visualRetentionManifest;
    await writeJsonAtomic(path.join(baseDir, "generation-manifest.json"), {
      episodeId: discovery.slug,
      language,
      artifactType,
      sourceSha256: loadResult.source.sourceSha256,
      source: sourceMetadata(resolvedSource),
      narrationSha256: hashText(loadResult.source.narration),
      scenePlanSha256: await hashFile(path.join(scenePlanDir, "scenes.json")),
      imageManifestSha256: await hashFile(
        artifactType === "short"
          ? shortsImageManifestPath
          : path.join(outputRoot, discovery.slug, "shared", "image-manifest.json")
      ).catch(() => "missing"),
      ...(shortsWarnings.length > 0 ? { shortsWarnings } : {}),
      burnedInSubtitles: false,
      subtitleSidecars: loadResult.subtitleManifest.sidecarFiles,
      audioPath: narrationPath,
      videoPath: renderResult.cleanPath,
      ...(visualRetentionManifest
        ? { visualRetention: visualRetentionManifest }
        : {}),
      generatedAt: nowIso(),
    });
  }
  const currentArtifactPath = await writeCurrentArtifactRecord(
    outputRoot,
    discovery.slug,
    language,
    artifactType,
    resolvedSource,
    loadResult.source.sourceSha256
  );
  await writeEpisodeSummary(
    outputRoot,
    discovery.slug,
    language,
    artifactType,
    currentArtifactPath,
    resolvedSource
  );
  await writeReviewPackage(reviewDir, {
    videoPath: reviewVideoPath,
    subtitlePaths: [
      loadResult.subtitleManifest.sidecarFiles[0] ?? "",
      loadResult.subtitleManifest.sidecarFiles[1] ?? "",
    ].filter(Boolean),
    generationManifestPath: currentArtifactPath,
    qaReportPath: loadResult.paths.qaReportJson,
    narrationPath: loadResult.paths.narrationText,
    metadataPath: loadResult.paths.metadataJson,
    sceneListPath: path.join(scenePlanDir, "visual-plan.json"),
    canonicalAssetReferencesPath:
      artifactType === "short"
        ? shortsImageManifestPath
        : path.join(outputRoot, discovery.slug, "shared", "image-manifest.json"),
    ...(visualRetentionReview
      ? { visualRetention: visualRetentionReview }
      : {}),
    checklistPath: path.join(reviewDir, "checklist.md"),
    approvalState: "awaiting-human-review",
    rejectionNotesPath: path.join(reviewDir, "rejection-notes.md"),
    regenerationInstructionsPath: path.join(
      reviewDir,
      "regeneration-instructions.json"
    ),
  });
  return {
    episode: discovery.episodeNumber,
    episodeSlug: discovery.slug,
    language,
    artifactType,
    sourceFile,
    source: sourceMetadata(resolvedSource),
    analysis: loadResult.analysis,
    outputRoot,
    dryRun: options.dryRun ?? false,
    reviewDir,
  };
}

async function prepareEnglishCanonical(
  sourceRoot: string,
  outputRoot: string,
  discovery: EpisodeSourceDiscovery,
  options: EpisodeCommandOptions
): Promise<Record<string, unknown>> {
  return prepareEpisodeLanguage(
    sourceRoot,
    outputRoot,
    discovery,
    "en",
    "full",
    options
  );
}

async function selectEpisodeForSetup(
  sourceRoot: string,
  episodeFilter?: string
): Promise<EpisodeSourceDiscovery> {
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    episodeFilter
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  return selected;
}

export async function runEpisodeFullSetupUseCase(
  input: EpisodeSetupUseCaseInput
): Promise<EpisodeSetupUseCaseResult> {
  const selected = await selectEpisodeForSetup(input.sourceRoot, input.episode);
  const summary = await prepareEpisodeLanguage(
    input.sourceRoot,
    input.outputRoot,
    selected,
    input.language,
    "full",
    episodeOptionsFromSetupInput(input, "full")
  );
  return { summary };
}

export async function runEpisodeShortSetupUseCase(
  input: EpisodeSetupUseCaseInput
): Promise<EpisodeSetupUseCaseResult> {
  const selected = await selectEpisodeForSetup(input.sourceRoot, input.episode);
  const summary = await prepareEpisodeLanguage(
    input.sourceRoot,
    input.outputRoot,
    selected,
    input.language,
    "short",
    episodeOptionsFromSetupInput(input, "short")
  );
  return { summary };
}

async function handleReviewApproval(
  outputRoot: string,
  episodeSlug: string,
  language: SupportedLanguage,
  artifactType: ArtifactType,
  reviewer: string,
  sourceSha256: string,
  decision: "approved" | "rejected",
  reason?: string,
  notes?: string
): Promise<ApprovalRecord> {
  const artifactPath = path.join(
    outputRoot,
    episodeSlug,
    language,
    artifactType,
    "generation-manifest.json"
  );
  const generationManifestSha256 = await hashFile(artifactPath);
  const approvalRecord: Record<string, unknown> = {
    episodeId: slugify(episodeSlug),
    language,
    artifactType,
    artifactPath,
    artifactSha256: generationManifestSha256,
    generationManifestSha256,
    sourceSha256,
    reviewer,
    reviewedAt: nowIso(),
    decision,
    approvalState:
      decision === "approved" ? "human-approved" : "human-rejected",
    stale: false,
  };
  if (notes) {
    approvalRecord["notes"] = notes;
  }
  if (reason) {
    approvalRecord["rejectionReason"] = reason;
  }
  return createApprovalRecord(
    path.join(outputRoot, episodeSlug, "reviews", language, artifactType),
    approvalRecord as unknown as ApprovalRecord
  );
}

export async function commandEpisodeInspect(
  options: EpisodeCommandOptions
): Promise<void> {
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(resolveSourceRoot(options)),
    resolveEpisodeFilter(options)
  );
  const episodes = await Promise.all(
    discoveries.map(async (discovery) => ({
      ...discovery,
      storyProductionAnalysis: await resolveStoryProductionAnalysisStatus({
        outputRoot,
        episodeSlug: discovery.slug,
        language: "en",
        format: "full",
      }).catch(() => ({
        analysisPresent: false,
        analysisCurrent: false,
        analysisFingerprintMatches: false,
        analysisState: "MISSING" as const,
        failedProductionGates: [],
        blockingIssueCount: 0,
        requiredChangeCount: 0,
      })),
    }))
  );
  const payload = {
    sourceRoot: resolveSourceRoot(options),
    outputRoot,
    episodes,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function commandEpisodeDryRun(
  options: EpisodeCommandOptions
): Promise<void> {
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  const language = options.language ?? "en";
  const artifactType = options.artifact ?? "full";
  const summary = await prepareEpisodeLanguage(
    sourceRoot,
    outputRoot,
    selected,
    language,
    artifactType,
    { ...options, dryRun: true }
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

export async function commandEpisodeAnalyze(
  options: EpisodeCommandOptions
): Promise<void> {
  await commandEpisodeDryRun({ ...options, dryRun: true });
}

export async function commandEpisodePlan(
  options: EpisodeCommandOptions
): Promise<void> {
  await commandEpisodeDryRun({ ...options, dryRun: true });
}

export async function commandEpisodeEnglish(
  options: EpisodeCommandOptions
): Promise<void> {
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const { summary } = await runEpisodeFullSetupUseCase(setupInputFromOptions(options, {
    sourceRoot,
    outputRoot,
    language: "en",
    variant: "full",
  }));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

export async function commandEpisodeLocalized(
  options: EpisodeCommandOptions
): Promise<void> {
  assertReuseImagesEnabled(options.reuseImages);
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  const languages = parseLanguageList(options.languages);
  const selectedLanguages: SupportedLanguage[] =
    languages.length > 0 ? languages : ["de", "es", "fr"];
  if (selectedLanguages.some((language) => language !== "en")) {
    await requireApproval(outputRoot, selected.slug, "en", "full");
  }
  const outputs: Record<string, unknown>[] = [];
  for (const language of selectedLanguages) {
    const { summary } = await runEpisodeFullSetupUseCase(setupInputFromOptions(options, {
      sourceRoot,
      outputRoot,
      language,
      variant: "full",
    }));
    outputs.push(
      summary
    );
  }
  process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
}

export async function commandEpisodeShort(
  options: EpisodeCommandOptions
): Promise<void> {
  assertReuseImagesEnabled(options.reuseImages);
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  const language =
    options.language ?? (process.env["MEDIAFORGE_SCRIPT_LANGUAGE"] as SupportedLanguage | undefined) ?? "de";
  if (language === "de") {
    await requireApproval(outputRoot, selected.slug, "de", "full");
  }
  const { summary } = await runEpisodeShortSetupUseCase(setupInputFromOptions(options, {
    sourceRoot,
    outputRoot,
    language,
    variant: "short",
  }));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

export async function commandEpisodeStatus(
  options: EpisodeCommandOptions
): Promise<void> {
  const outputRoot = resolveOutputRoot(options);
  const sourceRoot = resolveSourceRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const statuses = await Promise.all(
    discoveries.map(async (discovery) => {
      const englishApproval = await readApprovalRecord(
        path.join(outputRoot, discovery.slug, "reviews", "en", "full")
      );
      const englishManifest = path.join(
        outputRoot,
        discovery.slug,
        "en",
        "full",
        "generation-manifest.json"
      );
      const stale =
        englishApproval && (await fileExists(englishManifest))
          ? (await hashFile(englishManifest)) !== englishApproval.artifactSha256
          : false;
      return {
        episode: discovery.episodeNumber,
        slug: discovery.slug,
        englishApproval: englishApproval?.approvalState ?? "not-started",
        staleEnglishApproval: stale,
        storyProductionAnalysis: await resolveStoryProductionAnalysisStatus({
          outputRoot,
          episodeSlug: discovery.slug,
          language: "en",
          format: "full",
        }).catch(() => ({
          analysisPresent: false,
          analysisCurrent: false,
          analysisFingerprintMatches: false,
          analysisState: "MISSING" as const,
          failedProductionGates: [],
          blockingIssueCount: 0,
          requiredChangeCount: 0,
        })),
      };
    })
  );
  process.stdout.write(
    `${JSON.stringify({ sourceRoot, outputRoot, statuses }, null, 2)}\n`
  );
}

export async function commandEpisodeSyncCharacters(
  options: EpisodeCommandOptions
): Promise<void> {
  const { result } = await syncSelectedEpisodeCharacters(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `${result.copied ? "Copied" : "Kept"} ${result.outputCharactersPath}\n`
  );
}

export async function commandEpisodeBootstrapCharacters(
  options: EpisodeCommandOptions
): Promise<void> {
  const { outputRoot, discovery } = await resolveSelectedEpisode(options);
  const sourceFile = await resolvePresentSourceFile(discovery);
  const result = await syncEpisodeCharacters(sourceFile, outputRoot, {
    ...(options.force !== undefined ? { overwrite: options.force } : {}),
    required: false,
  });
  const episodeDir = path.join(outputRoot, discovery.slug);
  const settings = await loadImageGenerationSettings(options.force);
  let registry: CharacterRegistry;
  let bootstrapMode: "copied" | "synthesized" | "kept" = result.copied ? "copied" : "kept";
  const outputCharactersPath = path.join(episodeDir, "shared", "characters.json");
  if (!(await fileExists(outputCharactersPath)) || options.force) {
    const parsedSource = await parseCanonicalSourceStory(sourceFile);
    const facts = extractCanonicalStoryFacts(parsedSource);
    const synthesizedCharacters = buildCharacterRegistryFromSource(parsedSource, facts);
    registry = await upsertCharacterRegistry(episodeDir, discovery.slug, synthesizedCharacters);
    bootstrapMode = "synthesized";
    registry = await generateEpisodeImageReferences(
      episodeDir,
      discovery.slug,
      settings
    );
  } else {
    registry = await generateEpisodeImageReferences(
      episodeDir,
      discovery.slug,
      settings
    );
  }
  let approvedCharacters = 0;
  if (options.approve) {
    for (const character of registry.characters) {
      registry = await approveEpisodeCharacter(
        episodeDir,
        discovery.slug,
        character.id
      );
      approvedCharacters += 1;
    }
  }
  const payload = {
    episode: discovery.episodeNumber,
    episodeSlug: discovery.slug,
    sourceFile,
    outputRoot,
    sync: result,
    bootstrapMode,
    registry,
    approvedCharacters,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `Synced ${result.outputCharactersPath}`,
      bootstrapMode === "synthesized"
        ? `Synthesized ${registry.characters.length} character registry entr${registry.characters.length === 1 ? "y" : "ies"}`
        : `Generated ${registry.characters.length} character reference(s)`,
      options.approve
        ? `Approved ${approvedCharacters} character reference(s)`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n") + "\n"
  );
}

function validResult(
  input: Omit<EpisodeValidationResult & { readonly state: "valid" }, "state" | "validationCode">
): EpisodeValidationResult {
  return {
    state: "valid",
    validationCode: "VALID",
    ...input,
  };
}

function invalidResult(
  input: Omit<EpisodeValidationResult & { readonly state: "invalid" }, "state">
): EpisodeValidationResult {
  return {
    state: "invalid",
    ...input,
  };
}

function normalizeValidationLanguage(
  value: unknown
): SupportedLanguage | null {
  const parsed = validationLanguageSchema.safeParse(value ?? "en");
  return parsed.success ? parsed.data : null;
}

function normalizeValidationVariant(value: unknown): ArtifactType | null {
  const parsed = validationVariantSchema.safeParse(value ?? "full");
  return parsed.success ? parsed.data : null;
}

function pathRelativeTo(root: string, filePath: string): string {
  return path.relative(root, path.resolve(filePath)).replace(/\\/gu, "/");
}

function containedPathResult(args: {
  readonly root: string;
  readonly filePath: string;
  readonly artifactType: EpisodeValidationArtifactType;
  readonly label: string;
}):
  | { readonly contained: true; readonly path: string; readonly relativePath: string }
  | { readonly contained: false; readonly result: EpisodeValidationResult } {
  try {
    const contained = path.resolve(args.root, ensureWorkspacePath(args.root, args.filePath));
    return {
      contained: true,
      path: contained,
      relativePath: pathRelativeTo(args.root, contained),
    };
  } catch (error) {
    return {
      contained: false,
      result: invalidResult({
        validationCode: "PATH_ESCAPE",
        artifactType: args.artifactType,
        message: `${args.label} escapes the episode root.`,
        actual: args.filePath,
      }),
    };
  }
}

async function parseJsonArtifact<T>(
  filePath: string,
  parser: (value: unknown) => T
): Promise<
  | { readonly status: "missing" }
  | { readonly status: "invalid"; readonly message: string }
  | { readonly status: "valid"; readonly data: T }
> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { status: "missing" };
    }
    return {
      status: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch (error) {
    return {
      status: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    return { status: "valid", data: parser(json) };
  } catch (error) {
    return {
      status: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function expectedShotSourceIdentity(source: ResolvedEpisodeLanguageSource) {
  return {
    resolverVersion: source.resolverVersion,
    episodeId: episodeIdSchema.parse(source.episodeId),
    language: source.language,
    variant: source.variant,
    relativePath: source.relativePath,
    contentHash: source.contentHash,
    cacheIdentity: source.cacheIdentity,
  };
}

function pushSourceIdentityResults(args: {
  readonly results: EpisodeValidationResult[];
  readonly artifactType: EpisodeValidationArtifactType;
  readonly source: ResolvedEpisodeLanguageSource;
  readonly actual?: z.infer<typeof sourceMetadataSchema>;
}): void {
  if (!args.actual) {
    args.results.push(
      invalidResult({
        validationCode: "SOURCE_IDENTITY_MISSING",
        artifactType: args.artifactType,
        message: "Artifact does not record the authored source resolver identity.",
        relativePath: args.source.relativePath,
        contentHash: args.source.contentHash,
        resolverVersion: args.source.resolverVersion,
        cacheIdentity: args.source.cacheIdentity,
      })
    );
    return;
  }
  const mismatches = [
    ["episodeId", args.source.episodeId, args.actual.episodeId],
    ["language", args.source.language, args.actual.language],
    ["variant", args.source.variant, args.actual.variant],
    ["canonicalRelativePath", args.source.relativePath, args.actual.canonicalRelativePath],
    ["contentHash", args.source.contentHash, args.actual.contentHash],
    ["resolverVersion", args.source.resolverVersion, args.actual.resolverVersion],
    ["cacheIdentity", args.source.cacheIdentity, args.actual.cacheIdentity],
  ].filter(([, expected, actual]) => expected !== actual);
  if (mismatches.length > 0) {
    const [field, expected, actual] = mismatches[0]!;
    args.results.push(
      invalidResult({
        validationCode: "STALE_SOURCE_IDENTITY",
        artifactType: args.artifactType,
        message: `Artifact source identity field ${field} is stale.`,
        relativePath: args.actual.canonicalRelativePath,
        contentHash: args.actual.contentHash,
        resolverVersion: args.actual.resolverVersion,
        cacheIdentity: args.actual.cacheIdentity,
        expected: String(expected),
        actual: String(actual),
      })
    );
    return;
  }
  args.results.push(
    validResult({
      artifactType: args.artifactType,
      message: "Artifact source identity matches the authored script resolver.",
      relativePath: args.source.relativePath,
      contentHash: args.source.contentHash,
      resolverVersion: args.source.resolverVersion,
      cacheIdentity: args.source.cacheIdentity,
    })
  );
}

function pushExpectedManifestFields(args: {
  readonly results: EpisodeValidationResult[];
  readonly artifactType: EpisodeValidationArtifactType;
  readonly relativePath: string;
  readonly episodeSlug: string;
  readonly language: SupportedLanguage;
  readonly variant: ArtifactType;
  readonly actualEpisodeSlug: string;
  readonly actualLanguage: string;
  readonly actualVariant: ArtifactType;
}): void {
  if (args.actualEpisodeSlug !== args.episodeSlug) {
    args.results.push(
      invalidResult({
        validationCode: "WRONG_EPISODE",
        artifactType: args.artifactType,
        message: "Artifact belongs to a different episode.",
        relativePath: args.relativePath,
        expected: args.episodeSlug,
        actual: args.actualEpisodeSlug,
      })
    );
  }
  if (args.actualLanguage !== args.language) {
    args.results.push(
      invalidResult({
        validationCode: "WRONG_LANGUAGE",
        artifactType: args.artifactType,
        message: "Artifact language does not match the requested language.",
        relativePath: args.relativePath,
        expected: args.language,
        actual: args.actualLanguage,
      })
    );
  }
  if (args.actualVariant !== args.variant) {
    args.results.push(
      invalidResult({
        validationCode: "WRONG_VARIANT",
        artifactType: args.artifactType,
        message: "Artifact variant does not match the requested variant.",
        relativePath: args.relativePath,
        expected: args.variant,
        actual: args.actualVariant,
      })
    );
  }
}

async function pushParsedArtifact<T>(args: {
  readonly results: EpisodeValidationResult[];
  readonly filePath: string;
  readonly root: string;
  readonly artifactType: EpisodeValidationArtifactType;
  readonly parser: (value: unknown) => T;
  readonly missingMessage: string;
}): Promise<T | null> {
  const relativePath = pathRelativeTo(args.root, args.filePath);
  const parsed = await parseJsonArtifact(args.filePath, args.parser);
  if (parsed.status === "missing") {
    args.results.push(
      invalidResult({
        validationCode: "MISSING_ARTIFACT",
        artifactType: args.artifactType,
        message: args.missingMessage,
        relativePath,
      })
    );
    return null;
  }
  if (parsed.status === "invalid") {
    args.results.push(
      invalidResult({
        validationCode: "INVALID_SCHEMA",
        artifactType: args.artifactType,
        message: parsed.message,
        relativePath,
      })
    );
    return null;
  }
  args.results.push(
    validResult({
      artifactType: args.artifactType,
      message: "Artifact exists and matches the package-local schema.",
      relativePath,
    })
  );
  return parsed.data;
}

async function pushVisualRetentionResults(args: {
  readonly results: EpisodeValidationResult[];
  readonly episodeDir: string;
  readonly expectedSource?: ResolvedEpisodeLanguageSource;
  readonly generationManifest: ParsedGenerationManifest;
  readonly language: SupportedLanguage;
  readonly variant: ArtifactType;
}): Promise<void> {
  const manifest = args.generationManifest.visualRetention;
  if (!manifest) {
    args.results.push(
      invalidResult({
        validationCode: "MISSING_ARTIFACT",
        artifactType: "visual-retention-manifest",
        message: "Generation manifest does not reference visual-retention artifacts.",
      })
    );
    return;
  }
  args.results.push(
    validResult({
      artifactType: "visual-retention-manifest",
      message: "Generation manifest references visual-retention artifacts.",
    })
  );

  for (const [artifactType, filePath] of [
    ["visual-source-scenes", manifest.sourceScenesPath],
    ["focal-metadata", manifest.focalMetadataPath],
    ["shot-plan", manifest.shotPlanPath],
    ["shot-validation", manifest.validationPath],
  ] as const) {
    const contained = containedPathResult({
      root: args.episodeDir,
      filePath,
      artifactType,
      label: artifactType,
    });
    if (!contained.contained) {
      args.results.push(contained.result);
      continue;
    }
    if (!(await fileExists(contained.path))) {
      args.results.push(
        invalidResult({
          validationCode: "MISSING_ARTIFACT",
          artifactType,
          message: "Required visual-retention artifact is missing.",
          relativePath: contained.relativePath,
        })
      );
    }
  }

  const shotPlan = await pushParsedArtifact({
    results: args.results,
    filePath: manifest.shotPlanPath,
    root: args.episodeDir,
    artifactType: "shot-plan",
    parser: (value) => shotPlanSchema.parse(value),
    missingMessage: "Missing shot-plan artifact.",
  });
  if (shotPlan) {
    if (shotPlan.locale !== undefined && shotPlan.locale !== args.language) {
      args.results.push(
        invalidResult({
          validationCode: "WRONG_LANGUAGE",
          artifactType: "shot-plan",
          message: "Shot-plan locale does not match the requested language.",
          relativePath: pathRelativeTo(args.episodeDir, manifest.shotPlanPath),
          expected: args.language,
          actual: shotPlan.locale,
        })
      );
    }
    if (shotPlan.variant !== args.variant) {
      args.results.push(
        invalidResult({
          validationCode: "WRONG_VARIANT",
          artifactType: "shot-plan",
          message: "Shot-plan variant does not match the requested variant.",
          relativePath: pathRelativeTo(args.episodeDir, manifest.shotPlanPath),
          expected: args.variant,
          actual: shotPlan.variant,
        })
      );
    }
    const referenceValidation = await validateShotPlanArtifactReferences({
      shotPlan,
      episodeWorkspace: args.episodeDir,
      artifactPath: manifest.shotPlanPath,
      ...(args.expectedSource && shotPlan.sourceIdentity
        ? { expectedSourceIdentity: expectedShotSourceIdentity(args.expectedSource) }
        : {}),
    });
    if (referenceValidation.validationCode === "VALID") {
      args.results.push(
        validResult({
          artifactType: "shot-plan",
          message:
            shotPlan.sourceIdentity === undefined
              ? "Shot-plan references are root-contained. Legacy artifact omits source identity."
              : "Shot-plan references are root-contained and source-current.",
          relativePath: pathRelativeTo(args.episodeDir, manifest.shotPlanPath),
        })
      );
    } else {
      const validationCode: Exclude<EpisodeValidationCode, "VALID"> =
        referenceValidation.validationCode === "STALE_SOURCE_IDENTITY"
          ? "STALE_SOURCE_IDENTITY"
          : referenceValidation.message.includes("escapes")
            ? "PATH_ESCAPE"
            : "BROKEN_REFERENCE";
      args.results.push(
        invalidResult({
          validationCode,
          artifactType: "shot-plan",
          message: referenceValidation.message,
          ...(referenceValidation.validationCode === "BROKEN_REFERENCE" &&
          referenceValidation.relativePath
            ? { relativePath: referenceValidation.relativePath }
            : { relativePath: pathRelativeTo(args.episodeDir, manifest.shotPlanPath) }),
        })
      );
    }
  }

  const shotValidation = await pushParsedArtifact<ParsedShotValidationArtifact>({
    results: args.results,
    filePath: manifest.validationPath,
    root: args.episodeDir,
    artifactType: "shot-validation",
    parser: (value) => shotValidationArtifactSchema.parse(value),
    missingMessage: "Missing shot validation artifact.",
  });
  if (shotValidation && !shotValidation.valid) {
    args.results.push(
      invalidResult({
        validationCode: "VISUAL_RETENTION_INVALID",
        artifactType: "shot-validation",
        message: "Visual-retention shot validation artifact is not valid.",
        relativePath: pathRelativeTo(args.episodeDir, manifest.validationPath),
      })
    );
  }
}

async function buildEpisodeValidationReport(
  options: EpisodeCommandOptions
): Promise<EpisodeValidationReport> {
  const language = normalizeValidationLanguage(options.language);
  const variant = normalizeValidationVariant(options.artifact);
  const outputRoot = resolveOutputRoot(options);
  const sourceRoot = resolveSourceRoot(options);
  const requestedEpisode = resolveEpisodeFilter(options) ?? "unknown";
  const results: EpisodeValidationResult[] = [];

  if (!language || !variant) {
    const safeLanguage = language ?? "en";
    const safeVariant = variant ?? "full";
    results.push(
      invalidResult({
        validationCode: "INVALID_REQUEST",
        artifactType: "authored-source",
        message: "Unsupported language or artifact variant.",
        expected: "language en|de|es|fr and artifact full|short",
        actual: `${String(options.language ?? "en")} ${String(options.artifact ?? "full")}`,
      })
    );
    return {
      schemaVersion: 1,
      status: "invalid",
      valid: false,
      episodeSlug: requestedEpisode,
      language: safeLanguage,
      variant: safeVariant,
      outputRoot,
      artifacts: {
        summaryManifestPath: "",
        generationManifestPath: "",
        shotPlanPath: "",
        shotValidationPath: "",
      },
      results,
    };
  }

  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    results.push(
      invalidResult({
        validationCode: "EPISODE_NOT_FOUND",
        artifactType: "authored-source",
        message: `No episode found under ${sourceRoot}.`,
      })
    );
    return {
      schemaVersion: 1,
      status: "invalid",
      valid: false,
      episodeSlug: requestedEpisode,
      language,
      variant,
      outputRoot,
      artifacts: {
        summaryManifestPath: "",
        generationManifestPath: "",
        shotPlanPath: "",
        shotValidationPath: "",
      },
      results,
    };
  }

  const episodeDir = path.join(outputRoot, selected.slug);
  const summaryManifestPath = path.join(
    episodeDir,
    "manifests",
    `${language}-${variant}.json`
  );
  const generationManifestPath = path.join(
    episodeDir,
    language,
    variant,
    "generation-manifest.json"
  );
  const shotPlanPath = path.join(
    episodeDir,
    "state",
    "visual-retention",
    `shot-plan.${variant}.${language}.json`
  );
  const shotValidationPath = path.join(
    episodeDir,
    "state",
    "visual-retention",
    `validation.${variant}.${language}.json`
  );

  let resolvedSource: ResolvedEpisodeLanguageSource | undefined;
  try {
    resolvedSource = await resolveEpisodeLanguageSource(
      outputRoot,
      selected,
      language,
      variant
    );
    results.push(
      validResult({
        artifactType: "authored-source",
        message: "Canonical authored source resolved.",
        relativePath: resolvedSource.relativePath,
        contentHash: resolvedSource.contentHash,
        resolverVersion: resolvedSource.resolverVersion,
        cacheIdentity: resolvedSource.cacheIdentity,
      })
    );
  } catch (error) {
    if (error instanceof AuthoredScriptResolverError) {
      const validationCode: Exclude<EpisodeValidationCode, "VALID"> =
        error.code === "MISSING_SCRIPT"
          ? "MISSING_SOURCE"
          : error.code === "STALE_LAYOUT"
            ? "LEGACY_FALLBACK_ATTEMPT"
            : error.code === "PATH_ESCAPE"
              ? "PATH_ESCAPE"
              : "SOURCE_RESOLUTION_FAILED";
      results.push(
        invalidResult({
          validationCode,
          artifactType: "authored-source",
          message: error.message,
          ...(error.details.canonicalRelativePath
            ? { relativePath: error.details.canonicalRelativePath }
            : {}),
        })
      );
    } else {
      results.push(
        invalidResult({
          validationCode: "SOURCE_RESOLUTION_FAILED",
          artifactType: "authored-source",
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  const summaryManifest = await pushParsedArtifact<ParsedEpisodeSummaryManifest>({
    results,
    filePath: summaryManifestPath,
    root: episodeDir,
    artifactType: "summary-manifest",
    parser: (value) => episodeSummaryManifestSchema.parse(value),
    missingMessage: "Missing episode summary manifest.",
  });
  if (summaryManifest) {
    const relativePath = pathRelativeTo(episodeDir, summaryManifestPath);
    pushExpectedManifestFields({
      results,
      artifactType: "summary-manifest",
      relativePath,
      episodeSlug: selected.slug,
      language,
      variant,
      actualEpisodeSlug: summaryManifest.episodeSlug,
      actualLanguage: summaryManifest.language,
      actualVariant: summaryManifest.artifactType,
    });
    const contained = containedPathResult({
      root: episodeDir,
      filePath: summaryManifest.currentArtifactPath,
      artifactType: "summary-manifest",
      label: "summary manifest current artifact path",
    });
    if (!contained.contained) {
      results.push(contained.result);
    } else if (contained.path !== path.resolve(generationManifestPath)) {
      results.push(
        invalidResult({
          validationCode: "ARTIFACT_MISMATCH",
          artifactType: "summary-manifest",
          message: "Summary manifest points at a different generation artifact.",
          relativePath,
          expected: pathRelativeTo(episodeDir, generationManifestPath),
          actual: contained.relativePath,
        })
      );
    }
    if (resolvedSource) {
      pushSourceIdentityResults({
        results,
        artifactType: "summary-manifest",
        source: resolvedSource,
        ...(summaryManifest.source ? { actual: summaryManifest.source } : {}),
      });
    }
  }

  const generationManifest = await pushParsedArtifact<ParsedGenerationManifest>({
    results,
    filePath: generationManifestPath,
    root: episodeDir,
    artifactType: "generation-manifest",
    parser: (value) => generationManifestSchema.parse(value),
    missingMessage: "Missing generation manifest.",
  });
  if (generationManifest) {
    const relativePath = pathRelativeTo(episodeDir, generationManifestPath);
    pushExpectedManifestFields({
      results,
      artifactType: "generation-manifest",
      relativePath,
      episodeSlug: selected.slug,
      language,
      variant,
      actualEpisodeSlug: generationManifest.episodeId,
      actualLanguage: generationManifest.language,
      actualVariant: generationManifest.artifactType,
    });
    if (resolvedSource) {
      pushSourceIdentityResults({
        results,
        artifactType: "generation-manifest",
        source: resolvedSource,
        ...(generationManifest.source ? { actual: generationManifest.source } : {}),
      });
      if (generationManifest.sourceSha256 !== resolvedSource.contentHash) {
        results.push(
          invalidResult({
            validationCode: "STALE_SOURCE_IDENTITY",
            artifactType: "generation-manifest",
            message: "Generation manifest source hash does not match the authored source.",
            relativePath,
            expected: resolvedSource.contentHash,
            actual: generationManifest.sourceSha256,
          })
        );
      }
    }
    await pushVisualRetentionResults({
      results,
      episodeDir,
      ...(resolvedSource ? { expectedSource: resolvedSource } : {}),
      generationManifest,
      language,
      variant,
    });
    results.push(
      ...(await validateEpisodeCrossManifestIntegrity({
        episodeDir,
        episodeSlug: selected.slug,
        language,
        variant,
        generationManifestPath,
        ...(resolvedSource
          ? {
              expectedSource: {
                episodeId: resolvedSource.episodeId,
                language: resolvedSource.language,
                variant: resolvedSource.variant,
                relativePath: resolvedSource.relativePath,
                contentHash: resolvedSource.contentHash,
                resolverVersion: resolvedSource.resolverVersion,
                cacheIdentity: resolvedSource.cacheIdentity,
              },
            }
          : {}),
      }))
    );
  }

  const status = results.some((result) => result.state === "invalid")
    ? "invalid"
    : "valid";
  return {
    schemaVersion: 1,
    status,
    valid: status === "valid",
    episodeSlug: selected.slug,
    language,
    variant,
    outputRoot,
    ...(resolvedSource ? { source: sourceMetadata(resolvedSource) } : {}),
    artifacts: {
      summaryManifestPath,
      generationManifestPath,
      shotPlanPath,
      shotValidationPath,
    },
    results,
  };
}

export async function commandEpisodeValidate(
  options: EpisodeCommandOptions
): Promise<void> {
  const report = await buildEpisodeValidationReport(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) {
    process.exitCode = 1;
  }
}

export async function commandEpisodeReviewPrepare(
  options: EpisodeCommandOptions
): Promise<void> {
  await commandEpisodeDryRun({ ...options, dryRun: true });
}

export async function commandEpisodeReviewApprove(
  options: EpisodeCommandOptions
): Promise<void> {
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  const language = options.language ?? "en";
  const artifactType = options.artifact ?? "full";
  const resolvedSource = await resolveEpisodeLanguageSource(
    outputRoot,
    selected,
    language,
    artifactType
  );
  const current = await parseEpisodeSourceFile(
    resolvedSource.sourceFile,
    outputRoot
  );
  const approval = await handleReviewApproval(
    outputRoot,
    selected.slug,
    language,
    artifactType,
    options.reviewer ?? "reviewer",
    current.sourceSha256,
    "approved",
    undefined,
    options.notes
  );
  process.stdout.write(
    `${JSON.stringify({ approval, episode: selected.slug, language, artifactType, source: sourceMetadata(resolvedSource), current }, null, 2)}\n`
  );
}

export async function commandEpisodeReviewReject(
  options: EpisodeCommandOptions
): Promise<void> {
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  const language = options.language ?? "en";
  const artifactType = options.artifact ?? "full";
  const resolvedSource = await resolveEpisodeLanguageSource(
    outputRoot,
    selected,
    language,
    artifactType
  );
  const current = await parseEpisodeSourceFile(
    resolvedSource.sourceFile,
    outputRoot
  );
  const approval = await handleReviewApproval(
    outputRoot,
    selected.slug,
    language,
    artifactType,
    options.reviewer ?? "reviewer",
    current.sourceSha256,
    "rejected",
    options.reason,
    options.notes
  );
  process.stdout.write(
    `${JSON.stringify({ approval, episode: selected.slug, language, artifactType, source: sourceMetadata(resolvedSource), current }, null, 2)}\n`
  );
}

export async function commandEpisodeReviewStatus(
  options: EpisodeCommandOptions
): Promise<void> {
  const sourceRoot = resolveSourceRoot(options);
  const outputRoot = resolveOutputRoot(options);
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  const language = options.language ?? "en";
  const artifactType = options.artifact ?? "full";
  const approval = await readApprovalRecord(
    path.join(outputRoot, selected.slug, "reviews", language, artifactType)
  );
  const currentManifest = path.join(
    outputRoot,
    selected.slug,
    language,
    artifactType,
    "generation-manifest.json"
  );
  const stale =
    approval && (await fileExists(currentManifest))
      ? (await hashFile(currentManifest)) !== approval.artifactSha256
      : true;
  process.stdout.write(`${JSON.stringify({ approval, stale }, null, 2)}\n`);
}

function mergeEpisodeCommandOptions(
  program: Command,
  options: EpisodeCommandOptions
): EpisodeCommandOptions {
  return { ...program.opts<EpisodeCommandOptions>(), ...options };
}

export function registerEpisodeCommands(program: Command): void {
  const episode = program
    .command("episode")
    .alias("episodes")
    .description("Dark Truth multilingual workflow");
  registerEpisodeLayoutMigrationCommand(episode);
  episode
    .command("inspect")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--json", "emit JSON")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeInspect(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("dry-run")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .option("--json", "emit JSON")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeDryRun(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("analyze")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeAnalyze(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("plan")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodePlan(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("english")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--dry-run", "do not execute paid providers")
    .option("--visual-retention", "enable shot-aware visual retention")
    .option("--no-visual-retention", "disable shot-aware visual retention")
    .option("--visual-retention-mode <disabled|preview|enabled>", "set visual retention rollout mode")
    .option("--visual-profile <profile>", "visual-retention pacing profile")
    .option("--motion-preset <subtle|balanced|strong>", "visual-retention motion preset")
    .option("--strict-shot-validation", "fail on shot validation warnings")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeEnglish(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("localized")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--languages <comma-separated-languages>", "target languages")
    .option("--output-root <path>", "output root")
    .option("--reuse-images", "reuse canonical images", true)
    .option("--dry-run", "do not execute paid providers")
    .option("--visual-retention", "enable shot-aware visual retention")
    .option("--no-visual-retention", "disable shot-aware visual retention")
    .option("--visual-retention-mode <disabled|preview|enabled>", "set visual retention rollout mode")
    .option("--visual-profile <profile>", "visual-retention pacing profile")
    .option("--motion-preset <subtle|balanced|strong>", "visual-retention motion preset")
    .option("--strict-shot-validation", "fail on shot validation warnings")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeLocalized(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("short")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--output-root <path>", "output root")
    .option("--reuse-images", "reuse canonical images", true)
    .option("--dry-run", "do not execute paid providers")
    .option("--visual-retention", "enable shot-aware visual retention")
    .option("--no-visual-retention", "disable shot-aware visual retention")
    .option("--visual-retention-mode <disabled|preview|enabled>", "set visual retention rollout mode")
    .option("--visual-profile <profile>", "visual-retention pacing profile")
    .option("--motion-preset <subtle|balanced|strong>", "visual-retention motion preset")
    .option("--strict-shot-validation", "fail on shot validation warnings")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeShort(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("status")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeStatus(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("sync-characters")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--force")
    .option("--json")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeSyncCharacters(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("bootstrap-characters")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--force")
    .option("--approve", "approve generated references")
    .option("--json")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeBootstrapCharacters(mergeEpisodeCommandOptions(program, opts))
    );
  episode
    .command("resume-images")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--concurrency <number>", "parallel scene generation", (value) =>
      Number(value)
    )
    .option("--allow-unapproved-character-references")
    .option("--force")
    .option("--json")
    .option("--verbose")
    .action(async (opts: EpisodeCommandOptions) =>
      commandImagesResume({
        episode: opts.episode ?? "",
        ...(opts.source !== undefined ? { source: opts.source } : {}),
        ...(opts.outputRoot !== undefined ? { workspace: opts.outputRoot } : {}),
        ...(opts.concurrency !== undefined ? { concurrency: opts.concurrency } : {}),
        ...(opts.allowUnapprovedCharacterReferences !== undefined
          ? {
              allowUnapprovedCharacterReferences:
                opts.allowUnapprovedCharacterReferences,
            }
          : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
        ...(opts.json !== undefined ? { json: opts.json } : {}),
        ...(opts.verbose !== undefined ? { verbose: opts.verbose } : {}),
      })
    );
  episode
    .command("validate")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .option("--json", "emit JSON")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeValidate(mergeEpisodeCommandOptions(program, opts))
    );
  const review = episode.command("review").description("Review workflow");
  review
    .command("prepare")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .option("--dry-run", "do not execute paid providers")
    .option("--visual-retention", "enable shot-aware visual retention")
    .option("--no-visual-retention", "disable shot-aware visual retention")
    .option("--visual-retention-mode <disabled|preview|enabled>", "set visual retention rollout mode")
    .option("--visual-profile <profile>", "visual-retention pacing profile")
    .option("--motion-preset <subtle|balanced|strong>", "visual-retention motion preset")
    .option("--strict-shot-validation", "fail on shot validation warnings")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeReviewPrepare(mergeEpisodeCommandOptions(program, opts))
    );
  review
    .command("approve")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .option("--reviewer <name>", "reviewer")
    .option("--notes <text>", "review notes")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeReviewApprove(mergeEpisodeCommandOptions(program, opts))
    );
  review
    .command("reject")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .option("--reviewer <name>", "reviewer")
    .option("--reason <text>", "rejection reason")
    .option("--notes <text>", "review notes")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeReviewReject(mergeEpisodeCommandOptions(program, opts))
    );
  review
    .command("status")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeReviewStatus(mergeEpisodeCommandOptions(program, opts))
    );
}
