import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { scenePlanSchema } from "@mediaforge/domain";

const PACK_SCHEMA_VERSION = "veronica-pre-image-review-pack.v1" as const;

export interface VeronicaPreImageReviewPackResult {
  readonly packDir: string;
  readonly manifestPath: string;
  readonly readmePath: string;
  readonly promptPath: string;
}

interface PackInput {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
}

function packDir(input: PackInput): string {
  return path.join(input.episodeDir, "review-packs", "pre-image", `${input.language}-${input.variant}`);
}

async function fileHash(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function requiredFile(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Veronica pre-image review pack requires ${label}: ${filePath}`);
  }
}

function promptReviewMarkdown(input: {
  readonly narration: string;
  readonly scenes: ReturnType<typeof scenePlanSchema.parse>["scenes"];
}): string {
  return [
    "# ChatGPT pre-image review request",
    "",
    "Review this Short before any image-provider request. For each scene, identify factual or semantic drift, visual ambiguity, generic stock-image risk, unreadable composition, accidental text/logo risk, or a mismatch with the narration. Return concise, numbered edits. Do not rewrite the narration unless it is necessary to correct a visual mismatch.",
    "",
    "## English narration",
    "",
    input.narration,
    "",
    "## Scene prompts",
    "",
    ...input.scenes.flatMap((scene) => [
      `### ${scene.id} — ${scene.timing.startSeconds.toFixed(3)}s to ${scene.timing.endSeconds.toFixed(3)}s`,
      "",
      `Narration: ${scene.canonicalNarration}`,
      "",
      `Prompt: ${scene.imagePrompt}`,
      "",
    ]),
  ].join("\n");
}

export async function createVeronicaPreImageReviewPack(
  input: PackInput,
): Promise<VeronicaPreImageReviewPackResult> {
  const localeRoot = path.join(input.episodeDir, "locales", input.language, input.variant);
  const sourcePlanPath = path.join(input.episodeDir, "source", "visual-plan.json");
  const narrationPath = path.join(localeRoot, "audio", "narration.wav");
  const scriptPath = path.join(localeRoot, "script.md");
  const scenePlanPath = path.join(localeRoot, "scene-plan.json");
  const manifestPath = path.join(input.episodeDir, "manifest.json");
  await Promise.all([
    requiredFile(sourcePlanPath, "the canonical visual plan"),
    requiredFile(narrationPath, "mastered narration.wav"),
    requiredFile(scriptPath, "the English script"),
    requiredFile(scenePlanPath, "the retimed scene plan"),
    requiredFile(manifestPath, "the episode manifest"),
  ]);
  const [narration, scenePlanRaw] = await Promise.all([
    fs.readFile(scriptPath, "utf8"),
    fs.readFile(scenePlanPath, "utf8"),
  ]);
  const scenePlan = scenePlanSchema.parse(JSON.parse(scenePlanRaw) as unknown);
  const outputDir = packDir(input);
  await fs.mkdir(outputDir, { recursive: true });
  const files: Array<readonly [string, string]> = [
    ["narration.wav", narrationPath],
    ["script.md", scriptPath],
    ["retimed-scene-plan.json", scenePlanPath],
    ["visual-plan.json", sourcePlanPath],
    ["episode-manifest.json", manifestPath],
  ];
  const semanticFiles = [
    "semantic-image-prompt-brief.v1.json",
    "semantic-image-prompt-review.v1.json",
  ] as const;
  for (const fileName of semanticFiles) {
    const sourcePath = path.join(input.episodeDir, "shared", fileName);
    try {
      await fs.access(sourcePath);
      files.push([fileName, sourcePath]);
    } catch {
      // The provider-free scene prompts remain reviewable before semantic enrichment.
    }
  }
  await Promise.all(files.map(([fileName, sourcePath]) => fs.copyFile(sourcePath, path.join(outputDir, fileName))));
  const promptPath = path.join(outputDir, "chatgpt-review-prompt.md");
  const promptsPath = path.join(outputDir, "image-prompts.md");
  const promptMarkdown = promptReviewMarkdown({ narration, scenes: scenePlan.scenes });
  await Promise.all([
    fs.writeFile(promptPath, promptMarkdown, "utf8"),
    fs.writeFile(promptsPath, promptMarkdown, "utf8"),
  ]);
  const inputHashes = Object.fromEntries(
    await Promise.all(files.map(async ([fileName, sourcePath]) => [fileName, await fileHash(sourcePath)] as const)),
  );
  const reviewManifestPath = path.join(outputDir, "review-manifest.json");
  await fs.writeFile(
    reviewManifestPath,
    `${JSON.stringify({
      schemaVersion: PACK_SCHEMA_VERSION,
      episodeId: path.basename(input.episodeDir),
      language: input.language,
      variant: input.variant,
      createdAt: new Date().toISOString(),
      sceneCount: scenePlan.scenes.length,
      narrationDurationSeconds: scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0,
      inputHashes,
    }, null, 2)}\n`,
    "utf8",
  );
  const readmePath = path.join(outputDir, "README.md");
  await fs.writeFile(
    readmePath,
    `# Pre-image review pack\n\nReview \`chatgpt-review-prompt.md\` and the copied source artifacts before submitting image requests. This pack is valid only while the hashes in \`review-manifest.json\` match the episode inputs.\n`,
    "utf8",
  );
  return { packDir: outputDir, manifestPath: reviewManifestPath, readmePath, promptPath };
}

export async function assertVeronicaPreImageReviewPackCurrent(input: PackInput): Promise<void> {
  const manifestPath = path.join(packDir(input), "review-manifest.json");
  let stored: { readonly schemaVersion?: unknown; readonly inputHashes?: Record<string, unknown> };
  try {
    stored = JSON.parse(await fs.readFile(manifestPath, "utf8")) as typeof stored;
  } catch {
    throw new Error(`Veronica image generation requires a current pre-image review pack. Run: mediaforge veronica-media images review-pack --workspace ${path.dirname(input.episodeDir)} --episode-id ${path.basename(input.episodeDir)} --language ${input.language} --variant ${input.variant}`);
  }
  if (stored.schemaVersion !== PACK_SCHEMA_VERSION || !stored.inputHashes) {
    throw new Error(`Veronica pre-image review pack is invalid: ${manifestPath}`);
  }
  if (!("semantic-image-prompt-review.v1.json" in stored.inputHashes)) {
    throw new Error(
      "Veronica image generation requires a review pack containing the current semantic prompt review. Run `veronica-media images derive-image-prompts`, review the refreshed pack, then retry image generation.",
    );
  }
  for (const [fileName, expectedHash] of Object.entries(stored.inputHashes)) {
    if (typeof expectedHash !== "string") throw new Error(`Veronica pre-image review pack has an invalid hash for ${fileName}.`);
    const sourcePath = fileName === "narration.wav"
      ? path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration.wav")
      : fileName === "script.md"
        ? path.join(input.episodeDir, "locales", input.language, input.variant, "script.md")
        : fileName === "retimed-scene-plan.json"
          ? path.join(input.episodeDir, "locales", input.language, input.variant, "scene-plan.json")
          : fileName === "visual-plan.json"
            ? path.join(input.episodeDir, "source", "visual-plan.json")
            : fileName === "episode-manifest.json"
              ? path.join(input.episodeDir, "manifest.json")
              : path.join(input.episodeDir, "shared", fileName);
    if (await fileHash(sourcePath) !== expectedHash) {
      throw new Error(`Veronica pre-image review pack is stale because ${fileName} changed. Recreate it before image generation.`);
    }
  }
}
