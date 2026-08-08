#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { scenePlanSchema } from "@mediaforge/domain";
import { sliceSceneAudioFiles } from "@mediaforge/dark-truth";
import { resolveEpisodeNarrationAudioPath } from "@mediaforge/shared";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const episodeId = process.argv[2];
const narrationPathOverride = process.argv[3];

if (!episodeId) {
  throw new Error(
    "Usage: pnpm exec tsx scripts/reslice-narration-segments.mjs <episode-id> [narration-path]"
  );
}

const episodeDir = path.join(repoRoot, "episodes", episodeId);
const audioBaseDir = path.join(episodeDir, "locales", "en", "full");
const audioDir = path.join(audioBaseDir, "audio");
const scenePlan = scenePlanSchema.parse(
  JSON.parse(await readFile(path.join(episodeDir, "shared", "scenes.json"), "utf8"))
);
const narrationPath = narrationPathOverride
  ? path.resolve(narrationPathOverride)
  : await resolveEpisodeNarrationAudioPath(audioDir);

if (!narrationPath) {
  throw new Error(
    `No narration audio found under ${audioDir}. Expected narration_elevenlabs.mp3 or narration.wav.`
  );
}

await sliceSceneAudioFiles(narrationPath, scenePlan, audioBaseDir);
console.log(
  JSON.stringify(
    {
      episodeId,
      narrationPath,
      segmentsDir: path.join(audioDir, "segments"),
      sceneCount: scenePlan.scenes.length,
    },
    null,
    2
  )
);
