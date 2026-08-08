#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultHistoryApprovalPackRangeOutput } from "../packages/history/src/history-episode-discovery.js";
import { createCombinedHistoryApprovalBundleV35 } from "../packages/history/src/history-workflow-v35.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const episodeIds = [
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia",
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
  "history-youtube-history-10-video-story-pack-06-mongol-war-machine",
  "history-youtube-history-10-video-story-pack-07-day-life-medieval-peasant",
  "history-youtube-history-10-video-story-pack-08-cuban-missile-crisis",
  "history-youtube-history-10-video-story-pack-09-cleopatra-beyond-legend",
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
];

const reusePacksFrom = path.resolve(
  repoRoot,
  process.argv[2] ?? "artifacts/chatgpt-review/history-approval-packs-v3.5"
);
const output = path.resolve(
  repoRoot,
  process.argv[3] ??
    defaultHistoryApprovalPackRangeOutput({ from: 1, to: 10 })
);

const regenerateOnlyEpisodeIds = [
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-06-mongol-war-machine",
  "history-youtube-history-10-video-story-pack-08-cuban-missile-crisis",
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
];

const bundle = await createCombinedHistoryApprovalBundleV35({
  episodeIds,
  output,
  outputRoot: path.join(repoRoot, "episodes"),
  reusePacksFrom,
  regenerateOnlyEpisodeIds,
});

process.stdout.write(
  `${JSON.stringify(
    {
      output: bundle.directory,
      zipPath: bundle.zipPath,
      zipSha256: bundle.zipSha256,
      comparisonReportPath: bundle.comparisonReportPath,
      reusedFrom: reusePacksFrom,
      regeneratedEpisodeIds: regenerateOnlyEpisodeIds,
      episodes: bundle.episodes.map((episode) => ({
        episodeId: episode.episodeId,
        planHash: episode.planHash,
        zipSha256: episode.zipSha256,
      })),
    },
    null,
    2
  )}\n`
);
