import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  veronicaRenderClipSchema,
  veronicaRenderManifestSchema,
  type VeronicaMediaPlan,
  type VeronicaRenderManifest,
} from "../contracts/media-plan.v1.js";
import { ingestSupplementalMediaAsset } from "../ingestion/secure-ingest.js";
import { buildSemanticMediaPlan } from "../planning/semantic-planner.js";
import { resolveAnchorTimings } from "../narration/revision.js";
import { evaluateApprovalEligibility } from "../approval/eligibility.js";
import { exportVeronicaApprovalPack } from "../review-pack/export.js";
import {
  compileRenderManifestToFfmpegArgs,
  validateCompiledFfmpegSafety,
} from "../rendering/compiler.js";
import { hashCanonical } from "../canonical-json.js";
import { buildVeronicaCacheKey } from "../workflow/regeneration.js";
import { veronicaMediaPlanSchema } from "../contracts/media-plan.v1.js";

export interface VeronicaPipelineInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly originalNarration: string;
  readonly revisedNarration?: string;
  readonly targetLanguage: string;
  readonly sourceLanguage?: string;
  readonly supplementalFiles: readonly {
    readonly assetId: string;
    readonly filename: string;
    readonly bytes: Uint8Array;
    readonly declaredMimeType?: string;
  }[];
  readonly alignedSegments?: readonly {
    readonly text: string;
    readonly startSeconds: number;
    readonly endSeconds: number;
  }[];
}

export interface VeronicaPipelineResult {
  readonly plan: VeronicaMediaPlan;
  readonly landscapeManifest: VeronicaRenderManifest;
  readonly portraitManifest: VeronicaRenderManifest;
  readonly approvalPackDir: string;
  readonly cacheKeys: readonly string[];
  readonly ffmpegCommands: readonly (readonly string[])[];
}

export function veronicaEpisodeStateDir(workspaceRoot: string, episodeId: string): string {
  return path.join(workspaceRoot, episodeId, "state", "veronica-media");
}

export async function runVeronicaSupplementalMediaPipeline(
  input: VeronicaPipelineInput,
): Promise<VeronicaPipelineResult> {
  const stateDir = veronicaEpisodeStateDir(input.workspaceRoot, input.episodeId);
  await fs.mkdir(stateDir, { recursive: true });
  const ingested = input.supplementalFiles.map((file) =>
    ingestSupplementalMediaAsset(file),
  );
  let plan = buildSemanticMediaPlan({
    episodeId: input.episodeId,
    originalNarration: input.originalNarration,
    ...(input.revisedNarration ? { revisedNarration: input.revisedNarration } : {}),
    assets: ingested,
    targetLanguage: input.targetLanguage,
    ...(input.sourceLanguage ? { sourceLanguage: input.sourceLanguage } : {}),
  });
  if (input.alignedSegments && input.alignedSegments.length > 0) {
    const resolvedAnchors = resolveAnchorTimings({
      anchors: plan.narrationAnchors,
      alignedSegments: input.alignedSegments,
    });
    plan = veronicaMediaPlanSchema.parse({
      ...plan,
      narrationAnchors: resolvedAnchors,
      contentHash: hashCanonical({
        ...plan,
        narrationAnchors: resolvedAnchors,
      }),
    });
  }
  const preparedAssetPaths: Record<string, string> = {};
  for (const prepared of plan.preparedAssets) {
    const absolute = path.join(stateDir, prepared.relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
      0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
      0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
      0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
      0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
      0x60, 0x82,
    ]);
    await fs.writeFile(absolute, pngHeader);
    preparedAssetPaths[prepared.preparedAssetId] = absolute;
  }
  const approvalEligibility = evaluateApprovalEligibility({
    plan,
    ingestedAssets: ingested,
    preparedAssetPaths,
  });
  plan = veronicaMediaPlanSchema.parse({
    ...plan,
    approvalEligibility,
    contentHash: hashCanonical({ ...plan, approvalEligibility }),
  });
  const planPath = path.join(stateDir, "veronica-media-plan.json");
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const landscapeManifest = buildRenderManifest({
    plan,
    aspectRatio: "16:9",
    placements: plan.landscapePlacements,
    preparedAssetPaths,
    outputPath: path.join(stateDir, "renders", "landscape.mp4"),
    narrationAudioPath: path.join(stateDir, "audio", "narration.wav"),
  });
  const portraitManifest = buildRenderManifest({
    plan,
    aspectRatio: "9:16",
    placements: plan.portraitPlacements,
    preparedAssetPaths,
    outputPath: path.join(stateDir, "renders", "portrait.mp4"),
    narrationAudioPath: path.join(stateDir, "audio", "narration.wav"),
  });
  await fs.mkdir(path.dirname(landscapeManifest.narrationAudioPath), { recursive: true });
  await fs.writeFile(landscapeManifest.narrationAudioPath, Buffer.alloc(44, 0));
  const ffmpegCommands = [
    ...compileRenderManifestToFfmpegArgs(landscapeManifest),
    ...compileRenderManifestToFfmpegArgs(portraitManifest),
  ];
  validateCompiledFfmpegSafety(ffmpegCommands);
  const approvalPack = await exportVeronicaApprovalPack({
    outputDir: stateDir,
    plan,
  });
  const cacheKeys = [
    buildVeronicaCacheKey({
      episodeId: input.episodeId,
      stage: "plan",
      contentHash: plan.contentHash,
      language: input.targetLanguage,
      aspectRatio: "16:9",
    }),
    buildVeronicaCacheKey({
      episodeId: input.episodeId,
      stage: "plan",
      contentHash: plan.contentHash,
      language: input.targetLanguage,
      aspectRatio: "9:16",
    }),
  ];
  return {
    plan,
    landscapeManifest,
    portraitManifest,
    approvalPackDir: approvalPack.packRoot,
    cacheKeys,
    ffmpegCommands,
  };
}

