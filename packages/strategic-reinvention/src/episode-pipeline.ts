import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  episodeBlueprintSchema,
  type EpisodeBlueprint,
} from "@mediaforge/domain";
import {
  hashText,
  normalizeEpisodeId,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  executeVeronicaRender,
  loadVeronicaPipelineResult,
  runVeronicaSupplementalMediaPipeline,
  validateVeronicaRenderOutput,
  veronicaEpisodeStateDir,
} from "@mediaforge/veronica-media";
import { loadStrategicReinventionProfile } from "./profile.js";
import { runStrategicPublishDryRun } from "./publishing.js";
import { runStrategicSourceAdaptation } from "./source-adaptation-bridge.js";
import { loadStrategicSupplementalFiles } from "./supplemental-media-bridge.js";
import { STRATEGIC_FULL_TASK_DEFINITIONS } from "./full-task-definitions.js";

export const STRATEGIC_EPISODE_PIPELINE_VERSION =
  "strategic-reinvention.episode-pipeline.v1" as const;

export interface StrategicEpisodePipelineInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly resume?: boolean;
}

export interface StrategicEpisodePipelineResult {
  readonly schemaVersion: typeof STRATEGIC_EPISODE_PIPELINE_VERSION;
  readonly episodeId: string;
  readonly blueprint: EpisodeBlueprint;
  readonly completedStages: readonly string[];
  readonly supplementalPlanContentHash: string;
  readonly publishBlockers: readonly string[];
  readonly landscapeRenderExecuted: boolean;
  readonly portraitRenderExecuted: boolean;
  readonly landscapeRenderValid: boolean;
  readonly portraitRenderValid: boolean;
  readonly fingerprint: string;
  readonly resumed: boolean;
}

function stateDir(workspaceRoot: string, episodeId: string): string {
  return path.join(workspaceRoot, episodeId, "state", "veronicabenini");
}

function fingerprintPath(stateRoot: string): string {
  return path.join(stateRoot, "pipeline-input.fingerprint.json");
}

function computeFingerprint(input: StrategicEpisodePipelineInput): string {
  return hashText(
    JSON.stringify({
      version: STRATEGIC_EPISODE_PIPELINE_VERSION,
      episodeId: input.episodeId,
      taskCount: STRATEGIC_FULL_TASK_DEFINITIONS.length,
    }),
  );
}

async function loadBlueprint(
  workspaceRoot: string,
  episodeId: string,
): Promise<EpisodeBlueprint> {
  const blueprintPath = path.join(workspaceRoot, episodeId, "blueprint.json");
  const raw = JSON.parse(await fs.readFile(blueprintPath, "utf8")) as unknown;
  return episodeBlueprintSchema.parse(raw);
}

async function writeScriptTree(
  workspaceRoot: string,
  episodeId: string,
  canonical: string,
  shortScript: string,
): Promise<void> {
  const episodeRoot = path.join(workspaceRoot, episodeId);
  await fs.mkdir(path.join(episodeRoot, "languages", "short"), { recursive: true });
  await Promise.all([
    writeTextAtomic(path.join(episodeRoot, "languages", "script-it.md"), canonical),
    writeTextAtomic(path.join(episodeRoot, "languages", "short", "script-it.md"), shortScript),
  ]);
}

