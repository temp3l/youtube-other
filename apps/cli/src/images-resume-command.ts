import fs from "node:fs/promises";
import path from "node:path";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  episodeManifestSchema,
  scenePlanSchema,
  type EpisodeManifest,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  buildEpisodeImageMediaContext,
  createOpenAiVeronicaVisualQaEvaluator,
  generateEpisodeImages,
  loadEpisodeSceneManifest,
  loadEpisodeImageGenerationSettings,
} from "@mediaforge/image-generation";
import {
  assertHistoryVisualApprovalV35,
  deriveHistorySemanticImagePromptBrief,
  loadHistoryVisualPlanV35,
  persistHistorySemanticImagePromptReview,
} from "@mediaforge/history";
import { createLogger } from "@mediaforge/observability";
import {
  assertScriptScoreGate,
  createOpenAiStoryClientWithOptions,
} from "@mediaforge/story-localization";
import {
  positioningProductionPlanSchema,
  type PositioningVisualPlanV2,
} from "@mediaforge/strategic-reinvention";
import {
  ensureDir,
  fileExists,
  normalizeWhitespace,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { assertVeronicaPreImageReviewPackCurrent } from "./veronica-pre-image-review-pack.js";
import { assertPreImageReviewPackCurrent } from "./pre-image-review-pack.js";
import type { VeronicaVisualQaBrief } from "@mediaforge/image-generation";

export interface ImagesResumeCliOptions {
  readonly episode?: string;
  readonly scene?: string;
  readonly source?: string;
  readonly concurrency?: number;
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly workspace?: string;
  readonly variant?: "full" | "short";
}

export interface ResolvedEpisodeManifest {
  readonly episodeDir: string;
  readonly manifestPath: string;
  readonly manifest: EpisodeManifest & { readonly scenePlan: ScenePlan };
  readonly created: boolean;
}

export function assertVeronicaHierarchicalImageReadiness(plan: Pick<PositioningVisualPlanV2, "validation" | "providerReadiness" | "hierarchicalReadiness">): void {
  if (plan.validation.status !== "pass" || plan.providerReadiness?.status !== "PASS" || plan.hierarchicalReadiness?.providerCandidate !== true) {
    throw new Error("VERONICA_HIERARCHICAL_PRE_IMAGE_READINESS_REQUIRED: prompt-level PASS cannot override deterministic, sequence, or source-grounded blockers.");
  }
}

interface PersistedFailureResumeStatus {
  readonly retryable: boolean;
  readonly category?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildVeronicaVisualQaBriefs(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly scenePlan: ScenePlan;
  readonly variant: "short" | "full";
}): readonly VeronicaVisualQaBrief[] {
  if (input.plan.imagePromptGenerationStrategy !== "deterministic-v1" || !input.plan.imagePromptCompilation) {
    throw new Error("Veronica visual QA requires the canonical deterministic prompt-compilation artifact.");
  }
  const compilation = input.plan.imagePromptCompilation;
  const rules = [
    "The generated image must depict the canonical actor, action owner, polarity, state relation, cause, and consequence.",
    "Required evidence must be visible and forbidden evidence must be absent.",
    "Muted narration must still reveal the principal relationship in one to two seconds.",
  ];
  return input.scenePlan.scenes.map((wrapper, index) => {
    const scene = input.plan.scenes[index];
    const asset = scene ? input.plan.assets.find((candidate) => candidate.sceneId === scene.sceneId) : undefined;
    if (!scene?.semanticProposition || !asset?.promptCompilation) {
      throw new Error(`Veronica compiled prompt evidence is missing for ${wrapper.id}.`);
    }
    return {
      contentId: input.plan.contentId,
      assetId: wrapper.id,
      locale: "en",
      variant: input.variant,
      canonicalNarration: wrapper.canonicalNarration,
      spokenMeaning: scene.semanticProposition.narrationClaim,
      viewerTakeaway: scene.visibleThesis,
      narrativePurpose: scene.treatment.communicationIntent,
      visualRelationship: `${scene.semanticProposition.cause ?? scene.semanticProposition.narrationClaim} -> ${scene.semanticProposition.consequence}`,
      mustShow: asset.promptCompilation.input.treatment.requiredEvidence,
      mustNotShow: asset.promptCompilation.input.treatment.forbiddenEvidence,
      relevanceAnchors: scene.semanticProposition.evidenceAnchors,
      genericDriftRisks: asset.promptCompilation.input.treatment.forbiddenEvidence,
      finalPrompt: asset.prompt,
      visualDirectionRules: rules,
      semanticBriefHash: asset.promptCompilation.inputHash,
      visualDirectionVersion: compilation.compilerVersion,
    };
  });
}

async function readJsonIfExists<T>(
  filePath: string,
  parser: (value: unknown) => T
): Promise<T | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  return parser(raw);
}