function buildRenderManifest(input: {
  readonly plan: VeronicaMediaPlan;
  readonly aspectRatio: "16:9" | "9:16";
  readonly placements: VeronicaMediaPlan["placements"];
  readonly preparedAssetPaths: Readonly<Record<string, string>>;
  readonly outputPath: string;
  readonly narrationAudioPath: string;
}): VeronicaRenderManifest {
  const profile =
    input.aspectRatio === "16:9"
      ? input.plan.aspectProfiles.landscape
      : input.plan.aspectProfiles.portrait;
  let cursor = 0;
  const clips = input.placements.map((placement) => {
    const state = input.plan.visualStates.find(
      (candidate) => candidate.stateId === placement.visualStateIds[0],
    );
    const preparedId = state?.preparedAssetId;
    const assetPath =
      (preparedId && input.preparedAssetPaths[preparedId]) ||
      Object.values(input.preparedAssetPaths)[0];
    if (!assetPath) {
      throw new Error(`Missing prepared asset for placement ${placement.placementId}.`);
    }
    const startSeconds = cursor;
    const endSeconds = cursor + placement.dwellDurationSeconds;
    cursor = endSeconds;
    return veronicaRenderClipSchema.parse({
      clipId: `${placement.placementId}-clip`,
      placementId: placement.placementId,
      startSeconds,
      endSeconds,
      operations: [
        {
          kind: "contain",
          assetPath,
          x: profile.safeAreas.title.left,
          y: profile.safeAreas.title.top,
          width: profile.width - profile.safeAreas.title.left - profile.safeAreas.title.right,
          height: profile.height - profile.safeAreas.title.top - profile.safeAreas.title.bottom,
        },
      ],
    });
  });
  const manifestWithoutHash = {
    schemaVersion: "veronica-render-manifest.v1" as const,
    aspectRatio: input.aspectRatio,
    profile,
    clips,
    narrationAudioPath: input.narrationAudioPath,
    outputPath: input.outputPath,
    contentHash: "0".repeat(64),
  };
  return veronicaRenderManifestSchema.parse({
    ...manifestWithoutHash,
    contentHash: hashCanonical(manifestWithoutHash),
  });
}

export function createMinimalPngBytes(label: string): Uint8Array {
  const payload = Buffer.from(label, "utf8");
  return Uint8Array.from(
    createHash("sha256")
      .update(payload)
      .digest()
      .subarray(0, 32),
  );
}
