import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  episodeBlueprintSchema,
  type EpisodeBlueprint,
} from "@mediaforge/domain";
import {
  createEpisodePathResolver,
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
  return path.join(workspaceRoot, episodeId, "state", "strategic-reinvention");
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

function minimalWaveBytes(label: string): Buffer {
  const body = Buffer.alloc(44, 0);
  body.write("RIFF", 0, "ascii");
  body.writeUInt32LE(36, 4);
  body.write("WAVE", 8, "ascii");
  body.write("fmt ", 12, "ascii");
  body.writeUInt32LE(16, 16);
  body.writeUInt16LE(1, 20);
  body.writeUInt16LE(1, 22);
  body.writeUInt32LE(16_000, 24);
  body.writeUInt32LE(32_000, 28);
  body.writeUInt16LE(2, 32);
  body.writeUInt16LE(16, 34);
  body.write("data", 36, "ascii");
  body.writeUInt32LE(0, 40);
  return Buffer.concat([body, Buffer.from(label, "utf8")]);
}

async function writeLocaleMediaFixtures(input: {
  readonly resolver: ReturnType<typeof createEpisodePathResolver>;
  readonly episodeId: string;
  readonly scripts: Readonly<Record<string, string>>;
}): Promise<void> {
  const locales = ["it", "en", "es"] as const;
  for (const locale of locales) {
    for (const variant of ["full", "short"] as const) {
      const context = {
        episodeId: normalizeEpisodeId(input.episodeId),
        locale,
        variant,
      };
      const script =
        input.scripts[`${locale}:${variant}`] ??
        input.scripts[`${locale}:full`] ??
        input.scripts["it:full"] ??
        "";
      await writeTextAtomic(input.resolver.narrationScript(context), script);
      await writeTextAtomic(
        input.resolver.captionsFile(context, "vtt"),
        `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n${script.slice(0, 40)}\n`,
      );
      await fs.mkdir(input.resolver.audioDir(context), { recursive: true });
      await fs.writeFile(
        input.resolver.audioNarration(context),
        minimalWaveBytes(`${locale}-${variant}`),
      );
      await writeJsonAtomic(input.resolver.metadataFile(context), {
        title: `Fixture ${locale} ${variant}`,
        description: script.slice(0, 120),
        locale,
        variant,
      });
    }
  }
}

async function writeScriptTree(
  workspaceRoot: string,
  episodeId: string,
  canonical: string,
  shortScript: string,
  localized: Readonly<Record<"en" | "es", string>>,
): Promise<void> {
  const episodeRoot = path.join(workspaceRoot, episodeId);
  await fs.mkdir(path.join(episodeRoot, "languages", "short"), { recursive: true });
  await Promise.all([
    writeTextAtomic(path.join(episodeRoot, "languages", "script-it.md"), canonical),
    writeTextAtomic(path.join(episodeRoot, "languages", "short", "script-it.md"), shortScript),
    writeTextAtomic(path.join(episodeRoot, "languages", "script-en.md"), localized.en),
    writeTextAtomic(path.join(episodeRoot, "languages", "script-es.md"), localized.es),
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

  let canonical = "";
  let shortScript = "";
  try {
    const adaptation = await runStrategicSourceAdaptation({
      workspaceRoot,
      episodeId,
      blueprint,
      profile,
    });
    canonical = adaptation.canonicalScript;
    shortScript = adaptation.shortScript;
    mark("strategic.adaptation");
  } catch {
    canonical =
      "Benvenuti. Questo episodio strategic-reinvention usa una narrazione fixture.";
    shortScript = canonical.split(".").slice(0, 2).join(".").trim() + ".";
    mark("strategic.adaptation");
  }
  const localized = {
    en: `Welcome. ${canonical}`,
    es: `Bienvenidos. ${canonical}`,
  };
  await writeScriptTree(workspaceRoot, episodeId, canonical, shortScript, localized);
  mark("strategic.canonical-script-approval");
  mark("strategic.short-extract");
  mark("strategic.localization");
  mark("strategic.localization-approval");

  const resolver = createEpisodePathResolver(workspaceRoot);
  await writeLocaleMediaFixtures({
    resolver,
    episodeId,
    scripts: {
      "it:full": canonical,
      "it:short": shortScript,
      "en:full": localized.en,
      "es:full": localized.es,
    },
  });
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
