import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "@mediaforge/shared";
import { loadEpisodeSceneManifest } from "@mediaforge/image-generation";

export interface EpisodeImageFailureSummary {
  readonly sceneId: string;
  readonly category: string;
  readonly stage?: string;
  readonly retryable: boolean;
  readonly message: string;
}

export interface EpisodeImageSummary {
  readonly plannedScenes: number;
  readonly manifestedScenes: number;
  readonly generatedScenes: number;
  readonly failedScenes: number;
  readonly missingManifests: number;
  readonly missingImages: number;
  readonly mergeWithPreviousScenes: number;
  readonly mergeWithNextScenes: number;
  readonly reusedScenes: number;
  readonly readyForRender: boolean;
  readonly retryableFailedScenes: number;
  readonly failureCategories: Record<string, number>;
  readonly generatedSceneIds: readonly string[];
  readonly failedSceneIds: readonly string[];
  readonly missingSceneIds: readonly string[];
  readonly failures: readonly EpisodeImageFailureSummary[];
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

type EpisodeSceneManifest = Awaited<ReturnType<typeof loadEpisodeSceneManifest>> extends
  | infer Manifest
  | null
  ? Manifest extends object
    ? Manifest & {
        readonly renderability?: "direct" | "requiresInference" | "mergeWithPrevious" | "mergeWithNext" | "skip";
        readonly reusedFromSceneId?: string;
      }
    : never
  : never;

async function readFailureSummary(
  episodeDir: string,
  sceneId: string,
  fallbackMessage?: string,
  fallbackRetryable = false
): Promise<EpisodeImageFailureSummary> {
  const failurePath = path.join(
    episodeDir,
    "state",
    "image-generation",
    "failures",
    `${sceneId}.json`
  );
  const raw = await fs
    .readFile(failurePath, "utf8")
    .then((value) => JSON.parse(value) as Record<string, unknown>)
    .catch(() => null);
  return {
    sceneId,
    category:
      typeof raw?.["category"] === "string"
        ? raw["category"]
        : "unknown-failure",
    ...(typeof raw?.["stage"] === "string" ? { stage: raw["stage"] } : {}),
    retryable:
      typeof raw?.["retryable"] === "boolean"
        ? raw["retryable"]
        : fallbackRetryable,
    message:
      typeof raw?.["message"] === "string"
        ? raw["message"]
        : fallbackMessage ?? "Image generation failed.",
  };
}

export async function summarizeEpisodeImageState(
  episodeDir: string,
  sceneIds: readonly string[]
): Promise<EpisodeImageSummary> {
  const manifestsDir = path.join(episodeDir, "state", "image-generation", "manifests");
  const seenManifests = await fs
    .readdir(manifestsDir, { withFileTypes: true })
    .catch(() => []);
  const manifestSceneIds = uniqueSorted(
    seenManifests
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/u, ""))
  );
  const plannedSceneIds = uniqueSorted(sceneIds);
  const generatedSceneIds: string[] = [];
  const failedSceneIds: string[] = [];
  const missingSceneIds: string[] = [];
  const failures: EpisodeImageFailureSummary[] = [];
  let missingImages = 0;
  let mergeWithPreviousScenes = 0;
  let mergeWithNextScenes = 0;
  let reusedScenes = 0;

  for (const sceneId of plannedSceneIds) {
    const manifest = (await loadEpisodeSceneManifest(
      episodeDir,
      sceneId
    )) as EpisodeSceneManifest | null;
    if (!manifest) {
      missingSceneIds.push(sceneId);
      continue;
    }
    if (manifest.renderability === "mergeWithPrevious") {
      mergeWithPreviousScenes += 1;
    }
    if (manifest.renderability === "mergeWithNext") {
      mergeWithNextScenes += 1;
    }
    if (manifest.reusedFromSceneId) {
      reusedScenes += 1;
    }
    if (manifest.status === "generated") {
      if (await fileExists(manifest.outputPath)) {
        generatedSceneIds.push(sceneId);
      } else {
        missingImages += 1;
        missingSceneIds.push(sceneId);
      }
      continue;
    }
    if (manifest.status === "failed") {
      failedSceneIds.push(sceneId);
      failures.push(
        await readFailureSummary(
          episodeDir,
          sceneId,
          manifest.error?.message,
          manifest.error?.retryable ?? false
        )
      );
      continue;
    }
    missingSceneIds.push(sceneId);
  }

  const manifestedScenes = plannedSceneIds.length - missingSceneIds.length;
  const generatedScenes = generatedSceneIds.length;
  const failedScenes = failedSceneIds.length;
  const missingManifests = missingSceneIds.filter((sceneId) => !manifestSceneIds.includes(sceneId)).length;
  const failureCategories = failures.reduce<Record<string, number>>(
    (counts, failure) => {
      counts[failure.category] = (counts[failure.category] ?? 0) + 1;
      return counts;
    },
    {}
  );
  return {
    plannedScenes: plannedSceneIds.length,
    manifestedScenes,
    generatedScenes,
    failedScenes,
    missingManifests,
    missingImages,
    mergeWithPreviousScenes,
    mergeWithNextScenes,
    reusedScenes,
    readyForRender:
      missingSceneIds.length === 0 && failedScenes === 0 && missingImages === 0,
    retryableFailedScenes: failures.filter((failure) => failure.retryable).length,
    failureCategories,
    generatedSceneIds,
    failedSceneIds,
    missingSceneIds,
    failures,
  };
}

export function buildEpisodeImageSummaryOutput(
  summary: EpisodeImageSummary
): Record<string, unknown> {
  return {
    readyForRender: summary.readyForRender,
    plannedScenes: summary.plannedScenes,
    manifestedScenes: summary.manifestedScenes,
    generatedScenes: summary.generatedScenes,
    failedScenes: summary.failedScenes,
    missingManifests: summary.missingManifests,
    missingImages: summary.missingImages,
    mergeCounts: {
      mergeWithPreviousScenes: summary.mergeWithPreviousScenes,
      mergeWithNextScenes: summary.mergeWithNextScenes,
      reusedScenes: summary.reusedScenes,
    },
    retryableFailedScenes: summary.retryableFailedScenes,
    failureCategories: summary.failureCategories,
    generatedSceneIds: summary.generatedSceneIds,
    failedSceneIds: summary.failedSceneIds,
    missingSceneIds: summary.missingSceneIds,
    failures: summary.failures,
  };
}
