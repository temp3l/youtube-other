#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { planHistoryVisualsV35 } from "../packages/history/src/history-workflow-v35.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const episodeIds = [
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-30-video-story-pack-13-caesar-in-gaul",
  "history-youtube-history-30-video-story-pack-14-caesar-vs-pompey",
  "history-youtube-history-30-video-story-pack-19-great-heathen-army",
  "history-youtube-history-30-video-story-pack-21-fall-of-constantinople",
  "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion",
  "history-youtube-history-30-video-story-pack-33-pearl-harbor-road-to-war",
  "history-youtube-history-30-video-story-pack-37-french-revolution-reign-of-terror",
];

const results = [];
for (const episodeId of episodeIds) {
  const started = Date.now();
  const { plan, validation } = await planHistoryVisualsV35({
    episodeId,
    outputRoot: path.join(repoRoot, "episodes"),
    force: true,
  });
  results.push({
    episodeId,
    planHash: plan.planHash,
    structurallyValid: validation.structurallyValid,
    contentApprovalEligible: plan.approval.contentApprovalEligible,
    productionBlockers: plan.approval.production.blockerCodes,
    elapsedMs: Date.now() - started,
  });
  process.stderr.write(
    `regenerated ${episodeId} (${results.length}/${episodeIds.length})\n`
  );
}

process.stdout.write(`${JSON.stringify({ regenerated: results }, null, 2)}\n`);
