import path from "node:path";
import type { RenderShot } from "@mediaforge/domain";
import { writeJsonAtomic } from "@mediaforge/shared";
import type { VideoFilterOperation } from "../filter-builders/index.js";
import type {
  MotionIntensity,
  MotionPresetFamily,
  MotionPresetId,
} from "./types.js";

export interface MotionRenderReport {
  readonly schemaVersion: 1;
  readonly episodeId: string;
  readonly rendererVersion: string;
  readonly outputDir: string;
  readonly generatedAt: string;
  readonly shots: readonly MotionRenderReportShot[];
}

export interface MotionRenderReportShot {
  readonly shotId: string;
  readonly sceneId: string;
  readonly sourceImageId: string;
  readonly durationMs: number;
  readonly inputImage: string;
  readonly outputSegment: string;
  readonly seed: string;
  readonly reason: string;
  readonly selectedPreset: {
    readonly id: MotionPresetId;
    readonly family: MotionPresetFamily;
    readonly intensity: MotionIntensity;
  };
  readonly filterSummary: string;
  readonly cache?: {
    readonly status: "hit" | "miss" | "write";
    readonly fingerprint: string;
    readonly reason?: string;
  };
  readonly failure?: {
    readonly stage: "prepare" | "cache-lookup" | "render" | "validation";
    readonly name: string;
    readonly message: string;
  };
}

export const motionRenderReportFilename = "motion-report.json";

export function motionRenderReportPath(outputDir: string): string {
  return path.join(outputDir, motionRenderReportFilename);
}

export async function writeMotionRenderReport(
  reportPath: string,
  report: MotionRenderReport
): Promise<void> {
  await writeJsonAtomic(reportPath, report);
}

export function createMotionRenderReport(input: {
  readonly episodeId: string;
  readonly rendererVersion: string;
  readonly outputDir: string;
  readonly shots: readonly MotionRenderReportShot[];
  readonly generatedAt?: string;
}): MotionRenderReport {
  return {
    schemaVersion: 1,
    episodeId: input.episodeId,
    rendererVersion: input.rendererVersion,
    outputDir: input.outputDir,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    shots: input.shots,
  };
}

export function buildMotionRenderReportShot(input: {
  readonly shot: RenderShot;
  readonly sourceImageId: string;
  readonly durationMs: number;
  readonly inputImage: string;
  readonly outputSegment: string;
  readonly seed: string;
  readonly reason?: string;
  readonly operations: readonly VideoFilterOperation[];
  readonly cache?: MotionRenderReportShot["cache"];
  readonly failure?: MotionRenderReportShot["failure"];
}): MotionRenderReportShot {
  const selectedPreset = selectedPresetForShotMotion(input.shot);
  return {
    shotId: input.shot.shotId,
    sceneId: input.shot.sceneId,
    sourceImageId: input.sourceImageId,
    durationMs: input.durationMs,
    inputImage: input.inputImage,
    outputSegment: input.outputSegment,
    seed: input.seed,
    reason: input.reason ?? selectedPreset.reason,
    selectedPreset: selectedPreset.preset,
    filterSummary: summarizeFilterOperations(input.operations),
    ...(input.cache ? { cache: input.cache } : {}),
    ...(input.failure ? { failure: input.failure } : {}),
  };
}

export function summarizeFilterOperations(
  operations: readonly VideoFilterOperation[]
): string {
  return operations.length === 0
    ? "none"
    : operations.map((operation) => operation.kind).join("+");
}

function selectedPresetForShotMotion(shot: RenderShot): {
  readonly preset: MotionRenderReportShot["selectedPreset"];
  readonly reason: string;
} {
  switch (shot.motion?.kind) {
    case "push-in":
      return {
        preset: {
          id: "doc_slow_push_in",
          family: "documentary",
          intensity: "low",
        },
        reason: "shot-plan-motion:push-in",
      };
    case "pull-out":
      return {
        preset: {
          id: "doc_slow_pull_back",
          family: "documentary",
          intensity: "low",
        },
        reason: "shot-plan-motion:pull-out",
      };
    case "pan":
      return {
        preset: {
          id: "reveal_pan_to_subject",
          family: "reveal",
          intensity: "medium",
        },
        reason: "shot-plan-motion:pan",
      };
    case "pan-and-zoom":
      return {
        preset: {
          id: "reveal_zoom_to_detail",
          family: "reveal",
          intensity: "medium",
        },
        reason: "shot-plan-motion:pan-and-zoom",
      };
    case "drift":
      return {
        preset: {
          id: "ambient_fog_drift",
          family: "ambient",
          intensity: "low",
        },
        reason: "shot-plan-motion:drift",
      };
    case "none":
    case undefined:
      return {
        preset: {
          id: "ambient_static_hold",
          family: "ambient",
          intensity: "low",
        },
        reason: "shot-plan-motion:none",
      };
  }
}
