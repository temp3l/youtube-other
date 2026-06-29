import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import { episodeManifestSchema, scenePlanSchema, type EpisodeManifest, type ScenePlan } from "@mediaforge/domain";
import {
  generateEpisodeImages,
  loadEpisodeSceneManifest,
  loadEpisodeImageGenerationSettings,
} from "@mediaforge/image-generation";
import { createLogger } from "@mediaforge/observability";
import { ensureDir, fileExists, normalizeWhitespace, writeJsonAtomic } from "@mediaforge/shared";

export interface ImagesResumeCliOptions {
  readonly episode?: string;
  readonly source?: string;
  readonly concurrency?: number;
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly workspace?: string;
}

export interface ResolvedEpisodeManifest {
  readonly episodeDir: string;
  readonly manifestPath: string;
  readonly manifest: EpisodeManifest & { readonly scenePlan: ScenePlan };
  readonly created: boolean;
}

interface PersistedFailureResumeStatus {
  readonly retryable: boolean;
  readonly category?: string;
}

function nowIso(): string {
  return new Date().toISOString();
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
  const sourceEntries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
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

async function resolveScenePlan(
  episodeDir: string
): Promise<ScenePlan> {
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
    retryable:
      typeof raw["retryable"] === "boolean" ? raw["retryable"] : false,
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
      const retryable = failure?.retryable ?? manifest.error?.retryable ?? false;
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
  const { episodeDir, manifestPath, manifest, created } =
    await loadOrBootstrapEpisodeManifest(options);
  const settings = loadEpisodeImageGenerationSettings({
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
    OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
    OPENAI_IMAGE_SIZE: process.env["OPENAI_IMAGE_SIZE"],
    OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
    OPENAI_IMAGE_CONCURRENCY:
      options.concurrency !== undefined
        ? String(options.concurrency)
        : process.env["OPENAI_IMAGE_CONCURRENCY"],
    OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
    OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
    OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
      options.allowUnapprovedCharacterReferences
        ? "true"
        : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
    OPENAI_IMAGE_FORCE: options.force
      ? "true"
      : process.env["OPENAI_IMAGE_FORCE"],
    OPENAI_BASE_URL: process.env["OPENAI_BASE_URL"],
    OPENAI_ORGANIZATION: process.env["OPENAI_ORGANIZATION"],
    OPENAI_PROJECT: process.env["OPENAI_PROJECT"],
  });
  const logger = createLogger(
    options.verbose ? "debug" : "info",
    process.stderr
  );
  const resumePlan = await buildResumeEligibleScenePlan(
    episodeDir,
    manifest.scenePlan,
    options.force ?? false
  );
  const results = await generateEpisodeImages(
    episodeDir,
    manifest.episodeId,
    resumePlan.scenePlan,
    { ...settings, logger },
    {
      ...(options.force !== undefined ? { force: options.force } : {}),
    }
  );
  const summary = {
    episodeId: manifest.episodeId,
    manifestPath,
    createdManifest: created,
    generated: results.filter((result) => result.status === "generated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    skippedNonRetryableFailures:
      resumePlan.skippedNonRetryableFailures.length,
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

export function registerImagesResumeCommand(imagesCommand: Command): void {
  imagesCommand
    .command("resume")
    .requiredOption("--episode <episode-id>")
    .option("--source <path>")
    .option("--concurrency <number>", "parallel scene generation", (value) =>
      Number(value)
    )
    .option("--allow-unapproved-character-references")
    .option("--force")
    .option("--json")
    .option("--verbose")
    .action(async (opts: ImagesResumeCliOptions) => {
      await commandImagesResume(opts);
    });
}