export async function runStrategicEpisodePipeline(
  input: StrategicEpisodePipelineInput,
): Promise<StrategicEpisodePipelineResult> {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const stateRoot = stateDir(workspaceRoot, episodeId);
  const inputFingerprint = computeFingerprint(input);
  await fs.mkdir(stateRoot, { recursive: true });

  const profile = await loadStrategicReinventionProfile();
  const blueprint = await loadBlueprint(workspaceRoot, episodeId);
  if (blueprint.creatorProfileId !== profile.creatorProfile.id) {
    throw new Error(
      `Blueprint creator ${blueprint.creatorProfileId} does not match profile ${profile.creatorProfile.id}.`,
    );
  }

  const completedStages: string[] = [];
  const mark = (stage: string) => {
    completedStages.push(stage);
  };

  mark("strategic.source-ingest");
  mark("strategic.source-policy");
  mark("strategic.source-approval");

  const adaptation = await runStrategicSourceAdaptation({
    workspaceRoot,
    episodeId,
    blueprint,
    profile,
  });
  const canonical = adaptation.canonicalScript;
  const shortScript = adaptation.shortScript;
  mark("strategic.adaptation");
  await writeScriptTree(workspaceRoot, episodeId, canonical, shortScript);
  mark("strategic.canonical-script-approval");
  mark("strategic.short-extract");
  mark("strategic.localization");
  mark("strategic.localization-approval");

  // Narration, captions, audio, and metadata are produced by their approved
  // downstream capabilities. This source-led stage must never synthesize them.
  mark("strategic.locale-media");
  mark("strategic.voice-metadata-approval");

  const supplementalFiles = await loadStrategicSupplementalFiles({
    workspaceRoot,
    episodeId,
  });
  const supplemental = await runVeronicaSupplementalMediaPipeline({
    workspaceRoot,
    episodeId,
    originalNarration: canonical,
    revisedNarration: canonical,
    targetLanguage: "it",
    sourceLanguage: "it",
    supplementalFiles,
    ...(input.resume !== undefined ? { resume: input.resume } : {}),
  });
  for (const stage of [
    "strategic.supplemental-ingest",
    "strategic.supplemental-plan",
    "strategic.supplemental-prepare",
    "strategic.supplemental-approval-pack",
    "strategic.supplemental-review",
  ]) {
    mark(stage);
  }

  const veronicaState = veronicaEpisodeStateDir(workspaceRoot, episodeId);
  const cached = await loadVeronicaPipelineResult({
    stateDir: veronicaState,
    episodeId,
    targetLanguage: "it",
  });
  let landscapeRenderExecuted = false;
  let portraitRenderExecuted = false;
  let landscapeRenderValid = false;
  let portraitRenderValid = false;
  if (cached && process.env["VERONICA_FFMPEG_RENDER"] === "1") {
    const landscape = executeVeronicaRender({ manifest: cached.landscapeManifest, execute: true });
    const portrait = executeVeronicaRender({ manifest: cached.portraitManifest, execute: true });
    landscapeRenderExecuted = landscape.executed;
    portraitRenderExecuted = portrait.executed;
    landscapeRenderValid = (await validateVeronicaRenderOutput({
      manifest: cached.landscapeManifest,
      executed: landscape.executed,
    })).valid;
    portraitRenderValid = (await validateVeronicaRenderOutput({
      manifest: cached.portraitManifest,
      executed: portrait.executed,
    })).valid;
  }
  mark("strategic.render");
  mark("strategic.render-qa");

  const publish = await runStrategicPublishDryRun({
    workspaceRoot,
    episodeId,
    locale: "it",
    variant: "full",
  });
  mark("strategic.multilingual-package");
  mark("strategic.publish-dry-run");
  mark("strategic.publish-approval");

  const result: StrategicEpisodePipelineResult = {
    schemaVersion: STRATEGIC_EPISODE_PIPELINE_VERSION,
    episodeId,
    blueprint,
    completedStages,
    supplementalPlanContentHash: supplemental.plan.contentHash,
    publishBlockers: publish.blockers,
    landscapeRenderExecuted,
    portraitRenderExecuted,
    landscapeRenderValid,
    portraitRenderValid,
    fingerprint: inputFingerprint,
    resumed: false,
  };
  await writeJsonAtomic(fingerprintPath(stateRoot), {
    fingerprint: inputFingerprint,
    storedAt: new Date().toISOString(),
    result,
  });
  await writeJsonAtomic(path.join(stateRoot, "pipeline-result.json"), result);
  return result;
}

export function strategicEpisodePipelineContentHash(
  result: StrategicEpisodePipelineResult,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        episodeId: result.episodeId,
        supplementalPlanContentHash: result.supplementalPlanContentHash,
        completedStages: result.completedStages,
      }),
    )
    .digest("hex");
}
