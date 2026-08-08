import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Scene } from "@mediaforge/domain";

const COMPILED_VISUAL_MODALITIES = new Set([
  "map",
  "diagram",
  "timeline",
  "date-card",
  "document",
  "quotation",
  "text-only transition",
]);

const ILLUSTRATION_MODALITIES = new Set(["archival image", "narration-emphasis"]);

type HistoryBeat = {
  readonly id: string;
  readonly modality: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly visualPurposeId?: string;
};

type HistoryVisualConcept = {
  readonly beatId: string;
  readonly historicalSubject: string;
  readonly intendedComposition: string;
  readonly protectedFactualRelation: string;
  readonly settingGeography?: string | null;
  readonly approximatePeriod?: string | null;
  readonly forbiddenAnachronisms?: readonly string[];
  readonly modality: string;
};

type HistoryVisualPlan = {
  readonly beats: readonly HistoryBeat[];
  readonly visualConcepts: readonly HistoryVisualConcept[];
};

import type { HistoryCinematography } from "./history-image-cinematography.js";

export type HistorySceneImageGuidance = {
  readonly skipIllustration: boolean;
  readonly dominantModality: string;
  readonly concept?: HistoryVisualConcept;
  readonly overlappingBeatIds: readonly string[];
  readonly cinematography?: HistoryCinematography;
};

export function isHistoryEpisodeId(episodeId: string): boolean {
  return /^history-youtube-history-/iu.test(episodeId);
}

export function resolveHistoryVisualPlanPath(episodeDir: string): string {
  return path.join(episodeDir, "source", "history-v3.5", "plan.json");
}

export async function loadHistoryVisualPlan(
  episodeDir: string
): Promise<HistoryVisualPlan | null> {
  try {
    const raw = JSON.parse(
      await readFile(resolveHistoryVisualPlanPath(episodeDir), "utf8")
    ) as Partial<HistoryVisualPlan>;
    if (!Array.isArray(raw.beats) || !Array.isArray(raw.visualConcepts)) {
      return null;
    }
    return {
      beats: raw.beats as HistoryBeat[],
      visualConcepts: raw.visualConcepts as HistoryVisualConcept[],
    };
  } catch {
    return null;
  }
}

function sceneWindowMs(scene: Scene): { readonly startMs: number; readonly endMs: number } {
  return {
    startMs: Math.round(scene.timing.startSeconds * 1000),
    endMs: Math.round(scene.timing.endSeconds * 1000),
  };
}

function beatsOverlappingScene(
  beats: readonly HistoryBeat[],
  startMs: number,
  endMs: number
): HistoryBeat[] {
  return beats.filter((beat) => beat.startMs < endMs && beat.endMs > startMs);
}

export function resolveHistorySceneImageGuidance(input: {
  readonly plan: HistoryVisualPlan;
  readonly scene: Scene;
}): HistorySceneImageGuidance {
  const { startMs, endMs } = sceneWindowMs(input.scene);
  const overlapping = beatsOverlappingScene(input.plan.beats, startMs, endMs);
  const illustrationBeats = overlapping.filter((beat) =>
    ILLUSTRATION_MODALITIES.has(beat.modality)
  );
  const compiledOnly =
    overlapping.length > 0 &&
    overlapping.every((beat) => COMPILED_VISUAL_MODALITIES.has(beat.modality));
  const primaryBeat =
    illustrationBeats[0] ??
    overlapping.find((beat) => !COMPILED_VISUAL_MODALITIES.has(beat.modality)) ??
    overlapping[0];
  const concept = primaryBeat
    ? input.plan.visualConcepts.find((item) => item.beatId === primaryBeat.id)
    : undefined;
  return {
    skipIllustration: compiledOnly,
    dominantModality: primaryBeat?.modality ?? "archival image",
    ...(concept ? { concept } : {}),
    overlappingBeatIds: overlapping.map((beat) => beat.id),
  };
}

export async function resolveHistorySceneImageGuidanceForEpisode(input: {
  readonly episodeDir: string;
  readonly scene: Scene;
}): Promise<HistorySceneImageGuidance | null> {
  const plan = await loadHistoryVisualPlan(input.episodeDir);
  if (!plan) return null;
  return resolveHistorySceneImageGuidance({ plan, scene: input.scene });
}
