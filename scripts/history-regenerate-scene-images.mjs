#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { scenePlanSchema } from "@mediaforge/domain";
import {
  buildEpisodeImageMediaContext,
  generateEpisodeImages,
  loadEpisodeImageGenerationSettings,
} from "../packages/image-generation/src/episode-image-pipeline.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const episodeId = process.argv[2];
const sceneIds = process.argv.slice(3);
if (!episodeId || sceneIds.length === 0) {
  throw new Error(
    "Usage: pnpm exec tsx scripts/history-regenerate-scene-images.mjs <episode-id> <scene-id> [...]"
  );
}

const episodeDir = path.join(repoRoot, "episodes", episodeId);
const scenePlan = scenePlanSchema.parse(
  JSON.parse(await readFile(path.join(episodeDir, "shared", "scenes.json"), "utf8"))
);
const settings = loadEpisodeImageGenerationSettings(
  {
    ...process.env,
    OPENAI_IMAGE_CONCURRENCY: process.env.OPENAI_IMAGE_CONCURRENCY ?? "4",
  },
  { profile: "full" }
);
const context = buildEpisodeImageMediaContext({
  episodeId,
  contentGenre: "history",
});

const results = await generateEpisodeImages(episodeDir, episodeId, scenePlan, settings, {
  sceneIds,
  force: true,
  context,
});

process.stdout.write(
  `${JSON.stringify({ episodeId, sceneIds, concurrency: settings.concurrency, results }, null, 2)}\n`
);
