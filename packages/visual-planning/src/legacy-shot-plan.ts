import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  episodeFocalMetadataSchema,
  episodeIdSchema,
  focalRegionSchema,
  scenePlanSchema,
  shotPlanSchema,
  sourceImageFocalMetadataSchema,
  visualBudgetSchema,
  visualPacingProfileSchema,
  visualSourceSceneSchema,
  type EpisodeFocalMetadata,
  type FocalRegion,
  type Scene,
  type ShotPlan,
  type VisualBudget,
  type VisualNarrativePhase,
  type VisualPacingProfile,
  type VisualSourceScene,
} from "@mediaforge/domain";
import {
  shotTreatmentCatalog,
  shotTreatmentCatalogVersion,
} from "@mediaforge/domain/visual-retention/treatment-catalog.js";
import {
  assertInsideWorkspace,
  fileExists,
  hashFile,
  hashText,
  readJsonIfExists,
  resolveEpisodeFocalMetadataPath,
  resolveEpisodeImageManifestPath,
  resolveEpisodeShotPlanPath,
  resolveEpisodeShotValidationPath,
  resolveEpisodeVisualSourceScenesPath,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { deterministicShotPlanner, serializeShotPlan } from "./shot-planner.js";
import {
  validateShotPlan,
  type ShotPlanValidationResult,
} from "./shot-validation.js";

export type LegacyArtifactFormat =
  | "canonical-current"
  | "canonical-scene-plan-image-manifests"
  | "dark-truth-full-image-manifest"
  | "dark-truth-short-image-manifest"
  | "unsupported";

export type LegacyMigrationWarningCode =
  | "LEGACY_MANIFEST_UNSUPPORTED"
  | "LEGACY_MANIFEST_AMBIGUOUS"
  | "LEGACY_SCENE_TIMING_INVALID"
  | "LEGACY_IMAGE_MISSING"
  | "LEGACY_IMAGE_UNREADABLE"
  | "LEGACY_IMAGE_HASH_FAILED"
  | "LEGACY_IMAGE_DIMENSIONS_INVALID"
  | "LEGACY_SOURCE_REFERENCE_MISMATCH"
  | "LEGACY_CROP_UNSAFE"
  | "LEGACY_RESOLUTION_INSUFFICIENT"
  | "LEGACY_PLAN_VALIDATION_FAILED"
  | "LEGACY_ARTIFACT_WRITE_FAILED";

export interface LegacyMigrationWarning {
  readonly code: LegacyMigrationWarningCode;
  readonly message: string;
  readonly sceneId?: string;
  readonly sourceImageId?: string;
  readonly path?: string;
}

export interface MigrateLegacyEpisodeInput {
  readonly episodeWorkspace: string;
  readonly variant: "full" | "short";
  readonly locale: string;
  readonly pacingProfile?: VisualPacingProfile;
  readonly visualBudget?: VisualBudget;
  readonly dryRun?: boolean;
}

export interface LegacyMigrationResult {
  readonly status:
    | "migrated"
    | "already-current"
    | "migrated-with-warnings"
    | "blocked";
  readonly sourceFormat: LegacyArtifactFormat;
  readonly artifactsWritten: readonly string[];
  readonly warnings: readonly LegacyMigrationWarning[];
  readonly validation: ShotPlanValidationResult;
  readonly requiresImageRegeneration: boolean;
  readonly scenesFound: number;
  readonly imagesFound: number;
  readonly focalMetadataGenerated: number;
  readonly plannedShotCount: number;
}

interface LegacyImageReference {
  readonly sceneId: string;
  readonly sourceImageId: string;
  readonly imagePath: string;
  readonly sha256?: string;
  readonly focalRegions?: readonly FocalRegion[];
}

interface LegacyDiscovery {
  readonly format: Exclude<LegacyArtifactFormat, "canonical-current" | "unsupported">;
  readonly scenePlan: z.infer<typeof scenePlanSchema>;
  readonly images: readonly LegacyImageReference[];
  readonly warnings: readonly LegacyMigrationWarning[];
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const sceneManifestSchema = z
  .object({
    sceneId: z.string(),
    outputPath: z.string(),
    outputSha256: sha256Schema.optional(),
    focalRegions: z.array(focalRegionSchema).optional(),
  })
  .passthrough();

const darkTruthFullManifestSchema = z
  .object({
    assets: z.array(
      z
        .object({
          canonicalSceneId: z.string(),
          relativePath: z.string(),
          sha256: sha256Schema.optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

const darkTruthShortManifestSchema = z
  .object({
    entries: z.array(
      z
        .object({
          sceneId: z.string(),
          status: z.string().optional(),
          outputImagePath: z.string(),
          outputImageSha256: sha256Schema.optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

const validationArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  valid: z.boolean(),
  issues: z.array(z.unknown()),
  metrics: z.unknown(),
});

export async function migrateLegacyEpisodeShots(
  input: MigrateLegacyEpisodeInput
): Promise<LegacyMigrationResult> {
  const episodeWorkspace = path.resolve(input.episodeWorkspace);
  const episodeId = episodeIdSchema.parse(path.basename(episodeWorkspace));
  const locale = input.locale;
  const variant = input.variant;
  const paths = canonicalPaths({ episodeWorkspace, locale, variant });
  const existing = await loadExistingCurrent(paths, input);
  if (existing) {
    return existing;
  }

  const discovery = await discoverLegacyArtifacts(episodeWorkspace);
  if (!discovery) {
    return blockedResult({
      sourceFormat: "unsupported",
      warnings: [
        {
          code: "LEGACY_MANIFEST_UNSUPPORTED",
          message:
            "No supported legacy scene/image manifest combination was found.",
        },
      ],
    });
  }

  const normalized = await normalizeLegacyDiscovery({
    episodeWorkspace,
    episodeId,
    discovery,
  });
  if (normalized.blockers.length > 0) {
    return blockedResult({
      sourceFormat: discovery.format,
      warnings: [...discovery.warnings, ...normalized.blockers],
      scenesFound: discovery.scenePlan.scenes.length,
      imagesFound: discovery.images.length,
      requiresImageRegeneration: normalized.blockers.some(isRegenerationBlocker),
    });
  }

  const pacingProfile =
    input.pacingProfile ?? defaultPacingProfile(variant);
  const visualBudget = input.visualBudget ?? defaultVisualBudget(variant);
  const seed = hashText(
    JSON.stringify({
      migration: "legacy-shot-migration-v1",
      episodeId,
      locale,
      variant,
      sceneInputs: normalized.sourceScenes.map((scene) => ({
        sceneId: scene.sceneId,
        sourceImageId: scene.sourceImageId,
        sourceImageSha256: scene.sourceImageSha256,
        narrationStartMs: scene.narrationStartMs,
        narrationEndMs: scene.narrationEndMs,
      })),
      pacingProfileId: pacingProfile.id,
      aspectRatio: variant === "short" ? "9:16" : "16:9",
    })
  );
  const shotPlan = await planMigrationShots({
    episodeId,
    locale,
    variant,
    sourceScenes: normalized.sourceScenes,
    pacingProfile,
    visualBudget,
    seed,
  });
  if ("warning" in shotPlan) {
    return blockedResult({
      sourceFormat: discovery.format,
      warnings: [...discovery.warnings, ...normalized.warnings, shotPlan.warning],
      scenesFound: discovery.scenePlan.scenes.length,
      imagesFound: discovery.images.length,
    });
  }
  const validation = validateShotPlan({
    shotPlan,
    pacingProfile,
    visualBudget,
    treatmentCatalog: shotTreatmentCatalog,
    focalMetadata: normalized.focalMetadata,
  });
  const validationWarnings: LegacyMigrationWarning[] = validation.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({
      code: "LEGACY_PLAN_VALIDATION_FAILED" as const,
      message: `${issue.code}: ${issue.message}`,
      ...(issue.sceneId ? { sceneId: issue.sceneId } : {}),
      ...(issue.shotId ? { sourceImageId: issue.shotId } : {}),
    }));
  const warnings = [
    ...discovery.warnings,
    ...normalized.warnings,
    ...validationWarnings,
  ];
  if (!validation.valid) {
    return {
      status: "blocked",
      sourceFormat: discovery.format,
      artifactsWritten: [],
      warnings,
      validation,
      requiresImageRegeneration: validation.issues.some(
        (issue) => issue.code === "LOW_RESOLUTION_CROP_RISK"
      ),
      scenesFound: discovery.scenePlan.scenes.length,
      imagesFound: discovery.images.length,
      focalMetadataGenerated: normalized.focalMetadata.images.length,
      plannedShotCount: shotPlan.shots.length,
    };
  }

  const artifactsWritten = input.dryRun
    ? [
        paths.sourceScenesPath,
        paths.focalMetadataPath,
        paths.shotPlanPath,
        paths.validationPath,
      ]
    : await persistCanonicalArtifacts({
        paths,
        sourceScenes: normalized.sourceScenes,
        focalMetadata: normalized.focalMetadata,
        shotPlan,
        validation,
      });

  return {
    status: warnings.length > 0 ? "migrated-with-warnings" : "migrated",
    sourceFormat: discovery.format,
    artifactsWritten,
    warnings,
    validation,
    requiresImageRegeneration: warnings.some(isRegenerationBlocker),
    scenesFound: discovery.scenePlan.scenes.length,
    imagesFound: discovery.images.length,
    focalMetadataGenerated: normalized.focalMetadata.images.length,
    plannedShotCount: shotPlan.shots.length,
  };
}

function canonicalPaths(args: {
  readonly episodeWorkspace: string;
  readonly locale: string;
  readonly variant: "full" | "short";
}) {
  return {
    sourceScenesPath: resolveEpisodeVisualSourceScenesPath(args.episodeWorkspace),
    focalMetadataPath: resolveEpisodeFocalMetadataPath(args.episodeWorkspace),
    shotPlanPath: resolveEpisodeShotPlanPath({
      episodeDir: args.episodeWorkspace,
      locale: z.enum(["en", "de", "es", "fr", "pt"]).parse(args.locale),
      variant: args.variant,
    }),
    validationPath: resolveEpisodeShotValidationPath({
      episodeDir: args.episodeWorkspace,
      locale: z.enum(["en", "de", "es", "fr", "pt"]).parse(args.locale),
      variant: args.variant,
    }),
  };
}

async function loadExistingCurrent(
  paths: ReturnType<typeof canonicalPaths>,
  input: MigrateLegacyEpisodeInput
): Promise<LegacyMigrationResult | null> {
  const [sourceScenes, focalMetadata, shotPlan, validationArtifact] =
    await Promise.all([
      readJsonIfExists(paths.sourceScenesPath, (value) =>
        z.array(visualSourceSceneSchema).parse(value)
      ),
      readJsonIfExists(paths.focalMetadataPath, (value) =>
        episodeFocalMetadataSchema.parse(value)
      ),
      readJsonIfExists(paths.shotPlanPath, (value) => shotPlanSchema.parse(value)),
      readJsonIfExists(paths.validationPath, (value) =>
        validationArtifactSchema.parse(value)
      ),
    ]);
  if (!sourceScenes || !focalMetadata || !shotPlan || !validationArtifact) {
    return null;
  }
  const parsedShotPlan = shotPlan;
  if (!parsedShotPlan) {
    return null;
  }
  const pacingProfile =
    parsedShotPlan.pacingProfile.mode === "inline"
      ? parsedShotPlan.pacingProfile.profile
      : (input.pacingProfile ?? defaultPacingProfile(input.variant));
  const validation = validateShotPlan({
    shotPlan: parsedShotPlan,
    pacingProfile,
    visualBudget: parsedShotPlan.visualBudget,
    treatmentCatalog: shotTreatmentCatalog,
    focalMetadata,
  });
  if (!validation.valid) {
    return null;
  }
  return {
    status: "already-current",
    sourceFormat: "canonical-current",
    artifactsWritten: [],
    warnings: [],
    validation,
    requiresImageRegeneration: false,
    scenesFound: sourceScenes.length,
    imagesFound: sourceScenes.length,
    focalMetadataGenerated: focalMetadata.images.length,
    plannedShotCount: parsedShotPlan.shots.length,
  };
}

async function discoverLegacyArtifacts(
  episodeWorkspace: string
): Promise<LegacyDiscovery | null> {
  const scenePlan = await readJsonIfExists(
    path.join(episodeWorkspace, "canonical", "scenes.json"),
    (value) => scenePlanSchema.parse(value)
  );
  if (!scenePlan) {
    return null;
  }
  const discoveries = (
    await Promise.all([
      discoverDarkTruthFull(episodeWorkspace, scenePlan),
      discoverDarkTruthShort(episodeWorkspace, scenePlan),
      discoverPerSceneManifests(episodeWorkspace, scenePlan),
    ])
  ).filter((value): value is LegacyDiscovery => value !== null);
  if (discoveries.length === 0) {
    return null;
  }
  if (discoveries.length > 1) {
    const preferred = discoveries.find(
      (entry) => entry.format === "canonical-scene-plan-image-manifests"
    );
    if (preferred) {
      return preferred;
    }
    return {
      format: discoveries[0]!.format,
      scenePlan,
      images: [],
      warnings: [
        {
          code: "LEGACY_MANIFEST_AMBIGUOUS",
          message:
            "Multiple legacy image manifest shapes were found; canonical per-scene manifests were absent.",
        },
      ],
    };
  }
  return discoveries[0]!;
}

async function discoverPerSceneManifests(
  episodeWorkspace: string,
  scenePlan: z.infer<typeof scenePlanSchema>
): Promise<LegacyDiscovery | null> {
  const images: LegacyImageReference[] = [];
  for (const scene of scenePlan.scenes) {
    const manifestPath = resolveEpisodeImageManifestPath(
      episodeWorkspace,
      scene.id
    );
    const manifest = await readLegacyManifest(
      manifestPath,
      sceneManifestSchema,
      "canonical-scene-plan-image-manifests",
      scenePlan
    );
    if (isBlockedDiscovery(manifest)) {
      return manifest;
    }
    if (!manifest) {
      return null;
    }
    images.push({
      sceneId: manifest.sceneId,
      sourceImageId: sourceImageIdForScene(manifest.sceneId),
      imagePath: resolveContainedLegacyPath(episodeWorkspace, manifest.outputPath),
      ...(manifest.outputSha256 ? { sha256: manifest.outputSha256 } : {}),
      ...(manifest.focalRegions ? { focalRegions: manifest.focalRegions } : {}),
    });
  }
  return {
    format: "canonical-scene-plan-image-manifests",
    scenePlan,
    images,
    warnings: [],
  };
}

async function discoverDarkTruthFull(
  episodeWorkspace: string,
  scenePlan: z.infer<typeof scenePlanSchema>
): Promise<LegacyDiscovery | null> {
  const manifestPath = path.join(episodeWorkspace, "shared", "image-manifest.json");
  const manifest = await readLegacyManifest(
    manifestPath,
    darkTruthFullManifestSchema,
    "dark-truth-full-image-manifest",
    scenePlan
  );
  if (isBlockedDiscovery(manifest)) {
    return manifest;
  }
  if (!manifest) {
    return null;
  }
  const sharedDir = path.dirname(manifestPath);
  return {
    format: "dark-truth-full-image-manifest",
    scenePlan,
    images: manifest.assets.map((asset) => ({
      sceneId: asset.canonicalSceneId,
      sourceImageId: sourceImageIdForScene(asset.canonicalSceneId),
      imagePath: resolveContainedLegacyPath(
        episodeWorkspace,
        path.resolve(sharedDir, asset.relativePath)
      ),
      ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
    })),
    warnings: [],
  };
}

async function discoverDarkTruthShort(
  episodeWorkspace: string,
  scenePlan: z.infer<typeof scenePlanSchema>
): Promise<LegacyDiscovery | null> {
  const manifestPath = path.join(
    episodeWorkspace,
    "shared",
    "short",
    "images",
    "shorts-image-manifest.json"
  );
  const manifest = await readLegacyManifest(
    manifestPath,
    darkTruthShortManifestSchema,
    "dark-truth-short-image-manifest",
    scenePlan
  );
  if (isBlockedDiscovery(manifest)) {
    return manifest;
  }
  if (!manifest) {
    return null;
  }
  return {
    format: "dark-truth-short-image-manifest",
    scenePlan,
    images: manifest.entries
      .filter((entry) => entry.status === undefined || entry.status === "success")
      .map((entry) => ({
        sceneId: entry.sceneId,
        sourceImageId: sourceImageIdForScene(entry.sceneId),
        imagePath: resolveContainedLegacyPath(
          episodeWorkspace,
          entry.outputImagePath
        ),
        ...(entry.outputImageSha256
          ? { sha256: entry.outputImageSha256 }
          : {}),
      })),
    warnings: [],
  };
}

async function readLegacyManifest<T>(
  filePath: string,
  schema: z.ZodType<T>,
  format: LegacyDiscovery["format"],
  scenePlan: z.infer<typeof scenePlanSchema>
): Promise<T | LegacyDiscovery | null> {
  try {
    return await readJsonIfExists(filePath, (value) => schema.parse(value));
  } catch {
    return {
      format,
      scenePlan,
      images: [],
      warnings: [
        {
          code: "LEGACY_MANIFEST_UNSUPPORTED",
          message: `Legacy manifest has an unsupported shape: ${filePath}`,
          path: filePath,
        },
      ],
    };
  }
}

function isBlockedDiscovery(value: unknown): value is LegacyDiscovery {
  return (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    "scenePlan" in value &&
    "images" in value &&
    "warnings" in value
  );
}

async function normalizeLegacyDiscovery(args: {
  readonly episodeWorkspace: string;
  readonly episodeId: z.infer<typeof episodeIdSchema>;
  readonly discovery: LegacyDiscovery;
}): Promise<{
  readonly sourceScenes: readonly VisualSourceScene[];
  readonly focalMetadata: EpisodeFocalMetadata;
  readonly warnings: readonly LegacyMigrationWarning[];
  readonly blockers: readonly LegacyMigrationWarning[];
}> {
  const warnings: LegacyMigrationWarning[] = [];
  const blockers: LegacyMigrationWarning[] = [];
  const imageByScene = new Map<string, LegacyImageReference>();
  for (const image of args.discovery.images) {
    if (imageByScene.has(image.sceneId)) {
      blockers.push({
        code: "LEGACY_SOURCE_REFERENCE_MISMATCH",
        message: `Duplicate image reference for ${image.sceneId}.`,
        sceneId: image.sceneId,
      });
    }
    imageByScene.set(image.sceneId, image);
  }

  const sourceScenes: VisualSourceScene[] = [];
  const focalImages: EpisodeFocalMetadata["images"] = [];
  for (const [index, scene] of args.discovery.scenePlan.scenes.entries()) {
    const timing = sceneTimingMs(scene);
    if (!timing) {
      blockers.push({
        code: "LEGACY_SCENE_TIMING_INVALID",
        message: `Invalid scene timing for ${scene.id}.`,
        sceneId: scene.id,
      });
      continue;
    }
    const image = imageByScene.get(scene.id);
    if (!image) {
      blockers.push({
        code: "LEGACY_SOURCE_REFERENCE_MISMATCH",
        message: `No image manifest entry references ${scene.id}.`,
        sceneId: scene.id,
      });
      continue;
    }
    if (!(await fileExists(image.imagePath))) {
      blockers.push({
        code: "LEGACY_IMAGE_MISSING",
        message: `Missing image for ${scene.id}.`,
        sceneId: scene.id,
        sourceImageId: image.sourceImageId,
        path: image.imagePath,
      });
      continue;
    }
    const hash = image.sha256 ?? (await hashImage(image, blockers));
    if (!hash) {
      continue;
    }
    const dimensions = await readImageDimensions(image, blockers);
    if (!dimensions) {
      continue;
    }
    if (dimensions.width < 1080 || dimensions.height < 1080) {
      warnings.push({
        code: "LEGACY_RESOLUTION_INSUFFICIENT",
        message: `Image ${image.sourceImageId} is below conservative 1080px dimensions.`,
        sceneId: scene.id,
        sourceImageId: image.sourceImageId,
        path: image.imagePath,
      });
    }
    const focalRegions =
      image.focalRegions && image.focalRegions.length > 0
        ? [...image.focalRegions]
        : conservativeFocalRegions(image.sourceImageId, dimensions);
    focalImages.push(
      sourceImageFocalMetadataSchema.parse({
        schemaVersion: 1,
        analysisVersion: "focal-metadata-v1",
        sourceImageId: image.sourceImageId,
        sourceImagePath: path.relative(args.episodeWorkspace, image.imagePath),
        sourceImageSha256: hash,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        origin: image.focalRegions ? "imported" : "local-fallback",
        focalRegions,
        warnings: image.focalRegions
          ? []
          : [
              "Conservative geometric fallback only; no face or object detection was performed.",
            ],
        limitations: image.focalRegions
          ? []
          : [
              "Legacy migration avoided aggressive close-ups and evidence-specific framing.",
            ],
      })
    );
    sourceScenes.push(
      visualSourceSceneSchema.parse({
        sourceSceneId: `legacy-${scene.id}`,
        sceneId: scene.id,
        narrationStartMs: timing.startMs,
        narrationEndMs: timing.endMs,
        sourceImageId: image.sourceImageId,
        sourceImagePath: path.relative(args.episodeWorkspace, image.imagePath),
        sourceImageSha256: hash,
        importance: visualPhaseForScene(index, args.discovery.scenePlan.scenes.length),
        focalRegions,
      })
    );
  }

  return {
    sourceScenes,
    focalMetadata: episodeFocalMetadataSchema.parse({
      schemaVersion: 1,
      analysisVersion: "focal-metadata-v1",
      images: focalImages.sort((left, right) =>
        left.sourceImageId.localeCompare(right.sourceImageId)
      ),
    }),
    warnings,
    blockers,
  };
}

function sceneTimingMs(scene: Scene): { readonly startMs: number; readonly endMs: number } | null {
  const startMs = Math.round(scene.timing.startSeconds * 1000);
  const endMs = Math.round(scene.timing.endSeconds * 1000);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    ? { startMs, endMs }
    : null;
}

async function hashImage(
  image: LegacyImageReference,
  blockers: LegacyMigrationWarning[]
): Promise<string | null> {
  try {
    return await hashFile(image.imagePath);
  } catch {
    blockers.push({
      code: "LEGACY_IMAGE_HASH_FAILED",
      message: `Could not hash image ${image.sourceImageId}.`,
      sceneId: image.sceneId,
      sourceImageId: image.sourceImageId,
      path: image.imagePath,
    });
    return null;
  }
}

async function readImageDimensions(
  image: LegacyImageReference,
  blockers: LegacyMigrationWarning[]
): Promise<{ readonly width: number; readonly height: number } | null> {
  try {
    const metadata = await sharp(image.imagePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("missing dimensions");
    }
    return { width: metadata.width, height: metadata.height };
  } catch {
    blockers.push({
      code: "LEGACY_IMAGE_UNREADABLE",
      message: `Could not read image dimensions for ${image.sourceImageId}.`,
      sceneId: image.sceneId,
      sourceImageId: image.sourceImageId,
      path: image.imagePath,
    });
    return null;
  }
}

function conservativeFocalRegions(
  sourceImageId: string,
  dimensions: { readonly width: number; readonly height: number }
): readonly FocalRegion[] {
  const portrait = dimensions.height > dimensions.width;
  const square = dimensions.height === dimensions.width;
  return z.array(focalRegionSchema).parse([
    {
      id: `${sourceImageId}-safe-crop`,
      kind: "safe-crop-region",
      bounds: square
        ? { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
        : portrait
          ? { x: 0.1, y: 0.08, width: 0.8, height: 0.84 }
          : { x: 0.08, y: 0.12, width: 0.84, height: 0.76 },
      confidence: 0.25,
      label: "legacy-conservative-central-safe-crop",
    },
    {
      id: `${sourceImageId}-caption-safe`,
      kind: "caption-safe-negative-space",
      bounds: square
        ? { x: 0.1, y: 0.04, width: 0.8, height: 0.16 }
        : portrait
          ? { x: 0.1, y: 0.04, width: 0.8, height: 0.18 }
          : { x: 0.08, y: 0.04, width: 0.84, height: 0.16 },
      confidence: 0.15,
      label: "legacy-heuristic-caption-safe-band",
    },
  ]);
}

function migrationSafeRestrictions() {
  return {
    enabledTreatmentIds: [
      "establishing-wide-crop",
      "medium-crop",
      "rule-of-thirds-reposition",
      "vertical-smart-crop",
      "caption-safe-negative-space-crop",
      "slow-push-in",
      "slow-pull-out",
      "lateral-pan",
      "vertical-pan",
      "pan-and-scan",
      "smart-crop",
      "blurred-fill",
    ],
    allowNonDefaultTreatments: false,
    allowCacheRequiredTreatments: false,
    allowBlurredFillFallback: true,
  } as const;
}

async function planMigrationShots(args: {
  readonly episodeId: z.infer<typeof episodeIdSchema>;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly sourceScenes: readonly VisualSourceScene[];
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly seed: string;
}): Promise<ShotPlan | { readonly warning: LegacyMigrationWarning }> {
  try {
    return deterministicShotPlanner.plan({
      sourceId: args.episodeId,
      locale: args.locale,
      platform: args.variant,
      aspectRatio: args.variant === "short" ? "9:16" : "16:9",
      sourceScenes: args.sourceScenes,
      pacingProfile: args.pacingProfile,
      visualBudget: args.visualBudget,
      treatmentCatalogVersion: shotTreatmentCatalogVersion,
      seed: args.seed,
      restrictions: migrationSafeRestrictions(),
    });
  } catch (error) {
    return {
      warning: {
        code: "LEGACY_PLAN_VALIDATION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Legacy shot planning failed.",
      },
    };
  }
}

async function persistCanonicalArtifacts(args: {
  readonly paths: ReturnType<typeof canonicalPaths>;
  readonly sourceScenes: readonly VisualSourceScene[];
  readonly focalMetadata: EpisodeFocalMetadata;
  readonly shotPlan: ShotPlan;
  readonly validation: ShotPlanValidationResult;
}): Promise<readonly string[]> {
  const validationArtifact = {
    schemaVersion: 1 as const,
    valid: args.validation.valid,
    issues: args.validation.issues,
    metrics: args.validation.metrics,
  };
  const writes = [
    [args.paths.sourceScenesPath, args.sourceScenes] as const,
    [args.paths.focalMetadataPath, args.focalMetadata] as const,
    [args.paths.validationPath, validationArtifact] as const,
    [args.paths.shotPlanPath, args.shotPlan] as const,
  ];
  const written: string[] = [];
  for (const [filePath, value] of writes) {
    const next = `${JSON.stringify(value, null, 2)}\n`;
    const current = await fs.readFile(filePath, "utf8").catch(() => null);
    if (
      current === next ||
      (filePath === args.paths.shotPlanPath &&
        current === `${serializeShotPlan(args.shotPlan)}\n`)
    ) {
      continue;
    }
    await writeJsonAtomic(filePath, value);
    written.push(filePath);
  }
  return written;
}

function resolveContainedLegacyPath(episodeWorkspace: string, candidate: string): string {
  if (/^https?:\/\//iu.test(candidate)) {
    throw new Error(`Remote legacy image paths are unsupported: ${candidate}`);
  }
  const resolved = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(episodeWorkspace, candidate);
  return assertInsideWorkspace(episodeWorkspace, resolved);
}

function sourceImageIdForScene(sceneId: string): string {
  return `source-image-${sceneId}`;
}

function visualPhaseForScene(
  index: number,
  total: number
): VisualNarrativePhase {
  if (index === 0) {
    return "hook";
  }
  if (index === total - 1) {
    return "callback";
  }
  const ratio = total <= 1 ? 1 : index / (total - 1);
  if (ratio >= 0.82) {
    return "climax";
  }
  if (ratio >= 0.58) {
    return "escalation";
  }
  if (ratio >= 0.35) {
    return "evidence";
  }
  return "setup";
}

function defaultPacingProfile(variant: "full" | "short"): VisualPacingProfile {
  return visualPacingProfileSchema.parse(
    variant === "short"
      ? {
          id: "shorts-aggressive",
          shotDurationMs: { minMs: 1000, maxMs: 5000 },
          staticShotDurationMs: { minMs: 1000, maxMs: 3000 },
          movingShotDurationMs: { minMs: 1000, maxMs: 6000 },
          openingCadenceMs: { minMs: 1500, maxMs: 3500 },
          climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
        }
      : {
          id: "balanced",
          shotDurationMs: { minMs: 2000, maxMs: 8000 },
          staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
          movingShotDurationMs: { minMs: 2000, maxMs: 10000 },
          openingCadenceMs: { minMs: 3000, maxMs: 6000 },
          climaxCadenceMs: { minMs: 2000, maxMs: 5000 },
        }
  );
}

function defaultVisualBudget(variant: "full" | "short"): VisualBudget {
  const shortBudget = {
    sourceImageCount: { min: 5, max: 12 },
    shotCount: { min: 5, max: 35 },
    shotsPerImage: { min: 1, max: 4 },
    maxConsecutiveSourceImageUses: 4,
    maxTotalSourceImageUses: 6,
    cropLimits: {
      minCropArea: 0.35,
      minFaceMargin: 0.08,
      maxCropZoom: 2,
      minOutputHeightPx: 1080,
      maxAdjacentSameImageCropIou: 0.82,
    },
    motionLimits: {
      minShotDurationMs: 1000,
      pushInScaleRange: { min: 1.03, max: 1.14 },
      fastPushInScaleRange: { min: 1.08, max: 1.22 },
      panTravelFractionOfImage: { min: 0.03, max: 0.12 },
      rotationDegreesRange: { min: -1, max: 1 },
      dissolveDurationMs: { minMs: 120, maxMs: 250 },
      dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
    },
    effectCaps: [
      { effect: "blurred-fill", maxShare: 0.2, scope: "video" },
      {
        effect: "surveillance-glitch-static-combined",
        maxShare: 0.15,
        scope: "video",
      },
      { effect: "fast-zoom", maxCount: 0, scope: "video" },
      { effect: "parallax", maxCount: 0, scope: "video" },
    ],
  };
  return visualBudgetSchema.parse(
    variant === "short"
      ? shortBudget
      : {
          ...shortBudget,
          sourceImageCount: { min: 5, max: 35 },
          shotCount: { min: 5, max: 85 },
          shotsPerImage: { min: 1, max: 3 },
          motionLimits: {
            ...shortBudget.motionLimits,
            minShotDurationMs: 2000,
            pushInScaleRange: { min: 1.02, max: 1.1 },
            panTravelFractionOfImage: { min: 0.02, max: 0.08 },
            rotationDegreesRange: { min: -0.5, max: 0.5 },
            dissolveDurationMs: { minMs: 200, maxMs: 500 },
          },
        }
  );
}

function blockedResult(args: {
  readonly sourceFormat: LegacyArtifactFormat;
  readonly warnings: readonly LegacyMigrationWarning[];
  readonly scenesFound?: number;
  readonly imagesFound?: number;
  readonly requiresImageRegeneration?: boolean;
}): LegacyMigrationResult {
  return {
    status: "blocked",
    sourceFormat: args.sourceFormat,
    artifactsWritten: [],
    warnings: args.warnings,
    validation: {
      valid: false,
      issues: [],
      metrics: {
        totalShots: 0,
        uniqueSourceImages: 0,
        averageShotDurationMs: 0,
        medianShotDurationMs: 0,
        longestShotDurationMs: 0,
        longestStaticIntervalMs: 0,
        openingMeaningfulChanges: 0,
        climaxAverageShotDurationMs: null,
        averageShotsPerSourceImage: 0,
        maximumConsecutiveSourceImageUses: 0,
        treatmentCounts: {},
        transitionCounts: {},
      },
    },
    requiresImageRegeneration:
      args.requiresImageRegeneration ??
      args.warnings.some(isRegenerationBlocker),
    scenesFound: args.scenesFound ?? 0,
    imagesFound: args.imagesFound ?? 0,
    focalMetadataGenerated: 0,
    plannedShotCount: 0,
  };
}

function isRegenerationBlocker(warning: LegacyMigrationWarning): boolean {
  return (
    warning.code === "LEGACY_IMAGE_MISSING" ||
    warning.code === "LEGACY_IMAGE_UNREADABLE" ||
    warning.code === "LEGACY_IMAGE_DIMENSIONS_INVALID" ||
    warning.code === "LEGACY_RESOLUTION_INSUFFICIENT" ||
    warning.code === "LEGACY_CROP_UNSAFE" ||
    warning.code === "LEGACY_SOURCE_REFERENCE_MISMATCH"
  );
}
