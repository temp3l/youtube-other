#!/usr/bin/env node
import "../apps/cli/dist/env-setup.js";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../packages/config/dist/index.js";
import { createOpenAiStoryClientWithOptions } from "../packages/story-localization/dist/index.js";
import {
  deriveVeronicaSemanticImagePromptBrief,
  persistVeronicaSemanticImagePromptReview,
  positioningProductionPlanSchema,
  preparePositioningProductionEpisode,
} from "../packages/strategic-reinvention/dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supportedLanguages = new Set(["de", "en", "fr", "it", "pt"]);

function usage() {
  return "Usage: pnpm veronica:produce-short -- --episode-id <id> --pack <path> --languages <de,en,it> [--plan <path>] [--execute]";
}

function parseArgs(argv) {
  const options = { execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--execute") {
      options.execute = true;
      continue;
    }
    if (argument === "--episode-id" || argument === "--pack" || argument === "--languages" || argument === "--plan") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}.`);
      options[argument.slice(2).replaceAll("-", "")] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}.`);
  }
  if (!options.episodeid || !options.pack || !options.languages) throw new Error(usage());
  const languages = [...new Set(options.languages.split(",").map((value) => value.trim()).filter(Boolean))];
  if (languages.length === 0 || languages.some((language) => !supportedLanguages.has(language))) {
    throw new Error("--languages must contain one or more of: de,en,fr,it,pt.");
  }
  return { episodeId: options.episodeid, pack: options.pack, languages, plan: options.plan, execute: options.execute };
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["apps/cli/bin/mediaforge.js", ...args], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`mediaforge ${args.join(" ")} failed with ${signal ?? `exit code ${code ?? 1}`}.`));
    });
  });
}

async function deriveSharedPrompt({ episodeDir, plan, canonicalNarration }) {
  const runtime = await loadRuntimeConfig({ workspaceDir: path.join(repoRoot, "episodes") });
  const model = process.env.VERONICA_IMAGE_PROMPT_PLANNER_MODEL ?? runtime.openAiStoryModel ?? "";
  const client = createOpenAiStoryClientWithOptions({
    apiKey: runtime.openAiCompatibleApiKey ?? undefined,
    baseUrl: runtime.openAiCompatibleBaseUrl ?? undefined,
    maxRetries: 0,
  });
  const derived = await deriveVeronicaSemanticImagePromptBrief({
    episodeDir,
    plan,
    canonicalNarration,
    client,
    model,
  });
  await persistVeronicaSemanticImagePromptReview({
    episodeDir,
    plan,
    artifact: derived.artifact,
    cacheStatus: derived.cacheStatus,
    previousArtifact: derived.previousArtifact,
    findings: derived.findings,
  });
}

async function main() {
  const { episodeId, pack, languages, plan: planOverride, execute } = parseArgs(process.argv.slice(2));
  const packDir = path.resolve(repoRoot, pack);
  const episodeDir = path.join(repoRoot, "episodes", episodeId);
  const contentId = /^(l\d+-s\d+)/iu.exec(episodeId)?.[1]?.toLowerCase();
  if (!contentId) throw new Error("--episode-id must start with a content id such as l01-s03.");
  const planPath = path.resolve(
    repoRoot,
    planOverride ?? path.join(packDir, "visual-review", "plans", `${contentId}.visual-plan.json`),
  );
  const stagedPlanPath = path.join(episodeDir, "source", "visual-plan.json");
  const [rawPlan, canonicalNarration] = await Promise.all([
    fs.readFile(planPath, "utf8"),
    fs.readFile(path.join(packDir, "shorts", "en", `${episodeId}.md`), "utf8"),
  ]);
  const plan = positioningProductionPlanSchema.parse(JSON.parse(rawPlan));
  await fs.mkdir(path.dirname(stagedPlanPath), { recursive: true });
  await fs.copyFile(planPath, stagedPlanPath);
  for (const language of languages) {
    await preparePositioningProductionEpisode({
      workspaceRoot: path.join(repoRoot, "episodes"),
      episodeId,
      planPath: stagedPlanPath,
      scriptPath: path.join(packDir, "shorts", language, `${episodeId}.md`),
      language,
      variant: "short",
    });
  }
  if (!execute) {
    process.stdout.write(`Prepared ${episodeId} for ${languages.join(", ")}. Re-run with --execute to call providers and render videos.\n`);
    return;
  }
  await deriveSharedPrompt({ episodeDir, plan, canonicalNarration });
  await runCli(["images", "resume", "--episode", episodeId, "--variant", "short", "--concurrency", "1"]);
  await runCli(["audio", "narration", "generate", "--episode", episodeId, "--languages", languages.join(","), "--variant", "short", "--resume"]);
  for (const language of languages) {
    await runCli(["--language", language, "render", episodeId, "--profile", "vertical"]);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
