import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "@mediaforge/shared";
import { loadEpisodeSceneManifest } from "@mediaforge/image-generation";

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
  readonly generatedSceneIds: readonly string[];
  readonly failedSceneIds: readonly string[];
  readonly missingSceneIds: readonly string[];
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
      continue;
    }
    missingSceneIds.push(sceneId);
  }

  const manifestedScenes = plannedSceneIds.length - missingSceneIds.length;
  const generatedScenes = generatedSceneIds.length;
  const failedScenes = failedSceneIds.length;
  const missingManifests = missingSceneIds.filter((sceneId) => !manifestSceneIds.includes(sceneId)).length;
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
    generatedSceneIds,
    failedSceneIds,
    missingSceneIds,
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
    generatedSceneIds: summary.generatedSceneIds,
    failedSceneIds: summary.failedSceneIds,
    missingSceneIds: summary.missingSceneIds,
  };
}
