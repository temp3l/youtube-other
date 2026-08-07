#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCombinedHistoryApprovalBundleV35 } from "../packages/history/src/history-workflow-v35.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const episodeIds = [
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia",
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
];

const outputArg =
  process.argv[2] ?? "artifacts/chatgpt-review/history-approval-packs-v3.5";
const output = path.resolve(repoRoot, outputArg);

const first = await createCombinedHistoryApprovalBundleV35({
  episodeIds,
  output,
  outputRoot: path.join(repoRoot, "episodes"),
  regenerate: true,
});

const second = await createCombinedHistoryApprovalBundleV35({
  episodeIds,
  output,
  outputRoot: path.join(repoRoot, "episodes"),
  regenerate: true,
});

const deterministic = first.episodes.every(
  (episode, index) => episode.planHash === second.episodes[index]?.planHash
);

const summary = {
  output: first.directory,
  zipPath: first.zipPath,
  zipSha256: first.zipSha256,
  comparisonReportPath: first.comparisonReportPath,
  planHashDeterministic: deterministic,
  episodes: first.episodes.map((episode) => ({
    episodeId: episode.episodeId,
    planHash: episode.planHash,
    trustSnapshotHash: episode.trustSnapshotHash,
    manifestHash: episode.manifestHash,
    zipSha256: episode.zipSha256,
  })),
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!deterministic) process.exitCode = 1;