function isEpisodeSourceFile(fileName: string): boolean {
  return /-en-full\.md$/u.test(fileName);
}

async function resolveEpisodeSourceFile(
  episodeDir: string,
  explicitSource?: string
): Promise<string> {
  if (explicitSource) {
    const resolved = path.resolve(explicitSource);
    if (!(await fileExists(resolved))) {
      throw new Error(`Explicit source file not found: ${resolved}`);
    }
    return resolved;
  }
  const sourceDir = path.join(episodeDir, "source");
  const sourceEntries = await fs
    .readdir(sourceDir, { withFileTypes: true })
    .catch(() => []);
  const candidates = sourceEntries
    .filter((entry) => entry.isFile() && isEpisodeSourceFile(entry.name))
    .map((entry) => path.join(sourceDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
  if (candidates.length === 0) {
    throw new Error(
      `No English full-story source file found under ${sourceDir}.`
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      [
        `Multiple English full-story source files were found under ${sourceDir}.`,
        "Pass --source explicitly:",
        ...candidates.map((candidate) => `- ${candidate}`),
      ].join("\n")
    );
  }
  return candidates[0]!;
}

async function resolveScenePlan(episodeDir: string): Promise<ScenePlan> {
  const candidates = [
    path.join(episodeDir, "shared", "scenes.json"),
    path.join(episodeDir, "state", "image-generation", "scenes.json"),
    path.join(episodeDir, "scenes.json"),
  ];
  for (const candidate of candidates) {
    const value = await readJsonIfExists(candidate, (raw) =>
      scenePlanSchema.parse(raw)
    );
    if (value) {
      return value;
    }
  }
  throw new Error(
    [
      `No scene plan could be resolved for ${episodeDir}.`,
      "Expected one of:",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n")
  );
}

async function readFailureResumeStatus(
  episodeDir: string,
  sceneId: string
): Promise<PersistedFailureResumeStatus | null> {
  const failurePath = path.join(
    episodeDir,
    "state",
    "image-generation",
    "failures",
    `${sceneId}.json`
  );
  const raw = await readJsonIfExists(failurePath, (value) =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null
  );
  if (!raw) {
    return null;
  }
  return {
    retryable: typeof raw["retryable"] === "boolean" ? raw["retryable"] : false,
    ...(typeof raw["category"] === "string"
      ? { category: raw["category"] }
      : {}),
  };
}

async function buildResumeEligibleScenePlan(
  episodeDir: string,
  scenePlan: ScenePlan,
  force: boolean
): Promise<{
  readonly scenePlan: ScenePlan;
  readonly skippedNonRetryableFailures: Array<{
    readonly sceneId: string;
    readonly category?: string;
  }>;
}> {
  if (force) {
    return { scenePlan, skippedNonRetryableFailures: [] };
  }
  const eligibleScenes: ScenePlan["scenes"] = [];
  const skippedNonRetryableFailures: Array<{
    readonly sceneId: string;
    readonly category?: string;
  }> = [];
  for (const scene of scenePlan.scenes) {
    const manifest = await loadEpisodeSceneManifest(episodeDir, scene.id);
    if (!manifest) {
      eligibleScenes.push(scene);
      continue;
    }
    if (manifest.status === "generated") {
      if (!(await fileExists(manifest.outputPath))) {
        eligibleScenes.push(scene);
      }
      continue;
    }
    if (manifest.status === "failed") {
      const failure = await readFailureResumeStatus(episodeDir, scene.id);
      const retryable =
        failure?.retryable ?? manifest.error?.retryable ?? false;
      if (retryable) {
        eligibleScenes.push(scene);
      } else {
        skippedNonRetryableFailures.push({
          sceneId: scene.id,
          ...(failure?.category ? { category: failure.category } : {}),
        });
      }
      continue;
    }
    eligibleScenes.push(scene);
  }
  return {
    scenePlan: scenePlanSchema.parse({
      ...scenePlan,
      scenes: eligibleScenes,
    }),
    skippedNonRetryableFailures,
  };
}

export async function loadOrBootstrapEpisodeManifest(
  options: ImagesResumeCliOptions
): Promise<ResolvedEpisodeManifest> {
  const runtimeConfig = await loadRuntimeConfig(
    options.workspace ? { workspaceDir: options.workspace } : {}
  );
  const episodeId = normalizeWhitespace(options.episode ?? "");
  if (episodeId.length === 0) {
    throw new Error("Episode id is required.");
  }
  const episodeDir = path.join(runtimeConfig.workspaceDir, episodeId);
  const manifestPath = path.join(episodeDir, "manifest.json");
  const existing = await readJsonIfExists(manifestPath, (raw) =>
    episodeManifestSchema.parse(raw)
  );
  if (existing) {
    const resolvedExistingScenePlan = existing.scenePlan;
    if (resolvedExistingScenePlan) {
      return {
        episodeDir,
        manifestPath,
        manifest: { ...existing, scenePlan: resolvedExistingScenePlan },
        created: false,
      };
    }
    const scenePlan = await resolveScenePlan(episodeDir);
    const updated = episodeManifestSchema.parse({
      ...existing,
      scenePlan,
      updatedAt: nowIso(),
    });
    const resolvedScenePlan = updated.scenePlan;
    if (!resolvedScenePlan) {
      throw new Error(`Unable to attach scene plan to ${manifestPath}.`);
    }
    await writeJsonAtomic(manifestPath, updated);
    return {
      episodeDir,
      manifestPath,
      manifest: { ...updated, scenePlan: resolvedScenePlan },
      created: true,
    };
  }
  await ensureDir(episodeDir);
  const sourceFile = await resolveEpisodeSourceFile(episodeDir, options.source);
  const scenePlan = await resolveScenePlan(episodeDir);
  const createdAt = nowIso();
  const manifest = episodeManifestSchema.parse({
    episodeId,
    slug: episodeId,
    source: {
      platform: "local-file" as const,
      filePath: sourceFile,
    },
    scenePlan,
    images: [],
    artifacts: [],
    pipelineRuns: [],
    createdAt,
    updatedAt: createdAt,
  });
  const resolvedScenePlan = manifest.scenePlan;
  if (!resolvedScenePlan) {
    throw new Error(`Unable to bootstrap scene plan for ${manifestPath}.`);
  }
  await writeJsonAtomic(manifestPath, manifest);
  return {
    episodeDir,
    manifestPath,
    manifest: { ...manifest, scenePlan: resolvedScenePlan },
    created: true,
  };
}

export async function commandImagesResume(
  options: ImagesResumeCliOptions
): Promise<void> {
  const selectedSceneIds = (options.scene ?? "")
    .split(",")
    .map((sceneId) => sceneId.trim())
    .filter((sceneId) => sceneId.length > 0);
  if (options.force && selectedSceneIds.length === 0) {
    throw new Error(
      "Refusing episode-wide forced image resume. Pass --scene <scene-id> or comma-separated scene ids."
    );
  }
  const { episodeDir, manifestPath, manifest, created } =
    await loadOrBootstrapEpisodeManifest(options);
  const sourceGenre =
    manifest.sourceMetadata && typeof manifest.sourceMetadata === "object"
      ? Reflect.get(manifest.sourceMetadata, "genre")
      : undefined;
  const isVeronica =
    sourceGenre === "veronicabenini" || sourceGenre === "strategic-reinvention";
  const historyPlan = await loadHistoryVisualPlanV35(episodeDir);
  const isHistory = historyPlan !== null;
  if (isVeronica) {
    const positioningPlanHash = Reflect.get(
      manifest.sourceMetadata as object,
      "positioningPlanHash"
    );
    if (
      typeof positioningPlanHash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(positioningPlanHash) ||
      manifest.scenePlan.scenes.some(
        (scene) => scene.qualityStatus !== "approved"
      )
    ) {
      throw new Error(
        "Veronica image generation requires an approved, hash-bound positioning production plan."
      );
    }
    await assertVeronicaPreImageReviewPackCurrent({
      episodeDir,
      language: "en",
      variant: options.variant ?? "short",
    });
  } else {
    await assertPreImageReviewPackCurrent({
      episodeDir,
      language: "en",
      variant: options.variant ?? "full",
      genre: isHistory ? "history" : "dark-truth",
    });
  }
  if (!isHistory && !isVeronica) {
    await assertScriptScoreGate({
      outputRoot: path.dirname(episodeDir),
      episode: manifest.episodeId,
      locale: "en",
      format: "full",
    });
  }
  const settings = loadEpisodeImageGenerationSettings(
    {
      ...process.env,
      OPENAI_IMAGE_CONCURRENCY:
        options.concurrency !== undefined
          ? String(options.concurrency)
          : process.env["OPENAI_IMAGE_CONCURRENCY"],
      OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
        options.allowUnapprovedCharacterReferences
          ? "true"
          : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
      OPENAI_IMAGE_FORCE: options.force
        ? "true"
        : process.env["OPENAI_IMAGE_FORCE"],
    },
    {
      profile: options.variant ?? "full",
    }
  );
  let semanticScenePlan = manifest.scenePlan;
  let veronicaVisualQaEvaluator:
    | ReturnType<typeof createOpenAiVeronicaVisualQaEvaluator>
    | undefined;
  let veronicaVisualQaBriefs: readonly VeronicaVisualQaBrief[] | undefined;
  if (isVeronica || isHistory) {
    const runtime = await loadRuntimeConfig(
      options.workspace ? { workspaceDir: options.workspace } : {}
    );
    const client = createOpenAiStoryClientWithOptions({
      apiKey: settings.apiKey,
      ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}),
      ...(settings.organization ? { organization: settings.organization } : {}),
      ...(settings.project ? { project: settings.project } : {}),
      maxRetries: 0,
      timeoutMs: settings.timeoutMs,
    });
    if (isVeronica) {
      const planPath = path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json");
      const rawPlan = positioningProductionPlanSchema.parse(
        JSON.parse(await fs.readFile(planPath, "utf8")) as unknown
      ) as unknown as PositioningVisualPlanV2;
      if (rawPlan.imagePromptGenerationStrategy !== "deterministic-v1" || !rawPlan.imagePromptCompilation) {
        throw new Error("VERONICA_DETERMINISTIC_IMAGE_PROMPTS_NOT_COMPILED: rerun prepare-production before image generation.");
      }
      assertVeronicaHierarchicalImageReadiness(rawPlan);
      semanticScenePlan = manifest.scenePlan;
      veronicaVisualQaEvaluator = createOpenAiVeronicaVisualQaEvaluator({
        client,
        model:
          process.env["VERONICA_VISUAL_QA_MODEL"] ??
          runtime.openAiValidatorModel ??
          runtime.openAiStoryModel ??
          "",
      });
      veronicaVisualQaBriefs = buildVeronicaVisualQaBriefs({
        plan: rawPlan,
        scenePlan: semanticScenePlan,
        variant:
          options.variant ?? (rawPlan.format === "short" ? "short" : "full"),
      });
    } else if (historyPlan) {
      await assertHistoryVisualApprovalV35(episodeDir);
      const derived = await deriveHistorySemanticImagePromptBrief({
        episodeDir,
        plan: historyPlan,
        client,
        model:
          process.env["HISTORY_IMAGE_PROMPT_PLANNER_MODEL"] ??
          runtime.openAiStoryModel ??
          "",
      });
      semanticScenePlan = (
        await persistHistorySemanticImagePromptReview({
          episodeDir,
          plan: historyPlan,
          artifact: derived.artifact,
          cacheStatus: derived.cacheStatus,
          previousArtifact: derived.previousArtifact,
          findings: derived.findings,
        })
      ).scenePlan;
    }
  }
  const logger = createLogger(
    options.verbose ? "debug" : "info",
    process.stderr
  );
  if (selectedSceneIds.length > 0) {
    const availableSceneIds = new Set(
      semanticScenePlan.scenes.map((scene) => String(scene.id))
    );
    const unknownSceneIds = selectedSceneIds.filter(
      (sceneId) => !availableSceneIds.has(sceneId)
    );
    if (unknownSceneIds.length > 0) {
      throw new Error(
        `Unknown image scene IDs: ${unknownSceneIds.join(", ")}.`
      );
    }
    semanticScenePlan = scenePlanSchema.parse({
      ...semanticScenePlan,
      scenes: semanticScenePlan.scenes.filter((scene) =>
        selectedSceneIds.includes(String(scene.id))
      ),
    });
  }
  const resumePlan = await buildResumeEligibleScenePlan(
    episodeDir,
    semanticScenePlan,
    options.force ?? false
  );
  const results = await generateEpisodeImages(
    episodeDir,
    manifest.episodeId,
    resumePlan.scenePlan,
    { ...settings, logger },
    {
      ...(options.force !== undefined ? { force: options.force } : {}),
      ...(isVeronica
        ? {
            context: buildEpisodeImageMediaContext({
              episodeId: manifest.episodeId,
              contentGenre: "veronicabenini",
            }),
            ...(veronicaVisualQaEvaluator !== undefined
              ? { veronicaVisualQaEvaluator }
              : {}),
            ...(veronicaVisualQaBriefs !== undefined
              ? { veronicaVisualQaBriefs }
              : {}),
          }
        : {}),
    }
  );
  const summary = {
    episodeId: manifest.episodeId,
    manifestPath,
    createdManifest: created,
    generated: results.filter((result) => result.status === "generated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    skippedNonRetryableFailures: resumePlan.skippedNonRetryableFailures.length,
    skippedNonRetryableFailureCategories:
      resumePlan.skippedNonRetryableFailures.reduce<Record<string, number>>(
        (counts, failure) => {
          const category = failure.category ?? "unknown-failure";
          counts[category] = (counts[category] ?? 0) + 1;
          return counts;
        },
        {}
      ),
    total: results.length,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `Episode: ${summary.episodeId}`,
      `Manifest: ${summary.manifestPath}${summary.createdManifest ? " (created)" : ""}`,
      `Generated: ${summary.generated}`,
      `Skipped: ${summary.skipped}`,
      `Failed: ${summary.failed}`,
      `Skipped non-retryable failures: ${summary.skippedNonRetryableFailures}`,
      `Total: ${summary.total}`,
    ].join("\n") + "\n"
  );
}
