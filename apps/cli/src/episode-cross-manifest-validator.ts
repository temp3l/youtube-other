import fs from "node:fs/promises";
import path from "node:path";
import {
  imageAssetSchema,
  scenePlanSchema,
  type ScenePlan,
} from "@mediaforge/domain";
import { validateImageAssets } from "@mediaforge/image-generation";
import { youtubeMetadataSchema } from "@mediaforge/metadata";
import { renderManifestSchema, type ParsedRenderManifest } from "@mediaforge/rendering";
import {
  createNarrationArtifactPaths,
  narrationAssemblyManifestSchema,
  narrationChunkManifestSchema,
  narrationDirectionSetSchema,
  narrationQualityGateReportSchema,
} from "@mediaforge/speech";
import { ensureWorkspacePath, fileExists, hashFile } from "@mediaforge/shared";
import { z } from "zod";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/iu);
const variantSchema = z.enum(["full", "short"]);
const languageSchema = z.enum(["en", "de", "es", "fr"]);

const sourceMetadataSchema = z
  .object({
    episodeId: z.string().min(1),
    language: z.string().min(1),
    variant: variantSchema,
    absolutePath: z.string().min(1).optional(),
    canonicalRelativePath: z.string().min(1),
    contentHash: hashSchema,
    resolverVersion: z.string().min(1),
    cacheIdentity: z.string().min(1),
  })
  .passthrough();

const generationManifestSchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    episodeId: z.string().min(1),
    language: z.string().min(1),
    artifactType: variantSchema,
    sourceSha256: hashSchema,
    source: sourceMetadataSchema.optional(),
    scenePlanPath: z.string().min(1).optional(),
    visualPlanPath: z.string().min(1).optional(),
    imageManifestPath: z.string().min(1).optional(),
    narrationManifestPath: z.string().min(1).optional(),
    renderManifestPath: z.string().min(1).optional(),
    audioPath: z.string().min(1).optional(),
    videoPath: z.string().min(1).optional(),
    subtitleSidecars: z.array(z.string().min(1)).optional(),
    visualRetention: z
      .object({
        sourceScenesPath: z.string().min(1),
        focalMetadataPath: z.string().min(1),
        shotPlanPath: z.string().min(1),
        validationPath: z.string().min(1),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const visualPlanSchema = z
  .object({
    episodeId: z.string().min(1),
    language: z.string().min(1),
    artifactType: variantSchema,
    scenes: z.array(
      z
        .object({
          sceneId: z.string().min(1),
          sequenceNumber: z.number().int().positive().optional(),
          startSeconds: z.number().nonnegative().optional(),
          endSeconds: z.number().nonnegative().optional(),
          expectedImageFilenames: z.array(z.string().min(1)).optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

const legacyMetadataSchema = z
  .object({
    episode: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
    artifactType: variantSchema.optional(),
    format: z
      .object({
        aspectRatio: z.enum(["16:9", "9:16"]).optional(),
      })
      .passthrough()
      .optional(),
    source: z
      .object({
        sceneCount: z.number().int().positive().optional(),
        language: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const currentArtifactSchema = z
  .object({
    episodeSlug: z.string().min(1),
    language: z.string().min(1),
    artifactType: variantSchema,
    currentArtifactPath: z.string().min(1),
    artifactSha256: hashSchema.optional(),
    sourceSha256: hashSchema.optional(),
    source: sourceMetadataSchema.optional(),
  })
  .passthrough();

type GenerationManifest = z.infer<typeof generationManifestSchema>;
type CurrentArtifact = z.infer<typeof currentArtifactSchema>;
type YoutubeMetadata = z.infer<typeof youtubeMetadataSchema>;

export type CrossManifestValidationCode =
  | "VALID"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "PATH_ESCAPE"
  | "MISSING_ARTIFACT"
  | "INVALID_SCHEMA"
  | "WRONG_LANGUAGE"
  | "WRONG_VARIANT"
  | "WRONG_EPISODE"
  | "STALE_SOURCE_IDENTITY"
  | "BROKEN_REFERENCE"
  | "MISSING_SCENE"
  | "MISSING_IMAGE_ASSET"
  | "UNKNOWN_NARRATION_SEGMENT"
  | "ARTIFACT_MISMATCH";

export type CrossManifestArtifactType =
  | "cross-manifest"
  | "generation-manifest"
  | "scene-plan"
  | "visual-plan"
  | "image-manifest"
  | "image-asset"
  | "narration-manifest"
  | "render-manifest"
  | "metadata"
  | "checkpoint-state";

export type CrossManifestValidationResult =
  | {
      readonly state: "valid";
      readonly validationCode: "VALID";
      readonly artifactType: CrossManifestArtifactType;
      readonly message: string;
      readonly relativePath?: string;
      readonly contentHash?: string;
      readonly resolverVersion?: string;
      readonly cacheIdentity?: string;
    }
  | {
      readonly state: "invalid";
      readonly validationCode: Exclude<CrossManifestValidationCode, "VALID">;
      readonly artifactType: CrossManifestArtifactType;
      readonly message: string;
      readonly relativePath?: string;
      readonly contentHash?: string;
      readonly resolverVersion?: string;
      readonly cacheIdentity?: string;
      readonly expected?: string;
      readonly actual?: string;
    };

export interface CrossManifestSourceIdentity {
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly relativePath: string;
  readonly contentHash: string;
  readonly resolverVersion: string;
  readonly cacheIdentity: string;
}

export interface CrossManifestValidationInput {
  readonly episodeDir: string;
  readonly episodeSlug: string;
  readonly language: "en" | "de" | "es" | "fr";
  readonly variant: "full" | "short";
  readonly generationManifestPath: string;
  readonly expectedSource?: CrossManifestSourceIdentity;
}

function valid(
  input: Omit<CrossManifestValidationResult & { readonly state: "valid" }, "state" | "validationCode">
): CrossManifestValidationResult {
  return { state: "valid", validationCode: "VALID", ...input };
}

function invalid(
  input: Omit<CrossManifestValidationResult & { readonly state: "invalid" }, "state">
): CrossManifestValidationResult {
  return { state: "invalid", ...input };
}

function relativeTo(root: string, filePath: string): string {
  return path.relative(root, path.resolve(filePath)).replace(/\\/gu, "/");
}

function containedPath(args: {
  readonly root: string;
  readonly filePath: string;
  readonly artifactType: CrossManifestArtifactType;
  readonly label: string;
}):
  | { readonly ok: true; readonly path: string; readonly relativePath: string }
  | { readonly ok: false; readonly result: CrossManifestValidationResult } {
  try {
    const resolved = ensureWorkspacePath(
      args.root,
      path.isAbsolute(args.filePath) ? args.filePath : path.join(args.root, args.filePath)
    );
    return { ok: true, path: resolved, relativePath: relativeTo(args.root, resolved) };
  } catch {
    return {
      ok: false,
      result: invalid({
        validationCode: "PATH_ESCAPE",
        artifactType: args.artifactType,
        message: `${args.label} escapes the episode root.`,
        actual: args.filePath,
      }),
    };
  }
}

async function readJson<T>(
  filePath: string,
  parser: (value: unknown) => T
): Promise<
  | { readonly status: "missing" }
  | { readonly status: "invalid"; readonly message: string }
  | { readonly status: "valid"; readonly data: T }
> {
  const raw = await fs.readFile(filePath, "utf8").catch((error) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (raw === null) {
    return { status: "missing" };
  }
  try {
    return { status: "valid", data: parser(JSON.parse(raw) as unknown) };
  } catch (error) {
    return {
      status: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readRequired<T>(args: {
  readonly results: CrossManifestValidationResult[];
  readonly filePath: string;
  readonly root: string;
  readonly artifactType: CrossManifestArtifactType;
  readonly parser: (value: unknown) => T;
}): Promise<T | null> {
  const parsed = await readJson(args.filePath, args.parser);
  const relativePath = relativeTo(args.root, args.filePath);
  if (parsed.status === "missing") {
    args.results.push(
      invalid({
        validationCode: "MISSING_ARTIFACT",
        artifactType: args.artifactType,
        message: "Required artifact is missing.",
        relativePath,
      })
    );
    return null;
  }
  if (parsed.status === "invalid") {
    args.results.push(
      invalid({
        validationCode: "INVALID_SCHEMA",
        artifactType: args.artifactType,
        message: parsed.message,
        relativePath,
      })
    );
    return null;
  }
  args.results.push(
    valid({
      artifactType: args.artifactType,
      message: "Artifact exists and matches its schema.",
      relativePath,
    })
  );
  return parsed.data;
}

async function readOptional<T>(filePath: string, parser: (value: unknown) => T): Promise<T | null> {
  const parsed = await readJson(filePath, parser);
  return parsed.status === "valid" ? parsed.data : null;
}

function pushIdentityResult(args: {
  readonly results: CrossManifestValidationResult[];
  readonly expected?: CrossManifestSourceIdentity | undefined;
  readonly actual?: z.infer<typeof sourceMetadataSchema> | undefined;
  readonly artifactType: CrossManifestArtifactType;
  readonly relativePath: string;
}): void {
  if (!args.expected || !args.actual) {
    return;
  }
  const mismatches = [
    ["episodeId", args.expected.episodeId, args.actual.episodeId],
    ["language", args.expected.language, args.actual.language],
    ["variant", args.expected.variant, args.actual.variant],
    ["canonicalRelativePath", args.expected.relativePath, args.actual.canonicalRelativePath],
    ["contentHash", args.expected.contentHash, args.actual.contentHash],
    ["resolverVersion", args.expected.resolverVersion, args.actual.resolverVersion],
    ["cacheIdentity", args.expected.cacheIdentity, args.actual.cacheIdentity],
  ].filter(([, expected, actual]) => expected !== actual);
  if (mismatches.length === 0) {
    args.results.push(
      valid({
        artifactType: args.artifactType,
        message: "Source identity matches the authored script resolver.",
        relativePath: args.relativePath,
        contentHash: args.expected.contentHash,
        resolverVersion: args.expected.resolverVersion,
        cacheIdentity: args.expected.cacheIdentity,
      })
    );
    return;
  }
  const [field, expected, actual] = mismatches[0]!;
  args.results.push(
    invalid({
      validationCode: "STALE_SOURCE_IDENTITY",
      artifactType: args.artifactType,
      message: `Source identity field ${field} is stale.`,
      relativePath: args.relativePath,
      expected: String(expected),
      actual: String(actual),
      contentHash: args.actual.contentHash,
      resolverVersion: args.actual.resolverVersion,
      cacheIdentity: args.actual.cacheIdentity,
    })
  );
}

function pushExpectedFields(args: {
  readonly results: CrossManifestValidationResult[];
  readonly artifactType: CrossManifestArtifactType;
  readonly relativePath: string;
  readonly episodeSlug?: string | undefined;
  readonly language?: string | undefined;
  readonly variant?: string | undefined;
  readonly expectedEpisodeSlug: string;
  readonly expectedLanguage: string;
  readonly expectedVariant: string;
}): void {
  if (args.episodeSlug !== undefined && args.episodeSlug !== args.expectedEpisodeSlug) {
    args.results.push(
      invalid({
        validationCode: "WRONG_EPISODE",
        artifactType: args.artifactType,
        message: "Artifact belongs to a different episode.",
        relativePath: args.relativePath,
        expected: args.expectedEpisodeSlug,
        actual: args.episodeSlug,
      })
    );
  }
  if (args.language !== undefined && args.language !== args.expectedLanguage) {
    args.results.push(
      invalid({
        validationCode: "WRONG_LANGUAGE",
        artifactType: args.artifactType,
        message: "Artifact language does not match the requested language.",
        relativePath: args.relativePath,
        expected: args.expectedLanguage,
        actual: args.language,
      })
    );
  }
  if (args.variant !== undefined && args.variant !== args.expectedVariant) {
    args.results.push(
      invalid({
        validationCode: "WRONG_VARIANT",
        artifactType: args.artifactType,
        message: "Artifact variant does not match the requested variant.",
        relativePath: args.relativePath,
        expected: args.expectedVariant,
        actual: args.variant,
      })
    );
  }
}

function resolveOptionalArtifactPath(args: {
  readonly episodeDir: string;
  readonly explicitPath?: string | undefined;
  readonly defaultPath: string;
  readonly artifactType: CrossManifestArtifactType;
  readonly label: string;
}): { readonly path: string; readonly relativePath: string } | CrossManifestValidationResult | null {
  const candidate = args.explicitPath ?? args.defaultPath;
  const contained = containedPath({
    root: args.episodeDir,
    filePath: candidate,
    artifactType: args.artifactType,
    label: args.label,
  });
  if (!contained.ok) {
    return contained.result;
  }
  return { path: contained.path, relativePath: contained.relativePath };
}

async function validateGenerationManifest(
  input: CrossManifestValidationInput,
  results: CrossManifestValidationResult[]
): Promise<GenerationManifest | null> {
  const generation = await readRequired({
    results,
    filePath: input.generationManifestPath,
    root: input.episodeDir,
    artifactType: "generation-manifest",
    parser: (value) => generationManifestSchema.parse(value),
  });
  if (!generation) {
    return null;
  }
  const relativePath = relativeTo(input.episodeDir, input.generationManifestPath);
  if (generation.schemaVersion !== undefined && generation.schemaVersion !== 1) {
    results.push(
      invalid({
        validationCode: "UNSUPPORTED_SCHEMA_VERSION",
        artifactType: "generation-manifest",
        message: "Generation manifest schema version is not supported.",
        relativePath,
        expected: "1",
        actual: String(generation.schemaVersion),
      })
    );
  }
  pushExpectedFields({
    results,
    artifactType: "generation-manifest",
    relativePath,
    episodeSlug: generation.episodeId,
    language: generation.language,
    variant: generation.artifactType,
    expectedEpisodeSlug: input.episodeSlug,
    expectedLanguage: input.language,
    expectedVariant: input.variant,
  });
  if (input.expectedSource && generation.sourceSha256 !== input.expectedSource.contentHash) {
    results.push(
      invalid({
        validationCode: "STALE_SOURCE_IDENTITY",
        artifactType: "generation-manifest",
        message: "Generation manifest source hash does not match the authored source.",
        relativePath,
        expected: input.expectedSource.contentHash,
        actual: generation.sourceSha256,
      })
    );
  }
  pushIdentityResult({
    results,
    expected: input.expectedSource,
    actual: generation.source,
    artifactType: "generation-manifest",
    relativePath,
  });
  return generation;
}

async function validateSceneAndVisualPlans(args: {
  readonly input: CrossManifestValidationInput;
  readonly generation: GenerationManifest;
  readonly results: CrossManifestValidationResult[];
}): Promise<ScenePlan | null> {
  const scenePlanCandidate = resolveOptionalArtifactPath({
    episodeDir: args.input.episodeDir,
    explicitPath: args.generation.scenePlanPath,
    defaultPath: path.join(args.input.language, args.input.variant, "scenes.json"),
    artifactType: "scene-plan",
    label: "scene plan path",
  });
  if (scenePlanCandidate && "state" in scenePlanCandidate) {
    args.results.push(scenePlanCandidate);
    return null;
  }
  const fallbackScenePlanPath = path.join(args.input.episodeDir, "shared", "scenes.json");
  const scenePlanPath =
    scenePlanCandidate && (await fileExists(scenePlanCandidate.path))
      ? scenePlanCandidate.path
      : fallbackScenePlanPath;
  if (!(await fileExists(scenePlanPath))) {
    args.results.push(
      invalid({
        validationCode: "MISSING_ARTIFACT",
        artifactType: "scene-plan",
        message: "Scene plan is missing.",
        relativePath: relativeTo(args.input.episodeDir, scenePlanPath),
      })
    );
    return null;
  }
  const scenePlan = await readRequired({
    results: args.results,
    filePath: scenePlanPath,
    root: args.input.episodeDir,
    artifactType: "scene-plan",
    parser: (value) => scenePlanSchema.parse(value),
  });
  if (!scenePlan) {
    return null;
  }
  if (scenePlan.sourceId !== args.input.episodeSlug) {
    args.results.push(
      invalid({
        validationCode: "WRONG_EPISODE",
        artifactType: "scene-plan",
        message: "Scene plan belongs to a different episode.",
        relativePath: relativeTo(args.input.episodeDir, scenePlanPath),
        expected: args.input.episodeSlug,
        actual: scenePlan.sourceId,
      })
    );
  }

  const visualPlanCandidate = resolveOptionalArtifactPath({
    episodeDir: args.input.episodeDir,
    explicitPath: args.generation.visualPlanPath,
    defaultPath: path.join(args.input.language, args.input.variant, "visual-plan.json"),
    artifactType: "visual-plan",
    label: "visual plan path",
  });
  if (visualPlanCandidate && "state" in visualPlanCandidate) {
    args.results.push(visualPlanCandidate);
    return scenePlan;
  }
  const fallbackVisualPlanPath = path.join(args.input.episodeDir, "shared", "visual-plan.json");
  const visualPlanPath =
    visualPlanCandidate && (await fileExists(visualPlanCandidate.path))
      ? visualPlanCandidate.path
      : fallbackVisualPlanPath;
  if (!(await fileExists(visualPlanPath))) {
    return scenePlan;
  }
  const visualPlan = await readRequired({
    results: args.results,
    filePath: visualPlanPath,
    root: args.input.episodeDir,
    artifactType: "visual-plan",
    parser: (value) => visualPlanSchema.parse(value),
  });
  if (!visualPlan) {
    return scenePlan;
  }
  const visualRelativePath = relativeTo(args.input.episodeDir, visualPlanPath);
  pushExpectedFields({
    results: args.results,
    artifactType: "visual-plan",
    relativePath: visualRelativePath,
    episodeSlug: visualPlan.episodeId,
    language: visualPlan.language,
    variant: visualPlan.artifactType,
    expectedEpisodeSlug: args.input.episodeSlug,
    expectedLanguage: args.input.language,
    expectedVariant: args.input.variant,
  });
  const sceneIds = new Set(scenePlan.scenes.map((scene) => String(scene.id)));
  for (const visualScene of visualPlan.scenes) {
    if (!sceneIds.has(visualScene.sceneId)) {
      args.results.push(
        invalid({
          validationCode: "MISSING_SCENE",
          artifactType: "visual-plan",
          message: "Visual plan references a scene that is not in the scene plan.",
          relativePath: visualRelativePath,
          expected: [...sceneIds].join(","),
          actual: visualScene.sceneId,
        })
      );
      break;
    }
  }
  return scenePlan;
}

async function validateImageManifest(args: {
  readonly input: CrossManifestValidationInput;
  readonly generation: GenerationManifest;
  readonly scenePlan: ScenePlan | null;
  readonly results: CrossManifestValidationResult[];
}): Promise<void> {
  const defaultPath =
    args.input.variant === "short"
      ? path.join(args.input.episodeDir, "shared", "shorts-image-manifest.json")
      : path.join(args.input.episodeDir, "shared", "image-manifest.json");
  const manifestPath = args.generation.imageManifestPath ?? defaultPath;
  if (!args.generation.imageManifestPath && !(await fileExists(defaultPath))) {
    return;
  }
  const contained = containedPath({
    root: args.input.episodeDir,
    filePath: manifestPath,
    artifactType: "image-manifest",
    label: "image manifest path",
  });
  if (!contained.ok) {
    args.results.push(contained.result);
    return;
  }
  const assets = await readRequired({
    results: args.results,
    filePath: contained.path,
    root: args.input.episodeDir,
    artifactType: "image-manifest",
    parser: (value) => z.array(imageAssetSchema).parse(value),
  });
  if (!assets || !args.scenePlan) {
    return;
  }
  const sceneIds = new Set(args.scenePlan.scenes.map((scene) => String(scene.id)));
  for (const asset of assets) {
    if (!sceneIds.has(asset.sceneId)) {
      args.results.push(
        invalid({
          validationCode: "MISSING_SCENE",
          artifactType: "image-manifest",
          message: "Image manifest references a scene that is not in the scene plan.",
          relativePath: contained.relativePath,
          actual: asset.sceneId,
        })
      );
      return;
    }
    for (const assetPath of [asset.sourcePath, asset.renderedPath].filter((value): value is string => Boolean(value))) {
      const imagePath = containedPath({
        root: args.input.episodeDir,
        filePath: assetPath,
        artifactType: "image-asset",
        label: "image asset path",
      });
      if (!imagePath.ok) {
        args.results.push(imagePath.result);
        return;
      }
      if (!(await fileExists(imagePath.path))) {
        args.results.push(
          invalid({
            validationCode: "MISSING_IMAGE_ASSET",
            artifactType: "image-asset",
            message: "Image asset referenced by the image manifest is missing.",
            relativePath: imagePath.relativePath,
          })
        );
        return;
      }
    }
  }
  const imageValidation = validateImageAssets(args.scenePlan, assets);
  if (!imageValidation.valid) {
    args.results.push(
      invalid({
        validationCode: "MISSING_IMAGE_ASSET",
        artifactType: "image-manifest",
        message: imageValidation.issues[0] ?? "Image manifest does not cover the scene plan.",
        relativePath: contained.relativePath,
      })
    );
  }
}

async function validateNarrationManifests(args: {
  readonly input: CrossManifestValidationInput;
  readonly results: CrossManifestValidationResult[];
}): Promise<void> {
  const paths = createNarrationArtifactPaths({
    episodeId: args.input.episodeSlug,
    locale: args.input.language,
    variant: args.input.variant,
    episodeRoot: args.input.episodeDir,
  });
  if (!(await fileExists(paths.chunkManifest))) {
    return;
  }
  const chunkManifest = await readRequired({
    results: args.results,
    filePath: paths.chunkManifest,
    root: args.input.episodeDir,
    artifactType: "narration-manifest",
    parser: (value) => narrationChunkManifestSchema.parse(value),
  });
  if (!chunkManifest) {
    return;
  }
  const chunkRelativePath = relativeTo(args.input.episodeDir, paths.chunkManifest);
  pushExpectedFields({
    results: args.results,
    artifactType: "narration-manifest",
    relativePath: chunkRelativePath,
    episodeSlug: chunkManifest.episodeId,
    language: chunkManifest.locale,
    variant: chunkManifest.variant,
    expectedEpisodeSlug: args.input.episodeSlug,
    expectedLanguage: args.input.language,
    expectedVariant: args.input.variant,
  });
  const chunkIds = new Set(chunkManifest.chunks.map((chunk) => chunk.chunkId));
  const directionSet = await readOptional(paths.performanceDirections, (value) =>
    narrationDirectionSetSchema.parse(value)
  );
  if (directionSet) {
    for (const direction of directionSet.directions) {
      if (!chunkIds.has(direction.chunkId)) {
        args.results.push(
          invalid({
            validationCode: "UNKNOWN_NARRATION_SEGMENT",
            artifactType: "narration-manifest",
            message: "Performance directions reference an unknown narration chunk.",
            relativePath: relativeTo(args.input.episodeDir, paths.performanceDirections),
            actual: direction.chunkId,
          })
        );
        return;
      }
    }
  }
  const assembly = await readOptional(paths.assemblyManifest, (value) =>
    narrationAssemblyManifestSchema.parse(value)
  );
  if (assembly) {
    for (const entry of assembly.entries) {
      if (!chunkIds.has(entry.chunkId)) {
        args.results.push(
          invalid({
            validationCode: "UNKNOWN_NARRATION_SEGMENT",
            artifactType: "narration-manifest",
            message: "Narration assembly references an unknown narration chunk.",
            relativePath: relativeTo(args.input.episodeDir, paths.assemblyManifest),
            actual: entry.chunkId,
          })
        );
        return;
      }
      const audioPath = containedPath({
        root: args.input.episodeDir,
        filePath: entry.validatedAudioPath,
        artifactType: "narration-manifest",
        label: "validated narration audio path",
      });
      if (!audioPath.ok) {
        args.results.push(audioPath.result);
        return;
      }
      if (!(await fileExists(audioPath.path))) {
        args.results.push(
          invalid({
            validationCode: "MISSING_ARTIFACT",
            artifactType: "narration-manifest",
            message: "Narration assembly references missing validated audio.",
            relativePath: audioPath.relativePath,
          })
        );
        return;
      }
    }
  }
  const qualityGate = await readOptional(paths.qualityGateJson, (value) =>
    narrationQualityGateReportSchema.parse(value)
  );
  if (qualityGate) {
    for (const check of qualityGate.checks) {
      if (check.chunkId && !chunkIds.has(check.chunkId)) {
        args.results.push(
          invalid({
            validationCode: "UNKNOWN_NARRATION_SEGMENT",
            artifactType: "narration-manifest",
            message: "Narration quality gate references an unknown narration chunk.",
            relativePath: relativeTo(args.input.episodeDir, paths.qualityGateJson),
            actual: check.chunkId,
          })
        );
        return;
      }
    }
  }
}

async function validateRenderInputs(args: {
  readonly input: CrossManifestValidationInput;
  readonly generation: GenerationManifest;
  readonly results: CrossManifestValidationResult[];
}): Promise<void> {
  let resolvedVideoPath: string | null = null;
  for (const [label, artifactPath] of [
    ["audio path", args.generation.audioPath],
    ["video path", args.generation.videoPath],
    ...(args.generation.subtitleSidecars ?? []).map((sidecar) => ["subtitle sidecar", sidecar] as const),
  ] as const) {
    if (!artifactPath) {
      continue;
    }
    const contained = containedPath({
      root: args.input.episodeDir,
      filePath: artifactPath,
      artifactType: "render-manifest",
      label,
    });
    if (!contained.ok) {
      args.results.push(contained.result);
      return;
    }
    if (label === "video path") {
      resolvedVideoPath = contained.path;
    }
    if (!(await fileExists(contained.path))) {
      args.results.push(
        invalid({
          validationCode: "MISSING_ARTIFACT",
          artifactType: "render-manifest",
          message: `Render manifest references missing ${label}.`,
          relativePath: contained.relativePath,
        })
      );
      return;
    }
  }
  const renderManifestCandidate =
    args.generation.renderManifestPath ??
    (resolvedVideoPath ? path.join(path.dirname(resolvedVideoPath), "render.json") : null);
  if (!renderManifestCandidate) {
    return;
  }
  if (!args.generation.renderManifestPath && !(await fileExists(renderManifestCandidate))) {
    return;
  }
  const contained = containedPath({
    root: args.input.episodeDir,
    filePath: renderManifestCandidate,
    artifactType: "render-manifest",
    label: "render manifest path",
  });
  if (!contained.ok) {
    args.results.push(contained.result);
    return;
  }
  const renderManifest = await readRequired({
    results: args.results,
    filePath: contained.path,
    root: args.input.episodeDir,
    artifactType: "render-manifest",
    parser: (value) => renderManifestSchema.parse(value),
  });
  if (!renderManifest) {
    return;
  }
  await validateRenderManifestReferences({
    input: args.input,
    generation: args.generation,
    renderManifest,
    relativePath: contained.relativePath,
    results: args.results,
  });
}

async function validateMetadata(args: {
  readonly input: CrossManifestValidationInput;
  readonly scenePlan: ScenePlan | null;
  readonly results: CrossManifestValidationResult[];
}): Promise<void> {
  await validateYoutubeMetadata(args);
  const metadataPath = path.join(args.input.episodeDir, args.input.language, args.input.variant, "metadata.json");
  if (!(await fileExists(metadataPath))) {
    return;
  }
  const metadata = await readRequired({
    results: args.results,
    filePath: metadataPath,
    root: args.input.episodeDir,
    artifactType: "metadata",
    parser: (value) => legacyMetadataSchema.parse(value),
  });
  if (!metadata) {
    return;
  }
  const relativePath = relativeTo(args.input.episodeDir, metadataPath);
  pushExpectedFields({
    results: args.results,
    artifactType: "metadata",
    relativePath,
    language: metadata.language ?? metadata.source?.language,
    variant: metadata.artifactType,
    expectedEpisodeSlug: args.input.episodeSlug,
    expectedLanguage: args.input.language,
    expectedVariant: args.input.variant,
  });
  if (metadata.source?.sceneCount && args.scenePlan && metadata.source.sceneCount !== args.scenePlan.scenes.length) {
    args.results.push(
      invalid({
        validationCode: "ARTIFACT_MISMATCH",
        artifactType: "metadata",
        message: "Metadata scene count does not match the scene plan.",
        relativePath,
        expected: String(args.scenePlan.scenes.length),
        actual: String(metadata.source.sceneCount),
      })
    );
  }
}

async function validateYoutubeMetadata(args: {
  readonly input: CrossManifestValidationInput;
  readonly scenePlan: ScenePlan | null;
  readonly results: CrossManifestValidationResult[];
}): Promise<void> {
  const candidates = [
    path.join(args.input.episodeDir, "metadata", "youtube-metadata.json"),
    path.join(args.input.episodeDir, "output", "youtube-metadata.json"),
    path.join(args.input.episodeDir, args.input.language, args.input.variant, "youtube-metadata.json"),
  ];
  const metadataPath = await firstExistingPath(candidates);
  if (!metadataPath) {
    return;
  }
  const metadata = await readRequired<YoutubeMetadata>({
    results: args.results,
    filePath: metadataPath,
    root: args.input.episodeDir,
    artifactType: "metadata",
    parser: (value) => youtubeMetadataSchema.parse(value),
  });
  if (!metadata) {
    return;
  }
  const relativePath = relativeTo(args.input.episodeDir, metadataPath);
  if (metadata.schemaVersion !== "1.0") {
    args.results.push(
      invalid({
        validationCode: "UNSUPPORTED_SCHEMA_VERSION",
        artifactType: "metadata",
        message: "YouTube metadata schema version is not supported.",
        relativePath,
        expected: "1.0",
        actual: metadata.schemaVersion,
      })
    );
  }
  pushExpectedFields({
    results: args.results,
    artifactType: "metadata",
    relativePath,
    language: metadata.source.language,
    expectedEpisodeSlug: args.input.episodeSlug,
    expectedLanguage: args.input.language,
    expectedVariant: args.input.variant,
  });
  if (args.scenePlan && metadata.source.sceneCount !== args.scenePlan.scenes.length) {
    args.results.push(
      invalid({
        validationCode: "ARTIFACT_MISMATCH",
        artifactType: "metadata",
        message: "YouTube metadata scene count does not match the scene plan.",
        relativePath,
        expected: String(args.scenePlan.scenes.length),
        actual: String(metadata.source.sceneCount),
      })
    );
  }
}

async function firstExistingPath(paths: readonly string[]): Promise<string | null> {
  for (const filePath of paths) {
    if (await fileExists(filePath)) {
      return filePath;
    }
  }
  return null;
}

async function validateRenderManifestReferences(args: {
  readonly input: CrossManifestValidationInput;
  readonly generation: GenerationManifest;
  readonly renderManifest: ParsedRenderManifest;
  readonly relativePath: string;
  readonly results: CrossManifestValidationResult[];
}): Promise<void> {
  pushExpectedFields({
    results: args.results,
    artifactType: "render-manifest",
    relativePath: args.relativePath,
    episodeSlug: args.renderManifest.stageIdentity.episodeId,
    language: args.renderManifest.stageIdentity.language,
    variant: args.renderManifest.stageIdentity.variant,
    expectedEpisodeSlug: args.input.episodeSlug,
    expectedLanguage: args.input.language,
    expectedVariant: args.input.variant,
  });
  for (const [label, artifactPath] of [
    ["render clean path", args.renderManifest.cleanPath],
    ["render captioned path", args.renderManifest.captionedPath],
    ["narration dependency path", args.renderManifest.narrationDependency?.path],
    ["scene plan dependency path", args.renderManifest.scenePlanDependency?.path],
    ["image plan dependency path", args.renderManifest.imagePlanDependency?.path],
    ["audio dependency path", args.renderManifest.audioDependency?.path],
    ["subtitle dependency path", args.renderManifest.subtitleDependency?.path],
  ] as const) {
    if (!artifactPath) {
      continue;
    }
    const contained = containedPath({
      root: args.input.episodeDir,
      filePath: artifactPath,
      artifactType: "render-manifest",
      label,
    });
    if (!contained.ok) {
      args.results.push(contained.result);
      return;
    }
    if (!(await fileExists(contained.path))) {
      args.results.push(
        invalid({
          validationCode: "MISSING_ARTIFACT",
          artifactType: "render-manifest",
          message: `Render manifest references missing ${label}.`,
          relativePath: contained.relativePath,
        })
      );
      return;
    }
  }
  if (args.generation.videoPath) {
    const expectedVideo = containedPath({
      root: args.input.episodeDir,
      filePath: args.generation.videoPath,
      artifactType: "render-manifest",
      label: "generation video path",
    });
    const actualClean = containedPath({
      root: args.input.episodeDir,
      filePath: args.renderManifest.cleanPath,
      artifactType: "render-manifest",
      label: "render clean path",
    });
    if (!expectedVideo.ok) {
      args.results.push(expectedVideo.result);
      return;
    }
    if (!actualClean.ok) {
      args.results.push(actualClean.result);
      return;
    }
    if (actualClean.path !== expectedVideo.path) {
      args.results.push(
        invalid({
          validationCode: "ARTIFACT_MISMATCH",
          artifactType: "render-manifest",
          message: "Render manifest clean path does not match the generation manifest video path.",
          relativePath: args.relativePath,
          expected: expectedVideo.relativePath,
          actual: actualClean.relativePath,
        })
      );
    }
  }
}

async function validateCheckpointState(args: {
  readonly input: CrossManifestValidationInput;
  readonly generation: GenerationManifest;
  readonly results: CrossManifestValidationResult[];
}): Promise<void> {
  const checkpointPath = path.join(args.input.episodeDir, "current-artifact.json");
  const checkpoint = await readOptional<CurrentArtifact>(checkpointPath, (value) =>
    currentArtifactSchema.parse(value)
  );
  if (!checkpoint) {
    return;
  }
  if (checkpoint.language !== args.input.language || checkpoint.artifactType !== args.input.variant) {
    return;
  }
  const relativePath = relativeTo(args.input.episodeDir, checkpointPath);
  pushExpectedFields({
    results: args.results,
    artifactType: "checkpoint-state",
    relativePath,
    episodeSlug: checkpoint.episodeSlug,
    language: checkpoint.language,
    variant: checkpoint.artifactType,
    expectedEpisodeSlug: args.input.episodeSlug,
    expectedLanguage: args.input.language,
    expectedVariant: args.input.variant,
  });
  const contained = containedPath({
    root: args.input.episodeDir,
    filePath: checkpoint.currentArtifactPath,
    artifactType: "checkpoint-state",
    label: "checkpoint current artifact path",
  });
  if (!contained.ok) {
    args.results.push(contained.result);
    return;
  }
  if (contained.path !== path.resolve(args.input.generationManifestPath)) {
    args.results.push(
      invalid({
        validationCode: "ARTIFACT_MISMATCH",
        artifactType: "checkpoint-state",
        message: "Checkpoint current artifact does not match the requested generation manifest.",
        relativePath,
        expected: relativeTo(args.input.episodeDir, args.input.generationManifestPath),
        actual: contained.relativePath,
      })
    );
    return;
  }
  if (checkpoint.artifactSha256) {
    const actualHash = await hashFile(contained.path).catch(() => "");
    if (actualHash !== checkpoint.artifactSha256) {
      args.results.push(
        invalid({
          validationCode: "ARTIFACT_MISMATCH",
          artifactType: "checkpoint-state",
          message: "Checkpoint artifact hash does not match the current artifact.",
          relativePath,
          expected: checkpoint.artifactSha256,
          actual: actualHash,
        })
      );
    }
  }
  pushIdentityResult({
    results: args.results,
    expected: args.input.expectedSource,
    actual: checkpoint.source,
    artifactType: "checkpoint-state",
    relativePath,
  });
  if (args.input.expectedSource && checkpoint.sourceSha256 && checkpoint.sourceSha256 !== args.input.expectedSource.contentHash) {
    args.results.push(
      invalid({
        validationCode: "STALE_SOURCE_IDENTITY",
        artifactType: "checkpoint-state",
        message: "Checkpoint source hash does not match the authored source.",
        relativePath,
        expected: args.input.expectedSource.contentHash,
        actual: checkpoint.sourceSha256,
      })
    );
  }
  if (args.generation.sourceSha256 !== checkpoint.sourceSha256 && checkpoint.sourceSha256) {
    args.results.push(
      invalid({
        validationCode: "ARTIFACT_MISMATCH",
        artifactType: "checkpoint-state",
        message: "Checkpoint source hash does not match the generation manifest.",
        relativePath,
        expected: args.generation.sourceSha256,
        actual: checkpoint.sourceSha256,
      })
    );
  }
}

export async function validateEpisodeCrossManifestIntegrity(
  input: CrossManifestValidationInput
): Promise<readonly CrossManifestValidationResult[]> {
  const results: CrossManifestValidationResult[] = [];
  const generation = await validateGenerationManifest(input, results);
  if (!generation) {
    return results;
  }
  const scenePlan = await validateSceneAndVisualPlans({ input, generation, results });
  await validateImageManifest({ input, generation, scenePlan, results });
  await validateNarrationManifests({ input, results });
  await validateRenderInputs({ input, generation, results });
  await validateMetadata({ input, scenePlan, results });
  await validateCheckpointState({ input, generation, results });
  if (!results.some((result) => result.state === "invalid")) {
    results.push(
      valid({
        artifactType: "cross-manifest",
        message: "Cross-manifest references are internally consistent.",
      })
    );
  }
  return results;
}
