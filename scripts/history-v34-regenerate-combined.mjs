#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCombinedHistoryApprovalBundleV34 } from "../packages/history/dist/history-workflow-v34.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const episodeIds = [
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia",
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
];

const outputArg = process.argv[2] ?? "artifacts/chatgpt-review/history-approval-packs-v3.4-final";
const output = path.resolve(repoRoot, outputArg);

async function sha256File(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

const first = await createCombinedHistoryApprovalBundleV34({
  episodeIds,
  output,
  outputRoot: path.join(repoRoot, "episodes"),
  regenerate: true,
});

const second = await createCombinedHistoryApprovalBundleV34({
  episodeIds,
  output,
  outputRoot: path.join(repoRoot, "episodes"),
  regenerate: true,
});

const deterministic =
  first.episodes.every(
    (episode, index) => episode.planHash === second.episodes[index]?.planHash
  );

const zipDeterministic = first.zipSha256 === second.zipSha256;

const summary = {
  output: first.directory,
  zipPath: first.zipPath,
  zipSha256: first.zipSha256,
  planHashDeterministic: deterministic,
  zipByteDeterministic: zipDeterministic,
  episodes: first.episodes.map((episode) => ({
    episodeId: episode.episodeId,
    planHash: episode.planHash,
    trustSnapshotHash: episode.trustSnapshotHash,
    manifestHash: episode.manifestHash,
    zipSha256: episode.zipSha256,
  })),
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!deterministic) {
  process.exitCode = 1;
}
