import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { scenePlanSchema } from "@mediaforge/domain";

export type PreImageReviewGenre = "history" | "dark-truth";

export interface PreImageReviewPackInput {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly genre: PreImageReviewGenre;
}

function directory(input: PreImageReviewPackInput): string {
  return path.join(input.episodeDir, "review-packs", "pre-image", `${input.language}-${input.variant}`);
}

async function hash(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function firstExisting(candidates: readonly string[], label: string): Promise<string> {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next compatible layout.
    }
  }
  throw new Error(`Pre-image review pack requires ${label}. Checked: ${candidates.join(", ")}`);
}

function relative(episodeDir: string, filePath: string): string {
  const value = path.relative(episodeDir, filePath);
  if (value.startsWith("..") || path.isAbsolute(value)) throw new Error(`Review source is outside the episode: ${filePath}`);
  return value;
}

export async function createPreImageReviewPack(input: PreImageReviewPackInput): Promise<{ readonly packDir: string; readonly promptPath: string }> {
  const locale = path.join(input.episodeDir, "locales", input.language, input.variant);
  const legacy = path.join(input.episodeDir, input.language, input.variant);
  const scriptPath = await firstExisting([
    path.join(locale, "script.md"), path.join(legacy, "script.md"),
    path.join(input.episodeDir, "languages", input.variant === "short" ? "short" : "", `script-${input.language}.md`),
  ], "the review script");
  const audioPath = await firstExisting([
    path.join(locale, "audio", "narration.wav"), path.join(legacy, "audio", "narration.wav"),
    path.join(input.episodeDir, "audio", "narration.wav"),
  ], "narration.wav");
  const scenePath = await firstExisting([
    path.join(locale, "scene-plan.json"), path.join(legacy, "scene-plan.json"),
    path.join(input.episodeDir, "visuals", input.variant, "scene-plan.json"), path.join(input.episodeDir, "shared", "scenes.json"),
  ], "the scene plan");
  const manifestPath = await firstExisting([path.join(input.episodeDir, "manifest.json")], "the episode manifest");
  const planPath = await firstExisting([
    path.join(input.episodeDir, "source", "visual-plan.json"), path.join(input.episodeDir, "visuals", input.variant, "visual-plan.json"), scenePath,
  ], "the visual plan");
  const scenePlan = scenePlanSchema.parse(JSON.parse(await fs.readFile(scenePath, "utf8")) as unknown);
  const outputDir = directory(input);
  await fs.mkdir(outputDir, { recursive: true });
  const inputs: Array<readonly [string, string]> = [
    ["narration.wav", audioPath], ["script.md", scriptPath], ["scene-plan.json", scenePath],
    ["visual-plan.json", planPath], ["episode-manifest.json", manifestPath],
  ];
  for (const name of ["semantic-image-prompt-review.v1.json", "history-semantic-image-prompt-review.v1.json"] as const) {
    const source = path.join(input.episodeDir, "shared", name);
    try { await fs.access(source); inputs.push([name, source]); } catch { /* optional prompt-review artifact */ }
  }
  await Promise.all(inputs.map(([name, source]) => fs.copyFile(source, path.join(outputDir, name))));
  const narration = await fs.readFile(scriptPath, "utf8");
  const promptPath = path.join(outputDir, "chatgpt-review-prompt.md");
  await fs.writeFile(promptPath, [
    "# ChatGPT pre-image review request", "", "Review the narration and every image prompt before provider submission. Flag semantic drift, factual errors, weak evidence, generic stock-image risk, misleading imagery, unreadable composition, and accidental text/logo risk. Return numbered scene-specific edits.", "",
    "## Narration", "", narration, "", "## Prompts", "",
    ...scenePlan.scenes.flatMap((scene) => [`### ${scene.id} (${scene.timing.startSeconds.toFixed(3)}–${scene.timing.endSeconds.toFixed(3)}s)`, "", `Narration: ${scene.canonicalNarration}`, "", `Prompt: ${scene.imagePrompt}`, ""]),
  ].join("\n"), "utf8");
  const sources = await Promise.all(inputs.map(async ([name, source]) => ({ name, path: relative(input.episodeDir, source), sha256: await hash(source) })));
  await fs.writeFile(path.join(outputDir, "review-manifest.json"), `${JSON.stringify({ schemaVersion: "pre-image-review-pack.v1", episodeId: path.basename(input.episodeDir), language: input.language, variant: input.variant, genre: input.genre, sceneCount: scenePlan.scenes.length, narrationDurationSeconds: scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0, sources }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outputDir, "README.md"), "# Pre-image review pack\n\nReview `chatgpt-review-prompt.md` and the copied artifacts before image generation. Any source hash change makes this pack stale.\n", "utf8");
  return { packDir: outputDir, promptPath };
}

export async function assertPreImageReviewPackCurrent(input: PreImageReviewPackInput): Promise<void> {
  const manifestPath = path.join(directory(input), "review-manifest.json");
  let stored: { readonly schemaVersion?: unknown; readonly sources?: readonly { readonly name?: unknown; readonly path?: unknown; readonly sha256?: unknown }[] };
  try { stored = JSON.parse(await fs.readFile(manifestPath, "utf8")) as typeof stored; } catch {
    throw new Error(`Image generation requires a current pre-image review pack. Run: mediaforge images review-pack --episode ${path.basename(input.episodeDir)} --variant ${input.variant}`);
  }
  if (stored.schemaVersion !== "pre-image-review-pack.v1" || !stored.sources?.length) throw new Error(`Pre-image review pack is invalid: ${manifestPath}`);
  for (const source of stored.sources) {
    if (typeof source.name !== "string" || typeof source.path !== "string" || typeof source.sha256 !== "string") throw new Error(`Pre-image review pack is invalid: ${manifestPath}`);
    if (await hash(path.join(input.episodeDir, source.path)) !== source.sha256) throw new Error(`Pre-image review pack is stale because ${source.name} changed. Recreate it before image generation.`);
  }
}
