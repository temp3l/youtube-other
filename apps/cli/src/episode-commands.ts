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
import { scenePlanSchema } from "@mediaforge/domain";
import {
  approveEpisodeCharacter,
  generateEpisodeImageReferences,
  loadEpisodeImageGenerationSettings,
  upsertCharacterRegistry,
  type CharacterDefinition,
  type CharacterRegistry,
} from "@mediaforge/image-generation";
import {
  extractCanonicalStoryFacts,
  parseCanonicalSourceStory,
  type ParsedSourceStory,
} from "@mediaforge/story-localization";
import {
  auditShortsImageAssets,
  prepareShortsImageAssets,
  type ShortsImageConfig,
} from "@mediaforge/image-generation";
import {
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  slugify,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { commandImagesResume } from "./images-resume-command.js";

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
}

const defaultSourceRoot =
  "content-ideas/content/dark-truth-episodes-multilingual-production-pack";
const defaultOutputRoot = "./episodes";

function nowIso(): string {
  return new Date().toISOString();
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
        `${character.name} ${protagonistRole} ${threat}`
      );
    return {
      id,
      name: character.name,
      role: protagonistRole,
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
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
    OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
    OPENAI_IMAGE_SIZE: process.env["OPENAI_IMAGE_SIZE"],
    OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
    OPENAI_IMAGE_CONCURRENCY: process.env["OPENAI_IMAGE_CONCURRENCY"],
    OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
    OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
    OPENAI_IMAGE_FORCE: force
      ? "true"
      : process.env["OPENAI_IMAGE_FORCE"],
    OPENAI_BASE_URL: process.env["OPENAI_BASE_URL"],
    OPENAI_ORGANIZATION: process.env["OPENAI_ORGANIZATION"],
    OPENAI_PROJECT: process.env["OPENAI_PROJECT"],
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

function resolveSourceForLanguage(
  discovery: EpisodeSourceDiscovery,
  language: SupportedLanguage,
  artifactType: ArtifactType
): string {
  const candidate = discovery.candidates.find(
    (entry: EpisodeSourceDiscovery["candidates"][number]) =>
      entry.language === language && entry.artifactType === artifactType
  );
  if (!candidate || candidate.status !== "present") {
    throw new Error(
      `Missing source file for episode ${discovery.episodeNumber} ${language} ${artifactType}.`
    );
  }
  return candidate.filePath;
}

async function ensureReviewPackageFiles(
  outputRoot: string,
  episodeSlug: string,
  language: SupportedLanguage,
  artifactType: ArtifactType,
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
  currentArtifactPath: string
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
  const sourceFile = resolveSourceForLanguage(
    discovery,
    language,
    artifactType
  );
  const loadResult = await buildEpisodeLoadResult(sourceFile, outputRoot);
  const baseDir = path.join(outputRoot, discovery.slug, language, artifactType);
  await ensureDir(baseDir);
  const canonicalScenePlanPath = path.join(
    outputRoot,
    discovery.slug,
    "shared",
    "scenes.json"
  );
  let scenePlan =
    language !== "en" &&
    artifactType === "full" &&
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
          artifactType
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
  const shortsImageConfig: ShortsImageConfig = {
    enabled: artifactType === "short",
    keySceneCount: Number(process.env["SHORTS_KEY_SCENE_COUNT"] ?? 5),
    portraitWidth: Number(process.env["SHORTS_PORTRAIT_WIDTH"] ?? 1088),
    portraitHeight: Number(process.env["SHORTS_PORTRAIT_HEIGHT"] ?? 1920),
    finalWidth: Number(process.env["SHORTS_FINAL_WIDTH"] ?? 1080),
    finalHeight: Number(process.env["SHORTS_FINAL_HEIGHT"] ?? 1920),
    reuseLandscapeImages: true,
    enablePanAndScan: true,
    enableBlurredFallback: true,
    forceRegenerateAll:
      (options.force ?? false) ||
      (process.env["SHORTS_FORCE_REGENERATE_ALL"] ?? "").toLowerCase() ===
        "true",
    selectionMode:
      (process.env["SHORTS_SELECTION_MODE"] as
        | "first-n"
        | "importance-based"
        | undefined) ?? "first-n",
  };
  if (process.env["SHORTS_IMPORTANCE_SCENE_IDS"]) {
    shortsImageConfig.importanceSceneIds = process.env[
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
          OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ?? "dry-run",
          OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
          OPENAI_IMAGE_SIZE:
            process.env["SHORTS_OPENAI_IMAGE_SIZE"] ?? "1024x1536",
          OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
          OPENAI_IMAGE_CONCURRENCY: process.env["OPENAI_IMAGE_CONCURRENCY"],
          OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
          OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
          OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
            options.reuseImages === false
              ? "false"
              : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
          OPENAI_IMAGE_FORCE:
            shortsImageConfig.forceRegenerateAll ? "true" : process.env["OPENAI_IMAGE_FORCE"],
          OPENAI_BASE_URL: process.env["OPENAI_BASE_URL"],
          OPENAI_ORGANIZATION: process.env["OPENAI_ORGANIZATION"],
          OPENAI_PROJECT: process.env["OPENAI_PROJECT"],
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
      }
    );
    reviewVideoPath = renderResult.cleanPath;
    await writeJsonAtomic(path.join(baseDir, "generation-manifest.json"), {
      episodeId: discovery.slug,
      language,
      artifactType,
      sourceSha256: loadResult.source.sourceSha256,
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
      generatedAt: nowIso(),
    });
  }
  const currentArtifactPath = await writeCurrentArtifactRecord(
    outputRoot,
    discovery.slug,
    language,
    artifactType,
    loadResult.source.sourceSha256
  );
  await writeEpisodeSummary(
    outputRoot,
    discovery.slug,
    language,
    artifactType,
    currentArtifactPath
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
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(resolveSourceRoot(options)),
    resolveEpisodeFilter(options)
  );
  const payload = {
    sourceRoot: resolveSourceRoot(options),
    outputRoot: resolveOutputRoot(options),
    episodes: discoveries,
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
  const discoveries = filterDiscoveries(
    await discoverEpisodeSources(sourceRoot),
    resolveEpisodeFilter(options)
  );
  const selected = discoveries[0];
  if (!selected) {
    throw new Error(`No episode found under ${sourceRoot}.`);
  }
  const summary = await prepareEnglishCanonical(
    sourceRoot,
    outputRoot,
    selected,
    options
  );
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
  await requireApproval(outputRoot, selected.slug, "en", "full");
  const languages = parseLanguageList(options.languages).filter(
    (language) => language !== "en"
  );
  const selectedLanguages: SupportedLanguage[] =
    languages.length > 0 ? languages : ["de", "es", "fr"];
  const outputs: Record<string, unknown>[] = [];
  for (const language of selectedLanguages) {
    outputs.push(
      await prepareEpisodeLanguage(
        sourceRoot,
        outputRoot,
        selected,
        language,
        "full",
        options
      )
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
  const summary = await prepareEpisodeLanguage(
    sourceRoot,
    outputRoot,
    selected,
    language,
    "short",
    options
  );
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

export async function commandEpisodeValidate(
  options: EpisodeCommandOptions
): Promise<void> {
  await commandEpisodeDryRun({ ...options, dryRun: true });
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
  const sourceFile = resolveSourceForLanguage(selected, language, artifactType);
  const current = await parseEpisodeSourceFile(sourceFile, outputRoot);
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
    `${JSON.stringify({ approval, episode: selected.slug, language, artifactType, current }, null, 2)}\n`
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
  const sourceFile = resolveSourceForLanguage(selected, language, artifactType);
  const current = await parseEpisodeSourceFile(sourceFile, outputRoot);
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
  process.stdout.write(`${JSON.stringify(approval, null, 2)}\n`);
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

export function registerEpisodeCommands(program: Command): void {
  const episode = program
    .command("episode")
    .alias("episodes")
    .description("Dark Truth multilingual workflow");
  episode
    .command("inspect")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--json", "emit JSON")
    .action(async (opts: EpisodeCommandOptions) => commandEpisodeInspect(opts));
  episode
    .command("dry-run")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .option("--json", "emit JSON")
    .action(async (opts: EpisodeCommandOptions) => commandEpisodeDryRun(opts));
  episode
    .command("analyze")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) => commandEpisodeAnalyze(opts));
  episode
    .command("plan")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) => commandEpisodePlan(opts));
  episode
    .command("english")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--dry-run", "do not execute paid providers")
    .action(async (opts: EpisodeCommandOptions) => commandEpisodeEnglish(opts));
  episode
    .command("localized")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--languages <comma-separated-languages>", "target languages")
    .option("--output-root <path>", "output root")
    .option("--reuse-images", "reuse canonical images", true)
    .option("--dry-run", "do not execute paid providers")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeLocalized(opts)
    );
  episode
    .command("short")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--output-root <path>", "output root")
    .option("--reuse-images", "reuse canonical images", true)
    .option("--dry-run", "do not execute paid providers")
    .action(async (opts: EpisodeCommandOptions) => commandEpisodeShort(opts));
  episode
    .command("status")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) => commandEpisodeStatus(opts));
  episode
    .command("sync-characters")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--force")
    .option("--json")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeSyncCharacters(opts)
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
      commandEpisodeBootstrapCharacters(opts)
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
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeValidate(opts)
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
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeReviewPrepare(opts)
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
      commandEpisodeReviewApprove(opts)
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
      commandEpisodeReviewReject(opts)
    );
  review
    .command("status")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--language <en|de|es|fr>", "language")
    .option("--artifact <full|short>", "artifact type", "full")
    .option("--output-root <path>", "output root")
    .action(async (opts: EpisodeCommandOptions) =>
      commandEpisodeReviewStatus(opts)
    );
}
